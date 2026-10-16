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

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh-token', refreshToken);
router.post('/send-otp', otpLimiter, sendOTP);
router.post('/verify-otp', otpVerificationLimiter, verifyOTP);
router.post('/logout', authMiddleware, logout);
router.get('/profile', authMiddleware, getProfile);

module.exports = router;
