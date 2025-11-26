const { promisePool } = require('./config/db');

async function fixDatabase() {
  try {
    console.log('Starting database schema fix...');
    
    // Drop the existing products table
    console.log('Dropping existing products table...');
    await promisePool.execute('DROP TABLE IF EXISTS products');
    
    // Create the products table with correct schema
    console.log('Creating products table with correct schema...');
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        stock INT NOT NULL,
        user_id INT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    
    await promisePool.execute(createTableSQL);
    console.log('Products table created successfully with user_id column!');
    
    // Also check and fix orders table if needed
    console.log('Checking orders table...');
    await promisePool.execute('DROP TABLE IF EXISTS orders');
    
    const createOrdersSQL = `
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        customer_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        address TEXT,
        product_title VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        courier VARCHAR(100),
        tracking_id VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Pending',
        payment_status VARCHAR(50) DEFAULT 'Unpaid',
        payment_method VARCHAR(50) DEFAULT 'Cash',
        user_id INT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    
    await promisePool.execute(createOrdersSQL);
    console.log('Orders table created successfully with correct schema!');
    
    console.log('Database schema fix completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('Error fixing database schema:', error);
    process.exit(1);
  }
}

fixDatabase();
