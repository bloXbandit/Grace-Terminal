const router = require('koa-router')();
const devModeRouter = require('./dev-mode');

// Mount dev mode routes under /api/dev-mode
router.use('/api/dev-mode', devModeRouter.routes(), devModeRouter.allowedMethods());

module.exports = router.routes();
