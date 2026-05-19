const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const User = require("../models/User");
const Order = require("../models/order");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ─── Nodemailer transporter ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});



transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter error:", error.message);
  } else {
    console.log("✅ Email transporter ready");
  }
});

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

// ─── STEP 1: Send OTP to email ────────────────────────────────────────────────
// POST /api/users/forgot-password
// Body: { email }
router.post("/forgot-password", asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: "Please provide your email" });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  // Always return success so we don't reveal if an email exists
  if (!user) {
    return res.status(200).json({
      success: true,
      message: "If that email is registered, an OTP has been sent.",
    });
  }

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash & store with 15-minute expiry
  user.resetPasswordToken  = crypto.createHash("sha256").update(otp).digest("hex");
  user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  // Send email
  const mailOptions = {
    from: `"Artivio Support" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Your Password Reset Code – Artivio",
    html: `
      <div style="font-family:Segoe UI,sans-serif;max-width:480px;margin:auto;padding:30px;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#6C2929;margin-bottom:8px;">Reset Your Password</h2>
        <p style="color:#555;margin-bottom:20px;">Use the code below to reset your Artivio account password. It expires in <strong>15 minutes</strong>.</p>
        <div style="background:#fdf6ee;border:2px dashed #6C2929;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px;">
          <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#6C2929;">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    user.resetPasswordToken  = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    console.error("Email send error:", err.message);
    return res.status(500).json({ success: false, error: "Could not send email. Please try again." });
  }

  res.status(200).json({
    success: true,
    message: "If that email is registered, an OTP has been sent.",
  });
}));

// ─── STEP 2: Verify OTP ───────────────────────────────────────────────────────
// POST /api/users/verify-otp
// Body: { email, otp }
router.post("/verify-otp", asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ success: false, error: "Email and OTP are required" });
  }

  const hashedOtp = crypto.createHash("sha256").update(otp.trim()).digest("hex");

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    resetPasswordToken:  hashedOtp,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ success: false, error: "Invalid or expired OTP" });
  }

  res.status(200).json({ success: true, message: "OTP verified" });
}));

// ─── STEP 3: Reset Password ───────────────────────────────────────────────────
// POST /api/users/reset-password
// Body: { email, otp, newPassword }
router.post("/reset-password", asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ success: false, error: "Email, OTP and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
  }

  const hashedOtp = crypto.createHash("sha256").update(otp.trim()).digest("hex");

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    resetPasswordToken:  hashedOtp,
    resetPasswordExpire: { $gt: Date.now() },
  }).select("+password");

  if (!user) {
    return res.status(400).json({ success: false, error: "Invalid or expired OTP. Please request a new one." });
  }

  user.password            = newPassword;
  user.resetPasswordToken  = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.status(200).json({ success: true, message: "Password reset successfully. You can now sign in." });
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