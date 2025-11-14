const router = require("koa-router")();
const forwardRequest = require('@src/utils/sub_server_forward_request')

router.get("/userinfo",async (ctx) => {
  // In dev mode, return the user from auth middleware
  if (process.env.NODE_ENV === 'development' && ctx.state.user) {
    ctx.body = {
      user: ctx.state.user,
      token: 'dev-token'
    };
    return;
  }
  // Otherwise forward the request
  let res = await forwardRequest(ctx, "GET", "/api/users/userinfo")
  return ctx.body = res;
})
