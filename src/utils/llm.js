const { getDefaultModel } = require('@src/utils/default_model')

const createLLMInstance = require("@src/completion/llm.one.js");
const parseJSON = require("./json.js");
const { PauseRequiredError } = require("@src/utils/errors");

const calcToken = require('@src/completion/calc.token.js')
const Conversation = require('@src/models/Conversation.js')


const defaultOnTokenStream = (ch) => {
  process.stdout.write(ch);
}

const DEFAULT_MODEL_TYPE = "assistant";

const LLM_LOGS = require('@src/models/LLMLogs.js');

/**
 * @param {*} prompt 
 * @param {*} model_type 
 * @param {*} options 
 * @param {*} onTokenStream 
 * @returns {Promise<Object>}
 */
const call = async (prompt, conversation_id, model_type = DEFAULT_MODEL_TYPE, options = { temperature: 0 }, onTokenStream = defaultOnTokenStream, retryCount = 0) => {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 5000, 10000]; // Exponential backoff: 2s, 5s, 10s
  
  // SECURITY: Detect P6/XER requests in direct LLM calls
  if (typeof prompt === 'string' && /\b(xer|primavera|p6|dcma)\b/i.test(prompt)) {
    console.warn('[LLM Security] P6/XER request detected in direct LLM call');
    console.warn('[LLM Security] This should use p6xer_tool via specialist routing');
    console.warn('[LLM Security] Prompt preview:', prompt.substring(0, 100));
    // Log for audit but don't block (MASTER_SYSTEM_PROMPT will still enforce)
  }
  
  let model_info = await getDefaultModel(conversation_id)
  
  // CRITICAL: Fallback to hardcoded model if none configured
  if (!model_info) {
    console.warn('[LLM] No default model found, using fallback: Claude Sonnet 4.5');
    model_info = {
      model_name: 'anthropic/claude-sonnet-4.5',
      platform_name: 'OpenRouter',
      api_key: process.env.OPENROUTER_API_KEY || '',
      api_url: 'https://openrouter.ai/api/v1/chat/completions',
      base_url: 'https://openrouter.ai/api/v1',
      is_subscribe: false
    };
  }
  
  const model = `provider#${model_info.platform_name}#${model_info.model_name}`;
  const llm = await createLLMInstance(model, onTokenStream, { model_info });
  // 判断模型
  if (model_info.model_name === 'deepseek-v3-250324') {
    options.max_tokens = 16000;
  } else if (model_info.model_name === 'deepseek-v3-1-250821') {
    options.max_tokens = 32000;
  }
  
  const { response_format, messages = [], ...restOptions } = options;
  const context = { messages };

  // call qwen3 model with no_think
  if (prompt && model_info.model_name.indexOf('qwen3') > -1) {
    prompt = '/no_think' + prompt;
  }

  let content;
  try {
    content = await llm.completion(prompt, context, restOptions);
  } catch (error) {
    // Handle completion errors with retry
    if (retryCount < MAX_RETRIES) {
      console.log(`LLM call failed, retrying (${retryCount + 1}/${MAX_RETRIES}) after ${RETRY_DELAYS[retryCount]}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
      return call(prompt, conversation_id, model_type, options, onTokenStream, retryCount + 1);
    }
    throw error;
  }

  // 处理 ERR_BAD_REQUEST 错误 (rate limits, etc.)
  if (content && typeof content === 'string' && content.startsWith('ERR_BAD_REQUEST')) {
    const errorCode = content.split(':')[1]?.split('An')[0]?.trim() || 'unknown';
    
    // Retry on rate limit (429) or server errors (5xx)
    if ((errorCode === '429' || errorCode?.startsWith('5')) && retryCount < MAX_RETRIES) {
      console.log(`Rate limit or server error (${errorCode}), retrying (${retryCount + 1}/${MAX_RETRIES}) after ${RETRY_DELAYS[retryCount]}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[retryCount]));
      return call(prompt, conversation_id, model_type, options, onTokenStream, retryCount + 1);
    }
    
    // If max retries reached or non-retryable error, throw with context preserved
    const contextPreview = prompt ? prompt.substring(0, 100) : 'no context';
    throw new PauseRequiredError(`LLM Call Failed (${errorCode}). Please try again. Error: ${content.substring(0, 200)}`);
  }

  // Response rewriter removed - fixing at source (system prompt level)

  const inputPrompt = messages.map(item => item.content).join('\n') + '\n' + prompt;
  const input_tokens = calcToken(inputPrompt)
  const output_tokens = calcToken(content)
  if (conversation_id) {
    const conversation = await Conversation.findOne({ where: { conversation_id: conversation_id } })
    if (conversation) {
      // @ts-ignore
      conversation.input_tokens = conversation.input_tokens + input_tokens
      // @ts-ignore
      conversation.output_tokens = conversation.output_tokens + output_tokens
      await conversation.save()
    }
  }

  if (response_format === 'json') {
    const json = parseJSON(content);
    // @ts-ignore
    await LLM_LOGS.create({ model, prompt, messages, content, json, conversation_id });
    return json;
  }
  // @ts-ignore
  await LLM_LOGS.create({ model, prompt, messages, content, conversation_id });
  //return content
  return content;
}

module.exports = exports = call;
