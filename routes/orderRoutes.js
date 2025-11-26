const express = require('express');
const router = express.Router();
const {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  startEditOrder
} = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

// All order routes require authentication
router.use(protect);

// GET /api/orders - Get all orders for authenticated user
router.get('/', getAllOrders);

// GET /api/orders/:id - Get single order by ID for authenticated user
router.get('/:id', getOrderById);

// POST /api/orders - Create new order for authenticated user
router.post('/', createOrder);

// POST /api/orders/:id/edit-start - Restore stock before editing
router.post('/:id/edit-start', startEditOrder);

// PUT /api/orders/:id - Update order for authenticated user
router.put('/:id', updateOrder);

// DELETE /api/orders/:id - Delete order for authenticated user
router.delete('/:id', deleteOrder);

module.exports = router;