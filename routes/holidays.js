const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');
const authorizeRole = require('../middleware/authorizeRole');

// GET /api/holidays
router.get('/', verifyToken, authorizeRole('HR', 'Admin', 'Manager', 'Employee'), async (req, res) => {
    try {
        const result = await pool.query("SELECT TO_CHAR(date, 'YYYY-MM-DD') as date, name, type FROM holidays ORDER BY date ASC");
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching holidays:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching holidays' });
    }
});

// POST /api/holidays (HR/Admin only)
router.post('/', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    const { date, name, type } = req.body;
    
    if (!date || !name) {
        return res.status(400).json({ success: false, message: 'Date and name are required' });
    }
    
    const validTypes = ['National', 'Regional', 'Company'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ success: false, message: 'Invalid holiday type' });
    }

    try {
        const existing = await pool.query('SELECT 1 FROM holidays WHERE date = $1', [date]);
        if (existing.rowCount > 0) {
            return res.status(400).json({ success: false, message: 'A holiday already exists on this date' });
        }

        const result = await pool.query(
            `INSERT INTO holidays (date, name, type) VALUES ($1, $2, $3) RETURNING TO_CHAR(date, 'YYYY-MM-DD') as date, name, type`,
            [date, name, type]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error adding holiday:', error);
        res.status(500).json({ success: false, message: 'Server error while adding holiday' });
    }
});

// DELETE /api/holidays/:date (HR/Admin only)
router.delete('/:date', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    const { date } = req.params;
    try {
        const result = await pool.query('DELETE FROM holidays WHERE date = $1', [date]);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Holiday not found' });
        }
        res.json({ success: true, message: 'Holiday deleted successfully' });
    } catch (error) {
        console.error('Error deleting holiday:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting holiday' });
    }
});

module.exports = router;
