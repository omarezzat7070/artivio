const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');

// Import models
const Product = require('../models/product');
const Course = require('../models/course');

// Cache for products and courses
let cachedProducts = [];
let cachedCourses = [];
let lastCacheUpdate = 0;
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Refresh cache from database
async function refreshCache() {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_DURATION && cachedProducts.length > 0) {
    return;
  }
  
  try {
    const [products, courses] = await Promise.all([
      Product.find({ moderationStatus: 'accepted' }).lean(),
      Course.find({ moderationStatus: 'accepted' }).lean()
    ]);
    
    cachedProducts = products || [];
    cachedCourses = courses || [];
    lastCacheUpdate = now;
    
    console.log(`🔄 Cache refreshed: ${cachedProducts.length} products, ${cachedCourses.length} courses`);
  } catch (err) {
    console.error('Cache refresh error:', err);
  }
}

// Store conversation history per session
const conversationHistory = new Map();

// Clean old conversations every hour
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of conversationHistory.entries()) {
    if (now - data.timestamp > 3600000) {
      conversationHistory.delete(sessionId);
    }
  }
}, 3600000);

// Build product context string
function buildProductContext() {
  if (cachedProducts.length === 0) return "No products available yet.";
  
  return cachedProducts.map(p => 
    `- "${p.name}" (${p.category || 'Handmade'}) - ${p.price} EGP`
  ).join('\n');
}

function buildCourseContext() {
  if (cachedCourses.length === 0) return "No courses available yet.";
  
  return cachedCourses.map(c => 
    `- "${c.title}" (${c.duration || 0} hours, ${c.parts?.length || 0} lessons) - ${c.price} EGP`
  ).join('\n');
}

// Call Ollama AI (local, free, fast!)
async function callOllama(messages) {
  try {
    const response = await axios.post('http://localhost:11434/api/chat', {
      model: 'llama3.2:3b',
      messages: messages,
      stream: false,
      options: {
        temperature: 0.7,
        max_tokens: 300
      }
    }, {
      timeout: 30000
    });
    
    if (response.data?.message?.content) {
      return response.data.message.content;
    }
    return null;
  } catch (error) {
    console.error('Ollama error:', error.code === 'ECONNREFUSED' ? 'Ollama not running' : error.message);
    return null;
  }
}

// POST /api/chatbot/message
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    
    console.log(`📩 Received: "${message.substring(0, 50)}..."`);
    
    // Refresh cache to get latest products
    await refreshCache();
    
    const chatSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get or create conversation history
    let history = conversationHistory.get(chatSessionId);
    if (!history) {
      history = { messages: [], timestamp: Date.now() };
    }
    
    // Add user message
    history.messages.push({ role: 'user', content: message });
    
    // Keep last 8 messages for context
    if (history.messages.length > 8) {
      history.messages = history.messages.slice(-8);
    }
    
    // Build system prompt with REAL products
    const productList = buildProductContext();
    const courseList = buildCourseContext();
    
    const systemPrompt = `You are "Artivio Assistant" - a friendly, enthusiastic AI shopping assistant for Artivio, a marketplace for handmade crafts.

REAL PRODUCTS AVAILABLE (${cachedProducts.length} total):
${productList}

REAL COURSES AVAILABLE (${cachedCourses.length} total):
${courseList}

ABOUT ARTIVIO:
- Handmade products: Pottery, Jewelry, Textiles, Woodwork
- All prices in Egyptian Pounds (EGP)
- Free shipping in Egypt on orders over 500 EGP

YOUR RULES:
1. ONLY recommend products from the list above - use EXACT product names and prices
2. Always show prices in EGP
3. Be warm, helpful, and use emojis
4. For gifts, ask who it's for and suggest specific items from the list
5. Keep responses concise (2-4 sentences usually)
6. If someone asks "what products do you have?", list from the products above

Be conversational and helpful! Use emojis! 🎁`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.messages
    ];
    
    let aiResponse = null;
    
    // Try Ollama first (local AI)
    aiResponse = await callOllama(messages);
    
    if (aiResponse) {
      console.log('✅ Ollama AI response received');
    } else {
      console.log('⚠️ Ollama not available, using smart template');
      // Fallback to smart template with REAL data
      aiResponse = getSmartTemplateResponse(message);
    }
    
    // Add AI response to history
    history.messages.push({ role: 'assistant', content: aiResponse });
    history.timestamp = Date.now();
    conversationHistory.set(chatSessionId, history);
    
    res.json({ 
      success: true, 
      reply: aiResponse, 
      sessionId: chatSessionId,
      usedAI: !!aiResponse
    });
    
  } catch (error) {
    console.error('Chat error:', error.message);
    res.json({ 
      success: true, 
      reply: "I'm here to help! Feel free to ask about our products, courses, or gift recommendations. What would you like to know? 🛍️"
    });
  }
});

