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
  const { conversation_id, specialistResponse, taskType } = options;
  
  // CRITICAL: If specialist provided executable code, extract and execute it immediately
  if (specialistResponse && typeof specialistResponse === 'string') {
    console.log('[Planning] Thinking...');
    
    // Extract Python code blocks
    const pythonCodeMatch = specialistResponse.match(/```python\n([\s\S]+?)\n```/);
    if (pythonCodeMatch) {
      const pythonCode = pythonCodeMatch[1];
      console.log('[Planning] Extracted Python code:', pythonCode.substring(0, 100) + '...');
      console.log('[Planning] Python code length:', pythonCode.length, 'bytes');
      console.log('[Planning] Task type:', taskType);
      
      // DUAL PATH: Only use write+execute for apps, not documents
      if (taskType === 'data_generation' || taskType === 'web_development') {
        console.log('[Planning] Using NEW METHOD: Write to file + execute (for apps/dashboards)');
        
        // Create tasks to write and execute the specialist's code
        const timestamp = Date.now();
        const scriptFilename = `app.py`;  // Use standard name
        
        // CRITICAL: For large code, write to file first then execute
        // This avoids command-line argument length limits
        const escapedCode = pythonCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        
        // Return TWO separate tasks - one to write, one to execute
        return [
          {
            id: `${timestamp}_write`,
            title: '📝 Writing application code...',
            description: `Write Python application to ${scriptFilename}`,
            tool: 'write_code',
            status: 'pending',
            preGeneratedAction: `<write_code>\n<path>${scriptFilename}</path>\n<content>${escapedCode}</content>\n</write_code>`,
            requirement: `Write code to ${scriptFilename}`
          },
          {
            id: `${timestamp}_run`,
            title: '▶️ Running application...',
            description: `Execute ${scriptFilename}`,
            tool: 'terminal_run',
            status: 'pending',
            preGeneratedAction: `<terminal_run>\n<command>python3</command>\n<args>${scriptFilename}</args>\n</terminal_run>`,
            requirement: `Run python3 ${scriptFilename}`
          }
        ];
      }
      
      // ORIGINAL METHOD: Direct execution (for documents, etc.)
      console.log('[Planning] Using ORIGINAL METHOD: Direct execution (for documents)');
      // Fall through to normal planning flow below
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
