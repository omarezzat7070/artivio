const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const { protect, authorize } = require('../middleware/auth');
const Product = require('../models/product');
const Course = require('../models/course');

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

async function getSellerProductOrders(sellerId) {
  const sellerProducts = await Product.find({ artisan: sellerId });
  const productIds = sellerProducts.map(p => p._id.toString());

  if (productIds.length === 0) {
    return { orders: [], earnings: 0 };
  }

  const orders = await Order.find({
    'items.item': { $in: productIds },
    'items.itemType': 'Product',
    paymentStatus: 'paid'
  })
  .populate('user', 'name email phone address')
  .populate('items.item')
  .sort({ createdAt: -1 });

  let earnings = 0;
  const enrichedOrders = orders.map(order => {
    const orderedProducts = order.items
      .filter(item =>
        item.itemType === 'Product' &&
        item.item &&
        productIds.includes(item.item._id.toString())
      )
      .map(item => {
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || 0);

        if (item.status !== 'cancelled' && (item.sellerStatus || 'pending') !== 'rejected') {
          earnings += price * quantity;
        }

        return {
          _id: item._id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          status: item.status || 'active',
          sellerStatus: item.sellerStatus || 'pending',
          sellerStatusUpdatedAt: item.sellerStatusUpdatedAt,
          image: item.item?.image || null,
        };
      });

    return { ...order.toObject(), orderedProducts };
  });

  return { orders: enrichedOrders, earnings };
}

async function getSellerCourseSales(sellerId) {
  const sellerCourses = await Course.find({ artisan: sellerId }).select('title price image category').lean();
  const courseIds = sellerCourses.map(c => c._id.toString());

  if (courseIds.length === 0) {
    return { courseSales: [], earnings: 0, paidCustomers: 0 };
  }

  const courseById = new Map(sellerCourses.map(course => [course._id.toString(), course]));
  const salesByCourse = new Map(sellerCourses.map(course => [
    course._id.toString(),
    {
      _id: course._id,
      title: course.title,
      price: course.price,
      image: course.image || null,
      category: course.category || 'Course',
      paidCustomers: 0,
      paidPurchases: 0,
      earnings: 0,
      customerKeys: new Set()
    }
  ]));

  const orders = await Order.find({
    'items.item': { $in: courseIds },
    'items.itemType': 'Course',
    paymentStatus: 'paid'
  })
  .populate('user', 'name email')
  .lean();

  let earnings = 0;
  for (const order of orders) {
    const customerKey = order.user?._id?.toString()
      || order.user?.email
      || order.paymentDetails?.email
      || order.paymentDetails?.deliveryEmail
      || order._id.toString();

    for (const item of order.items || []) {
      const itemCourseId = item.item?.toString();
      if (item.itemType !== 'Course' || item.status === 'cancelled' || !courseById.has(itemCourseId)) continue;

      const quantity = Number(item.quantity || 1);
      const itemEarnings = Number(item.price || 0) * quantity;
      const sale = salesByCourse.get(itemCourseId);

      sale.customerKeys.add(customerKey);
      sale.paidPurchases += quantity;
      sale.earnings += itemEarnings;
      earnings += itemEarnings;
    }
  }

  const courseSales = [...salesByCourse.values()]
    .map(sale => {
      sale.paidCustomers = sale.customerKeys.size;
      delete sale.customerKeys;
      return sale;
    })
    .filter(sale => sale.paidPurchases > 0)
    .sort((a, b) => b.earnings - a.earnings);

  const paidCustomers = courseSales.reduce((sum, sale) => sum + sale.paidCustomers, 0);
  return { courseSales, earnings, paidCustomers };
}

router.get('/seller-sales-summary', protect, async (req, res) => {
  try {
    const [productSummary, courseSummary] = await Promise.all([
      getSellerProductOrders(req.user._id),
      getSellerCourseSales(req.user._id)
    ]);

    res.json({
      success: true,
      data: {
        productOrders: productSummary.orders,
        courseSales: courseSummary.courseSales,
        earnings: {
          products: productSummary.earnings,
          courses: courseSummary.earnings,
          total: productSummary.earnings + courseSummary.earnings
        },
        paidCourseCustomers: courseSummary.paidCustomers
      }
    });
  } catch (err) {
    console.error('Error fetching seller sales summary:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seller's product orders — WITH customer info + product images populated
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
    })
    .populate('user', 'name email phone address')  // populate customer with address
    .populate('items.item')                         // populate product to get image
    .sort({ createdAt: -1 });

    const enrichedOrders = orders.map(order => {
      const orderedProducts = order.items
        .filter(item =>
          item.itemType === 'Product' &&
          item.item &&
          productIds.includes(item.item._id.toString())
        )
        .map(item => ({
          _id: item._id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          sellerStatus: item.sellerStatus || 'pending',
          sellerStatusUpdatedAt: item.sellerStatusUpdatedAt,
          image: item.item?.image || null,  // pull image from populated product
        }));

      return { ...order.toObject(), orderedProducts };
    });

    res.json({ success: true, data: enrichedOrders });
  } catch (err) {
    console.error('Error fetching seller product orders:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seller accepts or rejects a specific item in an order
router.patch('/seller-product-orders/:orderId/items/:itemId', protect, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const sellerProducts = await Product.find({ artisan: req.user._id });
    const productIds = sellerProducts.map(p => p._id.toString());

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    if (!productIds.includes(item.item.toString())) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    item.sellerStatus = status;
    item.sellerStatusUpdatedAt = new Date();
    await order.save();

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: list all orders
router.get('/', protect, authorize('admin'), getAllOrders);

// --- Wildcard /:id routes LAST ---
router.get('/:id/status', protect, getOrderStatusUpdate);
router.patch('/:id/items/:itemId/cancel', protect, cancelOrderProduct);
router.get('/:id', protect, authorize('admin'), getOrderById);
router.put('/:id', protect, authorize('admin'), updateOrder);

module.exports = router;
