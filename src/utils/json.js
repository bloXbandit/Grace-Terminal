const resolveThinking = require('@src/utils/thinking.js')

const parseJSON = (content) => {
  if (!content || typeof content !== 'string') return null;
  content = content.trim();
  if (content.startsWith('<think>')) {
    const { thinking: _, content: output } = resolveThinking(content);
    content = output;
  }

  const startIndex = content.indexOf('```json');
  const endIndex = content.lastIndexOf('```');
  if (startIndex !== -1 && endIndex > startIndex) {
    content = content.substring(startIndex + '```json'.length, endIndex).trim();
  }

  const extractFirstJSON = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const s = raw.trim();
    const openers = ['{', '['];
    let start = -1;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (openers.includes(ch)) {
        start = i;
        break;
      }
    }
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;

      if (depth === 0) {
        return s.substring(start, i + 1);
      }
    }
    return null;
  };

  try {
    return JSON.parse(content);
  } catch (err) {
    if (content === 'ERR_BAD_REQUEST') {
      throw new Error(`Large model call failed`);
    } else {
      const recovered = extractFirstJSON(content);
      if (recovered) {
        try {
          return JSON.parse(recovered);
        } catch (_) {
          // fall through to original error
        }
      }

      console.log('JSON parse failed for content:', content);
      throw new Error(`parseJSON failed: ${err.message}`);
    }
  }
}

module.exports = exports = parseJSON;