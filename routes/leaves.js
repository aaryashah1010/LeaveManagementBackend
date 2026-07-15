const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');
const authorizeRole = require('../middleware/authorizeRole');

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

        // Validation 3: Overlapping leaves
        const overlapQuery = `
            SELECT id FROM leaves 
            WHERE employee_id = $1 
              AND status IN ('Pending', 'Approved')
              AND (
                  (start_date <= $2 AND end_date >= $2) OR
                  (start_date <= $3 AND end_date >= $3) OR
                  (start_date >= $2 AND end_date <= $3)
              )
            LIMIT 1;
        `;
        const overlapResult = await pool.query(overlapQuery, [employeeId, startDate, endDate]);
        if (overlapResult.rowCount > 0) {
            return res.status(400).json({ message: 'You already have a Pending or Approved leave request overlapping with these dates.' });
        }

        // Validation 4: Leave Balance Check
        let balanceCol = '';
        if (leaveType === 'Casual Leave') balanceCol = 'casual_leave';
        else if (leaveType === 'Sick Leave') balanceCol = 'sick_leave';
        else if (leaveType === 'Earned Leave') balanceCol = 'earned_leave';
        else if (leaveType === 'Work From Home') balanceCol = 'wfh_balance';

        if (!balanceCol) {
            return res.status(400).json({ message: 'Invalid leave type.' });
        }

        const employeeQuery = `SELECT ${balanceCol} FROM employees WHERE id = $1`;
        const employeeResult = await pool.query(employeeQuery, [employeeId]);
        
        if (employeeResult.rowCount === 0) {
             return res.status(404).json({ message: 'Employee not found.' });
        }

        const availableBalance = employeeResult.rows[0][balanceCol];
        if (days > availableBalance) {
             return res.status(400).json({ 
                 message: `Insufficient ${leaveType} balance. Requested: ${days}, Available: ${availableBalance}` 
             });
        }

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
router.get('/pending', verifyToken, authorizeRole('Manager', 'Admin'), async (req, res) => {
    try {
        const query = `
            SELECT 
                l.id, 
                e.employee_code AS "employeeCode",
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
            WHERE LOWER(l.status) = 'pending' 
            AND e.reporting_manager_id = $1
            ORDER BY l.created_at DESC;
        `;

        const result = await pool.query(query, [req.user.id]);
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
            return res.status(400).json({ message: 'Invalid status' });
        }

        // RBAC: Check role
        if (req.user.role !== 'Manager' && req.user.role !== 'Admin') {
            return res.status(403).json({ message: 'Only Managers or Admins can approve/reject leaves.' });
        }

        const leaveQuery = `
            SELECT l.employee_id, l.status AS current_status, l.leave_type, l.days, e.reporting_manager_id 
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.id = $1
        `;
        const leaveResult = await pool.query(leaveQuery, [id]);

        if (leaveResult.rowCount === 0) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        const leaveData = leaveResult.rows[0];

        // Verify ownership
        if (req.user.role === 'Manager' && leaveData.reporting_manager_id !== req.user.id) {
            return res.status(403).json({ message: 'You are not authorized to process this leave.' });
        }

        if (leaveData.current_status !== 'Pending') {
            return res.status(400).json({ message: `Leave is already ${leaveData.current_status}` });
        }

        await pool.query('BEGIN');

        try {
            const updateResult = await pool.query(
                `
                UPDATE leaves
                SET status = $1, manager_comment = $2, processed_at = CURRENT_TIMESTAMP
                WHERE id = $3 RETURNING *;
                `,
                [status, comment || null, id]
            );

            if (status === 'Approved') {
                let balanceCol = '';
                if (leaveData.leave_type === 'Casual Leave') balanceCol = 'casual_leave';
                else if (leaveData.leave_type === 'Sick Leave') balanceCol = 'sick_leave';
                else if (leaveData.leave_type === 'Earned Leave') balanceCol = 'earned_leave';
                else if (leaveData.leave_type === 'Work From Home') balanceCol = 'wfh_balance';

                if (balanceCol) {
                    await pool.query(`UPDATE employees SET ${balanceCol} = ${balanceCol} - $1 WHERE id = $2`, [leaveData.days, leaveData.employee_id]);
                }
            }

            await pool.query('COMMIT');
            res.status(200).json({
                message: `Leave ${status.toLowerCase()} successfully`,
                leave: updateResult.rows[0]
            });
        } catch (txnError) {
            await pool.query('ROLLBACK');
            throw txnError;
        }

    } catch (error) {
        console.error('Error updating leave status:', error);
        res.status(500).json({ message: 'Internal server error while updating status' });
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
router.get('/manager-stats', verifyToken, authorizeRole('Manager', 'Admin'), async (req, res) => {

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

// =======================================================
// GET /api/leaves/team
// Fetches leaves for the manager's team (for Team Calendar)
// =======================================================
router.get('/team', verifyToken, authorizeRole('Manager', 'Admin'), async (req, res) => {
    try {

        const query = `
            SELECT 
                l.id, 
                e.employee_code AS "employeeCode",
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
            WHERE e.reporting_manager_id = $1
            ORDER BY l.start_date ASC;
        `;

        const result = await pool.query(query, [req.user.id]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching team leaves:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// =======================================================
// GET /api/leaves/reports
// Fetches aggregation reports for the manager's team
// =======================================================
router.get('/reports', verifyToken, authorizeRole('Manager', 'Admin'), async (req, res) => {
    try {

        const managerId = req.user.id;

        // 1. Leave Status Distribution (Pending vs Approved vs Rejected)
        const statusResult = await pool.query(`
            SELECT l.status, COUNT(*) as count
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE e.reporting_manager_id = $1
            GROUP BY l.status;
        `, [managerId]);

        // 2. Leave count by department
        const deptResult = await pool.query(`
            SELECT e.department, COUNT(*) as count
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE e.reporting_manager_id = $1
            GROUP BY e.department;
        `, [managerId]);

        // 3. Monthly approvals (for current year)
        const monthlyResult = await pool.query(`
            SELECT EXTRACT(MONTH FROM l.start_date) as month, COUNT(*) as count
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE e.reporting_manager_id = $1
            AND l.status = 'Approved'
            AND EXTRACT(YEAR FROM l.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY EXTRACT(MONTH FROM l.start_date)
            ORDER BY month ASC;
        `, [managerId]);

        res.status(200).json({
            statusDistribution: statusResult.rows,
            departmentDistribution: deptResult.rows,
            monthlyApprovals: monthlyResult.rows
        });
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ message: 'Internal server error fetching reports' });
    }
});

// =======================================================
// GET /api/leaves/hr-reports
// Fetches organization-wide aggregation reports for HR
// =======================================================
router.get('/hr-reports', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    try {
        // 1. Total summary
        const summaryRes = await pool.query(`
            SELECT 
                COUNT(*) as total_requests,
                COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_leaves,
                COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_leaves
            FROM leaves
            WHERE EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE);
        `);

        // 2. Monthly Trend (Casual vs Sick) for current year
        const monthlyRes = await pool.query(`
            SELECT 
                EXTRACT(MONTH FROM start_date) as month,
                COUNT(CASE WHEN leave_type = 'Casual Leave' THEN 1 END) as casual,
                COUNT(CASE WHEN leave_type = 'Sick Leave' THEN 1 END) as sick
            FROM leaves
            WHERE EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY EXTRACT(MONTH FROM start_date)
            ORDER BY month ASC;
        `);

        // 3. Leave Type Distribution (all time or current year)
        const typeRes = await pool.query(`
            SELECT leave_type, COUNT(*) as count
            FROM leaves
            WHERE EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY leave_type;
        `);

        // 4. Department Leaves
        const deptRes = await pool.query(`
            SELECT e.department as name, COUNT(l.id) as value
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE EXTRACT(YEAR FROM l.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY e.department;
        `);

        // 5. Avg Approval Time
        const avgApprovalRes = await pool.query(`
            SELECT e.department as dept, 
                   COALESCE(AVG(EXTRACT(EPOCH FROM (l.updated_at - l.created_at)) / 86400), 0) as avg_days
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status IN ('Approved', 'Rejected')
              AND l.updated_at IS NOT NULL
              AND EXTRACT(YEAR FROM l.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY e.department;
        `);

        res.status(200).json({
            summary: summaryRes.rows[0],
            monthlyTrend: monthlyRes.rows,
            leaveTypeDistribution: typeRes.rows,
            departmentLeaves: deptRes.rows,
            avgApprovalTime: avgApprovalRes.rows
        });
    } catch (error) {
        console.error('Error fetching HR reports:', error);
        res.status(500).json({ message: 'Internal server error fetching HR reports' });
    }
});

module.exports = router;