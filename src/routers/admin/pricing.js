// src/routers/admin/pricing.js

const Router = require('koa-router');
const router = new Router();
const PricingTier = require('@src/models/PricingTier');

// Middleware to check if user is admin
const isAdmin = async (ctx, next) => {
  const user_id = ctx.state.user?.id;
  
  // Admin check: user_id === 1 OR no user_id found (local development)
  if (user_id === 1 || !user_id) {
    await next();
  } else {
    ctx.status = 403;
    ctx.body = { success: false, message: 'Admin access required' };
  }
};

// GET /api/admin/pricing - Get all pricing tiers
router.get('/pricing', isAdmin, async (ctx) => {
  try {
    const tiers = await PricingTier.findAll({
      order: [['sort_order', 'ASC']]
    });
    
    ctx.body = {
      success: true,
      tiers
    };
  } catch (error) {
    console.error('Error fetching pricing tiers:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// POST /api/admin/pricing - Create new pricing tier
router.post('/pricing', isAdmin, async (ctx) => {
  try {
    const tier = await PricingTier.create(ctx.request.body);
    
    ctx.body = {
      success: true,
      tier
    };
  } catch (error) {
    console.error('Error creating pricing tier:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// PUT /api/admin/pricing/:id - Update pricing tier
router.put('/pricing/:id', isAdmin, async (ctx) => {
  try {
    const tier = await PricingTier.findByPk(ctx.params.id);
    
    if (!tier) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Tier not found' };
      return;
    }
    
    await tier.update(ctx.request.body);
    
    ctx.body = {
      success: true,
      tier
    };
  } catch (error) {
    console.error('Error updating pricing tier:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

// DELETE /api/admin/pricing/:id - Delete pricing tier
router.delete('/pricing/:id', isAdmin, async (ctx) => {
  try {
    const tier = await PricingTier.findByPk(ctx.params.id);
    
    if (!tier) {
      ctx.status = 404;
      ctx.body = { success: false, message: 'Tier not found' };
      return;
    }
    
    await tier.destroy();
    
    ctx.body = {
      success: true,
      message: 'Tier deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting pricing tier:', error);
    ctx.status = 500;
    ctx.body = { success: false, message: error.message };
  }
});

module.exports = router;

