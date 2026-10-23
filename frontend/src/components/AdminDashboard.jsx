import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getSocket } from '../services/socket';
import AdminLayout from './admin/AdminLayout';
import PersistentErrorDialog from './common/PersistentErrorDialog';

// Import Views
const AdminHomeView = lazy(() => import('./admin/views/AdminHomeView'));
const AdminOrdersView = lazy(() => import('./admin/views/AdminOrdersView'));
const AdminPaymentsView = lazy(() => import('./admin/views/AdminPaymentsView'));
const AdminMenuView = lazy(() => import('./admin/views/AdminMenuView'));
const AdminInventoryView = lazy(() => import('./admin/views/AdminInventoryView'));
const AdminStaffView = lazy(() => import('./admin/views/AdminStaffView'));
const AdminCustomersView = lazy(() => import('./admin/views/AdminCustomersView'));
const AdminTablesQRView = lazy(() => import('./admin/views/AdminTablesQRView'));
const AdminPaymentAvailabilityView = lazy(() => import('./admin/views/AdminPaymentAvailabilityView'));
const AdminKitchenMonitorView = lazy(() => import('./admin/views/AdminKitchenMonitorView'));
const AdminAIInsightsView = lazy(() => import('./admin/views/AdminAIInsightsView'));
const AdminReportsView = lazy(() => import('./admin/views/AdminReportsView'));
const AdminNotificationsView = lazy(() => import('./admin/views/AdminNotificationsView'));
const AdminAuditLogsView = lazy(() => import('./admin/views/AdminAuditLogsView'));
const AdminOrderStatusHistoryView = lazy(() => import('./admin/views/AdminOrderStatusHistoryView'));
const AdminBranchesView = lazy(() => import('./admin/views/AdminBranchesView'));

