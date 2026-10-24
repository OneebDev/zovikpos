const axios = require('axios');
const { createWorker } = require('tesseract.js');

/**
 * ─── DYNAMIC KEY ROTATION SYSTEM ────────────────────────────────────────────
 *
 * Automatically reads ALL env variables matching GROQ_API_KEY or GROQ_API_KEY_N
 * (N can be any number or suffix). To add a new key, simply add to .env:
 *   GROQ_API_KEY_11="gsk_..."
 *   GROQ_API_KEY_12="gsk_..."
 * No code changes needed. Keys are picked up at runtime automatically.
 *
 * Rotation strategy:
 *   - Round-robin across all available keys.
 *   - Per-key 429 cooldown tracking: if a key returns 429, it is skipped for
 *     KEY_COOLDOWN_MS milliseconds before being tried again.
 *   - On 401 (invalid) the key is permanently blacklisted for this session.
 *   - Vision requests: only qwen/qwen3.8-27b (vision-capable). Output capacity
 *     is sized for long invoices; account rate limits use the normal key rotation.
 *   - Text requests: tries preferred model, then the full fallback list.
 *   - ALL rotation is internal — no UI/system model selector is changed.
 */

const KEY_COOLDOWN_MS = 62000; // 62s cooldown after a 429 (Groq resets OTPM per minute)
const redactGroqSecrets = (value) => getGroqKeys().reduce(
  (message, key) => message.split(key).join('[redacted]'),
  String(value || 'Unknown error')
).replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]');

/**
 * Dynamically discover all GROQ_API_KEY* variables from process.env.
 * Supports: GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, ..., GROQ_API_KEY_N
 */
const getGroqKeys = () => {
  const keys = Object.entries(process.env)
    .filter(([varName]) => /^GROQ_API_KEY(_\d+)?$/.test(varName))
    .sort(([a], [b]) => {
      // Sort: GROQ_API_KEY first, then GROQ_API_KEY_2, _3, ... in numeric order
      const numA = a === 'GROQ_API_KEY' ? 0 : parseInt(a.replace('GROQ_API_KEY_', ''), 10) || 999;
      const numB = b === 'GROQ_API_KEY' ? 0 : parseInt(b.replace('GROQ_API_KEY_', ''), 10) || 999;
      return numA - numB;
    })
    .map(([, value]) => value)
    .filter(Boolean);

  if (keys.length === 0) {
    console.warn('[GroqService] ⚠ No GROQ_API_KEY* variables found in .env!');
  }

  return keys;
};

/**
 * Get the default Groq model from env, fallback to a reliable default
 */
const getGroqModel = () => {
  return process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
};

// ── Runtime rotation state (persists across calls within same server session) ──
let currentKeyIndex = 0;
// Map<apiKey, cooldownExpiresAt(ms)> — per-key 429 cooldown tracking
const keyCooldownMap = new Map();
// Set<apiKey> — permanently blacklisted (401 invalid) for this session
const keyBlacklist = new Set();

/**
 * Get the next available API key in round-robin, skipping cooled-down or
 * blacklisted keys. Returns null if all keys are unavailable.
 */
const getNextGroqKey = (skipKeys = new Set()) => {
  const keys = getGroqKeys();
  if (keys.length === 0) return null;

  const now = Date.now();
  const total = keys.length;

  for (let i = 0; i < total; i++) {
    const idx = (currentKeyIndex + i) % total;
    const key = keys[idx];

    // Skip blacklisted (permanently invalid) keys
    if (keyBlacklist.has(key)) continue;
    // Skip keys in 429 cooldown
    const cooldownUntil = keyCooldownMap.get(key) || 0;
    if (cooldownUntil > now) continue;
    // Skip explicitly requested skip list (already tried in this call)
    if (skipKeys.has(key)) continue;

    // Found a usable key — advance index for next call
    currentKeyIndex = (idx + 1) % total;
    return key;
  }

  return null; // All keys exhausted / cooling down
};

/**
 * Mark a key as rate-limited (429) — enter cooldown for KEY_COOLDOWN_MS
 */
const markKeyCooling = (key) => {
  keyCooldownMap.set(key, Date.now() + KEY_COOLDOWN_MS);
  console.warn(`[GroqService] An API key is cooling down for ${KEY_COOLDOWN_MS / 1000}s (429 rate limit).`);
};

