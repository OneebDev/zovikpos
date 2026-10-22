import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { resolveTableLabel } from '../utils/customerTableLabel';
import {

  Play,
  CheckCircle,
  RefreshCw,
  Flame,
  Clock,
  AlertCircle,
  Volume2,
  VolumeX,
  Sparkles,
  Keyboard,
} from 'lucide-react';
import DemoStatusBadge from './DemoStatusBadge';
import AppBackground from './common/AppBackground';
import { isOrderDeletedEvent, mergeOrderList, mergeOrderRecord, orderStoreFromList, removeDeletedOrders, stableOrderSort } from '../utils/liveOrderStore';

const KitchenDashboard = ({ user }) => {
  const [orderStore, setOrderStore] = useState({});
  const orders = useMemo(() => stableOrderSort(Object.values(orderStore)), [orderStore]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newOrderAlert, setNewOrderAlert] = useState(false);
  const [tableShiftAlert, setTableShiftAlert] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Item Check-Off State: { `${orderId}-${itemId}`: boolean }

  const [, setTick] = useState(0);
  const alertTimerRef = useRef(null);
  const shiftTimerRef = useRef(null);
  // Tracks optimistic status changes so incoming socket events don't revert them
  const optimisticStatusRef = useRef({});
  const latestSequenceRef = useRef(0);
  const latestSequenceByIdRef = useRef({});
  const fetchRequestRef = useRef(0);
  const fetchControllerRef = useRef(null);
  const mountedRef = useRef(false);
  const writeOrders = useCallback((updater, source = 'optimistic') => {
    setOrderStore((previousStore) => {
      const previous = stableOrderSort(Object.values(previousStore));
      const nextOrders = typeof updater === 'function' ? updater(previous) : updater;
      const nextStore = orderStoreFromList(nextOrders);
      if (import.meta.env.DEV) {
        const ids = new Set([...Object.keys(previousStore), ...Object.keys(nextStore)]);
        ids.forEach((id) => {
          if (previousStore[id] !== nextStore[id]) console.debug(`[orders:${source}]`, id);
        });
      }
      return nextStore;
    });
  }, []);

  // Auto update elapsed timers every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Audio Notification Sound (Synthesized Sine Wave)
  const playNotificationSound = useCallback(() => {
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
  }, [soundEnabled]);

  const [pendingStatusOrderIds, setPendingStatusOrderIds] = useState(new Set());
  const playNotificationSoundRef = useRef(playNotificationSound);
  playNotificationSoundRef.current = playNotificationSound;

  const fetchActiveOrders = useCallback(async () => {
    const requestId = ++fetchRequestRef.current;
    const startedAtSequence = latestSequenceRef.current;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setLoading(true);
    try {
      const response = await api.get('/orders', { signal: controller.signal });
      if (requestId !== fetchRequestRef.current || !mountedRef.current) return;
      const active = response.data.orders.filter((o) => ['PAID', 'PREPARING', 'READY'].includes(o.status));
      active.forEach((order) => {
        const pending = optimisticStatusRef.current[String(order.id)];
        if (pending && (pending.status === order.status || ['COMPLETED', 'CANCELLED'].includes(order.status))) {
          delete optimisticStatusRef.current[String(order.id)];
        }
      });
      const optimisticStatuses = Object.fromEntries(Object.entries(optimisticStatusRef.current).map(([id, status]) => [id, typeof status === 'string' ? { status, expiresAt: Date.now() + 5000 } : status]));
      setOrderStore((previous) => mergeOrderList(previous, active, {
        startedAtSequence,
        latestSequenceById: latestSequenceByIdRef.current,
        latestRequest: requestId === fetchRequestRef.current,
        optimisticStatuses,
        activeStatuses: ['PAID', 'PREPARING', 'READY'],
      }));
      if (import.meta.env.DEV) active.forEach((order) => console.debug('[orders:fetch]', order.id));
    } catch (err) {
      if (controller.signal.aborted || err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      console.error(err);
      setError('Failed to fetch orders.');
    } finally {
      if (requestId === fetchRequestRef.current && mountedRef.current) setLoading(false);
    }
  }, []);

  const handleUpdateStatus = useCallback(async (orderId, nextStatus) => {
    if (pendingStatusOrderIds.has(orderId)) return;
    setPendingStatusOrderIds((prev) => new Set(prev).add(orderId));
    const previousOrder = orders.find((order) => order.id === orderId);
    optimisticStatusRef.current[orderId] = { status: nextStatus, expiresAt: Date.now() + 5000, previousOrder };
    latestSequenceByIdRef.current[String(orderId)] = ++latestSequenceRef.current;
    writeOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)), 'optimistic');
    api.put(`/orders/${orderId}/status`, { status: nextStatus })
      .then((response) => {
        delete optimisticStatusRef.current[orderId];
        const confirmedOrder = response.data?.order;
        if (confirmedOrder) {
          latestSequenceByIdRef.current[String(orderId)] = ++latestSequenceRef.current;
          setOrderStore((prev) => mergeOrderRecord(prev, confirmedOrder));
          if (import.meta.env.DEV) console.debug('[orders:fetch]', orderId);
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.error || 'Failed to update order status.');
        const optimistic = optimisticStatusRef.current[orderId];
        delete optimisticStatusRef.current[orderId];
        if (optimistic?.previousOrder) {
          latestSequenceByIdRef.current[String(orderId)] = ++latestSequenceRef.current;
          writeOrders((prev) => prev.map((order) => order.id === orderId ? optimistic.previousOrder : order), 'optimistic');
        }
        fetchActiveOrders();
      })
      .finally(() => {
        setPendingStatusOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      });
  }, [pendingStatusOrderIds, fetchActiveOrders, orders, writeOrders]);

  // Real-time socket updates for kitchen
  useEffect(() => {
    mountedRef.current = true;
    let debounceTimer;
    let pollTimer;
    const scheduleResync = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fetchActiveOrders(), 300);
    };
    const socket = getSocket();
    if (socket) {
      const handleOrderNew = (newOrder) => {
        if (newOrder.status === 'PAID') {
          latestSequenceByIdRef.current[String(newOrder.id)] = ++latestSequenceRef.current;
          playNotificationSoundRef.current();
          setNewOrderAlert(true);
          setOrderStore((prev) => mergeOrderRecord(prev, newOrder));
          if (import.meta.env.DEV) console.debug('[orders:socket]', newOrder.id);

          if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
          alertTimerRef.current = setTimeout(() => setNewOrderAlert(false), 5000);
        }
      };

      const handleOrderUpdate = (updatedOrder) => {
        if (isOrderDeletedEvent(updatedOrder)) {
          setOrderStore((prev) => removeDeletedOrders(prev, updatedOrder));
          return;
        }
        if (updatedOrder?.id == null) return;
        latestSequenceByIdRef.current[String(updatedOrder.id)] = ++latestSequenceRef.current;
        if (['COMPLETED', 'CANCELLED'].includes(updatedOrder.status)) {
          delete optimisticStatusRef.current[String(updatedOrder.id)];
          setOrderStore((prev) => { const next = { ...prev }; delete next[String(updatedOrder.id)]; return next; });
        } else if (['PAID', 'PREPARING', 'READY'].includes(updatedOrder.status)) {
          const optimistic = optimisticStatusRef.current[String(updatedOrder.id)];
          const statusOrder = ['PAID', 'PREPARING', 'READY', 'COMPLETED'];
          const confirmedOrAdvanced = optimistic && statusOrder.indexOf(updatedOrder.status) >= statusOrder.indexOf(optimistic.status);
          if (confirmedOrAdvanced || (optimistic && Date.now() >= optimistic.expiresAt)) delete optimisticStatusRef.current[String(updatedOrder.id)];
          setOrderStore((prev) => mergeOrderRecord(prev, updatedOrder, {
            optimisticStatus: optimistic?.status,
            preserveStatus: Boolean(optimistic && !confirmedOrAdvanced && Date.now() < optimistic.expiresAt),
          }));
        }
        if (import.meta.env.DEV) console.debug('[orders:socket]', updatedOrder.id);
      };

      const handleTableShift = (data) => {
        console.log('Kitchen received table shift event:', data);
        playNotificationSoundRef.current();
        setTableShiftAlert(`⚡ Table Shift Alert: Order ${data.orderNumber} shifted from ${data.oldTable} ➔ ${data.newTable}! Please serve to ${data.newTable}.`);
        if (shiftTimerRef.current) clearTimeout(shiftTimerRef.current);
        shiftTimerRef.current = setTimeout(() => setTableShiftAlert(''), 8000);
        scheduleResync();
      };

      const handleConnect = () => {
        scheduleResync();
        clearInterval(pollTimer);
        pollTimer = null;
      };
      const handleDisconnect = () => {
        if (!pollTimer) pollTimer = setInterval(fetchActiveOrders, 30000);
      };

      socket.on('order:new', handleOrderNew);
      socket.on('order:update', handleOrderUpdate);
      socket.on('table:shift', handleTableShift);
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      if (!socket.connected) handleDisconnect();
      scheduleResync();

      return () => {
        mountedRef.current = false;
        clearTimeout(debounceTimer);
        clearInterval(pollTimer);
        fetchControllerRef.current?.abort();
        socket.off('order:new', handleOrderNew);
        socket.off('order:update', handleOrderUpdate);
        socket.off('table:shift', handleTableShift);
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
        if (shiftTimerRef.current) clearTimeout(shiftTimerRef.current);
      };
    }
  }, [fetchActiveOrders]);

  // Filter orders by queue columns
  const paidOrders = useMemo(() => orders.filter((o) => o.status === 'PAID'), [orders]);
  const preparingOrders = useMemo(() => orders.filter((o) => o.status === 'PREPARING'), [orders]);
  const readyOrders = useMemo(() => orders.filter((o) => o.status === 'READY'), [orders]);

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
  }, [paidOrders, handleUpdateStatus, fetchActiveOrders]);



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
    return resolveTableLabel(typeof order === 'string' ? { tableNumber: order } : order);
  };

  // Compute delayed count
  const delayedCount = orders.filter((o) => {
    const diffMins = Math.max(0, Math.floor((new Date() - new Date(o.createdAt)) / 60000));
    return diffMins >= 15;
  }).length;

  return (
    <div className="responsive-shell staff-theme-root staff-kitchen-root min-h-screen text-[var(--text-main)] p-4 sm:p-6 flex flex-col space-y-5 relative overflow-x-hidden transition-colors duration-300 font-sans">
      <AppBackground />

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
      <div className="staff-kitchen-toolbar bg-[var(--card-bg)] border border-[var(--border-color)] p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 relative z-10">
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
            aria-label={soundEnabled ? 'Mute audio alerts' : 'Enable audio alerts'}
            className={`p-2 rounded-xl border transition-all cursor-pointer icon-btn ${
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
            disabled={loading}
            aria-label={loading ? 'Refreshing kitchen board' : 'Refresh kitchen board'}
            className="px-3 py-2 bg-[var(--card-bg)] hover:bg-white/[0.12] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 shadow-sm disabled:cursor-wait disabled:opacity-60"
            title="Refresh Board (Press R)"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Refreshing…' : 'Refresh Board'}</span>
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
