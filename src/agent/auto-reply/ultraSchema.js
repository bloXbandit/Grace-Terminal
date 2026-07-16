/**
 * Ultra fast-path document schema parsing utilities.
 *
 * Extracted from auto-reply/index.js so the JSON repair pipeline is unit-testable
 * without Docker or an LLM. The goal: NEVER let raw JSON leak into a generated
 * document body, and salvage as much structure as possible from malformed output.
 *
 * Parse pipeline (each step only runs if the previous failed):
 *   1. Strip markdown fences, direct JSON.parse
 *   2. Brace-slice (first '{' .. last '}') parse
 *   3. Cleanup pass (trailing commas, smart quotes) + parse
 *   4. Truncation repair (progressively close an unterminated sections array)
 *   5. Regex salvage of "heading"/"body" pairs
 */

/** Strip ```json fences / stray backticks from an LLM response. */
function stripFences(raw) {
  let cleaned = (raw || '').trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch && fencedMatch[1]) {
    cleaned = fencedMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/```/g, '').trim();
  }
  return cleaned;
}

/** Fix common LLM JSON defects that make JSON.parse throw. */
function cleanupJsonText(text) {
  return (text || '')
    // smart quotes → straight quotes (only when used as string delimiters)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1');
}

/** Attempt to parse JSON that was truncated mid-stream (e.g. max_tokens hit).
 *  Progressively cuts back to the last complete object and closes the structure. */
function parseTruncated(text) {
  const source = (text || '').trim();
  if (!source.startsWith('{')) return null;

  let cut = source.length;
  for (let attempts = 0; attempts < 8; attempts++) {
    cut = source.lastIndexOf('}', cut - 1);
    if (cut <= 0) return null;
    const candidate = cleanupJsonText(source.slice(0, cut + 1)) ;
    // Try closing as: sections array + object, then just object
    for (const suffix of ['', ']}', '}', ']}]}']) {
      try {
        const parsed = JSON.parse(candidate + suffix);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* keep trying */ }
    }
  }
  return null;
}

/** Last-resort: pull "heading"/"body" (or "title") string pairs out of broken JSON. */
function salvageSectionPairs(text) {
  const source = text || '';
  const sections = [];
  const pairRe = /"(?:heading|title|name)"\s*:\s*"((?:[^"\\]|\\.)*)"(?:\s*,\s*"(?:body|content|text|description)"\s*:\s*"((?:[^"\\]|\\.)*)")?/g;
  let m;
  let first = true;
  let title = null;
  while ((m = pairRe.exec(source)) !== null) {
    const heading = unescapeJsonString(m[1]).trim();
    const body = m[2] !== undefined ? unescapeJsonString(m[2]).trim() : '';
    if (!heading) continue;
    // The first "title" match at the top level is the document title, not a section
    if (first && source.slice(0, m.index).indexOf('[') === -1) {
      title = heading;
      first = false;
      if (m[2] === undefined) continue;
    }
    first = false;
    sections.push({ heading, body });
  }
  if (sections.length === 0) return null;
  return { title, sections };
}

function unescapeJsonString(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t');
  }
}

/** Convert any leftover JSON-ish text into readable plain text (never show raw JSON). */
function jsonTextToPlainText(text) {
  return (text || '')
    .replace(/[{}\[\]]/g, ' ')
    .replace(/"(?:title|sections|heading|body|content|text|name|description)"\s*:/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/["]/g, '')
    .replace(/,\s*\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalize a parsed object into { title, sections: [{heading, body}] }.
 * Mirrors the permissive normalization previously inline in auto-reply/index.js.
 */
function normalizeSections(parsed, { isListRequest = false } = {}) {
  const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];
  const validSections = sectionsRaw
    .map((s, idx) => {
      if (!s || typeof s !== 'object') return null;

      let heading = null;
      if (typeof s.heading === 'string') heading = s.heading;
      else if (typeof s.title === 'string') heading = s.title;
      else if (typeof s.name === 'string') heading = s.name;
      else heading = `Section ${idx + 1}`;

      if (isListRequest) {
        heading = heading.trim();
        if (!heading) return null;
        return { heading, body: '' };
      }

      let body = null;
      if (typeof s.body === 'string') body = s.body;
      else if (Array.isArray(s.body)) body = s.body.join('\n\n');
      else if (typeof s.content === 'string') body = s.content;
      else if (Array.isArray(s.content)) body = s.content.join('\n\n');
      else if (typeof s.text === 'string') body = s.text;
      else if (Array.isArray(s.paragraphs)) body = s.paragraphs.join('\n\n');
      else if (typeof s.description === 'string') body = s.description;

      if (!body) return null;
      heading = heading.trim();
      body = body.trim();
      if (!heading || !body) return null;
      return { heading, body };
    })
    .filter(Boolean);

  return validSections;
}

/**
 * Full parse pipeline. Returns:
 *   { schema: {title, sections}, method } on success
 *   { schema: null, method: 'failed' } when nothing could be salvaged
 * `method` identifies which stage succeeded (for logging/telemetry).
 */
function parseUltraDocSchema(rawResponse, { isListRequest = false, fallbackTitle = 'Document' } = {}) {
  const cleaned = stripFences(rawResponse);

  // Stage 1-3: direct parse, brace-slice, cleanup pass
  const candidates = [
    { text: cleaned, method: 'direct' },
  ];
  const firstBrace = (rawResponse || '').indexOf('{');
  const lastBrace = (rawResponse || '').lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push({ text: (rawResponse || '').slice(firstBrace, lastBrace + 1), method: 'brace_slice' });
  }
  candidates.push({ text: cleanupJsonText(cleaned), method: 'cleanup' });

  let parsed = null;
  let method = null;
  for (const c of candidates) {
    try {
      parsed = JSON.parse(c.text);
      method = c.method;
      break;
    } catch { /* next stage */ }
  }

  // Stage 4: truncation repair
  if (!parsed) {
    const sliceStart = firstBrace !== -1 ? (rawResponse || '').slice(firstBrace) : cleaned;
    parsed = parseTruncated(sliceStart);
    if (parsed) method = 'truncation_repair';
  }

  if (parsed && typeof parsed === 'object') {
    const sections = normalizeSections(parsed, { isListRequest });
    const title = (typeof parsed.title === 'string' && parsed.title.trim()) ? parsed.title.trim() : fallbackTitle;
    if (sections.length > 0) {
      return { schema: { title, sections }, method };
    }
    // Parsed JSON but no usable sections — try a body field, else fall through to salvage
    if (typeof parsed.body === 'string' && parsed.body.trim()) {
      return {
        schema: { title, sections: [{ heading: title, body: parsed.body.trim() }] },
        method: `${method}_body_fallback`
      };
    }
  }

  // Stage 5: regex salvage
  const salvaged = salvageSectionPairs(rawResponse || cleaned);
  if (salvaged) {
    const sections = salvaged.sections
      .map(s => (isListRequest ? { heading: s.heading, body: '' } : s))
      .filter(s => (isListRequest ? s.heading : (s.heading && s.body)));
    if (sections.length > 0) {
      return {
        schema: { title: salvaged.title || fallbackTitle, sections },
        method: 'regex_salvage'
      };
    }
  }

  return { schema: null, method: 'failed' };
}

/** Truncation repair for Excel-shaped JSON ({title, headers, rows:[[..],[..]]}).
 *  Cuts back to the last complete row (']') and closes the structure. */
function parseTruncatedExcel(text) {
  const source = (text || '').trim();
  if (!source.startsWith('{')) return null;

  let cut = source.length;
  for (let attempts = 0; attempts < 12; attempts++) {
    cut = source.lastIndexOf(']', cut - 1);
    if (cut <= 0) return null;
    const candidate = cleanupJsonText(source.slice(0, cut + 1));
    for (const suffix of ['}', ']}', ']]}']) {
      try {
        const parsed = JSON.parse(candidate + suffix);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch { /* keep trying */ }
    }
  }
  return null;
}

/**
 * Excel variant of the parse pipeline. Returns
 *   { schema: {title, headers, rows}, method } or { schema: null, method: 'failed' }.
 * Rows are only accepted when they exist and are non-empty — a truncated response
 * salvaged down to zero rows is treated as failure so callers can retry.
 */
function parseUltraExcelSchema(rawResponse, { fallbackTitle = 'Spreadsheet' } = {}) {
  const cleaned = stripFences(rawResponse);

  const candidates = [{ text: cleaned, method: 'direct' }];
  const firstBrace = (rawResponse || '').indexOf('{');
  const lastBrace = (rawResponse || '').lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push({ text: (rawResponse || '').slice(firstBrace, lastBrace + 1), method: 'brace_slice' });
  }
  candidates.push({ text: cleanupJsonText(cleaned), method: 'cleanup' });

  let parsed = null;
  let method = null;
  for (const c of candidates) {
    try {
      parsed = JSON.parse(c.text);
      method = c.method;
      break;
    } catch { /* next stage */ }
  }

  if (!parsed) {
    const sliceStart = firstBrace !== -1 ? (rawResponse || '').slice(firstBrace) : cleaned;
    parsed = parseTruncatedExcel(sliceStart);
    if (parsed) method = 'truncation_repair';
  }

  if (parsed && Array.isArray(parsed.headers) && parsed.headers.length > 0 &&
      Array.isArray(parsed.rows) && parsed.rows.length > 0) {
    // Drop malformed/short trailing rows (common with truncation repair)
    const width = parsed.headers.length;
    const rows = parsed.rows.filter(r => Array.isArray(r) && r.length === width);
    if (rows.length > 0) {
      return {
        schema: {
          title: (typeof parsed.title === 'string' && parsed.title.trim()) ? parsed.title.trim() : fallbackTitle,
          headers: parsed.headers,
          rows
        },
        method
      };
    }
  }

  return { schema: null, method: 'failed' };
}

module.exports = {
  stripFences,
  cleanupJsonText,
  parseTruncated,
  parseTruncatedExcel,
  salvageSectionPairs,
  jsonTextToPlainText,
  normalizeSections,
  parseUltraDocSchema,
  parseUltraExcelSchema
};
