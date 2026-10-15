import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  X,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  RefreshCw,
  Layers,
} from 'lucide-react';
import api from '../../../services/api';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

const PRESET_UNITS = [
  '250 gm',
  '500 gm',
  '1 kg',
  '1 No.',
  '1 Pc',
  'Half',
  'Full',
  '200 ml',
  '500 ml',
  '1 Ltr',
  'Regular',
  'Large',
  'Plate',
  'Cup',
  'Glass',
];

const MASTER_CATEGORIES = [
  'Lunch',
  'Breakfast',
  'Fast Food',
  'Refreshment',
  'Fried Chicken',
  'Wraps',
  'Pizza',
  'Beverages',
  'Burgers',
  'Sandwiches',
  'Pasta',
  'Salads',
  'Beverages & Shakes',
  'Fries',
  'Desserts & Cakes',
  'Rice & Biryani',
];

const resolveImageUrl = (url) => {
  if (!url || typeof url !== 'string' || url.trim() === '') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `http://${host}:5001${trimmed}`;
  }
  return trimmed;
};

const AdminMenuView = ({ inventory = [], onRefresh, showToast }) => {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'AVAILABLE', 'LOW_STOCK', 'DISABLED'
  const [showItemModal, setShowItemModal] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [selectedMenuItemIds, setSelectedMenuItemIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);

  // Status Metrics
  const metrics = useMemo(() => {
    const total = inventory.length;
    const available = inventory.filter((i) => i.isAvailable !== false && i.isActive !== false).length;
    const lowStock = inventory.filter((i) => (i.stock ?? 50) <= 10 && (i.stock ?? 50) > 0).length;
    const disabled = inventory.filter((i) => i.isAvailable === false || i.isActive === false || (i.stock ?? 50) <= 0).length;
    return { total, available, lowStock, disabled };
  }, [inventory]);

  // Group items by groupName or name and apply filters
  const filteredItems = useMemo(() => {
    return inventory.filter((item) => {
      // 1. Category Filter
      const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;

      // 2. Search Filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        item.name.toLowerCase().includes(searchLower) ||
        (item.groupName && item.groupName.toLowerCase().includes(searchLower)) ||
        (item.description && item.description.toLowerCase().includes(searchLower));

      // 3. Status Filter
      const isAvailable = item.isAvailable !== false && item.isActive !== false;
      const isLowStock = (item.stock ?? 50) <= 10 && (item.stock ?? 50) > 0;
      const isDisabled = !isAvailable || (item.stock ?? 50) <= 0;

      let matchesStatus = true;
      if (statusFilter === 'AVAILABLE') matchesStatus = isAvailable;
      else if (statusFilter === 'LOW_STOCK') matchesStatus = isLowStock;
      else if (statusFilter === 'DISABLED') matchesStatus = isDisabled;

      return matchesCat && matchesSearch && matchesStatus;
    });
  }, [inventory, selectedCategory, searchTerm, statusFilter]);

  const allFilteredMenuItemsSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedMenuItemIds.has(item.id));

  // All available category options for selection in Add/Edit form: master list + custom categories in inventory
  const categoryOptions = useMemo(() => {
    const opts = [...MASTER_CATEGORIES];
    inventory.forEach((item) => {
      if (item.category && !opts.includes(item.category)) {
        opts.push(item.category);
      }
    });
    return opts;
  }, [inventory]);

  // Categories strip filter bar: ONLY categories that actually have items in inventory (plus ALL)
  const categories = useMemo(() => {
    const presentCats = new Set();
    inventory.forEach((item) => {
      if (item.category) {
        presentCats.add(item.category);
      }
    });
    return ['ALL', ...Array.from(presentCats)];
  }, [inventory]);

  const existingGroups = useMemo(() => {
    const groups = new Set();
    inventory.forEach((item) => {
      const group = item.groupName || item.name;
      if (group) groups.add(group);
    });
    return Array.from(groups).sort();
  }, [inventory]);

  const filteredGrouped = useMemo(() => {
    const groups = {};
    filteredItems.forEach((item) => {
      const key = item.groupName || item.name;
      if (!groups[key]) groups[key] = { groupKey: key, variants: [] };
      groups[key].variants.push(item);
    });
    return Object.values(groups);
  }, [filteredItems]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'Lunch',
    groupName: '',
    customGroup: '',
    prepTime: '10',
    description: '',
    stock: '50',
    isAvailable: true,
    imageUrl: '',
    variants: [
      { id: null, unit: '250 gm', customUnit: '', price: '' }
    ]
  });

  const [imageMode, setImageMode] = useState('url'); // 'url' | 'file'
  const [customCategory, setCustomCategory] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [pendingBase64, setPendingBase64] = useState(null);
  const [imageError, setImageError] = useState('');

  const handleOpenAdd = (defaultGroup = null) => {
    let group = defaultGroup || '';
    let category = 'Lunch';
    let description = '';
    let imageUrl = '';
    let prepTime = '10';
    let stock = '50';

    if (defaultGroup) {
      const existing = inventory.find(i => (i.groupName || i.name) === defaultGroup);
      if (existing) {
        category = existing.category || 'Lunch';
        description = existing.description || '';
        imageUrl = existing.imageUrl || '';
        prepTime = String(existing.prepTime ?? '10');
        stock = String(existing.stock ?? '50');
      }
    }

    setFormData({
      name: group || '',
      category,
      groupName: existingGroups.includes(group) ? group : (group ? 'CUSTOM' : ''),
      customGroup: existingGroups.includes(group) ? '' : group,
      prepTime,
      description,
      stock,
      isAvailable: true,
      imageUrl,
      variants: [
        { id: null, unit: '250 gm', customUnit: '', price: '' }
      ]
    });

    setImageMode(imageUrl && !imageUrl.startsWith('data:') ? 'url' : 'url');
    setCustomCategory('');
    setImagePreview(imageUrl || null);
    setPendingBase64(null);
    setImageError('');
    setShowItemModal(true);
  };

  const handleOpenEditGroup = (groupKey, variantsList) => {
    const primary = variantsList[0];
    const isCustomGrp = !existingGroups.includes(groupKey);
    const itemCategory = primary.category || 'Lunch';
    const isKnownCat = categoryOptions.includes(itemCategory);

    setFormData({
      name: primary.name || groupKey,
      category: isKnownCat ? itemCategory : 'CUSTOM',
      groupName: isCustomGrp ? 'CUSTOM' : groupKey,
      customGroup: isCustomGrp ? groupKey : '',
      prepTime: String(primary.prepTime ?? '10'),
      description: primary.description || '',
      stock: String(primary.stock ?? '50'),
      isAvailable: primary.isAvailable !== false && primary.isActive !== false,
      imageUrl: primary.imageUrl || '',
      variants: variantsList.map(v => ({
        id: v.id,
        unit: PRESET_UNITS.includes(v.unit) ? v.unit : 'CUSTOM',
        customUnit: PRESET_UNITS.includes(v.unit) ? '' : v.unit,
        price: String(v.price ?? ''),
      }))
    });

    setImageMode(primary.imageUrl && !primary.imageUrl.startsWith('data:') ? 'url' : 'file');
    setCustomCategory(isKnownCat ? '' : itemCategory);
    setImagePreview(primary.imageUrl || null);
    setPendingBase64(null);
    setImageError('');
    setShowItemModal(true);
  };

  const handleOpenEditSingleVariant = (variantItem) => {
    const groupKey = variantItem.groupName || variantItem.name;
    const isCustomGrp = !existingGroups.includes(groupKey);
    const itemCategory = variantItem.category || 'Lunch';
    const isKnownCat = categoryOptions.includes(itemCategory);

    setFormData({
      name: variantItem.name || groupKey,
      category: isKnownCat ? itemCategory : 'CUSTOM',
      groupName: isCustomGrp ? 'CUSTOM' : groupKey,
      customGroup: isCustomGrp ? groupKey : '',
      prepTime: String(variantItem.prepTime ?? '10'),
      description: variantItem.description || '',
      stock: String(variantItem.stock ?? '50'),
      isAvailable: variantItem.isAvailable !== false && variantItem.isActive !== false,
      imageUrl: variantItem.imageUrl || '',
      variants: [
        {
          id: variantItem.id,
          unit: PRESET_UNITS.includes(variantItem.unit) ? variantItem.unit : 'CUSTOM',
          customUnit: PRESET_UNITS.includes(variantItem.unit) ? '' : (variantItem.unit || ''),
          price: String(variantItem.price ?? ''),
        }
      ]
    });

    setImageMode(variantItem.imageUrl && !variantItem.imageUrl.startsWith('data:') ? 'url' : 'file');
    setCustomCategory(isKnownCat ? '' : itemCategory);
    setImagePreview(variantItem.imageUrl || null);
    setPendingBase64(null);
    setImageError('');
    setShowItemModal(true);
  };

  // Variant array manipulation
  const handleAddVariantRow = () => {
    setFormData(prev => ({
      ...prev,
      variants: [
        ...prev.variants,
        { id: null, unit: '500 gm', customUnit: '', price: '' }
      ]
    }));
  };

  const handleRemoveVariantRow = (index) => {
    if (formData.variants.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
  };

  const handleVariantChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.variants];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, variants: updated };
    });
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageError('');
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      const msg = 'Invalid file format. Only JPG, JPEG, PNG, and WEBP formats are supported.';
      setImageError(msg);
      if (showToast) showToast(msg, 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const msg = 'File size exceeds maximum allowed limit of 5MB.';
      setImageError(msg);
      if (showToast) showToast(msg, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setPendingBase64(base64String);
      setImagePreview(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (urlStr) => {
    setFormData((prev) => ({ ...prev, imageUrl: urlStr }));
    setPendingBase64(null);
    setImagePreview(urlStr || null);
  };

  const handleRemoveImage = () => {
    setPendingBase64(null);
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, imageUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let finalImageUrl = formData.imageUrl;

      if (pendingBase64) {
        const uploadRes = await api.post('/menu/upload-image', {
          imageBase64: pendingBase64,
        });
        finalImageUrl = uploadRes.data.imageUrl;
      }

      const effectiveCategory = formData.category === 'CUSTOM' ? customCategory.trim() : formData.category.trim();
      const effectiveGroupName = formData.groupName === 'CUSTOM'
        ? formData.customGroup.trim()
        : (formData.groupName || formData.name.trim());
      const effectiveName = formData.name.trim() || effectiveGroupName;

      // Process all variant entries in parallel or sequence
      const promises = formData.variants.map(async (v) => {
        const effectiveUnit = v.unit === 'CUSTOM' ? v.customUnit.trim() : v.unit;
        const payload = {
          name: effectiveName,
          category: effectiveCategory,
          price: parseFloat(v.price),
          unit: effectiveUnit || '1 No.',
          groupName: effectiveGroupName,
          prepTime: parseInt(formData.prepTime, 10) || 10,
          description: formData.description?.trim() || null,
          stock: parseInt(formData.stock, 10) || 50,
          isActive: formData.isAvailable,
          imageUrl: finalImageUrl || null,
        };

        if (v.id) {
          return api.put(`/menu/${v.id}`, payload);
        } else {
          return api.post('/menu', payload);
        }
      });

      await Promise.all(promises);

      if (showToast) showToast(`Saved "${effectiveGroupName}" with ${formData.variants.length} variant(s)!`);

      setShowItemModal(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Save menu item error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to save menu items.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      const nextState = !(item.isAvailable !== false && item.isActive !== false);
      await api.put(`/menu/${item.id}`, {
        isActive: nextState,
      });
      if (showToast) showToast(`"${item.name}" availability updated to ${nextState ? 'Available' : 'Unavailable'}!`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      if (showToast) showToast('Failed to update availability', 'error');
    }
  };

  const handleToggleGroupAvailability = async (variantsList) => {
    try {
      const anyActive = variantsList.some((v) => v.isAvailable !== false && v.isActive !== false);
      const targetState = !anyActive;

      const promises = variantsList.map((v) =>
        api.put(`/menu/${v.id}`, { isActive: targetState })
      );
      await Promise.all(promises);

      const groupName = variantsList[0]?.groupName || variantsList[0]?.name || 'Item';
      if (showToast) {
        showToast(`"${groupName}" set to ${targetState ? 'Available' : 'Unavailable'}!`);
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Toggle group availability error:', err);
      if (showToast) showToast('Failed to update group availability', 'error');
    }
  };

  const toggleSelectMenuItem = (id) => {
    setSelectedMenuItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = (variants) => {
    setSelectedMenuItemIds((prev) => {
      const next = new Set(prev);
      const allSelected = variants.every((v) => next.has(v.id));
      variants.forEach((v) => {
        if (allSelected) next.delete(v.id);
        else next.add(v.id);
      });
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedMenuItemIds.size === 0) return;
    setIsBulkDeleting(true);
    setDeleteConfirmItem(null);
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedMenuItemIds(new Set());
    setSelectionMode((active) => !active);
  };

  const handleConfirmDelete = async () => {
    setDeleteLoading(true);
    try {
      if (isBulkDeleting) {
        const res = await api.delete('/menu/bulk', {
          data: { ids: Array.from(selectedMenuItemIds) },
        });
        if (showToast) showToast(res.data?.message || 'Menu items processed.');
        setSelectedMenuItemIds(new Set());
        setIsBulkDeleting(false);
      } else if (deleteConfirmItem) {
        await api.delete(`/menu/${deleteConfirmItem.id}`);
        if (showToast) showToast(`Menu item "${deleteConfirmItem.name}" deleted successfully!`);
        setDeleteConfirmItem(null);
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete menu item error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to delete menu item.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-6 rounded-2xl shadow-xl">
        <div>
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Menu Catalog Management</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Control pricing, dish images, preparation times, categories, and customer availability.</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedMenuItemIds.size} />
          {selectionMode && <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-muted)] text-xs font-bold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allFilteredMenuItemsSelected}
              disabled={filteredItems.length === 0}
              onChange={() => setSelectedMenuItemIds((current) => {
                const next = new Set(current);
                if (allFilteredMenuItemsSelected) filteredItems.forEach((item) => next.delete(item.id));
                else filteredItems.forEach((item) => next.add(item.id));
                return next;
              })}
              className="accent-orange-500"
              aria-label="Select all visible menu items"
            />
            <span>{allFilteredMenuItemsSelected ? 'Clear visible selection' : `Select visible (${filteredItems.length})`}</span>
          </label>}
          {selectionMode && selectedMenuItemIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedMenuItemIds.size})</span>
            </button>
          )}

          <button
            onClick={() => handleOpenAdd()}
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-md flex items-center space-x-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Menu Item</span>
          </button>
        </div>
      </div>

      {/* SEARCH BAR & CATEGORY / STOCK FILTERS STRIP */}
      <div className="bg-[var(--card-bg)]/40 border border-[var(--border-color)] p-4 rounded-2xl space-y-3.5 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          {/* Search Bar Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search menu item name (e.g. Biryani, Burger)..."
              className="w-full pl-10 pr-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:border-orange-500 transition-colors font-medium"
            />
          </div>

          {/* Stock / Status Quick Filters */}
          <div className="flex items-center space-x-1.5 bg-[var(--bg-color)] p-1 rounded-xl border border-[var(--border-color)] overflow-x-auto custom-scrollbar">
            {[
              { id: 'ALL', label: `All Items (${metrics.total})` },
              { id: 'AVAILABLE', label: `Available (${metrics.available})` },
              { id: 'LOW_STOCK', label: `Low Stock (${metrics.lowStock})` },
              { id: 'DISABLED', label: `Disabled (${metrics.disabled})` },
            ].map((flt) => (
              <button
                key={flt.id}
                onClick={() => setStatusFilter(flt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === flt.id
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                {flt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pt-1 custom-scrollbar">
          <span className="text-[10px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider mr-1 shrink-0">
            Categories:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer border ${
                selectedCategory === cat
                  ? 'bg-orange-500/20 text-orange-500 border-orange-500/40 shadow-sm'
                  : 'bg-[var(--bg-color)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Catalog Grid — Grouped by variant */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
        {filteredGrouped.map(({ groupKey, variants }) => {
          const primaryItem = variants[0];
          const allActive = variants.every((v) => v.isAvailable !== false && v.isActive !== false);
          const someActive = variants.some((v) => v.isAvailable !== false && v.isActive !== false);

          return (
            <div
              key={groupKey}
              className={`bg-[var(--card-bg)]/40 border rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between h-full transition-all ${
                allActive ? 'border-[var(--border-color)]' : someActive ? 'border-amber-500/30' : 'border-rose-500/30 opacity-70'
              }`}
            >
              {/* Image Header */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
                {primaryItem.imageUrl ? (
                  <img
                    src={resolveImageUrl(primaryItem.imageUrl)}
                    alt={groupKey}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&auto=format&fit=crop&q=80';
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] bg-slate-100 text-xs font-bold space-x-1.5">
                    <ImageIcon className="w-4 h-4 opacity-50" />
                    <span>Fallback Image</span>
                  </div>
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md text-white rounded text-[9px] font-black uppercase tracking-wider">
                  {primaryItem.category || 'General'}
                </span>

                <div className="absolute top-2 right-2 flex items-center space-x-1">
                  <span className="px-2 py-0.5 bg-orange-600/90 backdrop-blur-md text-white rounded text-[9px] font-extrabold shadow-sm">
                    {variants.length} {variants.length > 1 ? 'Variants' : 'Portion'}
                  </span>
                  <button
                    onClick={() => handleOpenEditGroup(groupKey, variants)}
                    className="p-1 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded transition-all cursor-pointer"
                    title="Edit Group & All Variants"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-5 space-y-3 flex-1 flex flex-col">
                {/* Group Name & Description + Main Dish Availability Pill Toggle */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-extrabold text-[var(--text-main)] truncate">{groupKey}</h3>
                      <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-0.5">
                        {primaryItem.description || 'Freshly prepared daily with quality ingredients.'}
                      </p>
                    </div>

                    {/* Main Dish-Level Availability Pill Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleGroupAvailability(variants)}
                      className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition-all cursor-pointer shadow-sm border shrink-0 ${
                        allActive
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                          : someActive
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
                      }`}
                      title="Click to toggle availability of entire dish & all portions"
                    >
                      <span className={`w-2 h-2 rounded-full ${allActive ? 'bg-emerald-500 animate-pulse' : someActive ? 'bg-amber-500' : 'bg-rose-500'}`} />
                      <span>{allActive ? 'Available' : someActive ? 'Partial' : 'Unavailable'}</span>
                    </button>
                  </div>
                </div>

                {/* Prep Time & Stock of primary */}
                <div className="flex justify-between items-center text-xs text-[var(--text-muted)] border-t border-[var(--border-color)] pt-2">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    <span>~{primaryItem.prepTime || 10} mins</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Package className="w-3.5 h-3.5 text-amber-400" />
                    <span>Stock: {primaryItem.stock || 50}</span>
                  </span>
                </div>

                {/* ── Variants / Portions List ── */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center">
                    <p className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-wider">
                      {variants.length > 1 ? 'Portions / Variants' : 'Portion'}
                    </p>
                    <button
                      onClick={() => handleOpenAdd(groupKey)}
                      className="text-[10px] font-extrabold text-orange-400 hover:text-orange-300 flex items-center space-x-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Portion</span>
                    </button>
                  </div>

                  {variants.map((v) => {
                    const isVActive = v.isAvailable !== false && v.isActive !== false;
                    return (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl border transition-all ${
                          isVActive
                            ? 'bg-[var(--bg-color)] border-[var(--border-color)]'
                            : 'bg-rose-500/5 border-rose-500/20 opacity-70'
                        }`}
                      >
                        {/* Left: Checkbox + Unit + Price */}
                        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
                          {selectionMode && <input
                            type="checkbox"
                            checked={selectedMenuItemIds.has(v.id)}
                            onChange={() => toggleSelectMenuItem(v.id)}
                            className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                          />}
                          <span className="px-2 py-0.5 bg-orange-500/20 text-orange-500 dark:text-orange-400 border border-orange-500/30 rounded-md text-[10px] font-bold shrink-0">
                            {v.unit || '1 No.'}
                          </span>
                          <span className="text-xs sm:text-sm font-mono font-black text-[var(--text-main)] whitespace-nowrap">
                            Rs. {v.price?.toFixed(0)}
                          </span>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center space-x-1 shrink-0 ml-auto">
                          <button
                            type="button"
                            onClick={() => handleToggleAvailability(v)}
                            className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold flex items-center space-x-1 transition-all cursor-pointer border whitespace-nowrap ${
                              isVActive
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                            }`}
                            title={isVActive ? 'Mark portion unavailable' : 'Mark portion available'}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isVActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className="hidden xs:inline sm:inline">{isVActive ? 'Available' : 'Unavailable'}</span>
                            <span className="xs:hidden sm:hidden">{isVActive ? 'Avail' : 'Off'}</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditSingleVariant(v)}
                            className="p-1 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-all cursor-pointer"
                            title="Edit Variant"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmItem(v)}
                            className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                            title="Delete Variant"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Item Modal — Portal to document.body for true screen centering */}
      {showItemModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-2xl w-full shadow-2xl animate-scale-up max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header — Fixed Top */}
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-[var(--border-color)] shrink-0 bg-[var(--card-bg)] z-10">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl border border-orange-500/20 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-[var(--text-main)] font-display">
                    {formData.variants.some(v => v.id) ? 'Edit Dish & Portions' : 'Add New Dish / Variants'}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Configure item group, image, preparation time, and multiple size portions.</p>
                </div>
              </div>
              <button
                onClick={() => setShowItemModal(false)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar text-xs">
              {/* IMAGE MANAGEMENT SECTION */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block font-bold text-[var(--text-muted)] uppercase text-[10px]">Dish Image</label>
                  <div className="flex bg-[var(--bg-color)] p-0.5 rounded-lg border border-[var(--border-color)]">
                    <button
                      type="button"
                      onClick={() => { setImageMode('url'); setPendingBase64(null); }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${imageMode === 'url' ? 'bg-orange-600 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                    >
                      Image URL
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImageMode('file'); }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${imageMode === 'file' ? 'bg-orange-600 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                    >
                      Upload File
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-[var(--bg-color)] rounded-xl border border-[var(--border-color)] space-y-2">
                  {imagePreview && (
                    <div className="relative h-28 w-full rounded-lg overflow-hidden border border-[var(--border-color)] group">
                      <img src={resolveImageUrl(imagePreview) || imagePreview} alt="Dish Preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-2.5 py-1 bg-rose-600 text-white rounded-md text-[10px] font-bold shadow-md cursor-pointer flex items-center space-x-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Remove Image</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {imageMode === 'url' ? (
                    <div>
                      <input
                        type="url"
                        value={formData.imageUrl || ''}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        placeholder="https://images.unsplash.com/photo-..."
                        className="w-full px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-mono"
                      />
                    </div>
                  ) : (
                    <div className="py-2 border border-dashed border-[var(--border-color)] rounded-lg text-center flex items-center justify-center space-x-3">
                      <ImageIcon className="w-4 h-4 text-[var(--text-muted)] opacity-60" />
                      <span className="text-[11px] text-[var(--text-muted)] font-medium">Select JPG/PNG/WEBP</span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold text-[11px] cursor-pointer shadow-sm inline-flex items-center space-x-1"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Browse...</span>
                      </button>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageFileChange}
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                  />

                  {imageError && (
                    <p className="text-rose-400 font-bold text-[10px] flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>{imageError}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* ITEM NAME & CATEGORY */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase text-[10px] mb-1">Dish / Item Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Chicken Biryani"
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase text-[10px] mb-1">Category *</label>
                  <select
                    value={formData.category === 'CUSTOM' || !categoryOptions.includes(formData.category) ? 'CUSTOM' : formData.category}
                    onChange={(e) => {
                      if (e.target.value === 'CUSTOM') {
                        setCustomCategory(formData.category !== 'CUSTOM' ? formData.category : '');
                        setFormData((prev) => ({ ...prev, category: 'CUSTOM' }));
                      } else {
                        setFormData((prev) => ({ ...prev, category: e.target.value }));
                      }
                    }}
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer font-bold"
                  >
                    {categoryOptions.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="CUSTOM">+ Add Custom Category...</option>
                  </select>
                  {(formData.category === 'CUSTOM' || !categoryOptions.includes(formData.category)) && (
                    <input
                      type="text"
                      required
                      value={customCategory}
                      onChange={(e) => {
                        setCustomCategory(e.target.value);
                        setFormData((prev) => ({ ...prev, category: e.target.value }));
                      }}
                      placeholder="Enter custom category name (e.g. Seafood)"
                      className="w-full mt-1.5 px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                    />
                  )}
                </div>
              </div>

              {/* GROUP SELECTION (Dropdown of existing groups + Custom option) */}
              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase text-[10px] mb-1">Group Name (Select Existing or New) *</label>
                <select
                  value={formData.groupName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      groupName: val,
                      customGroup: val === 'CUSTOM' ? prev.customGroup : ''
                    }));
                  }}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer font-bold"
                >
                  <option value="">Same as Item Name ({formData.name || 'Default'})</option>
                  {existingGroups.map((grp) => (
                    <option key={grp} value={grp}>{grp}</option>
                  ))}
                  <option value="CUSTOM">+ Custom Group Name...</option>
                </select>

                {formData.groupName === 'CUSTOM' && (
                  <input
                    type="text"
                    required
                    value={formData.customGroup}
                    onChange={(e) => setFormData(prev => ({ ...prev, customGroup: e.target.value }))}
                    placeholder="Enter brand new group name (e.g. Paratha Special)"
                    className="w-full mt-1.5 px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                )}
              </div>

              {/* ── MULTI-VARIANT / PORTION SECTION ── */}
              <div className="p-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-extrabold text-[var(--text-main)] uppercase tracking-wider text-[10px]">Portions & Pricing (Variants)</h4>
                    <p className="text-[9px] text-[var(--text-muted)]">Add multiple sizes / portions in one card.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddVariantRow}
                    className="px-2.5 py-1 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 rounded-lg font-bold text-[11px] transition-all cursor-pointer flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Portion</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.variants.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg">
                      {/* Portion/Unit Selection */}
                      <div className="flex-1 space-y-0.5">
                        <select
                          value={v.unit}
                          onChange={(e) => handleVariantChange(idx, 'unit', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                        >
                          {PRESET_UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                          <option value="CUSTOM">+ Custom Portion...</option>
                        </select>
                        {v.unit === 'CUSTOM' && (
                          <input
                            type="text"
                            required
                            value={v.customUnit}
                            onChange={(e) => handleVariantChange(idx, 'customUnit', e.target.value)}
                            placeholder="e.g. 300 gm or Quarter"
                            className="w-full mt-1 px-2.5 py-1 bg-[var(--bg-color)] border border-[var(--border-color)] rounded text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                          />
                        )}
                      </div>

                      {/* Price */}
                      <div className="w-28 sm:w-32 space-y-0.5">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          required
                          value={v.price}
                          onChange={(e) => handleVariantChange(idx, 'price', e.target.value ? Math.floor(Math.abs(Number(e.target.value))) : '')}
                          placeholder="Price (Rs.)"
                          className="w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                        />
                      </div>

                      {/* Remove Button */}
                      {formData.variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVariantRow(idx)}
                          className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-md transition-all cursor-pointer shrink-0"
                          title="Remove Portion"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Prep Time & Stock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase text-[10px] mb-1">Prep Time (mins)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.prepTime}
                    onChange={(e) => setFormData({ ...formData, prepTime: e.target.value ? Math.floor(Math.abs(Number(e.target.value))) : '' })}
                    className="w-full px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[var(--text-muted)] uppercase text-[10px] mb-1">Initial Stock</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value ? Math.floor(Math.abs(Number(e.target.value))) : '' })}
                    className="w-full px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-[var(--text-muted)] uppercase text-[10px] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Short product description..."
                  className="w-full px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Availability Checkbox */}
              <div className="flex items-center space-x-2 pt-0.5">
                <input
                  type="checkbox"
                  id="availCheckAdmin"
                  checked={formData.isAvailable}
                  onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                  className="w-4 h-4 rounded text-orange-600 cursor-pointer"
                />
                <label htmlFor="availCheckAdmin" className="font-bold text-[var(--text-main)] cursor-pointer text-xs">
                  Available for Customer Ordering
                </label>
              </div>

              {/* Modal Sticky Footer — Always Visible at Bottom */}
              <div className="flex justify-end space-x-3 pt-3 border-t border-[var(--border-color)] bg-[var(--card-bg)] sticky bottom-0 z-10">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] font-bold hover:text-[var(--text-main)] cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1.5 text-xs"
                >
                  {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{saving ? 'Saving...' : `Save ${formData.variants.length > 1 ? `${formData.variants.length} Portions` : 'Item'}`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Global Delete Confirmation Modal */}
      <GlobalDeleteModal
        isOpen={Boolean(deleteConfirmItem || isBulkDeleting)}
        onClose={() => {
          setDeleteConfirmItem(null);
          setIsBulkDeleting(false);
        }}
        onConfirm={handleConfirmDelete}
        title={isBulkDeleting ? `Delete ${selectedMenuItemIds.size} Selected Menu Items` : `Delete Menu Item (${deleteConfirmItem?.name || ''})`}
        message={
          isBulkDeleting
            ? `Are you sure you want to delete ${selectedMenuItemIds.size} selected menu items? Items with historical sales references will be safely deactivated to protect order ledgers.`
            : `Are you sure you want to delete "${deleteConfirmItem?.name} (${deleteConfirmItem?.unit})"? If this item appears in past orders, it will be safely deactivated to preserve historical accuracy.`
        }
        itemCount={isBulkDeleting ? selectedMenuItemIds.size : 1}
        itemName={deleteConfirmItem ? `${deleteConfirmItem.name} (${deleteConfirmItem.unit})` : ''}
        isBulk={isBulkDeleting}
        confirmButtonText={isBulkDeleting ? 'Delete Selected' : 'Delete Menu Item'}
        loading={deleteLoading}
        warningNotes={[
          'Items with no sales history are permanently purged from catalog and disk storage.',
          'Items referenced in past customer orders are soft-deactivated to preserve revenue reports.',
        ]}
      />
    </div>
  );
};

export default AdminMenuView;


