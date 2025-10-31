const path = require('path');
const { getDirpath } = require('@src/utils/electron');
const { getAllFilesRecursively } = require('@src/agent/fileUtils');
const File = require('@src/models/File');
const Task = require('@src/models/Task');
const Message = require('@src/models/Message');
const { Op } = require('sequelize');
const { 
  autoSummarizeIfNeeded, 
  getHierarchicalContext,
  formatContextForPrompt 
} = require('@src/services/conversationMemory');

/**
 * Unified Conversation Context Manager
 * 
 * Builds context once per request and provides specialized views for:
 * - Routing (MultiAgentCoordinator)
 * - Planning (thinking/planning phase)
 * - Specialists (specialist calls)
 * - Execution (task execution)
 * 
 * Features:
 * - Per-request caching (no duplicate queries)
 * - Incremental updates (add file/task without rebuild)
 * - Manual invalidation (force refresh)
 * - Graceful error handling (partial context on failure)
 */
class ConversationContext {
  constructor(context = {}) {
    // Follow Grace's existing pattern: context object, not separate params
    this.conversationId = context.conversation_id;
    this.userId = context.user_id;
    
    // Validate required fields
    if (!this.conversationId) {
      throw new Error('[ConversationContext] conversation_id is required');
    }
    if (!this.userId) {
      throw new Error('[ConversationContext] user_id is required');
    }
    
    // Initialize cache
    this.cache = {
      files: null,
      tasks: null,
      messages: null,
      profile: null,
      requestId: null,
      lastUpdated: null
    };
    
    console.log(`[ConversationContext] Initialized for conversation ${this.conversationId.slice(0, 8)}`);
  }

  /**
   * Build complete context with per-request caching
   * @param {Object} options - Build options
   * @param {string} options.requestId - Unique request ID for caching
   * @param {boolean} options.forceRefresh - Force rebuild even if cached
   * @returns {Object} Complete context object
   */
  async build(options = {}) {
    const { requestId, forceRefresh = false } = options;
    
    try {
      // Per-request caching: If same request, return cached
      if (!forceRefresh && requestId && this.cache.requestId === requestId) {
        console.log('[ConversationContext] Using cached context for request:', requestId);
        return this._buildContextObject();
      }
      
      // Build fresh context
      const buildStart = Date.now();
      console.log('[ConversationContext] Building fresh context...');
      
      // Load all context data in parallel (with error handling)
      const [files, tasks, messages, profile] = await Promise.all([
        this._loadFiles().catch(e => {
          console.error('[ConversationContext] File load failed:', e.message);
          return [];
        }),
        this._loadTasks().catch(e => {
          console.error('[ConversationContext] Task load failed:', e.message);
          return [];
        }),
        this._loadMessages().catch(e => {
          console.error('[ConversationContext] Message load failed:', e.message);
          return [];
        }),
        this._loadProfile().catch(e => {
          console.error('[ConversationContext] Profile load failed:', e.message);
          return null;
        })
      ]);
      
      // Cache results
      this.cache = {
        files,
        tasks,
        messages,
        profile,
        requestId,
        lastUpdated: Date.now()
      };
      
      const buildTime = Date.now() - buildStart;
      console.log(`[ConversationContext] Built context in ${buildTime}ms:`, {
        files: files.length,
        tasks: tasks.length,
        messages: messages.length,
        hasProfile: !!profile
      });
      
      return this._buildContextObject();
      
    } catch (error) {
      console.error('[ConversationContext] Build failed:', error);
      // Return minimal context instead of crashing
      return this._buildMinimalContext();
    }
  }

  /**
   * Load files from database (synced with filesystem via FileRegistry later)
   */
  async _loadFiles() {
    const files = await File.findAll({
      where: { conversation_id: this.conversationId },
      order: [['create_at', 'DESC']]
    });
    
    return files.map(f => ({
      file_name: f.name,
      file_path: f.url,
      file_type: path.extname(f.name),
      created_at: f.create_at
    }));
  }

  /**
   * Load tasks from database
   */
  async _loadTasks() {
    const tasks = await Task.findAll({
      where: { conversation_id: this.conversationId },
      order: [['id', 'ASC']]
    });
    
    return tasks.map(t => ({
      id: t.task_id,
      title: t.requirement,
      status: t.status,
      error: t.error,
      result: t.result,
      memorized: t.memorized
    }));
  }

