const express = require('express');
const { startSession, getSession, closeSession, transferSessionTable } = require('../controllers/sessionController');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');
const { idempotencyMiddleware } = require('../middleware/idempotencyMiddleware');
const { sessionStartLimiter } = require('../middleware/rateLimitMiddleware');

const { validateBody } = require('../middleware/validate');
const { sessionStartSchema, sessionTransferSchema } = require('../schemas/apiSchemas');

const router = express.Router();

router.post('/start', optionalAuthMiddleware, sessionStartLimiter, validateBody(sessionStartSchema), idempotencyMiddleware, startSession);
router.post('/transfer-table', optionalAuthMiddleware, sessionStartLimiter, validateBody(sessionTransferSchema), transferSessionTable);
router.get('/:sessionId', optionalAuthMiddleware, getSession);
router.post('/:sessionId/close', optionalAuthMiddleware, closeSession);

module.exports = router;
