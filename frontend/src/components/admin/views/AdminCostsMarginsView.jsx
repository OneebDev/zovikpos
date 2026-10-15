import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import api from '../../../services/api';
import {
  DollarSign,
  Search,
  SlidersHorizontal,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Utensils,
  ArrowUpRight,
  Info,
  X,
  Edit3,
  TrendingDown,
  Trash2
} from 'lucide-react';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const convertUnit = (qty, fromUnit, toUnit) => {
  const amount = Number(qty);
  if (isNaN(amount) || amount <= 0) return 0;
  const f = (fromUnit || 'PCS').toUpperCase();
  const t = (toUnit || 'PCS').toUpperCase();
  if (f === t) return amount;
  if (['KG', 'KILOGRAM'].includes(f) && ['G', 'GRAM', 'GRAMS'].includes(t)) return amount * 1000;
  if (['G', 'GRAM', 'GRAMS'].includes(f) && ['KG', 'KILOGRAM'].includes(t)) return amount / 1000;
  if (['L', 'LITER'].includes(f) && ['ML', 'MILLILITER'].includes(t)) return amount * 1000;
  if (['ML', 'MILLILITER'].includes(f) && ['L', 'LITER'].includes(t)) return amount / 1000;
  if (f === 'DOZEN' && ['PCS', 'PC'].includes(t)) return amount * 12;
  if (['PCS', 'PC'].includes(f) && t === 'DOZEN') return amount / 12;
  return amount;
};

