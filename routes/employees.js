const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const verifyToken = require('../middleware/verifyToken');

// Database connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// 1. GET ALL EMPLOYEES (With their Manager's Name)
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                e.id, e.employee_code, e.name, e.email, e.role, 
                e.department, e.designation, e.status, e.joining_date,
                m.name AS manager_name 
            FROM employees e
            LEFT JOIN employees m ON e.reporting_manager_id = m.id
            ORDER BY e.id ASC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ message: 'Server error while fetching employees' });
    }
});

// 2. ADD A NEW EMPLOYEE
router.post('/', async (req, res) => {
    const { 
        employee_code, name, email, role, department, 
        designation, reporting_manager_id, joining_date 
    } = req.body;

    try {
        // Default password for new employees is 'password123'
        const hashedPassword = await bcrypt.hash('password123', 10);

        const insertQuery = `
            INSERT INTO employees 
            (employee_code, name, email, password, role, department, designation, reporting_manager_id, joining_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, name, email;
        `;
        
        const result = await pool.query(insertQuery, [
            employee_code, name, email, hashedPassword, role || 'Employee', 
            department, designation, reporting_manager_id || null, joining_date
        ]);

        res.status(201).json({ message: 'Employee created successfully', employee: result.rows[0] });
    } catch (error) {
        console.error('Error adding employee:', error);
        if (error.code === '23505') { // PostgreSQL unique violation error code
            return res.status(400).json({ message: 'Email or Employee Code already exists' });
        }
        res.status(500).json({ message: 'Server error while adding employee' });
    }
});

// GET /api/employees/me
router.get('/me', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                e.id, e.employee_code AS "employeeCode", e.name, e.email, e.role, 
                e.department, e.designation, e.status, e.joining_date AS "joiningDate",
                e.casual_leave AS "casualLeave", e.sick_leave AS "sickLeave", 
                e.earned_leave AS "earnedLeave", e.wfh_balance AS "wfhBalance",
                e.profile_image AS "profileImage", e.phone,
                m.name AS manager_name 
            FROM employees e
            LEFT JOIN employees m ON e.reporting_manager_id = m.id
            WHERE e.id = $1;
        `;
        const result = await pool.query(query, [req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching current employee:', error);
        res.status(500).json({ message: 'Server error while fetching profile' });
    }
});

// PUT /api/employees/me
router.put('/me', verifyToken, async (req, res) => {
    const { phone } = req.body;
    try {
        const query = `
            UPDATE employees 
            SET phone = $1
            WHERE id = $2
            RETURNING id, employee_code AS "employeeCode", name, email, role, department, designation, status, joining_date AS "joiningDate", casual_leave AS "casualLeave", sick_leave AS "sickLeave", earned_leave AS "earnedLeave", wfh_balance AS "wfhBalance", profile_image AS "profileImage", phone;
        `;
        const result = await pool.query(query, [phone, req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        res.json({ message: 'Profile updated successfully', user: result.rows[0] });
    } catch (error) {
        console.error('Error updating current employee:', error);
        res.status(500).json({ message: 'Server error while updating profile' });
    }
});

module.exports = router;