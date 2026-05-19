const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, "Please add a name"],
    trim: true,
    maxlength: [20, "Name cannot be more than 20 characters"]
  },
  email: { 
    type: String, 
    required: [true, "Please add an email"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      "Please add a valid email"
    ]
  },
  password: { 
    type: String, 
    required: [true, "Please add a password"],
    minlength: 6,
    select: false
  },
  phone: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    enum: ["male", "female"],
    default: 'male'
  },
  profileImage: {
    type: String,
    default: null
  },
  role: { 
    type: String, 
    enum: ["customer", "artisan", "seller", "admin", "staff"],
    default: "customer" 
  },
  emailVerified: { 
    type: Boolean, 
    default: false 
  },
  termsAccepted: {
    type: Boolean,
    default: false
  },
  termsAcceptedAt: {
    type: Date,
    default: null
  },
  verificationToken: String,
  verificationTokenExpire: Date,

  // 🔑 Password reset fields
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, { 
  timestamps: true // automatically adds createdAt and updatedAt
});

// Hash password before saving
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with stored hash
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT
userSchema.methods.getSignedJwtToken = function() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return jwt.sign(
    { id: this._id, role: this.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRE || "30d" }
  );
};

// Generate and hash reset password token
userSchema.methods.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // ⏱ Expiry set to 15 minutes
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

  return resetToken;
};

// Generate and hash email verification token
userSchema.methods.getEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(20).toString("hex");

  this.verificationToken = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");

  this.verificationTokenExpire = Date.now() + 10 * 60 * 1000;

  return verificationToken;
};

module.exports = mongoose.model("User", userSchema);
