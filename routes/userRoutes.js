const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const User = require("../models/User");
const Order = require("../models/order");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for avatar upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, "avatar-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new Error('Only images are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: fileFilter
});

// Import controller functions
const { 
  register, 
  login, 
  getMe, 
  updateUser, 
  deleteUser, 
  logout,
  adminRegister,
  getAllUsers,
  getRecentUsers,
  getUserById,
  updateUserById,
  deleteUserById,
  toggleUserStatus
} = require("../controllers/userController");

// ============= PUBLIC ROUTES =============
router.post("/register", register);
router.post("/login", login);
router.post("/admin/register", adminRegister);

// ============= PROTECTED ROUTES =============
router.get("/me", protect, getMe);
router.put("/update", protect, updateUser);
router.delete("/delete", protect, deleteUser);
router.post("/logout", protect, logout);

// ============= AVATAR UPLOAD ROUTE =============
router.post("/upload-avatar", protect, upload.single('profileImage'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "Please upload an image"
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
}));

// ============= USER PROFILE ROUTE =============
router.get("/profile", protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.status(200).json({
    success: true,
    data: user
  });
}));

// ============= UPDATE PROFILE ROUTE =============
router.put("/profile", protect, asyncHandler(async (req, res) => {
  const { name, email, phone, gender } = req.body;
  const user = await User.findById(req.user.id);
  
  if (name) user.name = name;
  if (email) user.email = email;
  if (phone) user.phone = phone;
  if (gender && (gender === 'male' || gender === 'female')) user.gender = gender;
  
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
}));

// ============= PASSWORD MANAGEMENT =============
router.post("/change-password", protect, asyncHandler(async (req, res) => {
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
}));

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const { name, email, newPassword } = req.body;
  
  if (!name || !email || !newPassword) {
    return res.status(400).json({
      success: false,
      error: "Please provide name, email and new password"
    });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: "New password must be at least 6 characters"
    });
  }
  
  const user = await User.findOne({ name, email });
  if (!user) {
    return res.status(404).json({
      success: false,
      error: "User not found with provided name and email"
    });
  }
  
  user.password = newPassword;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: "Password reset successfully"
  });
}));

// ============= ORDERS ROUTE =============
router.get("/my-orders", protect, asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    data: orders
  });
}));

// ============= ADMIN ONLY ROUTES =============
router.get("/admin/dashboard", protect, authorize("admin"), (req, res) => {
  res.json({ message: "Welcome, admin!" });
});

router.get("/admin/all", protect, authorize("admin"), getAllUsers);
router.get("/admin/recent", protect, authorize("admin"), getRecentUsers);
router.get("/admin/:id", protect, authorize("admin"), getUserById);
router.put("/admin/:id", protect, authorize("admin"), updateUserById);
router.delete("/admin/:id", protect, authorize("admin"), deleteUserById);
router.patch("/admin/:id/status", protect, authorize("admin"), toggleUserStatus);

module.exports = router;