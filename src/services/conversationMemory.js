const { ConversationMemory } = require('@src/models');
const Message = require('@src/models/Message');
const { Op } = require('sequelize');
const call = require('@src/utils/llm');

/**
 * Conversation Memory Service
 * Handles summarization, compression, and retrieval of long conversation history
 */

/**
 * Summarize a batch of messages into a compressed memory
 */
const summarizeMessageBatch = async (messages, conversation_id) => {
  if (!messages || messages.length === 0) {
    return null;
  }

  try {
    // Build prompt for summarization
    const messageText = messages.map((m, i) => 
      `[${i + 1}] ${m.role}: ${m.content}`
    ).join('\n');

    const prompt = `Summarize the following conversation segment concisely, preserving key information, decisions, and context:

${messageText}

Provide a concise summary (2-3 sentences) that captures:
1. Main topics discussed
2. Key decisions or actions taken
3. Important context for future reference

Summary:`;

    const context = {
      messages: [
        { role: 'system', content: 'You are a conversation summarization expert. Create concise, information-dense summaries.' },
        { role: 'user', content: prompt }
      ]
    };

    const result = await call.completion('', context, {
      temperature: 0.3,
      max_tokens: 200
    });

    const summary = result.trim();

    // Calculate importance score based on message characteristics
    const hasUserQuestions = messages.some(m => m.role === 'user' && m.content.includes('?'));
    const hasFiles = messages.some(m => m.content && (m.content.includes('.docx') || m.content.includes('.xlsx')));
    const hasDecisions = messages.some(m => m.content && (m.content.includes('decided') || m.content.includes('will')));
    
    let importanceScore = 0.5;
    if (hasUserQuestions) importanceScore += 0.1;
    if (hasFiles) importanceScore += 0.2;
    if (hasDecisions) importanceScore += 0.2;
    importanceScore = Math.min(importanceScore, 1.0);

    // Store the summary
    await ConversationMemory.create({
      conversation_id,
      memory_type: 'summary',
      content: summary,
      message_range_start: messages[0].id,
      message_range_end: messages[messages.length - 1].id,
      importance_score: importanceScore,
      metadata: {
        message_count: messages.length,
        has_files: hasFiles,
        has_decisions: hasDecisions
      }
    });

    console.log(`[Memory] Created summary for ${messages.length} messages (importance: ${importanceScore.toFixed(2)})`);
    return summary;

  } catch (error) {
    console.error('[Memory] Failed to summarize messages:', error.message);
    return null;
  }
};

/**
 * Auto-summarize old messages when conversation gets long
 */
const autoSummarizeIfNeeded = async (conversation_id) => {
  try {
    // Count total messages
    const totalMessages = await Message.count({
      where: { conversation_id }
    });

    // Only summarize if we have more than 30 messages
    if (totalMessages < 30) {
      return;
    }

    // Check if we already have summaries
    const existingSummaries = await ConversationMemory.findAll({
      where: { 
        conversation_id,
        memory_type: 'summary'
      },
      order: [['message_range_end', 'DESC']],
      limit: 1
    });

    // Determine where to start summarizing
    let startFromMessageId = 1;
    if (existingSummaries.length > 0) {
      startFromMessageId = existingSummaries[0].message_range_end + 1;
    }

    // Get messages that need summarizing (exclude last 20 messages - keep them fresh)
    const messages = await Message.findAll({
      where: {
        conversation_id,
        id: {
          [Op.gte]: startFromMessageId,
          [Op.lte]: totalMessages - 20 // Keep last 20 messages unsummarized
        }
      },
      order: [['id', 'ASC']],
      limit: 50 // Summarize in batches of 50
    });

    if (messages.length >= 10) {
      // Only summarize if we have at least 10 messages
      await summarizeMessageBatch(messages, conversation_id);
      console.log(`[Memory] Auto-summarized ${messages.length} old messages`);
    }

  } catch (error) {
    console.error('[Memory] Auto-summarization failed:', error.message);
  }
};

/**
 * Get hierarchical context: recent messages + summaries + relevant memories
 */
const getHierarchicalContext = async (conversation_id, currentMessage = '', limit = 20) => {
  try {
    // 1. Get recent messages (full detail)
    const recentMessages = await Message.findAll({
      where: { conversation_id },
      order: [['id', 'DESC']],
      limit: limit
    });

    // 2. Get older summaries
    const summaries = await ConversationMemory.findAll({
      where: {
        conversation_id,
        memory_type: 'summary',
        message_range_end: {
          [Op.lt]: recentMessages.length > 0 ? recentMessages[recentMessages.length - 1].id : 999999
        }
      },
      order: [['importance_score', 'DESC'], ['created_at', 'DESC']],
      limit: 5 // Top 5 most important summaries
    });

    // 3. Get key facts and decisions
    const keyMemories = await ConversationMemory.findAll({
      where: {
        conversation_id,
        memory_type: {
          [Op.in]: ['key_fact', 'decision', 'context']
        }
      },
      order: [['importance_score', 'DESC']],
      limit: 10
    });

    // Format for context
    const context = {
      recentMessages: recentMessages.reverse().map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.create_at
      })),
      summaries: summaries.map(s => ({
        content: s.content,
        importance: s.importance_score,
        messageRange: `${s.message_range_start}-${s.message_range_end}`
      })),
      keyMemories: keyMemories.map(m => ({
        type: m.memory_type,
        content: m.content,
        importance: m.importance_score
      }))
    };

    return context;

  } catch (error) {
    console.error('[Memory] Failed to get hierarchical context:', error.message);
    // Fallback: just return recent messages
    const recentMessages = await Message.findAll({
      where: { conversation_id },
      order: [['id', 'DESC']],
      limit: limit
    });

    return {
      recentMessages: recentMessages.reverse().map(m => ({
        role: m.role,
        content: m.content
      })),
      summaries: [],
      keyMemories: []
    };
  }
};

/**
 * Format hierarchical context into a prompt-friendly string
 */
const formatContextForPrompt = (hierarchicalContext) => {
  let contextString = '';

  // Add summaries first (older context)
  if (hierarchicalContext.summaries && hierarchicalContext.summaries.length > 0) {
    contextString += '**CONVERSATION HISTORY (SUMMARIZED):**\n';
    hierarchicalContext.summaries.forEach((summary, i) => {
      contextString += `${i + 1}. ${summary.content}\n`;
    });
    contextString += '\n';
  }

  // Add key memories
  if (hierarchicalContext.keyMemories && hierarchicalContext.keyMemories.length > 0) {
    contextString += '**KEY FACTS & DECISIONS:**\n';
    hierarchicalContext.keyMemories.forEach((memory, i) => {
      contextString += `- ${memory.content}\n`;
    });
    contextString += '\n';
  }

  // Recent messages are handled separately (full message array)
  return contextString;
};

/**
 * Store a key fact or decision for long-term memory
 */
const storeKeyMemory = async (conversation_id, content, type = 'key_fact', importance = 0.8) => {
  try {
    await ConversationMemory.create({
      conversation_id,
      memory_type: type,
      content,
      importance_score: importance,
      metadata: {
        extracted_at: new Date()
      }
    });

    console.log(`[Memory] Stored ${type}: ${content.substring(0, 50)}...`);
  } catch (error) {
    console.error('[Memory] Failed to store key memory:', error.message);
  }
};

module.exports = {
  summarizeMessageBatch,
  autoSummarizeIfNeeded,
  getHierarchicalContext,
  formatContextForPrompt,
  storeKeyMemory
};
