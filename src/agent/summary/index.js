require("module-alias/register");
require("dotenv").config();

const sub_server_request = require('@src/utils/sub_server_request')
const conversation_token_usage = require('@src/utils/get_sub_server_token_usage')

const call = require("@src/utils/llm");
const { getDefaultModel } = require('@src/utils/default_model')
const resolveResultPrompt = require('@src/agent/prompt/generate_result.js');


const summary = async (goal, conversation_id, tasks, generatedFiles = [], staticUrl = null) => {
  let model_info = await getDefaultModel(conversation_id)
  if (model_info.is_subscribe) {
    let replay = await summary_server(goal, conversation_id, tasks, generatedFiles, staticUrl)
    return replay
  }
  let replay = await summary_local(goal, conversation_id, tasks, generatedFiles, staticUrl)
  return replay
}

const summary_server = async (goal, conversation_id, tasks, generatedFiles = [], staticUrl = null) => {
  // let [res, token_usage] = await sub_server_request('/api/sub_server/summary', {
  let res = await sub_server_request('/api/sub_server/summary', {
    goal,
    conversation_id,
    tasks,
    generatedFiles,
    staticUrl
  })
  // await conversation_token_usage(token_usage, conversation_id)

  return res
};

const summary_local = async (goal, conversation_id, tasks, generatedFiles = [], staticUrl = null) => {
  const prompt = await resolveResultPrompt(goal, tasks, generatedFiles, staticUrl);
  
  // CRITICAL FIX: Force Claude Sonnet 4.5 for summary to avoid GPT-5 Pro hangs
  // Override conversation default model for this specific call
  const summaryModelOverride = {
    model_name: 'anthropic/claude-sonnet-4.5',
    platform_name: 'OpenRouter',
    api_url: 'https://openrouter.ai/api/v1/chat/completions'
  };
  
  const result = await call(prompt, conversation_id, summaryModelOverride);

  // STRATEGIC: Validate file delivery claims in task summaries
  const ResponseValidator = require('@src/utils/responseValidator');
  let validatedResult = ResponseValidator.validateFileDeliveryClaims(result, conversation_id);

  // CRITICAL FIX: Ensure validatedResult is always a string
  if (typeof validatedResult !== 'string') {
    console.error('[Summary] ValidatedResult is not a string:', typeof validatedResult, validatedResult);
    validatedResult = String(validatedResult || result || '');
  }

  return validatedResult;
}

module.exports = exports = summary;
