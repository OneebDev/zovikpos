import axios from 'axios';

let warnedAboutLoopbackBackend = false;

const getPageHostInfo = () => {
  const host = typeof window !== 'undefined' ? window.location?.hostname || '' : '';
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(host);
  const isLan = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith('.local');
  return { host, isLoopback, isLan };
};

const warnForUnreachableLoopback = (url, pageHost) => {
  if (!warnedAboutLoopbackBackend && pageHost && !['localhost', '127.0.0.1', '::1'].includes(pageHost) && /localhost|127\.0\.0\.1/i.test(url)) {
    warnedAboutLoopbackBackend = true;
    console.warn('[ZOVIKPOS] Backend URL points to localhost while this page is open on another host. Set VITE_API_URL and VITE_SOCKET_URL to a backend URL reachable from this device.');
  }
};

/**
 * Resolves the root backend server URL (without /api suffix).
 * In production: strictly derived from VITE_API_URL (or VITE_API_BASE_URL). Throws if unset.
 * In development: falls back to current page host / localhost:5001.
 */
export const resolveBackendUrl = () => {
  const isProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const envVal =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_API_BASE_URL)) ||
    '';

  const { host: pageHost, isLoopback: pageIsLoopback, isLan: pageIsLanHost } = getPageHostInfo();

  if (envVal && typeof envVal === 'string' && envVal.trim() !== '') {
    const trimmed = envVal.trim().replace(/\/+$/, '').replace(/\/api$/, '');
    let envPointsToLoopback = false;
    let envUrlIsValid = false;
    try {
      const parsedEnvUrl = new URL(trimmed);
      envUrlIsValid = ['http:', 'https:'].includes(parsedEnvUrl.protocol);
      envPointsToLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedEnvUrl.hostname);
    } catch {
      // invalid URL
    }
    if (envPointsToLoopback) warnForUnreachableLoopback(trimmed, pageHost);
    if (envUrlIsValid && (!envPointsToLoopback || pageIsLoopback)) return trimmed;
    if (envUrlIsValid && envPointsToLoopback && pageIsLanHost) {
      return `${window.location.protocol}//${pageHost}:5001`;
    }
  }

  if (isProd) {
    const errorMsg = '[ZOVIKPOS FATAL] VITE_API_URL is not set in this production build. Please set VITE_API_URL in your hosting platform (e.g. Vercel).';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Development localhost / LAN fallback
  if (pageHost) {
    if (pageIsLoopback || pageIsLanHost) {
      return `${window.location.protocol}//${pageHost}:5001`;
    }
  }

  return 'http://localhost:5001';
};

export const resolveSocketUrl = () => {
  const socketEnv = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SOCKET_URL : '';
  if (!socketEnv || typeof socketEnv !== 'string' || !socketEnv.trim()) return resolveBackendUrl();

  const trimmed = socketEnv.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  const { host: pageHost, isLoopback: pageIsLoopback, isLan: pageIsLanHost } = getPageHostInfo();
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return resolveBackendUrl();
    const socketIsLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    if (socketIsLoopback && !pageIsLoopback) {
      warnForUnreachableLoopback(trimmed, pageHost);
      if (pageIsLanHost) return `${window.location.protocol}//${pageHost}:5001`;
      return resolveBackendUrl();
    }
    return trimmed;
  } catch {
    console.warn('[ZOVIKPOS] VITE_SOCKET_URL is invalid; using the configured API backend URL.');
    return resolveBackendUrl();
  }
};

/**
 * Resolves the API base URL with the /api prefix guaranteed.
 * e.g. "https://sparkling-miracle-production-d21c.up.railway.app/api"
 */
export const getApiBase = () => {
  const base = resolveBackendUrl();
  return `${base.replace(/\/+$/, '')}/api`;
};

