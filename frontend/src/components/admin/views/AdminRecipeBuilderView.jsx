import ThemedSelect from '../../common/ThemedSelect';
import  { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api, { resolveBackendUrl } from '../../../services/api';

const resolveImageUrl = (url) => {
  if (!url || typeof url !== 'string' || url.trim() === '') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/')) {
    return `${resolveBackendUrl()}${trimmed}`;
  }
  return trimmed;
};
import {
  Utensils,
  BookOpen,
  Search,
  Plus,
  Edit3,
  Copy,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Clock,
  X,
  ArrowRight,
  SlidersHorizontal
} from 'lucide-react';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

/**
 * Standard Unit Converter Helper (matches backend unitConverter.js)
 */
const convertUnit = (qty, fromUnit, toUnit) => {
  const amount = Number(qty);
  if (isNaN(amount) || amount <= 0) return 0;

  const f = (fromUnit || 'PCS').toUpperCase();
  const t = (toUnit || 'PCS').toUpperCase();

  if (f === t) return amount;

  // Weight (KG <-> G)
  if (['KG', 'KILOGRAM'].includes(f) && ['G', 'GRAM', 'GRAMS'].includes(t)) return amount * 1000;
  if (['G', 'GRAM', 'GRAMS'].includes(f) && ['KG', 'KILOGRAM'].includes(t)) return amount / 1000;

  // Volume (L <-> ML)
  if (['L', 'LITER'].includes(f) && ['ML', 'MILLILITER'].includes(t)) return amount * 1000;
  if (['ML', 'MILLILITER'].includes(f) && ['L', 'LITER'].includes(t)) return amount / 1000;

  // Count (DOZEN <-> PCS)
  if (f === 'DOZEN' && ['PCS', 'PC'].includes(t)) return amount * 12;
  if (['PCS', 'PC'].includes(f) && t === 'DOZEN') return amount / 12;

  return amount;
};

