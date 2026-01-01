const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class HuggingFaceEditService {
  constructor() {
    this.token = process.env.HUGGINGFACE_TOKEN;
    this.sourceSpace = 'sczhou/CodeFormer';
    this.client = null;
    this.endpointConfig = null;
  }

  async _loadGradio() {
    return import('@gradio/client');
  }

  async _ensureClient() {
    if (this.client) return this.client;
    if (!this.token) {
      throw new Error('HUGGINGFACE_TOKEN is required for Hugging Face Space duplication');
    }

    console.log('[HF] Duplicating space...');

    const { Client } = await this._loadGradio();

    this.client = await Client.duplicate(this.sourceSpace, {
      token: this.token,
      private: true,
      timeout: 60,
      hardware: 'cpu-basic'
    });

    console.log('[HF] ✅ Ready');
    return this.client;
  }

  _inferFidelity(prompt) {
    const q = String(prompt || '').toLowerCase();
    if (/\b(restore|enhance|improve|repair|upscale)\b/i.test(q)) return 0.7;
    if (/\b(muscular|buff|transform|beautify|glow\s*up|make\s+fit)\b/i.test(q)) return 0.3;
    return 0.5;
  }

  _sanitizeKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  _collectEndpoints(apiInfo) {
    const endpoints = [];
    if (!apiInfo || typeof apiInfo !== 'object') return endpoints;

    const named = apiInfo.named_endpoints;
    if (named && typeof named === 'object') {
      for (const [endpoint, spec] of Object.entries(named)) {
        endpoints.push({ endpoint, spec });
      }
    }

    const unnamed = apiInfo.unnamed_endpoints;
    if (Array.isArray(unnamed)) {
      for (const spec of unnamed) {
        if (spec && typeof spec === 'object') {
          const endpoint = spec.api_name || spec.endpoint || '/predict';
          endpoints.push({ endpoint, spec });
        }
      }
    }

    return endpoints;
  }

  _inferEndpointConfig(apiInfo) {
    const endpoints = this._collectEndpoints(apiInfo);
    if (endpoints.length === 0) {
      return {
        endpoint: '/predict',
        keys: {
          image: 'image',
          fidelity: 'fidelity',
          upscale: 'upscale',
          face_align: 'face_align',
          background_enhance: 'background_enhance',
          face_upsample: 'face_upsample'
        }
      };
    }

    const scoreEndpoint = (spec) => {
      const params = Array.isArray(spec?.parameters) ? spec.parameters : [];
      const names = params
        .map((p) => p?.parameter_name || p?.name || p?.label)
        .filter(Boolean)
        .map((n) => String(n).toLowerCase());

      let score = 0;
      if (names.some((n) => n.includes('image'))) score += 5;
      if (names.some((n) => n.includes('fidelity'))) score += 5;
      if (names.some((n) => n.includes('upscale'))) score += 2;
      if (names.some((n) => n.includes('face') && n.includes('align'))) score += 1;
      if (names.some((n) => n.includes('background') && n.includes('enhance'))) score += 1;
      if (names.some((n) => n.includes('face') && n.includes('upsample'))) score += 1;
      return score;
    };

    let best = null;
    for (const e of endpoints) {
      const s = scoreEndpoint(e.spec);
      if (!best || s > best.score) {
        best = { ...e, score: s };
      }
    }

    const params = Array.isArray(best?.spec?.parameters) ? best.spec.parameters : [];
    const resolveKey = (candidates) => {
      for (const p of params) {
        const n = p?.parameter_name || p?.name || p?.label;
        if (!n) continue;
        const low = String(n).toLowerCase();
        if (candidates.some((c) => low.includes(c))) {
          return p?.parameter_name || p?.name || this._sanitizeKey(p?.label);
        }
      }
      return null;
    };

    const keys = {
      image: resolveKey(['image']) || 'image',
      fidelity: resolveKey(['fidelity']) || 'fidelity',
      upscale: resolveKey(['upscale', 'scale']) || 'upscale',
      face_align: resolveKey(['face_align', 'align']) || 'face_align',
      background_enhance: resolveKey(['background_enhance', 'background']) || 'background_enhance',
      face_upsample: resolveKey(['face_upsample', 'upsample']) || 'face_upsample'
    };

    return { endpoint: best.endpoint || '/predict', keys };
  }

  _findFirstUrl(obj) {
    if (!obj) return null;
    if (typeof obj === 'string') {
      if (obj.startsWith('http://') || obj.startsWith('https://')) return obj;
      if (obj.startsWith('data:')) return obj;
      return null;
    }
    if (Array.isArray(obj)) {
      for (const v of obj) {
        const found = this._findFirstUrl(v);
        if (found) return found;
      }
      return null;
    }
    if (typeof obj === 'object') {
      const url = obj.url || obj.download_url || obj.path;
      if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
        return url;
      }
      for (const v of Object.values(obj)) {
        const found = this._findFirstUrl(v);
        if (found) return found;
      }
    }
    return null;
  }

  async enhanceFace({
    imagePath,
    prompt = '',
    fidelity = null,
    upscale = 2,
    face_align = true,
    background_enhance = true,
    face_upsample = true,
    outputPath
  }) {
    if (!imagePath) throw new Error('imagePath is required');

    const client = await this._ensureClient();

    if (!this.endpointConfig) {
      const apiInfo = await client.view_api();
      this.endpointConfig = this._inferEndpointConfig(apiInfo);
    }

    const { handle_file } = await this._loadGradio();

    const finalFidelity = typeof fidelity === 'number' ? fidelity : this._inferFidelity(prompt);
    const { endpoint, keys } = this.endpointConfig;

    console.log('[HF] 🎨 Enhancing face...');

    const payload = {
      [keys.image]: handle_file(imagePath),
      [keys.fidelity]: finalFidelity,
      [keys.upscale]: upscale,
      [keys.face_align]: face_align,
      [keys.background_enhance]: background_enhance,
      [keys.face_upsample]: face_upsample
    };

    const result = await Promise.race([
      client.predict(endpoint, payload),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Hugging Face request timeout')), 120000))
    ]);

    const data = result?.data;
    const urlOrData = this._findFirstUrl(data) || this._findFirstUrl(result);

    if (!urlOrData) {
      throw new Error('No output file URL returned from Hugging Face');
    }

    if (!outputPath) {
      const base = path.basename(imagePath, path.extname(imagePath));
      const dir = path.dirname(imagePath);
      outputPath = path.join(dir, `${base}_codeformer_${Date.now()}.png`);
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    if (urlOrData.startsWith('data:')) {
      const commaIdx = urlOrData.indexOf(',');
      if (commaIdx === -1) throw new Error('Invalid data URL');
      const meta = urlOrData.slice(0, commaIdx);
      const b64 = urlOrData.slice(commaIdx + 1);
      const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
      const mime = mimeMatch && mimeMatch[1] ? mimeMatch[1].toLowerCase() : 'image/png';
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
      outputPath = outputPath.replace(/\.[a-z0-9]+$/i, `.${ext}`);
      await fs.writeFile(outputPath, Buffer.from(b64, 'base64'));
    } else {
      const resp = await axios.get(urlOrData, { responseType: 'arraybuffer' });
      const ct = String(resp.headers['content-type'] || '').toLowerCase();
      if (ct.includes('jpeg') || ct.includes('jpg')) {
        outputPath = outputPath.replace(/\.[a-z0-9]+$/i, '.jpg');
      }
      await fs.writeFile(outputPath, Buffer.from(resp.data));
    }

    return {
      success: true,
      outputPath,
      fidelity: finalFidelity,
      endpoint
    };
  }
}

module.exports = HuggingFaceEditService;
