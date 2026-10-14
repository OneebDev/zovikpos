const axios = require('axios');
const { createWorker } = require('tesseract.js');

/**
 * ─── DYNAMIC KEY ROTATION SYSTEM ────────────────────────────────────────────
 *
 * Automatically reads ALL env variables matching GROQ_API_KEY or GROQ_API_KEY_N
 * (N can be any number or suffix). To add a new key, simply add to .env:
 *   GROQ_API_KEY_11="gsk_..."
 *   GROQ_API_KEY_12="gsk_..."
 * No code changes needed.
 *
 * Rotation strategy: Round-robin across all available keys.
 * On 429 (rate limit) or 401 (key invalid) → automatically switches to next key.
 */

/**
 * Dynamically discover all GROQ_API_KEY* variables from process.env
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

// Module-level round-robin index (persists across calls within same server session)
let currentKeyIndex = 0;

/**
 * Get the next API key in round-robin rotation
 */
const getNextGroqKey = () => {
  const keys = getGroqKeys();
  if (keys.length === 0) return null;
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return key;
};

/**
 * ─── CORE GROQ API CALLER ────────────────────────────────────────────────────
 * Calls Groq Chat Completions API.
 * Automatically rotates keys and models on 429 (rate limit), 401, or 503 errors.
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
    // OTPM (Output Tokens Per Minute) is a rate limit, not a per-request cap.
    // Key rotation already handles 429 rate-limit errors, so let callers set their own max_tokens.
    const tokenLimit = payload.max_tokens || (isVisionRequest ? 4096 : 4096);
    const currentPayload = {
      ...payload,
      model: modelCandidate,
      max_tokens: tokenLimit
    };

    const maxAttempts = retries !== null ? Math.min(retries, keys.length) : keys.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const apiKey = getNextGroqKey();

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
        const errMsg = err.response?.data?.error?.message || err.message;
        console.warn(`[GroqService] Key attempt ${attempt + 1}/${maxAttempts} (HTTP ${status}) for model ${modelCandidate}: ${errMsg}`);
        if (status === 429 || status === 401 || status === 503 || status === 404) {
          continue; // Rotate to next API key
        }
        break; // For fatal errors, stop retrying this model
      }
    }
  }

  console.error('[GroqService] All Groq API key and model candidates exhausted.');
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
    console.error('[GroqService] Tesseract OCR error:', err.message);
    return '';
  }
};

/**
 * ─── INVOICE OCR + AI VISION PARSER ──────────────────────────────────────────
 * Parse a purchase receipt or invoice image (printed, handwritten, or mixed).
 */
const analyzeInvoiceImageWithGroq = async (imageBase64Data) => {
  const invoicePrompt = `You are an expert Restaurant POS Invoice & Receipt Parser AI.
Your job is to accurately extract ALL purchased items, quantities, costs, and metadata from this supplier invoice/receipt (which may be printed, handwritten, or mixed format).

CRITICAL EXTRACTION RULES:
1. ACCURACY & FIDELITY:
   - Extract the actual values visible on the invoice.
   - Preserve original product names/descriptions as written (e.g. "Chicken Boneless", "Fresh Tomatoes", "Cooking Oil 5L").
   - DO NOT fabricate missing items, quantities, or prices.
   - Never confuse invoice numbers, phone numbers, tax IDs, or dates with product rows.

2. EXTRACT EVERY SINGLE LINE ITEM — NO LIMIT:
   - You MUST extract ALL product rows present in the invoice. Do NOT stop at 10 items.
   - If the invoice has 5, 15, 25, 40, or more product rows, extract ALL of them.
   - Do NOT summarize, skip, or omit any product rows. Every visible product row must appear in the "items" array.
   - Include items near the bottom of the invoice — do not cut off early.

3. DISTINGUISH LINE ITEMS VS SUMMARY/TOTALS:
   - Extract ONLY actual purchased product rows into "items".
   - DO NOT include summary rows such as "Subtotal", "Total", "Net Amount", "GST/Tax", "Discount", "Delivery Charges", "Previous Balance", or "Paid Amount" as items.

4. HANDWRITTEN & MIXED INVOICES:
   - Carefully read handwritten numbers and cursive text. Pay special attention to digit disambiguation (e.g. 1 vs 7, 0 vs 6 vs 8, 4 vs 9, 3 vs 5).
   - If a handwritten item name, quantity, or price is ambiguous or partially illegible, extract your best interpretation, but set "needsReview": true and specify "reviewReason": "Unclear handwriting on [field]".
   - DO NOT silently change digits or invent prices.

5. QUANTITY, UNIT, UNIT COST, LINE TOTAL:
   - Quantity: Number of units purchased (e.g., 5, 2.5, 10).
   - Unit: Normalize to standard units: KG, G, L, ML, PCS, DOZEN, BOX, PACK, BOTTLE, BAG, or ROLL. If not specified, default to PCS or KG based on context.
   - Unit Cost: The price for ONE unit. If only Line Total is shown, calculate unitCost = lineTotal / quantity.
   - Line Total: The total price for this line (quantity * unitCost).

6. OUTPUT FORMAT (strictly valid JSON with no markdown wrapping):
{
  "supplierName": "Supplier or vendor name if visible, else null",
  "invoiceNumber": "Invoice/Bill Number if visible, else null",
  "date": "YYYY-MM-DD if visible, else null",
  "invoiceTotal": 12500,
  "items": [
    {
      "rawName": "Exact item name as written",
      "quantity": 5,
      "unit": "KG",
      "unitCost": 450,
      "totalCost": 2250,
      "batchNumber": "Batch or Lot # if visible, else null",
      "expiryDate": "YYYY-MM-DD if visible, else null",
      "needsReview": false,
      "reviewReason": null
    }
  ]
}

IMPORTANT: Output the COMPLETE items array with ALL product rows. Do not truncate.`;

  // ── Strategy 1: Groq Vision API (direct multimodal image understanding) ────
  try {
    console.log('[GroqService] Attempting Groq Vision API for invoice image...');

    // Ensure the image has a proper data URL prefix for vision API
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
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Attempt to parse the JSON, with truncation recovery
      let parsed = null;
      try {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (parseErr) {
        // JSON may be truncated (finish_reason === 'length'). Attempt repair.
        console.warn(`[GroqService] Vision JSON parse failed (finish_reason=${finishReason}), attempting repair...`);
        try {
          let repaired = cleaned;
          // Find the start of the JSON object
          const objStart = repaired.indexOf('{');
          if (objStart >= 0) {
            repaired = repaired.substring(objStart);
            // Try to close any truncated items array: remove last incomplete item, close array and object
            // Find the last complete item (ends with })
            const lastCompleteItem = repaired.lastIndexOf('}');
            if (lastCompleteItem > 0) {
              repaired = repaired.substring(0, lastCompleteItem + 1);
              // Count open brackets
              const openBraces = (repaired.match(/\{/g) || []).length;
              const closeBraces = (repaired.match(/\}/g) || []).length;
              const openBrackets = (repaired.match(/\[/g) || []).length;
              const closeBrackets = (repaired.match(/\]/g) || []).length;
              // Close any unclosed brackets/braces
              for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
              for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
              parsed = JSON.parse(repaired);
              console.log(`[GroqService] ✓ Repaired truncated JSON successfully.`);
            }
          }
        } catch (repairErr) {
          console.warn('[GroqService] JSON repair also failed:', repairErr.message);
        }
      }

      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        // Flag if response was truncated
        if (finishReason === 'length') {
          console.warn(`[GroqService] ⚠ Response was truncated (finish_reason=length). Extracted ${parsed.items.length} items but invoice may contain more.`);
          parsed._truncated = true;
        }
        console.log(`[GroqService] ✓ Vision API extracted ${parsed.items.length} items from invoice.`);
        return parsed;
      }
    }
  } catch (visionErr) {
    console.warn('[GroqService] Vision API failed, falling back to Tesseract OCR + LLM:', visionErr.message);
  }

  // ── Strategy 2: Tesseract OCR → Groq text LLM (fallback) ───────────────────
  try {
    console.log('[GroqService] Fallback: Running Tesseract OCR on invoice image...');
    const extractedText = await extractTextFromImageOCR(imageBase64Data);

    if (!extractedText || extractedText.trim().length < 10) {
      console.warn('[GroqService] Tesseract OCR yielded empty or too-short text.');
      return null;
    }

    console.log(`[GroqService] OCR text (${extractedText.length} chars), sending to Groq LLM...`);
    return await parseInvoiceTextWithGroq(extractedText);
  } catch (err) {
    console.error('[GroqService] Invoice scan failed (both strategies):', err.message);
    return null;
  }
};

