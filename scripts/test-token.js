const jwt = require('jsonwebtoken');
require('dotenv').config();

// Create a test token for the admin user
const token = jwt.sign(
  { id: '507f1f77bcf86cd799439011', role: 'admin' }, // dummy ID, but should work for testing
  process.env.JWT_SECRET || 'your_jwt_secret_here'
);

console.log('Test token:', token);

// You can use this token in Postman or browser to test the API
// GET http://localhost:7070/api/users/admin/all
// Header: Authorization: Bearer <token>