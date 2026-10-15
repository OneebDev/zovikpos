const express = require('express');
const {
  getAllItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  bulkDeleteItems,
  generateMenuQR,
  uploadImage,
} = require('../controllers/menuController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/', getAllItems);
router.get('/:id', getItemById);
router.post('/upload-image', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), uploadImage);
router.post('/', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), createItem);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), updateItem);
router.delete('/bulk', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteItems);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), deleteItem);
router.get('/:id/qr', generateMenuQR);

module.exports = router;