/**
 * Mark a key as permanently invalid (401) for this session
 */
const markKeyBlacklisted = (key) => {
  keyBlacklist.add(key);
  console.warn('[GroqService] An API key was rejected (401) and disabled for this server session.');
};

/**
 * ─── CORE GROQ API CALLER ────────────────────────────────────────────────────
 * Calls Groq Chat Completions API.
 *
 * Key rotation: round-robin across all 16+ keys, with per-key 429 cooldown
 * tracking and 401 blacklisting. All happens at runtime — no UI changes.
 *
 * Model rotation: vision requests use only qwen/qwen3.8-27b (only vision model).
 * Text requests try the preferred model, then fallback list.
 */
const callGroqAPI = async (payload, retries = null) => {
  const keys = getGroqKeys();
  if (keys.length === 0) {
    throw new Error('[GroqService] No Groq API keys available.');
  }

  // Detect if this request contains an image (Vision API)
  const isVisionRequest = Array.isArray(payload.messages) && payload.messages.some(m =>
    Array.isArray(m.content) && m.content.some(c => c && c.type === 'image_url')
  );

  // Vision requests must ONLY use vision-capable models (qwen/qwen3.8-27b).
  // Text-only models will throw HTTP 400 Bad Request on image_url content.
  // For text requests, try preferred model first, then rotate through fallbacks.
  const fallbackModels = isVisionRequest
    ? ['qwen/qwen3.8-27b']
    : [
        payload.model || getGroqModel(),
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3.8-27b',
        'allam-2-7b'
      ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError = null;

  for (const modelCandidate of fallbackModels) {
    // Keep image extraction large enough for long invoices (100 compact item rows fit comfortably).
    // This is a per-response ceiling; account OTPM limits are handled by normal 429 key rotation.
    const tokenLimit = isVisionRequest ? Math.min(payload.max_tokens || 880, 880) : (payload.max_tokens || 8192);
    const currentPayload = {
      ...payload,
      model: modelCandidate,
      max_tokens: tokenLimit
    };

    // Try ALL available keys for this model before moving to next model
    const triedKeysForModel = new Set();
    const maxKeysToTry = Math.min(keys.length, retries !== null ? retries : keys.length);

    for (let attempt = 0; attempt < maxKeysToTry; attempt++) {
      const apiKey = getNextGroqKey(triedKeysForModel);

      if (!apiKey) break; // Keys are invalid, cooling down, or already tried; report the failure promptly.

      triedKeysForModel.add(apiKey);

      try {
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          currentPayload,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: Number(process.env.GROQ_TIMEOUT_MS) || 20000
          }
        );
        return response.data;
      } catch (err) {
        lastError = err;
        const status = err.response?.status;
        const errMsg = redactGroqSecrets(err.response?.data?.error?.message || err.message);
        console.warn(`[GroqService] Request failed for model ${modelCandidate} (HTTP ${status || 'network'}): ${errMsg.substring(0, 120)}`);

        if (status === 429) {
          // Rate limited: put this key in cooldown and try next key
          markKeyCooling(apiKey);
          continue;
        }
        if (status === 401) {
          // Invalid key: blacklist permanently for this session
          markKeyBlacklisted(apiKey);
          continue;
        }
        if (status === 503 || status === 502 || status === 500 || status === 408 || !status) {
          // Transient provider/network failure: try another key, then the next model.
          continue;
        }
        // Invalid model/request (404, 400, 422, etc.): move to the next model.
        break;
      }
    }
  }

  console.error(`[GroqService] All ${keys.length} API keys and ${fallbackModels.length} models exhausted.`);
  throw lastError;
};

/**
 * ─── TESSERACT OCR ───────────────────────────────────────────────────────────
 * Extract raw text from image buffer using Tesseract.js (fallback for non-vision models)
 */
