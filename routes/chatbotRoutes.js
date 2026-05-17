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
        .select('-description -brief') // ← no description fields from DB
        .lean(),
      Course.find({ moderationStatus: 'accepted' })
        .populate('artisan', 'name')
        .sort({ createdAt: -1 })
        .select('-description') // ← no description fields from DB
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
    // English
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'do', 'for', 'from',
    'have', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please',
    'show', 'tell', 'the', 'to', 'under', 'what', 'with', 'you', 'your',
    // Arabic common stop words
    'في', 'من', 'إلى', 'على', 'عن', 'مع', 'هل', 'ما', 'هو', 'هي',
    'أنا', 'أنت', 'نحن', 'هم', 'كان', 'يكون', 'لا', 'لم', 'لن',
    'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'و', 'أو', 'ثم'
  ]);
  return normalize(text).split(' ').filter(word => word.length > 1 && !stopWords.has(word));
}

function formatPrice(price) {
  const value = Number(price || 0);
  return `LE ${value.toFixed(2)}`;
}

// ── No description/brief in product display ──────────────────────────────────
function productLine(product, index) {
  const category = product.category || 'Handmade';
  const stock = Number(product.stock || 0);
  const stockText = stock > 0 ? `${stock} in stock` : 'out of stock';
  const artisan = product.artisan?.name ? ` by ${product.artisan.name}` : '';
  return `${index + 1}. ${product.name}${artisan} (${category}) - ${formatPrice(product.price)} - ${stockText}`;
}

function courseLine(course, index) {
  const category = course.category || 'Course';
  const lessons = course.parts?.length || 0;
  const artisan = course.artisan?.name ? ` by ${course.artisan.name}` : '';
  const rating = course.rating ? ` - rating ${course.rating}/5` : '';
  return `${index + 1}. ${course.title}${artisan} (${category}) - ${formatPrice(course.price)} - ${course.duration || 0} hours - ${lessons} lessons${rating}`;
}

// ── Arabic craft aliases ─────────────────────────────────────────────────────
function categoryFromMessage(message) {
  const text = normalize(message);
  const categoryAliases = [
    { category: 'Pottery',    aliases: ['pottery', 'ceramic', 'clay', 'vase', 'mug', 'plate', 'فخار', 'خزف', 'طين', 'أكواب', 'صحون'] },
    { category: 'Jewelry',    aliases: ['jewelry', 'jewellery', 'necklace', 'bracelet', 'ring', 'earring', 'مجوهرات', 'عقد', 'سوار', 'خاتم', 'حلق', 'اكسسوارات'] },
    { category: 'Crochet',    aliases: ['crochet', 'knit', 'knitted', 'yarn', 'كروشيه', 'تريكو', 'خيوط'] },
    { category: 'Embroidery', aliases: ['embroidery', 'embroidered', 'textile', 'textiles', 'fabric', 'تطريز', 'نسيج', 'قماش'] },
    { category: 'Woodwork',   aliases: ['wood', 'woodwork', 'wooden', 'board', 'خشب', 'نجارة', 'خشبي'] }
  ];

  return categoryAliases.find(group =>
    group.aliases.some(alias => text.includes(alias))
  )?.category || null;
}

