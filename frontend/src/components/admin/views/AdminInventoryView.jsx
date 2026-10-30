import ThemedSelect from '../../common/ThemedSelect';
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  Package,
  AlertTriangle,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Download,
  History,
  CheckCircle2,
  XCircle,
  X,
  Truck,
  Clock,
  Layers,
  Coins,
  Edit3,
  Building2,
  Save,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Check,
  UploadCloud,
  Sparkles,
  Target
} from 'lucide-react';
import { exportToCSV } from '../../../utils/exportUtils';
import api from '../../../services/api';
import { inferCategoryFromItemName } from '../../../utils/categoryHelper';
import { getPresetPackagingForName, PRESET_PACKAGING_DEFAULTS } from '../../../utils/packagingHelper';
import GlobalDeleteModal from '../../common/GlobalDeleteModal';
import PackagingUnitsEditor from '../common/PackagingUnitsEditor';
import BulkSelectionModeButton from '../../common/BulkSelectionModeButton';
const AdminInventoryReceivingView = lazy(() => import('./AdminInventoryReceivingView'));
const AdminRecipeBuilderView = lazy(() => import('./AdminRecipeBuilderView'));
const AdminCostsMarginsView = lazy(() => import('./AdminCostsMarginsView'));
const AdminExpiryTrackingView = lazy(() => import('./AdminExpiryTrackingView'));
const AdminSuppliersView = lazy(() => import('./AdminSuppliersView'));
const AdminActivityLogsView = lazy(() => import('./AdminActivityLogsView'));

const InventorySectionFallback = () => (
  <div className="min-h-[180px] rounded-2xl bg-[var(--surface-2)] animate-pulse" role="status" aria-label="Loading inventory section" />
);

// Preset catalog of 200+ standard restaurant/canteen ingredients with Urdu aliases
const INGREDIENT_PRESETS = [
  // Meat & Protein
  { label: '🍗 Chicken Breast', name: 'Chicken Breast', unit: 'KG', category: 'Meat & Protein', aliases: ['chicken', 'murghi', 'chiken', 'breast'] },
  { label: '🍗 Chicken Boneless', name: 'Chicken Boneless', unit: 'KG', category: 'Meat & Protein', aliases: ['chicken', 'boneless', 'murghi'] },
  { label: '🍗 Chicken Mince (Keema)', name: 'Chicken Mince', unit: 'KG', category: 'Meat & Protein', aliases: ['chicken keema', 'qima', 'qeema'] },
  { label: '🍗 Whole Chicken', name: 'Whole Chicken', unit: 'KG', category: 'Meat & Protein', aliases: ['chicken', 'poora murgh'] },
  { label: '🍗 Chicken Wings', name: 'Chicken Wings', unit: 'KG', category: 'Meat & Protein', aliases: ['wings', 'chicken'] },
  { label: '🍗 Chicken Thighs', name: 'Chicken Thighs', unit: 'KG', category: 'Meat & Protein', aliases: ['thigh', 'chicken'] },
  { label: '🥩 Beef Mince (Keema)', name: 'Beef Mince', unit: 'KG', category: 'Meat & Protein', aliases: ['beef keema', 'bada keema', 'qima', 'qeema'] },
  { label: '🥩 Beef Boneless', name: 'Beef Boneless', unit: 'KG', category: 'Meat & Protein', aliases: ['beef', 'bada gosht'] },
  { label: '🥩 Beef Boti / Stew Meat', name: 'Beef Boti', unit: 'KG', category: 'Meat & Protein', aliases: ['beef boti', 'pasanday'] },
  { label: '🥩 Mutton / Lamb Meat', name: 'Mutton Meat', unit: 'KG', category: 'Meat & Protein', aliases: ['mutton', 'bakra', 'gosht', 'lamb'] },
  { label: '🥩 Mutton Mince', name: 'Mutton Mince', unit: 'KG', category: 'Meat & Protein', aliases: ['mutton keema', 'bakra keema'] },
  { label: '🐟 Fish Fillet', name: 'Fish Fillet', unit: 'KG', category: 'Meat & Protein', aliases: ['machli', 'fish', 'surmai', 'rahu'] },
  { label: '🦐 Prawns / Shrimp', name: 'Prawns', unit: 'KG', category: 'Meat & Protein', aliases: ['jhinga', 'prawn', 'shrimp'] },
  { label: '🥚 Fresh Eggs', name: 'Eggs', unit: 'DOZEN', category: 'Meat & Protein', aliases: ['anda', 'anday', 'egg'] },
  { label: '🍢 Seekh Kebab Mix', name: 'Seekh Kebab Meat', unit: 'KG', category: 'Meat & Protein', aliases: ['kebab', 'kabab'] },
  { label: '🥩 Beef Burger Patties', name: 'Beef Burger Patties', unit: 'PCS', category: 'Meat & Protein', aliases: ['patty', 'burger patty'] },
  { label: '🍗 Chicken Burger Patties', name: 'Chicken Patties', unit: 'PCS', category: 'Meat & Protein', aliases: ['chicken patty'] },

  // Vegetables
  { label: '🥔 Aloo (Potatoes)', name: 'Potatoes', unit: 'KG', category: 'Vegetables', aliases: ['aloo', 'patato', 'potatos'] },
  { label: '🧅 Pyaz (Onions)', name: 'Onions', unit: 'KG', category: 'Vegetables', aliases: ['pyaz', 'pyaaz', 'onion'] },
  { label: '🍅 Tamatar (Tomatoes)', name: 'Tomatoes', unit: 'KG', category: 'Vegetables', aliases: ['tamatar', 'tomato', 'tamatar'] },
  { label: '🧄 Lehsan (Garlic)', name: 'Garlic', unit: 'KG', category: 'Vegetables', aliases: ['lehsan', 'lahsan', 'garlic'] },
  { label: '🫚 Adrak (Ginger)', name: 'Ginger', unit: 'KG', category: 'Vegetables', aliases: ['adrak', 'ginger'] },
  { label: '🌶️ Hari Mirch (Green Chillies)', name: 'Green Chillies', unit: 'KG', category: 'Vegetables', aliases: ['hari mirch', 'green chilli', 'mirch'] },
  { label: '🍋 Leemon (Lemons)', name: 'Lemons', unit: 'KG', category: 'Vegetables', aliases: ['lemon', 'limbu', 'leemun'] },
  { label: '🌿 Hara Dhania (Coriander Leaves)', name: 'Coriander Leaves', unit: 'KG', category: 'Vegetables', aliases: ['dhania', 'coriander', 'hara dhaniya'] },
  { label: '🌿 Podina (Mint Leaves)', name: 'Mint Leaves', unit: 'KG', category: 'Vegetables', aliases: ['pudina', 'podina', 'mint'] },
  { label: '🫑 Shimla Mirch (Capsicum)', name: 'Capsicum', unit: 'KG', category: 'Vegetables', aliases: ['shimla mirch', 'bell pepper', 'capsicum'] },
  { label: '🥕 Gajar (Carrots)', name: 'Carrots', unit: 'KG', category: 'Vegetables', aliases: ['gajar', 'carrot'] },
  { label: '🥒 Kheera (Cucumber)', name: 'Cucumber', unit: 'KG', category: 'Vegetables', aliases: ['kheera', 'cucumber'] },
  { label: '🥬 Band Gobhi (Cabbage)', name: 'Cabbage', unit: 'KG', category: 'Vegetables', aliases: ['cabbage', 'gobhi', 'patta gobhi'] },
  { label: '🥦 Phool Gobhi (Cauliflower)', name: 'Cauliflower', unit: 'KG', category: 'Vegetables', aliases: ['cauliflower', 'cauli'] },
  { label: '🍆 Baingan (Eggplant / Brinjal)', name: 'Eggplant', unit: 'KG', category: 'Vegetables', aliases: ['baingan', 'brinjal'] },
  { label: '🫛 Matar (Green Peas)', name: 'Green Peas', unit: 'KG', category: 'Vegetables', aliases: ['matar', 'peas'] },
  { label: '🫛 Bhindi (Ladyfinger / Okra)', name: 'Lady Finger', unit: 'KG', category: 'Vegetables', aliases: ['bhindi', 'okra'] },
  { label: '🍄 Mushrooms', name: 'Mushrooms', unit: 'KG', category: 'Vegetables', aliases: ['khumbi', 'mushroom'] },
  { label: '🌱 Palak (Spinach)', name: 'Spinach', unit: 'KG', category: 'Vegetables', aliases: ['palak', 'spinach'] },
  { label: '🫛 Lobia / Beans', name: 'Green Beans', unit: 'KG', category: 'Vegetables', aliases: ['phalia', 'lobia'] },

  // Dry Goods & Grains
  { label: '🍚 Basmati Rice', name: 'Basmati Rice', unit: 'KG', category: 'Dry Goods', aliases: ['rice', 'chawal', 'basmati'] },
  { label: '🍚 Sella Rice (Biryani)', name: 'Sella Rice', unit: 'KG', category: 'Dry Goods', aliases: ['sella', 'chawal', 'biryani rice'] },
  { label: '🌾 Aata (Wheat Flour)', name: 'Wheat Flour', unit: 'KG', category: 'Dry Goods', aliases: ['aata', 'flour', 'gundum'] },
  { label: '🥣 Maida (Refined Flour)', name: 'Maida', unit: 'KG', category: 'Dry Goods', aliases: ['maida', 'refined flour'] },
  { label: '🥣 Suji (Semolina)', name: 'Suji', unit: 'KG', category: 'Dry Goods', aliases: ['suji', 'semolina'] },
  { label: '🫓 Besan (Gram Flour)', name: 'Besan', unit: 'KG', category: 'Dry Goods', aliases: ['besan', 'chana flour'] },
  { label: '🫘 Chana Dal', name: 'Chana Dal', unit: 'KG', category: 'Dry Goods', aliases: ['dal chana', 'chana dal'] },
  { label: '🫘 Moong Dal', name: 'Moong Dal', unit: 'KG', category: 'Dry Goods', aliases: ['dal moong'] },
  { label: '🫘 Masoor Dal', name: 'Masoor Dal', unit: 'KG', category: 'Dry Goods', aliases: ['dal masoor', 'kaali dal'] },
  { label: '🫘 Mash Dal', name: 'Mash Dal', unit: 'KG', category: 'Dry Goods', aliases: ['dal mash', 'white dal'] },
  { label: '🫘 Safaid Chana (Chickpeas)', name: 'White Chickpeas', unit: 'KG', category: 'Dry Goods', aliases: ['chana', 'chhole', 'kabuli chana'] },
  { label: '🫘 Kaala Chana', name: 'Black Chickpeas', unit: 'KG', category: 'Dry Goods', aliases: ['kaala chana'] },
  { label: '🥣 Cheeni (Sugar)', name: 'Sugar', unit: 'KG', category: 'Dry Goods', aliases: ['sugar', 'cheeni', 'shakar'] },
  { label: '🥣 Gur (Jaggery)', name: 'Jaggery', unit: 'KG', category: 'Dry Goods', aliases: ['gur', 'gud'] },
  { label: '📦 Noodles / Pasta', name: 'Pasta Noodles', unit: 'KG', category: 'Dry Goods', aliases: ['noodles', 'pasta', 'macaroni', 'spaghetti'] },
  { label: '📦 Bread Crumbs', name: 'Bread Crumbs', unit: 'KG', category: 'Dry Goods', aliases: ['breadcrumbs', 'crum'] },
  { label: '🌾 Cornflour', name: 'Cornflour', unit: 'KG', category: 'Dry Goods', aliases: ['corn starch', 'cornflour'] },

  // Dairy & Refrigerated
  { label: '🥛 Doodh (Fresh Milk)', name: 'Milk', unit: 'L', category: 'Dairy', aliases: ['doodh', 'milk', 'tetra pak'] },
  { label: '🥛 TetraPak Milk (Full Cream)', name: 'TetraPak Milk', unit: 'PACK', category: 'Dairy', aliases: ['olpers', 'nestle', 'milk pack'] },
  { label: '🧀 Mozzarella Cheese', name: 'Mozzarella Cheese', unit: 'KG', category: 'Dairy', aliases: ['cheese', 'pizza cheese'] },
  { label: '🧀 Mozzarella Cheese (Pack)', name: 'Mozzarella Cheese', unit: 'PACK', category: 'Dairy', aliases: ['cheese', 'pizza cheese', 'mozzarella pack', 'cheese pack'] },
  { label: '🧀 Cheddar Cheese Block', name: 'Cheddar Cheese', unit: 'KG', category: 'Dairy', aliases: ['cheddar', 'cheese'] },
  { label: '🧀 Cheese Slices', name: 'Cheese Slices', unit: 'PACK', category: 'Dairy', aliases: ['slice cheese', 'burger cheese'] },
  { label: '🧈 Makhan (Butter)', name: 'Butter', unit: 'KG', category: 'Dairy', aliases: ['makhan', 'butter', 'blue band'] },
  { label: '🥛 Fresh Cream (Malai)', name: 'Fresh Cream', unit: 'L', category: 'Dairy', aliases: ['cream', 'malai', 'milkpak cream'] },
  { label: '🥛 Dahi (Yogurt)', name: 'Yogurt', unit: 'KG', category: 'Dairy', aliases: ['dahi', 'yogurt', 'curd'] },
  { label: '🧈 Desi Ghee', name: 'Desi Ghee', unit: 'KG', category: 'Dairy', aliases: ['ghee', 'asli ghee', 'desi ghee'] },
  { label: '🧀 Paneer (Cottage Cheese)', name: 'Paneer', unit: 'KG', category: 'Dairy', aliases: ['paneer', 'cottage cheese'] },
  { label: '🥛 Condensed Milk', name: 'Condensed Milk', unit: 'PACK', category: 'Dairy', aliases: ['condensed milk', 'can milk'] },

  // Cooking Oil & Fats
  { label: '🛢️ Cooking Oil (Ghee/Oil)', name: 'Cooking Oil', unit: 'L', category: 'Sauces & Condiments', aliases: ['oil', 'tel', 'pakwan oil', 'dalda'] },
  { label: '🛢️ Banaspati Ghee', name: 'Banaspati Ghee', unit: 'KG', category: 'Sauces & Condiments', aliases: ['ghee', 'dalda ghee'] },
  { label: '🛢️ Mustard Oil (Sarson)', name: 'Mustard Oil', unit: 'L', category: 'Sauces & Condiments', aliases: ['sarson ka tel', 'mustard oil'] },
  { label: '🫒 Olive Oil', name: 'Olive Oil', unit: 'L', category: 'Sauces & Condiments', aliases: ['zaitoon', 'olive oil'] },

  // Sauces & Condiments
  { label: '🧃 Tomato Ketchup', name: 'Tomato Ketchup', unit: 'KG', category: 'Sauces & Condiments', aliases: ['ketchup', 'tomato sauce', 'sauce'] },
  { label: '🧴 Mayonnaise', name: 'Mayonnaise', unit: 'KG', category: 'Sauces & Condiments', aliases: ['mayo', 'mayonnaise', 'garlic mayo'] },
  { label: '🌶️ Chilli Garlic Sauce', name: 'Chilli Garlic Sauce', unit: 'KG', category: 'Sauces & Condiments', aliases: ['chilli sauce', 'sauce'] },
  { label: '🧴 Soy Sauce', name: 'Soy Sauce', unit: 'L', category: 'Sauces & Condiments', aliases: ['soya sauce', 'soy'] },
  { label: '🧴 Vinegar (Sirka)', name: 'Vinegar', unit: 'L', category: 'Sauces & Condiments', aliases: ['sirka', 'vinegar'] },
  { label: '🌶️ Hot Sauce / Sriracha', name: 'Hot Sauce', unit: 'L', category: 'Sauces & Condiments', aliases: ['hot sauce', 'sriracha'] },
  { label: '📦 Mustard Sauce / Paste', name: 'Mustard Paste', unit: 'KG', category: 'Sauces & Condiments', aliases: ['mustard', 'rai'] },
  { label: '🧴 BBQ Sauce', name: 'BBQ Sauce', unit: 'KG', category: 'Sauces & Condiments', aliases: ['barbecue sauce', 'bbq'] },
  { label: '📦 Pizza Sauce', name: 'Pizza Sauce', unit: 'KG', category: 'Sauces & Condiments', aliases: ['pizza sauce', 'marinara'] },
  { label: '🥣 Imli Chutney (Tamarind)', name: 'Imli Chutney', unit: 'KG', category: 'Sauces & Condiments', aliases: ['imli', 'tamarind chutney'] },

  // Spices & Masalas
  { label: '🧂 Namak (Salt)', name: 'Salt', unit: 'KG', category: 'Spices', aliases: ['namak', 'salt'] },
  { label: '🌶️ Lal Mirch Powder', name: 'Red Chilli Powder', unit: 'KG', category: 'Spices', aliases: ['lal mirch', 'red chilli'] },
  { label: '🌶️ Lal Mirch Flakes (Kuti)', name: 'Red Chilli Flakes', unit: 'KG', category: 'Spices', aliases: ['kuti mirch', 'chilli flakes'] },
  { label: '🌿 Haldi Powder (Turmeric)', name: 'Turmeric Powder', unit: 'KG', category: 'Spices', aliases: ['haldi', 'turmeric'] },
  { label: '🥣 Garam Masala Powder', name: 'Garam Masala', unit: 'KG', category: 'Spices', aliases: ['garam masala', 'pisa masala'] },
  { label: '🫘 Zeera (Cumin Seeds)', name: 'Cumin Seeds', unit: 'KG', category: 'Spices', aliases: ['zeera', 'zira', 'cumin'] },
  { label: '🫘 Sabut Dhania (Coriander)', name: 'Coriander Seeds', unit: 'KG', category: 'Spices', aliases: ['sabut dhania', 'coriander seeds'] },
  { label: '⚫ Kaali Mirch (Black Pepper)', name: 'Black Pepper Powder', unit: 'KG', category: 'Spices', aliases: ['kaali mirch', 'black pepper'] },
  { label: '🥣 Biryani Masala Box', name: 'Biryani Masala', unit: 'PACK', category: 'Spices', aliases: ['biryani masala', 'shan biryani'] },
  { label: '🥣 Karahi Masala Box', name: 'Karahi Masala', unit: 'PACK', category: 'Spices', aliases: ['karahi masala', 'shan karahi'] },
  { label: '🥣 Tikka Masala Box', name: 'Tikka Masala', unit: 'PACK', category: 'Spices', aliases: ['tikka masala'] },
  { label: '🥣 Chaat Masala', name: 'Chaat Masala', unit: 'KG', category: 'Spices', aliases: ['chaat masala'] },
  { label: '🥣 Kasuri Methi', name: 'Kasuri Methi', unit: 'KG', category: 'Spices', aliases: ['methi', 'kasuri methi'] },
  { label: '🥣 Cinnamon Stick (Darchini)', name: 'Cinnamon Sticks', unit: 'KG', category: 'Spices', aliases: ['darchini', 'cinnamon'] },
  { label: '🥣 Elaichi (Green Cardamom)', name: 'Green Cardamom', unit: 'KG', category: 'Spices', aliases: ['elaichi', 'chhoti elaichi', 'cardamom'] },
  { label: '🥣 Badi Elaichi (Black Cardamom)', name: 'Black Cardamom', unit: 'KG', category: 'Spices', aliases: ['badi elaichi'] },
  { label: '🥣 Laung (Cloves)', name: 'Cloves', unit: 'KG', category: 'Spices', aliases: ['laung', 'cloves'] },
  { label: '🥣 Tez Patta (Bay Leaves)', name: 'Bay Leaves', unit: 'KG', category: 'Spices', aliases: ['tez patta', 'bay leaf'] },

  // Bakery & Bread
  { label: '🍔 Burger Buns (Regular)', name: 'Burger Buns', unit: 'PCS', category: 'Bakery', aliases: ['bun', 'burger bun'] },
  { label: '🍔 Burger Buns (Sesame)', name: 'Sesame Burger Buns', unit: 'PCS', category: 'Bakery', aliases: ['sesame bun', 'bun'] },
  { label: '🍞 Sandwich Bread (Large)', name: 'Sandwich Bread', unit: 'PACK', category: 'Bakery', aliases: ['bread', 'double roti'] },
  { label: '🫓 Shawarma Pita Bread', name: 'Pita Bread', unit: 'PCS', category: 'Bakery', aliases: ['shawarma bread', 'pita'] },
  { label: '🫓 Naan Bread (Plain)', name: 'Naan', unit: 'PCS', category: 'Bakery', aliases: ['naan', 'roti'] },
  { label: '🫓 Paratha (Frozen/Fresh)', name: 'Paratha', unit: 'PCS', category: 'Bakery', aliases: ['paratha', 'roll paratha'] },
  { label: '🍕 Pizza Crust / Base (Medium)', name: 'Pizza Dough Base', unit: 'PCS', category: 'Bakery', aliases: ['pizza base', 'dough'] },
  { label: '🥐 Croissants', name: 'Croissants', unit: 'PCS', category: 'Bakery', aliases: ['croissant'] },

  // Beverages & Chai
  { label: '☕ Chai Patti (Everyday/Supreme)', name: 'Tea Leaves', unit: 'KG', category: 'Beverages', aliases: ['chai patti', 'tea', 'tapal', 'lipton'] },
  { label: '☕ Coffee Powder (Instant)', name: 'Coffee Powder', unit: 'KG', category: 'Beverages', aliases: ['coffee', 'nescafe'] },
  { label: '☕ Coffee Beans (Espresso)', name: 'Coffee Beans', unit: 'KG', category: 'Beverages', aliases: ['coffee beans', 'espresso'] },
  { label: '🥤 Cold Drink Cans (Assorted)', name: 'Cold Drinks 250ml', unit: 'PCS', category: 'Beverages', aliases: ['pepsi', 'coke', '7up', 'sprite', 'cold drink'] },
  { label: '🥤 Cold Drink 1.5L Bottles', name: 'Cold Drinks 1.5L', unit: 'BOTTLE', category: 'Beverages', aliases: ['bottle', 'cold drink bottle'] },
  { label: '💧 Mineral Water Bottles (500ml)', name: 'Water Bottles 500ml', unit: 'PCS', category: 'Beverages', aliases: ['water', 'paani', 'nestle pure life'] },
  { label: '💧 Mineral Water Can (19L)', name: 'Water Can 19L', unit: 'BOTTLE', category: 'Beverages', aliases: ['water 19l', 'chiller water'] },
  { label: '🧃 Fruit Juices (Pack)', name: 'Fruit Juices', unit: 'PACK', category: 'Beverages', aliases: ['juice', 'nestle juice', 'shezan'] },
  { label: '📦 Rooh Afza / Jam-e-Shirin', name: 'Rooh Afza Syrup', unit: 'BOTTLE', category: 'Beverages', aliases: ['rooh afza', 'jam e shirin', 'red syrup'] },
  { label: '📦 Lemonade Concentrate', name: 'Lemon Syrup', unit: 'BOTTLE', category: 'Beverages', aliases: ['lemonade', 'limca'] },

  // Packaging & Disposables
  { label: '📦 Burger Box (Paperboard)', name: 'Burger Boxes', unit: 'PCS', category: 'Packaging', aliases: ['burger box', 'packaging'] },
  { label: '📦 Pizza Boxes (12 inch)', name: 'Pizza Boxes 12 inch', unit: 'PCS', category: 'Packaging', aliases: ['pizza box', 'box'] },
  { label: '☕ Hot Drink Cups 8oz (Paper)', name: 'Paper Tea Cups 8oz', unit: 'PCS', category: 'Packaging', aliases: ['chai cup', 'paper cup'] },
  { label: '🥤 Cold Drink Cups & Lids 16oz', name: 'Beverage Cups 16oz', unit: 'PCS', category: 'Packaging', aliases: ['cold cup', 'plastic cup'] },
  { label: '📦 Takeaway Food Containers (Plastic)', name: 'Food Containers 750ml', unit: 'PCS', category: 'Packaging', aliases: ['dabba', 'container', 'packing box'] },
  { label: '📦 Shopping Bags (Biodegradable)', name: 'Shopper Bags', unit: 'KG', category: 'Packaging', aliases: ['shopper', 'polythene', 'bag'] },
  { label: '🧻 Tissue Paper Napkins', name: 'Tissue Napkins', unit: 'PACK', category: 'Packaging', aliases: ['tissue', 'tissue paper'] },
  { label: '📜 Butter Paper Roll / Sheets', name: 'Butter Paper', unit: 'PACK', category: 'Packaging', aliases: ['butter paper', 'wrap paper'] },
  { label: '📦 Aluminum Foil Roll', name: 'Aluminum Foil', unit: 'ROLL', category: 'Packaging', aliases: ['foil paper', 'silver foil'] },
  { label: '🥤 Drinking Straws (Paper/Plastic)', name: 'Straws', unit: 'PACK', category: 'Packaging', aliases: ['straw', 'straws'] },

  // Kitchen Supplies & Cleaning
  { label: '🧼 Dishwashing Liquid (Vim/Lemon)', name: 'Dishwash Soap', unit: 'L', category: 'Kitchen Supplies', aliases: ['vim', 'sabun', 'dishwash'] },
  { label: '🧽 Sponge Scrubber Pads', name: 'Scrubber Sponge', unit: 'PCS', category: 'Kitchen Supplies', aliases: ['sponge', 'scrubber', 'khurchan'] },
  { label: '🧤 Disposable Plastic Gloves', name: 'Kitchen Gloves', unit: 'BOX', category: 'Kitchen Supplies', aliases: ['gloves', 'dastanay'] },
  { label: '🧹 Mop / Cleaning Cloth', name: 'Cleaning Cloth', unit: 'PCS', category: 'Kitchen Supplies', aliases: ['poocha', 'cloth', 'duster'] },

  // Desserts & Sweets
  { label: '🍫 Chocolate Syrup (Hershey)', name: 'Chocolate Syrup', unit: 'BOTTLE', category: 'Desserts', aliases: ['chocolate sauce', 'syrup'] },
  { label: '🍨 Vanilla Ice Cream Tub (2L)', name: 'Vanilla Ice Cream', unit: 'BOX', category: 'Desserts', aliases: ['icecream', 'ice cream'] },
  { label: '📦 Cocoa Powder', name: 'Cocoa Powder', unit: 'KG', category: 'Desserts', aliases: ['cocoa', 'coco powder'] },
  { label: '🍧 Chocolate Chips', name: 'Chocolate Chips', unit: 'KG', category: 'Desserts', aliases: ['choco chips'] },
  { label: '🍓 Strawberry Jam / Topping', name: 'Strawberry Jam', unit: 'KG', category: 'Desserts', aliases: ['jam', 'strawberry'] }
];

