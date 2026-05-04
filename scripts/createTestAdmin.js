const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createTestAdmin = async () => {
  try {
    // **FIXED: use same env variable as main app**
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/grad_proj';
    await mongoose.connect(mongoURI);

    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      return;
    }

    const admin = await User.create({
      name: 'Test Admin',
      email: 'admin@test.com',
      password: 'admin123',
      role: 'admin',
      emailVerified: true
    });

    console.log('Test admin created successfully!');
    console.log('Email: admin@test.com');
    console.log('Password: admin123');

    const testUsers = [
      {
        name: 'John Buyer',
        email: 'john@test.com',
        password: 'password123',
        role: 'customer',
        emailVerified: true
      },
      {
        name: 'Sarah Seller',
        email: 'sarah@test.com',
        password: 'password123',
        role: 'artisan',
        emailVerified: true
      },
      {
        name: 'Mike Customer',
        email: 'mike@test.com',
        password: 'password123',
        role: 'customer',
        emailVerified: false
      }
    ];

    for (const userData of testUsers) {
      await User.create(userData);
    }

    console.log('Test users created successfully!');

  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    await mongoose.disconnect();
  }
};

createTestAdmin();