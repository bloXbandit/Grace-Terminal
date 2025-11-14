const router = require('koa-router')();
const devMode = require('@src/agent/modes/DevMode');

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
    const { conversation_id } = ctx.request.body;
    
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
    const { conversation_id } = ctx.request.body;
    
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