const QUICK_PICK_GROUPS = [
  { label: 'Meat & Protein', icon: '🍗', category: 'Meat & Protein' },
  { label: 'Vegetables & Herbs', icon: '🥬', category: 'Vegetables' },
  { label: 'Dry Goods & Rice', icon: '🌾', category: 'Dry Goods' },
  { label: 'Dairy & Cheese', icon: '🧀', category: 'Dairy' },
  { label: 'Sauces & Condiments', icon: '🛢️', category: 'Sauces & Condiments' },
  { label: 'Spices & Masala', icon: '🌶️', category: 'Spices' },
  { label: 'Bakery & Bread', icon: '🍞', category: 'Bakery' },
  { label: 'Beverages & Tea', icon: '☕', category: 'Beverages' },
  { label: 'Packaging & Disposable', icon: '📦', category: 'Packaging' },
  { label: 'Kitchen & Cleaning', icon: '🧼', category: 'Kitchen Supplies' },
  { label: 'Desserts & Sweets', icon: '🍨', category: 'Desserts' },
];

// Quantity Formatter helper (no unnecessary trailing decimals, e.g. 164.4 KG or 300 PCS)
const formatQuantity = (qty, unit) => {
  const num = parseFloat(qty) || 0;
  if (unit === 'PCS' || unit === 'DOZEN' || unit === 'BOX' || unit === 'PACK' || unit === 'BOTTLE') {
    return Math.round(num).toLocaleString();
  }
  return (Math.round(num * 100) / 100).toLocaleString();
};

const roundInventoryMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const inventoryLineSubtotal = (quantity, unitCost) => roundInventoryMoney((Number.parseFloat(quantity) || 0) * (Number.parseFloat(unitCost) || 0));
const sumInventorySubtotals = (rows, getQuantity = row => row.stockLevel ?? row.quantity, getCost = row => row.costPrice) =>
  roundInventoryMoney((rows || []).reduce((sum, row) => sum + inventoryLineSubtotal(getQuantity(row), getCost(row)), 0));

