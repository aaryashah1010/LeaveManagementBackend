require('dotenv').config();

console.log("1. Server file started");   // <<< ADD THIS

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many authentication attempts, please try again later' }
});

const authRoutes = require('./routes/auth');
const leaveRoutes = require('./routes/leaves');
const employeeRoutes = require('./routes/employees');
const leavePoliciesRoutes = require('./routes/leave_policies');
const holidayRoutes = require('./routes/holidays');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leave-policies', leavePoliciesRoutes);
app.use('/api/holidays', holidayRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'Backend is running securely.' });
});

const PORT = process.env.PORT || 3000;

console.log("2. About to listen on port", PORT);   // <<< ADD THIS

const server = app.listen(PORT, (err) => {
    if (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
    console.log(`3. Server running on port ${PORT}`);
});

console.log("4. End of server.js");   // <<< ADD THIS