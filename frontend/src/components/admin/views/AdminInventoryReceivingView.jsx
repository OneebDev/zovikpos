import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Tag,
} from 'lucide-react';
import api from '../../../services/api';
import { exportToCSV } from '../../../utils/exportUtils';
import { inferCategoryFromItemName, CATALOG_CATEGORIES } from '../../../utils/categoryHelper';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';

// Common local Urdu / Roman Urdu / Urdu script search aliases map for inventory lookup
const ITEM_ALIASES = {
  // Vegetables & Fresh Produce
  'aloo': ['potatoes', 'potato', 'fresh potatoes', 'alu', 'allu', 'آلو'],
  'alu': ['potatoes', 'potato', 'aloo', 'آلو'],
  'آلو': ['potatoes', 'potato', 'aloo'],
  'pyaz': ['onions', 'onion', 'pyaaz', 'piyaz', 'red onions', 'پیاز'],
  'pyaaz': ['onions', 'onion', 'pyaz', 'پیاز'],
  'piyaz': ['onions', 'onion', 'pyaz', 'پیاز'],
  'پیاز': ['onions', 'onion', 'pyaz'],
  'tamatar': ['tomatoes', 'tomato', 'tamaatar', 'ٹماٹر'],
  'tamaatar': ['tomatoes', 'tomato', 'tamatar', 'ٹماٹر'],
  'ٹماٹر': ['tomatoes', 'tomato', 'tamatar'],
  'adrak': ['ginger', 'fresh ginger', 'ادرک'],
  'ادرک': ['ginger', 'adrak'],
  'lehsan': ['garlic', 'lahsan', 'garlic paste', 'لہسن'],
  'lahsan': ['garlic', 'lehsan', 'لہسن'],
  'لہسن': ['garlic', 'lehsan'],
  'hari mirch': ['green chillies', 'green chili', 'green chilli', 'sabz mirch', 'ہری مرچ'],
  'sabz mirch': ['green chillies', 'green chili', 'hari mirch', 'ہری مرچ'],
  'ہری مرچ': ['green chillies', 'hari mirch'],
  'dhania': ['coriander', 'fresh coriander', 'hara dhania', 'dhanya', 'cilantro', 'دھنیا'],
  'hara dhania': ['coriander', 'fresh coriander', 'dhania', 'دھنیا'],
  'دھنیا': ['coriander', 'dhania'],
  'pudina': ['mint', 'fresh mint', 'podina', 'پودینہ'],
  'podina': ['mint', 'pudina', 'پودینہ'],
  'پودینہ': ['mint', 'pudina'],
  'kheera': ['cucumber', 'khira', 'کھیرا'],
  'کھیرا': ['cucumber', 'kheera'],
  'band gobi': ['cabbage', 'patta gobi', 'بند گوبھی'],
  'patta gobi': ['cabbage', 'band gobi', 'بند گوبھی'],
  'بند گوبھی': ['cabbage', 'band gobi'],
  'phool gobi': ['cauliflower', 'gobi', 'پھول گوبھی'],
  'پھول گوبھی': ['cauliflower', 'phool gobi'],
  'shimla mirch': ['capsicum', 'bell pepper', 'shimla', 'شملہ مرچ'],
  'شملہ مرچ': ['capsicum', 'shimla mirch'],
  'gajar': ['carrots', 'carrot', 'گاجر'],
  'گاجر': ['carrots', 'gajar'],
  'lemon': ['lemons', 'nimbu', 'lemo', 'لیموں'],
  'nimbu': ['lemon', 'lemons', 'لیموں'],
  'لیموں': ['lemon', 'nimbu'],
  'matar': ['peas', 'green peas', 'مٹر'],
  'مٹر': ['peas', 'matar'],
  'palak': ['spinach', 'پالک'],
  'پالک': ['spinach', 'palak'],
  'bhindi': ['okra', 'ladyfinger', 'بھنڈی'],
  'بھنڈی': ['okra', 'bhindi'],
  'baingan': ['eggplant', 'brinjal', 'بینگن'],
  'بینگن': ['eggplant', 'baingan'],

  // Poultry & Meats
  'murghi': ['chicken', 'murgi', 'whole chicken', 'مرغی'],
  'murgi': ['chicken', 'murghi', 'مرغی'],
  'مرغی': ['chicken', 'murghi'],
  'chicken': ['murghi', 'murgi', 'مرغی'],
  'murghi seena': ['chicken breast', 'chicken boneless', 'breast fillet', 'مرغی سینہ'],
  'chicken breast': ['murghi seena', 'chicken boneless', 'مرغی سینہ'],
  'مرغی سینہ': ['chicken breast', 'murghi seena'],
  'chicken boneless': ['boneless chicken', 'chicken breast', 'boti', 'مرغی بون لیس'],
  'boneless chicken': ['chicken boneless', 'chicken breast', 'مرغی بون لیس'],
  'chicken wings': ['wings', 'murghi wings', 'مرغی ونگز'],
  'wings': ['chicken wings', 'مرغی ونگز'],
  'مرغی ونگز': ['chicken wings', 'wings'],
  'chicken leg': ['chicken drumstick', 'drumstick', 'مرغی لیگ'],
  'drumstick': ['chicken leg', 'chicken drumstick', 'مرغی لیگ'],
  'chicken mince': ['chicken keema', 'chicken qeema', 'مرغی قیمہ'],
  'chicken keema': ['chicken mince', 'مرغی قیمہ'],
  'مرغی قیمہ': ['chicken mince', 'chicken keema'],
  'gosht': ['mutton', 'beef', 'meat', 'گوشت'],
  'گوشت': ['mutton', 'beef', 'meat'],
  'beef': ['bara gosht', 'bada gosht', 'بیف', 'گائے کا گوشت'],
  'bara gosht': ['beef', 'بیف'],
  'بیف': ['beef', 'bara gosht'],
  'keema': ['beef mince', 'beef keema', 'mince', 'قیمہ'],
  'qeema': ['beef mince', 'mince', 'keema', 'قیمہ'],
  'qima': ['beef mince', 'mince', 'keema', 'قیمہ'],
  'mince': ['keema', 'qeema', 'beef mince', 'chicken mince', 'قیمہ'],
  'beef mince': ['keema', 'qeema', 'قیمہ'],
  'قیمہ': ['keema', 'qeema', 'mince'],
  'mutton': ['chota gosht', 'bakra gosht', 'lamb', 'مٹن'],
  'chota gosht': ['mutton', 'مٹن'],
  'مٹن': ['mutton', 'chota gosht'],
  'machli': ['fish', 'machhli', 'مچھلی'],
  'fish': ['machli', 'مچھلی'],
  'مچھلی': ['fish', 'machli'],
  'jheenga': ['prawns', 'prawn', 'shrimp', 'جھینگا'],
  'جھینگا': ['prawns', 'jheenga'],

  // Dairy & Eggs
  'doodh': ['milk', 'fresh milk', 'dodh', 'cow milk', 'دودھ'],
  'dodh': ['milk', 'fresh milk', 'doodh', 'دودھ'],
  'دودھ': ['milk', 'fresh milk', 'doodh'],
  'milk': ['doodh', 'fresh milk', 'دودھ'],
  'fresh milk': ['doodh', 'milk', 'دودھ'],
  'dahi': ['yogurt', 'curd', 'دہی'],
  'یوگرٹ': ['yogurt', 'dahi', 'دہی'],
  'دہی': ['yogurt', 'dahi'],
  'yogurt': ['dahi', 'دہی'],
  'makhan': ['butter', 'makkhan', 'مکھن'],
  'مکھن': ['butter', 'makhan'],
  'butter': ['makhan', 'مکھن'],
  'ghee': ['desi ghee', 'banaspati', 'گھی'],
  'desi ghee': ['ghee', 'دیسی گھی'],
  'گھی': ['ghee', 'desi ghee'],
  'paneer': ['cheese', 'cottage cheese', 'پنیر'],
  'cheese': ['paneer', 'mozzarella', 'cheddar', 'پنیر', 'چیز'],
  'پنیر': ['cheese', 'paneer'],
  'چیز': ['cheese', 'mozzarella', 'cheddar'],
  'cream': ['heavy cream', 'fresh cream', 'malai', 'ملائی', 'کریم'],
  'malai': ['cream', 'fresh cream', 'ملائی'],
  'ملائی': ['cream', 'malai'],
  'anda': ['eggs', 'egg', 'anday', 'ande', 'انڈے', 'انڈا'],
  'anday': ['eggs', 'egg', 'anda', 'انڈے'],
  'ande': ['eggs', 'egg', 'anda', 'انڈے'],
  'eggs': ['anda', 'anday', 'egg', 'انڈے'],
  'egg': ['eggs', 'anda', 'anday', 'انڈے'],
  'انڈے': ['eggs', 'egg', 'anda'],
  'انڈا': ['egg', 'anda'],

  // Flours, Grains & Staples
  'aata': ['wheat flour', 'flour', 'atta', 'chakki aata', 'آٹا'],
  'atta': ['wheat flour', 'flour', 'aata', 'آٹا'],
  'wheat flour': ['aata', 'atta', 'flour', 'آٹا'],
  'آٹا': ['wheat flour', 'flour', 'aata'],
  'maida': ['refined flour', 'all purpose flour', 'white flour', 'میدہ'],
  'refined flour': ['maida', 'میدہ'],
  'میدہ': ['maida', 'refined flour'],
  'besan': ['gram flour', 'chana powder', 'بیسن'],
  'gram flour': ['besan', 'بیسن'],
  'بیسن': ['besan', 'gram flour'],
  'cornflour': ['corn flour', 'corn starch', 'کارن فلور'],
  'corn flour': ['cornflour', 'کارن فلور'],
  'کارن فلور': ['cornflour', 'corn flour'],
  'chawal': ['rice', 'basmati rice', 'چاول'],
  'rice': ['chawal', 'basmati rice', 'چاول'],
  'basmati rice': ['chawal', 'rice', 'چاول'],
  'چاول': ['rice', 'chawal'],
  'bun': ['burger bun', 'buns', 'برگر بن'],
  'buns': ['burger bun', 'bun', 'برگر بن'],
  'burger bun': ['bun', 'buns', 'برگر بن'],
  'برگر بن': ['burger bun', 'buns', 'bun'],
  'bread': ['white bread', 'sliced bread', 'double roti', 'ڈبل روٹی'],
  'double roti': ['bread', 'ڈبل روٹی'],
  'ڈبل روٹی': ['bread', 'double roti'],
  'pita': ['pita bread', 'shawarma bread', 'پیٹا بریڈ'],
  'pita bread': ['pita', 'shawarma bread', 'پیٹا بریڈ'],
  'پیٹا بریڈ': ['pita', 'pita bread'],

  // Oil, Sugar, Salt
  'tel': ['cooking oil', 'oil', 'tail', 'canola oil', 'تیل', 'کوکنگ آئل'],
  'tail': ['cooking oil', 'oil', 'tel', 'تیل'],
  'cooking oil': ['oil', 'tel', 'tail', 'تیل'],
  'oil': ['cooking oil', 'tel', 'تیل'],
  'تیل': ['cooking oil', 'oil', 'tel'],
  'کوکنگ آئل': ['cooking oil', 'oil', 'tel'],
  'cheeni': ['sugar', 'chini', 'shakar', 'چینی'],
  'chini': ['sugar', 'cheeni', 'shakar', 'چینی'],
  'shakar': ['sugar', 'cheeni', 'چینی', 'شکر'],
  'sugar': ['cheeni', 'chini', 'shakar', 'چینی'],
  'چینی': ['sugar', 'cheeni'],
  'شکر': ['sugar', 'shakar'],
  'namak': ['salt', 'نمک'],
  'salt': ['namak', 'نمک'],
  'نمک': ['salt', 'namak'],

  // Spices
  'haldi': ['turmeric powder', 'turmeric', 'ہلدی'],
  'turmeric': ['haldi', 'turmeric powder', 'ہلدی'],
  'turmeric powder': ['haldi', 'turmeric', 'ہلدی'],
  'ہلدی': ['turmeric', 'haldi'],
  'lal mirch': ['red chilli powder', 'red chili', 'red chilli', 'لال مرچ'],
  'laal mirch': ['red chilli powder', 'red chili', 'لال مرچ'],
  'red chilli powder': ['lal mirch', 'لال مرچ'],
  'لال مرچ': ['red chilli powder', 'lal mirch'],
  'chilli flakes': ['crushed chilli', 'kuti lal mirch', 'dara mirch', 'کوٹی لال مرچ'],
  'kuti lal mirch': ['chilli flakes', 'دڑا مرچ'],
  'dara mirch': ['chilli flakes', 'دڑا مرچ'],
  'کوٹی لال مرچ': ['chilli flakes', 'kuti lal mirch'],
  'kali mirch': ['black pepper', 'کالی مرچ'],
  'black pepper': ['kali mirch', 'کالی مرچ'],
  'کالی مرچ': ['black pepper', 'kali mirch'],
  'safed mirch': ['white pepper', 'سفید مرچ'],
  'white pepper': ['safed mirch', 'سفید مرچ'],
  'سفید مرچ': ['white pepper', 'safed mirch'],
  'zeera': ['cumin seeds', 'cumin', 'jeera', 'زیرہ'],
  'jeera': ['cumin seeds', 'cumin', 'zeera', 'زیرہ'],
  'cumin': ['zeera', 'cumin seeds', 'زیرہ'],
  'cumin seeds': ['zeera', 'cumin', 'زیرہ'],
  'زیرہ': ['cumin seeds', 'zeera'],
  'dhania powder': ['coriander powder', 'پسا دھنیا', 'دھنیا پاؤڈر'],
  'coriander powder': ['dhania powder', 'دھنیا پاؤڈر'],
  'دھنیا پاؤڈر': ['coriander powder', 'dhania powder'],
  'garam masala': ['garam masala powder', 'گرم مصالحہ'],
  'گرم مصالحہ': ['garam masala'],
  'chaat masala': ['chat masala', 'چاٹ مصالحہ'],
  'chat masala': ['chaat masala', 'چاٹ مصالحہ'],
  'چاٹ مصالحہ': ['chaat masala'],
  'biryani masala': ['بریانی مصالحہ'],
  'بریانی مصالحہ': ['biryani masala'],
  'tikka masala': ['تکہ مصالحہ'],
  'تکہ مصالحہ': ['tikka masala'],
  'elaichi': ['cardamom', 'الائچی'],
  'cardamom': ['elaichi', 'الائچی'],
  'الائچی': ['cardamom', 'elaichi'],
  'laung': ['cloves', 'لونگ'],
  'cloves': ['laung', 'لونگ'],
  'لونگ': ['cloves', 'laung'],
  'darcheeni': ['cinnamon', 'دار چینی'],
  'cinnamon': ['darcheeni', 'دار چینی'],
  'دار چینی': ['cinnamon', 'darcheeni'],
  'tez patta': ['bay leaf', 'تیز پتہ'],
  'bay leaf': ['tez patta', 'تیز پتہ'],
  'تیز پتہ': ['bay leaf', 'tez patta'],
  'saunf': ['fennel seeds', 'fennel', 'سونف'],
  'fennel seeds': ['saunf', 'سونف'],
  'سونف': ['fennel seeds', 'saunf'],
  'methi': ['fenugreek', 'kasuri methi', 'میتھی'],
  'kasuri methi': ['fenugreek', 'methi', 'قصوری میتھی'],
  'قصوری میتھی': ['kasuri methi', 'methi'],
  'ajwain': ['carom seeds', 'اجوائن'],
  'carom seeds': ['ajwain', 'اجوائن'],
  'اجوائن': ['carom seeds', 'ajwain'],

  // Sauces & Condiments
  'ketchup': ['tomato ketchup', 'tomato sauce', 'کیچپ'],
  'tomato ketchup': ['ketchup', 'کیچپ'],
  'کیچپ': ['ketchup', 'tomato ketchup'],
  'mayo': ['mayonnaise', 'garlic mayo', 'میونیز'],
  'mayonnaise': ['mayo', 'میونیز'],
  'میونیز': ['mayonnaise', 'mayo'],
  'chilli garlic': ['chilli garlic sauce', 'chili garlic', 'hot sauce', 'چلی گارلک'],
  'چلی گارلک': ['chilli garlic sauce', 'chilli garlic'],
  'soy sauce': ['soya sauce', 'سویا ساس'],
  'soya sauce': ['soy sauce', 'سویا ساس'],
  'سویا ساس': ['soy sauce', 'soya sauce'],
  'sirka': ['vinegar', 'white vinegar', 'سِرکہ', 'سرکہ'],
  'vinegar': ['sirka', 'سرکہ'],
  'سرکہ': ['vinegar', 'sirka'],
  'سِرکہ': ['vinegar', 'sirka'],
  'mustard': ['mustard paste', 'mustard sauce', 'مسٹرڈ'],
  'mustard paste': ['mustard', 'مسٹرڈ'],
  'مسٹرڈ': ['mustard', 'mustard paste'],
  'bbq sauce': ['barbecue sauce', 'باربی کیو ساس'],
  'باربی کیو ساس': ['bbq sauce'],

  // Beverages & Tea
  'chai patti': ['tea leaves', 'tea', 'patti', 'چائے پتی'],
  'tea leaves': ['chai patti', 'tea', 'چائے پتی'],
  'tea': ['chai patti', 'tea leaves', 'chai', 'چائے'],
  'chai': ['tea', 'tea leaves', 'chai patti', 'چائے'],
  'چائے پتی': ['tea leaves', 'chai patti'],
  'پتی': ['tea leaves', 'chai patti'],
  'green tea': ['sabz chai', 'qehwa', 'قہوہ'],
  'qehwa': ['green tea', 'قہوہ'],
  'قہوہ': ['green tea', 'qehwa'],
  'coffee': ['nescafe', 'instant coffee', 'کافی'],
  'کافی': ['coffee', 'nescafe'],
  'mineral water': ['water bottle', 'paani', 'پانی'],
  'paani': ['mineral water', 'water bottle', 'پانی'],
  'پانی': ['mineral water', 'paani'],

  // Packaging
  'shopper': ['plastic bag', 'plastic bags', 'polythene bag', 'شاپر'],
  'plastic bag': ['shopper', 'plastic bags', 'شاپر'],
  'شاپر': ['shopper', 'plastic bag'],
  'butter paper': ['baking paper', 'wrapping paper', 'بٹر پیپر'],
  'بٹر پیپر': ['butter paper'],
  'aluminum foil': ['silver foil', 'foil', 'سلور فوائل'],
  'silver foil': ['aluminum foil', 'foil', 'سلور فوائل'],
  'سلور فوائل': ['aluminum foil', 'silver foil'],
  'disposable cup': ['cups', 'paper cup', 'chai cup', 'ڈسپوزیبل کپ'],
  'paper cup': ['disposable cup', 'ڈسپوزیبل کپ'],
  'ڈسپوزیبل کپ': ['disposable cup', 'paper cup'],
  'burger box': ['burger boxes', 'packing box', 'food box', 'برگر باکس'],
  'برگر باکس': ['burger box'],
  'tissue': ['tissues', 'tissue paper', 'napkins', 'ٹشو'],
  'tissue paper': ['tissue', 'tissues', 'napkins', 'ٹشو'],
  'ٹشو': ['tissue', 'tissue paper', 'napkins']
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

const parseInvoiceMoney = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const amount = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? amount : null;
};
const parseInvoiceDiscount = (value) => Math.abs(parseInvoiceMoney(value) || 0);
const parseInvoiceDiscountPercent = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
};
const roundReceivingMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const receivingLineSubtotal = (quantity, unitCost) => roundReceivingMoney((Number.parseFloat(quantity) || 0) * (Number.parseFloat(unitCost) || 0));
const sumReceivingSubtotals = (rows, getQuantity = row => row.quantity, getCost = row => row.unitCost) =>
  roundReceivingMoney((rows || []).reduce((sum, row) => sum + receivingLineSubtotal(getQuantity(row), getCost(row)), 0));
