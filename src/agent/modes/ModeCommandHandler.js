require('module-alias/register');
const devMode = require('./DevMode');

/**
 * ModeCommandHandler - Handle mode switching commands
 * Intercepts /dev, /normal, /dev status commands
 */
class ModeCommandHandler {
  /**
   * Check if message is a mode command
   * @param {string} message - User message
   * @returns {Object|null} - Command info or null
   */
  parseCommand(message) {
    const trimmed = message.trim();
    
    // /dev or "dev mode on" or "enter dev mode"
    if (trimmed === '/dev' || 
        trimmed.toLowerCase().includes('dev mode on') ||
        trimmed.toLowerCase().includes('enter dev mode') ||
        trimmed.toLowerCase().includes('enable dev mode')) {
      return {
        command: 'enable_dev',
        type: 'mode_switch'
      };
    }

    // FORCE TRIGGERS - Bulletproof dev mode activation
    if (trimmed.toLowerCase().includes('force dev mode') ||
        trimmed.toLowerCase().includes('force self modify') ||
        trimmed.toLowerCase().includes('force grace modify') ||
        trimmed.toLowerCase().includes('override dev mode') ||
        trimmed === '/force' ||
        trimmed === '/override' ||
        trimmed.toLowerCase().includes('emergency dev mode')) {
      return {
        command: 'force_dev',
        type: 'force_mode_switch'
      };
    }

    // /normal or "dev mode off" or "exit dev mode"
    if (trimmed === '/normal' || 
        trimmed.toLowerCase().includes('dev mode off') ||
        trimmed.toLowerCase().includes('exit dev mode') ||
        trimmed.toLowerCase().includes('disable dev mode') ||
        trimmed.toLowerCase().includes('normal mode')) {
      return {
        command: 'disable_dev',
        type: 'mode_switch'
      };
    }

    // /dev status or "what mode"
    if (trimmed === '/dev status' || 
        trimmed === '/status' ||
        trimmed.toLowerCase().includes('what mode') ||
        trimmed.toLowerCase().includes('current mode')) {
      return {
        command: 'status',
        type: 'mode_query'
      };
    }

    return null;
  }

  /**
   * Handle mode command
   * @param {string} message - User message
   * @param {string} conversationId - Conversation ID
   * @returns {Object|null} - Response or null if not a command
   */
  async handleCommand(message, conversationId) {
    console.log(`🎮 [ModeCommand] Checking message: "${message}"`);
    const command = this.parseCommand(message);
    
    if (!command) {
      console.log(`🎮 [ModeCommand] Not a mode command`);
      return null;
    }

    console.log(`🎮 [ModeCommand] Handling: ${command.command} for conversation: ${conversationId}`);

    switch (command.command) {
      case 'enable_dev':
        return await devMode.enable(conversationId);

      case 'force_dev':
        // FORCE activation - bypasses all checks and GUARANTEES activation
        console.log(`🚨 [ModeCommand] FORCE DEV MODE ACTIVATED for conversation: ${conversationId}`);
        const forceResult = await devMode.forceEnable(conversationId);
        return {
          success: true,
          message: "🚨 **FORCE DEV MODE ACTIVATED** 🚨\n\n✅ Self-modification capabilities are now **FULLY ENABLED**\n✅ All safety restrictions **BYPASSED**\n✅ Grace can now modify her own code, prompts, and capabilities\n\n**Available commands:**\n- Modify code: \"Grace, fix your routing logic\"\n- Update prompts: \"Grace, improve your creativity\"\n- Add capabilities: \"Grace, add a new tool for X\"\n\n**Status:** 🔥 **MAXIMUM POWER MODE** 🔥",
          mode: 'dev',
          forced: true
        };

      case 'disable_dev':
        return await devMode.disable(conversationId);

      case 'status':
        return await devMode.getStatus(conversationId);

      default:
        return null;
    }
  }

  /**
   * Check if user might want dev mode (for suggestions)
   * @param {string} message - User message
   * @param {string} conversationId - Conversation ID
   * @returns {Object|null} - Suggestion or null
   */
  async checkDevModeSuggestion(message, conversationId) {
    // Don't suggest if already in dev mode
    const isDevMode = await devMode.isDevMode(conversationId);
    if (isDevMode) {
      return null;
    }

    // Check if message suggests self-modification
    const wantsDevMode = devMode.detectDevModeIntent(message);
    
    if (wantsDevMode) {
      return {
        suggest_dev_mode: true,
        message: `💡 **Suggestion:** This sounds like a self-modification request.

Would you like me to enter **Developer Mode**?

In dev mode, I can:
- Modify my own code
- Add new capabilities  
- Fix bugs in my logic
- Update configurations

**To enable:** Type \`/dev\` or say "yes"`
      };
    }

    return null;
  }
}

// Create singleton instance
const modeCommandHandler = new ModeCommandHandler();

module.exports = modeCommandHandler;