const extractTextFromImageOCR = async (imageBase64Data) => {
  let worker = null;
  try {
    const cleanBase64 = imageBase64Data.includes(',')
      ? imageBase64Data.split(',')[1]
      : imageBase64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');

    worker = await createWorker('eng');
    const ret = await worker.recognize(buffer).catch(() => ({ data: { text: '' } }));
    await worker.terminate().catch(() => {});
    const rawText = ret.data?.text || '';
    return rawText.replace(/[^\x20-\x7E\r\n\t]/g, '');
  } catch (err) {
    if (worker) await worker.terminate().catch(() => {});
    console.error('[GroqService] Tesseract OCR error:', redactGroqSecrets(err.message));
    return '';
  }
};

const invoiceRowNumber = (item) => Number.parseInt(item.sourceRowNumber ?? item.rowNumber ?? item.row ?? item.r, 10) || null;
const hasSequentialInvoiceRows = (items) => {
  const numbers = items.map(invoiceRowNumber);
  return numbers.length > 0 && numbers.every(Number.isInteger) && new Set(numbers).size === numbers.length &&
    [...numbers].sort((a, b) => a - b).every((number, index) => number === index + 1);
};

// When parsers disagree, a complete numbered OCR sequence is the most reliable
// source for the number of invoice rows. Otherwise keep the numbered vision list
// when both passes agree, and let the existing fuzzy merge handle unnumbered files.
const preferCompleteNumberedInvoiceItems = (visionItems, ocrItems) => {
  const visionNumbered = hasSequentialInvoiceRows(visionItems);
  const ocrNumbered = hasSequentialInvoiceRows(ocrItems);
  if (ocrNumbered && (!visionNumbered || ocrItems.length !== visionItems.length)) return ocrItems;
  if (visionNumbered && ocrNumbered) return visionItems;
  // A complete numbered sequence is already a count-checked invoice list.
  // Do not merge unnumbered OCR guesses into it (for example, a phantom 11th row).
  if (visionNumbered) return visionItems;
  return null;
};

/**
 * ─── INVOICE OCR + AI VISION PARSER ──────────────────────────────────────────
 * Parse a purchase receipt or invoice image (printed, handwritten, or mixed).
 */
/**
 * Helper: parse raw vision content string into an array of normalized item objects.
 */
const _parseVisionContent = (content) => {
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed = null;
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch {
    try {
      let repaired = cleaned;
      const objStart = repaired.indexOf('{');
      if (objStart >= 0) {
        repaired = repaired.substring(objStart);
        const lastClose = repaired.lastIndexOf('}');
        if (lastClose > 0) {
          repaired = repaired.substring(0, lastClose + 1);
          const ob = (repaired.match(/\{/g) || []).length;
          const cb = (repaired.match(/\}/g) || []).length;
          const obrk = (repaired.match(/\[/g) || []).length;
          const cbrk = (repaired.match(/\]/g) || []).length;
          for (let i = 0; i < obrk - cbrk; i++) repaired += ']';
          for (let i = 0; i < ob - cb; i++) repaired += '}';
          parsed = JSON.parse(repaired);
        }
      }
    } catch { /* repair failed */ }
  }
  if (!parsed || !Array.isArray(parsed.items)) return { meta: parsed, items: [] };
  const items = parsed.items.map(it => {
    const rawName = it.rawName || it.name || it.n || it.item || '';
    const parsedQty = Number.parseFloat(it.quantity ?? it.qty ?? it.q);
    const qty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;
    const cost = parseFloat(it.unitCost || it.price || it.rate || it.cost || it.p) || 0;
    const tot = parseFloat(it.totalCost || it.total) || (qty * cost);
    return {
      sourceRowNumber: Number.parseInt(it.sourceRowNumber ?? it.rowNumber ?? it.row ?? it.r, 10) || null,
      rawName: String(rawName).trim(),
      quantity: qty,
      unit: (it.unit || it.u || 'KG').toUpperCase(),
      unitCost: cost,
      totalCost: tot,
      batchNumber: it.batchNumber || null,
      expiryDate: it.expiryDate || null,
      needsReview: Boolean(it.needsReview) || !(qty > 0) || (cost <= 0),
      reviewReason: it.reviewReason || (!(qty > 0) ? 'Quantity missing or invalid; verify before receiving' : cost <= 0 ? 'Zero or missing unit price' : null)
    };
  }).filter(it => it.rawName && it.rawName.length > 0 && it.rawName.toLowerCase() !== 'item name');
  return { meta: parsed, items };
};

