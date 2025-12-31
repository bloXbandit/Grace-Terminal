/**
 * Assistant Page API Routes
 * News/Feed, Memories, Calendar, How-tos
 */
const router = require("koa-router")();
const axios = require('axios');

// Import UserMemory model
let UserMemory = null;
try {
  UserMemory = require('@src/models/UserMemory');
} catch (e) {
  console.log('[Assistant] UserMemory model not loaded yet');
}

// NEWS ENDPOINT
router.get("/news", async (ctx) => {
  try {
    const { sources = 'rss', interests = '', limit = 20 } = ctx.query;
    const items = await fetchRSSFeeds();
    ctx.body = { success: true, count: items.length, items: items.slice(0, parseInt(limit)) };
  } catch (error) {
    ctx.status = 500;
    ctx.body = { success: false, error: error.message };
  }
});

// NEWS SOURCES STATUS
router.get("/news/sources", async (ctx) => {
  ctx.body = {
    success: true,
    sources: [
      { id: 'rss', name: 'RSS Feeds', status: 'active', requiresKey: false },
      { id: 'newsapi', name: 'NewsAPI', status: process.env.NEWSAPI_KEY ? 'active' : 'inactive', requiresKey: true },
      { id: 'twitter', name: 'Twitter/X', status: process.env.TWITTER_BEARER_TOKEN ? 'active' : 'inactive', requiresKey: true },
      { id: 'mcp', name: 'MCP Servers', status: 'active', requiresKey: false }
    ]
  };
});

// MEMORIES - GET all
router.get("/memories", async (ctx) => {
  try {
    const userId = ctx.state?.user?.id || 1;
    let memories = [];
    
    if (UserMemory) {
      memories = await UserMemory.findAll({
        where: { user_id: userId },
        order: [['pinned', 'DESC'], ['created_at', 'DESC']],
        limit: 100
      });
    }
    
    ctx.body = {
      success: true,
      count: memories.length,
      memories: memories.map(m => ({
        id: m.id,
        title: m.title,
        content: m.content,
        source: m.source,
        tags: m.tags || [],
        pinned: m.pinned,
        createdAt: m.created_at,
        updatedAt: m.updated_at
      }))
    };
  } catch (error) {
    console.error('[Assistant] Memories fetch error:', error);
    ctx.status = 500;
    ctx.body = { success: false, error: error.message };
  }
});

// MEMORIES - CREATE (manual or from Grace)
router.post("/memories", async (ctx) => {
  try {
    const userId = ctx.state?.user?.id || 1;
    const { title, content, tags, source = 'manual', conversation_id } = ctx.request.body;
    
    if (!title || !content) {
      ctx.status = 400;
      ctx.body = { success: false, error: 'Title and content are required' };
      return;
    }
    
    if (!UserMemory) {
      ctx.status = 500;
      ctx.body = { success: false, error: 'Memory system not initialized' };
      return;
    }
    
    const memory = await UserMemory.create({
      user_id: userId,
      title,
      content,
      source,
      conversation_id: conversation_id || null,
      tags: Array.isArray(tags) ? tags : [],
      pinned: false
    });
    
    console.log(`[Assistant] Memory created: ${memory.id} - "${title}"`);
    
    ctx.body = {
      success: true,
      memory: {
        id: memory.id,
        title: memory.title,
        content: memory.content,
        source: memory.source,
        tags: memory.tags,
        pinned: memory.pinned,
        createdAt: memory.created_at
      }
    };
  } catch (error) {
    console.error('[Assistant] Memory create error:', error);
    ctx.status = 500;
    ctx.body = { success: false, error: error.message };
  }
});