const AdminRecipeBuilderView = ({ inventory = [], onRefresh, showToast, onOpenAddIngredientModal }) => {
  // Main state
  const [menuItems, setMenuItems] = useState([]);
  const [recipesMap, setRecipesMap] = useState({}); // menuItemId -> array of recipeItems
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal / Editor State
  const [activeEditorItem, setActiveEditorItem] = useState(null); // Selected MenuItem object
  const [editorIngredients, setEditorIngredients] = useState([]); // [{ inventoryItemId, quantity, unit, isAiSuggested }]
  const [yieldText, setYieldText] = useState('1 Serving');
  const [prepInstructions, setPrepInstructions] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [, setRecipeHistory] = useState([]);

  // Ingredient Selector inside Editor
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [showIngredientDropdown, setShowIngredientDropdown] = useState(false);

  // Duplicate Modal State
  const [duplicateSourceItem, setDuplicateSourceItem] = useState(null);
  const [duplicateTargetId, setDuplicateTargetId] = useState('');

  // Selection & Delete Modal State
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const hasSelectedRecipes = selectionMode && selectedItemIds.size > 0;
  const mobileActionWidth = hasSelectedRecipes ? 'mobile-action-third' : 'mobile-action-half';
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
  const toggleSelectAll = () => {
    if (selectedItemIds.size === filteredMenuItems.length && filteredMenuItems.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredMenuItems.map(i => i.id)));
    }
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedItemIds(new Set());
    setSelectionMode((active) => !active);
  };

  // Open single delete modal
  const handleOpenSingleDelete = (item) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
  };

  // Open bulk delete modal
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
        // Single recipe clear
        await api.delete(`/inventory/recipes/${itemToDelete.id}`);
        if (showToast) showToast(`Recipe for "${itemToDelete.name}" cleared successfully.`, 'success');
        setSelectedItemIds(prev => {
          const next = new Set(prev);
          next.delete(itemToDelete.id);
          return next;
        });
      } else {
        // Bulk recipes clear
        const ids = Array.from(selectedItemIds);
        await api.delete('/inventory/recipes/bulk', { data: { menuItemIds: ids } });
        if (showToast) showToast(`Successfully cleared recipes for ${ids.length} menu items.`, 'success');
        setSelectedItemIds(new Set());
      }
      setDeleteModalOpen(false);
      setItemToDelete(null);
      await loadData();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete recipe error:', err);
      const msg = err.response?.data?.error || 'Failed to clear recipe.';
      if (showToast) showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Fetch menu items & recipes
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [menuRes] = await Promise.all([
        api.get('/menu'),
        api.get('/inventory/recipes/margins')
      ]);

      const items = menuRes.data?.items || (Array.isArray(menuRes.data) ? menuRes.data : []);
      setMenuItems(items);

      // Fetch recipe detail for items
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
      console.error('Failed to load recipe builder data:', err);
      if (showToast) showToast('Failed to load menu items and recipes', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute Categories dynamically from POS Menu Items
  const categories = useMemo(() => {
    const set = new Set();
    menuItems.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [menuItems]);

  // Recipe calculation helpers
  const calculateItemRecipeCost = useCallback((mId) => {
    const ings = recipesMap[mId] || [];
    if (!ings.length) return 0;
    return ings.reduce((sum, r) => {
      const inv = inventory.find(i => i.id === r.inventoryItemId) || r.invItem;
      if (!inv || !inv.costPrice) return sum;
      const convertedQty = convertUnit(r.quantity, r.unit, inv.unit);
      return sum + (convertedQty * (inv.costPrice || 0));
    }, 0);
  }, [recipesMap, inventory]);

  const getItemStatus = useCallback((mId) => {
    const ings = recipesMap[mId] || [];
    if (!ings || ings.length === 0) return 'Draft';
    const missing = ings.some(r => !inventory.some(i => i.id === r.inventoryItemId));
    if (missing) return 'Missing Items';
    const invalidQty = ings.some(r => !r.quantity || parseFloat(r.quantity) <= 0);
    if (invalidQty) return 'Invalid';
    return 'Ready';
  }, [recipesMap, inventory]);

  // Filtered Menu Items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const ings = recipesMap[item.id] || [];
      const ingNames = ings.map(r => {
        const inv = inventory.find(i => i.id === r.inventoryItemId) || r.invItem;
        return inv?.name?.toLowerCase() || '';
      }).join(' ');

      const matchesSearch = !q ||
        item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        ingNames.includes(q);

      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;

      const status = getItemStatus(item.id);
      const matchesStatus = statusFilter === 'ALL' || status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [menuItems, recipesMap, inventory, searchQuery, selectedCategory, statusFilter, getItemStatus]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalItems = menuItems.length;
    let readyCount = 0;
    let missingCount = 0;
    let draftCount = 0;
    let totalFoodCostSum = 0;
    let countedWithRecipe = 0;

    menuItems.forEach(item => {
      const status = getItemStatus(item.id);
      if (status === 'Ready') readyCount++;
      else if (status === 'Missing Items') missingCount++;
      else draftCount++;

      const cost = calculateItemRecipeCost(item.id);
      if (cost > 0 && item.price > 0) {
        const fc = (cost / item.price) * 100;
        totalFoodCostSum += fc;
        countedWithRecipe++;
      }
    });

    const avgFoodCost = countedWithRecipe > 0 ? (totalFoodCostSum / countedWithRecipe).toFixed(1) : '0';

    return { totalItems, readyCount, missingCount, draftCount, avgFoodCost };
  }, [menuItems, calculateItemRecipeCost, getItemStatus]);

  // Open Recipe Editor
  const handleOpenEditor = (item) => {
    setActiveEditorItem(item);
    const existing = recipesMap[item.id] || [];
    setEditorIngredients(existing.map(r => ({
      inventoryItemId: r.inventoryItemId,
      quantity: r.quantity,
      unit: r.unit,
      isAiSuggested: false
    })));
    setYieldText(item.unit || '1 Serving');
    setPrepInstructions(item.description ? `Standard prep for ${item.name}.` : '');
    setIngredientSearch('');
    setShowIngredientDropdown(false);
  };

  // Add ingredient to editor list
  const handleAddIngredientToEditor = (invItem) => {
    if (editorIngredients.some(i => i.inventoryItemId === invItem.id)) {
      if (showToast) showToast(`"${invItem.name}" is already in this recipe!`, 'info');
      return;
    }
    setEditorIngredients(prev => [
      ...prev,
      {
        inventoryItemId: invItem.id,
        quantity: invItem.unit === 'KG' ? 0.15 : (invItem.unit === 'G' ? 150 : 1),
        unit: invItem.unit || 'PCS',
        isAiSuggested: false
      }
    ]);
    setIngredientSearch('');
    setShowIngredientDropdown(false);
  };

  // AI Suggest Ingredients
  const handleAiSuggest = async () => {
    if (!activeEditorItem) return;
    setIsAiLoading(true);
    try {
      const res = await api.post('/inventory/recipes/ai-suggest', { menuItemId: activeEditorItem.id });
      const suggestions = res.data?.suggestions || [];
      if (suggestions.length === 0) {
        if (showToast) showToast('No new inventory matches found for AI suggestions.', 'info');
        return;
      }

      // Merge suggestions into current editor without overwriting existing
      let addedCount = 0;
      setEditorIngredients(prev => {
        const updated = [...prev];
        suggestions.forEach(s => {
          if (!updated.some(existing => existing.inventoryItemId === s.inventoryItemId)) {
            updated.push({
              inventoryItemId: s.inventoryItemId,
              quantity: s.quantity,
              unit: s.unit,
              isAiSuggested: true
            });
            addedCount++;
          }
        });
        return updated;
      });

      if (showToast) showToast(`AI suggested ${addedCount} matching inventory items!`, 'success');
    } catch (err) {
      console.error('AI suggest error:', err);
      if (showToast) showToast('Failed to generate AI recipe suggestions.', 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Save Recipe
  const handleSaveRecipe = async (e) => {
    if (e) e.preventDefault();
    if (!activeEditorItem) return;

    // Validate quantities
    const invalid = editorIngredients.some(i => !i.quantity || parseFloat(i.quantity) <= 0);
    if (invalid) {
      if (showToast) showToast('Please enter valid quantities for all ingredients.', 'error');
      return;
    }

    try {
      const payload = editorIngredients.map(i => ({
        inventoryItemId: i.inventoryItemId,
        quantity: parseFloat(i.quantity),
        unit: i.unit
      }));

      await api.post(`/inventory/recipes/${activeEditorItem.id}`, { ingredients: payload });
      if (showToast) showToast(`Recipe saved & activated for ${activeEditorItem.name}!`, 'success');

      // Update local history
      setRecipeHistory(prev => [
        {
          date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          itemName: activeEditorItem.name,
          count: payload.length
        },
        ...prev.slice(0, 4)
      ]);

      setActiveEditorItem(null);
      loadData();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Save recipe failed:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to save recipe.', 'error');
    }
  };

  // Bulk Import Presets


  // Duplicate Recipe Handler
  const handleConfirmDuplicate = async () => {
    if (!duplicateSourceItem || !duplicateTargetId) return;
    const sourceIngs = recipesMap[duplicateSourceItem.id] || [];
    if (!sourceIngs.length) {
      if (showToast) showToast('Source item has no recipe ingredients to duplicate.', 'error');
      return;
    }

    try {
      const payload = sourceIngs.map(i => ({
        inventoryItemId: i.inventoryItemId,
        quantity: i.quantity,
        unit: i.unit
      }));

      await api.post(`/inventory/recipes/${duplicateTargetId}`, { ingredients: payload });
      const targetObj = menuItems.find(m => m.id === parseInt(duplicateTargetId, 10));
      if (showToast) showToast(`Duplicated recipe to ${targetObj?.name || 'target item'}!`, 'success');

      setDuplicateSourceItem(null);
      setDuplicateTargetId('');
      loadData();
    } catch (err) {
      console.error('Duplicate recipe error:', err);
      if (showToast) showToast('Failed to duplicate recipe.', 'error');
    }
  };

  // Calculations for current editor modal
  const editorCalculatedCost = useMemo(() => {
    return editorIngredients.reduce((sum, ing) => {
      const inv = inventory.find(i => i.id === ing.inventoryItemId);
      if (!inv || !inv.costPrice) return sum;
      const convertedQty = convertUnit(ing.quantity, ing.unit, inv.unit);
      return sum + (convertedQty * (inv.costPrice || 0));
    }, 0);
  }, [editorIngredients, inventory]);

  const editorFoodCostPercent = useMemo(() => {
    if (!activeEditorItem || !activeEditorItem.price || activeEditorItem.price <= 0) return 0;
    return ((editorCalculatedCost / activeEditorItem.price) * 100).toFixed(1);
  }, [editorCalculatedCost, activeEditorItem]);

  return (
    <div className="space-y-6">

      {/* 1. Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-card p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="inline-flex p-2 rounded-2xl bg-orange-500/10 text-orange-400"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
            Recipe Builder
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Create recipes that automatically connect menu items to inventory ingredients.
          </p>
        </div>

        <div className="flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-1 lg:w-auto lg:shrink-0 lg:overflow-visible">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedItemIds.size} className={`${mobileActionWidth} h-10 justify-center px-1 text-[10px] md:h-auto md:w-auto md:px-3 md:py-2.5 md:text-xs`} mobileLabel="Select" mobileActiveLabel="Done" />
          {hasSelectedRecipes && (
            <button
              onClick={handleOpenBulkDelete}
              className={`${mobileActionWidth} flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400 shadow-sm transition-all hover:bg-rose-500/20 cursor-pointer animate-fade-in md:h-auto md:w-auto md:gap-2 md:px-3.5 md:py-2.5 md:text-xs`}
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
              <span><span className="md:hidden">Clear</span><span className="hidden md:inline">Clear Selected ({selectedItemIds.size})</span></span>
            </button>
          )}

          <button
            onClick={() => {
              if (menuItems.length > 0) handleOpenEditor(menuItems[0]);
            }}
            disabled={menuItems.length === 0}
            className={`${mobileActionWidth} flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-1 text-[10px] font-bold text-white shadow-lg transition-all cursor-pointer disabled:opacity-50 md:h-auto md:w-auto md:gap-2 md:px-4 md:py-2.5 md:text-xs`}
          >
            <Plus className="h-3.5 w-3.5 shrink-0 stroke-[3] md:h-4 md:w-4" />
            <span><span className="md:hidden">New</span><span className="hidden md:inline">New Recipe</span></span>
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-[var(--text-muted)]">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Total Menu Items</span>
            <Utensils className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-black text-[var(--text-main)] font-mono">{summary.totalItems}</div>
          <div className="text-[10px] text-[var(--text-muted)]">POS saleable items</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-[var(--text-muted)]">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Ready Recipes</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{summary.readyCount}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Active for auto-deduction</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-[var(--text-muted)]">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Missing Items</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{summary.missingCount}</div>
          <div className="text-[10px] text-[var(--text-muted)]">Requires inventory mapping</div>
        </div>

        <div className="bg-[var(--card-bg)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-1">
          <div className="flex justify-between items-center text-[var(--text-muted)]">
            <span className="text-[10px] font-extrabold uppercase tracking-wider">Avg Food Cost %</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">{summary.avgFoodCost}%</div>
          <div className="text-[10px] text-[var(--text-muted)]">Target: 30% - 35%</div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipe, menu item, ingredient..."
            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
          />
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-bold">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Category:</span>
            <ThemedSelect
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] text-xs rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="ALL">All Categories ({menuItems.length})</option>
              {categories.map((cat, i) => (
                <option key={i} value={cat}>{cat}</option>
              ))}
            </ThemedSelect>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-bold">
            <span>Status:</span>
            <ThemedSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-main)] text-xs rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="Ready">Ready</option>
              <option value="Missing Items">Missing Items</option>
              <option value="Draft">Draft</option>
            </ThemedSelect>
          </div>
        </div>
      </div>

      {/* 4. Recipe Table / List */}
      <div className="glass-table overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-400" />
            <p>Loading POS menu items & recipes...</p>
          </div>
        ) : menuItems.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-2">
            <Utensils className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
            <p className="font-bold text-[var(--text-main)] text-sm">No menu items found</p>
            <p className="text-[var(--text-muted)]">Add menu items in POS Menu Items section first to create recipes.</p>
          </div>
        ) : filteredMenuItems.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] text-xs space-y-2">
            <Utensils className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
            <p className="font-bold text-[var(--text-main)]">No recipes found matching your filters.</p>
            <p>Try searching for another term or select "All Categories".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="inventory-single-row-table w-full min-w-[960px] text-left text-xs divide-y divide-[var(--border-color)]">
              <thead className=" text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)]" style={{ background: 'var(--table-header-bg)' }}>
                <tr>
                  {selectionMode && <th className="py-3.5 pl-4 pr-2 w-10 text-center">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-rose-500 cursor-pointer"
                      checked={filteredMenuItems.length > 0 && selectedItemIds.size === filteredMenuItems.length}
                      onChange={toggleSelectAll}
                    />
                  </th>}
                  <th className="py-3.5 px-4 min-w-[240px]">Menu Item</th>
                  <th className="py-3.5 px-4 min-w-[120px]">Category</th>
                  <th className="py-3.5 px-4 text-center min-w-[110px]">Ingredients</th>
                  <th className="py-3.5 px-4 text-right min-w-[120px]">Selling Price</th>
                  <th className="py-3.5 px-4 text-right min-w-[120px]">Recipe Cost</th>
                  <th className="py-3.5 px-4 text-center min-w-[110px]">Food Cost %</th>
                  <th className="py-3.5 px-4 text-center min-w-[120px]">Status</th>
                  <th className="py-3.5 px-4 text-right min-w-[130px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] font-medium text-[var(--text-main)]">
                {filteredMenuItems.map((item) => {
                  const ings = recipesMap[item.id] || [];
                  const cost = calculateItemRecipeCost(item.id);
                  const foodCostPct = item.price > 0 && cost > 0 ? ((cost / item.price) * 100).toFixed(1) : null;
                  const status = getItemStatus(item.id);

                  const isSelected = selectedItemIds.has(item.id);
                  return (
                    <tr key={item.id} className={`hover:bg-[var(--bg-color)]/50 transition-colors ${isSelected ? 'bg-rose-500/5' : ''}`}>
                      {selectionMode && <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-rose-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.id)}
                        />
                      </td>}
                      {/* Item Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center font-bold text-orange-400 shrink-0 overflow-hidden">
                            {item.imageUrl ? (
                              <img
                                src={resolveImageUrl(item.imageUrl)}
                                alt={item.name}
                                className="w-full h-full object-cover rounded-xl"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  if (e.currentTarget.parentElement) {
                                    e.currentTarget.parentElement.innerText = '🍔';
                                  }
                                }}
                              />
                            ) : (
                              '🍔'
                            )}
                          </div>
                          <div>
                            <span className="font-extrabold text-[var(--text-main)] block">{item.name}</span>
                            {item.description && (
                              <span className="text-[10px] text-[var(--text-muted)] line-clamp-1 max-w-xs font-normal">
                                {item.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-color)] text-[10px] font-bold text-[var(--text-muted)] border border-[var(--border-color)]">
                          {item.category || 'General'}
                        </span>
                      </td>

                      {/* Ingredients Count */}
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${ings.length > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-slate-500/10 text-[var(--text-muted)]'}`}>
                          {ings.length} Items
                        </span>
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-4 font-mono font-bold text-[var(--text-main)] text-right">
                        Rs. {Number(item.price || 0).toLocaleString()}
                      </td>

                      {/* Recipe Cost */}
                      <td className="py-3 px-4 font-mono font-bold text-amber-500 dark:text-amber-400 text-right">
                        {cost > 0 ? `Rs. ${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </td>

                      {/* Food Cost % */}
                      <td className="py-3 px-4 font-mono font-bold text-center">
                        {foodCostPct ? (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${parseFloat(foodCostPct) > 40 ? 'text-rose-500 bg-rose-500/10 border border-rose-500/20' : 'text-emerald-500 bg-emerald-500/10 border border-emerald-500/20'}`}>
                            {foodCostPct}%
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {status === 'Ready' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                        {status === 'Missing Items' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Missing Items
                          </span>
                        )}
                        {status === 'Draft' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[var(--text-muted)] bg-slate-500/10 border border-[var(--border-color)] px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" /> Draft
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                        <button
                          onClick={() => setDuplicateSourceItem(item)}
                          title="Duplicate Recipe to Another Menu Item"
                          className="p-1.5 rounded-lg bg-[var(--bg-color)] hover:bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-orange-400 border border-[var(--border-color)] transition-colors cursor-pointer icon-btn"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenEditor(item)}
                          className="px-3 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>{status === 'Missing Items' ? 'Fix' : 'Edit'}</span>
                        </button>

                        {(recipesMap[item.id] || []).length > 0 && (
                          <button
                            onClick={() => handleOpenSingleDelete(item)}
                            title="Clear recipe ingredients"
                            className="p-1.5 rounded-lg bg-[var(--bg-color)] hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-400 border border-[var(--border-color)] hover:border-rose-500/30 transition-colors cursor-pointer icon-btn"
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
          isLoading={isDeleting}
          title={itemToDelete ? 'Clear Recipe' : `Clear ${selectedItemIds.size} Recipes`}
          description={
            itemToDelete
              ? `This will remove all recipe ingredients for "${itemToDelete.name}". The menu item itself will NOT be deleted.`
              : `This will remove recipe ingredients for ${selectedItemIds.size} selected menu items. The menu items themselves will NOT be deleted.`
          }
          confirmText="Clear Recipe"
          itemName={itemToDelete?.name || `${selectedItemIds.size} recipes`}
        />
      )}

      {/* 5. FULL RECIPE EDITOR MODAL — Portal to document.body for true screen centering */}
      {activeEditorItem && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-[var(--glass-bg-subtle)] p-2 backdrop-blur-md sm:p-4">
          <div className="my-auto flex max-h-[96dvh] min-h-0 w-full min-w-0 max-w-3xl flex-col space-y-3 overflow-hidden rounded-3xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3 shadow-2xl animate-scale-up sm:max-h-[92vh] sm:space-y-4 sm:p-6">

            {/* Modal Header */}
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--border-color)] pb-3.5">
              <div className="flex min-w-0 items-start gap-2 sm:items-center sm:gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-lg sm:h-10 sm:w-10 sm:text-xl overflow-hidden">
                  {activeEditorItem.imageUrl ? (
                    <img
                      src={resolveImageUrl(activeEditorItem.imageUrl)}
                      alt={activeEditorItem.name}
                      className="w-full h-full object-cover rounded-2xl"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.innerText = '🍕';
                        }
                      }}
                    />
                  ) : (
                    '🍕'
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-black text-[var(--text-main)] font-display sm:text-base">
                    Recipe: {activeEditorItem.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--text-muted)] sm:gap-3 sm:text-[11px]">
                    <span>Category: <strong className="text-[var(--text-main)]">{activeEditorItem.category || 'General'}</strong></span>
                    <span className="hidden sm:inline">•</span>
                    <span>Selling Price: <strong className="text-orange-400">Rs. {activeEditorItem.price}</strong></span>
                    {activeEditorItem.prepTime && (
                      <span>
                        <span className="mr-2 hidden sm:inline">•</span>
                        <span>Prep Time: <strong>{activeEditorItem.prepTime} min</strong></span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveEditorItem(null)}
                className="shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--text-main)] sm:p-2 icon-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Content */}
            <form onSubmit={handleSaveRecipe} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto pr-1 text-xs">

              {/* Menu Item Step Selector */}
              <div className="bg-[var(--bg-color)]/60 border border-[var(--border-color)] p-3 rounded-2xl space-y-2">
                <label className="block font-extrabold text-[var(--text-main)] uppercase tracking-wider text-[10px]">
                  Step 1 — Menu Item Selection
                </label>
                <ThemedSelect
                  value={activeEditorItem.id}
                  onChange={(e) => {
                    const sel = menuItems.find(m => m.id === parseInt(e.target.value, 10));
                    if (sel) handleOpenEditor(sel);
                  }}
                  className="w-full px-3.5 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                >
                  {menuItems.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} — Rs.{m.price} ({m.category || 'General'})
                    </option>
                  ))}
                </ThemedSelect>
              </div>

              {/* Ingredients Header + AI Suggest Button */}
              <div className="flex flex-col items-start justify-between gap-2 pt-1 sm:flex-row sm:items-center">
                <div>
                  <h4 className="font-black text-[var(--text-main)] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span>📦 Recipe Ingredients</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-normal lowercase">({editorIngredients.length} ingredients mapped)</span>
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={handleAiSuggest}
                  disabled={isAiLoading}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 text-purple-300 border border-purple-500/30 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-purple-500/10"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-pink-400 ${isAiLoading ? 'animate-spin' : ''}`} />
                  <span>{isAiLoading ? 'AI Analyzing...' : 'AI Suggest Ingredients'}</span>
                </button>
              </div>

              {/* Ingredients Table */}
              <div className="bg-[var(--bg-color)]/40 border border-[var(--border-color)] rounded-2xl overflow-hidden divide-y divide-[var(--border-color)]">
                {editorIngredients.length === 0 ? (
                  <div className="p-6 text-center text-[var(--text-muted)] space-y-1">
                    <p className="font-bold">No ingredients added to this recipe yet.</p>
                    <p className="text-[11px]">Search & select from inventory below or click "AI Suggest Ingredients".</p>
                  </div>
                ) : (
                  editorIngredients.map((ing, idx) => {
                    const inv = inventory.find(i => i.id === ing.inventoryItemId);
                    const invUnit = inv?.unit || 'PCS';
                    const unitCost = inv?.costPrice || 0;
                    const convertedQty = convertUnit(ing.quantity, ing.unit, invUnit);
                    const lineCost = convertedQty * unitCost;

                    return (
                      <div key={idx} className="flex min-w-0 flex-col items-start justify-between gap-3 p-3 transition-colors hover:bg-[var(--bg-color)]/80 sm:flex-row sm:items-center">

                        {/* Ingredient Name & Inventory Status */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-[var(--text-main)] text-xs">{inv?.name || `ID #${ing.inventoryItemId}`}</span>
                            {ing.isAiSuggested && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                AI Suggested
                              </span>
                            )}
                            {!inv && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                <AlertTriangle className="w-2.5 h-2.5" /> Missing in Inventory
                              </span>
                            )}
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)] font-mono">
                            <span>Catalog Unit: <strong>{invUnit}</strong></span>
                            <span>•</span>
                            <span>Unit Cost: <strong>Rs.{unitCost} / {invUnit}</strong></span>
                          </div>
                        </div>

                        {/* Quantity & Unit Input */}
                        <div className="grid w-full min-w-0 grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:items-center sm:gap-2">
                          <div className="min-w-0">
                            <span className="block text-[9px] text-[var(--text-muted)] font-extrabold uppercase mb-0.5">Quantity Used</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={ing.quantity}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditorIngredients(prev => {
                                  const updated = [...prev];
                                  updated[idx].quantity = val;
                                  return updated;
                                });
                              }}
                              placeholder="0"
                              className="w-full min-w-0 px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 sm:w-24"
                            />
                          </div>

                          <div className="min-w-0">
                            <span className="block text-[9px] text-[var(--text-muted)] font-extrabold uppercase mb-0.5">Unit</span>
                            <ThemedSelect
                              value={ing.unit}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditorIngredients(prev => {
                                  const updated = [...prev];
                                  updated[idx].unit = val;
                                  return updated;
                                });
                              }}
                              className="w-full min-w-0 px-2 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer sm:w-auto"
                            >
                              <option value="KG">KG</option>
                              <option value="G">Grams (G)</option>
                              <option value="L">Liters (L)</option>
                              <option value="ML">ML</option>
                              <option value="PCS">PCS</option>
                              <option value="DOZEN">DOZEN</option>
                              <option value="PACK">PACK</option>
                            </ThemedSelect>
                          </div>

                          {/* Calculated Cost */}
                          <div className="col-span-2 flex min-w-0 items-end justify-between gap-2 sm:w-24 sm:shrink-0 sm:justify-end sm:text-right">
                            <span className="block text-[9px] text-[var(--text-muted)] font-extrabold uppercase mb-0.5">Est. Cost</span>
                            <span className="font-mono font-bold text-amber-400 text-xs">
                              Rs.{lineCost.toFixed(2)}
                            </span>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditorIngredients(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="col-start-2 shrink-0 justify-self-end rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-rose-500/10 hover:text-rose-400 cursor-pointer sm:mt-3 icon-btn"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>

              {/* Add Ingredient Selector */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-extrabold text-[var(--text-main)] uppercase tracking-wider text-[10px]">
                    + Add Ingredient from Inventory Catalog
                  </label>

                  {onOpenAddIngredientModal && (
                    <button
                      type="button"
                      onClick={onOpenAddIngredientModal}
                      className="text-[10px] text-orange-400 hover:underline font-bold flex items-center gap-1"
                    >
                      <span>Item missing? Add to Inventory</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={ingredientSearch}
                    onFocus={() => setShowIngredientDropdown(true)}
                    onChange={(e) => {
                      setIngredientSearch(e.target.value);
                      setShowIngredientDropdown(true);
                    }}
                    placeholder="Search ingredient catalog (e.g. Chicken, Cheese, Bun, Oil)..."
                    className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
                  />
                  <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-muted)]" />
                </div>

                {/* Dropdown Suggestions */}
                {showIngredientDropdown && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-[var(--border-color)]">
                    {(() => {
                      const q = ingredientSearch.toLowerCase().trim();
                      const existingIds = editorIngredients.map(i => i.inventoryItemId);
                      const matches = inventory.filter(i => {
                        const notMapped = !existingIds.includes(i.id);
                        if (!q) return notMapped;
                        const nameMatch = i.name.toLowerCase().includes(q);
                        const catMatch = i.category && i.category.toLowerCase().includes(q);
                        return notMapped && (nameMatch || catMatch);
                      });

                      if (matches.length === 0) {
                        return (
                          <div className="p-3.5 text-center text-[var(--text-muted)] text-[11px]">
                            {q ? `No inventory item matching "${ingredientSearch}".` : 'All catalog ingredients are already added to this recipe.'}
                          </div>
                        );
                      }

                      return matches.slice(0, 10).map((inv) => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => handleAddIngredientToEditor(inv)}
                          className="group flex w-full min-w-0 flex-col gap-1 px-3.5 py-2.5 text-left transition-colors hover:bg-orange-500/10 cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <span className="font-bold text-[var(--text-main)] group-hover:text-orange-400">{inv.name}</span>
                            <span className="ml-2 text-[10px] text-[var(--text-muted)]">({inv.category || 'General'})</span>
                          </div>

                          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px]">
                            <span className="font-mono text-[var(--text-muted)]">Stock: {inv.stockLevel} {inv.unit}</span>
                            <span className="px-2 py-0.5 rounded font-black text-orange-400 bg-[var(--bg-color)] border border-orange-500/20">
                              Rs.{inv.costPrice} / {inv.unit}
                            </span>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Recipe Yield & Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                    Recipe Yield
                  </label>
                  <input
                    type="text"
                    value={yieldText}
                    onChange={(e) => setYieldText(e.target.value)}
                    placeholder="e.g. 1 Serving, 1 Burger, 8 Pieces..."
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                    Preparation Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    value={prepInstructions}
                    onChange={(e) => setPrepInstructions(e.target.value)}
                    placeholder="Optional preparation steps..."
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)]"
                  />
                </div>
              </div>

              {/* Recipe Cost Summary Box */}
              <div className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 p-3 sm:flex-row sm:items-center sm:p-4">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider block">Recipe Financial Summary</span>
                  <div className="mt-2 grid grid-cols-2 gap-3 font-mono sm:flex sm:items-center sm:gap-4">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)]">Selling Price:</span>
                      <strong className="text-xs text-[var(--text-main)] block">Rs. {activeEditorItem.price}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-[var(--text-muted)]">Calculated Recipe Cost:</span>
                      <strong className="text-xs text-amber-400 block">Rs. {editorCalculatedCost.toFixed(2)}</strong>
                    </div>

                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] font-bold">Food Cost %:</span>
                      <strong className={`text-xs block font-black ${parseFloat(editorFoodCostPercent) > 40 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {editorFoodCostPercent}%
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-left sm:text-right">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] block">Inventory Mapped</span>
                  <span className="text-sm font-black text-emerald-400 font-mono">
                    {editorIngredients.length} / {editorIngredients.length} Items
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="sticky bottom-0 flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border-color)] bg-[var(--card-bg)]/95 pt-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={() => setActiveEditorItem(null)}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] px-4 py-2.5 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--card-bg)] cursor-pointer sm:w-auto"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer sm:w-auto"
                >
                  Save & Activate Recipe
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 6. DUPLICATE RECIPE MODAL — Portal to document.body for true screen centering */}
      {duplicateSourceItem && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-scale-up">
            <h3 className="text-base font-black text-[var(--text-main)] font-display flex items-center gap-2">
              <Copy className="w-5 h-5 text-orange-400" />
              Duplicate Recipe
            </h3>

            <p className="text-xs text-[var(--text-muted)]">
              Copy recipe ingredients from <strong className="text-[var(--text-main)]">{duplicateSourceItem.name}</strong> to another POS menu item.
            </p>

            <div>
              <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                Target Menu Item
              </label>
              <ThemedSelect
                value={duplicateTargetId}
                onChange={(e) => setDuplicateTargetId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="">Select target menu item...</option>
                {menuItems
                  .filter(m => m.id !== duplicateSourceItem.id)
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} (Rs. {m.price})
                    </option>
                  ))}
              </ThemedSelect>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateSourceItem(null)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-color)] text-xs font-bold text-[var(--text-muted)] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDuplicate}
                disabled={!duplicateTargetId}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg cursor-pointer"
              >
                Confirm Duplicate
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default AdminRecipeBuilderView;


