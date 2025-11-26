const { promisePool } = require('../config/db');

const StatusModel = {
  createTable: async () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS statuses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `;
    await promisePool.execute(sql);
    console.log('Statuses table ready');
  },

  getAll: async () => {
    const [rows] = await promisePool.execute(
      'SELECT id, name FROM statuses ORDER BY name ASC'
    );
    return rows;
  },

  add: async (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Name is required');
    const [result] = await promisePool.execute(
      'INSERT INTO statuses (name) VALUES (?)',
      [trimmed]
    );
    return { id: result.insertId, name: trimmed };
  }
};

module.exports = StatusModel;
