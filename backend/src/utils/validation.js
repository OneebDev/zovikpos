// src/utils/validation.js
// Shared validation helpers for input sanitization, ID parsing,
// pagination bounds, and sort allow-listing.

'use strict';

const { z } = require('zod');

/**
 * Parses and validates numeric ID parameters.
 * Returns positive integer or null if invalid/NaN/out-of-range.
 * Max safe integer capped to Postgres 32-bit/64-bit integer range (2147483647).
 */
const parseId = (value, max = 2147483647) => {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0 || num > max) {
    return null;
  }
  return num;
};

/**
 * Parses pagination query parameters safely.
 * @param {object} query - req.query
 * @param {number} defaultLimit - default items per page (default 20)
 * @param {number} maxLimit - max allowed items per page (default 100)
 * @returns {{ page: number, limit: number, skip: number }}
 */
const parsePagination = (query, defaultLimit = 20, maxLimit = 100) => {
  let page = parseInt(query?.page, 10);
  if (!Number.isInteger(page) || page < 1) {
    page = 1;
  }

  // Check pageSize or limit parameter
  const rawLimit = query?.limit ?? query?.pageSize;
  let limit = parseInt(rawLimit, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    limit = maxLimit;
  }

  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Validates and extracts a safe sort configuration against an allow-list of fields.
 * @param {string} requestedField - field requested to sort by
 * @param {string} requestedOrder - 'asc' | 'desc'
 * @param {string[]} allowedFields - list of allowed field names
 * @param {string} defaultField - fallback field name
 * @param {'asc'|'desc'} defaultOrder - fallback order
 * @returns {{ [field]: 'asc'|'desc' }}
 */
const parseSort = (requestedField, requestedOrder, allowedFields = [], defaultField = 'id', defaultOrder = 'asc') => {
  const field = allowedFields.includes(requestedField) ? requestedField : defaultField;
  const order = String(requestedOrder).toLowerCase() === 'desc' ? 'desc' : (String(requestedOrder).toLowerCase() === 'asc' ? 'asc' : defaultOrder);
  return { [field]: order };
};

/**
 * Helper to create a sanitized string schema with trim and max length.
 */
const stringSchema = (maxLen = 255, minLen = 0) => {
  let s = z.string().trim();
  if (minLen > 0) s = s.min(minLen);
  return s.max(maxLen);
};

module.exports = {
  z,
  parseId,
  parsePagination,
  parseSort,
  stringSchema,
};
