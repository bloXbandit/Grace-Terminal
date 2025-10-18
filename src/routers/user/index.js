const router = require("koa-router")();

router.prefix("/api/users");

const modules = [
  "users",
  "profile",
  "github",
]

for (const module of modules) {
  try {
    const moduleRouter = require(`./${module}.js`);
    router.use(moduleRouter.routes(), moduleRouter.allowedMethods());
  }
  catch (error) { console.log(`load ${module} error`, error); }
}

module.exports = router.routes();
