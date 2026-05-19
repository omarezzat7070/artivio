const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const asyncHandler = require("../middleware/asyncHandler");
const User = require("../models/User");
const Order = require("../models/order");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ─── Nodemailer transporter (SendGrid recommended on Railway) ──────────
const transporter = nodemailer.createTransport({
  service: "SendGrid",
  auth: {
    user: "apikey", // literally the string "apikey"
    pass: process.env.SENDGRID_API_KEY
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email transporter error:", error.message);
  } else {
    console.log("✅ Email transporter ready");
  }
});

// ============= PUBLIC ROUTES =============
router.post("/register", require("../controllers/userController").register);
router.post("/login", require("../controllers/userController").login);
router.post("/admin/register", require("../controllers/userController").adminRegister);

// ============= PROTECTED ROUTES =============
router.get("/me", protect, require("../controllers/userController").getMe);
router.put("/update", protect, require("../controllers/userController").updateUser);
router.delete("/delete", protect, require("../controllers/userController").deleteUser);
router.post("/logout", protect, require("../controllers/userController").logout);

// ============= PASSWORD MANAGEMENT =============

// STEP 1: Forgot Password → send reset link
router.post("/forgot-password", asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: "Please provide your email" });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return res.status(200).json({ success: true, message: "If that email is registered, a reset link has been sent." });
  }

  // Generate reset token
  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  // Build reset URL
  const resetUrl = `https://yourfrontend.com/reset-password/${resetToken}`;

  // Define mail options here
  const mailOptions = {
    from: `"Support" <${process.env.EMAIL_USER}>`, // your verified sender email in SendGrid
    to: user.email,
    subject: "Password Reset Link",
    html: `
      <h2>Password Reset Request</h2>
      <p>Click the link below to reset your password. This link expires in 15 minutes.</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>If you did not request this, you can ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    console.error("Email send error:", err.message);
    res.status(500).json({ success: false, error: "Could not send email. Please try again." });
  }
}));

// STEP 2: Reset Password → verify token and set new password
router.post("/reset-password/:token", asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
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

  res.status(200).json({ success: true, message: "Password reset successfully. You can now sign in." });
}));

// ============= ORDERS ROUTE =============
router.get("/my-orders", protect, asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: orders });
}));

// ============= ADMIN ONLY ROUTES =============
router.get("/admin/dashboard", protect, authorize("admin"), (req, res) => {
  res.json({ message: "Welcome, admin!" });
});
router.get("/admin/all", protect, authorize("admin"), require("../controllers/userController").getAllUsers);
router.get("/admin/recent", protect, authorize("admin"), require("../controllers/userController").getRecentUsers);
router.get("/admin/:id", protect, authorize("admin"), require("../controllers/userController").getUserById);
router.put("/admin/:id", protect, authorize("admin"), require("../controllers/userController").updateUserById);
router.delete("/admin/:id", protect, authorize("admin"), require("../controllers/userController").deleteUserById);
router.patch("/admin/:id/status", protect, authorize("admin"), require("../controllers/userController").toggleUserStatus);

module.exports = router;
