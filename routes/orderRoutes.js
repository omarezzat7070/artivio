const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const { protect, authorize } = require('../middleware/auth');
const mongoose = require('mongoose');
const Product = mongoose.model('Product');

const {
  getAllOrders,
  getOrderStats,
  getOrderById,
  updateOrder,
  trackOrder,
  getOrderStatusUpdate,
  trackOrderByEmail,
  cancelOrderProduct
} = require('../controllers/orderController');

// --- Specific/static routes FIRST (before any /:param wildcards) ---

// Email-only tracking route
router.get('/track/email', trackOrderByEmail);

// Order number tracking route
router.get('/track/:orderNumber', trackOrder);

// Logged-in user's own orders
router.get('/my-orders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin stats
router.get('/admin/stats', protect, authorize('admin'), getOrderStats);

// Seller's product orders
router.get('/seller-product-orders', protect, async (req, res) => {
  try {
    const sellerProducts = await Product.find({ artisan: req.user._id });
    const productIds = sellerProducts.map(p => p._id.toString());

    if (productIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const orders = await Order.find({
      'items.item': { $in: productIds },
      'items.itemType': 'Product',
      paymentStatus: 'paid'
    }).sort({ createdAt: -1 });

    const enrichedOrders = orders.map(order => {
      const orderedProducts = order.items.filter(item =>
        item.itemType === 'Product' && productIds.includes(item.item.toString())
      );
      return { ...order.toObject(), orderedProducts };
    });

    res.json({ success: true, data: enrichedOrders });
  } catch (err) {
    console.error('Error fetching seller product orders:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: list all orders
router.get('/', protect, authorize('admin'), getAllOrders);

// --- Wildcard /:id routes LAST ---

// Order status (authenticated)
router.get('/:id/status', protect, getOrderStatusUpdate);
router.patch('/:id/items/:itemId/cancel', protect, cancelOrderProduct);

// Admin: get, update single order
router.get('/:id', protect, authorize('admin'), getOrderById);
router.put('/:id', protect, authorize('admin'), updateOrder);

module.exports = router;
