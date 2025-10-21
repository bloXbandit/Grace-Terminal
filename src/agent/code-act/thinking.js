require('dotenv').config();

const resolveThinkingPrompt = require("./thinking.prompt");
const resolveThinking = require("@src/utils/thinking");
const { getDefaultModel } = require('@src/utils/default_model')

const call = require("@src/utils/llm");
const DEVELOP_MODEL = 'assistant';
const sub_server_request = require('@src/utils/sub_server_request')
const conversation_token_usage = require('@src/utils/get_sub_server_token_usage')
const chat_completion = require('@src/agent/chat-completion/index')

const thinking = async (requirement, context = {}) => {
  let model_info = await getDefaultModel(context.conversation_id)
  if (model_info.is_subscribe) {
    let content = await thinking_server(requirement, context)
    return content
  }
  let content = await thinking_local(requirement, context)
  return content
}

const thinking_server = async (requirement, context = {}) => {
  const { memory, retryCount } = context;
  // console.log('memory', memory);
  const summarize = false;
  const messages = await memory.getMessages(summarize);
  if (retryCount > 0) {
    // Retry with user reply
    console.log('retryCount', retryCount);
    // messages.pop();
  }

  // If last message is assistant, return directly, support quickly playback and run action
  const message = messages[messages.length - 1];
  if (message && message.role === 'assistant') {
    // return message.content;
  }

  // Use LLM thinking to instruct next action
  let prompt = '';
  if (messages.length == 0) {
    prompt = await resolveThinkingPrompt(requirement, context);
    global.logging(context, 'thinking', prompt);
    // global.safeExit && await global.safeExit(0, 'process.exit in thinking_local')
  }
  const options = {
    messages: messages.map(item => {
      return { role: item.role, content: item.content }
    })
  }
  
  const content = await chat_completion(prompt,options,context.conversation_id);
  global.logging(context, 'thinking', content);
  if (prompt) {
    await memory.addMessage('user', prompt);
  }
  if (content && typeof content === 'string' && content.startsWith('<think>')) {
    const { thinking: _, content: output } = resolveThinking(content);
    await memory.addMessage('assistant', output);
    return output;
  }

  await memory.addMessage('assistant', content);

  return content;
}

const thinking_local = async (requirement, context = {}) => {
  const { memory, retryCount } = context;
  // console.log('memory', memory);
  const summarize = false;
  const messages = await memory.getMessages(summarize);
  if (retryCount > 0) {
    // Retry with user reply
    console.log('retryCount', retryCount);
    // messages.pop();
  }

  // If last message is assistant, return directly, support quickly playback and run action
  const message = messages[messages.length - 1];
  if (message && message.role === 'assistant') {
    // return message.content;
  }

  // Use LLM thinking to instruct next action
  let prompt = '';
  if (messages.length == 0) {
    prompt = await resolveThinkingPrompt(requirement, context);
    global.logging(context, 'thinking', prompt);
    // global.safeExit && await global.safeExit(0, 'process.exit in thinking_local');
  }
  const options = {
    messages: messages.map(item => {
      return { role: item.role, content: item.content }
    })
  }
  
  // Use specialist routing if available (prevents hitting gpt-4o rate limits)
  let content;
  
  // CRITICAL: Skip specialist routing for simple code execution tasks
  // If the task already has code/actions from a specialist, just execute it directly
  const isSimpleExecution = prompt && (
    prompt.includes('```python') || 
    prompt.includes('```javascript') ||
    prompt.includes('terminal_run') ||
    (prompt.length < 500 && /execute|run|create.*file/i.test(prompt))
  );
  
  // CRITICAL: For retries/reflection, use code-focused model (GPT-OSS), not reasoning model
  const isRetryOrReflection = context.retryCount > 0 || 
    (prompt && /error|failed|traceback|modulenotfound/i.test(prompt));
  
  if (context.coordinator && context.enableSpecialistRouting && !isSimpleExecution && !isRetryOrReflection) {
    console.log('[Thinking] Using specialist routing for complex task...');
    try {
      // Use execute method which auto-detects task type and routes to specialist
      const result = await context.coordinator.execute(prompt, options);
      // Extract content from specialist response
      content = result.result || result.content || result;
    } catch (error) {
      console.log('[Thinking] Specialist routing failed, falling back to default model:', error.message);
      // Fallback to default model if specialists fail
      content = await call(prompt, context.conversation_id, DEVELOP_MODEL, options);
    }
  } else {
    if (isSimpleExecution) {
      console.log('[Thinking] Simple execution detected - using default model directly');
    }
    if (isRetryOrReflection) {
      console.log('[Thinking] Retry/reflection detected - using GPT-OSS for code fixes');
      // Force use of GPT-OSS (code-focused model) for retries
      try {
        const gptOssResult = await context.coordinator.callSpecialist(
          'openrouter/openai/gpt-oss-20b',
          'You are an expert code debugger. Fix the error by generating valid Grace action XML (terminal_run, write_code, etc). Only output valid XML actions, no reasoning tags.',
          prompt,
          options
        );
        content = gptOssResult;
      } catch (error) {
        console.log('[Thinking] GPT-OSS failed, using default model:', error.message);
        content = await call(prompt, context.conversation_id, DEVELOP_MODEL, options);
      }
    } else {
      content = await call(prompt, context.conversation_id, DEVELOP_MODEL, options);
    }
  }
  global.logging(context, 'thinking', content);
  if (prompt) {
    await memory.addMessage('user', prompt);
  }

  if (content && typeof content === 'string' && content.startsWith('<think>')) {
    const { thinking: _, content: output } = resolveThinking(content);
    await memory.addMessage('assistant', output);
    return output;
  }
  await memory.addMessage('assistant', content);
  return content;
}

module.exports = exports = thinking;