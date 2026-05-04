const { body, param, query, validationResult } = require('express-validator');

// Middleware to check validation results
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg,
      details: errors.array()
    });
  }
  next();
};

// User validation rules
const userValidation = {
  register: [
    body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
      .matches(/[A-Z]/).withMessage('Must contain uppercase letter')
      .matches(/[a-z]/).withMessage('Must contain lowercase letter')
      .matches(/[0-9]/).withMessage('Must contain number')
      .matches(/[!@#$%^&*_-]/).withMessage('Must contain special character'),
    body('phone').optional().matches(/^\+20[0-9]{10}$/).withMessage('Valid Egyptian phone number required'),
    body('gender').isIn(['male', 'female']).withMessage('Valid gender required'),
    body('termsAccepted').equals('true').withMessage('Must accept terms')
  ],
  
  login: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required')
  ],
  
  updateProfile: [
    body('name').optional().trim().isLength({ min: 2, max: 50 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().matches(/^\+20[0-9]{10}$/),
    body('gender').optional().isIn(['male', 'female'])
  ],
  
  changePassword: [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
      .matches(/[A-Z]/).withMessage('Must contain uppercase')
      .matches(/[a-z]/).withMessage('Must contain lowercase')
      .matches(/[0-9]/).withMessage('Must contain number')
  ]
};

// Product validation
const productValidation = {
  create: [
    body('name').trim().isLength({ min: 3, max: 100 }).withMessage('Product name 3-100 characters'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be positive number'),
    body('brief').trim().isLength({ min: 10, max: 500 }).withMessage('Description 10-500 characters'),
    body('category').isIn(['Pottery', 'Jewelry', 'Textiles', 'Woodwork', 'Other']),
    body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be non-negative')
  ]
};

// Course validation
const courseValidation = {
  create: [
    body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title 5-100 characters'),
    body('description').trim().isLength({ min: 20, max: 1000 }).withMessage('Description 20-1000 characters'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be positive'),
    body('duration').isFloat({ min: 0.5 }).withMessage('Duration must be at least 0.5 hours'),
    body('parts').optional().isArray(),
    body('parts.*.title').optional().trim().notEmpty()
  ]
};

// Order validation
const orderValidation = {
  createCheckout: [
    body('items').isArray({ min: 1 }).withMessage('At least one item required'),
    body('items.*.id').notEmpty().withMessage('Item ID required'),
    body('items.*.type').isIn(['Product', 'Course']).withMessage('Valid item type required'),
    body('items.*.price').isFloat({ min: 0 }).withMessage('Valid price required')
  ]
};

// XSS Prevention - sanitize all inputs
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      // Remove any HTML tags and dangerous characters
      return obj.replace(/[<>]/g, '').trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item));
    }
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive fields that might need special handling
        if (key === 'password' || key === 'currentPassword' || key === 'newPassword') {
          sanitized[key] = value;
        } else {
          sanitized[key] = sanitize(value);
        }
      }
      return sanitized;
    }
    return obj;
  };
  
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  next();
};

module.exports = { validate, userValidation, productValidation, courseValidation, orderValidation, sanitizeInput };