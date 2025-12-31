const axios = require('axios');

class TextToVideoService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = 'sora-2-pro';
    this.apiBase = 'https://api.openai.com/v1';
    this.initialized = false;
    
    // Sora API constraints
    this.validSizes = {
      'landscape': '1280x720',      // 16:9 landscape
      'portrait': '720x1280',       // 9:16 portrait (default)
      'wide': '1792x1024',          // Ultra-wide landscape
      'tall': '1024x1792',          // Ultra-tall portrait
      '16:9': '1280x720',
      '9:16': '720x1280',
      '1280x720': '1280x720',
      '720x1280': '720x1280',
      '1792x1024': '1792x1024',
      '1024x1792': '1024x1792'
    };
    this.validDurations = ['4', '8', '12']; // seconds as strings
  }

  async initialize() {
    if (this.initialized) return;
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    this.initialized = true;
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Parse video parameters from user's natural language request
   * @param {string} request - User's request text
   * @returns {Object} - { duration, size, cleanPrompt }
   */
  parseVideoRequest(request) {
    const q = (request || '').toLowerCase();
    let duration = '4'; // default 4 seconds
    let size = '1280x720'; // default landscape
    let cleanPrompt = request;

    // Parse duration
    const durationMatch = q.match(/(\d+)\s*(?:sec(?:ond)?s?|s\b)/i);
    if (durationMatch) {
      const secs = parseInt(durationMatch[1]);
      if (secs <= 4) duration = '4';
      else if (secs <= 8) duration = '8';
      else duration = '12';
      // Remove duration from prompt
      cleanPrompt = cleanPrompt.replace(durationMatch[0], '').trim();
    }

    // Parse aspect ratio / orientation
    if (/\b(portrait|vertical|tiktok|reels?|story|stories|9:16|9x16)\b/i.test(q)) {
      size = '720x1280';
    } else if (/\b(landscape|horizontal|wide|widescreen|youtube|16:9|16x9)\b/i.test(q)) {
      size = '1280x720';
    } else if (/\b(ultra-?wide|cinematic|movie|film)\b/i.test(q)) {
      size = '1792x1024';
    } else if (/\b(tall|extra-?tall|pinterest)\b/i.test(q)) {
      size = '1024x1792';
    }

    // Clean up prompt - remove video generation keywords to get cleaner subject
    cleanPrompt = cleanPrompt
      .replace(/\b(create|make|generate|produce|render)\s+(a\s+|an\s+|the\s+|me\s+)?/gi, '')
      .replace(/\b(video|movie|film|clip|animation|footage)\s+(of|about|showing|with)?\s*/gi, '')
      .replace(/\b(portrait|vertical|landscape|horizontal|wide|widescreen|tiktok|reels?|youtube)\s*/gi, '')
      .replace(/\b(short|long|quick|brief)\s*/gi, '')
      .replace(/^\s*(a|an|the)\s+/i, '')
      .trim();

    // Ensure we have a valid prompt
    if (!cleanPrompt || cleanPrompt.length < 3) {
      cleanPrompt = request; // fallback to original
    }

    console.log(`[TextToVideo] Parsed request: duration=${duration}s, size=${size}, prompt="${cleanPrompt.substring(0, 50)}..."`);

    return { duration, size, cleanPrompt };
  }

  async createVideo(prompt, options = {}) {
    await this.initialize();

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt must be a non-empty string');
    }

    const {
      model = this.model,
      size,
      seconds,
      maxWaitMs = 5 * 60 * 1000,
      pollIntervalMs = 2500
    } = options;

    const body = {
      model,
      prompt
    };

    // Add size if provided and valid
    if (size) {
      const resolvedSize = this.validSizes[size] || size;
      if (Object.values(this.validSizes).includes(resolvedSize)) {
        body.size = resolvedSize;
      }
    }
    
    // Add duration if provided and valid (must be string)
    if (seconds) {
      const secStr = String(seconds);
      if (this.validDurations.includes(secStr)) {
        body.seconds = secStr;
      }
    }

    let video;
    try {
      const res = await axios.post(`${this.apiBase}/videos`, body, {
        headers: this._headers(),
        timeout: 300000
      });
      video = res.data;
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Unknown error';
      throw new Error(`Video creation failed: ${msg}`);
    }

    const videoId = video?.id;
    if (!videoId) {
      throw new Error('Video creation failed: missing video id');
    }

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      let statusObj;
      try {
        const st = await axios.get(`${this.apiBase}/videos/${videoId}`, {
          headers: this._headers(),
          timeout: 300000
        });
        statusObj = st.data;
      } catch (e) {
        const msg = e?.response?.data?.error?.message || e?.message || 'Unknown error';
        throw new Error(`Video status check failed: ${msg}`);
      }

      const status = (statusObj?.status || statusObj?.state || '').toLowerCase();

      if (status === 'succeeded' || status === 'completed' || status === 'success') {
        return { id: videoId, status: statusObj };
      }

      if (status === 'failed' || status === 'error' || status === 'canceled' || status === 'cancelled') {
        const errMsg = statusObj?.error?.message || statusObj?.error || 'Video generation failed';
        throw new Error(String(errMsg));
      }

      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    throw new Error('Video generation timed out');
  }

  async downloadVideoBytes(videoId) {
    await this.initialize();

    if (!videoId || typeof videoId !== 'string') {
      throw new Error('videoId must be a non-empty string');
    }

    try {
      const res = await axios.get(`${this.apiBase}/videos/${videoId}/content`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        },
        responseType: 'arraybuffer',
        timeout: 300000
      });
      return Buffer.from(res.data);
    } catch (e) {
      const msg = e?.response?.data?.error?.message || e?.message || 'Unknown error';
      throw new Error(`Video download failed: ${msg}`);
    }
  }

  async generateVideo(prompt, options = {}) {
    const { id } = await this.createVideo(prompt, options);
    const bytes = await this.downloadVideoBytes(id);
    return {
      success: true,
      data: {
        videoId: id,
        bytes
      }
    };
  }
}

module.exports = TextToVideoService;
