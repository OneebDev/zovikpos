// const express = require('express');
// const cors = require('cors');
// const http = require('http');
// require('dotenv').config();

// if (process.env.NODE_ENV === 'production') {
//   const insecureDefaults = {
//     JWT_SECRET: 'pos_system_jwt_access_secret_key_2026',
//     JWT_REFRESH_SECRET: 'pos_system_jwt_refresh_secret_key_2026',
//     QR_SECRET: 'zovikpos_qr_cryptographic_secret_2026',
//   };
//   const unsafeKeys = Object.entries(insecureDefaults)
//     .filter(([key, fallback]) => !process.env[key] || process.env[key] === fallback)
//     .map(([key]) => key);

//   if (unsafeKeys.length) {
//     throw new Error(`Production requires unique, configured secrets: ${unsafeKeys.join(', ')}`);
//   }
// }

// const { initSocket } = require('./sockets/socket');
// const { generalLimiter } = require('./middleware/rateLimitMiddleware');
// const corsOrigin = require('./middleware/corsPolicy');

// // Route Imports
// const authRoutes = require('./routes/authRoutes');
// const sessionRoutes = require('./routes/sessionRoutes');
// const cartRoutes = require('./routes/cartRoutes');
// const tableRoutes = require('./routes/tableRoutes');
// const menuRoutes = require('./routes/menuRoutes');
// const orderRoutes = require('./routes/orderRoutes');
// const paymentRoutes = require('./routes/paymentRoutes');
// const inventoryRoutes = require('./routes/inventoryRoutes');
// const adminRoutes = require('./routes/adminRoutes');
// const etaRoutes = require('./routes/etaRoutes');

// const path = require('path');

// const app = express();
// const server = http.createServer(app);

// // Security & Middlewares
// app.disable('x-powered-by');
// app.use((req, res, next) => {
//   res.setHeader('X-Content-Type-Options', 'nosniff');
//   res.setHeader('X-Frame-Options', 'SAMEORIGIN');
//   res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
//   res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
//   next();
// });
// app.use(cors({
//   origin: corsOrigin,

//   methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
// }));
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ limit: '50mb', extended: true }));

// // Uploaded menu images use unique filenames, so they can be cached for a year.
// app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
//   maxAge: '1y',
//   immutable: true,
// }));

// // Initialize Socket.io
// initSocket(server);

// // General Rate Limiter for API endpoints
// app.use('/api', generalLimiter);

// // API Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/sessions', sessionRoutes);
// app.use('/api/cart', cartRoutes);
// app.use('/api/tables', tableRoutes);
// app.use('/api/menu', menuRoutes);
// app.use('/api/orders', orderRoutes);
// app.use('/api/payments', paymentRoutes);
// app.use('/api/inventory', inventoryRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/eta', etaRoutes);

// // Health check endpoint
// app.get('/health', (req, res) => {
//   res.json({
//     status: 'healthy',
//     service: 'ZovikPOS Backend API',
//     timestamp: new Date().toISOString(),
//   });
// });

// // Centralized error handling middleware
// app.use((err, req, res, next) => {
//   // Keep Express's four-argument error-handler signature.
//   void next;
//   console.error('[Server Error]:', err);
//   const message = process.env.NODE_ENV === 'production'
//     ? 'An unexpected server error occurred.'
//     : (err.message || 'An unexpected server error occurred.');
//   res.status(500).json({ error: message });
// });

// const PORT = process.env.PORT || 5001;
// server.listen(PORT, () => {
//   console.log(`🚀 SwipeBite POS Backend API Server running on port ${PORT}`);
// });





const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Production secrets validation
if (process.env.NODE_ENV === 'production') {
  const insecureDefaults = {
    JWT_SECRET: 'pos_system_jwt_access_secret_key_2026',
    JWT_REFRESH_SECRET: 'pos_system_jwt_refresh_secret_key_2026',
    QR_SECRET: 'zovikpos_qr_cryptographic_secret_2026',
  };

  const unsafeKeys = Object.entries(insecureDefaults)
    .filter(([key, fallback]) => {
      return !process.env[key] ||
        process.env[key] === fallback;
    })
    .map(([key]) => key);

  if (unsafeKeys.length > 0) {
    throw new Error(
      `Production requires unique, configured secrets: ${unsafeKeys.join(', ')}`
    );
  }
}

// Socket.IO and middleware
const { initSocket } = require('./sockets/socket');
const { generalLimiter } = require('./middleware/rateLimitMiddleware');
const corsOrigin = require('./middleware/corsPolicy');

// Route imports
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

// Initialize Express and HTTP server
const app = express();
const server = http.createServer(app);

// Trust Railway's reverse proxy for client IPs,
// HTTPS detection and rate-limiter behavior.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Basic security headers
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  next();
});

// CORS configuration
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],
}));

// Request body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
  limit: '50mb',
  extended: true,
}));

// Static uploaded menu images
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'), {
    maxAge: '1y',
    immutable: true,
  })
);

// Initialize Socket.IO
initSocket(server);

// API rate limiting
app.use('/api', generalLimiter);

// API routes
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

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ZovikPOS Backend API',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'ZovikPOS Backend API is running',
    status: 'healthy',
    health: '/health',
  });
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode < 600
      ? err.statusCode
      : 500;

  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected server error occurred.'
      : err.message || 'An unexpected server error occurred.';

  res.status(statusCode).json({
    error: message,
  });
});

// Railway port configuration
const PORT = Number(process.env.PORT) || 5001;

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `🚀 ZovikPOS Backend API running on port ${PORT}`
  );
});

// Handle server startup/runtime errors
server.on('error', (err) => {
  console.error('[Server Error]:', err);
  process.exit(1);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`${signal} received. Shutting down server...`);

  server.close((err) => {
    if (err) {
      console.error('Server shutdown error:', err);
      process.exit(1);
    }

    console.log('Server closed successfully.');
    process.exit(0);
  });

  // Force shutdown if connections do not close in time.
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
