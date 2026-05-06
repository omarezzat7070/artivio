const Product = require("../models/product");
const Order = require("../models/order");
const asyncHandler = require("../middleware/asyncHandler");
const { isCloudinaryConfigured, uploadToCloudinary } = require("../config/cloudinary");
const { saveUploadLocally } = require("../config/localUpload");

const canAccessUnapprovedProduct = (req, product) => {
  if (!req.user) return false;
  return (
    req.user.role === "admin" ||
    product.artisan.toString() === req.user.id
  );
};

const uploadProductImage = async (file) => {
  if (!file) return "";
  if (!isCloudinaryConfigured()) {
    return saveUploadLocally(file, "product");
  }
  const result = await uploadToCloudinary(file, {
    folder: "artivio/products",
    resource_type: "image"
  });
  return result.secure_url;
};

// GET all products
exports.getProducts = asyncHandler(async (req, res) => {
  const filter = req.user && req.user.role === "admin"
    ? {}
    : { moderationStatus: "accepted" };

  const products = await Product.find(filter).populate("artisan", "name email");
  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});

// GET my accepted products (artisan/seller/admin)
exports.getMyProducts = asyncHandler(async (req, res) => {
  const filter = req.user.role === "admin"
    ? {}
    : { artisan: req.user.id };

  const products = await Product.find(filter).populate("artisan", "name email");
  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});

// GET single product
exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate("artisan", "name email");
  
  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Product not found"
    });
  }

  if (product.moderationStatus !== "accepted" && !canAccessUnapprovedProduct(req, product)) {
    return res.status(403).json({
      success: false,
      error: "This product is not publicly available"
    });
  }
  
  res.status(200).json({
    success: true,
    data: product
  });
});

// CREATE product
exports.createProduct = asyncHandler(async (req, res) => {
  req.body.artisan = req.user.id;
  req.body.moderationStatus = "pending";
  req.body.stock = Math.max(0, Number(req.body.stock) || 0);
  
  if (req.file) {
    req.body.image = await uploadProductImage(req.file);
  }
  
  const product = await Product.create(req.body);
  
  res.status(201).json({
    success: true,
    data: product
  });
});

// UPDATE product
exports.updateProduct = asyncHandler(async (req, res) => {
  let product = await Product.findById(req.params.id);
  
  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Product not found"
    });
  }
  
  // Check ownership
  if (product.artisan.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: "Not authorized to update this product"
    });
  }
  
  if (req.body.stock !== undefined) {
    req.body.stock = Math.max(0, Number(req.body.stock) || 0);
  }

  if (req.file) {
    req.body.image = await uploadProductImage(req.file);
  }

  // Any seller/artisan content update needs re-approval
  if (req.user.role !== "admin") {
    req.body.moderationStatus = "pending";
    req.body.moderationNote = "";
    req.body.moderatedBy = null;
    req.body.moderatedAt = null;
  }
  
  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    success: true,
    data: product
  });
});

// DELETE product
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  
  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Product not found"
    });
  }
  
  // Check ownership
  if (product.artisan.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: "Not authorized to delete this product"
    });
  }
  
  await product.deleteOne();
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

// GET pending products (admin)
exports.getPendingProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ moderationStatus: "pending" })
    .populate("artisan", "name email");

  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});

// PATCH moderation status (admin)
exports.updateProductModeration = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  if (!["accepted", "declined"].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Status must be either 'accepted' or 'declined'"
    });
  }

  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({
      success: false,
      error: "Product not found"
    });
  }

  product.moderationStatus = status;
  product.moderationNote = note || "";
  product.moderatedBy = req.user.id;
  product.moderatedAt = new Date();
  await product.save();

  res.status(200).json({
    success: true,
    data: product
  });
});

// GET best selling products
exports.getBestSellingProducts = asyncHandler(async (req, res) => {
  const bestSelling = await Order.aggregate([
    { $unwind: "$items" },
    { $match: { "items.itemType": "Product", "paymentStatus": "paid" } },
    { $group: { _id: "$items.item", totalSales: { $sum: "$items.quantity" } } },
    { $sort: { totalSales: -1 } },
    { $limit: 5 },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    { $project: { name: "$product.name", category: "$product.category", image: "$product.image", sales: "$totalSales" } }
  ]);

  res.status(200).json({
    success: true,
    data: bestSelling
  });
});

// GET low selling products
exports.getLowSellingProducts = asyncHandler(async (req, res) => {
  const lowSelling = await Order.aggregate([
    { $unwind: "$items" },
    { $match: { "items.itemType": "Product", "paymentStatus": "paid" } },
    { $group: { _id: "$items.item", totalSales: { $sum: "$items.quantity" } } },
    { $sort: { totalSales: 1 } },
    { $limit: 5 },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    { $project: { name: "$product.name", category: "$product.category", image: "$product.image", sales: "$totalSales" } }
  ]);

  res.status(200).json({
    success: true,
    data: lowSelling
  });
});
