/**
 * AI / OCR Invoice & Excel/CSV Parsing and Catalog Matching Service for ZovikPOS
 * Supports .xlsx, .xls, .csv files, PDF/image OCR text, Groq AI Vision scan, and matches rows against InventoryItem catalog.
 */
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { prisma } = require('../config/db');
const { analyzeInvoiceImageWithGroq, parseInvoiceTextWithGroq } = require('./groqService');
const { inferCategoryFromItemName } = require('../utils/categoryHelper');
const { getPhoneticFingerprint, getLearnedAliases } = require('./aliasService');

/**
 * Normalizes header string for fuzzy matching
 */
const normalizeHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Normalizes item names for exact and token comparison (preserves Unicode letters like Urdu script)
 */
const normalizeItemName = (str) => {
  return String(str || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Groups of mutually exclusive variant keywords.
 * If an invoice item and a catalog candidate contain DIFFERENT keywords from the same group,
 * they MUST NEVER be auto-matched!
 */
const VARIANT_EXCLUSIVE_GROUPS = [
  // Meat cuts & preparations
  ['breast', 'mince', 'keema', 'qeema', 'wings', 'thigh', 'boneless', 'fillet', 'boti', 'tikka', 'patty', 'patties', 'kebab', 'kabab', 'seekh', 'strips'],
  // Meat species
  ['chicken', 'beef', 'mutton', 'lamb', 'fish', 'prawn', 'prawns', 'shrimp'],
  // Bakery
  ['bun', 'buns', 'bread', 'pita', 'naan', 'paratha', 'crust', 'dough', 'croissant'],
  // Fats & dairy
  ['oil', 'ghee', 'butter', 'cream', 'milk', 'yogurt', 'curd', 'cheese'],
  // Physical form
  ['powder', 'seeds', 'flakes', 'paste', 'sauce', 'whole', 'slices', 'shredded'],
  // Volume/packaging sizes
  ['250ml', '500ml', '1l', '1.5l', '2l', '19l', '1kg', '5kg', '10kg', 'small', 'medium', 'large']
];

/**
 * Checks if two item names have conflicting exclusive variant keywords.
 */
const hasConflictingVariants = (name1, name2) => {
  const norm1 = normalizeItemName(name1);
  const norm2 = normalizeItemName(name2);
  const words1 = new Set(norm1.split(' '));
  const words2 = new Set(norm2.split(' '));

  for (const group of VARIANT_EXCLUSIVE_GROUPS) {
    const foundIn1 = group.filter(w => words1.has(w));
    const foundIn2 = group.filter(w => words2.has(w));

    if (foundIn1.length > 0 && foundIn2.length > 0) {
      // Both specify a keyword from this variant group. Check if they overlap.
      const overlap = foundIn1.some(w => foundIn2.includes(w));
      if (!overlap) {
        // They explicitly specify DIFFERENT variants from the same category! (e.g. breast vs mince)
        return true;
      }
    }
  }

  return false;
};

// Urdu / Roman Urdu / English comprehensive POS Alias Dictionary for Smart Match
const ITEM_ALIASES_MAP = {
  // Vegetables & Fresh Produce
  'aloo': ['potatoes', 'potato', 'fresh potatoes', 'alu', 'allu', 'آلو'],
  'alu': ['potatoes', 'potato', 'fresh potatoes', 'aloo', 'آلو'],
  'آلو': ['potatoes', 'potato', 'aloo', 'alu'],
  'potatoes': ['potato', 'aloo', 'alu', 'آلو'],
  'potato': ['potatoes', 'aloo', 'alu', 'آلو'],

  'pyaz': ['onions', 'onion', 'pyaaz', 'piyaz', 'red onions', 'پیاز'],
  'pyaaz': ['onions', 'onion', 'pyaz', 'پیاز'],
  'piyaz': ['onions', 'onion', 'pyaz', 'پیاز'],
  'پیاز': ['onions', 'onion', 'pyaz', 'pyaaz'],
  'onions': ['onion', 'pyaz', 'pyaaz', 'پیاز'],
  'onion': ['onions', 'pyaz', 'pyaaz', 'پیاز'],

  'tamatar': ['tomatoes', 'tomato', 'tamaatar', 'fresh tomatoes', 'ٹماٹر'],
  'tamaatar': ['tomatoes', 'tomato', 'tamatar', 'ٹماٹر'],
  'ٹماٹر': ['tomatoes', 'tomato', 'tamatar'],
  'tomatoes': ['tomato', 'tamatar', 'ٹماٹر'],
  'tomato': ['tomatoes', 'tamatar', 'ٹماٹر'],

  'adrak': ['ginger', 'fresh ginger', 'adrak paste', 'ادرک'],
  'ادرک': ['ginger', 'adrak'],
  'ginger': ['adrak', 'fresh ginger', 'ادرک'],

  'lehsan': ['garlic', 'lahsan', 'lasun', 'lehsun', 'garlic paste', 'لہسن'],
  'lahsan': ['garlic', 'lehsan', 'لہسن'],
  'لہسن': ['garlic', 'lehsan', 'lahsan'],
  'garlic': ['lehsan', 'lahsan', 'لہسن'],

  'hari mirch': ['green chillies', 'green chili', 'green chilli', 'sabz mirch', 'ہری مرچ', 'سبز مرچ'],
  'sabz mirch': ['green chillies', 'green chili', 'hari mirch', 'ہری مرچ'],
  'ہری مرچ': ['green chillies', 'green chili', 'hari mirch'],
  'green chillies': ['hari mirch', 'green chili', 'ہری مرچ'],
  'green chili': ['green chillies', 'hari mirch', 'ہری مرچ'],

  'dhania': ['coriander', 'fresh coriander', 'hara dhania', 'dhanya', 'cilantro', 'دھنیا', 'ہرا دھنیا'],
  'hara dhania': ['coriander', 'fresh coriander', 'dhania', 'دھنیا'],
  'دھنیا': ['coriander', 'dhania', 'hara dhania'],
  'coriander': ['dhania', 'hara dhania', 'دھنیا'],

  'pudina': ['mint', 'fresh mint', 'podina', 'hara pudina', 'پودینہ'],
  'podina': ['mint', 'fresh mint', 'pudina', 'پودینہ'],
  'پودینہ': ['mint', 'pudina'],
  'mint': ['pudina', 'podina', 'پودینہ'],

  'kheera': ['cucumber', 'khira', 'salad kheera', 'کھیرا'],
  'cucumber': ['kheera', 'khira', 'کھیرا'],
  'کھیرا': ['cucumber', 'kheera'],

  'band gobi': ['cabbage', 'patta gobi', 'bandgobi', 'بند گوبھی'],
  'patta gobi': ['cabbage', 'band gobi', 'بند گوبھی'],
  'cabbage': ['band gobi', 'patta gobi', 'بند گوبھی'],
  'بند گوبھی': ['cabbage', 'band gobi'],

  'phool gobi': ['cauliflower', 'gobi', 'gobhi', 'پھول گوبھی'],
  'cauliflower': ['phool gobi', 'gobi', 'پھول گوبھی'],
  'پھول گوبھی': ['cauliflower', 'phool gobi'],

  'shimla mirch': ['capsicum', 'bell pepper', 'shimla', 'green capsicum', 'شملہ مرچ'],
  'capsicum': ['shimla mirch', 'bell pepper', 'shimla', 'شملہ مرچ'],
  'شملہ مرچ': ['capsicum', 'shimla mirch', 'bell pepper'],

  'gajar': ['carrots', 'carrot', 'gaajar', 'fresh gajar', 'گاجر'],
  'carrots': ['gajar', 'carrot', 'گاجر'],
  'carrot': ['carrots', 'gajar', 'گاجر'],
  'گاجر': ['carrots', 'gajar'],

  'lemon': ['lemons', 'nimbu', 'lemo', 'neembu', 'fresh lemon', 'لیمو', 'لیموں'],
  'nimbu': ['lemon', 'lemons', 'lemo', 'لیموں'],
  'lemo': ['lemon', 'lemons', 'nimbu', 'لیموں'],
  'لیموں': ['lemon', 'lemons', 'nimbu'],

  'matar': ['peas', 'green peas', 'muttar', 'fresh matar', 'مٹر'],
  'peas': ['matar', 'green peas', 'مٹر'],
  'مٹر': ['peas', 'matar'],

  'palak': ['spinach', 'paalak', 'fresh palak', 'پالک'],
  'spinach': ['palak', 'paalak', 'پالک'],
  'پالک': ['spinach', 'palak'],

  // Poultry & Meats
  'murghi': ['chicken', 'murgi', 'whole chicken', 'مرغی'],
  'murgi': ['chicken', 'murghi', 'مرغی'],
  'مرغی': ['chicken', 'murghi', 'murgi'],
  'chicken': ['murghi', 'murgi', 'مرغی'],

  'murghi seena': ['chicken breast', 'chicken boneless', 'breast fillet', 'مرغی سینہ'],
  'chicken breast': ['murghi seena', 'chicken boneless', 'breast fillet', 'مرغی سینہ'],
  'مرغی سینہ': ['chicken breast', 'murghi seena'],

  'chicken boneless': ['boneless chicken', 'chicken breast', 'boti', 'chicken boti', 'مرغی بون لیس'],
  'boneless chicken': ['chicken boneless', 'chicken breast', 'مرغی بون لیس'],
  'مرغی بون لیس': ['chicken boneless', 'boneless chicken'],

  'chicken wings': ['wings', 'murghi wings', 'murghi par', 'مرغی ونگز'],
  'wings': ['chicken wings', 'murghi wings', 'مرغی ونگز'],
  'مرغی ونگز': ['chicken wings', 'wings'],

  'chicken drumstick': ['chicken leg', 'drumstick', 'murghi leg', 'leg piece', 'مرغی لیگ'],
  'chicken leg': ['chicken drumstick', 'drumstick', 'murghi leg', 'مرغی لیگ'],
  'drumstick': ['chicken drumstick', 'chicken leg', 'مرغی لیگ'],

  'chicken mince': ['chicken keema', 'chicken qeema', 'chicken qima', 'مرغی قیمہ'],
  'chicken keema': ['chicken mince', 'chicken qeema', 'مرغی قیمہ'],
  'مرغی قیمہ': ['chicken mince', 'chicken keema'],

  'beef': ['cow meat', 'bada gosht', 'bara gosht', 'bade ka gosht', 'بیف', 'گائے کا گوشت'],
  'bara gosht': ['beef', 'bada gosht', 'بیف'],
  'بیف': ['beef', 'bara gosht'],

  'keema': ['beef mince', 'beef keema', 'beef qeema', 'qima', 'mince', 'قیمہ'],
  'qeema': ['beef mince', 'beef keema', 'mince', 'keema', 'قیمہ'],
  'mince': ['keema', 'qeema', 'beef mince', 'chicken mince', 'قیمہ'],
  'beef mince': ['keema', 'qeema', 'beef keema', 'beef qeema', 'قیمہ'],
  'قیمہ': ['keema', 'qeema', 'mince', 'beef mince'],

  'mutton': ['chota gosht', 'chote ka gosht', 'bakra gosht', 'bakre ka gosht', 'lamb', 'مٹن', 'بکرے کا گوشت'],
  'chota gosht': ['mutton', 'bakra gosht', 'مٹن'],
  'مٹن': ['mutton', 'chota gosht'],

  'machli': ['fish', 'machhli', 'raw fish', 'fish fillet', 'مچھلی'],
  'fish': ['machli', 'machhli', 'fish fillet', 'مچھلی'],
  'مچھلی': ['fish', 'machli'],

  'jheenga': ['prawns', 'prawn', 'shrimp', 'jhinga', 'جھینگا'],
  'prawns': ['jheenga', 'prawn', 'shrimp', 'جھینگا'],
  'جھینگا': ['prawns', 'jheenga'],

  // Dairy & Eggs
  'doodh': ['milk', 'fresh milk', 'dodh', 'dhoodh', 'cow milk', 'دودھ'],
  'dodh': ['milk', 'fresh milk', 'doodh', 'دودھ'],
  'دودھ': ['milk', 'fresh milk', 'doodh'],
  'milk': ['doodh', 'fresh milk', 'دودھ'],
  'fresh milk': ['doodh', 'milk', 'دودھ'],

  'dahi': ['yogurt', 'curd', 'yoghurt', 'fresh dahi', 'دہی'],
  'yogurt': ['dahi', 'curd', 'دہی'],
  'دہی': ['yogurt', 'dahi', 'curd'],

  'makhan': ['butter', 'makkhan', 'desi makhan', 'maska', 'مکھن'],
  'butter': ['makhan', 'makkhan', 'مکھن'],
  'مکھن': ['butter', 'makhan'],

  'ghee': ['desi ghee', 'banaspati', 'banaspati ghee', 'oil ghee', 'گھی', 'دیسی گھی'],
  'desi ghee': ['ghee', 'banaspati ghee', 'دیسی گھی'],
  'گھی': ['ghee', 'desi ghee'],

  'cheese': ['cheddar cheese', 'mozzarella cheese', 'mozzarella', 'cheddar', 'paneer', 'پنیر', 'چیز'],
  'paneer': ['cheese', 'cottage cheese', 'پنیر'],
  'پنیر': ['cheese', 'paneer'],
  'چیز': ['cheese', 'mozzarella', 'cheddar'],

  'cream': ['heavy cream', 'fresh cream', 'malai', 'balai', 'whipping cream', 'ملائی', 'کریم'],
  'malai': ['cream', 'fresh cream', 'balai', 'ملائی'],
  'ملائی': ['cream', 'malai'],

  'anda': ['eggs', 'egg', 'anday', 'ande', 'desi anday', 'farm anday', 'انڈے', 'انڈا'],
  'anday': ['eggs', 'egg', 'anda', 'ande', 'انڈے'],
  'ande': ['eggs', 'egg', 'anda', 'anday', 'انڈے'],
  'eggs': ['anda', 'anday', 'egg', 'انڈے'],
  'egg': ['eggs', 'anda', 'anday', 'انڈے'],
  'انڈے': ['eggs', 'egg', 'anda', 'anday'],
  'انڈا': ['egg', 'anda', 'eggs'],

  // Flours, Grains, Bakery & Staples
  'aata': ['wheat flour', 'flour', 'atta', 'chakki aata', 'gandum ka aata', 'آٹا'],
  'atta': ['wheat flour', 'flour', 'aata', 'آٹا'],
  'wheat flour': ['aata', 'atta', 'flour', 'آٹا'],
  'آٹا': ['wheat flour', 'flour', 'aata', 'atta'],

  'maida': ['refined flour', 'all purpose flour', 'white flour', 'میدہ'],
  'refined flour': ['maida', 'all purpose flour', 'میدہ'],
  'میدہ': ['maida', 'refined flour'],

  'besan': ['gram flour', 'chana powder', 'baisan', 'بیسن'],
  'gram flour': ['besan', 'baisan', 'بیسن'],
  'بیسن': ['besan', 'gram flour'],

  'cornflour': ['corn flour', 'corn starch', 'cornstarch', 'کارن فلور'],
  'corn flour': ['cornflour', 'corn starch', 'cornstarch', 'کارن فلور'],
  'کارن فلور': ['cornflour', 'corn flour'],

  'chawal': ['rice', 'basmati rice', 'chaawal', 'sela chawal', 'super basmati', 'چاول'],
  'rice': ['chawal', 'basmati rice', 'chaawal', 'چاول'],
  'basmati rice': ['chawal', 'rice', 'super basmati', 'چاول'],
  'چاول': ['rice', 'chawal', 'basmati rice'],

  'bun': ['burger bun', 'buns', 'burger buns', 'sesame bun', 'برگر بن'],
  'buns': ['burger bun', 'burger buns', 'bun', 'برگر بن'],
  'burger bun': ['bun', 'buns', 'burger buns', 'برگر بن'],
  'برگر بن': ['burger bun', 'buns', 'bun'],

  'bread': ['white bread', 'sliced bread', 'roti', 'double roti', 'ڈبل روٹی'],
  'double roti': ['bread', 'white bread', 'ڈبل روٹی'],
  'ڈبل روٹی': ['bread', 'double roti'],

  'pita': ['pita bread', 'shawarma bread', 'shawarma roti', 'پیٹا بریڈ'],
  'pita bread': ['pita', 'shawarma bread', 'پیٹا بریڈ'],
  'پیٹا بریڈ': ['pita', 'pita bread', 'shawarma bread'],

  'tel': ['cooking oil', 'oil', 'tail', 'canola oil', 'sunflower oil', 'کوکنگ آئل', 'تیل'],
  'tail': ['cooking oil', 'oil', 'tel', 'تیل'],
  'cooking oil': ['oil', 'tel', 'tail', 'canola oil', 'کوکنگ آئل', 'تیل'],
  'oil': ['cooking oil', 'tel', 'کوکنگ آئل', 'تیل'],
  'تیل': ['cooking oil', 'oil', 'tel'],
  'کوکنگ آئل': ['cooking oil', 'oil', 'tel'],

  'cheeni': ['sugar', 'chini', 'shakar', 'white sugar', 'refined sugar', 'چینی', 'شکر'],
  'chini': ['sugar', 'cheeni', 'shakar', 'چینی'],
  'shakar': ['sugar', 'cheeni', 'chini', 'شکر'],
  'sugar': ['cheeni', 'chini', 'shakar', 'چینی'],
  'چینی': ['sugar', 'cheeni', 'chini'],
  'شکر': ['sugar', 'shakar', 'cheeni'],

  'namak': ['salt', 'iodized salt', 'lahori namak', 'white salt', 'نمک'],
  'salt': ['namak', 'white salt', 'نمک'],
  'نمک': ['salt', 'namak'],

  // Spices & Seasonings
  'haldi': ['turmeric powder', 'turmeric', 'haldi powder', 'ہلدی'],
  'turmeric': ['haldi', 'turmeric powder', 'ہلدی'],
  'turmeric powder': ['haldi', 'turmeric', 'ہلدی'],
  'ہلدی': ['turmeric', 'haldi', 'turmeric powder'],

  'lal mirch': ['red chilli powder', 'red chili', 'red chilli', 'laal mirch', 'surkh mirch', 'لال مرچ', 'سرخ مرچ'],
  'laal mirch': ['red chilli powder', 'red chili', 'lal mirch', 'لال مرچ'],
  'red chilli powder': ['lal mirch', 'laal mirch', 'red chili', 'لال مرچ'],
  'red chili': ['red chilli powder', 'lal mirch', 'لال مرچ'],
  'لال مرچ': ['red chilli powder', 'lal mirch', 'red chili'],

  'chilli flakes': ['crushed chilli', 'kuti lal mirch', 'dara mirch', 'kuti mirch', 'کوٹی لال مرچ', 'دڑا مرچ'],
  'kuti lal mirch': ['chilli flakes', 'crushed chilli', 'dara mirch', 'کوٹی لال مرچ'],
  'dara mirch': ['chilli flakes', 'crushed chilli', 'دڑا مرچ'],
  'کوٹی لال مرچ': ['chilli flakes', 'kuti lal mirch'],

  'kali mirch': ['black pepper', 'black pepper powder', 'kaali mirch', 'کالی مرچ'],
  'black pepper': ['kali mirch', 'kaali mirch', 'کالی مرچ'],
  'کالی مرچ': ['black pepper', 'kali mirch'],

  'safed mirch': ['white pepper', 'white pepper powder', 'dakni mirch', 'سفید مرچ'],
  'white pepper': ['safed mirch', 'سفید مرچ'],
  'سفید مرچ': ['white pepper', 'safed mirch'],

  'zeera': ['cumin seeds', 'cumin', 'jeera', 'safed zeera', 'zeera powder', 'زیرہ'],
  'jeera': ['cumin seeds', 'cumin', 'zeera', 'زیرہ'],
  'cumin': ['zeera', 'cumin seeds', 'jeera', 'زیرہ'],
  'cumin seeds': ['zeera', 'cumin', 'jeera', 'زیرہ'],
  'زیرہ': ['cumin seeds', 'zeera', 'cumin'],

  'dhania powder': ['coriander powder', 'pisa dhania', 'sukha dhania', 'سوکھا دھنیا', 'دھنیا پاؤڈر'],
  'coriander powder': ['dhania powder', 'pisa dhania', 'دھنیا پاؤڈر'],
  'دھنیا پاؤڈر': ['coriander powder', 'dhania powder'],

  'garam masala': ['garam masala powder', 'mixed spices', 'گرم مصالحہ'],
  'گرم مصالحہ': ['garam masala', 'garam masala powder'],

  'chaat masala': ['chat masala', 'chaat masala powder', 'چاٹ مصالحہ'],
  'chat masala': ['chaat masala', 'چاٹ مصالحہ'],
  'چاٹ مصالحہ': ['chaat masala', 'chat masala'],

  'biryani masala': ['biryani powder', 'بریانی مصالحہ'],
  'بریانی مصالحہ': ['biryani masala'],

  'tikka masala': ['bbq masala', 'tikka boti masala', 'تکہ مصالحہ'],
  'تکہ مصالحہ': ['tikka masala'],

  'elaichi': ['cardamom', 'choti elaichi', 'green cardamom', 'badi elaichi', 'الائچی'],
  'cardamom': ['elaichi', 'choti elaichi', 'الائچی'],
  'الائچی': ['cardamom', 'elaichi'],

  'laung': ['cloves', 'clove', 'long', 'لونگ'],
  'cloves': ['laung', 'clove', 'لونگ'],
  'لونگ': ['cloves', 'laung'],

  'darcheeni': ['cinnamon', 'dalcheeni', 'دار چینی'],
  'cinnamon': ['darcheeni', 'dalcheeni', 'دار چینی'],
  'دار چینی': ['cinnamon', 'darcheeni'],

  'tez patta': ['bay leaf', 'tej patta', 'تیز پتہ'],
  'bay leaf': ['tez patta', 'تیز پتہ'],
  'تیز پتہ': ['bay leaf', 'tez patta'],

  'saunf': ['fennel seeds', 'fennel', 'sonf', 'سونف'],
  'fennel seeds': ['saunf', 'fennel', 'سونف'],
  'سونف': ['fennel seeds', 'saunf'],

  'methi': ['fenugreek', 'kasuri methi', 'qasuri methi', 'قصوری میتھی', 'میتھی'],
  'kasuri methi': ['fenugreek', 'methi', 'qasuri methi', 'قصوری میتھی'],
  'قصوری میتھی': ['kasuri methi', 'methi', 'fenugreek'],

  'ajwain': ['carom seeds', 'ajwain seeds', 'اجوائن'],
  'carom seeds': ['ajwain', 'اجوائن'],
  'اجوائن': ['carom seeds', 'ajwain'],

  // Sauces & Condiments
  'ketchup': ['tomato ketchup', 'tomato sauce', 'red ketchup', 'کیچپ', 'ٹماٹو کیچپ'],
  'tomato ketchup': ['ketchup', 'tomato sauce', 'کیچپ'],
  'کیچپ': ['ketchup', 'tomato ketchup'],
  'ٹماٹو کیچپ': ['tomato ketchup', 'ketchup'],

  'mayo': ['mayonnaise', 'garlic mayo', 'white mayo', 'میونیز'],
  'mayonnaise': ['mayo', 'garlic mayo', 'میونیز'],
  'میونیز': ['mayonnaise', 'mayo'],

  'chilli garlic': ['chilli garlic sauce', 'chili garlic', 'chilli sauce', 'hot sauce', 'چلی گارلک'],
  'chilli garlic sauce': ['chilli garlic', 'hot sauce', 'چلی گارلک'],
  'چلی گارلک': ['chilli garlic sauce', 'chilli garlic'],

  'soy sauce': ['soya sauce', 'dark soy sauce', 'سویا ساس'],
  'soya sauce': ['soy sauce', 'سویا ساس'],
  'سویا ساس': ['soy sauce', 'soya sauce'],

  'sirka': ['vinegar', 'white vinegar', 'safed sirka', 'سِرکہ', 'سرکہ'],
  'vinegar': ['sirka', 'white vinegar', 'سرکہ'],
  'سرکہ': ['vinegar', 'sirka'],
  'سِرکہ': ['vinegar', 'sirka'],

  'mustard': ['mustard paste', 'mustard sauce', 'مسٹرڈ'],
  'mustard paste': ['mustard', 'mustard sauce', 'مسٹرڈ'],
  'مسٹرڈ': ['mustard', 'mustard paste'],

  'bbq sauce': ['barbecue sauce', 'bbq dip', 'باربی کیو ساس'],
  'باربی کیو ساس': ['bbq sauce', 'barbecue sauce'],

  // Beverages & Tea
  'chai patti': ['tea leaves', 'tea', 'patti', 'danedar chai', 'black tea', 'چائے پتی', 'پتی'],
  'tea leaves': ['chai patti', 'tea', 'patti', 'چائے پتی'],
  'tea': ['chai patti', 'tea leaves', 'chai', 'چائے'],
  'چائے پتی': ['tea leaves', 'chai patti', 'patti'],
  'پتی': ['tea leaves', 'chai patti'],

  'green tea': ['sabz chai', 'qehwa', 'kawa', 'قہوہ', 'سبز چائے'],
  'qehwa': ['green tea', 'sabz chai', 'قہوہ'],
  'قہوہ': ['green tea', 'qehwa'],

  'coffee': ['nescafe', 'instant coffee', 'coffee powder', 'کافی'],
  'کافی': ['coffee', 'nescafe'],

  'mineral water': ['water bottle', 'paani', '19l water', 'drinking water', 'پانی'],
  'paani': ['mineral water', 'water bottle', 'پانی'],
  'پانی': ['mineral water', 'water'],

  // Packaging & Disposables
  'shopper': ['plastic bag', 'plastic bags', 'polythene bag', 'shoppers', 'شاپر', 'پلاسٹک بیگ'],
  'plastic bag': ['shopper', 'plastic bags', 'polythene bag', 'شاپر'],
  'شاپر': ['shopper', 'plastic bag'],
  'پلاسٹک بیگ': ['plastic bag', 'shopper'],

  'butter paper': ['baking paper', 'wrapping paper', 'بٹر پیپر'],
  'بٹر پیپر': ['butter paper'],

  'aluminum foil': ['silver foil', 'foil', 'سلور فوائل'],
  'silver foil': ['aluminum foil', 'foil', 'سلور فوائل'],
  'سلور فوائل': ['aluminum foil', 'silver foil'],

  'disposable cup': ['cups', 'paper cup', 'chai cup', 'disposable cups', 'ڈسپوزیبل کپ'],
  'paper cup': ['disposable cup', 'chai cup', 'ڈسپوزیبل کپ'],
  'ڈسپوزیبل کپ': ['disposable cup', 'paper cup'],

  'burger box': ['burger boxes', 'packing box', 'food box', 'برگر باکس'],
  'برگر باکس': ['burger box'],

  'tissue': ['tissues', 'tissue paper', 'napkins', 'serviettes', 'ٹشو'],
  'tissue paper': ['tissue', 'tissues', 'napkins', 'ٹشو'],
  'ٹشو': ['tissue', 'tissue paper', 'napkins'],

  // Toothpicks & Consumables
  'toopick': ['toothpicks', 'toothpick', 'wooden toothpicks', 'daant khilal'],
  'toohtpick': ['toothpicks', 'toothpick', 'wooden toothpicks'],
  'tooth pick': ['toothpicks', 'toothpick', 'daant khilal'],
  'toothpick': ['toothpicks', 'toopick', 'daant khilal'],
  'toothpicks': ['toothpick', 'toopick', 'daant khilal'],
  'daant khilal': ['toothpicks', 'toothpick'],
  'خلال': ['toothpicks', 'toothpick'],

  // Rubber Bands & Fasteners
  'rubber band': ['rubber bands', 'rubberband', 'elastik', 'ربڑ بینڈ'],
  'rubberband': ['rubber band', 'rubber bands', 'elastik', 'ربڑ بینڈ'],
  'rubber bands': ['rubber band', 'rubberband', 'elastik'],
  'ربڑ بینڈ': ['rubber band', 'rubber bands'],

  // Matchsticks & Lighters
  'matchstick': ['matchsticks', 'matchbox', 'matches', 'maachis', 'ماچس'],
  'matchsticks': ['matchstick', 'matchbox', 'matches', 'maachis'],
  'matchbox': ['matchstick', 'matches', 'maachis', 'ماچس'],
  'maachis': ['matchstick', 'matchbox', 'matches', 'ماچس'],
  'machis': ['matchstick', 'matchbox', 'maachis'],
  'ماچس': ['matchstick', 'matchbox', 'maachis'],

  // Straws
  'straw': ['straws', 'drinking straw', 'paper straw', 'plastic straw'],
  'straws': ['straw', 'drinking straw', 'paper straw'],
  'drinking straw': ['straw', 'straws'],

  // Cleaning & Scrubbers
  'scrubber': ['scrubbers', 'scourer', 'steel wool', 'sponge', 'cleaning pad'],
  'scourer': ['scrubber', 'steel wool', 'sponge'],
  'sponge': ['scrubber', 'scourer', 'sponge wipe'],
  'steel wool': ['scrubber', 'scourer'],

  // Gloves & Protective
  'gloves': ['glove', 'latex gloves', 'vinyl gloves', 'hand gloves', 'دستانے'],
  'glove': ['gloves', 'latex gloves', 'vinyl gloves'],
  'latex gloves': ['gloves', 'vinyl gloves'],
  'دستانے': ['gloves', 'glove'],

  // Batteries & Hardware
  'battery': ['batteries', 'cell', 'aa battery', 'aaa battery', 'سیل'],
  'batteries': ['battery', 'cell', 'سیل'],
  'cell': ['battery', 'batteries'],
  'سیل': ['battery', 'batteries'],

  // Tape & Office
  'tape': ['packing tape', 'scotch tape', 'masking tape', 'cello tape'],
  'packing tape': ['tape', 'scotch tape'],
  'thermal roll': ['receipt roll', 'pos roll', 'paper roll', 'bill roll'],
  'receipt roll': ['thermal roll', 'paper roll', 'pos roll'],
  'label': ['labels', 'sticker', 'stickers', 'price tag'],
  'labels': ['label', 'stickers', 'sticker'],
  'sticker': ['stickers', 'label', 'labels'],
  'stickers': ['sticker', 'labels', 'label'],

  // Extended Phonetic Variants for Food Items
  'piaz': ['onions', 'onion', 'pyaz', 'پیاز'],
  'lahsun': ['garlic', 'lehsan', 'lasun', 'lehsun', 'لہسن'],
  'lasun': ['garlic', 'lehsan', 'lahsun', 'لہسن'],
  'allu': ['potatoes', 'potato', 'aloo', 'alu', 'آلو']
};

/**
 * Calculates Levenshtein Distance between two strings for typo tolerance
 */
const levenshteinDistance = (a, b) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

/**
 * Calculates string similarity ratio (0.0 to 1.0) using Levenshtein distance & Token Dice coefficient
 */
const calculateStringSimilarity = (str1, str2) => {
  const s1 = normalizeItemName(str1);
  const s2 = normalizeItemName(str2);
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;

  // Direct Levenshtein character similarity
  const maxLen = Math.max(s1.length, s2.length);
  const charSim = maxLen === 0 ? 1.0 : (maxLen - levenshteinDistance(s1, s2)) / maxLen;

  // Token-level Dice coefficient
  const t1 = s1.split(' ').filter(w => w.length > 0);
  const t2 = s2.split(' ').filter(w => w.length > 0);
  if (t1.length === 0 || t2.length === 0) return charSim;

  let matchedTokens = 0;
  for (const w1 of t1) {
    const matched = t2.some(w2 => {
      if (w1 === w2) return true;
      const wMax = Math.max(w1.length, w2.length);
      return wMax >= 4 && (wMax - levenshteinDistance(w1, w2)) / wMax >= 0.75;
    });
    if (matched) matchedTokens++;
  }

  const tokenSim = (2 * matchedTokens) / (t1.length + t2.length);
  return Math.max(charSim, tokenSim);
};

/**
 * Smart Safe Catalog Matcher
 * Matching Priority Order:
 * 1. Exact SKU or Barcode match (1.0)
 * 2. Exact Normalized Product Name (1.0)
 * 3. Approved POS / Urdu Alias Match (0.95)
 * 4. Token Order Invariant Match (0.93)
 * 5. Safe Substring / Token Subset Match without variant conflicts (0.88)
 * 6. High Typo Similarity (>= 0.85) without variant conflicts
 * 7. Candidate Suggestion (0.60 - 0.84) -> REVIEW_MATCH status (never auto-accepted)
 * 8. Below 0.60 -> NEW_ITEM status
 */
const findBestFuzzyCatalogMatch = (rawName, sku, catalogItems) => {
  if (!catalogItems || catalogItems.length === 0) {
    return { item: null, status: 'NEW_ITEM', confidence: 0 };
  }

  // 1. Exact SKU or Barcode Match
  if (sku && String(sku).trim()) {
    const cleanSku = String(sku).trim().toLowerCase();
    const skuMatch = catalogItems.find(c => c.sku && c.sku.toLowerCase().trim() === cleanSku);
    if (skuMatch) {
      return { item: skuMatch, status: 'MATCHED', confidence: 1.0, matchType: 'EXACT_SKU' };
    }
  }

  if (!rawName || !String(rawName).trim()) {
    return { item: null, status: 'NEW_ITEM', confidence: 0 };
  }

  const cleanRaw = normalizeItemName(rawName);
  if (!cleanRaw) {
    return { item: null, status: 'NEW_ITEM', confidence: 0 };
  }

  // 1.5 Learned / User-Confirmed Dynamic Aliases
  try {
    const learned = getLearnedAliases();
    if (learned && learned[cleanRaw]) {
      const entry = learned[cleanRaw];
      const targetItem = catalogItems.find(c =>
        (entry.inventoryItemId && c.id === entry.inventoryItemId) ||
        normalizeItemName(c.name) === normalizeItemName(entry.canonicalName)
      );
      if (targetItem && !hasConflictingVariants(rawName, targetItem.name)) {
        return { item: targetItem, status: 'MATCHED', confidence: 1.0, matchType: 'LEARNED_ALIAS' };
      }
    }
  } catch { /* Optional OCR parsing/lookup fallback. */ }

  // 2. Exact Normalized Name Match
  const exactMatch = catalogItems.find(c => normalizeItemName(c.name) === cleanRaw);
  if (exactMatch) {
    return { item: exactMatch, status: 'MATCHED', confidence: 1.0, matchType: 'EXACT_NAME' };
  }

  // 3. Approved POS / Alias Match (Bidirectional & Full Coverage)
  for (const [aliasKey, targetWords] of Object.entries(ITEM_ALIASES_MAP)) {
    const normAlias = normalizeItemName(aliasKey);
    const rawMatchesAlias = cleanRaw === normAlias ||
      cleanRaw.startsWith(normAlias + ' ') ||
      cleanRaw.endsWith(' ' + normAlias) ||
      cleanRaw.includes(' ' + normAlias + ' ');

    if (rawMatchesAlias) {
      for (const targetWord of targetWords) {
        const normTarget = normalizeItemName(targetWord);
        const aliasMatch = catalogItems.find(c => {
          const normCat = normalizeItemName(c.name);
          return normCat === normTarget || normCat.includes(normTarget) || normTarget.includes(normCat);
        });
        if (aliasMatch && !hasConflictingVariants(rawName, aliasMatch.name)) {
          return { item: aliasMatch, status: 'MATCHED', confidence: 0.95, matchType: 'APPROVED_ALIAS' };
        }
      }
    }

    // Reverse Alias Match: Catalog item has aliasKey, rawName contains targetWord
    const catalogHasAlias = catalogItems.find(c => {
      const normCat = normalizeItemName(c.name);
      return normCat === normAlias || normCat.includes(normAlias);
    });
    if (catalogHasAlias) {
      for (const targetWord of targetWords) {
        const normTarget = normalizeItemName(targetWord);
        const rawMatchesTarget = cleanRaw === normTarget ||
          cleanRaw.startsWith(normTarget + ' ') ||
          cleanRaw.endsWith(' ' + normTarget) ||
          cleanRaw.includes(' ' + normTarget + ' ');
        if (rawMatchesTarget && !hasConflictingVariants(rawName, catalogHasAlias.name)) {
          return { item: catalogHasAlias, status: 'MATCHED', confidence: 0.95, matchType: 'APPROVED_ALIAS_REVERSE' };
        }
      }
    }
  }

  // 3.5 Phonetic Transliteration & Typo Match (e.g. Pyaz/Piyaz/Piaz, Lehsan/Lahsun, Toopick/Toothpick)
  const rawPhonetic = getPhoneticFingerprint(cleanRaw);
  if (rawPhonetic && rawPhonetic.length >= 3) {
    // Check direct phonetic equality with catalog item names
    for (const cat of catalogItems) {
      if (hasConflictingVariants(rawName, cat.name)) continue;
      const catPhonetic = getPhoneticFingerprint(cat.name);
      if (catPhonetic && catPhonetic === rawPhonetic) {
        return { item: cat, status: 'MATCHED', confidence: 0.94, matchType: 'PHONETIC_SOUNDALIKE' };
      }
    }

    // Check phonetic match against approved aliases
    for (const [aliasKey, targetWords] of Object.entries(ITEM_ALIASES_MAP)) {
      const aliasPhonetic = getPhoneticFingerprint(aliasKey);
      if (aliasPhonetic && aliasPhonetic === rawPhonetic) {
        for (const targetWord of targetWords) {
          const normTarget = normalizeItemName(targetWord);
          const aliasMatch = catalogItems.find(c => {
            const normCat = normalizeItemName(c.name);
            return normCat === normTarget || normCat.includes(normTarget) || normTarget.includes(normCat);
          });
          if (aliasMatch && !hasConflictingVariants(rawName, aliasMatch.name)) {
            return { item: aliasMatch, status: 'MATCHED', confidence: 0.94, matchType: 'PHONETIC_ALIAS' };
          }
        }
      }
    }
  }

  // 4. Token Order Invariant Match (e.g. "Cooking Oil" vs "Oil Cooking", "Fresh Milk" vs "Milk Fresh")
  const rawTokens = cleanRaw.split(' ').filter(w => w.length > 0).sort();
  const rawTokenStr = rawTokens.join(' ');

  for (const cat of catalogItems) {
    const catTokens = normalizeItemName(cat.name).split(' ').filter(w => w.length > 0).sort();
    if (rawTokens.length === catTokens.length && rawTokenStr === catTokens.join(' ')) {
      return { item: cat, status: 'MATCHED', confidence: 0.93, matchType: 'TOKEN_ORDER' };
    }
  }

  // 5. Safe Substring / Token Subset Match WITH Variant Conflict Guard
  const subCandidates = catalogItems.filter(c => {
    const cleanCat = normalizeItemName(c.name);
    const catTokens = cleanCat.split(' ').filter(w => w.length > 0);
    const isSub = cleanCat.includes(cleanRaw) || cleanRaw.includes(cleanCat);
    const isTokenSubset = (rawTokens.length >= 2 && rawTokens.every(t => catTokens.includes(t))) ||
                          (catTokens.length >= 2 && catTokens.every(t => rawTokens.includes(t)));
    // Crucial: check for conflicting variant keywords!
    return (isSub || isTokenSubset) && !hasConflictingVariants(rawName, c.name);
  });

  if (subCandidates.length === 1) {
    const cand = subCandidates[0];
    const sim = calculateStringSimilarity(cleanRaw, cand.name);
    if (sim >= 0.70) {
      return { item: cand, status: 'MATCHED', confidence: 0.88, matchType: 'SAFE_SUBSTRING' };
    } else {
      return { item: cand, status: 'REVIEW_MATCH', confidence: 0.75, suggestedItem: cand, matchType: 'SUGGESTED_SUBSTRING' };
    }
  } else if (subCandidates.length > 1) {
    // Pick the candidate with highest similarity
    let bestCand = subCandidates[0];
    let bestSim = 0;
    for (const cand of subCandidates) {
      const sim = calculateStringSimilarity(cleanRaw, cand.name);
      if (sim > bestSim) {
        bestSim = sim;
        bestCand = cand;
      }
    }
    if (bestSim >= 0.75) {
      return { item: bestCand, status: 'MATCHED', confidence: 0.86, matchType: 'SAFE_SUBSTRING' };
    } else {
      return { item: bestCand, status: 'REVIEW_MATCH', confidence: 0.75, suggestedItem: bestCand, matchType: 'SUGGESTED_SUBSTRING' };
    }
  }

  // 6. Typo Tolerance with Levenshtein Distance & Token Overlap (Safeguarded against variant mismatch)
  let bestItem = null;
  let bestScore = 0;

  for (const cat of catalogItems) {
    // Skip if they have conflicting variants (e.g. breast vs mince)
    if (hasConflictingVariants(rawName, cat.name)) {
      continue;
    }

    const sim = calculateStringSimilarity(cleanRaw, cat.name);
    if (sim > bestScore) {
      bestScore = sim;
      bestItem = cat;
    }
  }

  // Tiered Confidence Thresholds:
  // - >= 0.85: Confident typo match -> MATCHED
  // - 0.60 to 0.84: Plausible match -> REVIEW_MATCH (requires admin confirmation)
  // - < 0.60: NEW_ITEM
  if (bestItem) {
    if (bestScore >= 0.85) {
      return { item: bestItem, status: 'MATCHED', confidence: parseFloat(bestScore.toFixed(2)), matchType: 'TYPO_SAFE' };
    } else if (bestScore >= 0.60) {
      return {
        item: null, // do NOT auto-assign ID! Let admin review!
        suggestedItem: bestItem,
        status: 'REVIEW_MATCH',
        confidence: parseFloat(bestScore.toFixed(2)),
        matchType: 'SUGGESTED_MATCH'
      };
    }
  }

  return { item: null, status: 'NEW_ITEM', confidence: 0, matchType: 'NONE' };
};

/**
 * Parses buffer/base64/text from CSV, Excel, PDF, or Invoice image payload and matches against catalog
 */
const parseAndMatchInvoice = async ({ rawText, fileBuffer, fileBase64, fileName, supplierNameHint }) => {
  let rawRows = [];
  const aiExtractionWarnings = [];
  let extractedInvoiceNumber = null;
  let extractedDate = null;
  let detectedSupplierName = supplierNameHint || null;
  let detectedTotal = null;
  let detectedSubtotal = null;
  let detectedDiscount = null;
  let detectedDiscountPercent = null;

  const readDiscountPercent = (value) => {
    if (value == null || value === '') return null;
    const match = String(value).match(/-?\d+(?:[.,]\d+)?\s*%/);
    const parsed = Number(String(match ? match[0] : value).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
  };
  const readDiscountAmount = (value) => {
    if (value == null || value === '' || /%/.test(String(value))) return null;
    const parsed = Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const recordDiscount = (amount, percent) => {
    const parsedPercent = readDiscountPercent(percent) ?? readDiscountPercent(amount);
    const parsedAmount = readDiscountAmount(amount);
    if (parsedPercent !== null) detectedDiscountPercent = parsedPercent;
    if (parsedAmount !== null) detectedDiscount = parsedAmount;
  };

  // 1. Detect PDF Invoice (via mime or extension)
  const isPdf = (fileBase64 && (fileBase64.startsWith('data:application/pdf') || fileBase64.includes('application/pdf'))) ||
    (fileName && /\.pdf$/i.test(fileName));

  if (isPdf) {
    console.log('[AI OCR] Detected PDF invoice file. Extracting text via pdf-parse...');
    try {
      const cleanBase64 = fileBase64 ? fileBase64.replace(/^data:application\/pdf;base64,/, '').replace(/^data:.*?;base64,/, '') : '';
      const pdfBuffer = fileBuffer || Buffer.from(cleanBase64, 'base64');
      let pdfText = '';
      if (typeof pdfParse === 'function') {
        const pdfData = await pdfParse(pdfBuffer);
        pdfText = pdfData.text || '';
      } else if (pdfParse && pdfParse.PDFParse) {
        const parser = new pdfParse.PDFParse({ data: pdfBuffer });
        const pdfData = await parser.getText();
        pdfText = pdfData?.text || '';
        await parser.destroy().catch(() => {});
      }
      console.log(`[AI OCR] PDF extracted text length: ${pdfText.length} characters.`);

      if (pdfText.trim().length > 10) {
        const groqResult = await parseInvoiceTextWithGroq(pdfText);
        if (groqResult && Array.isArray(groqResult.items) && groqResult.items.length > 0) {
          aiExtractionWarnings.push(...(groqResult.warnings || []));
          if (groqResult.supplierName) detectedSupplierName = groqResult.supplierName;
          if (groqResult.invoiceNumber) extractedInvoiceNumber = groqResult.invoiceNumber;
          if (groqResult.date) extractedDate = groqResult.date;
          if (groqResult.invoiceTotal) detectedTotal = groqResult.invoiceTotal;
          if (groqResult.subtotal != null) detectedSubtotal = groqResult.subtotal;
          recordDiscount(groqResult.discount, groqResult.discountPercent);

          for (const item of groqResult.items) {
            if (item.rawName) {
              const parsedQty = Number.parseFloat(item.quantity);
              const qty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;
              const unitCost = parseFloat(item.unitCost) || 0;
              const lineTotal = parseFloat(item.totalCost) || (qty * unitCost);

              rawRows.push({
                rawName: String(item.rawName).trim(),
                sku: item.sku || null,
                quantity: qty,
                unit: (item.unit || 'KG').toUpperCase(),
                unitCost: unitCost,
                totalCost: lineTotal,
                batchNumber: item.batchNumber || null,
                expiryDate: item.expiryDate || null,
                needsReview: Boolean(item.needsReview) || !(qty > 0) || (unitCost <= 0),
                reviewReason: item.reviewReason || (!(qty > 0) ? 'Quantity missing or invalid; verify before receiving' : unitCost <= 0 ? 'Zero or missing unit price' : null)
              });
            }
          }
        }
      }
    } catch (pdfErr) {
      console.warn('[AI OCR] PDF parsing failed:', pdfErr.message);
    }
  }

  // 2. Check if file is image / base64 image -> use Groq AI Vision
  const isImageBase64 = !isPdf && fileBase64 && (
    fileBase64.startsWith('data:image') ||
    (fileName && /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(fileName))
  );

  if (isImageBase64 && rawRows.length === 0) {
    console.log('[AI OCR] Attempting Groq AI Vision scan for receipt image...');
    const groqResult = await analyzeInvoiceImageWithGroq(fileBase64);

    if (groqResult && Array.isArray(groqResult.items) && groqResult.items.length > 0) {
      aiExtractionWarnings.push(...(groqResult.warnings || []));
      if (groqResult.supplierName) detectedSupplierName = groqResult.supplierName;
      if (groqResult.invoiceNumber) extractedInvoiceNumber = groqResult.invoiceNumber;
      if (groqResult.date) extractedDate = groqResult.date;
      if (groqResult.invoiceTotal) detectedTotal = groqResult.invoiceTotal;
      if (groqResult.subtotal != null) detectedSubtotal = groqResult.subtotal;
      recordDiscount(groqResult.discount, groqResult.discountPercent);

      for (const item of groqResult.items) {
        if (item.rawName) {
          const parsedQty = Number.parseFloat(item.quantity);
          const qty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;
          const unitCost = parseFloat(item.unitCost) || 0;
          const lineTotal = parseFloat(item.totalCost) || (qty * unitCost);

          rawRows.push({
            rawName: String(item.rawName).trim(),
            sku: item.sku || null,
            quantity: qty,
            unit: (item.unit || 'KG').toUpperCase(),
            unitCost: unitCost,
            totalCost: lineTotal,
            batchNumber: item.batchNumber || null,
            expiryDate: item.expiryDate || null,
            needsReview: Boolean(item.needsReview) || !(qty > 0) || (unitCost <= 0),
            reviewReason: item.reviewReason || (!(qty > 0) ? 'Quantity missing or invalid; verify before receiving' : unitCost <= 0 ? 'Zero or missing unit price' : null)
          });
        }
      }
    }
  }

  // 3. Process Excel / CSV file buffer or base64 if provided and not image/pdf
  if (rawRows.length === 0 && !isPdf && (fileBuffer || fileBase64)) {
    try {
      // Fetch DB suppliers for matching supplier names from Excel/CSV headers or cells
      let dbSuppliers = [];
      try {
        dbSuppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
      } catch (suppErr) {
        console.warn('[AI OCR] Could not load DB suppliers for Excel matching:', suppErr.message);
      }

      const buffer = fileBuffer || Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const sheetJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (sheetJson && sheetJson.length > 0) {
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(6, sheetJson.length); i++) {
          const row = sheetJson[i].map(c => String(c).toLowerCase());
          if (row.some(c => c.includes('item') || c.includes('name') || c.includes('qty') || c.includes('quantity') || c.includes('product'))) {
            headerRowIndex = i;
            break;
          }
        }

        // Scan rows before or around header for supplier, invoice #, and date metadata
        for (let r = 0; r <= Math.min(8, sheetJson.length - 1); r++) {
          const rowCells = sheetJson[r];
          if (!Array.isArray(rowCells)) continue;
          for (let c = 0; c < rowCells.length; c++) {
            const cellVal = String(rowCells[c] || '').trim();
            if (!cellVal || cellVal.length < 2) continue;

            // Supplier detection keyword: "Supplier: XYZ", "Vendor: XYZ", "M/s XYZ", "From: XYZ", "Seller: XYZ"
            if (!detectedSupplierName) {
              const suppMatch = cellVal.match(/^(?:supplier|vendor|distributor|dealer|seller|from|m\/s|party|company|firm)\s*[:-]?\s*(.+)$/i);
              if (suppMatch && suppMatch[1]) {
                const cand = suppMatch[1].trim();
                if (cand.length >= 2 && !cand.toLowerCase().includes('invoice') && !cand.toLowerCase().includes('total')) {
                  detectedSupplierName = cand;
                }
              } else if (dbSuppliers.length > 0) {
                // Match cell text against known database suppliers
                const cellLower = cellVal.toLowerCase();
                const matchedDb = dbSuppliers.find(s => {
                  const sLower = s.name.toLowerCase().trim();
                  return cellLower === sLower || (sLower.length >= 4 && (cellLower.includes(sLower) || sLower.includes(cellLower)));
                });
                if (matchedDb) {
                  detectedSupplierName = matchedDb.name;
                }
              }
            }

            // Invoice number keyword: "Invoice #: 123", "Bill No: 123", "Inv No: 123"
            if (!extractedInvoiceNumber) {
              const invMatch = cellVal.match(/^(?:invoice|inv|bill|memo|receipt|slip|ref)\s*(?:#|no|num|number)?\s*[:-]?\s*([a-zA-Z0-9_/-]+)$/i);
              if (invMatch && invMatch[1]) {
                const candInv = invMatch[1].trim();
                if (candInv.length >= 2) extractedInvoiceNumber = candInv;
              }
            }

            // Date keyword: "Date: 2026-10-15", "Dated: 15/10/2026"
            if (!extractedDate) {
              const dateMatch = cellVal.match(/^(?:date|dated|receiving\s*date)\s*[:-]?\s*([0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i);
              if (dateMatch && dateMatch[1]) {
                extractedDate = dateMatch[1].trim();
              }
            }
          }
        }

        const headers = sheetJson[headerRowIndex].map(h => normalizeHeader(h));

        const nameIdx = headers.findIndex(h => h.includes('item') || h.includes('name') || h.includes('product') || h.includes('ingredient'));
        const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('code'));
        const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('amount') || h.includes('volume'));
        const unitIdx = headers.findIndex(h => h.includes('unit') || h.includes('uom') || h.includes('measure'));
        const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('price') || h.includes('rate'));
        const batchIdx = headers.findIndex(h => h.includes('batch') || h.includes('lot'));
        const expIdx = headers.findIndex(h => h.includes('exp') || h.includes('date'));
        const suppIdx = headers.findIndex(h => h.includes('supplier') || h.includes('vendor') || h.includes('distributor'));
        const invIdx = headers.findIndex(h => h.includes('invoice') || h.includes('billno') || h.includes('billnum'));

        // If supplier column is in table headers and we haven't found supplier name yet
        if (!detectedSupplierName && suppIdx !== -1) {
          for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
            const val = String(sheetJson[i]?.[suppIdx] || '').trim();
            if (val && val.length >= 2) {
              detectedSupplierName = val;
              break;
            }
          }
        }

        // If invoice column is in table headers
        if (!extractedInvoiceNumber && invIdx !== -1) {
          for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
            const val = String(sheetJson[i]?.[invIdx] || '').trim();
            if (val && val.length >= 2) {
              extractedInvoiceNumber = val;
              break;
            }
          }
        }

        for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
          const row = sheetJson[i];
          if (!row || row.length === 0) continue;

          let rawName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : String(row[0] || '').trim();
          // If rawName is empty, search first non-numeric cell
          if (!rawName) {
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c] || '').trim();
              if (val && isNaN(Number(val)) && val.length >= 2) {
                rawName = val;
                break;
              }
            }
          }
          if (!rawName || rawName.length < 2) continue;

          // Ignore subtotal/total/summary rows
          const lowerName = rawName.toLowerCase();
          if (/^(subtotal|total|grand total|tax|gst|discount|balance|due|notes?)$/i.test(lowerName)) continue;

          const sku = skuIdx !== -1 ? String(row[skuIdx] || '').trim() : null;
          const qtyCell = qtyIdx !== -1 ? row[qtyIdx] : row[1];
          const parsedQty = Number.parseFloat(qtyCell);
          const quantityValid = Number.isFinite(parsedQty) && parsedQty > 0;
          const qtyVal = quantityValid ? parsedQty : 0;

          const unitVal = unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : 'KG';
          const costVal = costIdx !== -1 && row[costIdx] ? parseFloat(row[costIdx]) : 0;
          const batchVal = batchIdx !== -1 && row[batchIdx] ? String(row[batchIdx]).trim() : null;
          const expVal = expIdx !== -1 && row[expIdx] ? String(row[expIdx]).trim() : null;
          const rowSupplier = suppIdx !== -1 && row[suppIdx] ? String(row[suppIdx]).trim() : null;
          const rowInvoice = invIdx !== -1 && row[invIdx] ? String(row[invIdx]).trim() : null;

          rawRows.push({
            rawName,
            sku: sku || null,
            quantity: qtyVal,
            unit: unitVal.toUpperCase(),
            unitCost: isNaN(costVal) ? 0 : costVal,
            totalCost: (qtyVal * (isNaN(costVal) ? 0 : costVal)),
            batchNumber: batchVal || null,
            expiryDate: expVal || null,
            supplierName: rowSupplier || null,
            invoiceNumber: rowInvoice || null,
            needsReview: !quantityValid,
            reviewReason: quantityValid ? null : 'Quantity missing or invalid; verify before receiving'
          });
        }
      }
    } catch (excelErr) {
      console.warn('[AI OCR] Excel parse error:', excelErr.message);
    }
  }

  // 4. Fallback to rawText / CSV string parser if file buffer didn't yield rows
  if (rawRows.length === 0 && rawText && typeof rawText === 'string') {
    try {
      let dbSuppliers = [];
      try {
        dbSuppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
      } catch (suppErr) {
        console.warn('[AI OCR] Could not load DB suppliers for CSV matching:', suppErr.message);
      }

      const csvBuffer = Buffer.from(rawText, 'utf-8');
      const workbook = XLSX.read(csvBuffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const sheetJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (sheetJson && sheetJson.length > 1) {
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(6, sheetJson.length); i++) {
          const row = sheetJson[i].map(c => String(c).toLowerCase());
          if (row.some(c => c.includes('item') || c.includes('name') || c.includes('qty') || c.includes('quantity') || c.includes('product'))) {
            headerRowIndex = i;
            break;
          }
        }

        // Scan rows before or around header for supplier & invoice metadata
        for (let r = 0; r <= Math.min(8, sheetJson.length - 1); r++) {
          const rowCells = sheetJson[r];
          if (!Array.isArray(rowCells)) continue;
          for (let c = 0; c < rowCells.length; c++) {
            const cellVal = String(rowCells[c] || '').trim();
            if (!cellVal || cellVal.length < 2) continue;

            if (!detectedSupplierName) {
              const suppMatch = cellVal.match(/^(?:supplier|vendor|distributor|dealer|seller|from|m\/s|party|company|firm)\s*[:-]?\s*(.+)$/i);
              if (suppMatch && suppMatch[1]) {
                const cand = suppMatch[1].trim();
                if (cand.length >= 2 && !cand.toLowerCase().includes('invoice') && !cand.toLowerCase().includes('total')) {
                  detectedSupplierName = cand;
                }
              } else if (dbSuppliers.length > 0) {
                const cellLower = cellVal.toLowerCase();
                const matchedDb = dbSuppliers.find(s => {
                  const sLower = s.name.toLowerCase().trim();
                  return cellLower === sLower || (sLower.length >= 4 && (cellLower.includes(sLower) || sLower.includes(cellLower)));
                });
                if (matchedDb) detectedSupplierName = matchedDb.name;
              }
            }

            if (!extractedInvoiceNumber) {
              const invMatch = cellVal.match(/^(?:invoice|inv|bill|memo|receipt|slip|ref)\s*(?:#|no|num|number)?\s*[:-]?\s*([a-zA-Z0-9_/-]+)$/i);
              if (invMatch && invMatch[1]) {
                const candInv = invMatch[1].trim();
                if (candInv.length >= 2) extractedInvoiceNumber = candInv;
              }
            }
          }
        }

        const headers = sheetJson[headerRowIndex].map(h => normalizeHeader(h));
        const nameIdx = headers.findIndex(h => h.includes('item') || h.includes('name') || h.includes('product') || h.includes('ingredient'));
        const skuIdx = headers.findIndex(h => h.includes('sku') || h.includes('code'));
        const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('received') || h.includes('amount'));
        const unitIdx = headers.findIndex(h => h.includes('unit') || h.includes('uom') || h.includes('measure'));
        const costIdx = headers.findIndex(h => h.includes('cost') || h.includes('price') || h.includes('rate'));
        const batchIdx = headers.findIndex(h => h.includes('batch') || h.includes('lot'));
        const expIdx = headers.findIndex(h => h.includes('exp') || h.includes('expiry'));
        const suppIdx = headers.findIndex(h => h.includes('supplier') || h.includes('vendor') || h.includes('distributor'));
        const invIdx = headers.findIndex(h => h.includes('invoice') || h.includes('billno') || h.includes('billnum'));

        if (!detectedSupplierName && suppIdx !== -1) {
          for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
            const val = String(sheetJson[i]?.[suppIdx] || '').trim();
            if (val && val.length >= 2) {
              detectedSupplierName = val;
              break;
            }
          }
        }

        if (!extractedInvoiceNumber && invIdx !== -1) {
          for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
            const val = String(sheetJson[i]?.[invIdx] || '').trim();
            if (val && val.length >= 2) {
              extractedInvoiceNumber = val;
              break;
            }
          }
        }

        for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
          const row = sheetJson[i];
          if (!row || row.every(c => !c)) continue;

          let rawName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : String(row[0] || '').trim();
          if (!rawName) {
            for (let c = 0; c < row.length; c++) {
              const val = String(row[c] || '').trim();
              if (val && isNaN(Number(val)) && val.length >= 2) {
                rawName = val;
                break;
              }
            }
          }
          if (!rawName || rawName.length < 2) continue;

          const lowerName = rawName.toLowerCase();
          if (/^(subtotal|total|grand total|tax|gst|discount|balance|due|notes?)$/i.test(lowerName)) continue;

          const sku = skuIdx !== -1 ? String(row[skuIdx] || '').trim() : null;
          const qtyCell = qtyIdx !== -1 ? row[qtyIdx] : row[1];
          const parsedQty = Number.parseFloat(qtyCell);
          const quantityValid = Number.isFinite(parsedQty) && parsedQty > 0;
          const qtyVal = quantityValid ? parsedQty : 0;

          const unitVal = unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : 'KG';
          const costVal = costIdx !== -1 && row[costIdx] ? parseFloat(row[costIdx]) : 0;
          const batchVal = batchIdx !== -1 && row[batchIdx] ? String(row[batchIdx]).trim() : null;
          const expVal = expIdx !== -1 && row[expIdx] ? String(row[expIdx]).trim() : null;
          const rowSupplier = suppIdx !== -1 && row[suppIdx] ? String(row[suppIdx]).trim() : null;
          const rowInvoice = invIdx !== -1 && row[invIdx] ? String(row[invIdx]).trim() : null;

          rawRows.push({
            rawName,
            sku: sku || null,
            quantity: qtyVal,
            unit: unitVal.toUpperCase(),
            unitCost: isNaN(costVal) ? 0 : costVal,
            totalCost: (qtyVal * (isNaN(costVal) ? 0 : costVal)),
            batchNumber: batchVal || null,
            expiryDate: expVal || null,
            supplierName: rowSupplier || null,
            invoiceNumber: rowInvoice || null,
            needsReview: !quantityValid,
            reviewReason: quantityValid ? null : 'Quantity missing or invalid; verify before receiving'
          });
        }
      }
    } catch (csvXlsxErr) {
      console.warn('[AI OCR] CSV XLSX parse failed, falling back to line parser:', csvXlsxErr.message);
    }
  }

  // Fetch full inventory catalog from DB for catalog matching
  const catalogItems = await prisma.inventoryItem.findMany({
    include: { supplier: true, branch: true },
  });

  const matched = [];
  const unmatched = [];
  const warnings = [...aiExtractionWarnings];
  const seenIds = new Set();

  for (const item of rawRows) {
    const matchResult = findBestFuzzyCatalogMatch(item.rawName, item.sku, catalogItems);

    if (matchResult && matchResult.status === 'MATCHED' && matchResult.item) {
      const match = matchResult.item;

      if (seenIds.has(match.id)) {
        warnings.push(`Duplicate entry for "${match.name}" detected in receipt.`);
      }
      seenIds.add(match.id);

      matched.push({
        inventoryItemId: match.id,
        name: match.name,
        rawScannedName: item.rawName,
        category: match.category,
        sku: match.sku || item.sku || null,
        currentStock: match.stockLevel,
        systemUnit: match.unit,
        quantity: item.quantity,
        unit: item.unit || match.unit,
        unitCost: item.unitCost || match.costPrice || 0,
        totalCost: item.totalCost || (item.quantity * (item.unitCost || match.costPrice || 0)),
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
        supplierName: item.supplierName || detectedSupplierName || null,
        invoiceNumber: item.invoiceNumber || extractedInvoiceNumber || null,
        confidence: matchResult.confidence,
        matchType: matchResult.matchType,
        status: item.needsReview ? 'NEEDS_REVIEW' : 'MATCHED',
        needsReview: Boolean(item.needsReview),
        reviewReason: item.reviewReason || null
      });
    } else {
      // Unmatched row: could be REVIEW_MATCH (has suggestion), NEW_ITEM, or NEEDS_REVIEW
      let itemStatus = 'NEW_ITEM';
      if (item.needsReview) {
        itemStatus = 'NEEDS_REVIEW';
      } else if (matchResult && matchResult.status === 'REVIEW_MATCH') {
        itemStatus = 'REVIEW_MATCH';
      }

      unmatched.push({
        rawName: item.rawName,
        category: inferCategoryFromItemName(item.rawName),
        sku: item.sku || null,
        quantity: item.quantity,
        unit: item.unit || 'KG',
        unitCost: item.unitCost || 0,
        totalCost: item.totalCost || (item.quantity * (item.unitCost || 0)),
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
        supplierName: item.supplierName || detectedSupplierName || null,
        invoiceNumber: item.invoiceNumber || extractedInvoiceNumber || null,
        confidence: matchResult ? matchResult.confidence : 0,
        matchType: matchResult ? matchResult.matchType : 'NONE',
        status: itemStatus,
        suggestedItem: matchResult?.suggestedItem || null,
        needsReview: Boolean(item.needsReview),
        reviewReason: item.reviewReason || (itemStatus === 'REVIEW_MATCH' ? `Suggested match: ${matchResult?.suggestedItem?.name}` : null)
      });
    }
  }

  const distinctSuppliers = [...new Set(rawRows.map(r => r.supplierName).filter(Boolean))];
  const distinctInvoices = [...new Set(rawRows.map(r => r.invoiceNumber).filter(Boolean))];

  // Count distinct categories
  const matchedCount = matched.filter(m => m.status === 'MATCHED').length;
  const reviewMatchCount = unmatched.filter(u => u.status === 'REVIEW_MATCH').length;
  const newItemsCount = unmatched.filter(u => u.status === 'NEW_ITEM').length;
  const needsReviewCount = [...matched, ...unmatched].filter(i => i.status === 'NEEDS_REVIEW').length;

  const now = new Date();
  const dateCompact = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const rand6 = Math.floor(100000 + Math.random() * 900000);

  const isGenericInv = !extractedInvoiceNumber || ['not provided', 'n/a', 'none', 'null', 'undefined'].includes(String(extractedInvoiceNumber).trim().toLowerCase());
  const finalInvoiceNumber = isGenericInv
    ? `INV-${dateCompact}-${rand6}`
    : String(extractedInvoiceNumber).trim();

  // Check for duplicate invoice in database
  let isDuplicateInvoice = false;
  let existingReceivingRecord = null;
  if (extractedInvoiceNumber && !isGenericInv) {
    try {
      const matchedSupplier = detectedSupplierName
        ? await prisma.supplier.findFirst({
            where: { name: { equals: String(detectedSupplierName).trim(), mode: 'insensitive' } },
            select: { id: true }
          })
        : null;
      const existing = detectedSupplierName && !matchedSupplier ? null : await prisma.inventoryReceiving.findFirst({
        where: {
          invoiceNumber: { equals: String(extractedInvoiceNumber).trim(), mode: 'insensitive' },
          status: 'RECEIVED',
          ...(matchedSupplier ? { supplierId: matchedSupplier.id } : {})
        },
        include: { supplier: true }
      });
      if (existing) {
        isDuplicateInvoice = true;
        existingReceivingRecord = {
          id: existing.id,
          receivingNumber: existing.receivingNumber,
          supplierName: existing.supplier?.name || 'N/A',
          receivingDate: existing.receivingDate
        };
        warnings.push(`Duplicate Invoice Warning: Invoice #${extractedInvoiceNumber} was already received in transaction #${existing.receivingNumber} on ${new Date(existing.receivingDate).toLocaleDateString()}. Re-importing will be blocked to protect inventory balances.`);
      }
    } catch { /* Optional OCR parsing/lookup fallback. */ }
  }

  return {
    success: true,
    fileName: fileName || null,
    invoiceNumber: finalInvoiceNumber,
    rawInvoiceNumber: extractedInvoiceNumber || null,
    isDuplicateInvoice,
    existingReceivingRecord,
    receivingDate: extractedDate || localDateStr,
    supplierName: detectedSupplierName || null,
    detectedSupplierName: detectedSupplierName || null,
    invoiceTotal: detectedTotal,
    invoiceSubtotal: detectedSubtotal,
    invoiceDiscount: detectedDiscount,
    invoiceDiscountPercent: detectedDiscountPercent,
    matchedItems: matched,
    unmatchedItems: unmatched,
    warnings,
    summary: {
      totalRows: rawRows.length,
      matchedCount,
      reviewMatchCount,
      newItemsCount,
      needsReviewCount,
      isDuplicateInvoice,
      distinctSuppliers,
      distinctInvoices,
      hasMultipleSuppliers: distinctSuppliers.length > 1,
      hasMultipleInvoices: distinctInvoices.length > 1,
      estimatedTotalCost: matched.reduce((acc, i) => acc + (parseFloat(i.totalCost) || 0), 0) +
                          unmatched.reduce((acc, i) => acc + (parseFloat(i.totalCost) || 0), 0),
    },
  };
};

module.exports = {
  parseAndMatchInvoice,
  findBestFuzzyCatalogMatch,
  hasConflictingVariants,
  normalizeItemName
};
