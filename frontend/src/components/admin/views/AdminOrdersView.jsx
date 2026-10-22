import ThemedSelect from '../../common/ThemedSelect';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  Download,
  Printer,
  Eye,
  X,
  Trash2,
  Loader2,
} from 'lucide-react';
import { exportToCSV, printPDFReport } from '../../../utils/exportUtils';
import DateRangeFilterBar, { getPresetRange } from '../../common/DateRangeFilterBar';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';
import { paymentMethodLabel } from '../../../utils/paymentMethods';
import { resolveTableLabel } from '../../../utils/customerTableLabel';
import { formatPrice } from '../../../utils/formatPrice';
import api from '../../../services/api';
import { getSocket } from '../../../services/socket';

const statusBadges = {
  PENDING: { label: 'PENDING', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  PAYMENT_PENDING: { label: 'PAYMENT PENDING', bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  PAID: { label: 'PAID / VERIFIED', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  PREPARING: { label: 'PREPARING IN KITCHEN', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  READY: { label: 'READY FOR PICKUP', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  COMPLETED: { label: 'COMPLETED', bg: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  CANCELLED: { label: 'CANCELLED', bg: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  PAYMENT_FAILED: { label: 'PAYMENT FAILED', bg: 'bg-red-500/20 text-red-400 border-red-500/30' },
  REFUNDED: { label: 'REFUNDED', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
};

const lifecycleSteps = ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY', 'COMPLETED'];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));
const localDayBoundaryIso = (dateValue, isExclusiveEnd = false) => {
  if (!dateValue) return '';
  const [year, month, day] = dateValue.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) return '';
  return new Date(year, month - 1, day + (isExclusiveEnd ? 1 : 0)).toISOString();
};

const AdminOrdersView = ({ selectedBranchId = 'all', onRefresh, showToast }) => {
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [pageOrders, setPageOrders] = useState([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const ordersAbortRef = useRef(null);
  const ordersRequestRef = useRef(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());

  // Date filter state
  const [datePreset, setDatePreset] = useState('ALL'); // ALL | TODAY | YESTERDAY | LAST_7 | THIS_MONTH | LAST_MONTH | CUSTOM
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Global Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Active date range computed from preset or custom
  const activeDateRange = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      if (customFrom || customTo) return { from: customFrom || '', to: customTo || '' };
      return null;
    }
    if (datePreset === 'ALL') return null;
    return getPresetRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  const requestFilters = useMemo(() => ({
    page: currentPage,
    pageSize: 25,
    ...(activeTab !== 'ALL' ? { status: activeTab } : {}),
    ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
    ...(paymentMethodFilter !== 'ALL' ? { paymentMethod: paymentMethodFilter } : {}),
    ...(selectedBranchId && selectedBranchId !== 'all' ? { branchId: selectedBranchId } : {}),
    ...(activeDateRange?.from ? { from: localDayBoundaryIso(activeDateRange.from) } : {}),
    ...(activeDateRange?.to ? { toExclusive: localDayBoundaryIso(activeDateRange.to, true) } : {}),
  }), [activeDateRange, activeTab, currentPage, debouncedSearchTerm, paymentMethodFilter, selectedBranchId]);

  const fetchOrdersPage = useCallback(async () => {
    ordersAbortRef.current?.abort();
    const controller = new AbortController();
    ordersAbortRef.current = controller;
    const requestId = ++ordersRequestRef.current;
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const response = await api.get('/orders', { params: requestFilters, signal: controller.signal, timeout: 8000 });
      if (requestId !== ordersRequestRef.current) return;
      setPageOrders(Array.isArray(response.data?.orders) ? response.data.orders : []);
      const nextPageInfo = response.data?.pagination || { page: 1, pageSize: 25, total: 0, totalPages: 0 };
      setPageInfo(nextPageInfo);
      if (currentPage > (nextPageInfo.totalPages || 1)) {
        setCurrentPage(nextPageInfo.totalPages || 1);
      }
    } catch (error) {
      if (requestId !== ordersRequestRef.current || controller.signal.aborted) return;
      console.error('Fetch paginated orders error:', error);
      setOrdersError(error.response?.data?.message || error.response?.data?.error || error.message || 'Could not load orders.');
    } finally {
      if (requestId === ordersRequestRef.current) setOrdersLoading(false);
    }
  }, [currentPage, requestFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
      setCurrentPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchOrdersPage();
    return () => {
      ordersAbortRef.current?.abort();
    };
  }, [fetchOrdersPage]);

  useEffect(() => () => {
    ordersRequestRef.current += 1;
    ordersAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    let timer;
    let safetyPoll;
    let wasDisconnected = !socket.connected;
    const refreshOnOrderEvent = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fetchOrdersPage, 300);
    };
    const clearSafetyPoll = () => {
      if (safetyPoll) window.clearInterval(safetyPoll);
      safetyPoll = undefined;
    };
    const handleDisconnect = () => {
      wasDisconnected = true;
      clearSafetyPoll();
      safetyPoll = window.setInterval(fetchOrdersPage, 30000);
    };
    const handleConnect = () => {
      clearSafetyPoll();
      if (wasDisconnected) {
        wasDisconnected = false;
        fetchOrdersPage();
      }
    };
    socket.on('order:new', refreshOnOrderEvent);
    socket.on('order:update', refreshOnOrderEvent);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleConnect);
    if (wasDisconnected) handleDisconnect();
    return () => {
      window.clearTimeout(timer);
      clearSafetyPoll();
      socket.off('order:new', refreshOnOrderEvent);
      socket.off('order:update', refreshOnOrderEvent);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleConnect);
    };
  }, [fetchOrdersPage]);

  const filteredOrders = pageOrders;
  const isOrdersLoading = ordersLoading;
  const displayedOrdersError = ordersError;
  const pageCount = Math.max(1, pageInfo.totalPages || 1);

  const fetchOrdersForExport = useCallback(async () => {
    const filters = { ...requestFilters };
    delete filters.page;
    delete filters.pageSize;
    const response = await api.get('/orders', {
      params: { ...filters, exportAll: 'true' },
      timeout: 20000,
    });
    if (response.data?.exportTruncated) showToast?.('Export contains the first 10,000 matching orders.', 'warning');
    return Array.isArray(response.data?.orders) ? response.data.orders : [];
  }, [requestFilters, showToast]);

  const runExport = async (format) => {
    setExportLoading(true);
    try {
      const exportOrders = await fetchOrdersForExport();
      if (!exportOrders.length) {
        showToast?.('No orders match the current filters.', 'warning');
        return;
      }
      if (format === 'csv') {
        const csvData = exportOrders.map((o) => ({
          OrderNumber: o.orderNumber,
          Customer: o.user?.name || o.user?.email || 'Guest',
          Email: o.user?.email || 'N/A',
          TableNumber: resolveTableLabel(o),
          TotalAmount: Number(o.total || 0),
          PaymentMethod: paymentMethodLabel(o.paymentMethod),
          PaymentStatus: o.paymentStatus,
          OrderStatus: o.status,
          CreatedAt: new Date(o.createdAt).toLocaleString(),
        }));
        exportToCSV(`orders_export_${Date.now()}.csv`, csvData, [
          { key: 'OrderNumber', label: 'Order Number' },
          { key: 'Customer', label: 'Customer' },
          { key: 'Email', label: 'Email' },
          { key: 'TableNumber', label: 'Table' },
          { key: 'TotalAmount', label: 'Total (Rs.)' },
          { key: 'PaymentMethod', label: 'Method' },
          { key: 'PaymentStatus', label: 'Payment Status' },
          { key: 'OrderStatus', label: 'Order Status' },
          { key: 'CreatedAt', label: 'Date Time' },
        ]);
        return;
      }

    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Order #</th>
            <th>Customer</th>
            <th>Table</th>
            <th>Total (Rs.)</th>
            <th>Method</th>
            <th>Order Status</th>
            <th>Date Time</th>
          </tr>
        </thead>
        <tbody>
          ${exportOrders
            .map(
              (o) => `
            <tr>
              <td><strong>${escapeHtml(o.orderNumber)}</strong></td>
              <td>${escapeHtml(o.user?.name || o.user?.email || 'Guest')}</td>
              <td>${escapeHtml(resolveTableLabel(o))}</td>
              <td>${escapeHtml(formatPrice(o.total))}</td>
              <td>${escapeHtml(paymentMethodLabel(o.paymentMethod))}</td>
              <td><span class="badge badge-success">${escapeHtml(o.status)}</span></td>
              <td>${escapeHtml(new Date(o.createdAt).toLocaleString())}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
    printPDFReport('Orders & Transactions Report', tableHtml);
    } catch (error) {
      console.error(`Export ${format.toUpperCase()} orders error:`, error);
      showToast?.(error.response?.data?.message || error.response?.data?.error || `Could not export orders: ${error.message}`, 'error');
    } finally {
      setExportLoading(false);
    }
  };



  // Single Order Delete Handler
  const handleConfirmSingleDelete = async () => {
    if (!orderToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete(`/orders/${orderToDelete.id}`, { timeout: 8000 });
      if (showToast) showToast(res.data?.message || 'Order deleted successfully.');
      setDeleteModalOpen(false);
      setOrderToDelete(null);
      if (selectedOrder?.id === orderToDelete.id) setSelectedOrder(null);
      await Promise.all([fetchOrdersPage(), onRefresh?.({ includeOrders: false })]);
    } catch (err) {
      console.error('Delete order error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to delete order', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bulk Delete Cancelled / Failed Orders
  const handleConfirmBulkDelete = async () => {
    setDeleteLoading(true);
    try {
      const selectedIds = Array.from(selectedOrderIds);
      const res = await api.delete('/orders/bulk', {
        data: selectedIds.length
          ? { ids: selectedIds }
          : { scope: activeTab === 'CANCELLED' ? 'CANCELLED' : 'PAYMENT_FAILED' },
        timeout: 8000,
      });
      if (showToast) showToast(res.data?.message || 'Orders deleted successfully.');
      setDeleteModalOpen(false);
      setIsBulkDeleting(false);
      setSelectedOrderIds(new Set());
      await Promise.all([fetchOrdersPage(), onRefresh?.({ includeOrders: false })]);
    } catch (err) {
      console.error('Bulk delete orders error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to bulk delete orders', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const selectableOrders = filteredOrders;
  const allSelectableOrdersSelected = selectableOrders.length > 0 && selectableOrders.every((order) => selectedOrderIds.has(order.id));
  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedOrderIds(new Set());
    setSelectionMode((active) => !active);
  };
  const toggleOrderSelection = (id) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 glass-card p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Orders Management</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Filter, inspect, calendar timeline, and export complete dining order lifecycles.</p>
        </div>

        <div className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto pb-1 lg:w-auto lg:shrink-0 lg:justify-end lg:overflow-visible">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedOrderIds.size} className="mobile-action-third h-10 justify-center px-1 text-[10px] sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-xs" mobileLabel="Select" mobileActiveLabel="Done" />
          {selectionMode && selectedOrderIds.size > 0 && (
            <button
              type="button"
              onClick={() => { setIsBulkDeleting(true); setDeleteModalOpen(true); }}
              className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-rose-500/20 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400 transition-all hover:bg-rose-500/20 cursor-pointer sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" /> <span><span className="sm:hidden">Delete</span><span className="hidden sm:inline">Delete Selected ({selectedOrderIds.size})</span></span>
            </button>
          )}
          <button
            type="button"
            onClick={() => runExport('csv')}
            disabled={exportLoading}
            className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-emerald-500 cursor-pointer disabled:cursor-wait disabled:opacity-60 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span><span className="sm:hidden">CSV</span><span className="hidden sm:inline">Export CSV</span></span>
          </button>
          <button
            type="button"
            onClick={() => runExport('pdf')}
            disabled={exportLoading}
            className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-orange-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-orange-500 cursor-pointer disabled:cursor-wait disabled:opacity-60 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2 sm:text-xs"
          >
            <Printer className="h-3.5 w-3.5 shrink-0" />
            <span><span className="sm:hidden">PDF</span><span className="hidden sm:inline">Export PDF</span></span>
          </button>
        </div>
      </div>

      {selectionMode && selectableOrders.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]" role="status">No orders match the current filters.</p>
      )}

      {/* Filter Tabs */}
      <div role="tablist" aria-label="Order status filters" className="flex min-w-0 items-center overflow-x-auto p-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl gap-1 scrollbar-none">
        {[
          'ALL',
          'PENDING',
          'PAYMENT_PENDING',
          'PAID',
          'PREPARING',
          'READY',
          'COMPLETED',
          'CANCELLED',
          'PAYMENT_FAILED',
          'REFUNDED',
        ].map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
            className={`flex-none px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab
                ? 'bg-orange-600 text-white shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-color)]'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>
      {/* Date Quick-Filter Bar with Dual-Click Interactive Range Popover */}
      <DateRangeFilterBar
        preset={datePreset}
            onPresetChange={(preset) => { setDatePreset(preset); setCurrentPage(1); }}
        customFrom={customFrom}
        customTo={customTo}
        onCustomRangeChange={(from, to) => {
          setCustomFrom(from);
          setCustomTo(to);
            setCurrentPage(1);
        }}
      />

      {/* Search & Sub-Filter Bar */}
      <div className="grid sm:grid-cols-12 gap-4">
        <div className="sm:col-span-8 relative">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            placeholder="Search by Order #, Customer Email, Name, or Table..."
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        <div className="sm:col-span-4">
          <ThemedSelect
            value={paymentMethodFilter}
            onChange={(e) => { setPaymentMethodFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 transition-colors cursor-pointer"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="COD">Pay at Counter (COD)</option>
            <option value="EASYPAISA">Easypaisa</option>
            <option value="JAZZCASH">JazzCash</option>
          </ThemedSelect>
        </div>
      </div>

      {/* Result Count Info */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
        <span>
          Showing <strong className="text-[var(--text-main)]">{pageInfo.total ? (currentPage - 1) * pageInfo.pageSize + 1 : 0}â€“{Math.min(currentPage * pageInfo.pageSize, pageInfo.total)}</strong> of <strong className="text-[var(--text-main)]">{pageInfo.total}</strong> orders
          {activeDateRange && (
            <span className="ml-2 text-orange-400 font-bold">
              â€¢ {datePreset === 'TODAY' ? 'Today' : datePreset === 'YESTERDAY' ? 'Yesterday' : datePreset === 'LAST_7' ? 'Last 7 Days' : datePreset === 'THIS_MONTH' ? 'This Month' : datePreset === 'LAST_MONTH' ? 'Last Month' : 'Custom Range'}
            </span>
          )}
        </span>
        <span className="font-mono font-bold text-emerald-400">
          Page total: {formatPrice(filteredOrders.reduce((s, o) => s + Number(o.total || 0), 0))}
        </span>
      </div>

      {/* Orders Data Table */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
          {isOrdersLoading ? (
            <div role="status" aria-label="Loading orders" className="space-y-3 p-5">
              <div className="flex items-center gap-3 text-xs font-bold text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin text-orange-500" /><span>Loading ordersâ€¦</span></div>
              {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-[var(--surface-2)]" />)}
            </div>
          ) : displayedOrdersError && pageOrders.length === 0 ? (
            <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="font-bold text-[var(--text-main)]">Could not load orders</p>
              <p className="max-w-xl text-xs text-[var(--text-muted)]">{displayedOrdersError}</p>
              <button type="button" onClick={fetchOrdersPage} className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-xs font-bold text-orange-500">Retry</button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)]">
              No orders found matching the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                    {selectionMode && <th className="p-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allSelectableOrdersSelected}
                        disabled={selectableOrders.length === 0}
                        onChange={() => setSelectedOrderIds((current) => {
                          const next = new Set(current);
                          if (allSelectableOrdersSelected) selectableOrders.forEach((order) => next.delete(order.id));
                          else selectableOrders.forEach((order) => next.add(order.id));
                          return next;
                        })}
                        className="accent-orange-500"
                        aria-label="Select all eligible orders"
                      />
                    </th>}
                    <th className="p-4">Order #</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Table</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Payment Method</th>
                    <th className="p-4">Order Status</th>
                    <th className="p-4">Date Time</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] text-xs">
                  {filteredOrders.map((order) => {
                    const badge = statusBadges[order.status] || { label: order.status, bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };

                    return (
                      <tr key={order.id} className="hover:bg-[var(--bg-color)]/40 transition-colors">
                        {selectionMode && <td className="p-4 text-center" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.has(order.id)}
                              onChange={() => toggleOrderSelection(order.id)}
                              className="accent-orange-500"
                              aria-label={`Select order ${order.orderNumber} for deletion`}
                            />
                        </td>}
                        <td className="p-4 whitespace-nowrap font-mono font-extrabold text-orange-400">
                          {order.orderNumber}
                        </td>
                        <td className="p-4">
                          <span className="font-bold block text-[var(--text-main)]">{order.user?.name || 'Guest Customer'}</span>
                          <span className="text-[10px] text-[var(--text-muted)] block">{order.user?.email || 'N/A'}</span>
                        </td>
                        <td className="p-4 font-bold text-[var(--text-main)]">
                          {resolveTableLabel(order)}
                        </td>
                        <td className="p-4 font-mono font-extrabold text-emerald-400">
                          {formatPrice(order.total)}
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)]">
                            {paymentMethodLabel(order.paymentMethod)}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold border ${badge.bg}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="p-4 text-[var(--text-muted)] text-[11px]">
                          {new Date(order.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl font-bold transition-all flex items-center space-x-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => {
                                setOrderToDelete(order);
                                setIsBulkDeleting(false);
                                setDeleteModalOpen(true);
                              }}
                              title="Delete Order Record"
                              className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 transition-all cursor-pointer icon-btn"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!isOrdersLoading && displayedOrdersError && pageOrders.length > 0 && <div role="alert" className="flex items-center justify-between gap-3 border-t border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-[var(--text-main)]"><span>Could not refresh orders: {displayedOrdersError}. Showing the last loaded data.</span><button type="button" onClick={fetchOrdersPage} className="shrink-0 font-bold text-orange-500">Retry</button></div>}
        </div>

        <div className="flex items-center justify-between gap-3" aria-label="Order result pages">
          <span className="text-xs text-[var(--text-muted)]">Page {currentPage} of {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1 || isOrdersLoading} className="min-h-10 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold text-[var(--text-main)] disabled:opacity-50">Previous</button>
            <button type="button" onClick={() => setCurrentPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage >= pageCount || isOrdersLoading} className="min-h-10 rounded-xl border border-[var(--border-color)] px-3 text-xs font-bold text-[var(--text-main)] disabled:opacity-50">Next</button>
          </div>
        </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-[var(--glass-bg-subtle)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-4">
              <div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  Detailed Lifecycle Inspection
                </span>
                <h3 className="text-xl font-extrabold text-[var(--text-main)] mt-1 font-mono">{selectedOrder.orderNumber}</h3>
                <p className="text-xs text-[var(--text-muted)]">Placed at {new Date(selectedOrder.createdAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer icon-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visual Lifecycle Stepper */}
            <div className="p-4 bg-[var(--bg-color)]/60 rounded-2xl border border-[var(--border-color)] space-y-2">
              <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">Order Lifecycle Stepper</span>
              <div className="flex items-center justify-between gap-1 overflow-x-auto py-2">
                {lifecycleSteps.map((step, idx) => {
                  const currentIdx = lifecycleSteps.indexOf(selectedOrder.status);
                  const isPassed = currentIdx >= idx;
                  const isCurrent = selectedOrder.status === step;

                  return (
                    <div key={step} className="flex-1 text-center min-w-[70px]">
                      <div
                        className={`h-2 rounded-full mb-1.5 transition-all ${
                          isCurrent
                            ? 'bg-orange-500 shadow-md shadow-orange-500/50'
                            : isPassed
                            ? 'bg-emerald-500'
                            : 'bg-[var(--border-color)]'
                        }`}
                      />
                      <span className={`text-[9px] font-bold block ${isCurrent ? 'text-orange-400' : isPassed ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                        {step.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Customer & Dining Info */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold block uppercase">Customer</span>
                <strong className="text-[var(--text-main)] block font-extrabold">{selectedOrder.user?.name || 'Guest Customer'}</strong>
                <span className="text-[10px] text-[var(--text-muted)]">{selectedOrder.user?.email || 'N/A'}</span>
              </div>
              <div className="p-3 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] font-bold block uppercase">Table & Session</span>
                <strong className="text-[var(--text-main)] block font-extrabold">{resolveTableLabel(selectedOrder)}</strong>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">Session ID: {selectedOrder.sessionId}</span>
              </div>
            </div>

            {/* Order Items Table Snapshot */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">Item Price Snapshots</span>
              <div className="divide-y divide-[var(--border-color)] bg-[var(--bg-color)]/40 rounded-xl border border-[var(--border-color)]">
                {selectedOrder.orderItems?.map((item) => (
                  <div key={item.id} className="p-3 flex justify-between items-center text-xs">
                    <div>
                      <strong className="text-[var(--text-main)] block font-bold">{item.nameSnapshot || item.menuItem?.name}</strong>
                      <span className="text-[10px] text-[var(--text-muted)]">Qty: {item.quantity} Ã— {formatPrice(item.priceSnapshot)}</span>
                    </div>
                    <span className="font-mono font-extrabold text-orange-400">{formatPrice(Number(item.quantity || 0) * Number(item.priceSnapshot || 0))}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Totals */}
            <div className="p-4 bg-[var(--bg-color)] rounded-2xl border border-[var(--border-color)] space-y-1.5 text-xs">
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>Subtotal:</span>
                <span className="font-mono font-bold">{formatPrice(selectedOrder.subtotal ?? selectedOrder.total)}</span>
              </div>
              {Number(selectedOrder.discount || 0) > 0 && <div className="flex justify-between text-[var(--text-muted)]"><span>Discount:</span><span className="font-mono font-bold">âˆ’{formatPrice(selectedOrder.discount)}</span></div>}
              <div className="flex justify-between text-[var(--text-muted)]"><span>Tax & service:</span><span className="font-mono font-bold">{formatPrice(selectedOrder.tax)}</span></div>
              <div className="flex justify-between text-base font-extrabold text-[var(--text-main)] pt-2 border-t border-[var(--border-color)]">
                <span>Grand Total:</span>
                <span className="font-mono text-emerald-400">{formatPrice(selectedOrder.total)}</span>
              </div>
            </div>

            {/* Transaction / Payment Details */}
            <div className="p-3 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)] text-xs space-y-1">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Payment Info</span>
              <div className="flex justify-between">
                <span>Method: <strong>{paymentMethodLabel(selectedOrder.paymentMethod)}</strong></span>
                <span>TxID: <strong className="font-mono text-orange-400">{selectedOrder.payment?.transactionId || 'N/A'}</strong></span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-[var(--border-color)]">
              <button
                  type="button"
                  onClick={() => {
                    setOrderToDelete(selectedOrder);
                    setIsBulkDeleting(false);
                    setDeleteModalOpen(true);
                  }}
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Order Record</span>
                </button>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-5 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-main)] rounded-xl text-xs font-bold border border-[var(--border-color)] transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setOrderToDelete(null);
          setIsBulkDeleting(false);
        }}
        onConfirm={isBulkDeleting ? handleConfirmBulkDelete : handleConfirmSingleDelete}
        title={isBulkDeleting
          ? (selectedOrderIds.size ? `Delete ${selectedOrderIds.size} Selected Orders` : 'Confirm Scoped Bulk Order Deletion')
          : `Delete Order #${orderToDelete?.orderNumber || ''}`}
        message={
          isBulkDeleting
            ? (selectedOrderIds.size
              ? `Permanently delete ${selectedOrderIds.size} selected orders, including completed and verified orders, with their associated records?`
              : 'Are you sure you want to permanently delete all CANCELLED & PAYMENT_FAILED orders? This permanently removes those records and their associated data.')
            : `Permanently delete order #${orderToDelete?.orderNumber} and its associated order and payment records?`
        }
        itemCount={isBulkDeleting ? selectedOrderIds.size : 1}
        itemName={selectedOrderIds.size
          ? `${selectedOrderIds.size} selected orders`
          : (orderToDelete ? `Order #${orderToDelete.orderNumber} (${formatPrice(orderToDelete.total)})` : '')}
        isScopeAll={isBulkDeleting}
        requiredConfirmationText={isBulkDeleting ? 'DELETE' : ''}
        confirmButtonText={isBulkDeleting ? (selectedOrderIds.size ? `Delete ${selectedOrderIds.size} Orders` : 'Delete Matching Orders') : 'Delete Order'}
        loading={deleteLoading}
        warningNotes={[
          'Permanent deletion removes the order, payment, item snapshots, status history, and ETA records from the database.',
          'Inventory movement and audit logs are retained where the system records them separately.',
        ]}
      />
    </div>
  );
};

export default AdminOrdersView;


