import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Utensils,
  ArrowLeft,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  MapPin,
  Flame,
  Check,
  RotateCcw,
} from 'lucide-react';

const OrderTrackingPage = () => {
  const { trackingToken } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Table Change State
  const [availableTables, setAvailableTables] = useState([]);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [targetTable, setTargetTable] = useState('');
  const [tableUpdateLoading, setTableUpdateLoading] = useState(false);
  const [tableUpdateSuccess, setTableUpdateSuccess] = useState('');

  // Initial Order Fetch — ONLY runs when trackingToken changes (fixes 1-millisecond flicker!)
  useEffect(() => {
    let isMounted = true;
    const fetchOrder = async () => {
      try {
        const res = await api.get(`/orders/track/${encodeURIComponent(trackingToken)}`);
        if (isMounted) {
          setOrder(res.data.order);
          setTargetTable(res.data.order?.tableNumber || '');
        }
      } catch (err) {
        if (isMounted) {
          console.error('Tracking fetch error:', err);
          setError(err.response?.data?.error || 'Order tracking details not found.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrder();

    api.get('/tables/active').then(r => {
      if (isMounted && r.data?.tables) setAvailableTables(r.data.tables);
    }).catch(() => { });

    return () => { isMounted = false; };
  }, [trackingToken]);

  // Real-time socket updates — modifies order state directly WITHOUT triggering loading spinner or flickering
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !order) return;

    const handleUpdate = (updatedOrder) => {
      if (updatedOrder && (updatedOrder.id === order.id || updatedOrder.trackingToken === trackingToken)) {
        setOrder(updatedOrder);
      }
    };

    socket.on('order:update', handleUpdate);
    return () => socket.off('order:update', handleUpdate);
  }, [trackingToken, order?.id]);

  // ─── Real-Time Client-Side Countdown Timer (0 API Requests) ────────────────
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(0);

  useEffect(() => {
    if (!order) return;

    if (order.status === 'READY' || order.status === 'COMPLETED') {
      setTimeLeftSeconds(0);
      return;
    }

    const prepMins = order.etaPrediction?.adjustedEta
      ? Math.round(order.etaPrediction.adjustedEta)
      : 15;
    const createdAtMs = new Date(order.createdAt).getTime();
    const targetMs = createdAtMs + prepMins * 60 * 1000;

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
      setTimeLeftSeconds(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order?.createdAt, order?.etaPrediction?.adjustedEta, order?.status]);

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

  const steps = [
    { key: 'PENDING', label: 'Placed', icon: ShoppingBag },
    { key: 'PAID', label: 'Paid & Queued', icon: ShieldCheck },
    { key: 'PREPARING', label: 'In Kitchen', icon: Utensils },
    { key: 'READY', label: 'Ready for Pickup', icon: Sparkles },
    { key: 'COMPLETED', label: 'Handed Over', icon: CheckCircle2 },
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
      <div className="responsive-shell min-h-screen bg-[#FAF9F7] dark:bg-[#121212] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-[#E85D2A]/20 animate-ping" />
            <div className="w-12 h-12 border-4 border-[#E85D2A] border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-xs text-[#78716C] dark:text-[#A8A29E] font-bold">Connecting to Kitchen Tracker...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="responsive-shell min-h-screen bg-[#FAF9F7] dark:bg-[#121212] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#1E1E1E] border border-[#E7E5E4] dark:border-[#333] rounded-[32px] p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-[#171717] dark:text-white">Order Tracking Not Found</h2>
          <p className="text-xs text-[#78716C] dark:text-[#A8A29E]">{error || 'This order tracking code is invalid or expired.'}</p>
          <button
            onClick={() => navigate('/customer')}
            className="w-full py-3.5 bg-[#E85D2A] hover:bg-[#D94E1B] text-white rounded-2xl font-bold text-xs transition-all shadow-lg shadow-[#E85D2A]/20 cursor-pointer"
          >
            Back to Menu
          </button>
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
  const elapsedSecs = Math.max(0, totalDurationSecs - timeLeftSeconds);
  const timeProgressPercent = isCompleted ? 100 : isReady ? 100 : Math.min(95, Math.max(12, (elapsedSecs / totalDurationSecs) * 100));
  const strokeDashoffset = circumference - (timeProgressPercent / 100) * circumference;

  return (
    <div className="responsive-shell min-h-screen bg-[#FAF9F7] dark:bg-[#121212] text-[#171717] dark:text-[#E5E5E5] font-sans p-4 sm:p-6 lg:p-8 flex flex-col justify-between selection:bg-[#E85D2A]/20">
      <div className="max-w-2xl w-full mx-auto space-y-6">

        {/* Top Header Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/customer')}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#1E1E1E] border border-[#E7E5E4] dark:border-[#333] text-xs font-extrabold text-[#78716C] dark:text-[#A8A29E] hover:text-[#E85D2A] dark:hover:text-[#E85D2A] transition-all shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Menu</span>
          </button>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#E85D2A]/10 text-[#E85D2A] dark:text-orange-400 rounded-full text-xs font-black border border-[#E85D2A]/20 uppercase tracking-wide">
            <span className="w-2 h-2 rounded-full bg-[#E85D2A] animate-ping" />
            <span>Live Kitchen Sync</span>
          </div>
        </div>

        {/* Main Tracker Card */}
        <div className="bg-white dark:bg-[#1E1E1E] border border-[#E7E5E4] dark:border-[#333] rounded-[32px] p-6 sm:p-8 shadow-xl space-y-8 relative overflow-hidden">
          
          {/* Order Identity Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F5F5F4] dark:border-[#2A2A2A] pb-6">
            <div>
              <span className="text-[10px] font-black text-[#E85D2A] uppercase tracking-widest block mb-1">
                Order Tracking
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#171717] dark:text-white">
                {order.orderNumber || `#000${order.id}`}
              </h1>
              <p className="text-xs text-[#78716C] dark:text-[#A8A29E] mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span>Delivering to:</span>
                <strong className="text-[#E85D2A] font-extrabold bg-orange-50 dark:bg-orange-950/40 px-2.5 py-0.5 rounded-lg border border-orange-100 dark:border-orange-900/50">
                  {order.tableNumber || 'Takeaway'}
                </strong>
                <span>• {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
              {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
                <button
                  onClick={() => setShowTablePicker(!showTablePicker)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-900/50 text-[#E85D2A] dark:text-orange-400 text-[11px] sm:text-xs font-extrabold hover:bg-orange-100/80 transition-all cursor-pointer shadow-xs whitespace-normal sm:whitespace-nowrap text-left active:scale-95"
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-[#E85D2A]" />
                  <span>Changed seat? Reroute table delivery</span>
                </button>
              )}
            </div>

            {/* Status Pill Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-300 text-xs font-black self-start sm:self-auto">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>{order.status}</span>
            </div>
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
                <select
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
                </select>
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
                  strokeWidth="10"
                  className="text-stone-100 dark:text-[#2A2A2A]"
                  fill="transparent"
                />
                {/* Progress Ring with Smooth Stroke Animation */}
                <circle
                  cx="80"
                  cy="80"
                  r={circleRadius}
                  stroke="url(#orangeProgressGradient)"
                  strokeWidth="10"
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
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#059669" />
                      </>
                    ) : (
                      <>
                        <stop offset="0%" stopColor="#E85D2A" />
                        <stop offset="100%" stopColor="#F97316" />
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
                  </div>
                ) : isReady ? (
                  <div className="space-y-1">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Ready for Pickup!</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#78716C] dark:text-[#A8A29E] block">
                      Estimated Time
                    </span>
                    {/* REAL-TIME TICKING COUNTDOWN TIMER */}
                    <h2 className="text-3xl sm:text-4xl font-black text-[#171717] dark:text-white tracking-tight font-mono leading-none">
                      {timeLeftSeconds > 0 ? formatCountdown(timeLeftSeconds) : `~${prepMinsTotal} Mins`}
                    </h2>
                    <span className="text-[10px] font-bold text-[#E85D2A] bg-orange-50 dark:bg-orange-950/40 px-2.5 py-0.5 rounded-full inline-block mt-1">
                      Kitchen: {order.etaPrediction?.kitchenLoad || 'Normal'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs font-bold text-[#78716C] dark:text-[#A8A29E] text-center max-w-xs leading-relaxed">
              {isReady
                ? '🎉 Your order is hot & ready! Please collect your food from the pickup counter.'
                : order.status === 'PREPARING'
                ? '🔥 Chef is preparing your fresh meal right now.'
                : order.status === 'PAID'
                ? '✅ Payment confirmed. Ticket queued in kitchen.'
                : isCompleted
                ? '✨ Order complete! Enjoy your delicious meal.'
                : '⏳ Order placed. Awaiting cashier/payment confirmation.'}
            </p>
          </div>

          {/* ── PREPARATION STAGES TIMELINE ──────────────────────────────────────── */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#78716C] dark:text-[#A8A29E]">Preparation Stages</h3>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {steps.map((step, idx) => {
                const Icon = step.icon;
                const isPassed = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <div key={step.key} className="text-center space-y-2">
                    <div
                      className={`w-10 h-10 sm:w-11 sm:h-11 mx-auto rounded-2xl flex items-center justify-center transition-all duration-500 ${
                        isCurrent
                          ? 'bg-[#E85D2A] text-white ring-4 ring-[#E85D2A]/20 shadow-lg scale-110'
                          : isPassed
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#FAF9F7] dark:bg-[#2A2A2A] text-[#78716C] dark:text-[#666] border border-[#E7E5E4] dark:border-[#404040]'
                      }`}
                    >
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span
                      className={`text-[9px] sm:text-[10px] font-extrabold block leading-tight ${
                        isCurrent
                          ? 'text-[#E85D2A] dark:text-orange-400'
                          : isPassed
                          ? 'text-[#171717] dark:text-white'
                          : 'text-[#78716C] dark:text-[#666]'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order Items Summary Hierarchy */}
          <div className="space-y-3 pt-4 border-t border-[#F5F5F4] dark:border-[#2A2A2A]">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#78716C] dark:text-[#A8A29E]">Order Items Summary</h3>
            <div className="divide-y divide-[#F5F5F4] dark:divide-[#2A2A2A]">
              {order.orderItems?.map((item) => (
                <div key={item.id} className="py-3 flex justify-between items-center text-xs">
                  <div>
                    <strong className="text-[#171717] dark:text-white font-extrabold block text-sm">{item.nameSnapshot || item.menuItem?.name}</strong>
                    <span className="text-[#78716C] dark:text-[#A8A29E] text-[11px]">
                      Qty: {item.quantity} • {item.unit || '1 Portion'} • Rs. {(item.priceSnapshot ?? item.price ?? 0).toFixed(2)} each
                    </span>
                  </div>
                  <strong className="text-[#171717] dark:text-white font-black text-sm">
                    Rs. {((item.priceSnapshot ?? item.price ?? 0) * item.quantity).toFixed(2)}
                  </strong>
                </div>
              ))}
            </div>
            
            {/* Total Paid Financial Summary */}
            <div className="border-t border-[#E7E5E4] dark:border-[#333] pt-3.5 flex justify-between items-center text-sm font-black">
              <span className="text-[#171717] dark:text-white text-base">Total Paid:</span>
              <span className="text-[#E85D2A] text-xl font-mono font-black">Rs. {Number(order.total || 0).toFixed(2)}</span>
            </div>
          </div>

        </div>
      </div>

      <footer className="max-w-2xl w-full mx-auto text-center py-6 text-[11px] text-[#78716C] dark:text-[#A8A29E] font-bold">
        ZovikPOS Smart Dining System
      </footer>
    </div>
  );
};

export default OrderTrackingPage;
