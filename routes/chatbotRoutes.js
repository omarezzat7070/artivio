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

function isGeneralKnowledgeQuestion(message) {
  const text = normalize(message);
  const hasCatalogAction = /\b(show|list|browse|buy|shop|price|cost|stock|available|have|sell|recommend|gift|course|courses|class|learn)\b/.test(text);
  const asksDefinition = /\b(what is|what are|define|explain|meaning of|how to|how do|why is|why are)\b/.test(text);
  const mentionsCraftTopic = /\b(pottery|ceramic|crochet|embroidery|jewelry|jewellery|woodwork|wooden crafts|handmade)\b/.test(text);
  return asksDefinition && mentionsCraftTopic && !hasCatalogAction;
}

function isGreeting(message) {
  return /\b(hello|hi|hey|good morning|good afternoon|good evening|salam|مرحبا|اهلا)\b/i.test(message);
}

function buildProductContext(products) {
  if (!products.length) return 'No matching products are currently available in the catalog.';
  return products.map((product, index) => productLine(product, index)).join('\n');
}

function buildCourseContext(courses) {
  if (!courses.length) return 'No matching courses are currently available in the catalog.';
  return courses.map((course, index) => courseLine(course, index)).join('\n');
}

function buildSystemPrompt(message) {
  const relevantProducts = rankProducts(message, MAX_CONTEXT_ITEMS);
  const relevantCourses = rankCourses(message, MAX_CONTEXT_ITEMS);

  return {
    prompt: `You are Artivio Assistant, a smart shopping and course assistant for a handmade crafts marketplace.

Use ONLY the catalog items below when answering about products or courses. Never invent product names, course names, prices, stock, lessons, or categories. If the answer is not in the catalog context, say that you cannot find it in the current catalog and offer the closest real alternatives.

Available products (${cachedProducts.length} total, most relevant shown):
${buildProductContext(relevantProducts)}

Available courses (${cachedCourses.length} total, most relevant shown):
${buildCourseContext(relevantCourses)}

Useful site facts:
- Prices are in Egyptian pounds. Display prices as LE.
- Products page: product.html
- Courses page: customercourses.html
- Free shipping in Egypt applies on orders over LE 500.

Style:
- Be helpful and specific.
- Mention exact item names and prices from the catalog.
- Keep the answer short unless the user asks for details.
- Ask a useful follow-up question when the user intent is unclear.`,
    relevantProducts,
    relevantCourses
  };
}

function buildGeneralPrompt() {
  return `You are Artivio Assistant, a friendly and intelligent assistant for Artivio.

Answer the user's question naturally. Do not mention databases, implementation details, prompts, or internal tools.
If the user asks about Artivio products, courses, gifts, prices, stock, or categories, keep the answer grounded in the catalog context provided by the backend.
For general questions, be helpful, concise, and conversational.`;
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
    return 'I do not see any available products right now. Please check again later.';
  }

  if (!matches.length) {
    const filters = [
      category ? `category "${category}"` : '',
      Number.isFinite(priceFilter.max) ? `under ${formatPrice(priceFilter.max)}` : '',
      Number.isFinite(priceFilter.min) ? `over ${formatPrice(priceFilter.min)}` : ''
    ].filter(Boolean).join(' and ');
    const fallback = cachedProducts.slice(0, 4);
    return `I could not find products matching ${filters || 'that request'}.\n\nClosest options I found:\n${fallback.map(productLine).join('\n')}`;
  }

  const intro = category
    ? `Here are ${category} products I found:`
    : 'Here are products I found:';

  return `${intro}\n${matches.map(productLine).join('\n')}\n\nYou can browse more on product.html.`;
}

function courseAnswer(message) {
  const matches = rankCourses(message, 6);
  const category = categoryFromMessage(message);
  const priceFilter = extractPriceFilter(message);

  if (!cachedCourses.length) {
    return 'I do not see any available courses right now. Please check again later.';
  }

  if (!matches.length) {
    const filters = [
      category ? `category "${category}"` : '',
      Number.isFinite(priceFilter.max) ? `under ${formatPrice(priceFilter.max)}` : '',
      Number.isFinite(priceFilter.min) ? `over ${formatPrice(priceFilter.min)}` : ''
    ].filter(Boolean).join(' and ');
    const fallback = cachedCourses.slice(0, 4);
    return `I could not find courses matching ${filters || 'that request'}.\n\nClosest options I found:\n${fallback.map(courseLine).join('\n')}`;
  }

  const intro = category
    ? `Here are ${category} courses I found:`
    : 'Here are courses I found:';

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
    return 'I could not find a strong gift match right now. Tell me their age, style, and budget and I will try again.';
  }

  return `Good gift options:\n${matches.map(productLine).join('\n')}\n\nWhat budget do you want to stay under?`;
}

