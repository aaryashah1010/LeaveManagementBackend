const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');

// POST /api/leaves/apply
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

// GET /api/leaves/pending
router.get('/pending', verifyToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                l.id, 
                e.name, 
                e.department, 
                l.leave_type AS "leaveType", 
                l.start_date AS "startDate", 
                l.end_date AS "endDate", 
                l.days, 
                l.start_date AS "appliedDate",
                l.reason,
                l.status
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE LOWER(l.status) = 'pending' -- Converts whatever is in DB to lowercase to ensure a match!
            ORDER BY l.start_date ASC;
        `;

        const result = await pool.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching pending leaves:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// PUT /api/leaves/:id/status
// Updates the status of a leave request (Approve/Reject)
router.put('/:id/status', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { status, comment } = req.body;

    try {
        // Ensure the status is valid
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        // Update the database
        const result = await pool.query(
            `UPDATE leaves 
             SET status = $1, manager_comment = $2 
             WHERE id = $3 RETURNING *`,
            [status, comment || null, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        res.status(200).json({ 
            message: `Leave ${status.toLowerCase()} successfully`, 
            leave: result.rows[0] 
        });
    } catch (error) {
        console.error('Error updating leave status:', error);
        res.status(500).json({ message: 'Internal server error while updating status' });
    }
});
// GET /api/leaves/my-leaves
// Fetches the leave history for the currently logged-in employee
router.get('/my-leaves', verifyToken, async (req, res) => {
    try {
        // req.user.id is securely set by your verifyToken middleware
        const query = `
            SELECT 
                id, 
                leave_type AS "leaveType", 
                start_date AS "startDate", 
                end_date AS "endDate", 
                days, 
                applied_date AS "appliedDate",
                reason,
                status,
                manager_comment AS "managerComment"
            FROM leaves
            WHERE employee_id = $1
            ORDER BY applied_date DESC;
        `;

        const result = await pool.query(query, [req.user.id]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching employee leaves:', error);
        res.status(500).json({ message: 'Internal server error fetching history' });
    }
});

// GET /api/leaves/manager-stats
// Fetches top-level widget statistics for the manager dashboard
router.get('/manager-stats', verifyToken, async (req, res) => {
    try {
        const managerId = req.user.id;

        // One powerful query to grab all 4 metrics at once for this specific manager
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'Pending' AND e.reporting_manager_id = $1) as pending_approvals,
                (SELECT COUNT(*) FROM employees WHERE reporting_manager_id = $1) as team_members,
                (SELECT COUNT(*) FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'Approved' AND CURRENT_DATE BETWEEN l.start_date AND l.end_date AND e.reporting_manager_id = $1) as on_leave_today,
                (SELECT COUNT(*) FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'Approved' AND EXTRACT(MONTH FROM l.applied_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND e.reporting_manager_id = $1) as approved_this_month
        `;
        
        const result = await pool.query(statsQuery, [managerId]);
        const stats = result.rows[0];

        res.status(200).json({
            pendingApprovals: parseInt(stats.pending_approvals) || 0,
            teamMembers: parseInt(stats.team_members) || 0,
            onLeaveToday: parseInt(stats.on_leave_today) || 0,
            approvedThisMonth: parseInt(stats.approved_this_month) || 0
        });
    } catch (error) {
        console.error('Error fetching manager stats:', error);
        res.status(500).json({ message: 'Internal server error fetching stats' });
    }
});

module.exports = router;