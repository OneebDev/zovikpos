const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearMenu() {
  console.log('Cleaning all menu items from the configured database...');
  try {
    // Destructive operation: never run on production.
    // Must delete in this order to avoid foreign key constraint errors
    console.log('Step 1: Deleting cart items...');
    await prisma.cartItem.deleteMany({});

    console.log('Step 2: Deleting order items...');
    await prisma.orderItem.deleteMany({});

    console.log('Step 3: Deleting menu items...');
    const deleted = await prisma.menuItem.deleteMany({});

    console.log(`✅ Successfully cleared ${deleted.count} menu items.`);
  } catch (err) {
    console.error('Error clearing menu items:', err);
  } finally {
    await prisma.$disconnect();
  }
}

clearMenu();
