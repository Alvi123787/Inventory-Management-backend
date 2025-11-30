const { promisePool } = require('../config/db');
let initialized = false;

async function ensureReady() {
  if (!initialized) {
    try {
      await ProductHistory.createTable();
    } catch (_) {}
    initialized = true;
  }
}

const ProductHistory = {
  createTable: async () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS product_history (
        history_id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        field_changed VARCHAR(100) NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        user_id INT NULL,
        account_id VARCHAR(36) NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product (product_id),
        INDEX idx_account (account_id),
        INDEX idx_action (action_type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `;
    await promisePool.execute(sql);
    // Ensure account_id present
    const [acctCol] = await promisePool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_history' AND COLUMN_NAME = 'account_id'`
    );
    if ((acctCol[0]?.cnt || 0) === 0) {
      await promisePool.execute("ALTER TABLE product_history ADD COLUMN account_id VARCHAR(36) NULL AFTER user_id");
      await promisePool.execute("CREATE INDEX idx_account ON product_history(account_id)");
    }
  },

  logChange: async ({ product_id, action_type, field_changed, old_value, new_value, user_id, account_id }) => {
    await ensureReady();
    try {
      const [res] = await promisePool.execute(
        `INSERT INTO product_history (product_id, action_type, field_changed, old_value, new_value, user_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [product_id, action_type, field_changed || null, old_value != null ? String(old_value) : null, new_value != null ? String(new_value) : null, user_id, account_id || null]
      );
      return res.insertId;
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes("doesn't exist") || msg.includes('no such table') || e?.code === 'ER_NO_SUCH_TABLE') {
        try {
          await ProductHistory.createTable();
          const [res] = await promisePool.execute(
            `INSERT INTO product_history (product_id, action_type, field_changed, old_value, new_value, user_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [product_id, action_type, field_changed || null, old_value != null ? String(old_value) : null, new_value != null ? String(new_value) : null, user_id, account_id || null]
          );
          return res.insertId;
        } catch (_) {}
      }
      throw e;
    }
  },

  getAll: async ({ accountId, q, sortBy = 'timestamp', sortOrder = 'DESC', page = 1, limit = 50, productId } = {}) => {
    const offset = Math.max(0, (Number(page) - 1) * Number(limit));
    const orderCol = ['timestamp','action_type','field_changed'].includes(String(sortBy)) ? sortBy : 'timestamp';
    const orderDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const where = [];
    const params = [];
    if (accountId != null) {
      where.push('ph.account_id = ?');
      params.push(accountId);
    }
    if (productId) {
      where.push('ph.product_id = ?');
      params.push(Number(productId));
    }
    if (q) {
      const like = `%${String(q).trim()}%`;
      where.push('(p.name LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR ph.action_type LIKE ? OR ph.field_changed LIKE ? OR ph.old_value LIKE ? OR ph.new_value LIKE ?)');
      params.push(like, like, like, like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await promisePool.execute(
      `SELECT ph.*, 
              p.name AS product_name,
              p.image_url AS image_url,
              p.price AS price,
              p.discount_rate AS discount_rate,
              p.cost AS cost,
              p.stock AS stock,
              p.product_date AS product_date,
              u.name AS user_name,
              u.email AS user_email
       FROM product_history ph
       LEFT JOIN products p ON p.id = ph.product_id
       LEFT JOIN users u ON u.id = ph.user_id
       ${whereSql}
       ORDER BY ${orderCol} ${orderDir}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [countRows] = await promisePool.execute(
      `SELECT COUNT(*) AS cnt
       FROM product_history ph
       ${whereSql}`,
      params
    );
    return { rows, total: Number(countRows[0]?.cnt || 0), page: Number(page), limit: Number(limit) };
  },

  exportCSV: async (opts) => {
    const { rows } = await ProductHistory.getAll({ ...opts, page: 1, limit: 100000 });
    const header = ['history_id','product_id','product_name','action_type','field_changed','old_value','new_value','user_id','user_name','user_email','timestamp'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const vals = [
        r.history_id,
        r.product_id,
        r.product_name || '',
        r.action_type,
        r.field_changed || '',
        (r.old_value || '').replace(/"/g,'""'),
        (r.new_value || '').replace(/"/g,'""'),
        r.user_id,
        r.user_name || '',
        r.user_email || '',
        r.timestamp ? new Date(r.timestamp).toISOString().replace('T',' ').slice(0,19) : ''
      ].map(v => `"${String(v ?? '').replace(/\n/g,' ').replace(/\r/g,' ')}"`);
      lines.push(vals.join(','));
    }
    return lines.join('\n');
  }
};

module.exports = ProductHistory;
