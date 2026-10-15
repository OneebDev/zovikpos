const { prisma } = require('../config/db');
const { generateQR } = require('../utils/generateQRCode');
const { broadcastEvent } = require('../sockets/socket');

const menuCache = new Map();
const MENU_CACHE_TTL_MS = 10 * 1000;

const clearMenuCache = () => menuCache.clear();

const getAllItems = async (req, res) => {
  const { all, refresh } = req.query;
  const cacheKey = `menu_${all === 'true' ? 'all' : 'active'}`;

  if (refresh !== 'true' && menuCache.has(cacheKey)) {
    const cached = menuCache.get(cacheKey);
    if (Date.now() - cached.timestamp < MENU_CACHE_TTL_MS) {
      return res.json(cached.payload);
    }
  }

  try {
    const whereClause = {};
    if (all !== 'true') {
      whereClause.isActive = true;
    }
    const items = await prisma.menuItem.findMany({
      where: whereClause,
      include: {
        recipeItems: {
          include: { inventoryItem: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    const enrichedItems = items.map(item => {
      const hasStock = item.stock > 0;
      let rawIngredientsAvailable = true;
      const outOfStockIngredients = [];

      if (item.recipeItems && item.recipeItems.length > 0) {
        for (const r of item.recipeItems) {
          if (r.inventoryItem && r.inventoryItem.stockLevel <= 0) {
            rawIngredientsAvailable = false;
            outOfStockIngredients.push(r.inventoryItem.name);
          }
        }
      }

      const isAvailable = item.isActive && hasStock && rawIngredientsAvailable;

      return {
        ...item,
        isAvailable,
        rawIngredientsAvailable,
        outOfStockIngredients
      };
    });

    const payload = { items: enrichedItems };
    menuCache.set(cacheKey, { timestamp: Date.now(), payload });
    return res.json(payload);
  } catch (error) {
    console.error('Fetch menu items error:', error);
    return res.status(500).json({ error: 'Failed to retrieve menu items.' });
  }
};

const getItemById = async (req, res) => {
  const { id } = req.params;
  try {
    const item = await prisma.menuItem.findUnique({
      where: { id: parseInt(id) }
    });
    if (!item) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }
    return res.json({ item });
  } catch (error) {
    console.error('Fetch menu item error:', error);
    return res.status(500).json({ error: 'Failed to retrieve menu item.' });
  }
};
const createItem = async (req, res) => {
  const { name, description, price, type, category, unit, groupName, stock, prepTime, imageUrl, isActive } = req.body;
  if (!name || price === undefined || !category) {
    return res.status(400).json({ error: 'Name, price, and category are required.' });
  }

  try {
    const item = await prisma.menuItem.create({
      data: {
        name,
        description: description || null,
        price: parseFloat(price),
        type: type || 'food',
        category,
        unit: unit || '1 No.',
        groupName: groupName || null,
        stock: stock !== undefined ? parseInt(stock, 10) : 0,
        prepTime: prepTime !== undefined ? parseInt(prepTime, 10) : 5,
        imageUrl: imageUrl || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true
      }
    });
    clearMenuCache();
    broadcastEvent('menu:update', item);
    return res.status(201).json({ message: 'Menu item created successfully.', item });
  } catch (error) {
    console.error('Create menu item error:', error);
    return res.status(500).json({ error: 'Failed to create menu item.' });
  }
};

const updateItem = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, type, category, unit, groupName, stock, prepTime, imageUrl, isActive } = req.body;
  try {
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (type !== undefined) updateData.type = type;
    if (category !== undefined) updateData.category = category;
    if (unit !== undefined) updateData.unit = unit;
    if (groupName !== undefined) updateData.groupName = groupName;
    if (stock !== undefined) updateData.stock = parseInt(stock, 10);
    if (prepTime !== undefined) updateData.prepTime = parseInt(prepTime, 10);
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    // If image is being replaced, delete the old one from storage
    if (imageUrl !== undefined) {
      const existing = await prisma.menuItem.findUnique({ where: { id: parseInt(id) } });
      if (existing && existing.imageUrl && existing.imageUrl !== imageUrl) {
        await deleteImageByUrl(existing.imageUrl);
      }
    }

    const item = await prisma.menuItem.update({
      where: { id: parseInt(id) },
      data: updateData
    });
    clearMenuCache();
    broadcastEvent('menu:update', item);
    return res.json({ message: 'Menu item updated successfully.', item });
  } catch (error) {
    console.error('Update menu item error:', error);
    return res.status(500).json({ error: 'Failed to update menu item.' });
  }
};

const deleteItem = async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch item first so we can clean up its image
    const existing = await prisma.menuItem.findUnique({ where: { id: parseInt(id) } });

    // Attempt hard delete first
    const item = await prisma.menuItem.delete({
      where: { id: parseInt(id) }
    });

    // Delete image from storage after successful DB removal
    if (existing) await deleteImageByUrl(existing.imageUrl);

    clearMenuCache();
    broadcastEvent('menu:update', { ...item, deleted: true });
    return res.json({ message: 'Menu item deleted successfully from database.', item });
  } catch (error) {
    console.warn(`Constraint failure on hard delete: ${error.message}. Performing soft delete.`);
    try {
      const item = await prisma.menuItem.update({
        where: { id: parseInt(id) },
        data: { isActive: false }
      });
      // For soft delete, image stays since the record still exists (deactivated)
      clearMenuCache();
      broadcastEvent('menu:update', item);
      return res.json({ message: 'Menu item deactivated (soft deleted) successfully due to order history references.', item });
    } catch (softError) {
      console.error('Delete menu item error:', softError);
      return res.status(500).json({ error: 'Failed to delete menu item.' });
    }
  }
};

