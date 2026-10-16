const express = require('express');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  const insecureDefaults = {
    JWT_SECRET: 'pos_system_jwt_access_secret_key_2026',
    JWT_REFRESH_SECRET: 'pos_system_jwt_refresh_secret_key_2026',
    QR_SECRET: 'zovikpos_qr_cryptographic_secret_2026',
  };
  const unsafeKeys = Object.entries(insecureDefaults)
    .filter(([key, fallback]) => !process.env[key] || process.env[key] === fallback)
    .map(([key]) => key);

  if (unsafeKeys.length) {
    throw new Error(`Production requires unique, configured secrets: ${unsafeKeys.join(', ')}`);
  }
}

const { initSocket } = require('./sockets/socket');
const { generalLimiter } = require('./middleware/rateLimitMiddleware');
const corsOrigin = require('./middleware/corsPolicy');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const cartRoutes = require('./routes/cartRoutes');
const tableRoutes = require('./routes/tableRoutes');
const menuRoutes = require('./routes/menuRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const etaRoutes = require('./routes/etaRoutes');

const path = require('path');

const app = express();
const server = http.createServer(app);

// Security & Middlewares
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Uploaded menu images use unique filenames, so they can be cached for a year.
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1y',
  immutable: true,
}));

// Initialize Socket.io
initSocket(server);

// General Rate Limiter for API endpoints
app.use('/api', generalLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/eta', etaRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ZovikPOS Backend API',
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  // Keep Express's four-argument error-handler signature.
  void next;
  console.error('[Server Error]:', err);
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected server error occurred.'
    : (err.message || 'An unexpected server error occurred.');
  res.status(500).json({ error: message });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 SwipeBite POS Backend API Server running on port ${PORT}`);
});
