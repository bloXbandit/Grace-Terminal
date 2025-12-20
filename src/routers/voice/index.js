const router = require('koa-router')();
const Redis = require('ioredis');
const transcribe = require('./transcribe');
const synthesize = require('./synthesize');

router.prefix('/api/voice');

// Redis client for rate limiting
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

// Handle Redis connection errors gracefully
redis.on('error', (err) => {
  console.error('[Voice] Redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Voice] Redis connected successfully');
});

// Rate limiting: 1 task execution per 10 seconds per conversation
const RATE_LIMIT_WINDOW = 10; // seconds
const RATE_LIMIT_KEY_PREFIX = 'voice_rate_limit:';

/**
 * Check if conversation is rate limited
 * @param {string} conversationId 
 * @returns {Promise<boolean>} true if rate limited
 */
async function isRateLimited(conversationId) {
  // Check Redis connection
  if (redis.status !== 'ready') {
    console.log('[Voice] Redis not connected, skipping rate limiting');
    return false; // Allow request if Redis is down
  }
  
  try {
    const key = RATE_LIMIT_KEY_PREFIX + conversationId;
    const current = await redis.get(key);
    
    if (current) {
      return true; // Rate limited
    }
    
    // Set rate limit
    await redis.setex(key, RATE_LIMIT_WINDOW, '1');
    return false;
  } catch (error) {
    console.error('[Voice] Rate limiting error:', error);
    return false; // Allow request on error
  }
}

/**
 * Rate limiting middleware
 * Only applies to task execution requests
 */
async function rateLimitMiddleware(ctx, next) {
  // Skip rate limiting for health check
  if (ctx.path.endsWith('/health')) {
    await next();
    return;
  }
  
  const conversationId = ctx.headers['x-conversation-id'];
  
  if (!conversationId) {
    ctx.status = 400;
    ctx.body = { error: 'Missing conversation ID' };
    return;
  }

  // Check if this is a task execution request
  // We'll let the frontend tell us via header if it's a task
  const isTask = ctx.headers['x-voice-task'] === 'true';
  
  if (isTask && await isRateLimited(conversationId)) {
    ctx.status = 429;
    ctx.body = { 
      error: 'Rate limited',
      message: 'Please wait before executing another task',
      retryAfter: RATE_LIMIT_WINDOW
    };
    return;
  }

  await next();
}

// Mount sub-routes first
router.use('/transcribe', transcribe.routes(), transcribe.allowedMethods());
// Mount at root so synthesize.js can define both /synthesize and /synthesize-stream
router.use(synthesize.routes(), synthesize.allowedMethods());

// Apply rate limiting after routes are mounted
router.use(rateLimitMiddleware);

/**
 * Health check endpoint
 */
router.get('/health', async (ctx) => {
  ctx.body = { 
    status: 'ok',
    timestamp: new Date().toISOString()
  };
});

/**
 * Get voice status for conversation
 * GET /api/voice/status/:conversationId
 */
router.get('/status/:conversationId', async (ctx) => {
  try {
    const { conversationId } = ctx.params;
    
    // Check if there's an active task
    // This would integrate with your existing task tracking
    // For now, return a simple response
    const hasActiveTask = false; // TODO: Check actual task status
    
    ctx.body = {
      conversationId,
      hasActiveTask,
      status: hasActiveTask ? 'running' : 'idle',
      lastActivity: new Date().toISOString()
    };
  } catch (error) {
    console.error('Voice status error:', error);
    ctx.status = 500;
    ctx.body = { error: 'Internal server error' };
  }
});

module.exports = router.routes();
