const { promisePool } = require('../config/db');

class Order {
  // Create table with external_id & platform
  static async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        products TEXT,
        subtotal DECIMAL(10,2) NULL,
        discount_amount DECIMAL(10,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        total_price DECIMAL(10,2),
        tax_included TINYINT(1) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Pending',
        payment_status VARCHAR(50) DEFAULT 'Unpaid',
        payment_method VARCHAR(50) DEFAULT 'Cash',
        courier VARCHAR(100) DEFAULT NULL,
        tracking_id VARCHAR(100) DEFAULT NULL,
        channel VARCHAR(100) DEFAULT 'Manual',
        partial_paid_amount DECIMAL(10,2) DEFAULT NULL,
        platform ENUM('manual','shopify','woocommerce') DEFAULT 'manual',
        external_id VARCHAR(255) DEFAULT NULL,
        user_id INT NOT NULL,
        account_id VARCHAR(36) NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    try {
      await promisePool.execute(sql);
      
      // Ensure missing columns exist on previously created tables
      const [productsCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'products'`
      );
      if ((productsCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN products JSON AFTER address");
      }

      const [subtotalCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'subtotal'`
      );
      if ((subtotalCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) NULL AFTER products");
      }

      const [discountCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'discount_amount'`
      );
      if ((discountCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0 AFTER subtotal");
      }

      const [totalPriceCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'total_price'`
      );
      if ((totalPriceCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN total_price DECIMAL(10,2) AFTER discount_amount");
      }

      const [taxAmountCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tax_amount'`
      );
      if ((taxAmountCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0 AFTER total_price");
      }

      const [taxIncludedCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tax_included'`
      );
      if ((taxIncludedCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN tax_included TINYINT(1) DEFAULT 0 AFTER tax_amount");
      }

      const [courierCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'courier'`
      );
      if ((courierCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN courier VARCHAR(100) DEFAULT NULL AFTER payment_method");
      }

      const [trackingIdCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tracking_id'`
      );
      if ((trackingIdCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN tracking_id VARCHAR(100) DEFAULT NULL AFTER courier");
      }

      const [channelCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'channel'`
      );
      if ((channelCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN channel VARCHAR(100) DEFAULT 'Manual' AFTER tracking_id");
      }

      const [partialPaidCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'partial_paid_amount'`
      );
      if ((partialPaidCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN partial_paid_amount DECIMAL(10,2) DEFAULT NULL AFTER channel");
      }

      const [platformCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'platform'`
      );
      if ((platformCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN platform ENUM('manual','shopify','woocommerce') DEFAULT 'manual' AFTER payment_method");
      }

      const [externalIdCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'external_id'`
      );
      if ((externalIdCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN external_id VARCHAR(255) DEFAULT NULL AFTER platform");
      }

      const [acctCol] = await promisePool.execute(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'account_id'`
      );
      if ((acctCol[0]?.cnt || 0) === 0) {
        await promisePool.execute("ALTER TABLE orders ADD COLUMN account_id VARCHAR(36) NULL AFTER user_id");
      }

      console.log('Orders table ready');
    } catch (error) {
      console.error('Error creating orders table:', error.message);
      throw error;
    }
  }

  // External order mapping removed

  // External upsert removed

  // Manual CRUD methods
  static async findAll(accountId) {
    if (accountId == null) {
      const [rows] = await promisePool.execute('SELECT * FROM orders ORDER BY id DESC');
      return rows;
    }
    const [rows] = await promisePool.execute('SELECT * FROM orders WHERE account_id=? ORDER BY id DESC', [accountId]);
    return rows;
  }

  static async findById(id, accountId) {
    if (accountId == null) {
      const [rows] = await promisePool.execute('SELECT * FROM orders WHERE id=?', [id]);
      return rows[0] || null;
    }
    const [rows] = await promisePool.execute('SELECT * FROM orders WHERE id=? AND account_id=?', [id, accountId]);
    return rows[0] || null;
  }

  static async create(orderData, userId, accountId) {
    const [result] = await promisePool.execute(
      `INSERT INTO orders (order_id, user_id, customer_name, phone, address, products, subtotal, discount_amount, total_price, tax_amount, tax_included, status, payment_status, payment_method, courier, tracking_id, channel, partial_paid_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderData.order_id,
        userId,
        orderData.customer_name,
        orderData.phone,
        orderData.address,
        JSON.stringify(orderData.products || []),
        orderData.subtotal ?? null,
        orderData.discount_amount ?? 0,
        orderData.total_price,
        orderData.tax_amount ?? 0,
        orderData.tax_included ? 1 : 0,
        orderData.status,
        orderData.payment_status,
        orderData.payment_method,
        orderData.courier ?? null,
        orderData.tracking_id ?? null,
        orderData.channel || 'Manual',
        orderData.partial_paid_amount ?? null
      ]
    );
    // Attach account_id via separate update to avoid changing INSERT column order
    await promisePool.execute('UPDATE orders SET account_id=? WHERE id=?', [accountId, result.insertId]);
    return { id: result.insertId, ...orderData, user_id: userId, account_id: accountId };
  }

  static async update(id, orderData, accountId) {
    const [result] = await promisePool.execute(
      `UPDATE orders SET order_id=?, customer_name=?, phone=?, address=?, products=?, subtotal=?, discount_amount=?, total_price=?, tax_amount=?, tax_included=?, status=?, payment_status=?, payment_method=?, courier=?, tracking_id=?, channel=?, partial_paid_amount=? 
       WHERE id=?${accountId == null ? '' : ' AND account_id=?'}`,
      [
        orderData.order_id,
        orderData.customer_name,
        orderData.phone,
        orderData.address,
        JSON.stringify(orderData.products || []),
        orderData.subtotal ?? null,
        orderData.discount_amount ?? 0,
        orderData.total_price,
        orderData.tax_amount ?? 0,
        orderData.tax_included ? 1 : 0,
        orderData.status,
        orderData.payment_status,
        orderData.payment_method,
        orderData.courier ?? null,
        orderData.tracking_id ?? null,
        orderData.channel || 'Manual',
        orderData.partial_paid_amount ?? null,
        id,
        ...(accountId == null ? [] : [accountId])
      ]
    );
    return result.affectedRows > 0 ? { id, ...orderData, account_id: accountId ?? undefined } : null;
  }

  static async delete(id, accountId) {
    if (accountId == null) {
      const [result] = await promisePool.execute('DELETE FROM orders WHERE id=?', [id]);
      return result.affectedRows > 0;
    }
    const [result] = await promisePool.execute('DELETE FROM orders WHERE id=? AND account_id=?', [id, accountId]);
    return result.affectedRows > 0;
  }
}

module.exports = Order;
