const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors");
const cookieParser = require('cookie-parser');
const path = require('path');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Optional security packages - with graceful fallback
let helmet, mongoSanitize, rateLimit;

try {
  helmet = require('helmet');
  console.log('✅ Helmet security package loaded');
} catch (e) {
  console.log('⚠️ Helmet not installed - skipping security headers');
  helmet = () => (req, res, next) => next();
}

try {
  mongoSanitize = require('express-mongo-sanitize');
  console.log('✅ MongoDB sanitizer loaded');
} catch (e) {
  console.log('⚠️ express-mongo-sanitize not installed - skipping injection protection');
  mongoSanitize = () => (req, res, next) => next();
}

try {
  rateLimit = require('express-rate-limit');
  console.log('✅ Rate limiter loaded');
} catch (e) {
  console.log('⚠️ express-rate-limit not installed - rate limiting disabled');
  rateLimit = (options) => (req, res, next) => next();
}

dotenv.config();

const app = express();

// Security middleware
if (helmet && typeof helmet === 'function') {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
}

app.use(mongoSanitize ? mongoSanitize() : (req, res, next) => next());

// CORS Configuration
const allowedOrigins = [
  'https://omarezzat7070.github.io',
  'https://*.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
  'http://localhost:7070',
  'http://127.0.0.1:7070',
  'null'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(pattern).test(origin);
      }
      return allowed === origin;
    });
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`Blocked CORS request from: ${origin}`);
      callback(new Error(`CORS policy does not allow access from: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Body parsing & cookies
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
if (rateLimit && typeof rateLimit === 'function') {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests from this IP, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many login attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', apiLimiter);
  app.use('/api/users/login', authLimiter);
  app.use('/api/users/register', authLimiter);
}

// Database Connection
connectDB();

// ── API Routes (MUST be before static files) ─────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/upload", require("./routes/uploadRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/courses", require("./routes/courseRoutes"));
app.use("/api/payment", require("./routes/paymentRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use('/api/chatbot', require('./routes/chatbotRoutes'));

// Error Handler (after routes, before static)
app.use(errorHandler);

// ── Static / Frontend (MUST be after API routes) ─────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/customerhome.html', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Last-Modified': new Date().toUTCString()
  });
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/sign-up.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'sign-up.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admindashboard.html'));
});

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

app.get('/', (req, res) => res.redirect('/index.html'));

// ─────────────────────────────────────────────────────────────────────────────

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err && err.message ? err.message : err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

const PORT = process.env.PORT || 7070;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`📍 Available at: http://localhost:${PORT}`);
});