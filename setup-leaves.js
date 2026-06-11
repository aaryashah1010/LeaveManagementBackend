require('dotenv').config();
const pool = require('./db');

async function createLeavesTable() {
  try {
    console.log('Connecting to database on port 5433...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leaves (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
        leave_type VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days INTEGER NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ Leaves table successfully created!');
  } catch (error) {
    console.error('❌ Error creating table:', error);
  } finally {
    await pool.end();
  }
}

createLeavesTable();