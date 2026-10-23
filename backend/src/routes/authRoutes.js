const express = require('express');
const {
  register,
  login,
  refreshToken,
  getProfile,
  sendOTP,
  verifyOTP,
  logout,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { authLimiter, otpLimiter, otpVerificationLimiter } = require('../middleware/rateLimitMiddleware');

const { validateBody } = require('../middleware/validate');
const {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
} = require('../schemas/apiSchemas');

const router = express.Router();

router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', authLimiter, validateBody(loginSchema), login);
router.post('/refresh-token', refreshToken);
router.post('/send-otp', otpLimiter, validateBody(sendOtpSchema), sendOTP);
router.post('/verify-otp', otpVerificationLimiter, validateBody(verifyOtpSchema), verifyOTP);
router.post('/logout', authMiddleware, logout);
router.get('/profile', authMiddleware, getProfile);

module.exports = router;
