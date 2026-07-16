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

    // ADMIN GATE: dev-mode activation is owner-only. Resolve the conversation's
    // owner and verify against ADMIN_USER_ID before any enable path.
    const requireAdminForDev = async () => {
      try {
        const Conversation = require('@src/models/Conversation');
        const { isAdminUser, auditLog } = require('@src/utils/adminGuard');
        const convo = await Conversation.findOne({ where: { conversation_id: conversationId } });
        const owner = convo && convo.user_id;
        if (!isAdminUser(owner)) {
          auditLog('dev_mode_denied', { via: 'chat_command', user_id: owner, conversation_id: conversationId });
          return {
            success: false,
            message: '🔒 Developer Mode is restricted to the admin account.',
            mode: 'normal'
          };
        }
        auditLog('dev_mode_enable', { via: 'chat_command', user_id: owner, conversation_id: conversationId });
        return null; // admin OK
      } catch (e) {
        console.error('[ModeCommand] admin check failed:', e.message);
        return { success: false, message: '🔒 Could not verify admin access — Dev Mode not enabled.', mode: 'normal' };
      }
    };

    switch (command.command) {
      case 'enable_dev': {
        const denied = await requireAdminForDev();
        if (denied) return denied;
        return await devMode.enable(conversationId);
      }

      case 'force_dev': {
        // Force activation — still ADMIN-ONLY, and safety rails (path allowlist,
        // backups, audit) always apply; "force" only skips the confirmation flow.
        const denied = await requireAdminForDev();
        if (denied) return denied;
        console.log(`🚨 [ModeCommand] FORCE DEV MODE ACTIVATED for conversation: ${conversationId}`);
        const forceResult = await devMode.forceEnable(conversationId);
        return {
          success: true,
          message: "🔧 **Developer Mode Activated (forced)**\n\n✅ Self-modification enabled for this conversation\n🛡️ Safety rails remain active: path allowlist, automatic backups, syntax validation, audit log\n\n**Examples:**\n- \"Analyze your routing logic and improve it\"\n- \"Fix the bug in your summary prompt\"\n- \"Add a new tool for X\"\n\nDeactivate anytime with /normal or the Settings toggle.",
          mode: 'dev',
          forced: true
        };
      }

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
