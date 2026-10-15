const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../data');
const ALIASES_FILE = path.join(DATA_DIR, 'learned_aliases.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[AliasService] Could not create data directory:', err.message);
  }
}

/**
 * Phonetic Transliteration & Typo Fingerprinter
 * Unifies spelling mistakes, phonetic sound-alikes, and transliteration variations
 * across English and Roman Urdu (e.g. Pyaz vs Piyaz vs Piaz, Lehsan vs Lahsun, Toopick vs Toothpick).
 */
const getPhoneticFingerprint = (str) => {
  if (!str) return '';
  let s = String(str).toLowerCase().trim();

  // Normalize unicode/spaces
  s = s.replace(/[^\p{L}\p{N}]/gu, '');
  if (!s) return '';

  // Roman Urdu & English phonetic sound equivalences
  s = s
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/ch/g, 'c')
    .replace(/sh/g, 's')
    .replace(/zh/g, 'z')
    .replace(/bh/g, 'b')
    .replace(/dh/g, 'd')
    .replace(/jh/g, 'j')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/y/g, 'i')
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/au/g, 'o')
    .replace(/ai/g, 'e')
    .replace(/ay/g, 'e')
    .replace(/h/g, ''); // Silent/breathy 'h' in Roman Urdu e.g. lehsan vs lesan, pyaaz vs pyaz

  // Collapse consecutive duplicate characters: 'tt' -> 't', 'll' -> 'l'
  s = s.replace(/(.)\1+/g, '$1');
  return s;
};

// In-memory cache of learned aliases
let learnedAliasesCache = {};

// Load saved aliases from disk
const loadLearnedAliases = () => {
  if (!fs.existsSync(ALIASES_FILE)) {
    learnedAliasesCache = {};
    return learnedAliasesCache;
  }
  try {
    const raw = fs.readFileSync(ALIASES_FILE, 'utf8');
    learnedAliasesCache = JSON.parse(raw || '{}');
  } catch (err) {
    console.warn('[AliasService] Failed to load learned aliases:', err.message);
    learnedAliasesCache = {};
  }
  return learnedAliasesCache;
};

// Persist to disk
const persistLearnedAliases = () => {
  try {
    fs.writeFileSync(ALIASES_FILE, JSON.stringify(learnedAliasesCache, null, 2), 'utf8');
  } catch (err) {
    console.warn('[AliasService] Failed to persist learned aliases:', err.message);
  }
};

// Initial load
loadLearnedAliases();

/**
 * Returns all learned aliases
 */
const getLearnedAliases = () => {
  return learnedAliasesCache;
};

/**
 * Saves a confirmed alias mapping (e.g. when an admin accepts a suggested match or adds an alias)
 * @param {string} rawName Scanned or user-entered name (e.g. "Toopick" or "Piaz")
 * @param {string} canonicalName Catalog target item name (e.g. "Toothpicks" or "Onions")
 * @param {number|null} inventoryItemId Target item ID
 */
const saveLearnedAlias = (rawName, canonicalName, inventoryItemId = null) => {
  if (!rawName || !canonicalName) return false;
  const cleanRaw = String(rawName).trim().toLowerCase();
  const cleanCanonical = String(canonicalName).trim();

  if (!cleanRaw || !cleanCanonical) return false;

  learnedAliasesCache[cleanRaw] = {
    canonicalName: cleanCanonical,
    inventoryItemId: inventoryItemId ? parseInt(inventoryItemId, 10) : null,
    confirmedAt: new Date().toISOString()
  };

  persistLearnedAliases();
  console.log(`[AliasService] Learned new alias: "${cleanRaw}" -> "${cleanCanonical}" (ID: ${inventoryItemId})`);
  return true;
};

module.exports = {
  getPhoneticFingerprint,
  getLearnedAliases,
  saveLearnedAlias,
  loadLearnedAliases
};
