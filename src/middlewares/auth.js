const jwt = require('jsonwebtoken');
const User = require('@src/models/User');
const devMode = require('@src/agent/modes/DevMode');

/**
 * Authentication Middleware
 * - Hardcodes user ID 1 (kmanjoll@gmail.com) for local development
 * - Requires proper authentication for all other users
 * - Restricts dev mode access to admin users only
 */

const JWT_SECRET = process.env.JWT_SECRET || 'grace-ai-secret-key-change-in-production';

// Public endpoints that don't require authentication
const PUBLIC_PATHS = [
  '/api/users/login',
  '/api/users/register',
  '/api/users/google-auth',
  '/api/users/send-sms-code',
  '/api/users/login-sms-code',
  '/api/auth/google',
  '/api/agent_store/last/'
];

// Admin-only user (hardcoded for local development)
const ADMIN_USER = {
  id: 1,
  email: 'kmanjoll@gmail.com',
  name: 'Kenny',
  is_admin: true
};

module.exports = () => {
  return async (ctx, next) => {
    const path = ctx.path;
    
    // Allow public paths without authentication
    if (PUBLIC_PATHS.some(p => path.startsWith(p))) {
      await next();
      return;
    }

    // Check for token in headers
    const token = ctx.headers.authorization?.replace('Bearer ', '') || 
                  ctx.cookies.get('grace_token');

    // LOCAL DEVELOPMENT: If no token, default to admin user (ID 1)
    if (!token) {
      console.log('⚠️  [Auth] No token found, defaulting to local admin user (ID 1)');
      ctx.state.user = ADMIN_USER;
      await next();
      return;
    }

    try {
      // Verify JWT token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Fetch user from database
      const user = await User.findOne({ where: { id: decoded.user_id } });
      
      if (!user) {
        ctx.status = 401;
        ctx.body = { error: 'User not found' };
        return;
      }

      // Check if user is active
      if (user.user_status !== 1) {
        ctx.status = 403;
        ctx.body = { error: 'User account is disabled' };
        return;
      }

      // Set user context
      ctx.state.user = {
        id: user.id,
        email: user.user_email,
        name: user.user_name || user.user_nickname,
        is_admin: user.is_admin === 1
      };

      // DEV MODE ACCESS CONTROL: Only admins can use dev mode
      if (path.includes('/dev') || ctx.request.body?.message?.includes('/dev')) {
        const conversationId = ctx.request.body?.conversation_id;
        
        if (conversationId) {
          const isDevModeActive = await devMode.isDevMode(conversationId);
          
          if (isDevModeActive && !ctx.state.user.is_admin) {
            ctx.status = 403;
            ctx.body = { 
              error: 'Dev mode is restricted to admin users only',
              message: '🚫 Developer Mode is only available to administrators. Please contact support for access.'
            };
            return;
          }
        }
      }

      await next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        ctx.status = 401;
        ctx.body = { error: 'Invalid token' };
      } else if (error.name === 'TokenExpiredError') {
        ctx.status = 401;
        ctx.body = { error: 'Token expired' };
      } else {
        console.error('❌ [Auth] Error:', error);
        ctx.status = 500;
        ctx.body = { error: 'Authentication error' };
      }
    }
  };
};
