import ThemedSelect from '../../common/ThemedSelect';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Edit2,
  Trash2,
  Clock,
  Package,
  X,
  Upload,
  Image as ImageIcon,
  AlertTriangle,
  RefreshCw,
  Layers,
} from 'lucide-react';
import api, { resolveBackendUrl } from '../../../services/api';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';
import './AdminMenuView.css';

const SIZE_PRESETS = [
  'Half',
  'Full',
  'Regular',
  'Large',
  'Plate',
  'Cup',
  'Glass',
];
const NUMERIC_UNITS = ['gm', 'kg', 'ml', 'Ltr', 'Pc', 'No.'];
const NUMERIC_UNIT_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*(gm|kg|ml|ltr|pc|no\.?)\s*$/i;
const NUMERIC_UNIT_SPELLING = {
  gm: 'gm',
  kg: 'kg',
  ml: 'ml',
  ltr: 'Ltr',
  pc: 'Pc',
  no: 'No.',
};

const parseVariantLabel = (label) => {
  const original = typeof label === 'string' ? label : String(label ?? '');
  const numericMatch = original.match(NUMERIC_UNIT_PATTERN);
  if (numericMatch) {
    const unitKey = numericMatch[2].toLowerCase().replace(/\.$/, '');
    return {
      unit: NUMERIC_UNIT_SPELLING[unitKey],
      quantity: numericMatch[1],
      customUnit: '',
    };
  }
  if (SIZE_PRESETS.includes(original)) {
    return { unit: original, quantity: '', customUnit: '' };
  }
  return { unit: 'CUSTOM', quantity: '', customUnit: original };
};

const formatVariantQuantity = (quantity) => {
  const parsed = Number(quantity);
  return Number.isFinite(parsed) ? String(parsed) : '';
};

const buildVariantLabel = (variant) => {
  if (NUMERIC_UNITS.includes(variant.unit)) {
    const quantity = formatVariantQuantity(variant.quantity);
    return quantity ? `${quantity} ${variant.unit}` : '';
  }
  return variant.unit === 'CUSTOM' ? String(variant.customUnit ?? '').trim() : variant.unit;
};

