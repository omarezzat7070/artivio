const Order = require("../models/order");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get all orders (admin)
// @route   GET /api/orders
// @access  Private/Admin
exports.getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: orders.length,
    data: orders
  });
});

// @desc    Get order statistics for admin dashboard
// @route   GET /api/orders/admin/stats
// @access  Private/Admin
exports.getOrderStats = asyncHandler(async (req, res) => {
  const totalRevenueAgg = await Order.aggregate([
    { $match: { paymentStatus: "paid" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  const totalRevenue = totalRevenueAgg.length > 0 ? totalRevenueAgg[0].total : 0;

  // Optional: get total orders count
  const totalOrders = await Order.countDocuments({ paymentStatus: "paid" });

  res.status(200).json({
    success: true,
    data: {
      totalRevenue,
      totalOrders
    }
  });
});

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private/Admin
exports.getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");

  if (!order) {
    return res.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  res.status(200).json({
    success: true,
    data: order
  });
});

// @desc    Update order status (e.g., mark as paid)
// @route   PUT /api/orders/:id
// @access  Private/Admin
exports.updateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  // Only allow updating paymentStatus and paymentDetails
  if (req.body.paymentStatus) order.paymentStatus = req.body.paymentStatus;
  if (req.body.paymentDetails) order.paymentDetails = req.body.paymentDetails;

  await order.save();

  res.status(200).json({
    success: true,
    data: order
  });
});