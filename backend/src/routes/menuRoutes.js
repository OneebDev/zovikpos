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

const { validateBody, validateParams } = require('../middleware/validate');
const { createMenuItemSchema, updateMenuItemSchema, idParamSchema } = require('../schemas/apiSchemas');

const router = express.Router();

router.get('/', getAllItems);
router.get('/:id', validateParams(idParamSchema), getItemById);
router.post('/upload-image', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), uploadImage);
router.post('/', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), validateBody(createMenuItemSchema), createItem);
router.put('/:id', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), validateParams(idParamSchema), validateBody(updateMenuItemSchema), updateItem);
router.delete('/bulk', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteItems);
router.delete('/:id', authMiddleware, roleMiddleware(['ADMIN', 'VENDOR']), validateParams(idParamSchema), deleteItem);
router.get('/:id/qr', validateParams(idParamSchema), generateMenuQR);

module.exports = router;
