require("module-alias/register");
require("dotenv").config();


const call = require("@src/utils/llm");
const { getDefaultModel } = require('@src/utils/default_model')
const resolveAutoReplyPrompt = require('@src/agent/prompt/auto_reply.js');
const sub_server_request = require('@src/utils/sub_server_request')
const conversation_token_usage = require('@src/utils/get_sub_server_token_usage')
const modeCommandHandler = require('@src/agent/modes/ModeCommandHandler');
const MultiAgentCoordinator = require('@src/agent/specialists/MultiAgentCoordinator');
const { shouldUseSpecialist } = require('@src/agent/specialists/helper');

const auto_reply = async (goal, conversation_id, user_id = 1) => {
  // Check for mode commands (/dev, /normal, /dev status)
  const modeCommandResult = await modeCommandHandler.handleCommand(goal, conversation_id);
  if (modeCommandResult) {
    // This was a mode command, return the result directly
    return modeCommandResult.message;
  }
  
  // Check if we should route to a specialist
  console.log('[AutoReply] Initializing coordinator for goal:', goal.substring(0, 100));
  const coordinator = new MultiAgentCoordinator({
    conversation_id,
    user_id
  });
  
  const taskType = coordinator.detectTaskType(goal);
  console.log(`[AutoReply] Detected task type: ${taskType}`);
  
  if (taskType !== 'general_chat') {
    console.log(`[AutoReply] Routing to specialist: ${taskType}`);
    
    // CRITICAL: Tasks that require tool execution should NOT be marked as "handled"
    // These task types need AgenticAgent to continue to planning and tool execution
    const requiresToolExecution = [
      'data_generation',      // Creating files, documents, etc.
      'code_generation',      // Writing code files
      'system_design',        // Creating diagrams, architecture files
      'web_research'          // Fetching and saving research data
    ];
    
    const needsTools = requiresToolExecution.includes(taskType);
    
    try {
      const result = await coordinator.execute(goal);
      console.log(`[AutoReply] Coordinator execute result:`, result.success ? 'SUCCESS' : 'FAILED');
      
      // Check if specialist failed (both primary and fallback)
      if (!result.success || result.error) {
        console.error('[AutoReply] ❌ All specialists failed:', result.message || 'Unknown error');
        console.log('[AutoReply] Falling back to default model');
        // Fall through to default model handling
      } else if (result.success) {
        console.log(`[AutoReply] Specialist ${result.specialist} handled the request`);
        
        // CRITICAL: Check for empty specialist response
        if (!result.result || (typeof result.result === 'string' && result.result.trim() === '')) {
          console.error('[AutoReply] ❌ Specialist returned empty response');
          console.log('[AutoReply] Falling back to default model');
          // Fall through to default model handling
        } else {
          // If task needs tools, mark as needing execution but provide specialist response
          // This allows AgenticAgent to continue to planning and tool execution
          if (needsTools) {
            console.log(`[AutoReply] Task type ${taskType} requires tools - continuing to planning`);
            console.log(`[AutoReply] Specialist response content:`, result.result?.substring(0, 200) || 'EMPTY');
            return {
              needsExecution: true,
              specialistResponse: result.result,
              specialist: result.specialist,
              taskType: taskType
            };
          }
          
          // For tasks that don't need tools (like chat, analysis), mark as handled
          return {
            handledBySpecialist: true,
            result: result.result,
            specialist: result.specialist,
            taskType: taskType
          };
        }
      }
    } catch (error) {
      console.error('[AutoReply] Specialist routing failed, falling back to default:', error);
    }
  } else {
    console.log('[AutoReply] Task type is general_chat, using default model');
  }
  
  let model_info = await getDefaultModel(conversation_id)
  
  // Null check to prevent crashes
  if (!model_info) {
    console.warn('[AutoReply] No model found for conversation, using local fallback');
    model_info = { is_subscribe: false };  // Use local model as fallback
  }
  
  if (model_info.is_subscribe) {
    let replay = await auto_reply_server(goal, conversation_id)
    return replay
  }
  let replay = await auto_reply_local(goal, conversation_id)
  return replay
}

const auto_reply_server = async (goal, conversation_id) => {
  // let [res, token_usage] = await sub_server_request('/api/sub_server/auto_reply', {
  let res = await sub_server_request('/api/sub_server/auto_reply', {
    goal,
    conversation_id
  })

  // await conversation_token_usage(token_usage, conversation_id)

  return res
};

const auto_reply_local = async (goal, conversation_id) => {
  // Call the model to get a response in English based on the goal
  const prompt = await resolveAutoReplyPrompt(goal);
  const auto_reply = await call(prompt, conversation_id);

  return auto_reply
}



module.exports = exports = auto_reply;
