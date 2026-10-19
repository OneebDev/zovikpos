const { prisma } = require('../config/db');
const { logAudit } = require('../middleware/auditMiddleware');

/**
 * Ensure Dispute table exists in Postgres
 */
const ensureDisputeTable = async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Dispute" (
        "id" SERIAL PRIMARY KEY,
        "customerId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
        "customerEmail" TEXT NOT NULL,
        "customerName" TEXT,
        "orderId" INTEGER REFERENCES "Order"("id") ON DELETE SET NULL,
        "orderNumber" TEXT,
        "category" TEXT NOT NULL DEFAULT 'Order Issue',
        "reason" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "resolution" TEXT,
        "resolvedAt" TIMESTAMP(3),
        "resolvedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('[DisputeService] ensureDisputeTable error:', err.message);
  }
};

// Initialize table on load
ensureDisputeTable();

/**
 * Retrieve all disputes with optional filters (status, category, search, date range)
 */
const getAllDisputes = async ({ status, category, search, customerId, orderNumber, from, to } = {}) => {
  await ensureDisputeTable();

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (status && status !== 'ALL') {
    conditions.push(`"status" = $${paramIdx++}`);
    params.push(status.toUpperCase());
  }

  if (category && category !== 'ALL') {
    conditions.push(`"category" = $${paramIdx++}`);
    params.push(category);
  }

  if (customerId) {
    conditions.push(`("customerId" = $${paramIdx} OR "customerEmail" ILIKE $${paramIdx + 1})`);
    params.push(parseInt(customerId, 10) || -1);
    params.push(`%${customerId}%`);
    paramIdx += 2;
  }

  if (orderNumber) {
    conditions.push(`"orderNumber" ILIKE $${paramIdx++}`);
    params.push(`%${orderNumber.trim()}%`);
  }

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    conditions.push(`("customerEmail" ILIKE $${paramIdx} OR "customerName" ILIKE $${paramIdx} OR "orderNumber" ILIKE $${paramIdx} OR "reason" ILIKE $${paramIdx} OR "description" ILIKE $${paramIdx})`);
    params.push(s);
    paramIdx++;
  }

  if (from) {
    conditions.push(`"createdAt" >= $${paramIdx++}`);
    params.push(new Date(from));
  }

  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(`"createdAt" <= $${paramIdx++}`);
    params.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `
    SELECT 
      d.*,
      u.name as "latestCustomerName",
      u.email as "latestCustomerEmail",
      u."isActive" as "customerIsActive"
    FROM "Dispute" d
    LEFT JOIN "User" u ON d."customerId" = u.id
    ${whereClause}
    ORDER BY d."createdAt" DESC
  `;

  const rows = await prisma.$queryRawUnsafe(query, ...params);
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    customerId: r.customerId ? Number(r.customerId) : null,
    orderId: r.orderId ? Number(r.orderId) : null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
  }));
};

/**
 * Retrieve disputes for a specific customer ID or email
 */
const getDisputesForCustomer = async (customerId, email) => {
  await ensureDisputeTable();
  const conditions = [];
  const params = [];

  if (customerId) {
    params.push(parseInt(customerId, 10));
    conditions.push(`"customerId" = $1`);
  }
  if (email) {
    params.push(email.trim().toLowerCase());
    conditions.push(`LOWER("customerEmail") = $${params.length}`);
  }

  if (conditions.length === 0) return [];

  const query = `
    SELECT * FROM "Dispute"
    WHERE ${conditions.join(' OR ')}
    ORDER BY "createdAt" DESC
  `;

  const rows = await prisma.$queryRawUnsafe(query, ...params);
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    customerId: r.customerId ? Number(r.customerId) : null,
    orderId: r.orderId ? Number(r.orderId) : null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
  }));
};

/**
 * Get dispute statistics counts
 */
