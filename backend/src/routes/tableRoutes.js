const express = require('express');
const {
  getAllTables,
  addTable,
  updateTable,
  deleteTable,
  bulkDeleteTables,
  regenerateTableQR,
  getTableQRCard,
  getBatchTableQRCards,
} = require('../controllers/tableController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const router = express.Router();

// Public: Customer can see active table names (for delivery change picker)
router.get('/active', async (req, res) => {
  const { prisma } = require('../config/db');
  try {
    const tables = await prisma.table.findMany({
      where: { isActive: true },
      select: { id: true, tableNumber: true },
      orderBy: { id: 'asc' },
    });
    return res.json({ tables });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch tables.' });
  }
});

// Public / customer can read table QR cards if needed
router.get('/:id/qr', getTableQRCard);
router.get('/qr/batch', getBatchTableQRCards);

// Staff/Admin endpoints
router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN', 'VENDOR']));

router.get('/', getAllTables);
router.post('/', roleMiddleware(['ADMIN']), addTable);
router.put('/:id', roleMiddleware(['ADMIN']), updateTable);
router.delete('/bulk', roleMiddleware(['ADMIN']), bulkDeleteTables);
router.delete('/:id', roleMiddleware(['ADMIN']), deleteTable);
router.post('/:id/regenerate-qr', roleMiddleware(['ADMIN']), regenerateTableQR);

module.exports = router;
