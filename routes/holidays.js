const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');
const authorizeRole = require('../middleware/authorizeRole');

// GET /api/holidays
router.get('/', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM holidays ORDER BY date ASC');
        // Map database columns to match frontend interface
        const holidays = result.rows.map(row => ({
            id: row.id,
            date: row.date.toISOString().split('T')[0], // format as YYYY-MM-DD
            name: row.name,
            type: row.type
        }));
        res.status(200).json(holidays);
    } catch (error) {
        console.error('Error fetching holidays:', error);
        res.status(500).json({ message: 'Server error while fetching holidays' });
    }
});

// POST /api/holidays (HR/Admin only)
router.post('/', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    const { date, name, type } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO holidays (date, name, type) VALUES ($1, $2, $3) RETURNING *`,
            [date, name, type]
        );
        res.status(201).json({
            id: result.rows[0].id,
            date: result.rows[0].date.toISOString().split('T')[0],
            name: result.rows[0].name,
            type: result.rows[0].type
        });
    } catch (error) {
        console.error('Error adding holiday:', error);
        if (error.code === '23505') {
            return res.status(400).json({ message: 'Holiday already exists on this date' });
        }
        res.status(500).json({ message: 'Server error while adding holiday' });
    }
});

// DELETE /api/holidays/:date (HR/Admin only)
router.delete('/:date', verifyToken, authorizeRole('HR', 'Admin'), async (req, res) => {
    const { date } = req.params;
    try {
        const result = await pool.query('DELETE FROM holidays WHERE date = $1 RETURNING id', [date]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Holiday not found' });
        }
        res.json({ message: 'Holiday deleted successfully' });
    } catch (error) {
        console.error('Error deleting holiday:', error);
        res.status(500).json({ message: 'Server error while deleting holiday' });
    }
});

module.exports = router;
