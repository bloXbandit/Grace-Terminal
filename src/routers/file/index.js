const Router = require("koa-router");
const router = new Router();

router.prefix("/api/file");

const modules = [
  "file",
  "editor",
  "video-stream"
]

for (const module of modules) {
  try {
    const subRouter = require(`./${module}.js`);
    // Some modules export a Router instance, others export router.routes() middleware.
    // Support both to avoid silently dropping endpoints.
    if (typeof subRouter === 'function') {
      router.use(subRouter);
    } else {
      router.use(subRouter.routes(), subRouter.allowedMethods());
    }
  }
  catch (error) { console.log(`load ${module} error`, error); }
}

module.exports = router.routes();