const analyzeInvoiceImageWithGroq = async (imageBase64Data) => {
  // Ultra-compact JSON format to ensure 50+ items easily fit within token limits
  const invoicePrompt = `You are a professional restaurant & canteen invoice vision extractor.
Scan the entire document with extreme precision.

IMPORTANT INVOICE LAYOUT RULES:
1. Two-Column Tables: Look carefully across the entire page. Invoices or purchase sheets often have TWO separate columns side-by-side (for example: Sr. No 1 to 17 on the left, and Sr. No 18 to 33 on the right). You MUST extract EVERY row from the left table AND EVERY row from the right table!
2. Complete Sequential Extraction: Do NOT skip any row. If items are numbered from 1 to 33, extract all 33 items without stopping early.
3. Metadata Extraction:
   - "s": Supplier or vendor name (e.g., look for "Purchased From: XYZ" or company header). If explicitly printed, return it. If absent, return null. NEVER guess.
   - "inv": Invoice / Bill # or null
   - "d": Date formatted as YYYY-MM-DD or as printed
   - "sub": Sub Total amount if printed (numeric)
   - "disc": Discount currency amount if printed (numeric)
   - "discPct": Discount percentage if printed (numeric without %)
   - "tot": Total / Net Amount if printed (numeric)
4. Items Array Format:
   For each item row: {"r": serialNumber, "n": "exact item name", "u": "unit like KG/Can/Pack/Pos/Bottle/Dozen", "q": quantity, "p": unit rate/price}
5. Do NOT include Sub Total, Discount, or Total Amount lines inside the items array.

Output strictly valid JSON with no markdown tags or explanatory text:
{"s":null,"inv":null,"d":null,"sub":null,"disc":null,"discPct":null,"tot":null,"items":[{"r":1,"n":"Item Name","u":"KG","q":1,"p":100}]}`;

  let visionItems = [];
  let detectedSupplierName = null;
  let extractedInvoiceNumber = null;
  let extractedDate = null;
  let detectedTotal = null;
  let detectedSubtotal = null;
  let detectedDiscount = null;
  let detectedDiscountPercent = null;
  const extractionWarnings = [];

  // ── Strategy 1: Groq Vision API (direct multimodal image understanding) ────
  try {
    console.log('[GroqService] Attempting Groq Vision API for invoice image...');

    const imageUrl = imageBase64Data.startsWith('data:')
      ? imageBase64Data
      : `data:image/jpeg;base64,${imageBase64Data}`;

    const resData = await callGroqAPI({
      model: 'qwen/qwen3.8-27b',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: invoicePrompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }],
      temperature: 0.05,
      max_tokens: 4096
    });

    if (resData) {
      const content = resData.choices?.[0]?.message?.content || '';
      const finishReason = resData.choices?.[0]?.finish_reason;
      if (finishReason === 'length') extractionWarnings.push('Vision model output reached its token limit; review the last extracted rows against the invoice.');
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsed = null;
      try {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {
        try {
          let repaired = cleaned;
          const objStart = repaired.indexOf('{');
          if (objStart >= 0) {
            repaired = repaired.substring(objStart);
            const lastCompleteItem = repaired.lastIndexOf('}');
            if (lastCompleteItem > 0) {
              repaired = repaired.substring(0, lastCompleteItem + 1);
              const openBraces = (repaired.match(/\{/g) || []).length;
              const closeBraces = (repaired.match(/\}/g) || []).length;
              const openBrackets = (repaired.match(/\[/g) || []).length;
              const closeBrackets = (repaired.match(/\]/g) || []).length;
              for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
              for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
              parsed = JSON.parse(repaired);
            }
          }
        } catch {
          // Truncated output repair can fail; the caller handles an empty result.
        }
      }

      if (parsed) {
        detectedSupplierName = parsed.supplierName || parsed.s || null;
        extractedInvoiceNumber = parsed.invoiceNumber || parsed.inv || null;
        extractedDate = parsed.date || parsed.d || null;
        detectedTotal = parsed.invoiceTotal || parsed.tot || null;
        detectedSubtotal = parsed.subtotal ?? parsed.sub ?? null;
        detectedDiscount = parsed.discount ?? parsed.disc ?? null;
        detectedDiscountPercent = parsed.discountPercent ?? parsed.discountPercentage ?? parsed.discPct ?? null;

        if (Array.isArray(parsed.items)) {
          visionItems = parsed.items.map(it => {
            const rawName = it.rawName || it.name || it.n || it.item || '';
            const parsedQty = Number.parseFloat(it.quantity ?? it.qty ?? it.q);
            const qty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;
            const cost = parseFloat(it.unitCost || it.price || it.rate || it.cost || it.p) || 0;
            const tot = parseFloat(it.totalCost || it.total) || (qty * cost);
            return {
              sourceRowNumber: Number.parseInt(it.sourceRowNumber ?? it.rowNumber ?? it.row ?? it.r, 10) || null,
              rawName: String(rawName).trim(),
              quantity: qty,
              unit: (it.unit || it.u || 'KG').toUpperCase(),
              unitCost: cost,
              totalCost: tot,
              batchNumber: it.batchNumber || null,
              expiryDate: it.expiryDate || null,
              needsReview: Boolean(it.needsReview) || !(qty > 0) || (cost <= 0),
              reviewReason: it.reviewReason || (!(qty > 0) ? 'Quantity missing or invalid; verify before receiving' : cost <= 0 ? 'Zero or missing unit price' : null)
            };
          }).filter(it => it.rawName && it.rawName.length > 0 && it.rawName.toLowerCase() !== 'item name');

          console.log(`[GroqService] Vision API extracted ${visionItems.length} items (finish_reason: ${finishReason}).`);
        }
      }
    }
  } catch (visionErr) {
    console.warn('[GroqService] Vision API failed, continuing to OCR:', redactGroqSecrets(visionErr.message));
  }

  // Fast Return: If Vision API already extracted the items without cutting off early
  if (visionItems.length > 0) {
    console.log(`[GroqService] ✓ Vision successfully extracted ${visionItems.length} items.`);
    return {
      supplierName: detectedSupplierName,
      invoiceNumber: extractedInvoiceNumber,
      date: extractedDate,
      invoiceTotal: detectedTotal,
      subtotal: detectedSubtotal,
      discount: detectedDiscount,
      discountPercent: detectedDiscountPercent,
      items: visionItems,
      warnings: extractionWarnings
    };
  }

  // ── Strategy 2: Tesseract OCR + Text LLM Fallback (only runs if Vision got 0 items) ───
  try {
    const extractedText = await extractTextFromImageOCR(imageBase64Data);

    if (extractedText && extractedText.trim().length >= 10) {
      console.log(`[GroqService] Vision found no items. Running Tesseract OCR + LLM pass...`);
      const ocrResult = await parseInvoiceTextWithGroq(extractedText);

      if (ocrResult && Array.isArray(ocrResult.items) && ocrResult.items.length > 0) {
        if (visionItems.length === 0) {
          return ocrResult;
        }

        const numberedItems = preferCompleteNumberedInvoiceItems(visionItems, ocrResult.items);
        if (numberedItems) {
          const countWarning = visionItems.length !== ocrResult.items.length
            ? [`Image and OCR passes found ${visionItems.length} and ${ocrResult.items.length} rows; kept the complete numbered row sequence.`]
            : [];
          return {
            supplierName: detectedSupplierName || ocrResult.supplierName,
            invoiceNumber: extractedInvoiceNumber || ocrResult.invoiceNumber,
            date: extractedDate || ocrResult.date,
            invoiceTotal: detectedTotal || ocrResult.invoiceTotal,
            subtotal: detectedSubtotal ?? ocrResult.subtotal ?? null,
            discount: detectedDiscount ?? ocrResult.discount ?? null,
            discountPercent: detectedDiscountPercent ?? ocrResult.discountPercent ?? null,
            items: numberedItems,
            warnings: [...extractionWarnings, ...countWarning, ...(ocrResult.warnings || [])]
          };
        }

        const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const merged = [...visionItems];
        const seenNorms = new Set(visionItems.map(v => normalize(v.rawName)));

        for (const oItem of ocrResult.items) {
          const oNorm = normalize(oItem.rawName);
          if (!oNorm) continue;
          const oRowNumber = invoiceRowNumber(oItem);
          if (oRowNumber && merged.some((item) => invoiceRowNumber(item) === oRowNumber)) continue;

          // Deduplicate accurately: only skip if same or close prefix match
          const alreadyFound = seenNorms.has(oNorm) ||
            [...seenNorms].some(sn => (sn.length >= 5 && oNorm.length >= 5 && (sn.startsWith(oNorm.slice(0, 6)) || oNorm.startsWith(sn.slice(0, 6)))));
          if (!alreadyFound) {
            merged.push(oItem);
            seenNorms.add(oNorm);
          }
        }

        const newlyFound = merged.length - visionItems.length;
        if (newlyFound > 0) {
          console.log(`[GroqService] ✓ DUAL-PASS: Recovered ${newlyFound} missed item(s) from OCR! Total=${merged.length} items.`);
        }

        return {
          supplierName: detectedSupplierName || ocrResult.supplierName,
          invoiceNumber: extractedInvoiceNumber || ocrResult.invoiceNumber,
          date: extractedDate || ocrResult.date,
          invoiceTotal: detectedTotal || ocrResult.invoiceTotal,
          subtotal: detectedSubtotal ?? ocrResult.subtotal ?? null,
          discount: detectedDiscount ?? ocrResult.discount ?? null,
          discountPercent: detectedDiscountPercent ?? ocrResult.discountPercent ?? null,
          items: merged,
          warnings: [...extractionWarnings, ...(ocrResult.warnings || [])]
        };
      }
    }
  } catch (ocrErr) {
    console.warn('[GroqService] OCR pass encountered issue:', redactGroqSecrets(ocrErr.message));
  }

  // Return whatever vision extracted
  if (visionItems.length > 0) {
    return {
      supplierName: detectedSupplierName,
      invoiceNumber: extractedInvoiceNumber,
      date: extractedDate,
      invoiceTotal: detectedTotal,
      subtotal: detectedSubtotal,
      discount: detectedDiscount,
      discountPercent: detectedDiscountPercent,
      items: visionItems,
      warnings: extractionWarnings
    };
  }

  return null;
};

