const express = require('express');
const router = express.Router();
const axios = require('axios');

const Product = require('../models/product');
const Course = require('../models/course');

let cachedProducts = [];
let cachedCourses = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 2 * 60 * 1000;
const MAX_CONTEXT_ITEMS = 14;

async function refreshCache(force = false) {
  const now = Date.now();
  if (!force && now - lastCacheUpdate < CACHE_DURATION) return;

  try {
    const [products, courses] = await Promise.all([
      Product.find({ moderationStatus: 'accepted' })
        .populate('artisan', 'name')
        .sort({ createdAt: -1 })
        .lean(),
      Course.find({ moderationStatus: 'accepted' })
        .populate('artisan', 'name')
        .sort({ createdAt: -1 })
        .lean()
    ]);

    cachedProducts = products || [];
    cachedCourses = courses || [];
    lastCacheUpdate = now;
    console.log(`Chatbot cache: ${cachedProducts.length} products, ${cachedCourses.length} courses`);
  } catch (err) {
    console.error('Chatbot cache refresh error:', err.message);
  }
}

const conversationHistory = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of conversationHistory.entries()) {
    if (now - data.timestamp > 3600000) {
      conversationHistory.delete(sessionId);
    }
  }
}, 3600000);

function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text = '') {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'do', 'for', 'from',
    'have', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please',
    'show', 'tell', 'the', 'to', 'under', 'what', 'with', 'you', 'your'
  ]);
  return normalize(text).split(' ').filter(word => word.length > 2 && !stopWords.has(word));
}

function formatPrice(price) {
  const value = Number(price || 0);
  return `LE ${value.toFixed(2)}`;
}

function productLine(product, index) {
  const category = product.category || 'Handmade';
  const stock = Number(product.stock || 0);
  const stockText = stock > 0 ? `${stock} in stock` : 'out of stock';
  const artisan = product.artisan?.name ? ` by ${product.artisan.name}` : '';
  const brief = product.brief ? ` - ${product.brief}` : '';
  return `${index + 1}. ${product.name}${artisan} (${category}) - ${formatPrice(product.price)} - ${stockText}${brief}`;
}

function courseLine(course, index) {
  const category = course.category || 'Course';
  const lessons = course.parts?.length || 0;
  const artisan = course.artisan?.name ? ` by ${course.artisan.name}` : '';
  const rating = course.rating ? ` - rating ${course.rating}/5` : '';
  return `${index + 1}. ${course.title}${artisan} (${category}) - ${formatPrice(course.price)} - ${course.duration || 0} hours - ${lessons} lessons${rating}`;
}

function categoryFromMessage(message) {
  const text = normalize(message);
  const categoryAliases = [
    { category: 'Pottery', aliases: ['pottery', 'ceramic', 'clay', 'vase', 'mug', 'plate'] },
    { category: 'Jewelry', aliases: ['jewelry', 'jewellery', 'necklace', 'bracelet', 'ring', 'earring'] },
    { category: 'crochet', aliases: ['crochet', 'knit', 'knitted', 'yarn'] },
    { category: 'Crochet', aliases: ['crochet', 'knit', 'knitted', 'yarn'] },
    { category: 'Embroidery', aliases: ['embroidery', 'embroidered', 'textile', 'textiles', 'fabric'] },
    { category: 'Woodwork', aliases: ['wood', 'woodwork', 'wooden', 'board'] }
  ];

  return categoryAliases.find(group => group.aliases.some(alias => text.includes(alias)))?.category || null;
}

function extractPriceFilter(message) {
  const text = normalize(message);
  const under = text.match(/\b(?:under|below|less than|max|maximum|up to)\s*(?:le|egp)?\s*(\d+)/);
  if (under) return { max: Number(under[1]) };

  const over = text.match(/\b(?:over|above|more than|min|minimum)\s*(?:le|egp)?\s*(\d+)/);
  if (over) return { min: Number(over[1]) };

  const between = text.match(/\bbetween\s*(?:le|egp)?\s*(\d+)\s*(?:and|to|-)\s*(?:le|egp)?\s*(\d+)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };

  return {};
}

