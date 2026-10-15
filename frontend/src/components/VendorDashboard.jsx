import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import AdminMenuView from './admin/views/AdminMenuView';
import {
  Check,
  X,
  ShieldAlert,
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  Banknote,
  Clock,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  Utensils,
  LogOut,
  Package,
  Search,
  Volume2,
  VolumeX,
  TrendingUp,
  FileText,
  DollarSign,
  Activity,
  Filter,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import DemoStatusBadge from './DemoStatusBadge';
import { paymentMethodLabel } from '../utils/paymentMethods';

const VendorDashboard = ({ user, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('vendor_activeTab') || 'verification'); // 'verification', 'active', 'menu'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Menu Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL', 'AVAILABLE', 'LOW_STOCK', 'DISABLED'

  // Payment availability settings state
  const [paymentSettings, setPaymentSettings] = useState({ codEnabled: true, onlineEnabled: true });

  // Receipt Modal viewer state
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Menu item CRUD modal states
  const [showModal, setShowModal] = useState(false); // false, 'add', 'edit'
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [savingMenuItem, setSavingMenuItem] = useState(false);

  const fileInputRef = useRef(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [pendingBase64, setPendingBase64] = useState(null);
  const [imageError, setImageError] = useState('');

  const [modalData, setModalData] = useState({
    id: null,
    name: '',
    price: '',
    type: 'food',
    category: 'Fast Food',
    stock: '50',
    prepTime: '5',
    imageUrl: '',
    description: '',
    isActive: true,
  });

  const showToast = (msg, type = 'success') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Synthesized Web Audio Chime Sound
  const playOrderChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn('Audio chime warning:', e);
    }
  };

  useEffect(() => {
    localStorage.setItem('vendor_activeTab', activeTab);
  }, [activeTab]);

  // Keyboard Hotkeys Listener (R to refresh, 1-3 to switch tabs, Esc to close modals)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === 'Escape') {
        setSelectedOrder(null);
        setShowModal(false);
        setDeleteConfirmItem(null);
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        fetchOrders();
        fetchMenu();
        fetchPaymentSettings();
        showToast('Dashboard data refreshed via hotkey (R)');
      } else if (e.key === '1') {
        setActiveTab('verification');
      } else if (e.key === '2') {
        setActiveTab('active');
      } else if (e.key === '3') {
        setActiveTab('menu');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchMenu();
    fetchPaymentSettings();

    const socket = getSocket();
    if (socket) {
      socket.on('order:new', (newOrder) => {
        playOrderChime();
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === newOrder.id);
          if (exists) return prev.map((o) => (o.id === newOrder.id ? newOrder : o));
          return [newOrder, ...prev];
        });
        showToast(`New Order #${newOrder.orderNumber || newOrder.id} received!`);
      });

      socket.on('order:update', (updatedOrder) => {
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === updatedOrder.id);
          if (exists) return prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
          return [updatedOrder, ...prev];
        });
      });

      socket.on('payment:verify', (updatedOrder) => {
        playOrderChime();
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === updatedOrder.id);
          if (exists) return prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
          return [updatedOrder, ...prev];
        });
        showToast(`Payment submitted for order #${updatedOrder.orderNumber || updatedOrder.id}`);
      });

      socket.on('paymentSettings:update', (updatedSettings) => {
        setPaymentSettings(updatedSettings);
      });

      socket.on('menu:update', () => {
        fetchMenu();
      });

      socket.on('inventory:update', () => {
        fetchMenu();
      });
    }

    return () => {
      if (socket) {
        socket.off('order:new');
        socket.off('order:update');
        socket.off('payment:verify');
        socket.off('paymentSettings:update');
        socket.off('menu:update');
        socket.off('inventory:update');
      }
    };
  }, [user, soundEnabled]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders');
      setOrders(response.data.orders);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch orders.');
    } fontFinally: {
      setLoading(false);
    }
  };

  const fetchMenu = async () => {
    try {
      const response = await api.get('/menu?all=true');
      setMenu(response.data.items);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPaymentSettings = async () => {
    try {
      const res = await api.get('/payments/settings');
      setPaymentSettings(res.data);
    } catch (e) {
      console.warn('Fetch payment settings warning:', e.message);
    }
  };

  const handleTogglePaymentSetting = async (key, newValue) => {
    try {
      const res = await api.put('/payments/settings', { [key]: newValue });
      setPaymentSettings(res.data.settings);
      const label = key === 'codEnabled' ? 'Pay at Counter (COD)' : 'Online Payment';
      showToast(`${label} is now ${newValue ? 'OPEN' : 'CLOSED'}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to update payment availability.');
    }
  };

  const [pendingVerifyingIds, setPendingVerifyingIds] = useState(new Set());

  const handleVerifyPayment = async (orderId) => {
    if (pendingVerifyingIds.has(orderId)) return;
    setPendingVerifyingIds((prev) => new Set(prev).add(orderId));
    setError('');

    // Snapshot previous order for rollback if API call fails
    const prevOrder = orders.find((o) => o.id === orderId);
    const optimisticUpdatedOrder = prevOrder
      ? { ...prevOrder, paymentStatus: 'VERIFIED', status: 'PAID' }
      : null;

    if (optimisticUpdatedOrder) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? optimisticUpdatedOrder : o)));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(optimisticUpdatedOrder);
      }
    }

    try {
      const response = await api.put(`/payments/${orderId}/verify`, { approve: true });
      const finalOrder = response.data.order;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? finalOrder : o)));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(finalOrder);
      }
      showToast(`Payment verified for order ${finalOrder.orderNumber || `#000${orderId}`}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to verify payment.');
      // Rollback optimistic change
      if (prevOrder) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? prevOrder : o)));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prevOrder);
        }
      }
    } finally {
      setPendingVerifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleRejectPayment = async (orderId) => {
    if (pendingVerifyingIds.has(orderId)) return;
    setPendingVerifyingIds((prev) => new Set(prev).add(orderId));
    setError('');

    const prevOrder = orders.find((o) => o.id === orderId);
    const optimisticUpdatedOrder = prevOrder
      ? { ...prevOrder, paymentStatus: 'FAILED', status: 'PAYMENT_FAILED' }
      : null;

    if (optimisticUpdatedOrder) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? optimisticUpdatedOrder : o)));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(optimisticUpdatedOrder);
      }
    }

    try {
      const response = await api.put(`/payments/${orderId}/verify`, {
        approve: false,
        reason: 'Payment verification rejected by staff.',
      });
      const finalOrder = response.data.order;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? finalOrder : o)));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(finalOrder);
      }
      showToast(`Payment rejected for order ${finalOrder.orderNumber || `#000${orderId}`}`, 'error');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to reject payment.');
      if (prevOrder) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? prevOrder : o)));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prevOrder);
        }
      }
    } finally {
      setPendingVerifyingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleUpdateStatus = async (orderId, nextStatus) => {
    setError('');
    const prevOrder = orders.find((o) => o.id === orderId);
    const optimisticUpdatedOrder = prevOrder ? { ...prevOrder, status: nextStatus } : null;

    if (optimisticUpdatedOrder) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? optimisticUpdatedOrder : o)));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(optimisticUpdatedOrder);
      }
    }

    try {
      const response = await api.put(`/orders/${orderId}/status`, { status: nextStatus });
      const finalOrder = response.data.order;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? finalOrder : o)));
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(finalOrder);
      }
      showToast(`Order status updated to ${nextStatus}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to update order status.');
      if (prevOrder) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? prevOrder : o)));
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prevOrder);
        }
      }
    }
  };

  const handleToggleMenu = async (itemId, currentActive) => {
    // Immediate Optimistic Update
    setMenu((prev) => prev.map((item) => (item.id === itemId ? { ...item, isActive: !currentActive } : item)));
    try {
      const response = await api.put(`/menu/${itemId}`, { isActive: !currentActive });
      setMenu((prev) => prev.map((item) => (item.id === itemId ? response.data.item : item)));
      showToast(`Menu item availability updated!`);
    } catch (err) {
      console.error(err);
      setMenu((prev) => prev.map((item) => (item.id === itemId ? { ...item, isActive: currentActive } : item)));
      showToast('Failed to toggle availability', 'error');
    }
  };

  const handleOpenAddModal = () => {
    setModalData({
      id: null,
      name: '',
      price: '',
      type: 'food',
      category: 'Fast Food',
      stock: '50',
      prepTime: '5',
      imageUrl: '',
      description: '',
      isActive: true,
    });
    setImagePreview(null);
    setPendingBase64(null);
    setImageError('');
    setShowModal('add');
  };

  const handleOpenEditModal = (item) => {
    setModalData({
      id: item.id,
      name: item.name,
      price: item.price.toString(),
      type: item.type || 'food',
      category: item.category || 'Fast Food',
      stock: item.stock.toString(),
      prepTime: (item.prepTime || 5).toString(),
      imageUrl: item.imageUrl || '',
      description: item.description || '',
      isActive: item.isActive !== false,
    });
    setImagePreview(item.imageUrl || null);
    setPendingBase64(null);
    setImageError('');
    setShowModal('edit');
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageError('');

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      const msg = 'Invalid file format. Only JPG, JPEG, PNG, and WEBP formats are supported.';
      setImageError(msg);
      showToast(msg, 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const msg = 'File size exceeds maximum allowed limit of 5MB.';
      setImageError(msg);
      showToast(msg, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setPendingBase64(base64String);
      setImagePreview(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setPendingBase64(null);
    setImagePreview(null);
    setModalData((prev) => ({ ...prev, imageUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmitMenuItem = async (e) => {
    e.preventDefault();
    setError('');
    setSavingMenuItem(true);

    try {
      let finalImageUrl = modalData.imageUrl?.trim() || null;

      if (pendingBase64) {
        const uploadRes = await api.post('/menu/upload-image', {
          imageBase64: pendingBase64,
        });
        finalImageUrl = uploadRes.data.imageUrl;
      }

      const payload = {
        name: modalData.name.trim(),
        price: parseFloat(modalData.price),
        type: modalData.type,
        category: modalData.category.trim(),
        stock: parseInt(modalData.stock, 10) || 0,
        prepTime: parseInt(modalData.prepTime, 10) || 5,
        imageUrl: finalImageUrl,
        description: modalData.description?.trim() || null,
        isActive: modalData.isActive,
      };

      if (showModal === 'add') {
        const response = await api.post('/menu', payload);
        setMenu((prev) => [response.data.item, ...prev]);
        showToast(`Menu item "${payload.name}" added successfully!`);
      } else if (showModal === 'edit') {
        const response = await api.put(`/menu/${modalData.id}`, payload);
        setMenu((prev) => prev.map((it) => (it.id === modalData.id ? response.data.item : it)));
        showToast(`Menu item "${payload.name}" updated successfully!`);
      }
      setShowModal(false);
      fetchMenu();
    } catch (err) {
      console.error('Submit menu error:', err);
      setError(err.response?.data?.error || 'Failed to save menu item.');
      showToast(err.response?.data?.error || 'Failed to save menu item.', 'error');
    } finally {
      setSavingMenuItem(false);
    }
  };

  const handleDeleteMenuItem = async () => {
    if (!deleteConfirmItem) return;
    try {
      await api.delete(`/menu/${deleteConfirmItem.id}`);
      setMenu((prev) => prev.filter((it) => it.id !== deleteConfirmItem.id));
      showToast(`Menu item "${deleteConfirmItem.name}" deleted successfully!`);
      setDeleteConfirmItem(null);
      fetchMenu();
    } catch (err) {
      console.error('Delete menu error:', err);
      setError(err.response?.data?.error || 'Failed to delete menu item.');
      showToast(err.response?.data?.error || 'Failed to delete menu item.', 'error');
    }
  };

  // Filter orders for Payment Verification Tab (both COD & Online)
  const verificationOrders = orders.filter(
    (o) =>
      ['PENDING', 'PAYMENT_PENDING'].includes(o.status) ||
      ['UNPAID', 'PENDING_VERIFICATION'].includes(o.paymentStatus)
  ).filter((o) => !['CANCELLED', 'COMPLETED', 'PAID', 'REFUNDED'].includes(o.status));

  const activeOrders = orders.filter((o) => ['PAID', 'PREPARING', 'READY'].includes(o.status));

  // Compute Live Metrics
  const metrics = useMemo(() => {
    const todaySales = orders
      .filter((o) => ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(o.status))
      .reduce((sum, o) => sum + (o.total || 0), 0);

    const lowStockCount = menu.filter((it) => (it.stock ?? 50) <= 5 && (it.stock ?? 50) > 0).length;
    const outOfStockCount = menu.filter((it) => (it.stock ?? 50) <= 0 || it.isActive === false).length;

    return {
      todaySales,
      activeCount: activeOrders.length,
      verificationCount: verificationOrders.length,
      lowStockCount,
      outOfStockCount,
    };
  }, [orders, menu, activeOrders, verificationOrders]);

  // Dynamic Categories Computation
  const categories = useMemo(() => {
    const cats = new Set(menu.map((it) => it.category || 'General'));
    return ['ALL', ...Array.from(cats)];
  }, [menu]);

  // Filtered Menu Items
  const filteredMenuItems = useMemo(() => {
    return menu.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;

      let matchesStock = true;
      if (stockFilter === 'AVAILABLE') {
        matchesStock = (item.stock ?? 50) > 0 && item.isActive !== false;
      } else if (stockFilter === 'LOW_STOCK') {
        matchesStock = (item.stock ?? 50) <= 5 && (item.stock ?? 50) > 0;
      } else if (stockFilter === 'DISABLED') {
        matchesStock = item.isActive === false || (item.stock ?? 50) <= 0;
      }

      return matchesSearch && matchesCat && matchesStock;
    });
  }, [menu, searchTerm, selectedCategory, stockFilter]);

  return (
    <div className="responsive-shell min-h-screen bg-[var(--bg-color)] text-[var(--text-main)] p-4 sm:p-6 relative selection:bg-[var(--sb-primary)]/30 font-sans">
      {/* Background radial glows */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--sb-primary)]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/4 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-5 relative z-10">

        {/* Mode Indicator & Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3 min-w-0">
            <ShoppingCart className="w-5 h-5 text-orange-400 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-black tracking-tight text-[var(--text-main)]">Point of Sale</h1>
              <p className="text-[10px] font-semibold text-[var(--text-muted)]">Orders, payments, and menu availability</p>
            </div>
          </div>
          <DemoStatusBadge user={user} />
        </div>

        {/* ── 1. LIVE KDS & REVENUE QUICK-STATS BAR ───────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          {/* Active Orders Queue */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-4 rounded-2xl flex items-center space-x-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[var(--sb-primary-warm)] flex items-center justify-center shrink-0">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider block">Active Queue</span>
              <strong className="text-lg font-black text-[var(--text-main)] font-mono">{metrics.activeCount} orders</strong>
            </div>
          </div>

          {/* Pending Verifications */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-4 rounded-2xl flex items-center space-x-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider block">Verifications</span>
              <strong className="text-lg font-black text-amber-400 font-mono">{metrics.verificationCount} pending</strong>
            </div>
          </div>

          {/* Today's Sales */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-4 rounded-2xl flex items-center space-x-3.5 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider block">Approved Sales</span>
              <strong className="text-lg font-black text-emerald-400 font-mono">Rs. {metrics.todaySales.toFixed(0)}</strong>
            </div>
          </div>

          {/* Live Socket & Audio Controls */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-4 rounded-2xl flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <div>
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider block">POS Live Sync</span>
                <span className="text-[11px] text-[var(--text-muted)] font-bold">Connected</span>
              </div>
            </div>

            <button
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                showToast(`Audio alerts ${!soundEnabled ? 'Enabled' : 'Disabled'}`);
              }}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                soundEnabled
                  ? 'bg-orange-500/15 border-orange-500/30 text-[var(--sb-primary-warm)]'
                  : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-muted)]'
              }`}
              title={soundEnabled ? 'Audio Alerts ON' : 'Audio Alerts OFF'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Toast Notification Banner */}
        {toastMessage && (
          <div
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between shadow-xl animate-fade-in ${
              toastMessage.type === 'error'
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}

        {/* System Error Message */}
        {error && (
          <div className="p-4 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-2xl text-xs font-bold flex items-center space-x-2 shadow-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── 2. PAYMENT METHOD CONTROL SECTION ───────────────────────────────── */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
            <h2 className="font-extrabold text-xs tracking-wider uppercase text-[var(--text-main)] font-display flex items-center space-x-2">
              <Banknote className="w-4 h-4 text-[var(--sb-primary)]" />
              <span>Payment Method Control</span>
            </h2>
            <span className="text-[11px] text-[var(--text-muted)] font-medium">Customer Checkout Availability</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pay at Counter (COD) Card */}
            <div className="p-4 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl flex items-center justify-between">
              <div className="space-y-1.5">
                <span className="text-sm font-bold text-[var(--text-main)]">💵 Pay at Counter (COD)</span>
                <div>
                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                      paymentSettings.codEnabled
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${paymentSettings.codEnabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span>{paymentSettings.codEnabled ? 'OPEN' : 'CLOSED'}</span>
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleTogglePaymentSetting('codEnabled', !paymentSettings.codEnabled)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  paymentSettings.codEnabled
                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                }`}
              >
                {paymentSettings.codEnabled ? 'Close COD' : 'Open COD'}
              </button>
            </div>

            {/* Online Payment Card */}
            <div className="p-4 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl flex items-center justify-between">
              <div className="space-y-1.5">
                <span className="text-sm font-bold text-[var(--text-main)]">🌐 Online Payment</span>
                <div>
                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                      paymentSettings.onlineEnabled
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${paymentSettings.onlineEnabled ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span>{paymentSettings.onlineEnabled ? 'OPEN' : 'CLOSED'}</span>
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleTogglePaymentSetting('onlineEnabled', !paymentSettings.onlineEnabled)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  paymentSettings.onlineEnabled
                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                }`}
              >
                {paymentSettings.onlineEnabled ? 'Close Online' : 'Open Online'}
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. SEGMENTED NAVIGATION TABS ────────────────────────────────────── */}
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-1.5 rounded-2xl shadow-xl">
          <div className="flex flex-col sm:flex-row gap-1.5 w-full">
            {[
              { id: 'verification', label: 'Payment Verifications (Hotkey 1)', count: verificationOrders.length },
              { id: 'active', label: 'Audit Order Queue (Hotkey 2)', count: activeOrders.length },
              { id: 'menu', label: 'Menu Availability (Hotkey 3)', count: null },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[var(--sb-primary)] text-white shadow-lg shadow-[var(--sb-primary)]/20 border border-[var(--sb-primary-warm)]/30'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--card-bg)]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-black ${
                      activeTab === tab.id
                        ? 'bg-white/20 text-white'
                        : 'bg-white/[0.08] text-orange-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB 1: PAYMENT VERIFICATIONS ────────────────────────────────────── */}
        {activeTab === 'verification' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {verificationOrders.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-[var(--card-bg)]/60 border border-[var(--border-color)] border-dashed rounded-3xl">
                <ShieldAlert className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-[var(--text-main)]">No Pending Verifications</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
                  Orders with pending cash or mobile wallet payment details will appear here.
                </p>
              </div>
            ) : (
              verificationOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--sb-primary)]/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg hover:shadow-2xl transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono tracking-wider">ORDER NUMBER</span>
                        <h4 className="font-extrabold text-[var(--text-main)] text-base font-mono">{order.orderNumber || `#000${order.id}`}</h4>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase ${
                          order.paymentMethod === 'COD'
                            ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                            : 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                        }`}
                      >
                        {paymentMethodLabel(order.paymentMethod)}
                      </span>
                    </div>

                    <div className="p-3.5 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)] space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--text-muted)]">TxID Ref:</span>
                        <strong className="text-[var(--text-main)] font-mono select-all bg-[var(--card-bg)] px-2 py-0.5 rounded border border-[var(--border-color)]">
                          {order.paymentTxId || 'COD / N/A'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Customer:</span>
                        <strong className="text-[var(--text-main)]">{order.user?.name || 'Guest'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Location / Table:</span>
                        <strong className="text-[var(--text-main)]">{order.tableNumber || order.tableId || 'Takeaway'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Payment Status:</span>
                        <strong className="text-amber-400 font-bold uppercase text-[11px]">{order.paymentStatus}</strong>
                      </div>
                    </div>

                    <div className="text-sm font-extrabold flex justify-between items-center pt-1">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-xs text-orange-400 hover:text-orange-300 font-bold flex items-center space-x-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </button>
                      <span className="text-lg text-emerald-400 font-mono">Rs. {Number(order.total || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex space-x-3 pt-2">
                    <button
                      onClick={() => handleRejectPayment(order.id)}
                      className="flex-1 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                    <button
                      onClick={() => handleVerifyPayment(order.id)}
                      className="flex-1 py-2.5 bg-[var(--sb-primary)] hover:bg-[var(--sb-primary-hover)] text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center space-x-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Verify &amp; Approve</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── TAB 2: AUDIT ORDER QUEUE ────────────────────────────────────────── */}
        {activeTab === 'active' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeOrders.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-[var(--card-bg)]/60 border border-[var(--border-color)] border-dashed rounded-3xl">
                <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-[var(--text-main)]">Active Queue Empty</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
                  Active paid and preparing orders will appear here as they flow from the kitchen.
                </p>
              </div>
            ) : (
              activeOrders.map((order) => (
                <div
                  key={order.id}
                  className="bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--sb-primary)]/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                >
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono tracking-wider">ORDER NUMBER</span>
                        <h4 className="font-extrabold text-[var(--text-main)] text-base font-mono">{order.orderNumber || `#000${order.id}`}</h4>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                          order.status === 'PAID'
                            ? 'text-orange-400 bg-orange-500/15 border-orange-500/25'
                            : order.status === 'PREPARING'
                            ? 'text-orange-400 bg-orange-500/15 border-orange-500/25'
                            : 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25 animate-pulse'
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <div className="text-xs text-[var(--text-main)] space-y-2 bg-[var(--bg-color)] p-3.5 rounded-xl border border-[var(--border-color)]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Customer:</span>
                        <strong className="text-[var(--text-main)]">{order.user?.name || 'Guest'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Location / Table:</span>
                        <strong className="text-[var(--text-main)]">{order.tableNumber || order.tableId || 'Takeaway'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Items Count:</span>
                        <strong className="text-orange-400">
                          {order.orderItems?.reduce((acc, it) => acc + it.quantity, 0) || 0} items
                        </strong>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-xs text-orange-400 hover:text-orange-300 font-bold flex items-center space-x-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </button>
                      <span className="text-base font-extrabold text-emerald-400 font-mono">Rs. {Number(order.total || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex space-x-3 pt-2">
                    {/* Send to Kitchen button commented out as orders flow automatically to kitchen */}
                    {/* {order.status === 'PAID' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                        className="w-full py-2.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Send to Kitchen →
                      </button>
                    )} */}
                    {order.status === 'READY' && (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'COMPLETED')}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                      >
                        Mark Handed Over &amp; Complete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── TAB 3: MENU AVAILABILITY (SHARED ENHANCED ADMIN MENU VIEW) ──────────── */}
        {activeTab === 'menu' && (
          <AdminMenuView inventory={menu} onRefresh={fetchMenu} showToast={showToast} />
        )}
      </div>

      {/* RECEIPT / ORDER DETAILS MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-white/[0.1] rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <span className="text-[10px] text-[var(--text-muted)] font-mono tracking-wider block">ORDER RECEIPT</span>
                <h3 className="text-base font-extrabold text-[var(--text-main)] font-mono">
                  {selectedOrder.orderNumber || `#000${selectedOrder.id}`}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-xl bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[var(--bg-color)] p-3.5 rounded-xl border border-[var(--border-color)] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Customer:</span>
                  <strong className="text-[var(--text-main)]">{selectedOrder.user?.name || 'Guest'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Table Placement:</span>
                  <strong className="text-[var(--text-main)]">{selectedOrder.tableNumber || selectedOrder.tableId || 'Takeaway'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Payment Method:</span>
                  <strong className="text-orange-400 uppercase">{paymentMethodLabel(selectedOrder.paymentMethod)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Payment Status:</span>
                  <strong className="text-amber-400 font-bold uppercase">{selectedOrder.paymentStatus}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Order Status:</span>
                  <strong className="text-emerald-400 font-bold uppercase">{selectedOrder.status}</strong>
                </div>
              </div>

              {/* Itemized Breakdown */}
              <div className="space-y-2">
                <span className="text-[11px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider block">Itemized Summary</span>
                <div className="bg-[var(--bg-color)] p-3.5 rounded-xl border border-[var(--border-color)] space-y-2">
                  {selectedOrder.orderItems && selectedOrder.orderItems.length > 0 ? (
                    selectedOrder.orderItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs border-b border-[var(--border-color)] pb-1.5 last:border-none last:pb-0">
                        <span className="text-[var(--text-main)] font-medium">
                          {item.quantity} × {item.name || item.menuItem?.name || 'Dish'}
                        </span>
                        <span className="text-emerald-400 font-mono">
                          Rs. {((item.price || item.menuItem?.price || 0) * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[var(--text-muted)] text-center py-2">Item details loaded.</p>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center text-sm font-extrabold border-t border-[var(--border-color)]">
                <span className="text-[var(--text-muted)]">Total Charged:</span>
                <span className="text-lg text-emerald-400 font-mono">Rs. {Number(selectedOrder.total || 0).toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full py-2.5 bg-[var(--sb-primary)] hover:bg-[var(--sb-primary-hover)] text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Menu Item Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-white/[0.1] rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-4">
              <h3 className="text-lg font-extrabold text-[var(--text-main)] font-display">
                {showModal === 'edit' ? 'Edit Menu Item' : 'Add New Menu Item'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitMenuItem} className="space-y-4 text-xs">
              {/* IMAGE MANAGEMENT SECTION */}
              <div className="space-y-2">
                <label className="block font-bold text-[var(--text-muted)] uppercase">Dish Image</label>
                <div className="p-4 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)] space-y-3">
                  {imagePreview ? (
                    <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden border border-[var(--border-color)] group">
                      <img src={imagePreview} alt="Dish Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-[var(--sb-primary)] text-white rounded-lg text-xs font-bold shadow-md cursor-pointer flex items-center space-x-1"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Replace Image</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer flex items-center space-x-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove Image</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 border-2 border-dashed border-white/[0.1] rounded-xl text-center space-y-2">
                      <ImageIcon className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-60" />
                      <p className="text-xs text-[var(--text-muted)] font-medium">No custom image selected (Using fallback image system)</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-[var(--sb-primary)] hover:bg-[var(--sb-primary-hover)] text-white rounded-xl font-bold text-xs cursor-pointer shadow-md inline-flex items-center space-x-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Image</span>
                      </button>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageFileChange}
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                  />

                  {imageError && (
                    <p className="text-rose-400 font-bold text-[11px] flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{imageError}</span>
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={modalData.name}
                  onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                  placeholder="e.g. Zinger Burger"
                  className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--sb-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Category *</label>
                  <input
                    type="text"
                    required
                    value={modalData.category}
                    onChange={(e) => setModalData({ ...modalData, category: e.target.value })}
                    placeholder="e.g. Fast Food"
                    className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--sb-primary)]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Price (Rs.) *</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={modalData.price}
                    onChange={(e) => setModalData({ ...modalData, price: e.target.value ? Math.floor(Math.abs(Number(e.target.value))) : '' })}
                    placeholder="250"
                    className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--sb-primary)] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Prep Time (mins)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={modalData.prepTime}
                    onChange={(e) => setModalData({ ...modalData, prepTime: e.target.value ? Math.floor(Math.abs(Number(e.target.value))) : '' })}
                    className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--sb-primary)] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Stock</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={modalData.stock}
                    onChange={(e) => setModalData({ ...modalData, stock: e.target.value ? Math.floor(Math.abs(Number(e.target.value))) : '' })}
                    className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--sb-primary)] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  value={modalData.description}
                  onChange={(e) => setModalData({ ...modalData, description: e.target.value })}
                  placeholder="Short product description..."
                  className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--sb-primary)]"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="availCheckVendor"
                  checked={modalData.isActive}
                  onChange={(e) => setModalData({ ...modalData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-[var(--sb-primary)] cursor-pointer"
                />
                <label htmlFor="availCheckVendor" className="font-bold text-[var(--text-main)] cursor-pointer">
                  Available for Customer Ordering
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-[var(--card-bg)] text-[var(--text-muted)] font-bold hover:text-[var(--text-main)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMenuItem}
                  className="px-5 py-2 rounded-xl bg-[var(--sb-primary)] hover:bg-[var(--sb-primary-hover)] text-white font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  {savingMenuItem && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingMenuItem ? 'Saving...' : 'Save Item'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-white/[0.1] rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scale-up text-center">
            <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[var(--text-main)] font-display">Delete Menu Item?</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                Are you sure you want to delete <strong className="text-[var(--text-main)]">{deleteConfirmItem.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-color)]">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                className="py-2.5 bg-[var(--card-bg)] hover:bg-white/[0.12] text-[var(--text-main)] font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMenuItem}
                className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