const bulkDeleteItems = async (req, res) => {
  const { ids, category } = req.body;
  try {
    let itemIds = [];
    if (category && category !== 'ALL') {
      const itemsInCat = await prisma.menuItem.findMany({
        where: { category },
        select: { id: true, imageUrl: true },
      });
      itemIds = itemsInCat.map((i) => i.id);
    } else if (Array.isArray(ids) && ids.length > 0) {
      itemIds = ids.map((id) => parseInt(id, 10)).filter(Boolean);
    } else {
      return res.status(400).json({ error: 'Please select items or specify a category to delete.' });
    }

    if (itemIds.length === 0) {
      return res.json({ message: 'No items found matching deletion criteria.', count: 0 });
    }

    let deletedCount = 0;
    let deactivatedCount = 0;

    for (const targetId of itemIds) {
      const existing = await prisma.menuItem.findUnique({ where: { id: targetId } });
      if (!existing) continue;

      try {
        await prisma.menuItem.delete({ where: { id: targetId } });
        if (existing.imageUrl) await deleteImageByUrl(existing.imageUrl);
        deletedCount++;
      } catch (err) {
        // Soft delete / deactivate if referenced in order history
        await prisma.menuItem.update({
          where: { id: targetId },
          data: { isActive: false },
        });
        deactivatedCount++;
      }
    }

    clearMenuCache();
    broadcastEvent('menu:bulk-update', { action: 'BULK_DELETE', count: deletedCount + deactivatedCount });

    return res.json({
      message: `Processed ${itemIds.length} menu items: ${deletedCount} permanently deleted, ${deactivatedCount} deactivated due to order history.`,
      count: deletedCount + deactivatedCount,
      deletedCount,
      deactivatedCount,
    });
  } catch (error) {
    console.error('Bulk delete menu items error:', error);
    return res.status(500).json({ error: 'Failed to process bulk menu item deletion.' });
  }
};

const generateMenuQR = async (req, res) => {
  const { id } = req.params;
  const { tableId } = req.query; // optional table ID parameter
  try {
    const item = await prisma.menuItem.findUnique({
      where: { id: parseInt(id) }
    });
    if (!item) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    const payload = JSON.stringify({
      menuItemId: item.id,
      name: item.name,
      price: item.price,
      tableId: tableId || 'table_1'
    });

    const qrDataUrl = await generateQR(payload);
    return res.json({ qrCode: qrDataUrl });
  } catch (error) {
    console.error('QR code generation error:', error);
    return res.status(500).json({ error: 'Failed to generate QR code.' });
  }
};

const fs = require('fs');
const path = require('path');

/**
 * Delete an image from Supabase Storage or local /uploads.
 * @param {string|null} imageUrl  - The stored imageUrl of the menu item.
 */
async function deleteImageByUrl(imageUrl) {
  if (!imageUrl) return;

  // ── Supabase bucket ──────────────────────────────────────────────
  if (imageUrl.includes('supabase') || imageUrl.startsWith('https://')) {
    try {
      const supabase = require('../config/supabaseClient');
      // Extract just the filename from the full public URL
      const fileName = imageUrl.split('/').pop().split('?')[0];
      const { error } = await supabase.storage
        .from('Menu Images')
        .remove([fileName]);
      if (error) {
        console.warn('⚠️  Supabase delete notice:', error.message);
      } else {
        console.log('🗑️  Deleted from Supabase bucket:', fileName);
      }
    } catch (err) {
      console.warn('⚠️  Supabase delete error:', err.message);
    }
    return;
  }

  // ── Local /uploads fallback ───────────────────────────────────────
  if (imageUrl.startsWith('/uploads/')) {
    try {
      const filePath = path.join(__dirname, '../../uploads', path.basename(imageUrl));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🗑️  Deleted local upload:', filePath);
      }
    } catch (err) {
      console.warn('⚠️  Local file delete error:', err.message);
    }
  }
}

/**
 * Upload Menu Item Image (Saves file to /uploads and returns web URL)
 */
const uploadImage = async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image data provided for upload.' });
  }

  try {
    const matches = imageBase64.match(/^data:(image\/(jpeg|png|webp|jpg));base64,(.+)$/i);
    if (!matches) {
      return res.status(400).json({
        error: 'Invalid image format. Only JPG, JPEG, PNG, and WEBP formats are supported.',
      });
    }

    const mimeType = matches[1].toLowerCase();
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const base64Data = matches[3];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        error: 'File size exceeds maximum allowed limit of 5MB.',
      });
    }

    const uniqueName = `menu_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    // Attempt Supabase Storage Upload first
    try {
      const supabase = require('../config/supabaseClient');
      const { data, error } = await supabase.storage
        .from('Menu Images')
        .upload(uniqueName, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!error) {
        const { data: publicUrlData } = supabase.storage
          .from('Menu Images')
          .getPublicUrl(uniqueName);

        if (publicUrlData && publicUrlData.publicUrl) {
          console.log('✅ Image uploaded successfully to Supabase Storage bucket:', publicUrlData.publicUrl);
          return res.json({
            message: 'Image uploaded successfully to Supabase Storage.',
            imageUrl: publicUrlData.publicUrl,
          });
        }
      } else {
        console.warn('Supabase storage upload notice:', error.message);
      }
    } catch (supaErr) {
      console.warn('Supabase storage upload exception:', supaErr.message);
    }

    // Local fallback storage
    const uploadsDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, uniqueName);
    fs.writeFileSync(filePath, buffer);

    const imageUrl = `/uploads/${uniqueName}`;
    return res.json({
      message: 'Image uploaded successfully.',
      imageUrl,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return res.status(500).json({ error: 'Failed to process and store image.' });
  }
};

module.exports = {
  getAllItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  bulkDeleteItems,
  generateMenuQR,
  uploadImage,
};