const api = axios.create({
  baseURL: getApiBase(),
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Resolves the valid, active token for the current tab / role context.
 * Prioritizes route-scoped storage when on a specific role path.
 */
export const getActiveAuthToken = () => {
  if (typeof window !== 'undefined' && window.location) {
    const path = window.location.pathname || '';
    if (path.startsWith('/admin')) {
      const adminSessionToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('admin_token') : null;
      if (adminSessionToken) return adminSessionToken;
      const adminLocalToken = typeof localStorage !== 'undefined' ? localStorage.getItem('admin_token') : null;
      if (adminLocalToken) return adminLocalToken;
    } else if (path.startsWith('/cashier') || path.startsWith('/vendor')) {
      const vendorSessionToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('vendor_token') : null;
      if (vendorSessionToken) return vendorSessionToken;
      const vendorLocalToken = typeof localStorage !== 'undefined' ? localStorage.getItem('vendor_token') : null;
      if (vendorLocalToken) return vendorLocalToken;
    } else if (path.startsWith('/kitchen')) {
      const kitchenSessionToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('kitchen_token') : null;
      if (kitchenSessionToken) return kitchenSessionToken;
      const kitchenLocalToken = typeof localStorage !== 'undefined' ? localStorage.getItem('kitchen_token') : null;
      if (kitchenLocalToken) return kitchenLocalToken;
    } else if (path.startsWith('/customer')) {
      const customerSessionToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('customer_token') : null;
      if (customerSessionToken) return customerSessionToken;
      const customerLocalToken = typeof localStorage !== 'undefined' ? localStorage.getItem('customer_token') : null;
      if (customerLocalToken) return customerLocalToken;
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    const sessionToken = sessionStorage.getItem('token');
    if (sessionToken) return sessionToken;
  }

  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('token');
  }

  return null;
};

/**
 * Resolves the valid refresh token for the current tab / role context.
 */
export const getActiveRefreshToken = () => {
  if (typeof window !== 'undefined' && window.location) {
    const path = window.location.pathname || '';
    if (path.startsWith('/admin')) {
      const adminSessionRefresh = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('admin_refreshToken') : null;
      if (adminSessionRefresh) return adminSessionRefresh;
      const adminLocalRefresh = typeof localStorage !== 'undefined' ? localStorage.getItem('admin_refreshToken') : null;
      if (adminLocalRefresh) return adminLocalRefresh;
    } else if (path.startsWith('/cashier') || path.startsWith('/vendor')) {
      const vendorSessionRefresh = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('vendor_refreshToken') : null;
      if (vendorSessionRefresh) return vendorSessionRefresh;
      const vendorLocalRefresh = typeof localStorage !== 'undefined' ? localStorage.getItem('vendor_refreshToken') : null;
      if (vendorLocalRefresh) return vendorLocalRefresh;
    } else if (path.startsWith('/kitchen')) {
      const kitchenSessionRefresh = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('kitchen_refreshToken') : null;
      if (kitchenSessionRefresh) return kitchenSessionRefresh;
      const kitchenLocalRefresh = typeof localStorage !== 'undefined' ? localStorage.getItem('kitchen_refreshToken') : null;
      if (kitchenLocalRefresh) return kitchenLocalRefresh;
    } else if (path.startsWith('/customer')) {
      const customerSessionRefresh = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('customer_refreshToken') : null;
      if (customerSessionRefresh) return customerSessionRefresh;
      const customerLocalRefresh = typeof localStorage !== 'undefined' ? localStorage.getItem('customer_refreshToken') : null;
      if (customerLocalRefresh) return customerLocalRefresh;
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    const sessionRefresh = sessionStorage.getItem('refreshToken');
    if (sessionRefresh) return sessionRefresh;
  }

  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('refreshToken');
  }

  return null;
};

/**
 * Stores tokens into tab-isolated sessionStorage and role-scoped localStorage.
 */
export const setActiveAuthTokens = (accessToken, refreshToken) => {
  const path = typeof window !== 'undefined' && window.location ? window.location.pathname || '' : '';
  let rolePrefix = '';
  if (path.startsWith('/admin')) rolePrefix = 'admin_';
  else if (path.startsWith('/cashier') || path.startsWith('/vendor')) rolePrefix = 'vendor_';
  else if (path.startsWith('/kitchen')) rolePrefix = 'kitchen_';
  else if (path.startsWith('/customer')) rolePrefix = 'customer_';

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('token', accessToken);
    if (refreshToken) sessionStorage.setItem('refreshToken', refreshToken);
    if (rolePrefix) {
      sessionStorage.setItem(`${rolePrefix}token`, accessToken);
      if (refreshToken) sessionStorage.setItem(`${rolePrefix}refreshToken`, refreshToken);
    }
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('token', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    if (rolePrefix) {
      localStorage.setItem(`${rolePrefix}token`, accessToken);
      if (refreshToken) localStorage.setItem(`${rolePrefix}refreshToken`, refreshToken);
    }
  }
};

// Request interceptor to attach authorization token and active session ID dynamically
api.interceptors.request.use(
  (config) => {
    const hasAuth =
      config.headers &&
      (typeof config.headers.get === 'function'
        ? config.headers.get('Authorization')
        : config.headers['Authorization']);

    if (!hasAuth) {
      const token = getActiveAuthToken();
      if (token) {
        if (config.headers && typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${token}`);
        } else if (config.headers) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }

    const sessionId =
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('customer_sessionId')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('customer_sessionId'));

    if (sessionId) {
      if (config.headers && typeof config.headers.set === 'function') {
        config.headers.set('X-Session-ID', sessionId);
      } else if (config.headers) {
        config.headers['X-Session-ID'] = sessionId;
      }
    }

    const sessionSecret =
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('customer_sessionSecret')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('customer_sessionSecret'));

    if (sessionSecret) {
      if (config.headers && typeof config.headers.set === 'function') {
        config.headers.set('X-Session-Secret', sessionSecret);
      } else if (config.headers) {
        config.headers['X-Session-Secret'] = sessionSecret;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token expiry with auto-refresh queue
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if role was changed or account deactivated by backend
    if (
      error.response &&
      (error.response.status === 403 || error.response.status === 401) &&
      (error.response.data?.code === 'ROLE_CHANGED' ||
        error.response.data?.error?.includes('role has been updated') ||
        error.response.data?.error?.includes('deactivated'))
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('show-role-change-modal', {
            detail: {
              newRole: error.response.data?.newRole || 'VENDOR',
              isActive: error.response.data?.error?.includes('deactivated') ? false : true,
              message: error.response.data?.error || 'Your account role or status was updated by Administrator.',
            },
          })
        );
      }
    }

    // Check if demo write operation was restricted by backend
    if (
      error.response &&
      (error.response.status === 403 || error.response.status === 401) &&
      (error.response.data?.isDemo || error.response.data?.error?.includes('Demo'))
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('show-demo-restriction-modal', { detail: error.response.data }));
      }
    }

    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh-token')
    ) {
      const storedRefreshToken = getActiveRefreshToken();

      if (storedRefreshToken) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((token) => {
              if (originalRequest.headers && typeof originalRequest.headers.set === 'function') {
                originalRequest.headers.set('Authorization', `Bearer ${token}`);
              } else if (originalRequest.headers) {
                originalRequest.headers['Authorization'] = `Bearer ${token}`;
              }
              return api(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await axios.post(`${getApiBase()}/auth/refresh-token`, {
            refreshToken: storedRefreshToken,
          });

          const { accessToken, refreshToken: newRefresh } = res.data;
          setActiveAuthTokens(accessToken, newRefresh);

          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
          if (originalRequest.headers && typeof originalRequest.headers.set === 'function') {
            originalRequest.headers.set('Authorization', `Bearer ${accessToken}`);
          } else if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
          }

          processQueue(null, accessToken);
          isRefreshing = false;

          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          isRefreshing = false;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('session-expired', {
                detail: { message: 'Your session has expired. Please log in again.' },
              })
            );
          }
          return Promise.reject(refreshErr);
        }
      } else {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('session-expired', {
              detail: { message: 'Your session has expired. Please log in again.' },
            })
          );
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