  /**
   * Load recent messages from database with smart context management
   * - Short conversations (<100 msgs): Load all
   * - Long conversations (100+ msgs): Load recent 30 + important context
   */
  async _loadMessages() {
    // Get total message count
    const totalCount = await Message.count({
      where: {
        conversation_id: this.conversationId,
        role: { [Op.ne]: 'system' },
        status: 'success'
      }
    });
    
    console.log(`[ConversationContext] Total messages: ${totalCount}`);
    
    // Strategy based on conversation length
    if (totalCount <= 100) {
      // Short conversation: Load all messages
      console.log('[ConversationContext] Loading all messages (≤100)');
      const messages = await Message.findAll({
        where: {
          conversation_id: this.conversationId,
          role: { [Op.ne]: 'system' },
          status: 'success'
        },
        order: [['create_at', 'ASC']]
      });
      
      return messages.map(m => ({
        role: m.role,
        content: m.content,
        meta: m.meta ? JSON.parse(m.meta) : {},
        memorized: m.memorized,
        created_at: m.create_at
      }));
    } else {
      // Long conversation: Load recent 30 + important context
      console.log('[ConversationContext] Loading recent 30 messages + important context (>100)');
      const recentMessages = await Message.findAll({
        where: {
          conversation_id: this.conversationId,
          role: { [Op.ne]: 'system' },
          status: 'success'
        },
        order: [['create_at', 'DESC']],
        limit: 30
      });
      
      // Load important context (e.g., summaries, key memories)
      const importantContext = await Message.findAll({
        where: {
          conversation_id: this.conversationId,
          role: { [Op.ne]: 'system' },
          status: 'success',
          memorized: true
        },
        order: [['create_at', 'ASC']]
      });
      
      // Combine recent and important messages
      const messages = [...recentMessages, ...importantContext];
      
      return messages.map(m => ({
        role: m.role,
        content: m.content,
        meta: m.meta ? JSON.parse(m.meta) : {},
        memorized: m.memorized,
        created_at: m.create_at
      }));
    }
  }

  /**
   * Load user profile from database
   */
  async _loadProfile() {
    try {
      const UserProfile = require('@src/models/UserProfile');
      const profiles = await UserProfile.findAll({
        where: { user_id: this.userId }
      });
      
      if (!profiles || profiles.length === 0) {
        return null;
      }
      
      // Convert to key-value object
      const profileData = {};
      profiles.forEach(p => {
        profileData[p.key] = p.value;
      });
      
      return profileData;
    } catch (error) {
      console.error('[ConversationContext] Profile model not found or error:', error.message);
      return null;
    }
  }

  /**
   * Detect previous implementation method from recent messages
   * Scans for code patterns (Pillow, matplotlib, pandas, etc.)
   */
  async _detectPreviousImplementation() {
    const recentMessages = this.cache.messages?.slice(-10) || [];
    
    for (const msg of recentMessages.reverse()) {
      const code = msg.memorized || msg.content || '';
      
      // Detect Pillow/PIL image creation (strong match)
      const hasPIL = code.includes('PIL') || code.includes('from PIL');
      const hasImageOps = code.includes('Image.new') || code.includes('ImageDraw');
      if (hasPIL && hasImageOps) {
        return {
          method: 'Used Pillow/PIL to create image files',
          confidence: 'high',
          library: 'Pillow'
        };
      }
      
      // Detect matplotlib visualization
      const hasMatplotlib = code.includes('matplotlib') || code.includes('import matplotlib');
      const hasPlot = code.includes('plt.') || code.includes('pyplot');
      if (hasMatplotlib && hasPlot) {
        return {
          method: 'Used matplotlib for data visualization',
          confidence: 'high',
          library: 'matplotlib'
        };
      }
      
      // Detect pandas data processing
      const hasPandas = code.includes('pandas') || code.includes('import pandas');
      const hasDataFrame = code.includes('DataFrame') || code.includes('pd.');
      if (hasPandas && hasDataFrame) {
        return {
          method: 'Used pandas for data processing',
          confidence: 'high',
          library: 'pandas'
        };
      }
      
      // Detect python-docx document creation
      const hasDocx = code.includes('python-docx') || code.includes('from docx');
      const hasDocument = code.includes('Document(');
      if (hasDocx && hasDocument) {
        return {
          method: 'Used python-docx for Word document creation',
          confidence: 'high',
          library: 'python-docx'
        };
      }
      
      // Detect openpyxl/xlsxwriter for Excel
      const hasExcel = code.includes('openpyxl') || code.includes('xlsxwriter');
      const hasWorkbook = code.includes('Workbook') || code.includes('load_workbook');
      if (hasExcel && hasWorkbook) {
        return {
          method: 'Used openpyxl/xlsxwriter for Excel file creation',
          confidence: 'high',
          library: 'openpyxl'
        };
      }
    }
    
    return null;
  }

