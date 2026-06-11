const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');

router.post('/apply', verifyToken, async (req, res) => {
    const { leaveType, startDate, endDate, reason } = req.body;

    const employeeId = req.user.id;

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        const newLeave = await pool.query(
            `INSERT INTO leaves (employee_id, leave_type, start_date, end_date, days, reason) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [employeeId, leaveType, startDate, endDate, days, reason]
        );

        res.status(201).json({
            message: 'Leave applied successfully',
            leave: newLeave.rows[0]
        });

    } catch (error) {
        console.error('Error applying leave:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/leaves/history
// Fetches all leave requests for the logged-in employee
router.get('/history', verifyToken, async (req, res) => {
    try {
        const employeeId = req.user.id;

        // Fetch leaves ordered by most recent first
        const history = await pool.query(
            `SELECT * FROM leaves 
       WHERE employee_id = $1 
       ORDER BY start_date DESC`,
            [employeeId]
        );

        res.status(200).json(history.rows);
    } catch (error) {
        console.error('Error fetching leave history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;