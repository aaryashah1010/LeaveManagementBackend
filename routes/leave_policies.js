const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');
const authorizeRole = require('../middleware/authorizeRole');

// =======================================================
// GET /api/leave-policies
// Fetch all leave policies
// =======================================================
router.get('/', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    try {

        const result = await pool.query('SELECT * FROM leave_policies ORDER BY id ASC');
        
        // Map database columns to match frontend interface
        const policies = result.rows.map(row => ({
            id: row.id,
            type: row.type,
            annualQuota: row.annual_quota,
            carryForward: row.carry_forward,
            maxConsecutive: row.max_consecutive,
            noticeRequired: row.notice_required,
            paid: row.paid,
            requiresDocument: row.requires_document
        }));

        res.status(200).json(policies);
    } catch (error) {
        console.error('Error fetching leave policies:', error);
        res.status(500).json({ message: 'Server error while fetching policies' });
    }
});

// =======================================================
// PUT /api/leave-policies/:id
// Update a specific leave policy
// =======================================================
router.put('/:id', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    try {

        const { id } = req.params;
        const { annualQuota, carryForward, maxConsecutive, noticeRequired, paid, requiresDocument } = req.body;

        const result = await pool.query(
            `UPDATE leave_policies 
             SET annual_quota = $1, carry_forward = $2, max_consecutive = $3, 
                 notice_required = $4, paid = $5, requires_document = $6
             WHERE id = $7 
             RETURNING *`,
            [annualQuota, carryForward, maxConsecutive, noticeRequired, paid, requiresDocument, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Policy not found' });
        }

        const row = result.rows[0];
        const updatedPolicy = {
            id: row.id,
            type: row.type,
            annualQuota: row.annual_quota,
            carryForward: row.carry_forward,
            maxConsecutive: row.max_consecutive,
            noticeRequired: row.notice_required,
            paid: row.paid,
            requiresDocument: row.requires_document
        };

        res.status(200).json({ message: 'Policy updated successfully', policy: updatedPolicy });
    } catch (error) {
        console.error('Error updating leave policy:', error);
        res.status(500).json({ message: 'Server error while updating policy' });
    }
});

module.exports = router;