const getVariantLabelError = (variants, index) => {
  const variant = variants[index];
  if (NUMERIC_UNITS.includes(variant.unit)) {
    const validQuantity = /^\d+(?:\.\d+)?$/.test(variant.quantity || '') && Number(variant.quantity) > 0;
    if (!validQuantity) return 'Enter a valid quantity';
  }
  const label = buildVariantLabel(variant).trim().toLocaleLowerCase();
  if (label && variants.some((other, otherIndex) => otherIndex !== index && buildVariantLabel(other).trim().toLocaleLowerCase() === label)) {
    return 'This portion already exists';
  }
  return '';
};

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

    return `${resolveBackendUrl()}${trimmed}`;
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
  const mobileActionWidth = selectionMode ? 'mobile-action-third' : 'mobile-action-half';
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);
  const categoryScrollRef = useRef(null);
  const categoryDragRef = useRef(null);
  const suppressCategoryClickRef = useRef(false);
  const [categoryScrollState, setCategoryScrollState] = useState({ overflow: false, left: false, right: false });

  const updateCategoryScrollState = useCallback(() => {
    const element = categoryScrollRef.current;
    if (!element) return;
    const nextState = {
      overflow: element.scrollWidth > element.clientWidth + 2,
      left: element.scrollLeft > 2,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
    };
    setCategoryScrollState((current) => (
      current.overflow === nextState.overflow && current.left === nextState.left && current.right === nextState.right
        ? current
        : nextState
    ));
  }, []);

  const scrollCategories = (direction) => {
    categoryScrollRef.current?.scrollBy({ left: direction * 200, behavior: 'smooth' });
  };

  const handleCategoryWheel = (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      categoryScrollRef.current.scrollLeft += event.deltaY;
    }
  };

  const handleCategoryMouseDown = (event) => {
    if (event.button !== 0 || !categoryScrollRef.current) return;
    categoryDragRef.current = {
      startX: event.clientX,
      startScrollLeft: categoryScrollRef.current.scrollLeft,
      moved: false,
    };
  };

  const handleCategoryMouseMove = (event) => {
    if (!categoryDragRef.current || !categoryScrollRef.current) return;
    const delta = event.clientX - categoryDragRef.current.startX;
    if (Math.abs(delta) > 4) categoryDragRef.current.moved = true;
    if (categoryDragRef.current.moved) categoryScrollRef.current.scrollLeft = categoryDragRef.current.startScrollLeft - delta;
  };

  const handleCategoryMouseUp = () => {
    if (categoryDragRef.current?.moved) suppressCategoryClickRef.current = true;
    categoryDragRef.current = null;
  };

  const handleCategoryClickCapture = (event) => {
    if (!suppressCategoryClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressCategoryClickRef.current = false;
  };

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

  useEffect(() => {
    const element = categoryScrollRef.current;
    if (!element) return undefined;
    updateCategoryScrollState();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateCategoryScrollState) : null;
    observer?.observe(element);
    window.addEventListener('resize', updateCategoryScrollState);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateCategoryScrollState);
    };
  }, [categories, updateCategoryScrollState]);

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
      { id: null, ...parseVariantLabel('250 gm'), price: '' }
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
        { id: null, ...parseVariantLabel('250 gm'), price: '' }
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
      variants: variantsList.map((v) => ({
        id: v.id,
        ...parseVariantLabel(v.unit),
        price: String(v.price ?? ''),
      })),
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
          ...parseVariantLabel(variantItem.unit),
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
        { id: null, ...parseVariantLabel('500 gm'), price: '' }
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

  const handleVariantUnitChange = (index, value) => {
    setFormData((prev) => {
      const updated = [...prev.variants];
      const current = updated[index];
      updated[index] = {
        ...current,
        unit: value,
        quantity: NUMERIC_UNITS.includes(value) ? (current.quantity || '1') : '',
      };
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
    if (formData.variants.some((_, index) => getVariantLabelError(formData.variants, index))) return;
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
        const effectiveUnit = buildVariantLabel(v);
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
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 glass-card p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">Menu Catalog Management</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Control pricing, dish images, preparation times, categories, and customer availability.</p>
        </div>

        <div className="flex w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto pb-1 lg:w-auto lg:shrink-0 lg:justify-end lg:gap-2 lg:overflow-visible">
          <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedMenuItemIds.size} className={`${mobileActionWidth} h-10 justify-center px-1 text-[10px] sm:h-auto sm:w-auto sm:px-3 sm:py-2 sm:text-xs`} mobileLabel="Select" mobileActiveLabel="Done" />
          {selectionMode && <label className="mobile-action-third inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] px-1 text-[10px] font-bold text-[var(--text-muted)] cursor-pointer select-none whitespace-nowrap sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2 sm:text-xs">
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
            <span className="sm:hidden">All</span>
            <span className="hidden sm:inline">{allFilteredMenuItemsSelected ? 'Clear visible selection' : `Select visible (${filteredItems.length})`}</span>
          </label>}
          {selectionMode && selectedMenuItemIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="mobile-action-third flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-rose-500/20 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400 shadow-md transition-all hover:bg-rose-500/20 cursor-pointer sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3.5 sm:py-2.5 sm:text-xs"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span><span className="sm:hidden">Delete</span><span className="hidden sm:inline">Delete Selected ({selectedMenuItemIds.size})</span></span>
            </button>
          )}

          <button
            onClick={() => handleOpenAdd()}
            className={`${mobileActionWidth} flex h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-orange-600 px-1 text-[10px] font-bold text-white shadow-md transition-all hover:bg-orange-500 cursor-pointer sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2.5 sm:text-xs`}
          >
            <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add New Menu Item</span></span>
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
          <div role="tablist" aria-label="Menu availability filters" className="admin-menu-filter-pills flex min-w-0 items-center gap-1.5 bg-[var(--bg-color)] p-1 rounded-xl border border-[var(--border-color)] overflow-x-auto">
            {[
              { id: 'ALL', label: `All Items (${metrics.total})` },
              { id: 'AVAILABLE', label: `Available (${metrics.available})` },
              { id: 'LOW_STOCK', label: `Low Stock (${metrics.lowStock})` },
              { id: 'DISABLED', label: `Disabled (${metrics.disabled})` },
            ].map((flt) => (
              <button
                key={flt.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === flt.id}
                onClick={() => setStatusFilter(flt.id)}
                className={`flex-none px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer ${
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
        <div className="flex min-w-0 flex-col gap-1.5 pt-1 sm:flex-row sm:items-center sm:gap-3">
          <span className="shrink-0 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Categories:
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {categoryScrollState.overflow && (
              <button
                type="button"
                onClick={() => scrollCategories(-1)}
                disabled={!categoryScrollState.left}
                aria-label="Scroll categories left"
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-color)] hover:text-[var(--text-main)] disabled:opacity-35 lg:inline-flex"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <div
              ref={categoryScrollRef}
              role="tablist"
              aria-label="Menu categories"
              onScroll={updateCategoryScrollState}
              onWheel={handleCategoryWheel}
              onMouseDown={handleCategoryMouseDown}
              onMouseMove={handleCategoryMouseMove}
              onMouseUp={handleCategoryMouseUp}
              onMouseLeave={handleCategoryMouseUp}
              onClickCapture={handleCategoryClickCapture}
              className="admin-menu-category-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden py-1 select-none"
            >
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`admin-menu-category-pill flex-none min-w-0 h-9 px-3.5 rounded-full text-[13px] font-semibold leading-none whitespace-nowrap transition-colors cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${
                    selectedCategory === cat ? 'admin-menu-category-pill--active' : ''
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {categoryScrollState.overflow && (
              <button
                type="button"
                onClick={() => scrollCategories(1)}
                disabled={!categoryScrollState.right}
                aria-label="Scroll categories right"
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-color)] hover:text-[var(--text-main)] disabled:opacity-35 lg:inline-flex"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Menu Catalog Grid —” Grouped by variant */}
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
                    className="p-1 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded transition-all cursor-pointer icon-btn"
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

                {/* ──────────────────────────────────────────────── Variants / Portions List ──────────────────────────────────────────────── */}
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
                        className={`admin-menu-variant-row flex min-w-0 flex-wrap items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl border transition-all ${
                          isVActive
                            ? 'bg-[var(--bg-color)] border-[var(--border-color)]'
                            : 'bg-rose-500/5 border-rose-500/20 opacity-70'
                        }`}
                      >
                        {/* Left: Checkbox + Unit + Price */}
                        <div className="admin-menu-variant-details flex min-w-0 flex-[1_1_120px] items-center gap-1.5 sm:gap-2">
                          {selectionMode && <input
                            type="checkbox"
                            checked={selectedMenuItemIds.has(v.id)}
                            onChange={() => toggleSelectMenuItem(v.id)}
                            className="rounded border-[var(--border-color)] text-orange-600 focus:ring-orange-500 cursor-pointer"
                          />}
                          <span className="max-w-[72px] truncate px-2 py-0.5 bg-orange-500/20 text-orange-500 dark:text-orange-400 border border-orange-500/30 rounded-md text-[10px] font-bold shrink-0" title={v.unit || '1 No.'}>
                            {v.unit || '1 No.'}
                          </span>
                          <span
                            className="admin-menu-variant-price min-w-0 overflow-hidden text-ellipsis text-xs sm:text-sm font-mono font-black tabular-nums text-[var(--text-main)] whitespace-nowrap"
                            title={`Rs. ${Number(v.price || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`}
                          >
                            Rs. {Number(v.price || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                          </span>
                        </div>

                        {/* Right: Actions */}
                        <div className="admin-menu-variant-actions flex shrink-0 items-center justify-end gap-1 ml-auto">
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
                            className="p-1 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-all cursor-pointer icon-btn"
                            title="Edit Variant"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmItem(v)}
                            className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer icon-btn"
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

      {/* Add / Edit Item Modal —” Portal to document.body for true screen centering */}
      {showItemModal && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-2xl w-full shadow-2xl animate-scale-up max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header —” Fixed Top */}
            <div className="flex flex-nowrap items-start justify-between gap-3 p-4 sm:p-5 border-b border-[var(--border-color)] shrink-0 bg-[var(--card-bg)] z-10">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="shrink-0 p-2 bg-orange-500/10 text-orange-400 rounded-xl border border-orange-500/20">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-extrabold text-[var(--text-main)] font-display leading-snug">
                    {formData.variants.some(v => v.id) ? 'Edit Dish & Portions' : 'Add New Dish / Variants'}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Configure item group, image, preparation time, and multiple size portions.</p>
                </div>
              </div>
              <button
                onClick={() => setShowItemModal(false)}
                className="ml-1 shrink-0 p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer icon-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form id="menu-item-form" onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar text-xs">
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
                  <ThemedSelect
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
                  </ThemedSelect>
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
                <ThemedSelect
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
                </ThemedSelect>

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

              {/* ──────────────────────────────────────────────── MULTI-VARIANT / PORTION SECTION ──────────────────────────────────────────────── */}
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
                  {formData.variants.map((v, idx) => {
                    const labelError = getVariantLabelError(formData.variants, idx);
                    const labelErrorId = `variant-label-error-${idx}`;
                    const quantityUnit = NUMERIC_UNITS.includes(v.unit);
                    return (
                      <div key={idx} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                        <div className="col-span-2 min-w-0 sm:col-span-1">
                          <div className="flex min-w-0 items-start gap-2">
                            {quantityUnit && (
                              <input
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9]*(\.[0-9]*)?"
                                maxLength={6}
                                aria-label="Quantity"
                                aria-describedby={labelErrorId}
                                value={v.quantity ?? ''}
                                onFocus={(event) => event.target.select()}
                                onChange={(event) => {
                                  const raw = event.target.value.replace(/[^\d.]/g, '');
                                  const [whole, ...fraction] = raw.split('.');
                                  const cleaned = `${whole}${fraction.length ? `.${fraction.join('')}` : ''}`.slice(0, 6);
                                  handleVariantChange(idx, 'quantity', cleaned);
                                }}
                                placeholder="Qty"
                                className={`h-11 w-20 shrink-0 rounded-lg border bg-[var(--bg-color)] px-2 text-sm font-semibold text-[var(--text-main)] outline-none focus-visible:ring-2 focus-visible:ring-orange-500/35 ${labelError === 'Enter a valid quantity' ? 'border-rose-500' : 'border-[var(--border-color)] focus-visible:border-orange-500'}`}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <ThemedSelect
                                value={v.unit}
                                onChange={(event) => handleVariantUnitChange(idx, event.target.value)}
                                aria-label="Unit"
                                aria-describedby={labelErrorId}
                                className={`h-11 w-full rounded-lg border bg-[var(--bg-color)] px-2.5 text-sm font-semibold text-[var(--text-main)] outline-none focus-visible:ring-2 focus-visible:ring-orange-500/35 ${labelError && !quantityUnit ? 'border-rose-500' : 'border-[var(--border-color)] focus-visible:border-orange-500'}`}
                              >
                                <optgroup label="Weight">
                                  <option value="gm">gm</option>
                                  <option value="kg">kg</option>
                                </optgroup>
                                <optgroup label="Volume">
                                  <option value="ml">ml</option>
                                  <option value="Ltr">Ltr</option>
                                </optgroup>
                                <optgroup label="Count">
                                  <option value="Pc">Pc</option>
                                  <option value="No.">No.</option>
                                </optgroup>
                                <optgroup label="Size">
                                  {SIZE_PRESETS.map((size) => <option key={size} value={size}>{size}</option>)}
                                </optgroup>
                                <option value="CUSTOM">+ Custom Portion...</option>
                              </ThemedSelect>
                              {v.unit === 'CUSTOM' && (
                                <input
                                  type="text"
                                  required
                                  value={v.customUnit}
                                  onChange={(event) => handleVariantChange(idx, 'customUnit', event.target.value)}
                                  aria-label="Custom portion label"
                                  aria-describedby={labelErrorId}
                                  placeholder="e.g. 300 gm or Quarter"
                                  className={`mt-1 h-11 w-full rounded-lg border bg-[var(--bg-color)] px-2.5 text-sm text-[var(--text-main)] outline-none focus-visible:ring-2 focus-visible:ring-orange-500/35 ${labelError ? 'border-rose-500' : 'border-[var(--border-color)] focus-visible:border-orange-500'}`}
                                />
                              )}
                            </div>
                          </div>
                          <p id={labelErrorId} className={`mt-1 text-xs ${labelError ? 'text-rose-500' : 'sr-only'}`} aria-live="polite">
                            {labelError}
                          </p>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            required
                            value={v.price}
                            onChange={(event) => handleVariantChange(idx, 'price', event.target.value ? Math.floor(Math.abs(Number(event.target.value))) : '')}
                            placeholder="Price (Rs.)"
                            aria-label="Price (Rs.)"
                            className="h-11 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] px-2.5 text-xs font-mono font-bold text-[var(--text-main)] outline-none focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-500/35"
                          />
                        </div>

                        {formData.variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVariantRow(idx)}
                            aria-label="Remove portion"
                            className="h-11 w-11 shrink-0 rounded-lg text-rose-400 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                            title="Remove Portion"
                          >
                            <Trash2 className="mx-auto h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
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

            </form>

            {/* Fixed modal footer stays below the scrollable form content. */}
            <div className="shrink-0 flex justify-end gap-3 p-3 sm:p-4 border-t border-[var(--border-color)] bg-[var(--card-bg)]">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] font-bold hover:text-[var(--text-main)] cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="menu-item-form"
                  disabled={saving}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer flex items-center space-x-1.5 text-xs"
                >
                  {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{saving ? 'Saving...' : `Save ${formData.variants.length > 1 ? `${formData.variants.length} Portions` : 'Item'}`}</span>
                </button>
            </div>
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




