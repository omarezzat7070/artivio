const Course = require("../models/course");
const Product = require("../models/product");

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "in", "into", "is", "it", "learn", "make", "of", "on", "or", "the",
  "this", "to", "with", "your"
]);

const normalizeCategory = (category = "") =>
  String(category).trim().toLowerCase();

const getId = (value) => {
  if (!value) return "";
  if (value._id) return value._id.toString();
  return value.toString();
};

const tokenize = (text = "") => {
  const matches = String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
  return new Set(matches.filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
};

const textOverlapScore = (sourceText, targetText) => {
  const sourceTokens = tokenize(sourceText);
  const targetTokens = tokenize(targetText);
  if (!sourceTokens.size || !targetTokens.size) return 0;

  let overlap = 0;
  sourceTokens.forEach((token) => {
    if (targetTokens.has(token)) overlap += 1;
  });

  return Math.round((overlap / sourceTokens.size) * 20);
};

const attachScore = (item, score, reasons) => ({
  ...item.toObject(),
  linkScore: score,
  linkReasons: reasons
});

const sortLinkedItems = (items) =>
  items
    .filter((item) => item.linkScore > 0)
    .sort((a, b) => {
      if (b.linkScore !== a.linkScore) return b.linkScore - a.linkScore;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

const getLinkedCoursesForProduct = async (product, limit = 4) => {
  const courses = await Course.find({ moderationStatus: "accepted" })
    .populate("artisan", "name email");

  const productCategory = normalizeCategory(product.category);
  const productArtisanId = getId(product.artisan);
  const productText = `${product.name || ""} ${product.brief || ""} ${product.category || ""}`;

  const scored = courses.map((course) => {
    let score = 0;
    const reasons = [];

    if (productCategory && normalizeCategory(course.category) === productCategory) {
      score += 50;
      reasons.push("same category");
    }

    if (productArtisanId && getId(course.artisan) === productArtisanId) {
      score += 25;
      reasons.push("same artisan");
    }

    const overlap = textOverlapScore(productText, `${course.title || ""} ${course.description || ""} ${course.category || ""}`);
    if (overlap > 0) {
      score += overlap;
      reasons.push("matching keywords");
    }

    if (Number(course.rating) > 0) {
      score += Math.min(5, Math.round(Number(course.rating)));
      reasons.push("rated course");
    }

    return attachScore(course, score, reasons);
  });

  return sortLinkedItems(scored).slice(0, limit);
};

const getLinkedProductsForCourse = async (course, limit = 4) => {
  const products = await Product.find({ moderationStatus: "accepted" })
    .populate("artisan", "name email");

  const courseCategory = normalizeCategory(course.category);
  const courseArtisanId = getId(course.artisan);
  const courseText = `${course.title || ""} ${course.description || ""} ${course.category || ""}`;

  const scored = products.map((product) => {
    let score = 0;
    const reasons = [];

    if (courseCategory && normalizeCategory(product.category) === courseCategory) {
      score += 50;
      reasons.push("same category");
    }

    if (courseArtisanId && getId(product.artisan) === courseArtisanId) {
      score += 25;
      reasons.push("same artisan");
    }

    const overlap = textOverlapScore(courseText, `${product.name || ""} ${product.brief || ""} ${product.category || ""}`);
    if (overlap > 0) {
      score += overlap;
      reasons.push("matching keywords");
    }

    return attachScore(product, score, reasons);
  });

  return sortLinkedItems(scored).slice(0, limit);
};

module.exports = {
  getLinkedCoursesForProduct,
  getLinkedProductsForCourse
};
