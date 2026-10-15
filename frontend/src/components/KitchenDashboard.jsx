import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import {
  ChefHat,
  Play,
  CheckCircle,
  RefreshCw,
  Flame,
  Clock,
  AlertCircle,
  Volume2,
  VolumeX,
  CheckSquare,
  Square,
  Sparkles,
  Keyboard,
} from 'lucide-react';
import DemoStatusBadge from './DemoStatusBadge';

const KitchenDashboard = ({ user, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const [tableShiftAlert, setTableShiftAlert] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Item Check-Off State: { `${orderId}-${itemId}`: boolean }
  const [checkedItems, setCheckedItems] = useState({});

  const [, setTick] = useState(0);
  const alertTimerRef = useRef(null);
  const shiftTimerRef = useRef(null);
  // Tracks optimistic status changes so incoming socket events don't revert them
  const optimisticStatusRef = useRef({});

  // Auto update elapsed timers every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Audio Notification Sound (Synthesized Sine Wave)
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.18);
    } catch (e) {
      console.warn('AudioContext not allowed or supported yet:', e);
    }
  };

  // Real-time socket updates for kitchen
  useEffect(() => {
    fetchActiveOrders();

    const socket = getSocket();
    if (socket) {
      const handleOrderNew = (newOrder) => {
        console.log('Kitchen received new order:', newOrder);
        if (newOrder.status === 'PAID') {
          playNotificationSound();
          setNewOrderAlert(true);
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === newOrder.id);
            if (exists) return prev.map((o) => (o.id === newOrder.id ? newOrder : o));
            return [newOrder, ...prev];
          });

          if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
          alertTimerRef.current = setTimeout(() => setNewOrderAlert(false), 5000);
        }
      };

      const handleOrderUpdate = (updatedOrder) => {
        console.log('Kitchen received order update:', updatedOrder);
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === updatedOrder.id);
          if (exists) {
            if (['COMPLETED', 'CANCELLED'].includes(updatedOrder.status)) {
              return prev.filter((o) => o.id !== updatedOrder.id);
            }
            return prev.map((o) => {
              if (o.id !== updatedOrder.id) return o;
              // If we have an optimistic status that is further in the pipeline,
              // don't let the socket event revert it back
              const optimisticStatus = optimisticStatusRef.current[o.id];
              if (optimisticStatus) {
                const statusOrder = ['PAID', 'PREPARING', 'READY', 'COMPLETED'];
                const optimisticIdx = statusOrder.indexOf(optimisticStatus);
                const incomingIdx = statusOrder.indexOf(updatedOrder.status);
                if (optimisticIdx > incomingIdx) {
                  // Keep the optimistic (more advanced) status, merge other data
                  return { ...updatedOrder, status: optimisticStatus };
                }
                // Server caught up or went further — clear the optimistic lock
                delete optimisticStatusRef.current[o.id];
              }
              return updatedOrder;
            });
          } else if (['PAID', 'PREPARING', 'READY'].includes(updatedOrder.status)) {
            return [updatedOrder, ...prev];
          }
          return prev;
        });
      };

      const handleTableShift = (data) => {
        console.log('Kitchen received table shift event:', data);
        playNotificationSound();
        setTableShiftAlert(`⚡ Table Shift Alert: Order ${data.orderNumber} shifted from ${data.oldTable} ➔ ${data.newTable}! Please serve to ${data.newTable}.`);
        if (shiftTimerRef.current) clearTimeout(shiftTimerRef.current);
        shiftTimerRef.current = setTimeout(() => setTableShiftAlert(''), 8000);
        fetchActiveOrders();
      };

      socket.on('order:new', handleOrderNew);
      socket.on('order:update', handleOrderUpdate);
      socket.on('table:shift', handleTableShift);

      return () => {
        socket.off('order:new', handleOrderNew);
        socket.off('order:update', handleOrderUpdate);
        socket.off('table:shift', handleTableShift);
        if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
        if (shiftTimerRef.current) clearTimeout(shiftTimerRef.current);
      };
    }
  }, [user, soundEnabled]);

  // Filter orders by queue columns
  const paidOrders = orders.filter((o) => o.status === 'PAID');
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING');
  const readyOrders = orders.filter((o) => o.status === 'READY');

  // Hands-Free Keyboard Hotkeys (Space to start oldest, R to refresh, M to toggle sound)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        // Advance oldest incoming paid order to PREPARING
        if (paidOrders.length > 0) {
          const oldestOrder = paidOrders[paidOrders.length - 1]; // Oldest at bottom or first
          handleUpdateStatus(oldestOrder.id, 'PREPARING');
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        fetchActiveOrders();
      } else if (e.key === 'm' || e.key === 'M') {
        setSoundEnabled((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paidOrders]);

  const fetchActiveOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders');
      const active = response.data.orders.filter((o) => ['PAID', 'PREPARING', 'READY'].includes(o.status));
      // Clear optimistic locks on full refresh
      optimisticStatusRef.current = {};
      setOrders(active);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch orders.');
    } finally {
      setLoading(false);
    }
  };

  const [pendingStatusOrderIds, setPendingStatusOrderIds] = useState(new Set());

  const handleUpdateStatus = async (orderId, nextStatus) => {
    if (pendingStatusOrderIds.has(orderId)) return;
    setPendingStatusOrderIds((prev) => new Set(prev).add(orderId));

    // Record optimistic status so socket events don't revert it
    optimisticStatusRef.current[orderId] = nextStatus;

    // Immediate Optimistic UI — move card to next column instantly
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );

    // Unlock button immediately after UI update (don't wait for API)
    setPendingStatusOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });

    // Fire API in background — clear optimistic lock on completion, rollback on failure
    api.put(`/orders/${orderId}/status`, { status: nextStatus })
      .then(() => {
        // API succeeded — clear the optimistic lock (server status now matches)
        delete optimisticStatusRef.current[orderId];
      })
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.error || 'Failed to update order status.');
        delete optimisticStatusRef.current[orderId];
        fetchActiveOrders(); // Rollback by re-fetching
      });
  };

  const toggleItemCheck = (orderId, itemKey) => {
    const key = `${orderId}-${itemKey}`;
    setCheckedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getElapsedTimeInfo = (createdAtStr) => {
    const created = new Date(createdAtStr);
    const diffMs = new Date() - created;
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));

    if (diffMins >= 15) {
      return { text: `${diffMins}m ago`, isCritical: true, isUrgent: true, color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' };
    }
    if (diffMins >= 8) {
      return { text: `${diffMins}m ago`, isCritical: false, isUrgent: true, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    }
    return { text: `${diffMins}m ago`, isCritical: false, isUrgent: false, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
  };

  const formatTableDisplay = (order) => {
    if (!order) return 'Takeaway';
    if (typeof order === 'string') {
      return order.toLowerCase().startsWith('table') ? order : `Table ${order}`;
    }
    if (order.tableNumber) return order.tableNumber;
    if (order.table?.tableNumber) return order.table.tableNumber;
    if (order.tableId) return `Table ${order.tableId}`;
    return 'Takeaway';
  };

  // Compute delayed count
  const delayedCount = orders.filter((o) => {
    const diffMins = Math.max(0, Math.floor((new Date() - new Date(o.createdAt)) / 60000));
    return diffMins >= 15;
  }).length;

  return (
    <div className="responsive-shell min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] p-4 sm:p-6 flex flex-col space-y-5 relative overflow-x-hidden transition-colors duration-300 font-sans">
      {/* Background neon flares */}
      <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-orange-500/3 rounded-full blur-[140px] pointer-events-none" />

      {/* Visual flash alert for new orders */}
      {newOrderAlert && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-black py-3.5 px-6 rounded-2xl flex justify-between items-center font-extrabold text-xs shadow-xl animate-bounce relative z-50 border border-amber-400/30">
          <div className="flex items-center space-x-3">
            <Flame className="w-5 h-5 animate-pulse text-black" />
            <span className="tracking-tight uppercase">INCOMING ORDER ALERT: A new order has been sent to the board!</span>
          </div>
          <button onClick={() => setNewOrderAlert(false)} className="text-black/70 hover:text-black transition-colors cursor-pointer font-bold px-2 py-1">
            ✕
          </button>
        </div>
      )}

      {/* Visual flash alert for table shift */}
      {tableShiftAlert && (
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3.5 px-6 rounded-2xl flex justify-between items-center font-extrabold text-xs shadow-xl animate-pulse relative z-50 border border-orange-300/30">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 text-orange-200" />
            <span className="tracking-tight uppercase">{tableShiftAlert}</span>
          </div>
          <button onClick={() => setTableShiftAlert('')} className="text-[var(--text-main)]/80 hover:text-[var(--text-main)] transition-colors cursor-pointer font-bold px-2 py-1">
            ✕
          </button>
        </div>
      )}

      {/* ── LIVE KDS STATS & ACTION TOOLBAR ─────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 relative z-10">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            <span className="text-xs font-bold text-[var(--text-main)]">Incoming: <strong className="text-[var(--text-main)] font-mono">{paidOrders.length}</strong></span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] animate-pulse" />
            <span className="text-xs font-bold text-[var(--text-main)]">Cooking: <strong className="text-[var(--text-main)] font-mono">{preparingOrders.length}</strong></span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            <span className="text-xs font-bold text-[var(--text-main)]">Ready: <strong className="text-[var(--text-main)] font-mono">{readyOrders.length}</strong></span>
          </div>

          {delayedCount > 0 && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-bold animate-pulse">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{delayedCount} Delayed (&gt;15m)</span>
            </div>
          )}
        </div>

        {/* Hotkey Guide & Action Buttons */}
        <div className="flex items-center space-x-3 text-xs font-semibold">
          <DemoStatusBadge user={user} />

          <div className="hidden lg:flex items-center space-x-2 text-[11px] text-[var(--text-muted)] bg-[var(--bg-color)] px-3 py-1.5 rounded-xl border border-[var(--border-color)]">
            <Keyboard className="w-3.5 h-3.5 text-orange-400" />
            <span><strong className="text-[var(--text-main)] font-mono">[Space]</strong> Start Cooking • <strong className="text-[var(--text-main)] font-mono">[R]</strong> Refresh • <strong className="text-[var(--text-main)] font-mono">[M]</strong> Mute</span>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-orange-500/15 border-orange-500/30 text-orange-300'
                : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-muted)]'
            }`}
            title={soundEnabled ? 'Mute Audio Alerts (M)' : 'Unmute Audio Alerts (M)'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={fetchActiveOrders}
            className="px-3 py-2 bg-[var(--card-bg)] hover:bg-white/[0.12] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 shadow-sm"
            title="Refresh Board (Press R)"
          >
            <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
            <span>Refresh Board</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-bold flex items-center space-x-2.5 relative z-10">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── THREE KDS QUEUE COLUMNS ─────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5 overflow-visible md:overflow-hidden min-h-0 md:min-h-[520px] relative z-10">
        
        {/* Column 1: Incoming / PAID */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4.5 flex flex-col space-y-4 shadow-xl min-h-[320px] md:min-h-0">
          <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
              <h3 className="font-extrabold text-[var(--text-main)] text-xs tracking-wider uppercase font-display">Incoming Paid</h3>
            </div>
            <span className="px-2.5 py-0.5 bg-orange-500/15 text-orange-400 text-[10px] rounded-full font-extrabold border border-orange-500/30 font-mono">
              {paidOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
            {paidOrders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] text-xs py-12 text-center">
                <span className="text-3xl mb-2 opacity-50">💤</span>
                <p className="font-bold text-[var(--text-muted)]">Order queue is empty</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Paid customer transactions appear here automatically.</p>
              </div>
            ) : (
              paidOrders.map((order) => {
                const elapsed = getElapsedTimeInfo(order.createdAt);
                return (
                  <div
                    key={order.id}
                    className={`bg-[var(--bg-color)] border rounded-2xl p-4 space-y-3.5 transition-all duration-200 ${
                      elapsed.isCritical
                        ? 'border-rose-500/60 shadow-lg shadow-rose-500/10 animate-pulse'
                        : elapsed.isUrgent
                        ? 'border-amber-500/40'
                        : 'border-[var(--border-color)] hover:border-orange-500/40'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-extrabold text-[var(--text-main)] text-sm font-mono">
                            {order.orderNumber || `#000${order.id}`}
                          </h4>
                          {elapsed.isCritical && (
                            <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-400 rounded text-[9px] font-black uppercase tracking-wider">
                              CRITICAL
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5 block">
                          Placement: {formatTableDisplay(order)}
                        </span>
                      </div>
                      <span className={`text-[10px] flex items-center space-x-1 font-mono px-2 py-0.5 rounded border ${elapsed.color}`}>
                        <Clock className="w-3 h-3" />
                        <span>{elapsed.text}</span>
                      </span>
                    </div>

                    {/* Item List (Tick boxes commented out) */}
                    <div className="p-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] space-y-2">
                      {order.orderItems?.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex items-center justify-between text-xs font-medium py-1 px-1.5 rounded"
                        >
                          <div className="flex items-center space-x-2 min-w-0 pr-2">
                            {/* Checkbox tick box commented out per user request:
                            {isChecked ? <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" /> : <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" />}
                            */}
                            <span className="truncate text-[var(--text-main)]">
                              {item.name || item.menuItem?.name}
                            </span>
                          </div>
                          <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded text-[10px] border border-amber-500/20 shrink-0 font-mono">
                            × {item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                      className="w-full py-2.5 bg-[var(--sb-primary)] hover:bg-[var(--sb-primary-hover)] text-white rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Cooking</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 2: Cooking / PREPARING */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4.5 flex flex-col space-y-4 shadow-xl min-h-[320px] md:min-h-0">
          <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] animate-pulse" />
              <h3 className="font-extrabold text-[var(--text-main)] text-xs tracking-wider uppercase font-display">In Preparation</h3>
            </div>
            <span className="px-2.5 py-0.5 bg-orange-500/15 text-orange-400 text-[10px] rounded-full font-extrabold border border-orange-500/30 font-mono">
              {preparingOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
            {preparingOrders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] text-xs py-12 text-center">
                <span className="text-3xl mb-2 opacity-50">🍳</span>
                <p className="font-bold text-[var(--text-muted)]">Nothing cooking right now</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Press "Start Cooking" or [Space] to begin orders.</p>
              </div>
            ) : (
              preparingOrders.map((order) => {
                const elapsed = getElapsedTimeInfo(order.createdAt);
                return (
                  <div
                    key={order.id}
                    className={`bg-[var(--bg-color)] border rounded-2xl p-4 space-y-3.5 transition-all duration-200 ${
                      elapsed.isCritical
                        ? 'border-rose-500/60 shadow-lg shadow-rose-500/10'
                        : 'border-orange-500/30 hover:border-orange-500/50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-extrabold text-[var(--text-main)] text-sm font-mono">
                            {order.orderNumber || `#000${order.id}`}
                          </h4>
                          {elapsed.isCritical && (
                            <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-400 rounded text-[9px] font-black uppercase tracking-wider animate-pulse">
                              DELAYED
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-orange-400 font-semibold mt-0.5 block">
                          Placement: {formatTableDisplay(order)}
                        </span>
                      </div>
                      <span className={`text-[10px] flex items-center space-x-1 font-mono px-2 py-0.5 rounded border ${elapsed.color}`}>
                        <span className="w-1.5 h-1.5 bg-current rounded-full animate-ping" />
                        <span>{elapsed.text}</span>
                      </span>
                    </div>

                    {/* Item List (Tick boxes commented out) */}
                    <div className="p-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] space-y-2">
                      {order.orderItems?.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex items-center justify-between text-xs font-medium py-1 px-1.5 rounded"
                        >
                          <div className="flex items-center space-x-2 min-w-0 pr-2">
                            {/* Checkbox tick box commented out per user request:
                            {isChecked ? <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" /> : <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" />}
                            */}
                            <span className="truncate text-[var(--text-main)]">
                              {item.name || item.menuItem?.name}
                            </span>
                          </div>
                          <span className="text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded text-[10px] border border-orange-500/20 shrink-0 font-mono">
                            × {item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleUpdateStatus(order.id, 'READY')}
                      className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Complete Cooking</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: Ready / READY */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-4.5 flex flex-col space-y-4 shadow-xl min-h-[320px] md:min-h-0">
          <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <h3 className="font-extrabold text-[var(--text-main)] text-xs tracking-wider uppercase font-display">Ready for Counter</h3>
            </div>
            <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] rounded-full font-extrabold border border-emerald-500/30 font-mono">
              {readyOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
            {readyOrders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] text-xs py-12 text-center">
                <span className="text-3xl mb-2 opacity-50">🛎️</span>
                <p className="font-bold text-[var(--text-muted)]">No pickup items ready</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Finished meals will wait here for counter pickup.</p>
              </div>
            ) : (
              readyOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-[var(--bg-color)] border border-emerald-500/30 rounded-2xl p-4 space-y-3.5 shadow-lg hover:border-emerald-500/50 transition-all duration-200"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-extrabold text-[var(--text-main)] text-sm font-mono">
                        {order.orderNumber || `#000${order.id}`}
                      </h4>
                      <span className="text-[10px] text-emerald-400 font-semibold mt-0.5 block">
                        Placement: {formatTableDisplay(order)}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 flex items-center space-x-1 font-mono bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                      <CheckCircle className="w-3 h-3" />
                      <span>Ready</span>
                    </span>
                  </div>

                  <div className="p-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] space-y-2">
                    {order.orderItems?.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-[var(--text-main)] font-medium">
                        <span className="truncate pr-2">{item.name || item.menuItem?.name}</span>
                        <span className="text-emerald-400 font-mono font-bold">× {item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center rounded-xl text-[10px] font-extrabold uppercase tracking-wide">
                    Waiting for customer counter pickup
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KitchenDashboard;
