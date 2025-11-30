const ProductHistory = require('../models/productHistoryModel');

const productHistoryController = {
  // Get all product history (paginated and searchable)
  getAllHistory: async (req, res) => {
    try {
      const { page = 1, limit = 50, search = '' } = req.query;
      const accountId = req.user.role === 'admin' ? null : req.user.account_id;

      const result = await ProductHistory.getAll(
        accountId,
        parseInt(page),
        parseInt(limit),
        search
      );

      res.json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching product history',
        error: error.message
      });
    }
  },

  // Get history for a specific product
  getProductHistory: async (req, res) => {
    try {
      const { productId } = req.params;
      const accountId = req.user.role === 'admin' ? null : req.user.account_id;

      const history = await ProductHistory.getByProductId(productId, accountId);

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching product history',
        error: error.message
      });
    }
  },

  // Get history summary for a product
  getProductHistorySummary: async (req, res) => {
    try {
      const { productId } = req.params;
      const { limit = 10 } = req.query;
      const accountId = req.user.role === 'admin' ? null : req.user.account_id;

      const history = await ProductHistory.getSummary(
        productId,
        accountId,
        parseInt(limit)
      );

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching product history summary',
        error: error.message
      });
    }
  }
};

module.exports = productHistoryController;
