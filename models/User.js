const { promisePool } = require("../config/db");

const User = {
  createTable: async () => {
    const query = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','sub_admin','user') DEFAULT 'user',
        account_id VARCHAR(36) NULL,
        created_by INT NULL
      )
    `;
    await promisePool.query(query);

    // Migrations for existing databases
    // 1) Ensure ENUM includes 'sub_admin'
    await promisePool.query(
      "ALTER TABLE users MODIFY COLUMN role ENUM('admin','sub_admin','user') DEFAULT 'user'"
    );
    // 2) Ensure account_id exists
    const [acctCol] = await promisePool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'account_id'"
    );
    if (acctCol.length === 0) {
      await promisePool.query(
        "ALTER TABLE users ADD COLUMN account_id VARCHAR(36) NULL AFTER role"
      );
    }
    // 3) Ensure created_by exists
    const [createdByCol] = await promisePool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'created_by'"
    );
    if (createdByCol.length === 0) {
      await promisePool.query(
        "ALTER TABLE users ADD COLUMN created_by INT NULL AFTER account_id"
      );
    }
    // 4) Feature roles mapping table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        feature ENUM('products','orders','reports','dashboard') NOT NULL,
        UNIQUE KEY uniq_user_feature (user_id, feature),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  },

  // Ensure reset token columns exist
  createResetColumns: async () => {
    // Check if columns exist using INFORMATION_SCHEMA for broader MySQL compatibility
    const [tokenCol] = await promisePool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token'"
    );
    const [expiryCol] = await promisePool.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'reset_token_expiry'"
    );

    if (tokenCol.length === 0) {
      await promisePool.query(
        "ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL"
      );
    }
    if (expiryCol.length === 0) {
      await promisePool.query(
        "ALTER TABLE users ADD COLUMN reset_token_expiry DATETIME NULL"
      );
    }
  },

  findByEmail: async (email) => {
    const [rows] = await promisePool.query("SELECT * FROM users WHERE email = ?", [email]);
    return rows[0];
  },

  addUser: async (name, email, hashedPassword, role = "user", accountId = null, createdBy = null) => {
    const [result] = await promisePool.query(
      "INSERT INTO users (name, email, password, role, account_id, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, role, accountId, createdBy]
    );
    return result;
  },

  // NEW: Get all users (without passwords)
  getAllUsers: async () => {
    const [rows] = await promisePool.query(
      "SELECT id, name, email, role, account_id, created_by FROM users ORDER BY id DESC"
    );
    return rows;
  },

  // NEW: Delete user
  deleteUser: async (id) => {
    const [result] = await promisePool.query("DELETE FROM users WHERE id = ?", [id]);
    return result.affectedRows > 0;
  },

  // NEW: Set reset token and expiry
  setResetToken: async (userId, token, expiry) => {
    const [result] = await promisePool.query(
      "UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?",
      [token, expiry, userId]
    );
    return result.affectedRows > 0;
  },

  // NEW: Find user by reset token
  findByResetToken: async (token) => {
    const [rows] = await promisePool.query("SELECT * FROM users WHERE reset_token = ?", [token]);
    return rows[0];
  },

  // NEW: Update password by user id
  updatePasswordById: async (userId, hashedPassword) => {
    const [result] = await promisePool.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, userId]
    );
    return result.affectedRows > 0;
  },

  // NEW: Clear reset token
  clearResetToken: async (userId) => {
    const [result] = await promisePool.query(
      "UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = ?",
      [userId]
    );
    return result.affectedRows > 0;
  },

  // Feature roles helpers
  getFeatureRoles: async (userId) => {
    const [rows] = await promisePool.query(
      "SELECT feature FROM user_roles WHERE user_id = ?",
      [userId]
    );
    return rows.map(r => r.feature);
  },

  setFeatureRoles: async (userId, features) => {
    // Enforce max 2 features
    const unique = Array.from(new Set(features)).slice(0, 2);
    // Transactionally replace
    await promisePool.query("START TRANSACTION");
    try {
      await promisePool.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
      for (const f of unique) {
        await promisePool.query(
          "INSERT INTO user_roles (user_id, feature) VALUES (?, ?)",
          [userId, f]
        );
      }
      await promisePool.query("COMMIT");
      return unique;
    } catch (e) {
      await promisePool.query("ROLLBACK");
      throw e;
    }
  },
};

module.exports = User;