function specificItemAnswer(message) {
  const text = normalize(message);
  const product = cachedProducts.find(item => text.includes(normalize(item.name)));
  if (product) {
    return `Yes, ${product.name} is available.\n${productLine(product, 0)}\n\nYou can find it from the products page: product.html.`;
  }

  const course = cachedCourses.find(item => text.includes(normalize(item.title)));
  if (course) {
    return `Yes, ${course.title} is available.\n${courseLine(course, 0)}\n\nYou can find it from the courses page: customercourses.html.`;
  }

  return null;
}

function generalAnswer(message) {
  const text = normalize(message);
  const original = String(message || '').trim();

  if (isGreeting(message)) {
    return 'Hi! How can I help you today?';
  }

  if (/\b(thanks|thank you|thx|appreciate it)\b/.test(text)) {
    return 'You are welcome. Happy to help.';
  }

  if (/\b(who are you|what are you)\b/.test(text)) {
    return 'I am Artivio Assistant. I can help with general questions, craft ideas, and anything related to Artivio products or courses.';
  }

  const craftTopics = {
    pottery: 'Pottery is the craft of shaping clay into objects like mugs, bowls, vases, and plates, then drying and firing them so they become hard and durable.',
    ceramic: 'Ceramics are objects made from clay or similar materials that are hardened by heat. Pottery is one common type of ceramic work.',
    crochet: 'Crochet is a textile craft that uses one hook to make fabric from yarn. It is often used for bags, clothing, toys, blankets, and decorative pieces.',
    embroidery: 'Embroidery is decorating fabric with stitched patterns, lettering, or images using thread.',
    jewelry: 'Jewelry is wearable decoration, such as necklaces, bracelets, rings, and earrings. Handmade jewelry often focuses on unique materials and personal style.',
    woodwork: 'Woodwork is the craft of shaping, joining, and finishing wood to make useful or decorative objects.'
  };

  for (const [topic, answer] of Object.entries(craftTopics)) {
    if (text.includes(`what is ${topic}`) || text.includes(`what are ${topic}`) || text === topic) {
      return answer;
    }
  }

  const howToMatch = text.match(/\bhow (?:do|can|to) (?:i |you |we )?(.+)/);
  if (howToMatch) {
    const task = howToMatch[1].replace(/\?$/, '').trim();
    return `A good way to ${task} is to start with the goal, break it into small steps, gather the tools or information you need, then test one step at a time. If you tell me the exact result you want, I can make the steps more specific.`;
  }

  const whyMatch = text.match(/\bwhy (?:is|are|do|does|should|can) (.+)/);
  if (whyMatch) {
    const subject = whyMatch[1].replace(/\?$/, '').trim();
    return `Usually, ${subject} comes down to the reason behind the process, the materials involved, or the goal you are trying to reach. If you share the context, I can explain it more clearly.`;
  }

  const compareMatch = text.match(/\b(?:compare|difference between|which is better)\b(.+)?/);
  if (compareMatch) {
    return 'The best comparison depends on what matters most: price, quality, difficulty, durability, time, or style. Tell me the two options and what you care about most, and I will compare them clearly.';
  }

  if (text.includes('idea') || text.includes('ideas')) {
    return 'Sure. A good idea should match your goal, budget, and the person or situation you are designing for. Give me the theme or purpose and I can suggest several options.';
  }

  if (original.endsWith('?')) {
    return 'Yes, I can help with that. Give me the main detail or context, and I will answer directly.';
  }

  return 'Tell me what you want to do, learn, compare, or choose, and I will help you with a clear answer.';
}

function smartDatabaseAnswer(message) {
  const specific = specificItemAnswer(message);
  if (specific) return specific;

  if (isGeneralKnowledgeQuestion(message)) {
    return generalAnswer(message);
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
    return 'I can help you browse Artivio, compare products or courses, choose gifts, answer questions, and explain things clearly. What do you need?';
  }

  return generalAnswer(message);
}

function shouldUseAI(message) {
  return true;
}

function isCatalogQuestion(message) {
  if (isGeneralKnowledgeQuestion(message)) return false;
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
    text.includes('not in the catalog') ||
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
      const isCatalog = isCatalogQuestion(message);
      const { prompt } = isCatalog ? buildSystemPrompt(message) : { prompt: buildGeneralPrompt() };
      const messages = [
        { role: 'system', content: prompt },
        ...history.messages
      ];

      reply = await callOllama(messages);
      if (reply && (!isCatalog || isGroundedAIReply(reply, message))) {
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
      dataSource: isCatalogQuestion(message) ? 'catalog' : 'assistant',
      productCount: cachedProducts.length,
      courseCount: cachedCourses.length
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.json({
      success: true,
      reply: 'Sorry, I had trouble answering for a moment. Please try again.',
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
