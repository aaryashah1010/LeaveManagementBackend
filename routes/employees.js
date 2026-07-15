const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');
const authorizeRole = require('../middleware/authorizeRole');

// =======================================================
// GET /api/employees/hr-dashboard
// Fetches HR Dashboard Statistics
// =======================================================
router.get('/hr-dashboard', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    try {

        // 1. Active Employees Count
        const activeRes = await pool.query(`SELECT COUNT(*) FROM employees WHERE status = 'Active'`);
        const activeEmployees = parseInt(activeRes.rows[0].count) || 0;

        // 2. Pending Leave Requests Count
        const pendingRes = await pool.query(`SELECT COUNT(*) FROM leaves WHERE LOWER(status) = 'pending'`);
        const pendingRequests = parseInt(pendingRes.rows[0].count) || 0;

        // 3. Leaves This Month Count
        const leavesMonthRes = await pool.query(`
            SELECT COUNT(*) FROM leaves 
            WHERE EXTRACT(MONTH FROM start_date) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        `);
        const leavesThisMonth = parseInt(leavesMonthRes.rows[0].count) || 0;

        // 4. Leaves by Department (Pie Chart)
        const leavesDeptRes = await pool.query(`
            SELECT e.department AS name, COUNT(l.id) AS value
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            GROUP BY e.department
            ORDER BY value DESC
        `);

        // 5. Headcount by Department (Bar Chart)
        const headcountDeptRes = await pool.query(`
            SELECT department AS name, COUNT(id) AS count
            FROM employees
            WHERE status = 'Active'
            GROUP BY department
            ORDER BY count DESC
        `);

        res.status(200).json({
            activeEmployees,
            pendingRequests,
            leavesThisMonth,
            leavesByDepartment: leavesDeptRes.rows,
            headcountByDepartment: headcountDeptRes.rows
        });
    } catch (error) {
        console.error('Error fetching HR dashboard stats:', error);
        res.status(500).json({ message: 'Server error while fetching HR stats' });
    }
});

// 1. GET ALL EMPLOYEES (With their Manager's Name)
router.get('/', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    try {

        const query = `
            SELECT 
                e.id, e.employee_code, e.name, e.email, e.role, 
                e.department, e.designation, e.status, e.joining_date,
                e.reporting_manager_id,
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
router.post('/', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {

    const { 
        employee_code, name, email, role, department, 
        designation, reporting_manager_id, joining_date, status 
    } = req.body;

    try {
        // Validation: Unique Check (handled by catch block 23505 but good to have explicit)
        
        // Default password for new employees is 'password123'
        const hashedPassword = await bcrypt.hash('password123', 10);

        const insertQuery = `
            INSERT INTO employees 
            (employee_code, name, email, password, role, department, designation, reporting_manager_id, joining_date, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, name, email;
        `;
        
        const result = await pool.query(insertQuery, [
            employee_code, name, email, hashedPassword, role || 'Employee', 
            department, designation, reporting_manager_id || null, joining_date, status || 'Active'
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

// 3. UPDATE AN EMPLOYEE
router.put('/:id', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {

    const { id } = req.params;
    const { 
        name, email, role, department, 
        designation, reporting_manager_id, joining_date, status 
    } = req.body;

    try {
        const updateQuery = `
            UPDATE employees 
            SET name = $1, email = $2, role = $3, department = $4, 
                designation = $5, reporting_manager_id = $6, joining_date = $7, status = $8
            WHERE id = $9
            RETURNING *;
        `;
        
        const result = await pool.query(updateQuery, [
            name, email, role, department, designation, 
            reporting_manager_id || null, joining_date, status, id
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        res.json({ message: 'Employee updated successfully', employee: result.rows[0] });
    } catch (error) {
        console.error('Error updating employee:', error);
        if (error.code === '23505') { 
            return res.status(400).json({ message: 'Email already exists' });
        }
        res.status(500).json({ message: 'Server error while updating employee' });
    }
});

// 4. DELETE AN EMPLOYEE
router.delete('/:id', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {

    const { id } = req.params;

    try {
        const deleteQuery = 'DELETE FROM employees WHERE id = $1 RETURNING id';
        const result = await pool.query(deleteQuery, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ message: 'Server error while deleting employee' });
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

// GET /api/employees/team (Manager only)
router.get('/team', verifyToken, authorizeRole('Manager', 'Admin'), async (req, res) => {
    try {

        const query = `
            SELECT 
                e.id, e.employee_code AS "employeeCode", e.name, e.email, e.role, 
                e.department, e.designation, e.status, e.joining_date AS "joiningDate",
                e.casual_leave AS "casualLeave", e.sick_leave AS "sickLeave", 
                e.earned_leave AS "earnedLeave", e.wfh_balance AS "wfhBalance",
                e.phone,
                -- Check current leave status
                (
                    SELECT l.status
                    FROM leaves l
                    WHERE l.employee_id = e.id 
                    AND l.status = 'Approved'
                    AND CURRENT_DATE BETWEEN l.start_date AND l.end_date
                    LIMIT 1
                ) as current_leave_status
            FROM employees e
            WHERE e.reporting_manager_id = $1
            ORDER BY e.name ASC;
        `;
        const result = await pool.query(query, [req.user.id]);
        
        const team = result.rows.map(emp => ({
            ...emp,
            currentLeaveStatus: emp.current_leave_status ? 'On Leave' : 'Available'
        }));
        
        res.json(team);
    } catch (error) {
        console.error('Error fetching team members:', error);
        res.status(500).json({ message: 'Server error while fetching team members' });
    }
});

module.exports = router;