const { promisePool } = require('../config/db');

const ProductHistory = {
  // Create product_history table
  createTable: async () => {
    try {
      const sql = `
        CREATE TABLE IF NOT EXISTS product_history (
          history_id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          action_type VARCHAR(50) NOT NULL,
          field_changed VARCHAR(255),
          old_value TEXT,
          new_value TEXT,
          user_id INT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_product_id (product_id),
          INDEX idx_user_id (user_id),
          INDEX idx_timestamp (timestamp),
          INDEX idx_action_type (action_type)
        )
      `;
      await promisePool.execute(sql);
      console.log('Product history table ready');
    } catch (error) {
      console.error('Error creating product_history table:', error.message);
      throw error;
    }
  },

  // Log a history entry
  log: async (productId, actionType, fieldChanged, oldValue, newValue, userId) => {
    try {
      const [result] = await promisePool.execute(
        `INSERT INTO product_history 
         (product_id, action_type, field_changed, old_value, new_value, user_id, timestamp) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [productId, actionType, fieldChanged, oldValue, newValue, userId]
      );
      return result;
    } catch (error) {
      console.error('Error logging product history:', error.message);
      throw error;
    }
  },

  // Get all history for a product
  getByProductId: async (productId, accountId) => {
    try {
      let query = `
        SELECT 
          ph.history_id,
          ph.product_id,
          ph.action_type,
          ph.field_changed,
          ph.old_value,
          ph.new_value,
          ph.user_id,
          u.name AS user_name,
          u.email AS user_email,
          ph.timestamp
        FROM product_history ph
        LEFT JOIN users u ON ph.user_id = u.id
        LEFT JOIN products p ON ph.product_id = p.id
        WHERE ph.product_id = ?
      `;
      const params = [productId];

      // If not admin, filter by account_id
      if (accountId) {
        query += ` AND (p.account_id = ? OR p.id IS NULL)`;
        params.push(accountId);
      }

      query += ` ORDER BY ph.timestamp DESC`;

      const [rows] = await promisePool.execute(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching product history:', error.message);
      throw error;
    }
  },

  // Get all history (paginated and searchable)
  getAll: async (accountId, page = 1, limit = 50, searchQuery = '') => {
    try {
      const safePage = Math.max(1, parseInt(page, 10) || 1);
      const safeLimit = Math.min(200, Math.max(10, parseInt(limit, 10) || 50));
      const offset = (safePage - 1) * safeLimit;
      let whereConditions = [];
      const params = [];

      // Add account filter if user is not admin (include deleted products rows)
      if (accountId) {
        whereConditions.push(`(p.account_id = ? OR p.id IS NULL)`);
        params.push(accountId);
      }

      // Add search filter if provided
      if (searchQuery) {
        const term = `%${String(searchQuery).trim()}%`;
        whereConditions.push(`(COALESCE(p.name,'') LIKE ? OR COALESCE(u.name,'') LIKE ? OR COALESCE(u.email,'') LIKE ? OR COALESCE(ph.action_type,'') LIKE ? OR COALESCE(ph.field_changed,'') LIKE ?)`);
        params.push(term, term, term, term, term);
      }

      // Build WHERE clause
      const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

      const countQuery = `
        SELECT COUNT(DISTINCT ph.history_id) AS total
        FROM product_history ph
        LEFT JOIN users u ON ph.user_id = u.id
        LEFT JOIN products p ON ph.product_id = p.id
        ${whereClause}
      `;

      const dataQuery = `
        SELECT 
          ph.history_id,
          ph.product_id,
          COALESCE(p.name, 'Deleted Product') AS product_name,
          ph.action_type,
          ph.field_changed,
          ph.old_value,
          ph.new_value,
          ph.user_id,
          u.name AS user_name,
          u.email AS user_email,
          ph.timestamp
        FROM product_history ph
        LEFT JOIN users u ON ph.user_id = u.id
        LEFT JOIN products p ON ph.product_id = p.id
        ${whereClause}
        ORDER BY ph.timestamp DESC
        LIMIT ? OFFSET ?
      `;

      const countParams = [...params];
      const dataParams = [...params, safeLimit, offset];

      const [countResult] = await promisePool.execute(countQuery, countParams);
      const [rows] = await promisePool.execute(dataQuery, dataParams);

      return {
        data: rows,
        total: countResult[0]?.total || 0,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil((countResult[0]?.total || 0) / safeLimit)
      };
    } catch (error) {
      console.error('Error fetching all product history:', error.message);
      throw error;
    }
  },

  // Get history summary for a product (latest changes)
  getSummary: async (productId, accountId, limit = 10) => {
    try {
      let query = `
        SELECT 
          ph.history_id,
          ph.product_id,
          ph.action_type,
          ph.field_changed,
          ph.old_value,
          ph.new_value,
          ph.user_id,
          u.name AS user_name,
          ph.timestamp
        FROM product_history ph
        LEFT JOIN users u ON ph.user_id = u.id
        LEFT JOIN products p ON ph.product_id = p.id
        WHERE ph.product_id = ?
      `;
      const params = [productId];

      if (accountId) {
        query += ` AND (p.account_id = ? OR p.id IS NULL)`;
        params.push(accountId);
      }

      query += ` ORDER BY ph.timestamp DESC LIMIT ?`;
      params.push(limit);

      const [rows] = await promisePool.execute(query, params);
      return rows;
    } catch (error) {
      console.error('Error fetching product history summary:', error.message);
      throw error;
    }
  }
};

module.exports = ProductHistory;