function matchesPrice(item, filter) {
  const price = Number(item.price || 0);
  if (Number.isFinite(filter.min) && price < filter.min) return false;
  if (Number.isFinite(filter.max) && price > filter.max) return false;
  return true;
}

function scoreItem(item, message, type) {
  const queryWords = words(message);
  const itemText = normalize([
    item.name,
    item.title,
    item.category,
    item.brief,
    item.description,
    item.artisan?.name,
    type
  ].filter(Boolean).join(' '));

  let score = 0;
  queryWords.forEach(word => {
    if (itemText.includes(word)) score += 3;
    if (normalize(item.name || item.title).includes(word)) score += 3;
  });

  const category = categoryFromMessage(message);
  if (category && normalize(item.category) === normalize(category)) score += 8;

  const priceFilter = extractPriceFilter(message);
  if (matchesPrice(item, priceFilter)) score += 1;

  if (type === 'product' && Number(item.stock || 0) > 0) score += 1;
  if (type === 'course' && Number(item.rating || 0) > 0) score += Number(item.rating);

  return score;
}

function rankProducts(message, limit = 6) {
  const priceFilter = extractPriceFilter(message);
  const category = categoryFromMessage(message);
  return cachedProducts
    .filter(product => matchesPrice(product, priceFilter))
    .filter(product => !category || normalize(product.category) === normalize(category) || normalize(product.name).includes(normalize(category)))
    .map(product => ({ product, score: scoreItem(product, message, 'product') }))
    .sort((a, b) => b.score - a.score || Number(b.product.stock || 0) - Number(a.product.stock || 0))
    .slice(0, limit)
    .map(item => item.product);
}

function rankCourses(message, limit = 6) {
  const priceFilter = extractPriceFilter(message);
  const category = categoryFromMessage(message);
  return cachedCourses
    .filter(course => matchesPrice(course, priceFilter))
    .filter(course => !category || normalize(course.category) === normalize(category) || normalize(course.title).includes(normalize(category)))
    .map(course => ({ course, score: scoreItem(course, message, 'course') }))
    .sort((a, b) => b.score - a.score || Number(b.course.rating || 0) - Number(a.course.rating || 0))
    .slice(0, limit)
    .map(item => item.course);
}

function isCourseQuestion(message) {
  const text = normalize(message);
  return /\b(course|courses|class|classes|lesson|lessons|learn|learning|study|teach|training)\b/.test(text);
}

function isProductQuestion(message) {
  const text = normalize(message);
  return /\b(product|products|item|items|shop|buy|price|gift|gifts|stock|available|pottery|jewelry|jewellery|crochet|embroidery|wood|woodwork)\b/.test(text);
}

function isGreeting(message) {
  return /\b(hello|hi|hey|good morning|good afternoon|good evening|salam|مرحبا|اهلا)\b/i.test(message);
}

function buildProductContext(products) {
  if (!products.length) return 'No matching accepted products are currently in the database.';
  return products.map((product, index) => productLine(product, index)).join('\n');
}

function buildCourseContext(courses) {
  if (!courses.length) return 'No matching accepted courses are currently in the database.';
  return courses.map((course, index) => courseLine(course, index)).join('\n');
}

function buildSystemPrompt(message) {
  const relevantProducts = rankProducts(message, MAX_CONTEXT_ITEMS);
  const relevantCourses = rankCourses(message, MAX_CONTEXT_ITEMS);

  return {
    prompt: `You are Artivio Assistant, a smart shopping and course assistant for a handmade crafts marketplace.

Use ONLY the database items below when answering about products or courses. Never invent product names, course names, prices, stock, lessons, or categories. If the answer is not in the database context, say that you cannot find it in the current catalog and offer the closest real alternatives.

Accepted products from database (${cachedProducts.length} total, most relevant shown):
${buildProductContext(relevantProducts)}

Accepted courses from database (${cachedCourses.length} total, most relevant shown):
${buildCourseContext(relevantCourses)}

Useful site facts:
- Prices are in Egyptian pounds. Display prices as LE.
- Products page: product.html
- Courses page: customercourses.html
- Free shipping in Egypt applies on orders over LE 500.

Style:
- Be helpful and specific.
- Mention exact item names and prices from the database.
- Keep the answer short unless the user asks for details.
- Ask a useful follow-up question when the user intent is unclear.`,
    relevantProducts,
    relevantCourses
  };
}

