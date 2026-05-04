/**
 * Global error handling middleware for Express.
 * - Logs error stack to console.
 * - Handles specific Mongoose errors (CastError, duplicate key, validation).
 * - Sends formatted JSON response with status code and message.
 */
const errorHandler = (err, req, res, next) => {
  // Log full error stack for debugging
  console.error(err.stack);

  // Create a copy of the error object
  let error = { ...err };
  error.message = err.message;

  // Handle Mongoose bad ObjectId (invalid ID format)
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Handle duplicate key error (unique field violation)
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map(val => val.message)
      .join(', ');
    error = { message, statusCode: 400 };
  }

  // Send response with appropriate status code and message
  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error'
  });
};

// Export the errorHandler middleware
module.exports = errorHandler;