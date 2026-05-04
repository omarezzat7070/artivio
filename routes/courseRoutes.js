const express = require("express");
const router = express.Router();
const { protect, authorize, optionalAuth } = require("../middleware/auth");
const multer = require("multer");
const {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollCourse,
  checkPurchased,
  getPendingCourses,
  updateCourseModeration,
  addCoursePart,
  getPendingCourseParts,
  updateCoursePartModeration
} = require("../controllers/courseController");

// Multer setup for video upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
// Limit per-file size to 50MB to avoid very large uploads resetting connections
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Routes
router.route("/")
  .get(optionalAuth, getCourses)
  .post(protect, authorize("artisan", "seller", "admin"), upload.fields([
    { name: "image", maxCount: 1 },
    { name: "partVideo", maxCount: 40 }
  ]), createCourse);

router.get("/admin/pending", protect, authorize("admin"), getPendingCourses);
router.get("/admin/pending-parts", protect, authorize("admin"), getPendingCourseParts);
router.patch("/admin/:id/moderation", protect, authorize("admin"), updateCourseModeration);
router.patch("/admin/:id/parts/:partId/moderation", protect, authorize("admin"), updateCoursePartModeration);

router.route("/:id")
  .get(optionalAuth, getCourse)
  .put(protect, authorize("artisan", "seller", "admin"), upload.fields([
    { name: "image", maxCount: 1 },
    { name: "partVideo", maxCount: 40 }
  ]), updateCourse)
  .delete(protect, authorize("artisan", "seller", "admin"), deleteCourse);

// Enroll route
router.post("/:id/enroll", protect, enrollCourse);
router.post("/:id/parts", protect, authorize("artisan", "seller", "admin"), upload.fields([
  { name: "partVideo", maxCount: 1 }
]), addCoursePart);

// Check purchased route
router.get("/:id/purchased", protect, checkPurchased);

module.exports = router;
