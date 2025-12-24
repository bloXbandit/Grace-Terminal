const router = require('koa-router')();
const fetch = require('node-fetch');

const getTtsProvider = () => (process.env.VOICE_TTS_PROVIDER || 'openai').toLowerCase();

const synthesizeWithOpenAI = async ({ text, voice }) => {
  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3'
    })
  });
};

const deepgramVoiceMap = {
  alloy: 'aura-asteria-en',
  nova: 'aura-luna-en',
  shimmer: 'aura-stella-en',
  echo: 'aura-orion-en',
  fable: 'aura-hera-en',
  onyx: 'aura-zeus-en'
};

const synthesizeWithDeepgram = async ({ text, voice }) => {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    const err = new Error('Missing DEEPGRAM_API_KEY');
    err.code = 'MISSING_DEEPGRAM_API_KEY';
    throw err;
  }

  const dgModel = deepgramVoiceMap[voice] || process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en';
  const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(dgModel)}&encoding=mp3`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${key}`,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({ text })
  });
};

/**
 * Synthesize speech using OpenAI TTS
 * POST /api/voice/synthesize
 * Body: { text: string, voice?: string }
 */
router.post('/synthesize', async (ctx) => {
  try {
    const { text, voice = 'alloy' } = ctx.request.body;
    
    if (!text) {
      ctx.status = 400;
      ctx.body = { error: 'No text provided' };
      return;
    }

    // Validate voice
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!validVoices.includes(voice)) {
      ctx.status = 400;
      ctx.body = { error: `Invalid voice. Must be one of: ${validVoices.join(', ')}` };
      return;
    }

    const primaryProvider = getTtsProvider();
    const providers = primaryProvider === 'deepgram' ? ['deepgram', 'openai'] : ['openai', 'deepgram'];

    let response = null;
    let lastErr = null;
    for (const provider of providers) {
      try {
        response = provider === 'deepgram'
          ? await synthesizeWithDeepgram({ text, voice })
          : await synthesizeWithOpenAI({ text, voice });
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          const err = new Error('TTS provider returned non-OK');
          err.upstream_status = response.status;
          err.upstream_error = errorText;
          err.provider = provider;
          throw err;
        }
        break;
      } catch (err) {
        lastErr = err;
        response = null;
        console.error('[Voice] TTS provider error provider:', err?.provider || provider, 'status:', err?.upstream_status, 'error:', err?.upstream_error || err?.message);
      }
    }

    if (!response) {
      ctx.status = 500;
      ctx.body = { error: 'Speech synthesis failed', upstream_status: lastErr?.upstream_status, upstream_error: lastErr?.upstream_error || lastErr?.message };
      return;
    }

    // Return audio as MP3
    ctx.type = 'audio/mpeg';
    ctx.body = response.body;

  } catch (error) {
    console.error('TTS error:', error);
    ctx.status = 500;
    ctx.body = { error: 'Internal server error' };
  }
});

/**
 * Streaming TTS - synthesize and return audio immediately for a sentence
 * POST /api/voice/synthesize-stream
 */
router.post('/synthesize-stream', async (ctx) => {
  const tReqStart = Date.now();
  let tProviderStart = null;
  let tProviderFirstByte = null;
  
  try {
    // Koa body parser already handled the body
    const tBodyReceived = Date.now();
    
    const { text, voice = 'alloy' } = ctx.request.body;
    
    if (!text) {
      ctx.status = 400;
      ctx.body = { error: 'No text provided' };
      return;
    }

    console.log(`[Voice] TTS Stream Request: body received ms: ${tBodyReceived - tReqStart}, text length: ${text.length}, chars: ${text.substring(0, 30)}...`);

    const primaryProvider = getTtsProvider();
    const providers = primaryProvider === 'deepgram' ? ['deepgram', 'openai'] : ['openai', 'deepgram'];

    let response = null;
    let lastErr = null;
    let chosenProvider = null;

    for (const provider of providers) {
      tProviderStart = Date.now();
      try {
        chosenProvider = provider;
        response = provider === 'deepgram'
          ? await synthesizeWithDeepgram({ text, voice })
          : await synthesizeWithOpenAI({ text, voice });

        const tProviderResponse = Date.now();
        console.log(`[Voice] TTS Provider: response headers ms: ${tProviderResponse - tProviderStart}, status: ${response.status}, provider: ${provider}`);

        if (!response.ok) {
          const error = await response.text().catch(() => '');
          const err = new Error('TTS provider returned non-OK');
          err.upstream_status = response.status;
          err.upstream_error = error;
          err.provider = provider;
          throw err;
        }
        break;
      } catch (err) {
        lastErr = err;
        response = null;
        const tProviderResponse = Date.now();
        console.log(`[Voice] TTS Provider: response headers ms: ${tProviderResponse - tProviderStart}, status: ${err?.upstream_status || 'ERR'}, provider: ${provider}`);
        console.error('[Voice] TTS provider error provider:', err?.provider || provider, 'status:', err?.upstream_status, 'error:', err?.upstream_error || err?.message);
      }
    }

    if (!response) {
      ctx.status = 500;
      ctx.body = { error: 'Speech synthesis failed', upstream_status: lastErr?.upstream_status, upstream_error: lastErr?.upstream_error || lastErr?.message };
      return;
    }

    // Track timing and stream directly
    tProviderFirstByte = Date.now();
    console.log(`[Voice] TTS Provider: first byte ms: ${tProviderFirstByte - tProviderStart}, provider: ${chosenProvider}`);
    
    // Stream the audio response directly to client
    ctx.type = 'audio/mpeg';
    ctx.body = response.body;
    
    const tStreamEnd = Date.now();
    console.log(`[Voice] TTS Stream: total duration ms: ${tStreamEnd - tReqStart}, provider ms: ${tStreamEnd - tProviderStart}`);
    
  } catch (error) {
    console.error('[Voice] TTS streaming error:', error);
    ctx.status = 500;
    ctx.body = { error: 'Internal server error' };
  }
});

module.exports = router;
