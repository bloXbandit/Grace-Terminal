const router = require("koa-router")();
const digitalTwinRouter = require("./digital_twin");

router.use("/api/digital-twin", digitalTwinRouter.routes(), digitalTwinRouter.allowedMethods());

module.exports = exports = router.routes();
