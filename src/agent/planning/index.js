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
const { resolveActions } = require('@src/utils/resolve');

const planning_local = async (goal, options = {}) => {
  const { conversation_id, specialistResponse } = options;
  
  // CRITICAL: If specialist provided executable code, extract and execute it immediately
  if (specialistResponse && typeof specialistResponse === 'string') {
    console.log('[Planning] coooking...');

    // Highest priority: direct file generation actions
    const fileGeneratorMatch = specialistResponse.match(/<file_generator[\s\S]*?<\/file_generator>/);
    if (fileGeneratorMatch) {
      const actionXML = fileGeneratorMatch[0];
      const [fileAction] = resolveActions(actionXML).filter(action => action.type === 'file_generator');

      if (fileAction) {
        const timestamp = Date.now();
        const format = (fileAction.params?.format || 'file').toString().toLowerCase();
        const filename = (fileAction.params?.filename || `generated_${timestamp}`).toString();

        console.log(`[Planning] ✅ Detected <file_generator> action for ${filename}.${format}`);

        return [{
          id: `${timestamp}_file_generator`,
          title: '📄 Generating document... ',
          description: `Generate ${format.toUpperCase()} file: ${filename}`,
          tool: 'file_generator',
          status: 'pending',
          preGeneratedAction: actionXML,
          requirement: actionXML
        }];
      }
    }

    const writeCodeMatch = specialistResponse.match(/<write_code[\s\S]*?<\/write_code>/);
    if (writeCodeMatch) {
      const actionXML = writeCodeMatch[0];
      const timestamp = Date.now();
      return [{
        id: `${timestamp}_write_code`,
        title: '📝 Writing file...',
        description: 'Write generated file',
        tool: 'write_code',
        status: 'pending',
        preGeneratedAction: actionXML,
        requirement: actionXML
      }];
    }

    // PRIORITY: Check for Python code blocks FIRST (preferred format)
    const pythonCodeMatch = specialistResponse.match(/```python\n([\s\S]+?)\n```/);
    if (pythonCodeMatch) {
      const pythonCode = pythonCodeMatch[1];
      console.log('[Planning] Extracted Python code block (preferred format)');
      
      const timestamp = Date.now();
      const scriptName = `temp_script_${timestamp}.py`;
      
      // Smart execution: For complex/long code, use script file. For simple code, use inline -c
      const codeLength = pythonCode.length;
      const lineCount = pythonCode.split('\n').length;
      
      // Check for Python syntax that fails in inline -c (for/while/if/def/class)
      const hasComplexSyntax = /\b(for|while|if|def|class)\b/.test(pythonCode);
      
      // Use script file if: large code, many lines, OR complex syntax
      const useScriptFile = codeLength > 2000 || lineCount > 50 || hasComplexSyntax;
      
      if (useScriptFile) {
        console.log(`[Planning] Code is complex (${codeLength} chars) - using script file approach`);
        
        // Create two tasks: 1) write script, 2) execute script
        return [
          {
            id: `${timestamp}_write`,
            title: '📝 Preparing script...',
            description: 'Write Python script to file',
            tool: 'write_code',
            status: 'pending',
            preGeneratedAction: `<write_code>\n<file_path>temp_script_${timestamp}.py</file_path>\n<content>${pythonCode}</content>\n</write_code>`,
            requirement: `Write Python script`
          },
          {
            id: `${timestamp}_execute`,
            title: '⚡ Creating your file...',
            description: `Execute Python script`,
            tool: 'terminal_run',
            status: 'pending',
            preGeneratedAction: `<terminal_run>\n<command>python3</command>\n<args>temp_script_${timestamp}.py</args>\n</terminal_run>`,
            requirement: `Execute script`
          }
        ];
      } else {
        console.log(`[Planning] Code is simple (${codeLength} chars) - using inline execution`);
        
        // Inline execution for simple code
        const escapedCode = pythonCode.replace(/"/g, '\\"');
        const actionXML = `<terminal_run>\n<command>python3</command>\n<args>-c "${escapedCode}"</args>\n</terminal_run>`;
        
        return [{
          id: `${timestamp}_specialist`,
          title: '⚡ Creating your file...',
          description: `Execute specialist code:\n\n\`\`\`python\n${pythonCode}\n\`\`\``,
          tool: 'terminal_run',
          status: 'pending',
          preGeneratedAction: actionXML,
          requirement: actionXML
        }];
      }
    }
    
    // FORMAT 1: Check if specialist provided XML action directly (DEPRECATED - should use Python blocks)
    const xmlMatch = specialistResponse.match(/<terminal_run>([\s\S]+?)<\/terminal_run>/);
    if (xmlMatch) {
      const actionXML = xmlMatch[0]; // Full XML including tags
      console.log('[Planning] ⚠️ Extracted XML action (deprecated format)');
      
      // Check if XML references a Python file that needs to be created first
      const commandMatch = actionXML.match(/<command>([^<]+)<\/command>/);
      if (commandMatch) {
        const command = commandMatch[1];
        const pythonFileMatch = command.match(/python3?\s+([^\s]+\.py)/);
        
        if (pythonFileMatch) {
          const scriptName = pythonFileMatch[1];
          console.log(`[Planning] ⚠️ XML references ${scriptName} but file may not exist - trying to extract Python code`);
          
          // Try to find Python code in the response
          const pythonCodeMatch = specialistResponse.match(/```python\n([\s\S]+?)\n```/);
          if (pythonCodeMatch) {
            const pythonCode = pythonCodeMatch[1];
            console.log('[Planning] ✅ Found Python code - creating file first, then executing');
            
            const timestamp = Date.now();
            return [
              {
                id: `${timestamp}_write`,
                title: '📝 Creating script...',
                description: `Write Python script to file`,
                tool: 'write_code',
                status: 'pending',
                preGeneratedAction: `<write_code>\n<file_path>${scriptName}</file_path>\n<content>${pythonCode}</content>\n</write_code>`,
                requirement: `Write Python script`
              },
              {
                id: `${timestamp}_execute`,
                title: '⚡ Executing...',
                description: `Execute Python script`,
                tool: 'terminal_run',
                status: 'pending',
                preGeneratedAction: actionXML,
                requirement: actionXML
              }
            ];
          }
        }
      }
      
      // Fallback: Execute XML directly (legacy behavior)
      console.log('[Planning] ⚠️ No Python code found - executing XML directly (may fail if file missing)');
      const timestamp = Date.now();
      return [{
        id: `${timestamp}_specialist`,
        title: '⚡ Executing...',
        description: `Execute specialist code`,
        tool: 'terminal_run',
        status: 'pending',
        preGeneratedAction: actionXML,
        requirement: actionXML
      }];
    }
    
    console.log('[Planning] ⚠️ No executable code found, using regular planning');
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
