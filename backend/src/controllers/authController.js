const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { prisma } = require('../config/db');
const { sendOTPEmail } = require('../services/emailService');
const { logAudit } = require('../middleware/auditMiddleware');

const ACCESS_SECRET = process.env.JWT_SECRET || 'pos_system_jwt_access_secret_key_2026';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'pos_system_jwt_refresh_secret_key_2026';
const hashOTP = (email, otp) => crypto.createHmac('sha256', ACCESS_SECRET).update(`${email}:${otp}`).digest();

const generateTokens = (user) => {
  const isDemo = user.isDemo || false;
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, branchId: user.branchId, isDemo },
    ACCESS_SECRET,
    { expiresIn: '7d' }
  );
  const refreshToken = jwt.sign(
    { id: user.id, email: user.email, isDemo },
    REFRESH_SECRET,
    { expiresIn: '30d' }
  );
  return { accessToken, refreshToken };
};

/**
 * Staff and Customer Registration
 */
const register = async (req, res) => {
  const { email, password, name, role } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || !email.trim() || !password || !name.trim()) {
    return res.status(400).json({ error: 'Email, password, and name are required.' });
  }

  // Public registration is for customers only. Staff accounts are provisioned
  // through the authenticated admin workflow.
  if (role && (typeof role !== 'string' || role.toUpperCase() !== 'CUSTOMER')) {
    return res.status(403).json({ error: 'Staff accounts must be created by an administrator.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: name.trim(),
        role: 'CUSTOMER',
        branchId: null,
        isActive: true,
      },
    });

    const tokens = generateTokens(user);

    await logAudit({
      userId: user.id,
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
      req,
    });

    return res.status(201).json({
      message: 'User registered successfully.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
      ...tokens,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
};

/**
 * Staff and User Login (Email + Password)
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: 'Your account has been deactivated or disabled by Admin.' });
    }

    // Older OTP-created customers used this shared password. Never allow it to
    // authenticate, even before the account completes its next OTP sign-in.
    if (user.role === 'CUSTOMER' && password === 'guest_customer_password_2026') {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const tokens = generateTokens(user);

    await logAudit({
      userId: user.id,
      action: 'STAFF_LOGIN',
      entity: 'User',
      entityId: user.id,
      req,
    });

    const isDemo = user.isDemo || false;

    return res.json({
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        branchId: user.branchId,
        isDemo,
      },
      ...tokens,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
};

/**
 * Refresh JWT Access Token using valid Refresh Token
 */
const refreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const decoded = jwt.verify(token, REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });

    if (!user || user.isActive === false) {
      return res.status(403).json({ error: 'User is inactive or no longer exists.' });
    }

    const tokens = generateTokens(user);
    return res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
};

/**
 * Get current profile
 */
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, isActive: true, branchId: true, createdAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ error: 'Internal server error fetching profile.' });
  }
};

const UIT_STUDENT_EMAIL_REGEX = /^[0-9]{2}[a-zA-Z]{2,3}-[0-9]{1,4}-[a-zA-Z]{2,5}@students\.uitu\.edu\.pk$/i;

const validateStudentEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return UIT_STUDENT_EMAIL_REGEX.test(email.trim().toLowerCase());
};

const extractStudentRollNumber = (email) => {
  if (!email || typeof email !== 'string') return null;
  const match = email.trim().match(/^([0-9]{2}[a-zA-Z]{2,3}-[0-9]{1,4}-[a-zA-Z]{2,5})@students\.uitu\.edu\.pk$/i);
  return match ? match[1].toUpperCase() : null;
};

/**
 * Send persistent 6-digit OTP code to email
 */
const sendOTP = async (req, res) => {
  const { email, name, sessionId } = req.body;

  if (typeof email !== 'string' || !email.trim() || email.length > 320) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validate strict UIT student email domain and format (e.g. 23SP-051-SE@students.uitu.edu.pk)
  if (!validateStudentEmail(normalizedEmail)) {
    return res.status(400).json({
      error: 'Please enter a valid UIT student email address (e.g., 23SP-051-SE@students.uitu.edu.pk). Only @students.uitu.edu.pk domain is permitted.',
    });
  }

  // Server-side enforcement: Check if student account is blocked
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, role: true, isActive: true },
  });
  if (existingUser && existingUser.isActive === false) {
    return res.status(403).json({
      error: 'This student account has been restricted by administration. Ordering is blocked. Please contact admin.',
    });
  }

  const safeName = typeof name === 'string' ? name.trim().slice(0, 120) : 'Customer';

  try {
    // Check for active unexpired OTP to enforce resend cooldown (30 seconds)
    const recentOTP = await prisma.emailOTP.findFirst({
      where: {
        email: normalizedEmail,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOTP) {
      const elapsedMs = Date.now() - new Date(recentOTP.createdAt).getTime();
      if (elapsedMs < 30000) {
        const waitSec = Math.ceil((30000 - elapsedMs) / 1000);
        return res.status(429).json({ error: `Please wait ${waitSec} seconds before requesting another code.` });
      }

      // Invalidate older active OTPs for this email
      await prisma.emailOTP.deleteMany({
        where: { email: normalizedEmail, verifiedAt: null },
      });
    }

    // Generate random secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const codeHash = hashOTP(normalizedEmail, rawOtp).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    // Validate session ID in database to prevent foreign key constraint violation
    let validSessionId = null;
    if (typeof sessionId === 'string' && sessionId.length <= 64) {
      const existingSession = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true, customerId: true, status: true, expiresAt: true, customer: { select: { email: true } } },
      });
      const sessionCanBeClaimed = existingSession && existingSession.status === 'ACTIVE' &&
        new Date(existingSession.expiresAt) > new Date() &&
        (!existingSession.customerId || existingSession.customer?.email?.toLowerCase() === normalizedEmail);
      if (sessionCanBeClaimed) {
        validSessionId = sessionId;
      }
    }

    await prisma.emailOTP.create({
      data: {
        email: normalizedEmail,
        sessionId: validSessionId,
        codeHash,
        expiresAt,
        attempts: 0,
      },
    });

    // Send email asynchronously
    sendOTPEmail(normalizedEmail, safeName, rawOtp).catch(err =>
      console.error('[OTP Email] Failed to send email:', err.message)
    );

    return res.json({
      success: true,
      message: 'Verification code sent to your email. Valid for 5 minutes.',
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ error: 'Failed to generate verification OTP.' });
  }
};

