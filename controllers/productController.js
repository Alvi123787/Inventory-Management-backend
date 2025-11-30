const Product = require('../models/productModel');
const ProductHistory = require('../models/productHistoryModel');
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
      const { name, price, discount_rate, cost, stock, image_url, product_date } = req.body;

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

      // Validate product_date if provided (should be valid date format YYYY-MM-DD)
      if (product_date && !/^\d{4}-\d{2}-\d{2}$/.test(product_date)) {
        return res.status(400).json({
          success: false,
          message: 'Product date must be in YYYY-MM-DD format'
        });
      }

      const createdProduct = await Product.create({ name: trimmedName, price: parsedPrice, discount_rate: parsedDiscount, cost: parsedCost, stock: parsedStock, image_url: safeImageUrl, product_date: product_date || null }, req.user.id, req.user.account_id || null);
      
      // Log CREATE action for each field (non-blocking - don't fail product creation if history logging fails)
      try {
        const fieldsToLog = ['name', 'price', 'discount_rate', 'cost', 'stock', 'product_date'];
        const fieldValues = {
          name: trimmedName,
          price: parsedPrice,
          discount_rate: parsedDiscount,
          cost: parsedCost,
          stock: parsedStock,
          product_date: product_date || null
        };
        
        for (const field of fieldsToLog) {
          await ProductHistory.log(
            createdProduct.id,
            'CREATE',
            field,
            null,
            String(fieldValues[field]),
            req.user.id
          );
        }
      } catch (historyError) {
        console.error('Warning: Failed to log product creation history:', historyError.message);
        // Don't fail the product creation if history logging fails
      }
      
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
      const { name, price, discount_rate, cost, stock, image_url, product_date } = req.body;

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

      // Validate product_date if provided (should be valid date format YYYY-MM-DD)
      if (product_date && !/^\d{4}-\d{2}-\d{2}$/.test(product_date)) {
        return res.status(400).json({
          success: false,
          message: 'Product date must be in YYYY-MM-DD format'
        });
      }

      const accountId = req.user.role === 'admin' ? null : req.user.account_id;
      
      // Get the existing product before update to log changes
      const existingProduct = await Product.getById(id, accountId);
      if (!existingProduct) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or access denied'
        });
      }
      
      const updatedProduct = await Product.update(id, { name: trimmedName, price: parsedPrice, discount_rate: parsedDiscount, cost: parsedCost, stock: parsedStock, image_url: safeImageUrl, product_date: product_date || null }, accountId);
      
      // Log UPDATE action for changed fields (non-blocking)
      try {
        const fieldsToCheck = [
          { key: 'name', newValue: trimmedName },
          { key: 'price', newValue: parsedPrice },
          { key: 'discount_rate', newValue: parsedDiscount },
          { key: 'cost', newValue: parsedCost },
          { key: 'stock', newValue: parsedStock },
          { key: 'product_date', newValue: product_date || null }
        ];
        
        for (const field of fieldsToCheck) {
          const oldValue = existingProduct[field.key];
          const newValue = field.newValue;
          
          // Only log if the value actually changed
          if (String(oldValue) !== String(newValue)) {
            await ProductHistory.log(
              id,
              'UPDATE',
              field.key,
              String(oldValue),
              String(newValue),
              req.user.id
            );
          }
        }
      } catch (historyError) {
        console.error('Warning: Failed to log product update history:', historyError.message);
        // Don't fail the product update if history logging fails
      }
      
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
      
      // Get the product before deletion to log it
      const product = await Product.getById(id, accountId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found or access denied'
        });
      }
      
      const deleted = await Product.delete(id, accountId);
      
      if (deleted) {
        // Log DELETE action (non-blocking)
        try {
          await ProductHistory.log(
            id,
            'DELETE',
            'product',
            JSON.stringify(product),
            null,
            req.user.id
          );
        } catch (historyError) {
          console.error('Warning: Failed to log product deletion history:', historyError.message);
          // Don't fail the product deletion if history logging fails
        }
        
        res.json({
          success: true,
          message: 'Product deleted successfully'
        });
        broadcast('products.changed', { id: Number(id) }); // ADD
      } else {
        res.status(404).json({
          success: false,
          message: 'Product not found or access denied'
        });
      }
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
