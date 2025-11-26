// models/expenseModel.js
const { promisePool } = require("../config/db");

const Expense = {
  createTable: async () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        account_id VARCHAR(36) NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        amount DECIMAL(10,2) NOT NULL,
        notes TEXT
      )
    `;
    await promisePool.execute(sql);
    const [acctCol] = await promisePool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'account_id'"
    );
    if ((acctCol[0]?.cnt || 0) === 0) {
      await promisePool.execute("ALTER TABLE expenses ADD COLUMN account_id VARCHAR(36) NULL AFTER user_id");
    }
    console.log("Expenses table ready");
  },

  getAll: async (accountId) => {
    if (accountId == null) {
      const [rows] = await promisePool.execute(
        "SELECT * FROM expenses ORDER BY id DESC"
      );
      return rows;
    }
    const [rows] = await promisePool.execute(
      "SELECT * FROM expenses WHERE account_id = ? ORDER BY id DESC",
      [accountId]
    );
    return rows;
  },

  add: async (data) => {
    const { user_id, account_id, title, category, amount, notes } = data;
    const [result] = await promisePool.execute(
      "INSERT INTO expenses (user_id, account_id, title, category, amount, notes) VALUES (?, ?, ?, ?, ?, ?)",
      [user_id, account_id || null, title, category || null, parseFloat(amount), notes || null]
    );
    return result;
  },

  delete: async (id, accountId) => {
    if (accountId == null) {
      const [result] = await promisePool.execute(
        "DELETE FROM expenses WHERE id = ?",
        [id]
      );
      return result;
    }
    const [result] = await promisePool.execute(
      "DELETE FROM expenses WHERE id = ? AND account_id = ?",
      [id, accountId]
    );
    return result;
  },

  update: async (id, data, accountId) => {
    const { title, category, amount, notes } = data;
    if (accountId == null) {
      const [result] = await promisePool.execute(
        "UPDATE expenses SET title = ?, category = ?, amount = ?, notes = ? WHERE id = ?",
        [title, category || null, parseFloat(amount), notes || null, id]
      );
      return result.affectedRows > 0 ? { id, title, category, amount: parseFloat(amount), notes } : null;
    }
    const [result] = await promisePool.execute(
      "UPDATE expenses SET title = ?, category = ?, amount = ?, notes = ? WHERE id = ? AND account_id = ?",
      [title, category || null, parseFloat(amount), notes || null, id, accountId]
    );
    return result.affectedRows > 0 ? { id, account_id: accountId, title, category, amount: parseFloat(amount), notes } : null;
  },
};

module.exports = Expense;
