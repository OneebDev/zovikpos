const express = require('express');
const { startSession, getSession, closeSession, transferSessionTable } = require('../controllers/sessionController');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/start', optionalAuthMiddleware, startSession);
router.post('/transfer-table', optionalAuthMiddleware, transferSessionTable);
router.get('/:sessionId', optionalAuthMiddleware, getSession);
router.post('/:sessionId/close', optionalAuthMiddleware, closeSession);

module.exports = router;
