const express = require('express');
const router = express.Router();
const {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  startEditOrder,
  reconcileStockFromOrders
} = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/roleMiddleware');
const { body, validationResult } = require('express-validator');

const validateOrder = [
  body('customerName').optional().isString().trim(),
  body('productTitle').optional().isString().trim(),
  body('orderItems').optional().isArray(),
  body('orderItems.*.quantity').optional().isNumeric({ no_symbols: true }).toFloat().isFloat({ gt: 0 }),
  body('orderItems.*.price').optional().isNumeric().toFloat(),
  body('orderItems.*.product_id').optional().isNumeric().toInt(),
  body('paymentStatus').optional().isString().trim(),
  body('tax_included').optional().isBoolean(),
  body('tax_rate').optional().isNumeric().toFloat(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid order payload', errors: errors.array() });
    }
    next();
  }
];

// All order routes require authentication
router.use(protect);

// GET /api/orders - Get all orders for authenticated user
router.get('/', getAllOrders);

// GET /api/orders/:id - Get single order by ID for authenticated user
router.get('/:id', getOrderById);

// POST /api/orders - Create new order for authenticated user
router.post('/', validateOrder, createOrder);

// POST /api/orders/:id/edit-start - Restore stock before editing
router.post('/:id/edit-start', startEditOrder);

// PUT /api/orders/:id - Update order for authenticated user
router.put('/:id', validateOrder, updateOrder);

// DELETE /api/orders/:id - Delete order for authenticated user
router.delete('/:id', deleteOrder);

// POST /api/orders/reconcile-stock - Admin-only reconcile product stock from delivered+paid orders
router.post('/reconcile-stock', adminOnly, reconcileStockFromOrders);

module.exports = router;
