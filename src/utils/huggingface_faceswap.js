const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class HuggingFaceFaceSwapService {
  constructor() {
    this.token = process.env.HUGGINGFACE_TOKEN;
    this.sourceSpace = 'tonyassi/face-swap';
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

    const { Client } = await this._loadGradio();

    this.client = await Client.duplicate(this.sourceSpace, {
      token: this.token,
      private: true,
      timeout: 60,
      hardware: 'cpu-basic'
    });

    return this.client;
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
          source: 'source',
          target: 'target'
        }
      };
    }

    const scoreEndpoint = (spec) => {
      const params = Array.isArray(spec?.parameters) ? spec.parameters : [];
      const names = params
        .map((p) => p?.parameter_name || p?.name || p?.label)
        .filter(Boolean)
        .map((n) => String(n).toLowerCase());

      let imageCount = 0;
      for (const n of names) {
        if (n.includes('image') || n.includes('photo') || n.includes('pic')) imageCount += 1;
      }

      let score = 0;
      score += Math.min(imageCount, 3) * 4;
      if (names.some((n) => n.includes('source') || n.includes('src'))) score += 4;
      if (names.some((n) => n.includes('target') || n.includes('dst'))) score += 4;
      if (names.some((n) => n.includes('swap') || n.includes('face'))) score += 2;
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

    const imageParams = params
      .map((p) => ({
        key: p?.parameter_name || p?.name || this._sanitizeKey(p?.label),
        name: String(p?.parameter_name || p?.name || p?.label || '').toLowerCase()
      }))
      .filter((p) => p.key && (p.name.includes('image') || p.name.includes('photo') || p.name.includes('pic')));

    const keys = {
      source: resolveKey(['source', 'src']) || (imageParams[0] && imageParams[0].key) || 'source',
      target: resolveKey(['target', 'dst']) || (imageParams[1] && imageParams[1].key) || (imageParams[0] && imageParams[0].key) || 'target'
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

  async swapFace({
    sourceImagePath,
    targetImagePath,
    outputPath
  }) {
    if (!sourceImagePath) throw new Error('sourceImagePath is required');
    if (!targetImagePath) throw new Error('targetImagePath is required');

    const client = await this._ensureClient();

    if (!this.endpointConfig) {
      const apiInfo = await client.view_api();
      this.endpointConfig = this._inferEndpointConfig(apiInfo);
    }

    const { handle_file } = await this._loadGradio();
    const { endpoint, keys } = this.endpointConfig;

    const payload = {
      [keys.source]: handle_file(sourceImagePath),
      [keys.target]: handle_file(targetImagePath)
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
      const base = path.basename(targetImagePath, path.extname(targetImagePath));
      const dir = path.dirname(targetImagePath);
      outputPath = path.join(dir, `${base}_faceswap_${Date.now()}.png`);
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

    return { success: true, outputPath, endpoint };
  }
}

module.exports = HuggingFaceFaceSwapService;