const AdminDashboard = ({ user, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL path
  const subPath = location.pathname.replace(/^\/admin\/?/, '');
  const activeTab = subPath || 'dashboard';

  const handleSelectTab = (tabId, context = null) => {
    if (tabId === 'inventory') setInventoryFocus(context?.itemId ? context : null);
    if (tabId === 'dashboard') navigate('/admin');
    else navigate(`/admin/${tabId}`);
  };

  const [period, setPeriod] = useState('all');
  const [dashboardDateRange, setDashboardDateRange] = useState(null);
  const [dashboardDatePreset, setDashboardDatePreset] = useState('ALL');
  const [dashboardCustomFrom, setDashboardCustomFrom] = useState('');
  const [dashboardCustomTo, setDashboardCustomTo] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertsContext, setAlertsContext] = useState(null);
  const [adminOrders, setAdminOrders] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forecastingLoading, setForecastingLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [persistentError, setPersistentError] = useState(null);
  const [inventoryFocus, setInventoryFocus] = useState(null);
  const statsRequestRef = useRef(0);
  const statsAbortRef = useRef(null);
  const statsFetchInProgressRef = useRef(false);
  const statsRequestKeyRef = useRef('');
  const statsRefreshQueuedRef = useRef(false);
  const statsRefreshTimerRef = useRef(null);
  const ordersRequestRef = useRef(0);
  const ordersAbortRef = useRef(null);
  const activeDataRequestRef = useRef(0);
  const activeDataAbortRef = useRef(null);
  const realtimeRefreshTimerRef = useRef(null);
  const realtimeSourcesRef = useRef(new Set());

  const showToast = useCallback((msg, type = 'success') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const showErrorDialog = useCallback((errorConfig) => {
    if (!errorConfig) {
      setPersistentError(null);
      return;
    }
    if (typeof errorConfig === 'string') {
      setPersistentError({ message: errorConfig, title: 'Action Failed' });
    } else {
      setPersistentError(errorConfig);
    }
  }, []);

  const refreshBranchOptions = async () => {
    try {
      const res = await api.get('/admin/branches');
      const nextBranches = res.data.branches || [];
      setBranches(nextBranches);
      setSelectedBranchId((currentId) => (
        currentId === 'all' || nextBranches.some((branch) => branch.isActive !== false && String(branch.id) === String(currentId))
          ? currentId
          : 'all'
      ));
    } catch (err) {
      console.error('Refresh branches error:', err);
    }
  };

  useEffect(() => {
    refreshBranchOptions();
  }, []);

  const refreshDashboardStats = useCallback(async ({ force = false } = {}) => {
    const bQuery = selectedBranchId && selectedBranchId !== 'all' ? `&branchId=${selectedBranchId}` : '';
    const rangeQuery = dashboardDateRange
      ? `&from=${dashboardDateRange.from || ''}&to=${dashboardDateRange.to || ''}`
      : '';
    const refreshQuery = force ? '&refresh=true' : '';
    const requestUrl = `/admin/stats?period=${period}${bQuery}${rangeQuery}${refreshQuery}`;

    if (statsFetchInProgressRef.current && statsRequestKeyRef.current === requestUrl) {
      // Reuse an in-flight request, then run one fresh request if a forced refresh arrives meanwhile.
      if (force) statsRefreshQueuedRef.current = true;
      return;
    }

    statsAbortRef.current?.abort();
    window.clearTimeout(statsRefreshTimerRef.current);
    const controller = new AbortController();
    statsAbortRef.current = controller;
    const requestId = ++statsRequestRef.current;

    setStatsLoading(true);
    setStatsError('');
    statsRefreshQueuedRef.current = false;
    statsFetchInProgressRef.current = true;
    statsRequestKeyRef.current = requestUrl;
    let requestSucceeded = false;
    try {
      const response = await api.get(requestUrl, { signal: controller.signal, timeout: 8000 });
      if (requestId === statsRequestRef.current) {
        setStats(response.data);
        requestSucceeded = true;
      }
    } catch (error) {
      if (requestId !== statsRequestRef.current || controller.signal.aborted) return;
      console.error('Fetch stats error:', error);
      setStatsError(error.response?.data?.message || error.response?.data?.error || error.message || 'Could not load dashboard analytics.');
    } finally {
      if (requestId === statsRequestRef.current) {
        setStatsLoading(false);
        statsFetchInProgressRef.current = false;
        statsRequestKeyRef.current = '';
        if (statsRefreshQueuedRef.current && requestSucceeded) {
          statsRefreshQueuedRef.current = false;
          statsRefreshTimerRef.current = window.setTimeout(() => refreshDashboardStats({ force: true }), 100);
        }
      }
    }
  }, [dashboardDateRange, period, selectedBranchId]);

  useEffect(() => () => {
    statsRequestRef.current += 1;
    statsAbortRef.current?.abort();
    statsFetchInProgressRef.current = false;
    statsRequestKeyRef.current = '';
    statsRefreshQueuedRef.current = false;
    ordersRequestRef.current += 1;
    ordersAbortRef.current?.abort();
    window.clearTimeout(realtimeRefreshTimerRef.current);
  }, []);

  const refreshAdminOrders = useCallback(async () => {
    ordersAbortRef.current?.abort();
    const controller = new AbortController();
    ordersAbortRef.current = controller;
    const requestId = ++ordersRequestRef.current;
    const bQuery = selectedBranchId && selectedBranchId !== 'all' ? `&branchId=${selectedBranchId}` : '';
    try {
      const response = await api.get(`/orders?period=${period}${bQuery}`, { signal: controller.signal, timeout: 8000 });
      if (requestId === ordersRequestRef.current) setAdminOrders(response.data?.orders || []);
    } catch (error) {
      if (requestId !== ordersRequestRef.current || controller.signal.aborted) return;
      console.error('Fetch orders error:', error);
    }
  }, [period, selectedBranchId]);

  const refreshActiveTabData = useCallback(async ({ forceStats = false, source = 'manual' } = {}) => {
    const bQuery = selectedBranchId && selectedBranchId !== 'all' ? `&branchId=${selectedBranchId}` : '';
    const bQuerySingle = selectedBranchId && selectedBranchId !== 'all' ? `?branchId=${selectedBranchId}` : '';
    const orderTabs = ['payments', 'kitchen', 'reports', 'notifications'];
    const statsTabs = ['dashboard', 'ai-insights', 'reports', 'notifications'];
    const isSocketRefresh = source !== 'manual';
    if (isSocketRefresh) {
      const relevant = source === 'connect'
        || source === 'batch'
        || (source === 'orders' && (statsTabs.includes(activeTab) || orderTabs.includes(activeTab)))
        || (source === 'inventory' && ['dashboard', 'ai-insights', 'inventory', 'menu', 'reports', 'notifications'].includes(activeTab))
        || (source === 'menu' && ['dashboard', 'ai-insights', 'menu', 'reports'].includes(activeTab));
      if (!relevant) return;
    }
    const requestId = ++activeDataRequestRef.current;
    activeDataAbortRef.current?.abort();
    const controller = new AbortController();
    activeDataAbortRef.current = controller;
    setLoading(true);
    try {
      const loadStats = () => refreshDashboardStats({ force: forceStats });
      const loadOrders = () => refreshAdminOrders();
      const loadInventory = async () => {
        const response = await api.get(`/inventory${bQuerySingle}`, { signal: controller.signal });
        if (requestId === activeDataRequestRef.current) setInventory(response.data.items || []);
      };
      const loadMenu = async () => {
        const response = await api.get(`/menu?all=true${bQuery}`, { signal: controller.signal });
        if (requestId === activeDataRequestRef.current) setMenuItems(response.data.items || []);
      };
      const loadLogs = async () => {
        const response = await api.get('/inventory/logs', { signal: controller.signal });
        if (requestId === activeDataRequestRef.current) setLogs(response.data.logs || []);
      };
      const loadAlerts = async () => {
        const response = await api.get('/inventory/alerts', { signal: controller.signal });
        if (requestId === activeDataRequestRef.current) {
          setAlerts(response.data.alerts || []);
          setAlertsContext(response.data.context || null);
        }
      };
      const loadAuditLogs = async () => {
        const response = await api.get('/admin/audit-logs', { signal: controller.signal });
        if (requestId === activeDataRequestRef.current) setAuditLogs(response.data.logs || []);
      };

      const tasks = [];
      if (statsTabs.includes(activeTab)) tasks.push(loadStats());
      if (orderTabs.includes(activeTab)) tasks.push(loadOrders());
      if (['menu'].includes(activeTab)) tasks.push(loadMenu());
      if (['inventory'].includes(activeTab)) tasks.push(loadInventory(), loadLogs());
      if (['ai-insights'].includes(activeTab)) tasks.push(loadAlerts());
      if (['reports'].includes(activeTab)) tasks.push(loadInventory());
      if (['audit-logs'].includes(activeTab)) tasks.push(loadAuditLogs());
      const results = await Promise.allSettled(tasks);
      results.forEach((result) => {
        if (result.status === 'rejected' && !controller.signal.aborted) {
          console.error(`Admin ${activeTab} data refresh failed:`, result.reason);
        }
      });
    } finally {
      if (requestId === activeDataRequestRef.current) setLoading(false);
    }
  }, [activeTab, refreshAdminOrders, refreshDashboardStats, selectedBranchId]);

  const fetchDashboardData = useCallback((options = {}) => (
    refreshActiveTabData({ ...options, forceStats: options.forceStats ?? true })
  ), [refreshActiveTabData]);

  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      refreshActiveTabData();
    }
    return () => {
      activeDataRequestRef.current += 1;
      activeDataAbortRef.current?.abort();
      ordersRequestRef.current += 1;
      ordersAbortRef.current?.abort();
    };
  }, [user, refreshActiveTabData]);

  // Real-time socket sync
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const pendingRealtimeSources = realtimeSourcesRef.current;
      const scheduleRealtimeSync = (source) => {
        pendingRealtimeSources.add(source);
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = window.setTimeout(() => {
          realtimeRefreshTimerRef.current = null;
          const sources = Array.from(pendingRealtimeSources);
          pendingRealtimeSources.clear();
          if (user && user.role === 'ADMIN') {
            const sourceToRefresh = sources.includes('connect')
              ? 'connect'
              : (sources.length > 1 ? 'batch' : sources[0]);
            refreshActiveTabData({ source: sourceToRefresh });
          }
        }, 300);
      };
      const createRealtimeHandler = (source) => () => {
        if (user && user.role === 'ADMIN') {
          scheduleRealtimeSync(source);
        }
      };

      const handleOrderSync = createRealtimeHandler('orders');
      const handleInventorySync = createRealtimeHandler('inventory');
      const handleMenuSync = createRealtimeHandler('menu');
      const handleConnectSync = createRealtimeHandler('connect');
      socket.on('order:new', handleOrderSync);
      socket.on('order:update', handleOrderSync);
      socket.on('payment:verify', handleOrderSync);
      socket.on('inventory:update', handleInventorySync);
      socket.on('menu:update', handleMenuSync);
      socket.on('connect', handleConnectSync);

      return () => {
        socket.off('order:new', handleOrderSync);
        socket.off('order:update', handleOrderSync);
        socket.off('payment:verify', handleOrderSync);
        socket.off('inventory:update', handleInventorySync);
        socket.off('menu:update', handleMenuSync);
        socket.off('connect', handleConnectSync);
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
        pendingRealtimeSources.clear();
      };
    }
  }, [user, refreshActiveTabData]);

  const handleRecalculateAI = async () => {
    setForecastingLoading(true);
    try {
      await api.post('/inventory/recalculate-forecasts');
      const alertsRes = await api.get('/inventory/alerts');
      setAlerts(alertsRes.data.alerts || []);
      setAlertsContext(alertsRes.data.context || null);
      showToast('AI Demand forecasts recalculated successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to recalculate forecasts', 'error');
    } finally {
      setForecastingLoading(false);
    }
  };

  return (
    <AdminLayout
      activeTab={activeTab}
      onSelectTab={handleSelectTab}
      user={user}
      onLogout={onLogout}
      onRefresh={() => fetchDashboardData({ forceStats: true })}
      refreshing={loading}
      branches={branches}
      selectedBranchId={selectedBranchId}
      onSelectBranch={setSelectedBranchId}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-2xl font-bold text-xs border backdrop-blur-md animate-slide-down ${
            toastMessage.type === 'error'
              ? 'bg-rose-500/90 text-white border-rose-400/40'
              : 'bg-emerald-600/90 text-white border-emerald-400/40'
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Each admin view is loaded on demand so unrelated screens don't inflate startup. */}
      <Suspense fallback={(
        <div className="min-h-[220px] rounded-2xl bg-[var(--surface-2)] animate-pulse" role="status" aria-label="Loading admin section" />
      )}>
      {activeTab === 'dashboard' && (
        <AdminHomeView
          stats={stats}
          statsLoading={statsLoading}
          statsError={statsError}
          onRetry={refreshDashboardStats}
          setPeriod={setPeriod}
          datePreset={dashboardDatePreset}
          setDatePreset={setDashboardDatePreset}
          customFrom={dashboardCustomFrom}
          customTo={dashboardCustomTo}
          onCustomRangeChange={(from, to) => {
            setDashboardCustomFrom(from);
            setDashboardCustomTo(to);
            if (from || to) setDashboardDateRange({ from, to });
          }}
          onDateRangeChange={setDashboardDateRange}
          onNavigate={handleSelectTab}
          onRecalculateAI={handleRecalculateAI}
          forecastingLoading={forecastingLoading}
        />
      )}

      {activeTab === 'orders' && (
        <AdminOrdersView selectedBranchId={selectedBranchId} onRefresh={fetchDashboardData} showToast={showToast} />
      )}

      {activeTab === 'payments' && (
        <AdminPaymentsView orders={adminOrders} onRefresh={fetchDashboardData} showToast={showToast} />
      )}

      {activeTab === 'menu' && (
        <AdminMenuView inventory={menuItems} onRefresh={fetchDashboardData} showToast={showToast} />
      )}

      {activeTab === 'inventory' && (
        <AdminInventoryView
          inventory={inventory}
          logs={logs}
          onRefresh={fetchDashboardData}
          showToast={showToast}
          showErrorDialog={showErrorDialog}
          focusRequest={inventoryFocus}
          onFocusHandled={() => setInventoryFocus(null)}
        />
      )}

      {activeTab === 'staff' && <AdminStaffView showToast={showToast} />}

      {activeTab === 'customers' && <AdminCustomersView showToast={showToast} />}

      {activeTab === 'tables' && <AdminTablesQRView showToast={showToast} />}

      {activeTab === 'payment-availability' && <AdminPaymentAvailabilityView showToast={showToast} />}

      {activeTab === 'kitchen' && <AdminKitchenMonitorView orders={adminOrders} />}

      {activeTab === 'ai-insights' && (
        <AdminAIInsightsView
          stats={stats}
          alerts={alerts}
          alertsContext={alertsContext}
          selectedBranchId={selectedBranchId}
          onRecalculateAI={handleRecalculateAI}
          forecastingLoading={forecastingLoading}
        />
      )}

      {activeTab === 'reports' && (
        <AdminReportsView
          stats={stats}
          orders={adminOrders}
          inventory={inventory}
          branches={branches}
          selectedBranchId={selectedBranchId}
          period={period}
          setPeriod={setPeriod}
          onRefresh={fetchDashboardData}
          showToast={showToast}
        />
      )}

      {activeTab === 'notifications' && (
        <AdminNotificationsView stats={stats} orders={adminOrders} onNavigate={handleSelectTab} />
      )}

      {activeTab === 'audit-logs' && (
        <AdminAuditLogsView
          logs={auditLogs}
          loading={loading && auditLogs.length === 0}
          onRefresh={fetchDashboardData}
          showToast={showToast}
        />
      )}

      {activeTab === 'order-history' && <AdminOrderStatusHistoryView showToast={showToast} />}

      {activeTab === 'branches' && <AdminBranchesView showToast={showToast} onBranchesChanged={refreshBranchOptions} />}
      </Suspense>

      {/* Persistent Error Dialog for Critical Issues (e.g. Incompatible Units, DB failures) */}
      <PersistentErrorDialog
        isOpen={Boolean(persistentError)}
        title={persistentError?.title || 'Action Could Not Be Completed'}
        message={persistentError?.message || ''}
        itemName={persistentError?.itemName}
        fromUnit={persistentError?.fromUnit}
        toUnit={persistentError?.toUnit}
        missingConfig={persistentError?.missingConfig}
        details={persistentError?.details}
        onClose={() => setPersistentError(null)}
        onRetry={persistentError?.onRetry}
        onConfigure={persistentError?.onConfigure}
        actionLabel={persistentError?.actionLabel}
        onAction={persistentError?.onAction}
      />
    </AdminLayout>
  );
};

export default AdminDashboard;
