const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors");
const cookieParser = require('cookie-parser');
const path = require('path');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:7070', 'null'],
  credentials: true
}));

// Cookie Parser
app.use(cookieParser());

// Regular JSON body parsing for non-webhook routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

// Handle favicon request to avoid 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});
app.get('/', (req, res) => {
  res.redirect('/index.html');
});
// Explicit route for customerhome.html - serves fresh copy every time (bypass any caching)
app.get('/customerhome.html', (req, res) => {
  console.log('Serving customerhome.html - fresh copy');
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Last-Modified': new Date().toUTCString()
  });
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Backward-compatible signup alias (remove the space in filename)
app.get('/sign-up.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'sign-up.html'));
});

// Backward-compatible admin dashboard alias
app.get('/admin-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admindashboard.html'));
});

// Serve frontend static files from the project root
app.use(express.static(path.join(__dirname), {
  maxAge: 0,
  etag: false,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    }
  }
}));

// Database Connection
connectDB();

// Routes
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/courses", require("./routes/courseRoutes"));
app.use("/api/payment", require("./routes/paymentRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use('/api/chatbot', require('./routes/chatbotRoutes'));

// Error Handler
app.use(errorHandler);

// In production, prefer live Stripe keys but do not abort — use fake payments by default
if (process.env.NODE_ENV === 'production') {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    console.log('Live Stripe key detected; Stripe-based payments are possible.');
  } else {
    console.warn('No live Stripe key detected. Server will operate with fake payments in production.');
  }
}

// Graceful debug helpers
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err && err.message ? err.message : err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

const PORT = process.env.PORT || 7070;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});