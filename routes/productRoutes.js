const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');

// All product routes require authentication
router.use(protect);

// GET /api/products - Get all products for authenticated user
router.get('/', productController.getAllProducts);

// GET /api/products/:id - Get single product for authenticated user
router.get('/:id', productController.getProductById);

// POST /api/products - Create new product for authenticated user
router.post('/', productController.createProduct);

// PUT /api/products/:id - Update product for authenticated user
router.put('/:id', productController.updateProduct);

// DELETE /api/products/:id - Delete product for authenticated user
router.delete('/:id', productController.deleteProduct);

module.exports = router;