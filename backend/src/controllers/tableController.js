const QRCode = require('qrcode');
const { prisma } = require('../config/db');
const { generateTableToken } = require('../services/qrSecurityService');
const { logAudit } = require('../middleware/auditMiddleware');

/**
 * Get all tables with active session counts
 */
const getAllTables = async (req, res) => {
  const { branchId } = req.query;

  try {
    const whereClause = {};
    if (branchId) whereClause.branchId = parseInt(branchId, 10);

    const tables = await prisma.table.findMany({
      where: whereClause,
      include: {
        branch: { select: { id: true, name: true } },
        sessions: {
          where: { status: 'ACTIVE' },
          select: { id: true, startedAt: true, customerId: true, customer: { select: { name: true, email: true } } },
        },
      },
      orderBy: { id: 'asc' },
    });

    const formatted = tables.map(t => ({
      id: t.id,
      tableNumber: t.tableNumber,
      branchId: t.branchId,
      branchName: t.branch?.name || 'Main Campus',
      qrToken: t.qrToken,
      isActive: t.isActive,
      activeSessionCount: t.sessions.length,
      activeSessions: t.sessions,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return res.json({ tables: formatted });
  } catch (error) {
    console.error('Get tables error:', error);
    return res.status(500).json({ error: 'Failed to fetch tables.' });
  }
};

/**
 * Add a new physical table
 */
const addTable = async (req, res) => {
  const { tableNumber, branchId = 1 } = req.body;

  if (!tableNumber) {
    return res.status(400).json({ error: 'Table number or name is required (e.g. "Table 21" or "Patio 1").' });
  }

  const cleanNumber = String(tableNumber).trim();

  try {
    const existing = await prisma.table.findUnique({
      where: { tableNumber: cleanNumber },
    });

    if (existing) {
      return res.status(400).json({ error: `Table "${cleanNumber}" already exists.` });
    }

    const qrToken = generateTableToken(cleanNumber.replace(/[^0-9a-zA-Z_-]/g, ''), branchId);

    const table = await prisma.table.create({
      data: {
        tableNumber: cleanNumber,
        branchId: parseInt(branchId, 10) || 1,
        qrToken,
        isActive: true,
      },
      include: { branch: true },
    });

    await logAudit({
      userId: req.user?.id,
      action: 'TABLE_CREATED',
      entity: 'Table',
      entityId: table.id,
      newValue: { tableNumber: table.tableNumber, branchId: table.branchId },
      req,
    });

    return res.status(201).json({ message: 'Table created successfully.', table });
  } catch (error) {
    console.error('Add table error:', error);
    return res.status(500).json({ error: 'Failed to create table.' });
  }
};

/**
 * Edit an existing table
 */
const updateTable = async (req, res) => {
  const { id } = req.params;
  const { tableNumber, branchId, isActive } = req.body;

  try {
    const table = await prisma.table.findUnique({ where: { id: parseInt(id, 10) } });
    if (!table) {
      return res.status(404).json({ error: 'Table not found.' });
    }

    const updateData = {};
    if (tableNumber !== undefined) updateData.tableNumber = String(tableNumber).trim();
    if (branchId !== undefined) updateData.branchId = parseInt(branchId, 10);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const updated = await prisma.table.update({
      where: { id: table.id },
      data: updateData,
    });

    await logAudit({
      userId: req.user?.id,
      action: 'TABLE_UPDATED',
      entity: 'Table',
      entityId: table.id,
      oldValue: table,
      newValue: updated,
      req,
    });

    return res.json({ message: 'Table updated successfully.', table: updated });
  } catch (error) {
    console.error('Update table error:', error);
    return res.status(500).json({ error: 'Failed to update table.' });
  }
};

/**
 * Delete a Table safely
 * If the table has active sessions or historical orders, safely archives (isActive: false) instead of breaking foreign keys
 */
const deleteTable = async (req, res) => {
  const { id } = req.params;

  try {
    const tableId = parseInt(id, 10);
    const table = await prisma.table.findUnique({
      where: { id: tableId },
      include: {
        _count: { select: { orders: true, sessions: true } }
      }
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found.' });
    }

    const linkedRecords = (table._count.orders || 0) + (table._count.sessions || 0);

    if (linkedRecords > 0) {
      // Safe archival soft-delete
      const deactivated = await prisma.table.update({
        where: { id: tableId },
        data: { isActive: false }
      });

      await logAudit({
        userId: req.user?.id,
        action: 'TABLE_DEACTIVATED',
        entity: 'Table',
        entityId: tableId,
        oldValue: table,
        newValue: deactivated,
        req
      });

      return res.json({
        message: `Table ${table.tableNumber} is linked to ${linkedRecords} orders/sessions and has been safely deactivated & removed from active floor service.`,
        isArchived: true
      });
    }

    // Clean permanent delete
    await prisma.table.delete({ where: { id: tableId } });

    await logAudit({
      userId: req.user?.id,
      action: 'TABLE_DELETED',
      entity: 'Table',
      entityId: tableId,
      oldValue: table,
      req
    });

    return res.json({ message: `Table ${table.tableNumber} deleted permanently.` });
  } catch (error) {
    console.error('Delete table error:', error);
    return res.status(500).json({ error: 'Failed to delete table.' });
  }
};

/**
 * Bulk delete inactive tables within a branch
 */
const bulkDeleteTables = async (req, res) => {
  const { branchId, scope = 'INACTIVE' } = req.body;

  try {
    const where = {};
    if (scope === 'INACTIVE') {
      where.isActive = false;
    }
    if (branchId && branchId !== 'all') {
      where.branchId = parseInt(branchId, 10);
    }

    // Filter tables that have 0 orders
    const candidateTables = await prisma.table.findMany({
      where,
      include: {
        _count: { select: { orders: true, sessions: true } }
      }
    });

    const safeToDelete = candidateTables.filter(t => (t._count.orders === 0 && t._count.sessions === 0));

    if (safeToDelete.length === 0) {
      return res.json({
        message: 'No unreferenced tables found for permanent deletion. Referenced tables remain safely archived.',
        count: 0
      });
    }

    const idsToDelete = safeToDelete.map(t => t.id);

    await prisma.table.deleteMany({
      where: { id: { in: idsToDelete } }
    });

    await logAudit({
      userId: req.user?.id,
      action: 'BULK_TABLES_DELETED',
      entity: 'Table',
      entityId: `bulk_${idsToDelete.length}`,
      oldValue: { count: idsToDelete.length, idsToDelete },
      req
    });

    return res.json({
      message: `Successfully deleted ${idsToDelete.length} unreferenced tables.`,
      count: idsToDelete.length
    });
  } catch (error) {
    console.error('Bulk delete tables error:', error);
    return res.status(500).json({ error: 'Failed to bulk delete tables.' });
  }
};

/**
 * Regenerate a fresh cryptographic QR token for a table (invalidates old QR codes)
 */
const regenerateTableQR = async (req, res) => {
  const { id } = req.params;

  try {
    const table = await prisma.table.findUnique({ where: { id: parseInt(id, 10) } });
    if (!table) {
      return res.status(404).json({ error: 'Table not found.' });
    }

    const newQrToken = generateTableToken(table.tableNumber.replace(/[^0-9a-zA-Z_-]/g, ''), table.branchId || 1);

    const updated = await prisma.table.update({
      where: { id: table.id },
      data: { qrToken: newQrToken },
    });

    await logAudit({
      userId: req.user?.id,
      action: 'TABLE_QR_REGENERATED',
      entity: 'Table',
      entityId: table.id,
      oldValue: { qrToken: table.qrToken },
      newValue: { qrToken: newQrToken },
      req,
    });

    const baseUrl = getDynamicBaseUrl(req);
    const tableUrl = `${baseUrl.replace(/\/$/, '')}/customer/table/${encodeURIComponent(newQrToken)}`;
    warnIfQrHostMismatch(tableUrl);
    const qrDataUrl = await QRCode.toDataURL(tableUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: { dark: '#1e1b4b', light: '#ffffff' },
    });

    return res.json({
      message: `Cryptographic QR token regenerated for ${table.tableNumber}. Old printed QR is now invalidated.`,
      table: {
        ...updated,
        url: tableUrl,
        qrDataUrl,
      },
    });
  } catch (error) {
    console.error('Regenerate QR error:', error);
    return res.status(500).json({ error: 'Failed to regenerate table QR.' });
  }
};

/**
 * Generate high-res printable table QR stand card
 */
/**
 * Helper to get dynamic base URL from request, headers, or incoming client host (never hardcoded)
 */
const getDynamicBaseUrl = (req) => {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.trim().replace(/\/+$/, '');
  let host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname || 'localhost';
  host = host.split(':')[0];
  return `http://${host}:5173`;
};

const warnIfQrHostMismatch = (tableUrl) => {
  const configuredFrontend = String(process.env.FRONTEND_URL || '').trim();
  if (!configuredFrontend) return;
  try {
    if (new URL(tableUrl).origin !== new URL(configuredFrontend).origin) {
      console.warn(`[ZOVIKPOS] Generated table QR host does not match FRONTEND_URL (${configuredFrontend}).`);
    }
  } catch {
    console.warn('[ZOVIKPOS] Could not verify the generated table QR URL against FRONTEND_URL.');
  }
};

const getTableQRCard = async (req, res) => {
  const { id } = req.params;
  const baseUrl = getDynamicBaseUrl(req);

  try {
    const table = await prisma.table.findUnique({
      where: { id: parseInt(id, 10) },
      include: { branch: true },
    });

    if (!table) {
      return res.status(404).json({ error: 'Table not found.' });
    }

    const tableUrl = `${baseUrl.replace(/\/$/, '')}/customer/table/${encodeURIComponent(table.qrToken)}`;
    warnIfQrHostMismatch(tableUrl);

    const qrDataUrl = await QRCode.toDataURL(tableUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 450,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff',
      },
    });

    return res.json({
      tableId: table.id,
      tableNumber: table.tableNumber,
      branchName: table.branch?.name || 'Main Campus',
      isActive: table.isActive,
      url: tableUrl,
      qrDataUrl,
    });
  } catch (error) {
    console.error('Get table QR card error:', error);
    return res.status(500).json({ error: 'Failed to generate table QR stand card.' });
  }
};

/**
 * Generate Batch QR cards for all active tables
 */
const getBatchTableQRCards = async (req, res) => {
  const baseUrl = getDynamicBaseUrl(req);

  try {
    const tables = await prisma.table.findMany({
      orderBy: { id: 'asc' },
      include: { branch: true },
    });

    const qrCards = [];
    for (const table of tables) {
      const tableUrl = `${baseUrl.replace(/\/$/, '')}/customer/table/${encodeURIComponent(table.qrToken)}`;
      warnIfQrHostMismatch(tableUrl);
      const qrDataUrl = await QRCode.toDataURL(tableUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 320,
        color: {
          dark: '#1e1b4b',
          light: '#ffffff',
        },
      });

      qrCards.push({
        id: table.id,
        tableNumber: table.tableNumber,
        branchName: table.branch?.name || 'Main Campus',
        qrToken: table.qrToken,
        isActive: table.isActive,
        url: tableUrl,
        qrDataUrl,
      });
    }

    return res.json({ tables: qrCards });
  } catch (error) {
    console.error('Get batch QR cards error:', error);
    return res.status(500).json({ error: 'Failed to generate batch QR cards.' });
  }
};

module.exports = {
  getAllTables,
  addTable,
  updateTable,
  deleteTable,
  bulkDeleteTables,
  regenerateTableQR,
  getTableQRCard,
  getBatchTableQRCards,
};
