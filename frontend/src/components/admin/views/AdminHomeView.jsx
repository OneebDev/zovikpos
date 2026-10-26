import { useMemo } from 'react';
import {
  TrendingUp,
  ShoppingCart,
  BrainCircuit,
  Package,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  Flame,
  CheckCircle2,
  RefreshCw,
  ListOrdered,
  Loader2,
  Trophy,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  Area,
  BarChart,
  Bar,
  Line,
  LabelList,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import DateRangeFilterBar, { getPresetRange } from '../../common/DateRangeFilterBar';
import { paymentMethodKey, paymentMethodLabel } from '../../../utils/paymentMethods';

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
// Override display labels for specific statuses.
// CANCELLED → "Rejected" (flow treats them equivalently).
// PENDING → "COD Payment Pending" (cash on delivery orders awaiting cashier confirmation).
// PAYMENT_PENDING → "Online Payment Pending" (online payment orders awaiting verification).
const STATUS_LABEL_OVERRIDES = {
  CANCELLED: 'Rejected',
  PENDING: 'COD Payment Pending',
  PAYMENT_PENDING: 'Online Payment Pending',
};
const formatStatus = (value) => {
  const key = String(value || 'UNKNOWN').toUpperCase();
  return STATUS_LABEL_OVERRIDES[key] || String(value || 'UNKNOWN').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
};
const formatPaymentMethod = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return paymentMethodLabel(normalized) || formatStatus(normalized);
};
// Active pipeline statuses — always show in the breakdown list even with 0 count so queues are always visible.
const ALWAYS_SHOW_STATUSES = ['READY', 'PREPARING', 'PAID', 'PENDING', 'PAYMENT_PENDING'];
const KNOWN_ORDER_STATUSES = ['COMPLETED', 'READY', 'PREPARING', 'PAID', 'PENDING', 'PAYMENT_PENDING', 'CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'REFUNDED'];
const statusColor = (status) => {
  const key = String(status || '').toUpperCase();
  if (['COMPLETED', 'READY', 'SERVED'].includes(key)) return '#10b981';
  if (['CANCELLED', 'REJECTED', 'FAILED', 'PAYMENT_FAILED', 'REFUNDED'].includes(key)) return '#f43f5e';
  if (key === 'PENDING') return '#f59e0b'; // Amber for COD Pending
  if (key === 'PAYMENT_PENDING' || key === 'PENDING_VERIFICATION') return '#d97706'; // Deeper warm amber for Online Payment Pending
  if (['PAID', 'PREPARING', 'PROCESSING'].includes(key)) return '#3b82f6';
  return '#8b5cf6';
};

const AdminHomeView = ({
  stats,
  statsLoading = false,
  statsError = '',
  onRetry,
  setPeriod,
  datePreset,
  setDatePreset,
  customFrom,
  customTo,
  onCustomRangeChange,
  onDateRangeChange,
  onNavigate,
  onRecalculateAI,
  forecastingLoading,
}) => {
  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    const range = preset === 'ALL' ? null : preset === 'CUSTOM'
      ? { from: customFrom, to: customTo }
      : getPresetRange(preset);
    onDateRangeChange?.(range);
    if (preset === 'TODAY' || preset === 'YESTERDAY') setPeriod('day');
    else if (preset === 'LAST_7') setPeriod('week');
    else if (preset === 'THIS_MONTH' || preset === 'LAST_MONTH') setPeriod('month');
    else if (preset === 'CUSTOM') setPeriod('all');
    else if (preset === 'ALL') setPeriod('all');
  };

  const revenueChartData = useMemo(() => {
    const raw = stats?.revenueTimeline || [];
    if (raw.length === 1) {
      // Pad single data point with flanking points so the line/area chart can draw a visual trajectory
      return [
        { label: '', revenue: 0, orderCount: 0 },
        raw[0],
      ];
    }
    return raw;
  }, [stats?.revenueTimeline]);
  const orderStatusChartData = useMemo(() => {
    const counts = new Map((stats?.orderStatusCounts || []).map(({ status, count }) => [status, count]));
    // Merge known statuses with any from the backend.
    // Group by display label so equivalent statuses (e.g. CANCELLED and REJECTED which both label as 'Rejected')
    // merge into a single row instead of showing multiple separate 'Rejected' lines.
    const statuses = [...new Set([...KNOWN_ORDER_STATUSES, ...counts.keys()])];
    const grouped = new Map();

    statuses.forEach((status) => {
      const label = formatStatus(status);
      const count = Number(counts.get(status) || 0);
      const isAlwaysShow = ALWAYS_SHOW_STATUSES.includes(status);

      if (!grouped.has(label)) {
        grouped.set(label, {
          status,
          label,
          count,
          alwaysShow: isAlwaysShow,
        });
      } else {
        const existing = grouped.get(label);
        existing.count += count;
        if (isAlwaysShow) existing.alwaysShow = true;
      }
    });

    return Array.from(grouped.values())
      .filter((entry) => entry.count > 0 || entry.alwaysShow)
      .sort((a, b) => b.count - a.count || KNOWN_ORDER_STATUSES.indexOf(a.status) - KNOWN_ORDER_STATUSES.indexOf(b.status));
  }, [stats?.orderStatusCounts]);
  const paymentMethodChartData = useMemo(() => {
    const byMethod = new Map();
    (stats?.paymentBreakdown || []).forEach((entry) => {
      const key = paymentMethodKey(entry.method);
      const previous = byMethod.get(key) || { revenue: 0, count: 0 };
      byMethod.set(key, {
        revenue: previous.revenue + Number(entry.totalAmount || 0),
        count: previous.count + Number(entry.count || 0),
      });
    });
    // Keep every supported method visible, including methods with no activity in this range.
    const knownMethods = ['COD', 'EASYPAISA', 'JAZZCASH'];
    const methods = [...knownMethods, ...[...byMethod.keys()].filter((key) => !knownMethods.includes(key))];
    return methods.map((method) => ({
      name: formatPaymentMethod(method),
      revenue: byMethod.get(method)?.revenue || 0,
      count: byMethod.get(method)?.count || 0,
    })).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  }, [stats?.paymentBreakdown]);

  if (!stats && statsError) {
    return (
      <section role="alert" className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] px-6 py-12 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden="true" />
        <h2 className="text-base font-bold text-[var(--text-main)]">Could not load dashboard analytics</h2>
        <p className="max-w-xl text-sm text-[var(--text-muted)]">{statsError}</p>
        <button type="button" onClick={onRetry} disabled={statsLoading} className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-bold text-orange-500 disabled:opacity-60">
          {statsLoading ? 'Retrying…' : 'Retry'}
        </button>
      </section>
    );
  }

  if (!stats) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-xs font-bold text-[var(--text-muted)]">
        {statsLoading ? <Loader2 className="h-5 w-5 animate-spin text-orange-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
        <span>{statsLoading ? 'Loading Executive Dashboard Analytics…' : 'Dashboard analytics are unavailable.'}</span>
        {!statsLoading && <button type="button" onClick={onRetry} className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-orange-500">Retry</button>}
      </div>
    );
  }

  const metrics = stats.metrics || {};

  return (
    <div className="space-y-8">
      {statsError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--text-main)]">
          <span>Could not refresh dashboard analytics: {statsError}. Showing the last loaded data.</span>
          <button type="button" onClick={onRetry} disabled={statsLoading} className="font-bold text-orange-500 disabled:opacity-60">{statsLoading ? 'Retrying…' : 'Retry'}</button>
        </div>
      )}
      {/* Top Header Controls & Date Filter */}
      <div className="flex flex-col gap-5 glass-card p-4 sm:p-6 relative z-30">
        <div>
          <span className="px-2.5 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-md text-[10px] font-extrabold tracking-wider uppercase">
            Overview Summary
          </span>
          <h2 className="text-xl font-extrabold text-[var(--text-main)] mt-1 font-display">Executive Dashboard</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Real-time revenue, active orders queue, stock health alerts, and AI performance.</p>
        </div>

        {/* Date Quick-Filter Bar with Dual-Click Interactive Range Popover */}
        <div className="w-full border-t border-[var(--border-color)] pt-4">
          <DateRangeFilterBar
            preset={datePreset}
            onPresetChange={handlePresetChange}
            customFrom={customFrom}
            customTo={customTo}
            onCustomRangeChange={(from, to) => {
              onCustomRangeChange?.(from, to);
            }}
          />
        </div>
      </div>

      {/* Top Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Today's Revenue */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">Total Revenue</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-[var(--text-main)] font-mono">
              Rs. {Number(metrics.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center mt-1">
              <ArrowUpRight className="w-3 h-3 mr-0.5" /> Verified Sales ({datePreset})
            </span>
          </div>
        </div>

        {/* Active Orders Queue */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">Active Orders</span>
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-[var(--text-main)] font-mono">{metrics.activeOrdersCount || 0} Orders</h3>
            <span className="text-[10px] text-orange-400 font-bold block mt-1">Pending Handoff / Preparation</span>
          </div>
        </div>

        {/* AI ETA Accuracy */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">AI ETA Accuracy</span>
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-orange-400 font-mono">{metrics.predictionAccuracy == null ? 'Not enough data' : `${metrics.predictionAccuracy}%`}</h3>
            <span className="text-[10px] text-[var(--text-muted)] block mt-1">Avg Prep Time: {metrics.avgPrepTime == null ? 'Not enough data' : `${metrics.avgPrepTime} mins`}</span>
          </div>
        </div>

        {/* Stock Alerts */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">Stock Health Alerts</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-extrabold text-amber-400 font-mono">{metrics.lowStockCount || 0} Items</h3>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-[10px] text-amber-400 hover:underline font-bold block mt-1 cursor-pointer"
            >
              View Low Stock Alerts →
            </button>
          </div>
        </div>
      </div>

      {/* Main Charts & Summaries Grid */}
      <div className="grid min-w-0 lg:grid-cols-12 gap-6">
        {/* Left: Revenue Trend Chart */}
        <div className="min-w-0 lg:col-span-8 glass-card p-6 space-y-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:items-start">
            <div className="min-w-0">
              <h3 className="font-extrabold text-base text-[var(--text-main)] font-display">Revenue Overview</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">Revenue and order volume across the selected dates.</p>
              <div className="flex items-center gap-4 mt-2 text-[10px] font-semibold text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-orange-500" />Revenue</span>
                <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-blue-500" />Orders</span>
              </div>
            </div>
            <button
              onClick={() => onNavigate('reports')}
              className="shrink-0 px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-xl text-xs font-bold hover:bg-orange-500/20 transition-all cursor-pointer whitespace-nowrap"
            >
              Full Financial Reports →
            </button>
          </div>

          <div className="relative h-64 w-full min-w-0 pt-4">
            {revenueChartData.length === 1 ? (
              <div className="h-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-color)]/45 p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-[var(--text-muted)]">Daily performance</span>
                  <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1 text-[11px] font-bold text-orange-400">{revenueChartData[0].label}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Verified Revenue</div>
                    <div className="mt-1 text-2xl font-black font-mono text-orange-400">{formatCurrency(revenueChartData[0].revenue)}</div>
                  </div>
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Paid Orders</div>
                    <div className="mt-1 text-2xl font-black font-mono text-blue-400">{Number(revenueChartData[0].orderCount || 0).toLocaleString()}</div>
                  </div>
                </div>
                {Number(revenueChartData[0].revenue || 0) === 0 && <p className="text-center text-[11px] text-[var(--text-muted)]">No verified revenue was recorded for this day.</p>}
              </div>
            ) : revenueChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">No revenue activity in this date range.</div>
            ) : <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
              <ComposedChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="revenue"
                  width={58}
                  stroke="var(--text-muted)"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9 }}
                  tickFormatter={(value) => `Rs ${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0)}`}
                />
                <YAxis yAxisId="orders" orientation="right" hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card-bg)',
                    borderColor: 'var(--border-color)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: 'var(--text-main)',
                  }}
                  formatter={(value, name) => [name === 'revenue' ? formatCurrency(value) : `${value} orders`, name === 'revenue' ? 'Revenue' : 'Orders']}
                />
                <Area yAxisId="revenue" type="monotone" dataKey="revenue" name="revenue" stroke="#f97316" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
                <Line yAxisId="orders" type="monotone" dataKey="orderCount" name="orders" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>}
          </div>
        </div>

        {/* Right: Quick Action Alerts Panel */}
        <div className="min-w-0 lg:col-span-4 glass-card p-6 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-base text-[var(--text-main)] font-display flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Action Alerts</span>
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-400 uppercase">
                {stats.lowStockAlerts?.length || 0} URGENT
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Critical operations requiring admin review.</p>

            <div className="space-y-3 mt-4">
              {stats.lowStockAlerts?.slice(0, 4).map((item, idx) => {
                const isCritical = item.stockLevel <= 0 || item.statusLevel?.includes('CRITICAL');
                return (
                  <div key={idx} className="p-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl flex items-center justify-between text-xs gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-[var(--text-main)] font-bold truncate">{item.name}</strong>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          isCritical ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        }`}>
                          {isCritical ? 'Critical Stock' : 'Low Stock'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] font-medium mt-0.5 block">
                        Stock: <span className={isCritical ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>{item.stockLevel} {item.unit}</span> (Min: {item.minThreshold} {item.unit})
                      </span>
                    </div>
                    <button
                      onClick={() => onNavigate('inventory', { itemId: item.id, action: 'restock' })}
                      className="px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold rounded-lg transition-all cursor-pointer shrink-0 shadow-sm"
                    >
                      Restock
                    </button>
                  </div>
                );
              })}

              {(!stats.lowStockAlerts || stats.lowStockAlerts.length === 0) && (
                <div className="p-6 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-color)]/40 rounded-xl border border-dashed border-[var(--border-color)]">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                  <span>All inventory stock levels are healthy.</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigate('notifications')}
            className="w-full py-2.5 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] font-bold text-xs rounded-xl border border-[var(--border-color)] transition-all cursor-pointer text-center"
          >
            View All System Alerts →
          </button>
        </div>
      </div>

      {/* Additional Charts Row: Payment Method Breakdown & Order Status Pipeline */}
      <div className="grid min-w-0 lg:grid-cols-2 gap-6">
        {/* Payment Methods Donut Chart */}
        <div className="min-w-0 h-full glass-card p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-[var(--text-main)] flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-orange-400" />
                <span>Revenue by Payment Method</span>
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Verified revenue grouped by payment method.</p>
            </div>
            <button
              onClick={() => onNavigate('payments')}
              className="text-xs text-orange-400 hover:underline font-bold cursor-pointer"
            >
              Audit Payments →
            </button>
          </div>

          {paymentMethodChartData.every((m) => m.revenue === 0) ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)] min-h-[200px]">
              No payment activity in this date range.
            </div>
          ) : (
            <div className="flex flex-col gap-4 flex-1">
              {/* Donut chart */}
              <div className="w-full" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <PieChart>
                    <Pie
                      data={paymentMethodChartData.filter((m) => m.revenue > 0)}
                      dataKey="revenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="48%"
                      outerRadius="72%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {paymentMethodChartData.filter((m) => m.revenue > 0).map((entry, idx) => {
                        const colors = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e'];
                        return <Cell key={entry.name} fill={colors[idx % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card-bg)',
                        borderColor: 'var(--border-color)',
                        borderRadius: '12px',
                        fontSize: '11px',
                        color: 'var(--text-main)',
                      }}
                      formatter={(value, name, props) => [formatCurrency(value), `${name} · ${props.payload.count} orders`]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value) => <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Method breakdown rows */}
              <div className="space-y-2">
                {paymentMethodChartData.map((m, idx) => {
                  const colors = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e'];
                  const total = paymentMethodChartData.reduce((sum, x) => sum + x.revenue, 0);
                  const pct = total > 0 ? Math.round((m.revenue / total) * 100) : 0;
                  return (
                    <div key={m.name} className="flex items-center gap-3 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                      <span className="flex-1 font-semibold text-[var(--text-main)] truncate">{m.name}</span>
                      <span className="text-[var(--text-muted)] shrink-0">{m.count} orders</span>
                      <span className="font-bold text-[var(--text-main)] shrink-0 w-20 text-right">{formatCurrency(m.revenue)}</span>
                      <span className="shrink-0 w-10 text-right font-extrabold" style={{ color: colors[idx % colors.length] }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Order Status Distribution — Donut Chart */}
        <div className="min-w-0 glass-card p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-[var(--text-main)] flex items-center space-x-2">
                <ListOrdered className="w-4 h-4 text-emerald-400" />
                <span>Order Status Distribution</span>
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Volume by order completion state.</p>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs text-orange-400 hover:underline font-bold cursor-pointer"
            >
              Inspect Orders →
            </button>
          </div>

          {orderStatusChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)] min-h-[200px]">
              No orders in the selected period.
            </div>
          ) : (
            <div className="flex flex-col gap-4 flex-1">
              {/* Donut chart — only render slices for statuses with actual orders */}
              <div className="w-full" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                  <PieChart>
                    <Pie
                      data={orderStatusChartData.filter((e) => e.count > 0)}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius="48%"
                      outerRadius="72%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {orderStatusChartData.filter((e) => e.count > 0).map((entry) => (
                        <Cell key={entry.status} fill={statusColor(entry.status)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card-bg)',
                        borderColor: 'var(--border-color)',
                        borderRadius: '12px',
                        fontSize: '11px',
                        color: 'var(--text-main)',
                      }}
                      formatter={(value, name) => [`${value} orders`, name]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value) => <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Status breakdown rows */}
              <div className="space-y-2">
                {orderStatusChartData.map((entry) => {
                  const total = orderStatusChartData.reduce((sum, x) => sum + x.count, 0);
                  const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
                  return (
                    <div key={entry.status} className="flex items-center gap-3 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusColor(entry.status) }} />
                      <span className="flex-1 font-semibold text-[var(--text-main)] truncate">{entry.label}</span>
                      <span className="font-bold text-[var(--text-main)] shrink-0">{entry.count} orders</span>
                      <span className="shrink-0 w-10 text-right font-extrabold" style={{ color: statusColor(entry.status) }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Recommendations & Top Selling Products */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black text-[var(--text-main)] flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/20">
                <Flame className="w-4 h-4" />
              </span>
              <span>Top 10 Best Sellers</span>
            </h3>
            <button onClick={() => onNavigate('menu')} className="text-xs text-orange-400 hover:text-orange-300 font-bold cursor-pointer transition-colors flex items-center gap-1">
              <span>Manage Catalog</span>
              <span>→</span>
            </button>
          </div>

          <div className="space-y-2">
            {stats.topItems?.length ? (() => {
              const top10 = stats.topItems.slice(0, 10);
              const maxQty = Math.max(...top10.map((item) => Number(item.quantity || 0)), 1);

              return top10.map((item, idx) => {
                const qty = Number(item.quantity || 0);
                const pctOfMax = Math.min(100, Math.round((qty / maxQty) * 100));

                // Rank styling
                const rankBadgeClass =
                  idx === 0
                    ? 'bg-gradient-to-br from-amber-400 to-yellow-600 text-black shadow-sm font-black shadow-amber-500/30'
                    : idx === 1
                    ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 font-black shadow-sm'
                    : idx === 2
                    ? 'bg-gradient-to-br from-amber-700 to-orange-800 text-amber-100 font-black shadow-sm'
                    : 'bg-[var(--surface-subtle,#26262b)] text-[var(--text-muted)] border border-[var(--border-color)] font-bold';

                return (
                  <div
                    key={`${item.name}-${idx}`}
                    className="relative group p-2.5 rounded-xl border border-[var(--border-color)]/60 bg-[var(--surface,#1a1a1f)]/40 hover:bg-[var(--surface-hover,#222228)] transition-all overflow-hidden"
                  >
                    {/* Subtle volume background bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500/[0.08] to-transparent pointer-events-none transition-all duration-500"
                      style={{ width: `${pctOfMax}%` }}
                    />

                    <div className="relative flex items-center gap-3">
                      {/* Rank Indicator */}
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] shrink-0 ${rankBadgeClass}`}>
                        {idx === 0 ? <Trophy className="w-3.5 h-3.5" /> : idx + 1}
                      </span>

                      {/* Item Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-[var(--text-main)] block font-bold text-xs truncate group-hover:text-orange-400 transition-colors">
                            {item.name}
                          </strong>
                          {idx === 0 && (
                            <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              <Sparkles className="w-2.5 h-2.5" /> Top #1
                            </span>
                          )}
                        </div>
                        <span className="text-[var(--text-muted)] text-[10px] block truncate mt-0.5">
                          {item.category || 'General'}
                        </span>
                      </div>

                      {/* Sales Stats */}
                      <div className="text-right shrink-0">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-xs font-black text-orange-400">
                            {qty.toLocaleString()}
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--text-muted)]">sold</span>
                        </div>
                        <span className="text-[10px] font-medium text-[var(--text-muted)] block mt-0.5">
                          {formatCurrency(item.revenue)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              });
            })() : (
              <div className="py-10 text-center text-xs text-[var(--text-muted)]">No completed sales in this date range.</div>
            )}
          </div>
        </div>

        {/* Stock Reorder Advice */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black text-[var(--text-main)] flex items-center space-x-2">
              <BrainCircuit className="w-4 h-4 text-orange-400" />
              <span>AI Inventory Recommendations</span>
            </h3>
            <button
              onClick={onRecalculateAI}
              disabled={forecastingLoading}
              className="px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center space-x-1"
            >
              <RefreshCw className={`w-3 h-3 ${forecastingLoading ? 'animate-spin' : ''}`} />
              <span>{forecastingLoading ? 'Calculating...' : 'Recalculate AI'}</span>
            </button>
          </div>

          <div className="divide-y divide-[var(--border-color)]">
            {stats.stockRecommendations?.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-4">All inventory stock levels are healthy.</p>
            ) : (
              stats.stockRecommendations?.map((rec, idx) => (
                <div key={idx} className="py-3 flex justify-between items-center text-xs">
                  <div>
                    <strong className="text-[var(--text-main)] block font-bold">{rec.name}</strong>
                    <span className="text-[var(--text-muted)] text-[10px]">Current: {rec.currentStock} (Threshold: {rec.threshold})</span>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded text-[10px] font-extrabold ${
                      rec.urgency === 'HIGH' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      +{rec.recommendedReorder} units advised
                    </span>
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

export default AdminHomeView;


