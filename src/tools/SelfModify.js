const selfModifier = require('@src/agent/self-modify/SelfModifier');
const devMode = require('@src/agent/modes/DevMode');

const SelfModifyTool = {
  name: "self_modify",
  description: "Modify Grace's own code safely. Can update existing files or create new tools/agents. Includes automatic backups and validation. Use this to improve yourself, add new capabilities, or fix bugs in your own code. **REQUIRES DEVELOPER MODE** - Only available when user has enabled dev mode with /dev command.",
  params: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["modify", "create", "view_history"],
        description: "Action to perform: 'modify' existing file, 'create' new file, or 'view_history' of changes"
      },
      file_path: {
        type: "string",
        description: "Absolute path to file (e.g., /app/src/agent/prompt/chat.js). Required for modify/create."
      },
      new_content: {
        type: "string",
        description: "Complete new content for the file. Required for modify/create."
      },
      reason: {
        type: "string",
        description: "Why this modification is needed. Be specific about the improvement or fix."
      }
    },
    required: ["action"]
  },
  
  async execute(params, context = {}) {
    const { action, file_path, new_content, reason } = params;
    const { conversation_id } = context;

    try {
      // FAIL-CLOSED GATE: self-modification requires (1) a known conversation,
      // (2) that conversation in Dev Mode, and (3) the conversation owned by the
      // admin. Previously a missing conversation_id skipped the check entirely.
      const { isAdminUser, auditLog } = require('@src/utils/adminGuard');
      if (!conversation_id) {
        auditLog('self_modify_denied', { reason: 'no_conversation_context', action, file_path });
        return {
          success: false,
          error: "dev_mode_required",
          message: "⚠️ Self-modification requires an active Dev Mode conversation — no conversation context was provided."
        };
      }
      const isDevMode = await devMode.isDevMode(conversation_id);
      if (!isDevMode) {
        return {
          success: false,
          error: "dev_mode_required",
          message: `⚠️ **Developer Mode Required**

The \`self_modify\` tool can only be used in Developer Mode.

This prevents accidental code modifications during normal conversations.

**To enable Developer Mode (admin only):**
- Type \`/dev\` or toggle it in Settings

Once in dev mode, I can modify my own code safely.`
        };
      }
      // Admin-ownership check (defense in depth — enable is already admin-gated)
      const Conversation = require('@src/models/Conversation');
      const convo = await Conversation.findOne({ where: { conversation_id } });
      if (!convo || !isAdminUser(convo.user_id)) {
        auditLog('self_modify_denied', { reason: 'non_admin_owner', user_id: convo && convo.user_id, action, file_path });
        return {
          success: false,
          error: "admin_required",
          message: "🔒 Self-modification is restricted to the admin account."
        };
      }

      auditLog('self_modify_attempt', { action, file_path, reason: (reason || '').slice(0, 200), conversation_id });
      console.log(`🤖 [Grace] Self-modification requested: ${action}`);

      switch (action) {
        case 'modify':
          if (!file_path || !new_content || !reason) {
            return {
              success: false,
              error: "modify action requires: file_path, new_content, and reason"
            };
          }

          const modifyResult = await selfModifier.modifyFile({
            filePath: file_path,
            newContent: new_content,
            reason: reason,
            requestedBy: 'Grace (self-modification)'
          });

          if (modifyResult.success) {
            // Try to hot reload
            await selfModifier.hotReload(file_path);
            
            return {
              success: true,
              message: `✅ Successfully modified ${file_path}`,
              backup_path: modifyResult.backupPath,
              note: "Some changes may require server restart to take full effect"
            };
          }

          return modifyResult;

        case 'create':
          if (!file_path || !new_content || !reason) {
            return {
              success: false,
              error: "create action requires: file_path, new_content, and reason"
            };
          }

          const createResult = await selfModifier.addNewFile({
            filePath: file_path,
            content: new_content,
            reason: reason,
            requestedBy: 'Grace (self-modification)'
          });

          return createResult;

        case 'view_history':
          const history = await selfModifier.getHistory(20);
          return {
            success: true,
            modifications: history,
            count: history.length
          };

        default:
          return {
            success: false,
            error: `Unknown action: ${action}`
          };
      }
    } catch (error) {
      console.error('❌ [SelfModify] Tool execution error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = SelfModifyTool;
