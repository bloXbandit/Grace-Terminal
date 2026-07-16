/**
 * Lesson Memory — Grace's "learn as she goes" flywheel.
 *
 * Closes the open loop: she has a detailed execution diary (task_executions,
 * 1000s of rows) she never re-read. This distills task outcomes into ONE-LINE
 * lessons, stores them capped (never bloats), and injects the few RELEVANT ones
 * into future planning/thinking — cheaply.
 *
 * Latency contract: distillation is ASYNC (fires after the response streams).
 * Retrieval is a single indexed DB query + keyword scoring in JS — no LLM call,
 * a few milliseconds. Injection adds ~5 lines to a prompt. Zero critical-path cost.
 */
const sequelize = require('@src/models');
const { QueryTypes } = require('sequelize');

const MAX_LESSONS_PER_CATEGORY = parseInt(process.env.LESSON_CAP_PER_CATEGORY || '25', 10);
const RETRIEVE_TOP_K = 4;

let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS agent_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      keywords TEXT NOT NULL,
      lesson TEXT NOT NULL,
      outcome TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME
    )
  `);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS agent_lessons_category ON agent_lessons(category)`);
  _tableReady = true;
}

const STOPWORDS = new Set(['the','a','an','to','for','of','and','or','with','in','on','my','me','you','your','please','can','create','make','build','write','generate','it','that','this','add','file']);

function extractKeywords(text) {
  return [...new Set((text || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w)))].slice(0, 12);
}

/**
 * STORE a lesson. Enforces the per-category cap by evicting the lowest-value
 * (least-used, oldest) lesson when over. Dedupes near-identical lessons.
 */
async function storeLesson({ category, keywords, lesson, outcome = 'success', weight = 1.0 }) {
  await ensureTable();
  if (!lesson || !category) return;

  // dedupe: same category + very similar lesson text → bump weight instead of dup
  const existing = await sequelize.query(
    `SELECT id, weight FROM agent_lessons WHERE category = :category AND lesson = :lesson LIMIT 1`,
    { replacements: { category, lesson }, type: QueryTypes.SELECT }
  );
  if (existing.length > 0) {
    await sequelize.query(`UPDATE agent_lessons SET weight = weight + 0.5 WHERE id = :id`,
      { replacements: { id: existing[0].id } });
    return;
  }

  await sequelize.query(
    `INSERT INTO agent_lessons (category, keywords, lesson, outcome, weight) VALUES (:category, :keywords, :lesson, :outcome, :weight)`,
    { replacements: { category, keywords: (keywords || []).join(' '), lesson, outcome, weight } }
  );

  // enforce cap
  const rows = await sequelize.query(
    `SELECT id FROM agent_lessons WHERE category = :category ORDER BY (weight + use_count * 0.3) DESC, created_at DESC`,
    { replacements: { category }, type: QueryTypes.SELECT }
  );
  if (rows.length > MAX_LESSONS_PER_CATEGORY) {
    const evict = rows.slice(MAX_LESSONS_PER_CATEGORY).map(r => r.id);
    await sequelize.query(`DELETE FROM agent_lessons WHERE id IN (${evict.map(() => '?').join(',')})`,
      { replacements: evict });
  }
}

/**
 * RETRIEVE the top-K lessons relevant to a goal. Pure DB + keyword scoring,
 * no LLM. Returns a formatted block ready to inject, or '' when nothing matches.
 */
async function retrieveLessons(goal, category = null) {
  try {
    await ensureTable();
    const goalWords = new Set(extractKeywords(goal));
    if (goalWords.size === 0) return '';

    const where = category ? `WHERE category = :category` : '';
    const rows = await sequelize.query(
      `SELECT id, category, keywords, lesson, outcome, weight, use_count FROM agent_lessons ${where}`,
      { replacements: category ? { category } : {}, type: QueryTypes.SELECT }
    );
    if (rows.length === 0) return '';

    const scored = rows.map(r => {
      const lw = (r.keywords || '').split(/\s+/);
      const overlap = lw.filter(w => goalWords.has(w)).length;
      // relevance = keyword overlap, tie-broken by weight/usage
      const score = overlap * 10 + r.weight + r.use_count * 0.2;
      return { ...r, overlap, score };
    }).filter(r => r.overlap > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, RETRIEVE_TOP_K);

    if (scored.length === 0) return '';

    // bump usage (async, don't await hard)
    const ids = scored.map(s => s.id);
    sequelize.query(`UPDATE agent_lessons SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP WHERE id IN (${ids.map(() => '?').join(',')})`,
      { replacements: ids }).catch(() => {});

    const lines = scored.map(s => `- ${s.outcome === 'failure' ? '⚠️ AVOID' : '✅'} ${s.lesson}`).join('\n');
    return `\n\n**LESSONS FROM PAST WORK (apply what's relevant):**\n${lines}\n`;
  } catch (e) {
    console.warn('[LessonMemory] retrieve failed (non-fatal):', e.message);
    return '';
  }
}

/**
 * DISTILL a completed task into a lesson — ASYNC, off the critical path.
 * Only distills NOTABLE outcomes (failures, or multi-step successes) so trivial
 * chat doesn't bloat the store. Uses one cheap LLM call.
 */
async function distillAndStore({ goal, taskType, status, tasks = [], verifiedFiles = [], conversation_id }) {
  try {
    // filter: skip trivial. Distill failures always; successes only if multi-task or produced files.
    const isFailure = status === 'failed' || status === 'partial_failure';
    const isSubstantial = (tasks.length >= 2) || (verifiedFiles.length >= 1);
    if (!isFailure && !isSubstantial) return;
    if (!goal || goal.length < 8) return;

    const call = require('@src/utils/llm');
    const taskSummary = tasks.slice(0, 6).map(t => `${t.title || t.description || ''} [${t.status || '?'}]`).join('; ');
    const prompt = `A coding/document AI agent just finished a task. Distill ONE reusable lesson (max 20 words) that would help it do similar tasks better next time. Focus on the APPROACH that worked or the mistake to avoid — not the specific content.

Goal: ${goal.slice(0, 300)}
Outcome: ${status}
Steps taken: ${taskSummary.slice(0, 400)}
Files produced: ${verifiedFiles.join(', ') || 'none'}

Respond with ONLY the lesson sentence, no preamble. If there is no generalizable lesson, respond exactly: NONE`;

    const raw = await call(prompt, conversation_id, 'assistant', {
      temperature: 0.3, max_tokens: 60, skip_system_prompt: true
    });
    const lesson = String(raw || '').trim().replace(/^["'\-\s]+|["'\s]+$/g, '');
    if (!lesson || lesson === 'NONE' || lesson.length < 8 || lesson.length > 200) return;

    await storeLesson({
      category: taskType || 'general',
      keywords: extractKeywords(goal + ' ' + lesson),
      lesson,
      outcome: isFailure ? 'failure' : 'success',
      weight: isFailure ? 1.5 : 1.0 // failures weighted higher — avoid-lessons matter more
    });
    console.log(`[LessonMemory] 📚 learned (${taskType}): ${lesson}`);
  } catch (e) {
    console.warn('[LessonMemory] distill failed (non-fatal):', e.message);
  }
}

module.exports = { storeLesson, retrieveLessons, distillAndStore, extractKeywords, ensureTable };
