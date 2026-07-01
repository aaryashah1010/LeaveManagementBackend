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
        

        // 1. Create the base table (Module 1)
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

        // 2. Safely add the new Module 2 columns to the existing table
        await pool.query(`
          ALTER TABLE employees
          ADD COLUMN IF NOT EXISTS employee_code VARCHAR(50) UNIQUE,
          ADD COLUMN IF NOT EXISTS department VARCHAR(100),
          ADD COLUMN IF NOT EXISTS designation VARCHAR(100),
          ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER REFERENCES employees(id),
          ADD COLUMN IF NOT EXISTS joining_date DATE,
          ADD COLUMN IF NOT EXISTS relieving_date DATE,
          ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active',
          ADD COLUMN IF NOT EXISTS profile_image VARCHAR(255),
          ADD COLUMN IF NOT EXISTS casual_leave INT DEFAULT 12,
          ADD COLUMN IF NOT EXISTS sick_leave INT DEFAULT 10,
          ADD COLUMN IF NOT EXISTS earned_leave INT DEFAULT 15,
          ADD COLUMN IF NOT EXISTS wfh_balance INT DEFAULT 24;
        `);
        

        // 3. Create the Leaves Table (Added so Kavy's requests have a place to save!)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS leaves (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            leave_type VARCHAR(50) NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            days INTEGER NOT NULL,
            applied_date DATE DEFAULT CURRENT_DATE,
            reason TEXT,
            status VARCHAR(20) DEFAULT 'Pending'
          );
        `);

        // 4. Clear existing data to prevent duplicate email/code errors during seeding
        await pool.query('TRUNCATE TABLE employees CASCADE;');

        // 5. Create the Manager first (so we can get their ID)
        const managerPassword = await bcrypt.hash('manager123', 10);
        const managerRes = await pool.query(
            `INSERT INTO employees 
            (employee_code, name, email, password, role, department, designation, joining_date, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            ['EMP-001', 'Aarav Sharma', 'manager@company.com', managerPassword, 'Manager', 'Engineering', 'Engineering Manager', '2020-01-15', 'Active']
        );
        const managerId = managerRes.rows[0].id;

        // 6. Create Employees (Reporting to the Manager)
        const kavyPassword = await bcrypt.hash('kavy123', 10);
        const empPassword = await bcrypt.hash('emp123', 10);

        await pool.query(
            `INSERT INTO employees 
            (employee_code, name, email, password, role, department, designation, reporting_manager_id, joining_date, status) 
            VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10),
            ($11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
            [
                // Employee 1
                'EMP-002', 'Kavy Sanghani', 'kavysanghani331@gmail.com', kavyPassword, 'Employee', 'Engineering', 'Software Developer', managerId, '2023-06-01', 'Active',
                // Employee 2
                'EMP-003', 'Priya Patel', 'priya@company.com', empPassword, 'Employee', 'Engineering', 'QA Tester', managerId, '2023-08-15', 'Active'
            ]
        );


    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

seedDatabase();