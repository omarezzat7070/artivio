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

const textOverlapScore = (sourceText, targetText, ignoredTokens = new Set()) => {
  const sourceTokens = tokenize(sourceText);
  const targetTokens = tokenize(targetText);
  if (!sourceTokens.size || !targetTokens.size) return 0;

  let overlap = 0;
  sourceTokens.forEach((token) => {
    if (ignoredTokens.has(token)) return;
    if (targetTokens.has(token)) overlap += 1;
  });

  const searchableTokens = [...sourceTokens].filter((token) => !ignoredTokens.has(token));
  if (!searchableTokens.length) return 0;

  return Math.round((overlap / searchableTokens.length) * 20);
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

const shouldLink = ({ sameCategory, sameArtisan, overlap }) => {
  if (sameArtisan && sameCategory) return true;
  if (sameArtisan && overlap > 0) return true;
  if (sameCategory && overlap > 0) return true;
  return overlap >= 2;
};

const getLinkedCoursesForProduct = async (product, limit = 4) => {
  const courses = await Course.find({ moderationStatus: "accepted" })
    .populate("artisan", "name email");

  const productCategory = normalizeCategory(product.category);
  const ignoredTokens = tokenize(product.category);
  const productArtisanId = getId(product.artisan);
  const productText = `${product.name || ""} ${product.brief || ""}`;

  const scored = courses.map((course) => {
    let score = 0;
    const reasons = [];

    const sameCategory = productCategory && normalizeCategory(course.category) === productCategory;
    const sameArtisan = productArtisanId && getId(course.artisan) === productArtisanId;
    const overlap = textOverlapScore(productText, `${course.title || ""} ${course.description || ""}`, ignoredTokens);

    if (!shouldLink({ sameCategory, sameArtisan, overlap })) {
      return attachScore(course, 0, []);
    }

    if (sameCategory) {
      score += 50;
      reasons.push("same category");
    }

    if (sameArtisan) {
      score += 25;
      reasons.push("same artisan");
    }

    if (overlap > 0) {
      score += overlap * 2;
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
  const ignoredTokens = tokenize(course.category);
  const courseArtisanId = getId(course.artisan);
  const courseText = `${course.title || ""} ${course.description || ""}`;

  const scored = products.map((product) => {
    let score = 0;
    const reasons = [];

    const sameCategory = courseCategory && normalizeCategory(product.category) === courseCategory;
    const sameArtisan = courseArtisanId && getId(product.artisan) === courseArtisanId;
    const overlap = textOverlapScore(courseText, `${product.name || ""} ${product.brief || ""}`, ignoredTokens);

    if (!shouldLink({ sameCategory, sameArtisan, overlap })) {
      return attachScore(product, 0, []);
    }

    if (sameCategory) {
      score += 50;
      reasons.push("same category");
    }

    if (sameArtisan) {
      score += 25;
      reasons.push("same artisan");
    }

    if (overlap > 0) {
      score += overlap * 2;
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
