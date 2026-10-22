import  { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Printer,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { exportToCSV, printPDFReport } from '../../../utils/exportUtils';
import DateRangeFilterBar, { getPresetRange } from '../../common/DateRangeFilterBar';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import api from '../../../services/api';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';
import { paymentMethodLabel } from '../../../utils/paymentMethods';
import { resolveTableLabel } from '../../../utils/customerTableLabel';

const toDateStr = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const AdminPaymentsView = ({ orders = [], onRefresh, showToast }) => {
  const [methodTab, setMethodTab] = useState('ALL');
  const [statusTab] = useState('ALL');
  const [viewMode] = useState('TABLE'); // TABLE only – calendar removed
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Date range filter state
  const [datePreset, setDatePreset] = useState('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Global Delete State for Payment Orders
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState(new Set());

  const payments = useMemo(() => {
    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.user?.name || 'Guest Customer',
      customerEmail: o.user?.email || 'N/A',
      tableId: resolveTableLabel(o),
      tableNumber: resolveTableLabel(o),
      amount: o.total,
      method: paymentMethodLabel(o.paymentMethod),
      orderStatus: o.status,
      paymentStatus: o.paymentStatus || (o.status === 'PAID' ? 'VERIFIED' : 'PENDING'),
      transactionId: o.payment?.transactionId || 'N/A',
      proofImage: o.payment?.proofImage,
      paymentId: o.payment?.id,
      createdAt: o.createdAt,
      rawData: o,
    }));
  }, [orders]);

  // Active date range computed from preset or custom
  const activeDateRange = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      if (customFrom || customTo) return { from: customFrom || '', to: customTo || '' };
      return null;
    }
    if (datePreset === 'ALL') return null;
    return getPresetRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      let matchesMethod = true;
      if (methodTab === 'COD') matchesMethod = p.method === 'COD';
      else if (methodTab === 'ONLINE') matchesMethod = p.method !== 'COD';

      let matchesStatus = true;
      if (statusTab === 'PENDING') matchesStatus = p.orderStatus === 'PAYMENT_PENDING' || p.paymentStatus === 'PENDING';
      else if (statusTab === 'PAID') matchesStatus = ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(p.orderStatus);
      else if (statusTab === 'FAILED') matchesStatus = p.orderStatus === 'PAYMENT_FAILED';

      const matchesSearch =
        p.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.transactionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(p.tableId).includes(searchTerm);

      let matchesDate = true;
      if (activeDateRange) {
        const pDate = toDateStr(p.createdAt);
        if (activeDateRange.from && activeDateRange.to) {
          matchesDate = pDate >= activeDateRange.from && pDate <= activeDateRange.to;
        } else if (activeDateRange.from) {
          matchesDate = pDate >= activeDateRange.from;
        } else if (activeDateRange.to) {
          matchesDate = pDate <= activeDateRange.to;
        }
      }

      return matchesMethod && matchesStatus && matchesSearch && matchesDate;
    });
  }, [payments, methodTab, statusTab, searchTerm, activeDateRange]);

  const bulkDeletablePayments = filteredPayments;
  const allBulkDeletableSelected = bulkDeletablePayments.length > 0 && bulkDeletablePayments.every((payment) => selectedPaymentIds.has(payment.id));

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedPaymentIds(new Set());
    setSelectionMode((active) => !active);
  };



  const handleDeleteFailedPayment = async () => {
    if (!paymentToDelete && !isBulkDeleting) return;
    setDeleteLoading(true);
    try {
      const res = isBulkDeleting
        ? await api.delete('/orders/bulk', { data: { ids: Array.from(selectedPaymentIds) } })
        : await api.delete(`/orders/${paymentToDelete.id}`);
      if (showToast) showToast(res.data?.message || (isBulkDeleting ? 'Selected payment orders removed.' : 'Payment record removed.'));
      setDeleteModalOpen(false);
      setPaymentToDelete(null);
      setSelectedPaymentIds(new Set());
      setIsBulkDeleting(false);
      await onRefresh?.();
    } catch (err) {
      console.error('Delete payment record error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to remove payment record', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleVerifyPayment = async (paymentId, status) => {
    if (!paymentId) return;
    setActionLoading(true);
    try {
      await api.put(`/payments/${paymentId}/verify`, { status });
      if (showToast) showToast(`Payment marked as ${status}!`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to update payment status', 'error');
      } finally {
      setActionLoading(false);
    }
  };

  const handleExportCSV = () => {
    const csvData = filteredPayments.map((p) => ({
      OrderNumber: p.orderNumber,
      Customer: p.customerName,
      Email: p.customerEmail,
      Table: p.tableId,
      Amount: p.amount,
      Method: p.method,
      PaymentStatus: p.paymentStatus,
      TransactionID: p.transactionId,
      Date: new Date(p.createdAt).toLocaleString(),
    }));

    exportToCSV(`payments_report_${Date.now()}.csv`, csvData, [
      { key: 'OrderNumber', label: 'Order Number' },
      { key: 'Customer', label: 'Customer' },
      { key: 'Email', label: 'Email' },
      { key: 'Table', label: 'Table' },
      { key: 'Amount', label: 'Amount (Rs.)' },
      { key: 'Method', label: 'Method' },
      { key: 'PaymentStatus', label: 'Payment Status' },
      { key: 'TransactionID', label: 'Transaction ID' },
      { key: 'Date', label: 'Timestamp' },
    ]);
  };

  const handleExportPDF = () => {
    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Order #</th>
            <th>Customer</th>
            <th>Table</th>
            <th>Amount (Rs.)</th>
            <th>Method</th>
            <th>Transaction ID</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${filteredPayments
            .map(
              (p) => `
            <tr>
              <td><strong>${p.orderNumber}</strong></td>
              <td>${p.customerName}</td>
              <td>${p.tableId}</td>
              <td>Rs. ${Number(p.amount || 0).toFixed(2)}</td>
              <td>${p.method}</td>
              <td>${p.transactionId}</td>
              <td><span class="badge badge-success">${p.paymentStatus}</span></td>
              <td>${new Date(p.createdAt).toLocaleString()}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
    printPDFReport('Payments Audit Report', tableHtml);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-6">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Payments Monitoring & Audit</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Audit COD cash collections and verify online wallet transactions.</p>
        </div>

        <div className="flex items-center space-x-2">


          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="px-3.5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Date Quick-Filter Bar with Dual-Click Interactive Range Popover */}
      <DateRangeFilterBar
        preset={datePreset}
        onPresetChange={setDatePreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomRangeChange={(from, to) => {
          setCustomFrom(from);
          setCustomTo(to);
        }}
      />

      {/* Tabs & Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        {/* Method Tabs */}
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-1 sm:w-auto">
          {[
            { id: 'ALL', label: 'All Payments' },
            { id: 'COD', label: 'Pay at Counter (COD)' },
            { id: 'ONLINE', label: 'Online Payment' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setMethodTab(item.id)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[10px] font-extrabold transition-all cursor-pointer sm:flex-initial sm:px-3 sm:text-xs ${
                methodTab === item.id ? 'bg-orange-600 text-white shadow-md' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <span className="sm:hidden">{item.id === 'ALL' ? 'All' : item.id === 'COD' ? 'COD' : 'Online'}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Order #, Email, TxID..."
            className="w-full pl-10 pr-4 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-nowrap items-center justify-end gap-1 sm:gap-2">
        <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedPaymentIds.size} mobileLabel="Select" mobileActiveLabel="Done" className="px-2 py-2 text-[10px] sm:px-3 sm:py-2.5 sm:text-xs" />
        {selectionMode && (
          <>
            <label className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allBulkDeletableSelected}
                disabled={bulkDeletablePayments.length === 0}
                onChange={() => setSelectedPaymentIds((current) => {
                  const next = new Set(current);
                  if (allBulkDeletableSelected) bulkDeletablePayments.forEach((payment) => next.delete(payment.id));
                  else bulkDeletablePayments.forEach((payment) => next.add(payment.id));
                  return next;
                })}
                className="accent-orange-500"
                aria-label="Select all payment orders"
              />
              <span className="sm:hidden">All</span>
              <span className="hidden sm:inline">Select all</span>
            </label>
            {selectedPaymentIds.size > 0 && (
              <button
                type="button"
                onClick={() => { setIsBulkDeleting(true); setPaymentToDelete(null); setDeleteModalOpen(true); }}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-rose-600 px-2 py-2 text-[10px] font-black text-white transition-colors hover:bg-rose-500 cursor-pointer sm:gap-2 sm:px-3 sm:py-2 sm:text-xs"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span className="sm:hidden">Delete ({selectedPaymentIds.size})</span>
                <span className="hidden sm:inline">Delete Selected ({selectedPaymentIds.size})</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Payment Records Table */}
      {viewMode === 'TABLE' && (
        <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)]">
            No payment records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-color)] text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]" style={{ background: 'var(--table-header-bg)' }}>
                  <th className="p-4">Order #</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Table</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">TxID</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Verification Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-xs">
                {filteredPayments.map((p) => {
                  const isPaid = ['PAID', 'PREPARING', 'READY', 'COMPLETED'].includes(p.orderStatus);
                  const isPending = p.orderStatus === 'PAYMENT_PENDING' || p.paymentStatus === 'PENDING';
                  const hasVerifiedPayment = ['PAID', 'VERIFIED'].includes(String(p.paymentStatus).toUpperCase());

                  return (
                    <tr key={p.id} className="hover:bg-[var(--bg-color)]/40 transition-colors">
                      <td className="p-4 whitespace-nowrap font-mono font-extrabold text-orange-400">
                        <span className="inline-flex items-center gap-2">
                          {selectionMode && (
                            <input
                              type="checkbox"
                              checked={selectedPaymentIds.has(p.id)}
                              onChange={() => setSelectedPaymentIds((current) => {
                                const next = new Set(current);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              })}
                              className="accent-orange-500"
                              aria-label={`Select payment order ${p.orderNumber}`}
                            />
                          )}
                          {p.orderNumber}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-bold block text-[var(--text-main)]">{p.customerName}</span>
                        <span className="text-[10px] text-[var(--text-muted)] block">{p.customerEmail}</span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold">{p.tableId}</td>
                      <td className="p-4 whitespace-nowrap font-mono font-extrabold text-emerald-400">Rs. {Number(p.amount || 0).toFixed(2)}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-[var(--bg-color)] border border-[var(--border-color)] uppercase">
                          {p.method}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-mono text-[11px] text-[var(--text-muted)]">{p.transactionId}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold border ${
                            isPaid
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : isPending
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isPaid ? 'PAID / VERIFIED' : isPending ? 'PENDING VERIFICATION' : 'FAILED'}
                        </span>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                          {isPending && p.paymentId ? (
                            <>
                              <button
                                onClick={() => handleVerifyPayment(p.paymentId, 'VERIFIED')}
                                disabled={actionLoading}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[10px] transition-all cursor-pointer shadow-sm"
                              >
                                Verify
                              </button>
                              <button
                                onClick={() => handleVerifyPayment(p.paymentId, 'REJECTED')}
                                disabled={actionLoading}
                                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg font-bold text-[10px] transition-all cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            hasVerifiedPayment || isPaid ? (
                              <span title="Payment was verified or settled." className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-bold">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                Verified
                              </span>
                            ) : <span className="text-[10px] text-[var(--text-muted)] italic">No verification action</span>
                          )}

                          <button
                            onClick={() => {
                              setPaymentToDelete(p);
                              setIsBulkDeleting(false);
                              setDeleteModalOpen(true);
                            }}
                            title="Delete payment order and its linked records"
                            aria-label={`Delete payment order ${p.orderNumber}`}
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all cursor-pointer icon-btn"
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
      </div>
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setPaymentToDelete(null);
          setIsBulkDeleting(false);
        }}
        onConfirm={handleDeleteFailedPayment}
        title={isBulkDeleting ? `Delete ${selectedPaymentIds.size} Orders` : `Delete Payment Order (${paymentToDelete?.orderNumber || ''})`}
        message={isBulkDeleting
          ? 'This permanently deletes the selected orders and their payment records, including verified or settled payments.'
          : 'This permanently deletes the selected order and its payment record, including verified or settled payments.'}
        itemName={isBulkDeleting ? `${selectedPaymentIds.size} selected orders` : (paymentToDelete ? `Order #${paymentToDelete.orderNumber} (Rs. ${paymentToDelete.amount})` : '')}
        itemCount={isBulkDeleting ? selectedPaymentIds.size : 1}
        isBulk={isBulkDeleting}
        confirmButtonText={isBulkDeleting ? `Delete ${selectedPaymentIds.size} Orders` : 'Delete Record'}
        loading={deleteLoading}
        warningNotes={[
          'This removes the order, payment, items, status history, and ETA record from the database. The action cannot be undone.',
        ]}
      />
    </div>
  );
};

export default AdminPaymentsView;