const AdminCostsMarginsView = ({ inventory = [], showToast, onNavigateToRecipes }) => {
  const [menuItems, setMenuItems] = useState([]);
  const [recipesMap, setRecipesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [foodCostFilter, setFoodCostFilter] = useState('ALL');
  const [marginFilter, setMarginFilter] = useState('ALL');
  const [selectedItemDetails, setSelectedItemDetails] = useState(null);

  // Multi-select & Delete State
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); // single item or null for bulk
  const [isDeleting, setIsDeleting] = useState(false);

  // Toggle single item selection
  const toggleSelectItem = (id) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle select all visible items
  const toggleSelectAll = (items) => {
    if (selectedItemIds.size === items.length && items.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(items.map(i => i.id)));
    }
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedItemIds(new Set());
    setSelectionMode((active) => !active);
  };

  // Open single recipe clear
  const handleOpenSingleDelete = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  // Open bulk recipe clear
  const handleOpenBulkDelete = () => {
    if (selectedItemIds.size === 0) return;
    setItemToDelete(null);
    setDeleteModalOpen(true);
  };

  // Confirm delete (single or bulk)
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (itemToDelete) {
        await api.delete(`/inventory/recipes/${itemToDelete.id}`);
        if (showToast) showToast(`Recipe cost & ingredients for "${itemToDelete.name}" cleared successfully.`, 'success');
        setSelectedItemIds(prev => {
          const next = new Set(prev);
          next.delete(itemToDelete.id);
          return next;
        });
      } else {
        const ids = Array.from(selectedItemIds);
        await api.delete('/inventory/recipes/bulk', { data: { menuItemIds: ids } });
        if (showToast) showToast(`Successfully cleared recipe costs for ${ids.length} menu items.`, 'success');
        setSelectedItemIds(new Set());
      }
      setDeleteModalOpen(false);
      setItemToDelete(null);
      await loadData();
    } catch (err) {
      console.error('Delete recipe error:', err);
      const msg = err.response?.data?.error || 'Failed to clear recipe.';
      if (showToast) showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const menuRes = await api.get('/menu');
      const items = menuRes.data?.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
      setMenuItems(items);

      const map = {};
      await Promise.all(
        items.map(async (m) => {
          try {
            const res = await api.get(`/inventory/recipes/${m.id}`);
            if (res.data?.menuItem?.recipeItems) {
              map[m.id] = res.data.menuItem.recipeItems.map(r => ({
                inventoryItemId: r.inventoryItemId,
                quantity: r.quantity,
                unit: r.unit || r.inventoryItem?.unit || 'PCS',
                invItem: r.inventoryItem
              }));
            } else {
              map[m.id] = [];
            }
          } catch {
            map[m.id] = [];
          }
        })
      );
      setRecipesMap(map);
    } catch (err) {
      console.error('Failed to load menu margins data:', err);
      if (showToast) showToast('Failed to load menu costs data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [inventory]);

  const categories = useMemo(() => {
    const set = new Set();
    menuItems.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set).sort();
  }, [menuItems]);

  const getItemRecipeCost = (mId) => {
    const ings = recipesMap[mId] || [];
    if (!ings.length) return 0;
    return ings.reduce((sum, r) => {
      const inv = inventory.find(i => i.id === r.inventoryItemId) || r.invItem;
      if (!inv || !inv.costPrice) return sum;
      const convertedQty = convertUnit(r.quantity, r.unit, inv.unit);
      return sum + (convertedQty * (inv.costPrice || 0));
    }, 0);
  };

  const calculatedItems = useMemo(() => {
    return menuItems.map(item => {
      const recipeCost = getItemRecipeCost(item.id);
      const price = parseFloat(item.price) || 0;
      const grossMargin = price > 0 ? price - recipeCost : 0;
      const foodCostPct = price > 0 && recipeCost > 0 ? (recipeCost / price) * 100 : 0;
      const marginPct = price > 0 ? (grossMargin / price) * 100 : 0;
      const hasRecipe = (recipesMap[item.id] || []).length > 0;

      let status = 'No Recipe / Cost Missing';
      if (hasRecipe && recipeCost > 0) {
        if (recipeCost >= price || foodCostPct >= 100) {
          status = 'Loss / Negative Margin';
        } else if (foodCostPct > 35) {
          status = 'Low Margin';
        } else {
          status = 'Healthy Margin';
        }
      }

      return {
        ...item,
        recipeCost,
        grossMargin,
        foodCostPct,
        marginPct,
        hasRecipe,
        status
      };
    });
  }, [menuItems, recipesMap, inventory]);

  const summary = useMemo(() => {
    const totalItems = calculatedItems.length;
    const withRecipe = calculatedItems.filter(i => i.hasRecipe && i.price > 0 && i.recipeCost > 0);
    const avgFoodCost = withRecipe.length > 0
      ? (withRecipe.reduce((s, i) => s + i.foodCostPct, 0) / withRecipe.length).toFixed(1)
      : '0';

    let bestMarginItem = null;
    let highestCostItem = null;

    if (withRecipe.length > 0) {
      bestMarginItem = [...withRecipe].sort((a, b) => b.marginPct - a.marginPct)[0];
      highestCostItem = [...withRecipe].sort((a, b) => b.recipeCost - a.recipeCost)[0];
    }

    return { totalItems, avgFoodCost, bestMarginItem, highestCostItem };
  }, [calculatedItems]);

  const filteredItems = useMemo(() => {
    return calculatedItems.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const ings = (recipesMap[item.id] || []).map(r => {
        const inv = inventory.find(i => i.id === r.inventoryItemId) || r.invItem;
        return inv?.name?.toLowerCase() || '';
      }).join(' ');

      const matchesSearch = !q ||
        item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        ings.includes(q);

      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;

      let matchesFoodCost = true;
      if (foodCostFilter === 'UNDER_25') matchesFoodCost = item.foodCostPct > 0 && item.foodCostPct < 25;
      else if (foodCostFilter === '25_35') matchesFoodCost = item.foodCostPct >= 25 && item.foodCostPct <= 35;
      else if (foodCostFilter === '35_45') matchesFoodCost = item.foodCostPct > 35 && item.foodCostPct <= 45;
      else if (foodCostFilter === 'ABOVE_45') matchesFoodCost = item.foodCostPct > 45;

      let matchesMargin = true;
      if (marginFilter === 'HIGH') matchesMargin = item.status === 'Healthy Margin';
      else if (marginFilter === 'LOW') matchesMargin = item.status === 'Low Margin';
      else if (marginFilter === 'LOSS') matchesMargin = item.status === 'Loss / Negative Margin';
      else if (marginFilter === 'NO_RECIPE') matchesMargin = item.status === 'No Recipe / Cost Missing';

      return matchesSearch && matchesCategory && matchesFoodCost && matchesMargin;
    });
  }, [calculatedItems, searchQuery, selectedCategory, foodCostFilter, marginFilter, recipesMap, inventory]);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--card-bg)] border border-[var(--border-color)] p-5 sm:p-6 rounded-3xl shadow-xl">
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-amber-500/10 text-amber-400">💰</span>
            Costs & Margins
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            See what each menu item costs and how much you earn.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedItemIds.size} />
          {selectionMode && selectedItemIds.size > 0 && (
            <button
              onClick={handleOpenBulkDelete}
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm animate-fade-in"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Cost / Recipe ({selectedItemIds.size})</span>
            </button>
          )}

          {onNavigateToRecipes && (
            <button
              onClick={onNavigateToRecipes}
              className="px-4 py-2.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Go to Recipe Builder</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Menu Items</span>
          <div className="text-2xl font-black text-[var(--text-main)] font-mono">{summary.totalItems}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Active saleable items</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Average Food Cost</span>
          <div className="text-2xl font-black text-amber-400 font-mono">{summary.avgFoodCost}%</div>
          <div className="text-[10px] text-[var(--text-muted)]">Target benchmark: 30%–35%</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Best Margin</span>
          <div className="text-base font-black text-emerald-400 truncate">
            {summary.bestMarginItem ? `${summary.bestMarginItem.name}` : '—'}
          </div>
          <div className="text-[10px] text-emerald-400 font-mono font-bold">
            {summary.bestMarginItem ? `${summary.bestMarginItem.marginPct.toFixed(1)}% Gross Margin` : 'No recipe yet'}
          </div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">Highest Cost Item</span>
          <div className="text-base font-black text-rose-400 truncate">
            {summary.highestCostItem ? `${summary.highestCostItem.name}` : '—'}
          </div>
          <div className="text-[10px] text-rose-400 font-mono font-bold">
            {summary.highestCostItem ? `Rs. ${summary.highestCostItem.recipeCost.toFixed(2)} Recipe Cost` : 'No recipe yet'}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu items..."
            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
          />
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto text-xs font-bold text-[var(--text-muted)]">
          {/* Category */}
          <div className="flex items-center gap-1.5">
            <span>Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="ALL">All Categories ({menuItems.length})</option>
              {categories.map((c, idx) => (
                <option key={idx} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status / Margin */}
          <div className="flex items-center gap-1.5">
            <span>Status:</span>
            <select
              value={marginFilter}
              onChange={(e) => setMarginFilter(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="HIGH">Healthy Margin</option>
              <option value="LOW">Low Margin</option>
              <option value="LOSS">Loss / Negative Margin</option>
              <option value="NO_RECIPE">No Recipe / Cost Missing</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-400" />
            <p>Calculating recipe costs & gross margins...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-3">
            <Utensils className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
            <p className="font-bold text-[var(--text-main)] text-sm">No items found</p>
            <p className="text-[var(--text-muted)]">No menu items match your search filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-[var(--border-color)]">
              <thead className="bg-[var(--bg-color)]/80 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  {selectionMode && <th className="py-3.5 pl-4 pr-2 w-8">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                      checked={filteredItems.length > 0 && selectedItemIds.size === filteredItems.length}
                      onChange={() => toggleSelectAll(filteredItems)}
                    />
                  </th>}
                  <th className="py-3.5 px-4">Menu Item</th>
                  <th className="py-3.5 px-4">Selling Price</th>
                  <th className="py-3.5 px-4">Recipe Cost</th>
                  <th className="py-3.5 px-4">Food Cost %</th>
                  <th className="py-3.5 px-4">Gross Margin</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] font-medium text-[var(--text-main)]">
                {filteredItems.map((item) => {
                  const isSelected = selectedItemIds.has(item.id);
                  return (
                    <tr key={item.id} className={`hover:bg-[var(--bg-color)]/50 transition-colors ${isSelected ? 'bg-amber-500/5' : ''}`}>
                      {selectionMode && <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.id)}
                        />
                      </td>}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-amber-400 shrink-0">
                            🍔
                          </div>
                          <div>
                            <strong className="text-[var(--text-main)] block">{item.name}</strong>
                            <span className="text-[10px] text-[var(--text-muted)]">{item.category || 'General'}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-[var(--text-main)]">
                        Rs. {item.price}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-amber-400">
                        {item.hasRecipe && item.recipeCost > 0 ? `Rs. ${item.recipeCost.toFixed(2)}` : '—'}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold">
                        {item.hasRecipe && item.recipeCost > 0 ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] ${item.foodCostPct >= 100 ? 'text-rose-400 bg-rose-500/10' : item.foodCostPct > 35 ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
                            {item.foodCostPct.toFixed(1)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {item.hasRecipe && item.recipeCost > 0 ? `Rs. ${item.grossMargin.toFixed(2)}` : '—'}
                      </td>

                      <td className="py-3 px-4">
                        {item.status === 'Healthy Margin' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Healthy Margin
                          </span>
                        )}
                        {item.status === 'Low Margin' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Low Margin
                          </span>
                        )}
                        {item.status === 'Loss / Negative Margin' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                            <TrendingDown className="w-3 h-3" /> Loss / Negative Margin
                          </span>
                        )}
                        {item.status === 'No Recipe / Cost Missing' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-slate-400 bg-slate-500/10 border border-slate-500/20 px-2 py-0.5 rounded-full">
                            No Recipe / Cost Missing
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedItemDetails(item)}
                            className="px-3 py-1.5 rounded-xl bg-[var(--bg-color)] hover:bg-[var(--card-bg)] text-[var(--text-main)] border border-[var(--border-color)] font-bold text-[11px] transition-colors cursor-pointer"
                          >
                            Details
                          </button>
                          {item.hasRecipe && (
                            <button
                              onClick={() => handleOpenSingleDelete(item)}
                              title="Clear recipe ingredients and cost"
                              className="p-1.5 rounded-lg bg-[var(--bg-color)] hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-400 border border-[var(--border-color)] hover:border-rose-500/30 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <GlobalDeleteModal
          isOpen={deleteModalOpen}
          onClose={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
          onConfirm={handleConfirmDelete}
          loading={isDeleting}
          title={itemToDelete ? 'Clear Recipe & Cost' : `Clear ${selectedItemIds.size} Recipes & Costs`}
          message={
            itemToDelete
              ? `This will remove all recipe ingredients for "${itemToDelete.name}", resetting its recipe cost to zero. The menu item itself will NOT be deleted.`
              : `This will remove recipe ingredients for ${selectedItemIds.size} selected menu items, resetting their recipe costs to zero. The menu items themselves will NOT be deleted.`
          }
          confirmButtonText="Clear Recipe"
          itemName={itemToDelete?.name || `${selectedItemIds.size} menu item recipes`}
        />
      )}

      {/* Item Cost Breakdown Modal via Portal */}
      {selectedItemDetails && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text-main)]">{selectedItemDetails.name}</h3>
                <span className="text-[10px] text-orange-400 font-bold uppercase">{selectedItemDetails.category || 'General'}</span>
              </div>
              <button onClick={() => setSelectedItemDetails(null)} className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[var(--bg-color)] p-4 rounded-2xl text-xs font-mono font-bold">
              <div>Selling Price: <strong className="text-[var(--text-main)]">Rs. {selectedItemDetails.price}</strong></div>
              <div>Current Recipe Cost: <strong className="text-amber-400">Rs. {selectedItemDetails.recipeCost.toFixed(2)}</strong></div>
              <div>Food Cost %: <strong className="text-emerald-400">{selectedItemDetails.foodCostPct > 0 ? `${selectedItemDetails.foodCostPct.toFixed(1)}%` : '—'}</strong></div>
              <div>Gross Margin: <strong className="text-emerald-400">Rs. {selectedItemDetails.grossMargin.toFixed(2)}</strong></div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase text-[var(--text-main)] tracking-wider">Cost Breakdown</h4>
              <div className="bg-[var(--bg-color)]/60 border border-[var(--border-color)] rounded-2xl divide-y divide-[var(--border-color)] max-h-48 overflow-y-auto">
                {(recipesMap[selectedItemDetails.id] || []).length === 0 ? (
                  <div className="p-4 text-center text-[var(--text-muted)] text-xs">No ingredients mapped in recipe yet.</div>
                ) : (
                  (recipesMap[selectedItemDetails.id] || []).map((r, idx) => {
                    const inv = inventory.find(i => i.id === r.inventoryItemId) || r.invItem;
                    const convertedQty = convertUnit(r.quantity, r.unit, inv?.unit);
                    const lineCost = convertedQty * (inv?.costPrice || 0);

                    return (
                      <div key={idx} className="p-2.5 flex justify-between items-center text-xs">
                        <span className="font-bold text-[var(--text-main)]">{inv?.name || `Ingredient #${r.inventoryItemId}`} ({r.quantity} {r.unit})</span>
                        <span className="font-mono text-amber-400 font-bold">Rs. {lineCost.toFixed(2)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
              <button
                onClick={() => setSelectedItemDetails(null)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-color)] text-xs font-bold text-[var(--text-muted)] cursor-pointer"
              >
                Close
              </button>
              {onNavigateToRecipes && (
                <button
                  onClick={() => {
                    setSelectedItemDetails(null);
                    onNavigateToRecipes();
                  }}
                  className="px-4 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>View Recipe</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default AdminCostsMarginsView;
