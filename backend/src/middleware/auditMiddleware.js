const { prisma } = require('../config/db');

/**
 * Log an audit trail entry for important staff/system actions
 * @param {Object} params
 * @param {number|null} [params.userId]
 * @param {string} params.action - e.g. "MENU_PRICE_UPDATE", "PAYMENT_VERIFIED", "ORDER_STATUS_CHANGED", "TABLE_REGENERATE_QR"
 * @param {string} params.entity - e.g. "MenuItem", "Order", "Table", "User", "Payment"
 * @param {string|number} [params.entityId]
 * @param {*} [params.oldValue]
 * @param {*} [params.newValue]
 * @param {Object} [params.req] - Express request for IP tracking
 */
const logAudit = async (firstArg, ...rest) => {
  let params;
  if (firstArg && typeof firstArg === 'object' && !Array.isArray(firstArg) && firstArg.action !== undefined) {
    params = firstArg;
  } else {
    const [userId, action, entity, entityId, oldValue, newValue, req] = [firstArg, ...rest];
    params = { userId, action, entity, entityId, oldValue, newValue, req };
  }
  const { userId = null, action, entity, entityId = null, oldValue = null, newValue = null, req = null } = params;
  try {
    const ip = req ? (req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress || null) : null;
    const finalUserId = userId || (req?.user?.id || null);
    let validUserId = null;
    if (finalUserId) {
      try {
        const userExists = await prisma.user.findUnique({ where: { id: finalUserId }, select: { id: true } });
        if (userExists) validUserId = finalUserId;
      } catch {}
    }

    const oldStr = oldValue !== null && oldValue !== undefined ? (typeof oldValue === 'object' ? JSON.stringify(oldValue) : String(oldValue)) : null;
    const newStr = newValue !== null && newValue !== undefined ? (typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue)) : null;

    const safeAction = String(action || 'SYSTEM_ACTION').trim();
    const safeEntity = String(entity || 'System').trim();
    await prisma.auditLog.create({
      data: {
        userId: validUserId,
        action: safeAction,
        entity: safeEntity,
        entityId: entityId ? String(entityId) : null,
        oldValue: oldStr,
        newValue: newStr,
        ip,
      },
    });
  } catch (err) {
    console.error('[Audit Service] Failed to write audit log:', err.message);
  }
};

module.exports = {
  logAudit,
};
