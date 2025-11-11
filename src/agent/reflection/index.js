// https://www.promptingguide.ai/zh/techniques/reflexion
const conversation = require('@src/routers/conversation');
const llmEvaluate = require('./llm.evaluate');
const { resolveXML } = require("@src/utils/resolve");

/**
 * 1. Evaluate based on environment execution
 * 2. Evaluate based on large language model
 */
const STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
}

const reflection = async (requirement, action_result = {}, conversation_id) => {

  // 1. evaluate action result
  const { status, content, error, stderr } = action_result;
  
  // Enhanced error detection: Check for execution errors in stderr
  if (error || stderr) {
    // Check if stderr contains actual errors (not just warnings)
    const hasError = stderr && (
      stderr.includes('Error') ||
      stderr.includes('Exception') ||
      stderr.includes('Traceback') ||
      stderr.includes('SyntaxError') ||
      stderr.includes('ValueError') ||
      stderr.includes('TypeError') ||
      stderr.includes('ImportError') ||
      stderr.includes('FileNotFoundError')
    );
    
    if (hasError || error) {
      return {
        status: STATUS.FAILURE,
        comments: error || stderr,
        should_retry: true
      };
    }
  }
  
  // If Action execute failed, return error message
  if (status === STATUS.FAILURE && error) {
    return {
      status: STATUS.FAILURE,
      comments: error,
      should_retry: true
    }
  }

  // Check if output is empty or missing (possible silent failure)
  if (status === STATUS.SUCCESS && (!content || content.trim() === '')) {
    // NUANCE: Conversational error message instead of technical backend speak
    const naturalMessages = [
      'Hmm, nothing came back from that. Let me try adjusting my approach...',
      'That didn\'t produce any output. Give me a sec to fix that...',
      'Looks like that went silent. Let me try a different way...'
    ];
    return {
      status: STATUS.FAILURE,
      comments: naturalMessages[Math.floor(Math.random() * naturalMessages.length)],
      should_retry: true
    };
  }

  if (status === STATUS.SUCCESS) {
    return {
      status: STATUS.SUCCESS,
      comments: content,
    }
  }

  // 2. evaluate action result by llm [暂缓执行]
  const evaluation = await llmEvaluate(requirement, content, conversation_id);
  const result = resolveXML(evaluation);
  return result.evaluation;
}

module.exports = exports = reflection;