// Smart template responses using REAL database data
function getSmartTemplateResponse(message) {
  const lowerMsg = message.toLowerCase();
  
  // Gift for dad
  if (lowerMsg.includes('gift') && (lowerMsg.includes('dad') || lowerMsg.includes('father'))) {
    const dadGifts = cachedProducts.filter(p => 
      p.category === 'Woodwork' || p.name.toLowerCase().includes('mug') || p.name.toLowerCase().includes('board')
    ).slice(0, 3);
    
    if (dadGifts.length > 0) {
      return `🎁 **Perfect gifts for dad!**\n\n${dadGifts.map((g, i) => `${i+1}. **${g.name}** - ${g.category || 'Handmade'} - ${g.price} EGP`).join('\n')}\n\nThese handcrafted items are practical and thoughtful. Which one would he like? 🛍️`;
    }
  }
  
  // Gift for mom
  if (lowerMsg.includes('gift') && (lowerMsg.includes('mom') || lowerMsg.includes('mother'))) {
    const momGifts = cachedProducts.filter(p => 
      p.category === 'Jewelry' || p.category === 'Textiles'
    ).slice(0, 3);
    
    if (momGifts.length > 0) {
      return `💝 **Lovely gifts for mom!**\n\n${momGifts.map((g, i) => `${i+1}. **${g.name}** - ${g.category || 'Handmade'} - ${g.price} EGP`).join('\n')}\n\nThese beautiful pieces will make her feel special! ✨`;
    }
  }
  
  // Gift for friend
  if (lowerMsg.includes('gift') && lowerMsg.includes('friend')) {
    const friendGifts = cachedProducts.slice(0, 4);
    return `🎁 **Great gifts for your friend!**\n\n${friendGifts.map((g, i) => `${i+1}. **${g.name}** - ${g.category || 'Handmade'} - ${g.price} EGP`).join('\n')}\n\nAny of these would make a wonderful surprise! 💝`;
  }
  
  // General gift
  if (lowerMsg.includes('gift')) {
    const topGifts = cachedProducts.slice(0, 4);
    return `🎁 **Popular gifts on Artivio:**\n\n${topGifts.map((g, i) => `${i+1}. **${g.name}** - ${g.category || 'Handmade'} - ${g.price} EGP`).join('\n')}\n\nWho is this gift for? (dad, mom, friend, etc.) I can give better recommendations! 💡`;
  }
  
  // Show all products
  if (lowerMsg.includes('products') || lowerMsg.includes('what do you have') || lowerMsg.includes('show me')) {
    const topProducts = cachedProducts.slice(0, 6);
    return `🛍️ **Our Handmade Products** (${cachedProducts.length} total):\n\n${topProducts.map((p, i) => `${i+1}. **${p.name}** - ${p.category || 'Handmade'} - ${p.price} EGP`).join('\n')}\n\nWant to see a specific category? Ask for "pottery", "jewelry", or "woodwork"! ✨`;
  }
  
  // Show courses
  if (lowerMsg.includes('course') || lowerMsg.includes('learn') || lowerMsg.includes('class')) {
    const topCourses = cachedCourses.slice(0, 5);
    if (topCourses.length > 0) {
      return `📚 **Available Courses** (${cachedCourses.length} total):\n\n${topCourses.map((c, i) => `${i+1}. **${c.title}** - ${c.duration || 0} hours - ${c.price} EGP`).join('\n')}\n\nWhich skill would you like to learn? 🎓`;
    }
  }
  
  // Specific category: pottery
  if (lowerMsg.includes('pottery') || lowerMsg.includes('ceramic')) {
    const pottery = cachedProducts.filter(p => p.category === 'Pottery' || p.name.toLowerCase().includes('pottery')).slice(0, 4);
    if (pottery.length > 0) {
      return `🏺 **Pottery Collection:**\n\n${pottery.map((p, i) => `${i+1}. **${p.name}** - ${p.price} EGP`).join('\n')}\n\nEach piece is hand-thrown by skilled artisans! 🎨`;
    }
  }
  
  // Specific category: jewelry
  if (lowerMsg.includes('jewelry') || lowerMsg.includes('necklace') || lowerMsg.includes('bracelet')) {
    const jewelry = cachedProducts.filter(p => p.category === 'Jewelry').slice(0, 4);
    if (jewelry.length > 0) {
      return `💎 **Jewelry Collection:**\n\n${jewelry.map((p, i) => `${i+1}. **${p.name}** - ${p.price} EGP`).join('\n')}\n\nPerfect for gifts or treating yourself! ✨`;
    }
  }
  
  // Price range
  const priceMatch = lowerMsg.match(/under (\d+)|below (\d+)|less than (\d+)/);
  if (priceMatch) {
    const maxPrice = parseInt(priceMatch[1] || priceMatch[2] || priceMatch[3]);
    const affordable = cachedProducts.filter(p => p.price <= maxPrice).slice(0, 4);
    if (affordable.length > 0) {
      return `💰 **Products under ${maxPrice} EGP:**\n\n${affordable.map((p, i) => `${i+1}. **${p.name}** - ${p.price} EGP`).join('\n')}\n\nGreat budget-friendly options! 🛍️`;
    }
  }
  
  // Hello / welcome
  if (lowerMsg.match(/hello|hi|hey|greetings|good morning|good afternoon/)) {
    return `👋 **Hello! Welcome to Artivio!**\n\nWe have **${cachedProducts.length} handmade products** and **${cachedCourses.length} courses**!\n\n💡 **Try asking:**\n• "Gift for my dad" 🎁\n• "Show me pottery" 🏺\n• "What courses do you have?" 📚\n• "Products under 300 EGP" 💰\n\nHow can I help you today? ✨`;
  }
  
  // Help
  if (lowerMsg.includes('help') || lowerMsg.includes('what can you do')) {
    return `🤖 **I can help you with:**\n\n` +
      `🎁 **Gift Ideas** - "Gift for my dad/mom/friend"\n` +
      `🛍️ **Browse Products** - "Show me pottery/jewelry"\n` +
      `📚 **Courses** - "What courses do you have?"\n` +
      `💰 **Price Range** - "Products under 300 EGP"\n` +
      `📊 **All Products** - "What products do you have?"\n\n` +
      `What would you like to find? 💬`;
  }
  
  // Default
  return `👋 Hi! I'm your Artivio shopping assistant.\n\nWe have **${cachedProducts.length} handmade products** and **${cachedCourses.length} courses**!\n\n💡 **Try asking:**\n• "Gift for my friend" 🎁\n• "Show me jewelry" 💎\n• "What courses do you have?" 📚\n• "Products under 300 EGP" 💰\n\nWhat are you looking for today? 🛍️`;
}

// GET history
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = conversationHistory.get(sessionId);
    res.json({ success: true, messages: history?.messages || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE history
router.delete('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    conversationHistory.delete(sessionId);
    res.json({ success: true, message: 'History cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint
router.get('/test', async (req, res) => {
  // Test Ollama connection
  let ollamaStatus = 'unknown';
  try {
    const test = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
    ollamaStatus = 'connected';
  } catch (e) {
    ollamaStatus = 'not running';
  }
  
  res.json({ 
    success: true, 
    message: 'Chatbot API is running!',
    ollama: ollamaStatus,
    products: cachedProducts.length,
    courses: cachedCourses.length
  });
});

module.exports = router;