  /**
   * Get context for routing phase (MultiAgentCoordinator)
   */
  getRoutingContext() {
    return {
      hasFiles: (this.cache.files?.length || 0) > 0,
      files: this.cache.files || [],
      mostRecentFile: this.cache.files?.[0]?.file_name || null,
      recentMessages: this.cache.messages?.slice(-10) || [],
      previousImplementation: this._detectPreviousImplementationSync(),
      profile: this.cache.profile,
      isFollowUp: this._detectFollowUp()
    };
  }

  /**
   * Get context for planning phase
   */
  getPlanningContext() {
    return {
      files: this.cache.files || [],
      tasks: this.cache.tasks || [],
      recentMessages: this.cache.messages?.slice(-5) || [],
      profile: this.cache.profile,
      previousResult: this._getLastTaskResult()
    };
  }

  /**
   * Get context for specialists
   */
  getSpecialistContext() {
    return {
      files: this.cache.files || [],
      profile: this.cache.profile,
      profileContext: this._formatProfileContext(),
      taskHistory: this.cache.tasks || [],
      previousImplementation: this._detectPreviousImplementationSync()
    };
  }

  /**
   * Get context for task execution
   */
  getExecutionContext() {
    return {
      files: this.cache.files || [],
      tasks: this.cache.tasks || [],
      profile: this.cache.profile,
      conversationDir: this._getConversationDir()
    };
  }

  /**
   * Get hierarchical context for long conversations
   * Includes: recent messages + summaries + key memories
   */
  async getHierarchicalContext(currentMessage = '', limit = 20) {
    try {
      // Auto-summarize if needed (async, non-blocking)
      autoSummarizeIfNeeded(this.conversationId).catch(e => {
        console.error('[ConversationContext] Auto-summarization failed:', e.message);
      });

      // Get hierarchical context
      const hierarchicalContext = await getHierarchicalContext(
        this.conversationId,
        currentMessage,
        limit
      );

      return hierarchicalContext;
    } catch (error) {
      console.error('[ConversationContext] Failed to get hierarchical context:', error.message);
      // Fallback to cached messages
      return {
        recentMessages: this.cache.messages?.slice(-limit) || [],
        summaries: [],
        keyMemories: []
      };
    }
  }

  /**
   * Format hierarchical context for prompt injection
   */
  async getHierarchicalContextString(currentMessage = '') {
    const hierarchicalContext = await this.getHierarchicalContext(currentMessage);
    return formatContextForPrompt(hierarchicalContext);
  }

  /**
   * Synchronous version of _detectPreviousImplementation (uses cached messages)
   */
  _detectPreviousImplementationSync() {
    const recentMessages = this.cache.messages?.slice(-10) || [];
    
    for (const msg of recentMessages.reverse()) {
      const code = msg.memorized || msg.content || '';
      
      if ((code.includes('PIL') || code.includes('from PIL')) && 
          (code.includes('Image.new') || code.includes('ImageDraw'))) {
        return { method: 'Used Pillow/PIL to create image files', confidence: 'high', library: 'Pillow' };
      }
      
      if ((code.includes('matplotlib') || code.includes('import matplotlib')) && 
          (code.includes('plt.') || code.includes('pyplot'))) {
        return { method: 'Used matplotlib for data visualization', confidence: 'high', library: 'matplotlib' };
      }
      
      if ((code.includes('pandas') || code.includes('import pandas')) && 
          (code.includes('DataFrame') || code.includes('pd.'))) {
        return { method: 'Used pandas for data processing', confidence: 'high', library: 'pandas' };
      }
      
      if ((code.includes('python-docx') || code.includes('from docx')) && 
          code.includes('Document(')) {
        return { method: 'Used python-docx for Word document creation', confidence: 'high', library: 'python-docx' };
      }
      
      if ((code.includes('openpyxl') || code.includes('xlsxwriter')) && 
          (code.includes('Workbook') || code.includes('load_workbook'))) {
        return { method: 'Used openpyxl/xlsxwriter for Excel file creation', confidence: 'high', library: 'openpyxl' };
      }
    }
    
    return null;
  }

