const User = require("../models/User");
const Order = require("../models/order");
const asyncHandler = require("../middleware/asyncHandler");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sgMail = require('@sendgrid/mail');
const path = require("path");
const fs = require("fs");

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Helper function to normalize phone number to +20XXXXXXXXXX format
function normalizePhone(phone) {
  if (!phone) return phone;
  
  // Remove all non-digit characters
  let cleaned = phone.toString().replace(/\D/g, '');
  
  // If already has 12 digits (including country code), use as is
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    return '+' + cleaned;
  }
  
  // Remove leading 0 if present
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove leading 20 if present to normalize
  if (cleaned.startsWith('20')) {
    cleaned = cleaned.substring(2);
  }
  
  // At this point we should have 10 digits (Egyptian phone)
  if (cleaned.length !== 10) {
    return null; // Invalid format
  }
  
  // Return formatted number
  return '+20' + cleaned;
}

// Phone regex for validation
const phoneRegex = /^\+20[0-9]{10}$/;

// @desc    Register user (customers & artisans only)
// @route   POST /api/users/register
// @access  Public
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, gender, role, termsAccepted } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) return res.status(400).json({ success: false, error: "User already exists" });

  // Normalize phone number if provided
  let normalizedPhone = '';
  if (phone) normalizedPhone = normalizePhone(phone);

  // Restrict allowed roles for public registration
  let allowedRole = "customer";
  if (role === "artisan") {
    allowedRole = "artisan";
  }

  // Create user with terms acceptance
  const user = await User.create({
    name,
    email,
    password,
    phone: normalizedPhone,
    gender,
    role: allowedRole,
    termsAccepted: true,
    termsAcceptedAt: new Date()
  });

  // Create token
  const token = user.getSignedJwtToken();

  // Set secure cookie
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      role: user.role,
      profileImage: user.profileImage,
      termsAccepted: user.termsAccepted,
      termsAcceptedAt: user.termsAcceptedAt,
      createdAt: user.createdAt
    }
  });
});

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Please provide email and password"
    });
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Invalid credentials"
    });
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      error: "Invalid credentials"
    });
  }

  const token = user.getSignedJwtToken();

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      role: user.role,
      profileImage: user.profileImage
    }
  });
});

// @desc    Register admin
// @route   POST /api/users/admin/register
// @access  Public
exports.adminRegister = asyncHandler(async (req, res) => {
  const { name, email, password, phone, gender, adminSecret } = req.body;

  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({
      success: false,
      error: "Invalid admin secret key"
    });
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({
      success: false,
      error: "User already exists"
    });
  }

  let normalizedPhone = '';
  if (phone) {
    normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !phoneRegex.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid Egyptian phone number (e.g., +20 100 123 4567 or 01001234567)"
      });
    }
  }

  if (!gender || (gender !== 'male' && gender !== 'female')) {
    return res.status(400).json({
      success: false,
      error: "Please select a valid gender"
    });
  }

  const user = await User.create({
    name,
    email,
    password,
    phone: normalizedPhone,
    gender,
    role: "admin"
  });

  const token = user.getSignedJwtToken();

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: "Lax",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      role: user.role,
      profileImage: user.profileImage
    }
  });
});

// @desc    Get current logged in user
// @route   GET /api/users/me
// @access  Private
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user
// @route   PUT /api/users/update
// @access  Private
exports.updateUser = asyncHandler(async (req, res) => {
  const { name, email, phone, gender } = req.body;

  const user = await User.findById(req.user.id);
  
  if (name) user.name = name;
  if (email) user.email = email;
  
  if (phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || !phoneRegex.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid Egyptian phone number"
      });
    }
    user.phone = normalizedPhone;
  }
  
  if (gender && (gender === 'male' || gender === 'female')) {
    user.gender = gender;
  }
  
  await user.save();

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      role: user.role,
      profileImage: user.profileImage
    }
  });
});

