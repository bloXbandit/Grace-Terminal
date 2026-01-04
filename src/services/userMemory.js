const UserMemory = require('@src/models/UserMemory');
const { Op } = require('sequelize');

/**
 * User Memory Service
 * Handles retrieval and formatting of explicit user memories for recall in conversations
 */

/**
 * Get all memories for a user
 */
const getAllMemories = async (user_id, options = {}) => {
  try {
    const { limit = 50, tags = null, pinned = null } = options;
    
    const where = { user_id };
    
    if (tags && Array.isArray(tags) && tags.length > 0) {
      // Filter by tags (JSON array contains any of the specified tags)
      where.tags = {
        [Op.contains]: tags
      };
    }
    
    if (pinned !== null) {
      where.pinned = pinned;
    }
    
    const memories = await UserMemory.findAll({
      where,
      order: [['pinned', 'DESC'], ['created_at', 'DESC']],
      limit
    });
    
    return memories;
  } catch (error) {
    console.error('[UserMemory] Error fetching memories:', error.message);
    return [];
  }
};

/**
 * Smart memory scoring and retrieval
 * Scores memories by relevance to query using multiple factors
 */
const getRelevantMemories = async (user_id, query, options = {}) => {
  try {
    const { limit = 5 } = options;
    
    // Get all user memories
    const allMemories = await UserMemory.findAll({
      where: { user_id }
    });
    
    if (allMemories.length === 0) {
      return [];
    }
    
    // Extract keywords from query (remove common words)
    const stopWords = ['do', 'i', 'have', 'any', 'what', 'when', 'where', 'who', 'how', 'is', 'are', 'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'at'];
    const keywords = query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    console.log('[UserMemory] Scoring memories with keywords:', keywords);
    
    // Score each memory
    const scoredMemories = allMemories.map(memory => {
      let score = 0;
      const content = memory.content.toLowerCase();
      const title = memory.title.toLowerCase();
      const tags = memory.tags || [];
      
      // Keyword matches in content (+2 per match)
      keywords.forEach(keyword => {
        const contentMatches = (content.match(new RegExp(keyword, 'g')) || []).length;
        score += contentMatches * 2;
      });
      
      // Keyword matches in title (+3 per match)
      keywords.forEach(keyword => {
        const titleMatches = (title.match(new RegExp(keyword, 'g')) || []).length;
        score += titleMatches * 3;
      });
      
      // Tag matches (+5 per match)
      keywords.forEach(keyword => {
        tags.forEach(tag => {
          if (tag.toLowerCase().includes(keyword)) {
            score += 5;
          }
        });
      });
      
      // Pinned status (+10)
      if (memory.pinned) {
        score += 10;
      }
      
      // Recency bonus
      const daysSinceCreated = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated < 7) {
        score += 2; // Recent (< 7 days)
      } else if (daysSinceCreated < 30) {
        score += 1; // Somewhat recent (< 30 days)
      }
      
      return {
        memory,
        score,
        daysSinceCreated: Math.floor(daysSinceCreated)
      };
    });
    
    // Sort by score (highest first) and return top N
    const topMemories = scoredMemories
      .filter(m => m.score > 0) // Only return memories with some relevance
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(m => {
        console.log(`[UserMemory] Memory scored ${m.score}: "${m.memory.title}" (${m.daysSinceCreated}d ago)`);
        return m.memory;
      });
    
    console.log(`[UserMemory] Found ${topMemories.length} relevant memories (from ${allMemories.length} total)`);
    return topMemories;
    
  } catch (error) {
    console.error('[UserMemory] Error scoring memories:', error.message);
    return [];
  }
};

/**
 * Search memories by content or tags (simple search, no scoring)
 */
const searchMemories = async (user_id, query, options = {}) => {
  try {
    const { limit = 20 } = options;
    
    const memories = await UserMemory.findAll({
      where: {
        user_id,
        [Op.or]: [
          { content: { [Op.like]: `%${query}%` } },
          { title: { [Op.like]: `%${query}%` } }
        ]
      },
      order: [['pinned', 'DESC'], ['created_at', 'DESC']],
      limit
    });
    
    return memories;
  } catch (error) {
    console.error('[UserMemory] Error searching memories:', error.message);
    return [];
  }
};

/**
 * Get memory context for system prompt
 * Returns formatted string of user's saved memories
 */
const getMemoryContext = async (user_id, options = {}) => {
  try {
    const { limit = 20, relevantOnly = false, query = '' } = options;
    
    let memories;
    
    if (relevantOnly && query) {
      // Search for relevant memories based on current query
      memories = await searchMemories(user_id, query, { limit: 10 });
    } else {
      // Get recent memories (pinned first)
      memories = await getAllMemories(user_id, { limit });
    }
    
    console.log(`[UserMemory] Loading memories for user ${user_id}: ${memories.length} found`);
    
    if (memories.length === 0) {
      console.log('[UserMemory] No memories found - returning empty context');
      return '';
    }
    
    // Format memories for context
    const memoryLines = memories.map(m => {
      const tags = m.tags && m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
      const pinned = m.pinned ? ' 📌' : '';
      return `- ${m.content}${tags}${pinned}`;
    }).join('\n');
    
    const context = `\n## User's Saved Memories:\n${memoryLines}\n`;
    console.log('[UserMemory] Memory context loaded:', memories.length, 'memories');
    return context;
    
  } catch (error) {
    console.error('[UserMemory] Error formatting memory context:', error.message);
    return '';
  }
};

/**
 * Get specific memory by ID
 */
const getMemoryById = async (user_id, memory_id) => {
  try {
    return await UserMemory.findOne({
      where: { id: memory_id, user_id }
    });
  } catch (error) {
    console.error('[UserMemory] Error fetching memory by ID:', error.message);
    return null;
  }
};

/**
 * Format memories for natural language response
 * Used when user explicitly asks "what do you remember about..."
 */
const formatMemoriesForResponse = (memories) => {
  if (!memories || memories.length === 0) {
    return "I don't have any saved memories about that yet.";
  }
  
  if (memories.length === 1) {
    return `I remember: ${memories[0].content}`;
  }
  
  const items = memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n');
  return `I have ${memories.length} memories about that:\n${items}`;
};

module.exports = {
  getAllMemories,
  searchMemories,
  getRelevantMemories,
  getMemoryContext,
  getMemoryById,
  formatMemoriesForResponse
};