  /**
   * Detect if current message is a follow-up (contains pronouns like "it", "the document", etc.)
   */
  _detectFollowUp() {
    const recentMessages = this.cache.messages?.slice(-3) || [];
    if (recentMessages.length === 0) return false;
    
    const lastUserMessage = recentMessages.reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return false;
    
    const content = lastUserMessage.content?.toLowerCase() || '';
    const followUpIndicators = ['it', 'that', 'this', 'the document', 'the file', 'them', 'those'];
    
    return followUpIndicators.some(indicator => content.includes(indicator));
  }

  /**
   * Get last task result
   */
  _getLastTaskResult() {
    const completedTasks = this.cache.tasks?.filter(t => t.status === 'completed') || [];
    if (completedTasks.length === 0) return null;
    
    const lastTask = completedTasks[completedTasks.length - 1];
    return lastTask.result || lastTask.memorized || null;
  }

  /**
   * Format profile context for display
   */
  _formatProfileContext() {
    if (!this.cache.profile) return '';
    
    const entries = Object.entries(this.cache.profile)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');
    
    return entries ? `**User Profile:**\n${entries}` : '';
  }

  /**
   * Get conversation directory path (follows Grace's pattern)
   */
  _getConversationDir() {
    const dir_name = 'Conversation_' + this.conversationId.slice(0, 6);
    const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', this.userId);
    return path.join(WORKSPACE_DIR, dir_name);
  }

  /**
   * Build complete context object
   */
  _buildContextObject() {
    return {
      files: this.cache.files || [],
      tasks: this.cache.tasks || [],
      messages: this.cache.messages || [],
      profile: this.cache.profile,
      conversationDir: this._getConversationDir(),
      cached: !!this.cache.requestId
    };
  }

  /**
   * Search old messages on-demand (for "remember when..." queries)
   * Uses simple keyword matching - no embeddings needed
   * @param {string} query - Search query
   * @returns {Promise<Array>} Relevant old messages
   */
  async searchOldMessages(query) {
    try {
      console.log(`[ConversationContext] Searching old messages for: "${query}"`);
      
      // Extract keywords (words longer than 3 chars)
      const keywords = query.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3 && !['that', 'this', 'when', 'what', 'where', 'remember'].includes(w));
      
      if (keywords.length === 0) {
        console.log('[ConversationContext] No valid keywords found');
        return [];
      }
      
      console.log('[ConversationContext] Keywords:', keywords);
      
      // Search for messages containing any of the keywords
      const relevantMessages = await Message.findAll({
        where: {
          conversation_id: this.conversationId,
          role: { [Op.ne]: 'system' },
          status: 'success',
          [Op.or]: keywords.map(keyword => ({
            content: { [Op.like]: `%${keyword}%` }
          }))
        },
        order: [['create_at', 'DESC']],
        limit: 10
      });
      
      console.log(`[ConversationContext] Found ${relevantMessages.length} relevant messages`);
      
      return relevantMessages.map(m => ({
        role: m.role,
        content: m.content,
        meta: m.meta ? JSON.parse(m.meta) : {},
        memorized: m.memorized,
        created_at: m.create_at
      }));
    } catch (error) {
      console.error('[ConversationContext] Search error:', error);
      return [];
    }
  }

  /**
   * Build minimal context on error (prevents crashes)
   */
  _buildMinimalContext() {
    return {
      files: [],
      tasks: [],
      messages: [],
      profile: null,
      conversationDir: this._getConversationDir(),
      cached: false,
      error: true
    };
  }

  /**
   * Invalidate cache (force rebuild on next request)
   */
  invalidate() {
    console.log('[ConversationContext] Cache invalidated');
    this.cache.requestId = null;
    this.cache.lastUpdated = null;
  }

  /**
   * Incremental update (add item without full rebuild)
   * @param {string} type - Type of update: 'file', 'task', 'message'
   * @param {Object} data - Data to add
   */
  async incrementalUpdate(type, data) {
    if (!this.cache.requestId) {
      console.warn('[ConversationContext] Cannot update - no context built yet');
      return;
    }
    
    if (type === 'file' && this.cache.files) {
      this.cache.files.push(data);
      console.log('[ConversationContext] Added file to cache:', data.file_name);
    } else if (type === 'task' && this.cache.tasks) {
      this.cache.tasks.push(data);
      console.log('[ConversationContext] Added task to cache:', data.id);
    } else if (type === 'message' && this.cache.messages) {
      this.cache.messages.push(data);
      console.log('[ConversationContext] Added message to cache');
    }
    
    this.cache.lastUpdated = Date.now();
  }
}

module.exports = ConversationContext;
