import ThemedSelect from '../../common/ThemedSelect';
import  { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Download,
  Printer,
  Trash2,
  Loader2,
} from 'lucide-react';
import { exportToCSV, printPDFReport } from '../../../utils/exportUtils';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import api from '../../../services/api';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const AdminAuditLogsView = ({ logs = [], loading, onRefresh, showToast }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  // Selection & Delete State
  const [selectedLogIds, setSelectedLogIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Distinct actions for filtering
  const distinctActions = useMemo(() => {
    const set = new Set();
    logs.forEach((l) => {
      if (l.action) set.add(l.action);
    });
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(log.entityId || '').includes(searchTerm);
      const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;

      return matchesSearch && matchesAction;
    });
  }, [logs, searchTerm, actionFilter]);

  // Checkbox Selection
  const isAllSelected =
    filteredLogs.length > 0 &&
    filteredLogs.every((l) => selectedLogIds.has(l.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLogIds(new Set());
    } else {
      const next = new Set(selectedLogIds);
      filteredLogs.forEach((l) => next.add(l.id));
      setSelectedLogIds(next);
    }
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedLogIds(new Set());
    setSelectionMode((active) => !active);
  };

  const handleToggleSelect = (id) => {
    const next = new Set(selectedLogIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedLogIds(next);
  };

  // Single Delete
  const handleConfirmSingleDelete = async () => {
    if (!logToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete(`/admin/audit-logs/${logToDelete.id}`);
      if (showToast) showToast(res.data?.message || 'Audit log entry deleted successfully.');
      setDeleteModalOpen(false);
      setLogToDelete(null);
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        next.delete(logToDelete.id);
        return next;
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete audit log error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to delete audit log entry', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bulk Delete
  const handleConfirmBulkDelete = async () => {
    const ids = Array.from(selectedLogIds);
    if (ids.length === 0) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete('/admin/audit-logs/bulk', { data: { ids } });
      if (showToast) showToast(res.data?.message || `Successfully deleted ${ids.length} audit log records.`);
      setDeleteModalOpen(false);
      setIsBulkDeleting(false);
      setSelectedLogIds(new Set());
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Bulk delete audit logs error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to bulk delete audit logs', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExportCSV = () => {
    const csvData = filteredLogs.map((l) => ({
      User: l.user?.name || l.user?.email || 'System',
      Role: l.user?.role || 'SYSTEM',
      Action: l.action,
      Entity: l.entity,
      EntityID: l.entityId || 'N/A',
      IPAddress: l.ipAddress || '127.0.0.1',
      Timestamp: new Date(l.createdAt).toLocaleString(),
    }));

    exportToCSV(`audit_logs_${Date.now()}.csv`, csvData, [
      { key: 'User', label: 'User Name' },
      { key: 'Role', label: 'Role' },
      { key: 'Action', label: 'Action Trail' },
      { key: 'Entity', label: 'Target Entity' },
      { key: 'EntityID', label: 'Entity ID' },
      { key: 'IPAddress', label: 'IP Address' },
      { key: 'Timestamp', label: 'Timestamp' },
    ]);
  };

  const handleExportPDF = () => {
    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Action</th>
            <th>Entity</th>
            <th>Entity ID</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${filteredLogs
            .map(
              (l) => `
            <tr>
              <td><strong>${l.user?.name || 'System'}</strong></td>
              <td>${l.user?.role || 'SYSTEM'}</td>
              <td><span class="badge badge-success">${l.action}</span></td>
              <td>${l.entity}</td>
              <td>${l.entityId || 'N/A'}</td>
              <td>${new Date(l.createdAt).toLocaleString()}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
    printPDFReport('System Immutable Audit Logs Report', tableHtml);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col items-stretch gap-4 glass-card p-4 sm:p-6 lg:flex-row lg:justify-between lg:items-start">
        <div className="min-w-0 flex items-start gap-2">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">System Audit Logs</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Comprehensive audit trail of admin, inventory, and system events with single &amp; bulk deletion controls.</p>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto lg:w-auto lg:shrink-0 lg:overflow-visible">
          {/* Bulk Delete Selected Button */}
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedLogIds.size} className="mobile-action-third h-10 justify-center px-1 text-[10px] lg:h-auto lg:w-auto lg:px-3 lg:py-2 lg:text-xs" mobileLabel="Select" mobileActiveLabel="Done" />
          {selectionMode && selectedLogIds.size > 0 && (
            <button
              onClick={() => {
                setIsBulkDeleting(true);
                setDeleteModalOpen(true);
              }}
              className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-rose-500/20 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400 shadow-md transition-all hover:bg-rose-500/20 cursor-pointer animate-fade-in lg:h-auto lg:w-auto lg:gap-1.5 lg:px-2.5 lg:py-2 lg:text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
              <span><span className="lg:hidden">Delete</span><span className="hidden lg:inline">Delete Selected ({selectedLogIds.size})</span></span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-emerald-500 cursor-pointer lg:h-auto lg:w-auto lg:gap-1.5 lg:px-2.5 lg:py-2 lg:text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span><span className="lg:hidden">CSV</span><span className="hidden lg:inline">Export CSV</span></span>
          </button>
          <button
            onClick={handleExportPDF}
            className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-orange-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-orange-500 cursor-pointer lg:h-auto lg:w-auto lg:gap-1.5 lg:px-2.5 lg:py-2 lg:text-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span><span className="lg:hidden">PDF</span><span className="hidden lg:inline">Export PDF</span></span>
          </button>
        </div>
      </div>

      {/* Search & Action Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search action, entity, user, entity ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
          />
        </div>

        <ThemedSelect
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-4 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
        >
          <option value="ALL">All Actions ({logs.length})</option>
          {distinctActions.map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </ThemedSelect>

        {selectionMode && selectedLogIds.size > 0 && (
          <div className="flex items-center space-x-2 text-xs font-bold text-orange-400">
            <span>{selectedLogIds.size} selected</span>
            <button
              onClick={() => setSelectedLogIds(new Set())}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] underline cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs font-bold text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            <span>Loading Audit Logs...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-xs font-bold text-[var(--text-muted)]">
            No audit logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                  {selectionMode && <th className="p-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500/20 cursor-pointer"
                      title={isAllSelected ? 'Deselect all' : 'Select all'}
                    />
                  </th>}
                  <th className="p-4">User</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Entity</th>
                  <th className="p-4">Entity ID</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredLogs.map((log) => {
                  const isSelected = selectedLogIds.has(log.id);

                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-[var(--bg-color)]/40 transition-colors ${
                        isSelected ? 'bg-orange-500/5' : ''
                      }`}
                    >
                      {selectionMode && <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(log.id)}
                          className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500/20 cursor-pointer"
                        />
                      </td>}
                      <td className="p-4 whitespace-nowrap font-bold text-[var(--text-main)]">
                        {log.user?.name || log.user?.email || 'System'}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-orange-500/10 text-orange-400 border border-orange-500/20">
                          {log.user?.role || 'SYSTEM'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-mono font-extrabold text-emerald-400">
                        {log.action}
                      </td>
                      <td className="p-4 whitespace-nowrap text-[var(--text-main)] font-semibold">
                        {log.entity}
                      </td>
                      <td className="p-4 whitespace-nowrap font-mono text-[var(--text-muted)]">
                        {log.entityId || 'N/A'}
                      </td>
                      <td className="p-4 whitespace-nowrap font-mono text-[11px] text-[var(--text-muted)]">
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                      <td className="p-4 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="p-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => {
                            setLogToDelete(log);
                            setIsBulkDeleting(false);
                            setDeleteModalOpen(true);
                          }}
                          title="Delete Audit Log Record"
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
          setLogToDelete(null);
          setIsBulkDeleting(false);
        }}
        onConfirm={isBulkDeleting ? handleConfirmBulkDelete : handleConfirmSingleDelete}
        title={isBulkDeleting ? 'Confirm Bulk Audit Log Deletion' : 'Delete Audit Log Record'}
        message={
          isBulkDeleting
            ? `Are you sure you want to permanently delete ${selectedLogIds.size} selected audit log records? This cannot be undone.`
            : `Are you sure you want to permanently delete audit record for action "${logToDelete?.action || ''}" on entity "${logToDelete?.entity || ''}"?`
        }
        itemCount={isBulkDeleting ? selectedLogIds.size : 1}
        itemName={isBulkDeleting ? `${selectedLogIds.size} Audit Logs` : logToDelete?.action || 'Audit Log'}
        confirmButtonText={isBulkDeleting ? `Delete ${selectedLogIds.size} Records` : 'Delete Record'}
        loading={deleteLoading}
        dangerLevel="danger"
        warningNotes={[
          'Audit log deletions are logged for security oversight.',
          'Deleted records cannot be recovered.'
        ]}
      />
    </div>
  );
};

export default AdminAuditLogsView;

