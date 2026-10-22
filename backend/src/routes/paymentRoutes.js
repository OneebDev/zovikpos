const express = require('express');
const {
  getPaymentSettings,
  updatePaymentSettings,
  submitTransactionId,
  verifyTransaction,
} = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { idempotencyMiddleware } = require('../middleware/idempotencyMiddleware');

const router = express.Router();

// Public / optional auth for fetching current payment availability settings
router.get('/settings', optionalAuthMiddleware, getPaymentSettings);

// Protected endpoints
router.use(authMiddleware);

router.put('/settings', roleMiddleware(['ADMIN', 'VENDOR']), updatePaymentSettings);
router.post('/submit', roleMiddleware(['ADMIN', 'VENDOR', 'CUSTOMER']), idempotencyMiddleware, submitTransactionId);
router.put('/:id/verify', roleMiddleware(['ADMIN', 'VENDOR']), verifyTransaction);

module.exports = router;
