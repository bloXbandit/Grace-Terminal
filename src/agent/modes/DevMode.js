require('module-alias/register');
const Conversation = require('@src/models/Conversation');

/**
 * DevMode - Manages Developer Mode for safe self-modification
 * Prevents accidental code changes during normal conversations
 */
class DevMode {
  constructor() {
    this.MODE_NORMAL = 'normal';
    this.MODE_DEV = 'dev';
  }

  /**
   * Check if conversation is in dev mode
   * @param {string} conversationId - Conversation ID
   * @returns {boolean} - Whether in dev mode
   */
  async isDevMode(conversationId) {
    try {
      const conversation = await Conversation.findOne({
        where: { conversation_id: conversationId }
      });

      if (!conversation) {
        return false;
      }

      // Check metadata for dev_mode flag
      const metadata = conversation.metadata || {};
      return metadata.dev_mode === true;
    } catch (error) {
      console.error('❌ [DevMode] Check failed:', error);
      return false;
    }
  }

  /**
   * Enable dev mode for conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Object} - Result
   */
  async enable(conversationId) {
    try {
      const conversation = await Conversation.findOne({
        where: { conversation_id: conversationId }
      });

      if (!conversation) {
        return {
          success: false,
          error: 'Conversation not found'
        };
      }

      const metadata = conversation.metadata || {};
      metadata.dev_mode = true;
      metadata.dev_mode_activated_at = new Date().toISOString();

      await Conversation.update(
        { metadata },
        { where: { conversation_id: conversationId } }
      );

      console.log(`🔧 [DevMode] Enabled for conversation: ${conversationId}`);

      return {
        success: true,
        mode: this.MODE_DEV,
        message: `🔧 **Developer Mode Activated**

I can now modify my own code, add new capabilities, and make internal improvements.

**Available in Dev Mode:**
- Modify my code (prompts, tools, logic)
- Add new features and tools
- Update environment variables
- Fix bugs in my own code
- View modification history

**Commands:**
- \`/dev status\` - Check current mode
- \`/normal\` - Exit dev mode

**Safety:** All changes include automatic backups and validation.

What would you like me to improve?`
      };
    } catch (error) {
      console.error('❌ [DevMode] Enable failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Disable dev mode for conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Object} - Result
   */
  async disable(conversationId) {
    try {
      const conversation = await Conversation.findOne({
        where: { conversation_id: conversationId }
      });

      if (!conversation) {
        return {
          success: false,
          error: 'Conversation not found'
        };
      }

      const metadata = conversation.metadata || {};
      metadata.dev_mode = false;
      metadata.dev_mode_deactivated_at = new Date().toISOString();

      await Conversation.update(
        { metadata },
        { where: { conversation_id: conversationId } }
      );

      console.log(`👍 [DevMode] Disabled for conversation: ${conversationId}`);

      return {
        success: true,
        mode: this.MODE_NORMAL,
        message: `👍 **Normal Mode**

Developer mode deactivated. Self-modification tools are now disabled.

I'm back to helping with your projects and tasks!

**To re-enable dev mode:** Type \`/dev\` or ask me to "enter developer mode"`
      };
    } catch (error) {
      console.error('❌ [DevMode] Disable failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current mode status
   * @param {string} conversationId - Conversation ID
   * @returns {Object} - Mode status
   */
  async getStatus(conversationId) {
    try {
      const isDevMode = await this.isDevMode(conversationId);
      const conversation = await Conversation.findOne({
        where: { conversation_id: conversationId }
      });

      const metadata = conversation?.metadata || {};
      
      return {
        success: true,
        mode: isDevMode ? this.MODE_DEV : this.MODE_NORMAL,
        dev_mode: isDevMode,
        activated_at: metadata.dev_mode_activated_at || null,
        message: isDevMode 
          ? `🔧 **Developer Mode Active**

Self-modification tools are enabled. I can modify my own code.

**Commands:**
- \`/normal\` - Exit dev mode
- \`/dev status\` - Show this status`
          : `👍 **Normal Mode**

Self-modification tools are disabled. I'm focused on your projects.

**Commands:**
- \`/dev\` - Enter developer mode
- \`/dev status\` - Show this status`
      };
    } catch (error) {
      console.error('❌ [DevMode] Status check failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Detect if user wants to enter dev mode
   * @param {string} message - User message
   * @returns {boolean} - Whether message suggests dev mode
   */
  detectDevModeIntent(message) {
    const lowerMessage = message.toLowerCase();
    
    const devModeKeywords = [
      'modify yourself',
      'improve yourself',
      'fix your',
      'update your code',
      'change your',
      'add a tool',
      'create a new tool',
      'self-modify',
      'improve your own',
      'fix a bug in your',
      'developer mode',
      'dev mode'
    ];

    return devModeKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Check if tools should be available
   * @param {string} conversationId - Conversation ID
   * @param {string} toolName - Tool name
   * @returns {Object} - Availability result
   */
  async checkToolAvailability(conversationId, toolName) {
    const devOnlyTools = ['self_modify', 'manage_env'];
    
    if (!devOnlyTools.includes(toolName)) {
      return { available: true };
    }

    const isDevMode = await this.isDevMode(conversationId);
    
    if (!isDevMode) {
      return {
        available: false,
        reason: 'dev_mode_required',
        message: `⚠️ The \`${toolName}\` tool requires Developer Mode.

This tool allows me to modify my own code, which should only be done intentionally.

**Would you like to enter Developer Mode?**
- Type \`/dev\` to enable
- Or ask me to "enter developer mode"

In dev mode, I can:
- Modify my code and prompts
- Add new capabilities
- Fix bugs in my own logic
- Update configurations`
      };
    }

    return { available: true };
  }
}

// Create singleton instance
const devMode = new DevMode();

module.exports = devMode;
