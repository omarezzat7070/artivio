const express = require("express");
const router = express.Router();
const { protect, authorize, optionalAuth } = require("../middleware/auth");
const multer = require("multer");
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getPendingProducts,
  updateProductModeration,
  getMyProducts,
  getBestSellingProducts,
  getLowSellingProducts
} = require("../controllers/productController");

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Routes
router.route("/")
  .get(optionalAuth, getProducts)
  .post(protect, authorize("artisan", "seller", "admin"), upload.single("image"), createProduct);

router.get("/admin/pending", protect, authorize("admin"), getPendingProducts);
router.patch("/admin/:id/moderation", protect, authorize("admin"), updateProductModeration);
router.get("/mine", protect, authorize("artisan", "seller", "admin"), getMyProducts);
router.get("/best-selling", getBestSellingProducts);
router.get("/low-selling", getLowSellingProducts);

router.route("/:id")
  .get(optionalAuth, getProduct)
  .put(protect, authorize("artisan", "seller", "admin"), upload.single("image"), updateProduct)
  .delete(protect, authorize("artisan", "seller", "admin"), deleteProduct);

module.exports = router;
