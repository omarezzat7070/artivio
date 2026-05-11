const Order = require("../models/order");
const asyncHandler = require("../middleware/asyncHandler");

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

exports.getOrderStats = asyncHandler(async (req, res) => {
  const totalRevenueAgg = await Order.aggregate([
    { $match: { paymentStatus: "paid" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  const totalRevenue = totalRevenueAgg.length > 0 ? totalRevenueAgg[0].total : 0;
  const totalOrders = await Order.countDocuments({ paymentStatus: "paid" });

  res.status(200).json({
    success: true,
    data: {
      totalRevenue,
      totalOrders
    }
  });
});

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

exports.updateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  if (req.body.paymentStatus) order.paymentStatus = req.body.paymentStatus;
  if (req.body.paymentDetails) order.paymentDetails = req.body.paymentDetails;

  await order.save();

  res.status(200).json({
    success: true,
    data: order
  });
});

// ✅ NEW: Track orders by email only
exports.trackOrderByEmail = asyncHandler(async (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      error: "Email is required to track orders"
    });
  }
  
  // Find all orders with this email
  const orders = await Order.find({ 
    'paymentDetails.email': email 
  }).populate('user', 'name email').sort({ createdAt: -1 });
  
  // Also check user email field
  const userOrders = await Order.find({}).populate('user', 'name email');
  const allOrders = [...orders];
  
  userOrders.forEach(order => {
    if (order.user && order.user.email === email && !allOrders.find(o => o._id.toString() === order._id.toString())) {
      allOrders.push(order);
    }
  });
  
  // Filter only paid orders
  const paidOrders = allOrders.filter(order => order.paymentStatus === 'paid');
  
  if (paidOrders.length === 0) {
    return res.status(404).json({
      success: false,
      error: "No orders found for this email"
    });
  }
  
  res.status(200).json({
    success: true,
    count: paidOrders.length,
    orders: paidOrders.map(order => ({
      _id: order._id,
      createdAt: order.createdAt,
      amount: order.amount,
      paymentStatus: order.paymentStatus,
      items: order.items,
      paymentDetails: order.paymentDetails
    }))
  });
});

        

exports.getOrderStatusUpdate = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  
  if (!order) {
    return res.status(404).json({
      success: false,
      error: "Order not found"
    });
  }
  
  if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: "Not authorized"
    });
  }
  
  const orderStatus = getOrderStatus(order);
  
  res.status(200).json({
    success: true,
    data: {
      status: orderStatus.status,
      message: orderStatus.message,
      estimatedDelivery: orderStatus.estimatedDelivery,
      lastUpdated: new Date()
    }
  });
});

function getOrderStatus(order) {
  const now = new Date();
  const orderDate = new Date(order.createdAt);
  const daysSince = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
  
  // All orders are treated as paid
  // No pending_payment status anymore
  
  if (daysSince < 1) {
    return {
      status: 'processing',
      message: 'Order confirmed. Preparing for shipment.',
      estimatedDelivery: getEstimatedDelivery(orderDate, 5)
    };
  } else if (daysSince < 3) {
    return {
      status: 'shipped',
      message: 'Your order has been shipped and is on its way!',
      estimatedDelivery: getEstimatedDelivery(orderDate, 5)
    };
  } else if (daysSince < 7) {
    return {
      status: 'in_transit',
      message: 'Your order is in transit. Expected delivery soon.',
      estimatedDelivery: getEstimatedDelivery(orderDate, 7)
    };
  } else if (daysSince < 14) {
    return {
      status: 'delivered',
      message: 'Your order has been delivered. Thank you for shopping with Artivio!',
      estimatedDelivery: null
    };
  } else {
    return {
      status: 'completed',
      message: 'Order completed. We hope you enjoyed your purchase!',
      estimatedDelivery: null
    };
  }
}

function getEstimatedDelivery(orderDate, daysToAdd) {
  const estimate = new Date(orderDate);
  estimate.setDate(estimate.getDate() + daysToAdd);
  return estimate.toLocaleDateString();
}

function getOrderTimeline(order) {
  const timeline = [
    {
      status: 'order_placed',
      title: 'Order Placed',
      description: 'Your order has been received',
      completed: true,
      timestamp: order.createdAt
    },
    {
      status: 'payment_confirmed',
      title: 'Payment Confirmed',
      description: 'Payment has been verified',
      completed: true,
      timestamp: order.updatedAt
    }
  ];
  
  const now = new Date();
  const orderDate = new Date(order.createdAt);
  const daysSince = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
  
  timeline.push({
    status: 'processing',
    title: 'Processing',
    description: 'Order is being prepared',
    completed: daysSince >= 1,
    timestamp: daysSince >= 1 ? new Date(orderDate.getTime() + 86400000) : null
  });
  
  timeline.push({
    status: 'shipped',
    title: 'Shipped',
    description: 'Order has been shipped',
    completed: daysSince >= 3,
    timestamp: daysSince >= 3 ? new Date(orderDate.getTime() + 3 * 86400000) : null
  });
  
  timeline.push({
    status: 'delivered',
    title: 'Delivered',
    description: 'Order has been delivered',
    completed: daysSince >= 7,
    timestamp: daysSince >= 7 ? new Date(orderDate.getTime() + 7 * 86400000) : null
  });
  
  return timeline;
}