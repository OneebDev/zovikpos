const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');
const corsOrigin = require('../middleware/corsPolicy');

let io;

const getAccessSecret = () => process.env.JWT_SECRET || 'pos_system_jwt_access_secret_key_2026';

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
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
    } catch {
      // An expired or invalid token gets guest-level public events only.
    }

    return next();
  });

  io.on('connection', (socket) => {
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
