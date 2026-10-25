const express = require('express');
const {
  getCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require('../controllers/cartController');

const { optionalAuthMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

const sessionActivityMiddleware = require('../middleware/sessionActivityMiddleware');
router.use(sessionActivityMiddleware);
router.use(optionalAuthMiddleware);

router.get('/:sessionId', getCart);
router.post('/:sessionId/items', addItemToCart);
router.put('/:sessionId/items/:itemId', updateCartItem);
router.delete('/:sessionId/items/:itemId', removeCartItem);
router.delete('/:sessionId', clearCart);

module.exports = router;
