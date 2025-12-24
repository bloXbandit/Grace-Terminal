const router = require('koa-router')();
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const { v4: uuidv4 } = require('uuid');

/**
 * Transcribe audio using OpenAI Whisper
 * POST /api/voice/transcribe
 * Body: multipart/form-data with 'audio' file
 */
router.post('/', async (ctx) => {
  const tReqStart = Date.now();
  try {
    console.log('[Voice] Request files:', ctx.request.files);
    console.log('[Voice] Request body keys:', Object.keys(ctx.request.body || {}));
    if (typeof ctx.state.voiceMultipartParseMs === 'number') {
      console.log('[Voice] STT multipart parse ms:', ctx.state.voiceMultipartParseMs);
    }
    
    // Check both possible file locations
    const files = ctx.request.files || {};
    const audioFile = files.audio || files['audio'];
    
    if (!audioFile) {
      ctx.status = 400;
      ctx.body = { error: 'No audio file provided', files: Object.keys(files) };
      return;
    }
    
    const tempPath = audioFile.filepath || audioFile.path;
    console.log('[Voice] Audio file path:', tempPath);
    
    // Read audio file
    const tReadStart = Date.now();
    const audioBuffer = fs.readFileSync(tempPath);
    const tReadMs = Date.now() - tReadStart;
    console.log('[Voice] STT file read ms:', tReadMs, 'bytes:', audioBuffer.length);
    
    // Create form data for OpenAI
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm'
    });
    form.append('model', 'whisper-1');
    form.append('language', 'en'); // Optional: specify language
    
    // Call OpenAI Whisper API
    const tProviderStart = Date.now();
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      body: form
    });

    const tProviderHeadersMs = Date.now() - tProviderStart;
    console.log('[Voice] STT provider headers ms:', tProviderHeadersMs, 'status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('[Voice] Whisper API error:', error);
      console.error('[Voice] Whisper status:', response.status, 'headers:', Object.fromEntries(response.headers.entries()));
      ctx.status = 500;
      ctx.body = { error: 'Transcription failed', upstream_status: response.status, upstream_error: error };
      return;
    }

    const tProviderJsonStart = Date.now();
    const result = await response.json();
    const tProviderJsonMs = Date.now() - tProviderJsonStart;
    console.log('[Voice] STT provider json ms:', tProviderJsonMs);
    
    // Clean up temp file
    await unlink(tempPath).catch(() => {});

    const tTotalMs = Date.now() - tReqStart;
    console.log('[Voice] STT total ms:', tTotalMs);
    
    ctx.body = {
      text: result.text,
      duration: result.duration || null
    };

  } catch (error) {
    console.error('Transcription error:', error);
    ctx.status = 500;
    ctx.body = { error: 'Internal server error' };
  }
});

module.exports = router;
