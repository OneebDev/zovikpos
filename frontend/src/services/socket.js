import { io } from 'socket.io-client';
import { resolveSocketUrl } from './api';

let currentUser = null;

const getTokenForUser = (user) => {
  if (typeof window === 'undefined') return null;

  let effectiveUser = user;
  if (!effectiveUser) {
    try {
      const stored = localStorage.getItem('user') || localStorage.getItem('customer_user');
      if (stored) effectiveUser = JSON.parse(stored);
    } catch {}
  }

  if (effectiveUser?.isGuest) return null;

  const role = effectiveUser?.role?.toUpperCase();
  const prefix = role === 'ADMIN' ? 'admin' : role === 'VENDOR' ? 'vendor' : role === 'KITCHEN' ? 'kitchen' : 'customer';
  return sessionStorage.getItem(`${prefix}_token`) ||
    localStorage.getItem(`${prefix}_token`) ||
    sessionStorage.getItem('customer_token') ||
    localStorage.getItem('customer_token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('token');
};

const getSocketUrl = () => resolveSocketUrl();

// Create a single persistent socket instance so event listeners are preserved
export const socket = io(getSocketUrl(), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  auth: (cb) => {
    const token = getTokenForUser(currentUser);
    cb(token ? { token } : {});
  },
});

socket.on('connect', () => {
  console.log('Connected to socket server with ID:', socket.id);
  if (typeof window !== 'undefined') {
    const sessionId = localStorage.getItem('customer_sessionId');
    if (sessionId) {
      socket.emit('join:session', sessionId);
    }
  }
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected from socket server:', reason);
});

export const connectSocket = (user) => {
  const nextUser = user || null;
  const token = getTokenForUser(nextUser);
  const currentIdentity = currentUser ? `${currentUser.role}:${currentUser.id}` : 'guest';
  const nextIdentity = nextUser ? `${nextUser.role}:${nextUser.id}` : 'guest';
  const previousToken = socket.auth?.token || null;

  socket.auth = token ? { token } : {};
  currentUser = user;

  if (socket.connected && (currentIdentity !== nextIdentity || previousToken !== token)) {
    socket.disconnect();
    socket.connect();
  } else if (!socket.connected) {
    socket.connect();
  }
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  // Keep socket instance intact for persistent event subscriptions
};
