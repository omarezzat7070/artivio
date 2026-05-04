const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getSettings,
  getSetting,
  updateSetting,
  getStaff,
  addStaff,
  updateStaff,
  deleteStaff
} = require("../controllers/settingsController");

// Settings routes
router.get("/", protect, authorize("admin"), getSettings);
router.get("/:type", protect, authorize("admin"), getSetting);
router.put("/:type", protect, authorize("admin"), updateSetting);

module.exports = router;