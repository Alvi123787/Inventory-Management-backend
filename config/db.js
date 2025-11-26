const mysql = require('mysql2');

// Create connection pool for the online MySQL database (mysql2)
const pool = mysql.createPool({
  host: 'sql7.freesqldatabase.com',
  user: 'sql7809522',
  password: 'I4uJXxhiMt',
  database: 'sql7809522',
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Convert pool to use promises for async/await
const promisePool = pool.promise();

// Test database connection
const testConnection = async () => {
  try {
    const connection = await promisePool.getConnection();
    console.log('Connected to MySQL database successfully');
    connection.release();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = { promisePool, testConnection, pool };