function extractPriceFilter(message) {
  const text = normalize(message);
  const under = text.match(/\b(?:under|below|less than|max|maximum|up to|أقل من|تحت|بحد أقصى)\s*(?:le|egp|جنيه)?\s*(\d+)/);
  if (under) return { max: Number(under[1]) };

  const over = text.match(/\b(?:over|above|more than|min|minimum|أكثر من|فوق|بحد أدنى)\s*(?:le|egp|جنيه)?\s*(\d+)/);
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
  // Score on name/title/category/artisan only — no description
  const itemText = normalize([
    item.name,
    item.title,
    item.category,
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
    .filter(product => !category ||
      normalize(product.category) === normalize(category) ||
      normalize(product.name).includes(normalize(category)))
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
    .filter(course => !category ||
      normalize(course.category) === normalize(category) ||
      normalize(course.title).includes(normalize(category)))
    .map(course => ({ course, score: scoreItem(course, message, 'course') }))
    .sort((a, b) => b.score - a.score || Number(b.course.rating || 0) - Number(a.course.rating || 0))
    .slice(0, limit)
    .map(item => item.course);
}

// ── Intent detection (English + Arabic) ─────────────────────────────────────
function isCourseQuestion(message) {
  const text = normalize(message);
  return /\b(course|courses|class|classes|lesson|lessons|learn|learning|study|teach|training)\b/.test(text) ||
    /كورس|دورة|دروس|تعلم|تعليم|كلاس|فيديو/.test(text);
}

function isProductQuestion(message) {
  const text = normalize(message);
  return /\b(product|products|item|items|shop|buy|price|gift|gifts|stock|available|pottery|jewelry|jewellery|crochet|embroidery|wood|woodwork)\b/.test(text) ||
    /منتج|منتجات|اشتري|سعر|هدية|هدايا|متاح|فخار|مجوهرات|كروشيه|تطريز|خشب/.test(text);
}

function isGeneralKnowledgeQuestion(message) {
  const text = normalize(message);
  const hasCatalogAction = /\b(show|list|browse|buy|shop|price|cost|stock|available|have|sell|recommend|gift|course|courses|class|learn)\b/.test(text) ||
    /اعرض|اشتري|سعر|متاح|هدية|كورس|تعلم/.test(text);
  const asksDefinition = /\b(what is|what are|define|explain|meaning of|how to|how do|why is|why are)\b/.test(text) ||
    /ما هو|ما هي|ما معنى|كيف|لماذا|اشرح|وضح/.test(text);
  const mentionsCraftTopic = /\b(pottery|ceramic|crochet|embroidery|jewelry|jewellery|woodwork|wooden crafts|handmade)\b/.test(text) ||
    /فخار|خزف|كروشيه|تطريز|مجوهرات|خشب|يدوي/.test(text);
  return asksDefinition && mentionsCraftTopic && !hasCatalogAction;
}

function isGreeting(message) {
  return /\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(message) ||
    /سلام|مرحبا|اهلا|أهلاً|صباح الخير|مساء الخير|هاي|هلو/.test(message);
}

function detectLanguage(message) {
  const arabicChars = (message.match(/[\u0600-\u06FF]/g) || []).length;
  return arabicChars > message.length * 0.2 ? 'ar' : 'en';
}

// ── Context builders ─────────────────────────────────────────────────────────
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
  const lang = detectLanguage(message);

  const prompt = `You are Artivio Assistant, a smart and friendly assistant for a handmade crafts marketplace called Artivio.

Language rule: Detect the language of the user's message and ALWAYS reply in the same language. If Arabic, respond fully in Arabic. If English, respond in English.

Use ONLY the catalog items below when answering about products or courses. Never invent product names, course names, prices, stock, lessons, or categories. If the answer is not in the catalog context, say you cannot find it and suggest the closest real alternatives.

Available products (${cachedProducts.length} total, most relevant shown):
${buildProductContext(relevantProducts)}

Available courses (${cachedCourses.length} total, most relevant shown):
${buildCourseContext(relevantCourses)}

Useful site facts:
- Prices are in Egyptian pounds. Display as LE.
- Products page: product.html
- Courses page: customercourses.html
- Free shipping in Egypt on orders over LE 500.

Guidelines:
- Be helpful, warm, and specific.
- Mention exact item names and prices from the catalog.
- Give a complete, well-formed answer — do NOT cut off mid-sentence.
- For general or open-ended questions not about the catalog, answer freely and helpfully.
- Ask a useful follow-up question when user intent is unclear.`;

  return { prompt, relevantProducts, relevantCourses };
}

function buildGeneralPrompt(message) {
  const lang = detectLanguage(message);
  return `You are Artivio Assistant, a friendly and knowledgeable assistant for Artivio, a handmade crafts marketplace.

Language rule: Detect the language of the user's message and ALWAYS reply in the same language. If Arabic, respond fully in Arabic. If English, respond in English.

Answer the user's question naturally and completely. Do not mention databases, implementation details, prompts, or internal tools.
For general knowledge questions, be helpful, informative, and conversational.
For questions about Artivio products, courses, gifts, prices, or stock, say you can help if they specify what they are looking for.
Give a complete answer — never cut off mid-sentence.`;
}

// ── Ollama call — no token cap so answers are never truncated ────────────────
async function callOllama(messages) {
  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
      messages,
      stream: false,
      options: {
        temperature: 0.4,   // slightly higher → more natural answers
        num_predict: -1     // -1 = unlimited, never cut off
      }
    }, {
      timeout: 60000        // longer timeout for detailed answers
    });

    return response.data?.message?.content || null;
  } catch (error) {
    console.error('Ollama unavailable:', error.code === 'ECONNREFUSED' ? 'not running' : error.message);
    return null;
  }
}