const getReceivingDiscountAmount = (subtotal, value, mode = 'AMOUNT') => roundReceivingMoney(
  mode === 'PERCENT' ? (subtotal * Math.min(100, Math.max(0, Number(value) || 0))) / 100 : Math.max(0, Number(value) || 0)
);

const DRAFT_STORAGE_KEY = 'zovikpos_stock_in_draft_v1';

// Local Date helpers (avoids UTC timezone shift pushing date to previous day)
const getTodayDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayCompactDate = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const getStoredDraft = () => {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to parse draft from sessionStorage:', e);
  }
  return null;
};

const AdminInventoryReceivingView = ({ inventory = [], suppliers = [], onRefresh, showToast, onNavigateToCatalog }) => {
  const initialDraft = useMemo(() => getStoredDraft(), []);

  const [subTab, setSubTab] = useState(initialDraft?.subTab || 'NEW_RECEIVING'); // NEW_RECEIVING | HISTORY
  const [receivingMethod, setReceivingMethod] = useState(initialDraft?.receivingMethod || 'MANUAL'); // MANUAL | EXCEL | INVOICE
  const [loading, setLoading] = useState(false);
  const [receivingActionScope, setReceivingActionScope] = useState(null);
  const [receiveSubmitMessage, setReceiveSubmitMessage] = useState('');
  const [cardReceiveMessages, setCardReceiveMessages] = useState({});
  const [savingDraft, setSavingDraft] = useState(false);
  const draftSaveLock = useRef(false);
  const [draftSaveResult, setDraftSaveResult] = useState(null);
  const [pendingReceivingSaveAction, setPendingReceivingSaveAction] = useState(null);
  const [receivingsList, setReceivingsList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmingDraftIds, setConfirmingDraftIds] = useState(() => new Set());
  const confirmingDraftLocks = useRef(new Set());
  const historyRequestRef = useRef(0);
  const [historySelectionMode, setHistorySelectionMode] = useState(false);
  const [selectedReceivingIds, setSelectedReceivingIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [pendingResumeDraft, setPendingResumeDraft] = useState(null);
  const [resumeDraftSaving, setResumeDraftSaving] = useState(false);
  
  // Header Form State
  // Internal Reference starts BLANK -- user must click icon to generate
  const [receivingRef, setReceivingRef] = useState(initialDraft?.receivingRef || ''); // RCV-YYYYMMDD-XXX
  const [supplierId, setSupplierId] = useState(initialDraft?.supplierId || '');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(initialDraft?.supplierInvoiceNumber || ''); // External Supplier Invoice # (e.g. INV-45892)
  const [batchNumber, setBatchNumber] = useState(initialDraft?.batchNumber || ''); // Shipment level Batch Number (same for all receiving items)
  const [branchId, setBranchId] = useState(initialDraft?.branchId || '');
  const [branchesList, setBranchesList] = useState([]);
  const [receivingDate, setReceivingDate] = useState(initialDraft?.receivingDate || getTodayDateString());
  const [notes, setNotes] = useState(initialDraft?.notes || '');
  
  // AI Extracted Metadata
  const [aiDetectedSupplier, setAiDetectedSupplier] = useState(initialDraft?.aiDetectedSupplier || '');
  const [aiDetectedInvoiceNumber, setAiDetectedInvoiceNumber] = useState(initialDraft?.aiDetectedInvoiceNumber || '');
  const [discountAmount, setDiscountAmount] = useState(initialDraft?.discountPercent != null ? Number(initialDraft.discountPercent) : (initialDraft?.discountAmount ?? parseInvoiceDiscount(initialDraft?.discount)));
  const [discountMode, setDiscountMode] = useState(initialDraft?.discountPercent != null ? 'PERCENT' : (initialDraft?.discountMode || 'AMOUNT'));

  // Success Screen State
  const [completedReceiving, setCompletedReceiving] = useState(null);

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Multi-item stacked review cards array
  const [receivingRows, setReceivingRows] = useState(
    (initialDraft?.receivingRows && Array.isArray(initialDraft.receivingRows) && initialDraft.receivingRows.length > 0)
      ? initialDraft.receivingRows.filter(Boolean)
      : [
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
            isUnmatched: false,
            category: 'General'
          }
        ]
  );

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
  const [catalogModalCardId, setCatalogModalCardId] = useState(null);
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
  const [catalogSaveScope, setCatalogSaveScope] = useState(null);

  // Selected Receiving for Details Modal
  const [selectedReceiving, setSelectedReceiving] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [receivingToDelete, setReceivingToDelete] = useState(null);
  const [deleteReceivingLoading, setDeleteReceivingLoading] = useState(false);
  const [bulkDeleteReceivingLoading, setBulkDeleteReceivingLoading] = useState(false);

  // Computed Item Counts: Total, Matched, Suggested, New, Needs Review (safely guard against null/undefined elements)
  const safeReceivingRows = Array.isArray(receivingRows) ? receivingRows.filter(Boolean) : [];
  const hasPrimaryItems = safeReceivingRows.some(row => String(row.searchTerm || '').trim() || Boolean(row.inventoryItemId));
  const totalItemsCount = safeReceivingRows.length;
  const matchedItemsCount = safeReceivingRows.filter(r => Boolean(r?.inventoryItemId)).length;
  const reviewMatchCount = safeReceivingRows.filter(r => r && !r.inventoryItemId && r.suggestedItem).length;
  const newItemsCount = safeReceivingRows.filter(r => r && !r.inventoryItemId && String(r.searchTerm || '').trim()).length;
  const needsReviewCount = safeReceivingRows.filter(r => Boolean(r?.needsReview)).length;

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

  // Upload merge choice modal: 'append' | 'replace' | 'separate'
  const [pendingUploadRows, setPendingUploadRows] = useState(null);
  const [pendingUploadData, setPendingUploadData] = useState(null);
  const [showMergeChoiceModal, setShowMergeChoiceModal] = useState(false);

  // Multi-Supplier Secondary Receiving Cards
  const [additionalCards, setAdditionalCards] = useState(initialDraft?.additionalCards || []);
  const allDeliveryNewItemsCount = newItemsCount + additionalCards.reduce(
    (total, card) => total + (card.receivingRows || []).filter(row => row && !row.inventoryItemId && String(row.searchTerm || '').trim()).length,
    0
  );

  // ── Save draft to sessionStorage whenever key state changes ──
  useEffect(() => {
    try {
      // Avoid storing massive base64 image data (>1MB) to prevent sessionStorage quota errors
      const draftPayload = {
        subTab,
        receivingMethod,
        receivingRef,
        supplierId,
        supplierInvoiceNumber,
        batchNumber,
        branchId,
        receivingDate,
        notes,
        aiDetectedSupplier,
        aiDetectedInvoiceNumber,
        discountAmount,
        discountMode,
        receivingRows,
        additionalCards: additionalCards.map(c => ({ ...c, uploadedInvoiceDataUrl: null }))
      };
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
    } catch (e) {
      console.warn('[StockIn] Draft save to sessionStorage failed:', e?.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivingRows, receivingRef, supplierId, supplierInvoiceNumber, batchNumber, branchId, receivingDate, notes, aiDetectedSupplier, aiDetectedInvoiceNumber, discountAmount, discountMode, subTab, receivingMethod, additionalCards]);

  // Generate unique Internal Reference -- instant date + unique sequence generator
  const generateAutoRef = () => {
    const dateStr = getTodayCompactDate();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const newRef = `RCV-${dateStr}-${rand}`;
    setReceivingRef(newRef);
    if (showToast) showToast(`Internal Reference Generated: ${newRef}`, 'info');
  };

  // Generate unique Supplier Invoice # -- timestamp millisecond suffix ensures uniqueness
  const generateAutoInvoiceNum = () => {
    const dateStr = getTodayCompactDate();
    const ms = String(Date.now()).slice(-6);
    const newInv = `INV-${dateStr}-${ms}`;
    setSupplierInvoiceNumber(newInv);
    if (showToast) showToast(`Supplier Invoice # Generated: ${newInv}`, 'info');
  };

  // Generate unique Batch Number for receiving row
  const generateAutoBatchForRow = (index) => {
    const dateStr = getTodayCompactDate();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const batch = `BATCH-${dateStr}-${rand}`;
    handleRowChange(index, 'batchNumber', batch);
    if (showToast) showToast(`Batch # Generated: ${batch}`, 'info');
  };

  const fetchReceivings = async ({ silent = false } = {}) => {
    const requestId = ++historyRequestRef.current;
    if (!silent) setHistoryLoading(true);
    try {
      const res = await api.get(`/inventory/receivings?status=${historyStatusFilter}&search=${historySearch}`);
      if (requestId === historyRequestRef.current && res.data?.receivings) {
        setReceivingsList(res.data.receivings);
        setSelectedReceivingIds(new Set());
      }
    } catch (err) {
      if (requestId === historyRequestRef.current) {
        console.warn('Fetch receivings error:', err.message);
        showToast?.(err.response?.data?.error || 'Could not load receiving history.', 'error');
      }
    } finally {
      if (!silent && requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  };

  const eligibleReceivingIds = receivingsList
    .filter(record => ['DRAFT', 'CANCELLED'].includes(String(record.status).toUpperCase()))
    .map(record => record.id);
  const allEligibleReceivingsSelected = eligibleReceivingIds.length > 0 && eligibleReceivingIds.every(id => selectedReceivingIds.has(id));

  const handleBulkDeleteReceivings = async () => {
    const ids = [...selectedReceivingIds].filter(id => eligibleReceivingIds.includes(id));
    if (!ids.length || bulkDeleteReceivingLoading) return;
    setBulkDeleteReceivingLoading(true);
    try {
      const response = await api.delete('/inventory/receivings/bulk', { data: { ids } });
      showToast?.(response.data?.message || `Deleted ${response.data?.count || 0} receiving drafts.`, 'success');
      setBulkDeleteConfirm(false);
      setSelectedReceivingIds(new Set());
      await fetchReceivings();
    } catch (error) {
      showToast?.(error.response?.data?.error || 'Could not delete the selected receiving records.', 'error');
    } finally {
      setBulkDeleteReceivingLoading(false);
    }
  };

  const handleDeleteReceiving = async () => {
    if (!receivingToDelete) return;
    setDeleteReceivingLoading(true);
    try {
      const response = await api.delete(`/inventory/receivings/${receivingToDelete.id}`);
      showToast?.(response.data?.message || 'Receiving draft deleted.', 'success');
      setReceivingToDelete(null);
      await fetchReceivings();
      await onRefresh?.();
    } catch (error) {
      console.error('Delete receiving history record error:', error);
      showToast?.(error.response?.data?.error || 'Failed to delete receiving record.', 'error');
    } finally {
      setDeleteReceivingLoading(false);
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
    const savedDiscountPercent = parseInvoiceDiscountPercent(draft.discountPercent);
    setDiscountAmount(savedDiscountPercent !== null ? savedDiscountPercent : parseInvoiceDiscount(draft.discount));
    setDiscountMode(savedDiscountPercent !== null ? 'PERCENT' : 'AMOUNT');
    setBatchNumber(draft.batchNumber || '');
    setBranchId(draft.branchId ? String(draft.branchId) : '');
    if (draft.receivingDate) {
      const d = new Date(draft.receivingDate);
      if (!isNaN(d.getTime())) {
        setReceivingDate(getTodayDateString(d));
      }
    }
    let draftRows = [];
    if (draft.items && draft.items.length > 0) {
      draftRows = draft.items.map(item => ({
        inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : '',
        searchTerm: item.inventoryItem?.name || '',
        showSearchDropdown: false,
        quantity: item.quantity != null ? item.quantity : 1,
        unit: item.unit || item.inventoryItem?.unit || 'KG',
        unitCost: item.unitCost != null ? item.unitCost : 0,
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate ? getTodayDateString(new Date(item.expiryDate)) : '',
        notes: item.notes || '',
        showMoreDetails: false,
        isAiDetected: false,
        confidence: 1.0,
        isUnmatched: false
      }));
    }

    // Also parse deferred draftNewItems from draft.notes if present
    let rawNotes = draft.notes || '';
    if (rawNotes.includes('__DRAFT_ITEMS__:')) {
      const parts = rawNotes.split('__DRAFT_ITEMS__:');
      setNotes((parts[0] || '').trim());
      try {
        const parsedDraftItems = JSON.parse(parts[1].trim());
        if (Array.isArray(parsedDraftItems)) {
          parsedDraftItems.forEach(item => {
            draftRows.push({
              inventoryItemId: '',
              searchTerm: item.name || item.searchTerm || '',
              showSearchDropdown: false,
              quantity: item.quantity != null ? item.quantity : 1,
              unit: normalizeUnit(item.unit || 'KG'),
              unitCost: item.unitCost != null ? item.unitCost : (item.costPrice != null ? item.costPrice : 0),
              batchNumber: item.batchNumber || '',
              expiryDate: item.expiryDate ? getTodayDateString(new Date(item.expiryDate)) : '',
              notes: item.notes || '',
              category: item.category || 'General',
              showMoreDetails: false,
              isAiDetected: false,
              confidence: 1.0,
              isUnmatched: true
            });
          });
        }
      } catch (err) {
        console.warn('Failed to parse draft items from notes:', err);
      }
    } else {
      setNotes(rawNotes);
    }

    if (draftRows.length > 0) {
      setReceivingRows(draftRows.filter(Boolean));
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
    setAdditionalCards([]);
    setReceivingMethod('MANUAL');
    setSubTab('NEW_RECEIVING');
    setCompletedReceiving(null);
  };

  const requestResumeDraft = (draft) => {
    if (!draft) return;
    const hasCurrentWork = safeReceivingRows.some((row) => row?.searchTerm || row?.inventoryItemId) || additionalCards.some((card) => card.receivingRows?.some((row) => row?.searchTerm || row?.inventoryItemId));
    if (hasCurrentWork) {
      setPendingResumeDraft(draft);
      return;
    }
    loadDraftIntoForm(draft);
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
  }, [subTab, historyStatusFilter, historySearch]);

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
    return sumReceivingSubtotals(receivingRows || []);
  }, [receivingRows]);
  const calculatedDiscountAmount = getReceivingDiscountAmount(calculatedGrandTotal, discountAmount, discountMode);
  const calculatedNetTotal = Math.max(0, roundReceivingMoney(calculatedGrandTotal - calculatedDiscountAmount));
  const applyExtractedInvoiceDiscount = (invoice) => {
    const percent = parseInvoiceDiscountPercent(invoice?.invoiceDiscountPercent);
    if (percent !== null) {
      setDiscountMode('PERCENT');
      setDiscountAmount(percent);
    } else if (invoice?.invoiceDiscount !== null && invoice?.invoiceDiscount !== undefined && invoice?.invoiceDiscount !== '') {
      setDiscountMode('AMOUNT');
      setDiscountAmount(parseInvoiceDiscount(invoice.invoiceDiscount));
    } else {
      setDiscountMode('AMOUNT');
      setDiscountAmount(0);
    }
  };

  // Total valid items count
  const validItemsCount = useMemo(() => {
    return (Array.isArray(receivingRows) ? receivingRows : []).filter(r =>
      r && (r.inventoryItemId || String(r.searchTerm || '').trim()) && Number.parseFloat(r.quantity) > 0
    ).length;
  }, [receivingRows]);

  // Add a new blank item row
  const handleAddRow = (atTop = false) => {
    const newRow = {
      inventoryItemId: '',
      searchTerm: '',
      showSearchDropdown: false,
      quantity: 1,
      unit: 'KG',
      unitCost: 0,
      batchNumber: batchNumber || '',
      expiryDate: '',
      notes: '',
      showMoreDetails: false,
      isAiDetected: false,
      confidence: 1.0,
      isUnmatched: false,
      category: 'General'
    };

    setReceivingRows(prev => (atTop === true ? [newRow, ...prev] : [...prev, newRow]));
  };

  // Remove row (allows deleting the last item so table can be cleared)
  const handleRemoveRow = (index) => {
    setReceiveSubmitMessage('');
    setReceivingRows(prev => prev.filter((_, idx) => idx !== index));
  };

  // Select item from autocomplete dropdown
  const handleSelectItem = (index, invItem) => {
    setReceiveSubmitMessage('');
    const originalScanned = receivingRows[index]?.rawScannedName || receivingRows[index]?.searchTerm;
    if (originalScanned && originalScanned.toLowerCase().trim() !== invItem.name.toLowerCase().trim()) {
      // Learn confirmed alias in backend for future automatic matching
      api.post('/inventory/confirm-alias', {
        rawName: originalScanned,
        confirmedName: invItem.name,
        inventoryItemId: invItem.id
      }).then(() => {
        if (showToast) showToast(`Learned alias: "${originalScanned}" will now auto-match "${invItem.name}".`, 'info');
      }).catch(err => console.warn('[AliasConfirm] Could not save alias:', err?.message));
    }

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
        status: 'MATCHED',
        needsReview: false, // resolved by user selection
        reviewReason: null
      };
      return updated;
    });
  };

  // Handle row field updates
  const handleRowChange = (index, field, value) => {
    setReceiveSubmitMessage('');
    setReceivingRows(prev => {
      const updated = [...prev];
      const updatedRow = { ...updated[index], [field]: value };

      // Auto-clear needsReview warning once user enters a valid cost > 0
      if (field === 'unitCost' && parseFloat(value) > 0) {
        updatedRow.needsReview = false;
        updatedRow.reviewReason = null;
      }
      if (field === 'searchTerm' && value.trim() && parseFloat(updatedRow.unitCost) > 0) {
        updatedRow.needsReview = false;
        updatedRow.reviewReason = null;
      }

      updated[index] = updatedRow;
      return updated;
    });
  };

  // Open Single Item "Save in Catalog" modal (supports Card #1 and additional delivery cards)
  const handleOpenSaveCatalogModal = (index, cardId = null) => {
    let row = null;
    let cardSupplierId = supplierId;

    if (cardId) {
      const card = additionalCards.find(c => c.id === cardId);
      row = card?.receivingRows?.[index];
      if (card?.supplierId) cardSupplierId = card.supplierId;
    } else {
      row = receivingRows[index];
    }
    if (!row) return;

    const initialName = (row.searchTerm || '').trim();
    const initialUnit = normalizeUnit(row.unit || 'KG');
    const initialCost = parseFloat(row.unitCost) || 0;

    // Check if an existing catalog item matches name
    const existingSameName = localInventory.find(i => 
      i.name.toLowerCase().trim() === initialName.toLowerCase()
    );

    setCatalogModalRowIndex(index);
    setCatalogModalCardId(cardId);
    setCatalogModalData({
      name: initialName,
      unit: initialUnit,
      category: (row.category && row.category !== 'General') ? row.category : inferCategoryFromItemName(initialName),
      sku: '',
      costPrice: initialCost,
      minThreshold: 10,
      maxThreshold: 100,
      supplierId: cardSupplierId || '',
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
    const cardId = catalogModalCardId;

    if (cardId) {
      setAdditionalCards(prev => prev.map(c => {
        if (c.id === cardId) {
          const updatedRows = [...c.receivingRows];
          if (updatedRows[index]) {
            updatedRows[index] = {
              ...updatedRows[index],
              inventoryItemId: String(existingItem.id),
              searchTerm: existingItem.name,
              unit: existingItem.unit || updatedRows[index].unit,
              isUnmatched: false,
              showSearchDropdown: false
            };
          }
          return { ...c, receivingRows: updatedRows };
        }
        return c;
      }));
    } else {
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
    }

    if (showToast) showToast(`Linked row #${index + 1} to existing catalog item "${existingItem.name}".`, 'success');
    setCatalogModalOpen(false);
    setCatalogModalRowIndex(null);
    setCatalogModalCardId(null);
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

        // 2. Link the corresponding receiving row (Card #1 or additional card)
        if (catalogModalRowIndex !== null) {
          const index = catalogModalRowIndex;
          const cardId = catalogModalCardId;

          if (cardId) {
            setAdditionalCards(prev => prev.map(c => {
              if (c.id === cardId) {
                const updatedRows = [...c.receivingRows];
                if (updatedRows[index]) {
                  updatedRows[index] = {
                    ...updatedRows[index],
                    inventoryItemId: String(createdItem.id),
                    searchTerm: createdItem.name,
                    unit: createdItem.unit,
                    isUnmatched: false,
                    justSavedToCatalog: true,
                    showSearchDropdown: false
                  };
                }
                return { ...c, receivingRows: updatedRows };
              }
              return c;
            }));
          } else {
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
        }

        // 3. Trigger parent dashboard refresh
        if (onRefresh) onRefresh();

        if (showToast) showToast(`"${createdItem.name}" saved in catalog (Stock: 0) and linked.`, 'success');
        setCatalogModalOpen(false);
        setCatalogModalRowIndex(null);
        setCatalogModalCardId(null);
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
  const handleSaveAllNewItemsInCatalog = async (cardId = null) => {
    if (bulkSavingCatalog) return;
    const saveScope = cardId || 'all';

    // Save every named, unmatched item across the active supplier cards in one request.
    const newItemsToSave = [];
    const rowTargets = new Map();
    const appendNewItems = (rows, cardId, cardSupplierId, cardBranchId) => {
      rows.forEach((row, localIndex) => {
        const name = String(row?.searchTerm || '').trim();
        if (!row || row.inventoryItemId || !name) return;
        const rowIndex = newItemsToSave.length;
        rowTargets.set(rowIndex, { cardId, localIndex });
        newItemsToSave.push({
          rowIndex,
          name,
          unit: normalizeUnit(row.unit || 'KG'),
          category: (row.category && row.category !== 'General') ? row.category : inferCategoryFromItemName(name),
          sku: null,
          costPrice: parseFloat(row.unitCost) || 0.0,
          minThreshold: 10.0,
          maxThreshold: 100.0,
          supplierId: cardSupplierId ? parseInt(cardSupplierId, 10) : null,
          branchId: cardBranchId ? parseInt(cardBranchId, 10) : undefined,
          expiryDate: row.expiryDate || null
        });
      });
    };
    if (!cardId || cardId === 'primary') appendNewItems(receivingRows, 'primary', supplierId, branchId);
    additionalCards
      .filter(card => !cardId || card.id === cardId)
      .forEach(card => appendNewItems(card.receivingRows || [], card.id, card.supplierId, card.branchId));

    if (newItemsToSave.length === 0) {
      if (showToast) showToast('All items are already saved in the catalog.', 'info');
      return;
    }

    setBulkSavingCatalog(true);
    setCatalogSaveScope(saveScope);

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
      const updatedAdditionalCards = additionalCards.map(card => ({ ...card, receivingRows: [...(card.receivingRows || [])] }));

      results.forEach(r => {
        if (r.success && r.item) {
          newlyCreatedItems.push(r.item);
          const target = rowTargets.get(Number(r.index));
          if (target?.cardId === 'primary' && updatedRows[target.localIndex]) {
            updatedRows[target.localIndex] = {
              ...updatedRows[target.localIndex], inventoryItemId: String(r.item.id),
              searchTerm: r.item.name, unit: r.item.unit || updatedRows[target.localIndex].unit,
              isUnmatched: false, justSavedToCatalog: true, showSearchDropdown: false
            };
          } else if (target) {
            const card = updatedAdditionalCards.find(candidate => candidate.id === target.cardId);
            if (card?.receivingRows[target.localIndex]) {
              card.receivingRows[target.localIndex] = {
                ...card.receivingRows[target.localIndex], inventoryItemId: String(r.item.id),
                searchTerm: r.item.name, unit: r.item.unit || card.receivingRows[target.localIndex].unit,
                isUnmatched: false, justSavedToCatalog: true, showSearchDropdown: false
              };
            }
          }
        }
      });

      setReceivingRows(updatedRows);
      setAdditionalCards(updatedAdditionalCards);
      if (summary.failedCount === 0) {
        if (saveScope === 'primary' || saveScope === 'all') setReceiveSubmitMessage('');
        setCardReceiveMessages(prev => {
          const next = { ...prev };
          for (const card of additionalCards) {
            if ((saveScope === 'all' || saveScope === card.id) && !(updatedAdditionalCards.find(updated => updated.id === card.id)?.receivingRows || []).some(row => !row.inventoryItemId && String(row.searchTerm || '').trim())) {
              next[card.id] = '';
            }
          }
          return next;
        });
      }

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
      setCatalogSaveScope(null);
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
                    const expD = new Date(raw.expiryDate);
                    expiryStr = !isNaN(expD.getTime()) ? getTodayDateString(expD) : String(raw.expiryDate);
                  } catch (_) {
                    expiryStr = String(raw.expiryDate);
                  }
                }
                const dateStr = getTodayCompactDate();
                const rowRand = Math.floor(1000 + Math.random() * 9000);
                const autoBatch = (raw.batchNumber && String(raw.batchNumber).trim() !== '')
                  ? String(raw.batchNumber).trim()
                  : `BATCH-${dateStr}-${rowRand}`;

                const excelRowName = raw.name || raw.matchedName || raw.rawName || '';
                rowMap.set(mapId, {
                  inventoryItemId: itemId || '',
                  searchTerm: excelRowName,
                  rawScannedName: raw.rawName || raw.rawScannedName || excelRowName,
                  category: (raw.category && raw.category !== 'General') ? raw.category : inferCategoryFromItemName(raw.rawName || excelRowName),
                  showSearchDropdown: false,
                  quantity: Number.isFinite(Number.parseFloat(raw.quantity)) ? Number.parseFloat(raw.quantity) : 0,
                  unit: unitKey,
                  unitCost: costKey,
                  batchNumber: autoBatch,
                  expiryDate: expiryStr,
                  notes: '',
                  showMoreDetails: true,
                  isAiDetected: false,
                  confidence: raw.confidence || 0.9,
                  isUnmatched: !isMatched,
                  status: raw.status || (isMatched ? 'MATCHED' : 'NEW_ITEM'),
                  suggestedItem: raw.suggestedItem || null,
                  needsReview: Boolean(raw.needsReview) || !(Number.parseFloat(raw.quantity) > 0),
                  reviewReason: raw.reviewReason || (!(Number.parseFloat(raw.quantity) > 0) ? 'Quantity missing or invalid; verify before receiving' : null)
                });
              }
            };

            rawMatched.forEach(m => processRow(m, true));
            rawUnmatched.forEach(u => processRow(u, false));

            const newRows = Array.from(rowMap.values());

            // Extract detected metadata from API response
            const detectedSupplier = res.data.detectedSupplierName || res.data.supplierName || '';
            const detectedInvoiceNumber = res.data.rawInvoiceNumber || res.data.invoiceNumber || '';
            const detectedDate = res.data.receivingDate || '';
            const extractedInvoiceDiscount = {
              invoiceDiscount: res.data.invoiceDiscount ?? null,
              invoiceDiscountPercent: res.data.invoiceDiscountPercent ?? null
            };

            if (newRows.length === 0) {
              if (showToast) showToast('No valid items found in the file.', 'error');
            } else {
              // Auto-generate refs if empty
              const dateStr = getTodayCompactDate();
              if (!receivingRef) {
                const randRef = Math.floor(1000 + Math.random() * 9000);
                setReceivingRef(`RCV-${dateStr}-${randRef}`);
              }
              // Use detected invoice number if available and not generic
              const genericInvPrefixes = ['inv-', 'INV-'];
              const isGenericInv = !detectedInvoiceNumber ||
                genericInvPrefixes.some(p => detectedInvoiceNumber.toUpperCase().startsWith(p.toUpperCase()));
              if (!supplierInvoiceNumber) {
                if (!isGenericInv && detectedInvoiceNumber) {
                  setSupplierInvoiceNumber(detectedInvoiceNumber);
                } else {
                  const ms = String(Date.now()).slice(-6);
                  setSupplierInvoiceNumber(`INV-${dateStr}-${ms}`);
                }
              }
              if (!batchNumber) {
                const randBatch = Math.floor(1000 + Math.random() * 9000);
                setBatchNumber(`BATCH-${dateStr}-${randBatch}`);
              }

              // Try to auto-match detected supplier from API
              let matchedDetectedSup = null;
              const cleanDetectedSup = (detectedSupplier || '').trim().toLowerCase();
              if (cleanDetectedSup && cleanDetectedSup !== 'general supplier / market purchase') {
                matchedDetectedSup = suppliers.find(s => {
                  const sLower = s.name.toLowerCase().trim();
                  return sLower === cleanDetectedSup ||
                    sLower.includes(cleanDetectedSup) ||
                    cleanDetectedSup.includes(sLower);
                });
                if (matchedDetectedSup && !supplierId) {
                  setSupplierId(String(matchedDetectedSup.id));
                  setAiDetectedSupplier(matchedDetectedSup.name);
                } else if (!matchedDetectedSup && cleanDetectedSup && !aiDetectedSupplier) {
                  setAiDetectedSupplier(detectedSupplier);
                }
              }

              const hasExistingRows = receivingRows.some(r => r.searchTerm || r.inventoryItemId) || additionalCards.length > 0;
              if (hasExistingRows) {
                // Determine same/different supplier
                const currentSup = suppliers.find(s => String(s.id) === String(supplierId));
                const currentSupName = (currentSup?.name || aiDetectedSupplier || '').trim().toLowerCase();
                const newSupName = (matchedDetectedSup?.name || detectedSupplier || '').trim().toLowerCase();
                const currentSupId = supplierId ? String(supplierId) : '';
                const newSupId = matchedDetectedSup ? String(matchedDetectedSup.id) : '';

                let isSameSupplier = false;
                if (currentSupId && newSupId && currentSupId === newSupId) {
                  isSameSupplier = true;
                } else if (currentSupName && newSupName && (currentSupName.includes(newSupName) || newSupName.includes(currentSupName))) {
                  isSameSupplier = true;
                } else if (!currentSupName && !newSupName && !currentSupId && !newSupId) {
                  isSameSupplier = true;
                }

                // Ask user: append or replace
                setPendingUploadData({
                  supplierName: detectedSupplier || 'Excel / CSV Import',
                  matchedSupplierId: matchedDetectedSup ? String(matchedDetectedSup.id) : '',
                  invoiceNumber: !isGenericInv && detectedInvoiceNumber ? detectedInvoiceNumber : `INV-${dateStr}-${String(Date.now()).slice(-6)}`,
                  rawInvoiceNumber: detectedInvoiceNumber || '',
                  ...extractedInvoiceDiscount,
                  newRows: newRows,
                  dataUrl: null,
                  fileName: file.name,
                  mimeType: ext === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  isSameSupplier,
                  currentSupplierName: currentSup?.name || aiDetectedSupplier || 'Current Receiving (Card #1)'
                });
                setPendingUploadRows(newRows);
                setShowMergeChoiceModal(true);
              } else {
                setReceivingRows(newRows);
                applyExtractedInvoiceDiscount(extractedInvoiceDiscount);
                setReceivingMethod('MANUAL');
                const matchedCount = newRows.filter(r => !r.isUnmatched).length;
                const unmatchedCount = newRows.filter(r => r.isUnmatched).length;
                const supplierHint = detectedSupplier && detectedSupplier !== 'General Supplier / Market Purchase'
                  ? ` (Supplier: ${detectedSupplier})`
                  : '';
                if (showToast) {
                  const msg = unmatchedCount > 0
                    ? `Imported ${newRows.length} items: ${matchedCount} matched ✓, ${unmatchedCount} need manual selection.${supplierHint}`
                    : `All ${newRows.length} items matched and imported!${supplierHint}`;
                  showToast(msg, unmatchedCount > 0 ? 'warning' : 'success');
                }
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
        const dateStr = getTodayCompactDate();
        const extractedInvoiceDiscount = {
          invoiceDiscount: res.data.invoiceDiscount ?? null,
          invoiceDiscountPercent: res.data.invoiceDiscountPercent ?? null
        };
        const extractedSupplier = (res.data.supplierName || '').trim();
        const matchedSup = suppliers.find(s =>
          extractedSupplier && (
            s.name.toLowerCase().includes(extractedSupplier.toLowerCase()) ||
            extractedSupplier.toLowerCase().includes(s.name.toLowerCase())
          )
        );

        let finalInv = '';
        if (res.data.invoiceNumber) {
          const rawInv = String(res.data.invoiceNumber).trim();
          const isGeneric = ['not provided', 'n/a', 'none', 'null', 'undefined'].includes(rawInv.toLowerCase());
          finalInv = isGeneric ? `INV-${dateStr}-${String(Date.now()).slice(-6)}` : rawInv;
        } else {
          finalInv = `INV-${dateStr}-${String(Date.now()).slice(-6)}`;
        }

        // Extract item rows with AI badges
        const newRows = [];

        const processOcrItem = (item, isMatched) => {
          let expiryStr = '';
          if (item.expiryDate) {
            try {
              const expD = new Date(item.expiryDate);
              expiryStr = !isNaN(expD.getTime()) ? getTodayDateString(expD) : String(item.expiryDate);
            } catch (_) {
              expiryStr = String(item.expiryDate);
            }
          }
          const rowRand = Math.floor(1000 + Math.random() * 9000);
          const autoBatch = (item.batchNumber && String(item.batchNumber).trim() !== '')
            ? String(item.batchNumber).trim()
            : `BATCH-${dateStr}-${rowRand}`;

          const itemName = item.matchedName || item.name || item.rawName || item.rawScannedName || '';
          newRows.push({
            inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : '',
            searchTerm: itemName,
            rawScannedName: item.rawScannedName || item.rawName || '',
            category: (item.category && item.category !== 'General') ? item.category : inferCategoryFromItemName(item.rawName || itemName),
            showSearchDropdown: false,
            quantity: Number.isFinite(Number.parseFloat(item.quantity)) ? Number.parseFloat(item.quantity) : 0,
            unit: normalizeUnit(item.unit || item.systemUnit),
            unitCost: parseFloat(item.unitCost) || 0,
            batchNumber: autoBatch,
            expiryDate: expiryStr,
            notes: item.notes || (extractedSupplier ? `Supplier: ${extractedSupplier}` : ''),
            showMoreDetails: true,
            isAiDetected: true,
            confidence: item.confidence || 0.85,
            isUnmatched: !isMatched,
            status: item.status || (isMatched ? 'MATCHED' : 'NEW_ITEM'),
            suggestedItem: item.suggestedItem || null,
            needsReview: Boolean(item.needsReview) || !(Number.parseFloat(item.quantity) > 0),
            reviewReason: item.reviewReason || (!(Number.parseFloat(item.quantity) > 0) ? 'Quantity missing or invalid; verify before receiving' : null)
          });
        };

        const rawMatched = res.data.matchedItems || res.data.matched || [];
        const rawUnmatched = res.data.unmatchedItems || res.data.unmatched || [];

        rawMatched.forEach(m => processOcrItem(m, true));
        rawUnmatched.forEach(u => processOcrItem(u, false));

        if (newRows.length > 0) {
          setShowOcrModal(false);
          setReceivingMethod('MANUAL'); // Direct to unified Review Stock

          const hasExistingRows = receivingRows.some(r => r.searchTerm || r.inventoryItemId) || additionalCards.length > 0;
          if (hasExistingRows) {
            // Determine if it is the same supplier or different supplier
            const currentSup = suppliers.find(s => String(s.id) === String(supplierId));
            const currentSupName = (currentSup?.name || aiDetectedSupplier || '').trim().toLowerCase();
            const newSupName = (extractedSupplier || matchedSup?.name || '').trim().toLowerCase();
            const currentSupId = supplierId ? String(supplierId) : '';
            const newSupId = matchedSup ? String(matchedSup.id) : '';

            let isSameSupplier = false;
            if (currentSupId && newSupId && currentSupId === newSupId) {
              isSameSupplier = true;
            } else if (currentSupName && newSupName && (currentSupName.includes(newSupName) || newSupName.includes(currentSupName))) {
              isSameSupplier = true;
            } else if (!currentSupName && !newSupName && !currentSupId && !newSupId) {
              isSameSupplier = true;
            }

            setPendingUploadData({
              supplierName: extractedSupplier || (matchedSup ? matchedSup.name : 'Unassigned / Local Market'),
              matchedSupplierId: matchedSup ? String(matchedSup.id) : '',
              invoiceNumber: finalInv,
              rawInvoiceNumber: res.data.invoiceNumber || '',
              ...extractedInvoiceDiscount,
              newRows: newRows,
              dataUrl: dataUrl,
              fileName: fileName,
              mimeType: ocrFile?.type || 'image/jpeg',
              isSameSupplier: isSameSupplier,
              currentSupplierName: currentSup?.name || aiDetectedSupplier || 'Local Market (Card #1)'
            });
            setPendingUploadRows(newRows);
            setShowMergeChoiceModal(true);
          } else {
            // First invoice: populate Card 1
            applyExtractedInvoiceDiscount(extractedInvoiceDiscount);
            if (extractedSupplier) {
              setAiDetectedSupplier(extractedSupplier);
              if (matchedSup) {
                setSupplierId(String(matchedSup.id));
              }
            }

            setSupplierInvoiceNumber(finalInv);
            setAiDetectedInvoiceNumber(finalInv);


            // Auto-generate Header Reference, Supplier Invoice Number & Shipment Batch if empty
            if (!receivingRef) {
              const randRef = Math.floor(1000 + Math.random() * 9000);
              setReceivingRef(`RCV-${dateStr}-${randRef}`);
            }
            if (!batchNumber) {
              const randBatch = Math.floor(1000 + Math.random() * 9000);
              setBatchNumber(`BATCH-${dateStr}-${randBatch}`);
            }

            setReceivingRows(newRows);
            const matchedCount = res.data.summary?.matchedCount ?? rawMatched.length;
            const reviewCount = res.data.summary?.needsReviewCount ?? newRows.filter(r => r.needsReview).length;
            const newCount = res.data.summary?.newItemsCount ?? rawUnmatched.length;

            if (showToast) {
              const msg = `AI extracted ${newRows.length} items: ${matchedCount} matched ✓, ${newCount} new items${reviewCount > 0 ? `, ${reviewCount} need review ⚠️` : ''}.`;
              showToast(msg, reviewCount > 0 ? 'warning' : 'success');
            }
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
    setReceiveSubmitMessage('');

    const activeRows = receivingRows.filter(r => r && (r.inventoryItemId || String(r.searchTerm || '').trim()));
    const invalidRow = activeRows.find(row => !(Number.parseFloat(row.quantity) > 0));
    if (invalidRow) {
      const rowIndex = activeRows.indexOf(invalidRow) + 1;
      const message = `Enter a quantity greater than zero for Item #${rowIndex} before ${targetStatus === 'DRAFT' ? 'saving this draft' : 'receiving stock'}.`;
      setReceiveSubmitMessage(message);
      showToast?.(message, 'error');
      return;
    }

    if (targetStatus === 'DRAFT') {
      // Known catalog items (have inventoryItemId)
      const knownRows = activeRows.filter(r => r.inventoryItemId);
      // New/unmatched items (no inventoryItemId, but have a name typed)
      const newItemRows = activeRows.filter(r => !r.inventoryItemId && (r.searchTerm || '').trim());

      if (knownRows.length === 0 && newItemRows.length === 0) {
        const message = 'Add at least one named item with a quantity before saving this draft.';
        setReceiveSubmitMessage(message);
        if (showToast) showToast(message, 'warning');
        return;
      }
      executeSubmitReceiving('DRAFT', knownRows, newItemRows);
      return;
    }

    // For RECEIVED (Confirm & Receive Stock) — all items must be catalog-matched
    if (activeRows.length === 0) {
      setReceiveSubmitMessage('Add at least one item before receiving stock.');
      if (showToast) showToast('Please select at least one item to receive.', 'error');
      return;
    }

    for (let i = 0; i < activeRows.length; i++) {
      const r = activeRows[i];
      if (!r.inventoryItemId) {
        if (editingDraftId) continue;
        const unmatchedCount = activeRows.filter(row => !row.inventoryItemId).length;
        const message = `${unmatchedCount} new item${unmatchedCount === 1 ? '' : 's'} still need catalog names. Click “Save New Item Names (${unmatchedCount})” first, then confirm receiving.`;
        setReceiveSubmitMessage(message);
        if (showToast) showToast(message, 'warning');
        return;
      }
      if (!r.quantity || parseFloat(r.quantity) <= 0) {
        const message = `Enter a quantity greater than zero for Item #${i + 1} before receiving.`;
        setReceiveSubmitMessage(message);
        if (showToast) showToast(message, 'error');
        return;
      }
    }

    setShowConfirmModal(true);
  };

  // Final Submit Action
  // draftNewRowsOverride: optional array of unmatched rows (no inventoryItemId) — sent as draftNewItems for DRAFT only
  const executeSubmitReceiving = async (targetStatus, rowsOverride = null, draftNewRowsOverride = null) => {
    if (loading || savingDraft || (targetStatus === 'DRAFT' && draftSaveLock.current)) return false;
    if (targetStatus === 'DRAFT') draftSaveLock.current = true;
    setShowConfirmModal(false);
    setLoading(true);
    setReceivingActionScope('primary');
    if (targetStatus === 'DRAFT') {
      setSavingDraft(true);
    }

    try {
      const rowsToSubmit = rowsOverride || receivingRows.filter(r => r.inventoryItemId && parseFloat(r.quantity) > 0);
      const docBatchNumber = batchNumber.trim() || null;

      // For DRAFT: collect unmatched rows as draftNewItems (deferred catalog creation)
      const draftNewItems = targetStatus === 'DRAFT' || (targetStatus === 'RECEIVED' && editingDraftId)
        ? (draftNewRowsOverride || receivingRows.filter(r => !r.inventoryItemId && (r.searchTerm || '').trim() && parseFloat(r.quantity) > 0))
            .map(r => ({
              name: (r.searchTerm || '').trim(),
              quantity: parseFloat(r.quantity),
              unit: r.unit || 'KG',
              costPrice: parseFloat(r.unitCost) || 0,
              category: r.category || 'General',
              expiryDate: r.expiryDate || null,
              batchNumber: docBatchNumber || (r.batchNumber ? String(r.batchNumber).trim() : null),
            }))
        : [];

      const payload = {
        supplierId: supplierId ? parseInt(supplierId, 10) : null,
        branchId: branchId ? parseInt(branchId, 10) : null,
        receivingRef: receivingRef.trim(),
        invoiceNumber: supplierInvoiceNumber.trim() || null,
        batchNumber: docBatchNumber,
        receivingDate,
        notes: notes ? String(notes).trim() : null,
        subtotal: calculatedGrandTotal,
        discount: calculatedDiscountAmount,
        discountPercent: discountMode === 'PERCENT' ? Number(discountAmount) || 0 : null,
        // When confirming an edited draft, first persist all current lines as a draft,
        // then let the dedicated receive endpoint materialize new items and post stock/logs.
        status: targetStatus === 'RECEIVED' && editingDraftId ? 'DRAFT' : targetStatus,
        items: rowsToSubmit.map(r => ({
          inventoryItemId: parseInt(r.inventoryItemId, 10),
          quantity: parseFloat(r.quantity),
          unit: r.unit,
          unitCost: parseFloat(r.unitCost) || 0,
          batchNumber: docBatchNumber || (r.batchNumber ? String(r.batchNumber).trim() : null),
          expiryDate: r.expiryDate || null,
          notes: r.notes ? String(r.notes).trim() : null
        })),
        ...(draftNewItems.length > 0 ? { draftNewItems } : {})
      };

      let res;
      if (editingDraftId) {
        res = await api.put(`/inventory/receivings/${editingDraftId}`, payload);
        if (targetStatus === 'RECEIVED') {
          res = await api.post(`/inventory/receivings/${editingDraftId}/receive`);
        }
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
        setDraftSaveResult({ success: true, message: `Draft ${savedRec?.receivingNumber ? `“${savedRec.receivingNumber}” ` : ''}was saved. Stock has not changed.` });
        setSubTab('HISTORY');
        setCompletedReceiving(null);
      } else {
        setEditingDraftId(null);
        try {
          localStorage.removeItem('zovikpos_active_draft_id');
          sessionStorage.removeItem(DRAFT_STORAGE_KEY);
        } catch (_) {}

        const record = {
          receivingRef: savedRec?.receivingNumber || receivingRef,
          supplierName: suppliers.find(s => String(s.id) === String(supplierId))?.name || 'Local Market / Not Provided',
          invoiceNumber: supplierInvoiceNumber || 'Not Provided',
          itemCount: rowsToSubmit.length + draftNewItems.length,
          subtotal: calculatedGrandTotal,
          discount: calculatedDiscountAmount,
          discountPercent: discountMode === 'PERCENT' ? Number(discountAmount) || 0 : null,
          totalCost: calculatedNetTotal
        };

        setCompletedReceiving(record);

        if (showToast) {
          showToast('Stock has been updated successfully.', 'success');
        }

        if (onRefresh) onRefresh();
      }
      return true;
    } catch (err) {
      console.error('Submit receiving error:', err);
      if (targetStatus === 'DRAFT') setDraftSaveResult({ success: false, message: err.response?.data?.error || 'Draft could not be saved. Your entered data has been kept.' });
      if (showToast) showToast(err.response?.data?.error || 'Something went wrong. Please try again.', 'error');
      return false;
    } finally {
      setLoading(false);
      setReceivingActionScope(null);
      if (targetStatus === 'DRAFT') draftSaveLock.current = false;
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
    setReceivingRef('');
    setSupplierId('');
    setSupplierInvoiceNumber('');
    setBatchNumber(''); // Completely clean Shipment Batch Number
    setReceivingDate(getTodayDateString());
    setAiDetectedSupplier('');
    setAiDetectedInvoiceNumber('');
    setDiscountAmount(0);
    setDiscountMode('AMOUNT');
    setNotes('');
    setRefClickSeq(0);
    setReceivingRows([]); // Completely clean table (empty state)
    setPendingUploadRows(null);
    setPendingUploadData(null);
    setAdditionalCards([]);
    setShowMergeChoiceModal(false);
    setUploadedInvoiceDataUrl(null);
    setUploadedInvoiceFileName('');
    setUploadedInvoiceMimeType('');
    setOcrFile(null);
    try { sessionStorage.removeItem(DRAFT_STORAGE_KEY); } catch (_) {}
  };

  // Confirm existing Draft from History
  const handleConfirmDraft = async (receivingId) => {
    const key = String(receivingId);
    if (confirmingDraftLocks.current.has(key)) return;
    confirmingDraftLocks.current.add(key);
    setConfirmingDraftIds(prev => new Set(prev).add(key));
    try {
      const res = await api.post(`/inventory/receivings/${receivingId}/receive`);
      if (showToast) showToast('Stock has been updated successfully.', 'success');
      if (String(editingDraftId) === String(receivingId)) {
        setEditingDraftId(null);
        try {
          localStorage.removeItem('zovikpos_active_draft_id');
        } catch (_) {}
      }
      await fetchReceivings({ silent: true });
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to confirm draft', 'error');
    } finally {
      confirmingDraftLocks.current.delete(key);
      setConfirmingDraftIds(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  // Merge Choice Handlers: Replace all rows OR merge/append newly imported rows without duplicates
  const handleMergeReplace = () => {
    const rowsToReplace = pendingUploadData?.newRows || pendingUploadRows;
    if (!rowsToReplace) return;

    setReceivingRows(rowsToReplace);
    if (pendingUploadData) {
      if (pendingUploadData.matchedSupplierId) {
        setSupplierId(pendingUploadData.matchedSupplierId);
      }
      if (pendingUploadData.supplierName) {
        setAiDetectedSupplier(pendingUploadData.supplierName);
      }
      if (pendingUploadData.invoiceNumber) {
        setSupplierInvoiceNumber(pendingUploadData.invoiceNumber);
        setAiDetectedInvoiceNumber(pendingUploadData.invoiceNumber);
      }
      applyExtractedInvoiceDiscount(pendingUploadData);
      if (pendingUploadData.dataUrl) {
        setUploadedInvoiceDataUrl(pendingUploadData.dataUrl);
        setUploadedInvoiceFileName(pendingUploadData.fileName);
        setUploadedInvoiceMimeType(pendingUploadData.mimeType);
      }
    }

    setReceivingMethod('MANUAL');
    setShowMergeChoiceModal(false);
    const count = rowsToReplace.length;
    setPendingUploadRows(null);
    setPendingUploadData(null);
    if (showToast) showToast(`Replaced table with ${count} imported items.`, 'success');
  };

  const handleMergeAppend = () => {
    const rowsToMerge = pendingUploadData?.newRows || pendingUploadRows;
    if (!rowsToMerge) return;

    setReceivingRows(prev => {
      const activeRows = prev.filter(r => r.searchTerm || r.inventoryItemId);
      const merged = [...activeRows];
      let mergedCount = 0;
      let addedCount = 0;

      for (const newRow of rowsToMerge) {
        const newNameNorm = (newRow.searchTerm || newRow.rawScannedName || '').trim().toLowerCase();
        const existingIdx = merged.findIndex(r => {
          if (newRow.inventoryItemId && r.inventoryItemId) {
            return String(r.inventoryItemId) === String(newRow.inventoryItemId);
          }
          if (newNameNorm) {
            const rNameNorm = (r.searchTerm || r.rawScannedName || '').trim().toLowerCase();
            return rNameNorm && rNameNorm === newNameNorm;
          }
          return false;
        });

        if (existingIdx !== -1) {
          // Merge quantities and update cost
          const existing = merged[existingIdx];
          const newQty = (parseFloat(existing.quantity) || 0) + (parseFloat(newRow.quantity) || 0);
          merged[existingIdx] = {
            ...existing,
            quantity: newQty,
            unitCost: parseFloat(newRow.unitCost) > 0 ? newRow.unitCost : existing.unitCost,
            batchNumber: existing.batchNumber || newRow.batchNumber || '',
            expiryDate: existing.expiryDate || newRow.expiryDate || '',
            notes: existing.notes && newRow.notes
              ? `${existing.notes} | ${newRow.notes}`
              : (existing.notes || newRow.notes || '')
          };
          mergedCount++;
        } else {
          // Add unique row
          merged.push(newRow);
          addedCount++;
        }
      }

      return merged;
    });

    applyExtractedInvoiceDiscount(pendingUploadData || {});

    setReceivingMethod('MANUAL');
    setShowMergeChoiceModal(false);
    const count = rowsToMerge.length;
    setPendingUploadRows(null);
    setPendingUploadData(null);
    if (showToast) {
      showToast(`Merged ${count} imported items (avoided duplicates and combined quantities).`, 'success');
    }
  };

  // Create Separate Receiving Card with guaranteed independent Ref#, Batch#, and Invoice#
  const handleCreateSeparateCard = () => {
    if (!pendingUploadData) return;
    const dateStr = getTodayCompactDate();

    // 1. Guaranteed distinct Reference Number
    let randRef;
    let newRef;
    do {
      randRef = Math.floor(1000 + Math.random() * 9000);
      newRef = `RCV-${dateStr}-${randRef}`;
    } while (newRef === receivingRef || additionalCards.some(c => c.receivingRef === newRef));

    // 2. Guaranteed distinct Shipment Batch Number
    let randBatch;
    let newBatch;
    do {
      randBatch = Math.floor(1000 + Math.random() * 9000);
      newBatch = `BATCH-${dateStr}-${randBatch}`;
    } while (newBatch === batchNumber || additionalCards.some(c => c.batchNumber === newBatch));

    // 3. Guaranteed distinct Supplier Invoice #
    let newInv = pendingUploadData.invoiceNumber;
    if (!newInv || newInv === supplierInvoiceNumber || additionalCards.some(c => c.supplierInvoiceNumber === newInv)) {
      const ms = String(Date.now() + 5000 + Math.floor(Math.random() * 1000)).slice(-6);
      newInv = `INV-${dateStr}-${ms}`;
    }

    const newCard = {
      id: 'card-' + Date.now(),
      receivingRef: newRef,
      batchNumber: newBatch,
      supplierInvoiceNumber: newInv,
      supplierId: pendingUploadData.matchedSupplierId || '',
      aiDetectedSupplier: pendingUploadData.supplierName || '',
      aiDetectedInvoiceNumber: pendingUploadData.rawInvoiceNumber || newInv,
      discountAmount: parseInvoiceDiscountPercent(pendingUploadData.invoiceDiscountPercent) ?? parseInvoiceDiscount(pendingUploadData.invoiceDiscount),
      discountMode: parseInvoiceDiscountPercent(pendingUploadData.invoiceDiscountPercent) !== null ? 'PERCENT' : 'AMOUNT',
      branchId: branchId || (branchesList[0]?.id ? String(branchesList[0].id) : ''),
      receivingDate: getTodayDateString(),
      notes: pendingUploadData.supplierName ? `Supplier: ${pendingUploadData.supplierName}` : '',
      receivingRows: (pendingUploadData.newRows || []).map(r => ({
        ...r,
        batchNumber: newBatch
      })),
      uploadedInvoiceDataUrl: pendingUploadData.dataUrl || null,
      uploadedInvoiceFileName: pendingUploadData.fileName || '',
      uploadedInvoiceMimeType: pendingUploadData.mimeType || ''
    };

    setAdditionalCards(prev => [...prev, newCard]);
    setShowMergeChoiceModal(false);
    setPendingUploadData(null);
    setPendingUploadRows(null);
    setReceivingMethod('MANUAL');

    if (showToast) {
      showToast(
        `Created separate Card for "${pendingUploadData.supplierName}" with independent Ref: ${newRef}, Batch: ${newBatch}, Invoice: ${newInv}!`,
        'success'
      );
    }
  };

  // Generate distinct Auto Ref for a specific additional card
  const generateAutoRefForCard = (cardId) => {
    const dateStr = getTodayCompactDate();
    let randRef;
    let newRef;
    do {
      randRef = Math.floor(1000 + Math.random() * 9000);
      newRef = `RCV-${dateStr}-${randRef}`;
    } while (newRef === receivingRef || additionalCards.some(c => c.id !== cardId && c.receivingRef === newRef));

    setAdditionalCards(prev => prev.map(c => c.id === cardId ? { ...c, receivingRef: newRef } : c));
    if (showToast) showToast(`Reference Generated: ${newRef}`, 'info');
  };

  // Generate distinct Auto Batch for a specific additional card
  const generateAutoBatchForCard = (cardId) => {
    const dateStr = getTodayCompactDate();
    let randBatch;
    let newBatch;
    do {
      randBatch = Math.floor(1000 + Math.random() * 9000);
      newBatch = `BATCH-${dateStr}-${randBatch}`;
    } while (newBatch === batchNumber || additionalCards.some(c => c.id !== cardId && c.batchNumber === newBatch));

    setAdditionalCards(prev => prev.map(c => {
      if (c.id === cardId) {
        return {
          ...c,
          batchNumber: newBatch,
          receivingRows: c.receivingRows.map(r => ({ ...r, batchNumber: newBatch }))
        };
      }
      return c;
    }));
    if (showToast) showToast(`Batch # Generated: ${newBatch}`, 'info');
  };

  // Generate distinct Auto Invoice for a specific additional card
  const generateAutoInvoiceForCard = (cardId) => {
    const dateStr = getTodayCompactDate();
    const ms = String(Date.now() + Math.floor(Math.random() * 1000)).slice(-6);
    const newInv = `INV-${dateStr}-${ms}`;
    setAdditionalCards(prev => prev.map(c => c.id === cardId ? { ...c, supplierInvoiceNumber: newInv } : c));
    if (showToast) showToast(`Supplier Invoice # Generated: ${newInv}`, 'info');
  };

  // Add new independent supplier delivery parent card
  const handleAddNewSupplierDeliveryCard = () => {
    const dateStr = getTodayCompactDate();
    let randRef;
    let newRef;
    do {
      randRef = Math.floor(1000 + Math.random() * 9000);
      newRef = `RCV-${dateStr}-${randRef}`;
    } while (newRef === receivingRef || additionalCards.some(c => c.receivingRef === newRef));

    let randBatch;
    let newBatch;
    do {
      randBatch = Math.floor(1000 + Math.random() * 9000);
      newBatch = `BATCH-${dateStr}-${randBatch}`;
    } while (newBatch === batchNumber || additionalCards.some(c => c.batchNumber === newBatch));

    const ms = String(Date.now() + Math.floor(Math.random() * 1000)).slice(-6);
    const newInv = `INV-${dateStr}-${ms}`;

    const newCard = {
      id: 'card-' + Date.now(),
      receivingRef: newRef,
      batchNumber: newBatch,
      supplierInvoiceNumber: newInv,
      supplierId: '',
      aiDetectedSupplier: '',
      aiDetectedInvoiceNumber: newInv,
      discountAmount: 0,
      branchId: branchId || (branchesList[0]?.id ? String(branchesList[0].id) : ''),
      receivingDate: getTodayDateString(),
      notes: '',
      receivingRows: [
        {
          inventoryItemId: '',
          searchTerm: '',
          showSearchDropdown: false,
          quantity: 1,
          unit: 'KG',
          unitCost: 0,
          batchNumber: newBatch,
          expiryDate: '',
          notes: '',
          showMoreDetails: false,
          isAiDetected: false,
          confidence: 1.0,
          isUnmatched: false,
          category: 'General'
        }
      ],
      uploadedInvoiceDataUrl: null,
      uploadedInvoiceFileName: '',
      uploadedInvoiceMimeType: ''
    };

    setAdditionalCards(prev => [...prev, newCard]);
    if (showToast) showToast(`Created New Delivery Card #${additionalCards.length + 2} with independent Reference, Batch, and Invoice!`, 'success');
  };

  // Generate distinct row Batch in an additional card
  const generateAutoBatchForRowInCard = (cardId, rowIndex) => {
    const dateStr = getTodayCompactDate();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const batch = `BATCH-${dateStr}-${rand}`;
    handleCardRowChange(cardId, rowIndex, 'batchNumber', batch);
    if (showToast) showToast(`Batch # Generated: ${batch}`, 'info');
  };

  // Update top-level field in an additional card
  const handleUpdateCardField = (cardId, field, value) => {
    setAdditionalCards(prev => prev.map(c => c.id === cardId ? { ...c, [field]: value } : c));
  };

  // Add row to an additional card
  const handleCardAddRow = (cardId) => {
    setAdditionalCards(prev => prev.map(c => {
      if (c.id === cardId) {
        const newRow = {
          inventoryItemId: '',
          searchTerm: '',
          showSearchDropdown: false,
          quantity: 1,
          unit: 'KG',
          unitCost: 0,
          batchNumber: c.batchNumber || '',
          expiryDate: '',
          notes: '',
          showMoreDetails: false,
          isAiDetected: false,
          confidence: 1.0,
          isUnmatched: false,
          category: 'General'
        };
        return { ...c, receivingRows: [newRow, ...c.receivingRows] };
      }
      return c;
    }));
  };

  // Remove row from an additional card
  const handleCardRemoveRow = (cardId, rowIndex) => {
    setAdditionalCards(prev => prev.map(c => {
      if (c.id === cardId) {
        return { ...c, receivingRows: c.receivingRows.filter((_, idx) => idx !== rowIndex) };
      }
      return c;
    }));
  };

  // Change row field in an additional card
  const handleCardRowChange = (cardId, rowIndex, field, value) => {
    setCardReceiveMessages(prev => ({ ...prev, [cardId]: '' }));
    setAdditionalCards(prev => prev.map(c => {
      if (c.id === cardId) {
        const updatedRows = [...c.receivingRows];
        const updatedRow = { ...updatedRows[rowIndex], [field]: value };
        if (field === 'unitCost' && parseFloat(value) > 0) {
          updatedRow.needsReview = false;
          updatedRow.reviewReason = null;
        }
        if (field === 'searchTerm' && value.trim() && parseFloat(updatedRow.unitCost) > 0) {
          updatedRow.needsReview = false;
          updatedRow.reviewReason = null;
        }
        updatedRows[rowIndex] = updatedRow;
        return { ...c, receivingRows: updatedRows };
      }
      return c;
    }));
  };

  // Select item from catalog in an additional card
  const handleCardSelectItem = (cardId, rowIndex, invItem) => {
    setCardReceiveMessages(prev => ({ ...prev, [cardId]: '' }));
    setAdditionalCards(prev => prev.map(c => {
      if (c.id === cardId) {
        const updatedRows = [...c.receivingRows];
        updatedRows[rowIndex] = {
          ...updatedRows[rowIndex],
          inventoryItemId: String(invItem.id),
          searchTerm: invItem.name,
          showSearchDropdown: false,
          unit: invItem.unit || updatedRows[rowIndex].unit || 'KG',
          unitCost: updatedRows[rowIndex].unitCost || invItem.costPrice || 0,
          isUnmatched: false,
          suggestedItem: null,
          status: 'MATCHED',
          needsReview: false,
          reviewReason: null
        };
        return { ...c, receivingRows: updatedRows };
      }
      return c;
    }));
  };

  // Discard an entire additional card
  const handleRemoveAdditionalCard = (cardId) => {
    if (window.confirm('Are you sure you want to discard this supplier receiving card?')) {
      setCardReceiveMessages(prev => { const next = { ...prev }; delete next[cardId]; return next; });
      setAdditionalCards(prev => prev.filter(c => c.id !== cardId));
      if (showToast) showToast('Supplier receiving card removed.', 'info');
    }
  };

  // Submit single additional card to backend
  const executeSubmitAdditionalCard = async (cardId, targetStatus) => {
    if (loading || savingDraft || (targetStatus === 'DRAFT' && draftSaveLock.current)) return false;
    const card = additionalCards.find(c => c.id === cardId);
    if (!card) return false;

    const activeRows = card.receivingRows.filter(r => r && (r.inventoryItemId || String(r.searchTerm || '').trim()));
    const invalidActiveRow = activeRows.find(row => !(Number.parseFloat(row.quantity) > 0));
    if (invalidActiveRow) {
      const message = `Enter a quantity greater than zero for ${invalidActiveRow.searchTerm || 'each item'} before ${targetStatus === 'DRAFT' ? 'saving this draft' : 'receiving this supplier card'}.`;
      setCardReceiveMessages(prev => ({ ...prev, [cardId]: message }));
      showToast?.(message, 'error');
      return false;
    }
    // Catalog-matched rows
    const rowsToSubmit = activeRows.filter(r => r.inventoryItemId && parseFloat(r.quantity) > 0);
    // New/unmatched rows (only relevant for DRAFT — deferred catalog creation)
    const newItemRows = activeRows.filter(r => !r.inventoryItemId && (r.searchTerm || '').trim() && parseFloat(r.quantity) > 0);

    if (rowsToSubmit.length === 0 && newItemRows.length === 0) {
      setCardReceiveMessages(prev => ({ ...prev, [cardId]: 'Add at least one named item and enter a quantity greater than zero.' }));
      if (showToast) showToast('Please add at least one item with quantity > 0.', 'error');
      return false;
    }
    if (targetStatus === 'RECEIVED') {
      const invalidRow = activeRows.find(row => !(Number.parseFloat(row.quantity) > 0));
      if (invalidRow) {
        const message = `Enter a quantity greater than zero for ${invalidRow.searchTerm || 'each item'} before receiving this supplier card.`;
        setCardReceiveMessages(prev => ({ ...prev, [cardId]: message }));
        showToast?.(message, 'error');
        return false;
      }
      if (newItemRows.length > 0) {
        const message = `${newItemRows.length} new item${newItemRows.length === 1 ? '' : 's'} on this supplier card need catalog names. Click “Save New Item Names (${newItemRows.length})” on this card, then confirm receiving.`;
        setCardReceiveMessages(prev => ({ ...prev, [cardId]: message }));
        showToast?.(message, 'warning');
        return false;
      }
      if (rowsToSubmit.length === 0) {
        const message = 'Select at least one catalog item on this supplier card before receiving.';
        setCardReceiveMessages(prev => ({ ...prev, [cardId]: message }));
        showToast?.(message, 'error');
        return false;
      }
    } else {
      setCardReceiveMessages(prev => ({ ...prev, [cardId]: '' }));
    }

    if (targetStatus === 'DRAFT') draftSaveLock.current = true;
    setLoading(true);
    setReceivingActionScope(targetStatus === 'RECEIVED' ? cardId : `draft:${cardId}`);
    if (targetStatus === 'DRAFT') setSavingDraft(true);

    try {
      const docBatchNumber = card.batchNumber.trim() || null;

      // Build draftNewItems for DRAFT saves (new items deferred to confirm time)
      const draftNewItems = targetStatus === 'DRAFT'
        ? newItemRows.map(r => ({
            name: (r.searchTerm || '').trim(),
            quantity: parseFloat(r.quantity),
            unit: r.unit || 'KG',
            costPrice: parseFloat(r.unitCost) || 0,
            category: r.category || 'General',
            expiryDate: r.expiryDate || null,
            batchNumber: docBatchNumber || (r.batchNumber ? String(r.batchNumber).trim() : null),
          }))
        : [];

      const payload = {
        supplierId: card.supplierId ? parseInt(card.supplierId, 10) : null,
        branchId: card.branchId ? parseInt(card.branchId, 10) : null,
        receivingRef: card.receivingRef.trim(),
        invoiceNumber: card.supplierInvoiceNumber.trim() || null,
        batchNumber: docBatchNumber,
        receivingDate: card.receivingDate,
        notes: card.notes ? String(card.notes).trim() : null,
        subtotal: sumReceivingSubtotals(activeRows),
        discount: getReceivingDiscountAmount(sumReceivingSubtotals(activeRows), card.discountAmount, card.discountMode),
        discountPercent: card.discountMode === 'PERCENT' ? Number(card.discountAmount) || 0 : null,
        status: targetStatus,
        items: rowsToSubmit.map(r => ({
          inventoryItemId: parseInt(r.inventoryItemId, 10),
          quantity: parseFloat(r.quantity),
          unit: r.unit,
          unitCost: parseFloat(r.unitCost) || 0,
          batchNumber: docBatchNumber || (r.batchNumber ? String(r.batchNumber).trim() : null),
          expiryDate: r.expiryDate || null,
          notes: r.notes ? String(r.notes).trim() : null
        })),
        ...(draftNewItems.length > 0 ? { draftNewItems } : {})
      };

      await api.post('/inventory/receivings', payload);
      const supName = suppliers.find(s => String(s.id) === String(card.supplierId))?.name || card.aiDetectedSupplier || 'Supplier';

      if (targetStatus === 'DRAFT') {
        if (showToast) showToast(`Draft saved for ${supName}. New items will be added to catalog when confirmed.`, 'success');
        setDraftSaveResult({ success: true, message: `Draft for ${supName} was saved. Stock has not changed.` });
        setAdditionalCards(prev => prev.filter(c => c.id !== cardId));
        setSubTab('HISTORY');
      } else {
        if (showToast) showToast(`Stock received successfully for ${supName}!`, 'success');
        setAdditionalCards(prev => prev.filter(c => c.id !== cardId));
        if (onRefresh) onRefresh();
      }
      return true;
    } catch (err) {
      console.error('Submit card error:', err);
      if (targetStatus === 'DRAFT') setDraftSaveResult({ success: false, message: err.response?.data?.error || 'Draft could not be saved. Your entered data has been kept.' });
      if (showToast) showToast(err.response?.data?.error || 'Failed to submit receiving.', 'error');
      return false;
    } finally {
      setLoading(false);
      setReceivingActionScope(null);
      if (targetStatus === 'DRAFT') draftSaveLock.current = false;
      setSavingDraft(false);
    }
  };

  const saveCurrentAndResumeDraft = async () => {
    if (!pendingResumeDraft || resumeDraftSaving) return;
    setResumeDraftSaving(true);
    try {
      const primaryRowsWithData = safeReceivingRows.filter((row) => row?.searchTerm || row?.inventoryItemId);
      const knownRows = receivingRows.filter((row) => row.inventoryItemId && Number.parseFloat(row.quantity) > 0);
      const newItemRows = receivingRows.filter((row) => !row.inventoryItemId && (row.searchTerm || '').trim() && Number.parseFloat(row.quantity) > 0);
      if (primaryRowsWithData.some((row) => !(Number.parseFloat(row.quantity) > 0))) {
        showToast?.('Set a quantity greater than zero for each current item before saving this work as a draft.', 'error');
        return;
      }
      if (knownRows.length || newItemRows.length) {
        const saved = await executeSubmitReceiving('DRAFT', knownRows, newItemRows);
        if (!saved) return;
      }
      for (const card of [...additionalCards]) {
        const cardRows = card.receivingRows?.filter((row) => row.inventoryItemId || (row.searchTerm || '').trim()) || [];
        if (cardRows.some((row) => !(Number.parseFloat(row.quantity) > 0))) {
          showToast?.('Set a quantity greater than zero for each current supplier item before continuing.', 'error');
          return;
        }
        const hasRows = cardRows.length > 0;
        if (!hasRows) continue;
        const saved = await executeSubmitAdditionalCard(card.id, 'DRAFT');
        if (!saved) return;
      }
      setDraftSaveResult(null);
      const draftToOpen = pendingResumeDraft;
      setPendingResumeDraft(null);
      loadDraftIntoForm(draftToOpen);
    } finally {
      setResumeDraftSaving(false);
    }
  };

  // Save every active supplier card as a separate draft from one explicit action.
  // Successful additional cards are removed from the editable stack to make retries safe;
  // the primary draft id is retained so a partial retry updates it instead of duplicating it.
  const handleSaveAllDeliveryDrafts = async () => {
    if (loading || savingDraft || draftSaveLock.current) return;
    const primaryRows = receivingRows.filter(row => row?.searchTerm || row?.inventoryItemId);
    const cards = additionalCards.map(card => ({
      ...card,
      activeRows: (card.receivingRows || []).filter(row => row?.searchTerm || row?.inventoryItemId)
    }));
    const deliveries = [
      ...(primaryRows.length ? [{ key: 'primary', rows: primaryRows }] : []),
      ...cards.filter(card => card.activeRows.length).map(card => ({ key: card.id, rows: card.activeRows }))
    ];

    if (!deliveries.length) {
      showToast?.('Add at least one supplier item before saving drafts.', 'warning');
      return;
    }
    for (const delivery of deliveries) {
      const invalid = delivery.rows.find(row => !(Number.parseFloat(row.quantity) > 0));
      if (invalid) {
        showToast?.(`Enter a quantity greater than zero for ${invalid.searchTerm || 'each item'} before saving.`, 'error');
        return;
      }
    }

    draftSaveLock.current = true;
    setLoading(true);
    setReceivingActionScope('all-drafts');
    setSavingDraft(true);
    const savedCardIds = [];
    let primarySavedId = editingDraftId || null;
    let savedCount = 0;
    try {
      for (const delivery of deliveries) {
        const isPrimary = delivery.key === 'primary';
        const card = isPrimary ? null : cards.find(candidate => candidate.id === delivery.key);
        const rows = delivery.rows;
        const knownRows = rows.filter(row => row.inventoryItemId);
        const newRows = rows.filter(row => !row.inventoryItemId && (row.searchTerm || '').trim());
        const docBatch = (isPrimary ? batchNumber : card.batchNumber || '').trim() || null;
        const payload = {
          supplierId: (isPrimary ? supplierId : card.supplierId) ? parseInt(isPrimary ? supplierId : card.supplierId, 10) : null,
          branchId: (isPrimary ? branchId : card.branchId) ? parseInt(isPrimary ? branchId : card.branchId, 10) : null,
          receivingRef: (isPrimary ? receivingRef : card.receivingRef).trim(),
          invoiceNumber: (isPrimary ? supplierInvoiceNumber : card.supplierInvoiceNumber).trim() || null,
          batchNumber: docBatch,
          receivingDate: isPrimary ? receivingDate : card.receivingDate,
          notes: (isPrimary ? notes : card.notes) ? String(isPrimary ? notes : card.notes).trim() : null,
          subtotal: sumReceivingSubtotals(rows),
          discount: isPrimary ? calculatedDiscountAmount : getReceivingDiscountAmount(sumReceivingSubtotals(rows), card.discountAmount, card.discountMode),
          discountPercent: isPrimary
            ? (discountMode === 'PERCENT' ? Number(discountAmount) || 0 : null)
            : (card.discountMode === 'PERCENT' ? Number(card.discountAmount) || 0 : null),
          status: 'DRAFT',
          items: knownRows.map(row => ({
            inventoryItemId: parseInt(row.inventoryItemId, 10),
            quantity: Number.parseFloat(row.quantity),
            unit: row.unit || 'PCS',
            unitCost: Number.parseFloat(row.unitCost) || 0,
            batchNumber: docBatch || (row.batchNumber ? String(row.batchNumber).trim() : null),
            expiryDate: row.expiryDate || null,
            notes: row.notes ? String(row.notes).trim() : null
          })),
          ...(newRows.length ? { draftNewItems: newRows.map(row => ({
            name: row.searchTerm.trim(),
            quantity: Number.parseFloat(row.quantity),
            unit: row.unit || 'KG',
            costPrice: Number.parseFloat(row.unitCost) || 0,
            category: row.category || 'General',
            expiryDate: row.expiryDate || null,
            batchNumber: docBatch || (row.batchNumber ? String(row.batchNumber).trim() : null)
          })) } : {})
        };
        const response = isPrimary && primarySavedId
          ? await api.put(`/inventory/receivings/${primarySavedId}`, payload)
          : await api.post('/inventory/receivings', payload);
        if (isPrimary) {
          primarySavedId = response.data?.receiving?.id || primarySavedId;
          if (primarySavedId) {
            setEditingDraftId(primarySavedId);
            try { localStorage.setItem('zovikpos_active_draft_id', String(primarySavedId)); } catch (_) {}
          }
        } else {
          savedCardIds.push(delivery.key);
        }
        savedCount += 1;
      }

      setAdditionalCards(prev => prev.filter(card => !savedCardIds.includes(card.id)));
      if (savedCount === deliveries.length) {
        handleResetForNewReceiving();
        setDraftSaveResult({ success: true, message: `Saved ${savedCount} supplier draft${savedCount === 1 ? '' : 's'} separately. Stock has not changed.` });
        setSubTab('HISTORY');
        onRefresh?.();
        showToast?.(`Saved ${savedCount} supplier draft${savedCount === 1 ? '' : 's'} separately. Stock has not changed.`, 'success');
      }
    } catch (error) {
      setAdditionalCards(prev => prev.filter(card => !savedCardIds.includes(card.id)));
      const message = error.response?.data?.error || 'Could not save every supplier draft. Your unsaved entries are still on this screen.';
      setDraftSaveResult({ success: false, message: savedCount ? `${savedCount} draft${savedCount === 1 ? '' : 's'} saved separately; remaining drafts were not saved. ${message}` : message });
      showToast?.(savedCount ? `${savedCount} draft${savedCount === 1 ? '' : 's'} saved; remaining drafts failed: ${message}` : message, 'error');
    } finally {
      setLoading(false);
      setReceivingActionScope(null);
      setSavingDraft(false);
      draftSaveLock.current = false;
    }
  };

  const confirmReceivingSaveAction = () => {
    const { action, cardId } = pendingReceivingSaveAction || {};
    setPendingReceivingSaveAction(null);
    if (action === 'DRAFT') {
      if (cardId === 'primary') handleInitiateSubmit('DRAFT');
      else if (cardId) executeSubmitAdditionalCard(cardId, 'DRAFT');
      else if (additionalCards.length > 0) handleSaveAllDeliveryDrafts();
      else handleInitiateSubmit('DRAFT');
      return;
    }
    handleSaveAllNewItemsInCatalog(cardId || null);
  };

  // Submit ALL Cards (Card 1 + all Additional Cards)
  const handleReceiveAllDeliveries = async (targetStatus = 'RECEIVED') => {
    if (loading || savingDraft) return;

    // Validate Card 1
    const card1Rows = receivingRows.filter(r => r.searchTerm || r.inventoryItemId);
    for (let i = 0; i < card1Rows.length; i++) {
      const r = card1Rows[i];
      if (!r.inventoryItemId) {
        if (showToast) showToast(`Card #1, Item #${i + 1} ("${r.searchTerm || 'Unnamed'}") is not matched to catalog.`, 'error');
        return;
      }
      if (!r.quantity || parseFloat(r.quantity) <= 0) {
        if (showToast) showToast(`Card #1, Item #${i + 1} quantity must be > 0.`, 'error');
        return;
      }
    }

    // Validate Additional Cards
    for (let cIdx = 0; cIdx < additionalCards.length; cIdx++) {
      const card = additionalCards[cIdx];
      const supName = suppliers.find(s => String(s.id) === String(card.supplierId))?.name || card.aiDetectedSupplier || `Card #${cIdx + 2}`;
      const cardRows = card.receivingRows.filter(r => r.searchTerm || r.inventoryItemId);
      if (cardRows.length === 0) {
        if (showToast) showToast(`${supName} has no items. Add at least one item or remove the card.`, 'error');
        return;
      }
      for (let i = 0; i < cardRows.length; i++) {
        const r = cardRows[i];
        if (!r.inventoryItemId) {
          if (showToast) showToast(`${supName}, Item #${i + 1} ("${r.searchTerm || 'Unnamed'}") is not matched to catalog.`, 'error');
          return;
        }
        if (!r.quantity || parseFloat(r.quantity) <= 0) {
          if (showToast) showToast(`${supName}, Item #${i + 1} quantity must be > 0.`, 'error');
          return;
        }
      }
    }

    if (card1Rows.length === 0 && additionalCards.length === 0) {
      if (showToast) showToast('Add at least one receiving item before submitting.', 'error');
      return;
    }

    setLoading(true);
    setReceivingActionScope('all');
    let successCount = 0;
    const deliveryCount = (card1Rows.length > 0 ? 1 : 0) + additionalCards.length;
    try {
      // Submit Card 1 when it contains rows; additional supplier cards can be submitted on their own.
      const docBatch1 = batchNumber.trim() || null;
      const payload1 = {
        supplierId: supplierId ? parseInt(supplierId, 10) : null,
        branchId: branchId ? parseInt(branchId, 10) : null,
        receivingRef: receivingRef.trim(),
        invoiceNumber: supplierInvoiceNumber.trim() || null,
        batchNumber: docBatch1,
        receivingDate,
        notes: notes ? String(notes).trim() : null,
        subtotal: sumReceivingSubtotals(card1Rows),
        discount: calculatedDiscountAmount,
        discountPercent: discountMode === 'PERCENT' ? Number(discountAmount) || 0 : null,
        status: targetStatus,
        items: card1Rows.map(r => ({
          inventoryItemId: parseInt(r.inventoryItemId, 10),
          quantity: parseFloat(r.quantity),
          unit: r.unit,
          unitCost: parseFloat(r.unitCost) || 0,
          batchNumber: docBatch1 || (r.batchNumber ? String(r.batchNumber).trim() : null),
          expiryDate: r.expiryDate || null,
          notes: r.notes ? String(r.notes).trim() : null
        }))
      };
      if (card1Rows.length > 0) {
        await api.post('/inventory/receivings', payload1);
        successCount++;
      }

      // 2. Submit Additional Cards
      for (const card of additionalCards) {
        const rowsToSubmit = card.receivingRows.filter(r => r.inventoryItemId && parseFloat(r.quantity) > 0);
        const docBatchCard = card.batchNumber.trim() || null;
        const payloadCard = {
          supplierId: card.supplierId ? parseInt(card.supplierId, 10) : null,
          branchId: card.branchId ? parseInt(card.branchId, 10) : null,
          receivingRef: card.receivingRef.trim(),
          invoiceNumber: card.supplierInvoiceNumber.trim() || null,
          batchNumber: docBatchCard,
          receivingDate: card.receivingDate,
          notes: card.notes ? String(card.notes).trim() : null,
          subtotal: sumReceivingSubtotals(rowsToSubmit),
          discount: getReceivingDiscountAmount(sumReceivingSubtotals(rowsToSubmit), card.discountAmount, card.discountMode),
          discountPercent: card.discountMode === 'PERCENT' ? Number(card.discountAmount) || 0 : null,
          status: targetStatus,
          items: rowsToSubmit.map(r => ({
            inventoryItemId: parseInt(r.inventoryItemId, 10),
            quantity: parseFloat(r.quantity),
            unit: r.unit,
            unitCost: parseFloat(r.unitCost) || 0,
            batchNumber: docBatchCard || (r.batchNumber ? String(r.batchNumber).trim() : null),
            expiryDate: r.expiryDate || null,
            notes: r.notes ? String(r.notes).trim() : null
          }))
        };
        await api.post('/inventory/receivings', payloadCard);
        successCount++;
      }

      // Cleanup
      setAdditionalCards([]);
      handleResetForNewReceiving();
      if (showToast) {
        showToast(`Successfully received all ${successCount} separate supplier deliveries into stock!`, 'success');
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Submit all deliveries error:', err);
      const reason = err.response?.data?.error || 'Request failed.';
      if (showToast) showToast(successCount > 0
        ? `Partial receiving result: ${successCount} of ${deliveryCount} supplier deliveries were posted. The remaining form data is still available. Failure: ${reason}`
        : `No supplier deliveries were posted. ${reason}`, 'error');
    } finally {
      setLoading(false);
      setReceivingActionScope(null);
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
            onClick={() => {
              if (subTab === 'HISTORY') fetchReceivings();
              else { setHistoryLoading(true); setSubTab('HISTORY'); }
            }}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center space-x-2 border ${
              subTab === 'HISTORY'
                ? 'bg-orange-600 text-white border-orange-600 shadow-md'
                : 'bg-[var(--bg-color)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)]'
            }`}
          >
            {historyLoading && subTab === 'HISTORY' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            <span>{historyLoading && subTab === 'HISTORY' ? 'Loading History…' : 'Receiving History'}</span>
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
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                  <span className="text-[var(--text-muted)]">Subtotal:</span>
                  <span className="font-mono font-bold text-orange-400">Rs. {Number(completedReceiving.subtotal || 0).toLocaleString('en-PK')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-color)]/50">
                  <span className="text-[var(--text-muted)]">Discount:</span>
                  <span className="font-mono font-bold text-orange-400">Rs. {Number(completedReceiving.discount || 0).toLocaleString('en-PK')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--text-muted)]">Total after discount:</span>
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
                        ? 'bg-orange-500/10 border-orange-500 text-orange-400 ring-2 ring-orange-500/20'
                        : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-orange-500/50'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 shrink-0">
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

              {/* Card #1: Supplier, items, invoice checks, summary and receive action */}
              <div className="bg-[var(--card-bg)] border-2 border-orange-500/35 rounded-3xl p-4 sm:p-6 space-y-4 shadow-lg shadow-black/5">
              {/* Section 2: Supplier & Receiving Details */}
              <div className="bg-[var(--bg-color)]/35 border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="border-b border-[var(--border-color)]/50 pb-3">
                  <h3 className="text-sm font-black text-[var(--text-main)] uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-orange-400" />
                    Delivery Card #1 — Supplier &amp; Receiving Details
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Reference, Batch &amp; Invoice are tracked per delivery card — not per item.
                  </p>
                </div>

                {/* AI Detected Supplier Suggestion Banner */}
                {aiDetectedSupplier && !supplierId && (
                  <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-orange-400 shrink-0" />
                      <span>
                        AI detected supplier on invoice: <strong className="text-orange-400">{aiDetectedSupplier}</strong>
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)]">Select matching supplier below or leave as Local Market.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  
                  {/* Internal Receiving Reference (Dynamic DB Sequence) */}
                  <div>
                    <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px] flex justify-between items-center">
                      <span>Internal Reference *</span>
                      <span className="text-[10px] text-orange-400 font-normal lowercase">Auto-generated</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        readOnly
                        value={receivingRef}
                        /* onChange={(e) => setReceivingRef(e.target.value)} -- Manual typing disabled per user request, only auto-generate */
                        placeholder={`RCV-${getTodayCompactDate()}-XXXX`}
                        className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--bg-color)]/70 border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none cursor-default select-all"
                      />
                      <button
                        type="button"
                        onClick={() => generateAutoRef()}
                        title={`Click to generate unique Internal Reference (RCV-${getTodayCompactDate()}-XXXX)`}
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
                      <span className="text-[10px] text-orange-400 font-normal lowercase">(BATCH-{getTodayCompactDate()}-XXXX)</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        readOnly
                        value={batchNumber}
                        /* onChange={(e) => {
                          const newBatch = e.target.value;
                          setBatchNumber(newBatch);
                          setReceivingRows((prev) => prev.map((r) => ({ ...r, batchNumber: newBatch })));
                        }} -- Manual typing disabled per user request, only auto-generate */
                        placeholder={`BATCH-${getTodayCompactDate()}-XXXX`}
                        className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--bg-color)]/70 border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none cursor-default select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const dateStr = getTodayCompactDate();
                          const rand = Math.floor(1000 + Math.random() * 9000);
                          const newBatch = `BATCH-${dateStr}-${rand}`;
                          setBatchNumber(newBatch);
                          setReceivingRows((prev) => prev.map((r) => ({ ...r, batchNumber: newBatch })));
                          if (showToast) showToast(`Shipment Batch # Generated: ${newBatch}`, 'info');
                        }}
                        title={`Generate auto batch number for all receiving items (BATCH-${getTodayCompactDate()}-XXXX)`}
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
                      {aiDetectedSupplier && <span className="text-[10px] text-orange-400 font-normal flex items-center gap-1"><Sparkles className="w-3 h-3 inline" /> AI Detected</span>}
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
                        <span className="text-[10px] text-orange-400 font-normal flex items-center gap-1"><Sparkles className="w-3 h-3 inline" /> AI Detected</span>
                      ) : (
                        <span className="text-[10px] text-emerald-400 font-normal lowercase">(INV-{getTodayCompactDate()}-XXXXXX)</span>
                      )}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        readOnly
                        value={supplierInvoiceNumber}
                        /* onChange={(e) => setSupplierInvoiceNumber(e.target.value)} -- Manual typing disabled per user request, only auto-generate */
                        placeholder={`INV-${getTodayCompactDate()}-XXXXXX`}
                        className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--bg-color)]/70 border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none cursor-default select-all"
                      />
                      <button
                        type="button"
                        onClick={generateAutoInvoiceNum}
                        title={`Auto-generate unique Supplier Invoice # (e.g. INV-${getTodayCompactDate()}-XXXXXX)`}
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

              {/* Section 3: Unified Review Stock Items Cards */}
              <div className="bg-[var(--bg-color)]/35 border border-[var(--border-color)] rounded-2xl p-4 sm:p-5 space-y-4">
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

                  <div className="flex items-center gap-2">
                    {(receivingRows.length > 0 || batchNumber || receivingRef || supplierInvoiceNumber || supplierId) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to clear all items and reset the receiving form?')) {
                            handleResetForNewReceiving();
                            if (showToast) showToast('Form and scanned items have been cleared.', 'info');
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-extrabold transition-all cursor-pointer flex items-center space-x-1.5 border border-rose-500/20"
                        title="Clear all rows and reset form"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Clear All</span>
                      </button>
                    )}
                  </div>
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
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0"></span>
                          <span className="text-xs font-black text-orange-400">
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
                        className="px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
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
                        <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${extractingOcr ? 'animate-spin' : ''}`} />
                        <span>{extractingOcr ? 'Re-scanning...' : 'Re-scan'}</span>
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
                        Use the single catalog button below to add all named new items across supplier cards; stock remains unchanged until receiving is confirmed.
                      </span>
                    </div>
                  </div>
                )}

                {/* List of Stacked Item Cards */}
                <div className="space-y-4">
                  {receivingRows.length === 0 && (
                    <div className="py-12 px-4 text-center rounded-3xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-color)]/30 flex flex-col items-center justify-center space-y-3">
                      <div className="p-3.5 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        <Package className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-[var(--text-main)]">Review Table is Empty</h4>
                        <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                          Add an item with the "Add Another Item" button below, or upload an invoice (OCR / Excel) to populate items.
                        </p>
                      </div>
                    </div>
                  )}

                  {receivingRows.map((row, index) => {
                    const selectedInvItem = localInventory.find(i => String(i.id) === String(row.inventoryItemId));
                    const lineSubtotal = receivingLineSubtotal(row.quantity, row.unitCost);
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
                            ? 'border-orange-500/40 bg-orange-500/5'
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
                              <span className="px-2 py-0.5 rounded-lg bg-orange-500/20 text-orange-400 text-[9px] font-black uppercase tracking-wider border border-orange-500/30 flex items-center gap-1">
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
                                <span className="px-2.5 py-1 rounded-xl bg-orange-500/15 text-orange-300 text-[10px] font-bold border border-orange-500/30 flex items-center gap-1">
                                  <Search className="w-3 h-3 text-orange-400" />
                                  <span>Suggested: <strong className="text-white font-extrabold">{row.suggestedItem.name}</strong> ({Math.round((row.confidence || 0.7) * 100)}%)</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSelectItem(index, row.suggestedItem)}
                                  className="px-2 py-1 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black shadow-sm transition-all cursor-pointer flex items-center gap-1 active:scale-95"
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

                        {/* Card Fields: Quantity, Unit, Cost per Unit, Expiry Date (Optional), Subtotal */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center pt-1 border-t border-[var(--border-color)]/60">
                          
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

                          {/* Expiry Date (Optional) */}
                          <div>
                            <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px] flex justify-between items-center">
                              <span>Expiry Date</span>
                              <span className="text-[9px] text-[var(--text-muted)] font-normal normal-case">(Optional)</span>
                            </label>
                            <input
                              type="date"
                              value={row.expiryDate ? (typeof row.expiryDate === 'string' && row.expiryDate.length === 10 ? row.expiryDate : getTodayDateString(new Date(row.expiryDate))) : ''}
                              onChange={(e) => handleRowChange(index, 'expiryDate', e.target.value)}
                              className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                            />
                            <span className="text-[9px] text-[var(--text-muted)] block mt-0.5">
                              Leave empty if non-perishable
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
                              Cost changed — Catalog cost: <strong>Rs. {selectedInvItem.costPrice} / {selectedInvItem.unit}</strong> → Received cost: <strong>Rs. {row.unitCost} / {row.unit}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleAddRow(false)}
                      className="w-full py-3 rounded-2xl border-2 border-dashed border-[var(--border-color)] hover:border-orange-500/50 text-[var(--text-muted)] hover:text-orange-400 text-xs font-bold transition-all cursor-pointer flex items-center justify-center space-x-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Another Item</span>
                    </button>
                  </div>

              </div>

              {/* Card #1 Summary & Action stays inside the Card #1 border */}
              {hasPrimaryItems && <div className="bg-[var(--bg-color)]/55 border border-orange-500/25 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider block">
                      {additionalCards.length > 0 ? 'Card #1 Summary' : 'Stock Receiving Summary'}
                    </span>
                    {receiveSubmitMessage && <div role="alert" className="mt-2 max-w-xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">{receiveSubmitMessage}</div>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
                      <span className="text-xs font-extrabold text-[var(--text-main)]">
                        Items: <strong className="text-orange-400">{validItemsCount}</strong>
                      </span>
                      <span className="text-xs font-extrabold text-[var(--text-main)]">
                        Subtotal: <strong className="text-orange-400 font-mono">Rs. {calculatedGrandTotal.toLocaleString('en-PK')}</strong>
                      </span>
                      <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)]">
                        Discount
                        <select value={discountMode} onChange={e => setDiscountMode(e.target.value)} aria-label="Card 1 discount type" className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-1.5 text-xs text-[var(--text-main)]"><option value="PERCENT">%</option><option value="AMOUNT">Rs.</option></select>
                        <input type="number" min="0" max={discountMode === 'PERCENT' ? 100 : undefined} step="0.01" value={discountAmount} onChange={e => setDiscountAmount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0))} aria-label="Card 1 discount value" className="w-24 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-main)] focus:border-orange-500 focus:outline-none" />
                        {discountMode === 'PERCENT' && <span className="text-[10px] text-[var(--text-muted)]">Rs. {calculatedDiscountAmount.toLocaleString('en-PK')}</span>}
                      </label>
                      <span className="text-xs font-extrabold text-[var(--text-main)]">
                        Total after discount: <strong className="text-emerald-400 font-mono text-sm">Rs. {calculatedNetTotal.toLocaleString('en-PK')}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                    <button type="button" onClick={() => setPendingReceivingSaveAction({ action: 'DRAFT', cardId: 'primary' })} disabled={loading || savingDraft || bulkSavingCatalog} className="px-4 py-2.5 rounded-xl border border-orange-500/35 bg-[var(--card-bg)] text-orange-600 text-xs font-bold hover:bg-orange-500/10 disabled:opacity-50">
                      <Save className="mr-1.5 inline h-4 w-4" />Save Draft
                    </button>
                    {newItemsCount > 0 && <button type="button" onClick={() => setPendingReceivingSaveAction({ action: 'CATALOG', cardId: 'primary' })} disabled={loading || savingDraft || bulkSavingCatalog} className="px-4 py-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-700 text-xs font-bold hover:bg-amber-500/15 disabled:opacity-50">
                      {catalogSaveScope === 'primary' ? <RefreshCw className="mr-1.5 inline h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 inline h-4 w-4" />}{catalogSaveScope === 'primary' ? 'Saving…' : `Save New Item Names (${newItemsCount})`}
                    </button>}
                    <button
                      type="button"
                      onClick={() => handleInitiateSubmit('RECEIVED')}
                      disabled={loading || savingDraft || bulkSavingCatalog}
                      className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-lg shadow-orange-600/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {receivingActionScope === 'primary' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>Confirm &amp; Receive {additionalCards.length > 0 ? 'Card 1' : 'Stock'}</span>
                    </button>
                  </div>
                </div>
              </div>}
              </div>

              {/* Additional Supplier Receiving Cards */}
              {additionalCards.map((card, cardIdx) => {
                const cardSup = suppliers.find(s => String(s.id) === String(card.supplierId));
                const hasCardItems = (card.receivingRows || []).some(row => String(row?.searchTerm || '').trim() || Boolean(row?.inventoryItemId));
                const cardTotal = sumReceivingSubtotals(card.receivingRows);
                const cardDiscountValue = getReceivingDiscountAmount(cardTotal, card.discountAmount, card.discountMode);
                const cardNetTotal = Math.max(0, roundReceivingMoney(cardTotal - cardDiscountValue));
                const cardValidCount = card.receivingRows.filter(r => r.inventoryItemId).length;
                const cardNewCount = card.receivingRows.filter(r => !r.inventoryItemId && String(r.searchTerm || '').trim()).length;

                return (
                  <div key={card.id} className="bg-[var(--card-bg)] border-2 border-orange-500/40 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl animate-scale-up">
                    {/* Header of Additional Card */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[var(--border-color)] pb-3">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1.5 rounded-xl bg-orange-500/20 text-orange-300 font-black text-xs uppercase tracking-wider border border-orange-500/30 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-orange-400" />
                          Delivery Card #{cardIdx + 2} (Different Supplier)
                        </span>
                        <div>
                          <h4 className="text-sm font-black text-[var(--text-main)]">
                            Supplier: {cardSup?.name || card.aiDetectedSupplier || 'Local Market / Other'}
                          </h4>
                          <p className="text-[10px] text-[var(--text-muted)]">
                            Independent receiving session with distinct Reference, Batch &amp; Invoice numbers
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveAdditionalCard(card.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-rose-500/20 shrink-0"
                        title="Discard this supplier receiving card"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Discard Card #{cardIdx + 2}</span>
                      </button>
                    </div>

                    {/* Metadata Grid for Additional Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 bg-[var(--bg-color)]/60 p-4 rounded-2xl border border-[var(--border-color)]">
                      {/* Internal Reference */}
                      <div>
                        <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px] flex justify-between items-center">
                          <span>Internal Reference *</span>
                          <span className="text-[10px] text-orange-400 font-normal lowercase">Independent</span>
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            readOnly
                            value={card.receivingRef}
                            placeholder={`RCV-${getTodayCompactDate()}-XXXX`}
                            className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--card-bg)]/80 border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none cursor-default select-all"
                          />
                          <button
                            type="button"
                            onClick={() => generateAutoRefForCard(card.id)}
                            title="Generate unique Internal Reference"
                            className="absolute right-2 p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Shipment Batch Number */}
                      <div>
                        <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px] flex justify-between items-center">
                          <span>Shipment Batch Number</span>
                          <span className="text-[10px] text-orange-400 font-normal lowercase">Independent</span>
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            readOnly
                            value={card.batchNumber}
                            placeholder={`BATCH-${getTodayCompactDate()}-XXXX`}
                            className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--card-bg)]/80 border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none cursor-default select-all"
                          />
                          <button
                            type="button"
                            onClick={() => generateAutoBatchForCard(card.id)}
                            title="Generate unique Shipment Batch Number"
                            className="absolute right-2 p-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Supplier Selector */}
                      <div>
                        <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                          Supplier
                        </label>
                        <select
                          value={card.supplierId}
                          onChange={(e) => handleUpdateCardField(card.id, 'supplierId', e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                        >
                          <option value="">-- Local Market / Not Provided --</option>
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
                          <span className="text-[10px] text-emerald-400 font-normal lowercase">Independent</span>
                        </label>
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            readOnly
                            value={card.supplierInvoiceNumber}
                            placeholder={`INV-${getTodayCompactDate()}-XXXXXX`}
                            className="w-full pl-3.5 pr-9 py-2.5 bg-[var(--card-bg)]/80 border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none cursor-default select-all"
                          />
                          <button
                            type="button"
                            onClick={() => generateAutoInvoiceForCard(card.id)}
                            title="Auto-generate unique Supplier Invoice #"
                            className="absolute right-2 p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Receiving Date */}
                      <div>
                        <label className="block font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                          Receiving Date
                        </label>
                        <input
                          type="date"
                          value={card.receivingDate}
                          onChange={(e) => handleUpdateCardField(card.id, 'receivingDate', e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Items Section for Additional Card */}
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <h5 className="text-xs font-black uppercase text-[var(--text-main)] tracking-wider">
                            Card #{cardIdx + 2} Items ({card.receivingRows.length})
                          </h5>
                          <span className="text-[11px] font-bold text-emerald-400">
                            {cardValidCount} matched
                          </span>
                          {cardNewCount > 0 && (
                            <span className="text-[11px] font-bold text-amber-400">
                              • {cardNewCount} new
                            </span>
                          )}
                        </div>

                      </div>

                      {/* List of rows */}
                      <div className="space-y-2.5">
                        {card.receivingRows.map((r, rIdx) => {
                          const lineSubtotal = receivingLineSubtotal(r.quantity, r.unitCost);
                          return (
                            <div key={rIdx} className="p-4 rounded-2xl bg-[var(--bg-color)]/70 border border-[var(--border-color)] space-y-3">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div className="flex-1 w-full sm:w-auto relative">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                                      {rIdx + 1}
                                    </span>
                                    <input
                                      type="text"
                                      value={r.searchTerm}
                                      onChange={(e) => {
                                        handleCardRowChange(card.id, rIdx, 'searchTerm', e.target.value);
                                        handleCardRowChange(card.id, rIdx, 'showSearchDropdown', true);
                                      }}
                                      onFocus={() => handleCardRowChange(card.id, rIdx, 'showSearchDropdown', true)}
                                      placeholder="Search catalog item or enter name..."
                                      className="w-full px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                                    />
                                  </div>

                                  {/* Dropdown */}
                                  {r.showSearchDropdown && r.searchTerm && (
                                    <div className="absolute left-7 right-0 top-full mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-[var(--border-color)]/40">
                                      {(() => {
                                        const q = r.searchTerm.toLowerCase().trim();
                                        const matches = localInventory.filter(i => i.name.toLowerCase().includes(q) || (i.category && i.category.toLowerCase().includes(q)));
                                        if (matches.length === 0) {
                                          return <div className="p-2 text-center text-[10px] text-[var(--text-muted)]">No match in catalog</div>;
                                        }
                                        return matches.map(invItem => (
                                          <button
                                            key={invItem.id}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => handleCardSelectItem(card.id, rIdx, invItem)}
                                            className="w-full text-left px-3 py-1.5 hover:bg-orange-500/10 text-xs flex justify-between items-center cursor-pointer"
                                          >
                                            <span className="font-bold text-[var(--text-main)]">{invItem.name}</span>
                                            <span className="text-[10px] text-orange-400 uppercase font-mono">{invItem.unit}</span>
                                          </button>
                                        ));
                                      })()}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  {r.inventoryItemId ? (
                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-[9px] font-black uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
                                      <Check className="w-3 h-3" /> Matched
                                    </span>
                                  ) : (
                                    <>
                                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-wider border border-amber-500/30 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> New Item
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSaveCatalogModal(rIdx, card.id)}
                                        className="px-2 py-1 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black shadow-sm transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                                        title="Save this new item into Inventory Catalog (Stock: 0)"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span>Save in Catalog</span>
                                      </button>
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleCardRemoveRow(card.id, rIdx)}
                                    className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer border border-rose-500/20"
                                    title="Remove item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Row inputs */}
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                                <div>
                                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">Quantity</label>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0.01"
                                    value={r.quantity}
                                    onChange={(e) => handleCardRowChange(card.id, rIdx, 'quantity', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">Unit</label>
                                  <select
                                    value={r.unit}
                                    onChange={(e) => handleCardRowChange(card.id, rIdx, 'unit', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none cursor-pointer"
                                  >
                                    {STANDARD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">Unit Cost (Rs.)</label>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={r.unitCost}
                                    onChange={(e) => handleCardRowChange(card.id, rIdx, 'unitCost', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-0.5">
                                    Expiry <span className="font-normal lowercase">(optional)</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={r.expiryDate ? (typeof r.expiryDate === 'string' && r.expiryDate.length === 10 ? r.expiryDate : getTodayDateString(new Date(r.expiryDate))) : ''}
                                    onChange={(e) => handleCardRowChange(card.id, rIdx, 'expiryDate', e.target.value)}
                                    className="w-full px-2.5 py-1.5 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none cursor-pointer"
                                  />
                                </div>

                                <div className="flex flex-col justify-center items-end bg-[var(--card-bg)] p-2 rounded-xl border border-[var(--border-color)] col-span-2 sm:col-span-1">
                                  <span className="text-[9px] font-black text-[var(--text-muted)] uppercase">Subtotal</span>
                                  <span className="text-xs font-mono font-black text-orange-400">Rs. {lineSubtotal.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCardAddRow(card.id)}
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--border-color)] hover:border-orange-500/50 text-[var(--text-muted)] hover:text-orange-400 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Another Item</span>
                      </button>
                    </div>

                    {/* Card Action & Summary Bar */}
                    {hasCardItems && <div className="bg-[var(--bg-color)]/80 border border-[var(--border-color)] p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase text-[var(--text-muted)] block">Card #{cardIdx + 2} Summary</span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-1">
                          <span className="text-xs font-bold text-[var(--text-main)]">{cardValidCount} of {card.receivingRows.length} items valid</span>
                          <span className="text-xs font-bold text-[var(--text-main)]">Subtotal: <strong className="font-mono text-orange-400">Rs. {cardTotal.toLocaleString('en-PK')}</strong></span>
                          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-main)]">Discount
                            <select value={card.discountMode || 'AMOUNT'} onChange={e => handleUpdateCardField(card.id, 'discountMode', e.target.value)} aria-label={`Card ${cardIdx + 2} discount type`} className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-1.5 text-xs text-[var(--text-main)]"><option value="PERCENT">%</option><option value="AMOUNT">Rs.</option></select>
                            <input type="number" min="0" max={card.discountMode === 'PERCENT' ? 100 : undefined} step="0.01" value={card.discountAmount ?? 0} onChange={e => handleUpdateCardField(card.id, 'discountAmount', e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0))} aria-label={`Card ${cardIdx + 2} discount value`} className="w-24 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-1.5 font-mono text-xs text-[var(--text-main)] focus:border-orange-500 focus:outline-none" />
                            {card.discountMode === 'PERCENT' && <span className="text-[10px] text-[var(--text-muted)]">Rs. {cardDiscountValue.toLocaleString('en-PK')}</span>}
                          </label>
                          <span className="text-xs font-bold text-[var(--text-main)]">Total after discount: <strong className="font-mono text-emerald-400">Rs. {cardNetTotal.toLocaleString('en-PK')}</strong></span>
                        </div>
                        {cardReceiveMessages[card.id] && <div role="alert" className="mt-2 max-w-xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">{cardReceiveMessages[card.id]}</div>}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                        <button type="button" onClick={() => setPendingReceivingSaveAction({ action: 'DRAFT', cardId: card.id })} disabled={loading || savingDraft || bulkSavingCatalog} className="px-4 py-2 rounded-xl border border-orange-500/35 bg-[var(--card-bg)] text-orange-600 text-xs font-bold hover:bg-orange-500/10 disabled:opacity-50">
                          <Save className="mr-1.5 inline h-4 w-4" />Save Draft
                        </button>
                        {cardNewCount > 0 && <button type="button" onClick={() => setPendingReceivingSaveAction({ action: 'CATALOG', cardId: card.id })} disabled={loading || savingDraft || bulkSavingCatalog} className="px-4 py-2 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-700 text-xs font-bold hover:bg-amber-500/15 disabled:opacity-50">
                          {catalogSaveScope === card.id ? <RefreshCw className="mr-1.5 inline h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 inline h-4 w-4" />}{catalogSaveScope === card.id ? 'Saving…' : `Save New Item Names (${cardNewCount})`}
                        </button>}
                        <button
                          type="button"
                          onClick={() => executeSubmitAdditionalCard(card.id, 'RECEIVED')}
                          disabled={loading || savingDraft || bulkSavingCatalog}
                          className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {receivingActionScope === card.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          <span>{receivingActionScope === card.id ? 'Receiving…' : `Confirm & Receive (Card #${cardIdx + 2})`}</span>
                        </button>
                      </div>
                    </div>}
                  </div>
                );
              })}

              {/* Add New Supplier / New Delivery */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 pb-2">
                <button
                  type="button"
                  onClick={handleAddNewSupplierDeliveryCard}
                  className="px-6 py-3 rounded-2xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-md hover:shadow-orange-500/10"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Supplier / New Delivery</span>
                </button>
              </div>

              {/* Multi-Delivery Global Action Bar in the footer */}
              {additionalCards.length > 0 && (
                <div className="bg-[var(--card-bg)] border border-orange-500/35 rounded-2xl p-4 sm:px-5 sm:py-4 shadow-md relative overflow-hidden flex flex-col sm:flex-row justify-between items-center gap-4 animate-scale-up">
                  <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-orange-500 to-amber-400" />
                  <div className="min-w-0 space-y-1.5 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500"><Layers className="w-4 h-4" /></span>
                      <h4 className="text-sm font-extrabold text-[var(--text-main)] uppercase tracking-wide">
                        {additionalCards.length + 1} Separate Deliveries Active
                      </h4>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      Save each supplier separately as a draft, or add all new item names to the catalog in one action.
                    </p>
                  </div>
                  <div className="flex w-full sm:w-auto flex-col sm:flex-row flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingReceivingSaveAction({ action: 'DRAFT', cardId: null })}
                      disabled={loading || savingDraft || bulkSavingCatalog}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[var(--bg-color)] hover:bg-orange-500/10 text-orange-600 border border-orange-500/35 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save All Deliveries to Draft</span>
                    </button>
                    {allDeliveryNewItemsCount > 0 && <button
                      type="button"
                      onClick={() => setPendingReceivingSaveAction({ action: 'CATALOG', cardId: null })}
                      disabled={loading || savingDraft || bulkSavingCatalog}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white border border-orange-500 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {catalogSaveScope === 'all' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      <span>{catalogSaveScope === 'all' ? 'Saving items…' : `Save All New Item Names (${allDeliveryNewItemsCount})`}</span>
                    </button>}
                  </div>
                </div>
              )}

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
              {editingDraftId && receivingRows.some(row => !row.inventoryItemId && String(row.searchTerm || '').trim())
                ? 'New named items in this saved draft will be created in the catalog, their received quantities will be added to stock, and stock logs will be saved.'
                : 'Receiving this stock will immediately update catalog balances (New Stock = Current + Received) and save stock logs.'}
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
                disabled={loading || savingDraft}
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
                <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <BulkSelectionModeButton
                active={historySelectionMode}
                selectedCount={selectedReceivingIds.size}
                onClick={() => {
                  setHistorySelectionMode(active => !active);
                  setSelectedReceivingIds(new Set());
                }}
              />
              {historySelectionMode && (
                <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
                  <input
                    type="checkbox"
                    checked={allEligibleReceivingsSelected}
                    disabled={eligibleReceivingIds.length === 0 || historyLoading}
                    onChange={() => setSelectedReceivingIds(current => {
                      const next = new Set(current);
                      if (allEligibleReceivingsSelected) eligibleReceivingIds.forEach(id => next.delete(id));
                      else eligibleReceivingIds.forEach(id => next.add(id));
                      return next;
                    })}
                    className="accent-orange-500"
                  />
                  Select eligible ({eligibleReceivingIds.length})
                </label>
              )}
            </div>
            {historySelectionMode && selectedReceivingIds.size > 0 && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSelectedReceivingIds(new Set())} className="rounded-xl border border-[var(--border-color)] px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]">Clear</button>
                <button type="button" onClick={() => setBulkDeleteConfirm(true)} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white hover:bg-rose-500">
                  <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selectedReceivingIds.size})
                </button>
              </div>
            )}
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                    {historySelectionMode && <th className="p-4 w-10"><input type="checkbox" checked={allEligibleReceivingsSelected} disabled={eligibleReceivingIds.length === 0 || historyLoading} onChange={() => setSelectedReceivingIds(current => { const next = new Set(current); if (allEligibleReceivingsSelected) eligibleReceivingIds.forEach(id => next.delete(id)); else eligibleReceivingIds.forEach(id => next.add(id)); return next; })} className="accent-orange-500" aria-label="Select all eligible receiving records" /></th>}
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
                  {historyLoading ? (
                    <tr>
                      <td colSpan={historySelectionMode ? 8 : 7} className="p-12 text-center text-[var(--text-muted)] text-xs">
                        <span className="inline-flex items-center gap-2 text-orange-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading receiving history…</span>
                      </td>
                    </tr>
                  ) : receivingsList.length === 0 ? (
                    <tr>
                      <td colSpan={historySelectionMode ? 8 : 7} className="p-8 text-center text-[var(--text-muted)] text-xs">
                        No receiving records found.
                      </td>
                    </tr>
                  ) : (
                    receivingsList.map((rec) => (
                      <tr key={rec.id} className="hover:bg-[var(--bg-color)]/40 transition-colors">
                        {historySelectionMode && <td className="p-4"><input type="checkbox" checked={selectedReceivingIds.has(rec.id)} disabled={!['DRAFT', 'CANCELLED'].includes(String(rec.status).toUpperCase()) || historyLoading} onChange={() => setSelectedReceivingIds(current => { const next = new Set(current); if (next.has(rec.id)) next.delete(rec.id); else next.add(rec.id); return next; })} className="accent-orange-500 disabled:opacity-30" aria-label={`Select ${rec.receivingNumber || 'receiving record'} for deletion`} /></td>}
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
                          {rec.itemCount ?? rec.items?.length ?? 0} items
                        </td>
                        <td className="p-4 font-mono font-black text-emerald-400">
                          <div>Rs. {(rec.totalCost || 0).toLocaleString()}</div>
                          {Number(rec.discount || 0) > 0 && <div className="mt-1 text-[9px] font-semibold text-[var(--text-muted)]">Subtotal Rs. {(rec.subtotal || 0).toLocaleString()} · Discount Rs. {Number(rec.discount).toLocaleString()}</div>}
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
                        <td className="p-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedReceiving(rec);
                                setShowDetailsModal(true);
                              }}
                              className="p-1.5 rounded-lg bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                              title="View details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {rec.status === 'DRAFT' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => requestResumeDraft(rec)}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 font-bold text-[10px] transition-colors cursor-pointer whitespace-nowrap"
                                  title="Resume and edit this draft"
                                >
                                  Resume
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmDraft(rec.id)}
                                  disabled={confirmingDraftIds.has(String(rec.id))}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                                  title="Confirm and update stock now"
                                >
                                  {confirmingDraftIds.has(String(rec.id)) && <RefreshCw className="w-3 h-3 animate-spin" />}
                                  <span>{confirmingDraftIds.has(String(rec.id)) ? 'Confirming…' : 'Confirm'}</span>
                                </button>
                              </>
                            )}
                            {['DRAFT', 'CANCELLED'].includes(String(rec.status).toUpperCase()) && (
                              <button
                                type="button"
                                onClick={() => setReceivingToDelete(rec)}
                                disabled={deleteReceivingLoading}
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                                title="Delete draft/cancelled receiving"
                                aria-label={`Delete receiving ${rec.receivingNumber || rec.invoiceNumber}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
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
                <Camera className="w-5 h-5 text-orange-400" />
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
                <Camera className="w-8 h-8 text-orange-400 mx-auto" />
                <span className="text-xs font-bold text-[var(--text-main)] block">Upload Invoice Image or PDF</span>
                <span className="text-[10px] text-[var(--text-muted)] block">Groq AI Vision extracts supplier, invoice #, items, batch # & expiry dates into Review Stock.</span>
              </label>
            </div>

            {extractingOcr && (
              <div className="text-center py-4 text-xs font-bold text-orange-400 animate-pulse flex items-center justify-center gap-2">
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
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-color)] p-3.5 text-xs">
              <div className="text-[var(--text-muted)]">Subtotal<strong className="mt-1 block font-mono text-[var(--text-main)]">Rs. {Number(selectedReceiving.subtotal || selectedReceiving.totalCost || 0).toLocaleString('en-PK')}</strong></div>
              <div className="text-[var(--text-muted)]">Discount<strong className="mt-1 block font-mono text-orange-400">Rs. {Number(selectedReceiving.discount || 0).toLocaleString('en-PK')}</strong></div>
              <div className="text-[var(--text-muted)]">Total after discount<strong className="mt-1 block font-mono text-emerald-400">Rs. {Number(selectedReceiving.totalCost || 0).toLocaleString('en-PK')}</strong></div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-[var(--text-muted)]">Items Received</h4>
              <div className="max-h-60 overflow-x-auto overflow-y-auto border border-[var(--border-color)] rounded-2xl">
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
                    {[
                      ...(selectedReceiving.items || []).map(i => ({ ...i, isDraftNewItem: false })),
                      ...(selectedReceiving.draftItems || []).map((i, index) => ({ ...i, id: `draft-${index}`, isDraftNewItem: true }))
                    ].map((i) => (
                      <tr key={i.id}>
                        <td className="p-3 font-bold text-[var(--text-main)]">{i.inventoryItem?.name || i.name || i.searchTerm || 'Unnamed item'}{i.isDraftNewItem && <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">NEW</span>}</td>
                        <td className="p-3 font-mono">{i.quantity} {i.unit}</td>
                        <td className="p-3 font-mono">Rs. {i.unitCost ?? i.costPrice ?? 0}</td>
                        <td className="p-3 font-mono text-[10px] text-[var(--text-muted)]">
                          {i.batchNumber || 'No Batch'} | {i.expiryDate ? new Date(i.expiryDate).toLocaleDateString() : 'No Expiry'}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400 text-right">Rs. {i.totalCost ?? (Number(i.quantity || 0) * Number(i.unitCost ?? i.costPrice ?? 0))}</td>
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
                <FileText className="w-5 h-5 text-orange-400" />
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
                  className="px-3 py-1.5 rounded-xl bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 border border-orange-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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

      {/* Upload Choice Modal (Same Supplier Merge vs Different Supplier Separate Card) */}
      {showMergeChoiceModal && (pendingUploadData || pendingUploadRows) && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6 shadow-2xl max-w-lg w-full mx-4 space-y-5 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-3">
                {pendingUploadData?.isSameSupplier ? (
                  <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2.5 rounded-2xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                    <Building2 className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-black text-[var(--text-main)] font-display">
                    {pendingUploadData?.isSameSupplier
                      ? 'Same Supplier Detected'
                      : 'Different Supplier Invoice Detected!'}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {pendingUploadData?.isSameSupplier
                      ? `Both invoices match "${pendingUploadData.supplierName}"`
                      : 'Separate delivery record recommended for accurate stock tracking'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowMergeChoiceModal(false); setPendingUploadRows(null); setPendingUploadData(null); }}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Comparison Details if Different Supplier */}
            {!pendingUploadData?.isSameSupplier && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[var(--bg-color)]/80 border border-[var(--border-color)] text-xs">
                {/* Existing Delivery Box */}
                <div className="space-y-1.5 border-b sm:border-b-0 sm:border-r border-[var(--border-color)]/60 pb-2 sm:pb-0 sm:pr-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-orange-400 tracking-wider">Card #1 (Current)</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{receivingRows.filter(r => r.searchTerm || r.inventoryItemId).length} items</span>
                  </div>
                  <p className="font-extrabold text-[var(--text-main)] truncate" title={pendingUploadData?.currentSupplierName}>
                    {pendingUploadData?.currentSupplierName || 'Current Receiving'}
                  </p>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono space-y-0.5">
                    <div>Ref: <span className="text-[var(--text-main)] font-bold">{receivingRef || 'None'}</span></div>
                    <div>Batch: <span className="text-[var(--text-main)] font-bold">{batchNumber || 'None'}</span></div>
                    <div>Inv: <span className="text-[var(--text-main)] font-bold">{supplierInvoiceNumber || 'None'}</span></div>
                  </div>
                </div>

                {/* Newly Scanned Delivery Box */}
                <div className="space-y-1.5 sm:pl-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-orange-400 tracking-wider">Scanned Delivery</span>
                    <span className="text-[10px] text-orange-400 font-bold">{pendingUploadData?.newRows?.length || pendingUploadRows?.length} items</span>
                  </div>
                  <p className="font-extrabold text-orange-300 truncate" title={pendingUploadData?.supplierName}>
                    {pendingUploadData?.supplierName || 'New Supplier'}
                  </p>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono space-y-0.5">
                    <div>Inv: <span className="text-emerald-400 font-bold">{pendingUploadData?.invoiceNumber}</span></div>
                    <div>Ref: <span className="text-orange-400 font-bold">Auto-assigned unique</span></div>
                    <div>Batch: <span className="text-orange-400 font-bold">Auto-assigned unique</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {pendingUploadData?.isSameSupplier ? (
                <>
                  Card #1 already contains <strong className="text-[var(--text-main)] font-black">{receivingRows.filter(r => r.searchTerm || r.inventoryItemId).length} items</strong> from <strong className="text-emerald-400 font-black">{pendingUploadData.supplierName}</strong>. You can merge the <strong className="text-emerald-400 font-black">{pendingUploadRows?.length || pendingUploadData.newRows?.length} newly imported items</strong> (duplicate items will combine quantities automatically).
                </>
              ) : (
                <>
                  These invoices are from <strong>different suppliers</strong>. Creating a separate receiving card ensures independent <strong className="text-orange-400 font-black">Reference Numbers</strong>, <strong className="text-orange-400 font-black">Batch Numbers</strong>, and <strong className="text-orange-400 font-black">Supplier Invoices</strong> so your inventory audits remain 100% accurate.
                </>
              )}
            </p>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              {!pendingUploadData?.isSameSupplier ? (
                <>
                  {/* Button 1: Create Separate Card (RECOMMENDED) */}
                  <button
                    type="button"
                    onClick={handleCreateSeparateCard}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 hover:from-orange-500 hover:to-amber-400 text-white font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-orange-600/25 active:scale-[0.98]"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Create Separate Card for {pendingUploadData?.supplierName || 'Supplier'} (Independent Ref#, Batch#, Inv#)</span>
                  </button>

                  {/* Button 2: Merge into Card 1 anyway */}
                  <button
                    type="button"
                    onClick={handleMergeAppend}
                    className="w-full py-2.5 px-4 rounded-2xl bg-[var(--bg-color)] hover:bg-[var(--border-color)]/40 text-[var(--text-main)] font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 border border-[var(--border-color)]"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>Merge into Card #1 Anyway (Combine Items)</span>
                  </button>

                  {/* Button 3: Replace Card 1 */}
                  <button
                    type="button"
                    onClick={handleMergeReplace}
                    className="w-full py-2.5 px-4 rounded-2xl bg-[var(--bg-color)] hover:bg-orange-500/10 text-orange-400 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 border border-orange-500/20"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Replace Card #1 with New Scanned Delivery</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Same Supplier: Merge Items */}
                  <button
                    type="button"
                    onClick={handleMergeAppend}
                    className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Merge Items into Card #1 (Combine Quantities &amp; Avoid Duplicates)</span>
                  </button>

                  {/* Same Supplier: Create Separate Card anyway */}
                  <button
                    type="button"
                    onClick={handleCreateSeparateCard}
                    className="w-full py-2.5 px-4 rounded-2xl bg-[var(--bg-color)] hover:bg-orange-500/10 text-orange-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 border border-orange-500/20"
                  >
                    <Layers className="w-4 h-4 text-orange-400" />
                    <span>Keep as Separate Delivery Card (Independent Ref#, Batch#, Inv#)</span>
                  </button>

                  {/* Same Supplier: Replace */}
                  <button
                    type="button"
                    onClick={handleMergeReplace}
                    className="w-full py-2.5 px-4 rounded-2xl bg-[var(--bg-color)] hover:bg-orange-500/10 text-orange-400 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 border border-orange-500/20"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Replace All (Start Fresh with New Items)</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => { setShowMergeChoiceModal(false); setPendingUploadRows(null); setPendingUploadData(null); }}
                className="w-full py-2.5 rounded-2xl bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 text-[var(--text-muted)] font-bold text-xs transition-all cursor-pointer border border-[var(--border-color)]"
              >
                Cancel Import
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <GlobalDeleteModal
        isOpen={Boolean(receivingToDelete) || bulkDeleteConfirm}
        onClose={() => { setReceivingToDelete(null); setBulkDeleteConfirm(false); }}
        onConfirm={bulkDeleteConfirm ? handleBulkDeleteReceivings : handleDeleteReceiving}
        title={bulkDeleteConfirm ? 'Delete Selected Receiving Records' : 'Delete Receiving Record'}
        message={bulkDeleteConfirm
          ? 'Delete the selected draft/cancelled receiving records? Confirmed stock receipts are protected.'
          : `Delete receiving ${receivingToDelete?.receivingNumber || receivingToDelete?.invoiceNumber || ''}? Only draft or cancelled records can be removed.`}
        itemName={bulkDeleteConfirm ? undefined : receivingToDelete?.supplier?.name || 'Receiving record'}
        itemCount={bulkDeleteConfirm ? selectedReceivingIds.size : 1}
        isBulk={bulkDeleteConfirm}
        itemDetails={receivingToDelete ? {
          reference: receivingToDelete.receivingNumber || receivingToDelete.invoiceNumber || 'N/A',
          status: receivingToDelete.status,
          items: `${receivingToDelete.items?.length || 0} items`,
          totalCost: `Rs. ${Number(receivingToDelete.totalCost || 0).toLocaleString()}`,
        } : null}
        confirmButtonText={bulkDeleteConfirm ? `Delete ${selectedReceivingIds.size} Records` : 'Delete Receiving'}
        loading={bulkDeleteConfirm ? bulkDeleteReceivingLoading : deleteReceivingLoading}
        dangerLevel="danger"
        warningNotes={[
          'Confirmed stock receipts are protected and cannot be deleted.',
          'Deleting a draft/cancelled record also removes its saved receiving item rows.',
        ]}
      />

      {pendingReceivingSaveAction && createPortal(
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !loading && !savingDraft && !bulkSavingCatalog) setPendingReceivingSaveAction(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="receiving-save-confirm-title" className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-2xl">
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${pendingReceivingSaveAction.action === 'DRAFT' ? 'bg-amber-500/15 text-amber-600' : 'bg-orange-500/15 text-orange-600'}`}>
              <Save className="h-5 w-5" />
            </div>
            <h3 id="receiving-save-confirm-title" className="text-lg font-bold text-[var(--text-main)]">
              {pendingReceivingSaveAction.action === 'DRAFT'
                ? (pendingReceivingSaveAction.cardId ? 'Save this supplier card as a draft?' : 'Save all supplier cards as drafts?')
                : (pendingReceivingSaveAction.cardId ? 'Save this card’s new item names to the catalog?' : 'Save all cards’ new item names to the catalog?')}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              {pendingReceivingSaveAction.action === 'DRAFT'
                ? pendingReceivingSaveAction.cardId
                  ? 'Only this card will be saved in Receiving History. Its stock will not change.'
                  : `Each supplier delivery will be saved separately (${additionalCards.length + 1} delivery cards). Drafts will appear in Receiving History and will not change stock.`
                : pendingReceivingSaveAction.cardId
                  ? 'Only named new items from this card will be added to the catalog with zero stock. This does not confirm receiving.'
                  : `Named new items from all supplier cards (${allDeliveryNewItemsCount}) will be added to the catalog with zero stock. Existing matched items stay linked; stock is not received.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={loading || savingDraft || bulkSavingCatalog} onClick={() => setPendingReceivingSaveAction(null)} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={loading || savingDraft || bulkSavingCatalog} onClick={confirmReceivingSaveAction} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-50">
                {(loading || savingDraft || bulkSavingCatalog) && <RefreshCw className="h-4 w-4 animate-spin" />}
                {pendingReceivingSaveAction.action === 'DRAFT'
                  ? (pendingReceivingSaveAction.cardId ? 'Save Draft' : 'Save All Drafts')
                  : (pendingReceivingSaveAction.cardId ? 'Save New Item Names' : 'Save All New Item Names')}
              </button>
            </div>
          </section>
        </div>, document.body
      )}

      {draftSaveResult && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setDraftSaveResult(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="receiving-draft-result-title" className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-2xl">
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${draftSaveResult.success ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>
              {draftSaveResult.success ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
            </div>
            <h3 id="receiving-draft-result-title" className="text-lg font-bold text-[var(--text-main)]">{draftSaveResult.success ? 'Draft saved' : 'Draft not saved'}</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{draftSaveResult.message}</p>
            <button type="button" autoFocus onClick={() => setDraftSaveResult(null)} className="mt-5 w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white">Close</button>
          </section>
        </div>, document.body
      )}

      {pendingResumeDraft && createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="resume-draft-title" className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-500"><AlertTriangle className="h-5 w-5" /></span>
              <div>
                <h3 id="resume-draft-title" className="text-base font-bold text-[var(--text-main)]">You have receiving work in progress</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  Before opening <strong className="text-[var(--text-main)]">{pendingResumeDraft.receivingNumber || 'this saved draft'}</strong>, choose what to do with the items currently on this screen. Saving them creates a separate draft and does not update stock.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-2.5">
              <button type="button" onClick={saveCurrentAndResumeDraft} disabled={resumeDraftSaving || loading || savingDraft} className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-500 disabled:cursor-wait disabled:opacity-60">
                {resumeDraftSaving ? 'Saving current work…' : 'Save current work as draft and continue'}
              </button>
              <button type="button" onClick={() => { const draft = pendingResumeDraft; setPendingResumeDraft(null); loadDraftIntoForm(draft); }} disabled={resumeDraftSaving || loading || savingDraft} className="w-full rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 disabled:opacity-50">
                Discard current work and continue
              </button>
              <button type="button" onClick={() => setPendingResumeDraft(null)} disabled={resumeDraftSaving || loading || savingDraft} className="w-full rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-50">
                Cancel
              </button>
            </div>
          </section>
        </div>, document.body
      )}

    </div>
  );
};

export default AdminInventoryReceivingView;


