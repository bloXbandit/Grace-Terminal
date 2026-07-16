const router = require('koa-router')();
const DevMode = require('@src/agent/modes/DevMode');
const { isAdminUser, auditLog } = require('@src/utils/adminGuard');

const devMode = new DevMode();

/** ADMIN-ONLY: Dev Mode grants Grace self-modification — owner access only. */
const requireAdmin = (ctx) => {
  const uid = ctx.state && ctx.state.user && ctx.state.user.id;
  if (!isAdminUser(uid)) {
    auditLog('dev_mode_denied', { user_id: uid, path: ctx.path });
    ctx.status = 403;
    ctx.body = { success: false, message: 'Developer Mode is restricted to the admin account.' };
    return false;
  }
  return true;
};

/**
 * GET /status
 * Check if dev mode is enabled for a conversation
 */
router.get('/status', async (ctx) => {
  try {
    const { conversation_id } = ctx.query;
    
    if (!conversation_id) {
      ctx.body = {
        success: false,
        message: 'conversation_id is required'
      };
      return;
    }
    
    const enabled = await devMode.isDevMode(conversation_id);
    
    ctx.body = {
      success: true,
      enabled,
      message: enabled ? 'Dev mode is active' : 'Dev mode is disabled'
    };
  } catch (error) {
    console.error('[DevMode API] Status check failed:', error);
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

/**
 * POST /enable
 * Enable dev mode for a conversation
 */
router.post('/enable', async (ctx) => {
  try {
    if (!requireAdmin(ctx)) return;
    const { conversation_id } = ctx.request.body;
    auditLog('dev_mode_enable', { user_id: ctx.state.user.id, conversation_id });

    if (!conversation_id) {
      ctx.body = {
        success: false,
        message: 'conversation_id is required'
      };
      return;
    }
    
    const result = await devMode.forceEnable(conversation_id);
    
    ctx.body = {
      success: true,
      enabled: true,
      message: result.message
    };
  } catch (error) {
    console.error('[DevMode API] Enable failed:', error);
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

/**
 * POST /disable
 * Disable dev mode for a conversation
 */
router.post('/disable', async (ctx) => {
  try {
    if (!requireAdmin(ctx)) return;
    const { conversation_id } = ctx.request.body;
    auditLog('dev_mode_disable', { user_id: ctx.state.user.id, conversation_id });

    if (!conversation_id) {
      ctx.body = {
        success: false,
        message: 'conversation_id is required'
      };
      return;
    }
    
    const result = await devMode.disable(conversation_id);
    
    ctx.body = {
      success: true,
      enabled: false,
      message: result.message
    };
  } catch (error) {
    console.error('[DevMode API] Disable failed:', error);
    ctx.body = {
      success: false,
      message: error.message
    };
  }
});

module.exports = router;