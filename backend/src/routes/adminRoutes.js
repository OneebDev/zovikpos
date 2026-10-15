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
  deleteCustomerAccount,
  bulkDeleteCustomers,
  getOrderStatusHistoryList,
  deleteOrderStatusHistory,
  bulkDeleteOrderStatusHistory,
  getBranches,
  createBranch,
  deleteBranch,
  bulkDeleteBranches,
} = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN']));

// Dashboard Analytics & Logs
router.get('/stats', getDashboardStats);
router.get('/audit-logs', getAuditLogs);
router.delete('/audit-logs/bulk', bulkDeleteAuditLogs);
router.delete('/audit-logs/:id', deleteAuditLog);

router.get('/order-history', getOrderStatusHistoryList);
router.delete('/order-history/bulk', bulkDeleteOrderStatusHistory);
router.delete('/order-history/:id', deleteOrderStatusHistory);

// Staff Account Management
router.get('/staff', getStaffList);
router.post('/staff', createStaff);
router.put('/staff/:id', updateStaff);
router.delete('/staff/bulk', bulkDeleteStaff);
router.delete('/staff/:id', deleteStaffAccount);
router.put('/staff/:id/role', updateStaffRole);
router.put('/staff/:id/status', toggleStaffStatus);
router.post('/staff/:id/reset-password', resetStaffPassword);

// Customer Management & Roster
router.get('/customers', getCustomerList);
router.delete('/customers/bulk', bulkDeleteCustomers);
router.delete('/customers/:id', deleteCustomerAccount);

// Branch Management
router.get('/branches', getBranches);
router.post('/branches', createBranch);
router.delete('/branches/bulk', bulkDeleteBranches);
router.delete('/branches/:id', deleteBranch);

module.exports = router;
