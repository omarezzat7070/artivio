const Settings = require("../models/Settings");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get all settings
// @route   GET /api/settings
// @access  Private (Admin)
exports.getSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.find({});
  const settingsObj = {};

  settings.forEach(setting => {
    settingsObj[setting.type] = setting.data;
  });

  res.status(200).json(settingsObj);
});

// @desc    Get specific setting type
// @route   GET /api/settings/:type
// @access  Private (Admin)
exports.getSetting = asyncHandler(async (req, res) => {
  const setting = await Settings.findOne({ type: req.params.type });

  if (!setting) {
    return res.status(404).json({
      success: false,
      error: "Setting not found"
    });
  }

  res.status(200).json(setting.data);
});

// @desc    Update or create setting
// @route   PUT /api/settings/:type
// @access  Private (Admin)
exports.updateSetting = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const data = req.body;

  const setting = await Settings.findOneAndUpdate(
    { type },
    { type, data },
    { new: true, upsert: true, runValidators: true }
  );

  res.status(200).json({
    success: true,
    data: setting.data
  });
});

// @desc    Get all staff (users with admin or staff roles)
// @route   GET /api/staff
// @access  Private (Admin)
exports.getStaff = asyncHandler(async (req, res) => {
  const User = require("../models/User");

  const staff = await User.find({
    role: { $in: ['admin', 'staff'] }
  }).select('name email role emailVerified createdAt');

  const staffWithStatus = staff.map(member => ({
    id: member._id,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.emailVerified ? 'Active' : 'Inactive'
  }));

  res.status(200).json(staffWithStatus);
});

// @desc    Add new staff member
// @route   POST /api/staff
// @access  Private (Admin)
exports.addStaff = asyncHandler(async (req, res) => {
  const User = require("../models/User");
  const { name, email, password, role } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({
      success: false,
      error: "User already exists"
    });
  }

  // Create staff user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'staff',
    emailVerified: true
  });

  res.status(201).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: 'Active'
    }
  });
});

// @desc    Update staff member
// @route   PUT /api/staff/:id
// @access  Private (Admin)
exports.updateStaff = asyncHandler(async (req, res) => {
  const User = require("../models/User");
  const { name, email, role } = req.body;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { name, email, role },
    { new: true, runValidators: true }
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "Staff member not found"
    });
  }

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.emailVerified ? 'Active' : 'Inactive'
    }
  });
});

// @desc    Delete staff member
// @route   DELETE /api/staff/:id
// @access  Private (Admin)
exports.deleteStaff = asyncHandler(async (req, res) => {
  const User = require("../models/User");

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "Staff member not found"
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

  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    data: {}
  });
});