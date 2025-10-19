require("module-alias/register");
require("dotenv").config();


const call = require("@src/utils/llm");
const { getDefaultModel } = require('@src/utils/default_model')
const resolveChatPrompt = require('@src/agent/prompt/chat.js');
const sub_server_request = require('@src/utils/sub_server_request')
const chat = async (goal, conversation_id, messages, onTokenStream, user_id = 1) => {
  let model_info = await getDefaultModel(conversation_id)
  if (model_info.is_subscribe) {
    let replay = await chat_server(goal, conversation_id, messages, onTokenStream)
    return replay
  }
  let replay = await chat_local(goal, conversation_id, messages, onTokenStream, user_id)
  return replay
}
// TODO saas interface
const chat_server = async (goal, conversation_id,messages) => {
  // let [res, token_usage] = await sub_server_request('/api/sub_server/auto_reply', {
  let res = await sub_server_request('/api/sub_server/auto_reply', {
    goal,
    conversation_id,
    //messages
  })
  // await conversation_token_usage(token_usage, conversation_id)
  return res
};

const chat_local = async (goal, conversation_id, messages = [], onTokenStream, user_id = 1) => {
  // SECURITY & UX: Detect requests that require tools/heavy specialists
  // Chat mode is for conversation, not task execution
  const requiresTools = /\b(xer|primavera|p6|dcma|critical.*path|earned.*value|create.*file|generate.*document|write.*code|execute|run.*script|analyze.*data|make.*document|generate.*excel|create.*pdf)\b/i.test(goal);
  
  if (requiresTools) {
    console.log('[Chat Mode] Tool-requiring request detected, suggesting mode switch');
    return `I can help with that, but it requires tool access that's available in Task or Auto mode.

For XER/P6 analysis, code execution, or file generation, please:
1. Switch to **Task mode** for complex operations with full tool access
2. Or use **Auto mode** for quick tasks with specialist routing

Chat mode is best for conversation and answering questions. Would you like me to help you with something else, or would you prefer to switch modes for this request?`;
  }
  
  // Call the model to get a response in English based on the goal
  let prompt = goal
  if (messages.length == 0) {
    prompt = await resolveChatPrompt(goal, user_id)
  }else{
    // let first message add prompt
    messages[0].content = await resolveChatPrompt(messages[0].content, user_id)
  }
  const auto_reply = await call(prompt, conversation_id, 'assistant', {messages},onTokenStream);
  return auto_reply
}



module.exports = exports = chat;