/**
 * Verify persistent OTP code and attach user to session
 */
const verifyOTP = async (req, res) => {
  const { email, name } = req.body;
  const otp = req.body?.otp;

  if (typeof email !== 'string' || !email.trim() || email.length > 320 || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validate strict UIT student email domain and format
  if (!validateStudentEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid UIT student email address (e.g., 23SP-051-SE@students.uitu.edu.pk).' });
  }

  // Server-side enforcement: Check if student account is blocked
  const preCheckUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, role: true, isActive: true },
  });
  if (preCheckUser && preCheckUser.isActive === false) {
    return res.status(403).json({ error: 'This student account has been restricted by administration. Ordering is blocked.' });
  }

  const inputHash = hashOTP(normalizedEmail, otp.trim());

  try {
    const otpRecord = await prisma.emailOTP.findFirst({
      where: {
        email: normalizedEmail,
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'No active OTP request found. Please request a new code.' });
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      await prisma.emailOTP.delete({ where: { id: otpRecord.id } });
      return res.status(400).json({ error: 'OTP code has expired. Please request a new code.' });
    }

    if (otpRecord.attempts >= 5) {
      await prisma.emailOTP.delete({ where: { id: otpRecord.id } });
      return res.status(429).json({ error: 'Maximum verification attempts exceeded. Please request a new code.' });
    }

    const storedHash = Buffer.from(otpRecord.codeHash, 'hex');
    const legacyHash = crypto.createHash('sha256').update(otp.trim()).digest();
    const isHashMatch = (candidate) => storedHash.length === candidate.length && crypto.timingSafeEqual(storedHash, candidate);
    // Accept short-lived codes issued just before this security update; all new
    // codes use the keyed hash above and legacy codes expire within five minutes.
    const isValidOtp = isHashMatch(inputHash) || isHashMatch(legacyHash);
    if (!isValidOtp) {
      const newAttempts = otpRecord.attempts + 1;
      await prisma.emailOTP.update({
        where: { id: otpRecord.id },
        data: { attempts: newAttempts },
      });
      const remaining = 5 - newAttempts;
      return res.status(400).json({ error: `Incorrect verification code. ${remaining} attempt(s) remaining.` });
    }

    // Create or find customer user
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user && user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Email code sign-in is available for customer accounts only.' });
    }
    if (user && user.isActive === false) {
      return res.status(403).json({ error: 'This account is inactive. Please contact an administrator.' });
    }

    // Claim the OTP atomically so two concurrent requests cannot reuse it.
    const claimedOtp = await prisma.emailOTP.updateMany({
      where: {
        id: otpRecord.id,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
      },
      data: { verifiedAt: new Date() },
    });
    if (claimedOtp.count !== 1) {
      return res.status(400).json({ error: 'This verification code is no longer valid. Please request a new code.' });
    }

    if (!user) {
      const defaultPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: typeof name === 'string' && name.trim() ? name.trim() : 'Guest Customer',
          password: defaultPassword,
          role: 'CUSTOMER',
          isActive: true,
        },
      });
    } else if (typeof name === 'string' && name.trim() !== '' && user.name !== name.trim()) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: name.trim() },
      });
    }

    // Rotate legacy customer accounts away from the old shared password when
    // they successfully prove control of the email address with this OTP.
    if (user && await bcrypt.compare('guest_customer_password_2026', user.password)) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10) },
      });
    }

    // Only attach the session that was bound to this OTP request. Never trust a
    // different session ID supplied alongside the verification code.
    if (otpRecord.sessionId) {
      await prisma.session.updateMany({
        where: {
          id: otpRecord.sessionId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
          OR: [{ customerId: null }, { customerId: user.id }],
        },
        data: { customerId: user.id },
      });
    }

    const tokens = generateTokens(user);

    return res.json({
      success: true,
      message: 'Email verified successfully.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'Failed to verify code.' });
  }
};

/**
 * Logout
 */
const logout = async (req, res) => {
  if (req.user) {
    await logAudit({
      userId: req.user.id,
      action: 'USER_LOGOUT',
      entity: 'User',
      entityId: req.user.id,
      req,
    });
  }
  return res.json({ message: 'Logged out successfully.' });
};

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  sendOTP,
  verifyOTP,
  logout,
  validateStudentEmail,
  extractStudentRollNumber,
};
