const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
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
} = require('../controllers/productController');

// Memory storage — productController handles Cloudinary upload from buffer
const upload = multer({ storage: multer.memoryStorage() });

// ── Routes ────────────────────────────────────────────────────────────────────

router.route('/')
  .get(optionalAuth, getProducts)
  .post(
    protect,
    authorize('artisan', 'seller', 'admin'),
    upload.single('image'),
    createProduct
  );

// Specific named routes BEFORE /:id to avoid param conflicts
router.get('/mine',         protect, authorize('artisan', 'seller', 'admin'), getMyProducts);
router.get('/best-selling', getBestSellingProducts);
router.get('/low-selling',  getLowSellingProducts);

router.get(  '/admin/pending',         protect, authorize('admin'), getPendingProducts);
router.patch('/admin/:id/moderation',  protect, authorize('admin'), updateProductModeration);

router.route('/:id')
  .get(   optionalAuth, getProduct)
  .put(   protect, authorize('artisan', 'seller', 'admin'), upload.single('image'), updateProduct)
  .delete(protect, authorize('artisan', 'seller', 'admin'), deleteProduct);

module.exports = router;