/**
 * Helper functions for Grace to use specialists
 * Grace can call these during task execution
 */

/**
 * Grace asks a specialist for help
 * Usage in Grace's thinking: "I need help with X, let me ask a specialist"
 */
async function askSpecialist(context, taskType, question) {
  try {
    if (!context.coordinator) {
      console.log('[Grace] No coordinator available, handling directly');
      return null;
    }

    console.log(`[Grace] Asking ${taskType} specialist: ${question.substring(0, 100)}...`);
    
    const response = await context.coordinator.askSpecialist(taskType, question);
    
    console.log(`[Grace] Specialist responded (${response.length} chars)`);
    
    return response;
  } catch (error) {
    console.error('[Grace] Specialist request failed:', error.message);
    return null;
  }
}

/**
 * Grace delegates a complex task to multiple specialists
 * Usage: Breaking down a big task into subtasks
 */
async function delegateToSpecialists(context, subtasks) {
  try {
    if (!context.coordinator) {
      console.log('[Grace] No coordinator available for delegation');
      return [];
    }

    console.log(`[Grace] Delegating ${subtasks.length} subtasks to specialists...`);
    
    const results = await context.coordinator.collaborate(context.question, subtasks);
    
    console.log(`[Grace] Received ${results.length} results from specialists`);
    
    return results;
  } catch (error) {
    console.error('[Grace] Delegation failed:', error.message);
    return [];
  }
}

/**
 * Grace checks if she should use a specialist for current task
 */
function shouldUseSpecialist(context, userMessage) {
  if (!context.coordinator) {
    return false;
  }

  const taskType = context.coordinator.detectTaskType(userMessage);
  return taskType !== 'general_chat';
}

/**
 * Get specialist recommendation for a task
 */
function getSpecialistRecommendation(context, userMessage) {
  if (!context.coordinator) {
    return null;
  }

  const taskType = context.coordinator.detectTaskType(userMessage);
  const routing = context.coordinator.getRouting(taskType);
  
  return {
    taskType,
    primary: routing.primary,
    fallback: routing.fallback,
    description: routing.description
  };
}

/**
 * Execute task with automatic multi-agent collaboration for complex tasks
 * Grace uses this for intelligent routing with QC
 */
async function executeWithCollaboration(context, userMessage, options = {}) {
  try {
    if (!context.coordinator) {
      console.log('[Grace] No coordinator available, handling directly');
      return null;
    }

    console.log(`[Grace] Executing task with smart routing...`);
    
    const result = await context.coordinator.executeWithCollaboration(userMessage, options);
    
    if (result.mode === 'multi-agent') {
      console.log(`[Grace] Multi-agent collaboration completed with ${result.subtasks.length} specialists`);
    } else {
      console.log(`[Grace] Single specialist execution completed`);
    }
    
    return result;
  } catch (error) {
    console.error('[Grace] Execution failed:', error.message);
    return null;
  }
}

/**
 * Check if task is complex enough for multi-agent collaboration
 */
function isComplexTask(context, userMessage) {
  if (!context.coordinator) {
    return false;
  }
  
  return context.coordinator.detectComplexity(userMessage);
}

module.exports = {
  askSpecialist,
  delegateToSpecialists,
  shouldUseSpecialist,
  getSpecialistRecommendation,
  executeWithCollaboration,
  isComplexTask
};
