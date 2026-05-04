const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide a product name"],
      trim: true,
      maxlength: [100, "Name cannot be more than 100 characters"]
    },
    price: {
      type: Number,
      required: [true, "Please provide a price"],
      min: [0, "Price cannot be negative"]
    },
    image: {
      type: String,
      default: ''
    },
    brief: {
      type: String,
      required: [true, "Please provide a brief description"],
      maxlength: [500, "Brief cannot be more than 500 characters"]
    },
    category: {
      type: String,
      required: [true, "Please provide a category"],
      enum: ['Pottery', 'Jewelry', 'Textiles', 'Woodwork', 'Other']
    },
    artisan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    moderationStatus: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    moderationNote: {
      type: String,
      default: ''
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    moderatedAt: {
      type: Date,
      default: null
    },
    stock: {
      type: Number,
      default: 1
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);