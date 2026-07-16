/**
 * Search augmentation — intelligent web search for ANY path level.
 *
 * Decides whether a message needs current web information (classifier signal
 * first, explicit-request/current-info regex fallback), runs the search, and
 * returns a formatted context block to prepend to the LLM prompt.
 *
 * Used by chat mode (which cannot run tool loops) so current-events questions
 * get grounded answers instead of stale hallucinations. The agentic path keeps
 * its native <web_search> action for multi-step research.
 */
const WebSearchTool = require('@src/tools/WebSearch');

// Explicit ask OR current-info signals (fallback when classifier unavailable)
const EXPLICIT_SEARCH_RE = /\b(search( the)? (web|internet|online)|look (it |this )?up|google (it|this|for)|find (out |info(rmation)? )?(about |on )?(the )?(latest|current|recent)|browse the web)\b/i;
const CURRENT_INFO_RE = /\b(latest|current|today'?s?|tonight|yesterday|this (week|month|year)|right now|breaking|news about|price of|stock price|score(s)? (of|for|in)|who won|weather (in|for|today)|release date|just (released|announced|dropped))\b/i;

/** Fast heuristic: does this message need a web search? (used when no classifier verdict) */
const heuristicNeedsSearch = (message = '') => {
  const m = message.toLowerCase();
  if (EXPLICIT_SEARCH_RE.test(m)) return true;
  if (CURRENT_INFO_RE.test(m)) return true;
  return false;
};

/**
 * Decide + search + format. Returns '' when no search is warranted or it fails —
 * callers just prepend the returned string, so the failure mode is "answer
 * without search", never a broken reply.
 *
 * @param {string} message           the user message
 * @param {object} opts
 * @param {string} opts.conversation_id
 * @param {boolean|null} opts.classifierSaysSearch  needs_web_search from the intent
 *        classifier (true/false), or null when no classification is available
 * @param {function} [opts.onStatus] optional callback for a UI status line
 * @returns {Promise<string>} context block or ''
 */
const maybeAugmentWithSearch = async (message, { conversation_id = '', classifierSaysSearch = null, onStatus = null } = {}) => {
  let should;
  if (classifierSaysSearch === true) should = true;
  else if (classifierSaysSearch === false) should = EXPLICIT_SEARCH_RE.test(message); // explicit ask overrides
  else should = heuristicNeedsSearch(message);

  if (!should) return '';

  try {
    if (onStatus) onStatus('🔎 Searching the web...');
    const started = Date.now();
    const result = await Promise.race([
      WebSearchTool.execute({ query: buildQuery(message), num_results: 3, conversation_id }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('search timeout')), 12000))
    ]);
    const text = typeof result === 'string' ? result : (result && result.content) || '';
    if (!text || text.length < 40) return '';
    console.log(`[SearchAugment] search completed in ${Date.now() - started}ms (${text.length} chars)`);

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `\n\n[WEB SEARCH RESULTS — retrieved ${today}. Use these as your PRIMARY source for anything time-sensitive; your training data may be outdated. Cite the source site names naturally (e.g. "according to Wikipedia"). If the results don't answer the question, say what you found and what's missing — do not fill gaps from memory for time-sensitive facts.]\n${text.slice(0, 6000)}\n[END WEB SEARCH RESULTS]\n\n`;
  } catch (e) {
    console.warn('[SearchAugment] failed (answering without search):', e.message);
    return '';
  }
};

/** Turn a conversational message into a search-friendly query. */
const buildQuery = (message = '') => {
  return message
    .replace(/\b(please|can you|could you|would you|hey|hi|grace|for me|search( the)? (web|internet|online)( for)?|look up|google)\b/gi, ' ')
    .replace(/[?!.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || message.slice(0, 120);
};

module.exports = { maybeAugmentWithSearch, heuristicNeedsSearch, buildQuery };
