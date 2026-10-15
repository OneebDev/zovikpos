/**
 * Intelligent Category Detection Engine for ZovikPOS (Frontend)
 * Automatically infers restaurant stock item categories from English, Urdu, and Roman Urdu item names.
 * Supports ingredients, spices, produce, meat, dairy, beverages, packaging, cleaning supplies,
 * utensils, maintenance, stationery, and tiny miscellaneous consumables.
 */

export const CATALOG_CATEGORIES = [
  'Vegetables',
  'Meat & Protein',
  'Dairy & Fats',
  'Bakery',
  'Sauces & Condiments',
  'Dry Goods',
  'Spices',
  'Beverages',
  'Desserts',
  'Packaging',
  'Kitchen Supplies',
  'Utensils & Equipment',
  'Stationery & Office',
  'Maintenance',
  'General',
  'Other'
];

export const inferCategoryFromItemName = (name) => {
  if (!name || typeof name !== 'string') return 'General';
  const clean = name.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'General';

  // 1. Tiny Miscellaneous Consumables, Stationery & Office
  const stationeryKeywords = [
    'thermal roll', 'receipt roll', 'bill roll', 'pos roll', 'paper roll',
    'register', 'notepad', 'order pad', 'kpt pad', 'receipt paper',
    'label', 'labels', 'sticker', 'stickers', 'price tag', 'barcode sticker',
    'pen', 'pens', 'marker', 'ballpen', 'stapler', 'staples', 'paperclip',
    'carbon paper', 'envelope', 'rubber stamp', 'ink pad', 'stationery'
  ];
  if (stationeryKeywords.some(k => clean.includes(k))) return 'Stationery & Office';

  // 2. Cleaning & Hygiene / Kitchen Supplies (Checked before packaging so 'gloves box' is categorized as gloves)
  const cleaningKeywords = [
    'scrubber', 'scrubbers', 'scourer', 'scourers', 'steel wool', 'sponge', 'sponges',
    'cleaning pad', 'wiper', 'mop', 'duster', 'cloth', 'cleaning cloth', 'microfiber',
    'broom', 'brush', 'cleaning brush', 'toilet brush', 'jaali', 'برتن دھونے کی جالی',
    'soap', 'handwash', 'hand wash', 'dishwash', 'dish wash', 'detergent', 'cleaner',
    'floor cleaner', 'glass cleaner', 'bleach', 'surf', 'vim', 'harpic', 'phenol',
    'sanitizer', 'disinfectant', 'hand sanitizer', 'degreaser',
    'glove', 'gloves', 'latex gloves', 'vinyl gloves', 'plastic gloves', 'hand gloves', 'دستانے',
    'apron', 'aprons', 'hairnet', 'hair net', 'hairnets', 'face mask', 'masks', 'chef cap',
    'garbage bag', 'garbage bags', 'trash bag', 'trash bags', 'bin liner', 'bin liners', 'dustbin',
    'wipe', 'wipes', 'wet wipes', 'kitchen supplies'
  ];
  if (cleaningKeywords.some(k => clean.includes(k))) return 'Kitchen Supplies';

  // 3. Utensils & Equipment / Small Accessories (Checked before packaging so 'battery pack' matches equipment)
  const utensilKeywords = [
    'matchstick', 'matchsticks', 'matchbox', 'match box', 'matches', 'maachis', 'machis', 'ماچس',
    'lighter', 'gas lighter', 'kitchen lighter',
    'battery', 'batteries', 'cell', 'cells', 'aa battery', 'aaa battery', 'سیل',
    'bulb', 'led bulb', 'fuse', 'torch',
    'tongs', 'chimta', 'peeler', 'knife', 'knives', 'knife sharpener', 'spatula',
    'ladle', 'strainer', 'whisk', 'egg beater', 'grater', 'kaddu kash',
    'measuring cup', 'measuring spoon', 'thermometer', 'kitchen scale',
    'chopping board', 'cutting board', 'tray', 'serving tray', 'skewer', 'skewers', 'seekh'
  ];
  if (utensilKeywords.some(k => clean.includes(k))) return 'Utensils & Equipment';

  // 4. Packaging, Wrapping & Disposables
  const packagingKeywords = [
    'toothpick', 'toothpicks', 'toopick', 'toohtpick', 'tooth pick', 'tooth picks', 'daant khilal', 'khilal', 'خلال',
    'rubber band', 'rubber bands', 'rubberband', 'rubberbands', 'elastik', 'ربڑ بینڈ',
    'straw', 'straws', 'drinking straw', 'paper straw', 'plastic straw', 'سفری اسٹرا',
    'tape', 'packing tape', 'scotch tape', 'masking tape', 'cello tape', 'ٹیمپ',
    'box', 'boxes', 'burger box', 'pizza box', 'shawarma box', 'carton', 'cartons',
    'container', 'containers', 'plastic container', 'aluminum container', 'foil container',
    'cup', 'cups', 'disposable cup', 'paper cup', 'chai cup', 'tea cup', 'coffee cup',
    'lid', 'lids', 'glass', 'disposable glass',
    'spoon', 'spoons', 'fork', 'forks', 'knife disposable', 'plastic spoon', 'plastic fork', 'chopstick', 'chopsticks',
    'aluminum foil', 'aluminium foil', 'silver foil', 'foil', 'سلور فوائل',
    'butter paper', 'baking paper', 'wrapping paper', 'parchment paper', 'بٹر پیپر',
    'cling film', 'cling wrap', 'plastic wrap', 'shrink wrap',
    'tissue', 'tissues', 'tissue paper', 'napkin', 'napkins', 'serviettes', 'facial tissue', 'ٹشو',
    'paper bag', 'paper bags', 'plastic bag', 'plastic bags', 'shopper', 'shoppers', 'polythene bag', 'شاپر', 'پلاسٹک بیگ',
    'packaging', 'disposable', 'disposables', 'packing material'
  ];
  if (packagingKeywords.some(k => clean.includes(k))) return 'Packaging';

  // 5. Desserts & Sweeteners
  const dessertKeywords = [
    'ice cream', 'icecream', 'custard', 'kheer', 'jelly', 'pudding', 'gulab jamun',
    'rasgulla', 'barfi', 'mithai', 'sweet', 'sweets', 'chocolate', 'cocoa', 'vanilla',
    'caramel', 'halwa', 'falooda', 'dessert', 'desserts'
  ];
  if (dessertKeywords.some(k => clean.includes(k))) return 'Desserts';

  // 6. Sauces & Condiments
  const sauceKeywords = [
    'oil', 'cooking oil', 'canola oil', 'sunflower oil', 'olive oil', 'corn oil', 'mustard oil', 'tel', 'tail', 'تیل', 'کوکنگ آئل',
    'ketchup', 'tomato ketchup', 'tomato sauce', 'sauce', 'chilli sauce', 'hot sauce', 'soy sauce', 'soya sauce',
    'vinegar', 'sirka', 'mustard', 'mustard paste', 'bbq sauce', 'barbecue sauce', 'peri peri',
    'chili garlic', 'garlic sauce', 'mayo garlic', 'garlic mayo', 'mayo', 'mayonnaise',
    'dressing', 'salad dressing', 'salsa', 'dip', 'chutney', 'chatni', 'pickle', 'achaar', 'achar'
  ];
  if (sauceKeywords.some(k => clean.includes(k))) return 'Sauces & Condiments';

  // 7. Meat & Protein
  const meatKeywords = [
    'chicken', 'murghi', 'murgi', 'beef', 'cow', 'mutton', 'gosht', 'lamb', 'meat',
    'fish', 'machli', 'machhli', 'prawn', 'prawns', 'shrimp', 'crab',
    'mince', 'keema', 'qeema', 'qima', 'fillet', 'breast', 'wing', 'wings',
    'thigh', 'leg', 'drumstick', 'boneless', 'tikka', 'boti', 'kebab', 'kabab',
    'patty', 'patties', 'nugget', 'nuggets', 'pepperoni', 'sausage',
    'bacon', 'salami', 'meatball', 'meatballs', 'liver', 'kaleji', 'مرغی', 'گوشت', 'بیف', 'مٹن', 'قیمہ', 'مچھلی'
  ];
  if (meatKeywords.some(k => clean.includes(k))) return 'Meat & Protein';

  // 8. Dairy & Fats
  const dairyKeywords = [
    'milk', 'doodh', 'dodh', 'yogurt', 'dahi', 'curd', 'cheese', 'cheddar', 'mozzarella',
    'parmesan', 'paneer', 'butter', 'makhan', 'cream', 'malai', 'ghee',
    'desi ghee', 'egg', 'eggs', 'anda', 'anday', 'ande', 'margarine', 'condensed milk', 'dairy',
    'دودھ', 'دہی', 'مکھن', 'پنیر', 'انڈے', 'انڈا', 'گھی'
  ];
  if (dairyKeywords.some(k => clean.includes(k))) return 'Dairy & Fats';

  // 9. Bakery
  const bakeryKeywords = [
    'bun', 'buns', 'burger bun', 'bread', 'roti', 'naan', 'paratha',
    'pita', 'pita bread', 'shawarma bread', 'toast', 'croissant', 'dough',
    'crust', 'pizza crust', 'pizza dough', 'tortilla', 'wrap', 'sheermal',
    'kulcha', 'bagel', 'muffin', 'cake', 'biscuit', 'biscuits', 'cookie', 'cookies',
    'rusk', 'bakery', 'برگر بن', 'ڈبل روٹی', 'پیٹا بریڈ'
  ];
  if (bakeryKeywords.some(k => clean.includes(k))) return 'Bakery';

  // 10. Vegetables & Fresh Produce
  const vegKeywords = [
    'potato', 'potatoes', 'aloo', 'alu', 'onion', 'onions', 'pyaz', 'pyaaz', 'piyaz',
    'tomato', 'tomatoes', 'tamatar', 'ginger', 'adrak', 'garlic', 'lehsan', 'lahsan',
    'chilli', 'chili', 'mirch', 'hari mirch', 'green chilli', 'cucumber', 'kheera',
    'cabbage', 'band gobi', 'patta gobi', 'cauliflower', 'phool gobi', 'gobi',
    'pea', 'peas', 'matar', 'carrot', 'carrots', 'gajar', 'lemon', 'lemons', 'lemo', 'nimbu',
    'spinach', 'palak', 'coriander', 'dhania', 'dhanya', 'mint', 'pudina', 'podina',
    'lettuce', 'salad', 'capsicum', 'bell pepper', 'shimla', 'shimla mirch',
    'mushroom', 'mushrooms', 'khumbi', 'eggplant', 'brinjal', 'baingan',
    'okra', 'ladyfinger', 'bhindi', 'radish', 'mooli', 'pumpkin', 'kaddu',
    'beetroot', 'chukandar', 'corn', 'sweetcorn', 'makai', 'zucchini', 'vegetable', 'vegetables', 'sabzi',
    'آلو', 'پیاز', 'ٹماٹر', 'ادرک', 'لہسن', 'ہری مرچ', 'دھنیا', 'پودینہ', 'کھیرا', 'گاجر', 'مٹر', 'پالک', 'بھنڈی'
  ];
  if (vegKeywords.some(k => clean.includes(k))) return 'Vegetables';

  // 11. Beverages
  const beverageKeywords = [
    'tea', 'chai', 'chai patti', 'green tea', 'coffee', 'espresso', 'cappuccino', 'nescafe',
    'sugar', 'cheeni', 'chini', 'shakar', 'gur', 'jaggery',
    'water', 'mineral water', 'paani', 'juice', 'nectar', 'soda', 'soft drink', 'cold drink',
    'coke', 'coca cola', 'pepsi', 'sprite', 'fanta', '7up', 'dew', 'sting', 'marinda',
    'syrup', 'rooh afza', 'jam e shirin', 'squash', 'tang', 'shake', 'smoothie',
    'چائے', 'چائے پتی', 'کافی', 'پانی', 'چینی'
  ];
  if (beverageKeywords.some(k => clean.includes(k))) return 'Beverages';

  // 12. Spices
  const spiceKeywords = [
    'salt', 'namak', 'black pepper', 'kali mirch', 'white pepper', 'safed mirch',
    'red chilli', 'lal mirch', 'chilli flakes', 'kuti mirch', 'dara mirch', 'paprika',
    'turmeric', 'haldi', 'cumin', 'zeera', 'jeera', 'coriander powder', 'dhania powder',
    'garam masala', 'chaat masala', 'biryani masala', 'tikka masala', 'cardamom', 'elaichi',
    'clove', 'cloves', 'laung', 'cinnamon', 'darcheeni', 'bay leaf', 'tez patta',
    'star anise', 'badiyan', 'fennel', 'saunf', 'fenugreek', 'methi', 'kasuri methi',
    'nutmeg', 'jaiphal', 'mace', 'javitri', 'mustard seeds', 'rai', 'carom seeds', 'ajwain',
    'saffron', 'zafran', 'oregano', 'thyme', 'basil', 'rosemary', 'spice', 'spices', 'masala',
    'نمک', 'ہلدی', 'زیرہ', 'لال مرچ', 'کالی مرچ', 'گرم مصالحہ', 'الائچی', 'لونگ', 'دار چینی'
  ];
  if (spiceKeywords.some(k => clean.includes(k))) return 'Spices';

  // 13. Dry Goods (Grains, Pulses, Flours)
  const dryGoodsKeywords = [
    'flour', 'aata', 'atta', 'wheat flour', 'maida', 'refined flour', 'all purpose flour',
    'besan', 'gram flour', 'cornflour', 'corn flour', 'cornstarch', 'rice', 'chawal', 'basmati',
    'daal', 'dal', 'lentil', 'lentils', 'pulse', 'pulses', 'chana', 'chickpea', 'chickpeas',
    'white chana', 'black chana', 'kidney beans', 'rajma', 'beans', 'lobia', 'moong', 'masoor',
    'urad', 'pasta', 'macaroni', 'spaghetti', 'noodles', 'vermicelli', 'seviyan', 'suji', 'semolina',
    'oats', 'cereal', 'wheat', 'grain', 'grains', 'آٹا', 'میدہ', 'بیسن', 'چاول'
  ];
  if (dryGoodsKeywords.some(k => clean.includes(k))) return 'Dry Goods';

  return 'General';
};
