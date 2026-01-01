const Router = require('@koa/router');
const router = new Router();
const fs = require('fs');
const path = require('path');

/**
 * @swagger
 * /api/file/video-stream:
 *   get:
 *     summary: Stream video file with proper headers for browser playback
 *     tags:  
 *       - File
 *     description: Dedicated video streaming endpoint with Range support and proper Content-Type
 *     parameters:
 *       - in: query
 *         name: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The path of the video file to stream
 *     responses:
 *       200:
 *         description: Video stream
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 *       206:
 *         description: Partial content (Range request)
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/video-stream', async (ctx) => {
  const { path: filePath } = ctx.query;
  
  if (!filePath) {
    ctx.status = 400;
    ctx.body = { error: 'File path is required' };
    return;
  }
  
  if (!fs.existsSync(filePath)) {
    ctx.status = 404;
    ctx.body = { error: 'File does not exist' };
    return;
  }
  
  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = ctx.headers.range;
    
    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska'
    };
    const contentType = contentTypes[ext] || 'video/mp4';
    
    // Set proper headers for video streaming
    ctx.set('Content-Type', contentType);
    ctx.set('Accept-Ranges', 'bytes');
    ctx.set('Cache-Control', 'public, max-age=3600');
    
    if (range) {
      // Handle Range requests for seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      ctx.status = 206;
      ctx.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      ctx.set('Content-Length', chunksize);
      
      const stream = fs.createReadStream(filePath, { start, end });
      ctx.body = stream;
    } else {
      // Full file request
      ctx.set('Content-Length', fileSize);
      ctx.body = fs.createReadStream(filePath);
    }
  } catch (error) {
    console.error('[VideoStream] Error:', error);
    ctx.status = 500;
    ctx.body = { error: 'Failed to stream video' };
  }
});

module.exports = exports = router.routes();
