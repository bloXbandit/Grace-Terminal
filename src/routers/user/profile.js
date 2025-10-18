const router = require("koa-router")();
const { 
  upsertProfile, 
  getAllProfiles, 
  deleteProfile 
} = require('@src/services/userProfile');

/**
 * Get user profile
 */
router.get("/profile", async (ctx) => {
  try {
    const user_id = ctx.state.user.id;
    const profiles = await getAllProfiles(user_id);
    
    ctx.body = {
      success: true,
      profile: profiles.map(p => ({
        key: p.key,
        value: p.value,
        confidence: p.confidence,
        source: p.source,
        last_updated: p.last_updated
      }))
    };
  } catch (error) {
    console.error('Error getting profile:', error);
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

/**
 * Update user profile
 */
router.post("/profile", async (ctx) => {
  try {
    const user_id = ctx.state.user.id;
    const { key, value, confidence = 1.0, source = 'settings' } = ctx.request.body;
    
    if (!key || !value) {
      ctx.body = {
        success: false,
        error: 'key and value are required'
      };
      return;
    }
    
    await upsertProfile(user_id, key, value, confidence, source);
    
    ctx.body = {
      success: true,
      message: 'Profile updated successfully'
    };
  } catch (error) {
    console.error('Error updating profile:', error);
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

/**
 * Delete profile entry
 */
router.delete("/profile/:key", async (ctx) => {
  try {
    const user_id = ctx.state.user.id;
    const { key } = ctx.params;
    
    await deleteProfile(user_id, key);
    
    ctx.body = {
      success: true,
      message: 'Profile entry deleted'
    };
  } catch (error) {
    console.error('Error deleting profile:', error);
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

module.exports = router;
