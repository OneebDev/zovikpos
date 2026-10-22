const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');
const corsOrigin = require('../middleware/corsPolicy');
const exceptionLogger = require('../utils/exceptionLogger');

let io;

const getAccessSecret = () => process.env.JWT_SECRET || 'pos_system_jwt_access_secret_key_2026';

const getClientIp = (handshake) => {
  if (process.env.NODE_ENV === 'production') {
    const forwarded = handshake?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const parts = forwarded.split(',');
      const last = parts[parts.length - 1].trim();
      if (last) return last;
    }
  }
  return handshake?.address || 'unknown-ip';
};

// Flood guard limits from env
const SOCKET_MAX_PER_IP = () => Number(process.env.SOCKET_MAX_PER_IP) || 200;
const SOCKET_EVENTS_PER_10S = () => Number(process.env.SOCKET_EVENTS_PER_10S) || 60;

// Track active connections per IP (guest/customer only)
const ipConnectionCounts = new Map();

const isStaffUser = (user) => {
  if (!user || !user.role) return false;
  const role = String(user.role).toUpperCase();
  return role === 'ADMIN' || role === 'VENDOR' || role === 'KITCHEN';
};

const initSocket = (server) => {
  io = new Server(server, {
    maxHttpBufferSize: 100000,
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.engine.on('connection_error', (error) => {
    exceptionLogger.exception('socket.connection', error, {
      level: 'warn', context: { code: error.code, action: error.message },
    });
  });

  // Guest sockets remain connected for public menu updates. A supplied token is
  // verified against the database before any private room is granted.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();

    try {
      const decoded = jwt.verify(token, getAccessSecret());
      if (!decoded.id) return next();

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true, isActive: true },
      });

      if (user?.isActive && decoded.role === user.role) socket.data.user = user;
    } catch (error) {
      // An expired or invalid token gets guest-level public events only.
      exceptionLogger.exception('socket.auth', error, { level: 'warn', context: { code: 'INVALID_OR_EXPIRED_TOKEN' } });
    }

    return next();
  });

  // Connection cap middleware (enforced per IP for non-staff)
  io.use((socket, next) => {
    if (isStaffUser(socket.data.user)) return next();

    const clientIp = getClientIp(socket.handshake);
    const maxSockets = SOCKET_MAX_PER_IP();
    const currentCount = ipConnectionCounts.get(clientIp) || 0;

    if (currentCount >= maxSockets) {
      exceptionLogger.log('warn', 'socket.connection_cap', 'Socket connection cap exceeded for IP', {
        context: { ip: clientIp, currentCount, maxSockets },
      });
      return next(new Error('Connection limit exceeded for this network'));
    }

    return next();
  });

  io.on('connection', (socket) => {
    const clientIp = getClientIp(socket.handshake);
    const isStaff = isStaffUser(socket.data.user);

    if (!isStaff) {
      const current = ipConnectionCounts.get(clientIp) || 0;
      ipConnectionCounts.set(clientIp, current + 1);
    }

    // Per-socket incoming event throttle
    const eventTimestamps = [];
    let lastWarnTime = 0;

    socket.use(([event, ...args], nextEvent) => {
      if (isStaff) return nextEvent();

      const now = Date.now();
      const maxEvents = SOCKET_EVENTS_PER_10S();
      const windowMs = 10000;

      while (eventTimestamps.length > 0 && now - eventTimestamps[0] > windowMs) {
        eventTimestamps.shift();
      }

      if (eventTimestamps.length >= maxEvents) {
        // Drop silently, log at most one warning per socket per minute
        if (now - lastWarnTime > 60000) {
          lastWarnTime = now;
          exceptionLogger.log('warn', 'socket.flood_guard', 'Dropped socket event due to throttle', {
            context: {
              socketId: socket.id,
              event,
              maxEvents,
              windowSeconds: 10,
            },
          });
        }
        return; // Event dropped
      }

      eventTimestamps.push(now);
      return nextEvent();
    });

    socket.on('disconnect', (reason) => {
      if (!isStaff) {
        const current = ipConnectionCounts.get(clientIp) || 0;
        if (current <= 1) {
          ipConnectionCounts.delete(clientIp);
        } else {
          ipConnectionCounts.set(clientIp, current - 1);
        }
      }
      exceptionLogger.log('info', 'socket.disconnect', 'Socket client disconnected', {
        context: { code: reason },
      });
    });
    socket.on('error', (error) => {
      exceptionLogger.exception('socket.handler', error, { context: { action: 'socket error' } });
    });
    const user = socket.data.user;
    if (user) {
      socket.join(`account-${user.id}`);
      if (user.role === 'CUSTOMER') socket.join(`customer-orders-${user.id}`);
      if (user.role === 'VENDOR') socket.join('vendors');
      if (user.role === 'KITCHEN') socket.join('kitchens');
      if (user.role === 'ADMIN') socket.join('admins');
    }

    // Allow customers to subscribe to their active dining session and order tracking updates
    socket.on('join:session', (sessionId) => {
      if (typeof sessionId === 'string' && sessionId.length > 5) {
        socket.join(`session-${sessionId}`);
      }
    });

    socket.on('leave:session', (sessionId) => {
      if (sessionId) socket.leave(`session-${sessionId}`);
    });

    socket.on('join:tracking', (tokenOrId) => {
      if (tokenOrId) {
        socket.join(`tracking-${tokenOrId}`);
      }
    });

    socket.on('leave:tracking', (tokenOrId) => {
      if (tokenOrId) socket.leave(`tracking-${tokenOrId}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized.');
  return io;
};

const emitToUser = (userId, event, data) => {
  if (!io) return;
  if (userId !== undefined && userId !== null) {
    io.to(`customer-orders-${userId}`).emit(event, data);
  }
  // Deliver instantly to customer's active session and tracking rooms
  if (data?.sessionId) {
    io.to(`session-${data.sessionId}`).emit(event, data);
  }
  if (data?.trackingToken) {
    io.to(`tracking-${data.trackingToken}`).emit(event, data);
  }
  if (data?.id) {
    io.to(`tracking-${data.id}`).emit(event, data);
  }
};

const emitToAccount = (userId, event, data) => {
  if (io && userId !== undefined && userId !== null) {
    io.to(`account-${userId}`).emit(event, data);
  }
};

const emitToVendor = (event, data) => { if (io) io.to('vendors').emit(event, data); };
const emitToKitchen = (event, data) => { if (io) io.to('kitchens').emit(event, data); };
const emitToAdmin = (event, data) => { if (io) io.to('admins').emit(event, data); };
const broadcastEvent = (event, data) => { if (io) io.emit(event, data); };

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToAccount,
  emitToVendor,
  emitToKitchen,
  emitToAdmin,
  broadcastEvent,
};
