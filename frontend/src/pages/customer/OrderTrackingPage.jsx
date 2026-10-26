import ThemedSelect from '../../components/common/ThemedSelect';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import Button from '../../components/ui/Button';
import { resolveTableLabel } from '../../utils/customerTableLabel';
import { formatPrice } from '../../utils/formatPrice';
import './OrderTrackingPage.css';
import {

  CheckCircle2,
  AlertCircle,
  Utensils,
  ArrowLeft,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  MapPin,
  Check,
  Download,
  Bell,
} from 'lucide-react';

const OrderTrackingPage = () => {
  const { trackingToken } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const displayTableLabel = resolveTableLabel({
    tableLabel: order?.tableLabel,
    tableNumber: order?.tableNumber,
    table: order?.table,
  });
  const orderId = order?.id;
  const orderStatus = order?.status;
  const orderCreatedAt = order?.createdAt;
  const orderAdjustedEta = order?.etaPrediction?.adjustedEta;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orderNotFound, setOrderNotFound] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const updateConnection = () => setSocketConnected(Boolean(socket.connected));
    updateConnection();
    socket.on('connect', updateConnection);
    socket.on('disconnect', updateConnection);
    return () => {
      socket.off('connect', updateConnection);
      socket.off('disconnect', updateConnection);
    };
  }, []);

  // Table Change State
  const [availableTables, setAvailableTables] = useState([]);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [targetTable, setTargetTable] = useState('');
  const [tableUpdateLoading, setTableUpdateLoading] = useState(false);
  const [tableUpdateSuccess, setTableUpdateSuccess] = useState('');

  // Fetch the order over HTTP first; bound the initial wait so a stalled request cannot leave an endless skeleton.
  useEffect(() => {
    let isMounted = true;
    let timedOut = false;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setOrderNotFound(false);
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      if (isMounted) {
        setError('Order details are taking too long to load. Please try again.');
        setLoading(false);
      }
      controller.abort();
    }, 8000);

    const fetchOrder = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const isPaymentSuccess = searchParams.get('payment') === 'success';
        const isPaymentCancelled = searchParams.get('payment') === 'cancelled';

        // If returned from PayFast with success, auto-verify immediately so local/hosted orders become PAID with zero cashier intervention
        if (isPaymentSuccess) {
          try {
            await api.post(`/payments/payfast/return/${encodeURIComponent(trackingToken)}?payment=success`);
          } catch (retErr) {
            console.warn('PayFast return verify notice:', retErr?.response?.data?.message || retErr.message);
          }
        } else if (isPaymentCancelled) {
          // If customer cancelled at PayFast checkout, auto-reject order so it clears from cashier queue
          try {
            await api.post(`/payments/payfast/return/${encodeURIComponent(trackingToken)}?payment=cancelled`);
          } catch (retErr) {
            console.warn('PayFast cancel notify notice:', retErr?.response?.data?.message || retErr.message);
          }
        }

        const res = await api.get(`/orders/track/${encodeURIComponent(trackingToken)}`, { signal: controller.signal });
        if (isMounted && !timedOut) {
          if (!res.data?.order) throw new Error('Order tracking details not found.');
          setOrder(res.data.order);
          setTargetTable(res.data.order?.tableNumber || '');
          setOrderNotFound(false);
        }
      } catch (err) {
        if (isMounted && !timedOut && err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
          console.error('Tracking fetch error:', err);
          setOrderNotFound(err.response?.status === 404);
          setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Order tracking details not found.');
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (isMounted && !timedOut) setLoading(false);
      }
    };

    fetchOrder();

    api.get('/tables/active').then(r => {
      if (isMounted && r.data?.tables) setAvailableTables(r.data.tables);
    }).catch(() => { });

    return () => { isMounted = false; controller.abort(); window.clearTimeout(timeoutId); };
  }, [trackingToken, retryAttempt]);

  // Real-time socket updates — modifies order state directly WITHOUT triggering loading spinner or flickering
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !orderId || orderStatus === 'COMPLETED') return undefined;

    let pollController = null;
    let pollInFlight = false;
    const updateConnection = () => setSocketConnected(Boolean(socket.connected));

    const handleUpdate = (updatedOrder) => {
      if (updatedOrder && (updatedOrder.id === orderId || updatedOrder.trackingToken === trackingToken)) {
        setOrder(updatedOrder);
      }
    };

    const fetchLatestOrder = async () => {
      if (pollInFlight) return;
      pollInFlight = true;
      pollController = new AbortController();
      const pollTimeoutId = window.setTimeout(() => pollController?.abort(), 8000);
      try {
        const res = await api.get(`/orders/track/${encodeURIComponent(trackingToken)}`, { signal: pollController.signal });
        if (res.data?.order && !pollController.signal.aborted) setOrder(res.data.order);
      } catch {
        // Keep the last successful order visible while the socket or network reconnects.
      } finally {
        window.clearTimeout(pollTimeoutId);
        pollInFlight = false;
      }
    };

    const pollIfDisconnected = () => {
      if (!socket.connected) fetchLatestOrder();
    };
    const handleConnect = () => {
      updateConnection();
      socket.emit('join:tracking', trackingToken);
      fetchLatestOrder();
    };

    updateConnection();
    socket.on('order:update', handleUpdate);
    socket.on('connect', handleConnect);
    socket.on('disconnect', updateConnection);
    if (socket.connected) socket.emit('join:tracking', trackingToken);
    const pollTimer = window.setInterval(pollIfDisconnected, 10000);
    return () => {
      if (socket.connected) socket.emit('leave:tracking', trackingToken);
      socket.off('order:update', handleUpdate);
      socket.off('connect', handleConnect);
      socket.off('disconnect', updateConnection);
      window.clearInterval(pollTimer);
      pollController?.abort();
    };
  }, [trackingToken, orderId, orderStatus]);

  // ─── Real-Time Client-Side Countdown Timer (0 API Requests) ────────────────
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(0);

  useEffect(() => {
    if (!orderCreatedAt) return;

    if (['READY', 'COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'REJECTED', 'REFUNDED'].includes(orderStatus)) {
      setTimeLeftSeconds(0);
      return;
    }

    const prepMins = orderAdjustedEta
      ? Math.round(orderAdjustedEta)
      : 15;
    const createdAtMs = new Date(orderCreatedAt).getTime();
    const targetMs = createdAtMs + prepMins * 60 * 1000;

    const updateTimer = () => {
      const diff = Math.floor((targetMs - Date.now()) / 1000);
      setTimeLeftSeconds(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [orderCreatedAt, orderAdjustedEta, orderStatus]);

  const formatCountdown = (totalSecs) => {
    if (totalSecs <= 0) return '00:00';
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleTableChange = async () => {
    if (!targetTable || !order) return;
    setTableUpdateLoading(true);
    try {
      const res = await api.put(`/orders/${order.id}/transfer-table`, {
        targetTableNumber: targetTable,
      });
      if (res.data?.order) {
        setOrder(res.data.order);
        setTableUpdateSuccess(`🍽️ Order rerouted to ${targetTable}! Kitchen notified.`);
        setShowTablePicker(false);
        setTimeout(() => setTableUpdateSuccess(''), 5000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update delivery table.');
    } finally {
      setTableUpdateLoading(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (!order) return;
    const orderNum = order.orderNumber || `#ORD-${order.id}`;
    const tableLabel = displayTableLabel || 'N/A';
    const dateStr = new Date(order.createdAt).toLocaleString();
    const payMethod = (order.paymentMethod || 'N/A').toUpperCase();
    const payStatus = order.paymentStatus || 'UNPAID';
    const itemsHtml = (order.orderItems || []).map(item => {
      const name = item.nameSnapshot || item.menuItem?.name || 'Item';
      const price = item.priceSnapshot ?? item.price ?? 0;
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5">${item.quantity} &times; ${name}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:right">Rs ${(price * item.quantity).toFixed(2)}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${orderNum}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:40px;color:#171717;background:#fff}h1{font-size:28px;margin:0 0 4px}h2{font-size:16px;color:#78716C;margin:0 0 24px;font-weight:500}.meta{display:flex;gap:32px;margin-bottom:24px;flex-wrap:wrap}.meta div{font-size:13px;color:#78716C}.meta strong{display:block;color:#171717;font-size:14px;margin-top:2px}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:#fafaf9;padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#78716C;border-bottom:2px solid #e5e5e5}td{font-size:14px}.totals{margin-top:8px;text-align:right;font-size:15px}.totals strong{font-size:20px;color:#E85D2A}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#a8a29e;text-align:center}@media print{body{padding:20px}}</style></head><body><h1>Invoice</h1><h2>${orderNum}</h2><div class="meta"><div>Table<strong>${tableLabel}</strong></div><div>Date<strong>${dateStr}</strong></div><div>Payment<strong>${payMethod}</strong></div><div>Status<strong>${payStatus}</strong></div></div><table><thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead><tbody>${itemsHtml}</tbody></table><div class="totals"><div>Subtotal: Rs ${(order.subtotal || 0).toFixed(2)}</div><div>Tax: Rs ${(order.tax || 0).toFixed(2)}</div>${Number(order.discount) > 0 ? `<div>Discount: -Rs ${(order.discount || 0).toFixed(2)}</div>` : ''}<div><strong>Total: Rs ${(order.total || 0).toFixed(2)}</strong></div></div><div class="footer">ZovikPOS &bull; Thank you for your order!</div></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${orderNum.replace(/[^a-zA-Z0-9-]/g, '')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const steps = [
    { key: 'PENDING', label: 'Order placed', description: 'Order placed, awaiting confirmation', icon: ShoppingBag },
    { key: 'PAID', label: 'Confirmed', description: 'Kitchen received your order', icon: ShieldCheck },
    { key: 'PREPARING', label: 'Preparing', description: 'Chef is cooking your meal', icon: Utensils },
    { key: 'READY', label: 'Ready', description: 'Ready at the counter', icon: Sparkles },
    { key: 'COMPLETED', label: 'Completed', description: 'Collected. Enjoy your meal!', icon: CheckCircle2 },
  ];

  const getStepIndex = (status) => {
    if (status === 'PAYMENT_PENDING' || status === 'PENDING') return 0;
    if (status === 'PAID') return 1;
    if (status === 'PREPARING') return 2;
    if (status === 'READY') return 3;
    if (status === 'COMPLETED') return 4;
    return 0;
  };

  if (loading) {
    return (
      <div className="customer-tracking-page responsive-shell min-h-screen flex flex-col">
        <header className="customer-tracking-header glass">
          <button type="button" onClick={() => navigate('/customer')} className="customer-tracking-header__back icon-btn" aria-label="Back to menu"><ArrowLeft aria-hidden="true" /></button>
          <h1>Track order</h1>
          <span className={`customer-tracking-live${socketConnected ? ' is-live' : ''}`} role="status"><i aria-hidden="true" />{socketConnected ? 'Live' : 'Reconnecting…'}</span>
        </header>
        <div className="customer-tracking-loading" role="status" aria-live="polite" aria-busy="true">
          <div className="customer-tracking-loading__intro">
            <img className="customer-tracking-loading__logo" src="/assets/zovikpos-mark.svg" alt="" aria-hidden="true" />
            <div>
              <strong>ZOVIKPOS</strong>
              <span>Loading your order...</span>
            </div>
          </div>
          <ol className="customer-tracking-loading__progress" aria-label="Order progress">
            <li className="is-current">Order placed</li><li>Kitchen</li><li>Ready</li>
          </ol>
          <div className="customer-tracking-loading__skeleton customer-tracking-loading__skeleton--hero" aria-hidden="true">
            <span className="customer-tracking-loading__circle" />
            <span className="customer-tracking-loading__bar customer-tracking-loading__bar--wide" />
            <span className="customer-tracking-loading__bar customer-tracking-loading__bar--medium" />
          </div>
          <div className="customer-tracking-loading__skeleton customer-tracking-loading__skeleton--timeline" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => <span className="customer-tracking-loading__timeline-row" key={index}><i /><b /><em /></span>)}
          </div>
          <div className="customer-tracking-loading__skeleton customer-tracking-loading__skeleton--receipt" aria-hidden="true">
            <span className="customer-tracking-loading__bar customer-tracking-loading__bar--wide" />
            <span className="customer-tracking-loading__bar" />
            <span className="customer-tracking-loading__bar customer-tracking-loading__bar--medium" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="customer-tracking-page responsive-shell min-h-screen flex flex-col">
        <header className="customer-tracking-header glass">
          <button type="button" onClick={() => navigate('/customer')} className="customer-tracking-header__back icon-btn" aria-label="Back to menu"><ArrowLeft aria-hidden="true" /></button>
          <h1>Track order</h1>
          <span className={`customer-tracking-live${socketConnected ? ' is-live' : ''}`} role="status"><i aria-hidden="true" />{socketConnected ? 'Live' : 'Reconnecting…'}</span>
        </header>
        <div className="customer-tracking-error glass">
          <div className="customer-tracking-error__icon">
            <AlertCircle aria-hidden="true" />
          </div>
          <h2>{orderNotFound ? 'Order not found' : "We couldn't load your order"}</h2>
          <p>{error || 'Check your connection, then try loading the order again.'}</p>
          <Button
            onClick={() => { setOrder(null); setError(''); setLoading(true); setRetryAttempt(attempt => attempt + 1); }}
            className="customer-tracking-error__retry"
          >
            Try again
          </Button>
          <Button
            onClick={() => navigate('/customer')}
            className="customer-tracking-error__action"
          >
            Back to Menu
          </Button>
        </div>
      </div>
    );
  }

  const currentStepIdx = getStepIndex(order.status);
  const isCompleted = order.status === 'COMPLETED';
  const isReady = order.status === 'READY';

  // SVG Circular Ring Calculations
  const circleRadius = 72;
  const circumference = 2 * Math.PI * circleRadius;
  const prepMinsTotal = order.etaPrediction?.adjustedEta ? Math.round(order.etaPrediction.adjustedEta) : 15;
  const totalDurationSecs = prepMinsTotal * 60;
  const isOverdue = timeLeftSeconds < 0;
  const elapsedSecs = isOverdue
    ? totalDurationSecs + Math.abs(timeLeftSeconds)
    : Math.max(0, totalDurationSecs - timeLeftSeconds);
  const timeProgressPercent = isCompleted ? 100 : isReady ? 100 : isOverdue ? 100 : Math.min(95, Math.max(12, (elapsedSecs / totalDurationSecs) * 100));
  const strokeDashoffset = circumference - (timeProgressPercent / 100) * circumference;

  return (
    <div className="customer-tracking-page responsive-shell min-h-screen flex flex-col selection:bg-[#E85D2A]/20">
      <header className="customer-tracking-header glass">
        <button
          type="button"
          onClick={() => navigate('/customer')}
          className="customer-tracking-header__back icon-btn"
          aria-label="Back to menu"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1>Track order</h1>
        <span className={`customer-tracking-live${socketConnected ? ' is-live' : ''}`} role="status">
          <i aria-hidden="true" />{socketConnected ? 'Live' : 'Reconnecting…'}
        </span>
      </header>

      <div className="customer-tracking-content">

        {/* Main Tracker Card */}
        <div className="tracking-card glass">

          {/* Order Identity Header */}
          <div className="tracking-order-meta flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F5F5F4] dark:border-[#2A2A2A] pb-6">
            <div>
              <span className="text-[10px] font-black text-[#E85D2A] uppercase tracking-widest block mb-1">
                Order Tracking
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#171717] dark:text-white">
                {order.orderNumber || `#000${order.id}`}
              </h1>
              <p className="text-xs text-[#78716C] dark:text-[#A8A29E] mt-1.5 flex items-center gap-1.5 flex-wrap">
                <strong className="tracking-table-label">
                  {displayTableLabel}
                </strong>
                <span>• {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
              {/* TEMP: hidden "Changed seat? Reroute table delivery" button, uncomment to restore
              {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
                <button
                  onClick={() => setShowTablePicker(!showTablePicker)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-900/50 text-[#E85D2A] dark:text-orange-400 text-[11px] sm:text-xs font-extrabold hover:bg-orange-100/80 transition-all cursor-pointer shadow-xs whitespace-normal sm:whitespace-nowrap text-left active:scale-95"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-[#E85D2A]" />
                  <span>Changed seat? Reroute table delivery</span>
                </button>
              )}
              */}
            </div>

            {/* Status Pill Badge */}
            {(() => {
              const isFailedStatus = ['CANCELLED', 'PAYMENT_FAILED', 'REJECTED', 'REFUNDED'].includes(order.status);
              return (
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black self-start sm:self-auto ${
                  isFailedStatus
                    ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${isFailedStatus ? 'bg-rose-500' : 'bg-emerald-500 animate-ping'}`} />
                  <span>{order.status}</span>
                </div>
              );
            })()}
          </div>

          {/* Table Transfer Feedback */}
          {tableUpdateSuccess && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-2xl text-xs font-bold animate-fade-in flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{tableUpdateSuccess}</span>
            </div>
          )}

          {/* Change Table Dropdown */}
          {showTablePicker && (
            <div className="p-4 bg-[#FAF9F7] dark:bg-[#252525] border border-[#E7E5E4] dark:border-[#404040] rounded-2xl space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#171717] dark:text-white">Select New Delivery Location:</span>
                <button onClick={() => setShowTablePicker(false)} className="text-xs text-[#78716C] dark:text-[#A8A29E] font-bold hover:text-[#171717]">✕ Close</button>
              </div>
              <div className="flex items-center gap-2">
                <ThemedSelect
                  value={targetTable}
                  onChange={(e) => setTargetTable(e.target.value)}
                  className="bg-white dark:bg-[#333] border border-[#E7E5E4] dark:border-[#555] text-[#171717] dark:text-white text-xs rounded-xl px-3 py-2 font-bold flex-1 focus:outline-none focus:border-[#E85D2A]"
                >
                  <option value="">Select Table...</option>
                  {availableTables.map(t => (
                    <option key={t.id} value={t.tableNumber}>
                      {t.tableNumber}
                    </option>
                  ))}
                </ThemedSelect>
                <button
                  disabled={tableUpdateLoading || !targetTable}
                  onClick={handleTableChange}
                  className="px-4 py-2 bg-[#E85D2A] hover:bg-[#D94E1B] disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-md cursor-pointer"
                >
                  {tableUpdateLoading ? 'Updating...' : 'Update Table'}
                </button>
              </div>
            </div>
          )}

          {/* ── ANIMATED CIRCULAR PROGRESS & REAL-TIME COUNTDOWN TIMER ──────────── */}
          <section className="tracking-hero" key={order.status} aria-live="polite" aria-atomic="true">
            <h2 className="tracking-hero__headline">
              {isCompleted ? 'Enjoy your meal!' : isReady ? 'Your order is ready' : order.status === 'CANCELLED' ? 'Your order has been cancelled' : order.status === 'PAYMENT_FAILED' ? 'Payment verification failed' : order.status === 'REJECTED' ? 'Your order was rejected' : order.status === 'REFUNDED' ? 'Your order has been refunded' : order.status === 'PREPARING' ? 'Your food is being prepared' : order.status === 'PAID' ? 'Your order is confirmed' : 'We have received your order'}
            </h2>
            <div className="tracking-hero__content">
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            <div className="relative w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center">
              {/* SVG Animated Circular Progress Ring */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                {/* Background Track Circle */}
                <circle
                  cx="80"
                  cy="80"
                  r={circleRadius}
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-stone-100 dark:text-[#2A2A2A]"
                  fill="transparent"
                />
                {/* Progress Ring with Smooth Stroke Animation */}
                <circle
                  cx="80"
                  cy="80"
                  r={circleRadius}
                  stroke="url(#orangeProgressGradient)"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                  fill="transparent"
                />
                <defs>
                  <linearGradient id="orangeProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    {isReady || isCompleted ? (
                      <>
                        <stop offset="0%" stopColor="var(--success)" />
                        <stop offset="100%" stopColor="var(--success)" />
                      </>
                    ) : isOverdue ? (
                      <>
                        <stop offset="0%" stopColor="#D97706" />
                        <stop offset="100%" stopColor="#DC2626" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor="var(--accent)" />
                        <stop offset="100%" stopColor="var(--accent)" />
                      </>
                    )}
                  </linearGradient>
                </defs>
              </svg>

              {/* Inner Circle Countdown Content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                {isCompleted ? (
                  <div className="space-y-1">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                      <Check className="w-6 h-6 stroke-[3]" />
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mt-1">Handed Over</span>
                    {order.etaPrediction?.actualTime ? (
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 block">
                        Prepared in {order.etaPrediction.actualTime} mins
                      </span>
                    ) : null}
                  </div>
                ) : isReady ? (
                  <div className="space-y-1">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Ready for Pickup!</span>
                    {order.etaPrediction?.actualTime ? (
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 block">
                        Prepared in {order.etaPrediction.actualTime} mins
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#78716C] dark:text-[#A8A29E] block">
                      {isOverdue ? 'Overdue' : 'Estimated Time'}
                    </span>
                    {/* REAL-TIME TICKING COUNTDOWN / OVERTIME TIMER */}
                    <h2 className={`text-2xl sm:text-3xl font-black tracking-tight font-mono leading-none ${isOverdue ? 'text-amber-600 dark:text-amber-400' : 'text-[#171717] dark:text-white'}`}>
                      {timeLeftSeconds !== 0 ? formatCountdown(timeLeftSeconds) : `~${prepMinsTotal} Mins`}
                    </h2>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-block mt-1 ${isOverdue ? 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300' : 'text-[#E85D2A] bg-orange-50 dark:bg-orange-950/40'}`}>
                      Kitchen: {order.etaPrediction?.kitchenLoad || 'Normal'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="tracking-hero__description text-xs font-bold text-[#78716C] dark:text-[#A8A29E] text-center max-w-xs leading-relaxed">
              {isReady
                ? 'Collect your order at the pickup counter.'
                : order.status === 'PREPARING'
                ? 'Our chef is preparing your meal.'
                : order.status === 'PAID'
                ? 'Your order is confirmed and queued in the kitchen.'
                : isCompleted
                ? 'Your order is complete. Enjoy your meal.'
                : 'Order received. Awaiting confirmation.'}
            </p>
          </div>
            </div>
          </section>

          {isReady && (
            <div className="tracking-ready-banner" role="status">
              <Bell aria-hidden="true" />
              <span>Your order is ready at the counter!</span>
            </div>
          )}

          {isCompleted && (
            <div className="tracking-completed-banner">
              <CheckCircle2 aria-hidden="true" />
              <span>Order complete. We hope you enjoy your meal!</span>
            </div>
          )}

          {/* ── PREPARATION STAGES TIMELINE ──────────────────────────────────────── */}
          <section className="tracking-timeline">
            <h3>Order progress</h3>
            <ol>
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isPassed = idx < currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                const statusEntry = order.statusHistory?.find((entry) => entry.newStatus === step.key);
                const timestamp = step.key === 'PENDING' ? order.createdAt : statusEntry?.createdAt;
                return (
                  <li key={step.key} className={`tracking-timeline__step${isPassed ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`} aria-current={isCurrent ? 'step' : undefined}>
                    <span className="tracking-timeline__marker" aria-hidden="true">
                      <span className="tracking-timeline__node">
                        {isPassed ? <Check /> : <Icon />}
                      </span>
                      {idx < steps.length - 1 && <span className={`tracking-timeline__connector${isPassed ? ' is-filled' : ''}`} />}
                    </span>
                    <span className="tracking-timeline__copy">
                      <strong>{step.label}</strong>
                      <span>{step.description}</span>
                      {timestamp && <time dateTime={timestamp}>{new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Order Items Summary Hierarchy */}
          <section className="tracking-receipt">
            <div className="tracking-receipt__heading">
              <div>
                <span>Customer receipt</span>
                <h3>{order.orderNumber || `#ORD-${order.id}`}</h3>
              </div>
              <span className={`tracking-payment-badge${order.paymentStatus === 'PAID' ? ' is-paid' : ' is-unpaid'}`}>{order.paymentStatus || 'UNPAID'}</span>
            </div>
            <div className="tracking-receipt__details">
              <span><strong>{displayTableLabel}</strong></span>
              <span>{new Date(order.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="tracking-receipt__items">
              {order.orderItems?.map((item) => (
                <div key={item.id} className="tracking-receipt__line">
                  <div className="tracking-receipt__item-copy">
                    <strong>{item.quantity} × {item.nameSnapshot || item.menuItem?.name}</strong>
                    <span>{item.unit || '1 Portion'} · {formatPrice(item.priceSnapshot ?? item.price ?? 0)} each</span>
                  </div>
                  <strong className="tracking-receipt__amount">
                  {formatPrice((item.priceSnapshot ?? item.price ?? 0) * item.quantity)}
                  </strong>
                </div>
              ))}
            </div>

            <div className="tracking-receipt__totals">
              <div className="tracking-receipt__grand-total"><span>Total</span><strong>{formatPrice(order.total || 0)}</strong></div>
            </div>
          </section>

        </div>
      </div>

      <footer className="tracking-actions glass">
        <Button variant="primary" onClick={() => navigate('/customer')} className="tracking-actions__more">
          <ShoppingBag aria-hidden="true" />
          Order more food
        </Button>
        <Button variant="secondary" onClick={handleDownloadInvoice} className="tracking-actions__invoice">
          <Download aria-hidden="true" />
          Download Invoice
        </Button>
      </footer>
    </div>
  );
};

export default OrderTrackingPage;
