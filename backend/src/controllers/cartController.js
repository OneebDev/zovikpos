const { prisma } = require('../config/db');
const { convertUnit } = require('../utils/unitConverter');
const { isPhysicalTable } = require('../utils/tableLabel');

const getPhysicalCustomerSession = async (sessionId) => prisma.session.findUnique({
  where: { id: sessionId },
  select: {
    status: true,
    expiresAt: true,
    tableId: true,
    table: { select: { id: true, isActive: true, tableNumber: true, branchId: true, qrToken: true } },
  },
});

const requireActivePhysicalSession = async (sessionId, res) => {
  const session = await getPhysicalCustomerSession(sessionId);
  if (!session || session.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Your table session is unavailable. Scan the QR code attached to your table to continue.', code: 'TABLE_SESSION_REQUIRED' });
    return null;
  }
  if (!session.tableId || !isPhysicalTable(session.table)) {
    res.status(403).json({ error: 'Scan the QR code attached to your table before using the cart.', code: 'TABLE_SESSION_REQUIRED' });
    return null;
  }
  if (new Date() > new Date(session.expiresAt)) {
    await prisma.session.update({ where: { id: sessionId }, data: { status: 'EXPIRED' } });
    res.status(403).json({ error: 'Your dining session has expired due to inactivity. Please scan the QR code again to start a new session.', code: 'TABLE_SESSION_REQUIRED' });
    return null;
  }
  return session;
};

/**
 * Helper to ensure a cart exists for a session
 */
const getOrCreateCart = async (sessionId) => {
  let cart = await prisma.cart.findUnique({
    where: { sessionId },
    include: {
      items: {
        include: { menuItem: true },
      },
    },
  });

  if (!cart) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new Error('Invalid dining session.');
    }
    cart = await prisma.cart.create({
      data: { sessionId },
      include: {
        items: {
          include: { menuItem: true },
        },
      },
    });
  }

  return cart;
};

/**
 * Helper to check stock availability for a menu item based on recipes or static stock
 */
const verifyStockForQty = (menuItem, qty) => {
  if (menuItem.recipeItems && menuItem.recipeItems.length > 0) {
    for (const recipe of menuItem.recipeItems) {
      const invItem = recipe.inventoryItem;
      if (!invItem) continue;
      const rawNeeded = recipe.quantity * qty;
      let neededInInvUnit;
      try {
        neededInInvUnit = convertUnit(rawNeeded, recipe.unit, invItem.unit);
      } catch {
        neededInInvUnit = rawNeeded;
      }
      if (invItem.stockLevel < neededInInvUnit) {
        return `Insufficient inventory for "${invItem.name}". Needed: ${neededInInvUnit} ${invItem.unit}, Available: ${invItem.stockLevel} ${invItem.unit}.`;
      }
    }
    return null;
  }
  if (menuItem.stock > 0 && menuItem.stock < qty) {
    return `Only ${menuItem.stock} units available in stock.`;
  }
  return null;
};

/**
 * Get current session cart with up-to-date pricing and calculations
 */
