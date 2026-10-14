import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import RoleLogin from './components/RoleLogin';
import CustomerPortalPage from './pages/customer/CustomerPortalPage';
import CustomerCartPage from './pages/customer/CustomerCartPage';
import OrderTrackingPage from './pages/customer/OrderTrackingPage';
import CashierPOSPage from './pages/cashier/CashierPOSPage';
import KitchenBoardPage from './pages/kitchen/KitchenBoardPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import api, { setActiveAuthTokens } from './services/api';
import { connectSocket, disconnectSocket } from './services/socket';
import { Sun, Moon, Flame, CreditCard, ShieldCheck, User } from 'lucide-react';
import DemoRestrictionModal from './components/DemoRestrictionModal';
import RoleChangeModal from './components/RoleChangeModal';

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [authLoading, setAuthLoading] = useState(false);

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
  }, [theme]);

  useEffect(() => {
    if (user && user.id) {
      connectSocket(user);
    } else {
      connectSocket({ id: 0, role: 'CUSTOMER', name: 'Guest Customer', email: '', isGuest: true });
    }
  }, []);

  // Protect routes and handle session expiry events
  useEffect(() => {
    const handleSessionExpired = (e) => {
      console.warn('Session expired event received:', e?.detail?.message);
      handleLogout();
    };

    window.addEventListener('session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('session-expired', handleSessionExpired);
    };
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
    else navigate('/customer');
  };

  const handleLogout = () => {
    const activePath = location.pathname;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
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

  // Determine if we are on a customer-facing or login route
  const isCustomerRoute = location.pathname.startsWith('/customer');
  const isLoginRoute = location.pathname.includes('/login');

  return (
    <div className="min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex flex-col transition-colors duration-300">
      {/* Global Demo Restriction Alert Popup Modal */}
      <DemoRestrictionModal onLogout={handleLogout} />
      {/* Global Real-Time Account Role Change & Deactivation Alert Modal */}
      <RoleChangeModal currentUser={user} onLogout={handleLogout} />

      {/* Top Application Header – hidden on customer routes and login pages */}
      {!isCustomerRoute && !isLoginRoute && (
        <div className="bg-[var(--card-bg)] border-b border-[var(--border-color)] px-6 py-3 flex justify-between items-center z-40 transition-colors duration-300 shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-xs text-orange-500 font-extrabold tracking-wider uppercase">
              ZovikPOS System
            </span>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-[var(--text-main)]">{user.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-[10px] font-bold uppercase border border-orange-500/20">
                {user.role}
              </span>
            </div>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user.role === 'CUSTOMER' ? (
              <div className="flex items-center space-x-1.5">
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
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Routing Layout */}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/customer" replace />} />
          <Route path="/customer" element={<CustomerPortalPage user={user} onLogout={handleLogout} />} />
          <Route path="/customer/table/:tableId" element={<CustomerPortalPage user={user} onLogout={handleLogout} />} />
          <Route path="/customer/cart" element={<CustomerCartPage user={user} onLogout={handleLogout} />} />
          <Route path="/customer/track/:trackingToken" element={<OrderTrackingPage user={user} onLogout={handleLogout} />} />

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
                <AdminDashboardPage user={user} onLogout={handleLogout} />
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
                <CashierPOSPage user={user} onLogout={handleLogout} />
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
                <CashierPOSPage user={user} onLogout={handleLogout} />
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
                <KitchenBoardPage user={user} onLogout={handleLogout} />
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
