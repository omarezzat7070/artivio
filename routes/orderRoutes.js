const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const { protect, authorize } = require('../middleware/auth');
const mongoose = require('mongoose');
const Product = mongoose.model('Product');

// ------------------- Routes -------------------

// 1. Get orders for current user
router.get('/my-orders', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Admin dashboard stats (total revenue)
router.get('/admin/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const revenueResult = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
    res.json({ 
      success: true, 
      data: { totalRevenue: Math.round(totalRevenue * 100) / 100 }
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Get orders containing the current seller's products
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

// 4. Admin: get all orders
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    console.error('Error fetching all orders:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;