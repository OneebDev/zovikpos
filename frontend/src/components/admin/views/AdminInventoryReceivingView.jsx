import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Truck,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  FileText,
  Search,
  Upload,
  Sparkles,
  AlertTriangle,
  Calendar,
  Building2,
  DollarSign,
  Package,
  Layers,
  X,
  Eye,
  Check,
  RefreshCw,
  FileSpreadsheet,
  Clock,
  Download,
  FileUp,
  HelpCircle,
  Edit3,
  Camera,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle,
  Sparkle,
  PackageCheck,
} from 'lucide-react';
import api from '../../../services/api';
import { exportToCSV } from '../../../utils/exportUtils';

// Common local Urdu / Roman Urdu search aliases map for inventory lookup
const ITEM_ALIASES = {
  'aloo': ['potatoes', 'potato', 'fresh potatoes'],
  'pyaz': ['onions', 'onion', 'pyaaz'],
  'tamatar': ['tomatoes', 'tomato'],
  'doodh': ['milk', 'fresh milk'],
  'anda': ['eggs', 'egg', 'anday', 'fresh eggs'],
  'adrak': ['ginger'],
  'lehsan': ['garlic', 'lahsan'],
  'hari mirch': ['green chillies', 'green chili'],
  'dahi': ['yogurt', 'curd'],
  'makhan': ['butter'],
  'aata': ['wheat flour', 'flour'],
  'maida': ['refined flour', 'all-purpose flour'],
  'besan': ['gram flour'],
  'chawal': ['rice', 'basmati rice'],
  'keema': ['mince', 'beef mince', 'chicken mince'],
  'qima': ['mince', 'beef mince'],
  'qeema': ['mince'],
  'murghi': ['chicken'],
  'gosht': ['mutton', 'beef', 'meat'],
  'tel': ['cooking oil', 'oil'],
  'namak': ['salt'],
  'haldi': ['turmeric', 'turmeric powder'],
  'lal mirch': ['red chilli', 'chilli powder'],
  'zeera': ['cumin seeds', 'cumin'],
  'chai': ['tea leaves', 'tea'],
  'cheeni': ['sugar']
};

const PERISHABLE_CATEGORIES = ['Meat / Protein', 'Dairy', 'Vegetables', 'Beverages', 'Desserts'];

// Normalize unit string
const normalizeUnit = (unitStr) => {
  if (!unitStr) return 'KG';
  const u = String(unitStr).trim().toUpperCase();
  if (['KGS', 'KG', 'KILOGRAM', 'KILOGRAMS', 'KILO', 'KILOS'].includes(u)) return 'KG';
  if (['G', 'GM', 'GMS', 'GRAM', 'GRAMS'].includes(u)) return 'G';
  if (['L', 'LTR', 'LTRS', 'LITER', 'LITERS', 'LITRE', 'LITRES'].includes(u)) return 'L';
  if (['ML', 'MILLILITER', 'MILLILITERS'].includes(u)) return 'ML';
  if (['PCS', 'PC', 'PIECE', 'PIECES', 'ITEM', 'ITEMS', 'PKT', 'PKTS'].includes(u)) return 'PCS';
  if (['DOZEN', 'DOZ', 'DOZENS'].includes(u)) return 'DOZEN';
  if (['BOX', 'BOXES', 'CTN', 'CARTON', 'CARTONS'].includes(u)) return 'BOX';
  if (['PACK', 'PACKET', 'PACKETS', 'BAG', 'BAGS'].includes(u)) return 'PACK';
  if (['BOTTLE', 'BOTTLES', 'BOT'].includes(u)) return 'BOTTLE';
  return u;
};

