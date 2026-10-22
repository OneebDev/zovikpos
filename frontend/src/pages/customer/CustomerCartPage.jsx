import  { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { resolveBackendUrl } from '../../services/api';
import { connectSocket, getSocket } from '../../services/socket';
import { getETAPrediction } from '../../services/etaService';
import { OtpInputBoxes } from '../../components/CustomerDashboard';
import PhoneInput from '../../components/PhoneInput';
import { paymentMethodLabel } from '../../utils/paymentMethods';
import { resolveTableLabel } from '../../utils/customerTableLabel';
import { formatPrice } from '../../utils/formatPrice';
import { clearIdempotencyKey, getOrCreateIdempotencyKey } from '../../utils/idempotencyKey';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import ModalShell from '../../components/ui/ModalShell';
import './CustomerCartPage.css';
import {
  ArrowLeft,
  ShoppingBag,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Banknote,
  Check,
  Wallet,
  X,
  RotateCcw,
  CreditCard,
  Lock,
  Sparkles,
} from 'lucide-react';

const CustomerCartPage = ({ user }) => {
  const navigate = useNavigate();

  // ─── Online Mobile Wallet Payment Modal state ────────────────────────────
  const [showOnlinePaymentModal, setShowOnlinePaymentModal] = useState(false);
  const [walletProvider, setWalletProvider] = useState('Easypaisa');
  const [walletPhone, setWalletPhone] = useState('');
  const [authorizingPayment, setAuthorizingPayment] = useState(false);
  const closeWalletModal = useCallback(() => setShowOnlinePaymentModal(false), []);
  const walletPhoneDigits = (walletPhone || '')
    .replace(/[\s-]/g, '')
    .replace(/^\+?92/, '')
    .replace(/^0/, '')
    .replace(/\D/g, '');
  const isWalletPhoneValid = walletPhoneDigits.length === 10;

  // ─── Persistent cart state ────────────────────────────────────────────────
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('customer_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [tableId] = useState(() => localStorage.getItem('customer_tableId') || sessionStorage.getItem('customer_tableId') || '');
  const displayTableLabel = resolveTableLabel({
    sessionLabel: tableId,
    qrToken: localStorage.getItem('customer_tableToken'),
    lastValidLabel: tableId,
    forCustomer: true,
  });
  const [sessionId] = useState(() => localStorage.getItem('customer_sessionId') || sessionStorage.getItem('customer_sessionId') || '');
  // Render the saved cart immediately when it has a session ID; validate in the background.
  const [tableSessionReady, setTableSessionReady] = useState(() => Boolean(sessionId));
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);
  const [tableSessionError, setTableSessionError] = useState('');
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0);
  const [error, setError] = useState('');
  const cartEtaKey = JSON.stringify(Object.values(cart).map(item => [item.id, item.quantity, item.unit || '', item.price]));

  // ─── ETA / Kitchen Load ───────────────────────────────────────────────────
  const [etaInfo, setEtaInfo] = useState(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaResolvedCartKey, setEtaResolvedCartKey] = useState('');
  const [etaFailedCartKey, setEtaFailedCartKey] = useState('');
  const [showAllCartItems, setShowAllCartItems] = useState(false);

  // ─── Safely fetch stored customer identity (ignoring staff accounts like Demo Kitchen) ───
  const getStoredCustomerUser = () => {
    try {
      const savedCustomer = localStorage.getItem('customer_user') || sessionStorage.getItem('customer_user');
      if (savedCustomer) {
        const u = JSON.parse(savedCustomer);
        if (u && (!u.role || u.role === 'CUSTOMER')) return u;
      }
    } catch  { /* Optional storage or parsing failure. */ }

    try {
      const savedUser = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u && (!u.role || u.role === 'CUSTOMER')) return u;
      }
    } catch  { /* Optional storage or parsing failure. */ }

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

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (active) setTableSessionError('The table service did not respond. Check your connection and retry.');
      if (active) setSessionCheckComplete(true);
    }, 8000);
    const requirePhysicalSession = async () => {
      if (!sessionId) {
        window.clearTimeout(timeout);
        navigate('/customer', { replace: true });
        return;
      }
      try {
        const response = await api.get(`/sessions/${sessionId}`, { signal: controller.signal });
        if (!active || timedOut) return;
        const session = response.data?.session;
        if (!session || session.status !== 'ACTIVE' || !session.tableId || !session.table?.isActive) {
          setTableSessionError('Your table session needs to reconnect. Your cart has been kept.');
          setSessionCheckComplete(true);
          return;
        }
        setTableSessionError('');
        setTableSessionReady(true);
        setSessionCheckComplete(true);
      } catch (sessionError) {
        if (!active || timedOut || sessionError.name === 'CanceledError' || sessionError.name === 'AbortError') return;
        setTableSessionError(sessionError.response?.data?.error || 'Could not verify your table session. Your cart has been kept.');
        setSessionCheckComplete(true);
      } finally {
        window.clearTimeout(timeout);
      }
    };
    requirePhysicalSession();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [sessionId, navigate, sessionCheckAttempt]);

  // ─── Payment / checkout ───────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState(
    () => paymentMethodLabel(localStorage.getItem('customer_paymentMethod'))
  );
  const [paymentSettings, setPaymentSettings] = useState({ codEnabled: true, onlineEnabled: true });
  const [placingOrder, setPlacingOrder] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  const [checkoutDone, setCheckoutDone] = useState(false);
  const receiptTableLabel = resolveTableLabel({
    tableLabel: activeOrder?.tableLabel,
    tableNumber: activeOrder?.tableNumber,
    table: activeOrder?.table,
    sessionLabel: displayTableLabel,
    forCustomer: true,
  });

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

  // ─── Refresh ETA after cart changes; retry transient failures automatically ──
  useEffect(() => {
    const itemsList = JSON.parse(cartEtaKey).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (!itemsList.length) {
      setEtaInfo(null);
      setEtaLoading(false);
      setEtaResolvedCartKey('');
      setEtaFailedCartKey('');
      return undefined;
    }

    let cancelled = false;
    let retryTimer;
    let timeout;
    let requestController;
    let attempt = 0;
    setEtaLoading(true);
    setEtaFailedCartKey('');

    const fetchEstimate = () => {
      if (cancelled) return;
      requestController = new AbortController();
      timeout = setTimeout(() => requestController?.abort(), 8000);
      getETAPrediction(itemsList, { signal: requestController.signal })
        .then(data => {
          if (!cancelled && !requestController.signal.aborted) {
            attempt = 0;
            setEtaInfo(data);
            setEtaResolvedCartKey(cartEtaKey);
            setEtaFailedCartKey('');
            setEtaLoading(false);
          }
        })
        .catch(err => {
          if (cancelled) return;
          if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
            console.warn('ETA request failed; retrying automatically:', err?.message || err);
          }
          setEtaLoading(false);
          setEtaFailedCartKey(cartEtaKey);
          const retryDelays = [2000, 5000, 10000];
          const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
          attempt += 1;
          retryTimer = setTimeout(fetchEstimate, delay);
        })
        .finally(() => {
          clearTimeout(timeout);
        });
    };

    const debounceTimer = setTimeout(fetchEstimate, 400);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
      clearTimeout(timeout);
      requestController?.abort();
    };
  }, [cartEtaKey]);

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
  const etaIsPending = totalQty > 0 && (etaLoading || (etaResolvedCartKey !== cartEtaKey && etaFailedCartKey !== cartEtaKey));
  const cartItems = Object.values(cart);
  const visibleCartItems = showAllCartItems || cartItems.length <= 4 ? cartItems : cartItems.slice(0, 3);

  const getItemImage = item => {
    if (item?.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim() !== '') {
      const url = item.imageUrl.trim();
      if (url.startsWith('/uploads/')) {

        return `${resolveBackendUrl()}${url}`;
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
    const orderPayload = {
      items,
      tableId,
      sessionId,
      paymentMethod: overrideMethod || paymentMethod,
      paymentStatus: Boolean(overrideTxId) ? 'PENDING_VERIFICATION' : 'UNPAID',
      paymentTxId: overrideTxId || null,
      status: overrideTxId ? 'PAYMENT_PENDING' : 'PENDING',
      customerEmail: guestEmail || user?.email,
      emailVerified: true,
    };
    const idempotencyKey = getOrCreateIdempotencyKey('customer_order_attempt', orderPayload);
    try {
      const response = await api.post('/orders', orderPayload, { headers: { 'Idempotency-Key': idempotencyKey } });
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
      clearIdempotencyKey('customer_order_attempt', idempotencyKey);
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
    if (!tableSessionReady || !sessionCheckComplete || tableSessionError) {
      setError('Your table session is still being verified. Retry the session check before placing your order.');
      return;
    }
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

  if (!tableSessionReady) {
    return (
      <div className="customer-cart-page customer-cart-page--checking-session" role="status" aria-live="polite">
        {tableSessionError ? (
          <div className="customer-cart-page__session-error" role="alert">
            <AlertCircle aria-hidden="true" />
            <p>{tableSessionError}</p>
            <button type="button" onClick={() => setSessionCheckAttempt((attempt) => attempt + 1)}>
              <RotateCcw aria-hidden="true" /> Retry
            </button>
            <button type="button" onClick={() => navigate('/customer')}>Back to menu</button>
          </div>
        ) : (
          <>
            <Skeleton className="customer-cart-page__session-skeleton" />
            <p>Checking your table session…</p>
          </>
        )}
      </div>
    );
  }

  // ─── If checkout is completed, render confirmation and track button ──────
  if (checkoutDone && activeOrder) {
    return (
      <div className="customer-cart-page customer-cart-confirmation">
        <div className="customer-cart-confirmation__card">

          {/* Celebratory Checkmark Icon */}
          <div className="customer-cart-confirmation__icon">
            <CheckCircle2 />
          </div>

          <div>
            <h2 className="customer-cart-confirmation__title">Order confirmed</h2>
            <h1 className="customer-cart-confirmation__number">
              {activeOrder.orderNumber || `#000${activeOrder.id}`}
            </h1>
            <p className="customer-cart-confirmation__message">
              <strong>{receiptTableLabel}</strong>
            </p>
          </div>

          {/* Receipt Breakdown Card */}
          <div className="customer-cart-confirmation__receipt">
            <div>
              <span>Estimated time</span>
              <strong className="customer-cart-confirmation__eta">
                ~{activeOrder.etaPrediction?.adjustedEta ? Math.round(activeOrder.etaPrediction.adjustedEta) : 10} min
              </strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>
                {paymentMethodLabel(activeOrder.paymentMethod)}{' '}
                <span className={`customer-cart-payment-status${activeOrder.paymentStatus === 'PAID' ? ' is-paid' : ' is-unpaid'}`}>
                  {activeOrder.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}
                </span>
              </strong>
            </div>
            <div className="customer-cart-confirmation__total">
              <span>Order Total</span>
              <span>{formatPrice(activeOrder.total || 0)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="customer-cart-confirmation__actions">
            <button
              onClick={() => navigate(`/customer/track/${activeOrder.trackingToken || activeOrder.id}`)}
              className="customer-cart-action"
            >
              <span>Track order</span>
            </button>
            <button
              onClick={() => navigate('/customer')}
              className="customer-cart-action customer-cart-action--secondary"
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
    <div className="customer-cart-page responsive-shell w-full min-h-screen flex flex-col">
      {/* HEADER */}
      <header className="customer-cart-header glass">
        <div className="customer-cart-header__identity">
          <button
            onClick={() => navigate('/customer')}
            aria-label="Back to menu"
            className="customer-cart-back icon-btn icon-btn--44 pressable"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1>Your Cart</h1>
            <span>{receiptTableLabel} · {totalQty} {totalQty === 1 ? 'item' : 'items'}</span>
          </div>
        </div>

        {totalQty > 0 && (
          <button
            onClick={clearCart}
            className="customer-cart-clear pressable"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </header>

      <main className="customer-cart-content flex-1 w-full mx-auto">
        {tableSessionError && (
          <div className="customer-cart-error customer-cart-error--session" role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{tableSessionError}</span>
            <button type="button" onClick={() => setSessionCheckAttempt((attempt) => attempt + 1)}>
              <RotateCcw aria-hidden="true" /> Retry
            </button>
          </div>
        )}
        {/* Error Alert */}
        {error && (
            <div className="customer-cart-error">
            <AlertCircle aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {totalQty === 0 ? (
          <div className="customer-cart-empty">
            <div className="customer-cart-empty__icon">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h2>Your cart is empty</h2>
            <p>
              Explore our fresh delicious canteen menu and add items to get started.
            </p>
            <button
              onClick={() => navigate('/customer')}
              className="customer-cart-browse"
            >
              Browse menu
            </button>
          </div>
        ) : (
          <div className="customer-cart-layout">
            {/* Left: Cart Items List */}
            <div className="customer-cart-items-column">
              <h2 className="customer-cart-section-title"><span>Your items</span><span className="customer-cart-count">{totalQty}</span></h2>

              <div className="customer-cart-rows">
                {visibleCartItems.map((item) => (
                  <div
                    key={item.id}
                    className="customer-cart-row"
                  >
                    <div className="customer-cart-row__info flex items-center min-w-0 flex-1">
                      <img
                        src={getItemImage(item)}
                        alt={item.name}
                        className="customer-cart-row__image"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="customer-cart-row__title">{item.name}</h3>
                          {item.unit && item.unit !== 'per portion' && item.unit !== 'Full' && (
                            <span className="customer-cart-variant-chip">
                              {item.unit}
                            </span>
                          )}
                        </div>
                        <span className="customer-cart-unit-price">
                          {formatPrice(item.price)} each
                        </span>
                      </div>
                    </div>
                      <div className="customer-cart-row__controls">
                        <strong className="customer-cart-line-total">{formatPrice(item.price * item.quantity)}</strong>
                        <div className="customer-cart-stepper">
                          <button type="button" onClick={() => removeOneFromCart(item.id)} aria-label={`Remove one ${item.name}`} className="pressable">{item.quantity === 1 ? <Trash2 aria-hidden="true" /> : '−'}</button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => addToCart(item)} aria-label={`Add one ${item.name}`} className="pressable">+</button>
                        </div>
                        {item.quantity > 1 && <button type="button" onClick={() => deleteFromCart(item.id)} aria-label={`Remove ${item.name} from cart`} className="customer-cart-remove icon-btn icon-btn--44 pressable"><Trash2 /></button>}
                      </div>
                  </div>
                ))}
              </div>
              {/* AI ETA Card */}
              <section className="customer-cart-eta" aria-busy={etaLoading} aria-label="Estimated order time">
                <div className="customer-cart-eta__heading">
                  <div className="customer-cart-eta__label"><span className="customer-cart-eta__icon"><Sparkles /></span><span>Estimated time</span></div>
                  {etaLoading && <span className="customer-cart-eta__loading-label">Calculating...</span>}
                </div>
                <div className="customer-cart-eta__body" aria-live="polite" aria-atomic="true">
                  {etaIsPending ? (
                    <div className="customer-cart-eta__state customer-cart-eta__state--loading" role="status">
                      <Skeleton width="44%" height="28px" />
                      <Skeleton width="76%" height="10px" />
                    </div>
                  ) : etaFailedCartKey === cartEtaKey || etaResolvedCartKey !== cartEtaKey || !etaInfo ? (
                    <div className="customer-cart-eta__state customer-cart-eta__state--error" role="status">
                      <span>Estimate unavailable</span>
                      <span className="customer-cart-eta__auto-retry">Updating automatically</span>
                    </div>
                  ) : (() => {
                    const level = String(etaInfo.kitchenLoad || '').toLowerCase();
                    const descriptions = {
                      low: 'Kitchen is quiet right now.',
                      medium: 'Kitchen is moderately busy.',
                      high: 'Kitchen is busy, thanks for your patience.',
                    };
                    const validLevel = Object.prototype.hasOwnProperty.call(descriptions, level);
                    return (
                      <div className="customer-cart-eta__state customer-cart-eta__state--result">
                        <strong className="customer-cart-eta__time" aria-live="polite" aria-atomic="true">~{etaInfo.estimatedTime} min</strong>
                        <p className="customer-cart-eta__queue" aria-live="polite">
                          {Number(etaInfo.queueLength) > 0
                            ? `${etaInfo.queueLength} ${Number(etaInfo.queueLength) === 1 ? 'order' : 'orders'} ahead · Your order should be ready in about ${etaInfo.estimatedTime} minutes.`
                            : `No active orders ahead · Your order should be ready in about ${etaInfo.estimatedTime} minutes.`}
                        </p>
                        {validLevel ? (
                          <>
                            <div className={`customer-cart-workload customer-cart-workload--${level}`} aria-label={`Kitchen workload: ${level}`}>
                              <div className="customer-cart-workload__segments" aria-hidden="true"><span /><span /><span /></div>
                              <span>{level[0].toUpperCase() + level.slice(1)} kitchen workload</span>
                            </div>
                            <p className="customer-cart-eta__description">{descriptions[level]}</p>
                          </>
                        ) : <p className="customer-cart-eta__description">Kitchen workload is unavailable.</p>}
                        {etaInfo.explanation && <details className="customer-cart-eta__details"><summary>Details</summary><p>{etaInfo.explanation}</p></details>}
                      </div>
                    );
                  })()}
                </div>
              </section>
            </div>

            {/* Right: Checkout & Verification Panel */}
            <div className="customer-cart-checkout-column">

              {/* Customer Verification Card */}
              <div className="customer-cart-customer-card">
                {!otpVerified && <div className="customer-cart-card-heading"><h3>Your details</h3></div>}

                {!otpVerified ? (
                    <div className="customer-cart-verification-form">
                    <p className="customer-cart-verify-note">Verify your email to place your order.</p>
                    <div>
                      <label className="customer-cart-field-label">Your Full Name</label>
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="John Doe"
                        className="customer-cart-field"
                      />
                    </div>
                    <div>
                      <label className="customer-cart-field-label">Email (for receipts &amp; updates)</label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="john@example.com"
                        className="customer-cart-field"
                      />
                    </div>

                    {!otpSent ? (
                      <Button
                        onClick={handleSendOTP}
                        disabled={otpLoading || !guestEmail || !guestName}
                        loading={otpLoading}
                        className="customer-cart-action customer-cart-action--full"
                      >
                        <Lock className="w-4 h-4" />
                        <span>Send verification code</span>
                      </Button>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div className={`customer-cart-otp${error ? ' has-error' : ''}`}>
                          <OtpInputBoxes
                            value={otpCode}
                            onChange={setOtpCode}
                            disabled={otpLoading}
                          />
                        </div>
                        <Button
                          onClick={handleVerifyOTP}
                          disabled={otpLoading || otpCode.length < 6}
                          loading={otpLoading}
                          className="customer-cart-action customer-cart-action--full"
                        >
                          Verify Code
                        </Button>
                        <div className="text-right">
                          <button
                            onClick={handleSendOTP}
                            disabled={cooldown > 0 || otpLoading}
                            className="customer-cart-resend"
                          >
                            {cooldown > 0 ? (
                              <>
                                <svg className="customer-cart-resend__ring" viewBox="0 0 24 24" aria-hidden="true">
                                  <circle cx="12" cy="12" r="9" />
                                  <circle
                                    className="customer-cart-resend__progress"
                                    cx="12"
                                    cy="12"
                                    r="9"
                                    style={{ strokeDashoffset: 56.55 * (1 - (cooldown / 30)) }}
                                  />
                                </svg>
                                <span>Resend in 0:{String(cooldown).padStart(2, '0')}</span>
                              </>
                            ) : 'Resend OTP'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="customer-cart-verified">
                    <span className="customer-cart-avatar">{(guestName || 'C').trim().charAt(0).toUpperCase()}</span>
                    <div className="customer-cart-verified__identity">
                      <strong>{guestName || 'Customer'}</strong>
                      <span title={guestEmail}>{guestEmail}</span>
                    </div>
                    <span className="customer-cart-verified__badge"><Check aria-hidden="true" />Verified</span>
                  </div>
                )}
              </div>

              {/* Payment Method Card */}
              <div className="customer-cart-payment-panel">
                <h3 className="customer-cart-section-title">Payment method</h3>

                {!paymentSettings.codEnabled && !paymentSettings.onlineEnabled ? (
                  <div className="customer-cart-payment-alert">
                    <AlertCircle />
                    <div>
                      <strong className="block font-bold">Kitchen Closed</strong>
                      <span>Sorry, we're not accepting orders at the moment. The kitchen is currently closed. Please try again later.</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="customer-cart-payment-options" role="radiogroup" aria-label="Payment method">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={paymentMethod === 'COD'}
                        aria-label="Pay at Counter"
                        disabled={!paymentSettings.codEnabled}
                        onClick={() => { if (paymentSettings.codEnabled) setPaymentMethod('COD'); }}
                        className="customer-cart-payment-card pressable"
                      >
                        <span className="customer-cart-payment-icon"><Banknote /></span>
                        <span className="customer-cart-payment-copy">
                          <strong>Pay at Counter</strong>
                        <span>{paymentSettings.codEnabled ? 'Pay with cash at the counter' : 'Unavailable'}</span>
                        </span>
                        <span className="customer-cart-radio" aria-hidden="true">{paymentMethod === 'COD' && <Check />}</span>
                      </button>

                      <button
                        type="button"
                        role="radio"
                        aria-checked={paymentMethod !== 'COD'}
                        aria-label="Online Payment"
                        disabled={!paymentSettings.onlineEnabled}
                        onClick={() => { if (paymentSettings.onlineEnabled) setPaymentMethod('Easypaisa'); }}
                        className="customer-cart-payment-card pressable"
                      >
                        <span className="customer-cart-payment-icon"><CreditCard /></span>
                        <span className="customer-cart-payment-copy">
                          <strong>Online Payment</strong>
                          {paymentSettings.onlineEnabled ? <span className="customer-cart-wallet-chips"><i>Easypaisa</i><i>JazzCash</i></span> : <span>Unavailable</span>}
                        </span>
                        <span className="customer-cart-radio" aria-hidden="true">{paymentMethod !== 'COD' && <Check />}</span>
                      </button>
                    </div>

                    {!paymentSettings.codEnabled && paymentSettings.onlineEnabled && (
                      <div className="customer-cart-payment-alert">
                        <AlertCircle />
                        <span>Sorry, Pay at Counter is currently unavailable. Please choose Online Payment to continue.</span>
                      </div>
                    )}

                    {paymentSettings.codEnabled && !paymentSettings.onlineEnabled && (
                      <div className="customer-cart-payment-alert">
                        <AlertCircle />
                        <span>Sorry, Online Payment is currently unavailable. Please choose Pay at Counter to continue.</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Order Summary & Placement Button */}
              <div className="customer-cart-summary">
                <h3>Order Summary</h3>

                <div className="customer-cart-bill">
                  <div className="customer-cart-summary-lines">
                    {(showAllCartItems || cartItems.length <= 4 ? cartItems : cartItems.slice(0, 3)).map((item) => (
                      <div className="customer-cart-summary-line" key={`summary-${item.id}`}>
                        <span className="customer-cart-summary-line__name">
                          <strong>{item.quantity} × {item.name}</strong>
                          {item.unit && item.unit !== 'per portion' && item.unit !== 'Full' && <small>{item.unit}</small>}
                        </span>
                        <span className="customer-cart-summary-line__amount">{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  {cartItems.length > 4 && (
                    <button type="button" className="customer-cart-show-all" aria-expanded={showAllCartItems} onClick={() => setShowAllCartItems(show => !show)}>
                      {showAllCartItems ? 'Show fewer items' : `Show all (${cartItems.length})`}
                    </button>
                  )}
                  <div className="customer-cart-bill__total">
                    <span>Total</span>
                    <span key={getTotal()} className="customer-cart-total-number">{formatPrice(getTotal())}</span>
                  </div>
                </div>

                <div className="customer-cart-summary__desktop-action">
                  <Button
                    onClick={handlePlaceOrder}
                    disabled={
                      !tableSessionReady || !sessionCheckComplete || Boolean(tableSessionError) ||
                      placingOrder ||
                      (!paymentSettings.codEnabled && !paymentSettings.onlineEnabled) ||
                      (paymentMethod === 'COD' && !paymentSettings.codEnabled) ||
                      (paymentMethod !== 'COD' && !paymentSettings.onlineEnabled)
                    }
                    loading={placingOrder}
                    className="customer-cart-action customer-cart-action--place"
                  >
                    <span>Place Order</span>
                  </Button>
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {totalQty > 0 && (
        <div className="customer-cart-mobile-bar glass" role="region" aria-label="Order total and checkout">
          <div className="customer-cart-mobile-bar__total"><span>Total</span><strong key={getTotal()} className="customer-cart-total-number">{formatPrice(getTotal())}</strong></div>
          <Button
            onClick={handlePlaceOrder}
            disabled={
              !tableSessionReady || !sessionCheckComplete || Boolean(tableSessionError) ||
              placingOrder ||
              (!paymentSettings.codEnabled && !paymentSettings.onlineEnabled) ||
              (paymentMethod === 'COD' && !paymentSettings.codEnabled) ||
              (paymentMethod !== 'COD' && !paymentSettings.onlineEnabled)
            }
            loading={placingOrder}
            className="customer-cart-action customer-cart-action--place"
          >Place Order</Button>
        </div>
      )}

      {/* Online Wallet Payment Modal */}
      <ModalShell
        isOpen={showOnlinePaymentModal}
        onClose={closeWalletModal}
        labelledBy="customer-wallet-title"
        closeOnBackdrop={false}
        closeOnEscape={false}
        className="customer-cart-wallet-modal"
      >
        <header className="customer-cart-wallet-modal__header">
          <span className="customer-cart-wallet-modal__heading-icon" aria-hidden="true"><Wallet /></span>
          <div className="customer-cart-wallet-modal__heading-copy">
            <h3 id="customer-wallet-title">Mobile wallet payment</h3>
            <p>Pay securely with your mobile account</p>
          </div>
          <button
            type="button"
            onClick={closeWalletModal}
            aria-label="Close mobile wallet payment"
            className="customer-cart-wallet-close icon-btn icon-btn--40"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="customer-cart-wallet-modal__body">
          <div className="customer-cart-wallet-providers" role="radiogroup" aria-label="Choose a mobile wallet">
            {['Easypaisa', 'JazzCash'].map((provider) => (
              <label
                key={provider}
                className={`customer-cart-wallet-provider${walletProvider === provider ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="customer-wallet-provider"
                  value={provider}
                  checked={walletProvider === provider}
                  onChange={() => setWalletProvider(provider)}
                />
                <span className="customer-cart-wallet-provider__icon" aria-hidden="true"><Wallet /></span>
                <span className="customer-cart-wallet-provider__name">{provider}</span>
                {walletProvider === provider && <Check className="customer-cart-wallet-provider__check" aria-hidden="true" />}
              </label>
            ))}
          </div>

          <div
            className={`customer-cart-wallet-phone-field${isWalletPhoneValid ? ' is-valid' : ' is-invalid'}`}
            data-touched="false"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.dataset.touched = 'true';
            }}
          >
            <label className="customer-cart-field-label">Account mobile number</label>
            <div className="customer-cart-wallet-phone" aria-invalid={!isWalletPhoneValid}>
              <PhoneInput
                value={walletPhone}
                onChange={setWalletPhone}
                placeholder="3XX XXXXXXX"
                className="customer-cart-wallet-phone-input"
              />
            </div>
            <p className="customer-cart-wallet-error" aria-live="polite">Enter a 10-digit mobile number</p>
          </div>

          <div className="customer-cart-wallet-total">
            <span>Total payable</span>
            <span>{formatPrice(getTotal())}</span>
          </div>

          <p className="customer-cart-wallet-trust"><Lock aria-hidden="true" />Your payment is processed securely.</p>
        </div>

        <div className="customer-cart-wallet-modal__actions">
          <button
            type="button"
            onClick={handleWalletPaymentConfirm}
            disabled={authorizingPayment || !isWalletPhoneValid}
            className="customer-cart-action customer-cart-wallet-confirm"
          >
            {authorizingPayment ? (
              <>
                <RotateCcw className="customer-cart-wallet-spinner" aria-hidden="true" />
                <span>Authorizing...</span>
              </>
            ) : (
              <span>Pay {formatPrice(getTotal())}</span>
            )}
          </button>
          <button
            type="button"
            onClick={closeWalletModal}
            className="customer-cart-wallet-cancel"
          >
            Cancel
          </button>
        </div>
      </ModalShell>
    </div>
  );
};

export default CustomerCartPage;
