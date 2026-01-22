require("module-alias/register");
require('dotenv').config();
const { logging } = require("@src/logger/index");
global.logging = logging;

const Koa = require('koa')
const app = new Koa()
const json = require('koa-json')
const onerror = require('koa-onerror')
const { koaBody } = require('koa-body');
const logger = require('koa-logger')

const swagger = require('@src/swagger/swagger')  // stores swagger.js, can be configured, I put it in the root directory
const { koaSwagger } = require('koa2-swagger-ui')

const router = require("@src/routers/index");
const wrapContext = require("@src/middlewares/wrap.context");
const setGlobalTokenMiddleware = require('@src/middlewares/setGlobalToken');
const authMiddleware = require('@src/middlewares/auth');

// Initialize SEAL Framework (Self-Evolving Agentic LLM)
require('@src/agent/seal');

app.use(wrapContext);
// error handler 
onerror(app)

// CORS middleware to allow ngrok and external access
app.use(async (ctx, next) => {
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (ctx.method === 'OPTIONS') {
    ctx.status = 200;
    return;
  }
  
  await next();
});

// middlewares
const koaBodyMiddleware = koaBody({
  multipart: false
})

const koaBodyMultipartMiddleware = koaBody({
  multipart: true
})

app.use(async (ctx, next) => {
  if (ctx.method === 'POST' && (ctx.path === '/api/voice/transcribe' || ctx.path === '/api/file/upload')) {
    const tParseStart = Date.now()
    return koaBodyMultipartMiddleware(ctx, async () => {
      ctx.state.voiceMultipartParseMs = Date.now() - tParseStart
      return next()
    })
  }

  return koaBodyMiddleware(ctx, next)
})
app.use(json())
app.use(logger())

app.use(async (ctx, next) => {
  console.log(`Request URL: ${ctx.url}`);
  await next();
});
const path = require('path');

const publicPath = path.join(__dirname, '../public');
app.use(require('koa-static')(publicPath))

// logger
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`)
})

app.use(setGlobalTokenMiddleware);
app.use(authMiddleware());

// routes
app.use(router.routes()).use(router.allowedMethods());
app.use(swagger.routes());
app.use(swagger.allowedMethods());
app.use(koaSwagger({
  routePrefix: '/swagger', // interface documentation access address
  swaggerOptions: {
    url: '/swagger.json', // example path to json 其实就是之后swagger-jsdoc生成的文档地址
  }
}))


// error-handling
app.on('error', (err, ctx) => {
  console.error('server error', err, ctx)
});

module.exports = app
