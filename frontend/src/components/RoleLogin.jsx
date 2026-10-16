import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { Lock, Mail, Flame, CreditCard, ShieldCheck, User, AlertCircle, ArrowRight, ArrowLeft, Eye, EyeOff, Zap } from 'lucide-react';

const ROLE_CONFIGS = {
  KITCHEN: {
    title: 'Kitchen Login',
    subtitle: 'Sign in to manage kitchen orders and food preparation',
    expectedRole: 'KITCHEN',
    icon: Flame,
    badgeText: 'Kitchen Display System',
    targetRoute: '/kitchen',
    mismatchError: '❌ Invalid portal access! This portal is strictly for Kitchen Staff. Cashier or Admin credentials will not work here. Please log in with a Kitchen Staff account.',
    demoEmail: 'demo.kitchen@testpos.local',
    demoPassword: 'password123',
  },
  CASHIER: {
    title: 'Cashier Login',
    subtitle: 'Sign in to manage POS orders, billing, and payments',
    expectedRole: 'VENDOR',
    icon: CreditCard,
    badgeText: 'POS Terminal Portal',
    targetRoute: '/cashier',
    mismatchError: '❌ Invalid portal access! This portal is strictly for Cashiers and Vendors. Admin or Kitchen credentials will not work here. Please log in with a Cashier account.',
    demoEmail: 'demo.cashier@testpos.local',
    demoPassword: 'password123',
  },
  ADMIN: {
    title: 'Admin Login',
    subtitle: 'Sign in to access executive administration and analytics',
    expectedRole: 'ADMIN',
    icon: ShieldCheck,
    badgeText: 'System Admin Control',
    targetRoute: '/admin',
    mismatchError: '❌ Invalid portal access! This portal is strictly for System Administrators. Cashier or Kitchen credentials will not work here. Please log in with an Admin account.',
    demoEmail: 'demo.admin@testpos.local',
    demoPassword: 'password123',
  },
  CUSTOMER: {
    title: 'Customer Login',
    subtitle: 'Sign in to manage your customer session and track orders',
    expectedRole: 'CUSTOMER',
    icon: User,
    badgeText: 'Customer Account',
    defaultEmail: 'customer@zovikpos.com',
    targetRoute: '/customer',
    mismatchError: 'Invalid customer credentials.',
  },
};

const RoleLogin = ({ roleType = 'CASHIER', onLoginSuccess }) => {
  const navigate = useNavigate();
  const config = ROLE_CONFIGS[roleType] || ROLE_CONFIGS.CASHIER;
  const RoleIcon = config.icon;

  // Empty inputs by default for clean user experience
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setError('');
  }, [roleType]);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email address and password.');
      return;
    }

    setLoading(true);
    try {
      // Single clean login attempt — demo accounts use password123, real accounts use their actual password
      const response = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });

      const { user, accessToken, refreshToken } = response.data;

      // Strict role check: user must have exactly the expected role for this portal
      // ADMIN can only access admin portal, VENDOR can only access cashier portal, KITCHEN only kitchen portal
      if (config.expectedRole !== 'CUSTOMER' && user.role !== config.expectedRole) {
        setError(config.mismatchError);
        setLoading(false);
        return;
      }

      if (onLoginSuccess) {
        onLoginSuccess(user, { accessToken, refreshToken });
      } else {
        navigate(config.targetRoute);
      }
    } catch (err) {
      console.error('Role Login error:', err);
      setError(err.response?.data?.error || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="responsive-shell min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden transition-colors duration-300">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] sm:w-[600px] h-[500px] sm:h-[600px] bg-orange-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-[var(--card-bg)]/90 backdrop-blur-2xl border border-[var(--border-color)] p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 relative z-10 animate-fade-in">

        {/* Top Branding & Navigation */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
          <Link to="/customer" className="inline-flex items-center space-x-1.5 text-xs text-[var(--text-muted)] hover:text-orange-500 transition-colors font-semibold">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Menu</span>
          </Link>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-500 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full">
            {config.badgeText}
          </span>
        </div>

        {/* Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-600/10 border border-orange-500/20 text-orange-500 mb-2 shadow-inner">
            <RoleIcon className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black font-display text-[var(--text-main)] tracking-tight">
            {config.title}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] max-w-xs mx-auto leading-relaxed">
            {config.subtitle}
          </p>
        </div>

        {/* Error Message Alert */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 rounded-2xl text-xs font-semibold flex items-start space-x-3 animate-glow-pulse">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider block">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={config.defaultEmail}
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-4 py-3 pl-10 text-xs sm:text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 transition-all"
                required
              />
              <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3.5 sm:top-4" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-4 py-3 pl-10 pr-10 text-xs sm:text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 transition-all"
                required
              />
              <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3.5 sm:top-4" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 sm:top-4 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-lg shadow-orange-600/20 cursor-pointer flex items-center justify-center space-x-2 active:scale-[0.99]"
          >
            <span>{loading ? 'Authenticating...' : `Sign In to ${config.title.replace(' Login', '')}`}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {config.demoEmail && (
            <button
              type="button"
              onClick={() => {
                setEmail(config.demoEmail);
                setPassword(config.demoPassword);
              }}
              className="w-full min-w-0 py-2.5 px-3 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <span className="min-w-0 text-center leading-tight">
                <span className="block">Fill Demo Credentials</span>
                <span className="mt-0.5 block break-all text-[10px] font-medium opacity-75">{config.demoEmail}</span>
              </span>
            </button>
          )}
        </form>

        {/* Mode Guidance & Testing Quick Fill Shortcut */}
        <div className="border-t border-[var(--border-color)] pt-4 space-y-3">
          <div className="p-2.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-[10px] text-[var(--text-muted)] space-y-1">
            <span className="font-bold text-emerald-600 dark:text-emerald-400 block">🟢 Real Account (Full Access)</span>
            <span>Real accounts have full write access.</span>

            <span className="font-bold text-orange-600 dark:text-orange-400 block mt-2">🔒 Demo Account (Read-Only)</span>
            <span>Demo accounts are strictly restricted to read-only access. Actions & updates are disabled.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleLogin;
