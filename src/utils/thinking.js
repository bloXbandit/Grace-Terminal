// resolve thinking content and output content
const resolveThinking = (content) => {
  // CRITICAL: Ensure content is a string before any operations
  if (!content || typeof content !== 'string') {
    console.warn('[resolveThinking] Content is not a string:', typeof content);
    return { thinking: '', content: content || '' };
  }
  
  content = content.trim();
  let thinking = '';
  let output = '';
  if (content.startsWith('<think>') && content.indexOf('</think>') !== -1) {
    const end = content.indexOf('</think>');
    thinking = content.slice(0, end + 8).trim();
    output = content.slice(end + 8).trim();
  }
  return { thinking, content: output };
}

module.exports = resolveThinking;