const AdminInventoryView = ({ inventory = [], logs = [], onRefresh, showToast, showErrorDialog, focusRequest, onFocusHandled }) => {
  const [activeTab, setActiveTab] = useState('CATALOG');
  const [hasVisitedReceiving, setHasVisitedReceiving] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | LOW | NORMAL | OVERSTOCK
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NAME_ASC'); // NAME_ASC | NAME_DESC | LOW_STOCK_FIRST | OVERSTOCK_FIRST | STOCK_LOW_TO_HIGH | STOCK_HIGH_TO_LOW | COST_HIGH_TO_LOW | RECENTLY_UPDATED

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);

  // Quick Action Modal State
  const [selectedItemForDetails, setSelectedItemForDetails] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedItemForAdjustment, setSelectedItemForAdjustment] = useState(null);

  // Bulk & Single Delete with GlobalDeleteModal
  const [selectedInventoryIds, setSelectedInventoryIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Stock Adjustment Form State
  const [adjType, setAdjType] = useState('CORRECTION'); // CORRECTION | WASTE | EXPIRATION | DAMAGE | USED | OTHER
  const [adjQty, setAdjQty] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Modal / Recipe / Supplier state
  const [suppliersList, setSuppliersList] = useState([]);
  const [receivingsList, setReceivingsList] = useState([]);

  // Add New Item Modal State
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [quickPickSearch, setQuickPickSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});

  const getTodayCompactDate = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const parseReceivingDiscount = (value) => {
    if (/%/.test(String(value ?? ''))) return 0;
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  };
  const parseReceivingDiscountPercent = (value) => {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return value !== null && value !== undefined && value !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
  };
  const calculateCardDiscount = (subtotal, value, mode = 'AMOUNT') => roundInventoryMoney(
    mode === 'PERCENT' ? (subtotal * Math.min(100, Math.max(0, Number(value) || 0))) / 100 : Math.max(0, Number(value) || 0)
  );
  const setCard1DiscountFromInvoice = (invoice) => {
    const percent = parseReceivingDiscountPercent(invoice?.invoiceDiscountPercent);
    if (percent !== null) {
      setCard1DiscountMode('PERCENT');
      setCard1Discount(percent);
    } else {
      setCard1DiscountMode('AMOUNT');
      setCard1Discount(parseReceivingDiscount(invoice?.invoiceDiscount));
    }
  };

  // Factory for a blank ingredient card
  const createBlankIngredientCard = (overrides = {}) => {
    const dateStr = getTodayCompactDate();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return {
      id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: overrides.name || '',
      unit: overrides.unit || 'KG',
      category: overrides.category || 'General',
      minThreshold: overrides.minThreshold || '10',
      maxThreshold: overrides.maxThreshold || '100',
      costPrice: overrides.costPrice !== undefined ? String(overrides.costPrice) : '0',
      stockLevel: overrides.stockLevel !== undefined ? String(overrides.stockLevel) : '0',
      supplierId: overrides.supplierId || '',
      sku: overrides.sku || `REF-${dateStr}-${rand}`,
      batchNumber: overrides.batchNumber || `BATCH-${dateStr}-${rand}`,
      supplierInvoiceNumber: overrides.supplierInvoiceNumber || `INV-${dateStr}-${String(Date.now()).slice(-6)}`,
      expiryDate: overrides.expiryDate || '',
      notes: overrides.notes || '',
      originalDescription: overrides.originalDescription || '',
      isNewItem: overrides.isNewItem !== undefined ? overrides.isNewItem : true,
      saved: overrides.saved || false,
      showSuggestions: false,
      packageConversions: overrides.packageConversions || (overrides.name ? getPresetPackagingForName(overrides.name) : null)
    };
  };

  // Dynamic Multi-Item Cards array state for Add New Ingredient Item
  const [ingredientCards, setIngredientCards] = useState([createBlankIngredientCard()]);
  const [card1Discount, setCard1Discount] = useState(0);
  const [card1DiscountMode, setCard1DiscountMode] = useState('AMOUNT');
  const [additionalDeliveryCards, setAdditionalDeliveryCards] = useState([]);
  const [activeTargetCardId, setActiveTargetCardId] = useState('card-1');

  // Backward compatibility object for single-item helpers & listeners
  const [newItem, setNewItem] = useState({
    name: '',
    unit: 'KG',
    category: 'General',
    minThreshold: '10',
    maxThreshold: '100',
    costPrice: '0',
    stockLevel: '0',
    supplierId: '',
    sku: '',
    batchNumber: '',
    supplierInvoiceNumber: '',
    expiryDate: '',
    notes: '',
  });

  // Unique Batch Number generator helper for Card 1
  const generateAutoBatch = () => {
    const dateStr = getTodayCompactDate();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const batch = `BATCH-${dateStr}-${rand}`;
    setNewItem(prev => ({ ...prev, batchNumber: batch }));
    setIngredientCards(prev => prev.map(c => ({ ...c, batchNumber: batch })));
    if (showToast) showToast(`Batch # Generated: ${batch}`, 'info');
    return batch;
  };

  // Unique Reference generator helper (format: RCV-YYYYMMDD-XXXX)
  const generateAutoSKU = () => {
    const dateStr = getTodayCompactDate();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const refNum = `RCV-${dateStr}-${rand}`;
    setNewItem(prev => ({ ...prev, sku: refNum }));
    setIngredientCards(prev => prev.map(c => ({ ...c, sku: refNum })));
    if (showToast) showToast(`Internal Reference Generated: ${refNum}`, 'info');
    return refNum;
  };

  // Unique Supplier Invoice # generator helper
  const generateAutoInvoiceNum = () => {
    const dateStr = getTodayCompactDate();
    const ms = String(Date.now()).slice(-6);
    const inv = `INV-${dateStr}-${ms}`;
    setNewItem(prev => ({ ...prev, supplierInvoiceNumber: inv }));
    setIngredientCards(prev => prev.map(c => ({ ...c, supplierInvoiceNumber: inv })));
    if (showToast) showToast(`Supplier Invoice # Generated: ${inv}`, 'info');
    return inv;
  };

  // Dynamic Ingredient Card Handlers
  const handleAddIngredientCard = (initialData = {}) => {
    const newCard = createBlankIngredientCard(initialData);
    setIngredientCards(prev => [...prev, newCard]);
    if (showToast) showToast('Added new ingredient card!', 'info');
  };

  const handleRemoveIngredientCard = (cardId) => {
    setIngredientCards(prev => {
      const filtered = prev.filter(c => c.id !== cardId);
      return filtered.length > 0 ? filtered : [createBlankIngredientCard()];
    });
  };

  const handleClearAllIngredientCards = () => {
    setIngredientCards([createBlankIngredientCard()]);
    setCard1Discount(0);
    setCard1DiscountMode('AMOUNT');
    setImportedItems([]);
    if (showToast) showToast('Reset all ingredient cards.', 'info');
  };

  const handleIngredientCardChange = (cardId, field, value) => {
    setIngredientCards(prev => prev.map(card => {
      if (card.id !== cardId) return card;
      const updated = { ...card, [field]: value };
      const cardName = (field === 'name' ? value : (card.name || '')).trim().toLowerCase();
      const cardUnit = (field === 'unit' ? value : (card.unit || 'KG')).trim().toLowerCase();
      
      // Match against active catalog inventory
      const exactCatalogItem = inventory.find(i =>
        i.name.toLowerCase().trim() === cardName &&
        (i.unit || 'KG').toLowerCase().trim() === cardUnit
      ) || (field === 'name' ? inventory.find(i => i.name.toLowerCase().trim() === cardName) : null);

      updated.isNewItem = !exactCatalogItem;
      if (exactCatalogItem) {
        updated.catalogItemId = exactCatalogItem.id;
        updated.category = exactCatalogItem.category || updated.category;
        if (field === 'name') {
          if (exactCatalogItem.unit) updated.unit = exactCatalogItem.unit;
          if (exactCatalogItem.costPrice && (!card.costPrice || card.costPrice === '0' || card.costPrice === 0)) {
            updated.costPrice = exactCatalogItem.costPrice;
          }
          if (exactCatalogItem.packageConversions) {
            updated.packageConversions = exactCatalogItem.packageConversions;
          }
        }
      }

      if (field === 'name') {
        const val = value.trim().toLowerCase();
        const matched = INGREDIENT_PRESETS.find(p => p.name.toLowerCase().trim() === val);
        if (matched && !card.unit && !exactCatalogItem) {
          updated.unit = matched.unit;
          updated.category = matched.category;
        }
        if (!exactCatalogItem?.packageConversions) {
          const presetPkg = getPresetPackagingForName(val);
          if (presetPkg) {
            updated.packageConversions = presetPkg;
          }
        }
      }
      return updated;
    }));
  };







  // Preset Selection -> Updates empty card or appends a new card to the active target supplier card
  const handleSelectPresetForCard = (preset) => {
    const exists = inventory.some(i => i.name.toLowerCase().trim() === preset.name.toLowerCase().trim() && (i.unit || 'KG').toLowerCase().trim() === (preset.unit || 'KG').toLowerCase().trim());

    if (activeTargetCardId === 'card-1' || !additionalDeliveryCards.some(c => c.id === activeTargetCardId)) {
      // Adding into Card #1
      const targetSupplierId = newItem.supplierId || '';
      const targetBatch = newItem.batchNumber || '';
      const targetInvoice = newItem.supplierInvoiceNumber || '';

      setIngredientCards(prev => {
        // If we have only 1 card and it has no name, populate it
        if (prev.length === 1 && !prev[0].name.trim()) {
          return [{
            ...prev[0],
            name: preset.name,
            unit: preset.unit,
            category: preset.category,
            supplierId: targetSupplierId || prev[0].supplierId || '',
            batchNumber: targetBatch || prev[0].batchNumber,
            supplierInvoiceNumber: targetInvoice || prev[0].supplierInvoiceNumber,
            isNewItem: !exists
          }];
        }
        // Otherwise, append a new card with this preset
        return [
          ...prev,
          createBlankIngredientCard({
            name: preset.name,
            unit: preset.unit,
            category: preset.category,
            supplierId: targetSupplierId,
            batchNumber: targetBatch,
            supplierInvoiceNumber: targetInvoice,
            isNewItem: !exists
          })
        ];
      });

      const supName = suppliersList.find(s => String(s.id) === String(targetSupplierId))?.name;
      if (showToast) {
        showToast(`Added "${preset.name}" to Card #1${supName ? ` (${supName})` : ''}!`, exists ? 'info' : 'success');
      }
    } else {
      // Adding into an Additional Delivery Card
      const targetCard = additionalDeliveryCards.find(c => c.id === activeTargetCardId);
      if (!targetCard) return;

      const newItemObj = {
        id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: preset.name,
        originalDescription: preset.name,
        unit: preset.unit,
        category: preset.category,
        quantity: '0',
        stockLevel: '0',
        costPrice: '0',
        supplierName: targetCard.supplierName,
        supplierId: targetCard.supplierId,
        invoiceNumber: targetCard.supplierInvoiceNumber,
        batchNumber: targetCard.batchNumber,
        expiryDate: '',
        isNewItem: !exists,
        saved: false,
        showSuggestions: false
      };

      setAdditionalDeliveryCards(prev => prev.map(c => {
        if (c.id === activeTargetCardId) {
          const currentItems = c.items || [];
          if (currentItems.length === 1 && !currentItems[0].name.trim()) {
            return {
              ...c,
              items: [{ ...currentItems[0], ...newItemObj, id: currentItems[0].id }]
            };
          }
          return {
            ...c,
            items: [...currentItems, newItemObj]
          };
        }
        return c;
      }));

      const cardSupName = targetCard.supplierName || suppliersList.find(s => String(s.id) === String(targetCard.supplierId))?.name || 'Selected Delivery Card';
      if (showToast) {
        showToast(`Added "${preset.name}" to ${cardSupName}!`, exists ? 'info' : 'success');
      }
    }
  };

  // Convert uploaded rows to ingredient cards format
  const mapUploadRowsToIngredientCards = (rows, detectedSupId = '', detectedInv = '', sharedSku = '', sharedBatch = '') => {
    const dateStr = getTodayCompactDate();
    const finalSku = sharedSku || `RCV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalBatch = sharedBatch || `BATCH-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalInv = detectedInv || `INV-${dateStr}-${String(Date.now()).slice(-6)}`;

    return rows.map((it, idx) => ({
      id: it.id || `card_up_${idx}_${Date.now()}`,
      name: it.name || it.originalDescription || '',
      originalDescription: it.originalDescription || it.rawName || '',
      unit: (it.unit || 'KG').toUpperCase(),
      category: it.category || inferCategoryFromItemName(it.name || it.originalDescription || ''),
      minThreshold: '10',
      maxThreshold: '100',
      costPrice: String(it.costPrice || 0),
      stockLevel: String(it.quantity || 0),
      supplierId: it.supplierId || detectedSupId || '',
      sku: finalSku,
      batchNumber: finalBatch,
      supplierInvoiceNumber: it.invoiceNumber || finalInv,
      expiryDate: it.expiryDate || '',
      notes: it.notes || '',
      isNewItem: it.isNewItem !== undefined ? it.isNewItem : true,
      saved: it.saved || false,
      showSuggestions: false
    }));
  };

  // Save single card to catalog (creates catalog item with 0 stock)
    // Link card to an existing catalog item
  const handleLinkCardToExistingItem = (cardId, existingItem) => {
    setIngredientCards(prev => prev.map(c => {
      if (c.id === cardId) {
        return {
          ...c,
          name: existingItem.name,
          unit: existingItem.unit,
          category: existingItem.category || c.category,
          isNewItem: false,
          saved: true,
          saveError: null,
          existingCatalogItem: null,
          packageConversions: existingItem.packageConversions || c.packageConversions
        };
      }
      return c;
    }));
    if (showToast) showToast(`Linked "${existingItem.name}" to existing catalog item (Unit: ${existingItem.unit}).`, 'info');
  };

  const handleDismissCardSaveError = (cardId) => {
    setIngredientCards(prev => prev.map(c => c.id === cardId ? { ...c, saveError: null } : c));
  };

  const handleSaveSingleCardToCatalog = async (card) => {
    if (!card.name || !card.name.trim()) {
      if (showToast) showToast('Please enter an ingredient name.', 'error');
      return;
    }
    try {
      const payload = {
        name: card.name.trim(),
        unit: card.unit || 'KG',
        category: card.category || 'General',
        costPrice: parseFloat(card.costPrice) || 0,
        stockLevel: 0, // IMPORTANT: Save to catalog creates catalog entry with 0 stock
        minThreshold: parseFloat(card.minThreshold) || 10,
        maxThreshold: parseFloat(card.maxThreshold) || 100,
        sku: card.sku || null,
        supplierId: card.supplierId ? parseInt(card.supplierId, 10) : null,
        expiryDate: card.expiryDate ? card.expiryDate : null,
        notes: card.notes || null,
        packageConversions: card.packageConversions || getPresetPackagingForName(card.name) || null
      };
      await api.post('/inventory', payload);
      setIngredientCards(prev => prev.map(c => c.id === card.id ? { ...c, isNewItem: false, saved: true } : c));
      setImportedItems(prev => prev.map(i => i.id === card.id ? { ...i, isNewItem: false, saved: true, catalogMatchName: card.name } : i));
      if (showToast) showToast(`"${card.name}" saved to catalog! (Stock: 0)`, 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      const existingItem = err.response?.data?.existingItem;
      if (existingItem) {
        setIngredientCards(prev => prev.map(c =>
          c.id === card.id
            ? {
                ...c,
                saveError: `"${card.name}" already exists in catalog (Base Unit: ${existingItem.unit}). Change the name or link to the existing item.`,
                existingCatalogItem: existingItem
              }
            : c
        ));
      } else {
        if (showToast) showToast(err.response?.data?.error || 'Failed to save item', 'error');
      }
    }
  };

  // Save all ingredient cards to catalog (creates entries with 0 stock)
  const handleSaveAllIngredientCardsToCatalog = async () => {
    const unsavedCards = ingredientCards.filter(c => c.name && c.name.trim() && !c.saved);
    if (unsavedCards.length === 0) {
      if (showToast) showToast('No unsaved items with names found to save.', 'info');
      return;
    }
    setBulkSavingCatalog(true);
    setCatalogSaveScope('card-1');
    try {
      const itemsPayload = unsavedCards.map((c, rowIndex) => ({
        rowIndex,
        name: c.name.trim(),
        unit: c.unit || 'KG',
        category: c.category || 'General',
        costPrice: parseFloat(c.costPrice) || 0,
        stockLevel: 0, // IMPORTANT: Save to catalog creates catalog entries with 0 stock
        minThreshold: parseFloat(c.minThreshold) || 10,
        maxThreshold: parseFloat(c.maxThreshold) || 100,
        sku: c.sku || null,
        supplierId: c.supplierId ? parseInt(c.supplierId, 10) : null,
        expiryDate: c.expiryDate ? c.expiryDate : null,
        packageConversions: c.packageConversions || getPresetPackagingForName(c.name) || null
      }));
      const response = await api.post('/inventory/bulk', { items: itemsPayload });
      const results = response.data?.results || [];
      const succeeded = new Set(results.filter(r => r.success).map(r => Number(r.index)));
      setIngredientCards(prev => prev.map(c => {
        const index = unsavedCards.findIndex(row => row.id === c.id);
        return succeeded.has(index) ? { ...c, isNewItem: false, saved: true } : c;
      }));
      setImportedItems(prev => prev.map(i => {
        const index = unsavedCards.findIndex(row => row.id === i.id);
        return succeeded.has(index) ? { ...i, isNewItem: false, saved: true } : i;
      }));
      const summary = response.data?.summary || {};
      setCatalogImportResult({ summary, results, total: itemsPayload.length });
      if (showToast) showToast(`Import summary: ${summary.total ?? itemsPayload.length} total, ${summary.imported ?? summary.savedCount ?? 0} imported, ${summary.duplicates ?? 0} duplicates skipped, ${summary.failed ?? summary.failedCount ?? 0} failed.`, (summary.failed ?? summary.failedCount ?? 0) ? 'warning' : 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to save items', 'error');
    } finally {
      setBulkSavingCatalog(false);
      setCatalogSaveScope(null);
    }
  };

  // Card B & C Upload & Review State for Add New Ingredient Item
  const [, setImportFile] = useState(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [importedItems, setImportedItems] = useState([]);
  const [bulkSavingCatalog, setBulkSavingCatalog] = useState(false);
  const [catalogSaveScope, setCatalogSaveScope] = useState(null);
  const [catalogImportResult, setCatalogImportResult] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const draftSaveLock = useRef(false);
  const [draftSaveResult, setDraftSaveResult] = useState(null);
  const [pendingAddSaveAction, setPendingAddSaveAction] = useState(null);
  const [activeAddTab, setActiveAddTab] = useState('ALL'); // 'ALL' | 'PRESETS' | 'IMPORT' | 'MANUAL'

  // Multi-Supplier Separate Delivery Cards State (matching Receive Stock architecture)
  const [showMergeChoiceModal, setShowMergeChoiceModal] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);
  const [pendingUploadRows, setPendingUploadRows] = useState(null);

  useEffect(() => {
    if (!focusRequest?.itemId || inventory.length === 0) return;
    const item = inventory.find((entry) => String(entry.id) === String(focusRequest.itemId));
    if (item) {
      setActiveTab('CATALOG');
      if (focusRequest.action === 'restock') {
        setAdjType('CORRECTION');
        setAdjQty('');
        setAdjReason('Restock from Action Alerts');
        setSelectedItemForAdjustment(item);
      } else {
        setSelectedItemForDetails(item);
      }
    } else {
      showToast?.('This inventory item is no longer available.', 'error');
    }
    onFocusHandled?.();
  }, [focusRequest, inventory, onFocusHandled, showToast]);

  // Distinct Auto Ref generator for a specific delivery card
  const generateAutoRefForCard = (cardId) => {
    const dateStr = getTodayCompactDate();
    let randRef;
    let newRef;
    do {
      randRef = Math.floor(1000 + Math.random() * 9000);
      newRef = `RCV-${dateStr}-${randRef}`;
    } while (newRef === newItem.sku || additionalDeliveryCards.some(c => c.id !== cardId && c.receivingRef === newRef));

    setAdditionalDeliveryCards(prev => prev.map(c => c.id === cardId ? { ...c, receivingRef: newRef } : c));
    if (showToast) showToast(`Reference Generated: ${newRef}`, 'info');
  };

  // Distinct Auto Batch generator for a specific delivery card
  const generateAutoBatchForCard = (cardId) => {
    const dateStr = getTodayCompactDate();
    let randBatch;
    let newBatch;
    do {
      randBatch = Math.floor(1000 + Math.random() * 9000);
      newBatch = `BATCH-${dateStr}-${randBatch}`;
    } while (newBatch === newItem.batchNumber || additionalDeliveryCards.some(c => c.id !== cardId && c.batchNumber === newBatch));

    setAdditionalDeliveryCards(prev => prev.map(c => c.id === cardId ? { ...c, batchNumber: newBatch } : c));
    if (showToast) showToast(`Batch Generated: ${newBatch}`, 'info');
  };

  // Distinct Auto Invoice generator for a specific delivery card
  const generateAutoInvoiceForCard = (cardId) => {
    const dateStr = getTodayCompactDate();
    const ms = String(Date.now()).slice(-6);
    const inv = `INV-${dateStr}-${ms}`;
    setAdditionalDeliveryCards(prev => prev.map(c => c.id === cardId ? { ...c, supplierInvoiceNumber: inv } : c));
    if (showToast) showToast(`Invoice # Generated: ${inv}`, 'info');
  };

  // Decision 1: Create Separate Card for [Supplier]
  const handleCreateSeparateCard = () => {
    if (!pendingUploadData) return;
    const dateStr = getTodayCompactDate();

    // 1. Guaranteed distinct Reference Number
    let randRef;
    let newRef;
    do {
      randRef = Math.floor(1000 + Math.random() * 9000);
      newRef = `RCV-${dateStr}-${randRef}`;
    } while (newRef === newItem.sku || additionalDeliveryCards.some(c => c.receivingRef === newRef));

    // 2. Guaranteed distinct Shipment Batch Number
    let randBatch;
    let newBatch;
    do {
      randBatch = Math.floor(1000 + Math.random() * 9000);
      newBatch = `BATCH-${dateStr}-${randBatch}`;
    } while (newBatch === newItem.batchNumber || additionalDeliveryCards.some(c => c.batchNumber === newBatch));

    // 3. Guaranteed distinct Supplier Invoice #
    let newInv = pendingUploadData.invoiceNumber;
    if (!newInv || newInv === newItem.supplierInvoiceNumber || additionalDeliveryCards.some(c => c.supplierInvoiceNumber === newInv)) {
      const ms = String(Date.now() + 5000 + Math.floor(Math.random() * 1000)).slice(-6);
      newInv = `INV-${dateStr}-${ms}`;
    }

    const newCard = {
      id: 'card-' + Date.now(),
      supplierName: pendingUploadData.supplierName || 'Different Supplier',
      supplierId: pendingUploadData.matchedSupplierId || '',
      supplierInvoiceNumber: newInv,
      receivingRef: newRef,
      batchNumber: newBatch,
      discountAmount: parseReceivingDiscountPercent(pendingUploadData.invoiceDiscountPercent) ?? parseReceivingDiscount(pendingUploadData.invoiceDiscount),
      discountMode: parseReceivingDiscountPercent(pendingUploadData.invoiceDiscountPercent) !== null ? 'PERCENT' : 'AMOUNT',
      items: (pendingUploadRows || pendingUploadData.newRows || []).map(r => ({
        ...r,
        batchNumber: newBatch
      }))
    };

    setAdditionalDeliveryCards(prev => [...prev, newCard]);
    setShowMergeChoiceModal(false);
    setPendingUploadData(null);
    setPendingUploadRows(null);

    if (showToast) {
      showToast(
        `Created separate Card for "${pendingUploadData.supplierName}" with independent Ref: ${newRef}, Batch: ${newBatch}, Invoice: ${newInv}!`,
        'success'
      );
    }
  };

  // Add new independent Supplier Delivery Card manually
  const handleAddNewDeliveryCard = () => {
    const dateStr = getTodayCompactDate();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const ms = String(Date.now() + Math.floor(Math.random() * 1000)).slice(-6);
    const cardId = 'card-' + Date.now();
    const newCard = {
      id: cardId,
      supplierName: '',
      supplierId: '',
      supplierInvoiceNumber: `INV-${dateStr}-${ms}`,
      receivingRef: `RCV-${dateStr}-${rand}`,
      batchNumber: `BATCH-${dateStr}-${rand}`,
      discountAmount: 0,
      discountMode: 'AMOUNT',
      items: [
        {
          id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: '',
          originalDescription: '',
          unit: 'KG',
          category: 'General',
          stockLevel: '0',
          quantity: '0',
          costPrice: '0',
          supplierName: '',
          supplierId: '',
          invoiceNumber: `INV-${dateStr}-${ms}`,
          batchNumber: `BATCH-${dateStr}-${rand}`,
          expiryDate: '',
          isNewItem: true,
          saved: false,
          showSuggestions: false
        }
      ]
    };
    setAdditionalDeliveryCards(prev => [...prev, newCard]);
    setActiveTargetCardId(cardId);
    if (showToast) showToast('Created New Supplier Delivery Card! Presets will now be added here.', 'success');
  };

  // Add blank item into an additional delivery card
  const handleAdditionalCardAddItem = (cardId) => {
    const card = additionalDeliveryCards.find(c => c.id === cardId);
    if (!card) return;
    const newItemObj = {
      id: `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: '',
      originalDescription: '',
      unit: 'KG',
      category: 'General',
      stockLevel: '0',
      quantity: '0',
      costPrice: '0',
      supplierName: card.supplierName,
      supplierId: card.supplierId,
      invoiceNumber: card.supplierInvoiceNumber,
      batchNumber: card.batchNumber,
      expiryDate: '',
      isNewItem: true,
      saved: false,
      showSuggestions: false
    };
    setAdditionalDeliveryCards(prev => prev.map(c => {
      if (c.id === cardId) {
        return {
          ...c,
          items: [...(c.items || []), newItemObj]
        };
      }
      return c;
    }));
  };

  // Change field of an item in an additional delivery card
  const handleAdditionalCardItemChange = (cardId, itemId, field, value) => {
    setAdditionalDeliveryCards(prev => prev.map(card => {
      if (card.id !== cardId) return card;
      const updatedItems = (card.items || []).map(item => {
        if (item.id !== itemId) return item;
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'stockLevel') {
          updated.quantity = value;
          updated.stockLevel = value;
        }
        const cardName = (field === 'name' ? value : (item.name || '')).trim().toLowerCase();
        const cardUnit = (field === 'unit' ? value : (item.unit || 'KG')).trim().toLowerCase();
        const exactCatalogItem = inventory.find(i =>
          i.name.toLowerCase().trim() === cardName &&
          (i.unit || 'KG').toLowerCase().trim() === cardUnit
        );
        updated.isNewItem = !exactCatalogItem;
        if (exactCatalogItem) {
          updated.category = exactCatalogItem.category || updated.category;
        }

        if (field === 'name') {
          const val = value.trim().toLowerCase();
          const matched = INGREDIENT_PRESETS.find(p => p.name.toLowerCase().trim() === val);
          if (matched && !item.unit) {
            updated.unit = matched.unit;
            updated.category = matched.category;
          }
        }
        return updated;
      });
      return { ...card, items: updatedItems };
    }));
  };

  // Remove an item from an additional delivery card
  const handleAdditionalCardRemoveItem = (cardId, itemId) => {
    setAdditionalDeliveryCards(prev => prev.map(card => {
      if (card.id !== cardId) return card;
      return {
        ...card,
        items: (card.items || []).filter(i => i.id !== itemId)
      };
    }));
  };

  // Clear all items in an additional delivery card
  const handleAdditionalCardClearAll = (cardId) => {
    setAdditionalDeliveryCards(prev => prev.map(card => {
      if (card.id !== cardId) return card;
      return { ...card, items: [] };
    }));
    if (showToast) showToast('Cleared all items in this delivery card.', 'info');
  };

  // Save single item in an additional delivery card to catalog
  const handleSaveAdditionalCardSingleItem = async (cardId, item) => {
    if (!item.name || !item.name.trim()) {
      if (showToast) showToast('Please enter an ingredient name.', 'error');
      return;
    }
    const card = additionalDeliveryCards.find(c => c.id === cardId);
    try {
      const payload = {
        name: item.name.trim(),
        unit: item.unit || 'KG',
        category: item.category || 'General',
        costPrice: parseFloat(item.costPrice) || 0,
        stockLevel: 0, // IMPORTANT: Save in Catalog creates entry with 0 stock
        minThreshold: 10,
        maxThreshold: 100,
        sku: card?.receivingRef || null,
        supplierId: card?.supplierId ? parseInt(card.supplierId, 10) : null,
        expiryDate: item.expiryDate ? item.expiryDate : null
      };
      await api.post('/inventory', payload);
      setAdditionalDeliveryCards(prev => prev.map(c => {
        if (c.id === cardId) {
          return {
            ...c,
            items: c.items.map(i => i.id === item.id ? { ...i, isNewItem: false, saved: true } : i)
          };
        }
        return c;
      }));
      if (showToast) showToast(`"${item.name}" saved to catalog!`, 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to save item', 'error');
    }
  };

  // Decision 2: Merge into Card #1 Anyway
  const handleMergeAppend = () => {
    const rowsToAdd = pendingUploadRows || pendingUploadData?.newRows || [];
    setImportedItems(prev => {
      const existing = [...prev];
      rowsToAdd.forEach(nr => {
        const dup = existing.find(e => e.name.toLowerCase().trim() === nr.name.toLowerCase().trim() && e.unit === nr.unit);
        if (dup) {
          dup.quantity = (parseFloat(dup.quantity) || 0) + (parseFloat(nr.quantity) || 0);
        } else {
          existing.push(nr);
        }
      });
      return existing;
    });

    const appendCards = mapUploadRowsToIngredientCards(rowsToAdd);
    if (pendingUploadData?.invoiceDiscountPercent != null) setCard1DiscountFromInvoice(pendingUploadData);
    else {
      const mergedDiscount = parseReceivingDiscount(pendingUploadData?.invoiceDiscount);
      if (mergedDiscount) {
        setCard1DiscountMode('AMOUNT');
        setCard1Discount(prev => (Number(prev) || 0) + mergedDiscount);
      }
    }
    setIngredientCards(prev => {
      const nonEmpty = prev.filter(c => c.name.trim() !== '');
      return [...nonEmpty, ...appendCards];
    });

    setShowMergeChoiceModal(false);
    setPendingUploadData(null);
    setPendingUploadRows(null);

    if (showToast) showToast('Merged imported items into Card #1!', 'success');
  };

  // Decision 3: Replace Card #1 with New Scanned Delivery
  const handleMergeReplace = () => {
    const rowsToSet = pendingUploadRows || pendingUploadData?.newRows || [];
    const dateStr = getTodayCompactDate();
    const autoRef = `RCV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    const autoBatch = `BATCH-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    const autoInv = pendingUploadData?.invoiceNumber || `INV-${dateStr}-${String(Date.now()).slice(-6)}`;

    setImportedItems(rowsToSet);
    setCard1DiscountFromInvoice(pendingUploadData);
    const replaceCards = mapUploadRowsToIngredientCards(
      rowsToSet,
      pendingUploadData?.matchedSupplierId,
      autoInv,
      autoRef,
      autoBatch
    );
    setIngredientCards(replaceCards.length > 0 ? replaceCards : [createBlankIngredientCard()]);

    setNewItem(prev => ({
      ...prev,
      sku: autoRef,
      batchNumber: autoBatch,
      supplierInvoiceNumber: autoInv,
      supplierId: pendingUploadData?.matchedSupplierId || prev.supplierId
    }));

    setShowMergeChoiceModal(false);
    setPendingUploadData(null);
    setPendingUploadRows(null);

    if (showToast) showToast('Replaced Card #1 items with new scanned delivery!', 'info');
  };

  // Discard an additional supplier delivery card.
  const handleDiscardDeliveryCard = (cardId) => {
    setAdditionalDeliveryCards(prev => prev.filter(c => c.id !== cardId));
    if (showToast) showToast('Discarded delivery card.', 'info');
  };

  // Process response from preview APIs and detect multiple suppliers/deliveries
  const processUploadResponse = (resData, fileName, ext, dataUrl = null) => {
    const matched = resData?.matchedItems || [];
    const unmatched = resData?.unmatchedItems || [];
    const detectedSupplier = (resData?.supplierName || resData?.detectedSupplierName || '').trim();
    const detectedInvoiceNumber = (resData?.invoiceNumber || '').trim();
    const dateStr = getTodayCompactDate();

    const matchedSup = suppliersList.find(s =>
      detectedSupplier && (
        s.name.toLowerCase().trim() === detectedSupplier.toLowerCase().trim() ||
        s.name.toLowerCase().includes(detectedSupplier.toLowerCase()) ||
        detectedSupplier.toLowerCase().includes(s.name.toLowerCase())
      )
    );

    const combined = [];
    matched.forEach((it, idx) => {
      combined.push({
        id: `matched_${idx}_${Date.now()}`,
        originalDescription: it.rawName || it.name || it.matchedName,
        name: it.matchedName || it.name,
        catalogMatchId: it.inventoryItemId || null,
        catalogMatchName: it.matchedName || it.name,
        isNewItem: false,
        category: it.category || inferCategoryFromItemName(it.matchedName || it.name),
        quantity: parseFloat(it.quantity) || 0,
        unit: (it.unit || it.systemUnit || 'KG').toUpperCase(),
        costPrice: parseFloat(it.unitCost) || 0,
        supplierName: it.supplierName || detectedSupplier || null,
        invoiceNumber: it.invoiceNumber || detectedInvoiceNumber || null,
        confidence: 'Catalog Match (High)',
        needsReview: false,
        saved: true
      });
    });

    unmatched.forEach((it, idx) => {
      combined.push({
        id: `new_${idx}_${Date.now()}`,
        originalDescription: it.rawName || it.name,
        name: it.name || it.rawName,
        catalogMatchId: null,
        catalogMatchName: null,
        isNewItem: true,
        category: it.category || inferCategoryFromItemName(it.name || it.rawName),
        quantity: parseFloat(it.quantity) || 0,
        unit: (it.unit || 'KG').toUpperCase(),
        costPrice: parseFloat(it.unitCost) || 0,
        supplierName: it.supplierName || detectedSupplier || null,
        invoiceNumber: it.invoiceNumber || detectedInvoiceNumber || null,
        confidence: it.suggestedItem ? 'Ambiguity Warning (Needs Confirmation)' : 'NEW ITEM (Not in Catalog)',
        needsReview: !!it.suggestedItem,
        saved: false
      });
    });

    // Check if the uploaded file itself contains items from multiple suppliers
    const distinctSuppliers = [...new Set(combined.map(i => i.supplierName).filter(Boolean))];
    const hasMultipleSuppliersInFile = distinctSuppliers.length > 1;

    // Check if the uploaded file contains multiple distinct invoices
    const distinctInvoices = [...new Set(combined.map(i => i.invoiceNumber).filter(Boolean))];
    const hasMultipleInvoicesInFile = distinctInvoices.length > 1;

    // Check if Card #1 currently has existing user-entered items
    const currentCard1Supplier = suppliersList.find(s => String(s.id) === String(newItem.supplierId));
    const currentCard1SupplierName = (currentCard1Supplier?.name || '').trim();
    const hasExistingCard1Items = ingredientCards.some(c => (c.name || '').trim().length > 0) && importedItems.length > 0;

    if (hasMultipleSuppliersInFile) {
      // Split items by supplier: Supplier 1 goes to Card #1, Supplier 2 goes to modal / Card #2
      const firstSupplier = distinctSuppliers[0];
      const otherSuppliers = distinctSuppliers.slice(1);

      const firstGroup = combined.filter(i => (i.supplierName || firstSupplier) === firstSupplier);
      const secondGroup = combined.filter(i => otherSuppliers.includes(i.supplierName));
      // A single detected discount is assigned to the first supplier card only, avoiding double application.
      setCard1DiscountFromInvoice(resData);

      const autoRef1 = `RCV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const autoBatch1 = `BATCH-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const autoInv1 = firstGroup[0]?.invoiceNumber || detectedInvoiceNumber || `INV-${dateStr}-${String(Date.now()).slice(-6)}`;

      setImportedItems(firstGroup);
      const firstSupObj = suppliersList.find(s => s.name.toLowerCase().includes(firstSupplier.toLowerCase()));
      const firstGroupCards = mapUploadRowsToIngredientCards(
        firstGroup,
        firstSupObj ? String(firstSupObj.id) : '',
        autoInv1,
        autoRef1,
        autoBatch1
      );
      setIngredientCards(firstGroupCards);

      setNewItem(prev => ({
        ...prev,
        sku: autoRef1,
        batchNumber: autoBatch1,
        supplierInvoiceNumber: autoInv1,
        ...(firstSupObj ? { supplierId: String(firstSupObj.id) } : {})
      }));

      const secondSupplierName = otherSuppliers[0];
      const matchedSecondSup = suppliersList.find(s => s.name.toLowerCase().includes(secondSupplierName.toLowerCase()));

      setPendingUploadData({
        supplierName: secondSupplierName,
        matchedSupplierId: matchedSecondSup ? String(matchedSecondSup.id) : '',
        invoiceNumber: secondGroup[0]?.invoiceNumber || `INV-${dateStr}-${String(Date.now()).slice(-6)}`,
        rawInvoiceNumber: secondGroup[0]?.invoiceNumber || '',
        estimatedTotal: secondGroup.reduce((acc, i) => acc + (i.quantity * i.costPrice), 0),
        invoiceDiscount: 0,
        newRows: secondGroup,
        dataUrl,
        fileName,
        mimeType: ext === 'csv' ? 'text/csv' : 'application/pdf',
        isSameSupplier: false,
        currentSupplierName: firstSupplier
      });
      setPendingUploadRows(secondGroup);
      setShowMergeChoiceModal(true);

      if (showToast) {
        showToast(`Document contains multiple suppliers! "${firstSupplier}" loaded into Card #1; review separation for "${secondSupplierName}".`, 'warning');
      }
    } else if (hasMultipleInvoicesInFile) {
      // Same supplier, two different invoices: separate groups
      const firstInvoice = distinctInvoices[0];
      const secondInvoice = distinctInvoices[1];
      const firstGroup = combined.filter(i => (i.invoiceNumber || firstInvoice) === firstInvoice);
      const secondGroup = combined.filter(i => i.invoiceNumber === secondInvoice);
      // The OCR response exposes one invoice discount, so apply it to the first invoice card only.
      setCard1DiscountFromInvoice(resData);

      const autoRef1 = `RCV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const autoBatch1 = `BATCH-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const autoInv1 = firstInvoice || `INV-${dateStr}-${String(Date.now()).slice(-6)}`;

      setImportedItems(firstGroup);
      const firstGroupCards = mapUploadRowsToIngredientCards(
        firstGroup,
        matchedSup ? String(matchedSup.id) : '',
        autoInv1,
        autoRef1,
        autoBatch1
      );
      setIngredientCards(firstGroupCards);

      setNewItem(prev => ({
        ...prev,
        sku: autoRef1,
        batchNumber: autoBatch1,
        supplierInvoiceNumber: autoInv1,
        ...(matchedSup ? { supplierId: String(matchedSup.id) } : {})
      }));

      setPendingUploadData({
        supplierName: detectedSupplier || matchedSup?.name || 'Same Supplier',
        matchedSupplierId: matchedSup ? String(matchedSup.id) : '',
        invoiceNumber: secondInvoice,
        rawInvoiceNumber: secondInvoice,
        estimatedTotal: secondGroup.reduce((acc, i) => acc + (i.quantity * i.costPrice), 0),
        invoiceDiscount: 0,
        newRows: secondGroup,
        dataUrl,
        fileName,
        mimeType: ext === 'csv' ? 'text/csv' : 'application/pdf',
        isSameSupplier: true,
        currentSupplierName: `${detectedSupplier || 'Supplier'} (Invoice #${firstInvoice})`
      });
      setPendingUploadRows(secondGroup);
      setShowMergeChoiceModal(true);

      if (showToast) {
        showToast(`Multiple invoices detected from "${detectedSupplier || 'Supplier'}"! Invoice #${firstInvoice} loaded into Card #1; review separation for Invoice #${secondInvoice}.`, 'warning');
      }
    } else if (hasExistingCard1Items) {
      // Compare current Card #1 supplier vs new upload supplier
      const newSupName = (detectedSupplier || matchedSup?.name || '').trim();
      let isSame = false;
      if (currentCard1SupplierName && newSupName) {
        isSame = currentCard1SupplierName.toLowerCase().includes(newSupName.toLowerCase()) ||
                 newSupName.toLowerCase().includes(currentCard1SupplierName.toLowerCase());
      } else if (!currentCard1SupplierName && !newSupName) {
        isSame = true;
      }

      setPendingUploadData({
        supplierName: detectedSupplier || 'Scanned Delivery',
        matchedSupplierId: matchedSup ? String(matchedSup.id) : '',
        invoiceNumber: detectedInvoiceNumber || `INV-${dateStr}-${String(Date.now()).slice(-6)}`,
        rawInvoiceNumber: detectedInvoiceNumber || '',
        estimatedTotal: combined.reduce((acc, i) => acc + (i.quantity * i.costPrice), 0),
        invoiceDiscount: parseReceivingDiscount(resData?.invoiceDiscount),
        invoiceDiscountPercent: resData?.invoiceDiscountPercent ?? null,
        newRows: combined,
        dataUrl,
        fileName,
        mimeType: ext === 'csv' ? 'text/csv' : 'application/pdf',
        isSameSupplier: isSame,
        currentSupplierName: currentCard1SupplierName || 'Current Receiving (Card #1)'
      });
      setPendingUploadRows(combined);
      setShowMergeChoiceModal(true);
    } else {
      // Card #1: populate directly and auto-generate the three identifiers (Internal Reference, Shipment Batch, Supplier Invoice)
      const autoRef = `RCV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const autoBatch = `BATCH-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      const autoInv = detectedInvoiceNumber || `INV-${dateStr}-${String(Date.now()).slice(-6)}`;

      setImportedItems(combined);
      setCard1DiscountFromInvoice(resData);
      const combinedCards = mapUploadRowsToIngredientCards(
        combined,
        matchedSup ? String(matchedSup.id) : '',
        autoInv,
        autoRef,
        autoBatch
      );
      setIngredientCards(combinedCards);

      setNewItem(prev => ({
        ...prev,
        sku: autoRef,
        batchNumber: autoBatch,
        supplierInvoiceNumber: autoInv,
        ...(matchedSup ? { supplierId: String(matchedSup.id) } : {})
      }));

      const newCount = combined.filter(i => i.isNewItem).length;
      if (showToast) {
        showToast(`Loaded ${combined.length} items (${newCount} new to catalog)${detectedSupplier ? ` from "${detectedSupplier}"` : ''}. Auto-generated Ref: ${autoRef}, Batch: ${autoBatch}, Invoice: ${autoInv}.`, 'success');
      }
    }
  };

  // File Upload Handler (Excel, CSV, Image, PDF)
  const handleFileUploadForAddItem = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setUploadError(null);
    setIsUploadingFile(true);
    setUploadProgress('Reading file...');

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const isExcelOrCsv = ['xlsx', 'xls', 'csv'].includes(ext);
      const isImageOrPdf = ['jpg', 'jpeg', 'png', 'pdf'].includes(ext);

      if (!isExcelOrCsv && !isImageOrPdf) {
        throw new Error('Unsupported format. Please upload Excel (.xlsx, .xls), CSV, or Image/PDF invoice.');
      }

      const reader = new FileReader();

      if (isExcelOrCsv) {
        setUploadProgress('Parsing spreadsheet rows & detecting suppliers...');
        reader.onload = async (event) => {
          try {
            const payload = ext === 'csv'
              ? { rawText: event.target.result, fileName: file.name }
              : { fileBase64: event.target.result, fileName: file.name };

            const res = await api.post('/inventory/receivings/import/preview', payload, {
              timeout: 120000
            });
            processUploadResponse(res.data, file.name, ext, null);
            setIsUploadingFile(false);
            setUploadProgress('');
          } catch (err) {
            console.error('Import parse error:', err);
            const msg = err.response?.data?.error || (err.code === 'ECONNABORTED' ? 'Upload timed out. Please try a smaller file or retry.' : err.message) || 'Failed to parse file.';
            setUploadError(msg);
            setIsUploadingFile(false);
          }
        };

        if (ext === 'csv') reader.readAsText(file);
        else reader.readAsDataURL(file);
      } else {
        // Image or PDF OCR
        setUploadProgress('Extracting invoice via AI & OCR vision...');
        reader.onload = async (event) => {
          try {
            const res = await api.post('/inventory/receivings/ocr-preview', {
              fileBase64: event.target.result,
              fileName: file.name
            }, {
              timeout: 120000
            });
            processUploadResponse(res.data, file.name, ext, event.target.result);
            setIsUploadingFile(false);
            setUploadProgress('');
          } catch (err) {
            console.error('OCR preview error:', err);
            const msg = err.response?.data?.error || (err.code === 'ECONNABORTED' ? 'Invoice processing timed out. Please retry.' : (err.message === 'Network Error' ? 'Network error: could not connect to server or payload was too large. Please retry.' : err.message)) || 'Failed to extract items from invoice.';
            setUploadError(msg);
            setIsUploadingFile(false);
          }
        };

        reader.readAsDataURL(file);
      }
    } catch (err) {
      setUploadError(err.message);
      setIsUploadingFile(false);
    }
  };

  // Single Item Save to Catalog (Creates record with 0 stock, no stock receipt)


  // Save All New Items in Catalog for Card #1


  // Save All New Items in Catalog for a specific Additional Delivery Card
  const handleSaveDeliveryCardToCatalog = async (cardId) => {
    const card = additionalDeliveryCards.find(c => c.id === cardId);
    if (!card) return;
    const unsavedNew = (card.items || []).filter(i => i.name && i.name.trim() && !i.saved);
    if (unsavedNew.length === 0) {
      if (showToast) showToast(`No unsaved new items for this delivery card.`, 'info');
      return;
    }
    setBulkSavingCatalog(true);
    setCatalogSaveScope(cardId);
    try {
      const itemsPayload = unsavedNew.map((i, rowIndex) => ({
        rowIndex,
        name: i.name.trim(),
        unit: i.unit || 'KG',
        category: i.category || 'General',
        costPrice: parseFloat(i.costPrice) || 0,
        // Catalog creation must not post received quantity to stock.
        stockLevel: 0,
        minThreshold: 10,
        maxThreshold: 100,
        sku: card.receivingRef || null,
        supplierId: card.supplierId ? parseInt(card.supplierId, 10) : null,
        expiryDate: i.expiryDate ? i.expiryDate : null
      }));
      const response = await api.post('/inventory/bulk', { items: itemsPayload });
      const results = response.data?.results || [];
      const succeeded = new Set(results.filter(r => r.success).map(r => Number(r.index)));
      setAdditionalDeliveryCards(prev => prev.map(c => {
        if (c.id === cardId) {
          return {
            ...c,
            items: c.items.map(i => {
              const index = unsavedNew.findIndex(row => row.id === i.id);
              return succeeded.has(index) ? { ...i, isNewItem: false, saved: true, catalogMatchName: i.name } : i;
            })
          };
        }
        return c;
      }));
      const summary = response.data?.summary || {};
      setCatalogImportResult({ summary, results, total: itemsPayload.length });
      if (showToast) showToast(`Import summary: ${summary.total ?? itemsPayload.length} total, ${summary.imported ?? summary.savedCount ?? 0} imported, ${summary.duplicates ?? 0} duplicates skipped, ${summary.failed ?? summary.failedCount ?? 0} failed.`, (summary.failed ?? summary.failedCount ?? 0) ? 'warning' : 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to save card items', 'error');
    } finally {
      setBulkSavingCatalog(false);
      setCatalogSaveScope(null);
    }
  };

  // Save All Deliveries in Catalog (Card 1 + all additional delivery cards)
  const handleSaveAllDeliveriesToCatalog = async () => {
    const allUnsaved = [];

    // Pull from ingredientCards or importedItems
    const card1Unsaved = ingredientCards.length > 0
      ? ingredientCards.filter(c => c.name && c.name.trim() && !c.saved)
      : importedItems.filter(i => i.isNewItem && !i.saved);

    card1Unsaved.forEach(i => {
      allUnsaved.push({
        name: i.name.trim(),
        unit: i.unit || 'KG',
        category: i.category || 'General',
        costPrice: parseFloat(i.costPrice) || 0,
        stockLevel: 0, // IMPORTANT: Catalog entries are saved with 0 stock
        minThreshold: parseFloat(i.minThreshold) || 10,
        maxThreshold: parseFloat(i.maxThreshold) || 100,
        sku: newItem.sku || null,
        supplierId: i.supplierId ? parseInt(i.supplierId, 10) : (newItem.supplierId ? parseInt(newItem.supplierId, 10) : null),
        supplierName: i.supplierName || newItem.supplierName || suppliersList.find(s => String(s.id) === String(i.supplierId || newItem.supplierId))?.name || null,
        expiryDate: i.expiryDate ? i.expiryDate : null
      });
    });

    additionalDeliveryCards.forEach(card => {
      (card.items || []).filter(i => i.name && i.name.trim() && !i.saved).forEach(i => {
        allUnsaved.push({
          name: i.name.trim(),
          unit: i.unit || 'KG',
          category: i.category || 'General',
          costPrice: parseFloat(i.costPrice) || 0,
          stockLevel: 0, // IMPORTANT: Catalog entries are saved with 0 stock
          minThreshold: 10,
          maxThreshold: 100,
          sku: card.receivingRef || null,
          supplierId: card.supplierId ? parseInt(card.supplierId, 10) : null,
          supplierName: i.supplierName || card.supplierName || suppliersList.find(s => String(s.id) === String(card.supplierId))?.name || null,
          expiryDate: i.expiryDate ? i.expiryDate : null
        });
      });
    });

    if (allUnsaved.length === 0) {
      if (showToast) showToast('All items across all deliveries are already saved in the catalog.', 'info');
      return;
    }

    setBulkSavingCatalog(true);
    setCatalogSaveScope('all');
    try {
      const response = await api.post('/inventory/bulk', { items: allUnsaved.map((item, rowIndex) => ({ ...item, rowIndex })) });
      const results = response.data?.results || [];
      const savedNames = new Set(results.filter(r => r.success).map(r => String(r.name || '').toLowerCase().trim()));
      setIngredientCards(prev => prev.map(c => savedNames.has(String(c.name || '').toLowerCase().trim()) ? { ...c, isNewItem: false, saved: true } : c));
      setImportedItems(prev => prev.map(i => savedNames.has(String(i.name || '').toLowerCase().trim()) ? { ...i, isNewItem: false, saved: true } : i));
      setAdditionalDeliveryCards(prev => prev.map(c => ({ ...c, items: c.items.map(i => savedNames.has(String(i.name || '').toLowerCase().trim()) ? { ...i, isNewItem: false, saved: true } : i) })));
      const summary = response.data?.summary || {};
      setCatalogImportResult({ summary, results, total: allUnsaved.length });
      if (showToast) showToast(`Import summary: ${summary.total ?? allUnsaved.length} total, ${summary.imported ?? summary.savedCount ?? 0} imported, ${summary.duplicates ?? 0} duplicates skipped, ${summary.failed ?? summary.failedCount ?? 0} failed.`, (summary.failed ?? summary.failedCount ?? 0) ? 'warning' : 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to save all items', 'error');
    } finally {
      setBulkSavingCatalog(false);
      setCatalogSaveScope(null);
    }
  };

  // Save Draft (supplier-wise) from Add Ingredient modal → /inventory/receivings DRAFT
  // Draft save does NOT add items to catalog immediately.
  // Known catalog items go in `items[]`; truly new items go in `draftNewItems[]`.
  // New items are materialized into catalog+stock only when confirmed from Receiving History.
  const handleSaveDraftFromAddForm = async () => {
    if (draftSaveLock.current || savingDraft || bulkSavingCatalog) return;
    const invalidPrimaryItem = ingredientCards.find(item => item.name?.trim() && !(Number.parseFloat(item.stockLevel) > 0));
    const invalidAdditional = additionalDeliveryCards.map((card, index) => ({
      card,
      cardNumber: index + 2,
      item: (card.items || []).find(entry => entry.name?.trim() && !(Number.parseFloat(entry.stockLevel ?? entry.quantity) > 0))
    })).find(entry => entry.item);
    if (invalidPrimaryItem || invalidAdditional) {
      const label = invalidPrimaryItem ? `Card #1 item “${invalidPrimaryItem.name.trim()}”` : `Card #${invalidAdditional.cardNumber} item “${invalidAdditional.item.name.trim()}”`;
      const message = `${label} needs a quantity greater than zero. No supplier drafts were saved; correct the quantity and try again.`;
      setDraftSaveResult({ success: false, message });
      showToast?.(message, 'error');
      return;
    }
    draftSaveLock.current = true;
    setSavingDraft(true);
    let draftCount = 0;
    let draftAttempts = 0;
    try {
      // ──────────────────────────────────────────────── Step 1: Fetch existing inventory to resolve IDs ────────────────────────────────────────────────
      const invRes = await api.get('/inventory');
      const freshInventory = invRes.data?.items || invRes.data || [];
      const findId = (name) => {
        const match = freshInventory.find(i => i.name.toLowerCase().trim() === (name || '').toLowerCase().trim());
        return match?.id || null;
      };

      // ──────────────────────────────────────────────── Step 2: Card #1 draft ────────────────────────────────────────────────
      const card1ValidItems = ingredientCards.filter(c => c.name && c.name.trim());
      if (card1ValidItems.length > 0) {
        const card1KnownItems = [];
        const card1NewItems = [];
        card1ValidItems.forEach(c => {
          const id = findId(c.name);
          const qty = parseFloat(c.stockLevel) || 0;
          if (id && qty > 0) {
            card1KnownItems.push({
              inventoryItemId: id,
              quantity: qty,
              unit: c.unit || 'KG',
              unitCost: parseFloat(c.costPrice) || 0,
              batchNumber: newItem.batchNumber?.trim() || null,
              expiryDate: c.expiryDate || null,
              notes: null
            });
          } else if (!id && qty > 0) {
            card1NewItems.push({
              name: c.name.trim(),
              quantity: qty,
              unit: c.unit || 'KG',
              costPrice: parseFloat(c.costPrice) || 0,
              category: c.category || 'General',
              expiryDate: c.expiryDate || null,
              batchNumber: newItem.batchNumber?.trim() || null,
            });
          }
        });

        if (card1KnownItems.length > 0 || card1NewItems.length > 0) {
          draftAttempts++;
          await api.post('/inventory/receivings', {
            supplierId: newItem.supplierId ? parseInt(newItem.supplierId, 10) : null,
            supplierName: (newItem.supplierName || '').trim() || suppliersList.find(s => String(s.id) === String(newItem.supplierId))?.name || null,
            receivingRef: newItem.sku?.trim() || '',
            invoiceNumber: newItem.supplierInvoiceNumber?.trim() || null,
            batchNumber: newItem.batchNumber?.trim() || null,
            receivingDate: newItem.receivingDate || new Date().toISOString().slice(0, 10),
            notes: null,
            status: 'DRAFT',
            discount: calculateCardDiscount(sumInventorySubtotals(card1ValidItems), card1Discount, card1DiscountMode),
            discountPercent: card1DiscountMode === 'PERCENT' ? Number(card1Discount) || 0 : null,
            items: card1KnownItems,
            draftNewItems: card1NewItems
          });
          draftCount++;
        }
      }

      // ──────────────────────────────────────────────── Step 3: Additional delivery card drafts ────────────────────────────────────────────────
      for (const card of additionalDeliveryCards) {
        const cardKnownItems = [];
        const cardNewItems = [];
        (card.items || []).filter(i => i.name && i.name.trim()).forEach(i => {
          const id = findId(i.name);
          const qty = parseFloat(i.stockLevel ?? i.quantity) || 0;
          if (id && qty > 0) {
            cardKnownItems.push({
              inventoryItemId: id,
              quantity: qty,
              unit: i.unit || 'KG',
              unitCost: parseFloat(i.costPrice) || 0,
              batchNumber: card.batchNumber?.trim() || null,
              expiryDate: i.expiryDate || null,
              notes: null
            });
          } else if (!id && qty > 0) {
            cardNewItems.push({
              name: i.name.trim(),
              quantity: qty,
              unit: i.unit || 'KG',
              costPrice: parseFloat(i.costPrice) || 0,
              category: i.category || 'General',
              expiryDate: i.expiryDate || null,
              batchNumber: card.batchNumber?.trim() || null,
            });
          }
        });

        if (cardKnownItems.length > 0 || cardNewItems.length > 0) {
          draftAttempts++;
          await api.post('/inventory/receivings', {
            supplierId: card.supplierId ? parseInt(card.supplierId, 10) : null,
            supplierName: (card.supplierName || '').trim() || suppliersList.find(s => String(s.id) === String(card.supplierId))?.name || null,
            receivingRef: card.receivingRef?.trim() || '',
            invoiceNumber: card.supplierInvoiceNumber?.trim() || null,
            batchNumber: card.batchNumber?.trim() || null,
            receivingDate: card.receivingDate || new Date().toISOString().slice(0, 10),
            notes: null,
            status: 'DRAFT',
            discount: calculateCardDiscount(sumInventorySubtotals(card.items || []), card.discountAmount, card.discountMode),
            discountPercent: card.discountMode === 'PERCENT' ? Number(card.discountAmount) || 0 : null,
            items: cardKnownItems,
            draftNewItems: cardNewItems
          });
          draftCount++;
        }
      }

      if (draftCount > 0) {
        setDraftSaveResult({ success: true, message: `Saved ${draftCount} supplier draft${draftCount === 1 ? '' : 's'}. Stock has not changed.` });
        // Clear the current entry form only after every draft request has succeeded.
        setIngredientCards([createBlankIngredientCard()]);
        setAdditionalDeliveryCards([]);
        setImportedItems([]);
        setCard1Discount(0);
        setCard1DiscountMode('AMOUNT');
        setActiveTargetCardId('card-1');
        setNewItem({
          name: '',
          unit: 'KG',
          category: 'General',
          minThreshold: '10',
          maxThreshold: '100',
          costPrice: '0',
          stockLevel: '0',
          supplierId: '',
          sku: '',
          batchNumber: '',
          supplierInvoiceNumber: '',
          expiryDate: '',
          notes: '',
        });
        setQuickPickSearch('');
        setShowAddItemModal(false);
        if (showToast) showToast(
          `Saved ${draftCount} draft receiving${draftCount > 1 ? 's' : ''} successfully! New items will be added to catalog when confirmed.`,
          'success'
        );
        fetchReceivings();
      } else {
        setDraftSaveResult({ success: false, message: 'No items with a valid name and quantity were found. Your entries are still available to edit.' });
        if (showToast) showToast('No items with valid quantities found to save as draft.', 'warning');
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      const reason = err.response?.data?.error || 'Draft could not be saved.';
      if (draftCount > 0) {
        if (onRefresh) onRefresh();
        fetchReceivings();
      }
      setDraftSaveResult({ success: false, message: draftCount > 0
        ? `${draftCount} of ${draftAttempts} supplier drafts were saved. Stock was not changed. Remaining form data is kept. Failure: ${reason}`
        : `${reason} Your entered data has been kept.` });
      if (showToast) showToast(err.response?.data?.error || 'Failed to save draft. Please try again.', 'error');
    } finally {
      draftSaveLock.current = false;
      setSavingDraft(false);
    }
  };

  const confirmAddSaveAction = () => {
    const { action, cardId = null } = pendingAddSaveAction || {};
    setPendingAddSaveAction(null);
    if (action === 'DRAFT') {
      if (cardId) handleSaveDraftSingleCard(cardId);
      else handleSaveDraftFromAddForm();
      return;
    }
    if (cardId === 'card-1') {
      handleSaveAllIngredientCardsToCatalog();
      return;
    }
    if (cardId) {
      handleSaveDeliveryCardToCatalog(cardId);
      return;
    }
    if (additionalDeliveryCards.length > 0) {
      handleSaveAllDeliveriesToCatalog();
    } else {
      handleSaveAllIngredientCardsToCatalog();
    }
  };

  // Save Draft for a SINGLE supplier card (Card #1 or any additional card)
  // Known catalog items → items[]; new/unsaved items → draftNewItems[] (deferred to confirm).
  const handleSaveDraftSingleCard = async (cardId) => {
    if (draftSaveLock.current || savingDraft || bulkSavingCatalog) return;
    const isCard1 = cardId === 'card-1';
    const card = isCard1 ? null : additionalDeliveryCards.find(c => c.id === cardId);
    const rawItems = isCard1 ? ingredientCards : (card?.items || []);
    const invalidItem = rawItems.find(item => item.name?.trim() && !(Number.parseFloat(item.stockLevel ?? item.quantity) > 0));
    if (invalidItem) {
      const cardLabel = isCard1 ? 'Card #1' : `Card #${additionalDeliveryCards.findIndex(c => c.id === cardId) + 2}`;
      const message = `${cardLabel} item “${invalidItem.name.trim()}” needs a quantity greater than zero. This draft was not saved.`;
      setDraftSaveResult({ success: false, message });
      showToast?.(message, 'error');
      return;
    }
    draftSaveLock.current = true;
    setSavingDraft(true);
    try {
      const namedItems = rawItems.filter(i => i.name && i.name.trim());

      // Fetch existing inventory to resolve IDs
      const invRes = await api.get('/inventory');
      const freshInventory = invRes.data?.items || invRes.data || [];
      const findId = (name) => {
        const match = freshInventory.find(i => i.name.toLowerCase().trim() === (name || '').toLowerCase().trim());
        return match?.id || null;
      };

      const knownItems = [];
      const newItems = [];
      const batchNum = isCard1 ? (newItem.batchNumber?.trim() || null) : (card?.batchNumber?.trim() || null);

      namedItems.forEach(i => {
        const id = findId(i.name);
        const qty = parseFloat(i.stockLevel ?? i.quantity) || 0;
        if (id && qty > 0) {
          knownItems.push({
            inventoryItemId: id,
            quantity: qty,
            unit: i.unit || 'KG',
            unitCost: parseFloat(i.costPrice) || 0,
            batchNumber: batchNum,
            expiryDate: i.expiryDate || null,
            notes: null
          });
        } else if (!id && qty > 0) {
          newItems.push({
            name: i.name.trim(),
            quantity: qty,
            unit: i.unit || 'KG',
            costPrice: parseFloat(i.costPrice) || 0,
            category: i.category || 'General',
            expiryDate: i.expiryDate || null,
            batchNumber: batchNum,
          });
        }
      });

      if (knownItems.length === 0 && newItems.length === 0) {
        if (showToast) showToast('No items with valid quantities found to save as draft.', 'warning');
        return;
      }

      await api.post('/inventory/receivings', {
        supplierId: isCard1
          ? (newItem.supplierId ? parseInt(newItem.supplierId, 10) : null)
          : (card?.supplierId ? parseInt(card.supplierId, 10) : null),
        receivingRef: isCard1 ? (newItem.sku?.trim() || '') : (card?.receivingRef?.trim() || ''),
        invoiceNumber: isCard1
          ? (newItem.supplierInvoiceNumber?.trim() || null)
          : (card?.supplierInvoiceNumber?.trim() || null),
        batchNumber: batchNum,
        receivingDate: isCard1
          ? (newItem.receivingDate || new Date().toISOString().slice(0, 10))
          : (card?.receivingDate || new Date().toISOString().slice(0, 10)),
        notes: null,
        status: 'DRAFT',
        discount: isCard1
          ? calculateCardDiscount(sumInventorySubtotals(rawItems), card1Discount, card1DiscountMode)
          : calculateCardDiscount(sumInventorySubtotals(rawItems), card?.discountAmount, card?.discountMode),
        discountPercent: isCard1
          ? (card1DiscountMode === 'PERCENT' ? Number(card1Discount) || 0 : null)
          : (card?.discountMode === 'PERCENT' ? Number(card.discountAmount) || 0 : null),
        items: knownItems,
        draftNewItems: newItems
      });

      const cardLabel = isCard1 ? 'Card #1' : `Card #${additionalDeliveryCards.findIndex(c => c.id === cardId) + 2}`;
      if (showToast) showToast(
        `Draft saved for ${cardLabel} successfully! New items will be added to catalog when confirmed.`,
        'success'
      );
      setDraftSaveResult({ success: true, message: `Draft saved for ${cardLabel}. Stock has not changed.` });
      if (onRefresh) onRefresh();
    } catch (err) {
      setDraftSaveResult({ success: false, message: err.response?.data?.error || 'Draft could not be saved. Your entered data has been kept.' });
      if (showToast) showToast(err.response?.data?.error || 'Failed to save draft. Please try again.', 'error');
    } finally {
      draftSaveLock.current = false;
      setSavingDraft(false);
    }
  };

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await api.get('/inventory/suppliers');
      if (res.data?.suppliers) setSuppliersList(res.data.suppliers);
    } catch (err) {
      console.warn('Fetch suppliers error:', err.message);
    }
  }, []);

  const fetchReceivings = useCallback(async () => {
    try {
      const res = await api.get('/inventory/receivings');
      if (res.data?.receivings) setReceivingsList(res.data.receivings);
    } catch (err) {
      console.warn('Fetch receivings error:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
    fetchReceivings();
  }, [fetchReceivings, fetchSuppliers]);

  useEffect(() => {
    if (activeTab === 'STOCK_IN') setHasVisitedReceiving(true);
  }, [activeTab]);

  // Compute status & stats for all items in inventory
  const stockList = useMemo(() => {
    return inventory.map((item) => {
      const stock = parseFloat(item.stockLevel) || 0;
      const min = parseFloat(item.minThreshold) || 10;

      let status = 'NORMAL';
      if (stock <= min) {
        status = 'LOW';
      } else if (stock >= min * 3) {
        status = 'OVERSTOCK';
      }

      return { ...item, status };
    });
  }, [inventory]);

  // Status Summary Counts
  const statusCounts = useMemo(() => {
    let total = stockList.length;
    let low = 0;
    let normal = 0;
    let overstock = 0;

    for (const item of stockList) {
      if (item.status === 'LOW') low++;
      else if (item.status === 'OVERSTOCK') overstock++;
      else normal++;
    }

    return { total, low, normal, overstock };
  }, [stockList]);

  // Filtered & Sorted Stock List
  const filteredAndSortedStock = useMemo(() => {
    let result = stockList.filter((item) => {
      const q = searchTerm.toLowerCase().trim();
      const nameMatch = item.name.toLowerCase().includes(q);
      const catMatch = (item.category || '').toLowerCase().includes(q);
      const supMatch = (item.supplier?.name || '').toLowerCase().includes(q);
      const unitMatch = (item.unit || '').toLowerCase().includes(q);

      const matchesSearch = !q || nameMatch || catMatch || supMatch || unitMatch;
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      const matchesSupplier = supplierFilter === 'ALL' || String(item.supplierId) === String(supplierFilter);
      const matchesUnit = unitFilter === 'ALL' || item.unit === unitFilter;

      return matchesSearch && matchesStatus && matchesCategory && matchesSupplier && matchesUnit;
    });

    // Apply Sorting
    result.sort((a, b) => {
      if (sortBy === 'NAME_ASC') return a.name.localeCompare(b.name);
      if (sortBy === 'NAME_DESC') return b.name.localeCompare(a.name);
      if (sortBy === 'LOW_STOCK_FIRST') {
        const order = { LOW: 1, NORMAL: 2, OVERSTOCK: 3 };
        return (order[a.status] || 2) - (order[b.status] || 2);
      }
      if (sortBy === 'OVERSTOCK_FIRST') {
        const order = { OVERSTOCK: 1, NORMAL: 2, LOW: 3 };
        return (order[a.status] || 2) - (order[b.status] || 2);
      }
      if (sortBy === 'STOCK_LOW_TO_HIGH') return a.stockLevel - b.stockLevel;
      if (sortBy === 'STOCK_HIGH_TO_LOW') return b.stockLevel - a.stockLevel;
      if (sortBy === 'COST_HIGH_TO_LOW') return (b.costPrice || 0) - (a.costPrice || 0);
      if (sortBy === 'RECENTLY_UPDATED') return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      return 0;
    });

    return result;
  }, [stockList, searchTerm, statusFilter, categoryFilter, supplierFilter, unitFilter, sortBy]);

  // Paginated Catalog Items
  const paginatedStock = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedStock.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedStock, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedStock.length / itemsPerPage) || 1;

  // Clear all filters
  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setSupplierFilter('ALL');
    setUnitFilter('ALL');
    setSortBy('NAME_ASC');
    setCurrentPage(1);
  };



  const handleUpdateItem = async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const payload = {
        name: editingItem.name,
        unit: editingItem.unit,
        category: editingItem.category,
        minThreshold: parseFloat(editingItem.minThreshold) || 10,
        maxThreshold: parseFloat(editingItem.maxThreshold) || 100,
        costPrice: parseFloat(editingItem.costPrice) || 0,
        sku: editingItem.sku || null,
        supplierId: editingItem.supplierId ? parseInt(editingItem.supplierId, 10) : null,
        packageConversions: editingItem.packageConversions || getPresetPackagingForName(editingItem.name) || null,
      };
      await api.put(`/inventory/${editingItem.id}`, payload);
      if (showToast) showToast(`Updated "${editingItem.name}" in catalog!`);
      setEditingItem(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Failed to update item', 'error');
    }
  };

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedItemForAdjustment || !adjQty) return;

    try {
      const isDecrease = ['WASTE', 'EXPIRATION', 'DAMAGE', 'USED'].includes(adjType);
      const qtyChange = isDecrease ? -Math.abs(parseFloat(adjQty)) : parseFloat(adjQty);

      await api.post('/inventory/adjust', {
        inventoryItemId: selectedItemForAdjustment.id,
        type: adjType,
        changeQty: qtyChange,
        reason: adjReason || `Stock ${adjType}`,
      });

      if (showToast) showToast(`Stock adjustment (${adjType}) recorded successfully!`);
      setSelectedItemForAdjustment(null);
      setAdjQty('');
      setAdjReason('');
      if (onRefresh) onRefresh();
    } catch (err) {
      if (showToast) showToast(err.response?.data?.error || 'Adjustment failed', 'error');
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedInventoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (paginatedStock.length === 0) return;
    const allVisibleSelected = paginatedStock.every((item) => selectedInventoryIds.has(item.id));
    setSelectedInventoryIds((previous) => {
      const next = new Set(previous);
      paginatedStock.forEach((item) => {
        if (allVisibleSelected) next.delete(item.id);
        else next.add(item.id);
      });
      return next;
    });
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedInventoryIds(new Set());
    setSelectionMode((active) => !active);
  };

  const handleDeleteItem = (itemId, itemName) => {
    setItemToDelete({ id: itemId, name: itemName });
    setIsBulkDeleting(false);
    setDeleteModalOpen(true);
  };

  const handleBulkDelete = () => {
    if (selectedInventoryIds.size === 0) return;
    setIsBulkDeleting(true);
    setItemToDelete(null);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setDeleteLoading(true);
    try {
      if (isBulkDeleting) {
        const res = await api.delete('/inventory/items/bulk', {
          data: { ids: Array.from(selectedInventoryIds) }
        });
        if (showToast) showToast(res.data?.message || 'Selected items deleted successfully.');
        setSelectedInventoryIds(new Set());
      } else if (itemToDelete) {
        await api.delete(`/inventory/${itemToDelete.id}`);
        if (showToast) showToast(`Deleted "${itemToDelete.name}" from catalog.`);
      }
      setDeleteModalOpen(false);
      setItemToDelete(null);
      if (selectedItemForDetails && itemToDelete && selectedItemForDetails.id === itemToDelete.id) {
        setSelectedItemForDetails(null);
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Delete inventory error:', err);
      const msg = err.response?.data?.error || 'Failed to delete item(s).';
      if (showToast) showToast(msg, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExportCSV = () => {
    const csvData = filteredAndSortedStock.map((item) => ({
      ItemName: item.name,
      Category: item.category || 'General',
      CurrentStock: item.stockLevel,
      MinimumStock: item.minThreshold,
      Unit: item.unit,
      CostPerUnit: item.costPrice || 0,
      Supplier: item.supplier?.name || 'N/A',
      Status: item.status,
    }));

    exportToCSV(`inventory_catalog_${Date.now()}.csv`, csvData, [
      { key: 'ItemName', label: 'Item Name' },
      { key: 'Category', label: 'Category' },
      { key: 'CurrentStock', label: 'Current Stock' },
      { key: 'MinimumStock', label: 'Minimum Stock' },
      { key: 'Unit', label: 'Unit' },
      { key: 'CostPerUnit', label: 'Cost per Unit' },
      { key: 'Supplier', label: 'Supplier' },
      { key: 'Status', label: 'Status' },
    ]);
  };

  return (
    <div className="space-y-6">

      {/* 1. Page Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[var(--card-bg)] border border-[var(--border-color)] p-4 sm:p-6 rounded-3xl shadow-sm">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black text-[var(--text-main)] font-display flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-orange-500/10 text-orange-400">📦</span>
            Inventory
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            View and manage all ingredients, supplies, and packaging.
          </p>
        </div>

        {/* Action Buttons: + Add Item, Receive Stock, Import Excel */}
        <div className="flex w-full min-w-0 items-center gap-1.5 lg:w-auto lg:shrink-0">
          <button
            onClick={() => setShowAddItemModal(true)}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl bg-orange-600 px-1.5 text-[10px] font-black text-white shadow-md transition-all hover:bg-orange-500 cursor-pointer lg:h-auto lg:w-auto lg:flex-none lg:px-2.5 lg:py-2.5 lg:text-xs"
          >
            <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span className="whitespace-nowrap"><span className="sm:hidden">Add</span><span className="hidden sm:inline">Add Item</span></span>
          </button>

          <button
            onClick={() => setActiveTab('STOCK_IN')}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl bg-emerald-600 px-1.5 text-[10px] font-black text-white shadow-md transition-all hover:bg-emerald-500 cursor-pointer lg:h-auto lg:w-auto lg:flex-none lg:px-2.5 lg:py-2.5 lg:text-xs"
          >
            <Truck className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span className="whitespace-nowrap"><span className="sm:hidden">Receive</span><span className="hidden sm:inline">Receive Stock</span></span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-color)] px-1.5 text-[10px] font-extrabold text-[var(--text-main)] transition-all hover:border-orange-500/50 cursor-pointer lg:h-auto lg:w-auto lg:flex-none lg:px-2.5 lg:py-2.5 lg:text-xs"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap"><span className="sm:hidden">Export</span><span className="hidden sm:inline">Export CSV</span></span>
          </button>
        </div>
      </div>

      {/* 2. Clickable Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">

        {/* Card 1: Total Items */}
        <button
          type="button"
          onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border text-left transition-all cursor-pointer flex flex-col justify-between h-24 shadow-sm ${
            statusFilter === 'ALL'
              ? 'bg-orange-500/10 border-orange-500 text-orange-400 ring-2 ring-orange-500/20'
              : 'bg-[var(--card-bg)] border-[var(--border-color)] hover:border-orange-500/40'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] block">
            Total Items
          </span>
          <div className="flex items-baseline justify-between">
            <h4 className="text-2xl font-black font-mono text-[var(--text-main)]">
              {statusCounts.total}
            </h4>
            <span className="text-[10px] text-[var(--text-muted)] font-bold">Items</span>
          </div>
        </button>

        {/* Card 2: Low Stock (Clickable) */}
        <button
          type="button"
          onClick={() => { setStatusFilter('LOW'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border text-left transition-all cursor-pointer flex flex-col justify-between h-24 shadow-sm ${
            statusFilter === 'LOW'
              ? 'bg-rose-500/10 border-rose-500 text-rose-400 ring-2 ring-rose-500/20'
              : 'bg-[var(--card-bg)] border-[var(--border-color)] hover:border-rose-500/40'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block">
            Low Stock
          </span>
          <div className="flex items-baseline justify-between">
            <h4 className="text-2xl font-black font-mono text-rose-400">
              {statusCounts.low}
            </h4>
            <span className="text-[10px] text-rose-400/80 font-bold">Needs Attention</span>
          </div>
        </button>

        {/* Card 3: Normal (Clickable) */}
        <button
          type="button"
          onClick={() => { setStatusFilter('NORMAL'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border text-left transition-all cursor-pointer flex flex-col justify-between h-24 shadow-sm ${
            statusFilter === 'NORMAL'
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/20'
              : 'bg-[var(--card-bg)] border-[var(--border-color)] hover:border-emerald-500/40'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
            Normal
          </span>
          <div className="flex items-baseline justify-between">
            <h4 className="text-2xl font-black font-mono text-emerald-400">
              {statusCounts.normal}
            </h4>
            <span className="text-[10px] text-emerald-400/80 font-bold">Healthy Stock</span>
          </div>
        </button>

        {/* Card 4: Overstock (Clickable) */}
        <button
          type="button"
          onClick={() => { setStatusFilter('OVERSTOCK'); setCurrentPage(1); }}
          className={`p-4 rounded-3xl border text-left transition-all cursor-pointer flex flex-col justify-between h-24 shadow-sm ${
            statusFilter === 'OVERSTOCK'
              ? 'bg-blue-500/10 border-blue-500 text-blue-400 ring-2 ring-blue-500/20'
              : 'bg-[var(--card-bg)] border-[var(--border-color)] hover:border-blue-500/40'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
            Overstock
          </span>
          <div className="flex items-baseline justify-between">
            <h4 className="text-2xl font-black font-mono text-blue-400">
              {statusCounts.overstock}
            </h4>
            <span className="text-[10px] text-blue-400/80 font-bold">Above Normal</span>
          </div>
        </button>

      </div>

      {/* Tabs Navigation Bar */}
      <div role="tablist" aria-label="Inventory sections" className="admin-inventory-tabs flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-1 custom-scrollbar">
        {[
          { id: 'CATALOG', label: 'Inventory Catalog', icon: Layers },
          { id: 'STOCK_IN', label: 'Receive Stock', icon: Truck },
          { id: 'RECIPES', label: 'Recipe Builder', icon: Edit3 },
          { id: 'MARGINS', label: 'Costs & Margins', icon: Coins },
          { id: 'EXPIRY', label: 'Expiry Tracking', icon: Clock },
          { id: 'SUPPLIERS', label: 'Suppliers', icon: Building2 },
          { id: 'LOGS', label: `Logs (${logs.length})`, icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center space-x-1.5 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: INVENTORY CATALOG */}
      {activeTab === 'CATALOG' && (
        <div className="space-y-5">

          {/* 3. Search & Filter Bar */}
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-4 sm:p-5 rounded-3xl space-y-3.5 shadow-sm">

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search items by name, category, supplier, unit..."
                className="w-full pl-10 pr-4 py-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-2xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 shadow-inner"
              />
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[var(--text-muted)]" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-3 text-[var(--text-muted)] hover:text-[var(--text-main)] icon-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">

              {/* Category Filter */}
              <div>
                <ThemedSelect
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  <option value="Meat & Protein">Meat & Protein</option>
                  <option value="Vegetables">Vegetables</option>
                  <option value="Dry Goods">Dry Goods</option>
                  <option value="Spices">Spices</option>
                  <option value="Sauces & Condiments">Sauces & Condiments</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Cooking Oil">Cooking Oil</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Kitchen Supplies">Kitchen Supplies</option>
                  <option value="Other">Other</option>
                </ThemedSelect>
              </div>

              {/* Status Filter */}
              <div>
                <ThemedSelect
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="LOW">Low Stock</option>
                  <option value="NORMAL">Normal</option>
                  <option value="OVERSTOCK">Overstock</option>
                </ThemedSelect>
              </div>

              {/* Supplier Filter */}
              <div>
                <ThemedSelect
                  value={supplierFilter}
                  onChange={(e) => { setSupplierFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] cursor-pointer"
                >
                  <option value="ALL">All Suppliers</option>
                  {suppliersList.map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name}</option>
                  ))}
                </ThemedSelect>
              </div>

              {/* Unit Filter */}
              <div>
                <ThemedSelect
                  value={unitFilter}
                  onChange={(e) => { setUnitFilter(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] cursor-pointer"
                >
                  <option value="ALL">All Units</option>
                  <option value="KG">KG</option>
                  <option value="G">G</option>
                  <option value="L">L</option>
                  <option value="ML">ML</option>
                  <option value="PCS">PCS</option>
                  <option value="PACK">PACK</option>
                  <option value="BOTTLE">BOTTLE</option>
                  <option value="BOX">BOX</option>
                  <option value="DOZEN">DOZEN</option>
                </ThemedSelect>
              </div>

              {/* Clear Filters */}
              <div>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] hover:border-orange-500/50 rounded-xl text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Sorting & Results Count Row */}
            <div className="flex flex-col gap-3 border-t border-[var(--border-color)]/60 pt-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <BulkSelectionModeButton active={selectionMode} onClick={toggleSelectionMode} selectedCount={selectedInventoryIds.size} />
                {selectionMode && (
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    disabled={paginatedStock.length === 0}
                    className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] px-3 py-2.5 text-xs font-bold text-[var(--text-muted)] transition-colors hover:border-orange-500/40 hover:text-[var(--text-main)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {paginatedStock.length > 0 && paginatedStock.every((item) => selectedInventoryIds.has(item.id)) ? 'Deselect visible' : 'Select visible'}
                  </button>
                )}
                <span className="text-[var(--text-muted)] font-medium">
                  Showing <strong className="text-[var(--text-main)]">{filteredAndSortedStock.length}</strong> items
                </span>
              </div>

              {selectionMode && selectedInventoryIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white shadow-md shadow-rose-900/30 transition-all hover:bg-rose-700 cursor-pointer animate-scale-up"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected ({selectedInventoryIds.size})</span>
                </button>
              )}

              <div className="flex min-w-0 items-center gap-2 w-full sm:w-auto">
                <span className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-wider shrink-0">
                  Sort By:
                </span>
                <ThemedSelect
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] cursor-pointer"
                >
                  <option value="NAME_ASC">Item Name A–Z</option>
                  <option value="NAME_DESC">Item Name Z–A</option>
                  <option value="LOW_STOCK_FIRST">Low Stock First</option>
                  <option value="OVERSTOCK_FIRST">Overstock First</option>
                  <option value="STOCK_LOW_TO_HIGH">Lowest Stock</option>
                  <option value="STOCK_HIGH_TO_LOW">Highest Stock</option>
                  <option value="COST_HIGH_TO_LOW">Highest Cost</option>
                </ThemedSelect>
              </div>
            </div>
          </div>

          {/* Desktop Table & Mobile Cards */}
          {filteredAndSortedStock.length === 0 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-10 text-center space-y-3">
              <Package className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-50" />
              <h3 className="text-sm font-black text-[var(--text-main)]">No items found</h3>
              <p className="text-xs text-[var(--text-muted)]">Try adjusting your search query or clear the filters to see all catalog items.</p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-extrabold shadow-md"
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">

              {/* Desktop Table View */}
              <div className="hidden md:block bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] bg-[var(--bg-color)]/50 text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                        {selectionMode && <th className="p-4 w-10">
                          <input
                            type="checkbox"
                            checked={paginatedStock.length > 0 && paginatedStock.every((item) => selectedInventoryIds.has(item.id))}
                            onChange={handleToggleSelectAll}
                            className="rounded border-[var(--border-color)] accent-orange-500 focus:ring-orange-500/20 cursor-pointer"
                          />
                        </th>}
                        <th className="p-4">Item</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">Stock Level</th>
                        <th className="p-4">Minimum</th>
                        <th className="p-4">Cost per Unit</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {paginatedStock.map((item) => {
                        const stockVal = parseFloat(item.stockLevel) || 0;
                        const minVal = parseFloat(item.minThreshold) || 10;
                        const percent = Math.min(100, Math.max(10, (stockVal / (minVal * 3)) * 100));
                        const isSelected = selectedInventoryIds.has(item.id);

                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              isSelected
                                ? 'bg-orange-500/10 hover:bg-orange-500/15'
                                : 'hover:bg-[var(--bg-color)]/40'
                            }`}
                          >
                            {selectionMode && <td className="p-4 w-10">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(item.id)}
                                className="rounded border-[var(--border-color)] accent-orange-500 focus:ring-orange-500/20 cursor-pointer"
                              />
                            </td>}

                            {/* Item Name & Subtitle */}
                            <td className="p-4">
                              <button
                                type="button"
                                onClick={() => setSelectedItemForDetails(item)}
                                className="text-left group cursor-pointer"
                              >
                                <span className="font-extrabold text-[var(--text-main)] group-hover:text-orange-400 text-xs block">
                                  {item.name}
                                </span>
                                {item.supplier?.name && (
                                  <span className="text-[10px] text-[var(--text-muted)] block">
                                    Supplier: {item.supplier.name}
                                  </span>
                                )}
                              </button>
                            </td>

                            {/* Category */}
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-xl bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-wider border border-orange-500/20">
                                {item.category || 'General'}
                              </span>
                            </td>

                            {/* Stock Level with Progress Bar */}
                            <td className="p-4 min-w-[140px]">
                              <span className="font-mono font-black text-xs text-[var(--text-main)] block">
                                {formatQuantity(item.stockLevel, item.unit)} {item.unit}
                              </span>

                              {/* Visual Stock Bar */}
                              <div className="w-28 h-1.5 bg-[var(--bg-color)] rounded-full overflow-hidden mt-1 border border-[var(--border-color)]">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    item.status === 'LOW'
                                      ? 'bg-rose-500'
                                      : item.status === 'OVERSTOCK'
                                      ? 'bg-blue-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </td>

                            {/* Minimum Stock */}
                            <td className="p-4 font-mono font-semibold text-[var(--text-muted)]">
                              {formatQuantity(item.minThreshold, item.unit)} {item.unit}
                            </td>

                            {/* Cost per Unit */}
                            <td className="p-4 font-mono font-black text-emerald-400">
                              {item.costPrice > 0 ? `Rs. ${item.costPrice} / ${item.unit}` : '-'}
                            </td>

                            {/* Status Badge */}
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase border tracking-wider ${
                                item.status === 'LOW'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  : item.status === 'OVERSTOCK'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}>
                                {item.status === 'LOW' ? 'LOW STOCK' : item.status}
                              </span>
                            </td>

                            {/* Quick Action Buttons */}
                            <td className="p-4 text-right whitespace-nowrap">
                              <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('STOCK_IN')}
                                  className="px-2.5 py-1 rounded-lg btn-tint-success text-[10px] font-black transition-colors cursor-pointer"
                                >
                                  Receive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedItemForAdjustment(item)}
                                  className="px-2.5 py-1 rounded-lg btn-tint-warning text-[10px] font-black transition-colors cursor-pointer"
                                >
                                  Adjust
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingItem(item)}
                                  className="p-1 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 cursor-pointer border border-orange-500/20 btn-icon"
                                  title="Edit Catalog Item"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id, item.name)}
                                  className="p-1 rounded-lg btn-tint-danger cursor-pointer btn-icon"
                                  title="Delete Item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile/Tablet Card Layout */}
              <div className="md:hidden grid grid-cols-1 gap-3">
                {paginatedStock.map((item) => {
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border space-y-3 shadow-sm transition-colors ${
                        selectedInventoryIds.has(item.id)
                          ? 'bg-orange-500/10 border-orange-500/30'
                          : 'bg-[var(--card-bg)] border-[var(--border-color)]'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-start space-x-2.5">
                          {selectionMode && <input
                            type="checkbox"
                            checked={selectedInventoryIds.has(item.id)}
                            onChange={() => handleToggleSelect(item.id)}
                            className="mt-0.5 rounded border-[var(--border-color)] accent-orange-500 focus:ring-orange-500/20 cursor-pointer"
                          />}
                          <div>
                            <h4 className="text-xs font-black text-[var(--text-main)]">{item.name}</h4>
                            <span className="text-[10px] text-orange-400 font-bold uppercase">{item.category || 'General'}</span>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${
                          item.status === 'LOW'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : item.status === 'OVERSTOCK'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {item.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-[var(--bg-color)]/60 p-2.5 rounded-xl border border-[var(--border-color)]">
                        <div>
                          <span className="text-[9px] text-[var(--text-muted)] uppercase block">Stock</span>
                          <span className="font-mono font-black text-orange-400">
                            {formatQuantity(item.stockLevel, item.unit)} {item.unit}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] text-[var(--text-muted)] uppercase block">Cost</span>
                          <span className="font-mono font-black text-emerald-400">
                            Rs. {item.costPrice || 0} / {item.unit}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">Min: {item.minThreshold} {item.unit}</span>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setActiveTab('STOCK_IN')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold"
                          >
                            Receive
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedItemForAdjustment(item)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-bold"
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="p-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 icon-btn"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-[var(--card-bg)] p-4 rounded-3xl border border-[var(--border-color)] text-xs">
                <span className="text-[var(--text-muted)]">
                  Showing <strong className="text-[var(--text-main)]">{(currentPage - 1) * itemsPerPage + 1}–{Math.min(filteredAndSortedStock.length, currentPage * itemsPerPage)}</strong> of <strong className="text-[var(--text-main)]">{filteredAndSortedStock.length}</strong> items
                </span>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-2 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] disabled:opacity-40 icon-btn"
                  >
                    <ChevronLeft className="w-4 h-4 text-[var(--text-main)]" />
                  </button>

                  <span className="font-extrabold text-[var(--text-main)]">Page {currentPage} of {totalPages}</span>

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-2 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] disabled:opacity-40 icon-btn"
                  >
                    <ChevronRight className="w-4 h-4 text-[var(--text-main)]" />
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* TAB 2: STOCK IN RECEIVING (Kept mounted to preserve scanned invoice and review table state across tabs) */}
      {hasVisitedReceiving && (
        <div className={activeTab === 'STOCK_IN' ? 'block' : 'hidden'}>
          <Suspense fallback={<InventorySectionFallback />}>
            <AdminInventoryReceivingView
              inventory={inventory}
              suppliers={suppliersList}
              onRefresh={onRefresh}
              showToast={showToast}
            />
          </Suspense>
        </div>
      )}

      {/* TAB 3: RECIPES */}
      {activeTab === 'RECIPES' && (
        <Suspense fallback={<InventorySectionFallback />}>
          <AdminRecipeBuilderView
            inventory={stockList}
            onRefresh={onRefresh}
            showToast={showToast}
            onOpenAddIngredientModal={() => setShowAddItemModal(true)}
          />
        </Suspense>
      )}

      {/* TAB 4: COSTS & MARGINS */}
      {activeTab === 'MARGINS' && (
        <Suspense fallback={<InventorySectionFallback />}>
          <AdminCostsMarginsView
            inventory={stockList}
            showToast={showToast}
            onNavigateToRecipes={() => setActiveTab('RECIPES')}
          />
        </Suspense>
      )}

      {/* TAB 5: EXPIRY TRACKING */}
      {activeTab === 'EXPIRY' && (
        <Suspense fallback={<InventorySectionFallback />}>
          <AdminExpiryTrackingView
            inventory={stockList}
            receivings={receivingsList}
            onOpenAdjustmentModal={(item) => setSelectedItemForAdjustment(item)}
            onRefresh={() => { fetchReceivings(); onRefresh?.(); }}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* TAB 6: SUPPLIERS */}
      {activeTab === 'SUPPLIERS' && (
        <Suspense fallback={<InventorySectionFallback />}>
          <AdminSuppliersView
            suppliers={suppliersList}
            inventory={stockList}
            receivings={receivingsList}
            onRefresh={() => { fetchSuppliers(); fetchReceivings(); if (onRefresh) onRefresh(); }}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* TAB 7: ACTIVITY LOGS */}
      {activeTab === 'LOGS' && (
        <Suspense fallback={<InventorySectionFallback />}>
          <AdminActivityLogsView
            logs={logs}
            receivings={receivingsList}
            onRefresh={() => { fetchReceivings(); onRefresh?.(); }}
            showToast={showToast}
          />
        </Suspense>
      )}

      {/* Quick Adjustment Modal — Portal to document.body for true screen centering */}
      {selectedItemForAdjustment && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-scale-up my-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-black text-[var(--text-main)] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Adjust Stock: {selectedItemForAdjustment.name}
              </h3>
              <button onClick={() => setSelectedItemForAdjustment(null)} className="p-1.5 rounded-xl bg-[var(--bg-color)] hover:bg-[var(--card-bg)] text-[var(--text-muted)] cursor-pointer icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="space-y-4 text-xs">
              <div className="bg-[var(--bg-color)] p-3 rounded-2xl border border-[var(--border-color)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase block font-bold">Current Stock Level</span>
                <span className="text-base font-mono font-black text-orange-400">{selectedItemForAdjustment.stockLevel} {selectedItemForAdjustment.unit}</span>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">What happened? *</label>
                <ThemedSelect
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)]"
                >
                  <option value="CORRECTION">Audit Count Correction</option>
                  <option value="WASTE">Spoilage / Kitchen Waste (-)</option>
                  <option value="EXPIRATION">Expired Product (-)</option>
                  <option value="DAMAGE">Damaged Goods (-)</option>
                  <option value="USED">Unrecorded Usage (-)</option>
                </ThemedSelect>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Quantity *</label>
                <input
                  type="number"
                  required
                  step="any"
                  min="0.01"
                  value={adjQty}
                  onChange={(e) => setAdjQty(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">Reason / Explanation *</label>
                <input
                  type="text"
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. 2 KG spoiled due to fridge issue"
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)]"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--border-color)]">
                <button type="button" onClick={() => setSelectedItemForAdjustment(null)} className="px-4 py-2 rounded-xl bg-[var(--bg-color)] font-bold text-[var(--text-muted)] cursor-pointer">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black shadow-md cursor-pointer">Save Adjustment</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Item Details Modal — Portal to document.body for true screen centering */}
      {selectedItemForDetails && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-scale-up my-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text-main)]">{selectedItemForDetails.name}</h3>
                <span className="text-[10px] text-orange-400 font-bold uppercase">{selectedItemForDetails.category || 'General'}</span>
              </div>
              <button onClick={() => setSelectedItemForDetails(null)} className="p-1.5 rounded-xl bg-[var(--bg-color)] hover:bg-[var(--card-bg)] text-[var(--text-muted)] cursor-pointer icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[var(--bg-color)] p-4 rounded-2xl text-xs font-semibold">
              <div>Current Stock: <strong className="text-orange-400 font-mono">{selectedItemForDetails.stockLevel} {selectedItemForDetails.unit}</strong></div>
              <div>Minimum Threshold: <strong className="text-[var(--text-muted)] font-mono">{selectedItemForDetails.minThreshold} {selectedItemForDetails.unit}</strong></div>
              <div>Cost per Unit: <strong className="text-emerald-400 font-mono">Rs. {selectedItemForDetails.costPrice || 0} / {selectedItemForDetails.unit}</strong></div>
              <div>Supplier: <strong className="text-[var(--text-main)]">{selectedItemForDetails.supplier?.name || '-'}</strong></div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-[var(--border-color)]">
              <button onClick={() => { const item = selectedItemForDetails; setSelectedItemForDetails(null); setEditingItem(item); }} className="px-3 py-2 rounded-xl bg-orange-500/10 text-orange-400 font-bold text-xs cursor-pointer">Edit Item</button>
              <button onClick={() => handleDeleteItem(selectedItemForDetails.id, selectedItemForDetails.name)} className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 font-bold text-xs cursor-pointer">Delete Item</button>
              <button onClick={() => setSelectedItemForDetails(null)} className="px-4 py-2 rounded-xl bg-[var(--bg-color)] font-bold text-xs text-[var(--text-muted)] cursor-pointer">Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Catalog Item Modal */}
      {editingItem && createPortal(
        <div className="fixed inset-0 z-[9999] glass-overlay flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-scale-up my-auto">
            <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-3">
              <div>
                <h3 className="text-base font-black text-[var(--text-main)] font-display flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-orange-400" />
                  Edit Item: {editingItem.name}
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Update item parameters, cost, thresholds, or supplier details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1.5 rounded-xl bg-[var(--bg-color)] hover:bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer border border-[var(--border-color)] icon-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateItem} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                  Ingredient Name *
                </label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                    Base Unit (Fixed)
                  </label>
                  <div className="w-full px-3.5 py-2.5 bg-[var(--bg-color)]/60 border border-[var(--border-color)] rounded-xl text-xs font-black text-orange-400 flex items-center justify-between cursor-not-allowed" title="Base unit cannot be changed once created. To use a different base unit, delete and recreate the item.">
                    <span>{editingItem.unit}</span>
                    <span className="text-[10px] font-semibold text-[var(--text-muted)] flex items-center gap-1">🔒 Locked</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                    Category *
                  </label>
                  <ThemedSelect
                    value={editingItem.category || 'General'}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                  >
                    <option value="General">General</option>
                    <option value="Meat & Protein">Meat & Protein</option>
                    <option value="Vegetables">Vegetables</option>
                    <option value="Dry Goods">Dry Goods</option>
                    <option value="Spices">Spices</option>
                    <option value="Sauces & Condiments">Sauces & Condiments</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Bakery">Bakery</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Cooking Oil">Cooking Oil</option>
                    <option value="Packaging">Packaging</option>
                    <option value="Kitchen Supplies">Kitchen Supplies</option>
                  </ThemedSelect>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                    Cost per Unit (Rs.)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editingItem.costPrice || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, costPrice: e.target.value })}
                    className="w-full px-3 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono text-[var(--text-main)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                    Minimum Stock Alert
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editingItem.minThreshold || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, minThreshold: e.target.value })}
                    className="w-full px-3 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono text-[var(--text-main)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-main)] uppercase mb-1 tracking-wider text-[10px]">
                  Supplier
                </label>
                <ThemedSelect
                  value={editingItem.supplierId || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, supplierId: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select Supplier (Optional)...</option>
                  {suppliersList.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name}
                    </option>
                  ))}
                </ThemedSelect>
              </div>

              <div className="pt-2">
                <PackagingUnitsEditor
                  baseUnit={editingItem.unit || 'KG'}
                  packageConversions={editingItem.packageConversions || getPresetPackagingForName(editingItem.name)}
                  onChange={(updatedConversions) => setEditingItem({ ...editingItem, packageConversions: updatedConversions })}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] font-bold text-[var(--text-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black shadow-md cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Item Modal — Professional 4-Card Interface (Card A: Presets, Card B: Import, Card C: Review, Card D: Manual) */}
      {showAddItemModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[var(--glass-bg-subtle)] backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="min-w-0 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl max-w-5xl w-full p-3 sm:p-6 space-y-4 shadow-2xl animate-scale-up my-auto max-h-[92dvh] flex flex-col overflow-hidden">

            {/* Modal Header */}
            <div className="relative flex min-w-0 flex-col gap-3 border-b border-[var(--border-color)] pb-3.5 shrink-0">
              <div className="flex min-w-0 items-start justify-between gap-2 pr-10">
                <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-[var(--text-main)] font-display flex items-center gap-2">
                  <span className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400">📦</span>
                  Add New Ingredient Item
                </h3>
                <p className="text-[11px] leading-relaxed text-[var(--text-muted)] mt-0.5">
                  Pick standard catalog presets, import via Excel/invoice OCR, or type custom details manually.
                </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  aria-label="Close add ingredient form"
                  className="absolute right-0 top-0 shrink-0 p-1 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer icon-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode switch pills */}
              <div className="grid w-full grid-cols-2 items-center gap-1.5 bg-[var(--bg-color)] p-1 rounded-2xl border border-[var(--border-color)] text-[11px] font-bold sm:flex sm:w-fit sm:flex-wrap sm:text-xs">
                <button
                  type="button"
                  onClick={() => setActiveAddTab('ALL')}
                  className={`min-w-0 px-2 sm:px-3 py-1.5 sm:py-1 rounded-xl transition-all cursor-pointer whitespace-nowrap ${activeAddTab === 'ALL' ? 'bg-orange-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                  All Sections
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAddTab('PRESETS')}
                  className={`min-w-0 px-2 sm:px-3 py-1.5 sm:py-1 rounded-xl transition-all cursor-pointer whitespace-nowrap ${activeAddTab === 'PRESETS' ? 'bg-orange-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                  ⚡ Presets
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAddTab('IMPORT')}
                  className={`min-w-0 px-2 sm:px-3 py-1.5 sm:py-1 rounded-xl transition-all cursor-pointer whitespace-nowrap ${activeAddTab === 'IMPORT' ? 'bg-orange-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                  🍓¤ Import
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAddTab('MANUAL')}
                  className={`min-w-0 px-2 sm:px-3 py-1.5 sm:py-1 rounded-xl transition-all cursor-pointer whitespace-nowrap ${activeAddTab === 'MANUAL' ? 'bg-orange-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >
                  ✏️ Manual Form
                </button>
              </div>
            </div>

            {/* Scrollable Content Container */}
            <div className="min-h-0 min-w-0 space-y-4 overflow-x-hidden overflow-y-auto pr-1 flex-1 text-xs">

              {/* ======================================================== */}
              {/* CARD A: QUICK PICK PRESETS                               */}
              {/* ======================================================== */}
              {(activeAddTab === 'ALL' || activeAddTab === 'PRESETS') && (
                <div className="min-w-0 bg-[var(--bg-color)]/70 border border-[var(--border-color)] p-3 sm:p-4 rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)]/60 pb-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 whitespace-nowrap p-1 rounded-lg bg-orange-500/10 text-orange-400 font-bold">⚡ Card A</span>
                      <h4 className="min-w-0 flex-1 break-words font-black text-[11px] sm:text-xs text-[var(--text-main)] uppercase tracking-wider">
                        Quick Pick Presets (Click to Auto-Fill):
                      </h4>
                    </div>
                    <div className="relative w-full sm:w-auto">
                      <input
                        type="text"
                        value={quickPickSearch}
                        onChange={(e) => setQuickPickSearch(e.target.value)}
                        placeholder="Search 200+ presets..."
                        className="w-full sm:w-44 pl-7 pr-3 py-1.5 sm:py-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl text-xs text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-medium"
                      />
                      <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-[var(--text-muted)]" />
                    </div>
                  </div>

                  {/* Target Delivery / Supplier Selection Strip for Presets */}
                  <div className="flex min-w-0 flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--card-bg)]/90 border border-[var(--border-color)] text-xs">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                        <Target className="w-3.5 h-3.5 text-orange-400" />
                        <span>Add Presets into:</span>
                      </span>

                      {/* Card #1 Selector Pill */}
                      <button
                        type="button"
                        onClick={() => setActiveTargetCardId('card-1')}
                        className={`max-w-full flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                          activeTargetCardId === 'card-1'
                            ? 'bg-orange-500 text-white shadow-sm ring-2 ring-orange-500/30'
                            : 'bg-[var(--bg-color)] text-[var(--text-main)] hover:bg-orange-500/10 border border-[var(--border-color)]'
                        }`}
                      >
                        <span>🍓‹ Card #1</span>
                        <span className="min-w-0 break-words text-[10px] opacity-80 sm:truncate sm:max-w-44">
                          ({suppliersList.find(s => String(s.id) === String(newItem.supplierId))?.name || 'Local / Supplier 1'})
                        </span>
                        {activeTargetCardId === 'card-1' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--glass-bg-strong)] animate-pulse"></span>}
                      </button>

                      {/* Additional Delivery Cards Selector Pills */}
                      {additionalDeliveryCards.map((card, cIdx) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setActiveTargetCardId(card.id)}
                          className={`max-w-full flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                            activeTargetCardId === card.id
                              ? 'bg-orange-600 text-white shadow-sm ring-2 ring-orange-500/30'
                              : 'bg-[var(--bg-color)] text-[var(--text-main)] hover:bg-orange-500/10 border border-[var(--border-color)]'
                          }`}
                        >
                          <span>📦 Card #{cIdx + 2}</span>
                          <span className="min-w-0 break-words text-[10px] opacity-80 sm:truncate sm:max-w-44">
                            ({card.supplierName || 'Different Supplier'})
                          </span>
                          {activeTargetCardId === card.id && <span className="w-1.5 h-1.5 rounded-full bg-[var(--glass-bg-strong)] animate-pulse"></span>}
                        </button>
                      ))}

                      {/* Quick Add Supplier Card from Presets bar */}
                      <button
                        type="button"
                        onClick={handleAddNewDeliveryCard}
                        className="min-h-8 max-w-full px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 text-[10px] font-bold border border-orange-500/20 flex items-center justify-center gap-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                        title="Add another delivery card for a different supplier"
                      >
                        <Plus className="w-3 h-3" />
                        <span>New Supplier</span>
                      </button>
                    </div>

                    <span className="text-[10px] text-orange-400 font-medium hidden sm:inline">
                      Click any preset below to add directly into the selected supplier card.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 content-start gap-2 max-h-[50dvh] lg:max-h-[45dvh] overflow-y-auto overscroll-contain pr-1">
                    {QUICK_PICK_GROUPS.map((group, gIdx) => {
                      const groupItems = INGREDIENT_PRESETS.filter(p => p.category === group.category);
                      const filtered = groupItems.filter(p =>
                        !quickPickSearch ||
                        p.label.toLowerCase().includes(quickPickSearch.toLowerCase()) ||
                        p.name.toLowerCase().includes(quickPickSearch.toLowerCase()) ||
                        (p.aliases && p.aliases.some(a => a.toLowerCase().includes(quickPickSearch.toLowerCase())))
                      );

                      if (quickPickSearch && filtered.length === 0) return null;
                      const isExpanded = quickPickSearch ? true : (expandedCategories[group.category] ?? (gIdx === 0));

                      return (
                        <div key={gIdx} className="min-w-0 border border-[var(--border-color)]/60 rounded-xl overflow-hidden bg-[var(--card-bg)]/40">
                          <button
                            type="button"
                            onClick={() => setExpandedCategories(prev => ({ ...prev, [group.category]: !isExpanded }))}
                            className="min-h-10 w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-[11px] font-bold text-[var(--text-main)] hover:bg-orange-500/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>{group.icon}</span>
                              <span>{group.label}</span>
                              <span className="text-[9px] font-normal text-[var(--text-muted)]">({filtered.length})</span>
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] font-mono">{isExpanded ? '▲' : '▼'}</span>
                          </button>

                          {isExpanded && (
                            <div className="p-2 border-t border-[var(--border-color)]/40 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[var(--bg-color)]/30">
                              {filtered.map((preset, pIdx) => {
                                const exists = inventory.some(i => i.name.toLowerCase().trim() === preset.name.toLowerCase().trim());
                                return (
                                  <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => handleSelectPresetForCard(preset)}
                                    className={`min-h-9 w-full min-w-0 max-w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                                      exists
                                        ? 'bg-[var(--card-bg)] text-[var(--text-muted)] border-[var(--border-color)] opacity-70'
                                        : 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20'
                                    }`}
                                  >
                                    <span className="min-w-0 flex-1 break-words">{preset.label}</span>
                                    {exists && <span className="shrink-0 text-[9px] text-emerald-400 font-extrabold">✓ In Stock</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* CARD B: IMPORT ITEMS (EXCEL, CSV, IMAGE, PDF)            */}
              {/* ======================================================== */}
              {(activeAddTab === 'ALL' || activeAddTab === 'IMPORT') && (
                <div className="min-w-0 bg-[var(--bg-color)]/70 border border-[var(--border-color)] p-3 sm:p-4 rounded-2xl space-y-3">
                  <div className="flex min-w-0 flex-col items-start gap-2 border-b border-[var(--border-color)]/60 pb-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <span className="shrink-0 p-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold">🍓¥ Card B</span>
                      <h4 className="min-w-0 break-words leading-snug font-black text-xs text-[var(--text-main)] uppercase tracking-wider">
                        Import Items (Excel, CSV, Image, PDF):
                      </h4>
                    </div>
                    <span className="max-w-full self-start text-[10px] text-[var(--text-muted)] font-mono break-words sm:self-auto">
                      XLSX, XLS, CSV, JPG, PNG, PDF
                    </span>
                  </div>

                  {/* Drag-and-drop or Click Upload Area */}
                  <label className="min-w-0 border-2 border-dashed border-[var(--border-color)] hover:border-orange-500/50 bg-[var(--card-bg)]/40 p-3 sm:p-4 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all hover:bg-orange-500/5 group text-center">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg,.pdf"
                      onChange={handleFileUploadForAddItem}
                      className="hidden"
                      disabled={isUploadingFile}
                    />
                    <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-400 group-hover:scale-110 transition-transform">
                      {isUploadingFile ? <RefreshCw className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="break-words font-black text-xs text-[var(--text-main)]">
                        {isUploadingFile ? uploadProgress : 'Click or Drag & Drop Invoices / Stock Sheets'}
                      </div>
                      <div className="break-words text-[10px] leading-relaxed text-[var(--text-muted)] mt-0.5">
                        Supports English, Urdu script, Roman Urdu, and mixed documents. Extracts items, units, and suggested categories automatically.
                      </div>
                    </div>
                  </label>

                  {/* Error Notification */}
                  {uploadError && (
                    <div className="min-w-0 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="min-w-0 break-words">{uploadError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ======================================================== */}
              {/* CARD C: IMPORTED ITEMS REVIEW                            */}
              {/* ======================================================== */}
              {/* CARD C: IMPORTED ITEMS REVIEW & MULTI-DELIVERY CARDS     */}
              {/* ======================================================== */}
              {/* ======================================================== */}
              {/* CARD C: DYNAMIC MULTI-ITEM INGREDIENT CARDS             */}
              {/* ======================================================== */}
              {(activeAddTab === 'ALL' || activeAddTab === 'PRESETS' || activeAddTab === 'MANUAL' || activeAddTab === 'IMPORT') && (
                <div className="space-y-4">

                  {/* Master Summary Banner when Multiple Deliveries are Active */}
                  {additionalDeliveryCards.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-[var(--card-bg)] border border-orange-500/35 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-orange-500 to-amber-400" />
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/15">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-black text-xs text-[var(--text-main)]">
                            {additionalDeliveryCards.length + 1} Separate Deliveries Active
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            Multiple suppliers/invoices detected. Each delivery card maintains independent Ref#, Batch#, and Invoice#.
                          </div>
                        </div>
                      </div>
                      <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={handleSaveDraftFromAddForm}
                          disabled={bulkSavingCatalog || savingDraft}
                          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[var(--bg-color)] hover:bg-orange-500/10 text-orange-600 border border-orange-500/35 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {savingDraft ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>{savingDraft ? 'Saving drafts…' : 'Save All Deliveries to Draft'}</span>
                        </button>
                        {(ingredientCards.some(c => c.isNewItem && !c.saved && c.name?.trim()) || additionalDeliveryCards.some(card => (card.items || []).some(i => i.isNewItem && !i.saved && i.name?.trim()))) && <button
                          type="button"
                          onClick={() => additionalDeliveryCards.length > 0 ? handleSaveAllDeliveriesToCatalog() : handleSaveAllIngredientCardsToCatalog()}
                          disabled={bulkSavingCatalog || savingDraft}
                          className="w-full sm:w-auto px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {catalogSaveScope === 'all' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          <span>{bulkSavingCatalog && catalogSaveScope === 'all' ? 'Saving items…' : `Save All New Item Names (${ingredientCards.filter(c => c.isNewItem && !c.saved && c.name?.trim()).length + additionalDeliveryCards.reduce((count, card) => count + (card.items || []).filter(i => i.isNewItem && !i.saved && i.name?.trim()).length, 0)}`}</span>
                        </button>
                        }
                      </div>
                    </div>
                  )}

                  {/* Primary Delivery Card (Card #1) */}
                  <div className={`min-w-0 bg-[var(--bg-color)]/70 border p-3 sm:p-4 rounded-2xl space-y-4 shadow-md transition-all ${
                    activeTargetCardId === 'card-1'
                      ? 'border-orange-500/80 ring-2 ring-orange-500/20'
                      : 'border-orange-500/30'
                  }`}>

                    {/* Header Bar: Card #1, Summary Metrics & Action Buttons */}
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-[var(--border-color)]/60 pb-3">
                      <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5">
                        <span className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400 font-bold shrink-0">🍓‹ Card #1</span>
                        <div className="min-w-0 w-full sm:w-auto">
                          <h4 className="min-w-0 break-words leading-snug font-black text-xs text-[var(--text-main)] uppercase tracking-wider flex flex-wrap items-center gap-2">
                            <span>Delivery Card #1 — Supplier &amp; Items</span>
                            {suppliersList.find(s => String(s.id) === String(newItem.supplierId))?.name && (
                              <span className="max-w-full break-words px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/20">
                                {suppliersList.find(s => String(s.id) === String(newItem.supplierId)).name}
                              </span>
                            )}
                          </h4>
                          <span className="block break-words text-[10px] leading-relaxed text-[var(--text-muted)]">
                            Select supplier and add items below. Reference, batch, and invoice apply to this delivery.
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Target Delivery button for Presets */}
                        <button
                          type="button"
                          onClick={() => setActiveTargetCardId('card-1')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border ${
                            activeTargetCardId === 'card-1'
                              ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/20'
                          }`}
                          title="Click to route all Quick Pick Presets into Card #1"
                        >
                          <Target className="w-3.5 h-3.5" />
                          <span>{activeTargetCardId === 'card-1' ? '● Target for Presets' : 'Add Presets Here'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleClearAllIngredientCards}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-extrabold transition-all cursor-pointer flex items-center space-x-1 border border-rose-500/20"
                          title="Reset to a single blank item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear All</span>
                        </button>
                      </div>
                    </div>

                    {/* Card #1 Supplier & Delivery Details Bar */}
                    <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 sm:p-3.5 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)] text-xs shadow-sm items-start">
                      <div className="flex flex-col">
                        <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-orange-400" />
                            <span>Supplier (Company)</span>
                          </span>
                          <span className="text-[9px] text-[var(--text-muted)] font-normal lowercase">(registered)</span>
                        </label>
                        <ThemedSelect
                          value={newItem.supplierId || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const matched = suppliersList.find(s => String(s.id) === String(val));
                            setNewItem(prev => ({ ...prev, supplierId: val, supplierName: (matched && matched.contactPerson) ? matched.contactPerson : prev.supplierName }));
                            setIngredientCards(prev => prev.map(c => ({ ...c, supplierId: val, supplierName: (matched && matched.contactPerson) ? matched.contactPerson : c.supplierName })));
                          }}
                          menuMinWidth={280}
                          className="h-11 w-full px-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                        >
                          <option value="">-- Choose Company (e.g. Dawn Bread) --</option>
                          {suppliersList.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </ThemedSelect>
                      </div>

                      {/* Delivered By / Contact Person (Text Input) */}
                      <div className="flex flex-col">
                        <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                          <span>Delivered By (Person)</span>
                        </label>
                        <input
                          type="text"
                          value={newItem.supplierName || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewItem(prev => ({ ...prev, supplierName: val }));
                            setIngredientCards(prev => prev.map(c => ({ ...c, supplierName: val })));
                          }}
                          placeholder="e.g. Oneeb"
                          className="h-11 w-full px-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 placeholder:text-[var(--text-muted)]"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                          <span>Internal Reference</span>
                          <span className="text-[9px] text-orange-400 font-normal lowercase">Auto</span>
                        </label>
                        <div className="relative flex items-center h-11">
                          <input
                            type="text"
                            value={newItem.sku || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewItem(prev => ({ ...prev, sku: val }));
                              setIngredientCards(prev => prev.map(c => ({ ...c, sku: val })));
                            }}
                            placeholder="Click 📦 to generate..."
                            className="w-full h-11 pl-3 pr-9 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
                          />
                          <button
                            type="button"
                            onClick={generateAutoSKU}
                            title="Generate Reference"
                            className="absolute right-1.5 h-8 w-8 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                          <span>Shipment Batch</span>
                          <span className="text-[9px] text-orange-400 font-normal lowercase">Auto</span>
                        </label>
                        <div className="relative flex items-center h-11">
                          <input
                            type="text"
                            value={newItem.batchNumber || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewItem(prev => ({ ...prev, batchNumber: val }));
                              setIngredientCards(prev => prev.map(c => ({ ...c, batchNumber: val })));
                            }}
                            placeholder="Click 📦 to generate..."
                            className="w-full h-11 pl-3 pr-9 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                          />
                          <button
                            type="button"
                            onClick={generateAutoBatch}
                            title="Generate Batch #"
                            className="absolute right-1.5 h-8 w-8 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                          <span>Supplier Invoice #</span>
                          <span className="text-[9px] text-[var(--text-muted)] font-normal lowercase">(optional)</span>
                        </label>
                        <div className="relative flex items-center h-11">
                          <input
                            type="text"
                            value={newItem.supplierInvoiceNumber || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewItem(prev => ({ ...prev, supplierInvoiceNumber: val }));
                              setIngredientCards(prev => prev.map(c => ({ ...c, supplierInvoiceNumber: val })));
                            }}
                            placeholder="Click 📦 to generate..."
                            className="w-full h-11 pl-3 pr-9 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-orange-500"
                          />
                          <button
                            type="button"
                            onClick={generateAutoInvoiceNum}
                            title="Generate Supplier Invoice #"
                            className="absolute right-1.5 h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Metrics Strip */}
                    <div className="flex min-w-0 flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
                          <span className="font-black text-[var(--text-main)]">
                            {ingredientCards.length} Total {ingredientCards.length === 1 ? 'Card' : 'Cards'}
                          </span>
                        </div>
                        <span className="text-[var(--text-muted)] text-xs">|</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                          <span className="font-black text-emerald-400">
                            {ingredientCards.filter(c => c.saved || !c.isNewItem).length} In Catalog
                          </span>
                        </div>
                        <span className="text-[var(--text-muted)] text-xs">|</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                          <span className="font-black text-amber-400">
                            {ingredientCards.filter(c => c.isNewItem && !c.saved).length} New Items
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] italic">
                        Tip: Click any preset above or "+ Add Another Card" to add more items.
                      </span>
                    </div>

                    {/* List of Items in Card #1 (Clean Receive-Stock Style) */}
                    <div className="space-y-3">
                      {ingredientCards.length === 0 && (
                        <div className="py-10 px-4 text-center rounded-2xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-color)]/30 flex flex-col items-center justify-center space-y-2.5">
                          <div className="p-3 rounded-2xl bg-orange-500/10 text-orange-400">
                            <Package className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-[var(--text-main)]">Card #1 is Empty</h4>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              Click "+ Add Item" below or pick any Quick Pick Preset from Card A above to add items to this supplier.
                            </p>
                          </div>
                        </div>
                      )}

                      {ingredientCards.map((card, idx) => {
                        const inCatalog = !card.isNewItem || card.saved;
                        const lineSubtotal = inventoryLineSubtotal(card.stockLevel, card.costPrice);

                        return (
                          <div
                            key={card.id}
                            className={`p-3.5 sm:p-4 rounded-2xl bg-[var(--card-bg)]/80 border space-y-3 relative transition-all shadow-sm ${
                              card.saved
                                ? 'border-emerald-500/50 bg-emerald-500/5'
                                : inCatalog
                                ? 'border-blue-500/30'
                                : 'border-[var(--border-color)] hover:border-orange-500/40'
                            }`}
                          >
                            {/* Card Top: Number, Ingredient Name Input with Live Autocomplete, Badges & Actions */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                              <div className="flex items-center space-x-2.5 w-full sm:w-auto flex-1">
                                <span className="w-6 h-6 rounded-full bg-orange-500/15 text-orange-400 font-extrabold text-[11px] flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>

                                {/* Searchable / Autocomplete Ingredient Name Input */}
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    value={card.name}
                                    onFocus={() => handleIngredientCardChange(card.id, 'showSuggestions', true)}
                                    onBlur={() => {
                                      setTimeout(() => {
                                        handleIngredientCardChange(card.id, 'showSuggestions', false);
                                      }, 250);
                                    }}
                                    onChange={(e) => handleIngredientCardChange(card.id, 'name', e.target.value)}
                                    placeholder="Search preset or type ingredient name (e.g. Chicken, Aloo, Pyaz, Oil)..."
                                    className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-sans"
                                  />
                                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--text-muted)]" />

                                  {/* Autocomplete Dropdown List */}
                                  {card.showSuggestions && (card.name || '').trim().length > 0 && (
                                    <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-h-52 overflow-y-auto divide-y divide-[var(--border-color)]">
                                      {(() => {
                                        const query = (card.name || '').toLowerCase().trim();
                                        // Include actual database catalog items first
                                        const catalogMatches = (inventory || [])
                                          .filter(inv => inv.name && inv.name.toLowerCase().includes(query))
                                          .map(inv => ({
                                            label: `📦 ${inv.name}`,
                                            name: inv.name,
                                            unit: inv.unit || 'KG',
                                            category: inv.category || 'General',
                                            isCatalog: true
                                          }));

                                        const presetMatches = INGREDIENT_PRESETS.filter(p =>
                                          p.name.toLowerCase().includes(query) ||
                                          p.label.toLowerCase().includes(query) ||
                                          p.category.toLowerCase().includes(query) ||
                                          (p.aliases && p.aliases.some(a => a.toLowerCase().includes(query)))
                                        );

                                        // Deduplicate by name and unit
                                        const seenPairs = new Set();
                                        const matches = [];
                                        for (const m of [...catalogMatches, ...presetMatches]) {
                                          const key = `${m.name.toLowerCase().trim()}__${(m.unit || 'kg').toLowerCase().trim()}`;
                                          if (!seenPairs.has(key)) {
                                            seenPairs.add(key);
                                            matches.push(m);
                                          }
                                        };

                                        if (matches.length === 0) {
                                          return (
                                            <div className="p-3 text-center text-[var(--text-muted)] text-[11px]">
                                              No preset matching "<span className="text-[var(--text-main)] font-semibold">{card.name}</span>". Custom ingredient will be created! ✨
                                            </div>
                                          );
                                        }

                                        return matches.slice(0, 10).map((item, pIdx) => {
                                          const exists = inventory.some(i => i.name.toLowerCase().trim() === item.name.toLowerCase().trim() && (i.unit || 'KG').toLowerCase().trim() === (item.unit || 'KG').toLowerCase().trim());
                                          return (
                                            <button
                                              key={pIdx}
                                              type="button"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() => {
                                                  const matchedCatalog = (inventory || []).find(inv => 
                                                    inv.name.toLowerCase().trim() === item.name.toLowerCase().trim() &&
                                                    (inv.unit || 'KG').toLowerCase().trim() === (item.unit || 'KG').toLowerCase().trim()
                                                  ) || (inventory || []).find(inv => inv.name.toLowerCase().trim() === item.name.toLowerCase().trim());

                                                  setIngredientCards(prev => prev.map(c => {
                                                    if (c.id !== card.id) return c;
                                                    return {
                                                      ...c,
                                                      name: item.name,
                                                      unit: item.unit || matchedCatalog?.unit || 'KG',
                                                      category: matchedCatalog?.category || item.category || 'General',
                                                      costPrice: matchedCatalog?.costPrice ?? c.costPrice ?? 0,
                                                      minThreshold: matchedCatalog?.minThreshold ?? c.minThreshold ?? 10,
                                                      maxThreshold: matchedCatalog?.maxThreshold ?? c.maxThreshold ?? 100,
                                                      packageConversions: matchedCatalog?.packageConversions || getPresetPackagingForName(item.name) || c.packageConversions,
                                                      isNewItem: !matchedCatalog,
                                                      catalogItemId: matchedCatalog?.id || null,
                                                      showSuggestions: false,
                                                      saveError: null,
                                                      existingCatalogItem: null
                                                    };
                                                  }));
                                                }}
                                              className="w-full text-left px-3.5 py-2 hover:bg-orange-500/10 transition-colors flex items-center justify-between group cursor-pointer"
                                            >
                                              <div className="flex items-center space-x-2">
                                                <span className="text-sm">{item.label.split(' ')[0]}</span>
                                                <div>
                                                  <span className="font-bold text-[var(--text-main)] group-hover:text-orange-400">{item.name}</span>
                                                  <span className="ml-2 text-[10px] text-[var(--text-muted)]">({item.category})</span>
                                                </div>
                                              </div>
                                              <div className="flex items-center space-x-2">
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-[var(--bg-color)] text-orange-400 border border-orange-500/20">
                                                  {item.unit}
                                                </span>
                                                {exists && <span className="text-[10px] text-emerald-400 font-extrabold">✓ In Stock</span>}
                                              </div>
                                            </button>
                                          );
                                        });
                                      })()}
                                    </div>
                                  )}

                                  {card.originalDescription && card.originalDescription !== card.name && (
                                    <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 italic">
                                      Scanned: "{card.originalDescription}"
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Badges & Actions */}
                              <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
                                {card.saved ? (
                                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Saved to Catalog
                                  </span>
                                ) : !card.isNewItem ? (
                                  <span className="px-2.5 py-1 rounded-xl bg-blue-500/15 text-blue-400 text-[10px] font-black uppercase tracking-wider border border-blue-500/30 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> In Catalog ({card.category})
                                  </span>
                                ) : (
                                  <span className="inventory-new-item-badge h-9 shrink-0 px-3 rounded-xl bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider border border-amber-500/30 flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> New Item
                                  </span>
                                )}

                                                                {!card.saved && (
                                  card.isNewItem ? (
                                    <button
                                      type="button"
                                      onClick={() => handleSaveSingleCardToCatalog(card)}
                                      className="inventory-save-catalog-btn h-9 min-w-[148px] shrink-0 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                                      title="Save this single new ingredient to catalog immediately"
                                    >
                                      <Save className="w-3 h-3" />
                                      <span>Save in Catalog</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateSingleCardInCatalog(card)}
                                      className="inventory-save-catalog-btn h-9 min-w-[148px] shrink-0 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                                      title="Update this existing catalog item (cost price, packaging, category)"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Update Catalog</span>
                                    </button>
                                  )
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleRemoveIngredientCard(card.id)}
                                  className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer border border-rose-500/20 icon-btn"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Inline Duplicate / Unit Mismatch Alert Banner */}
                            {card.saveError && (
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 animate-fade-in">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                                  <span>{card.saveError}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                  {card.existingCatalogItem && (
                                    <button
                                      type="button"
                                      onClick={() => handleLinkCardToExistingItem(card.id, card.existingCatalogItem)}
                                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                                    >
                                      Link to Existing ({card.existingCatalogItem.unit})
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDismissCardSaveError(card.id)}
                                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[var(--text-main)] text-[11px] font-medium transition-all cursor-pointer"
                                  >
                                    Change Name
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Clean Fields Grid (Receive Stock Style): Quantity, Unit, Category, Cost per Unit, Expiry Date (Optional), Subtotal */}
                            <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5 items-start pt-2 border-t border-[var(--border-color)]/60 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,1.2fr)_minmax(150px,1.35fr)]">
                              {/* Quantity / Initial Stock */}
                              <div>
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                  Qty / Stock *
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={card.stockLevel}
                                  onChange={(e) => handleIngredientCardChange(card.id, 'stockLevel', e.target.value)}
                                  placeholder="0"
                                  className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                                />
                              </div>

                              {/* Unit */}
                              <div>
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                  Unit *
                                </label>
                                <ThemedSelect
                                  value={card.unit}
                                  onChange={(e) => handleIngredientCardChange(card.id, 'unit', e.target.value)}
                                  className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
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
                                </ThemedSelect>
                              </div>

                              {/* Category */}
                              <div>
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                  Category *
                                </label>
                                <ThemedSelect
                                  value={card.category}
                                  onChange={(e) => handleIngredientCardChange(card.id, 'category', e.target.value)}
                                  className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                                >
                                  <option value="General">General</option>
                                  <option value="Meat & Protein">Meat & Protein</option>
                                  <option value="Vegetables">Vegetables</option>
                                  <option value="Dry Goods">Dry Goods</option>
                                  <option value="Spices">Spices</option>
                                  <option value="Sauces & Condiments">Sauces & Condiments</option>
                                  <option value="Dairy">Dairy</option>
                                  <option value="Bakery">Bakery</option>
                                  <option value="Beverages">Beverages</option>
                                  <option value="Cooking Oil">Cooking Oil</option>
                                  <option value="Packaging">Packaging</option>
                                  <option value="Kitchen Supplies">Kitchen Supplies</option>
                                  <option value="Desserts">Desserts</option>
                                </ThemedSelect>
                              </div>

                              {/* Cost per Unit (Rs.) */}
                              <div>
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                  Cost / Unit (Rs.)
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={card.costPrice}
                                  onChange={(e) => handleIngredientCardChange(card.id, 'costPrice', e.target.value)}
                                  placeholder="0"
                                  className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-mono font-bold text-amber-400 focus:outline-none focus:border-orange-500"
                                />
                              </div>

                              {/* Expiry Date (Optional) */}
                              <div>
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 flex justify-between">
                                  <span>Expiry Date</span>
                                  <span className="text-[9px] text-[var(--text-muted)] font-normal lowercase">(Optional)</span>
                                </label>
                                <input
                                  type="date"
                                  value={card.expiryDate || ''}
                                  onChange={(e) => handleIngredientCardChange(card.id, 'expiryDate', e.target.value)}
                                  className="h-11 w-full px-2 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-mono text-[11px] font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                                />
                              </div>

                              {/* Subtotal */}
                              <div className="flex flex-col min-w-[150px]">
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 text-right">Subtotal</label>
                                <div className="h-11 flex flex-col items-end justify-center overflow-hidden bg-[var(--bg-color)]/70 px-3 rounded-xl border border-[var(--border-color)]">
                                  <span className="w-full truncate text-right text-xs font-black text-orange-400 font-mono">
                                    Rs. {lineSubtotal.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Custom Packaging Sub-Units Setup */}
                            <PackagingUnitsEditor
                              baseUnit={card.unit || 'KG'}
                              packageConversions={card.packageConversions || getPresetPackagingForName(card.name)}
                              onChange={(updatedConversions) =>
                                handleIngredientCardChange(card.id, 'packageConversions', updatedConversions)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddIngredientCard()}
                      className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--border-color)] hover:border-orange-500/50 text-[var(--text-muted)] hover:text-orange-400 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Another Item</span>
                    </button>
                    {ingredientCards.some(c => c.name?.trim()) && <div className="min-w-0 bg-[var(--bg-color)]/80 border border-[var(--border-color)] p-3 sm:p-4 rounded-2xl flex flex-col xl:flex-row xl:justify-between xl:items-center gap-3">
                      <div className="min-w-0 w-full xl:flex-1">
                        <span className="text-[10px] font-black uppercase text-[var(--text-muted)] block">Card #1 Summary</span>
                        <div className="grid min-w-0 grid-cols-2 xl:grid-cols-4 gap-2 mt-1.5">
                          <span className="min-w-0 self-center text-xs font-bold text-[var(--text-main)]">{ingredientCards.filter(c => c.name?.trim()).length} named items</span>
                          <span className="min-w-0 self-center text-xs font-mono font-bold text-orange-400 break-words">Subtotal: Rs. {sumInventorySubtotals(ingredientCards).toLocaleString()}</span>
                          <label className="col-span-2 xl:col-span-1 grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 text-[10px] font-bold text-[var(--text-muted)]">Discount
                            <ThemedSelect value={card1DiscountMode} onChange={e => setCard1DiscountMode(e.target.value)} aria-label="Card 1 discount type" className="min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-1.5 py-1.5 text-xs text-[var(--text-main)]"><option value="PERCENT">%</option><option value="AMOUNT">Rs.</option></ThemedSelect>
                            <input type="number" min="0" max={card1DiscountMode === 'PERCENT' ? 100 : undefined} step="0.01" value={card1Discount} onChange={e => setCard1Discount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0))} aria-label="Card 1 discount value" className="w-full min-w-0 max-w-28 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-1.5 font-mono text-xs text-[var(--text-main)]" />
                            {card1DiscountMode === 'PERCENT' && <span className="col-span-3 min-w-0 break-words">Rs. {calculateCardDiscount(sumInventorySubtotals(ingredientCards), card1Discount, card1DiscountMode).toLocaleString()}</span>}
                          </label>
                          <span className="col-span-2 xl:col-span-1 min-w-0 self-center text-sm font-mono font-black text-emerald-500 break-words xl:text-right">Total: Rs. {Math.max(0, roundInventoryMoney(sumInventorySubtotals(ingredientCards) - calculateCardDiscount(sumInventorySubtotals(ingredientCards), card1Discount, card1DiscountMode))).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 xl:w-auto">
                        <button type="button" onClick={() => setPendingAddSaveAction({ action: 'DRAFT', cardId: 'card-1' })} disabled={savingDraft || bulkSavingCatalog} className="flex min-w-0 items-center justify-center gap-1.5 whitespace-normal px-2 py-2.5 rounded-xl border border-orange-500/35 bg-[var(--card-bg)] text-center text-[10px] font-bold leading-tight text-orange-600 hover:bg-orange-500/10 disabled:opacity-50 sm:px-4 sm:text-xs">
                          <Save className="h-4 w-4 shrink-0" /><span>Save Draft</span>
                        </button>
                        {ingredientCards.filter(c => c.isNewItem && !c.saved && c.name?.trim()).length > 0 && <button type="button" onClick={() => setPendingAddSaveAction({ action: 'CATALOG', cardId: 'card-1' })} disabled={savingDraft || bulkSavingCatalog} className="flex min-w-0 items-center justify-center gap-1.5 whitespace-normal px-2 py-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 text-center text-[10px] font-bold leading-tight text-amber-700 hover:bg-amber-500/15 disabled:opacity-50 sm:px-4 sm:text-xs">
                          {catalogSaveScope === 'card-1' ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <Plus className="h-4 w-4 shrink-0" />}<span>{catalogSaveScope === 'card-1' ? 'Saving…' : `Save New Item Names (${ingredientCards.filter(c => c.isNewItem && !c.saved && c.name?.trim()).length})`}</span>
                        </button>}
                      </div>
                    </div>}
                  </div>

                  {/* Additional Delivery Cards (Different Suppliers / Invoices from upload or manual creation) */}
                  {/* Additional Delivery Cards (Different Suppliers / Invoices from upload or manual creation) */}
                  {additionalDeliveryCards.map((card, cardIdx) => {
                    const cardSupplier = suppliersList.find(s => String(s.id) === String(card.supplierId));
                    const isTargetActive = activeTargetCardId === card.id;
                    const items = card.items || [];
                    const inCatalogCount = items.filter(i => i.saved || !i.isNewItem).length;
                    const newItemsCount = items.filter(i => i.isNewItem && !i.saved && (i.name || '').trim()).length;

                    return (
                      <div
                        key={card.id}
                        className={`min-w-0 bg-[var(--bg-color)]/70 border p-3 sm:p-4 rounded-2xl space-y-4 shadow-md transition-all animate-in fade-in ${
                          isTargetActive
                            ? 'border-orange-500/80 ring-2 ring-orange-500/30'
                            : 'border-orange-500/30 hover:border-orange-500/50'
                        }`}
                      >
                        {/* Header Bar: Card #{N}, Supplier name, Metrics & Actions */}
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-[var(--border-color)]/60 pb-3">
                              <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2.5">
                            <span className="p-1.5 rounded-xl bg-orange-500/15 text-orange-300 font-bold shrink-0">
                              📦 Card #{cardIdx + 2}
                            </span>
                            <div className="min-w-0 w-full sm:w-auto">
                              <h4 className="min-w-0 break-words leading-snug font-black text-xs text-[var(--text-main)] uppercase tracking-wider flex flex-wrap items-center gap-2">
                                <span>Delivery Card #{cardIdx + 2} — Supplier &amp; Items</span>
                                {cardSupplier?.name && (
                                  <span className="max-w-full break-words px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-500/15 text-orange-300 border border-orange-500/20">
                                    {cardSupplier.name}
                                  </span>
                                )}
                              </h4>
                              <span className="block break-words text-[10px] leading-relaxed text-[var(--text-muted)]">
                                Select supplier and add items below. Reference, batch, and invoice apply to this delivery.
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Preset Target Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTargetCardId(card.id);
                                if (showToast) showToast(`Presets target switched to Card #${cardIdx + 2} (${cardSupplier?.name || 'Supplier ' + (cardIdx + 2)})!`, 'info');
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 border ${
                                isTargetActive
                                  ? 'bg-orange-600 text-white border-orange-600 shadow-sm ring-2 ring-orange-500/30'
                                  : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border-orange-500/20'
                              }`}
                              title="Click to route all Quick Pick Presets into this delivery card"
                            >
                              <Target className="w-3.5 h-3.5" />
                              <span>{isTargetActive ? '● Target for Presets' : 'Send Presets Here'}</span>
                            </button>

                            {/* Clear All button */}
                            <button
                              type="button"
                              onClick={() => handleAdditionalCardClearAll(card.id)}
                              className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-extrabold transition-all cursor-pointer flex items-center space-x-1 border border-rose-500/20"
                              title="Reset all items in this delivery card"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Clear All</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDiscardDeliveryCard(card.id)}
                              className="flex min-h-8 max-w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-extrabold text-rose-400 transition-colors hover:bg-rose-500/20 cursor-pointer sm:text-xs"
                              title={`Discard Card #${cardIdx + 2}`}
                              aria-label={`Discard delivery card ${cardIdx + 2}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" />
                              <span>Discard Card</span>
                            </button>

                          </div>
                        </div>

                        {/* 5-Column Delivery Details Bar (Identical to Card #1) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3.5 rounded-2xl bg-[var(--card-bg)] border border-orange-500/20 text-xs shadow-sm items-start">
                          <div className="flex flex-col">
                            <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                              <span className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-orange-400" />
                                <span>Supplier (Company)</span>
                              </span>
                              <span className="text-[9px] text-[var(--text-muted)] font-normal lowercase">(registered)</span>
                            </label>
                            <ThemedSelect
                              value={card.supplierId || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const sObj = suppliersList.find(s => String(s.id) === String(val));
                                setAdditionalDeliveryCards(prev => prev.map(c => c.id === card.id ? {
                                  ...c,
                                  supplierId: val,
                                  supplierName: (sObj && sObj.contactPerson) ? sObj.contactPerson : c.supplierName,
                                  items: (c.items || []).map(i => ({ ...i, supplierId: val, supplierName: (sObj && sObj.contactPerson) ? sObj.contactPerson : i.supplierName }))
                                } : c));
                              }}
                              menuMinWidth={280}
                              className="h-11 w-full px-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                            >
                              <option value="">-- Choose Company (e.g. Dawn Bread) --</option>
                              {suppliersList.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </ThemedSelect>
                          </div>

                          {/* Delivered By / Contact Person Text Input */}
                          <div className="flex flex-col">
                            <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                              <span>Delivered By (Person)</span>
                            </label>
                            <input
                              type="text"
                              value={card.supplierName || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAdditionalDeliveryCards(prev => prev.map(c => c.id === card.id ? {
                                  ...c,
                                  supplierName: val,
                                  items: (c.items || []).map(i => ({ ...i, supplierName: val }))
                                } : c));
                              }}
                              placeholder="e.g. Oneeb"
                              className="h-11 w-full px-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 placeholder:text-[var(--text-muted)]"
                            />
                          </div>

                          <div className="flex flex-col">
                            <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                              <span>Internal Reference</span>
                              <span className="text-[9px] text-orange-400 font-normal lowercase">Auto</span>
                            </label>
                            <div className="relative flex items-center h-11">
                              <input
                                type="text"
                                value={card.receivingRef || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAdditionalDeliveryCards(prev => prev.map(c => c.id === card.id ? { ...c, receivingRef: val } : c));
                                }}
                                placeholder="Click 📦 to generate..."
                                className="w-full h-11 pl-3 pr-9 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
                              />
                              <button
                                type="button"
                                onClick={() => generateAutoRefForCard(card.id)}
                                title="Generate Reference"
                                className="absolute right-1.5 h-8 w-8 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-col">
                            <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                              <span>Shipment Batch</span>
                              <span className="text-[9px] text-orange-400 font-normal lowercase">Auto</span>
                            </label>
                            <div className="relative flex items-center h-11">
                              <input
                                type="text"
                                value={card.batchNumber || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAdditionalDeliveryCards(prev => prev.map(c => c.id === card.id ? { ...c, batchNumber: val } : c));
                                }}
                                placeholder="Click 📦 to generate..."
                                className="w-full h-11 pl-3 pr-9 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-orange-400 focus:outline-none focus:border-orange-500"
                              />
                              <button
                                type="button"
                                onClick={() => generateAutoBatchForCard(card.id)}
                                title="Generate Batch #"
                                className="absolute right-1.5 h-8 w-8 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-col">
                            <label className="h-5 flex items-center justify-between font-extrabold text-[var(--text-main)] uppercase mb-1.5 tracking-wider text-[10px]">
                              <span>Supplier Invoice #</span>
                              <span className="text-[9px] text-[var(--text-muted)] font-normal lowercase">(optional)</span>
                            </label>
                            <div className="relative flex items-center h-11">
                              <input
                                type="text"
                                value={card.supplierInvoiceNumber || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAdditionalDeliveryCards(prev => prev.map(c => c.id === card.id ? { ...c, supplierInvoiceNumber: val } : c));
                                }}
                                placeholder="e.g. INV-45892"
                                className="w-full h-11 pl-3 pr-9 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-orange-500"
                              />
                              <button
                                type="button"
                                onClick={() => generateAutoInvoiceForCard(card.id)}
                                title="Generate Invoice #"
                                className="absolute right-1.5 h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all cursor-pointer flex items-center justify-center z-10"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Metrics Strip */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] text-xs">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0"></span>
                              <span className="font-black text-[var(--text-main)]">
                                {items.length} Total {items.length === 1 ? 'Item' : 'Items'}
                              </span>
                            </div>
                            <span className="text-[var(--text-muted)] text-xs">|</span>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                              <span className="font-black text-emerald-400">
                                {inCatalogCount} In Catalog
                              </span>
                            </div>
                            <span className="text-[var(--text-muted)] text-xs">|</span>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                              <span className="font-black text-amber-400">
                                {newItemsCount} New Items
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] italic">
                            Tip: Pick any preset above or click "+ Add Item" to add items to this delivery card.
                          </span>
                        </div>

                        {/* List of Items in this Additional Delivery Card (Exact same UI as Card #1) */}
                        <div className="space-y-3">
                          {items.length === 0 && (
                            <div className="py-10 px-4 text-center rounded-2xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-color)]/30 flex flex-col items-center justify-center space-y-2.5">
                              <div className="p-3 rounded-2xl bg-orange-500/10 text-orange-400">
                                <Package className="w-6 h-6" />
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-[var(--text-main)]">Card #{cardIdx + 2} is Empty</h4>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                  Click "+ Add Item" below or pick any Quick Pick Preset from Card A above to add items to this supplier.
                                </p>
                              </div>
                            </div>
                          )}

                          {items.map((item, idx) => {
                            const inCatalog = !item.isNewItem || item.saved;
                            const lineSubtotal = inventoryLineSubtotal(item.stockLevel ?? item.quantity, item.costPrice);

                            return (
                              <div
                                key={item.id}
                                className={`p-3.5 sm:p-4 rounded-2xl bg-[var(--card-bg)]/80 border space-y-3 relative transition-all shadow-sm ${
                                  item.saved
                                    ? 'border-emerald-500/50 bg-emerald-500/5'
                                    : inCatalog
                                    ? 'border-blue-500/30'
                                    : 'border-[var(--border-color)] hover:border-orange-500/40'
                                }`}
                              >
                                {/* Card Top: Number, Autocomplete Search, Badges & Actions */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                                  <div className="flex items-center space-x-2.5 w-full sm:w-auto flex-1">
                                    <span className="w-6 h-6 rounded-full bg-orange-500/15 text-orange-300 font-extrabold text-[11px] flex items-center justify-center shrink-0">
                                      {idx + 1}
                                    </span>

                                    {/* Searchable / Autocomplete Item Input */}
                                    <div className="relative flex-1">
                                      <input
                                        type="text"
                                        value={item.name}
                                        onFocus={() => handleAdditionalCardItemChange(card.id, item.id, 'showSuggestions', true)}
                                        onBlur={() => {
                                          setTimeout(() => {
                                            handleAdditionalCardItemChange(card.id, item.id, 'showSuggestions', false);
                                          }, 250);
                                        }}
                                        onChange={(e) => handleAdditionalCardItemChange(card.id, item.id, 'name', e.target.value)}
                                        placeholder="Search preset or type ingredient name (e.g. Chicken, Aloo, Pyaz, Oil)..."
                                        className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl text-xs font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 font-sans"
                                      />
                                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--text-muted)]" />

                                      {/* Autocomplete Dropdown */}
                                      {item.showSuggestions && (item.name || '').trim().length > 0 && (
                                        <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl max-h-52 overflow-y-auto divide-y divide-[var(--border-color)]">
                                          {(() => {
                                            const query = (item.name || '').toLowerCase().trim();
                                            // Include actual database catalog items first
                                            const catalogMatches = (inventory || [])
                                              .filter(inv => inv.name && inv.name.toLowerCase().includes(query))
                                              .map(inv => ({
                                                label: `📦 ${inv.name}`,
                                                name: inv.name,
                                                unit: inv.unit || 'KG',
                                                category: inv.category || 'General',
                                                isCatalog: true
                                              }));

                                            const presetMatches = INGREDIENT_PRESETS.filter(p =>
                                              p.name.toLowerCase().includes(query) ||
                                              p.label.toLowerCase().includes(query) ||
                                              p.category.toLowerCase().includes(query) ||
                                              (p.aliases && p.aliases.some(a => a.toLowerCase().includes(query)))
                                            );

                                            const seenPairs = new Set();
                                            const matches = [];
                                            for (const m of [...catalogMatches, ...presetMatches]) {
                                              const key = `${m.name.toLowerCase().trim()}__${(m.unit || 'kg').toLowerCase().trim()}`;
                                              if (!seenPairs.has(key)) {
                                                seenPairs.add(key);
                                                matches.push(m);
                                              }
                                            };

                                            if (matches.length === 0) {
                                              return (
                                                <div className="p-3 text-center text-[var(--text-muted)] text-[11px]">
                                                  No preset matching "<span className="text-[var(--text-main)] font-semibold">{item.name}</span>". Custom ingredient will be created! ✨
                                                </div>
                                              );
                                            }

                                            return matches.slice(0, 10).map((preset, pIdx) => {
                                              const exists = inventory.some(i => i.name.toLowerCase().trim() === preset.name.toLowerCase().trim());
                                              return (
                                                <button
                                                  key={pIdx}
                                                  type="button"
                                                  onMouseDown={(e) => e.preventDefault()}
                                                  onClick={() => {
                                                    handleAdditionalCardItemChange(card.id, item.id, 'name', preset.name);
                                                    handleAdditionalCardItemChange(card.id, item.id, 'unit', preset.unit);
                                                    handleAdditionalCardItemChange(card.id, item.id, 'category', preset.category);
                                                    handleAdditionalCardItemChange(card.id, item.id, 'isNewItem', !exists);
                                                    handleAdditionalCardItemChange(card.id, item.id, 'showSuggestions', false);
                                                  }}
                                                  className="w-full text-left px-3.5 py-2 hover:bg-orange-500/10 transition-colors flex items-center justify-between group cursor-pointer"
                                                >
                                                  <div className="flex items-center space-x-2">
                                                    <span className="text-sm">{preset.label.split(' ')[0]}</span>
                                                    <div>
                                                      <span className="font-bold text-[var(--text-main)] group-hover:text-orange-300">{preset.name}</span>
                                                      <span className="ml-2 text-[10px] text-[var(--text-muted)]">({preset.category})</span>
                                                    </div>
                                                  </div>
                                                  <div className="flex items-center space-x-2">
                                                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-[var(--bg-color)] text-orange-300 border border-orange-500/20">
                                                      {preset.unit}
                                                    </span>
                                                    {exists && <span className="text-[10px] text-emerald-400 font-extrabold">✓ In Stock</span>}
                                                  </div>
                                                </button>
                                              );
                                            });
                                          })()}
                                        </div>
                                      )}

                                      {item.originalDescription && item.originalDescription !== item.name && (
                                        <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 italic">
                                          Scanned: "{item.originalDescription}"
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Badges & Actions */}
                                  <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
                                    {item.saved ? (
                                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 text-[10px] font-black uppercase tracking-wider border border-emerald-500/30 flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" /> Saved to Catalog
                                      </span>
                                    ) : !item.isNewItem ? (
                                      <span className="px-2.5 py-1 rounded-xl bg-blue-500/15 text-blue-400 text-[10px] font-black uppercase tracking-wider border border-blue-500/30 flex items-center gap-1">
                                        <Check className="w-3 h-3" /> In Catalog ({item.category})
                                      </span>
                                    ) : (
                                      <span className="inventory-new-item-badge h-9 shrink-0 px-3 rounded-xl bg-orange-500/20 text-orange-300 text-[10px] font-black uppercase tracking-wider border border-orange-500/30 flex items-center justify-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> New Item
                                      </span>
                                    )}

                                    {!item.saved && (
                                      <button
                                        type="button"
                                        onClick={() => handleSaveAdditionalCardSingleItem(card.id, item)}
                                        className="inventory-save-catalog-btn h-9 min-w-[148px] shrink-0 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                                        title="Save this single ingredient to catalog immediately"
                                      >
                                        <Save className="w-3 h-3" />
                                        <span>Save in Catalog</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleAdditionalCardRemoveItem(card.id, item.id)}
                                      className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer border border-rose-500/20 icon-btn"
                                      title="Remove item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Clean Fields Grid: Quantity, Unit, Category, Cost per Unit, Expiry Date (Optional), Subtotal */}
                                <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5 items-start pt-2 border-t border-[var(--border-color)]/60 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)_minmax(0,1.2fr)_minmax(150px,1.35fr)]">
                                  {/* Quantity / Initial Stock */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                      Qty / Stock *
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={item.stockLevel ?? item.quantity ?? 0}
                                      onChange={(e) => handleAdditionalCardItemChange(card.id, item.id, 'stockLevel', e.target.value)}
                                      placeholder="0"
                                      className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-mono font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500"
                                    />
                                  </div>

                                  {/* Unit */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                      Unit *
                                    </label>
                                    <ThemedSelect
                                      value={item.unit}
                                      onChange={(e) => handleAdditionalCardItemChange(card.id, item.id, 'unit', e.target.value)}
                                      className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
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
                                    </ThemedSelect>
                                  </div>

                                  {/* Category */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                      Category *
                                    </label>
                                    <ThemedSelect
                                      value={item.category}
                                      onChange={(e) => handleAdditionalCardItemChange(card.id, item.id, 'category', e.target.value)}
                                      className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                                    >
                                      <option value="General">General</option>
                                      <option value="Meat & Protein">Meat & Protein</option>
                                      <option value="Vegetables">Vegetables</option>
                                      <option value="Dry Goods">Dry Goods</option>
                                      <option value="Spices">Spices</option>
                                      <option value="Sauces & Condiments">Sauces & Condiments</option>
                                      <option value="Dairy">Dairy</option>
                                      <option value="Bakery">Bakery</option>
                                      <option value="Beverages">Beverages</option>
                                      <option value="Cooking Oil">Cooking Oil</option>
                                      <option value="Packaging">Packaging</option>
                                      <option value="Kitchen Supplies">Kitchen Supplies</option>
                                      <option value="Desserts">Desserts</option>
                                    </ThemedSelect>
                                  </div>

                                  {/* Cost per Unit (Rs.) */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                                      Cost / Unit (Rs.)
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={item.costPrice}
                                      onChange={(e) => handleAdditionalCardItemChange(card.id, item.id, 'costPrice', e.target.value)}
                                      placeholder="0"
                                      className="h-11 w-full px-2.5 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-mono font-bold text-amber-400 focus:outline-none focus:border-orange-500"
                                    />
                                  </div>

                                  {/* Expiry Date (Optional) */}
                                  <div>
                                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 flex justify-between">
                                      <span>Expiry Date</span>
                                      <span className="text-[9px] text-[var(--text-muted)] font-normal lowercase">(Optional)</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={item.expiryDate || ''}
                                      onChange={(e) => handleAdditionalCardItemChange(card.id, item.id, 'expiryDate', e.target.value)}
                                      className="h-11 w-full px-2 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl font-mono text-[11px] font-bold text-[var(--text-main)] focus:outline-none focus:border-orange-500 cursor-pointer"
                                    />
                                  </div>

                                  {/* Subtotal */}
                                  <div className="flex flex-col min-w-[150px]">
                                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 text-right">Subtotal</label>
                                    <div className="h-11 flex flex-col items-end justify-center overflow-hidden bg-[var(--bg-color)]/70 px-3 rounded-xl border border-[var(--border-color)]">
                                      <span className="w-full truncate text-right text-xs font-black text-orange-300 font-mono">
                                        Rs. {lineSubtotal.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Custom Packaging Sub-Units Setup */}
                                <PackagingUnitsEditor
                                  baseUnit={item.unit || 'KG'}
                                  packageConversions={item.packageConversions || getPresetPackagingForName(item.name)}
                                  onChange={(updatedConversions) =>
                                    handleAdditionalCardItemChange(card.id, item.id, 'packageConversions', updatedConversions)
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAdditionalCardAddItem(card.id)}
                          className="w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--border-color)] hover:border-orange-500/50 text-[var(--text-muted)] hover:text-orange-400 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add Another Item</span>
                        </button>
                        {items.some(i => i.name?.trim()) && <div className="min-w-0 bg-[var(--bg-color)]/80 border border-[var(--border-color)] p-3 sm:p-4 rounded-2xl flex flex-col xl:flex-row xl:justify-between xl:items-center gap-3">
                          <div className="min-w-0 w-full xl:flex-1">
                            <span className="text-[10px] font-black uppercase text-[var(--text-muted)] block">Card #{cardIdx + 2} Summary</span>
                            <div className="grid min-w-0 grid-cols-2 xl:grid-cols-4 gap-2 mt-1.5">
                              <span className="min-w-0 self-center text-xs font-bold text-[var(--text-main)]">{items.filter(i => i.name?.trim()).length} named items</span>
                              <span className="min-w-0 self-center text-xs font-mono font-bold text-orange-400 break-words">Subtotal: Rs. {sumInventorySubtotals(items).toLocaleString()}</span>
                              <label className="col-span-2 xl:col-span-1 grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2 text-[10px] font-bold text-[var(--text-muted)]">Discount
                                <ThemedSelect value={card.discountMode || 'AMOUNT'} onChange={e => setAdditionalDeliveryCards(prev => prev.map(c => c.id === card.id ? { ...c, discountMode: e.target.value } : c))} aria-label={`Card ${cardIdx + 2} discount type`} className="min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-1.5 py-1.5 text-xs text-[var(--text-main)]"><option value="PERCENT">%</option><option value="AMOUNT">Rs.</option></ThemedSelect>
                                <input type="number" min="0" max={card.discountMode === 'PERCENT' ? 100 : undefined} step="0.01" value={card.discountAmount ?? 0} onChange={e => setAdditionalDeliveryCards(prev => prev.map(c => c.id === card.id ? { ...c, discountAmount: e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0) } : c))} aria-label={`Card ${cardIdx + 2} discount value`} className="w-full min-w-0 max-w-28 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-2 py-1.5 font-mono text-xs text-[var(--text-main)]" />
                                {card.discountMode === 'PERCENT' && <span className="col-span-3 min-w-0 break-words">Rs. {calculateCardDiscount(sumInventorySubtotals(items), card.discountAmount, card.discountMode).toLocaleString()}</span>}
                              </label>
                              <span className="col-span-2 xl:col-span-1 min-w-0 self-center text-sm font-mono font-black text-emerald-500 break-words xl:text-right">Total: Rs. {Math.max(0, roundInventoryMoney(sumInventorySubtotals(items) - calculateCardDiscount(sumInventorySubtotals(items), card.discountAmount, card.discountMode))).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="grid w-full grid-cols-2 gap-2 xl:w-auto">
                            <button type="button" onClick={() => setPendingAddSaveAction({ action: 'DRAFT', cardId: card.id })} disabled={savingDraft || bulkSavingCatalog} className="flex min-w-0 items-center justify-center gap-1.5 whitespace-normal px-2 py-2.5 rounded-xl border border-orange-500/35 bg-[var(--card-bg)] text-center text-[10px] font-bold leading-tight text-orange-600 hover:bg-orange-500/10 disabled:opacity-50 sm:px-4 sm:text-xs">
                              <Save className="h-4 w-4 shrink-0" /><span>Save Draft</span>
                            </button>
                            {newItemsCount > 0 && <button type="button" onClick={() => setPendingAddSaveAction({ action: 'CATALOG', cardId: card.id })} disabled={savingDraft || bulkSavingCatalog} className="flex min-w-0 items-center justify-center gap-1.5 whitespace-normal px-2 py-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 text-center text-[10px] font-bold leading-tight text-amber-700 hover:bg-amber-500/15 disabled:opacity-50 sm:px-4 sm:text-xs">
                              {catalogSaveScope === card.id ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <Plus className="h-4 w-4 shrink-0" />}<span>{catalogSaveScope === card.id ? 'Saving…' : `Save New Item Names (${newItemsCount})`}</span>
                            </button>}
                          </div>
                        </div>}
                      </div>
                    );
                  })}

                  {/* Actions Footer */}
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-[var(--border-color)] shrink-0">
                    {/* Left: Add Supplier / New Delivery Card + Save Draft */}
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleAddNewDeliveryCard}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-xs font-black transition-all cursor-pointer flex items-center justify-center space-x-1.5 border border-orange-500/30"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Supplier / New Delivery Card</span>
                      </button>
                    </div>

                    {additionalDeliveryCards.length === 0 && <div className="grid min-w-0 w-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-stretch gap-2 sm:w-auto sm:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
                      {/* TEMP HIDDEN: Cancel button in Add Item footer
                      <button
                        type="button"
                        onClick={() => setShowAddItemModal(false)}
                        className="w-full min-w-0 rounded-xl bg-[var(--card-bg)] px-2 py-2.5 text-center text-[10px] font-bold leading-snug text-[var(--text-muted)] border border-[var(--border-color)] cursor-pointer sm:w-auto sm:px-4 sm:text-xs"
                      >
                        Cancel
                      </button>
                      */}
                      {additionalDeliveryCards.length === 0 && <button
                        type="button"
                        onClick={() => setPendingAddSaveAction({ action: 'DRAFT' })}
                        disabled={bulkSavingCatalog || savingDraft}
                        className="flex w-full min-w-0 items-center justify-center gap-1 rounded-xl bg-[var(--bg-color)] px-1.5 py-2.5 text-center text-[10px] font-bold leading-snug text-orange-600 border border-orange-500/35 cursor-pointer transition-all hover:bg-orange-500/10 disabled:opacity-50 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-xs"
                      >
                        <Save className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">Save All Deliveries to Draft</span>
                      </button>}
                      {additionalDeliveryCards.length === 0 && (ingredientCards.some(c => c.isNewItem && !c.saved && c.name?.trim()) || additionalDeliveryCards.some(card => (card.items || []).some(i => i.isNewItem && !i.saved && i.name?.trim()))) && <button
                        type="button"
                        onClick={() => setPendingAddSaveAction({ action: 'CATALOG' })}
                        disabled={bulkSavingCatalog || savingDraft}
                        className="flex min-w-0 items-center justify-center gap-1 rounded-xl bg-orange-600 px-1.5 py-2.5 text-center text-[10px] font-black leading-tight text-white shadow-md cursor-pointer transition-all hover:bg-orange-500 disabled:opacity-50 sm:gap-1.5 sm:px-5 sm:text-xs"
                      >
                        {catalogSaveScope === 'all' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span className="min-w-0">Save All New Item Names ({ingredientCards.filter(c => c.isNewItem && !c.saved && c.name?.trim()).length + additionalDeliveryCards.reduce((count, card) => count + (card.items || []).filter(i => i.isNewItem && !i.saved && i.name?.trim()).length, 0)})</span>
                      </button>
                      }
                    </div>}
                  </div>


                </div>
              )}

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Upload Choice Modal (Same Supplier Merge vs Different Supplier Separate Card) */}
      {showMergeChoiceModal && (pendingUploadData || pendingUploadRows) && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center overflow-x-hidden bg-black/80 backdrop-blur-md p-0 sm:p-5 animate-in fade-in duration-200">
          <div className="box-border w-full min-w-0 max-w-lg mx-0 overflow-x-hidden rounded-t-[28px] sm:rounded-[28px] border border-white/10 bg-[var(--card-bg)] p-5 shadow-2xl shadow-black/50 sm:p-6 space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-250 max-h-[92vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {pendingUploadData?.isSameSupplier ? (
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl bg-orange-500/15 text-orange-400 border border-orange-500/30">
                    <Building2 className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-black leading-tight text-[var(--text-main)]">
                    {pendingUploadData?.isSameSupplier ? 'Same Supplier Detected' : 'Different Supplier Detected'}
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {pendingUploadData?.isSameSupplier
                      ? `Both invoices from "${pendingUploadData.supplierName}"`
                      : 'Choose how to handle this new invoice'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowMergeChoiceModal(false); setPendingUploadRows(null); setPendingUploadData(null); }}
                className="flex-shrink-0 p-1.5 rounded-xl bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-px bg-[var(--border-color)]"/>

            {/* Comparison Cards: Different Supplier */}
            {!pendingUploadData?.isSameSupplier && (
              <div className="grid grid-cols-2 gap-2">
                {/* Current Card */}
                <div className="rounded-2xl bg-[var(--bg-color)]/70 border border-[var(--border-color)] p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">Current</span>
                    <span className="text-[9px] font-bold text-[var(--text-muted)]">{importedItems.length} items</span>
                  </div>
                  <p className="text-xs font-black text-[var(--text-main)] leading-tight line-clamp-2" title={pendingUploadData?.currentSupplierName}>
                    {pendingUploadData?.currentSupplierName || 'Current Receiving'}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-[var(--text-muted)]">Ref</span>
                      <span className="font-bold text-[var(--text-main)] truncate max-w-[80px]" title={newItem.sku || 'None'}>{newItem.sku || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-[var(--text-muted)]">Batch</span>
                      <span className="font-bold text-[var(--text-main)] truncate max-w-[80px]" title={newItem.batchNumber || 'None'}>{newItem.batchNumber || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-[var(--text-muted)]">Invoice</span>
                      <span className="font-bold text-[var(--text-main)] truncate max-w-[80px]" title={newItem.supplierInvoiceNumber || 'None'}>{newItem.supplierInvoiceNumber || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* New Scanned Card */}
                <div className="rounded-2xl bg-orange-500/5 border border-orange-500/25 p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-orange-400">New Scan</span>
                    <span className="text-[9px] font-bold text-orange-400">{pendingUploadData?.newRows?.length || pendingUploadRows?.length || 0} items</span>
                  </div>
                  <p className="text-xs font-black text-orange-300 leading-tight line-clamp-2" title={pendingUploadData?.supplierName}>
                    {pendingUploadData?.supplierName || 'New Supplier'}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-[var(--text-muted)]">Inv</span>
                      <span className="font-bold text-emerald-400 truncate max-w-[80px]" title={pendingUploadData?.invoiceNumber}>{pendingUploadData?.invoiceNumber || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-[var(--text-muted)]">Ref</span>
                      <span className="font-bold text-orange-400/70 italic">Auto</span>
                    </div>
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-[var(--text-muted)]">Batch</span>
                      <span className="font-bold text-orange-400/70 italic">Auto</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="rounded-2xl border border-[var(--border-color)]/50 bg-[var(--bg-color)]/30 px-4 py-3 text-[11px] text-[var(--text-muted)] leading-relaxed">
              {pendingUploadData?.isSameSupplier ? (
                <>
                  Card #1 has <strong className="text-[var(--text-main)] font-bold">{importedItems.length} items</strong> from <strong className="text-emerald-400 font-bold">{pendingUploadData.supplierName}</strong>. Merge <strong className="text-emerald-400 font-bold">{pendingUploadRows?.length || pendingUploadData.newRows?.length} new items</strong> — duplicates will combine quantities automatically.
                </>
              ) : (
                <>
                  These invoices are from <strong className="text-[var(--text-main)]">different suppliers</strong>. A separate card keeps Reference, Batch &amp; Invoice numbers independent for accurate audits.
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {!pendingUploadData?.isSameSupplier ? (
                <>
                  {/* Button 1: Create Separate Card (RECOMMENDED) */}
                  <button
                    type="button"
                    onClick={handleCreateSeparateCard}
                    className="relative flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-3.5 text-white shadow-lg shadow-orange-600/20 transition-all hover:from-orange-500 hover:to-amber-400 active:scale-[0.98] cursor-pointer"
                  >
                    <Layers className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-black leading-tight">Create Separate Card</div>
                      <div className="text-[10px] font-medium opacity-80 mt-0.5 truncate">{pendingUploadData?.supplierName || 'New Supplier'} · independent ref &amp; batch</div>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide">Recommended</span>
                  </button>

                  {/* Button 2: Merge into Card 1 anyway */}
                  <button
                    type="button"
                    onClick={handleMergeAppend}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-color)] px-4 py-3 text-[var(--text-main)] transition-all hover:bg-[var(--border-color)]/30 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-bold">Merge into Card #1</div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Combine items, quantities auto-added</div>
                    </div>
                  </button>

                  {/* Button 3: Replace Card 1 */}
                  <button
                    type="button"
                    onClick={handleMergeReplace}
                    className="flex w-full items-center gap-3 rounded-2xl border border-orange-500/20 bg-[var(--bg-color)] px-4 py-3 text-orange-400 transition-all hover:bg-orange-500/8 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-bold">Replace Card #1</div>
                      <div className="text-[10px] text-orange-400/60 mt-0.5">Discard current items, start fresh</div>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  {/* Same Supplier: Merge Items (RECOMMENDED) */}
                  <button
                    type="button"
                    onClick={handleMergeAppend}
                    className="relative flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-3.5 text-white shadow-lg shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-400 active:scale-[0.98] cursor-pointer"
                  >
                    <Plus className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-black">Merge into Card #1</div>
                      <div className="text-[10px] font-medium opacity-80 mt-0.5">Combine quantities, duplicates handled</div>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide">Recommended</span>
                  </button>

                  {/* Same Supplier: Separate Card */}
                  <button
                    type="button"
                    onClick={handleCreateSeparateCard}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-color)] px-4 py-3 text-[var(--text-main)] transition-all hover:bg-[var(--border-color)]/30 cursor-pointer"
                  >
                    <Layers className="h-4 w-4 flex-shrink-0 text-orange-400" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-bold">Keep as Separate Card</div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Independent ref#, batch# &amp; invoice</div>
                    </div>
                  </button>

                  {/* Same Supplier: Replace */}
                  <button
                    type="button"
                    onClick={handleMergeReplace}
                    className="flex w-full items-center gap-3 rounded-2xl border border-orange-500/20 bg-[var(--bg-color)] px-4 py-3 text-orange-400 transition-all hover:bg-orange-500/8 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-xs font-bold">Replace All</div>
                      <div className="text-[10px] text-orange-400/60 mt-0.5">Start fresh with new scanned items</div>
                    </div>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => { setShowMergeChoiceModal(false); setPendingUploadRows(null); setPendingUploadData(null); }}
                className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--bg-color)] hover:bg-[var(--border-color)]/30 text-[var(--text-muted)] font-semibold text-xs transition-all cursor-pointer border border-[var(--border-color)]"
              >
                Cancel Import
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Global Delete Modal */}
      <GlobalDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={isBulkDeleting ? 'Delete Selected Items' : 'Delete Inventory Item'}
        message={
          isBulkDeleting
            ? 'This will permanently remove the selected raw material / catalog items from your inventory catalog.'
            : 'This will permanently remove this item from your inventory catalog.'
        }
        itemName={isBulkDeleting ? undefined : itemToDelete?.name}
        itemCount={isBulkDeleting ? selectedInventoryIds.size : 1}
        isBulk={isBulkDeleting}
        confirmButtonText={isBulkDeleting ? `Delete ${selectedInventoryIds.size} Items` : 'Delete Item'}
        loading={deleteLoading}
        dangerLevel="danger"
        warningNotes={[
          'Deleting an item also permanently removes its recipe links, inventory logs, and receiving batches.',
          'This action cannot be undone. Review the selected item(s) before confirming.'
        ]}
      />

      {pendingAddSaveAction && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !savingDraft && !bulkSavingCatalog) setPendingAddSaveAction(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="add-save-confirm-title" className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-2xl">
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${pendingAddSaveAction.action === 'DRAFT' ? 'bg-amber-500/15 text-amber-600' : 'bg-orange-500/15 text-orange-600'}`}>
              <Save className="h-5 w-5" />
            </div>
            <h3 id="add-save-confirm-title" className="text-lg font-bold text-[var(--text-main)]">
              {pendingAddSaveAction.action === 'DRAFT'
                ? (pendingAddSaveAction.cardId ? `Save ${pendingAddSaveAction.cardId === 'card-1' ? 'Card #1' : `Card #${additionalDeliveryCards.findIndex(c => c.id === pendingAddSaveAction.cardId) + 2}`} as a draft?` : 'Save all deliveries as drafts?')
                : (pendingAddSaveAction.cardId ? `Save ${pendingAddSaveAction.cardId === 'card-1' ? 'Card #1' : `Card #${additionalDeliveryCards.findIndex(c => c.id === pendingAddSaveAction.cardId) + 2}`} new items to the catalog?` : 'Save current items to the catalog?')}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              {pendingAddSaveAction.action === 'DRAFT'
                ? (pendingAddSaveAction.cardId
                  ? 'This saves only this supplier card as a separate draft in Receiving History. New items stay in the draft, and stock and catalog will not change until the receiving is confirmed.'
                  : `This saves each supplier delivery separately (${additionalDeliveryCards.length + 1} delivery cards). New items stay in their drafts; stock and catalog will not change until a receiving is confirmed.`)
                : (pendingAddSaveAction.cardId
                  ? 'This saves only this card’s new item names to the inventory catalog with zero stock. Receiving quantities are not posted.'
                  : 'This saves new item names from the current deliveries to the inventory catalog with zero stock. Receiving quantities are not posted.')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={savingDraft || bulkSavingCatalog} onClick={() => setPendingAddSaveAction(null)} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={savingDraft || bulkSavingCatalog} onClick={confirmAddSaveAction} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-50">
                {(savingDraft || bulkSavingCatalog) && <RefreshCw className="h-4 w-4 animate-spin" />}
                {pendingAddSaveAction.action === 'DRAFT'
                  ? (pendingAddSaveAction.cardId ? 'Save Draft' : 'Save All Drafts')
                  : (pendingAddSaveAction.cardId ? 'Save New Items' : 'Save to Catalog')}
              </button>
            </div>
          </section>
        </div>, document.body
      )}

      {catalogImportResult && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCatalogImportResult(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="catalog-import-result-title" className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-2xl">
            <h3 id="catalog-import-result-title" className="text-lg font-bold text-[var(--text-main)]">Ingredient import summary</h3>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {[
                ['Total', catalogImportResult.summary.total ?? catalogImportResult.total],
                ['Imported', catalogImportResult.summary.imported ?? catalogImportResult.summary.savedCount ?? 0],
                ['Skipped', catalogImportResult.summary.skipped ?? catalogImportResult.summary.duplicates ?? 0],
                ['Duplicates', catalogImportResult.summary.duplicates ?? 0],
                ['Failed', catalogImportResult.summary.failed ?? catalogImportResult.summary.failedCount ?? 0],
              ].map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--border-color)] p-2"><div className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">{label}</div><div className="mt-1 font-bold text-[var(--text-main)]">{value}</div></div>)}
            </div>
            {(catalogImportResult.results || []).some(r => !r.success) && <div className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm">
              <div className="font-semibold text-red-500">Items needing correction</div>
              {catalogImportResult.results.filter(r => !r.success).map((r, i) => <div key={`${r.index}-${i}`} className="text-[var(--text-main)]"><span className="font-semibold">{r.name || `Row ${Number(r.index) + 1}`}:</span> <span className="text-[var(--text-muted)]">{r.error || 'Unknown failure'}</span></div>)}
            </div>}
            <button type="button" autoFocus onClick={() => setCatalogImportResult(null)} className="mt-5 w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white">Close</button>
          </section>
        </div>, document.body
      )}

      {draftSaveResult && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setDraftSaveResult(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="ingredient-draft-result-title" className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-2xl">
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${draftSaveResult.success ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>
              {draftSaveResult.success ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
            </div>
            <h3 id="ingredient-draft-result-title" className="text-lg font-bold text-[var(--text-main)]">{draftSaveResult.success ? 'Draft saved' : 'Draft not saved'}</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{draftSaveResult.message}</p>
            <button type="button" autoFocus onClick={() => setDraftSaveResult(null)} className="mt-5 w-full rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white">Close</button>
          </section>
        </div>, document.body
      )}

    </div>
  );
};

export default AdminInventoryView;
