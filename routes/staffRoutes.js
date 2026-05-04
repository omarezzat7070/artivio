const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const {
  getStaff,
  addStaff,
  updateStaff,
  deleteStaff
} = require("../controllers/settingsController");

// Staff routes
router.get("/", protect, authorize("admin"), getStaff);
router.post("/", protect, authorize("admin"), addStaff);
router.put("/:id", protect, authorize("admin"), updateStaff);
router.delete("/:id", protect, authorize("admin"), deleteStaff);

module.exports = router;