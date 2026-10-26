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
} from 'lucide-react';
import {
  ResponsiveContainer,
  Area,
  BarChart,
  Bar,
  Line,
  LabelList,
  ComposedChart,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import DateRangeFilterBar, { getPresetRange } from '../../common/DateRangeFilterBar';
import { paymentMethodKey, paymentMethodLabel } from '../../../utils/paymentMethods';

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const formatStatus = (value) => String(value || 'UNKNOWN').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatPaymentMethod = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return paymentMethodLabel(normalized) || formatStatus(normalized);
};
const KNOWN_ORDER_STATUSES = ['COMPLETED', 'READY', 'PREPARING', 'PAID', 'PENDING', 'PAYMENT_PENDING', 'REJECTED', 'CANCELLED', 'PAYMENT_FAILED', 'REFUNDED'];
const statusColor = (status) => {
  const key = String(status || '').toUpperCase();
  if (['COMPLETED', 'READY', 'SERVED'].includes(key)) return '#10b981';
  if (['CANCELLED', 'REJECTED', 'FAILED', 'PAYMENT_FAILED', 'REFUNDED'].includes(key)) return '#f43f5e';
  if (['PENDING', 'PAYMENT_PENDING', 'PENDING_VERIFICATION'].includes(key)) return '#f59e0b';
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
    const statuses = [...new Set([...KNOWN_ORDER_STATUSES, ...counts.keys()])];
    return statuses.map((status) => ({ status, label: formatStatus(status), count: Number(counts.get(status) || 0) }))
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
        {/* Payment Methods Bar Chart */}
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

          <div className="relative w-full min-w-0 flex-1 min-h-[200px] pt-2">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                <BarChart data={paymentMethodChartData} layout="vertical" margin={{ left: 12, right: 42 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.35} horizontal={false} />
                  <XAxis type="number" domain={[0, Math.max(1, ...paymentMethodChartData.map((item) => item.revenue))]} allowDecimals={false} stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${Number(value).toLocaleString()}`} />
                  <YAxis type="category" dataKey="name" width={95} stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      backgroundColor: 'var(--card-bg)',
                      borderColor: 'var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: 'var(--text-main)',
                    }}
                    labelStyle={{ color: 'var(--text-main)' }}
                    itemStyle={{ color: 'var(--text-main)' }}
                    formatter={(value, name, props) => [formatCurrency(value), `Revenue · ${props.payload.count} orders`]}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#f97316" radius={[0, 6, 6, 0]} barSize={18}>
                    <LabelList dataKey="revenue" position="right" formatter={(value) => formatCurrency(value)} style={{ fill: 'var(--text-muted)', fontSize: 9, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Distribution Chart */}
        <div className="min-w-0 glass-card p-6 space-y-4">
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

          <div className="relative w-full min-w-0 pt-2" style={{ height: Math.max(200, orderStatusChartData.length * 58) }}>
            {orderStatusChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
                No orders in the selected period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                <BarChart data={orderStatusChartData} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.35} horizontal={false} />
                  <XAxis type="number" domain={[0, 'dataMax']} allowDecimals={false} stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={120} stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: '12px', fontSize: '11px', color: 'var(--text-main)' }}
                    labelStyle={{ color: 'var(--text-main)' }}
                    itemStyle={{ color: 'var(--text-main)' }}
                    formatter={(count) => [`${count} orders`, 'Status count']}
                  />
                  <Bar dataKey="count" name="Orders" radius={[0, 6, 6, 0]} barSize={18} minPointSize={2}>
                    {orderStatusChartData.map((entry) => <Cell key={entry.status} fill={statusColor(entry.status)} />)}
                    <LabelList dataKey="count" position="right" fill="var(--text-main)" fontSize={11} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* AI Recommendations & Top Selling Products */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black text-[var(--text-main)] flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Top Selling Menu Items</span>
            </h3>
            <button onClick={() => onNavigate('menu')} className="text-xs text-orange-400 hover:underline font-bold cursor-pointer">
              Manage Catalog →
            </button>
          </div>

          <div className="divide-y divide-[var(--border-color)]">
            {stats.topItems?.length ? stats.topItems.map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="py-3 flex items-center gap-3 text-xs">
                <span className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center font-extrabold text-[10px] shrink-0">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                  <strong className="text-[var(--text-main)] block font-bold truncate">{item.name}</strong>
                  <span className="text-[var(--text-muted)] text-[10px]">{item.category || 'Menu item'}</span>
                </div>
                <div className="text-right shrink-0">
                  <strong className="text-orange-500 font-bold">{Number(item.quantity || 0).toLocaleString()} sold</strong>
                  <span className="text-[10px] text-[var(--text-muted)] block">{formatCurrency(item.revenue)}</span>
                </div>
              </div>
            )) : (
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


