/**
 * Provider availability + model substitution layer.
 *
 * routing.config.js keeps the INTENDED models (mostly openrouter/*). At call time,
 * if the configured provider is unavailable (dead key, network, 401), we transparently
 * substitute the nearest equivalent on a working provider. When the original provider
 * comes back (e.g. a fresh OpenRouter key in .env), routing snaps back automatically —
 * no config edits needed.
 *
 * Health checks are cached for HEALTH_TTL_MS to avoid latency on every specialist call.
 */
const axios = require('axios');

const HEALTH_TTL_MS = 5 * 60 * 1000; // re-probe a provider at most every 5 minutes
const PROBE_TIMEOUT_MS = 4000;

// provider -> { ok: boolean, checkedAt: number }
const _healthCache = {};

/** CrofAI key, tolerant of any env-var casing/underscore style
 *  (CROFAI_API_KEY, CrofAI_API_KEY, Crof_AI_API_KEY, crofai_api_key, …). */
function getCrofAIKey() {
  for (const [k, v] of Object.entries(process.env)) {
    if (k.toLowerCase().replace(/_/g, '') === 'crofaiapikey' && v) return v;
  }
  return '';
}

const PROBES = {
  openrouter: async () => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return false;
    const res = await axios.get('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${key}` }, timeout: PROBE_TIMEOUT_MS,
      validateStatus: () => true
    });
    return res.status === 200;
  },
  openai: async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return false;
    const res = await axios.get('https://api.openai.com/v1/models/gpt-4.1-mini', {
      headers: { Authorization: `Bearer ${key}` }, timeout: PROBE_TIMEOUT_MS,
      validateStatus: () => true
    });
    return res.status === 200;
  },
  moonshot: async () => {
    const key = process.env.MOONSHOT_API_KEY;
    if (!key) return false;
    const res = await axios.get('https://api.moonshot.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` }, timeout: PROBE_TIMEOUT_MS,
      validateStatus: () => true
    });
    return res.status === 200;
  },
  gemini: async () => {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) return false;
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
      timeout: PROBE_TIMEOUT_MS, validateStatus: () => true
    });
    return res.status === 200;
  },
  crofai: async () => {
    // CrofAI (crof.ai) — OpenAI-compatible, cheap open models.
    // /v1/models is public, so availability = key present + API reachable;
    // key validity surfaces at call time.
    const key = getCrofAIKey();
    if (!key) return false;
    const res = await axios.get('https://crof.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}` }, timeout: PROBE_TIMEOUT_MS,
      validateStatus: () => true
    });
    return res.status === 200;
  }
};

async function isProviderAvailable(provider) {
  const p = (provider || '').toLowerCase();
  if (!PROBES[p]) return true; // unknown providers: assume ok, let the call surface errors
  const cached = _healthCache[p];
  if (cached && (Date.now() - cached.checkedAt) < HEALTH_TTL_MS) return cached.ok;
  let ok = false;
  try {
    ok = await PROBES[p]();
  } catch {
    ok = false;
  }
  _healthCache[p] = { ok, checkedAt: Date.now() };
  if (!ok) console.warn(`[ProviderHealth] Provider '${p}' is UNAVAILABLE (cached ${HEALTH_TTL_MS / 60000}min)`);
  return ok;
}

/**
 * Capability tiers, in preference order per tier. Substitution walks the tier
 * until it finds a model whose provider is currently available.
 */
const TIER_CHAINS = {
  strong: ['openai/gpt-5.2', 'crofai/deepseek-v4-pro', 'moonshot/kimi-k2-turbo-preview', 'gemini/gemini-2.5-pro'],
  fast: ['crofai/deepseek-v4-flash', 'openai/gpt-4.1-mini', 'moonshot/kimi-k2-turbo-preview', 'gemini/gemini-2.5-flash'],
  code: ['crofai/kimi-k2.7-code', 'openai/gpt-5.2', 'moonshot/kimi-k2-turbo-preview'],
  creative: ['crofai/glm-5.2', 'moonshot/kimi-k2-turbo-preview', 'openai/gpt-5.2']
};

/** Map each configured model to the tier used when its provider is down. */
const MODEL_TIERS = {
  'openrouter/anthropic/claude-sonnet-4.5': 'code',
  'openrouter/openai/gpt-5-pro': 'strong',
  'openrouter/anthropic/claude-3-opus': 'strong',
  'openrouter/deepseek/deepseek-r1': 'strong',
  'openrouter/deepseek/deepseek-coder': 'code',
  'openrouter/z-ai/glm-4.6': 'strong',
  'openrouter/qwen/qwen3-coder-30b-a3b-instruct': 'fast',
  'openrouter/qwen/qwen3-30b-a3b': 'fast',
  'openrouter/openai/gpt-oss-20b': 'fast',
  'openrouter/microsoft/phi-4': 'fast',
  'openrouter/gryphe/mythomax-l2-13b': 'creative',
  'openrouter/openai/sora-2-pro': 'strong',
  'openrouter/google/gemini-3-pro': 'strong',
  'gemini/gemini-3-pro-preview': 'strong',
  'openai/o1-preview': 'strong'
};

/**
 * Resolve a configured model path to one whose provider is currently available.
 * Returns { modelPath, substituted } — substituted=true when a swap happened.
 */
async function resolveAvailableModel(modelPath) {
  const provider = (modelPath || '').split('/')[0];
  if (await isProviderAvailable(provider)) {
    return { modelPath, substituted: false };
  }
  const tier = MODEL_TIERS[modelPath] || 'strong';
  for (const candidate of TIER_CHAINS[tier]) {
    const candProvider = candidate.split('/')[0];
    if (candProvider === provider) continue; // already known dead
    if (await isProviderAvailable(candProvider)) {
      console.log(`[ProviderHealth] '${modelPath}' unavailable → substituting '${candidate}' (tier: ${tier})`);
      return { modelPath: candidate, substituted: true };
    }
  }
  console.warn(`[ProviderHealth] No available substitute for '${modelPath}'; using as configured`);
  return { modelPath, substituted: false };
}

/** Test hook: clear the health cache (e.g. after rotating a key at runtime). */
function resetHealthCache() {
  for (const k of Object.keys(_healthCache)) delete _healthCache[k];
}

module.exports = { isProviderAvailable, resolveAvailableModel, resetHealthCache, getCrofAIKey, TIER_CHAINS, MODEL_TIERS };
