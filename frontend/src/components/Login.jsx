import  { useState } from 'react';
import api from '../services/api';
import { LogIn, Key, Shield, Flame, User, UserCheck } from 'lucide-react';

const Login = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken } = response.data;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(user));
      onLoginSuccess(user);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Invalid credentials or connection issue.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail) => {
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/auth/login', {
        email: demoEmail,
        password: 'password123',
      });
      const { user, accessToken } = response.data;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(user));
      onLoginSuccess(user);
    } catch (err) {
      console.error(err);
      setError('Demo login failed. Make sure the backend server is running and seeded.');
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    {
      role: 'ADMIN',
      title: 'Administrator',
      email: 'admin@pos.com',
      desc: 'View sales analytics, low stock logs & AI predictions',
      color: 'from-orange-500/10 to-amber-500/10 border-orange-500/15 hover:border-orange-500/60 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)]',
      icon: <Shield className="w-5 h-5 text-orange-400" />,
      badge: 'Admin Access'
    },
    {
      role: 'VENDOR',
      title: 'Vendor / Cashier',
      email: 'vendor@pos.com',
      desc: 'Verify mobile transaction IDs & manage order delivery',
      color: 'from-orange-500/10 to-amber-500/10 border-orange-500/15 hover:border-amber-500/60 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]',
      icon: <UserCheck className="w-5 h-5 text-amber-400" />,
      badge: 'POS Terminal'
    },
    {
      role: 'KITCHEN',
      title: 'Kitchen Chef',
      email: 'kitchen@pos.com',
      desc: 'Real-time order board for cooking & preparation',
      color: 'from-amber-500/10 to-orange-500/10 border-amber-500/15 hover:border-amber-500/60 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]',
      icon: <Flame className="w-5 h-5 text-amber-400" />,
      badge: 'Display Board'
    },
    {
      role: 'CUSTOMER',
      title: 'Customer Ordering',
      email: 'customer@pos.com',
      desc: 'Self-ordering menu, digital checkout & order tracking',
      color: 'from-orange-500/10 to-orange-400/10 border-orange-500/15 hover:border-orange-500/60 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)]',
      icon: <User className="w-5 h-5 text-orange-400" />,
      badge: 'Digital Menu'
    },
  ];

  return (
    <div className="responsive-shell min-h-screen flex flex-col justify-center items-center px-4 sm:px-6 bg-[#0A0A0A] text-gray-250 relative overflow-hidden select-none">
      {/* Decorative warm backlights */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-orange-600/5 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-[130px] pointer-events-none" />

      <div className="w-full max-w-6xl grid lg:grid-cols-12 gap-10 items-center relative z-10 py-8 animate-fade-in">
        {/* Left column: Quick Demo Access */}
        <div className="lg:col-span-7 flex flex-col space-y-7">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full text-[10px] font-extrabold tracking-wider uppercase">
              🍽️ ZovikPOS AI POS Suite
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mt-4 leading-[1.1]">
              Canteen Management <br />
              <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent">
                Redefined by AI
              </span>
            </h1>
            <p className="text-gray-400 mt-4 text-sm md:text-base max-w-lg leading-relaxed">
              Experience the future of university canteens. Select a simulated role persona below to instantly launch their respective real-time workspace.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {demoAccounts.map((account) => (
              <button
                key={account.role}
                disabled={loading}
                onClick={() => handleDemoLogin(account.email)}
                className={`flex flex-col text-left p-5 rounded-2xl bg-white/[0.01] backdrop-blur-md border border-white/[0.04] ${account.color} transition-all duration-300 hover:scale-[1.015] cursor-pointer group`}
              >
                <div className="flex justify-between items-center w-full">
                  <div className="p-2 bg-gray-950/60 rounded-xl border border-white/5">
                    {account.icon}
                  </div>
                  <span className="px-2 py-0.5 bg-white/5 text-gray-400 group-hover:text-white group-hover:bg-orange-600/25 border border-white/5 rounded text-[8px] font-bold uppercase tracking-wider transition-all">
                    {account.badge}
                  </span>
                </div>
                <h3 className="font-display font-bold text-white mt-4 text-base tracking-tight">{account.title}</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed group-hover:text-gray-400 transition-colors">{account.desc}</p>
                <div className="flex items-center justify-between w-full mt-4 border-t border-white/[0.04] pt-3">
                  <span className="text-[10px] text-gray-500 font-mono group-hover:text-orange-400 transition-colors">{account.email}</span>
                  <span className="text-[9px] text-gray-600 font-semibold uppercase tracking-wider group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right column: Login Form */}
        <div className="lg:col-span-5">
          <div className="bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] p-8 rounded-[32px] shadow-2xl relative shadow-black/40">
            {/* Top edge linear light */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                <LogIn className="w-4 h-4 text-orange-400" />
              </div>
              <h2 className="font-display text-lg font-bold text-white tracking-tight">Credentials Log In</h2>
            </div>

            {error && (
              <div className="p-3.5 mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-500 font-semibold">
                    @
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@pos.com"
                    className="w-full bg-gray-950/40 border border-white/5 rounded-xl pl-9 pr-4 py-3 text-xs focus:outline-none focus:border-orange-500/50 focus:bg-gray-950 transition-all text-white placeholder-gray-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                    <Key className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-gray-950/40 border border-white/5 rounded-xl pl-9 pr-4 py-3 text-xs focus:outline-none focus:border-orange-500/50 focus:bg-gray-950 transition-all text-white placeholder-gray-700"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-600/10 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none mt-2"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-white/[0.04] text-center">
              <p className="text-[10px] text-gray-500 leading-normal">
                Credentials are pre-seeded in the database. Use demo password: <code className="text-gray-300 font-mono bg-gray-950 px-1.5 py-0.5 rounded border border-white/5">password123</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