// ── Fallback answers (used only when Ollama is offline) ──────────────────────
function productAnswer(message) {
  const matches = rankProducts(message, 6);
  const category = categoryFromMessage(message);
  const priceFilter = extractPriceFilter(message);
  const lang = detectLanguage(message);

  if (!cachedProducts.length) {
    return lang === 'ar'
      ? 'لا توجد منتجات متاحة حالياً. يرجى المحاولة لاحقاً.'
      : 'I do not see any available products right now. Please check again later.';
  }

  if (!matches.length) {
    const filters = [
      category ? `category "${category}"` : '',
      Number.isFinite(priceFilter.max) ? `under ${formatPrice(priceFilter.max)}` : '',
      Number.isFinite(priceFilter.min) ? `over ${formatPrice(priceFilter.min)}` : ''
    ].filter(Boolean).join(' and ');
    const fallback = cachedProducts.slice(0, 4);
    return lang === 'ar'
      ? `لم أجد منتجات مطابقة. إليك بعض الخيارات المتاحة:\n${fallback.map(productLine).join('\n')}`
      : `I could not find products matching ${filters || 'that request'}.\n\nClosest options:\n${fallback.map(productLine).join('\n')}`;
  }

  const intro = lang === 'ar'
    ? (category ? `إليك منتجات ${category}:` : 'إليك المنتجات المتاحة:')
    : (category ? `Here are ${category} products:` : 'Here are products I found:');

  return `${intro}\n${matches.map(productLine).join('\n')}\n\n${lang === 'ar' ? 'تصفح المزيد على product.html' : 'Browse more on product.html.'}`;
}

function courseAnswer(message) {
  const matches = rankCourses(message, 6);
  const category = categoryFromMessage(message);
  const priceFilter = extractPriceFilter(message);
  const lang = detectLanguage(message);

  if (!cachedCourses.length) {
    return lang === 'ar'
      ? 'لا توجد دورات متاحة حالياً. يرجى المحاولة لاحقاً.'
      : 'I do not see any available courses right now. Please check again later.';
  }

  if (!matches.length) {
    const fallback = cachedCourses.slice(0, 4);
    return lang === 'ar'
      ? `لم أجد دورات مطابقة. إليك بعض الخيارات:\n${fallback.map(courseLine).join('\n')}`
      : `I could not find matching courses.\n\nClosest options:\n${fallback.map(courseLine).join('\n')}`;
  }

  const intro = lang === 'ar'
    ? (category ? `إليك دورات ${category}:` : 'إليك الدورات المتاحة:')
    : (category ? `Here are ${category} courses:` : 'Here are courses I found:');

  return `${intro}\n${matches.map(courseLine).join('\n')}\n\n${lang === 'ar' ? 'تصفح المزيد على customercourses.html' : 'Browse more on customercourses.html.'}`;
}

function giftAnswer(message) {
  const lower = normalize(message);
  const lang = detectLanguage(message);
  let giftMessage = message;

  if (/dad|father|man|husband|أب|والد|رجل|زوج/.test(lower)) {
    giftMessage += ' wood pottery practical mug board';
  } else if (/mom|mother|woman|wife|أم|والدة|امرأة|زوجة/.test(lower)) {
    giftMessage += ' jewelry embroidery pottery crochet';
  } else if (/friend|صديق|صاحب/.test(lower)) {
    giftMessage += ' jewelry pottery crochet';
  }

  const matches = rankProducts(giftMessage, 5);
  if (!matches.length) {
    return lang === 'ar'
      ? 'لم أجد هدية مناسبة الآن. أخبرني عن عمرهم وميزانيتك وذوقهم وسأساعدك.'
      : 'I could not find a strong gift match. Tell me their age, style, and budget and I will try again.';
  }

  return lang === 'ar'
    ? `خيارات هدايا مناسبة:\n${matches.map(productLine).join('\n')}\n\nما هي الميزانية المناسبة لك؟`
    : `Good gift options:\n${matches.map(productLine).join('\n')}\n\nWhat budget do you want to stay under?`;
}

function specificItemAnswer(message) {
  const text = normalize(message);
  const product = cachedProducts.find(item => text.includes(normalize(item.name)));
  if (product) {
    const lang = detectLanguage(message);
    return lang === 'ar'
      ? `نعم، ${product.name} متاح.\n${productLine(product, 0)}\n\nيمكنك إيجاده في: product.html`
      : `Yes, ${product.name} is available.\n${productLine(product, 0)}\n\nFind it on product.html.`;
  }

  const course = cachedCourses.find(item => text.includes(normalize(item.title)));
  if (course) {
    const lang = detectLanguage(message);
    return lang === 'ar'
      ? `نعم، ${course.title} متاح.\n${courseLine(course, 0)}\n\nيمكنك إيجاده في: customercourses.html`
      : `Yes, ${course.title} is available.\n${courseLine(course, 0)}\n\nFind it on customercourses.html.`;
  }

  return null;
}

