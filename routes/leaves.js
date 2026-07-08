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

        // Remove time part so only dates are compared
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        // Validation 1: Start date cannot be in the past
       

        // Validation 2: End date cannot be before start date
        if (end < start) {
            return res.status(400).json({
                message: 'End date cannot be before start date.'
            });
        }

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
                TO_CHAR(l.start_date, 'YYYY-MM-DD') AS "startDate", 
                TO_CHAR(l.end_date, 'YYYY-MM-DD') AS "endDate",
                l.days, 
                TO_CHAR(l.created_at, 'YYYY-MM-DD') AS "appliedDate",
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
// =======================================================
// PUT /api/leaves/:id/status
// Manager Approves / Rejects Leave
// =======================================================
router.put('/:id/status', verifyToken, async (req, res) => {

    const { id } = req.params;
    const { status, comment } = req.body;

    try {

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({
                message: 'Invalid status'
            });
        }

        const result = await pool.query(
            `
            UPDATE leaves

            SET
                status = $1,
                manager_comment = $2,
                processed_at = CURRENT_TIMESTAMP

            WHERE id = $3

            RETURNING *;
            `,
            [
                status,
                comment || null,
                id
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                message: 'Leave request not found'
            });
        }

        res.status(200).json({
            message: `Leave ${status.toLowerCase()} successfully`,
            leave: result.rows[0]
        });

    } catch (error) {

        console.error('Error updating leave status:', error);

        res.status(500).json({
            message: 'Internal server error while updating status'
        });

    }

});
// =======================================================
// GET /api/leaves/my-leaves
// Fetches all leave requests for the logged-in employee
// =======================================================
router.get('/my-leaves', verifyToken, async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT

                id,

                leave_type AS "leaveType",

                TO_CHAR(start_date, 'YYYY-MM-DD') AS "startDate",

                TO_CHAR(end_date, 'YYYY-MM-DD') AS "endDate",

                days,

                TO_CHAR(created_at, 'YYYY-MM-DD') AS "appliedDate",

                reason,

                status,

                manager_comment AS "managerComment"

            FROM leaves

            WHERE employee_id = $1

            ORDER BY created_at DESC;
            `,
            [req.user.id]
        );

        res.status(200).json(result.rows);

    }
    catch (error) {

        console.error('Error fetching employee leaves:', error);

        res.status(500).json({
            message: 'Internal server error fetching history'
        });

    }

});

// =======================================================
// DELETE /api/leaves/:id
// Employee can cancel only Pending leave
// =======================================================
router.delete('/:id', verifyToken, async (req, res) => {

    console.log("DELETE ROUTE HIT");
     
    const leaveId = req.params.id;
    const employeeId = req.user.id;

    try {

        const leave = await pool.query(
            `
            SELECT status
            FROM leaves
            WHERE id = $1
              AND employee_id = $2;
            `,
            [leaveId, employeeId]
        );

        if (leave.rowCount === 0) {
            return res.status(404).json({
                message: 'Leave request not found.'
            });
        }

        if (leave.rows[0].status !== 'Pending') {
            return res.status(400).json({
                message: 'Only pending requests can be cancelled.'
            });
        }

        await pool.query(
            `
            DELETE FROM leaves
            WHERE id = $1
              AND employee_id = $2;
            `,
            [leaveId, employeeId]
        );

        res.json({
            message: 'Leave cancelled successfully.'
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: 'Internal server error'
        });

    }

});


// =======================================================
// GET /api/leaves/manager-stats
// Fetches top-level widget statistics for the manager dashboard
// =======================================================
router.get('/manager-stats', verifyToken, async (req, res) => {

    try {

        const managerId = req.user.id;

        const statsQuery = `
            SELECT

            (
                SELECT COUNT(*)
                FROM leaves l
                JOIN employees e
                    ON l.employee_id = e.id
                WHERE
                    LOWER(l.status) = 'pending'
                    AND e.reporting_manager_id = $1
            ) AS pending_approvals,

            (
                SELECT COUNT(*)
                FROM employees
                WHERE reporting_manager_id = $1
            ) AS team_members,

            (
                SELECT COUNT(*)
                FROM leaves l
                JOIN employees e
                    ON l.employee_id = e.id
                WHERE
                    LOWER(l.status) = 'approved'
                    AND CURRENT_DATE BETWEEN l.start_date AND l.end_date
                    AND e.reporting_manager_id = $1
            ) AS on_leave_today,

            (
                SELECT COUNT(*)
                FROM leaves l
                JOIN employees e
                    ON l.employee_id = e.id
                WHERE
                    LOWER(l.status) = 'approved'
                    AND l.processed_at IS NOT NULL
                    AND EXTRACT(MONTH FROM l.processed_at) = EXTRACT(MONTH FROM CURRENT_DATE)
                    AND EXTRACT(YEAR FROM l.processed_at) = EXTRACT(YEAR FROM CURRENT_DATE)
                    AND e.reporting_manager_id = $1
            ) AS approved_this_month;
        `;

        const result = await pool.query(statsQuery, [managerId]);

        const stats = result.rows[0];

        res.status(200).json({
            pendingApprovals: parseInt(stats.pending_approvals) || 0,
            teamMembers: parseInt(stats.team_members) || 0,
            onLeaveToday: parseInt(stats.on_leave_today) || 0,
            approvedThisMonth: parseInt(stats.approved_this_month) || 0
        });

    }
    catch (error) {

        console.error('Error fetching manager stats:', error);

        res.status(500).json({
            message: 'Internal server error fetching stats'
        });

    }

});

module.exports = router;