async function callOllama(messages) {
  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
      messages,
      stream: false,
      options: {
        temperature: 0.25,
        num_predict: 420
      }
    }, {
      timeout: 30000
    });

    return response.data?.message?.content || null;
  } catch (error) {
    console.error('Ollama unavailable:', error.code === 'ECONNREFUSED' ? 'not running' : error.message);
    return null;
  }
}

function productAnswer(message) {
  const matches = rankProducts(message, 6);
  const category = categoryFromMessage(message);
  const priceFilter = extractPriceFilter(message);

  if (!cachedProducts.length) {
    return 'I checked the database, but there are no accepted products available right now.';
  }

  if (!matches.length) {
    const filters = [
      category ? `category "${category}"` : '',
      Number.isFinite(priceFilter.max) ? `under ${formatPrice(priceFilter.max)}` : '',
      Number.isFinite(priceFilter.min) ? `over ${formatPrice(priceFilter.min)}` : ''
    ].filter(Boolean).join(' and ');
    const fallback = cachedProducts.slice(0, 4);
    return `I could not find accepted products matching ${filters || 'that request'} in the database.\n\nClosest available products:\n${fallback.map(productLine).join('\n')}`;
  }

  const intro = category
    ? `Here are real accepted ${category} products from the database:`
    : 'Here are real accepted products from the database:';

  return `${intro}\n${matches.map(productLine).join('\n')}\n\nYou can browse more on product.html.`;
}

function courseAnswer(message) {
  const matches = rankCourses(message, 6);
  const category = categoryFromMessage(message);
  const priceFilter = extractPriceFilter(message);

  if (!cachedCourses.length) {
    return 'I checked the database, but there are no accepted courses available right now.';
  }

  if (!matches.length) {
    const filters = [
      category ? `category "${category}"` : '',
      Number.isFinite(priceFilter.max) ? `under ${formatPrice(priceFilter.max)}` : '',
      Number.isFinite(priceFilter.min) ? `over ${formatPrice(priceFilter.min)}` : ''
    ].filter(Boolean).join(' and ');
    const fallback = cachedCourses.slice(0, 4);
    return `I could not find accepted courses matching ${filters || 'that request'} in the database.\n\nClosest available courses:\n${fallback.map(courseLine).join('\n')}`;
  }

  const intro = category
    ? `Here are real accepted ${category} courses from the database:`
    : 'Here are real accepted courses from the database:';

  return `${intro}\n${matches.map(courseLine).join('\n')}\n\nYou can browse more on customercourses.html.`;
}

function giftAnswer(message) {
  const lower = normalize(message);
  let giftMessage = message;

  if (lower.includes('dad') || lower.includes('father') || lower.includes('man') || lower.includes('husband')) {
    giftMessage += ' wood pottery practical mug board';
  } else if (lower.includes('mom') || lower.includes('mother') || lower.includes('woman') || lower.includes('wife')) {
    giftMessage += ' jewelry embroidery pottery crochet';
  } else if (lower.includes('friend')) {
    giftMessage += ' jewelry pottery crochet';
  }

  const matches = rankProducts(giftMessage, 5);
  if (!matches.length) {
    return 'I checked the accepted products in the database, but I could not find a good gift match right now. Tell me their age, style, and budget and I will try again.';
  }

  return `Good gift options from the real product database:\n${matches.map(productLine).join('\n')}\n\nWhat budget do you want to stay under?`;
}

function specificItemAnswer(message) {
  const text = normalize(message);
  const product = cachedProducts.find(item => text.includes(normalize(item.name)));
  if (product) {
    return `Yes, ${product.name} is in the accepted product database.\n${productLine(product, 0)}\n\nYou can find it from the products page: product.html.`;
  }

  const course = cachedCourses.find(item => text.includes(normalize(item.title)));
  if (course) {
    return `Yes, ${course.title} is in the accepted course database.\n${courseLine(course, 0)}\n\nYou can find it from the courses page: customercourses.html.`;
  }

  return null;
}

