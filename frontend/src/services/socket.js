import { io } from 'socket.io-client';

let currentUser = null;

const getTokenForUser = (user) => {
  if (!user || user.isGuest || typeof window === 'undefined') return null;

  const role = user.role?.toUpperCase();
  const prefix = role === 'ADMIN' ? 'admin' : role === 'VENDOR' ? 'vendor' : role === 'KITCHEN' ? 'kitchen' : 'customer';
  return sessionStorage.getItem(`${prefix}_token`) ||
    localStorage.getItem(`${prefix}_token`) ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('token');
};

const getSocketUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    return `http://${window.location.hostname}:5001`;
  }
  return 'http://localhost:5001';
};

// Create a single persistent socket instance so event listeners are preserved
export const socket = io(getSocketUrl(), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

socket.on('connect', () => {
  console.log('Connected to socket server with ID:', socket.id);
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
