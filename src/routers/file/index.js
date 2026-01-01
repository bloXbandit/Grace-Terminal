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
    router.use(require(`./${module}.js`));
  }
  catch (error) { console.log(`load ${module} error`, error); }
}

module.exports = router.routes();
