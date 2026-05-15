const express = require('express');
const router  = express.Router();
const { protect, authorize }                        = require('../middleware/auth');
const { generateUploadSignature, isCloudinaryConfigured } = require('../config/cloudinary');
router.post(
  '/signature',
  protect,
  authorize('artisan', 'seller', 'admin'),
  (req, res) => {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Image upload service is not configured on this server.'
      });
    }

    try {
      const folder       = req.body.folder       || 'artivio/products';
      const resourceType = req.body.resourceType || 'image';        // ← ADD THIS
      const sigData      = generateUploadSignature(folder, resourceType); // ← PASS IT

      res.json({ success: true, ...sigData });
    } catch (error) {
      console.error('Signature generation error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate upload signature'
      });
    }
  }
);

module.exports = router;