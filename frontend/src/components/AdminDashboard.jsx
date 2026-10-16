import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getSocket } from '../services/socket';
import AdminLayout from './admin/AdminLayout';

// Import Views
import AdminHomeView from './admin/views/AdminHomeView';
import AdminOrdersView from './admin/views/AdminOrdersView';
import AdminPaymentsView from './admin/views/AdminPaymentsView';
import AdminMenuView from './admin/views/AdminMenuView';
import AdminInventoryView from './admin/views/AdminInventoryView';
import AdminStaffView from './admin/views/AdminStaffView';
import AdminCustomersView from './admin/views/AdminCustomersView';
import AdminTablesQRView from './admin/views/AdminTablesQRView';
import AdminPaymentAvailabilityView from './admin/views/AdminPaymentAvailabilityView';
import AdminKitchenMonitorView from './admin/views/AdminKitchenMonitorView';
import AdminAIInsightsView from './admin/views/AdminAIInsightsView';
import AdminReportsView from './admin/views/AdminReportsView';
import AdminNotificationsView from './admin/views/AdminNotificationsView';
import AdminAuditLogsView from './admin/views/AdminAuditLogsView';
import AdminOrderStatusHistoryView from './admin/views/AdminOrderStatusHistoryView';
import AdminBranchesView from './admin/views/AdminBranchesView';

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
  const [inventoryFocus, setInventoryFocus] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 3500);
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

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);

    const bQuery = selectedBranchId && selectedBranchId !== 'all' ? `&branchId=${selectedBranchId}` : '';
    const bQuerySingle = selectedBranchId && selectedBranchId !== 'all' ? `?branchId=${selectedBranchId}` : '';

    const rangeQuery = dashboardDateRange
      ? `&from=${dashboardDateRange.from || ''}&to=${dashboardDateRange.to || ''}`
      : '';
    try {
      await Promise.all([
        api.get(`/admin/stats?period=${period}${bQuery}${rangeQuery}`)
          .then(res => setStats(res.data))
          .catch(err => console.error('Fetch stats error:', err)),
        api.get(`/menu?all=true${bQuery}`)
          .then(res => setMenuItems(res.data.items || []))
          .catch(err => console.error('Fetch menu error:', err)),
        api.get(`/inventory${bQuerySingle}`)
          .then(res => setInventory(res.data.items || []))
          .catch(err => console.error('Fetch inventory error:', err)),
        api.get(`/orders?period=${period}${bQuery}`)
          .then(res => setAdminOrders(res.data.orders || []))
          .catch(err => console.error('Fetch orders error:', err)),
        api.get('/inventory/logs')
          .then(res => setLogs(res.data.logs || []))
          .catch(err => console.error('Fetch logs error:', err)),
        api.get('/inventory/alerts')
          .then(res => {
            setAlerts(res.data.alerts || []);
            setAlertsContext(res.data.context || null);
          })
          .catch(err => console.error('Fetch alerts error:', err)),
        api.get('/admin/audit-logs')
          .then(res => setAuditLogs(res.data.logs || []))
          .catch(err => console.error('Fetch audit logs error:', err)),
      ]);
    } finally {
      setLoading(false);
    }
  }, [dashboardDateRange, period, selectedBranchId]);

  const fetchLightData = useCallback(async () => {
    try {
      const bQuery = selectedBranchId && selectedBranchId !== 'all' ? `&branchId=${selectedBranchId}` : '';
      const bQuerySingle = selectedBranchId && selectedBranchId !== 'all' ? `?branchId=${selectedBranchId}` : '';
      const rangeQuery = dashboardDateRange
        ? `&from=${dashboardDateRange.from || ''}&to=${dashboardDateRange.to || ''}`
        : '';
      const [statsRes, menuRes, invRes, ordersRes] = await Promise.all([
        api.get(`/admin/stats?period=${period}${bQuery}${rangeQuery}`),
        api.get(`/menu?all=true${bQuery}`),
        api.get(`/inventory${bQuerySingle}`),
        api.get(`/orders?period=${period}${bQuery}`),
      ]);
      setStats(statsRes.data);
      setMenuItems(menuRes.data.items || []);
      setInventory(invRes.data.items || []);
      setAdminOrders(ordersRes.data.orders || []);
    } catch (err) {
      console.error('Fetch light data error:', err);
    }
  }, [dashboardDateRange, period, selectedBranchId]);

  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      fetchDashboardData();
    }
  }, [user, fetchDashboardData]);

  // Real-time socket sync
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleRealtimeSync = () => {
        if (user && user.role === 'ADMIN') {
          fetchLightData();
        }
      };

      socket.on('order:new', handleRealtimeSync);
      socket.on('order:update', handleRealtimeSync);
      socket.on('payment:verify', handleRealtimeSync);
      socket.on('inventory:update', handleRealtimeSync);
      socket.on('menu:update', handleRealtimeSync);

      return () => {
        socket.off('order:new', handleRealtimeSync);
        socket.off('order:update', handleRealtimeSync);
        socket.off('payment:verify', handleRealtimeSync);
        socket.off('inventory:update', handleRealtimeSync);
        socket.off('menu:update', handleRealtimeSync);
      };
    }
  }, [user, fetchLightData]);

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
      onRefresh={fetchDashboardData}
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

      {/* Render Active View Component */}
      {activeTab === 'dashboard' && (
        <AdminHomeView
          stats={stats}
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
        <AdminOrdersView orders={adminOrders} loading={loading && adminOrders.length === 0} onRefresh={fetchDashboardData} showToast={showToast} />
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
    </AdminLayout>
  );
};

export default AdminDashboard;
