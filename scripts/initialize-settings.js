const mongoose = require('mongoose');
const Settings = require('../models/Settings');
require('dotenv').config();

const initializeSettings = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/grad_proj';
    await mongoose.connect(mongoURI);

    const defaultSettings = [
      {
        type: 'general',
        data: {
          siteTitle: 'Artivio',
          supportEmail: 'support@artivio.com',
          primaryColor: '#6C2929',
          logo: ''
        }
      },
      {
        type: 'store',
        data: {
          currency: 'USD',
          taxRate: 10,
          lowStockAlert: 5
        }
      },
      {
        type: 'payment',
        data: {
          provider: 'Stripe',
          publicKey: 'pk_test_...',
          secretKey: 'sk_test_...'
        }
      },
      {
        type: 'academy',
        data: {
          allowFreeCourses: true,
          courseApprovalRequired: true,
          maxCoursePrice: 1000
        }
      },
      {
        type: 'notifications',
        data: {
          emailNotifications: true,
          orderNotifications: true,
          userRegistrationNotifications: false
        }
      }
    ];

    for (const setting of defaultSettings) {
      await Settings.findOneAndUpdate(
        { type: setting.type },
        setting,
        { upsert: true, new: true }
      );
    }

    console.log('Default settings initialized successfully!');

  } catch (error) {
    console.error('Error initializing settings:', error);
  } finally {
    await mongoose.disconnect();
  }
};

initializeSettings();