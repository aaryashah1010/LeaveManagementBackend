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
        
        // Recreate the table according to the requested schema
        await pool.query('DROP TABLE IF EXISTS holidays');
        
        await pool.query(`
            CREATE TABLE holidays (
                date DATE PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL
            );
        `);

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
        console.log("Holidays setup complete!");
    } catch (err) {
        console.error("Error setting up holidays:", err);
    } finally {
        await pool.end();
    }
}

setupHolidays();
