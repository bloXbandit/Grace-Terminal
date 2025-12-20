const router = require('koa-router')();
const fetch = require('node-fetch');

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

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('TTS API error:', error);
      ctx.status = 500;
      ctx.body = { error: 'Speech synthesis failed' };
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
  try {
    const { text, voice = 'alloy' } = ctx.request.body;
    
    if (!text) {
      ctx.status = 400;
      ctx.body = { error: 'No text provided' };
      return;
    }

    // console.log('[Voice] Streaming TTS for:', text.substring(0, 50) + '...');

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Voice] TTS API error:', error);
      ctx.status = 500;
      ctx.body = { error: 'Speech synthesis failed' };
      return;
    }

    // Stream the audio response directly to client
    ctx.type = 'audio/mpeg';
    ctx.body = response.body;
    
  } catch (error) {
    console.error('[Voice] TTS streaming error:', error);
    ctx.status = 500;
    ctx.body = { error: 'Internal server error' };
  }
});

module.exports = router;
