require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function setupHolidays() {
    try {
        console.log("Creating holidays table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS holidays (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert initial data if empty
        const countRes = await pool.query('SELECT COUNT(*) FROM holidays');
        if (parseInt(countRes.rows[0].count) === 0) {
            console.log("Seeding initial holidays...");
            await pool.query(`
                INSERT INTO holidays (date, name, type) VALUES
                ('2024-01-26', 'Republic Day', 'National'),
                ('2024-03-25', 'Holi', 'Regional'),
                ('2024-08-15', 'Independence Day', 'National'),
                ('2024-10-02', 'Gandhi Jayanti', 'National'),
                ('2024-10-31', 'Diwali', 'Regional'),
                ('2024-12-25', 'Christmas', 'National')
            `);
        }
        console.log("Holidays setup complete!");
    } catch (err) {
        console.error("Error setting up holidays:", err);
    } finally {
        await pool.end();
    }
}

setupHolidays();
