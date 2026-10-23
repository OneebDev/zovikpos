// src/schemas/apiSchemas.js
// Lenient Zod validation schemas for high-risk routes.
// Permits unknown extra keys via .passthrough() so legitimate frontend fields are preserved.

'use strict';

const { z, stringSchema } = require('../utils/validation');

// --- Auth Schemas ---
const registerSchema = z.object({
  email: z.string().trim().email().max(100),
  password: z.string().min(6).max(128),
  name: stringSchema(100, 1),
  role: z.string().max(20).optional(),
}).passthrough();

const loginSchema = z.object({
  email: z.string().trim().email().max(100),
  password: z.string().min(1).max(128),
}).passthrough();

const sendOtpSchema = z.object({
  email: z.string().trim().email().max(100),
}).passthrough();

const verifyOtpSchema = z.object({
  email: z.string().trim().email().max(100),
  otp: z.union([z.string(), z.number()]).transform((val) => String(val).trim()).refine((s) => s.length >= 4 && s.length <= 10, {
    message: 'OTP must be between 4 and 10 characters',
  }),
}).passthrough();

// --- Session Schema ---
// qrToken is optional here so missing/empty token reaches sessionController.startSession
// to return its canonical TABLE_QR_REQUIRED error code.
const sessionStartSchema = z.object({
  qrToken: z.string().max(500).optional(),
  validateOnly: z.boolean().optional(),
}).passthrough();

const sessionTransferSchema = z.object({
  sessionId: z.string().trim().min(1, 'Session ID is required').max(100),
  qrToken: z.string().trim().min(1, 'Target table QR token is required').max(500),
  targetTableNumber: z.string().max(50).optional(),
}).passthrough();

// --- Order Schemas ---
const createOrderSchema = z.object({
  sessionId: z.string().trim().max(100).optional(),
  paymentMethod: z.string().trim().max(30).optional(),
  paymentTxId: z.string().trim().max(100).nullable().optional(),
  customerEmail: z.string().trim().email().max(100).nullable().optional(),
  items: z.array(
    z.object({
      menuItemId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
      quantity: z.union([z.number(), z.string()]).optional(),
    }).passthrough()
  ).min(1, 'Order must contain at least one menu item.'),
}).passthrough();

// --- Payment Schemas ---
const submitPaymentSchema = z.object({
  orderId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  paymentMethod: z.string().trim().max(30).optional(),
  paymentTxId: z.string().trim().min(3).max(100),
}).passthrough();

// --- Table Schemas ---
const createTableSchema = z.object({
  tableNumber: z.union([z.string(), z.number()]).transform((val) => String(val).trim()).refine((s) => s.length > 0 && s.length <= 50, {
    message: 'tableNumber must be between 1 and 50 characters',
  }),
  branchId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
}).passthrough();

const updateTableSchema = z.object({
  tableNumber: z.union([z.string(), z.number()]).transform((val) => String(val).trim()).refine((s) => s.length <= 50, {
    message: 'tableNumber cannot exceed 50 characters',
  }).optional(),
  branchId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  isActive: z.boolean().optional(),
}).passthrough();

// --- Menu Item Schemas ---
const createMenuItemSchema = z.object({
  name: stringSchema(100, 1),
  price: z.union([z.number().nonnegative(), z.string()]),
  description: z.string().max(1000).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  groupName: z.string().max(50).nullable().optional(),
  stock: z.union([z.number(), z.string()]).optional(),
  prepTime: z.union([z.number(), z.string()]).optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
}).passthrough();

const updateMenuItemSchema = z.object({
  name: stringSchema(100, 1).optional(),
  price: z.union([z.number().nonnegative(), z.string()]).optional(),
  description: z.string().max(1000).nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  groupName: z.string().max(50).nullable().optional(),
  stock: z.union([z.number(), z.string()]).optional(),
  prepTime: z.union([z.number(), z.string()]).optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
}).passthrough();

// --- Admin Staff User Schema ---
const createStaffUserSchema = z.object({
  name: stringSchema(100, 1),
  email: z.string().trim().email().max(100),
  password: z.string().min(6).max(128),
  role: z.string().max(20),
  branchId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  isDemo: z.boolean().optional(),
}).passthrough();

const updateStaffUserSchema = z.object({
  name: stringSchema(100, 1).optional(),
  email: z.string().trim().email().max(100).optional(),
  role: z.string().max(20).optional(),
  branchId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullable().optional(),
  isActive: z.boolean().optional(),
}).passthrough();

// --- Inventory Item Schemas (Single item add/update) ---
const createInventoryItemSchema = z.object({
  name: stringSchema(100, 1),
  unit: stringSchema(20, 1),
  stockLevel: z.union([z.number(), z.string()]).optional(),
  minThreshold: z.union([z.number(), z.string()]).optional(),
  maxThreshold: z.union([z.number(), z.string()]).optional(),
  category: z.string().max(50).nullable().optional(),
  sku: z.string().max(50).nullable().optional(),
  costPrice: z.union([z.number(), z.string()]).optional(),
  expiryDate: z.string().max(50).nullable().optional(),
  supplierId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullable().optional(),
  branchId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
}).passthrough();

const updateInventoryItemSchema = z.object({
  name: stringSchema(100, 1).optional(),
  unit: stringSchema(20, 1).optional(),
  stockLevel: z.union([z.number(), z.string()]).optional(),
  minThreshold: z.union([z.number(), z.string()]).optional(),
  maxThreshold: z.union([z.number(), z.string()]).optional(),
  category: z.string().max(50).nullable().optional(),
  sku: z.string().max(50).nullable().optional(),
  costPrice: z.union([z.number(), z.string()]).optional(),
  expiryDate: z.string().max(50).nullable().optional(),
  supplierId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullable().optional(),
  branchId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
}).passthrough();

// --- Params Schemas ---
const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID parameter must be a positive integer'),
}).passthrough();

module.exports = {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
  sessionStartSchema,
  sessionTransferSchema,
  createOrderSchema,
  submitPaymentSchema,
  createTableSchema,
  updateTableSchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  createStaffUserSchema,
  updateStaffUserSchema,
  createInventoryItemSchema,
  updateInventoryItemSchema,
  idParamSchema,
};
