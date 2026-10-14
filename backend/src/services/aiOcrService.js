/**
 * AI / OCR Invoice & Excel/CSV Parsing and Catalog Matching Service for ZovikPOS
 * Supports .xlsx, .xls, .csv files, PDF/image OCR text, Groq AI Vision scan, and matches rows against InventoryItem catalog.
 */
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');
const { prisma } = require('../config/db');
const { analyzeInvoiceImageWithGroq, parseInvoiceTextWithGroq } = require('./groqService');

/**
 * Normalizes header string for fuzzy matching
 */
const normalizeHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Normalizes item names for exact and token comparison
 */
const normalizeItemName = (str) => {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
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

// Urdu / English POS Alias Dictionary for Smart Match (exact term mappings)
const ITEM_ALIASES_MAP = {
  'aloo': ['potatoes'],
  'pyaz': ['onions'],
  'pyaaz': ['onions'],
  'tamatar': ['tomatoes'],
  'doodh': ['fresh milk', 'milk'],
  'anda': ['eggs'],
  'anday': ['eggs'],
  'adrak': ['ginger'],
  'lehsan': ['garlic'],
  'lahsan': ['garlic'],
  'hari mirch': ['green chillies'],
  'dahi': ['yogurt'],
  'makhan': ['butter'],
  'aata': ['wheat flour'],
  'maida': ['refined flour', 'maida'],
  'besan': ['gram flour', 'besan'],
  'chawal': ['basmati rice'],
  'tel': ['cooking oil'],
  'namak': ['salt'],
  'haldi': ['turmeric powder'],
  'lal mirch': ['red chilli powder'],
  'zeera': ['cumin seeds'],
  'chai patti': ['tea leaves'],
  'cheeni': ['sugar'],
  'shakar': ['sugar'],
  'ketchup': ['tomato ketchup'],
  'mayo': ['mayonnaise']
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

  // 2. Exact Normalized Name Match
  const exactMatch = catalogItems.find(c => normalizeItemName(c.name) === cleanRaw);
  if (exactMatch) {
    return { item: exactMatch, status: 'MATCHED', confidence: 1.0, matchType: 'EXACT_NAME' };
  }

  // 3. Approved POS / Alias Match
  for (const [aliasKey, targetWords] of Object.entries(ITEM_ALIASES_MAP)) {
    if (cleanRaw === aliasKey || cleanRaw.startsWith(aliasKey + ' ') || cleanRaw.endsWith(' ' + aliasKey) || cleanRaw.includes(' ' + aliasKey + ' ')) {
      for (const targetWord of targetWords) {
        const aliasMatch = catalogItems.find(c => {
          const normCat = normalizeItemName(c.name);
          return normCat === targetWord || normCat.includes(targetWord) || targetWord.includes(normCat);
        });
        if (aliasMatch && !hasConflictingVariants(rawName, aliasMatch.name)) {
          return { item: aliasMatch, status: 'MATCHED', confidence: 0.95, matchType: 'APPROVED_ALIAS' };
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
  let extractedInvoiceNumber = null;
  let extractedDate = null;
  let detectedSupplierName = supplierNameHint || null;
  let detectedTotal = null;

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
          if (groqResult.supplierName) detectedSupplierName = groqResult.supplierName;
          if (groqResult.invoiceNumber) extractedInvoiceNumber = groqResult.invoiceNumber;
          if (groqResult.date) extractedDate = groqResult.date;
          if (groqResult.invoiceTotal) detectedTotal = groqResult.invoiceTotal;

          for (const item of groqResult.items) {
            if (item.rawName) {
              const qty = parseFloat(item.quantity) || 1;
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
                needsReview: Boolean(item.needsReview) || (unitCost <= 0),
                reviewReason: item.reviewReason || (unitCost <= 0 ? 'Zero or missing unit price' : null)
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
      if (groqResult.supplierName) detectedSupplierName = groqResult.supplierName;
      if (groqResult.invoiceNumber) extractedInvoiceNumber = groqResult.invoiceNumber;
      if (groqResult.date) extractedDate = groqResult.date;
      if (groqResult.invoiceTotal) detectedTotal = groqResult.invoiceTotal;

      for (const item of groqResult.items) {
        if (item.rawName) {
          const qty = parseFloat(item.quantity) || 1;
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
            needsReview: Boolean(item.needsReview) || (unitCost <= 0),
            reviewReason: item.reviewReason || (unitCost <= 0 ? 'Zero or missing unit price' : null)
          });
        }
      }
    }
  }

  // 3. Process Excel / CSV file buffer or base64 if provided and not image/pdf
  if (rawRows.length === 0 && !isPdf && (fileBuffer || fileBase64)) {
    try {
      const buffer = fileBuffer || Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const sheetJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (sheetJson && sheetJson.length > 0) {
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(5, sheetJson.length); i++) {
          const row = sheetJson[i].map(c => String(c).toLowerCase());
          if (row.some(c => c.includes('item') || c.includes('name') || c.includes('qty') || c.includes('quantity') || c.includes('product'))) {
            headerRowIndex = i;
            break;
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

        for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
          const row = sheetJson[i];
          if (!row || row.length === 0) continue;

          const rawName = nameIdx !== -1 ? String(row[nameIdx]).trim() : String(row[0]).trim();
          const sku = skuIdx !== -1 ? String(row[skuIdx]).trim() : null;
          const qtyVal = qtyIdx !== -1 ? parseFloat(row[qtyIdx]) : parseFloat(row[1]);
          const unitVal = unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : 'KG';
          const costVal = costIdx !== -1 && row[costIdx] ? parseFloat(row[costIdx]) : 0;
          const batchVal = batchIdx !== -1 && row[batchIdx] ? String(row[batchIdx]).trim() : null;
          const expVal = expIdx !== -1 && row[expIdx] ? String(row[expIdx]).trim() : null;

          if (rawName && !isNaN(qtyVal) && qtyVal > 0) {
            rawRows.push({
              rawName,
              sku: sku || null,
              quantity: qtyVal,
              unit: unitVal.toUpperCase(),
              unitCost: isNaN(costVal) ? 0 : costVal,
              totalCost: (qtyVal * (isNaN(costVal) ? 0 : costVal)),
              batchNumber: batchVal || null,
              expiryDate: expVal || null,
              needsReview: false,
              reviewReason: null
            });
          }
        }
      }
    } catch (excelErr) {
      console.warn('[AI OCR] Excel parse error:', excelErr.message);
    }
  }

  // 4. Fallback to rawText / CSV string parser if file buffer didn't yield rows
  if (rawRows.length === 0 && rawText && typeof rawText === 'string') {
    try {
      const csvBuffer = Buffer.from(rawText, 'utf-8');
      const workbook = XLSX.read(csvBuffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const sheetJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (sheetJson && sheetJson.length > 1) {
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(5, sheetJson.length); i++) {
          const row = sheetJson[i].map(c => String(c).toLowerCase());
          if (row.some(c => c.includes('item') || c.includes('name') || c.includes('qty') || c.includes('quantity') || c.includes('product'))) {
            headerRowIndex = i;
            break;
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

        if (nameIdx !== -1) {
          for (let i = headerRowIndex + 1; i < sheetJson.length; i++) {
            const row = sheetJson[i];
            if (!row || row.every(c => !c)) continue;

            const rawName = String(row[nameIdx] || '').trim();
            const sku = skuIdx !== -1 ? String(row[skuIdx] || '').trim() : null;
            const qtyVal = qtyIdx !== -1 ? parseFloat(row[qtyIdx]) : parseFloat(row[1]);
            const unitVal = unitIdx !== -1 && row[unitIdx] ? String(row[unitIdx]).trim() : 'KG';
            const costVal = costIdx !== -1 && row[costIdx] ? parseFloat(row[costIdx]) : 0;
            const batchVal = batchIdx !== -1 && row[batchIdx] ? String(row[batchIdx]).trim() : null;
            const expVal = expIdx !== -1 && row[expIdx] ? String(row[expIdx]).trim() : null;

            if (rawName && !isNaN(qtyVal) && qtyVal > 0) {
              rawRows.push({
                rawName,
                sku: sku || null,
                quantity: qtyVal,
                unit: unitVal.toUpperCase(),
                unitCost: isNaN(costVal) ? 0 : costVal,
                totalCost: (qtyVal * (isNaN(costVal) ? 0 : costVal)),
                batchNumber: batchVal || null,
                expiryDate: expVal || null,
                needsReview: false,
                reviewReason: null
              });
            }
          }
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
  const warnings = [];
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
        sku: item.sku || null,
        quantity: item.quantity,
        unit: item.unit || 'KG',
        unitCost: item.unitCost || 0,
        totalCost: item.totalCost || (item.quantity * (item.unitCost || 0)),
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
        confidence: matchResult ? matchResult.confidence : 0,
        matchType: matchResult ? matchResult.matchType : 'NONE',
        status: itemStatus,
        suggestedItem: matchResult?.suggestedItem || null,
        needsReview: Boolean(item.needsReview),
        reviewReason: item.reviewReason || (itemStatus === 'REVIEW_MATCH' ? `Suggested match: ${matchResult?.suggestedItem?.name}` : null)
      });
    }
  }

  // Count distinct categories
  const matchedCount = matched.filter(m => m.status === 'MATCHED').length;
  const reviewMatchCount = unmatched.filter(u => u.status === 'REVIEW_MATCH').length;
  const newItemsCount = unmatched.filter(u => u.status === 'NEW_ITEM').length;
  const needsReviewCount = [...matched, ...unmatched].filter(i => i.status === 'NEEDS_REVIEW').length;

  return {
    success: true,
    fileName: fileName || null,
    invoiceNumber: extractedInvoiceNumber || `INV-${Math.floor(10000 + Math.random() * 90000)}`,
    receivingDate: extractedDate || new Date().toISOString().split('T')[0],
    supplierName: detectedSupplierName || 'General Supplier / Market Purchase',
    invoiceTotal: detectedTotal,
    matchedItems: matched,
    unmatchedItems: unmatched,
    warnings,
    summary: {
      totalRows: rawRows.length,
      matchedCount,
      reviewMatchCount,
      newItemsCount,
      needsReviewCount,
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
