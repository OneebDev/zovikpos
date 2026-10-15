const express = require('express');
const {
  getInventorySummary,
  getSmartAIInsights,
  getInventoryItems,
  addInventoryItem,
  bulkAddInventoryItems,
  updateInventoryItem,
  deleteInventoryItem,
  bulkDeleteInventoryItems,
  stockIn,
  adjustStock,
  restockItem,
  getRecipeForMenuItem,
  saveRecipeForMenuItem,
  deleteRecipeForMenuItem,
  bulkDeleteRecipes,
  getRecipeMargins,
  getExpiringItems,
  updateBatchExpiry,
  clearBatchExpiry,
  bulkClearBatchExpiry,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  bulkDeleteSuppliers,
  getInventoryLogs,
  deleteInventoryLog,
  bulkDeleteInventoryLogs,
  getForecast,
  getInventoryAlerts,
  recalculateInventoryForecasts,
  getReceivings,
  generateReceivingRef,
  getReceivingById,
  createReceiving,
  confirmReceiving,
  cancelReceiving,
  deleteReceiving,
  bulkDeleteReceivings,
  updateReceiving,
  previewImportCSV,
  previewAiOcrInvoice,
  suggestRecipeForMenuItem,
  bulkImportPresetRecipes,
  confirmItemAlias,
  getLearnedAliasesController,
} = require('../controllers/inventoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(['ADMIN', 'VENDOR', 'KITCHEN'])); // Accessible to staff roles

// Summary & Catalog
router.get('/summary', getInventorySummary);
router.get('/', getInventoryItems);
router.post('/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkAddInventoryItems);
router.post('/items/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkAddInventoryItems);
router.post('/', roleMiddleware(['ADMIN', 'VENDOR']), addInventoryItem);
router.put('/:id', roleMiddleware(['ADMIN', 'VENDOR']), updateInventoryItem);
router.delete('/items/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteInventoryItems);
router.delete('/:id', roleMiddleware(['ADMIN', 'VENDOR']), deleteInventoryItem);

// Learned Aliases & Intelligent Item Matching
router.get('/aliases', getLearnedAliasesController);
router.post('/confirm-alias', roleMiddleware(['ADMIN', 'VENDOR']), confirmItemAlias);

// Stock Receiving Workflow
router.get('/receivings', getReceivings);
router.get('/receivings/next-ref', generateReceivingRef);
router.get('/receivings/:id', getReceivingById);
router.post('/receivings', roleMiddleware(['ADMIN', 'VENDOR']), createReceiving);
router.put('/receivings/:id', roleMiddleware(['ADMIN', 'VENDOR']), updateReceiving);
router.post('/receivings/:id/receive', roleMiddleware(['ADMIN', 'VENDOR']), confirmReceiving);
router.post('/receivings/:id/cancel', roleMiddleware(['ADMIN', 'VENDOR']), cancelReceiving);
router.delete('/receivings/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteReceivings);
router.delete('/receivings/:id', roleMiddleware(['ADMIN', 'VENDOR']), deleteReceiving);
router.post('/receivings/import/preview', roleMiddleware(['ADMIN', 'VENDOR']), previewImportCSV);
router.post('/receivings/ocr-preview', roleMiddleware(['ADMIN', 'VENDOR']), previewAiOcrInvoice);

// Legacy Stock In & Adjustments
router.post('/stock-in', roleMiddleware(['ADMIN', 'VENDOR']), stockIn);
router.post('/adjust', roleMiddleware(['ADMIN', 'VENDOR']), adjustStock);
router.post('/:id/restock', roleMiddleware(['ADMIN', 'VENDOR']), restockItem);

// Recipes & Margins
router.get('/recipes/margins', getRecipeMargins);
router.post('/recipes/ai-suggest', roleMiddleware(['ADMIN', 'VENDOR']), suggestRecipeForMenuItem);
router.post('/recipes/import-presets', roleMiddleware(['ADMIN', 'VENDOR']), bulkImportPresetRecipes);
router.get('/recipes/:menuItemId', getRecipeForMenuItem);
router.post('/recipes/:menuItemId', roleMiddleware(['ADMIN', 'VENDOR']), saveRecipeForMenuItem);
router.delete('/recipes/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteRecipes);
router.delete('/recipes/:menuItemId', roleMiddleware(['ADMIN', 'VENDOR']), deleteRecipeForMenuItem);

// Expiry & Suppliers
router.get('/expiring', getExpiringItems);
router.put('/batch-expiry', roleMiddleware(['ADMIN', 'VENDOR']), updateBatchExpiry);
router.put('/expiring', roleMiddleware(['ADMIN', 'VENDOR']), updateBatchExpiry);
router.delete('/expiring/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkClearBatchExpiry);
router.delete('/expiring/:itemId', roleMiddleware(['ADMIN', 'VENDOR']), clearBatchExpiry);
router.delete('/batch-expiry/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkClearBatchExpiry);
router.delete('/batch-expiry/:itemId', roleMiddleware(['ADMIN', 'VENDOR']), clearBatchExpiry);
router.get('/suppliers', getSuppliers);
router.post('/suppliers', roleMiddleware(['ADMIN', 'VENDOR']), createSupplier);
router.put('/suppliers/:id', roleMiddleware(['ADMIN', 'VENDOR']), updateSupplier);
router.delete('/suppliers/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteSuppliers);
router.delete('/suppliers/:id', roleMiddleware(['ADMIN', 'VENDOR']), deleteSupplier);

// Logs & AI Forecasting
router.get('/logs', getInventoryLogs);
router.delete('/logs/bulk', roleMiddleware(['ADMIN', 'VENDOR']), bulkDeleteInventoryLogs);
router.delete('/logs/:id', roleMiddleware(['ADMIN', 'VENDOR']), deleteInventoryLog);
router.get('/alerts', getInventoryAlerts);
router.get('/ai-insights', getSmartAIInsights);
router.post('/recalculate-forecasts', roleMiddleware(['ADMIN', 'VENDOR']), recalculateInventoryForecasts);
router.get('/:id/forecast', getForecast);

module.exports = router;
