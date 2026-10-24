import  { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import RoleLogin from './components/RoleLogin';
const CustomerPortalPage = lazy(() => import('./pages/customer/CustomerPortalPage'));
const CustomerCartPage = lazy(() => import('./pages/customer/CustomerCartPage'));
const OrderTrackingPage = lazy(() => import('./pages/customer/OrderTrackingPage'));
const CashierPOSPage = lazy(() => import('./pages/cashier/CashierPOSPage'));
const KitchenBoardPage = lazy(() => import('./pages/kitchen/KitchenBoardPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
import api, { setActiveAuthTokens } from './services/api';
import { connectSocket, disconnectSocket } from './services/socket';
import { Sun, Moon, Flame, CreditCard, ShieldCheck, LogOut } from 'lucide-react';
import DemoRestrictionModal from './components/DemoRestrictionModal';
import RoleChangeModal from './components/RoleChangeModal';
import BrandLogo from './components/common/BrandLogo';

const RouteLoadingFallback = () => (
  <div className="min-h-[220px] rounded-2xl bg-[var(--surface-2)] animate-pulse" role="status" aria-label="Loading screen" />
);

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [authLoading] = useState(false);

  const [user, setUser] = useState(() => {
    const path = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
    let roleKey = '';
    if (path.startsWith('/admin')) roleKey = 'admin_';
    else if (path.startsWith('/cashier') || path.startsWith('/vendor')) roleKey = 'vendor_';
    else if (path.startsWith('/kitchen')) roleKey = 'kitchen_';
    else if (path.startsWith('/customer')) roleKey = 'customer_';

    const savedUser =
      (roleKey && typeof localStorage !== 'undefined' && localStorage.getItem(`${roleKey}user`)) ||
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('user')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('user'));

    const savedToken =
      (roleKey && typeof localStorage !== 'undefined' && localStorage.getItem(`${roleKey}token`)) ||
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('token'));

    if (savedUser && savedToken) {
      try {
        const u = JSON.parse(savedUser);
        if (roleKey) {
          const expectedRole = roleKey.replace('_', '').toUpperCase();
          if (u.role === expectedRole) return u;
        } else {
          return u;
        }
      } catch (e) {
        console.error('Failed to parse saved user:', e);
      }
    }
    return { id: 0, role: 'CUSTOMER', name: 'Guest Customer', email: '', isGuest: true };
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', theme === 'dark' ? '#111111' : '#FAF9F7');
  }, [theme]);

  useEffect(() => {
    if (user && user.id) {
      connectSocket(user);
    } else {
      connectSocket({ id: 0, role: 'CUSTOMER', name: 'Guest Customer', email: '', isGuest: true });
    }
  // Login explicitly connects the socket; this mount-only guest/user bootstrap is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Protect routes and handle session expiry events
  useEffect(() => {
    const handleSessionExpired = (e) => {
      console.warn('Session expired event received:', e?.detail?.message);
      if (location.pathname.startsWith('/customer')) {
        // Customer JWT expiry must return to the email step on the same table.
        // A dining session, its cart, and the scanned QR URL are independent of
        // the login token and must survive this auth-only recovery.
        ['customer_token', 'customer_refreshToken', 'customer_user'].forEach((key) => {
          localStorage.removeItem(key);
          sessionStorage.removeItem(key);
        });
        let globalUserRole = '';
        try {
          globalUserRole = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}').role || '';
        } catch { /* Treat an unreadable global identity as customer-scoped on this route. */ }
        if (!globalUserRole || globalUserRole === 'CUSTOMER') {
          ['token', 'refreshToken', 'user'].forEach((key) => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
          });
          const guestCustomer = { id: 0, role: 'CUSTOMER', name: 'Guest Customer', email: '', isGuest: true };
          setUser(guestCustomer);
          disconnectSocket();
          connectSocket(guestCustomer);
        }
        window.dispatchEvent(new Event('customer-auth-expired'));
        return;
      }
      handleLogout();
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
    };
  // Keep the listener tied to route changes; logout routing is managed by the existing session flow.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Renew empty guest sessions only when the customer is actually active.
  useEffect(() => {
    if (!location.pathname.startsWith('/customer')) return undefined;
    let lastTouchAt = 0;
    let inFlight = false;
    const renewFromActivity = () => {
      const now = Date.now();
      if (inFlight || now - lastTouchAt < 45000) return;
      const sessionId = localStorage.getItem('customer_sessionId') || sessionStorage.getItem('customer_sessionId');
      if (!sessionId) return;
      lastTouchAt = now;
      inFlight = true;
      api.get(`/sessions/${sessionId}`, { headers: { 'X-Session-Activity': 'true' } })
        .catch(() => {})
        .finally(() => { inFlight = false; });
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, renewFromActivity, { passive: true }));
    return () => events.forEach((eventName) => window.removeEventListener(eventName, renewFromActivity));
  }, [location.pathname]);

  const handleLoginSuccess = (loggedInUser, tokens) => {
    const rolePrefix = loggedInUser.role?.toLowerCase() || 'user';
    if (tokens?.accessToken) {
      setActiveAuthTokens(tokens.accessToken, tokens.refreshToken);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('user', JSON.stringify(loggedInUser));
    }
    localStorage.setItem(`${rolePrefix}_user`, JSON.stringify(loggedInUser));
    localStorage.setItem('user', JSON.stringify(loggedInUser));

    setUser(loggedInUser);
    connectSocket(loggedInUser);

    if (loggedInUser.role === 'ADMIN') navigate('/admin');
    else if (loggedInUser.role === 'VENDOR') navigate('/cashier');
    else if (loggedInUser.role === 'KITCHEN') navigate('/kitchen');
    else if (location.pathname.startsWith('/customer/table/')) {
      // Keep a native-camera QR route through customer login so the scanned
      // table does not get replaced by a bare /customer URL after auth.
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true });
    } else navigate('/customer');
  };

  const handleLogout = () => {
    const activePath = location.pathname;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
    localStorage.removeItem('zovik_pending_login');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('vendor_token');
    localStorage.removeItem('vendor_refreshToken');
    localStorage.removeItem('vendor_user');
    localStorage.removeItem('kitchen_token');
    localStorage.removeItem('kitchen_refreshToken');
    localStorage.removeItem('kitchen_user');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refreshToken');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('customer_token');
    localStorage.removeItem('customer_refreshToken');
    localStorage.removeItem('customer_user');
    localStorage.removeItem('customer_cart');
    localStorage.removeItem('customer_sessionId');
    localStorage.removeItem('customer_tableId');
    localStorage.removeItem('customer_tableToken');
    localStorage.removeItem('customer_category');
    localStorage.removeItem('customer_checkoutStep');
    localStorage.removeItem('customer_paymentMethod');
    localStorage.removeItem('customer_txId');
    localStorage.removeItem('vendor_activeTab');
    localStorage.removeItem('admin_selectedItemId');

    setUser({ id: 0, role: 'CUSTOMER', name: 'Guest Customer', email: '', isGuest: true });
    disconnectSocket();
    connectSocket({ id: 0, role: 'CUSTOMER', name: 'Guest Customer', email: '', isGuest: true });

    if (activePath.startsWith('/kitchen')) navigate('/kitchen/login');
    else if (activePath.startsWith('/cashier') || activePath.startsWith('/vendor')) navigate('/cashier/login');
    else if (activePath.startsWith('/admin')) navigate('/admin/login');
    else navigate('/customer');
  };

  // Determine if we are on a customer-facing, admin, or login route
  const isCustomerRoute = location.pathname.startsWith('/customer');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isLoginRoute = location.pathname.includes('/login');

  return (
    <div className="responsive-shell min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex flex-col transition-colors duration-300">
      {/* Global Demo Restriction Alert Popup Modal */}
      <DemoRestrictionModal onLogout={handleLogout} />
      {/* Global Real-Time Account Role Change & Deactivation Alert Modal */}
      <RoleChangeModal currentUser={user} onLogout={handleLogout} />

      {/* Top Application Header – hidden on customer routes, admin routes (which have their own floating header), and login pages */}
      {!isCustomerRoute && !isAdminRoute && !isLoginRoute && (
        <div className="staff-global-header bg-[var(--card-bg)] border-b border-[var(--border-color)] px-2.5 sm:px-6 py-2.5 flex flex-nowrap justify-between items-center gap-2 z-40 transition-colors duration-300 shadow-sm">
          <BrandLogo compact className="shrink-0" />

          <div className="flex flex-nowrap items-center gap-1.5 sm:gap-3 text-xs min-w-0">
            {(user.role === 'VENDOR' || user.role === 'KITCHEN') && (
              <span className="staff-role-badge shrink-0 min-w-12 h-10 sm:h-12 px-2 sm:px-3 inline-flex items-center justify-center text-center rounded-xl bg-amber-500/10 text-amber-500 text-[8px] sm:text-[9px] font-bold uppercase leading-tight border border-amber-500/20">
                {user.role}
              </span>
            )}

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="icon-btn icon-btn--44 shrink-0 rounded-lg bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-pressed={theme === 'dark'}
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {user.role === 'CUSTOMER' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Link
                  to="/kitchen/login"
                  className="flex items-center space-x-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Kitchen</span>
                </Link>
                <Link
                  to="/cashier/login"
                  className="flex items-center space-x-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/20 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Cashier</span>
                </Link>
                <Link
                  to="/admin/login"
                  className="flex items-center space-x-1 bg-orange-600 hover:bg-orange-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-md shadow-orange-600/20"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </Link>
              </div>
            ) : (
              <button
                onClick={handleLogout}
                className="shrink-0 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-2 sm:px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-10"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="staff-logout-label">Logout</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Routing Layout */}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/customer" replace />} />
          <Route path="/customer" element={<Suspense fallback={<RouteLoadingFallback />}><CustomerPortalPage user={user} onLogout={handleLogout} /></Suspense>} />
          <Route path="/customer/table/:tableId" element={<Suspense fallback={<RouteLoadingFallback />}><CustomerPortalPage user={user} onLogout={handleLogout} /></Suspense>} />
          <Route path="/customer/cart" element={<Suspense fallback={<RouteLoadingFallback />}><CustomerCartPage user={user} onLogout={handleLogout} /></Suspense>} />
          <Route path="/customer/track/:trackingToken" element={<Suspense fallback={<RouteLoadingFallback />}><OrderTrackingPage user={user} onLogout={handleLogout} /></Suspense>} />

          {/* The 4 Clean Portal Login Routes */}
          <Route path="/kitchen/login" element={<RoleLogin roleType="KITCHEN" onLoginSuccess={handleLoginSuccess} />} />
          <Route path="/cashier/login" element={<RoleLogin roleType="CASHIER" onLoginSuccess={handleLoginSuccess} />} />
          <Route path="/admin/login" element={<RoleLogin roleType="ADMIN" onLoginSuccess={handleLoginSuccess} />} />
          <Route path="/customer/login" element={<Navigate to="/customer" replace />} />

          {/* Redirect aliases */}
          <Route path="/vendor/login" element={<Navigate to="/cashier/login" replace />} />
          <Route path="/login" element={<Navigate to="/cashier/login" replace />} />

          {/* Protected Staff Dashboards */}
          <Route
            path="/admin/*"
            element={
              authLoading ? (
                <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex items-center justify-center text-xs font-bold p-8">
                  Authenticating Admin Workspace...
                </div>
              ) : user.role === 'ADMIN' ? (
                <Suspense fallback={<RouteLoadingFallback />}>
                  <AdminDashboardPage user={user} onLogout={handleLogout} />
                </Suspense>
              ) : (
                <Navigate to="/admin/login" replace />
              )
            }
          />
          <Route
            path="/cashier/*"
            element={
              authLoading ? (
                <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex items-center justify-center text-xs font-bold p-8">
                  Authenticating Cashier Workspace...
                </div>
              ) : user.role === 'VENDOR' ? (
                <Suspense fallback={<RouteLoadingFallback />}><CashierPOSPage user={user} onLogout={handleLogout} /></Suspense>
              ) : (
                <Navigate to="/cashier/login" replace />
              )
            }
          />
          <Route
            path="/vendor/*"
            element={
              authLoading ? (
                <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex items-center justify-center text-xs font-bold p-8">
                  Authenticating Cashier Workspace...
                </div>
              ) : user.role === 'VENDOR' ? (
                <Suspense fallback={<RouteLoadingFallback />}><CashierPOSPage user={user} onLogout={handleLogout} /></Suspense>
              ) : (
                <Navigate to="/cashier/login" replace />
              )
            }
          />
          <Route
            path="/kitchen/*"
            element={
              authLoading ? (
                <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex items-center justify-center text-xs font-bold p-8">
                  Authenticating Kitchen Workspace...
                </div>
              ) : user.role === 'KITCHEN' ? (
                <Suspense fallback={<RouteLoadingFallback />}><KitchenBoardPage user={user} onLogout={handleLogout} /></Suspense>
              ) : (
                <Navigate to="/kitchen/login" replace />
              )
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
