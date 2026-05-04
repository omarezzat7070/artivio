const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Middleware to protect routes (authentication).
 * - Checks for JWT token in Authorization header (Bearer) or cookies.
 * - Verifies token and fetches user from database.
 * - Attaches user to req.user.
 * - Returns 401 if not authorized.
 */
const protect = async (req, res, next) => {
  let token;
  
  // Check token in Authorization header (Bearer token)
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  
  // If not found in header, check in cookies
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  
  // If no token found → Unauthorized
  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Not authorized to access this route"
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database using decoded ID
    req.user = await User.findById(decoded.id);

    // Continue to next middleware
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Not authorized to access this route"
    });
  }
};

/**
 * Middleware factory for role-based authorization.
 * - Accepts allowed roles as parameters.
 * - Checks if req.user.role is included in allowed roles.
 * - Returns 403 if user is not authorized.
 * Usage: authorize('admin', 'artisan')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // Get user role from req.user
    const userRole = req.user?.role;

    // If role is not allowed → Forbidden
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: `User role '${userRole}' is not authorized to access this route. Allowed roles: ${roles.join(', ')}`
      });
    }

    // Continue if authorized
    next();
  };
};

// Optional auth: attach req.user when token exists, but never block request
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
  } catch (err) {
    // ignore invalid token for optional auth
  }
  next();
};

module.exports = { protect, authorize, optionalAuth };