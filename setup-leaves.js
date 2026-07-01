require('dotenv').config();
const pool = require('./db');

async function createLeavesTable() {
  try {

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
        manager_comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      );
    `);

    // Update older databases safely
    await pool.query(`
      ALTER TABLE leaves
      ADD COLUMN IF NOT EXISTS manager_comment TEXT;
    `);

    await pool.query(`
      ALTER TABLE leaves
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await pool.query(`
      ALTER TABLE leaves
      ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
    `);


  } catch (error) {
    console.error('❌ Error creating/updating table:', error);
  } finally {
    await pool.end();
  }
}

createLeavesTable();