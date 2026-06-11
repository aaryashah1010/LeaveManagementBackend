const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const verifyToken = require('../middleware/verifyToken');

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userResult = await pool.query('SELECT * FROM employees WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/logout', verifyToken, (req, res) => {
    res.status(200).json({ message: 'Logout successful' });
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const userResult = await pool.query('SELECT * FROM employees WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = await bcrypt.hash(resetToken, 10);
        const resetTokenExpires = new Date(Date.now() + 3600000);

        await pool.query(
            'UPDATE employees SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
            [resetTokenHash, resetTokenExpires, email]
        );

        const resetLink = `http://localhost:4200/reset-password?token=${resetToken}`;
        console.log(`Reset link (mock email): ${resetLink}`);

        res.status(200).json({ 
            message: 'Password reset link sent to email',
            resetLink
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }

        const userResult = await pool.query('SELECT * FROM employees WHERE reset_token IS NOT NULL');

        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        let validUser = null;
        for (const user of userResult.rows) {
            const validToken = await bcrypt.compare(token, user.reset_token);
            if (validToken && new Date(user.reset_token_expires) > new Date()) {
                validUser = user;
                break;
            }
        }

        if (!validUser) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE employees SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
            [hashedPassword, validUser.id]
        );

        res.status(200).json({ message: 'Password reset successful' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
