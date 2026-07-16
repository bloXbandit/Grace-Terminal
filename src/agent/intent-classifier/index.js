/**
 * LLM intent classifier — replaces regex keyword-scoring for task routing.
 *
 * One fast, pinned gpt-4.1-mini call returning structured JSON:
 *   { task_type, complexity, expected_artifacts, needs_execution }
 *
 * Safety contract (fast paths must never get slower or break):
 *   - Hard 2.5s timeout → returns null → caller falls back to legacy regex
 *   - Any parse/LLM failure → null → legacy regex
 *   - Ultra fast-path regexes in auto-reply run BEFORE this and are untouched
 *
 * expected_artifacts feeds the artifact-grounded completion gate directly.
 */
const createLLMInstance = require('@src/completion/llm.one.js');
const { SPECIALIST_ROUTING } = require('@src/agent/specialists/routing.config');

const CLASSIFIER_TIMEOUT_MS = parseInt(process.env.INTENT_CLASSIFIER_TIMEOUT_MS || '2500', 10);
const CLASSIFIER_MODEL = process.env.INTENT_CLASSIFIER_MODEL || 'gpt-4.1-mini';

// Short-lived memo so downstream stages (artifact verification in AgenticAgent)
// can read the classification without re-calling the LLM or invasive plumbing.
const CACHE_TTL_MS = 10 * 60 * 1000;
const _cache = new Map(); // key -> { classification, at }
const cacheKey = (conversation_id, goal) => `${conversation_id}:${(goal || '').slice(0, 200)}`;

const getCachedClassification = (conversation_id, goal) => {
  const hit = _cache.get(cacheKey(conversation_id, goal));
  if (hit && (Date.now() - hit.at) < CACHE_TTL_MS) return hit.classification;
  return null;
};

const VALID_TASK_TYPES = new Set([...Object.keys(SPECIALIST_ROUTING), 'general_chat']);

const buildPrompt = (userMessage, context = {}) => {
  const taskTypes = Array.from(VALID_TASK_TYPES).join(', ');
  return `Classify this user request for an AI agent platform. Return ONLY minified JSON, no fences, no commentary.

Schema:
{"task_type":"<one of: ${taskTypes}>","complexity":"simple|moderate|complex","expected_artifacts":["<filenames or extensions the task should produce, e.g. index.html, .xlsx — empty array if none>"],"needs_execution":<true if code/files/tools must run, false for pure conversation>,"needs_web_search":<true if answering well requires CURRENT information from the web>}

Rules:
- task_type must be EXACTLY one of the listed values
- website/webpage/landing page/frontend UI → website_generation
- building an app/api/backend/script → code_generation
- documents/spreadsheets/data files → data_generation
- questions, chit-chat, advice → general_chat
- expected_artifacts: name concrete deliverable files when the request implies them (a dashboard with frontend → ["index.html"]; flask api → ["app.py"])
- needs_web_search=true for: current events, news, prices, scores, weather, recent releases, "search/look up/find online", facts that change over time. false for: general knowledge, coding, math, creative writing, chit-chat
${context.hasFiles ? '- The user has uploaded files; analysis/modification of them is likely.\n' : ''}
User request: "${(userMessage || '').slice(0, 800)}"

JSON:`;
};

/** Tolerant JSON extraction (fences, brace-slice). */
const parseClassification = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  let text = raw.trim().replace(/```(?:json)?/gi, '').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last <= first) return null;
  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!VALID_TASK_TYPES.has(parsed.task_type)) return null;
    return {
      task_type: parsed.task_type,
      complexity: ['simple', 'moderate', 'complex'].includes(parsed.complexity) ? parsed.complexity : 'moderate',
      expected_artifacts: Array.isArray(parsed.expected_artifacts)
        ? parsed.expected_artifacts.filter(a => typeof a === 'string' && a.length < 80).slice(0, 8)
        : [],
      needs_execution: parsed.needs_execution === true,
      needs_web_search: parsed.needs_web_search === true
    };
  } catch {
    return null;
  }
};

/**
 * Classify a user message. Returns the classification object or null
 * (null = caller must fall back to legacy regex detection).
 */
const classifyIntent = async (userMessage, context = {}) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !userMessage) return null;

  const model_info = {
    model_name: CLASSIFIER_MODEL,
    platform_name: 'openai',
    api_key: apiKey,
    api_url: 'https://api.openai.com/v1/chat/completions',
    base_url: 'https://api.openai.com/v1',
    is_subscribe: false
  };

  const started = Date.now();
  try {
    const llm = await createLLMInstance(`provider#openai#${CLASSIFIER_MODEL}`, () => {}, { model_info });
    const completion = llm.completion(buildPrompt(userMessage, context), {}, {
      temperature: 0,
      max_tokens: 200,
      stream: true,
      skip_system_prompt: true
    });
    const raw = await Promise.race([
      completion,
      new Promise((_, reject) => setTimeout(() => reject(new Error('classifier timeout')), CLASSIFIER_TIMEOUT_MS))
    ]);
    const result = parseClassification(raw);
    console.log(`[IntentClassifier] ${Date.now() - started}ms →`, result ? `${result.task_type} (${result.complexity}) artifacts=${JSON.stringify(result.expected_artifacts)}` : 'unparseable → regex fallback');
    if (result && context.conversation_id) {
      _cache.set(cacheKey(context.conversation_id, userMessage), { classification: result, at: Date.now() });
    }
    return result;
  } catch (err) {
    console.warn(`[IntentClassifier] failed after ${Date.now() - started}ms (${err.message}) → regex fallback`);
    return null;
  }
};

module.exports = { classifyIntent, parseClassification, getCachedClassification, VALID_TASK_TYPES };
