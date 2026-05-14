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
    data: { totalRevenue, totalOrders }
  });
});

exports.getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email");

  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  res.status(200).json({ success: true, data: order });
});

exports.updateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  if (req.body.paymentStatus) order.paymentStatus = req.body.paymentStatus;
  if (req.body.paymentDetails) order.paymentDetails = req.body.paymentDetails;

  await order.save();

  res.status(200).json({ success: true, data: order });
});

exports.trackOrderByEmail = asyncHandler(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: "Email is required to track orders"
    });
  }

  const orders = await Order.find({})
    .populate("user", "name email")
    .sort({ createdAt: -1 });

  const normalizedEmail = String(email).trim().toLowerCase();

  const paidOrders = orders.filter(order => {
    if (order.paymentStatus !== "paid") return false;
    if (order.user && String(order.user.email || "").toLowerCase() === normalizedEmail) return true;
    if (order.paymentDetails && String(order.paymentDetails.email || "").toLowerCase() === normalizedEmail) return true;
    if (order.paymentDetails && String(order.paymentDetails.deliveryEmail || "").toLowerCase() === normalizedEmail) return true;
    return false;
  });

  if (paidOrders.length === 0) {
    return res.status(404).json({
      success: false,
      error: "No orders found for this email"
    });
  }

  const trackedOrders = paidOrders.map(order => {
    const tracking = getProductDeliveryTracking(order);

    return {
      _id: order._id,
      createdAt: order.createdAt,
      amount: order.amount,
      paymentStatus: order.paymentStatus,
      items: order.items,
      tracking
    };
  });

  res.status(200).json({
    success: true,
    count: paidOrders.length,
    orders: trackedOrders
  });
});

exports.trackOrder = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;
  const order = await Order.findOne({ orderNumber }).populate("user", "name email");

  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  const orderStatus = getOrderStatus(order);
  const timeline = getOrderTimeline(order);

  res.status(200).json({
    success: true,
    data: {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: orderStatus.status,
      message: orderStatus.message,
      estimatedDelivery: orderStatus.estimatedDelivery,
      timeline,
      items: order.items,
      amount: order.amount,
      createdAt: order.createdAt
    }
  });
});

exports.getOrderStatusUpdate = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  if (order.user.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "Not authorized" });
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

exports.cancelOrderProduct = asyncHandler(async (req, res) => {
  const { id, itemId } = req.params;
  const { reason } = req.body || {};

  const order = await Order.findById(id);

  if (!order) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }

  if (order.user.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, error: "Not authorized" });
  }

  if (order.paymentStatus !== "paid") {
    return res.status(400).json({ success: false, error: "Only paid product orders can be cancelled" });
  }

  const item = order.items.id(itemId) || order.items.find(orderItem =>
    orderItem.item && orderItem.item.toString() === itemId && orderItem.itemType === "Product"
  );

  if (!item || item.itemType !== "Product") {
    return res.status(404).json({ success: false, error: "Product item not found in this order" });
  }

  if (item.status === "cancelled") {
    return res.status(400).json({ success: false, error: "This product is already cancelled" });
  }

  const orderAgeMs = Date.now() - new Date(order.createdAt).getTime();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  if (orderAgeMs >= threeDaysMs && req.user.role !== "admin") {
    return res.status(400).json({
      success: false,
      error: "This product can no longer be cancelled because it is already being shipped"
    });
  }

  item.status = "cancelled";
  item.cancelledAt = new Date();
  item.cancellationReason = String(reason || "Cancelled by customer").trim();

  await order.save();

  res.status(200).json({
    success: true,
    message: "Product cancelled successfully",
    data: order
  });
});

// Helpers

function getOrderStatus(order) {
  const tracking = getProductDeliveryTracking(order);

  return {
    status: tracking.status,
    message: tracking.message,
    estimatedDelivery: tracking.estimatedDelivery
  };
}

function getOrderTimeline(order) {
  return getProductDeliveryTracking(order).timeline;
}

function getProductDeliveryTracking(order) {
  const now = new Date();
  const purchaseDate = new Date(order.createdAt);
  const shippingDate = new Date(purchaseDate.getTime() + 3 * 86400000);
  const deliveryDate = new Date(shippingDate.getTime() + 2 * 86400000);

  const hasProduct = Array.isArray(order.items) &&
    order.items.some(item => item.itemType === "Product" && item.status !== "cancelled");

  if (!hasProduct) {
    return {
      status: "completed",
      message: "Digital course purchase. No shipping is required.",
      estimatedDelivery: null,
      remainingText: "Available now in My Purchases",
      shippingDate,
      deliveryDate: null,
      timeline: [
        {
          status: "order_placed",
          title: "Order Placed",
          description: "Your order has been received",
          completed: true,
          timestamp: order.createdAt
        },
        {
          status: "payment_confirmed",
          title: "Payment Confirmed",
          description: "Payment has been verified",
          completed: true,
          timestamp: order.updatedAt || order.createdAt
        },
        {
          status: "completed",
          title: "Ready",
          description: "Your course is available in My Purchases",
          completed: true,
          timestamp: order.updatedAt || order.createdAt
        }
      ]
    };
  }

  let status = "processing";
  let message = "Payment confirmed. Your product is being prepared for shipping.";

  if (now >= deliveryDate) {
    status = "delivered";
    message = "Your product should be delivered to the customer.";
  } else if (now >= shippingDate) {
    status = "shipped";
    message = "Your product is shipping to the customer.";
  }

  return {
    status,
    message,
    estimatedDelivery: deliveryDate.toLocaleDateString(),
    remainingText: now >= deliveryDate ? "Delivered" : formatRemainingTime(deliveryDate - now),
    shippingDate,
    deliveryDate,
    timeline: [
      {
        status: "order_placed",
        title: "Order Placed",
        description: "Your order has been received",
        completed: true,
        timestamp: order.createdAt
      },
      {
        status: "payment_confirmed",
        title: "Payment Confirmed",
        description: "Payment has been verified",
        completed: true,
        timestamp: order.updatedAt || order.createdAt
      },
      {
        status: "processing",
        title: "Preparing Product",
        description: "This lasts 3 days after payment",
        completed: now >= shippingDate,
        timestamp: now >= shippingDate ? shippingDate : null
      },
      {
        status: "shipped",
        title: "Shipped",
        description: "Shipping starts 3 days after payment",
        completed: now >= shippingDate,
        timestamp: now >= shippingDate ? shippingDate : null
      },
      {
        status: "delivered",
        title: "Delivered",
        description: "Delivery is expected 2 days after shipping",
        completed: now >= deliveryDate,
        timestamp: now >= deliveryDate ? deliveryDate : null
      }
    ]
  };
}

function formatRemainingTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalHours = Math.ceil(safeMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) return `${days} day(s) and ${hours} hour(s) left`;
  if (days > 0) return `${days} day(s) left`;
  if (hours > 0) return `${hours} hour(s) left`;
  return "Less than 1 hour left";
}
