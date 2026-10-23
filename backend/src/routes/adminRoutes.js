const express = require('express');
const {
  getDashboardStats,
  getAuditLogs,
  deleteAuditLog,
  bulkDeleteAuditLogs,
  getStaffList,
  createStaff,
  updateStaff,
  updateStaffRole,
  toggleStaffStatus,
  deleteStaffAccount,
  bulkDeleteStaff,
  resetStaffPassword,
  getCustomerList,
  blockCustomerAccount,
  unblockCustomerAccount,
  deleteCustomerAccount,
  bulkDeleteCustomers,
  getOrderStatusHistoryList,
  deleteOrderStatusHistory,
  bulkDeleteOrderStatusHistory,
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  bulkDeleteBranches,
  getDisputes,
  createAdminDispute,
  updateDispute,
} = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const { validateBody, validateParams } = require('../middleware/validate');
const { createStaffUserSchema, updateStaffUserSchema, idParamSchema } = require('../schemas/apiSchemas');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

// Dashboard Analytics & Logs
router.get('/stats', getDashboardStats);
router.get('/audit-logs', getAuditLogs);
router.delete('/audit-logs/bulk', bulkDeleteAuditLogs);
router.delete('/audit-logs/:id', validateParams(idParamSchema), deleteAuditLog);

router.get('/order-history', getOrderStatusHistoryList);
router.delete('/order-history/bulk', bulkDeleteOrderStatusHistory);
router.delete('/order-history/:id', validateParams(idParamSchema), deleteOrderStatusHistory);

// Staff Account Management
router.get('/staff', getStaffList);
router.post('/staff', validateBody(createStaffUserSchema), createStaff);
router.put('/staff/:id', validateParams(idParamSchema), validateBody(updateStaffUserSchema), updateStaff);
router.delete('/staff/bulk', bulkDeleteStaff);
router.delete('/staff/:id', validateParams(idParamSchema), deleteStaffAccount);
router.put('/staff/:id/role', validateParams(idParamSchema), updateStaffRole);
router.put('/staff/:id/status', validateParams(idParamSchema), toggleStaffStatus);
router.post('/staff/:id/reset-password', validateParams(idParamSchema), resetStaffPassword);

// Customer Management & Roster
router.get('/customers', getCustomerList);
router.put('/customers/:id/block', blockCustomerAccount);
router.put('/customers/:id/unblock', unblockCustomerAccount);
router.delete('/customers/bulk', bulkDeleteCustomers);
router.delete('/customers/:id', deleteCustomerAccount);

// Centralized Dispute Management
router.get('/disputes', getDisputes);
router.post('/disputes', createAdminDispute);
router.put('/disputes/:id', updateDispute);

// Branch Management
router.get('/branches', getBranches);
router.post('/branches', createBranch);
router.put('/branches/:id', updateBranch);
router.delete('/branches/bulk', bulkDeleteBranches);
router.delete('/branches/:id', deleteBranch);

module.exports = router;
