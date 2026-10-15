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
    const tokenLimit = isVisionRequest ? Math.min(payload.max_tokens || 4096, 4096) : (payload.max_tokens || 4096);
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
            timeout: 35000
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
const analyzeInvoiceImageWithGroq = async (imageBase64Data) => {
  // Ultra-compact JSON format to ensure 50+ items easily fit within token limits
  const invoicePrompt = `You are a high-accuracy receipt & invoice vision parser.
Notice: The invoice may have TWO COLUMNS of items (e.g., items 1 to 17 on the left, and items 18 to 33 on the right).
You MUST extract EVERY SINGLE item from BOTH columns from top to bottom.
Never stop early, never skip, never summarize. If there are 33 items, output all 33 items. If there are 50, output all 50.
Do NOT invent placeholder items or duplicate any item. Treat the printed Sr. No. as the source row identity: return each numbered row exactly once, and never create an item from subtotal, discount, notes, or a repeated OCR reading.
If the invoice prints a discount percentage, return its numeric value in discPct (without %). If it prints a fixed currency discount, return that exact amount in disc. If both appear, return both. Do not mistake a percentage for a currency amount. Ignore subtotal and final total values for application.

Output strictly valid JSON with no markdown tags or explanatory text:
{"s":null,"inv":null,"d":null,"sub":null,"disc":null,"discPct":null,"tot":null,"items":[{"r":1,"n":"Item Name","q":1,"u":"KG","p":0}]}`;

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
      } catch (parseErr) {
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
        } catch (_) {}
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

  // ── Strategy 2: Tesseract OCR + Text LLM Merging ───────────────────────────
  // If Vision extracted items, check if OCR found any additional items from the document
  try {
    const extractedText = await extractTextFromImageOCR(imageBase64Data);

    if (extractedText && extractedText.trim().length >= 10) {
      console.log(`[GroqService] Running Tesseract OCR + LLM pass to catch any missed items...`);
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

  // Highly token-efficient prompt capable of extracting 100+ items without hitting limits
  const maxInvoiceTextLength = 35000;
  const inputWasTruncated = invoiceText.length > maxInvoiceTextLength;
  const textPrompt = `You are an expert Restaurant POS Invoice & Receipt Parser AI.
Extract ALL line items and metadata from this invoice text. Never omit or summarize any items. If there are 33, 50, or 100 items, extract EVERY SINGLE item.

CRITICAL RULES:
1. Extract exact item name, quantity, unit, price/rate, and line total.
2. DO NOT include "Subtotal", "Total", "Grand Total", "Tax", "Discount", or "Paid" as items.
3. Ignore noise, stamps, headers. Only extract actual product rows.
4. Output strictly valid JSON without markdown. Preserve the printed serial number as "r" and do not add an unnumbered item when the source is numbered:

5. If a discount percentage is printed, return its numeric value in discPct without the % sign. If a fixed currency discount is printed, return its exact amount in disc. If both appear, return both. Never confuse a percentage with a currency amount. Subtotal and final total must not be used to calculate or replace item-based totals.

FORMAT:
{"s":"Supplier","inv":"Inv#","d":"YYYY-MM-DD","sub":null,"disc":null,"discPct":null,"tot":null,"items":[{"r":1,"n":"Item Name","q":1,"u":"KG","p":100,"t":100,"b":null,"exp":null}]}

INVOICE TEXT:
"""
${invoiceText.substring(0, maxInvoiceTextLength)}
"""`;

  const resData = await callGroqAPI({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: 'You are an ultra-precise POS Invoice Parser that outputs compact JSON. Extract ALL items without limit.' },
      { role: 'user', content: textPrompt }
    ],
    temperature: 0.05,
    max_tokens: 4096
  });

  if (!resData) return null;

  const content = resData.choices?.[0]?.message?.content || '';
  const finishReason = resData.choices?.[0]?.finish_reason;
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed = null;
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (parseErr) {
    // JSON may be truncated. Attempt repair.
    console.warn(`[GroqService] Text LLM JSON parse failed (finish_reason=${finishReason}), attempting repair...`);
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
          console.log(`[GroqService] ✓ Repaired truncated text LLM JSON successfully.`);
        }
      }
    } catch (repairErr) {
      console.warn('[GroqService] Text LLM JSON repair also failed:', repairErr.message);
    }
  }

  if (parsed) {
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const normalizedItems = rawItems.map(it => {
      const rawName = it.rawName || it.name || it.n || it.item || '';
      const parsedQty = Number.parseFloat(it.quantity ?? it.qty ?? it.q);
      const qty = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;
      const cost = parseFloat(it.unitCost || it.price || it.rate || it.cost || it.p) || 0;
      const tot = parseFloat(it.totalCost || it.total || it.t) || (qty * cost);
      return {
        sourceRowNumber: Number.parseInt(it.sourceRowNumber ?? it.rowNumber ?? it.row ?? it.r, 10) || null,
        rawName: String(rawName).trim(),
        quantity: qty,
        unit: (it.unit || it.u || 'KG').toUpperCase(),
        unitCost: cost,
        totalCost: tot,
        batchNumber: it.batchNumber || it.b || null,
        expiryDate: it.expiryDate || it.exp || null,
        needsReview: Boolean(it.needsReview) || !(qty > 0) || (cost <= 0),
        reviewReason: it.reviewReason || (!(qty > 0) ? 'Quantity missing or invalid; verify before receiving' : cost <= 0 ? 'Zero or missing unit price' : null)
      };
    }).filter(it => it.rawName && it.rawName.length > 0 && !/^(subtotal|total|grand total|tax|gst|discount)$/i.test(it.rawName));

    if (normalizedItems.length > 0) {
      if (finishReason === 'length') {
        console.warn(`[GroqService] ⚠ Text LLM response truncated (finish_reason=length). Extracted ${normalizedItems.length} items.`);
      }
      console.log(`[GroqService] ✓ Extracted ${normalizedItems.length} items from invoice text.`);
      return {
        supplierName: parsed.supplierName || parsed.s || null,
        invoiceNumber: parsed.invoiceNumber || parsed.inv || null,
        date: parsed.date || parsed.d || null,
        invoiceTotal: parsed.invoiceTotal ?? parsed.tot ?? null,
        subtotal: parsed.subtotal ?? parsed.sub ?? null,
        discount: parsed.discount ?? parsed.disc ?? null,
        discountPercent: parsed.discountPercent ?? parsed.discountPercentage ?? parsed.discPct ?? null,
        items: normalizedItems,
        warnings: [
          ...(inputWasTruncated ? ['Invoice text exceeded the parser input limit; later source text was not sent.'] : []),
          ...(finishReason === 'length' ? ['AI response reached its token limit; review extracted rows against the source invoice.'] : [])
        ]
      };
    }
  }

  // Last resort: try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {
    console.error('[GroqService] Could not parse text LLM response as JSON.');
    return null;
  }
};


/**
 * ─── AI BUSINESS INSIGHTS GENERATOR ──────────────────────────────────────────
 * Generate real AI-powered executive summary & actionable insights for POS
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
