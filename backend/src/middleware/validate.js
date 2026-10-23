// src/middleware/validate.js
// Express middleware generator for validating req.body, req.params, or req.query via Zod.
// Returns HTTP 400 with code 'VALIDATION_ERROR' and a short safe error message.
// Lenient by default: unknown extra fields are permitted (passthrough).

'use strict';

const formatZodError = (error) => {
  const firstIssue = error.issues?.[0];
  if (!firstIssue) return 'Invalid request input.';
  const path = firstIssue.path.join('.');
  const prefix = path ? `Field "${path}": ` : '';
  return `${prefix}${firstIssue.message}`;
};

/**
 * Validates request body against a Zod schema.
 * Automatically enables .passthrough() so extra unknown keys are preserved.
 */
const validateBody = (schema) => {
  const lenientSchema = typeof schema.passthrough === 'function' ? schema.passthrough() : schema;
  return (req, res, next) => {
    const result = lenientSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: formatZodError(result.error),
        code: 'VALIDATION_ERROR',
      });
    }
    req.body = result.data;
    next();
  };
};

/**
 * Validates route params against a Zod schema.
 */
const validateParams = (schema) => {
  const lenientSchema = typeof schema.passthrough === 'function' ? schema.passthrough() : schema;
  return (req, res, next) => {
    const result = lenientSchema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        error: formatZodError(result.error),
        code: 'VALIDATION_ERROR',
      });
    }
    req.params = result.data;
    next();
  };
};

/**
 * Validates query string against a Zod schema.
 */
const validateQuery = (schema) => {
  const lenientSchema = typeof schema.passthrough === 'function' ? schema.passthrough() : schema;
  return (req, res, next) => {
    const result = lenientSchema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: formatZodError(result.error),
        code: 'VALIDATION_ERROR',
      });
    }
    req.query = result.data;
    next();
  };
};

module.exports = {
  validateBody,
  validateParams,
  validateQuery,
  formatZodError,
};