// MEMORIES - UPDATE (pin/unpin, edit)
router.put("/memories/:id", async (ctx) => {
  try {
    const userId = ctx.state?.user?.id || 1;
    const { id } = ctx.params;
    const { title, content, tags, pinned } = ctx.request.body;
    
    if (!UserMemory) {
      ctx.status = 500;
      ctx.body = { success: false, error: 'Memory system not initialized' };
      return;
    }
    
    const memory = await UserMemory.findOne({ where: { id, user_id: userId } });
    if (!memory) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Memory not found' };
      return;
    }
    
    // Update fields if provided
    if (title !== undefined) memory.title = title;
    if (content !== undefined) memory.content = content;
    if (tags !== undefined) memory.tags = tags;
    if (pinned !== undefined) memory.pinned = pinned;
    
    await memory.save();
    
    ctx.body = { success: true, memory };
  } catch (error) {
    console.error('[Assistant] Memory update error:', error);
    ctx.status = 500;
    ctx.body = { success: false, error: error.message };
  }
});

// MEMORIES - DELETE
router.delete("/memories/:id", async (ctx) => {
  try {
    const userId = ctx.state?.user?.id || 1;
    const { id } = ctx.params;
    
    if (!UserMemory) {
      ctx.status = 500;
      ctx.body = { success: false, error: 'Memory system not initialized' };
      return;
    }
    
    const deleted = await UserMemory.destroy({ where: { id, user_id: userId } });
    
    if (deleted === 0) {
      ctx.status = 404;
      ctx.body = { success: false, error: 'Memory not found' };
      return;
    }
    
    ctx.body = { success: true, message: 'Memory deleted' };
  } catch (error) {
    console.error('[Assistant] Memory delete error:', error);
    ctx.status = 500;
    ctx.body = { success: false, error: error.message };
  }
});

// HOW-TOS
router.get("/howtos", async (ctx) => {
  ctx.body = {
    success: true,
    howtos: [
      { id: 'quick-start', title: 'Quick Start', icon: '🚀', content: 'Type naturally to chat with Grace.' },
      { id: 'file-gen', title: 'Generate Files', icon: '📄', content: 'Ask Grace to create docs, spreadsheets, code.' },
      { id: 'image-gen', title: 'Create Images', icon: '🎨', content: 'Example: "Make a photo of a sunset"' },
      { id: 'video-gen', title: 'Create Videos', icon: '🎬', content: 'Example: "Create a 4 second video of..."' },
      { id: 'code', title: 'Run Code', icon: '💻', content: 'Grace can write and execute Python.' },
      { id: 'research', title: 'Web Research', icon: '🔍', content: 'Ask Grace to search for current info.' },
      { id: 'memory', title: 'Memories', icon: '🧠', content: 'Say "Remember that..." to save context.' },
      { id: 'voice', title: 'Voice Mode', icon: '🎤', content: 'Use mic button to speak to Grace.' }
    ]
  };
});

// CALENDAR STATUS (placeholder)
router.get("/calendar/status", async (ctx) => {
  ctx.body = { success: true, connected: false, message: 'Google Calendar integration coming soon' };
});

// RSS Helper - fetches and sorts by actual publish date
async function fetchRSSFeeds() {
  const items = [];
  try {
    const res = await axios.get('https://hnrss.org/frontpage', { timeout: 5000 });
    const matches = res.data.match(/<item>([\s\S]*?)<\/item>/gi) || [];
    for (const xml of matches.slice(0, 15)) {
      const title = (xml.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
      const link = (xml.match(/<link>(.*?)<\/link>/i) || [])[1] || '';
      const pubDateRaw = (xml.match(/<pubDate>(.*?)<\/pubDate>/i) || [])[1] || '';
      
      // Parse actual pubDate from RSS
      let publishedAt = new Date().toISOString();
      if (pubDateRaw) {
        const parsed = new Date(pubDateRaw);
        if (!isNaN(parsed.getTime())) {
          publishedAt = parsed.toISOString();
        }
      }
      
      items.push({
        source: 'Hacker News',
        title: title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'),
        url: link,
        publishedAt
      });
    }
    
    // Sort by date - newest first
    items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    
  } catch (e) { console.error('[RSS]', e.message); }
  return items;
}

module.exports = exports = router.routes();
