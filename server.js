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
  rateLimit = () => (req, res, next) => next();
  rateLimit = (options) => (req, res, next) => next();
}

dotenv.config();

const app = express();

// Security middleware with proper CSP for inline handlers
if (helmet && typeof helmet === 'function') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        scriptSrcElem: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "http://localhost:7070", "http://localhost:11434", "https:"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
}

// Prevent MongoDB injection
app.use(mongoSanitize ? mongoSanitize() : (req, res, next) => next());

// CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:7070', 'null'],
  credentials: true
}));

// Cookie Parser
app.use(cookieParser());

// Regular JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

// Apply rate limiting if available
if (rateLimit && typeof rateLimit === 'function') {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
      success: false,
      error: 'Too many login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  app.use('/api/', apiLimiter);
  app.use('/api/users/login', authLimiter);
  app.use('/api/users/register', authLimiter);
}

// Handle favicon request
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

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

app.get('/sign-up.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'sign-up.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admindashboard.html'));
});

// Serve frontend static files
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