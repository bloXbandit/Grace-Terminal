// @ts-ignore
const router = require("koa-router")();

// Assistant page API routes
router.use("/api/assistant", require("./assistant.js"));

module.exports = exports = router.routes();
