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

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/employees', employeeRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'Backend is running securely.' });
});

const PORT = process.env.PORT || 3000;

console.log("2. About to listen on port", PORT);   // <<< ADD THIS

app.listen(PORT, () => {
    console.log(`3. Server running on port ${PORT}`);   // <<< CHANGE THIS
});

console.log("4. End of server.js");   // <<< ADD THIS