const getCart = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Check session is still active
    if (!await requireActivePhysicalSession(sessionId, res)) return;

    const cart = await getOrCreateCart(sessionId);

    // Calculate totals and check stock freshness
    let subtotal = 0.0;
    const items = cart.items.map((item) => {
      const itemPrice = item.menuItem?.price ?? item.price;
      const itemSubtotal = itemPrice * item.quantity;
      subtotal += itemSubtotal;

      return {
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.menuItem?.name || 'Unknown Item',
        description: item.menuItem?.description,
        price: itemPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
        category: item.menuItem?.category,
        imageUrl: item.menuItem?.imageUrl,
        stock: item.menuItem?.stock ?? 0,
        isActive: item.menuItem?.isActive ?? true,
        prepTime: item.menuItem?.prepTime ?? 5,
      };
    });

    const tax = 0.0; // Can be adjusted if tax config is enabled
    const total = subtotal + tax;

    return res.json({
      cart: {
        id: cart.id,
        sessionId: cart.sessionId,
        items,
        subtotal,
        tax,
        total,
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get cart error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch cart.' });
  }
};

/**
 * Add an item to the session cart or increment quantity
 */
const addItemToCart = async (req, res) => {
  const { sessionId } = req.params;
  const { menuItemId, quantity = 1 } = req.body;

  if (!menuItemId) {
    return res.status(400).json({ error: 'menuItemId is required.' });
  }

  try {
    // Check session is still active
    if (!await requireActivePhysicalSession(sessionId, res)) return;

    const menuItem = await prisma.menuItem.findUnique({
      where: { id: parseInt(menuItemId, 10) },
      include: {
        recipeItems: {
          include: { inventoryItem: true }
        }
      }
    });

    if (!menuItem || !menuItem.isActive) {
      return res.status(404).json({ error: 'Menu item is unavailable or deactivated.' });
    }

    const stockError = verifyStockForQty(menuItem, parseInt(quantity, 10));
    if (stockError) {
      return res.status(400).json({ error: stockError });
    }

    const cart = await getOrCreateCart(sessionId);

    // Check if item already exists in cart
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        menuItemId: menuItem.id,
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + parseInt(quantity, 10);
      const updatedStockError = verifyStockForQty(menuItem, newQuantity);
      if (updatedStockError) {
        return res.status(400).json({ error: updatedStockError });
      }

      await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          price: menuItem.price,
        },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          menuItemId: menuItem.id,
          quantity: parseInt(quantity, 10),
          price: menuItem.price,
        },
      });
    }

    // Touch cart updated timestamp
    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });

    return getCart(req, res);
  } catch (error) {
    console.error('Add item to cart error:', error);
    return res.status(500).json({ error: error.message || 'Failed to add item to cart.' });
  }
};

/**
 * Update quantity of a specific cart item
 */
const updateCartItem = async (req, res) => {
  const { sessionId, itemId } = req.params;
  const { quantity } = req.body;

  try {
    // Check session is still active
    if (!await requireActivePhysicalSession(sessionId, res)) return;

    const cart = await getOrCreateCart(sessionId);
    const parsedId = parseInt(itemId, 10);
    const cartItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        OR: [
          { id: parsedId },
          { menuItemId: parsedId },
        ],
      },
      include: {
        menuItem: {
          include: {
            recipeItems: {
              include: { inventoryItem: true }
            }
          }
        }
      },
    });

    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    const newQty = parseInt(quantity, 10);
    if (newQty <= 0) {
      await prisma.cartItem.delete({ where: { id: cartItem.id } });
    } else {
      if (cartItem.menuItem) {
        const updateStockErr = verifyStockForQty(cartItem.menuItem, newQty);
        if (updateStockErr) {
          return res.status(400).json({ error: updateStockErr });
        }
      }

      await prisma.cartItem.update({
        where: { id: cartItem.id },
        data: {
          quantity: newQty,
          price: cartItem.menuItem?.price ?? cartItem.price,
        },
      });
    }

    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });

    return getCart(req, res);
  } catch (error) {
    console.error('Update cart item error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update cart item.' });
  }
};

/**
 * Remove an item from the cart
 */
const removeCartItem = async (req, res) => {
  const { sessionId, itemId } = req.params;

  try {
    // Check session is still active
    if (!await requireActivePhysicalSession(sessionId, res)) return;

    const cart = await getOrCreateCart(sessionId);
    const parsedId = parseInt(itemId, 10);
    await prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        OR: [
          { id: parsedId },
          { menuItemId: parsedId },
        ],
      },
    });

    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });

    return getCart(req, res);
  } catch (error) {
    console.error('Remove cart item error:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove cart item.' });
  }
};

/**
 * Clear the entire cart for a session
 */
const clearCart = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Check session is still active
    if (!await requireActivePhysicalSession(sessionId, res)) return;

    const cart = await getOrCreateCart(sessionId);
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    await prisma.cart.update({
      where: { id: cart.id },
      data: { updatedAt: new Date() },
    });

    return res.json({ message: 'Cart cleared successfully.', items: [], total: 0 });
  } catch (error) {
    console.error('Clear cart error:', error);
    return res.status(500).json({ error: error.message || 'Failed to clear cart.' });
  }
};

module.exports = {
  getCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};
