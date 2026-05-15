const express = require('express');
const router  = express.Router();
const { protect, authorize }                        = require('../middleware/auth');
const { generateUploadSignature, isCloudinaryConfigured } = require('../config/cloudinary');

/**
 * POST /api/upload/signature
 * Returns a Cloudinary signed-upload signature for direct browser uploads.
 * Requires the user to be logged in as artisan, seller, or admin.
 */
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
      const folder  = req.body.folder || 'artivio/products';
      const sigData = generateUploadSignature(folder);

      // sigData = { signature, timestamp, folder, apiKey, cloudName }
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