/**
 * ─── PARSE EXTRACTED INVOICE TEXT WITH GROQ LLM ──────────────────────────────
 * Used for PDF extracted text, OCR extracted text, and unstructured receipts.
 */
const parseInvoiceTextWithGroq = async (invoiceText) => {
  if (!invoiceText || typeof invoiceText !== 'string' || invoiceText.trim().length < 5) {
    return null;
  }

  // To support 100+ items and multi-page invoices without truncation or fabricated data:
  // We chunk very long text (up to ~96k chars total, 16k chars per chunk, max 6 chunks).
  const CHUNK_SIZE = 16000;
  const rawText = invoiceText.trim();
  const textChunks = [];
  
  if (rawText.length <= CHUNK_SIZE) {
    textChunks.push(rawText);
  } else {
    // Split by newlines so lines are not bisected
    const lines = rawText.split(/\r?\n/);
    let currentChunk = '';
    for (const line of lines) {
      if ((currentChunk.length + line.length + 1) > CHUNK_SIZE && currentChunk.length > 0) {
        textChunks.push(currentChunk);
        currentChunk = line;
        if (textChunks.length >= 6) break; // Maximum 6 chunks (~96KB)
      } else {
        currentChunk = currentChunk ? (currentChunk + '\n' + line) : line;
      }
    }
    if (currentChunk && textChunks.length < 6) {
      textChunks.push(currentChunk);
    }
  }

  let mergedSupplier = null;
  let mergedInvoiceNumber = null;
  let mergedDate = null;
  let mergedSubtotal = null;
  let mergedDiscount = null;
  let mergedDiscountPercent = null;
  let mergedInvoiceTotal = null;
  const mergedItems = [];
  const extractionWarnings = [];
  const seenRowKeys = new Set();

  for (let idx = 0; idx < textChunks.length; idx++) {
    const chunkText = textChunks[idx];
    const isFirstChunk = idx === 0;

    const chunkPrompt = `You are an expert Restaurant POS Invoice & Receipt Parser AI.
Extract ALL line items and metadata from this invoice text segment (Part ${idx + 1} of ${textChunks.length}).
Never omit or summarize any items. If there are dozens or 100+ items, extract EVERY SINGLE item.

CRITICAL RULES:
1. Extract exact item name, quantity, unit, price/rate, and line total.
2. DO NOT include "Subtotal", "Total", "Grand Total", "Tax", "Discount", or "Paid" as items.
3. Ignore noise, stamps, headers. Only extract actual product rows.
4. Output strictly valid JSON without markdown. Preserve the printed serial number as "r" if present.
5. If a discount percentage is printed, return its numeric value in discPct without the % sign. If a fixed currency discount is printed, return its exact amount in disc. If both appear, return both. Never confuse a percentage with a currency amount. Subtotal and final total must not be used to calculate or replace item-based totals.
6. Do NOT fabricate or hallucinate items, prices, quantities, or supplier names.
7. Supplier name "s": Extract ONLY if explicitly printed on the invoice. If not found or ambiguous, leave as null. NEVER invent or assume any supplier name.

FORMAT:
{"s":null,"inv":"Inv#","d":"YYYY-MM-DD","sub":null,"disc":null,"discPct":null,"tot":null,"items":[{"r":1,"n":"Item Name","q":1,"u":"KG","p":100,"t":100,"b":null,"exp":null}]}

INVOICE TEXT SEGMENT:
"""
${chunkText}
"""`;

    const resData = await callGroqAPI({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'You are an ultra-precise POS Invoice Parser that outputs compact JSON. Extract ALL items without limit.' },
        { role: 'user', content: chunkPrompt }
      ],
      temperature: 0.05,
      max_tokens: 8192
    });

    if (!resData) continue;

    const content = resData.choices?.[0]?.message?.content || '';
    const finishReason = resData.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      extractionWarnings.push(`Text segment ${idx + 1} reached the token limit; some lines may need manual review.`);
    }

    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed = null;
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // JSON repair
      try {
        let repaired = cleaned;
        const objStart = repaired.indexOf('{');
        if (objStart >= 0) {
          repaired = repaired.substring(objStart);
          const lastCompleteItem = repaired.lastIndexOf('}');
          if (lastCompleteItem > 0) {
            repaired = repaired.substring(0, lastCompleteItem + 1);
            const openBraces = (repaired.match(/\{/g) || []).length;
            const closeBraces = (repaired.match(/\}/g) || []).length;
            const openBrackets = (repaired.match(/\[/g) || []).length;
            const closeBrackets = (repaired.match(/\]/g) || []).length;
            for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
            for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
            parsed = JSON.parse(repaired);
          }
        }
      } catch (repairErr) {
        console.warn(`[GroqService] Segment ${idx + 1} repair failed:`, repairErr.message);
      }
    }

    if (parsed) {
      if (isFirstChunk || !mergedSupplier) mergedSupplier = parsed.supplierName || parsed.s || mergedSupplier;
      if (isFirstChunk || !mergedInvoiceNumber) mergedInvoiceNumber = parsed.invoiceNumber || parsed.inv || mergedInvoiceNumber;
      if (isFirstChunk || !mergedDate) mergedDate = parsed.date || parsed.d || mergedDate;
      if (parsed.subtotal ?? parsed.sub) mergedSubtotal = parsed.subtotal ?? parsed.sub;
      if (parsed.discount ?? parsed.disc) mergedDiscount = parsed.discount ?? parsed.disc;
      if (parsed.discountPercent ?? parsed.discountPercentage ?? parsed.discPct) {
        mergedDiscountPercent = parsed.discountPercent ?? parsed.discountPercentage ?? parsed.discPct;
      }
      if (parsed.invoiceTotal ?? parsed.tot) mergedInvoiceTotal = parsed.invoiceTotal ?? parsed.tot;

      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      for (const it of rawItems) {
        const rawName = String(it.rawName || it.name || it.n || it.item || '').trim();
        if (!rawName || /^(subtotal|total|grand total|tax|gst|discount)$/i.test(rawName)) continue;

        const parsedQty = Number.parseFloat(it.quantity ?? it.qty ?? it.q);
        const qty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;
        const cost = parseFloat(it.unitCost || it.price || it.rate || it.cost || it.p) || 0;
        const tot = parseFloat(it.totalCost || it.total || it.t) || (qty * cost);
        const rowNum = Number.parseInt(it.sourceRowNumber ?? it.rowNumber ?? it.row ?? it.r, 10) || null;

        // Deduplication key
        const dedupeKey = rowNum ? `row_${rowNum}` : `name_${rawName.toLowerCase()}_${qty}_${cost}`;
        if (seenRowKeys.has(dedupeKey)) continue;
        seenRowKeys.add(dedupeKey);

        mergedItems.push({
          sourceRowNumber: rowNum || (mergedItems.length + 1),
          rawName,
          quantity: qty,
          unit: (it.unit || it.u || 'KG').toUpperCase(),
          unitCost: cost,
          totalCost: tot,
          batchNumber: it.batchNumber || it.b || null,
          expiryDate: it.expiryDate || it.exp || null,
          needsReview: Boolean(it.needsReview) || !(qty > 0) || (cost <= 0),
          reviewReason: it.reviewReason || (!(qty > 0) ? 'Quantity missing or invalid; verify before receiving' : cost <= 0 ? 'Zero or missing unit price' : null)
        });
      }
    }
  }

  if (mergedItems.length > 0) {
    console.log(`[GroqService] ✓ Extracted ${mergedItems.length} items across ${textChunks.length} chunk(s).`);
    return {
      supplierName: mergedSupplier,
      invoiceNumber: mergedInvoiceNumber,
      date: mergedDate,
      invoiceTotal: mergedInvoiceTotal,
      subtotal: mergedSubtotal,
      discount: mergedDiscount,
      discountPercent: mergedDiscountPercent,
      items: mergedItems,
      warnings: extractionWarnings
    };
  }

  return null;
};


