const envManager = require('@src/agent/self-modify/EnvManager');
const devMode = require('@src/agent/modes/DevMode');

const ManageEnvTool = {
  name: "manage_env",
  description: "Safely manage environment variables. Add new API keys, update configurations, or view current settings. Automatically creates backups before changes. Use this when you need to add new service integrations (like new AI models, APIs, etc.). **REQUIRES DEVELOPER MODE** - Only available when user has enabled dev mode with /dev command.",
  params: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["set", "set_multiple", "get", "list", "history"],
        description: "Action: 'set' one var, 'set_multiple' vars, 'get' value, 'list' all vars, or 'history' of changes"
      },
      key: {
        type: "string",
        description: "Environment variable name (UPPERCASE_WITH_UNDERSCORES). Required for 'set' and 'get'."
      },
      value: {
        type: "string",
        description: "Value to set. Required for 'set'."
      },
      vars: {
        type: "object",
        description: "Multiple key-value pairs for 'set_multiple' action. Example: {\"API_KEY\": \"xxx\", \"API_URL\": \"https://...\"}"
      },
      reason: {
        type: "string",
        description: "Why this change is needed. Required for 'set' and 'set_multiple'."
      }
    },
    required: ["action"]
  },
  
  async execute(params, context = {}) {
    const { action, key, value, vars, reason } = params;
    const { conversation_id } = context;

    try {
      // Check if dev mode is enabled (except for 'list' and 'get' which are read-only)
      if (conversation_id && ['set', 'set_multiple'].includes(action)) {
        const isDevMode = await devMode.isDevMode(conversation_id);
        if (!isDevMode) {
          return {
            success: false,
            error: "dev_mode_required",
            message: `⚠️ **Developer Mode Required**

The \`manage_env\` tool can only modify environment variables in Developer Mode.

This prevents accidental configuration changes during normal conversations.

**To enable Developer Mode:**
- Type \`/dev\` or
- Say "enter developer mode"

Once in dev mode, I can safely manage environment variables.`
          };
        }
      }

      console.log(`🔐 [Grace] Environment management: ${action}`);

      switch (action) {
        case 'set':
          if (!key || !value || !reason) {
            return {
              success: false,
              error: "set action requires: key, value, and reason"
            };
          }

          const setResult = await envManager.setEnvVar(key, value, reason);
          return setResult;

        case 'set_multiple':
          if (!vars || !reason) {
            return {
              success: false,
              error: "set_multiple action requires: vars (object) and reason"
            };
          }

          const multiResult = await envManager.setMultipleVars(vars, reason);
          return multiResult;

        case 'get':
          if (!key) {
            return {
              success: false,
              error: "get action requires: key"
            };
          }

          const val = await envManager.getEnvVar(key);
          return {
            success: true,
            key,
            value: val,
            exists: val !== null
          };

        case 'list':
          const allVars = await envManager.listEnvVars();
          return {
            success: true,
            variables: allVars,
            count: Object.keys(allVars).length,
            note: "Sensitive values are masked (****)"
          };

        case 'history':
          const history = await envManager.getHistory(20);
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
      console.error('❌ [ManageEnv] Tool execution error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = ManageEnvTool;
