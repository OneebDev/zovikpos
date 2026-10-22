import  { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History,
  Search,
  ArrowRight,
  Trash2,
  Download,
  Printer,
  Loader2,
} from 'lucide-react';
import { exportToCSV, printPDFReport } from '../../../utils/exportUtils';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';
import api from '../../../services/api';

const AdminOrderStatusHistoryView = ({ showToast }) => {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Selection & Delete State
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/order-history');
      setHistoryList(res.data.history || []);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to load order status history', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredHistory = useMemo(() => {
    return historyList.filter(
      (h) =>
        h.order?.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.fromStatus?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.toStatus?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.changedByUser?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.changedByUser?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(h.orderId || '').includes(searchTerm)
    );
  }, [historyList, searchTerm]);

  // Checkbox Selection
  const isAllSelected =
    filteredHistory.length > 0 &&
    filteredHistory.every((h) => selectedHistoryIds.has(h.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedHistoryIds(new Set());
    } else {
      const next = new Set(selectedHistoryIds);
      filteredHistory.forEach((h) => next.add(h.id));
      setSelectedHistoryIds(next);
    }
  };

  const handleToggleSelect = (id) => {
    const next = new Set(selectedHistoryIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedHistoryIds(next);
  };

  const toggleSelectionMode = () => {
    setSelectionMode((active) => {
      if (active) setSelectedHistoryIds(new Set());
      return !active;
    });
  };

  // Single Delete
  const handleConfirmSingleDelete = async () => {
    if (!itemToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete(`/admin/order-history/${itemToDelete.id}`);
      if (showToast) showToast(res.data?.message || 'Order status history entry deleted successfully.');
      setDeleteModalOpen(false);
      setItemToDelete(null);
      setSelectedHistoryIds((prev) => {
        const next = new Set(prev);
        next.delete(itemToDelete.id);
        return next;
      });
      fetchHistory();
    } catch (err) {
      console.error('Delete order history error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to delete history record', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bulk Delete
  const handleConfirmBulkDelete = async () => {
    const ids = Array.from(selectedHistoryIds);
    if (ids.length === 0) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete('/admin/order-history/bulk', { data: { ids } });
      if (showToast) showToast(res.data?.message || `Successfully deleted ${ids.length} history records.`);
      setDeleteModalOpen(false);
      setIsBulkDeleting(false);
      setSelectedHistoryIds(new Set());
      fetchHistory();
    } catch (err) {
      console.error('Bulk delete order history error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to bulk delete history records', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Exports
  const handleExportCSV = () => {
    const csvData = filteredHistory.map((h) => ({
      OrderNumber: h.order?.orderNumber || `Order #${h.orderId}`,
      FromStatus: h.fromStatus || 'INITIAL',
      ToStatus: h.toStatus,
      ChangedBy: h.changedByUser?.name || h.changedByUser?.email || 'System',
      Role: h.changedByUser?.role || 'SYSTEM',
      Timestamp: new Date(h.createdAt).toLocaleString(),
    }));

    exportToCSV(`order_status_history_${Date.now()}.csv`, csvData, [
      { key: 'OrderNumber', label: 'Order #' },
      { key: 'FromStatus', label: 'Previous Status' },
      { key: 'ToStatus', label: 'New Status' },
      { key: 'ChangedBy', label: 'Changed By' },
      { key: 'Role', label: 'Role' },
      { key: 'Timestamp', label: 'Timestamp' },
    ]);
  };

  const handleExportPDF = () => {
    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>Order #</th>
            <th>Previous Status</th>
            <th>New Status</th>
            <th>Changed By</th>
            <th>Role</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${filteredHistory
            .map(
              (h) => `
            <tr>
              <td><strong>${h.order?.orderNumber || `Order #${h.orderId}`}</strong></td>
              <td>${h.fromStatus || 'INITIAL'}</td>
              <td><span class="badge badge-success">${h.toStatus}</span></td>
              <td>${h.changedByUser?.name || 'System'}</td>
              <td>${h.changedByUser?.role || 'SYSTEM'}</td>
              <td>${new Date(h.createdAt).toLocaleString()}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
    printPDFReport('Order Status History Report', tableHtml);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col items-stretch gap-4 glass-card p-4 sm:p-6 lg:flex-row lg:justify-between lg:items-start">
        <div className="min-w-0 flex items-start gap-2">
          <History className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">
              Order Status Transition History Timeline
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Auditable timeline showing exact status changes, user accounts, roles, and timestamps per order with single &amp; bulk deletion.
            </p>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto pb-1 lg:w-auto lg:justify-end lg:shrink-0 lg:overflow-visible">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedHistoryIds.size} className="mobile-action-third h-10 justify-center px-1 text-[10px] lg:h-auto lg:w-auto lg:px-3 lg:py-2 lg:text-xs" mobileLabel="Select" mobileActiveLabel="Done" />
          {/* Bulk Delete Selected Button */}
          {selectionMode && selectedHistoryIds.size > 0 && (
            <button
              onClick={() => {
                setIsBulkDeleting(true);
                setDeleteModalOpen(true);
              }}
              className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-rose-500/20 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400 shadow-md transition-all hover:bg-rose-500/20 cursor-pointer animate-fade-in lg:h-auto lg:w-auto lg:gap-1.5 lg:px-2.5 lg:py-2 lg:text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
              <span><span className="lg:hidden">Delete</span><span className="hidden lg:inline">Delete Selected ({selectedHistoryIds.size})</span></span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-emerald-500 cursor-pointer lg:h-auto lg:w-auto lg:gap-1.5 lg:px-2.5 lg:py-2 lg:text-xs"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span><span className="lg:hidden">CSV</span><span className="hidden lg:inline">Export CSV</span></span>
          </button>
          <button
            onClick={handleExportPDF}
            className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-orange-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-orange-500 cursor-pointer lg:h-auto lg:w-auto lg:gap-1.5 lg:px-2.5 lg:py-2 lg:text-xs"
          >
            <Printer className="h-3.5 w-3.5 shrink-0" />
            <span><span className="lg:hidden">PDF</span><span className="hidden lg:inline">Export PDF</span></span>
          </button>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Order #, Status, or User..."
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
          />
        </div>

        {selectionMode && selectedHistoryIds.size > 0 && (
          <div className="flex items-center space-x-2 text-xs font-bold text-orange-400">
            <span>{selectedHistoryIds.size} selected</span>
            <button
              onClick={() => setSelectedHistoryIds(new Set())}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] underline cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* History Table */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs font-bold text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            <span>Loading Status Transition Timeline...</span>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)]">
            No status transition logs recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                  {selectionMode && <th className="p-4 w-10 text-center">
                    <input type="checkbox" checked={isAllSelected} onChange={handleToggleSelectAll} className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500/20 cursor-pointer" title={isAllSelected ? 'Deselect all' : 'Select all'} />
                  </th>}
                  <th className="p-4">Order #</th>
                  <th className="p-4">Previous Status</th>
                  <th className="p-4">Transition</th>
                  <th className="p-4">New Status</th>
                  <th className="p-4">Changed By User</th>
                  <th className="p-4">User Role</th>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredHistory.map((h) => {
                  const isSelected = selectedHistoryIds.has(h.id);

                  return (
                    <tr
                      key={h.id}
                      className={`hover:bg-[var(--bg-color)]/40 transition-colors ${
                        isSelected ? 'bg-orange-500/5' : ''
                      }`}
                    >
                      {selectionMode && <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(h.id)}
                          className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500/20 cursor-pointer"
                        />
                      </td>}
                      <td className="p-4 whitespace-nowrap font-mono font-extrabold text-orange-400">
                        {h.order?.orderNumber || `Order #${h.orderId}`}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-color)] border border-[var(--border-color)]">
                          {h.fromStatus || 'INITIAL'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-orange-400">
                        <ArrowRight className="w-4 h-4" />
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {h.toStatus}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold text-[var(--text-main)]">
                        {h.changedByUser?.name || h.changedByUser?.email || 'System'}
                      </td>
                      <td className="p-4 whitespace-nowrap uppercase font-bold text-orange-400 text-[10px]">
                        {h.changedByUser?.role || 'SYSTEM'}
                      </td>
                      <td className="p-4 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                        {new Date(h.createdAt).toLocaleString()}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setItemToDelete(h);
                            setIsBulkDeleting(false);
                            setDeleteModalOpen(true);
                          }}
                          title="Delete Status History Entry"
                          className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 transition-all cursor-pointer inline-flex items-center icon-btn"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
          setIsBulkDeleting(false);
        }}
        onConfirm={isBulkDeleting ? handleConfirmBulkDelete : handleConfirmSingleDelete}
        title={isBulkDeleting ? 'Confirm Bulk Status History Deletion' : 'Delete Status History Entry'}
        message={
          isBulkDeleting
            ? `Are you sure you want to permanently delete ${selectedHistoryIds.size} selected status history records? This cannot be undone.`
            : `Are you sure you want to delete status history transition "${itemToDelete?.fromStatus || 'INITIAL'} â†’ ${itemToDelete?.toStatus}" for ${itemToDelete?.order?.orderNumber || 'this order'}?`
        }
        itemCount={isBulkDeleting ? selectedHistoryIds.size : 1}
        itemName={isBulkDeleting ? `${selectedHistoryIds.size} History Records` : itemToDelete?.order?.orderNumber || 'Status History'}
        confirmButtonText={isBulkDeleting ? `Delete ${selectedHistoryIds.size} Records` : 'Delete Record'}
        loading={deleteLoading}
        dangerLevel="danger"
        warningNotes={[
          'Order status history records track transition accountability.',
          'Deleting these records removes them permanently from transition timelines.'
        ]}
      />
    </div>
  );
};

export default AdminOrderStatusHistoryView;

