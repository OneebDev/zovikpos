import ThemedSelect from '../../common/ThemedSelect';
import { resolveTableLabel } from '../../../utils/customerTableLabel';
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  History,
  Search,
  SlidersHorizontal,
  Truck,
  AlertTriangle,
  Utensils,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  X,
  Trash2
} from 'lucide-react';
import api from '../../../services/api';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const AdminActivityLogsView = ({ logs = [], receivings = [], onRefresh, showToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL'); // ALL | RECEIVED | DEDUCTED | ADJUSTED
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL'); // ALL | TODAY | YESTERDAY | LAST_7 | LAST_30
  const [expandedCards, setExpandedCards] = useState({});
  const [selectedLogDetails, setSelectedLogDetails] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeletingLog, setIsDeletingLog] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Toggle card expansion
  const toggleExpand = (id, e) => {
    if (e) e.stopPropagation();
    setExpandedCards(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const logIdsForActivity = (activity) => (activity?.logIds || (activity?.rawLog?.id ? [activity.rawLog.id] : [])).filter(Boolean);

  const handleConfirmDeleteLog = async () => {
    const ids = logIdsForActivity(deleteTarget);
    if (ids.length === 0) return;
    setIsDeletingLog(true);
    try {
      if (ids.length === 1) await api.delete(`/inventory/logs/${ids[0]}`);
      else await api.delete('/inventory/logs/bulk', { data: { ids } });
      showToast?.(ids.length === 1 ? 'Inventory log deleted.' : `${ids.length} inventory logs deleted.`, 'success');
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      setSelectedLogDetails(null);
      setSelectedActivityIds(new Set());
      await onRefresh?.();
    } catch (error) {
      console.error('Failed to delete inventory logs:', error);
      showToast?.(error.response?.data?.error || 'Failed to delete inventory log(s).', 'error');
    } finally {
      setIsDeletingLog(false);
    }
  };

  const openLogDelete = (activity, event) => {
    event?.stopPropagation?.();
    setDeleteTarget(activity);
    setDeleteModalOpen(true);
  };

  const toggleActivitySelection = (activity, event) => {
    event?.stopPropagation?.();
    setSelectedActivityIds((current) => {
      const next = new Set(current);
      if (next.has(activity.id)) next.delete(activity.id);
      else next.add(activity.id);
      return next;
    });
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedActivityIds(new Set());
    setSelectionMode((active) => !active);
  };

  // Reset pagination to page 1 on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, actionFilter, supplierFilter, dateFilter]);

  // Build unified grouped activities
  const { groupedActivities, allSuppliers } = useMemo(() => {
    const safeLogs = Array.isArray(logs) ? logs : [];
    const safeReceivings = Array.isArray(receivings) ? receivings : [];

    // Maps to group by receipt or order
    const receivingGroups = new Map();
    const orderGroups = new Map();
    const standaloneActivities = [];
    const supplierSet = new Set();

    // 1. Ingest explicit receivings if any exist
    safeReceivings.forEach(rcv => {
      if (!rcv) return;
      const receivingStatus = String(rcv.status || '').toUpperCase();
      // Draft creation is not a stock movement; only show a receiving in activity
      // logs after it has actually been confirmed.
      if (receivingStatus && receivingStatus !== 'RECEIVED') return;
      const rcvId = rcv.id || rcv.receivingNumber || Math.random().toString();
      const groupKey = `rcv_${rcvId}`;
      const activityAt = (receivingStatus === 'RECEIVED' && rcv.updatedAt) || rcv.createdAt;
      const createdAt = activityAt ? new Date(activityAt) : new Date();
      const supName = rcv.supplier?.name || rcv.supplierName || 'Supplier not recorded';
      if (supName && supName !== 'Supplier not recorded') supplierSet.add(supName);

      const items = (rcv.items || []).map((it, idx) => ({
        id: it.id || `item_${idx}`,
        itemName: it.inventoryItem?.name || it.name || 'Inventory Item',
        quantity: parseFloat(it.quantity) || 0,
        unit: it.unit || it.inventoryItem?.unit || 'PCS',
        unitCost: parseFloat(it.unitCost) || parseFloat(it.inventoryItem?.costPrice) || 0,
        totalCost: parseFloat(it.totalCost) || (parseFloat(it.quantity) || 0) * (parseFloat(it.unitCost) || 0),
        batchNumber: it.batchNumber || rcv.batchNumber || 'â€”',
        expiryDate: it.expiryDate ? new Date(it.expiryDate).toLocaleDateString() : 'â€”',
        sku: it.inventoryItem?.sku || 'â€”'
      }));

      receivingGroups.set(groupKey, {
        id: groupKey,
        sourceReceivingId: rcv.id || rcv.receivingNumber,
        type: 'STOCK_IN_GROUP',
        actionLabel: 'Stock Received',
        timestamp: createdAt,
        dateFormatted: createdAt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
        timeFormatted: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        supplierName: supName,
        userName: rcv.receivedBy?.name || rcv.receivedByName || rcv.user?.name || 'Admin User',
        invoiceNumber: rcv.invoiceNumber || 'â€”',
        receivingNumber: rcv.receivingNumber || `RCV-${rcv.id}`,
        batchNumber: rcv.batchNumber || (items.length > 0 && items.every(i => i.batchNumber === items[0].batchNumber) ? items[0].batchNumber : 'Multiple Batches'),
        items: items,
        totalItemsCount: items.length,
        totalCost: parseFloat(rcv.totalCost) || items.reduce((acc, i) => acc + i.totalCost, 0),
        notes: rcv.notes || ''
      });
    });

    // 2. Process all InventoryLogs
    safeLogs.forEach(log => {
      if (!log) return;
      const createdAt = log.createdAt ? new Date(log.createdAt) : new Date();
      const type = String(log.type || 'ADJUST').toUpperCase();
      const reason = String(log.reason || log.notes || '');
      const itemName = log.inventoryItem?.name || log.itemName || 'Inventory Item';
      const unit = log.inventoryItem?.unit || log.unit || 'PCS';
      const quantity = Math.abs(parseFloat(log.changeQty ?? log.quantity ?? 0));
      const costPerUnit = parseFloat(log.inventoryItem?.costPrice) || (log.cost && quantity ? Math.abs(log.cost) / quantity : 0);
      const lineCost = log.cost ? Math.abs(parseFloat(log.cost)) : (quantity * costPerUnit);
      const userName = log.user?.name || log.userName || log.user?.email || 'Staff Member';

      // A. Stock In / Receivings Grouping
      if (type === 'RESTOCK' || type === 'RECEIVING' || type === 'STOCK_IN' || log.receivingId || reason.toLowerCase().includes('received')) {
        const rcvId = log.receivingId || log.receiving?.id;
        const refMatch = reason.match(/(RCV-[A-Z0-9-]+|INV-[A-Z0-9-]+)/i);
        const groupKey = rcvId
          ? `rcv_${rcvId}`
          : refMatch
          ? `rcv_ref_${refMatch[1].toUpperCase()}`
          : null;

        const supName = log.receiving?.supplier?.name || log.supplier?.name || log.supplierName || 'Supplier not recorded';
        if (supName && supName !== 'Supplier not recorded') supplierSet.add(supName);

        const itemLine = {
          id: `log_item_${log.id}`,
          itemName,
          quantity,
          unit,
          unitCost: costPerUnit,
          totalCost: lineCost,
          batchNumber: log.batchNumber || log.receiving?.batchNumber || 'â€”',
          expiryDate: log.expiryDate ? new Date(log.expiryDate).toLocaleDateString() : 'â€”',
          sku: log.inventoryItem?.sku || 'â€”'
        };

        if (groupKey && receivingGroups.has(groupKey)) {
          // Add item row if not already added
          const grp = receivingGroups.get(groupKey);
          grp.logIds = [...new Set([...(grp.logIds || []), log.id])];
          if (!grp.items.some(i => i.id === itemLine.id || (i.itemName === itemName && i.quantity === quantity))) {
            grp.items.push(itemLine);
            grp.totalItemsCount = grp.items.length;
            grp.totalCost += lineCost;
          }
        } else if (groupKey) {
          receivingGroups.set(groupKey, {
            id: groupKey,
            sourceReceivingId: rcvId,
            logIds: [log.id],
            type: 'STOCK_IN_GROUP',
            actionLabel: 'Stock Received',
            timestamp: createdAt,
            dateFormatted: createdAt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
            timeFormatted: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            supplierName: supName,
            userName,
            invoiceNumber: log.receiving?.invoiceNumber || (refMatch && refMatch[1].startsWith('INV') ? refMatch[1] : 'â€”'),
            receivingNumber: log.receiving?.receivingNumber || (refMatch ? refMatch[1] : `RCV-${log.receivingId || log.id}`),
            batchNumber: log.batchNumber || log.receiving?.batchNumber || 'â€”',
            items: [itemLine],
            totalItemsCount: 1,
            totalCost: lineCost,
            notes: reason
          });
        } else {
          // Standalone stock-in without explicit group
          const standaloneKey = `rcv_single_${log.id}`;
          receivingGroups.set(standaloneKey, {
            id: standaloneKey,
            logIds: [log.id],
            type: 'STOCK_IN_GROUP',
            actionLabel: 'Stock Received',
            timestamp: createdAt,
            dateFormatted: createdAt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
            timeFormatted: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            supplierName: supName,
            userName,
            invoiceNumber: 'â€”',
            receivingNumber: `RCV-LOG-${log.id}`,
            batchNumber: log.batchNumber || 'â€”',
            items: [itemLine],
            totalItemsCount: 1,
            totalCost: lineCost,
            notes: reason
          });
        }
      }
      // B. POS Order Deductions Grouping
      else if (type === 'USAGE' || type === 'DEDUCT' || log.orderId || reason.toLowerCase().includes('order')) {
        const orderId = log.orderId || (reason.match(/order\s*#?([A-Z0-9-]+)/i) ? reason.match(/order\s*#?([A-Z0-9-]+)/i)[1] : null);
        const orderKey = orderId ? `order_${orderId}` : `order_log_${log.id}`;
        const orderNum = log.order?.orderNumber || (orderId ? `ORD-${orderId}` : `ORD-${log.id}`);

        const batchNum = log.batchNumber || log.receivingItem?.batchNumber || null;
        const supName = log.receivingItem?.receiving?.supplier?.name || log.supplier?.name || null;
        const invNum = log.receivingItem?.receiving?.invoiceNumber || null;
        const uCost = (log.unitCost !== null && log.unitCost !== undefined && !isNaN(log.unitCost))
          ? parseFloat(log.unitCost)
          : (log.receivingItem?.unitCost ? parseFloat(log.receivingItem.unitCost) : costPerUnit);
        const actualLineCost = (log.cost && Math.abs(parseFloat(log.cost)) > 0) ? Math.abs(parseFloat(log.cost)) : (quantity * uCost);
        const batchRem = (log.batchRemaining !== null && log.batchRemaining !== undefined)
          ? parseFloat(log.batchRemaining)
          : (log.receivingItem?.remainingQuantity !== null && log.receivingItem?.remainingQuantity !== undefined ? parseFloat(log.receivingItem.remainingQuantity) : null);

        const deductionLayer = {
          id: `deduct_${log.id}`,
          itemName,
          quantity,
          unit,
          unitCost: uCost,
          totalCost: actualLineCost,
          batchNumber: batchNum || 'Legacy Stock',
          supplierName: supName || 'Legacy / Market Stock',
          invoiceNumber: invNum || 'â€”',
          batchRemaining: batchRem,
          reason: reason || 'Recipe stock deduction'
        };

        if (orderGroups.has(orderKey)) {
          const ord = orderGroups.get(orderKey);
          ord.logIds.push(log.id);
          const existingIng = ord.ingredients.find(i => i.itemName.toLowerCase() === itemName.toLowerCase() && i.unit === unit);
          if (existingIng) {
            existingIng.quantity += quantity;
            existingIng.totalCost += actualLineCost;
            existingIng.batches.push(deductionLayer);
          } else {
            ord.ingredients.push({
              id: `ing_${log.id}`,
              itemName,
              unit,
              quantity,
              totalCost: actualLineCost,
              batches: [deductionLayer]
            });
          }
          ord.totalIngredientsCount = ord.ingredients.length;
          ord.totalValuation += actualLineCost;
        } else {
          // Format ordered products summary
          const orderedProducts = (log.order?.orderItems || []).map(oi => ({
            name: oi.nameSnapshot || 'Menu Item',
            quantity: oi.quantity || 1,
            price: oi.priceSnapshot || oi.subtotal || 0
          }));

          orderGroups.set(orderKey, {
            id: orderKey,
            logIds: [log.id],
            type: 'ORDER_DEDUCT_GROUP',
            actionLabel: 'Stock Deducted',
            timestamp: createdAt,
            dateFormatted: createdAt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
            timeFormatted: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            orderNumber: orderNum,
            orderId: orderId || log.id,
            userName: log.order?.user?.name || userName || 'Cashier User',
            status: 'Stock Deducted',
            tableInfo: log.order ? resolveTableLabel(log.order) : (log.order?.customerEmail ? `Customer: ${log.order.customerEmail}` : null),
            orderedProducts: orderedProducts,
            orderedProductsSummary: orderedProducts.length > 0
              ? orderedProducts.map(p => `${p.name} Ã— ${p.quantity}`).join(', ')
              : (reason.includes(':') ? reason.split(':')[1]?.trim() : 'POS Menu Item Orders'),
            ingredients: [
              {
                id: `ing_${log.id}`,
                itemName,
                unit,
                quantity,
                totalCost: actualLineCost,
                batches: [deductionLayer]
              }
            ],
            totalIngredientsCount: 1,
            totalValuation: actualLineCost,
            notes: reason
          });
        }
      }
      // C. Other Adjustments (Wastage, Corrections, Restoration)
      else {
        standaloneActivities.push({
          id: `act_${log.id}`,
          type: type,
          actionLabel: type === 'RESTORATION' ? 'Stock Restored' : 'Stock Adjusted',
          timestamp: createdAt,
          dateFormatted: createdAt.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }),
          timeFormatted: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          userName,
          itemName,
          changeQty: (log.changeQty ?? 0) > 0 ? `+${log.changeQty} ${unit}` : `${log.changeQty ?? 0} ${unit}`,
          rawQty: log.changeQty ?? 0,
          unit,
          reference: log.reference || `ADJ-${log.id}`,
          reason: reason || `${type} adjustment`,
          batchNumber: log.batchNumber || 'â€”',
          badgeColor: type === 'RESTORATION' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          icon: AlertTriangle,
          rawLog: log,
          logIds: [log.id]
        });
      }
    });

    // Combine all grouped cards and standalone entries
    const all = [
      ...Array.from(receivingGroups.values()),
      ...Array.from(orderGroups.values()),
      ...standaloneActivities
    ];

    // Sort descending by timestamp
    all.sort((a, b) => b.timestamp - a.timestamp);

    return {
      groupedActivities: all,
      allSuppliers: Array.from(supplierSet).sort()
    };
  }, [logs, receivings]);

  // KPI Metrics Calculation
  const summaryMetrics = useMemo(() => {
    const todayStr = new Date().toDateString();
    let todayCount = 0;
    let receiptsCount = 0;
    let orderDeductionsCount = 0;
    let adjustmentsCount = 0;

    groupedActivities.forEach(a => {
      if (a.timestamp.toDateString() === todayStr) todayCount++;
      if (a.type === 'STOCK_IN_GROUP') receiptsCount++;
      else if (a.type === 'ORDER_DEDUCT_GROUP') orderDeductionsCount++;
      else adjustmentsCount++;
    });

    return {
      todayCount,
      receiptsCount,
      orderDeductionsCount,
      adjustmentsCount,
      totalEvents: groupedActivities.length
    };
  }, [groupedActivities]);

  // Filtering Logic
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

    const q = String(searchQuery || '').toLowerCase().trim();

    return groupedActivities.filter(a => {
      // 1. Search Query
      if (q) {
        let match;
        if (a.type === 'STOCK_IN_GROUP') {
          match =
            (a.supplierName && a.supplierName.toLowerCase().includes(q)) ||
            (a.invoiceNumber && a.invoiceNumber.toLowerCase().includes(q)) ||
            (a.receivingNumber && a.receivingNumber.toLowerCase().includes(q)) ||
            (a.userName && a.userName.toLowerCase().includes(q)) ||
            (a.batchNumber && a.batchNumber.toLowerCase().includes(q)) ||
            a.items.some(i => i.itemName.toLowerCase().includes(q) || i.batchNumber.toLowerCase().includes(q));
        } else if (a.type === 'ORDER_DEDUCT_GROUP') {
          match =
            (a.orderNumber && a.orderNumber.toLowerCase().includes(q)) ||
            (a.userName && a.userName.toLowerCase().includes(q)) ||
            (a.tableInfo && a.tableInfo.toLowerCase().includes(q)) ||
            (a.orderedProductsSummary && a.orderedProductsSummary.toLowerCase().includes(q)) ||
            a.ingredients.some(i => i.itemName.toLowerCase().includes(q));
        } else {
          match =
            (a.itemName && a.itemName.toLowerCase().includes(q)) ||
            (a.userName && a.userName.toLowerCase().includes(q)) ||
            (a.reference && a.reference.toLowerCase().includes(q)) ||
            (a.reason && a.reason.toLowerCase().includes(q));
        }
        if (!match) return false;
      }

      // 2. Action Filter
      if (actionFilter === 'RECEIVED' && a.type !== 'STOCK_IN_GROUP') return false;
      if (actionFilter === 'DEDUCTED' && a.type !== 'ORDER_DEDUCT_GROUP') return false;
      if (actionFilter === 'ADJUSTED' && (a.type === 'STOCK_IN_GROUP' || a.type === 'ORDER_DEDUCT_GROUP')) return false;

      // 3. Supplier Filter
      if (supplierFilter !== 'ALL') {
        if (a.type !== 'STOCK_IN_GROUP' || a.supplierName !== supplierFilter) return false;
      }

      // 4. Date Filter
      if (dateFilter === 'TODAY' && a.timestamp.toDateString() !== todayStr) return false;
      if (dateFilter === 'YESTERDAY' && a.timestamp.toDateString() !== yesterdayStr) return false;
      if (dateFilter === 'LAST_7' && a.timestamp < sevenDaysAgo) return false;
      if (dateFilter === 'LAST_30' && a.timestamp < thirtyDaysAgo) return false;

      return true;
    });
  }, [groupedActivities, searchQuery, actionFilter, supplierFilter, dateFilter]);

  // Paginated activities
  const totalPages = Math.ceil(filteredActivities.length / itemsPerPage) || 1;
  const paginatedActivities = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredActivities.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredActivities, currentPage, itemsPerPage]);

  const selectedLogActivities = groupedActivities.filter((activity) =>
    selectedActivityIds.has(activity.id) && logIdsForActivity(activity).length > 0
  );
  const selectedLogIds = [...new Set(selectedLogActivities.flatMap(logIdsForActivity))];
  const selectableLogActivities = filteredActivities.filter((activity) =>
    logIdsForActivity(activity).length > 0
  );
  const allSelectableLogsSelected = selectableLogActivities.length > 0 && selectableLogActivities.every((activity) => selectedActivityIds.has(activity.id));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-purple-500/10 text-purple-400">ðŸ“œ</span>
            Inventory &amp; Activity Logs
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Audit trail of stock movements: grouped receipt shipments, order ingredient deductions, and adjustments.
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Today's Activity</span>
          <div className="text-2xl font-black text-purple-400 font-mono">{summaryMetrics.todayCount} groups</div>
          <div className="text-[10px] text-[var(--text-muted)]">Recorded today</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Stock Receipts</span>
          <div className="text-2xl font-black text-emerald-400 font-mono">{summaryMetrics.receiptsCount} shipments</div>
          <div className="text-[10px] text-[var(--text-muted)]">Grouped invoice receipts</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">POS Order Deductions</span>
          <div className="text-2xl font-black text-purple-400 font-mono">{summaryMetrics.orderDeductionsCount} orders</div>
          <div className="text-[10px] text-[var(--text-muted)]">Order-wise recipe deductions</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Adjustments &amp; Wastage</span>
          <div className="text-2xl font-black text-amber-400 font-mono">{summaryMetrics.adjustmentsCount}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Spoilage, damage &amp; corrections</div>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)]/40 p-4 xl:grid-cols-[minmax(16rem,20rem)_1fr] xl:items-start">
        <div className="relative w-full min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice, order #, item, supplier, batch..."
            className="w-full pl-9 pr-8 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
          />
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-bold icon-btn"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid w-full min-w-0 grid-cols-1 gap-3 text-xs font-bold text-[var(--text-muted)] sm:grid-cols-2 xl:grid-cols-4">
          {/* Action Filter */}
          <div className="flex min-w-0 flex-col items-stretch gap-1.5">
            <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" />Type:</span>
            <ThemedSelect
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-2 focus:outline-none focus:border-orange-500 cursor-pointer font-bold"
            >
              <option value="ALL">All Movements</option>
              <option value="RECEIVED">Stock Received (Shipment Groups)</option>
              <option value="DEDUCTED">Stock Deducted (Order Groups)</option>
              <option value="ADJUSTED">Adjustments &amp; Spoilage</option>
            </ThemedSelect>
          </div>

          {/* Supplier Filter */}
          {allSuppliers.length > 0 && (
            <div className="flex min-w-0 flex-col items-stretch gap-1.5">
              <span>Supplier:</span>
              <ThemedSelect
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-2 focus:outline-none focus:border-orange-500 cursor-pointer font-bold"
              >
                <option value="ALL">All Suppliers</option>
                {allSuppliers.map(sup => (
                  <option key={sup} value={sup}>{sup}</option>
                ))}
              </ThemedSelect>
            </div>
          )}

          {/* Date Filter */}
          <div className="flex min-w-0 flex-col items-stretch gap-1.5">
            <span>Date:</span>
            <ThemedSelect
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-2 focus:outline-none focus:border-orange-500 cursor-pointer font-bold"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7">Last 7 Days</option>
              <option value="LAST_30">Last 30 Days</option>
            </ThemedSelect>
          </div>

          {(searchQuery || actionFilter !== 'ALL' || supplierFilter !== 'ALL' || dateFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setActionFilter('ALL');
                setSupplierFilter('ALL');
                setDateFilter('ALL');
              }}
              className="self-end px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer sm:col-span-2 xl:col-span-1 xl:self-end"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedLogIds.length} />
      </div>

      {selectionMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)]/60">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelectableLogsSelected}
              disabled={selectableLogActivities.length === 0}
              onChange={() => setSelectedActivityIds((current) => {
                const next = new Set(current);
                if (allSelectableLogsSelected) selectableLogActivities.forEach((activity) => next.delete(activity.id));
                else selectableLogActivities.forEach((activity) => next.add(activity.id));
                return next;
              })}
              className="accent-orange-500"
              aria-label="Select all eligible inventory logs"
            />
            Select eligible logs ({selectableLogActivities.length})
          </label>
          {selectableLogActivities.length === 0 && (
            <span className="text-xs text-[var(--text-muted)]" role="status">
              No deletable logs in this view. Stock receipt history is protected here.
            </span>
          )}
        </div>
      )}

      {selectionMode && selectedLogIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-rose-500/20 bg-rose-500/5">
          <span className="text-xs font-bold text-[var(--text-main)]">{selectedLogIds.length} inventory log record(s) selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedActivityIds(new Set())} className="px-3 py-2 rounded-xl border border-[var(--border-color)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer">Clear</button>
            <button
              type="button"
              onClick={() => { setDeleteTarget({ logIds: selectedLogIds, label: `${selectedLogIds.length} selected inventory log records` }); setDeleteModalOpen(true); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected Logs
            </button>
          </div>
        </div>
      )}

      {/* Activity Timeline List (Parent Cards) */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-3xl p-4 sm:p-5 shadow-xl space-y-3.5">
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-2">
            <History className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
            <p className="font-bold text-[var(--text-main)] text-sm">
              {searchQuery || actionFilter !== 'ALL' || supplierFilter !== 'ALL' || dateFilter !== 'ALL'
                ? 'No matching logs found'
                : 'No activity logs recorded yet'}
            </p>
            <p className="text-[var(--text-muted)]">
              Stock receiving shipments and POS order recipe deductions will automatically group here into parent cards.
            </p>
          </div>
        ) : (
          paginatedActivities.map((act) => {
            const isExpanded = !!expandedCards[act.id];

            // ----------------------------------------------------
            // 1. STOCK RECEIVED GROUPED PARENT CARD (PART 3)
            // ----------------------------------------------------
            if (act.type === 'STOCK_IN_GROUP') {
              return (
                <div
                  key={act.id}
                  className={`bg-[var(--bg-color)]/70 hover:bg-[var(--bg-color)] border ${isExpanded ? 'border-emerald-500/40 shadow-lg' : 'border-[var(--border-color)]'} rounded-2xl transition-all overflow-hidden group`}
                >
                  {/* Collapsed Parent Card Header */}
                  <div
                    onClick={(e) => toggleExpand(act.id, e)}
                    className="p-4 sm:p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 cursor-pointer"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="p-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5 sm:mt-0">
                        <Truck className="w-5 h-5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-sm text-[var(--text-main)] group-hover:text-emerald-400 transition-colors">
                            {act.supplierName}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            Stock Received
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            by <strong className="text-[var(--text-main)]">{act.userName}</strong>
                          </span>
                        </div>

                        {/* Collapsed KPI summary badges */}
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono text-[var(--text-muted)] pt-0.5">
                          <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] font-bold">
                            ðŸ“¦ Items: <strong className="text-emerald-400">{act.totalItemsCount}</strong>
                          </span>
                          {act.totalCost > 0 && (
                            <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] font-bold">
                              ðŸ’° Total: <strong className="text-amber-400 font-mono">PKR {Math.round(act.totalCost).toLocaleString()}</strong>
                            </span>
                          )}
                          {act.invoiceNumber && act.invoiceNumber !== 'â€”' && (
                            <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)]">
                              Invoice: <strong className="text-emerald-300 font-bold">{act.invoiceNumber}</strong>
                            </span>
                          )}
                          <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)]">
                            Ref: <strong>{act.receivingNumber}</strong>
                          </span>
                          {act.batchNumber && act.batchNumber !== 'â€”' && (
                            <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)]">
                              Batch: <strong className="text-orange-400 font-bold">{act.batchNumber}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: Timestamp & Expand Arrow */}
                    <div className="flex items-center gap-3 shrink-0 self-end md:self-center text-right">
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">
                        <div className="font-bold text-[var(--text-main)]">{act.timeFormatted}</div>
                        <div>{act.dateFormatted}</div>
                      </div>
                      {selectionMode && logIdsForActivity(act).length > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedActivityIds.has(act.id)}
                          onChange={(event) => toggleActivitySelection(act, event)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Select inventory logs for ${act.receivingNumber}`}
                          className="accent-rose-500"
                        />
                      )}
                      {logIdsForActivity(act).length > 0 && (
                        <button
                          type="button"
                          onClick={(event) => openLogDelete(act, event)}
                          title={`Delete ${logIdsForActivity(act).length} inventory log(s)`}
                          aria-label={`Delete inventory logs for ${act.receivingNumber}`}
                          className="p-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer icon-btn"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => toggleExpand(act.id, e)}
                        className={['icon-btn', (`p-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)] group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-transform ${isExpanded ? 'rotate-180 text-emerald-400' : ''}`)].filter(Boolean).join(' ')}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Itemized Breakdown Table */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-[var(--border-color)]/70 bg-[var(--card-bg)]/30 space-y-3 animate-fade-in">
                      <div className="flex flex-wrap items-center justify-between text-xs text-[var(--text-muted)] pt-1">
                        <span className="font-bold text-[var(--text-main)]">
                          Shipment Breakdown ({act.items.length} item{act.items.length === 1 ? '' : 's'})
                        </span>
                        {act.notes && (
                          <span className="text-[11px] italic text-[var(--text-muted)]">
                            Notes: "{act.notes}"
                          </span>
                        )}
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)]">
                        <table className="inventory-single-row-table w-full min-w-max text-left text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border-color)] bg-[var(--card-bg)]/60 text-[10px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">
                              <th className="py-2.5 px-3">Item / Ingredient</th>
                              <th className="py-2.5 px-3 text-right">Qty Received</th>
                              <th className="py-2.5 px-3">Unit</th>
                              <th className="py-2.5 px-3 text-right">Unit Cost</th>
                              <th className="py-2.5 px-3 text-right">Line Total</th>
                              <th className="py-2.5 px-3">Batch Number</th>
                              <th className="py-2.5 px-3">Expiry Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-color)]/50 font-mono">
                            {act.items.map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-emerald-500/5 transition-colors">
                                <td className="py-2.5 px-3 font-sans font-bold text-[var(--text-main)]">
                                  {item.itemName}
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-emerald-400">
                                  +{item.quantity}
                                </td>
                                <td className="py-2.5 px-3 text-[var(--text-muted)] uppercase">
                                  {item.unit}
                                </td>
                                <td className="py-2.5 px-3 text-right text-[var(--text-muted)]">
                                  {item.unitCost > 0 ? `PKR ${item.unitCost.toFixed(2)}` : 'â€”'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                                  {item.totalCost > 0 ? `PKR ${Math.round(item.totalCost).toLocaleString()}` : 'â€”'}
                                </td>
                                <td className="py-2.5 px-3 text-orange-400 font-bold">
                                  {item.batchNumber}
                                </td>
                                <td className="py-2.5 px-3 text-[var(--text-muted)]">
                                  {item.expiryDate}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // ----------------------------------------------------
            // 2. ORDER-WISE STOCK DEDUCTION GROUPED CARD (PART 4)
            // ----------------------------------------------------
            if (act.type === 'ORDER_DEDUCT_GROUP') {
              // Grouped units summary without mixing units
              const unitSummaryMap = {};
              act.ingredients.forEach(i => {
                const u = (i.unit || 'PCS').toUpperCase();
                unitSummaryMap[u] = (unitSummaryMap[u] || 0) + i.quantity;
              });
              const unitSummaryStr = Object.entries(unitSummaryMap)
                .map(([u, q]) => `${Math.round(q * 100) / 100} ${u}`)
                .join(', ');

              return (
                <div
                  key={act.id}
                  className={`bg-[var(--bg-color)]/70 hover:bg-[var(--bg-color)] border ${isExpanded ? 'border-purple-500/40 shadow-lg' : 'border-[var(--border-color)]'} rounded-2xl transition-all overflow-hidden group`}
                >
                  {/* Collapsed Parent Card Header */}
                  <div
                    onClick={(e) => toggleExpand(act.id, e)}
                    className="p-4 sm:p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 cursor-pointer"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="p-2.5 rounded-2xl border border-purple-500/30 bg-purple-500/10 text-purple-400 shrink-0 mt-0.5 sm:mt-0">
                        <Utensils className="w-5 h-5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-sm text-[var(--text-main)] group-hover:text-purple-400 transition-colors">
                            {act.orderNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/20">
                            Stock Deducted
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            processed by <strong className="text-[var(--text-main)]">{act.userName}</strong>
                          </span>
                          {act.tableInfo && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--card-bg)] text-[var(--text-main)] border border-[var(--border-color)]">
                              {act.tableInfo}
                            </span>
                          )}
                        </div>

                        {/* Product names summary & Ingredients count */}
                        <div className="text-xs font-bold text-[var(--text-main)] flex flex-wrap items-center gap-2">
                          <span>ðŸ½ï¸ Products:</span>
                          <span className="text-purple-300 font-semibold">{act.orderedProductsSummary}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono text-[var(--text-muted)] pt-0.5">
                          <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)] font-bold">
                            ðŸ§ª Ingredients Deducted: <strong className="text-purple-400">{act.totalIngredientsCount}</strong>
                          </span>
                          {unitSummaryStr && (
                            <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)]">
                              Total Qty: <strong>{unitSummaryStr}</strong>
                            </span>
                          )}
                          {act.totalValuation > 0 && (
                            <span className="bg-[var(--card-bg)] px-2 py-0.5 rounded-lg border border-[var(--border-color)] text-[var(--text-main)]">
                              Est. Cost: <strong className="text-amber-400">PKR {Math.round(act.totalValuation).toLocaleString()}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: Timestamp & Expand Arrow */}
                    <div className="flex items-center gap-3 shrink-0 self-end md:self-center text-right">
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">
                        <div className="font-bold text-[var(--text-main)]">{act.timeFormatted}</div>
                        <div>{act.dateFormatted}</div>
                      </div>
                      {selectionMode && logIdsForActivity(act).length > 0 && (
                        <input
                          type="checkbox"
                          checked={selectedActivityIds.has(act.id)}
                          onChange={(event) => toggleActivitySelection(act, event)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Select inventory logs for order ${act.orderNumber}`}
                          className="accent-rose-500"
                        />
                      )}
                      {logIdsForActivity(act).length > 0 && (
                        <button
                          type="button"
                          onClick={(event) => openLogDelete(act, event)}
                          title={`Delete ${logIdsForActivity(act).length} inventory log(s)`}
                          aria-label={`Delete inventory logs for order ${act.orderNumber}`}
                          className="p-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer icon-btn"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => toggleExpand(act.id, e)}
                        className={['icon-btn', (`p-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)] group-hover:text-purple-400 group-hover:border-purple-500/30 transition-transform ${isExpanded ? 'rotate-180 text-purple-400' : ''}`)].filter(Boolean).join(' ')}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Ingredient Breakdown Table */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-[var(--border-color)]/70 bg-[var(--card-bg)]/30 space-y-3 animate-fade-in">
                      {/* Products Ordered Snapshot */}
                      {act.orderedProducts && act.orderedProducts.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-[10px] font-black uppercase text-[var(--text-muted)]">Order Items:</span>
                          {act.orderedProducts.map((p, pIdx) => (
                            <span key={pIdx} className="px-2 py-0.5 rounded-lg bg-[var(--card-bg)] text-[var(--text-main)] font-bold border border-[var(--border-color)]">
                              {p.name} <span className="text-purple-400 font-mono">Ã— {p.quantity}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-0.5">
                        <span className="font-bold text-[var(--text-main)]">
                          Recipe Ingredients Deducted ({act.ingredients.length})
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-muted)]">
                          Order ID: <strong>{act.orderId}</strong>
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)]">
                        <table className="inventory-single-row-table w-full min-w-max text-left text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border-color)] bg-[var(--card-bg)]/60 text-[10px] font-extrabold uppercase text-[var(--text-muted)] tracking-wider">
                              <th className="py-2.5 px-3">Ingredient</th>
                              <th className="py-2.5 px-3 text-right">Qty Deducted</th>
                              <th className="py-2.5 px-3">Unit</th>
                              <th className="py-2.5 px-3">Batch / Layer Consumed</th>
                              <th className="py-2.5 px-3">Supplier &amp; Invoice</th>
                              <th className="py-2.5 px-3 text-right">Unit Cost</th>
                              <th className="py-2.5 px-3 text-right">Consumption Cost</th>
                              <th className="py-2.5 px-3 text-right">Remaining in Batch</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-color)]/50 font-mono">
                            {act.ingredients.map((ing, idx) => {
                              const hasMultipleBatches = (ing.batches && ing.batches.length > 1);
                              return (
                                <React.Fragment key={ing.id || idx}>
                                  {hasMultipleBatches ? (
                                    <>
                                      {/* Ingredient Header Row across multiple batches */}
                                      <tr className="bg-purple-950/20 font-bold border-b border-purple-500/20">
                                        <td className="py-2 px-3 font-sans font-black text-purple-300">
                                          {ing.itemName} <span className="text-[10px] font-normal text-purple-400">({ing.batches.length} FIFO layers)</span>
                                        </td>
                                        <td className="py-2 px-3 text-right font-black text-purple-400">
                                          -{ing.quantity}
                                        </td>
                                        <td className="py-2 px-3 text-[var(--text-muted)] uppercase">
                                          {ing.unit}
                                        </td>
                                        <td colSpan="2" className="py-2 px-3 text-xs text-[var(--text-muted)] font-sans italic">
                                          Multi-batch FIFO deduction
                                        </td>
                                        <td className="py-2 px-3 text-right text-[var(--text-muted)]">â€”</td>
                                        <td className="py-2 px-3 text-right font-black text-amber-400">
                                          PKR {ing.totalCost.toFixed(2)}
                                        </td>
                                        <td className="py-2 px-3 text-right text-[var(--text-muted)]">â€”</td>
                                      </tr>
                                      {/* Sub-rows for each batch */}
                                      {ing.batches.map((b, bIdx) => (
                                        <tr key={b.id || bIdx} className="hover:bg-purple-500/5 transition-colors text-[11px] bg-[var(--bg-color)]/40">
                                          <td className="py-1.5 px-3 pl-6 font-sans text-[var(--text-muted)] flex items-center gap-1.5">
                                            <span className="text-purple-400">â†³</span> Layer #{bIdx + 1}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-bold text-purple-300">
                                            -{b.quantity}
                                          </td>
                                          <td className="py-1.5 px-3 text-[var(--text-muted)] uppercase">
                                            {b.unit}
                                          </td>
                                          <td className="py-1.5 px-3 font-bold text-orange-400">
                                            {b.batchNumber}
                                          </td>
                                          <td className="py-1.5 px-3 text-[var(--text-muted)] font-sans">
                                            <span className="font-bold text-[var(--text-main)]">{b.supplierName}</span>
                                            {b.invoiceNumber && b.invoiceNumber !== 'â€”' && (
                                              <span className="text-[10px] text-emerald-400 block font-mono">Inv: {b.invoiceNumber}</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-3 text-right text-[var(--text-muted)]">
                                            {b.unitCost > 0 ? `PKR ${b.unitCost.toFixed(2)}` : 'â€”'}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-bold text-amber-400">
                                            {b.totalCost > 0 ? `PKR ${b.totalCost.toFixed(2)}` : 'â€”'}
                                          </td>
                                          <td className="py-1.5 px-3 text-right text-emerald-400 font-bold">
                                            {b.batchRemaining !== null ? `${b.batchRemaining} ${b.unit}` : 'â€”'}
                                          </td>
                                        </tr>
                                      ))}
                                    </>
                                  ) : (
                                    /* Single batch row */
                                    (() => {
                                      const b = (ing.batches && ing.batches[0]) || ing;
                                      return (
                                        <tr className="hover:bg-purple-500/5 transition-colors">
                                          <td className="py-2.5 px-3 font-sans font-bold text-[var(--text-main)]">
                                            {ing.itemName}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-black text-purple-400">
                                            -{ing.quantity}
                                          </td>
                                          <td className="py-2.5 px-3 text-[var(--text-muted)] uppercase">
                                            {ing.unit}
                                          </td>
                                          <td className="py-2.5 px-3 font-bold text-orange-400">
                                            {b.batchNumber || 'Legacy Stock'}
                                          </td>
                                          <td className="py-2.5 px-3 text-[var(--text-muted)] font-sans">
                                            <span className="font-bold text-[var(--text-main)]">{b.supplierName || 'Legacy / Market Stock'}</span>
                                            {b.invoiceNumber && b.invoiceNumber !== 'â€”' && (
                                              <span className="text-[10px] text-emerald-400 block font-mono">Inv: {b.invoiceNumber}</span>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-right text-[var(--text-muted)]">
                                            {b.unitCost > 0 ? `PKR ${b.unitCost.toFixed(2)}` : 'â€”'}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                                            {b.totalCost > 0 ? `PKR ${b.totalCost.toFixed(2)}` : 'â€”'}
                                          </td>
                                          <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                                            {b.batchRemaining !== null ? `${b.batchRemaining} ${b.unit}` : 'â€”'}
                                          </td>
                                        </tr>
                                      );
                                    })()
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // ----------------------------------------------------
            // 3. STANDALONE ACTIVITY CARD (ADJUSTMENTS & SPOILAGE)
            // ----------------------------------------------------
            const IconComp = act.icon || AlertTriangle;
            return (
              <div
                key={act.id}
                onClick={() => setSelectedLogDetails(act)}
                className="bg-[var(--bg-color)]/70 hover:bg-[var(--bg-color)] border border-[var(--border-color)] p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors cursor-pointer group"
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
                      {act.batchNumber && act.batchNumber !== 'â€”' && (
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
                  {selectionMode && logIdsForActivity(act).length > 0 && (
                    <input
                      type="checkbox"
                      checked={selectedActivityIds.has(act.id)}
                      onChange={(event) => toggleActivitySelection(act, event)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select inventory log for ${act.itemName}`}
                      className="accent-rose-500"
                    />
                  )}
                  {logIdsForActivity(act).length > 0 && (
                    <button
                      type="button"
                      onClick={(event) => openLogDelete(act, event)}
                      title="Delete inventory log"
                      aria-label={`Delete inventory log for ${act.itemName}`}
                      className="p-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer icon-btn"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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

      {/* Log Activity Details Modal via Portal for Standalone Logs */}
      {selectedLogDetails && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text-main)]">{selectedLogDetails.actionLabel}</h3>
                <span className="text-[10px] text-amber-400 font-bold uppercase">{selectedLogDetails.dateFormatted} at {selectedLogDetails.timeFormatted}</span>
              </div>
              <button onClick={() => setSelectedLogDetails(null)} className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] cursor-pointer icon-btn">
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

      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteTarget(null); }}
        onConfirm={handleConfirmDeleteLog}
        title={deleteTarget?.label ? 'Delete Selected Inventory Logs' : 'Delete Inventory Log'}
        message="This permanently removes the selected inventory log record(s) from the activity history."
        itemName={deleteTarget?.label || (deleteTarget?.actionLabel ? `${deleteTarget.actionLabel} Â· ${deleteTarget.itemName || deleteTarget.orderNumber || deleteTarget.receivingNumber || ''}` : '')}
        itemCount={logIdsForActivity(deleteTarget).length}
        isBulk={logIdsForActivity(deleteTarget).length > 1}
        confirmButtonText={logIdsForActivity(deleteTarget).length > 1 ? `Delete ${logIdsForActivity(deleteTarget).length} Logs` : 'Delete Log'}
        loading={isDeletingLog}
        dangerLevel="danger"
        warningNotes={['Deleting these history records does not reverse stock movements or change current inventory quantities.', 'Confirmed stock receiving records are protected and are not deletable from this Logs view.']}
      />

    </div>
  );
};

export default AdminActivityLogsView;


