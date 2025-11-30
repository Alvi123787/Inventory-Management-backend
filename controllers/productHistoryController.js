const ProductHistory = require('../models/productHistoryModel');

const getHistory = async (req, res) => {
  try {
    const accountId = req.user.role === 'admin' ? null : req.user.account_id;
    const { q, sortBy, sortOrder, page, limit, productId } = req.query;
    const result = await ProductHistory.getAll({ accountId, q, sortBy, sortOrder, page: Number(page || 1), limit: Number(limit || 50), productId });
    res.json({ success: true, data: result.rows, total: result.total, page: result.page, limit: result.limit });
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('doesn\'t exist') || msg.includes('no such table') || error?.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ success: true, data: [], total: 0, page: Number(req.query.page || 1), limit: Number(req.query.limit || 50) });
    }
    res.status(500).json({ success: false, message: 'Failed to fetch product history', error: error.message });
  }
};

const exportHistory = async (req, res) => {
  try {
    const accountId = req.user.role === 'admin' ? null : req.user.account_id;
    const { q, sortBy, sortOrder, productId } = req.query;
    const csv = await ProductHistory.exportCSV({ accountId, q, sortBy, sortOrder, productId });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product_history.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export product history', error: error.message });
  }
};

module.exports = { getHistory, exportHistory };
