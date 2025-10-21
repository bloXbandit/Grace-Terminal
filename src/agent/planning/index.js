require("module-alias/register");
require("dotenv").config();

const sub_server_request = require('@src/utils/sub_server_request')
const conversation_token_usage = require('@src/utils/get_sub_server_token_usage')

const call = require("@src/utils/llm");
const resolvePlanningPrompt = require("@src/agent/prompt/plan");
const { getDefaultModel } = require('@src/utils/default_model')


const planning = async (goal, options) => {
  const { conversation_id } = options;
  let model_info = await getDefaultModel(conversation_id)
  if (model_info.is_subscribe) {
    let clean_tasks = await planning_server(goal, options)
    return clean_tasks
  }

  let clean_tasks = await planning_local(goal, options)
  return clean_tasks
};

const planning_server = async (goal, options) => {
  const { conversation_id, files, previousResult } = options;
  // const [res, token_usage] = await sub_server_request('/api/sub_server/planning', {
  const res = await sub_server_request('/api/sub_server/planning', {
    goal,
    options
  })

  // await conversation_token_usage(token_usage, conversation_id)
  return res
};

const resolvePlanningPromptBP = require("@src/agent/prompt/plan");
const { resolveMarkdown } = require("@src/utils/markdown");
const resolveThinking = require("@src/utils/thinking");
const retryWithFormatFix = require("./retry_with_format_fix");

const planning_local = async (goal, options = {}) => {
  const { conversation_id, specialistResponse } = options;
  
  // CRITICAL: If specialist provided executable code, extract and execute it immediately
  if (specialistResponse && typeof specialistResponse === 'string') {
    console.log('[Planning] Thinking...');
    
    // Extract Python code blocks
    const pythonCodeMatch = specialistResponse.match(/```python\n([\s\S]+?)\n```/);
    if (pythonCodeMatch) {
      const pythonCode = pythonCodeMatch[1];
      console.log('[Planning] Extracted Python code:', pythonCode.substring(0, 100) + '...');
      console.log('[Planning] Python code length:', pythonCode.length, 'bytes');
      
      // Create a single task to execute the specialist's code directly
      const timestamp = Date.now();
      const scriptFilename = `specialist_${timestamp}.py`;
      
      // CRITICAL: For large code, write to file first then execute
      // This avoids command-line argument length limits
      const escapedCode = pythonCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
      const actionXML = `<write_code>\n<filepath>${scriptFilename}</filepath>\n<code>${escapedCode}</code>\n</write_code>\n<terminal_run>\n<command>python3</command>\n<args>${scriptFilename}</args>\n</terminal_run>`;
      
      return [{
        id: `${timestamp}_specialist`,
        title: '⚡ Creating your application...',
        description: `Execute specialist code:\n\n\`\`\`python\n${pythonCode.substring(0, 500)}...\n\`\`\``,
        tool: 'write_code',
        status: 'pending',
        // Pre-generated action for direct execution
        preGeneratedAction: actionXML,
        requirement: actionXML  // Also put in requirement field for execution to find
      }];
    }
  }
  
  const prompt = await resolvePlanningPromptBP(goal, options);

  // 结果处理器
  const processResult = async (markdown) => {
    // CRITICAL: Ensure markdown is a string
    if (!markdown || typeof markdown !== 'string') {
      console.error('[Planning] Response is not a string:', typeof markdown, markdown);
      // If undefined or null, return empty string to avoid crashes
      if (markdown === undefined || markdown === null) {
        console.error('[Planning] Response is undefined/null - LLM call likely failed');
        return [];
      }
      markdown = JSON.stringify(markdown);
    }
    
    // 处理 thinking 标签
    if (markdown && markdown.startsWith('<think>')) {
      const { content: output } = resolveThinking(markdown);
      markdown = output;
    }
    console.log("\n==== planning markdown ====");
    console.log(markdown);
    const tasks = await resolveMarkdown(markdown);
    console.log("\n==== planning tasks ====");
    console.log(tasks);
    return tasks || [];
  };
  // 验证函数
  const validate = (tasks) => Array.isArray(tasks) && tasks.length > 0;

  return await retryWithFormatFix(prompt, processResult, validate, conversation_id);
}

const planning_local_v0 = async (goal, files, previousResult, conversation_id) => {
  const planning_prompt = await resolvePlanningPrompt(goal, files, previousResult, conversation_id);
  console.log("\n==== planning prompt ====", planning_prompt);
  const tasks = await call(planning_prompt, conversation_id, 'assistant', {
    response_format: 'json',
    temperature: 0,
  });
  console.log("\n==== planning result ====");
  console.log(tasks);
  const clean_tasks = tasks.filter(item => {
    return item.tools && item.tools.length > 0;
  }) || [];
  return clean_tasks;
};
module.exports = exports = planning;
