const UserMemory = require('@src/models/UserMemory');

/**
 * Get relevant memories for a user query
 * @param {number} user_id - User ID
 * @param {string} query - User's query
 * @param {number} limit - Maximum number of memories to return
 * @returns {Promise<Array>} Array of relevant memories
 */
async function getRelevantMemories(user_id, query, limit = 5) {
  try {
    const lowerQuery = query.toLowerCase();
    
    // Keywords to search for
    const keywords = [];
    
    // Extract potential keywords from query
    const words = lowerQuery.split(/\s+/).filter(w => w.length > 3);
    keywords.push(...words);
    
    // Get all memories for the user
    const memories = await UserMemory.findAll({
      where: { user_id },
      order: [
        ['pinned', 'DESC'],  // Pinned first
        ['created_at', 'DESC']  // Then by recency
      ]
    });
    
    if (memories.length === 0) {
      return [];
    }
    
    // Score each memory by relevance
    const scoredMemories = memories.map(memory => {
      let score = 0;
      const contentLower = memory.content.toLowerCase();
      const titleLower = memory.title.toLowerCase();
      
      // Check for keyword matches
      keywords.forEach(keyword => {
        if (contentLower.includes(keyword)) score += 2;
        if (titleLower.includes(keyword)) score += 3;
      });
      
      // Check for tag matches
      if (memory.tags && Array.isArray(memory.tags)) {
        memory.tags.forEach(tag => {
          if (lowerQuery.includes(tag.toLowerCase())) score += 5;
        });
      }
      
      // Boost pinned memories
      if (memory.pinned) score += 10;
      
      // Boost recent memories slightly
      const daysSinceCreated = (Date.now() - new Date(memory.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated < 7) score += 2;
      else if (daysSinceCreated < 30) score += 1;
      
      return { memory, score };
    });
    
    // Filter out memories with score 0 and sort by score
    const relevantMemories = scoredMemories
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ memory }) => memory);
    
    return relevantMemories;
    
  } catch (error) {
    console.error('[UserMemory Service] Error getting relevant memories:', error);
    return [];
  }
}

/**
 * Format memories as context string for agent
 * @param {Array} memories - Array of UserMemory objects
 * @returns {string} Formatted context string
 */
function formatMemoriesAsContext(memories) {
  if (!memories || memories.length === 0) {
    return '';
  }
  
  let context = '## My Assistant Memories:\n';
  memories.forEach((memory, index) => {
    const tags = memory.tags && memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : '';
    context += `${index + 1}. ${memory.content}${tags}\n`;
  });
  context += '\n';
  
  return context;
}

/**
 * Get memory context for agent based on user query
 * @param {number} user_id - User ID
 * @param {string} query - User's query
 * @returns {Promise<string>} Formatted memory context
 */
async function getMemoryContext(user_id, query) {
  const memories = await getRelevantMemories(user_id, query, 5);
  return formatMemoriesAsContext(memories);
}

module.exports = {
  getRelevantMemories,
  formatMemoriesAsContext,
  getMemoryContext
};
