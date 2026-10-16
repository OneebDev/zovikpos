import ThemedSelect from '../../common/ThemedSelect';
import  { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../services/api';
import {
  Clock,
  Search,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  X,
  ShieldCheck,
  Save,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const AdminExpiryTrackingView = ({
  inventory = [],
  receivings = [],
  onRefresh,
  showToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, EXPIRED, TODAY, WITHIN_3, WITHIN_7, WITHIN_30, FRESH, NO_EXPIRY
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modal Edit State
  const [selectedBatchDetails, setSelectedBatchDetails] = useState(null);
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editReceivingRef, setEditReceivingRef] = useState('');
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedExpiryIds, setSelectedExpiryIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeletingExpiry, setIsDeletingExpiry] = useState(false);

  const toggleExpirySelection = (id) => {
    setSelectedExpiryIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedExpiryIds(new Set());
    setSelectionMode((active) => !active);
  };

  const handleConfirmClearExpiry = async () => {
    const records = deleteTarget ? [deleteTarget] : selectedExpiryRecords;
    if (records.length === 0) return;
    setIsDeletingExpiry(true);
    try {
      if (deleteTarget) {
        await api.delete(`/inventory/expiring/${deleteTarget.id}`, {
          data: {
            source: deleteTarget.source,
            receivingItemId: deleteTarget.receivingItemId,
            inventoryItemId: deleteTarget.inventoryItemId,
          },
        });
      } else {
        await api.delete('/inventory/expiring/bulk', {
          data: {
            items: records.map(({ source, receivingItemId, inventoryItemId }) => ({ source, receivingItemId, inventoryItemId })),
          },
        });
      }
      showToast?.(records.length === 1 ? 'Expiry date removed.' : `Expiry dates removed from ${records.length} records.`, 'success');
      setSelectedExpiryIds(new Set());
      setDeleteTarget(null);
      setDeleteModalOpen(false);
      await onRefresh?.();
    } catch (error) {
      console.error('Failed to clear expiry dates:', error);
      showToast?.(error.response?.data?.error || 'Failed to remove expiry date(s).', 'error');
    } finally {
      setIsDeletingExpiry(false);
    }
  };

  // Auto-generator helpers
  const generateAutoBatch = () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const batch = `BATCH-${dateStr}-${rand}`;
    setEditBatchNumber(batch);
    if (showToast) showToast(`Batch # Generated: ${batch}`, 'info');
  };

  const generateAutoRef = () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const refNum = `RCV-${dateStr}-${rand}`;
    setEditReceivingRef(refNum);
    if (showToast) showToast(`Internal Reference Generated: ${refNum}`, 'info');
  };

  const generateAutoInvoiceNum = () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const ms = String(Date.now()).slice(-6);
    const inv = `INV-${dateStr}-${ms}`;
    setEditInvoiceNumber(inv);
    if (showToast) showToast(`Supplier Invoice # Generated: ${inv}`, 'info');
  };

  // Open Edit Modal with Pre-populated details
  const handleOpenViewModal = (record) => {
    setSelectedBatchDetails(record);
    let dateStr = '';
    if (record.expiryDate) {
      try {
        const d = new Date(record.expiryDate);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().split('T')[0];
        }
      } catch {
        dateStr = '';
      }
    }
    setEditExpiryDate(dateStr);
    setEditBatchNumber(record.batchNumber || '');
    setEditReceivingRef(record.receivingRef || '');
    setEditInvoiceNumber(record.invoiceNumber || '');
  };

  // Live Recalculation preview inside Edit Modal
  const liveDaysLeft = useMemo(() => {
    if (!editExpiryDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expDate = new Date(editExpiryDate);
    expDate.setHours(0, 0, 0, 0);
    if (isNaN(expDate.getTime())) return null;
    return Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
  }, [editExpiryDate]);

  // Handle Save Changes in View/Edit Modal
  const handleSaveChanges = async () => {
    if (!selectedBatchDetails) return;
    setIsSaving(true);
    try {
      const payload = {
        source: selectedBatchDetails.source,
        receivingItemId: selectedBatchDetails.receivingItemId,
        inventoryItemId: selectedBatchDetails.inventoryItemId,
        expiryDate: editExpiryDate ? editExpiryDate : null,
        batchNumber: editBatchNumber.trim(),
        receivingRef: editReceivingRef.trim(),
        invoiceNumber: editInvoiceNumber.trim(),
      };

      await api.put('/inventory/batch-expiry', payload);

      if (showToast) {
        showToast('Batch & Expiry date updated successfully!', 'success');
      }

      if (onRefresh) {
        await onRefresh();
      }

      setSelectedBatchDetails(null);
    } catch (error) {
      console.error('Failed to update batch expiry:', error);
      if (showToast) {
        showToast(error.response?.data?.error || 'Failed to update batch expiry.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Extract all distinct expiry and batch records from Receivings & Inventory
  const expiryRecords = useMemo(() => {
    const list = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 1. Every received batch item (preserves separate batch receivings of the same item)
    receivings.forEach(rcv => {
      if (rcv.items && Array.isArray(rcv.items)) {
        rcv.items.forEach(item => {
          const recId = `rcv-${rcv.id}-${item.id}`;

          let daysLeft = null;
          let hasExpiry = false;

          if (item.expiryDate) {
            hasExpiry = true;
            const expDate = new Date(item.expiryDate);
            expDate.setHours(0, 0, 0, 0);
            daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
          }

          list.push({
            id: recId,
            receivingItemId: item.id,
            inventoryItemId: item.inventoryItemId || item.inventoryItem?.id,
            source: 'BATCH',
            name: item.inventoryItem?.name || item.name || 'Inventory Item',
            category: item.inventoryItem?.category || item.category || 'General',
            batchNumber: item.batchNumber ? String(item.batchNumber).trim() : '',
            invoiceNumber: rcv.invoiceNumber ? String(rcv.invoiceNumber).trim() : '',
            receivingRef: rcv.receivingRef || rcv.receivingNumber || '',
            quantity: item.quantity || 0,
            unit: item.unit || item.inventoryItem?.unit || 'PCS',
            costPerUnit: item.unitCost || item.inventoryItem?.costPrice || 0,
            expiryDate: item.expiryDate || null,
            hasExpiry,
            daysLeft,
            receivingDate: rcv.receivingDate || rcv.createdAt,
            supplierName: rcv.supplier?.name || item.inventoryItem?.supplier?.name || ''
          });
        });
      }
    });

    // 2. Direct inventory catalog items if not already covered by receiving batches
    inventory.forEach(inv => {
      const alreadyInReceiving = list.some(r => r.inventoryItemId === inv.id || r.name.toLowerCase() === inv.name.toLowerCase());
      if (!alreadyInReceiving) {
        let daysLeft = null;
        let hasExpiry = false;

        if (inv.expiryDate) {
          hasExpiry = true;
          const expDate = new Date(inv.expiryDate);
          expDate.setHours(0, 0, 0, 0);
          daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        }

        list.push({
          id: `inv-${inv.id}`,
          receivingItemId: null,
          inventoryItemId: inv.id,
          source: 'ITEM',
          name: inv.name,
          category: inv.category || 'General',
          batchNumber: inv.sku ? String(inv.sku).trim() : '',
          invoiceNumber: '',
          receivingRef: '',
          quantity: inv.stockLevel,
          unit: inv.unit,
          costPerUnit: inv.costPrice || 0,
          expiryDate: inv.expiryDate || null,
          hasExpiry,
          daysLeft,
          receivingDate: inv.createdAt,
          supplierName: inv.supplier?.name || '',
          invItemObj: inv
        });
      }
    });

    // Sort: Items with expiry dates first (urgent daysLeft asc), followed by No Expiry items
    return list.sort((a, b) => {
      if (a.hasExpiry && !b.hasExpiry) return -1;
      if (!a.hasExpiry && b.hasExpiry) return 1;
      if (a.hasExpiry && b.hasExpiry) return a.daysLeft - b.daysLeft;
      return a.name.localeCompare(b.name);
    });
  }, [inventory, receivings]);

  // Dynamic Categories
  const categories = useMemo(() => {
    const set = new Set();
    expiryRecords.forEach(r => { if (r.category) set.add(r.category); });
    return Array.from(set).sort();
  }, [expiryRecords]);

  // Dynamic Counts for Summary Cards (Calculated from real DB records using actual date)
  const summary = useMemo(() => {
    let expired = 0;
    let today = 0;
    let within3 = 0;
    let within7 = 0;
    let within30 = 0;
    let fresh = 0;
    let noExpiry = 0;

    expiryRecords.forEach(r => {
      if (!r.hasExpiry) {
        noExpiry++;
      } else if (r.daysLeft < 0) {
        expired++;
      } else if (r.daysLeft === 0) {
        today++;
      } else if (r.daysLeft <= 3) {
        within3++;
      } else if (r.daysLeft <= 7) {
        within7++;
      } else if (r.daysLeft <= 30) {
        within30++;
      } else {
        fresh++;
      }
    });

    return { expired, today, within3, within7, within30, fresh, noExpiry };
  }, [expiryRecords]);

  // Filtered List based on Search, Category, and Expiry Status
  const filteredRecords = useMemo(() => {
    return expiryRecords.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        r.name.toLowerCase().includes(q) ||
        r.batchNumber.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q);

      const matchesCategory = selectedCategory === 'ALL' || r.category === selectedCategory;

      let matchesStatus = true;
      if (statusFilter === 'EXPIRED') matchesStatus = r.hasExpiry && r.daysLeft < 0;
      else if (statusFilter === 'TODAY') matchesStatus = r.hasExpiry && r.daysLeft === 0;
      else if (statusFilter === 'WITHIN_3') matchesStatus = r.hasExpiry && r.daysLeft >= 0 && r.daysLeft <= 3;
      else if (statusFilter === 'WITHIN_7') matchesStatus = r.hasExpiry && r.daysLeft >= 0 && r.daysLeft <= 7;
      else if (statusFilter === 'WITHIN_30') matchesStatus = r.hasExpiry && r.daysLeft >= 0 && r.daysLeft <= 30;
      else if (statusFilter === 'FRESH') matchesStatus = r.hasExpiry && r.daysLeft > 30;
      else if (statusFilter === 'NO_EXPIRY') matchesStatus = !r.hasExpiry;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [expiryRecords, searchQuery, selectedCategory, statusFilter]);

  const selectableExpiryRecords = filteredRecords.filter((record) => record.hasExpiry);
  const selectedExpiryRecords = expiryRecords.filter((record) => selectedExpiryIds.has(record.id) && record.hasExpiry);
  const allVisibleExpirySelected = selectableExpiryRecords.length > 0 && selectableExpiryRecords.every((record) => selectedExpiryIds.has(record.id));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--card-bg)] border border-[var(--border-color)] p-5 sm:p-6 rounded-3xl shadow-xl">
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-rose-500/10 text-rose-400">⏳</span>
            Expiry Tracking
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            View, schedule, and manage batch-by-batch expiry dates recorded during stock receivings.
          </p>
        </div>

      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter(statusFilter === 'EXPIRED' ? 'ALL' : 'EXPIRED')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'EXPIRED' ? 'bg-rose-500/20 border-rose-500/40' : 'bg-[var(--card-bg)]/60 border-[var(--border-color)] hover:bg-[var(--card-bg)]'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Expired</span>
          <div className="text-2xl font-black text-rose-400 font-mono">{summary.expired}</div>
          <div className="text-[10px] text-[var(--text-muted)] font-medium">Items passed expiry</div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'TODAY' ? 'ALL' : 'TODAY')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'TODAY' ? 'bg-amber-500/20 border-amber-500/40' : 'bg-[var(--card-bg)]/60 border-[var(--border-color)] hover:bg-[var(--card-bg)]'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Expiring Today</span>
          <div className="text-2xl font-black text-amber-400 font-mono">{summary.today}</div>
          <div className="text-[10px] text-[var(--text-muted)] font-medium">Expires today</div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'WITHIN_3' ? 'ALL' : 'WITHIN_3')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'WITHIN_3' ? 'bg-orange-500/20 border-orange-500/40' : 'bg-[var(--card-bg)]/60 border-[var(--border-color)] hover:bg-[var(--card-bg)]'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Within 3 Days</span>
          <div className="text-2xl font-black text-orange-400 font-mono">{summary.within3}</div>
          <div className="text-[10px] text-[var(--text-muted)] font-medium">High priority stock</div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'WITHIN_7' ? 'ALL' : 'WITHIN_7')}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === 'WITHIN_7' ? 'bg-yellow-500/20 border-yellow-500/40' : 'bg-[var(--card-bg)]/60 border-[var(--border-color)] hover:bg-[var(--card-bg)]'
          }`}
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Within 7 Days</span>
          <div className="text-2xl font-black text-yellow-400 font-mono">{summary.within7}</div>
          <div className="text-[10px] text-[var(--text-muted)] font-medium">Upcoming expirations</div>
        </button>
      </div>

      {/* Expiry Urgent Banner */}
      {(summary.today > 0 || summary.expired > 0) && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <strong className="text-xs text-rose-300 block font-bold">Expiry Attention Required</strong>
              <span className="text-[11px] text-[var(--text-muted)]">
                {summary.expired} item(s) are expired and {summary.today} item(s) expire today.
              </span>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('EXPIRED')}
            className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs border border-rose-500/30 cursor-pointer transition-colors"
          >
            Show Expired Items
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl grid grid-cols-1 xl:grid-cols-[minmax(14rem,1fr)_auto] gap-3 items-start">
        <div className="relative w-full min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by item, batch #, category..."
            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
          />
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 text-xs font-bold text-[var(--text-muted)] xl:w-auto xl:items-end">
          <div className="flex w-full flex-wrap items-center gap-2 xl:justify-end">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedExpiryRecords.length} />
          {selectionMode && <label className="flex shrink-0 items-center gap-2 whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVisibleExpirySelected}
              disabled={selectableExpiryRecords.length === 0}
              onChange={() => setSelectedExpiryIds((current) => {
                const next = new Set(current);
                if (allVisibleExpirySelected) selectableExpiryRecords.forEach((record) => next.delete(record.id));
                else selectableExpiryRecords.forEach((record) => next.add(record.id));
                return next;
              })}
              className="accent-orange-500"
              aria-label="Select all visible records with expiry dates"
            />
            <span>Select visible</span>
          </label>}
          {selectionMode && selectedExpiryRecords.length > 0 && (
            <button
              type="button"
              onClick={() => { setDeleteTarget(null); setDeleteModalOpen(true); }}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove expiry ({selectedExpiryRecords.length})
            </button>
          )}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 xl:justify-end">
          {/* Status Filter Dropdown */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap sm:flex-none">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filter Expiry:</span>
            <ThemedSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              menuMinWidth={184}
              className="min-w-0 max-w-[10rem] flex-1 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer sm:flex-none sm:max-w-none"
            >
              <option value="ALL">All ({expiryRecords.length})</option>
              <option value="EXPIRED">Expired ({summary.expired})</option>
              <option value="TODAY">Expiring Today ({summary.today})</option>
              <option value="WITHIN_3">Within 3 Days ({summary.within3})</option>
              <option value="WITHIN_7">Within 7 Days ({summary.within7})</option>
              <option value="WITHIN_30">Within 30 Days ({summary.within30})</option>
              <option value="FRESH">Fresh Stock ({summary.fresh})</option>
              <option value="NO_EXPIRY">No Expiry Date ({summary.noExpiry})</option>
            </ThemedSelect>
          </div>

          {/* Category Dropdown */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap sm:flex-none">
            <span>Category:</span>
            <ThemedSelect
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              menuMinWidth={184}
              className="min-w-0 max-w-[9rem] flex-1 bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer sm:flex-none sm:max-w-none"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </ThemedSelect>
          </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-xl">
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-2">
            <Clock className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
            <p className="font-bold text-[var(--text-main)] text-sm">No items found</p>
            <p className="text-[var(--text-muted)]">No inventory batches match your current filter settings.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-single-row-table w-full min-w-[1080px] text-left text-xs divide-y divide-[var(--border-color)]">
              <thead className="bg-[var(--bg-color)]/80 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="py-3.5 px-4">Item</th>
                  <th className="py-3.5 px-4">Internal Ref #</th>
                  <th className="py-3.5 px-4">Batch #</th>
                  <th className="py-3.5 px-4">Supplier Invoice #</th>
                  <th className="py-3.5 px-4">Quantity</th>
                  <th className="py-3.5 px-4">Expiry Date</th>
                  <th className="py-3.5 px-4">Days Left</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] font-medium text-[var(--text-main)]">
                {filteredRecords.map((r) => {
                  let statusBadge = (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold text-slate-400 bg-slate-500/10 border border-slate-500/20 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-slate-400" /> No Expiry Date
                    </span>
                  );

                  if (r.hasExpiry) {
                    if (r.daysLeft < 0) {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold text-rose-400 bg-rose-500/10 border border-rose-500/20 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Expired
                        </span>
                      );
                    } else if (r.daysLeft === 0) {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Today
                        </span>
                      );
                    } else if (r.daysLeft <= 3) {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold text-orange-400 bg-orange-500/10 border border-orange-500/20 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Within 3 Days
                        </span>
                      );
                    } else if (r.daysLeft <= 7) {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Within 7 Days
                        </span>
                      );
                    } else if (r.daysLeft <= 30) {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold text-blue-400 bg-blue-500/10 border border-blue-500/20 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Within 30 Days
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Fresh ({r.daysLeft}d)
                        </span>
                      );
                    }
                  }

                  return (
                    <tr key={r.id} className="hover:bg-[var(--bg-color)]/50 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <div className="flex items-center gap-2">
                            {selectionMode && r.hasExpiry && (
                              <input
                                type="checkbox"
                                checked={selectedExpiryIds.has(r.id)}
                                onChange={() => toggleExpirySelection(r.id)}
                                onClick={(event) => event.stopPropagation()}
                                className="accent-orange-500"
                                aria-label={`Select expiry date for ${r.name}`}
                              />
                            )}
                            <strong className="text-[var(--text-main)] block">{r.name}</strong>
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)]">{r.category}</span>
                        </div>
                      </td>

                      {/* Internal Reference # (Optional) */}
                      <td className="py-3 px-4 font-mono text-[11px] text-amber-400 font-bold">
                        {r.receivingRef || <span className="text-[var(--text-muted)] italic font-normal">—</span>}
                      </td>

                      {/* Batch # (Optional) */}
                      <td className="py-3 px-4 font-mono text-[11px] text-[var(--text-main)] font-semibold">
                        {r.batchNumber || <span className="text-[var(--text-muted)] italic font-normal">—</span>}
                      </td>

                      {/* Supplier Invoice # (Optional) */}
                      <td className="py-3 px-4 font-mono text-[11px] text-purple-400 font-bold">
                        {r.invoiceNumber || <span className="text-[var(--text-muted)] italic font-normal">—</span>}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-orange-400">
                        {r.quantity} {r.unit}
                      </td>

                      {/* Expiry Date (Optional) */}
                      <td className="py-3 px-4 font-mono text-[11px] text-[var(--text-main)]">
                        {r.hasExpiry ? (
                          new Date(r.expiryDate).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
                        ) : (
                          <span className="text-[var(--text-muted)] italic">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold">
                        {!r.hasExpiry ? (
                          <span className="text-[var(--text-muted)] text-[11px]">—</span>
                        ) : r.daysLeft < 0 ? (
                          <span className="text-rose-400">{Math.abs(r.daysLeft)} days ago</span>
                        ) : r.daysLeft === 0 ? (
                          <span className="text-amber-400">0 Days (Today)</span>
                        ) : (
                          <span>{r.daysLeft} Days</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {statusBadge}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
                        {r.hasExpiry && (
                          <button
                            type="button"
                            onClick={() => { setDeleteTarget(r); setDeleteModalOpen(true); }}
                            title="Remove expiry date"
                            aria-label={`Remove expiry date for ${r.name}`}
                            className="inline-flex items-center justify-center p-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenViewModal(r)}
                          className="px-3 py-1.5 rounded-xl bg-[var(--bg-color)] hover:bg-[var(--card-bg)] text-[var(--text-main)] border border-[var(--border-color)] font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          View / Edit
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

      {/* Batch / Expiry View + Edit Modal via React Portal */}
      {selectedBatchDetails && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-[var(--border-color)] pb-4">
              <div>
                <h3 className="text-lg font-black text-[var(--text-main)] font-display">
                  {selectedBatchDetails.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 rounded-lg bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-wider border border-orange-500/20">
                    {selectedBatchDetails.category}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] font-medium">
                    Batch & Expiry Details
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBatchDetails(null)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors border border-[var(--border-color)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Read-Only Batch Context Grid (Showing all 4 optional tracking fields + supplier details) */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--bg-color)]/60 border border-[var(--border-color)] p-4 rounded-2xl">
              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Quantity & Unit</span>
                <strong className="text-orange-400 font-mono text-sm">
                  {selectedBatchDetails.quantity} {selectedBatchDetails.unit}
                </strong>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Cost per Unit</span>
                <strong className="text-emerald-400 font-mono text-sm">
                  {selectedBatchDetails.costPerUnit > 0 ? `Rs. ${selectedBatchDetails.costPerUnit}` : '—'}
                </strong>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Internal Reference #</span>
                <strong className="text-amber-400 font-mono">
                  {selectedBatchDetails.receivingRef || '—'}
                </strong>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Supplier Invoice #</span>
                <strong className="text-purple-400 font-mono">
                  {selectedBatchDetails.invoiceNumber || '—'}
                </strong>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Supplier</span>
                <strong className="text-[var(--text-main)]">
                  {selectedBatchDetails.supplierName || '—'}
                </strong>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Receiving Date</span>
                <span className="text-[var(--text-main)] font-medium">
                  {selectedBatchDetails.receivingDate
                    ? new Date(selectedBatchDetails.receivingDate).toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>

            {/* Editable Fields Section */}
            <div className="space-y-3 pt-1 border-t border-[var(--border-color)]/60">

              {/* Field 1: Batch Number with Generator */}
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-[var(--text-main)] mb-1 flex justify-between items-center">
                  <span>Batch Number</span>
                  <span className="text-[10px] text-orange-400 font-normal lowercase">(Optional)</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={editBatchNumber}
                    onChange={(e) => setEditBatchNumber(e.target.value)}
                    placeholder="Click 🔄 to generate..."
                    className="w-full pl-3 pr-9 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={generateAutoBatch}
                    title="Click to generate a unique Batch Number"
                    className="absolute right-2 p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Field 2 & 3: Internal Ref # & Supplier Invoice # Generators */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-[var(--text-main)] mb-1 flex justify-between items-center">
                    <span>Internal Reference #</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={editReceivingRef}
                      onChange={(e) => setEditReceivingRef(e.target.value)}
                      placeholder="Click 🔄 to generate..."
                      className="w-full pl-3 pr-9 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={generateAutoRef}
                      title="Click to generate a unique Internal Reference"
                      className="absolute right-2 p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-[var(--text-main)] mb-1 flex justify-between items-center">
                    <span>Supplier Invoice #</span>
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={editInvoiceNumber}
                      onChange={(e) => setEditInvoiceNumber(e.target.value)}
                      placeholder="Click 🔄 to generate..."
                      className="w-full pl-3 pr-9 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-purple-400 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={generateAutoInvoiceNum}
                      title="Click to generate a unique Supplier Invoice #"
                      className="absolute right-2 p-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Field 2: Expiry Date (Editable) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-extrabold uppercase text-[var(--text-main)]">
                    Expiry Date
                  </label>
                  {editExpiryDate && (
                    <button
                      type="button"
                      onClick={() => setEditExpiryDate('')}
                      className="text-[10px] text-rose-400 hover:underline font-bold cursor-pointer"
                    >
                      Clear (No Expiry Date)
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={editExpiryDate}
                  onChange={(e) => setEditExpiryDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold cursor-pointer"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Select date printed on package or leave empty for items without expiry.
                </p>
              </div>

              {/* Live Status Recalculation Preview Banner */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-[var(--text-muted)] block">Recalculated Expiry Status</span>
                  <span className="text-xs font-bold text-[var(--text-main)]">
                    {liveDaysLeft === null ? (
                      'No Expiry Date'
                    ) : liveDaysLeft < 0 ? (
                      <span className="text-rose-400">Expired ({Math.abs(liveDaysLeft)} days ago)</span>
                    ) : liveDaysLeft === 0 ? (
                      <span className="text-amber-400">Expiring Today (0 Days)</span>
                    ) : (
                      <span className="text-emerald-400">{liveDaysLeft} Days Remaining</span>
                    )}
                  </span>
                </div>

                <div>
                  {liveDaysLeft === null ? (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                      No Expiry
                    </span>
                  ) : liveDaysLeft < 0 ? (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Expired
                    </span>
                  ) : liveDaysLeft === 0 ? (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Today
                    </span>
                  ) : liveDaysLeft <= 3 ? (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                      Within 3 Days
                    </span>
                  ) : liveDaysLeft <= 7 ? (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                      Within 7 Days
                    </span>
                  ) : liveDaysLeft <= 30 ? (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Within 30 Days
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Fresh
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex justify-end items-center gap-2 pt-3 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setSelectedBatchDetails(null)}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-[var(--bg-color)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-color)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save Changes
                  </>
                )}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null); }}
        onConfirm={handleConfirmClearExpiry}
        title={deleteTarget ? 'Remove Expiry Date' : `Remove ${selectedExpiryRecords.length} Expiry Dates`}
        message="This removes expiry tracking from the selected record(s). Inventory items, received quantities, and batch records will remain unchanged."
        itemName={deleteTarget?.name}
        itemCount={deleteTarget ? 1 : selectedExpiryRecords.length}
        isBulk={!deleteTarget && selectedExpiryRecords.length > 1}
        confirmButtonText={deleteTarget ? 'Remove Expiry Date' : `Remove ${selectedExpiryRecords.length} Expiry Dates`}
        loading={isDeletingExpiry}
        dangerLevel="warning"
        warningNotes={['The item or stock batch will not be deleted; only its expiry date will be cleared.']}
      />

    </div>
  );
};

export default AdminExpiryTrackingView;
