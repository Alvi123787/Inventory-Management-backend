const express = require('express');
const router = express.Router();
const productHistoryController = require('../controllers/productHistoryController');
const { protect } = require('../middleware/authMiddleware');

// All history routes require authentication
router.use(protect);

// GET /api/product-history - Get all product history (paginated and searchable)
router.get('/', productHistoryController.getAllHistory);

// GET /api/product-history/:productId - Get history for a specific product
router.get('/product/:productId', productHistoryController.getProductHistory);

// GET /api/product-history/:productId/summary - Get history summary for a product
router.get('/product/:productId/summary', productHistoryController.getProductHistorySummary);

module.exports = router;