/**
 * ─── AI BUSINESS INSIGHTS GENERATOR ───
 */
const generateRealAIInsightsWithGroq = async ({ inventoryStats, salesSummary, kitchenStats }) => {
  try {
    const promptText = `You are the AI Business Intelligence engine for a POS & Inventory System.
Analyze the following factual database metrics and generate natural language executive summary and actionable advice.

CRITICAL INSTRUCTIONS:
1. DO NOT invent sales, orders, revenue, inventory quantities, costs, demand numbers, prediction accuracy, or stock levels.
2. Summarize and explain ONLY the provided factual database metrics below.
3. If data is limited, state clearly that historical data is growing.

FACTUAL DATABASE METRICS:
- Total Inventory Items: ${inventoryStats.totalItems}
- Low Stock Count: ${inventoryStats.lowStockCount}
- Critical Stockout Risks: ${inventoryStats.criticalCount}
- Total Inventory Valuation: PKR ${inventoryStats.totalValuation}
- Expiring Items (7 Days): ${inventoryStats.expiringCount}
- Stock Risk Items: ${JSON.stringify(inventoryStats.stockRiskAlerts || [])}
- Completed Orders (30 Days): ${salesSummary.totalOrders30Days || 0}
- Data History Span: ${salesSummary.dateSpanDays || 1} day(s)
- Kitchen Prep Time: ${kitchenStats.avgPrepTime ? `${kitchenStats.avgPrepTime} mins (${kitchenStats.isActualPrepTime ? 'actual' : 'configured'})` : 'Not enough data'}

Generate a structured JSON response with ONLY these keys:
{
  "executiveSummary": "A 2-3 sentence executive summary explaining inventory status and reorder priorities strictly based on the real metrics above.",
  "foodCostOptimization": [
    {
      "title": "Actionable Strategy Title",
      "impact": "High or Medium",
      "description": "Specific advice based on ingredient costs, low stock, or supplier purchasing."
    }
  ]
}

Respond ONLY with valid JSON.`;

    const resData = await callGroqAPI({
      model: getGroqModel(),
      messages: [
        { role: 'system', content: 'You are a precise AI POS & Inventory Analyst that outputs JSON.' },
        { role: 'user', content: promptText }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    if (!resData) return null;

    const content = resData.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[GroqService] AI Insights generation failed:', redactGroqSecrets(err.message));
    return null;
  }
};


module.exports = {
  analyzeInvoiceImageWithGroq,
  parseInvoiceTextWithGroq,
  generateRealAIInsightsWithGroq,
  callGroqAPI,
  getGroqModel,
  getGroqKeys,
  preferCompleteNumberedInvoiceItems
};
