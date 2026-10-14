import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  History,
  Search,
  SlidersHorizontal,
  Truck,
  AlertTriangle,
  FileText,
  Utensils,
  User,
  Clock,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  Package
} from 'lucide-react';

const AdminActivityLogsView = ({ logs = [], receivings = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [selectedLogDetails, setSelectedLogDetails] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Reset pagination to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, actionFilter, dateFilter]);

  // Normalize logs & receivings into human-readable activity stream with total null-safety
  const activities = useMemo(() => {
    const list = [];
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeReceivings = Array.isArray(receivings) ? receivings : [];

    // 1. Process Inventory Logs
    safeLogs.forEach(log => {
      if (!log) return;
      const createdAt = log.createdAt ? new Date(log.createdAt) : new Date();
      const type = String(log.type || 'ADJUST').toUpperCase();
      const userName = String(log.user?.name || log.userName || log.user?.email || 'Staff Member');
      const itemName = String(log.inventoryItem?.name || log.itemName || log.item?.name || 'Inventory Item');
      const changeQty = log.changeQty ?? log.quantity ?? 0;
      const unit = String(log.inventoryItem?.unit || log.unit || log.item?.unit || 'PCS');
      const reason = String(log.reason || log.notes || '');
      const batchNumber = String(log.batchNumber || log.inventoryItem?.batchNumber || log.batch || '');
      const sku = String(log.inventoryItem?.sku || log.sku || '');

      let actionLabel = 'Stock Adjusted';
      let icon = AlertTriangle;
      let badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';

      if (type === 'RESTOCK' || type === 'RECEIVING' || type === 'STOCK_IN' || reason.toLowerCase().includes('received')) {
        actionLabel = 'Stock Received';
        icon = Truck;
        badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      } else if (type === 'USAGE' || type === 'DEDUCT' || reason.toLowerCase().includes('recipe') || reason.toLowerCase().includes('order')) {
        actionLabel = 'Stock Deducted';
        icon = Utensils;
        badgeColor = 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      }

      const refStr = log.orderId
        ? `Order #${log.orderId}`
        : log.reference
        ? String(log.reference)
        : `LOG-${log.id || Math.random().toString(36).substring(7)}`;

      list.push({
        id: `log-${log.id || Math.random()}`,
        timestamp: createdAt,
        dateFormatted: createdAt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
        timeFormatted: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        userName,
        actionLabel,
        type,
        itemName,
        changeQty: changeQty > 0 ? `+${changeQty} ${unit}` : `${changeQty} ${unit}`,
        rawChangeQty: changeQty,
        reference: refStr,
        reason: reason || `${actionLabel} for ${itemName}`,
        batchNumber,
        sku,
        icon,
        badgeColor,
        rawLog: log
      });
    });

    // 2. Process Receivings as Activity Logs if not already in logs
    safeReceivings.forEach(rcv => {
      if (!rcv) return;
      const createdAt = rcv.createdAt ? new Date(rcv.createdAt) : new Date();
      const userName = String(rcv.receivedBy?.name || rcv.receivedByName || rcv.receivedBy?.email || 'Staff Member');
      const receivingRef = String(rcv.receivingRef || `RCV-${rcv.id || ''}`);

      const exists = list.some(l => l.reference === receivingRef);
      if (!exists) {
        list.push({
          id: `rcv-act-${rcv.id || Math.random()}`,
          timestamp: createdAt,
          dateFormatted: createdAt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
          timeFormatted: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userName,
          actionLabel: 'Stock Received',
          type: 'RECEIVING',
          itemName: rcv.supplierName ? `Shipment from ${rcv.supplierName}` : `${rcv.items?.length || 0} Items Received`,
          changeQty: `+${rcv.items?.length || 0} Items`,
          rawChangeQty: 1,
          reference: receivingRef,
          reason: `Stock shipment received (${receivingRef})`,
          batchNumber: String(rcv.batchNumber || ''),
          sku: '',
          icon: Truck,
          badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          rawReceiving: rcv
        });
      }
    });

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [logs, receivings]);

  // Summary Metrics
  const summary = useMemo(() => {
    const todayStr = new Date().toDateString();
    let todayCount = 0;
    let stockChanges = 0;
    let receivingsCount = 0;
    let adjustmentsCount = 0;

    activities.forEach(a => {
      if (a.timestamp.toDateString() === todayStr) todayCount++;
      if (a.type === 'RECEIVING' || a.actionLabel === 'Stock Received') receivingsCount++;
      else if (a.actionLabel === 'Stock Adjusted') adjustmentsCount++;
      else stockChanges++;
    });

    return { todayCount, stockChanges, receivingsCount, adjustmentsCount };
  }, [activities]);

  // Filtered Activities with null-safe search matching
  const filteredActivities = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return activities.filter(a => {
      const q = String(searchQuery || '').toLowerCase().trim();

      const itemNameStr = String(a.itemName || '').toLowerCase();
      const userNameStr = String(a.userName || '').toLowerCase();
      const referenceStr = String(a.reference || '').toLowerCase();
      const actionLabelStr = String(a.actionLabel || '').toLowerCase();
      const reasonStr = String(a.reason || '').toLowerCase();
      const batchStr = String(a.batchNumber || '').toLowerCase();
      const skuStr = String(a.sku || '').toLowerCase();
      const typeStr = String(a.type || '').toLowerCase();

      const matchesSearch = !q ||
        itemNameStr.includes(q) ||
        userNameStr.includes(q) ||
        referenceStr.includes(q) ||
        actionLabelStr.includes(q) ||
        reasonStr.includes(q) ||
        batchStr.includes(q) ||
        skuStr.includes(q) ||
        typeStr.includes(q);

      let matchesAction = true;
      if (actionFilter === 'RECEIVED') matchesAction = a.actionLabel === 'Stock Received';
      else if (actionFilter === 'ADJUSTED') matchesAction = a.actionLabel === 'Stock Adjusted';
      else if (actionFilter === 'DEDUCTED') matchesAction = a.actionLabel === 'Stock Deducted';

      let matchesDate = true;
      if (dateFilter === 'TODAY') matchesDate = a.timestamp.toDateString() === todayStr;
      else if (dateFilter === 'YESTERDAY') matchesDate = a.timestamp.toDateString() === yesterdayStr;
      else if (dateFilter === 'LAST_7') matchesDate = a.timestamp >= sevenDaysAgo;
      else if (dateFilter === 'LAST_30') matchesDate = a.timestamp >= thirtyDaysAgo;

      return matchesSearch && matchesAction && matchesDate;
    });
  }, [activities, searchQuery, actionFilter, dateFilter]);

  // Paginated activities
  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage) || 1;
  const paginatedActivities = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredActivities.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredActivities, currentPage, itemsPerPage]);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--card-bg)] border border-[var(--border-color)] p-5 sm:p-6 rounded-3xl shadow-xl">
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-purple-500/10 text-purple-400">📜</span>
            Inventory &amp; Activity Logs
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Complete audit trail of stock movements, receipts, and inventory adjustments.
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Today's Activity</span>
          <div className="text-2xl font-black text-purple-400 font-mono">{summary.todayCount} activities</div>
          <div className="text-[10px] text-[var(--text-muted)]">Recorded today</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Stock Received</span>
          <div className="text-2xl font-black text-emerald-400 font-mono">{summary.receivingsCount}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Shipments processed</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Stock Adjustments</span>
          <div className="text-2xl font-black text-amber-400 font-mono">{summary.adjustmentsCount}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Spoilage &amp; corrections</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Total Events</span>
          <div className="text-2xl font-black text-[var(--text-main)] font-mono">{activities.length}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Audit trail history</div>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by item, user, ref, batch, SKU, action..."
            className="w-full pl-9 pr-8 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
          />
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-bold"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto text-xs font-bold text-[var(--text-muted)]">
          {/* Action Filter */}
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer font-bold"
            >
              <option value="ALL">All Actions</option>
              <option value="RECEIVED">Stock Received</option>
              <option value="ADJUSTED">Stock Adjusted</option>
              <option value="DEDUCTED">Stock Deducted (POS)</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5">
            <span>Date:</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer font-bold"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7">Last 7 Days</option>
              <option value="LAST_30">Last 30 Days</option>
            </select>
          </div>

          {(searchQuery || actionFilter !== 'ALL' || dateFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setActionFilter('ALL');
                setDateFilter('ALL');
              }}
              className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-2">
            <History className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
            <p className="font-bold text-[var(--text-main)] text-sm">
              {searchQuery || actionFilter !== 'ALL' || dateFilter !== 'ALL'
                ? 'No matching logs found'
                : 'No activity logs available'}
            </p>
            <p className="text-[var(--text-muted)]">
              {searchQuery || actionFilter !== 'ALL' || dateFilter !== 'ALL'
                ? 'Try adjusting your search query or clear the active filters.'
                : 'Important inventory actions, stock receipts, and deductions will appear here automatically.'}
            </p>
          </div>
        ) : (
          paginatedActivities.map((act) => {
            const IconComp = act.icon;

            return (
              <div
                key={act.id}
                onClick={() => setSelectedLogDetails(act)}
                className="bg-[var(--bg-color)]/60 hover:bg-[var(--bg-color)] border border-[var(--border-color)] p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors cursor-pointer group"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-2xl border ${act.badgeColor} shrink-0 mt-0.5 sm:mt-0`}>
                    <IconComp className="w-4 h-4" />
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-xs text-[var(--text-main)] group-hover:text-orange-400 transition-colors">
                        {act.userName}
                      </strong>
                      <span className="text-xs text-[var(--text-muted)] lowercase">{act.actionLabel.toLowerCase()}</span>
                    </div>

                    <div className="text-xs font-bold text-[var(--text-main)]">
                      {act.itemName}
                      <span className="ml-2 font-mono text-amber-400">{act.changeQty}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)] font-mono">
                      <span>Ref: <strong>{act.reference}</strong></span>
                      {act.batchNumber && (
                        <span>Batch: <strong className="text-orange-400">{act.batchNumber}</strong></span>
                      )}
                      {act.reason && (
                        <span>Reason: <strong>{act.reason}</strong></span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center text-right">
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                    <div className="font-bold text-[var(--text-main)]">{act.timeFormatted}</div>
                    <div>{act.dateFormatted}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors" />
                </div>
              </div>
            );
          })
        )}

        {/* Pagination Controls */}
        {filteredActivities.length > itemsPerPage && (
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-color)] text-xs text-[var(--text-muted)]">
            <span>
              Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredActivities.length)} of {filteredActivities.length} logs
            </span>
            <div className="flex items-center space-x-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:text-[var(--text-main)] font-bold flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>
              <span className="font-mono font-bold text-[var(--text-main)] px-2">
                Page {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:text-[var(--text-main)] font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Log Activity Details Modal via Portal */}
      {selectedLogDetails && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text-main)]">{selectedLogDetails.actionLabel}</h3>
                <span className="text-[10px] text-purple-400 font-bold uppercase">{selectedLogDetails.dateFormatted} at {selectedLogDetails.timeFormatted}</span>
              </div>
              <button onClick={() => setSelectedLogDetails(null)} className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[var(--bg-color)] p-4 rounded-2xl space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">User / Staff:</span>
                <strong className="text-[var(--text-main)]">{selectedLogDetails.userName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Item:</span>
                <strong className="text-[var(--text-main)]">{selectedLogDetails.itemName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Quantity Change:</span>
                <strong className="text-amber-400">{selectedLogDetails.changeQty}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Reference Number:</span>
                <strong className="text-orange-400">{selectedLogDetails.reference}</strong>
              </div>
              {selectedLogDetails.batchNumber && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Batch Number:</span>
                  <strong className="text-orange-400">{selectedLogDetails.batchNumber}</strong>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Explanation / Reason:</span>
                <strong className="text-[var(--text-main)]">{selectedLogDetails.reason}</strong>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border-color)]">
              <button onClick={() => setSelectedLogDetails(null)} className="px-4 py-2 rounded-xl bg-[var(--bg-color)] font-bold text-xs text-[var(--text-muted)] cursor-pointer">Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default AdminActivityLogsView;
