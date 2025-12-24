const router = require('koa-router')();
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const { v4: uuidv4 } = require('uuid');

const getSttProvider = () => (process.env.VOICE_STT_PROVIDER || 'openai').toLowerCase();

const transcribeWithOpenAIWhisper = async ({ audioBuffer, contentType }) => {
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: contentType || 'audio/webm'
  });
  form.append('model', 'whisper-1');
  form.append('language', 'en');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      ...form.getHeaders()
    },
    body: form
  });

  if (!response.ok) {
    const error = await response.text();
    const err = new Error('OpenAI Whisper transcription failed');
    err.upstream_status = response.status;
    err.upstream_error = error;
    err.upstream_headers = Object.fromEntries(response.headers.entries());
    throw err;
  }

  const result = await response.json();
  return { text: result.text, duration: result.duration || null };
};

const transcribeWithDeepgram = async ({ audioBuffer, contentType }) => {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    const err = new Error('Missing DEEPGRAM_API_KEY');
    err.code = 'MISSING_DEEPGRAM_API_KEY';
    throw err;
  }

  const url = 'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=en-US';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${key}`,
      'Content-Type': contentType || 'audio/webm'
    },
    body: audioBuffer
  });

  if (!response.ok) {
    const error = await response.text();
    const err = new Error('Deepgram transcription failed');
    err.upstream_status = response.status;
    err.upstream_error = error;
    err.upstream_headers = Object.fromEntries(response.headers.entries());
    throw err;
  }

  const result = await response.json();
  const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  const duration = (typeof result?.metadata?.duration === 'number') ? result.metadata.duration : null;
  return { text: transcript, duration };
};

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

    const contentType = audioFile.mimetype || audioFile.type || 'audio/webm';
    
    // Read audio file
    const tReadStart = Date.now();
    const audioBuffer = fs.readFileSync(tempPath);
    const tReadMs = Date.now() - tReadStart;
    console.log('[Voice] STT file read ms:', tReadMs, 'bytes:', audioBuffer.length);

    const primaryProvider = getSttProvider();
    const providers = primaryProvider === 'deepgram' ? ['deepgram', 'openai'] : ['openai', 'deepgram'];

    let result = null;
    let lastErr = null;
    for (const provider of providers) {
      const tProviderStart = Date.now();
      try {
        if (provider === 'deepgram') {
          result = await transcribeWithDeepgram({ audioBuffer, contentType });
        } else {
          result = await transcribeWithOpenAIWhisper({ audioBuffer, contentType });
        }
        const tProviderHeadersMs = Date.now() - tProviderStart;
        console.log('[Voice] STT provider headers ms:', tProviderHeadersMs, 'status: 200', 'provider:', provider);
        break;
      } catch (err) {
        const tProviderHeadersMs = Date.now() - tProviderStart;
        console.log('[Voice] STT provider headers ms:', tProviderHeadersMs, 'status:', err?.upstream_status || 'ERR', 'provider:', provider);
        console.error('[Voice] STT provider error provider:', provider, 'status:', err?.upstream_status, 'error:', err?.upstream_error || err?.message);
        lastErr = err;
        result = null;
      }
    }

    if (!result) {
      ctx.status = 500;
      ctx.body = {
        error: 'Transcription failed',
        upstream_status: lastErr?.upstream_status,
        upstream_error: lastErr?.upstream_error || lastErr?.message
      };
      return;
    }
    
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