// @desc    Upload profile avatar
// @route   POST /api/users/upload-avatar
// @access  Private
exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "Please upload an image"
    });
  }
  
  const file = req.file;
  
  if (!file.mimetype.startsWith('image')) {
    return res.status(400).json({
      success: false,
      error: "Please upload an image file"
    });
  }
  
  if (file.size > 2 * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: "Image must be less than 2MB"
    });
  }
  
  const user = await User.findById(req.user.id);
  if (user.profileImage) {
    const oldPath = path.join(__dirname, '../uploads/', user.profileImage);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }
  
  user.profileImage = req.file.filename;
  await user.save();
  
  res.status(200).json({
    success: true,
    data: { profileImage: req.file.filename },
    imageUrl: req.file.filename
  });
});

// @desc    Delete user
// @route   DELETE /api/users/delete
// @access  Private
exports.deleteUser = asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.user.id);
  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Logout user
// @route   POST /api/users/logout
// @access  Private
exports.logout = asyncHandler(async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: "Lax"
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully"
  });
});

// @desc    Change password
// @route   POST /api/users/change-password
// @access  Private
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: "Please provide current password and new password"
    });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: "New password must be at least 6 characters"
    });
  }
  
  const user = await User.findById(req.user.id).select('+password');
  
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      error: "Current password is incorrect"
    });
  }
  
  user.password = newPassword;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: "Password changed successfully"
  });
});

// @desc    Forgot password
// @route   POST /api/users/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: "Please provide your email" });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return res.status(200).json({ success: true, message: "If that email is registered, a reset link has been sent." });
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5500'}/reset-password.html?token=${resetToken}`;

  const mailOptions = {
    from: `"Artivio Support" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Password Reset Link",
    html: `
      <h2>Password Reset Request</h2>
      <p>Click the link below to reset your password. This link expires in 15 minutes.</p>
      <a href="${resetUrl}">${resetUrl}</a>
    `
  };

  try {
    await sgMail.send(mailOptions);
    res.status(200).json({ success: true, message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    res.status(500).json({ success: false, error: "Could not send email" });
  }
});

// @desc    Reset password
// @route   POST /api/users/reset-password/:token
// @access  Public
exports.resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: "New password must be at least 6 characters"
    });
  }

  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  }).select("+password");

  if (!user) {
    return res.status(400).json({ success: false, error: "Invalid or expired token" });
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: "Password changed successfully"
  });
});

// @desc    Get user's own orders
// @route   GET /api/users/my-orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: orders });
});

// @desc    Get all users (Admin only)
// @route   GET /api/users/admin/all
// @access  Private/Admin
exports.getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Get recent users (Admin only)
// @route   GET /api/users/admin/recent
// @access  Private/Admin
exports.getRecentUsers = asyncHandler(async (req, res) => {
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  
  const users = await User.find({ 
    createdAt: { $gte: tenDaysAgo } 
  }).select('-password').sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Get user by ID (Admin only)
// @route   GET /api/users/admin/:id
// @access  Private/Admin
exports.getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: "User not found"
    });
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user by ID (Admin only)
// @route   PUT /api/users/admin/:id
// @access  Private/Admin
exports.updateUserById = asyncHandler(async (req, res) => {
  const { name, email, phone, gender, role } = req.body;
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: "User not found"
    });
  }
  
  if (name) user.name = name;
  if (email) user.email = email;
  if (phone) user.phone = phone;
  if (gender && (gender === 'male' || gender === 'female')) user.gender = gender;
  if (role && ['customer', 'artisan', 'seller', 'admin', 'staff'].includes(role)) {
    user.role = role;
  }
  
  await user.save();
  
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      role: user.role,
      emailVerified: user.emailVerified,
      profileImage: user.profileImage
    }
  });
});

// @desc    Delete user by ID (Admin only)
// @route   DELETE /api/users/admin/:id
// @access  Private/Admin
exports.deleteUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: "User not found"
    });
  }
  
  // Prevent deleting the last admin
  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete the last admin"
      });
    }
  }
  
  await user.deleteOne();
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Toggle user status (activate/suspend)
// @route   PATCH /api/users/admin/:id/status
// @access  Private/Admin
exports.toggleUserStatus = asyncHandler(async (req, res) => {
  const { verified } = req.body;
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: "User not found"
    });
  }
  
  user.emailVerified = verified;
  await user.save();
  
  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      emailVerified: user.emailVerified
    }
  });
});