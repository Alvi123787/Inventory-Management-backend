const { promisePool } = require('../config/db');

const Product = {
  // Create table with external_id & platform
  createTable: async () => {
    try {
      const sql = `
        CREATE TABLE IF NOT EXISTS products (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          discount_rate DECIMAL(5,2) DEFAULT 0,
          cost DECIMAL(10,2) NOT NULL,
          stock INT NOT NULL,
          image_url MEDIUMTEXT DEFAULT NULL,
          product_date DATE DEFAULT NULL,
          user_id INT NOT NULL,
          account_id VARCHAR(36) NULL,
          platform ENUM('manual','shopify','woocommerce') DEFAULT 'manual',
          external_id VARCHAR(255) DEFAULT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `;
      await promisePool.execute(sql);

      // Ensure missing columns exist on previously created tables
      const [discountCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'discount_rate'`
      );
      if ((discountCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE products ADD COLUMN discount_rate DECIMAL(5,2) DEFAULT 0 AFTER price");
      }
      const [imageCol] = await promisePool.execute(
        `SELECT DATA_TYPE, COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'image_url'`
      );
      if ((imageCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE products ADD COLUMN image_url MEDIUMTEXT DEFAULT NULL AFTER stock");
      } else {
        const currentType = imageCol[0]?.DATA_TYPE?.toLowerCase();
        if (currentType && currentType !== 'mediumtext' && currentType !== 'longtext') {
          await promisePool.execute("ALTER TABLE products MODIFY COLUMN image_url MEDIUMTEXT DEFAULT NULL");
          console.log('Migrated products.image_url to MEDIUMTEXT to support larger images');
        }
      }
      // Ensure product_date column exists
      const [dateCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'product_date'`
      );
      if ((dateCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE products ADD COLUMN product_date DATE DEFAULT NULL AFTER image_url");
      }
      // Ensure account_id exists
      const [acctCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'account_id'`
      );
      if ((acctCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE products ADD COLUMN account_id VARCHAR(36) NULL AFTER user_id");
      }
      console.log('Products table ready');
    } catch (error) {
      console.error('Error creating products table:', error.message);
      throw error;
    }
  },

  // External product mapping removed,

  // External upsert removed,

  // Existing manual methods
  getAll: async (accountId) => {
    if (accountId == null) {
      const [rows] = await promisePool.execute('SELECT * FROM products ORDER BY id DESC');
      return rows;
    }
    const [rows] = await promisePool.execute(
      'SELECT * FROM products WHERE account_id = ? ORDER BY id DESC',
      [accountId]
    );
    return rows;
  },

  getById: async (id, accountId) => {
    if (accountId == null) {
      const [rows] = await promisePool.execute('SELECT * FROM products WHERE id=?', [id]);
      return rows[0] || null;
    }
    const [rows] = await promisePool.execute(
      'SELECT * FROM products WHERE id=? AND account_id=?',
      [id, accountId]
    );
    return rows[0] || null;
  },

  create: async (productData, userId, accountId) => {
    const { name, price, discount_rate, cost, stock, image_url, product_date } = productData;
    const [result] = await promisePool.execute(
      'INSERT INTO products (name, price, discount_rate, cost, stock, image_url, product_date, user_id, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, parseFloat(price), parseFloat(discount_rate || 0), parseFloat(cost), parseInt(stock), image_url || null, product_date || null, userId, accountId]
    );
    return { id: result.insertId, ...productData, user_id: userId, account_id: accountId };
  },

  update: async (id, productData, accountId) => {
    const { name, price, discount_rate, cost, stock, image_url, product_date } = productData;
    if (accountId == null) {
      const [result] = await promisePool.execute(
        'UPDATE products SET name=?, price=?, discount_rate=?, cost=?, stock=?, image_url=?, product_date=? WHERE id=?',
        [name, parseFloat(price), parseFloat(discount_rate || 0), parseFloat(cost), parseInt(stock), image_url || null, product_date || null, id]
      );
      return result.affectedRows > 0 ? { id, ...productData } : null;
    }
    const [result] = await promisePool.execute(
      'UPDATE products SET name=?, price=?, discount_rate=?, cost=?, stock=?, image_url=?, product_date=? WHERE id=? AND account_id=?',
      [name, parseFloat(price), parseFloat(discount_rate || 0), parseFloat(cost), parseInt(stock), image_url || null, product_date || null, id, accountId]
    );
    return result.affectedRows > 0 ? { id, ...productData, account_id: accountId } : null;
  },

  delete: async (id, accountId) => {
    if (accountId == null) {
      const [result] = await promisePool.execute('DELETE FROM products WHERE id=?', [id]);
      return result.affectedRows > 0;
    }
    const [result] = await promisePool.execute(
      'DELETE FROM products WHERE id=? AND account_id=?',
      [id, accountId]
    );
    return result.affectedRows > 0;
  },

  // Adjust stock by a delta (can be negative). Ensures stock does not go below 0.
  adjustStock: async (id, delta, accountId) => {
    const parsedDelta = parseInt(delta, 10) || 0;
    if (accountId == null) {
      await promisePool.execute('UPDATE products SET stock = GREATEST(stock + ?, 0) WHERE id=?', [parsedDelta, id]);
      return true;
    }
    await promisePool.execute('UPDATE products SET stock = GREATEST(stock + ?, 0) WHERE id=? AND account_id=?', [parsedDelta, id, accountId]);
    return true;
  }
};

module.exports = Product;
