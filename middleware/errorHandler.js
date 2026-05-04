/**
 * Global error handling middleware for Express.
 * - Logs error stack to console.
 * - Handles specific Mongoose errors (CastError, duplicate key, validation).
 * - Sends formatted JSON response with status code and message.
 */
const errorHandler = (err, req, res, next) => {
  // Log error with timestamp and request info
  console.error({
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    error: err.stack || err.message
  });

  // Default error
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Mongoose bad ObjectId (invalid ID format)
  if (err.name === 'CastError') {
    error.message = 'Resource not found';
    error.statusCode = 404;
  }

  // Handle duplicate key error (unique field violation)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    error.message = `${field} already exists`;
    error.statusCode = 400;
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors)
      .map(val => val.message)
      .join(', ');
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired. Please login again';
    error.statusCode = 401;
  }

  // Rate limiting error
  if (err.statusCode === 429) {
    error.message = err.message || 'Too many requests, please try again later';
    error.statusCode = 429;
  }

  // Send response with appropriate status code and message
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Export the errorHandler middleware
module.exports = errorHandler;