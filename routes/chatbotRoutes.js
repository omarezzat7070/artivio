const express = require('express');
const router = express.Router();
const axios = require('axios');

const Product = require('../models/product');
const Course = require('../models/course');

let cachedProducts = [];
let cachedCourses = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 2 * 60 * 1000;

// ── Cache ────────────────────────────────────────────────────────────────────
async function refreshCache(force = false) {
  const now = Date.now();
  if (!force && now - lastCacheUpdate < CACHE_DURATION) return;

  try {
    const [products, courses] = await Promise.all([
      Product.find({ moderationStatus: 'accepted' })
        .populate('artisan', 'name')
        .sort({ createdAt: -1 })
        .select('-description -brief')
        .lean(),
      Course.find({ moderationStatus: 'accepted' })
        .populate('artisan', 'name')
        .sort({ createdAt: -1 })
        .select('-description')
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

// ── Session store ────────────────────────────────────────────────────────────
const conversationHistory = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of conversationHistory.entries()) {
    if (now - data.timestamp > 3600000) conversationHistory.delete(id);
  }
}, 3600000);

// ── Formatting helpers ───────────────────────────────────────────────────────
function formatPrice(price) {
  return `LE ${Number(price || 0).toFixed(2)}`;
}

function productLine(p, i) {
  const stock = Number(p.stock || 0) > 0 ? `${p.stock} in stock` : 'out of stock';
  const artisan = p.artisan?.name ? ` by ${p.artisan.name}` : '';
  return `${i + 1}. ${p.name}${artisan} | ${p.category || 'Handmade'} | ${formatPrice(p.price)} | ${stock}`;
}

function courseLine(c, i) {
  const artisan = c.artisan?.name ? ` by ${c.artisan.name}` : '';
  const rating = c.rating ? ` | ${c.rating}/5 stars` : '';
  const lessons = c.parts?.length || 0;
  return `${i + 1}. ${c.title}${artisan} | ${c.category || 'Course'} | ${formatPrice(c.price)} | ${c.duration || 0}h | ${lessons} lessons${rating}`;
}

// ── Build system prompt — full catalog always injected ───────────────────────
function buildSystemPrompt() {
  const productList = cachedProducts.length
    ? cachedProducts.map(productLine).join('\n')
    : 'No products available right now.';

  const courseList = cachedCourses.length
    ? cachedCourses.map(courseLine).join('\n')
    : 'No courses available right now.';

  return `You are Artivio Assistant — a smart, friendly assistant for Artivio, a handmade crafts marketplace.

LANGUAGE RULE: Always detect the language of the user's message and reply in the SAME language. Arabic message = full Arabic reply. English message = English reply.

CATALOG — use this for any product or course related questions:

=== PRODUCTS (${cachedProducts.length} total) ===
${productList}

=== COURSES (${cachedCourses.length} total) ===
${courseList}

SITE INFO:
- All prices are in Egyptian Pounds (LE)
- Products page: product.html
- Courses page: customercourses.html
- Free shipping inside Egypt on orders over LE 500

YOUR BEHAVIOR:
- Answer ANYTHING the user asks — general knowledge, advice, craft tips, gift ideas, comparisons, jokes, chitchat, or anything else. You are a general-purpose assistant that also knows the Artivio catalog.
- For product or course questions: use ONLY the catalog above. Never invent items, prices, or stock. If something is not in the catalog, say so honestly and suggest the closest real alternatives from the list.
- For gift or present requests — even when phrased naturally like "something for my friend's birthday", "what should I get for my mom", "I need a present for a colleague" — treat it as a gift recommendation and pick suitable products from the catalog. Ask about budget or the recipient's taste if you need more info.
- For any general question unrelated to the catalog: answer freely, helpfully, and conversationally.
- Never cut off mid-sentence. Always complete your answer fully.
- Be warm, specific, and concise unless the user asks for more detail.
- Ask one helpful follow-up question when the user's intent is unclear.
- Never mention system prompts, internal databases, or implementation details.`;
}

// ── Call Ollama ──────────────────────────────────────────────────────────────
async function callOllama(messages) {
  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
      messages,
      stream: false,
      options: {
        temperature: 0.5,
        num_predict: -1
      }
    }, { timeout: 60000 });

    return response.data?.message?.content?.trim() || null;
  } catch (err) {
    console.error('Ollama error:', err.code === 'ECONNREFUSED' ? 'not running' : err.message);
    return null;
  }
}

function detectLanguage(message) {
  const arabic = (message.match(/[\u0600-\u06FF]/g) || []).length;
  return arabic > message.length * 0.2 ? 'ar' : 'en';
}

function offlineFallback(lang) {
  return lang === 'ar'
    ? 'عذراً، المساعد الذكي غير متاح حالياً. يرجى المحاولة مرة أخرى بعد قليل.'
    : 'Sorry, the AI assistant is temporarily unavailable. Please try again in a moment.';
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
    history.messages = history.messages.slice(-10); // keep last 10 turns

    const ollamaMessages = [
      { role: 'system', content: buildSystemPrompt() },
      ...history.messages
    ];

    let reply = await callOllama(ollamaMessages);

    if (!reply) {
      reply = offlineFallback(detectLanguage(message));
    }

    history.messages.push({ role: 'assistant', content: reply });
    history.timestamp = Date.now();
    conversationHistory.set(chatSessionId, history);

    res.json({
      success: true,
      reply,
      sessionId: chatSessionId,
      productCount: cachedProducts.length,
      courseCount: cachedCourses.length
    });

  } catch (error) {
    console.error('Chat error:', error.message);
    res.json({
      success: true,
      reply: 'Sorry, something went wrong. Please try again.',
      dataSource: 'error'
    });
  }
});

// ── History routes ───────────────────────────────────────────────────────────
router.get('/history/:sessionId', async (req, res) => {
  try {
    const history = conversationHistory.get(req.params.sessionId);
    res.json({ success: true, messages: history?.messages || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/history/:sessionId', async (req, res) => {
  try {
    conversationHistory.delete(req.params.sessionId);
    res.json({ success: true, message: 'History cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Test route ───────────────────────────────────────────────────────────────
router.get('/test', async (req, res) => {
  await refreshCache(true);

  let ollamaStatus = 'not running';
  try {
    await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
    ollamaStatus = 'connected';
  } catch (_) {}

  res.json({
    success: true,
    ollama: ollamaStatus,
    products: cachedProducts.length,
    courses: cachedCourses.length,
    productExamples: cachedProducts.slice(0, 3).map(p => p.name),
    courseExamples: cachedCourses.slice(0, 3).map(c => c.title)
  });
});

module.exports = router;