const AdminInventoryReceivingView = ({ inventory = [], suppliers = [], onRefresh, showToast, onNavigateToCatalog }) => {
  const [subTab, setSubTab] = useState('NEW_RECEIVING'); // NEW_RECEIVING | HISTORY
  const [receivingMethod, setReceivingMethod] = useState('MANUAL'); // MANUAL | EXCEL | INVOICE
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [receivingsList, setReceivingsList] = useState([]);
  const [editingDraftId, setEditingDraftId] = useState(null);
  
  // Header Form State
  // Internal Reference starts BLANK -- user must click icon to generate
  const [receivingRef, setReceivingRef] = useState(''); // RCV-YYYYMMDD-XXX
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(''); // External Supplier Invoice # (e.g. INV-45892)
  const [batchNumber, setBatchNumber] = useState(''); // Shipment level Batch Number (same for all receiving items)
  const [branchId, setBranchId] = useState('');
  const [branchesList, setBranchesList] = useState([]);
  const [receivingDate, setReceivingDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  // AI Extracted Metadata
  const [aiDetectedSupplier, setAiDetectedSupplier] = useState('');
  const [aiDetectedInvoiceNumber, setAiDetectedInvoiceNumber] = useState('');
  const [aiDetectedInvoiceTotal, setAiDetectedInvoiceTotal] = useState(null);

  // Success Screen State
  const [completedReceiving, setCompletedReceiving] = useState(null);

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Multi-item stacked review cards array
  const [receivingRows, setReceivingRows] = useState([
    {
      inventoryItemId: '',
      searchTerm: '',
      showSearchDropdown: false,
      quantity: 1,
      unit: 'KG',
      unitCost: 0,
      batchNumber: '',
      expiryDate: '',
      notes: '',
      showMoreDetails: false,
      isAiDetected: false,
      confidence: 1.0,
      isUnmatched: false
    }
  ]);

  // Local inventory mirror (keeps updated immediately when items are saved to catalog)
  const [localInventory, setLocalInventory] = useState(inventory || []);
  useEffect(() => {
    if (inventory && Array.isArray(inventory)) {
      setLocalInventory(inventory);
    }
  }, [inventory]);

  // Save to Catalog (Single Item) Modal State
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [catalogModalRowIndex, setCatalogModalRowIndex] = useState(null);
  const [catalogModalData, setCatalogModalData] = useState({
    name: '',
    unit: 'KG',
    category: 'General',
    sku: '',
    costPrice: 0,
    minThreshold: 10,
    maxThreshold: 100,
    supplierId: '',
    branchId: ''
  });
  const [savingCatalogItem, setSavingCatalogItem] = useState(false);
  const [catalogModalError, setCatalogModalError] = useState('');
  const [catalogModalDuplicateItem, setCatalogModalDuplicateItem] = useState(null);

  // Bulk Save to Catalog State
  const [bulkSavingCatalog, setBulkSavingCatalog] = useState(false);

  // Selected Receiving for Details Modal
  const [selectedReceiving, setSelectedReceiving] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Computed Item Counts: Total, Matched, Suggested, New, Needs Review
  const totalItemsCount = receivingRows.length;
  const matchedItemsCount = receivingRows.filter(r => Boolean(r.inventoryItemId)).length;
  const reviewMatchCount = receivingRows.filter(r => !r.inventoryItemId && r.suggestedItem).length;
  const newItemsCount = receivingRows.filter(r => !r.inventoryItemId).length;
  const needsReviewCount = receivingRows.filter(r => Boolean(r.needsReview)).length;

  const CATALOG_CATEGORIES = [
    'General',
    'Vegetables',
    'Meat & Protein',
    'Dairy & Fats',
    'Dry Goods',
    'Spices',
    'Bakery',
    'Beverages',
    'Sauces & Condiments',
    'Packaging',
    'Kitchen Supplies',
    'Desserts',
    'Other'
  ];

  const STANDARD_UNITS = [
    'KG',
    'G',
    'L',
    'ML',
    'PCS',
    'DOZEN',
    'BOX',
    'PACK',
    'BOTTLE',
    'BAG',
    'ROLL'
  ];

  // CSV / EXCEL Upload & Processing State
  const [parsingCsv, setParsingCsv] = useState(false);

  // AI / OCR INVOICE STATE
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [ocrFile, setOcrFile] = useState(null);
  const [extractingOcr, setExtractingOcr] = useState(false);
  const [uploadedInvoiceDataUrl, setUploadedInvoiceDataUrl] = useState(null);
  const [uploadedInvoiceFileName, setUploadedInvoiceFileName] = useState('');
  const [uploadedInvoiceMimeType, setUploadedInvoiceMimeType] = useState('');
  const [showInvoicePreviewModal, setShowInvoicePreviewModal] = useState(false);

  // History Filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');

  const [refClickSeq, setRefClickSeq] = useState(0);

  // Generate unique Internal Reference -- instant date + unique sequence generator
  const generateAutoRef = () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const newRef = `RCV-${dateStr}-${rand}`;
    setReceivingRef(newRef);
    if (showToast) showToast(`Internal Reference Generated: ${newRef}`, 'info');
  };

  // Generate unique Supplier Invoice # -- timestamp millisecond suffix ensures uniqueness
  const generateAutoInvoiceNum = () => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const ms = String(Date.now()).slice(-6);
    const newInv = `INV-${dateStr}-${ms}`;
    setSupplierInvoiceNumber(newInv);
    if (showToast) showToast(`Supplier Invoice # Generated: ${newInv}`, 'info');
  };

  // Generate unique Batch Number for receiving row
  const generateAutoBatchForRow = (index) => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const batch = `BATCH-${dateStr}-${rand}`;
    handleRowChange(index, 'batchNumber', batch);
    if (showToast) showToast(`Batch # Generated: ${batch}`, 'info');
  };

  const fetchReceivings = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/inventory/receivings?status=${historyStatusFilter}&search=${historySearch}`);
      if (res.data?.receivings) {
        setReceivingsList(res.data.receivings);
      }
    } catch (err) {
      console.warn('Fetch receivings error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDraftIntoForm = (draft) => {
    if (!draft) return;
    setEditingDraftId(draft.id);
    try {
      localStorage.setItem('zovikpos_active_draft_id', String(draft.id));
    } catch (_) {}
    setReceivingRef(draft.receivingNumber || '');
    setSupplierId(draft.supplierId ? String(draft.supplierId) : '');
    setSupplierInvoiceNumber(draft.invoiceNumber || '');
    setBatchNumber(draft.batchNumber || '');
    if (draft.branchId) setBranchId(String(draft.branchId));
    if (draft.receivingDate) {
      const d = new Date(draft.receivingDate);
      if (!isNaN(d.getTime())) {
        setReceivingDate(d.toISOString().split('T')[0]);
      }
    }
    setNotes(draft.notes || '');

    if (draft.items && draft.items.length > 0) {
      const rows = draft.items.map(item => ({
        inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : '',
        searchTerm: item.inventoryItem?.name || '',
        showSearchDropdown: false,
        quantity: item.quantity != null ? item.quantity : 1,
        unit: item.unit || item.inventoryItem?.unit || 'KG',
        unitCost: item.unitCost != null ? item.unitCost : 0,
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : '',
        notes: item.notes || '',
        showMoreDetails: false,
        isAiDetected: false,
        confidence: 1.0,
        isUnmatched: false
      }));
      setReceivingRows(rows);
    } else {
      setReceivingRows([
        {
          inventoryItemId: '',
          searchTerm: '',
          showSearchDropdown: false,
          quantity: 1,
          unit: 'KG',
          unitCost: 0,
          batchNumber: '',
          expiryDate: '',
          notes: '',
          showMoreDetails: false,
          isAiDetected: false,
          confidence: 1.0,
          isUnmatched: false
        }
      ]);
    }
    setSubTab('NEW_RECEIVING');
    setCompletedReceiving(null);
  };

  useEffect(() => {
    const checkPersistedDraft = async () => {
      try {
        const activeDraftId = localStorage.getItem('zovikpos_active_draft_id');
        if (activeDraftId) {
          const res = await api.get(`/inventory/receivings/${activeDraftId}`);
          if (res.data?.receiving && res.data.receiving.status === 'DRAFT') {
            loadDraftIntoForm(res.data.receiving);
          } else {
            localStorage.removeItem('zovikpos_active_draft_id');
          }
        }
      } catch (_) {
        try {
          localStorage.removeItem('zovikpos_active_draft_id');
        } catch (_) {}
      }
    };
    checkPersistedDraft();
  }, []);

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await api.get('/admin/branches');
        if (res.data?.branches && res.data.branches.length > 0) {
          setBranchesList(res.data.branches);
          setBranchId(String(res.data.branches[0].id));
        }
      } catch (_) {
        // Fallback handled smoothly
      }
    };
    fetchBranches();
  }, []);

  useEffect(() => {
    if (subTab === 'HISTORY') {
      fetchReceivings();
    }
  }, [subTab, historyStatusFilter]);

  // Download Comprehensive Stock Excel Template (All item columns included; Ref & Invoice # excluded)
  const handleDownloadEasyExcelTemplate = () => {
    const templateData = [
      {
        'Item Name': 'Potatoes',
        'Category': 'Vegetables',
        'Unit': 'KG',
        'Quantity Received': 50,
        'Cost per Unit': 120,
        'Batch Number': 'BATCH-2026-001',
        'Expiry Date': '2026-12-31',
        'Notes': 'Fresh local market stock',
        'Minimum Stock': 10
      },
      {
        'Item Name': 'Onions',
        'Category': 'Vegetables',
        'Unit': 'KG',
        'Quantity Received': 30,
        'Cost per Unit': 100,
        'Batch Number': 'BATCH-2026-002',
        'Expiry Date': '2026-11-15',
        'Notes': 'Grade A onions',
        'Minimum Stock': 10
      },
      {
        'Item Name': 'Chicken Fillet',
        'Category': 'Meat & Protein',
        'Unit': 'KG',
        'Quantity Received': 25,
        'Cost per Unit': 650,
        'Batch Number': 'BATCH-CHIK-109',
        'Expiry Date': '2026-10-20',
        'Notes': 'Fresh boneless chicken',
        'Minimum Stock': 5
      },
      {
        'Item Name': 'Burger Buns',
        'Category': 'Bakery',
        'Unit': 'PCS',
        'Quantity Received': 100,
        'Cost per Unit': 45,
        'Batch Number': 'BATCH-BUN-88',
        'Expiry Date': '2026-10-12',
        'Notes': 'Fresh sesame buns',
        'Minimum Stock': 20
      },
      {
        'Item Name': 'Cooking Oil',
        'Category': 'Sauces & Condiments',
        'Unit': 'L',
        'Quantity Received': 10,
        'Cost per Unit': 550,
        'Batch Number': 'BATCH-OIL-301',
        'Expiry Date': '2027-06-30',
        'Notes': 'Canola cooking oil 1L',
        'Minimum Stock': 5
      }
    ];

    exportToCSV('Stock_Receiving_Template.csv', templateData, [
      { key: 'Item Name', label: 'Item Name' },
      { key: 'Category', label: 'Category' },
      { key: 'Unit', label: 'Unit' },
      { key: 'Quantity Received', label: 'Quantity Received' },
      { key: 'Cost per Unit', label: 'Cost per Unit' },
      { key: 'Batch Number', label: 'Batch Number' },
      { key: 'Expiry Date', label: 'Expiry Date' },
      { key: 'Notes', label: 'Notes' },
      { key: 'Minimum Stock', label: 'Minimum Stock' }
    ]);

    if (showToast) {
      showToast('Downloaded Full Excel Format Template!');
    }
  };


  // Calculate grand total cost across item rows
  const calculatedGrandTotal = useMemo(() => {
    return receivingRows.reduce((acc, row) => {
      const qty = parseFloat(row.quantity) || 0;
      const cost = parseFloat(row.unitCost) || 0;
      return acc + (qty * cost);
    }, 0);
  }, [receivingRows]);

  // Total valid items count
  const validItemsCount = useMemo(() => {
    return receivingRows.filter(r => r.inventoryItemId).length;
  }, [receivingRows]);

  // Add a new blank item row
  const handleAddRow = () => {
    setReceivingRows(prev => [
      ...prev,
      {
        inventoryItemId: '',
        searchTerm: '',
        showSearchDropdown: false,
        quantity: 1,
        unit: 'KG',
        unitCost: 0,
        batchNumber: '',
        expiryDate: '',
        notes: '',
        showMoreDetails: false,
        isAiDetected: false,
        confidence: 1.0,
        isUnmatched: false
      }
    ]);
  };

  // Remove row
  const handleRemoveRow = (index) => {
    if (receivingRows.length === 1) {
      if (showToast) showToast('Receiving record must contain at least one item.', 'error');
      return;
    }
    setReceivingRows(prev => prev.filter((_, idx) => idx !== index));
  };

  // Select item from autocomplete dropdown
  const handleSelectItem = (index, invItem) => {
    setReceivingRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        inventoryItemId: String(invItem.id),
        searchTerm: invItem.name,
        showSearchDropdown: false,
        unit: invItem.unit || updated[index].unit || 'KG',
        unitCost: updated[index].unitCost || invItem.costPrice || 0, // keep existing cost if already set
        isUnmatched: false, // clear unmatched flag once user selects catalog item
        suggestedItem: null,
        status: 'MATCHED'
      };
      return updated;
    });
  };

  // Handle row field updates
  const handleRowChange = (index, field, value) => {
    setReceivingRows(prev => {
      const updated = [...prev];
      updated[index][field] = value;
      return updated;
    });
  };

  // Open Single Item "Save in Catalog" modal
  const handleOpenSaveCatalogModal = (index) => {
    const row = receivingRows[index];
    if (!row) return;

    const initialName = (row.searchTerm || '').trim();
    const initialUnit = normalizeUnit(row.unit || 'KG');
    const initialCost = parseFloat(row.unitCost) || 0;

    // Check if an existing catalog item matches name
    const existingSameName = localInventory.find(i => 
      i.name.toLowerCase().trim() === initialName.toLowerCase()
    );

    setCatalogModalRowIndex(index);
    setCatalogModalData({
      name: initialName,
      unit: initialUnit,
      category: 'General',
      sku: '',
      costPrice: initialCost,
      minThreshold: 10,
      maxThreshold: 100,
      supplierId: supplierId || '',
      branchId: branchId || (branchesList[0]?.id ? String(branchesList[0].id) : '')
    });
    setCatalogModalError('');
    setCatalogModalDuplicateItem(existingSameName || null);
    setCatalogModalOpen(true);
  };

  // Link row to existing item (avoids duplicate creation)
  const handleLinkExistingItem = (existingItem) => {
    if (catalogModalRowIndex === null || !existingItem) return;
    const index = catalogModalRowIndex;

    setReceivingRows(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        inventoryItemId: String(existingItem.id),
        searchTerm: existingItem.name,
        unit: existingItem.unit || updated[index].unit,
        isUnmatched: false,
        showSearchDropdown: false
      };
      return updated;
    });

    if (showToast) showToast(`Linked row #${index + 1} to existing catalog item "${existingItem.name}".`, 'success');
    setCatalogModalOpen(false);
    setCatalogModalRowIndex(null);
    setCatalogModalDuplicateItem(null);
  };

  // Save single new item in catalog
  const handleSaveItemToCatalog = async (e) => {
    if (e) e.preventDefault();
    if (!catalogModalData.name || !catalogModalData.name.trim()) {
      setCatalogModalError('Item name is required.');
      return;
    }
    if (!catalogModalData.unit) {
      setCatalogModalError('Unit is required.');
      return;
    }

    setSavingCatalogItem(true);
    setCatalogModalError('');

    try {
      const payload = {
        name: catalogModalData.name.trim(),
        unit: catalogModalData.unit.trim().toUpperCase(),
        category: catalogModalData.category || 'General',
        sku: catalogModalData.sku ? catalogModalData.sku.trim() : null,
        costPrice: parseFloat(catalogModalData.costPrice) || 0.0,
        minThreshold: parseFloat(catalogModalData.minThreshold) || 10.0,
        maxThreshold: parseFloat(catalogModalData.maxThreshold) || 100.0,
        stockLevel: 0.0, // Strictly 0.0 initial stock! Catalog creation must NOT increase stock!
        branchId: catalogModalData.branchId ? parseInt(catalogModalData.branchId, 10) : undefined,
        supplierId: catalogModalData.supplierId ? parseInt(catalogModalData.supplierId, 10) : undefined
      };

      const res = await api.post('/inventory', payload);
      const createdItem = res.data?.item;

      if (createdItem) {
        // 1. Add to local inventory state
        setLocalInventory(prev => [...prev, createdItem]);

        // 2. Link the corresponding receiving row
        if (catalogModalRowIndex !== null) {
          const index = catalogModalRowIndex;
          setReceivingRows(prev => {
            const updated = [...prev];
            updated[index] = {
              ...updated[index],
              inventoryItemId: String(createdItem.id),
              searchTerm: createdItem.name,
              unit: createdItem.unit,
              isUnmatched: false,
              justSavedToCatalog: true,
              showSearchDropdown: false
            };
            return updated;
          });
        }

        // 3. Trigger parent dashboard refresh
        if (onRefresh) onRefresh();

        if (showToast) showToast(`"${createdItem.name}" saved in catalog and linked.`, 'success');
        setCatalogModalOpen(false);
        setCatalogModalRowIndex(null);
        setCatalogModalDuplicateItem(null);
      }
    } catch (err) {
      console.error('Save item to catalog error:', err);
      const errorMsg = err.response?.data?.error || 'Failed to save item in catalog.';
      setCatalogModalError(errorMsg);
      if (err.response?.data?.existingItem) {
        setCatalogModalDuplicateItem(err.response.data.existingItem);
      }
    } finally {
      setSavingCatalogItem(false);
    }
  };

  // Bulk save all new items in catalog
  const handleSaveAllNewItemsInCatalog = async () => {
    if (bulkSavingCatalog) return;

    // 1. Gather all unsaved new items
    const newItemsToSave = [];
    const validationErrors = [];

    receivingRows.forEach((row, idx) => {
      if (!row.inventoryItemId) {
        const name = (row.searchTerm || '').trim();
        const unit = normalizeUnit(row.unit || 'KG');
        if (!name) {
          validationErrors.push(`Item #${idx + 1} is missing an item name.`);
        } else {
          newItemsToSave.push({
            rowIndex: idx,
            name,
            unit,
            category: 'General',
            sku: null,
            costPrice: parseFloat(row.unitCost) || 0.0,
            minThreshold: 10.0,
            maxThreshold: 100.0,
            supplierId: supplierId ? parseInt(supplierId, 10) : null,
            expiryDate: row.expiryDate || null
          });
        }
      }
    });

    if (validationErrors.length > 0) {
      if (showToast) showToast(`Please correct errors: ${validationErrors[0]}`, 'error');
      return;
    }

    if (newItemsToSave.length === 0) {
      if (showToast) showToast('All items are already saved in the catalog.', 'info');
      return;
    }

    setBulkSavingCatalog(true);

    try {
      const payload = {
        branchId: branchId ? parseInt(branchId, 10) : undefined,
        items: newItemsToSave
      };

      const res = await api.post('/inventory/bulk', payload);
      const results = res.data?.results || [];
      const summary = res.data?.summary || { total: newItemsToSave.length, savedCount: 0, failedCount: 0 };

      const newlyCreatedItems = [];
      const updatedRows = [...receivingRows];

      results.forEach(r => {
        if (r.success && r.item) {
          newlyCreatedItems.push(r.item);
          const targetIdx = r.index;
          if (targetIdx !== undefined && updatedRows[targetIdx]) {
            updatedRows[targetIdx] = {
              ...updatedRows[targetIdx],
              inventoryItemId: String(r.item.id),
              searchTerm: r.item.name,
              unit: r.item.unit || updatedRows[targetIdx].unit,
              isUnmatched: false,
              justSavedToCatalog: true,
              showSearchDropdown: false
            };
          }
        }
      });

      setReceivingRows(updatedRows);

      if (newlyCreatedItems.length > 0) {
        setLocalInventory(prev => {
          const ids = new Set(prev.map(i => i.id));
          const toAdd = newlyCreatedItems.filter(i => !ids.has(i.id));
          return [...prev, ...toAdd];
        });
        if (onRefresh) onRefresh();
      }

      if (summary.failedCount === 0) {
        if (showToast) {
          showToast(
            `All ${summary.savedCount} new items saved to catalog successfully!`,
            'success'
          );
        }
      } else {
        if (showToast) {
          showToast(
            `${summary.total} new items processed: ${summary.savedCount} saved successfully, ${summary.failedCount} need correction.`,
            summary.savedCount > 0 ? 'warning' : 'error'
          );
        }
      }
    } catch (err) {
      console.error('Bulk save catalog error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Failed to bulk save items to catalog.', 'error');
    } finally {
      setBulkSavingCatalog(false);
    }
  };

  // Process Excel/CSV Upload directly & populate Review Stock rows
  const handleExcelUpload = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      if (showToast) showToast('Invalid file format. Upload a .csv, .xlsx, or .xls file.', 'error');
      return;
    }

    setParsingCsv(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // For CSV send as rawText, for xlsx/xls send as base64
          const payload = ext === 'csv'
            ? { rawText: e.target.result, fileName: file.name }
            : { fileBase64: e.target.result, fileName: file.name };

          const res = await api.post('/inventory/receivings/import/preview', payload);

          if (res.data) {
            const rawMatched = res.data.matchedItems || [];
            const rawUnmatched = res.data.unmatchedItems || [];
            
            // Map rows and combine duplicate items by inventoryItemId (or name+cost)
            const rowMap = new Map();
            const processRow = (raw, isMatched) => {
              // Use inventoryItemId as key for matched items to avoid duplicates
              const itemId = raw.inventoryItemId ? String(raw.inventoryItemId) : null;
              const nameKey = (raw.name || raw.matchedName || raw.rawName || '').toLowerCase().trim();
              const costKey = parseFloat(raw.unitCost) || 0;
              const mapId = itemId ? `id_${itemId}` : `${nameKey}_${costKey}`;

              if (rowMap.has(mapId)) {
                // Merge: add quantities for same item
                const existing = rowMap.get(mapId);
                existing.quantity = parseFloat(existing.quantity) + (parseFloat(raw.quantity) || 0);
              } else {
                const unitKey = normalizeUnit(raw.unit || raw.systemUnit);
                let expiryStr = '';
                if (raw.expiryDate) {
                  try {
                    expiryStr = new Date(raw.expiryDate).toISOString().split('T')[0];
                  } catch (_) {
                    expiryStr = String(raw.expiryDate);
                  }
                }
                const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
                const rowRand = Math.floor(1000 + Math.random() * 9000);
                const autoBatch = (raw.batchNumber && String(raw.batchNumber).trim() !== '')
                  ? String(raw.batchNumber).trim()
                  : `BATCH-${dateStr}-${rowRand}`;

                rowMap.set(mapId, {
                  inventoryItemId: itemId || '',
                  searchTerm: raw.name || raw.matchedName || raw.rawName || '',
                  showSearchDropdown: false,
                  quantity: parseFloat(raw.quantity) || 1,
                  unit: unitKey,
                  unitCost: costKey,
                  batchNumber: autoBatch,
                  expiryDate: expiryStr,
                  notes: '',
                  showMoreDetails: true,
                  isAiDetected: false,
                  confidence: raw.confidence || 0.9,
                  isUnmatched: !isMatched
                });
              }
            };

            rawMatched.forEach(m => processRow(m, true));
            rawUnmatched.forEach(u => processRow(u, false));

            const newRows = Array.from(rowMap.values());

            if (newRows.length === 0) {
              if (showToast) showToast('No valid items found in the file.', 'error');
            } else {
              setReceivingRows(newRows);
              setReceivingMethod('MANUAL'); // Switch to Review Stock screen

              // Auto-generate Header Reference and Invoice # if empty
              const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
              if (!receivingRef) {
                const randRef = Math.floor(1000 + Math.random() * 9000);
                setReceivingRef(`RCV-${dateStr}-${randRef}`);
              }
              if (!supplierInvoiceNumber) {
                const ms = String(Date.now()).slice(-6);
                setSupplierInvoiceNumber(`INV-${dateStr}-${ms}`);
              }
              const matchedCount = newRows.filter(r => !r.isUnmatched).length;
              const unmatchedCount = newRows.filter(r => r.isUnmatched).length;
              if (showToast) {
                const msg = unmatchedCount > 0
                  ? `Imported ${newRows.length} items: ${matchedCount} matched ✓, ${unmatchedCount} need manual selection.`
                  : `All ${newRows.length} items matched and imported! Review below.`;
                showToast(msg, unmatchedCount > 0 ? 'warning' : 'success');
              }
            }
          }
        } catch (err) {
          console.error('Excel import error:', err);
          if (showToast) showToast('Failed to parse the file. Please check the format and try again.', 'error');
        } finally {
          setParsingCsv(false);
        }
      };

      if (ext === 'csv') reader.readAsText(file);
      else reader.readAsDataURL(file);
    } catch (err) {
      setParsingCsv(false);
      if (showToast) showToast('Error reading uploaded file.', 'error');
    }
  };

  // --- AI / OCR Invoice Extraction Core ---
  const runOcrExtraction = async (dataUrl, fileName) => {
    setExtractingOcr(true);
    try {
      const selectedSup = suppliers.find(s => String(s.id) === String(supplierId));
      const res = await api.post('/inventory/receivings/ocr-preview', {
        fileBase64: dataUrl,
        fileName: fileName,
        supplierName: selectedSup ? selectedSup.name : ''
      });

      if (res.data) {
        // Extract metadata
        if (res.data.supplierName) {
          setAiDetectedSupplier(res.data.supplierName);
          const matchedSup = suppliers.find(s => 
            s.name.toLowerCase().includes(res.data.supplierName.toLowerCase()) ||
            res.data.supplierName.toLowerCase().includes(s.name.toLowerCase())
          );
          if (matchedSup) {
            setSupplierId(String(matchedSup.id));
          }
        }

        if (res.data.invoiceNumber) {
          setSupplierInvoiceNumber(res.data.invoiceNumber);
          setAiDetectedInvoiceNumber(res.data.invoiceNumber);
        }

        if (res.data.summary?.estimatedTotalCost) {
          setAiDetectedInvoiceTotal(res.data.summary.estimatedTotalCost);
        }

        // Extract item rows with AI badges
        const newRows = [];
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');

        const processOcrItem = (item, isMatched) => {
          let expiryStr = '';
          if (item.expiryDate) {
            try { expiryStr = new Date(item.expiryDate).toISOString().split('T')[0]; }
            catch (_) { expiryStr = String(item.expiryDate); }
          }
          const rowRand = Math.floor(1000 + Math.random() * 9000);
          const autoBatch = (item.batchNumber && String(item.batchNumber).trim() !== '')
            ? String(item.batchNumber).trim()
            : `BATCH-${dateStr}-${rowRand}`;

          newRows.push({
            inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : '',
            searchTerm: item.matchedName || item.name || item.rawName || item.rawScannedName || '',
            rawScannedName: item.rawScannedName || item.rawName || '',
            showSearchDropdown: false,
            quantity: parseFloat(item.quantity) || 1,
            unit: normalizeUnit(item.unit || item.systemUnit),
            unitCost: parseFloat(item.unitCost) || 0,
            batchNumber: autoBatch,
            expiryDate: expiryStr,
            notes: '',
            showMoreDetails: true,
            isAiDetected: true,
            confidence: item.confidence || 0.85,
            isUnmatched: !isMatched,
            status: item.status || (isMatched ? 'MATCHED' : 'NEW_ITEM'),
            suggestedItem: item.suggestedItem || null,
            needsReview: Boolean(item.needsReview),
            reviewReason: item.reviewReason || null
          });
        };

        const rawMatched = res.data.matchedItems || res.data.matched || [];
        const rawUnmatched = res.data.unmatchedItems || res.data.unmatched || [];

        rawMatched.forEach(m => processOcrItem(m, true));
        rawUnmatched.forEach(u => processOcrItem(u, false));

        if (newRows.length > 0) {
          setReceivingRows(newRows);
          setShowOcrModal(false);
          setReceivingMethod('MANUAL'); // Direct to unified Review Stock

          // Auto-generate Header Reference & Supplier Invoice Number if empty
          if (!receivingRef) {
            const randRef = Math.floor(1000 + Math.random() * 9000);
            setReceivingRef(`RCV-${dateStr}-${randRef}`);
          }
          if (!supplierInvoiceNumber) {
            const ms = String(Date.now()).slice(-6);
            setSupplierInvoiceNumber(`INV-${dateStr}-${ms}`);
          }
          const matchedCount = res.data.summary?.matchedCount ?? rawMatched.length;
          const reviewCount = res.data.summary?.needsReviewCount ?? newRows.filter(r => r.needsReview).length;
          const newCount = res.data.summary?.newItemsCount ?? rawUnmatched.length;

          if (showToast) {
            const msg = `AI extracted ${newRows.length} items: ${matchedCount} matched ✓, ${newCount} new items${reviewCount > 0 ? `, ${reviewCount} need review ⚠️` : ''}.`;
            showToast(msg, reviewCount > 0 ? 'warning' : 'success');
          }
        } else {
          if (showToast) showToast('AI could not extract any items from this invoice. Please try a clearer image.', 'error');
        }
      }
    } catch (err) {
      console.error('Invoice OCR error:', err);
      if (showToast) showToast('Failed to process invoice OCR with AI.', 'error');
    } finally {
      setExtractingOcr(false);
    }
  };

  const handleOcrFileSelect = async (file) => {
    if (!file) return;
    setOcrFile(file);
    setUploadedInvoiceFileName(file.name);
    setUploadedInvoiceMimeType(file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        setUploadedInvoiceDataUrl(dataUrl);
        await runOcrExtraction(dataUrl, file.name);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setExtractingOcr(false);
      if (showToast) showToast('Error reading invoice file.', 'error');
    }
  };

  const handleRetryOcr = async () => {
    if (!uploadedInvoiceDataUrl || extractingOcr) return;
    await runOcrExtraction(uploadedInvoiceDataUrl, uploadedInvoiceFileName || 'invoice');
  };

  // Initiate Stock Receive
  const handleInitiateSubmit = (targetStatus) => {
    if (loading || savingDraft) return;

    if (targetStatus === 'DRAFT') {
      const validRows = receivingRows.filter(r => r.inventoryItemId && parseFloat(r.quantity) > 0);
      if (validRows.length === 0) {
        if (showToast) showToast('Please select at least one catalog item with a quantity to save as draft.', 'warning');
        return;
      }
      executeSubmitReceiving('DRAFT', validRows);
      return;
    }

    // For RECEIVED (Confirm & Receive Stock)
    if (receivingRows.length === 0) {
      if (showToast) showToast('Please select at least one item to receive.', 'error');
      return;
    }

    for (let i = 0; i < receivingRows.length; i++) {
      const r = receivingRows[i];
      if (!r.inventoryItemId) {
        if (showToast) showToast(`Item #${i + 1} ("${r.searchTerm || 'Unnamed'}") is not matched to catalog. Please choose an item.`, 'error');
        return;
      }
      if (!r.quantity || parseFloat(r.quantity) <= 0) {
        if (showToast) showToast(`Please enter a quantity greater than 0 for Item #${i + 1}.`, 'error');
        return;
      }
    }

    setShowConfirmModal(true);
  };

  // Final Submit Action
  const executeSubmitReceiving = async (targetStatus, rowsOverride = null) => {
    if (loading || savingDraft) return;
    setShowConfirmModal(false);
    setLoading(true);
    if (targetStatus === 'DRAFT') {
      setSavingDraft(true);
    }

    try {
      const rowsToSubmit = rowsOverride || receivingRows.filter(r => r.inventoryItemId && parseFloat(r.quantity) > 0);
      const docBatchNumber = batchNumber.trim() || null;
      const payload = {
        supplierId: supplierId ? parseInt(supplierId, 10) : null,
        branchId: branchId ? parseInt(branchId, 10) : null,
        receivingRef: receivingRef.trim(), // Internal RCV-20261006-001
        invoiceNumber: supplierInvoiceNumber.trim() || null, // External Supplier INV #
        batchNumber: docBatchNumber,
        receivingDate,
        notes: notes ? String(notes).trim() : null,
        status: targetStatus,
        items: rowsToSubmit.map(r => ({
          inventoryItemId: parseInt(r.inventoryItemId, 10),
          quantity: parseFloat(r.quantity),
          unit: r.unit,
          unitCost: parseFloat(r.unitCost) || 0,
          batchNumber: docBatchNumber || (r.batchNumber ? String(r.batchNumber).trim() : null),
          expiryDate: r.expiryDate || null,
          notes: r.notes ? String(r.notes).trim() : null
        }))
      };

      let res;
      if (editingDraftId) {
        res = await api.put(`/inventory/receivings/${editingDraftId}`, payload);
      } else {
        res = await api.post('/inventory/receivings', payload);
      }
      
      const savedRec = res.data?.receiving;

      if (targetStatus === 'DRAFT') {
        const newDraftId = savedRec?.id || editingDraftId;
        if (newDraftId) {
          setEditingDraftId(newDraftId);
          try {
            localStorage.setItem('zovikpos_active_draft_id', String(newDraftId));
          } catch (_) {}
        }
        if (showToast) {
          showToast('Draft has been saved successfully.', 'success');
        }
        setSubTab('HISTORY');
        setCompletedReceiving(null);
      } else {
        setEditingDraftId(null);
        try {
          localStorage.removeItem('zovikpos_active_draft_id');
        } catch (_) {}

        const record = {
          receivingRef: savedRec?.receivingNumber || receivingRef,
          supplierName: suppliers.find(s => String(s.id) === String(supplierId))?.name || 'Local Market / Not Provided',
          invoiceNumber: supplierInvoiceNumber || 'Not Provided',
          itemCount: rowsToSubmit.length,
          totalCost: calculatedGrandTotal
        };

        setCompletedReceiving(record);

        if (showToast) {
          showToast('Stock has been updated successfully.', 'success');
        }

        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Submit receiving error:', err);
      if (showToast) showToast(err.response?.data?.error || 'Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
      setSavingDraft(false);
    }
  };

  // Reset receiving form for next receiving
  const handleResetForNewReceiving = () => {
    setEditingDraftId(null);
    try {
      localStorage.removeItem('zovikpos_active_draft_id');
    } catch (_) {}
    setCompletedReceiving(null);
    setSupplierInvoiceNumber('');
    setAiDetectedSupplier('');
    setAiDetectedInvoiceNumber('');
    setAiDetectedInvoiceTotal(null);
    setNotes('');
    setReceivingRef('');
    setRefClickSeq(0);
    setReceivingRows([
      {
        inventoryItemId: '',
        searchTerm: '',
        showSearchDropdown: false,
        quantity: 1,
        unit: 'KG',
        unitCost: 0,
        batchNumber: '',
        expiryDate: '',
        notes: '',
        showMoreDetails: false,
        isAiDetected: false,
        confidence: 1.0,
        isUnmatched: false
      }
    ]);
  };

  // Confirm existing Draft from History
  const handleConfirmDraft = async (receivingId) => {
    if (loading || savingDraft) return;
    setLoading(true);
    try {
      const res = await api.post(`/inventory/receivings/${receivingId}/receive`);
      if (showToast) showToast('Stock has been updated successfully.', 'success');
      if (String(editingDraftId) === String(receivingId)) {
        setEditingDraftId(null);
        try {
          localStorage.removeItem('zovikpos_active_draft_id');
        } catch (_) {}
      }
      fetchReceivings();
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to confirm draft', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Upper Navigation & Mode Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--card-bg)] p-4 sm:p-5 rounded-3xl border border-[var(--border-color)] shadow-sm">
        <div>
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-orange-500/10 text-orange-400"><PackageCheck className="w-5 h-5" /></span>
            Receive Stock
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Log incoming inventory items, verify purchase costs, and update stock balances.
          </p>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => { setSubTab('NEW_RECEIVING'); setCompletedReceiving(null); }}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center space-x-2 border ${
              subTab === 'NEW_RECEIVING'
                ? 'bg-orange-600 text-white border-orange-600 shadow-md'
                : 'bg-[var(--bg-color)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)]'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Receiving</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('HISTORY')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center space-x-2 border ${
              subTab === 'HISTORY'
                ? 'bg-orange-600 text-white border-orange-600 shadow-md'
                : 'bg-[var(--bg-color)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)]'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Receiving History</span>
          </button>
        </div>
      </div>

      {subTab === 'NEW_RECEIVING' && (
        <div>
          {/* SUCCESS SCREEN */}
          {completedReceiving ? (
            <div className="bg-[var(--card-bg)] border-2 border-emerald-500/40 rounded-3xl p-8 text-center space-y-6 shadow-2xl animate-scale-up max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-black text-[var(--text-main)] font-display">Stock Received Successfully!</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Inventory balances have been updated and purchase costs recorded.
                </p>
              </div>

              <div className="bg-[var(--bg-color)]/60 border border-[var(--border-color)] p-4 rounded-2xl space-y-2 text-xs text-left font-medium">
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                  <span className="text-[var(--text-muted)]">Receiving Reference:</span>
                  <span className="font-mono font-bold text-orange-400">{completedReceiving.receivingRef}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                  <span className="text-[var(--text-muted)]">Supplier:</span>
                  <span className="font-bold text-[var(--text-main)]">{completedReceiving.supplierName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                  <span className="text-[var(--text-muted)]">Supplier Invoice #:</span>
                  <span className="font-mono font-semibold text-[var(--text-main)]">{completedReceiving.invoiceNumber}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                  <span className="text-[var(--text-muted)]">Items Added:</span>
                  <span className="font-bold text-orange-400">{completedReceiving.itemCount} items</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--text-muted)]">Total Cost:</span>
                  <span className="font-mono font-black text-emerald-400 text-sm">Rs. {completedReceiving.totalCost.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setSubTab('HISTORY')}
                  className="px-5 py-3 rounded-2xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-main)] hover:border-orange-500/50 cursor-pointer"
                >
                  View Receiving Records
                </button>
                {onNavigateToCatalog && (
                  <button
                    type="button"
                    onClick={onNavigateToCatalog}
                    className="px-5 py-3 rounded-2xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-main)] hover:border-orange-500/50 cursor-pointer"
                  >
                    View Inventory Catalog
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetForNewReceiving}
                  className="px-6 py-3 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-lg shadow-orange-600/20 cursor-pointer"
                >
                  Receive More Stock
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">

              {/* Active Draft Banner */}
              {editingDraftId && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-scale-up">
                  <div className="flex items-center space-x-3.5">
                    <span className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="text-xs sm:text-sm font-black text-amber-300">
                        Editing Draft #{editingDraftId} {receivingRef ? `(${receivingRef})` : ''}
                      </p>
                      <p className="text-[11px] text-amber-200/70 mt-0.5">
                        Working on an existing draft. Click &quot;Save Draft&quot; to keep updating or &quot;Confirm &amp; Receive Stock&quot; to finalize.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetForNewReceiving}
                    className="px-4 py-2 rounded-2xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Discard &amp; Start Blank
                  </button>
                </div>
              )}

              {/* Section 1: Receiving Method Cards */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-4 sm:p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-[11px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                    1. Choose Receiving Method
                  </label>
                  <span className="text-[10px] text-orange-400 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 inline" /> All methods use the same smart review & validation system
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Method 1: Add Items Manually */}
                  <button
                    type="button"
                    onClick={() => setReceivingMethod('MANUAL')}
                    className={`p-4 rounded-2xl border transition-all text-left flex items-center space-x-3 cursor-pointer ${
                      receivingMethod === 'MANUAL'
                        ? 'bg-orange-500/10 border-orange-500 text-orange-400 ring-2 ring-orange-500/20'
                        : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-orange-500/50'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 shrink-0">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[var(--text-main)]">Add Items Manually</h4>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Enter items and quantities using touch-friendly form.</p>
                    </div>
                  </button>

                  {/* Method 2: Upload Excel / CSV */}
                  <button
                    type="button"
                    onClick={() => setReceivingMethod('EXCEL')}
                    className={`p-4 rounded-2xl border transition-all text-left flex items-center space-x-3 cursor-pointer ${
                      receivingMethod === 'EXCEL'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/20'
                        : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-emerald-500/50'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[var(--text-main)]">Upload Excel / CSV</h4>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Upload stock Excel file and auto-match catalog items.</p>
                    </div>
                  </button>

                  {/* Method 3: Upload Invoice (AI / OCR) */}
                  <button
                    type="button"
                    onClick={() => {
                      setReceivingMethod('INVOICE');
                      setShowOcrModal(true);
                    }}
                    className={`p-4 rounded-2xl border transition-all text-left flex items-center space-x-3 cursor-pointer ${
                      receivingMethod === 'INVOICE'
                        ? 'bg-purple-500/10 border-purple-500 text-purple-400 ring-2 ring-purple-500/20'
                        : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-purple-500/50'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[var(--text-main)]">Upload Invoice</h4>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Upload paper bill, image, or PDF for AI recognition.</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Excel Dropzone Panel */}
              {receivingMethod === 'EXCEL' && (
                <div className="bg-[var(--card-bg)] border-2 border-emerald-500/30 rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm animate-scale-up">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[var(--border-color)] pb-3">
                    <div>
                      <h3 className="text-base font-black text-[var(--text-main)] flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                        Upload Stock from Excel
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Use our simple 4-column format. The system reads and auto-matches items into Review Stock.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadEasyExcelTemplate}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center space-x-2 shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Easy Excel Format</span>
                    </button>
                  </div>

                  <div className="p-6 rounded-2xl bg-[var(--bg-color)] border-2 border-dashed border-emerald-500/40 text-center space-y-3">
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={(e) => handleExcelUpload(e.target.files[0])}
                      className="hidden"
                      id="excelFileInputDirect"
                    />
                    <label htmlFor="excelFileInputDirect" className="cursor-pointer space-y-2 block">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-sm font-black text-[var(--text-main)] block">Click to select or drag Excel / CSV file here</span>
                        <span className="text-[11px] text-[var(--text-muted)] block mt-0.5">Columns: Item Name, Quantity, Unit, Cost per Unit</span>
                      </div>
                    </label>
                  </div>

                  {parsingCsv && (
                    <div className="text-center py-3 text-xs font-bold text-emerald-400 animate-pulse">
                      Reading Excel file and auto-matching catalog items...
                    </div>
                  )}
                </div>
              )}

              {/* Section 2: Supplier & Receiving Details Card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-orange-400" />
                  Receiving Details
                </h3>

                {/* AI Detected Supplier Suggestion Banner */}
                {aiDetectedSupplier && !supplierId && (
                  <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>
                        AI detected supplier on invoice: <strong className="text-purple-400">{aiDetectedSupplier}</strong>
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)]">Select matching supplier below or leave as Local Market.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  
                  {/* Internal Receiving Reference (Dynamic DB Sequence) */}
                  <div>
                    <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px] flex justify-between items-center">
                      <span>Internal Reference *</span>
                      <span className="text-[10px] text-orange-400 font-normal lowercase">Auto-generated</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={receivingRef}
                        onChange={(e) => setReceivingRef(e.target.value)}
                        placeholder="Click 🔄 icon to generate..."
                        className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => generateAutoRef()}
                        title="Click to generate a new unique Internal Reference number"
                        className="absolute right-2 p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Shipment Batch Number (Applies to all receiving items) */}
                  <div>
                    <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px] flex justify-between items-center">
                      <span>Shipment Batch Number</span>
                      <span className="text-[10px] text-orange-400 font-normal lowercase">All Items Same Batch</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={batchNumber}
                        onChange={(e) => {
                          const newBatch = e.target.value;
                          setBatchNumber(newBatch);
                          setReceivingRows((prev) => prev.map((r) => ({ ...r, batchNumber: newBatch })));
                        }}
                        placeholder="e.g. BATCH-001"
                        className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
                          const rand = Math.floor(1000 + Math.random() * 9000);
                          const newBatch = `BATCH-${dateStr}-${rand}`;
                          setBatchNumber(newBatch);
                          setReceivingRows((prev) => prev.map((r) => ({ ...r, batchNumber: newBatch })));
                          if (showToast) showToast(`Shipment Batch # Generated: ${newBatch}`, 'info');
                        }}
                        title="Generate auto batch number for all receiving items"
                        className="absolute right-2 p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Supplier Dropdown */}
                  <div>
                    <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px] flex justify-between items-center">
                      <span>Supplier</span>
                      {aiDetectedSupplier && <span className="text-[10px] text-purple-400 font-normal flex items-center gap-1"><Sparkles className="w-3 h-3 inline" /> AI Detected</span>}
                    </label>
                    <select
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                    >
                      <option value="">-- Local Market / Sabzi Mandi (Not Provided) --</option>
                      {suppliers.map((sup) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Supplier Invoice # */}
                  <div>
                    <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px] flex justify-between items-center">
                      <span>Supplier Invoice #</span>
                      {aiDetectedInvoiceNumber ? (
                        <span className="text-[10px] text-purple-400 font-normal flex items-center gap-1"><Sparkles className="w-3 h-3 inline" /> AI Detected</span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-normal lowercase">(Optional)</span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={supplierInvoiceNumber}
                        onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                        placeholder="Not Provided (e.g. INV-45892)"
                        className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={generateAutoInvoiceNum}
                        title="Auto-generate unique Supplier Invoice #"
                        className="absolute right-2 p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Branch */}
                  <div>
                    <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                      Branch
                    </label>
                    <select
                      value={branchId}
                      onChange={(e) => setBranchId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                    >
                      {branchesList.length > 0 ? (
                        branchesList.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))
                      ) : (
                        <option value="">Default Branch</option>
                      )}
                    </select>
                  </div>

                  {/* Receiving Date */}
                  <div>
                    <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                      Receiving Date
                    </label>
                    <input
                      type="date"
                      value={receivingDate}
                      onChange={(e) => setReceivingDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* AI Invoice Total Verification Box */}
              {aiDetectedInvoiceTotal !== null && (
                <div className="bg-[var(--card-bg)] border border-purple-500/30 p-4 rounded-3xl space-y-1 shadow-sm">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--text-main)] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      Invoice Total Check (AI Extracted):
                    </span>
                    {Math.abs(aiDetectedInvoiceTotal - calculatedGrandTotal) < 1 ? (
                      <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Invoice Total Matches ✓ (Rs. {calculatedGrandTotal.toLocaleString()})
                      </span>
                    ) : (
                      <span className="text-amber-400 font-extrabold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Total Difference Found: Invoice Rs. {aiDetectedInvoiceTotal.toLocaleString()} vs Items Subtotal Rs. {calculatedGrandTotal.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Section 3: Unified Review Stock Items Cards */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
                <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
                  <div>
                    <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                      <Package className="w-4 h-4 text-orange-400" />
                      Review Stock ({receivingRows.length} Items)
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Check and correct any extracted quantities, costs, batch # or expiry dates before confirming.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="px-3.5 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-extrabold transition-all cursor-pointer flex items-center space-x-1.5 border border-orange-500/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Item</span>
                  </button>
                </div>

                {/* Top Summary Bar: Total Items | Matched Items | Suggested | New Items | Needs Review */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--bg-color)]/80 border border-[var(--border-color)]">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
                      <span className="text-xs font-black text-[var(--text-main)]">
                        {totalItemsCount} Total Items
                      </span>
                    </div>
                    <span className="text-[var(--text-muted)] text-xs">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                      <span className="text-xs font-black text-emerald-400">
                        {matchedItemsCount} Matched Items
                      </span>
                    </div>
                    {reviewMatchCount > 0 && (
                      <>
                        <span className="text-[var(--text-muted)] text-xs">|</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
                          <span className="text-xs font-black text-purple-400">
                            {reviewMatchCount} Suggested
                          </span>
                        </div>
                      </>
                    )}
                    <span className="text-[var(--text-muted)] text-xs">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                      <span className="text-xs font-black text-amber-400">
                        {newItemsCount} New Items
                      </span>
                    </div>
                    {needsReviewCount > 0 && (
                      <>
                        <span className="text-[var(--text-muted)] text-xs">|</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
                          <span className="text-xs font-black text-rose-400">
                            {needsReviewCount} Needs Review
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* View Original Uploaded Invoice Button */}
                    {uploadedInvoiceDataUrl && (
                      <button
                        type="button"
                        onClick={() => setShowInvoicePreviewModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        title="View the original uploaded invoice image or PDF"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Invoice</span>
                      </button>
                    )}

                    {/* Re-scan / Retry Extraction Button */}
                    {uploadedInvoiceDataUrl && (
                      <button
                        type="button"
                        onClick={handleRetryOcr}
                        disabled={extractingOcr || bulkSavingCatalog || loading || savingDraft}
                        className="px-3 py-1.5 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--border-color)]/30 text-[var(--text-main)] border border-[var(--border-color)] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Re-run AI OCR on the current invoice without duplicate rows"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${extractingOcr ? 'animate-spin' : ''}`} />
                        <span>{extractingOcr ? 'Re-scanning...' : 'Re-scan'}</span>
                      </button>
                    )}

                    {newItemsCount > 0 && (
                      <button
                        type="button"
                        onClick={handleSaveAllNewItemsInCatalog}
                        disabled={bulkSavingCatalog || loading || savingDraft}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                      >
                        {bulkSavingCatalog ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving {newItemsCount} New Items...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Save All New Items in Catalog</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Unmatched / New Items Warning Banner */}
                {newItemsCount > 0 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-black text-amber-400">
                        {newItemsCount} item(s) are new and not yet in your inventory catalog.
                      </span>
                      <span className="text-[var(--text-muted)] ml-1">
                        Save them individually using the "Save in Catalog" button on each row, or click "Save All New Items in Catalog" below.
                      </span>
                    </div>
                  </div>
                )}

                {/* List of Stacked Item Cards */}
                <div className="space-y-4">
                  {receivingRows.map((row, index) => {
                    const selectedInvItem = localInventory.find(i => String(i.id) === String(row.inventoryItemId));
                    const lineSubtotal = (parseFloat(row.quantity) || 0) * (parseFloat(row.unitCost) || 0);
                    const costDifference = selectedInvItem && row.unitCost > 0 && selectedInvItem.costPrice !== row.unitCost;

                    return (
                      <div
                        key={index}
                        className={`p-4 sm:p-5 rounded-2xl bg-[var(--bg-color)]/60 border space-y-4 relative transition-all ${
                          row.needsReview
                            ? 'border-rose-500/50 bg-rose-500/5'
                            : row.isUnmatched
                            ? 'border-amber-500/60 bg-amber-500/5'
                            : row.isAiDetected
                            ? 'border-purple-500/40 bg-purple-500/5'
                            : 'border-[var(--border-color)] hover:border-orange-500/30'
                        }`}
                      >
                        {/* Card Top: Number, Item Input & Badges */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="flex items-center space-x-2 w-full sm:w-auto">
                            <span className="w-6 h-6 rounded-full bg-orange-500/10 text-orange-400 font-extrabold text-[11px] flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>

                            {/* Searchable Autocomplete Item Input */}
                            <div className="relative flex-1 sm:w-80">
                              <input
                                type="text"
                                value={row.searchTerm}
                                onFocus={() => handleRowChange(index, 'showSearchDropdown', true)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    handleRowChange(index, 'showSearchDropdown', false);
                                  }, 250);
                                }}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handleRowChange(index, 'searchTerm', val);
                                  handleRowChange(index, 'inventoryItemId', ''); // clear match when typing
                                  handleRowChange(index, 'isUnmatched', true);
                                  handleRowChange(index, 'suggestedItem', null);
                                  handleRowChange(index, 'showSearchDropdown', true);

                                  const exactMatch = localInventory.find(i => i.name.toLowerCase().trim() === val.toLowerCase().trim());
                                  if (exactMatch) {
                                    handleSelectItem(index, exactMatch);
                                  }
                                }}
                                placeholder={!row.inventoryItemId && row.searchTerm ? `"${row.searchTerm}" – click "Save in Catalog" or match...` : 'Search or select catalog item...'}
                                className={`w-full pl-8 pr-3 py-2 bg-[var(--card-bg)] border rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none ${
                                  row.needsReview
                                    ? 'border-rose-500/60 focus:border-rose-500'
                                    : !row.inventoryItemId
                                    ? 'border-amber-500/60 focus:border-amber-500'
                                    : 'border-[var(--border-color)] focus:border-orange-500'
                                }`}
                              />
                              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--text-muted)]" />

                              {/* Autocomplete Dropdown List */}
                              {row.showSearchDropdown && (
                                <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-[var(--border-color)]">
                                  {(() => {
                                    const q = (row.searchTerm || '').toLowerCase().trim();
                                    const matches = localInventory.filter(i => {
                                      if (!q) return true;
                                      const nameMatch = i.name.toLowerCase().includes(q);
                                      const catMatch = i.category?.toLowerCase().includes(q);
                                      
                                      let aliasMatch = false;
                                      for (const [alias, targets] of Object.entries(ITEM_ALIASES)) {
                                        if (alias.includes(q) && targets.some(t => i.name.toLowerCase().includes(t))) {
                                          aliasMatch = true;
                                          break;
                                        }
                                      }
                                      return nameMatch || catMatch || aliasMatch;
                                    });

                                    if (matches.length === 0) {
                                      return (
                                        <div className="p-3 text-center text-[var(--text-muted)] text-[11px]">
                                          No item matching "<span className="text-[var(--text-main)] font-semibold">{row.searchTerm}</span>".
                                        </div>
                                      );
                                    }

                                    return matches.map((item) => (
                                      <button
                                        key={item.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleSelectItem(index, item)}
                                        className="w-full text-left px-3 py-2 hover:bg-orange-500/10 transition-colors flex items-center justify-between cursor-pointer"
                                      >
                                        <div>
                                          <span className="font-bold text-[var(--text-main)]">{item.name}</span>
                                          <span className="ml-2 text-[10px] text-[var(--text-muted)]">({item.category || 'General'})</span>
                                        </div>
                                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-[var(--bg-color)] text-orange-400 border border-orange-500/20">
                                          {item.unit || 'KG'}
                                        </span>
                                      </button>
                                    ));
                                  })()}
                                </div>
                              )}

                              {/* Scanned vs Matched Name Context */}
                              {row.rawScannedName && row.rawScannedName.toLowerCase().trim() !== (row.searchTerm || '').toLowerCase().trim() && (
                                <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate" title={`Scanned: "${row.rawScannedName}"`}>
                                  Scanned as: <span className="text-[var(--text-main)] font-semibold font-mono">"{row.rawScannedName}"</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Badges & Actions: AI Detected / 4 Distinct Statuses / Save in Catalog */}
                          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                            {row.isAiDetected && (
                              <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-400 text-[9px] font-black uppercase tracking-wider border border-purple-500/30 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" /> AI Detected
                              </span>
                            )}

                            {/* Status 4: Needs Review / Ambiguous */}
                            {row.needsReview && (
                              <span
                                className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-400 text-[9px] font-bold border border-rose-500/30 flex items-center gap-1"
                                title={row.reviewReason || 'Unclear text or digits detected'}
                              >
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span>Needs Review{row.reviewReason ? `: ${row.reviewReason}` : ''}</span>
                              </span>
                            )}

                            {/* Status 2: Suggested Match (Needs Admin Confirmation) */}
                            {!row.inventoryItemId && row.suggestedItem ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-2.5 py-1 rounded-xl bg-purple-500/15 text-purple-300 text-[10px] font-bold border border-purple-500/30 flex items-center gap-1">
                                  <Search className="w-3 h-3 text-purple-400" />
                                  <span>Suggested: <strong className="text-white font-extrabold">{row.suggestedItem.name}</strong> ({Math.round((row.confidence || 0.7) * 100)}%)</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSelectItem(index, row.suggestedItem)}
                                  className="px-2 py-1 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black shadow-sm transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                                  title={`Accept suggestion "${row.suggestedItem.name}"`}
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accept Suggestion</span>
                                </button>
                              </div>
                            ) : null}

                            {/* Status 3: New Item (Not in Catalog) */}
                            {!row.inventoryItemId && !row.suggestedItem ? (
                              <>
                                <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider border border-amber-500/30 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> New Item
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenSaveCatalogModal(index)}
                                  className="px-2.5 py-1 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-black shadow-sm transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                                  title="Save this new item into Inventory Catalog"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Save in Catalog</span>
                                </button>
                              </>
                            ) : null}

                            {/* Status 1: Confident Catalog Match */}
                            {row.inventoryItemId && row.justSavedToCatalog ? (
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Added to Catalog
                              </span>
                            ) : row.inventoryItemId && selectedInvItem ? (
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/20 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Matched ({selectedInvItem.category || 'General'})
                              </span>
                            ) : row.inventoryItemId ? (
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/20 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Matched
                              </span>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => handleRemoveRow(index)}
                              className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer border border-rose-500/20"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Card Fields: Quantity, Unit, Cost per Unit, Subtotal */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-1 border-t border-[var(--border-color)]/60">
                          
                          {/* Quantity & Unit */}
                          <div>
                            <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                              Quantity Received *
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                step="any"
                                min="0.01"
                                value={row.quantity}
                                onChange={(e) => handleRowChange(index, 'quantity', e.target.value)}
                                placeholder="0"
                                className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                              />
                              <select
                                value={row.unit}
                                onChange={(e) => handleRowChange(index, 'unit', e.target.value)}
                                className="px-2.5 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                              >
                                <option value="KG">KG</option>
                                <option value="G">G</option>
                                <option value="L">L</option>
                                <option value="ML">ML</option>
                                <option value="PCS">PCS</option>
                                <option value="DOZEN">DOZEN</option>
                                <option value="BOX">BOX</option>
                                <option value="PACK">PACK</option>
                                <option value="BOTTLE">BOTTLE</option>
                                <option value="BAG">BAG</option>
                              </select>
                            </div>
                          </div>

                          {/* Cost per Unit */}
                          <div>
                            <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                              Cost per Unit (Rs.)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={row.unitCost}
                              onChange={(e) => handleRowChange(index, 'unitCost', e.target.value)}
                              placeholder="0"
                              className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                            />
                            <span className="text-[9px] text-[var(--text-muted)] block mt-0.5">
                              Cost for 1 {row.unit || 'Unit'}
                            </span>
                          </div>

                          {/* Subtotal */}
                          <div className="flex flex-col items-start sm:items-end justify-center bg-[var(--card-bg)]/80 p-2.5 rounded-xl border border-[var(--border-color)]">
                            <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider">
                              Subtotal
                            </span>
                            <span className="text-base font-black text-orange-400 font-mono">
                              Rs. {lineSubtotal.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Cost Changed Alert */}
                        {costDifference && (
                          <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-semibold">
                            <Info className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Cost changed â€” Catalog cost: <strong>Rs. {selectedInvItem.costPrice} / {selectedInvItem.unit}</strong> âž” Received cost: <strong>Rs. {row.unitCost} / {row.unit}</strong>
                            </span>
                          </div>
                        )}

                        {/* Always Visible Batch Number & Expiry Date */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[var(--border-color)]/50">
                          <div>
                            <label className="block font-extrabold text-[var(--text-muted)] uppercase mb-1 text-[9px] flex justify-between items-center">
                              <span>Batch Number (Optional)</span>
                            </label>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={row.batchNumber || ''}
                                onChange={(e) => handleRowChange(index, 'batchNumber', e.target.value)}
                                placeholder="Click 🔄 to generate..."
                                className="w-full pl-3 pr-8 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-semibold"
                              />
                              <button
                                type="button"
                                onClick={() => generateAutoBatchForRow(index)}
                                title="Click to generate a unique Batch Number"
                                className="absolute right-1.5 p-1 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block font-extrabold text-[var(--text-muted)] uppercase mb-1 text-[9px]">
                              Expiry Date (Optional)
                            </label>
                            <input
                              type="date"
                              value={row.expiryDate || ''}
                              onChange={(e) => handleRowChange(index, 'expiryDate', e.target.value)}
                              className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer font-semibold"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="w-full py-3 rounded-2xl border-2 border-dashed border-[var(--border-color)] hover:border-orange-500/50 text-[var(--text-muted)] hover:text-orange-400 text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Another Item</span>
                  </button>
                </div>

                {/* Bulk Save in Catalog Callout at the bottom of preview */}
                {newItemsCount > 0 && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row justify-between items-center gap-4 mt-3">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider">
                          {newItemsCount} New Item(s) Not In Catalog
                        </h4>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Save all valid new items to your catalog in one click. Catalog items are created with 0 initial stock until you confirm stock receiving.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveAllNewItemsInCatalog}
                      disabled={bulkSavingCatalog || loading || savingDraft}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-black shadow-md transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                    >
                      {bulkSavingCatalog ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving All {newItemsCount} Items to Catalog...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Save All New Items in Catalog ({newItemsCount})</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Section 4: Notes Card */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-5 space-y-2 shadow-sm">
                <label className="block font-black text-[var(--text-main)] uppercase tracking-wider text-[10px]">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Fresh stock received from supplier."
                  className="w-full px-4 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Section 5: Review Stock Summary & Action Buttons */}
              <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">
                    Stock Receiving Summary
                  </span>
                  <div className="flex items-center space-x-4 mt-1">
                    <span className="text-xs font-extrabold text-[var(--text-main)]">
                      Items: <strong className="text-orange-400">{validItemsCount}</strong>
                    </span>
                    <span className="text-xs font-extrabold text-[var(--text-main)]">
                      Total Cost: <strong className="text-emerald-400 font-mono text-sm">Rs. {calculatedGrandTotal.toLocaleString()}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleInitiateSubmit('DRAFT')}
                    disabled={loading || savingDraft}
                    className="flex-1 sm:flex-initial px-5 py-3 rounded-2xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingDraft ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-400" />
                        <span>Saving Draft...</span>
                      </>
                    ) : (
                      <span>Save Draft</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInitiateSubmit('RECEIVED')}
                    disabled={loading || savingDraft}
                    className="flex-1 sm:flex-initial px-7 py-3 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-lg shadow-orange-600/20 transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading && !savingDraft ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm & Receive Stock</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save New Item in Catalog Modal */}
      {catalogModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-scale-up max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text-main)] font-display flex items-center gap-2">
                  <span className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400">📦</span>
                  Save New Item in Catalog
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Add this extracted item to your store inventory catalog (initial stock will be 0).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCatalogModalOpen(false);
                  setCatalogModalRowIndex(null);
                  setCatalogModalDuplicateItem(null);
                }}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Duplicate / Existing Item Alert if detected */}
            {catalogModalDuplicateItem && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-black text-amber-400 block">
                      Similar Catalog Item Already Exists
                    </span>
                    <span className="text-[var(--text-muted)]">
                      "{catalogModalDuplicateItem.name}" ({catalogModalDuplicateItem.category || 'General'}, Unit: {catalogModalDuplicateItem.unit}) is already in your catalog.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleLinkExistingItem(catalogModalDuplicateItem)}
                  className="w-full py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5 border border-amber-500/30"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Link to Existing Item "{catalogModalDuplicateItem.name}"</span>
                </button>
              </div>
            )}

            {/* Error message */}
            {catalogModalError && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{catalogModalError}</span>
              </div>
            )}

            {/* Form Fields */}
            <form onSubmit={handleSaveItemToCatalog} className="space-y-4">
              {/* Item Name */}
              <div>
                <label className="block text-[10px] font-black uppercase text-[var(--text-main)] mb-1 tracking-wider">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={catalogModalData.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCatalogModalData(prev => ({ ...prev, name: val }));
                    const match = localInventory.find(i => i.name.toLowerCase().trim() === val.toLowerCase().trim());
                    setCatalogModalDuplicateItem(match || null);
                  }}
                  placeholder="e.g. Fresh Tomatoes"
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Category & Unit Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-main)] mb-1 tracking-wider">
                    Category *
                  </label>
                  <select
                    value={catalogModalData.category}
                    onChange={(e) => setCatalogModalData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    {CATALOG_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-main)] mb-1 tracking-wider">
                    Unit of Measure *
                  </label>
                  <select
                    value={catalogModalData.unit}
                    onChange={(e) => setCatalogModalData(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    {STANDARD_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SKU & Cost Price Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-main)] mb-1 tracking-wider">
                    SKU / Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={catalogModalData.sku}
                    onChange={(e) => setCatalogModalData(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="e.g. SKU-TOM-01"
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-main)] mb-1 tracking-wider">
                    Cost Price (Rs.)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={catalogModalData.costPrice}
                    onChange={(e) => setCatalogModalData(prev => ({ ...prev, costPrice: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Min & Max Thresholds */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-main)] mb-1 tracking-wider">
                    Min Stock Alert
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={catalogModalData.minThreshold}
                    onChange={(e) => setCatalogModalData(prev => ({ ...prev, minThreshold: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-[var(--text-main)] mb-1 tracking-wider">
                    Max Stock Capacity
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={catalogModalData.maxThreshold}
                    onChange={(e) => setCatalogModalData(prev => ({ ...prev, maxThreshold: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Informational note about stock separation */}
              <div className="p-3 rounded-2xl bg-[var(--bg-color)]/70 border border-[var(--border-color)] text-[11px] text-[var(--text-muted)]">
                ℹ️ <strong>Catalog Separation:</strong> This creates the catalog definition with 0 stock. Actual received quantity will only be added to stock when you click <strong>Confirm &amp; Receive Stock</strong>.
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => {
                    setCatalogModalOpen(false);
                    setCatalogModalRowIndex(null);
                    setCatalogModalDuplicateItem(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingCatalogItem}
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-lg shadow-orange-600/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingCatalogItem ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Catalog...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save to Catalog</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Modal — Confirm Stock Receiving? */}
      {showConfirmModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-black text-[var(--text-main)] font-display flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400">📦</span>
                Confirm Stock Receiving
              </h3>
              <button onClick={() => setShowConfirmModal(false)} className="p-1.5 rounded-xl bg-[var(--bg-color)]">
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>

            <div className="space-y-3 text-xs bg-[var(--bg-color)]/60 p-4 rounded-2xl border border-[var(--border-color)]">
              <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                <span className="text-[var(--text-muted)] font-semibold">Receiving Reference:</span>
                <span className="font-mono font-bold text-orange-400">{receivingRef}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                <span className="text-[var(--text-muted)] font-semibold">Supplier:</span>
                <span className="font-bold text-[var(--text-main)]">
                  {suppliers.find(s => String(s.id) === String(supplierId))?.name || 'Local Market / Not Provided'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                <span className="text-[var(--text-muted)] font-semibold">Supplier Invoice #:</span>
                <span className="font-mono font-semibold text-[var(--text-main)]">
                  {supplierInvoiceNumber || 'Not Provided'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                <span className="text-[var(--text-muted)] font-semibold">Total Items:</span>
                <span className="font-bold text-orange-400">{validItemsCount} items</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--text-muted)] font-semibold">Total Cost:</span>
                <span className="font-mono font-black text-emerald-400 text-sm">Rs. {calculatedGrandTotal.toLocaleString()}</span>
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-muted)]">
              Receiving this stock will immediately update catalog balances (New Stock = Current + Received) and save stock logs.
            </p>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] font-bold text-xs text-[var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeSubmitReceiving('RECEIVED')}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs shadow-md cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <span>Confirm & Receive Stock</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* History SubTab */}
      {subTab === 'HISTORY' && (
        <div className="space-y-4">
          <div className="bg-[var(--card-bg)] p-4 rounded-3xl border border-[var(--border-color)] flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search reference (RCV-...), supplier..."
                className="w-full pl-9 pr-4 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] font-semibold"
              />
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="RECEIVED">Received</option>
                <option value="DRAFT">Draft</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <button
                type="button"
                onClick={fetchReceivings}
                className="p-2 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                    <th className="p-4">Reference</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Supplier</th>
                    <th className="p-4">Items</th>
                    <th className="p-4">Total Cost</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {receivingsList.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-[var(--text-muted)] text-xs">
                        No receiving records found.
                      </td>
                    </tr>
                  ) : (
                    receivingsList.map((rec) => (
                      <tr key={rec.id} className="hover:bg-[var(--bg-color)]/40 transition-colors">
                        <td className="p-4 font-mono font-bold text-orange-400">
                          {rec.receivingNumber || rec.invoiceNumber}
                        </td>
                        <td className="p-4 text-[var(--text-muted)] font-medium">
                          {new Date(rec.receivingDate).toLocaleDateString()}
                        </td>
                        <td className="p-4 font-semibold text-[var(--text-main)]">
                          {rec.supplier?.name || 'Local Market / Not Provided'}
                        </td>
                        <td className="p-4 font-bold text-[var(--text-main)]">
                          {rec.items?.length || 0} items
                        </td>
                        <td className="p-4 font-mono font-black text-emerald-400">
                          Rs. {(rec.totalCost || 0).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase border ${
                            rec.status === 'RECEIVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : rec.status === 'DRAFT'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReceiving(rec);
                              setShowDetailsModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {rec.status === 'DRAFT' && (
                            <>
                              <button
                                type="button"
                                onClick={() => loadDraftIntoForm(rec)}
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 font-bold text-[10px] transition-colors cursor-pointer"
                                title="Resume and edit this draft"
                              >
                                Resume
                              </button>
                              <button
                                type="button"
                                onClick={() => handleConfirmDraft(rec.id)}
                                disabled={loading}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                                title="Confirm and update stock now"
                              >
                                {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
                                <span>Confirm</span>
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AI OCR Invoice Modal */}
      {showOcrModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-black text-[var(--text-main)] flex items-center gap-2">
                <Camera className="w-5 h-5 text-purple-400" />
                Upload Invoice (AI Recognized)
              </h3>
              <button onClick={() => setShowOcrModal(false)} className="p-1.5 rounded-xl bg-[var(--bg-color)]">
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--bg-color)] border-2 border-dashed border-[var(--border-color)] text-center space-y-2">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => handleOcrFileSelect(e.target.files[0])}
                className="hidden"
                id="ocrFileInput"
              />
              <label htmlFor="ocrFileInput" className="cursor-pointer space-y-1 block">
                <Camera className="w-8 h-8 text-purple-400 mx-auto" />
                <span className="text-xs font-bold text-[var(--text-main)] block">Upload Invoice Image or PDF</span>
                <span className="text-[10px] text-[var(--text-muted)] block">Groq AI Vision extracts supplier, invoice #, items, batch # & expiry dates into Review Stock.</span>
              </label>
            </div>

            {extractingOcr && (
              <div className="text-center py-4 text-xs font-bold text-purple-400 animate-pulse flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                Analyzing invoice image using AI...
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Receiving Details Modal */}
      {showDetailsModal && selectedReceiving && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-orange-400 font-mono">
                  {selectedReceiving.receivingNumber || selectedReceiving.invoiceNumber}
                </h3>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Received on {new Date(selectedReceiving.receivingDate).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="p-1.5 rounded-xl bg-[var(--bg-color)]">
                <X className="w-5 h-5 text-[var(--text-muted)]" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-[var(--bg-color)] p-3.5 rounded-2xl text-xs font-semibold">
              <div>Supplier: <strong className="text-[var(--text-main)] block mt-0.5">{selectedReceiving.supplier?.name || 'Local Market / Not Provided'}</strong></div>
              <div>Invoice #: <strong className="text-[var(--text-main)] font-mono block mt-0.5">{selectedReceiving.invoiceNumber || 'Not Provided'}</strong></div>
              <div>Status: <strong className="text-orange-400 block mt-0.5">{selectedReceiving.status}</strong></div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-[var(--text-muted)]">Items Received</h4>
              <div className="max-h-60 overflow-y-auto border border-[var(--border-color)] rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--bg-color)] text-[10px] uppercase text-[var(--text-muted)]">
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Cost</th>
                      <th className="p-3">Batch / Expiry</th>
                      <th className="p-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {selectedReceiving.items?.map((i) => (
                      <tr key={i.id}>
                        <td className="p-3 font-bold text-[var(--text-main)]">{i.inventoryItem?.name}</td>
                        <td className="p-3 font-mono">{i.quantity} {i.unit}</td>
                        <td className="p-3 font-mono">Rs. {i.unitCost}</td>
                        <td className="p-3 font-mono text-[10px] text-[var(--text-muted)]">
                          {i.batchNumber || 'No Batch'} | {i.expiryDate ? new Date(i.expiryDate).toLocaleDateString() : 'No Expiry'}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400 text-right">Rs. {i.totalCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setShowDetailsModal(false)} className="px-5 py-2.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs font-bold">
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Uploaded Invoice Document Modal */}
      {showInvoicePreviewModal && uploadedInvoiceDataUrl && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-base font-black text-[var(--text-main)]">
                    Original Uploaded Invoice
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {uploadedInvoiceFileName || 'Uploaded Invoice Document'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRetryOcr}
                  disabled={extractingOcr}
                  className="px-3 py-1.5 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  title="Re-run AI extraction"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${extractingOcr ? 'animate-spin' : ''}`} />
                  <span>{extractingOcr ? 'Re-scanning...' : 'Re-scan'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvoicePreviewModal(false)}
                  className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-[var(--bg-color)]/50 rounded-2xl p-2 border border-[var(--border-color)] flex items-center justify-center min-h-[350px]">
              {uploadedInvoiceMimeType.includes('pdf') || uploadedInvoiceFileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={uploadedInvoiceDataUrl}
                  title="PDF Invoice Preview"
                  className="w-full h-full min-h-[500px] rounded-xl border-0"
                />
              ) : (
                <img
                  src={uploadedInvoiceDataUrl}
                  alt="Invoice Preview"
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-md"
                />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default AdminInventoryReceivingView;


