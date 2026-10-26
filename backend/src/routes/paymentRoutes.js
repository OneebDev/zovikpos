const express = require('express');
const {
  getPaymentSettings,
  updatePaymentSettings,
  submitTransactionId,
  verifyTransaction,
  initiatePayfastPayment,
  handlePayfastITN,
  validatePayfastReturn,
} = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { idempotencyMiddleware } = require('../middleware/idempotencyMiddleware');
const { paymentSubmitLimiter } = require('../middleware/rateLimitMiddleware');

const { validateBody, validateParams } = require('../middleware/validate');
const { submitPaymentSchema, idParamSchema } = require('../schemas/apiSchemas');

const router = express.Router();

// Public webhook: PayFast ITN notification (called directly by PayFast server)
router.post('/payfast/notify', express.urlencoded({ extended: true }), handlePayfastITN);

// Public route: Verify PayFast payment on return (works for both local and production)
router.post('/payfast/return/:token', optionalAuthMiddleware, validatePayfastReturn);

// Public / optional auth for fetching current payment availability settings
router.get('/settings', optionalAuthMiddleware, getPaymentSettings);

// Protected endpoints
router.use(authMiddleware);

router.post('/payfast/initiate', initiatePayfastPayment);
router.put('/settings', roleMiddleware(['ADMIN', 'VENDOR']), updatePaymentSettings);
router.post('/submit', roleMiddleware(['ADMIN', 'VENDOR', 'CUSTOMER']), paymentSubmitLimiter, validateBody(submitPaymentSchema), idempotencyMiddleware, submitTransactionId);
router.put('/:id/verify', roleMiddleware(['ADMIN', 'VENDOR']), validateParams(idParamSchema), idempotencyMiddleware, verifyTransaction);

module.exports = router;
