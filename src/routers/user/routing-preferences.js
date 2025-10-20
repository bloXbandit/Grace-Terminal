const router = require("koa-router")();
const RoutingPreference = require('@src/models/RoutingPreference');

/**
 * GET /api/routing-preferences
 * Get user's routing preferences
 */
router.get('/routing-preferences', async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    
    const preferences = await RoutingPreference.findAll({
      where: { user_id: userId }
    });

    // Convert to object format for frontend
    const preferencesObj = {};
    preferences.forEach(pref => {
      preferencesObj[pref.task_type] = {
        primary_model: pref.primary_model,
        fallback_model: pref.fallback_model
      };
    });

    ctx.body = {
      success: true,
      preferences: preferencesObj
    };
  } catch (error) {
    console.error('Error fetching routing preferences:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: 'Failed to fetch routing preferences'
    };
  }
});

/**
 * POST /api/routing-preferences
 * Save user's routing preferences
 */
router.post('/routing-preferences', async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    const { preferences } = ctx.request.body;

    if (!preferences || typeof preferences !== 'object') {
      ctx.status = 400;
      ctx.body = {
        success: false,
        error: 'Invalid preferences data'
      };
      return;
    }

    // Delete existing preferences for this user
    await RoutingPreference.destroy({
      where: { user_id: userId }
    });

    // Create new preferences
    const preferencesToCreate = [];
    Object.entries(preferences).forEach(([taskType, config]) => {
      if (config.primary_model || config.fallback_model) {
        preferencesToCreate.push({
          user_id: userId,
          task_type: taskType,
          primary_model: config.primary_model,
          fallback_model: config.fallback_model
        });
      }
    });

    if (preferencesToCreate.length > 0) {
      await RoutingPreference.bulkCreate(preferencesToCreate);
    }

    ctx.body = {
      success: true,
      message: 'Routing preferences saved successfully'
    };
  } catch (error) {
    console.error('Error saving routing preferences:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: 'Failed to save routing preferences'
    };
  }
});

/**
 * DELETE /api/routing-preferences/:taskType
 * Reset specific task type to default
 */
router.delete('/routing-preferences/:taskType', async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    const { taskType } = ctx.params;

    await RoutingPreference.destroy({
      where: { 
        user_id: userId,
        task_type: taskType
      }
    });

    ctx.body = {
      success: true,
      message: `Reset ${taskType} to default`
    };
  } catch (error) {
    console.error('Error resetting routing preference:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: 'Failed to reset routing preference'
    };
  }
});

/**
 * DELETE /api/routing-preferences
 * Reset ALL routing preferences to defaults
 */
router.delete('/routing-preferences', async (ctx) => {
  try {
    const userId = ctx.state.user.id;

    await RoutingPreference.destroy({
      where: { user_id: userId }
    });

    ctx.body = {
      success: true,
      message: 'All routing preferences reset to defaults'
    };
  } catch (error) {
    console.error('Error resetting all routing preferences:', error);
    ctx.status = 500;
    ctx.body = {
      success: false,
      error: 'Failed to reset all routing preferences'
    };
  }
});

module.exports = router;
