import { useState, useEffect, useCallback } from 'react';
import {

  Plus,
  RefreshCw,
  Download,
  Printer,
  X,
  Power,
  CheckSquare,
  Square,
  Trash2,
  Copy,
} from 'lucide-react';
import api from '../../../services/api';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';

const getQrOriginWarning = (tableRows) => {
  const urls = (tableRows || []).map((table) => table.url).filter(Boolean);
  const badUrl = urls.find((url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1'
        || host.endsWith('.local') || /^10\./.test(host) || /^192\.168\./.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    } catch {
      return true;
    }
  });
  return badUrl
    ? 'QR links are using localhost or a private network address. Set backend FRONTEND_URL to the public HTTPS customer URL, then reload this page before printing or downloading QR cards.'
    : '';
};

const AdminTablesQRView = ({ showToast }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [selectedTableIds, setSelectedTableIds] = useState([]);
  const [qrOriginWarning, setQrOriginWarning] = useState('');

  // Global Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchTables = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tables/qr/batch');
      const qrTables = res.data.tables || [];
      setTables(qrTables);
      setQrOriginWarning(getQrOriginWarning(qrTables));
    } catch (err) {
      console.error('Fetch tables QR error:', err);
      try {
        const fallbackRes = await api.get('/tables');
        setTables(fallbackRes.data.tables || []);
      } catch (fallbackErr) {
        console.error(fallbackErr);
        if (showToast) showToast('Failed to load tables list', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const handleToggleTableStatus = async (table) => {
    setActionLoading(true);
    try {
      await api.put(`/tables/${table.id}`, {
        isActive: !table.isActive,
      });
      setTables((prev) =>
        prev.map((t) => (t.id === table.id ? { ...t, isActive: !table.isActive } : t))
      );
      if (showToast) showToast(`Table #${table.tableNumber || table.id} status updated!`);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to update table status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // REGENERATE SINGLE TABLE (Updates ONLY that table in local state, no full reload)
  const handleRegenerateQR = async (tableId) => {
    setRegeneratingId(tableId);
    try {
      const res = await api.post(`/tables/${tableId}/regenerate-qr`);
      const updatedTable = res.data.table;
      if (updatedTable?.url) setQrOriginWarning(getQrOriginWarning([updatedTable]));

      setTables((prev) =>
        prev.map((t) => {
          if (t.id === tableId && updatedTable) {
            return {
              ...t,
              qrToken: updatedTable.qrToken,
              url: updatedTable.url || t.url,
              qrDataUrl: updatedTable.qrDataUrl || t.qrDataUrl,
            };
          }
          return t;
        })
      );
      if (showToast) showToast(`Regenerated QR token for Table #${tableId}!`);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to regenerate table QR', 'error');
    } finally {
      setRegeneratingId(null);
    }
  };

  // MULTI REGENERATE (Selected Tables Only)
  const handleRegenerateSelected = async () => {
    if (selectedTableIds.length === 0) return;
    setActionLoading(true);
    try {
      for (const tableId of selectedTableIds) {
        const res = await api.post(`/tables/${tableId}/regenerate-qr`);
        const updatedTable = res.data.table;
        if (updatedTable) {
          setTables((prev) =>
            prev.map((t) =>
              t.id === tableId
                ? {
                  ...t,
                  qrToken: updatedTable.qrToken,
                  url: updatedTable.url || t.url,
                  qrDataUrl: updatedTable.qrDataUrl || t.qrDataUrl,
                }
                : t
            )
          );
        }
      }
      setQrOriginWarning(getQrOriginWarning(tables));
      if (showToast) showToast(`Regenerated QR for ${selectedTableIds.length} selected tables!`);
      setSelectedTableIds([]);
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to regenerate selected tables', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTable = async (e) => {
    e.preventDefault();
    if (!newTableNumber) return;
    setActionLoading(true);
    try {
      await api.post('/tables', { tableNumber: newTableNumber, branchId: 1 });
      if (showToast) showToast(`Created Table #${newTableNumber}!`);
      setShowAddModal(false);
      setNewTableNumber('');
      fetchTables();
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to create table', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Single Table Delete Handler
  const handleConfirmDeleteTable = async () => {
    if (!tableToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await api.delete(`/tables/${tableToDelete.id}`);
      if (showToast) showToast(res.data?.message || 'Table deleted successfully.');
      setDeleteModalOpen(false);
      setTableToDelete(null);
      fetchTables();
    } catch (err) {
      console.error('Delete table error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to delete table', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bulk Delete Inactive Tables
  const handleConfirmBulkDeleteTables = async () => {
    setDeleteLoading(true);
    try {
      const res = await api.delete('/tables/bulk', { data: { scope: 'INACTIVE' } });
      if (showToast) showToast(res.data?.message || 'Bulk table cleanup completed.');
      setDeleteModalOpen(false);
      setIsBulkDeleting(false);
      fetchTables();
    } catch (err) {
      console.error('Bulk delete tables error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to delete tables', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDownloadQR = (table) => {
    if (!table.qrDataUrl) return;
    const link = document.createElement('a');
    link.href = table.qrDataUrl;
    link.download = `table_${table.tableNumber || table.id}_qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyQrUrl = async (table) => {
    const url = table?.url;
    if (!url) {
      if (showToast) showToast('QR URL is unavailable. Check backend FRONTEND_URL.', 'error');
      return;
    }

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('textarea');
        input.value = url;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Clipboard copy was blocked');
      }
      if (showToast) showToast(`Table ${table.tableNumber || table.id} URL copied. Paste it into your desktop browser.`);
    } catch {
      if (showToast) showToast('Could not copy the QR URL. You can select the URL shown on the card and copy it.', 'error');
    }
  };

  const handlePrintQRCard = (tablesToPrint) => {
    const printList = Array.isArray(tablesToPrint) ? tablesToPrint : [tablesToPrint];
    if (printList.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const cardsHtml = printList
      .map((table) => {
        const displayNum = table.tableNumber || `Table ${table.id}`;
        const targetUrl = table.url || '';

        return `
          <div class="card">
            <div class="logo"><img src="${window.location.origin}/assets/zovikpos-mark.svg" alt="" /> <span>ZOVIKPOS</span></div>
            <div class="subtitle">${table.branchName || 'Main Campus Canteen'}</div>
            <div class="table-num">${displayNum.startsWith('Table') ? displayNum : 'TABLE ' + displayNum}</div>
            <img class="qr-img" src="${table.qrDataUrl}" alt="${displayNum} QR" />
            <div class="url-text">${targetUrl}</div>
            <div class="instructions">📱 Scan QR Code to View Menu & Order</div>
            <div class="secured">🔒 Cryptographically HMAC Signed Security</div>
          </div>
        `;
      })
      .join('<div style="page-break-after: always;"></div>');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Tables QR Stand Cards</title>
          <style>
            @page { size: A5 portrait; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; color: #0f172a; padding: 20px; }
            .card { border: 4px solid #E85D2A; border-radius: 24px; padding: 30px; margin: 0 auto; max-width: 320px; background: #ffffff; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
            .logo { display: flex; align-items: center; justify-content: center; gap: 9px; font-size: 20pt; font-weight: 900; color: #E85D2A; margin-bottom: 5px; }
            .logo img { width: 38px; height: 38px; border-radius: 11px; }
            .table-num { font-size: 28pt; font-weight: 900; color: #0f172a; margin: 15px 0 5px 0; text-transform: uppercase; }
            .subtitle { font-size: 10pt; color: #64748b; margin-bottom: 20px; }
            .qr-img { width: 220px; height: 220px; margin: 0 auto; display: block; border-radius: 16px; border: 2px solid #e2e8f0; }
            .url-text { font-size: 7.5pt; font-family: monospace; color: #475569; word-break: break-all; margin-top: 12px; }
            .instructions { margin-top: 20px; font-size: 11pt; font-weight: 700; color: #334155; }
            .secured { margin-top: 10px; font-size: 8pt; color: #166534; font-weight: bold; background: #dcfce7; display: inline-block; padding: 4px 12px; border-radius: 99px; }
          </style>
        </head>
        <body>
          ${cardsHtml}
          <script>
            window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleSelectTable = (id) => {
    setSelectedTableIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedTableIds.length === tables.length) {
      setSelectedTableIds([]);
    } else {
      setSelectedTableIds(tables.map((t) => t.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-6">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Tables & Cryptographic QR Cards</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Manage physical tables, HMAC signed QR tokens, status availability, and printable stand cards.</p>
        </div>

        <div className="flex items-center space-x-3">
          {tables.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="icon-label icon-label--checkbox px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              {selectedTableIds.length === tables.length ? (
                <CheckSquare className="w-4 h-4 text-orange-500" />
              ) : (
                <Square className="w-4 h-4 text-[var(--text-muted)]" />
              )}
              <span>{selectedTableIds.length === tables.length ? 'Deselect All' : 'Select All'}</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="icon-label px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Table</span>
          </button>
        </div>
      </div>

      {qrOriginWarning && (
        <div role="alert" className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-200">
          {qrOriginWarning}
        </div>
      )}

      {/* Multi Action Bar (Visible when tables selected) */}
      {selectedTableIds.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="text-xs font-bold text-orange-400">
            {selectedTableIds.length} {selectedTableIds.length === 1 ? 'Table' : 'Tables'} Selected
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handlePrintQRCard(tables.filter((t) => selectedTableIds.includes(t.id)))}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Selected Cards ({selectedTableIds.length})</span>
            </button>
            <button
              onClick={handleRegenerateSelected}
              disabled={actionLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
              <span>Regenerate Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Table Cards Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs font-bold text-[var(--text-muted)]">
          <RefreshCw className="h-5 w-5 animate-spin text-orange-500" />
          <span>Loading Tables &amp; QR Tokens...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {tables.map((table) => {
            const tableNumStr = table.tableNumber || `Table ${table.id}`;
            const isSelected = selectedTableIds.includes(table.id);
            const isRegeneratingThis = regeneratingId === table.id;
            const displayUrl = table.url || 'QR URL unavailable — check backend FRONTEND_URL';

            return (
              <div
                key={table.id}
                className={`bg-[var(--card-bg)]/40 border rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between transition-all relative ${isSelected ? 'ring-2 ring-orange-500 border-orange-500' : ''
                  } ${table.isActive !== false ? 'border-[var(--border-color)]' : 'border-rose-500/30 opacity-75'}`}
              >
                {/* Selection Checkbox */}
                <button
                  onClick={() => toggleSelectTable(table.id)}
                  className="absolute top-4 left-4 z-10 text-[var(--text-muted)] hover:text-orange-500 transition-colors cursor-pointer"
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-orange-500" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-400" />
                  )}
                </button>

                <div className="space-y-3 pt-4">
                  <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
                    <div className="pl-6">
                      <span className="text-[10px] font-black uppercase text-orange-400">TABLE ID #{table.id}</span>
                      <h3 className="text-lg font-extrabold text-[var(--text-main)] font-display">
                        {tableNumStr.startsWith('Table') ? tableNumStr : `Table ${tableNumStr}`}
                      </h3>
                    </div>

                    {/* Enable / Disable Active Toggle Badge */}
                    <button
                      onClick={() => handleToggleTableStatus(table)}
                      disabled={actionLoading}
                      className={`table-status-badge rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer border ${table.isActive !== false
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30'
                        }`}
                      title={table.isActive !== false ? 'Click to Disable Table' : 'Click to Enable Table'}
                    >
                      <Power className="w-3 h-3" />
                      <span>{table.isActive !== false ? 'ACTIVE' : 'INACTIVE'}</span>
                    </button>
                  </div>

                  {/* QR Code Image Preview */}
                  <div className="bg-[var(--glass-bg-strong)] p-3 rounded-xl border border-slate-200 flex flex-col items-center justify-center space-y-2 relative">
                    {isRegeneratingThis && (
                      <div className="absolute inset-0 bg-[var(--glass-bg-strong)]/80 rounded-xl flex items-center justify-center z-10">
                        <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
                      </div>
                    )}
                    {table.qrDataUrl ? (
                      <img
                        src={table.qrDataUrl}
                        alt={`${tableNumStr} QR`}
                        className="w-36 h-36 object-contain rounded-lg"
                      />
                    ) : (
                      <div className="w-36 h-36 bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold">
                        Generating QR...
                      </div>
                    )}
                    <span className="text-[9px] text-slate-500 font-mono text-center break-all px-1">
                      {displayUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyQrUrl(table)}
                      disabled={!table.url}
                      className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-xs font-bold text-[var(--text-main)] transition-colors hover:border-orange-500/50 hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Copy ${tableNumStr} QR URL`}
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy URL</span>
                    </button>
                  </div>

                  <div className="text-[10px] text-[var(--text-muted)] font-mono truncate" title={table.qrToken}>
                    Token: {table.qrToken}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
                  <div className="qr-card-actions">
                    <button
                      onClick={() => handlePrintQRCard(table)}
                      className="qr-card-actions__button bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Card</span>
                    </button>
                    <button
                      onClick={() => handleDownloadQR(table)}
                      className="qr-card-actions__button bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>

                  <div className="qr-card-actions__row">
                    <button
                      onClick={() => handleRegenerateQR(table.id)}
                      disabled={isRegeneratingThis || actionLoading}
                      className="qr-card-actions__button qr-card-actions__regenerate py-1.5 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold text-[11px] rounded-xl border border-[var(--border-color)] transition-all cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isRegeneratingThis ? 'animate-spin' : ''}`} />
                      <span>Regenerate Token</span>
                    </button>
                    <button
                      onClick={() => {
                        setTableToDelete(table);
                        setIsBulkDeleting(false);
                        setDeleteModalOpen(true);
                      }}
                      title="Delete / Archive Table"
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl border border-rose-500/20 transition-all cursor-pointer icon-btn icon-btn--40 qr-card-actions__delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setTableToDelete(null);
          setIsBulkDeleting(false);
        }}
        onConfirm={isBulkDeleting ? handleConfirmBulkDeleteTables : handleConfirmDeleteTable}
        title={isBulkDeleting ? 'Confirm Bulk Table Cleanup' : `Delete Table ${tableToDelete?.tableNumber || ''}`}
        message={
          isBulkDeleting
            ? 'Are you sure you want to permanently delete all unreferenced inactive tables? Tables with active dining or order history will remain preserved.'
            : `Are you sure you want to remove Table ${tableToDelete?.tableNumber}? If this table has historical orders or sessions, it will be safely deactivated and archived.`
        }
        itemCount={isBulkDeleting ? tables.filter(t => !t.isActive).length : 1}
        itemName={tableToDelete ? `Table ${tableToDelete.tableNumber} (ID #${tableToDelete.id})` : ''}
        isScopeAll={isBulkDeleting}
        requiredConfirmationText={isBulkDeleting ? 'DELETE' : ''}
        confirmButtonText={isBulkDeleting ? 'Delete Inactive Tables' : 'Delete Table'}
        loading={deleteLoading}
        warningNotes={[
          'Deleting an unreferenced table removes its QR code stand and active floor listing.',
          'Tables linked to customer orders or revenue history will be safely archived to protect audit logs.',
        ]}
      />

      {/* Add Table Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-[var(--glass-bg-subtle)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-4">
              <h3 className="text-base font-extrabold text-[var(--text-main)] font-display">Add New Table</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer icon-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase mb-1">Table Number or Name *</label>
                <input
                  type="text"
                  required
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  placeholder="e.g. 5 or Patio 1"
                  className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <div className="p-3 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
                🔒 A cryptographic HMAC-SHA256 token will automatically be generated and assigned to this table.
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[var(--bg-color)] hover:bg-[var(--border-color)] text-[var(--text-muted)] rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Create Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTablesQRView;