const getDisputeCounts = async () => {
  await ensureDisputeTable();
  const rows = await prisma.$queryRawUnsafe(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(CASE WHEN "status" = 'OPEN' THEN 1 END)::int as open,
      COUNT(CASE WHEN "status" = 'UNDER_REVIEW' THEN 1 END)::int as "underReview",
      COUNT(CASE WHEN "status" = 'RESOLVED' THEN 1 END)::int as resolved,
      COUNT(CASE WHEN "status" = 'REJECTED' THEN 1 END)::int as rejected
    FROM "Dispute"
  `);

  const stat = rows[0] || {};
  return {
    total: Number(stat.total || 0),
    open: Number(stat.open || 0),
    underReview: Number(stat.underReview || 0),
    resolved: Number(stat.resolved || 0),
    rejected: Number(stat.rejected || 0),
    activeCount: Number(stat.open || 0) + Number(stat.underReview || 0),
  };
};

/**
 * Record a new dispute / complaint
 */
const createDispute = async ({
  customerId,
  customerEmail,
  customerName,
  orderId,
  orderNumber,
  category = 'Order Issue',
  reason,
  description,
}) => {
  await ensureDisputeTable();

  if (!customerEmail || !customerEmail.trim()) {
    throw new Error('Customer email is required to log a dispute.');
  }
  if (!reason || !reason.trim()) {
    throw new Error('Dispute reason / title is required.');
  }
  if (!description || !description.trim()) {
    throw new Error('Dispute description is required.');
  }

  const query = `
    INSERT INTO "Dispute" (
      "customerId",
      "customerEmail",
      "customerName",
      "orderId",
      "orderNumber",
      "category",
      "reason",
      "description",
      "status",
      "createdAt",
      "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', NOW(), NOW())
    RETURNING *;
  `;

  const rows = await prisma.$queryRawUnsafe(
    query,
    customerId ? parseInt(customerId, 10) : null,
    customerEmail.trim().toLowerCase(),
    customerName ? customerName.trim() : null,
    orderId ? parseInt(orderId, 10) : null,
    orderNumber ? orderNumber.trim() : null,
    category || 'Order Issue',
    reason.trim(),
    description.trim()
  );

  return rows[0];
};

/**
 * Update dispute status and record resolution note
 */
const updateDisputeStatus = async (
  disputeId,
  { status, resolution, resolvedBy, req }
) => {
  await ensureDisputeTable();

  const id = parseInt(disputeId, 10);
  if (Number.isNaN(id)) {
    throw new Error('Invalid dispute ID.');
  }

  const validStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'];
  const targetStatus = (status || '').toUpperCase();
  if (!validStatuses.includes(targetStatus)) {
    throw new Error(`Invalid dispute status. Allowed: ${validStatuses.join(', ')}`);
  }

  const existingRows = await prisma.$queryRawUnsafe(
    'SELECT * FROM "Dispute" WHERE id = $1',
    id
  );
  if (existingRows.length === 0) {
    throw new Error('Dispute record not found.');
  }
  const existing = existingRows[0];

  const isResolving = ['RESOLVED', 'REJECTED'].includes(targetStatus);
  const resolvedAt = isResolving ? new Date() : null;
  const adminName = resolvedBy || (req?.user?.name || 'Administrator');

  const query = `
    UPDATE "Dispute"
    SET 
      "status" = $1,
      "resolution" = $2,
      "resolvedAt" = $3,
      "resolvedBy" = $4,
      "updatedAt" = NOW()
    WHERE id = $5
    RETURNING *;
  `;

  const updatedRows = await prisma.$queryRawUnsafe(
    query,
    targetStatus,
    resolution ? resolution.trim() : existing.resolution,
    resolvedAt,
    isResolving ? adminName : existing.resolvedBy,
    id
  );

  const updated = updatedRows[0];

  if (req?.user?.id) {
    await logAudit({
      userId: req.user.id,
      action: 'DISPUTE_STATUS_UPDATED',
      entity: 'Dispute',
      entityId: String(id),
      oldValue: JSON.stringify({ status: existing.status, resolution: existing.resolution }),
      newValue: JSON.stringify({ status: targetStatus, resolution: resolution || null, resolvedBy: adminName }),
      req,
    });
  }

  return updated;
};

module.exports = {
  getAllDisputes,
  getDisputesForCustomer,
  getDisputeCounts,
  createDispute,
  updateDisputeStatus,
};
