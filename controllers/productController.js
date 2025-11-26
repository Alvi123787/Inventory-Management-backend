const Product = require('../models/productModel');
const { broadcast } = require('../utils/sse'); // ADD

const productController = {
  // Get all products for the authenticated user
  getAllProducts: async (req, res) => {
    try {
      const accountId = req.user.role === 'admin' ? null : req.user.account_id;
      const products = await Product.getAll(accountId);
      res.json({
        success: true,
        data: products,
        count: products.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching products',
        error: error.message
      });
    }
  },

  // Get product by ID for the authenticated user
  getProductById: async (req, res) => {
    try {
      const { id } = req.params;
      const accountId = req.user.role === 'admin' ? null : req.user.account_id;
      const product = await Product.getById(id, accountId);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      res.json({
        success: true,
        data: product
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching product',
        error: error.message
      });
    }
  },

  // Create new product for the authenticated user
  createProduct: async (req, res) => {
    try {
      const { name, price, discount_rate, cost, stock, image_url } = req.body;

      // Validate image size to avoid payload/DB errors
      const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
      let safeImageUrl = image_url;
      if (typeof image_url === 'string' && image_url.length > 0) {
        const bytes = Buffer.byteLength(image_url, 'utf8');
        if (bytes > MAX_IMAGE_BYTES) {
          return res.status(413).json({
            success: false,
            message: 'Image is too large. Please upload an image under 5MB.'
          });
        }
      }

      // Improved validation: allow 0 values and ensure numeric types
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const parsedPrice = Number(price);
      const parsedDiscount = Number(discount_rate ?? 0);
      const parsedCost = Number(cost);
      const parsedStock = Number(stock);

      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          message: 'Product name is required'
        });
      }

      if (Number.isNaN(parsedPrice) || Number.isNaN(parsedDiscount) || Number.isNaN(parsedCost) || Number.isNaN(parsedStock)) {
        return res.status(400).json({
          success: false,
          message: 'Price, discount_rate, cost, and stock must be numeric values'
        });
      }

      if (parsedPrice < 0 || parsedDiscount < 0 || parsedDiscount > 100 || parsedCost < 0 || parsedStock < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price, discount_rate(0-100), cost, and stock cannot be negative'
        });
      }

      const createdProduct = await Product.create({ name: trimmedName, price: parsedPrice, discount_rate: parsedDiscount, cost: parsedCost, stock: parsedStock, image_url: safeImageUrl }, req.user.id, req.user.account_id || null);
      
      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: createdProduct
      });
      broadcast('products.changed', { id: createdProduct.id }); // ADD
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating product',
        error: error.message
      });
    }
  },

  // Update product for the authenticated user
  updateProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, price, discount_rate, cost, stock, image_url } = req.body;

      // Validate image size to avoid payload/DB errors
      const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
      let safeImageUrl = image_url;
      if (typeof image_url === 'string' && image_url.length > 0) {
        const bytes = Buffer.byteLength(image_url, 'utf8');
        if (bytes > MAX_IMAGE_BYTES) {
          return res.status(413).json({
            success: false,
            message: 'Image is too large. Please upload an image under 5MB.'
          });
        }
      }

      // Improved validation: allow 0 values and ensure numeric types
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      const parsedPrice = Number(price);
      const parsedDiscount = Number(discount_rate ?? 0);
      const parsedCost = Number(cost);
      const parsedStock = Number(stock);

      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          message: 'Product name is required'
        });
      }

      if (Number.isNaN(parsedPrice) || Number.isNaN(parsedDiscount) || Number.isNaN(parsedCost) || Number.isNaN(parsedStock)) {
        return res.status(400).json({
          success: false,
          message: 'Price, discount_rate, cost, and stock must be numeric values'
        });
      }

      if (parsedPrice < 0 || parsedDiscount < 0 || parsedDiscount > 100 || parsedCost < 0 || parsedStock < 0) {
        return res.status(400).json({
          success: false,
          message: 'Price, discount_rate(0-100), cost, and stock cannot be negative'
        });
      }

      const accountId = req.user.role === 'admin' ? null : req.user.account_id;
      const updatedProduct = await Product.update(id, { name: trimmedName, price: parsedPrice, discount_rate: parsedDiscount, cost: parsedCost, stock: parsedStock, image_url: safeImageUrl }, accountId);
      
      if (!updatedProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or access denied'
        });
      }
      
      res.json({
        success: true,
        message: 'Product updated successfully',
        data: updatedProduct
      });
      broadcast('products.changed', { id }); // ADD
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating product',
        error: error.message
      });
    }
  },

  // Delete product for the authenticated user
  deleteProduct: async (req, res) => {
    try {
      const { id } = req.params;

      const accountId = req.user.role === 'admin' ? null : req.user.account_id;
      const deleted = await Product.delete(req.params.id, accountId);
      
      if (deleted) {
        res.json({
          success: true,
          message: 'Product deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Product not found or access denied'
        });
      }
      if (deleted) broadcast('products.changed', { id: Number(req.params.id) }); // ADD
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error deleting product',
        error: error.message
      });
    }
  }
};

module.exports = productController;
