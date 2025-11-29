const { promisePool } = require('../config/db');

const Settings = {
  createTable: async () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS user_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        account_id VARCHAR(36) NULL,
        tax_inclusive TINYINT(1) DEFAULT 0,
        default_tax_rate DECIMAL(5,2) DEFAULT 0,
        default_discount_rate DECIMAL(5,2) DEFAULT 0,
        UNIQUE KEY uniq_user (user_id),
        UNIQUE KEY uniq_account (account_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    try {
      await promisePool.execute(sql);
      // Ensure account_id exists
      const [acctCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_settings' AND COLUMN_NAME = 'account_id'`
      );
      if ((acctCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE user_settings ADD COLUMN account_id VARCHAR(36) NULL AFTER user_id");
        await promisePool.execute("ALTER TABLE user_settings ADD UNIQUE KEY uniq_account (account_id)");
      }
      console.log('User settings table ready');
    } catch (error) {
      console.error('Error creating user_settings table:', error.message);
      throw error;
    }
  },

  getByUser: async (userId) => {
    const [rows] = await promisePool.execute(
      'SELECT * FROM user_settings WHERE user_id = ? LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },

  upsert: async (userId, data) => {
    const [urows] = await promisePool.execute('SELECT account_id FROM users WHERE id = ?', [userId]);
    const accountId = urows[0]?.account_id || null;
    const existing = await Settings.getByUser(userId);
    const tax_inclusive = data.tax_inclusive ? 1 : 0;
    const default_tax_rate = parseFloat(data.default_tax_rate || 0);
    const default_discount_rate = parseFloat(data.default_discount_rate || 0);

    if (existing) {
      await promisePool.execute(
        'UPDATE user_settings SET tax_inclusive=?, default_tax_rate=?, default_discount_rate=? WHERE account_id=?',
        [tax_inclusive, default_tax_rate, default_discount_rate, accountId]
      );
      return { ...existing, tax_inclusive, default_tax_rate, default_discount_rate };
    } else {
      const [res] = await promisePool.execute(
        'INSERT INTO user_settings (user_id, account_id, tax_inclusive, default_tax_rate, default_discount_rate) VALUES (?, ?, ?, ?, ?)',
        [userId, accountId, tax_inclusive, default_tax_rate, default_discount_rate]
      );
      return { id: res.insertId, user_id: userId, account_id: accountId, tax_inclusive, default_tax_rate, default_discount_rate };
    }
  }
};

module.exports = Settings;
