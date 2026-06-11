require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit'); // 1. Import rate limiter

const app = express();

app.use(cors({ origin: 'http://localhost:4200' })); 
app.use(express.json());

// 2. Global Rate Limiter (Protects general API routes like fetching leaves)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
});
app.use(globalLimiter);

// 3. Strict Auth Limiter (Protects against brute-force login/password reset attacks)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to only 10 auth requests per window
  message: { message: 'Too many authentication attempts, please try again later' }
});

const authRoutes = require('./routes/auth');
const leaveRoutes = require('./routes/leaves');

// 4. Apply the strict limiter ONLY to auth routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/leaves', leaveRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'Backend is running securely.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running securely on port ${PORT}`);
});