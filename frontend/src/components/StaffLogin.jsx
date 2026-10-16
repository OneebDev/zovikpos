import  { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

import { Lock, Mail, ShieldCheck, Flame, UserCheck, AlertCircle, ArrowRight } from 'lucide-react';

const StaffLogin = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data;

      if (onLoginSuccess) {
        onLoginSuccess(user, { accessToken, refreshToken });
      } else {
        if (user.role === 'ADMIN') navigate('/admin');
        else if (user.role === 'VENDOR') navigate('/cashier');
        else if (user.role === 'KITCHEN') navigate('/kitchen');
        else navigate('/customer');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Invalid credentials or connection error.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (roleEmail) => {
    setEmail(roleEmail);
    setPassword('password123');
  };

  return (
    <div className="responsive-shell min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-300">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-[var(--card-bg)]/80 backdrop-blur-2xl border border-[var(--border-color)] p-8 rounded-3xl shadow-2xl space-y-6 relative z-10 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-600/10 border border-orange-500/20 text-orange-500 mb-2 shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black font-display text-[var(--text-main)] tracking-tight">Staff Portal Login</h1>
          <p className="text-xs text-[var(--text-muted)] font-sans">Enter your credentials to access your authorized POS workspace.</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 rounded-2xl text-xs font-semibold flex items-center space-x-2.5 animate-glow-pulse">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider block">Email Address</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@pos.com"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-4 py-3 pl-10 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 transition-all"
                required
              />
              <Mail className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider block">Password</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-4 py-3 pl-10 text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 transition-all"
                required
              />
              <Lock className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-lg shadow-orange-600/20 cursor-pointer flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Quick Fill Shortcuts */}
        <div className="border-t border-[var(--border-color)] pt-5 space-y-3">
          <span className="text-[10px] text-[var(--text-muted)] font-extrabold uppercase tracking-widest block text-center">
            Demo Account Quick Fill
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleQuickFill('vendor@pos.com')}
              className="p-2.5 bg-[var(--bg-color)] hover:bg-orange-500/10 border border-[var(--border-color)] hover:border-orange-500/20 rounded-xl text-left transition-all cursor-pointer group"
            >
              <UserCheck className="w-3.5 h-3.5 text-orange-500 mb-1" />
              <span className="text-[10px] font-bold block text-[var(--text-main)] group-hover:text-orange-500">Cashier</span>
            </button>
            <button
              onClick={() => handleQuickFill('kitchen@pos.com')}
              className="p-2.5 bg-[var(--bg-color)] hover:bg-amber-500/10 border border-[var(--border-color)] hover:border-amber-500/20 rounded-xl text-left transition-all cursor-pointer group"
            >
              <Flame className="w-3.5 h-3.5 text-amber-400 mb-1" />
              <span className="text-[10px] font-bold block text-[var(--text-main)] group-hover:text-amber-400">Kitchen</span>
            </button>
            <button
              onClick={() => handleQuickFill('admin@pos.com')}
              className="p-2.5 bg-[var(--bg-color)] hover:bg-orange-500/10 border border-[var(--border-color)] hover:border-orange-500/20 rounded-xl text-left transition-all cursor-pointer group"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-orange-400 mb-1" />
              <span className="text-[10px] font-bold block text-[var(--text-main)] group-hover:text-orange-400">Admin</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
