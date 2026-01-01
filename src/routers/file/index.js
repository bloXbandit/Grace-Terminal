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
    router.use(subRouter.routes(), subRouter.allowedMethods());
  }
  catch (error) { console.log(`load ${module} error`, error); }
}

module.exports = router.routes();
