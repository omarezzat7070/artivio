const mongoose = require('mongoose');

const partSchema = new mongoose.Schema(
  {
    partNumber: {
      type: Number,
      required: true,
      min: [1, "Part number must be at least 1"]
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    duration: { type: Number, default: 0, min: [0, "Duration cannot be negative"] },
    image: { type: String, default: '' },
    video: { type: String, default: '' },
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
    submittedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide a course title"],
      trim: true,
      maxlength: [100, "Title cannot be more than 100 characters"]
    },
    description: {
      type: String,
      required: [true, "Please provide a course description"],
      maxlength: [1000, "Description cannot be more than 1000 characters"]
    },
    duration: {
      type: Number,
      required: [true, "Please provide course duration in hours"],
      min: [1, "Duration must be at least 1 hour"]
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
    video: {
      type: String,
      default: ''
    },
category: {
  type: String,
  enum: ['Pottery', 'Jewelry', 'Embroidery', 'Woodwork', 'Crochet', 'Other'],
  default: ''
},
    parts: [partSchema],
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
    students: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Course', courseSchema);