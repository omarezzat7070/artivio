const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { v2: cloudinary } = require('cloudinary');

router.post('/signature', protect, authorize('artisan', 'seller', 'admin'), (req, res) => {
    try {
        const { folder } = req.body;
        
        // ✅ CURRENT timestamp - NOT hardcoded 2026
        const timestamp = Math.floor(Date.now() / 1000);
        
        const signature = cloudinary.utils.api_sign_request(
            {
                timestamp: timestamp,
                folder: folder || 'artivio/products'
            },
            process.env.CLOUDINARY_API_SECRET
        );
        
        res.json({
            success: true,
            signature: signature,
            timestamp: timestamp,
            apiKey: process.env.CLOUDINARY_API_KEY,
            cloudName: process.env.CLOUDINARY_CLOUD_NAME,
            folder: folder || 'artivio/products'
        });
    } catch (error) {
        console.error('Signature generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate upload signature'
        });
    }
});

module.exports = router;