/**
 * ─── PARSE EXTRACTED INVOICE TEXT WITH GROQ LLM ──────────────────────────────
 * Used for PDF extracted text, OCR extracted text, and unstructured receipts.
 */
const parseInvoiceTextWithGroq = async (invoiceText) => {
  if (!invoiceText || typeof invoiceText !== 'string' || invoiceText.trim().length < 5) {
    return null;
  }

  const textPrompt = `You are an expert Restaurant POS Invoice & Receipt Parser AI.
Analyze the following text extracted from a supplier invoice/bill/receipt and extract ALL item details and metadata.

CRITICAL RULES:
1. ACCURACY: Extract exact product names, quantities, and prices. Preserve descriptions as written.
2. DO NOT include "Subtotal", "Total", "Tax/GST", "Discount", "Delivery", or "Paid" as items.
3. EXTRACT EVERY SINGLE LINE ITEM — NO LIMIT. If the invoice has 5, 15, 25, 40+ items, extract ALL of them. Do NOT stop early or summarize.
4. If an item name, quantity, or price is ambiguous or incomplete, set "needsReview": true and "reviewReason": "reason".
5. Output strictly valid JSON with no markdown formatting.

JSON FORMAT:
{
  "supplierName": "Supplier / store name if found, else null",
  "invoiceNumber": "Invoice / Bill Number if found, else null",
  "date": "YYYY-MM-DD if found, else null",
  "invoiceTotal": 12500,
  "items": [
    {
      "rawName": "Full item name as written",
      "quantity": 10,
      "unit": "KG, G, L, ML, PCS, BOX, DOZEN, or BAG",
      "unitCost": 450,
      "totalCost": 4500,
      "batchNumber": null,
      "expiryDate": null,
      "needsReview": false,
      "reviewReason": null
    }
  ]
}

IMPORTANT: Output the COMPLETE items array with ALL product rows. Do not truncate or omit any items.

INVOICE TEXT:
"""
${invoiceText.substring(0, 12000)}
"""`;

  const resData = await callGroqAPI({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: 'You are a precise POS Invoice Parser that outputs JSON. Extract ALL items — no limit.' },
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

  if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
    if (finishReason === 'length') {
      console.warn(`[GroqService] ⚠ Text LLM response truncated (finish_reason=length). Extracted ${parsed.items.length} items but invoice may contain more.`);
      parsed._truncated = true;
    }
    console.log(`[GroqService] ✓ Extracted ${parsed.items.length} items from text.`);
    return parsed;
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
    console.error('[GroqService] AI Insights generation failed:', err.message);
    return null;
  }
};


module.exports = {
  analyzeInvoiceImageWithGroq,
  parseInvoiceTextWithGroq,
  generateRealAIInsightsWithGroq,
  callGroqAPI,
  getGroqModel,
  getGroqKeys
};
