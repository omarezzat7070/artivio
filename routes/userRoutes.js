const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const { validate, userValidation } = require("../middleware/validator");
const userController = require("../controllers/userController");
const { passwordResetLimiter } = require("../middleware/rateLimiter");

// ============= PUBLIC ROUTES =============
router.post("/register", userValidation.register, validate, userController.register);
router.post("/login", userValidation.login, validate, userController.login);
router.post("/admin/register", userController.adminRegister);

// ============= PROTECTED ROUTES =============
router.get("/me", protect, userController.getMe);
router.put("/update", protect, userValidation.updateProfile, validate, userController.updateUser);
router.delete("/delete", protect, userController.deleteUser);
router.post("/logout", protect, userController.logout);

// ============= PASSWORD MANAGEMENT =============
router.post("/forgot-password", passwordResetLimiter, userController.forgotPassword);
router.post("/reset-password/:token", userController.resetPassword);
router.post("/change-password", protect, userValidation.changePassword, validate, userController.changePassword);

// ============= ORDERS ROUTE =============
router.get("/my-orders", protect, userController.getMyOrders);

// ============= ADMIN ONLY ROUTES =============
router.get("/admin/dashboard", protect, authorize("admin"), (req, res) => {
  res.json({ message: "Welcome, admin!" });
});
router.get("/admin/all", protect, authorize("admin"), userController.getAllUsers);
router.get("/admin/recent", protect, authorize("admin"), userController.getRecentUsers);
router.get("/admin/:id", protect, authorize("admin"), userController.getUserById);
router.put("/admin/:id", protect, authorize("admin"), userController.updateUserById);
router.delete("/admin/:id", protect, authorize("admin"), userController.deleteUserById);
router.patch("/admin/:id/status", protect, authorize("admin"), userController.toggleUserStatus);

module.exports = router;