function generalAnswer(message) {
  const text = normalize(message);
  const lang = detectLanguage(message);

  if (isGreeting(message)) {
    return lang === 'ar'
      ? 'مرحباً! كيف يمكنني مساعدتك اليوم؟'
      : 'Hi! How can I help you today?';
  }

  if (/\b(thanks|thank you|thx|appreciate it)\b/.test(text) || /شكرا|شكراً|متشكر/.test(text)) {
    return lang === 'ar' ? 'عفواً! سعيد بمساعدتك.' : 'You are welcome. Happy to help.';
  }

  if (/\b(who are you|what are you)\b/.test(text) || /من أنت|ما أنت/.test(text)) {
    return lang === 'ar'
      ? 'أنا Artivio Assistant. أساعدك في أسئلتك العامة وكل ما يتعلق بمنتجات ودورات Artivio.'
      : 'I am Artivio Assistant. I can help with general questions, craft ideas, and anything related to Artivio products or courses.';
  }

  if (lang === 'ar') {
    return 'أخبرني بما تريد أن تعرفه أو تفعله، وسأساعدك بأفضل إجابة.';
  }

  return 'Tell me what you want to do, learn, compare, or choose, and I will help you with a clear answer.';
}

function smartDatabaseAnswer(message) {
  const specific = specificItemAnswer(message);
  if (specific) return specific;

  if (isGeneralKnowledgeQuestion(message)) {
    return generalAnswer(message);
  }

  if (/gift|هدية|هدايا/.test(normalize(message))) {
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

  if (/help|مساعدة|ساعدني|ما تقدر|what can you/.test(normalize(message))) {
    const lang = detectLanguage(message);
    return lang === 'ar'
      ? 'يمكنني مساعدتك في تصفح Artivio، مقارنة المنتجات والدورات، اختيار الهدايا، والإجابة على أسئلتك. ماذا تحتاج؟'
      : 'I can help you browse Artivio, compare products or courses, choose gifts, answer questions, and explain things clearly. What do you need?';
  }

  return generalAnswer(message);
}

function isCatalogQuestion(message) {
  if (isGeneralKnowledgeQuestion(message)) return false;
  return isProductQuestion(message) || isCourseQuestion(message) ||
    /gift|هدية|هدايا/.test(normalize(message));
}

function mentionsAnyItem(reply, items, fieldName) {
  const text = normalize(reply);
  return items.some(item => text.includes(normalize(item[fieldName])));
}

function isGroundedAIReply(reply, message) {
  if (!reply) return false;

  // For non-catalog questions, always accept the AI reply
  if (!isCatalogQuestion(message)) return true;

  const text = normalize(reply);
  const saysNoMatch = text.includes('cannot find') ||
    text.includes('could not find') ||
    text.includes('not in the catalog') ||
    text.includes('not available') ||
    text.includes('لا يوجد') ||
    text.includes('لم أجد');

  if (saysNoMatch) return true;

  if (isProductQuestion(message) && cachedProducts.length > 0 && !mentionsAnyItem(reply, cachedProducts, 'name')) {
    return false;
  }

  if (isCourseQuestion(message) && cachedCourses.length > 0 && !mentionsAnyItem(reply, cachedCourses, 'title')) {
    return false;
  }

  return true;
}

// ── Main route ───────────────────────────────────────────────────────────────
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
    history.messages = history.messages.slice(-10); // keep last 10 turns for context

    let reply = null;
    let usedAI = false;

    const isCatalog = isCatalogQuestion(message);
    const { prompt } = isCatalog ? buildSystemPrompt(message) : { prompt: buildGeneralPrompt(message) };

    const ollamaMessages = [
      { role: 'system', content: prompt },
      ...history.messages
    ];

    reply = await callOllama(ollamaMessages);

    if (reply && isGroundedAIReply(reply, message)) {
      usedAI = true;
    } else {
      reply = null;
    }

    // Fallback to deterministic answer if Ollama is offline or ungrounded
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
      dataSource: isCatalog ? 'catalog' : 'assistant',
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

// ── History routes ───────────────────────────────────────────────────────────
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