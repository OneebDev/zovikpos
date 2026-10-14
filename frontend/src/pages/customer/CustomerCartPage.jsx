import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { connectSocket, getSocket } from '../../services/socket';
import { getETAPrediction } from '../../services/etaService';
import { OtpInputBoxes } from '../../components/CustomerDashboard';
import PhoneInput from '../../components/PhoneInput';
import {
  ArrowLeft,
  ShoppingBag,
  Trash2,
  Clock,
  Bot,
  AlertCircle,
  CheckCircle2,
  Shield,
  CreditCard,
  Banknote,
  Utensils,
  Check,
  RotateCcw,
  ChevronRight,
  Smartphone,
  Lock,
  QrCode,
  Sparkles,
} from 'lucide-react';

const CustomerCartPage = ({ user }) => {
  const navigate = useNavigate();

  // ─── Online Mobile Wallet Payment Modal state ────────────────────────────
  const [showOnlinePaymentModal, setShowOnlinePaymentModal] = useState(false);
  const [walletProvider, setWalletProvider] = useState('Easypaisa');
  const [walletPhone, setWalletPhone] = useState('0300-1234567');
  const [authorizingPayment, setAuthorizingPayment] = useState(false);

  // ─── Persistent cart state ────────────────────────────────────────────────
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('customer_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [tableId] = useState(() => localStorage.getItem('customer_tableId') || 'Dining Table');
  const [sessionId] = useState(() => localStorage.getItem('customer_sessionId') || '');
  const [error, setError] = useState('');

  // ─── ETA / Kitchen Load ───────────────────────────────────────────────────
  const [etaInfo, setEtaInfo] = useState(null);
  const [etaLoading, setEtaLoading] = useState(false);

  // ─── Safely fetch stored customer identity (ignoring staff accounts like Demo Kitchen) ───
  const getStoredCustomerUser = () => {
    try {
      const savedCustomer = localStorage.getItem('customer_user') || sessionStorage.getItem('customer_user');
      if (savedCustomer) {
        const u = JSON.parse(savedCustomer);
        if (u && (!u.role || u.role === 'CUSTOMER')) return u;
      }
    } catch {}

    try {
      const savedUser = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u && (!u.role || u.role === 'CUSTOMER')) return u;
      }
    } catch {}

    return null;
  };

  // ─── OTP / Guest details ─────────────────────────────────────────────────
  const [guestName, setGuestName] = useState(() => {
    const u = getStoredCustomerUser();
    return (u && !u.isGuest) ? (u.name || '') : '';
  });
  const [guestEmail, setGuestEmail] = useState(() => {
    const u = getStoredCustomerUser();
    return (u && !u.isGuest) ? (u.email || '') : '';
  });
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(() => {
    const token = localStorage.getItem('customer_token') || localStorage.getItem('token') || sessionStorage.getItem('token');
    const u = getStoredCustomerUser();
    return Boolean(token && u && !u.isGuest);
  });
  const [otpLoading, setOtpLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // ─── Payment / checkout ───────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState(
    () => localStorage.getItem('customer_paymentMethod') || 'COD'
  );
  const [paymentSettings, setPaymentSettings] = useState({ codEnabled: true, onlineEnabled: true });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  const [checkoutDone, setCheckoutDone] = useState(false);

  // ─── Fetch payment availability settings ──────────────────────────────────
  useEffect(() => {
    api.get('/payments/settings')
      .then(res => {
        const data = res.data.settings || res.data;
        if (data && typeof data.codEnabled === 'boolean') {
          setPaymentSettings(data);
          if (data.codEnabled && !data.onlineEnabled) {
            setPaymentMethod('COD');
          } else if (!data.codEnabled && data.onlineEnabled) {
            setPaymentMethod('Easypaisa');
          } else if (data.codEnabled && data.onlineEnabled) {
            const saved = localStorage.getItem('customer_paymentMethod');
            setPaymentMethod(saved || 'COD');
          }
        }
      })
      .catch(err => console.warn('Payment settings fetch error:', err.message));
  }, []);

  // ─── Real-time payment settings listener ──────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handlePaymentSettingsUpdate = settings => {
        const data = settings.settings || settings;
        if (data && typeof data.codEnabled === 'boolean') {
          setPaymentSettings(data);
          if (data.codEnabled && !data.onlineEnabled) {
            setPaymentMethod('COD');
          } else if (!data.codEnabled && data.onlineEnabled) {
            setPaymentMethod('Easypaisa');
          }
        }
      };
      socket.on('paymentSettings:update', handlePaymentSettingsUpdate);
      return () => socket.off('paymentSettings:update', handlePaymentSettingsUpdate);
    }
  }, []);

  // ─── Persist cart ─────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('customer_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('customer_paymentMethod', paymentMethod);
  }, [paymentMethod]);

  // ─── Cooldown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);

  // ─── Fetch ETA whenever cart changes ─────────────────────────────────────
  useEffect(() => {
    const itemsList = Object.values(cart).map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
    }));
    if (itemsList.length > 0) {
      setEtaLoading(true);
      getETAPrediction(itemsList)
        .then(data => setEtaInfo(data))
        .catch(err => console.error('ETA error:', err))
        .finally(() => setEtaLoading(false));
    } else {
      setEtaInfo(null);
    }
  }, [cart]);

  // ─── Real-time order update via socket ───────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleOrderUpdate = updatedOrder => {
        setActiveOrder(prev => {
          if (!prev || prev.id === updatedOrder.id) {
            return updatedOrder;
          }
          return prev;
        });
      };
      socket.on('order:update', handleOrderUpdate);
      return () => socket.off('order:update', handleOrderUpdate);
    }
  }, []);

  // ─── Cart helpers ─────────────────────────────────────────────────────────
  const addToCart = async (item) => {
    setCart(prev => ({
      ...prev,
      [item.id]: { ...item, quantity: (prev[item.id]?.quantity || 0) + 1 },
    }));

    if (sessionId) {
      try {
        await api.post(`/cart/${sessionId}/items`, { menuItemId: item.id, quantity: 1 });
      } catch (e) {
        console.warn('Backend cart error:', e.message);
      }
    }
  };

  const removeOneFromCart = async (itemId) => {
    const currentQty = cart[itemId]?.quantity || 0;
    setCart(prev => {
      const copy = { ...prev };
      if (!copy[itemId]) return prev;
      if (copy[itemId].quantity <= 1) {
        delete copy[itemId];
      } else {
        copy[itemId] = { ...copy[itemId], quantity: copy[itemId].quantity - 1 };
      }
      return copy;
    });

    if (sessionId) {
      try {
        if (currentQty <= 1) {
          await api.delete(`/cart/${sessionId}/items/${itemId}`);
        } else {
          await api.put(`/cart/${sessionId}/items/${itemId}`, { quantity: currentQty - 1 });
        }
      } catch (e) {
        console.warn('Backend cart error:', e.message);
      }
    }
  };

  const deleteFromCart = async (itemId) => {
    setCart(prev => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    if (sessionId) {
      try {
        await api.delete(`/cart/${sessionId}/items/${itemId}`);
      } catch (e) {
        console.warn('Backend cart delete error:', e.message);
      }
    }
  };

  const clearCart = async () => {
    setCart({});
    if (sessionId) {
      try {
        await api.delete(`/cart/${sessionId}`);
      } catch (e) {
        console.warn('Backend cart clear error:', e.message);
      }
    }
  };

  const getSubtotal = () =>
    Object.values(cart).reduce((t, item) => t + item.price * item.quantity, 0);

  const getTotal = () => getSubtotal().toFixed(2);
  const totalQty = Object.values(cart).reduce((s, i) => s + i.quantity, 0);

  const getItemImage = item => {
    if (item?.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim() !== '') {
      const url = item.imageUrl.trim();
      if (url.startsWith('/uploads/')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        return `http://${host}:5001${url}`;
      }
      return url;
    }
    const name = (item?.name || '').toLowerCase();
    const cat = (item?.category || '').toLowerCase();
    if (name.includes('biryani') || name.includes('rice') || name.includes('pulao'))
      return 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&auto=format&fit=crop&q=80';
    if (name.includes('burger') || name.includes('zinger') || name.includes('patty'))
      return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&auto=format&fit=crop&q=80';
    if (name.includes('pizza') || name.includes('calzone'))
      return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop&q=80';
    if (name.includes('sandwich') || name.includes('club'))
      return 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=400&auto=format&fit=crop&q=80';
    if (name.includes('fries') || name.includes('chips'))
      return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&auto=format&fit=crop&q=80';
    if (name.includes('cake') || name.includes('brownie') || name.includes('chocolate') || name.includes('dessert'))
      return 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=80';
    if (name.includes('tea') || name.includes('chai') || name.includes('coffee') || name.includes('coke') || name.includes('drink') || cat.includes('beverage'))
      return 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&auto=format&fit=crop&q=80';
    if (name.includes('naan') || name.includes('bread') || name.includes('roti') || name.includes('paratha') || name.includes('chapati'))
      return 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=400&auto=format&fit=crop&q=80';
    return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&auto=format&fit=crop&q=80';
  };

  // ─── Persistent OTP Handlers ─────────────────────────────────────────────
  const handleSendOTP = async () => {
    if (!guestEmail || !guestName) {
      setError('Please enter your name and email first.');
      return;
    }
    setError('');
    setOtpLoading(true);
    try {
      const response = await api.post('/auth/send-otp', {
        email: guestEmail,
        name: guestName,
        sessionId,
      });
      if (response.data.success) {
        setOtpSent(true);
        setCooldown(30);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP. Please check your email address.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode || otpCode.length < 4) {
      setError('Please enter the verification code sent to your email.');
      return;
    }
    setError('');
    setOtpLoading(true);
    try {
      const response = await api.post('/auth/verify-otp', {
        email: guestEmail,
        name: guestName,
        otp: otpCode,
        sessionId,
      });
      if (response.data.success) {
        setOtpVerified(true);
        if (response.data.accessToken) {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('token', response.data.accessToken);
            if (response.data.refreshToken) sessionStorage.setItem('refreshToken', response.data.refreshToken);
          }
          localStorage.setItem('customer_token', response.data.accessToken);
          if (response.data.refreshToken) localStorage.setItem('customer_refreshToken', response.data.refreshToken);
          localStorage.setItem('token', response.data.accessToken);
          if (response.data.refreshToken) localStorage.setItem('refreshToken', response.data.refreshToken);
        }
        if (response.data.user) {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('user', JSON.stringify(response.data.user));
          }
          localStorage.setItem('customer_user', JSON.stringify(response.data.user));
          localStorage.setItem('user', JSON.stringify(response.data.user));
          connectSocket(response.data.user);
        }
        setError('');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired OTP. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ─── Place order ─────────────────────────────────────────────────────────
  const executeOrderPlacement = async (overrideMethod, overrideTxId) => {
    setError('');
    const items = Object.values(cart).map(item => ({
      menuItemId: item.id,
      quantity: item.quantity,
    }));
    if (items.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    setPlacingOrder(true);
    try {
      const isOnline = Boolean(overrideTxId);
      const response = await api.post('/orders', {
        items,
        tableId,
        sessionId,
        paymentMethod: overrideMethod || paymentMethod,
        paymentStatus: isOnline ? 'PENDING_VERIFICATION' : 'UNPAID',
        paymentTxId: overrideTxId || null,
        status: isOnline ? 'PAYMENT_PENDING' : 'PENDING',
        customerEmail: guestEmail || user?.email,
        emailVerified: true,
      });
      const placedOrder = response.data.order;
      if (placedOrder?.sessionId) {
        localStorage.setItem('customer_sessionId', placedOrder.sessionId);
      }
      try {
        const savedCache = localStorage.getItem('customer_active_orders_cache');
        const cache = savedCache ? JSON.parse(savedCache) : { activeOrders: [], failedOrders: [] };
        const updatedActive = [placedOrder, ...(cache.activeOrders || []).filter(o => o.id !== placedOrder.id)];
        localStorage.setItem('customer_active_orders_cache', JSON.stringify({ ...cache, activeOrders: updatedActive }));
      } catch (e) {
        console.warn('Failed updating active orders cache:', e);
      }
      setActiveOrder(placedOrder);
      clearCart();
      setShowOnlinePaymentModal(false);
      setCheckoutDone(true);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to place order. Please check stock levels.');
    } finally {
      setPlacingOrder(false);
      setAuthorizingPayment(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (placingOrder || authorizingPayment) return;
    setError('');
    if (!otpVerified) {
      setError('Please verify your email via OTP before placing an order.');
      return;
    }

    const isOnline = paymentMethod === 'Easypaisa' || paymentMethod === 'JazzCash';

    if (!paymentSettings.codEnabled && !paymentSettings.onlineEnabled) {
      setError("Sorry, we're not accepting orders at the moment. The kitchen is currently closed. Please try again later.");
      return;
    }
    if (isOnline && !paymentSettings.onlineEnabled) {
      setError('Sorry, Online Payment is currently unavailable. Please choose Pay at Counter to continue.');
      return;
    }
    if (!isOnline && !paymentSettings.codEnabled) {
      setError('Sorry, Pay at Counter is currently unavailable. Please choose Online Payment to continue.');
      return;
    }

    if (isOnline) {
      setShowOnlinePaymentModal(true);
      return;
    }
    await executeOrderPlacement('COD', null);
  };

  const handleWalletPaymentConfirm = async () => {
    setAuthorizingPayment(true);
    setTimeout(async () => {
      const mockTxId = `TXN-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      await executeOrderPlacement(walletProvider, mockTxId);
    }, 1500);
  };

  // ─── If checkout is completed, render confirmation and track button ──────
  if (checkoutDone && activeOrder) {
    return (
      <div className="w-full bg-[#FAF9F7] dark:bg-[#121212] min-h-screen font-sans flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-[#E85D2A]/20">
        <div className="max-w-md w-full bg-white dark:bg-[#1E1E1E] border border-[#E7E5E4] dark:border-[#333] rounded-[36px] p-8 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in duration-300 relative overflow-hidden">
          
          {/* Top Decorative Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-gradient-to-r from-emerald-500 via-[#E85D2A] to-emerald-500 rounded-b-full" />

          {/* Celebratory Checkmark Icon */}
          <div className="relative w-20 h-20 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-500/15 shadow-inner">
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
              <Sparkles className="w-3 h-3 text-emerald-500" />
              <span>Order Confirmed</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#171717] dark:text-white mt-1">
              {activeOrder.orderNumber || `#000${activeOrder.id}`}
            </h1>
            <p className="text-xs text-[#78716C] dark:text-[#A8A29E] mt-2 leading-relaxed">
              Your order has been placed successfully for <strong className="text-[#E85D2A] font-extrabold">{activeOrder.tableNumber || tableId}</strong>.
              A confirmation receipt has been sent to <strong className="text-[#171717] dark:text-white font-bold">{activeOrder.customerEmail || guestEmail}</strong>.
            </p>
          </div>

          {/* Receipt Breakdown Card */}
          <div className="bg-[#FAF9F7] dark:bg-[#252525] border border-[#E7E5E4] dark:border-[#3A3A3A] rounded-2xl p-4 text-xs space-y-2.5 text-left">
            <div className="flex justify-between items-center text-[#78716C] dark:text-[#A8A29E]">
              <span className="font-semibold">Estimated Prep Time:</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                ~{activeOrder.etaPrediction?.adjustedEta ? Math.round(activeOrder.etaPrediction.adjustedEta) : 10} Mins
              </strong>
            </div>
            <div className="flex justify-between items-center text-[#78716C] dark:text-[#A8A29E]">
              <span className="font-semibold">Payment Option:</span>
              <strong className="text-[#171717] dark:text-white font-extrabold">{activeOrder.paymentMethod} ({activeOrder.paymentStatus})</strong>
            </div>
            <div className="flex justify-between items-center text-[#171717] dark:text-white font-black border-t border-[#E7E5E4] dark:border-[#3A3A3A] pt-2.5 text-sm">
              <span>Total Paid:</span>
              <span className="text-[#E85D2A] font-mono text-base">Rs. {Number(activeOrder.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => navigate(`/customer/track/${activeOrder.trackingToken || activeOrder.id}`)}
              className="w-full py-4 bg-gradient-to-tr from-[#E85D2A] to-[#FB923C] hover:opacity-95 text-white font-extrabold text-xs rounded-2xl shadow-xl shadow-[#E85D2A]/25 transition-all cursor-pointer flex items-center justify-center space-x-2 active:scale-95"
            >
              <QrCode className="w-4.5 h-4.5" />
              <span>Track Live Order & View QR</span>
            </button>
            <button
              onClick={() => navigate('/customer')}
              className="w-full py-3 bg-[#FAF9F7] dark:bg-[#2A2A2A] hover:bg-[#E7E5E4] dark:hover:bg-[#333] text-[#78716C] dark:text-[#A8A29E] font-bold text-xs rounded-2xl transition-all cursor-pointer border border-[#E7E5E4] dark:border-[#404040]"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full bg-[#FAF9F7] dark:bg-[#111111] text-[#171717] dark:text-[#F5F5F5] min-h-screen font-sans flex flex-col transition-colors duration-200">
      {/* HEADER */}
      <header className="w-full bg-white dark:bg-[#1F1F1F] border-b border-[#E7E5E4] dark:border-[#333] sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/customer')}
            className="p-2 hover:bg-[#FFF8F2] dark:hover:bg-orange-950/40 text-[#E85D2A] rounded-xl transition-all cursor-pointer border border-[#E85D2A]/20"
            title="Back to Menu"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-black text-base text-[#171717] dark:text-white">Your Shopping Cart</h1>
            <span className="text-[10px] text-[#78716C] dark:text-[#A8A29E] font-bold">{tableId} • {totalQty} items</span>
          </div>
        </div>

        {totalQty > 0 && (
          <button
            onClick={clearCart}
            className="px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center space-x-1 border border-red-100 dark:border-red-900/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Cart</span>
          </button>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 rounded-2xl text-xs font-bold flex items-center space-x-2.5 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {totalQty === 0 ? (
          <div className="bg-white dark:bg-[#1F1F1F] border border-[#E7E5E4] dark:border-[#333] rounded-[32px] p-12 text-center space-y-4 max-w-md mx-auto shadow-sm">
            <div className="w-16 h-16 bg-[#FFF8F2] dark:bg-orange-950/40 text-[#E85D2A] rounded-full flex items-center justify-center mx-auto">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white">Your Cart is Empty</h2>
            <p className="text-xs text-gray-500 dark:text-[#A8A29E] leading-relaxed">
              Explore our fresh delicious canteen menu and add items to get started.
            </p>
            <button
              onClick={() => navigate('/customer')}
              className="px-6 py-3 bg-[#E85D2A] text-white font-bold text-xs rounded-2xl shadow-md hover:bg-orange-600 transition-all cursor-pointer"
            >
              Browse Menu
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Left: Cart Items List */}
            <div className="lg:col-span-7 space-y-4">
              <h2 className="text-xs font-black text-gray-400 dark:text-[#A8A29E] uppercase tracking-wider">Selected Items ({totalQty})</h2>
              
              <div className="space-y-3">
                {Object.values(cart).map((item) => (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-[#1F1F1F] border border-[#E7E5E4] dark:border-[#333] rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 shadow-sm hover:border-orange-200 dark:hover:border-orange-900/50 transition-all"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <img
                        src={getItemImage(item)}
                        alt={item.name}
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-gray-100 dark:border-[#333] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-black text-xs sm:text-sm text-gray-900 dark:text-white truncate">{item.name}</h3>
                          {item.unit && item.unit !== 'per portion' && item.unit !== 'Full' && (
                            <span className="bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-orange-200/60 dark:border-orange-800/60 shrink-0">
                              {item.unit}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 mt-0.5 block">
                          Rs. {Number(item.price || 0).toFixed(2)} each
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-[#A8A29E] block">Subtotal: Rs. {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
                      <div className="flex items-center bg-gray-50 dark:bg-[#262626] border border-gray-200 dark:border-[#333] rounded-xl p-1">
                        <button
                          onClick={() => removeOneFromCart(item.id)}
                          className="w-7 h-7 bg-white dark:bg-[#333] text-gray-700 dark:text-gray-200 font-bold rounded-lg flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 transition-all cursor-pointer shadow-sm text-xs"
                        >
                          -
                        </button>
                        <span className="text-xs font-black text-gray-900 dark:text-white px-2 sm:px-2.5">{item.quantity}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-7 h-7 bg-[#E85D2A] text-white font-bold rounded-lg flex items-center justify-center hover:bg-orange-600 transition-all cursor-pointer shadow-sm text-xs"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => deleteFromCart(item.id)}
                        className="p-1.5 sm:p-2 text-gray-400 dark:text-neutral-500 hover:text-red-500 transition-all cursor-pointer"
                        title="Remove Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI ETA Card */}
              {etaInfo && (
                <div className="bg-gradient-to-br from-orange-50 to-orange-50/50 dark:from-[#262626] dark:to-[#1F1F1F] border border-orange-100 dark:border-orange-950/60 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Bot className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-xs font-black text-orange-900 dark:text-orange-200">AI Kitchen Prep Forecast</span>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-200/50 dark:border-emerald-800/40">
                      ~{etaInfo.estimatedTime} Mins
                    </span>
                  </div>
                  <p className="text-[11px] text-orange-700 dark:text-orange-300 leading-relaxed">
                    {etaInfo.explanation || `Estimated ~${etaInfo.estimatedTime} mins based on current kitchen load (${etaInfo.kitchenLoad}) and peak-hour queue analysis.`}
                  </p>
                </div>
              )}
            </div>

            {/* Right: Checkout & Verification Panel */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Customer Verification Card */}
              <div className="bg-white dark:bg-[#1F1F1F] border border-[#E7E5E4] dark:border-[#333] rounded-3xl p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 dark:text-[#A8A29E]">Customer Details</h3>
                  {otpVerified && (
                    <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 flex items-center space-x-1">
                      <Check className="w-3 h-3" />
                      <span>Verified</span>
                    </span>
                  )}
                </div>

                {!otpVerified ? (
                  <div className="space-y-3.5">
                    <div>
                      <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">Your Full Name</label>
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full bg-gray-50 dark:bg-[#262626] border border-gray-200 dark:border-[#333] rounded-xl px-3.5 py-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-orange-600"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">Email (for receipts & updates)</label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="w-full bg-gray-50 dark:bg-[#262626] border border-gray-200 dark:border-[#333] rounded-xl px-3.5 py-2.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-orange-600"
                      />
                    </div>

                    {!otpSent ? (
                      <button
                        onClick={handleSendOTP}
                        disabled={otpLoading || !guestEmail || !guestName}
                        className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center space-x-1.5"
                      >
                        {otpLoading ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        <span>Send 6-Digit Verification Code</span>
                      </button>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <OtpInputBoxes
                          value={otpCode}
                          onChange={setOtpCode}
                          disabled={otpLoading}
                        />
                        <button
                          onClick={handleVerifyOTP}
                          disabled={otpLoading || otpCode.length < 6}
                          className="w-full py-3 bg-[#E85D2A] hover:bg-[#D94E1B] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
                        >
                          {otpLoading ? 'Verifying...' : 'Verify Code'}
                        </button>
                        <div className="text-right">
                          <button
                            onClick={handleSendOTP}
                            disabled={cooldown > 0 || otpLoading}
                            className="text-[10px] text-orange-600 hover:underline font-bold disabled:text-gray-400 cursor-pointer"
                          >
                            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/40 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-gray-900 dark:text-white font-bold block">{guestName || 'Customer'}</strong>
                      <span className="text-gray-500 dark:text-gray-400 text-[11px]">{guestEmail}</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-1 rounded-lg">
                      Ready to Order
                    </span>
                  </div>
                )}
              </div>

              {/* Payment Method Card */}
              <div className="bg-white dark:bg-[#1F1F1F] border border-[#E7E5E4] dark:border-[#333] rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 dark:text-[#A8A29E]">Payment Option</h3>
                
                {!paymentSettings.codEnabled && !paymentSettings.onlineEnabled ? (
                  <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-semibold flex items-center space-x-2.5 shadow-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
                    <div>
                      <strong className="block font-bold">Kitchen Closed</strong>
                      <span>Sorry, we're not accepting orders at the moment. The kitchen is currently closed. Please try again later.</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={!paymentSettings.codEnabled}
                        onClick={() => { if (paymentSettings.codEnabled) setPaymentMethod('COD'); }}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                          !paymentSettings.codEnabled
                            ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-[#262626] border-gray-200 dark:border-[#333]'
                            : paymentMethod === 'COD'
                            ? 'border-orange-600 bg-orange-50/50 dark:bg-orange-950/40 ring-2 ring-orange-600/10 cursor-pointer'
                            : 'border-gray-200 dark:border-[#333] hover:border-gray-300 dark:hover:border-[#404040] cursor-pointer'
                        }`}
                      >
                        <Banknote className={`w-5 h-5 ${paymentMethod === 'COD' && paymentSettings.codEnabled ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}`} />
                        <div className="mt-3">
                          <strong className="text-xs font-bold block text-gray-900 dark:text-white">Pay at Counter</strong>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {paymentSettings.codEnabled ? 'Cash on Delivery' : 'Unavailable'}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={!paymentSettings.onlineEnabled}
                        onClick={() => { if (paymentSettings.onlineEnabled) setPaymentMethod('Easypaisa'); }}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                          !paymentSettings.onlineEnabled
                            ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-[#262626] border-gray-200 dark:border-[#333]'
                            : paymentMethod !== 'COD'
                            ? 'border-orange-600 bg-orange-50/50 dark:bg-orange-950/40 ring-2 ring-orange-600/10 cursor-pointer'
                            : 'border-gray-200 dark:border-[#333] hover:border-gray-300 dark:hover:border-[#404040] cursor-pointer'
                        }`}
                      >
                        <Smartphone className={`w-5 h-5 ${paymentMethod !== 'COD' && paymentSettings.onlineEnabled ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}`} />
                        <div className="mt-3">
                          <strong className="text-xs font-bold block text-gray-900 dark:text-white">Online Payment</strong>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {paymentSettings.onlineEnabled ? 'Easypaisa / JazzCash' : 'Unavailable'}
                          </span>
                        </div>
                      </button>
                    </div>

                    {!paymentSettings.codEnabled && paymentSettings.onlineEnabled && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl text-[11px] font-medium flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>Sorry, Pay at Counter is currently unavailable. Please choose Online Payment to continue.</span>
                      </div>
                    )}

                    {paymentSettings.codEnabled && !paymentSettings.onlineEnabled && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl text-[11px] font-medium flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                        <span>Sorry, Online Payment is currently unavailable. Please choose Pay at Counter to continue.</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Order Summary & Placement Button */}
              <div className="bg-white dark:bg-[#1F1F1F] border border-[#E7E5E4] dark:border-[#333] rounded-3xl p-6 shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 dark:text-[#A8A29E]">Order Summary</h3>
                
                <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>Rs. {getTotal()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Service / GST:</span>
                    <span>Rs. 0.00</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-gray-900 dark:text-white border-t border-gray-100 dark:border-[#333] pt-3">
                    <span>Grand Total:</span>
                    <span className="text-orange-600 dark:text-orange-400 text-base">Rs. {getTotal()}</span>
                  </div>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={
                    placingOrder ||
                    (!paymentSettings.codEnabled && !paymentSettings.onlineEnabled) ||
                    (paymentMethod === 'COD' && !paymentSettings.codEnabled) ||
                    (paymentMethod !== 'COD' && !paymentSettings.onlineEnabled)
                  }
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-2xl shadow-xl shadow-orange-600/20 transition-all cursor-pointer flex items-center justify-center space-x-2"
                >
                  {placingOrder ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      <span>Placing Order...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm &amp; Place Order</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* Online Wallet Payment Modal */}
      {showOnlinePaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1F1F1F] rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 dark:border-[#333] space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-[#333] pb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white">Mobile Wallet Payment</h3>
                <span className="text-[10px] text-gray-400 dark:text-[#A8A29E]">Fast &amp; Instant Authorization</span>
              </div>
              <button
                onClick={() => setShowOnlinePaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setWalletProvider('Easypaisa')}
                  className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    walletProvider === 'Easypaisa'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-600/20'
                      : 'border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300'
                  }`}
                >
                  Easypaisa
                </button>
                <button
                  onClick={() => setWalletProvider('JazzCash')}
                  className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    walletProvider === 'JazzCash'
                      ? 'border-red-600 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 ring-2 ring-red-600/20'
                      : 'border-gray-200 dark:border-[#333] text-gray-600 dark:text-gray-300'
                  }`}
                >
                  JazzCash
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300 block mb-1">Registered Account Mobile #</label>
                <PhoneInput
                  value={walletPhone}
                  onChange={setWalletPhone}
                />
              </div>

              <div className="p-3.5 bg-gray-50 dark:bg-[#262626] rounded-xl flex justify-between items-center text-xs font-bold">
                <span className="text-gray-600 dark:text-gray-300">Total Payable:</span>
                <span className="text-orange-600 dark:text-orange-400 text-sm">Rs. {getTotal()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowOnlinePaymentModal(false)}
                className="py-3 bg-gray-100 dark:bg-[#333] hover:bg-gray-200 dark:hover:bg-[#404040] text-gray-700 dark:text-gray-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleWalletPaymentConfirm}
                disabled={authorizingPayment}
                className="py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center space-x-1.5"
              >
                {authorizingPayment ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>Authorizing...</span>
                  </>
                ) : (
                  <span>Pay Now</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerCartPage;
