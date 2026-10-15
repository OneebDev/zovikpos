const express = require('express');
const {
  createOrder,
  updateOrderStatus,
  getAllOrders,
  getOrderById,
  getOrderByTrackingToken,
  transferSingleOrderTable,
  deleteOrder,
  bulkDeleteOrders,
} = require('../controllers/orderController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const sessionActivityMiddleware = require('../middleware/sessionActivityMiddleware');

const router = express.Router();

router.use(sessionActivityMiddleware);

// Public Order Tracking via Dynamic QR token
router.get('/track/:token', getOrderByTrackingToken);

// Protected Order Management Endpoints
router.use(authMiddleware);

router.post('/', createOrder);
router.get('/', getAllOrders);
router.delete('/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteOrders);
router.delete('/:id', roleMiddleware(['ADMIN', 'VENDOR']), deleteOrder);
router.get('/:id', getOrderById);
router.put('/:id/status', roleMiddleware(['ADMIN', 'VENDOR', 'KITCHEN', 'CUSTOMER']), updateOrderStatus);
router.put('/:id/transfer-table', transferSingleOrderTable);

module.exports = router;
