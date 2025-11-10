// src/routers/admin/index.js

const router = require('koa-router')();
const pricingRouter = require('./pricing');

// Mount pricing routes under /api/admin
router.use('/api/admin', pricingRouter.routes(), pricingRouter.allowedMethods());

module.exports = exports = router.routes();

