const OrderStatus = Object.freeze(['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'REFUNDED']);
const OrderPaymentStatus = Object.freeze(['UNPAID', 'PENDING_VERIFICATION', 'PAID', 'VERIFIED', 'FAILED', 'REFUNDED']);
const InventoryReceivingStatus = Object.freeze(['DRAFT', 'RECEIVED', 'CANCELLED', 'CONFIRMING']);
const SessionStatus = Object.freeze(['ACTIVE', 'CHECKOUT', 'COMPLETED', 'EXPIRED', 'CANCELLED']);
const values = Object.freeze({ OrderStatus, OrderPaymentStatus, InventoryReceivingStatus, SessionStatus });
const isValid = (kind, value) => Array.isArray(values[kind]) && values[kind].includes(value);

module.exports = { ...values, isValid };
