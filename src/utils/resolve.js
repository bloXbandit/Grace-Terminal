// https://github.com/NaturalIntelligence/fast-xml-parser
const { XMLParser, XMLBuilder, XMLValidator } = require("fast-xml-parser");
const parser = new XMLParser({
  stopNodes: ["write_code.content", "revise_plan.tasks"],
  ignoreAttributes: false,
});

const resolveXML = (content) => {
  // 输入验证
  if (!content || typeof content !== 'string') {
    throw new Error('XML内容必须是非空字符串');
  }

  // 解析XML内容
  const result = parser.parse(content);

  // 通用CDATA处理函数
  const processCDATA = (text) => {
    if (!text || typeof text !== 'string') return text;
    const trimmed = text.trim();
    if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
      return trimmed.slice(9, -3); // 移除 <![CDATA[ 和 ]]>
    }
    return text;
  };

  // 处理write_code.content的CDATA
  if (result.write_code?.content) {
    result.write_code.content = processCDATA(result.write_code.content);
  }

  // 处理revise_plan.tasks的CDATA和JSON解析
  if (result.revise_plan?.tasks) {
    result.revise_plan.tasks = processCDATA(result.revise_plan.tasks);

    // 尝试解析JSON
    if (typeof result.revise_plan.tasks === 'string') {
      try {
        result.revise_plan.tasks = JSON.parse(result.revise_plan.tasks);
      } catch (error) {
        console.warn('JSON 解析失败:', error.message);
        console.warn('原始内容:', result.revise_plan.tasks);
        return {
          'parse_error': {
            'message': `JSON 解析失败: ${error.message}; 请注意 tasks 的 JSON Array 格式是否正确`,
            'content': result.revise_plan.tasks
          }
        }
      }
    }
  }

  return result;
}

/**
 * Extract XML from LLM response that might contain markdown, explanations, etc.
 */
const extractXML = (content) => {
  if (!content || typeof content !== 'string') return content;
  
  // Remove markdown code blocks if present
  let cleaned = content.replace(/```xml\s*/g, '').replace(/```\s*/g, '');
  
  // Try to find XML tags (most common actions)
  const xmlTags = [
    'finish', 'write_code', 'terminal_run', 'web_search', 'read_file',
    'revise_plan', 'browser', 'git_commit', 'manage_env', 'self_modify'
  ];
  
  for (const tag of xmlTags) {
    const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 's');
    const match = cleaned.match(regex);
    if (match) {
      return match[0]; // Return just the XML part
    }
  }
  
  // If no specific tag found, try to extract any XML-like content
  const genericXmlMatch = cleaned.match(/<(\w+)[^>]*>.*?<\/\1>/s);
  if (genericXmlMatch) {
    return genericXmlMatch[0];
  }
  
  // Return original if no XML found
  return content;
};

const resolveActions = xml => {
  try {
    // Extract XML from potentially messy LLM response
    const cleanedXml = extractXML(xml);
    const resolved = resolveXML(cleanedXml);
    const actions = []
    for (let key in resolved) {
      const value = resolved[key];
      const action = {
        type: key,
        params: value
      }
      actions.push(action);
    }
    return actions;
  } catch (err) {
    console.log('[resolveActions] Parse error:', err.message);
    console.log('[resolveActions] Original content:', xml?.substring(0, 200));
    return [];
  }
}

module.exports = {
  resolveXML,
  resolveActions
};