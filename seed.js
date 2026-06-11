require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function seedDatabase() {
    try {
        console.log('Connecting to database...');

        await pool.query(`
          CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'Employee',
            reset_token VARCHAR(255),
            reset_token_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('✅ Employees table ready.');

        const hashedPassword1 = await bcrypt.hash('kavy123', 10);
        await pool.query(
            'INSERT INTO employees (name, email, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            ['Kavy Sanghani', 'kavysanghani331@gmail.com', hashedPassword1, 'Employee']
        );
        console.log('✅ User added: kavysanghani331@gmail.com / kavy123');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

seedDatabase();