function smartDatabaseAnswer(message) {
  const specific = specificItemAnswer(message);
  if (specific) return specific;

  if (isGreeting(message)) {
    return `Hi! I can answer using the real Artivio database. Right now I can see ${cachedProducts.length} accepted products and ${cachedCourses.length} accepted courses. Ask me for products, courses, categories, gifts, or a price range.`;
  }

  if (normalize(message).includes('gift')) {
    return giftAnswer(message);
  }

  if (isCourseQuestion(message) && !isProductQuestion(message)) {
    return courseAnswer(message);
  }

  if (isProductQuestion(message) && !isCourseQuestion(message)) {
    return productAnswer(message);
  }

  if (isCourseQuestion(message) && isProductQuestion(message)) {
    return `${productAnswer(message)}\n\n${courseAnswer(message)}`;
  }

  if (normalize(message).includes('help') || normalize(message).includes('what can you do')) {
    return `I can answer from your live database:\n- "Show me pottery products"\n- "Courses under LE 500"\n- "Gift for my mom under LE 300"\n- "Do you have [product/course name]?"\n\nI will only recommend accepted products and courses that exist in the database.`;
  }

  return `I can help with Artivio products and courses from the real database. I currently see ${cachedProducts.length} accepted products and ${cachedCourses.length} accepted courses. Try asking for a category, a budget, a gift idea, or a course topic.`;
}

function shouldUseAI(message) {
  return isProductQuestion(message) || isCourseQuestion(message) || normalize(message).includes('gift');
}

function mentionsAnyItem(reply, items, fieldName) {
  const text = normalize(reply);
  return items.some(item => text.includes(normalize(item[fieldName])));
}

function isGroundedAIReply(reply, message) {
  if (!reply) return false;

  const text = normalize(reply);
  const saysNoMatch = text.includes('cannot find') ||
    text.includes('could not find') ||
    text.includes('not in the database') ||
    text.includes('not available');

  if (saysNoMatch) return true;

  if (isProductQuestion(message) && cachedProducts.length > 0 && !mentionsAnyItem(reply, cachedProducts, 'name')) {
    return false;
  }

  if (isCourseQuestion(message) && cachedCourses.length > 0 && !mentionsAnyItem(reply, cachedCourses, 'title')) {
    return false;
  }

  return true;
}

router.post('/message', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    await refreshCache();

    const chatSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    let history = conversationHistory.get(chatSessionId) || { messages: [], timestamp: Date.now() };

    history.messages.push({ role: 'user', content: message });
    history.messages = history.messages.slice(-8);

    let reply = null;
    let usedAI = false;

    if (shouldUseAI(message)) {
      const { prompt } = buildSystemPrompt(message);
      const messages = [
        { role: 'system', content: prompt },
        ...history.messages
      ];

      reply = await callOllama(messages);
      if (reply && isGroundedAIReply(reply, message)) {
        usedAI = true;
      } else {
        reply = null;
      }
    }

    if (!reply) {
      reply = smartDatabaseAnswer(message);
    }

    history.messages.push({ role: 'assistant', content: reply });
    history.timestamp = Date.now();
    conversationHistory.set(chatSessionId, history);

    res.json({
      success: true,
      reply,
      sessionId: chatSessionId,
      usedAI,
      dataSource: 'database',
      productCount: cachedProducts.length,
      courseCount: cachedCourses.length
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.json({
      success: true,
      reply: 'I had trouble reading the catalog for a moment. Please ask again about products, courses, gifts, or a price range.',
      dataSource: 'fallback'
    });
  }
});

router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = conversationHistory.get(sessionId);
    res.json({ success: true, messages: history?.messages || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    conversationHistory.delete(sessionId);
    res.json({ success: true, message: 'History cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/test', async (req, res) => {
  await refreshCache(true);

  let ollamaStatus = 'not running';
  try {
    await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
    ollamaStatus = 'connected';
  } catch (e) {
    ollamaStatus = 'not running';
  }

  res.json({
    success: true,
    message: 'Chatbot API is running',
    ollama: ollamaStatus,
    products: cachedProducts.length,
    courses: cachedCourses.length,
    productExamples: cachedProducts.slice(0, 3).map(product => product.name),
    courseExamples: cachedCourses.slice(0, 3).map(course => course.title)
  });
});

module.exports = router;
