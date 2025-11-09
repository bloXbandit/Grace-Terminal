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
const { analyzeFiles, generateContextSummary } = require('@src/utils/fileAnalyzer');

const auto_reply = async (goal, conversation_id, user_id = 1, messages = [], profileContext = '', onTokenStream = null, files = []) => {
  console.log('[AutoReply] Called with files:', files ? files.length : 0);
  console.log('[AutoReply] Files array:', JSON.stringify(files.map(f => ({ name: f.name || f.filename, filepath: f.filepath })), null, 2));
  
  // Check for mode commands (/dev, /normal, /dev status)
  const modeCommandResult = await modeCommandHandler.handleCommand(goal, conversation_id);
  if (modeCommandResult) {
    // This was a mode command, return the result directly
    return modeCommandResult.message;
  }
  
  // FILE UPLOAD DETECTION: Analyze uploaded files if present
  if (files && files.length > 0) {
    console.log(`[AutoReply] 📎 Detected ${files.length} uploaded file(s), analyzing...`);
    try {
      const analyses = await analyzeFiles(files);
      
      // CRITICAL: Store analysis in files array for specialist access
      // This enriches each file object with analysis data
      for (let i = 0; i < files.length && i < analyses.length; i++) {
        files[i]._analysis = analyses[i];
      }
      
      console.log('[AutoReply] ✅ File analysis complete - routing to specialist with context');
      
      // Return null to let specialist handle with file context
      // File analysis is now stored in files[i]._analysis
      return null;
    } catch (error) {
      console.error('[AutoReply] ⚠️ File analysis failed:', error);
      // Continue with normal flow even if analysis fails
    }
  }
  
  // SPEED OPTIMIZATION: Fast-path detection for obvious task requests
  // Skip LLM call if it's clearly a file creation/modification request
  const obviousTaskPatterns = [
    /create.*\b(file|document|excel|word|spreadsheet|pdf|html|code)\b/i,
    /make.*\b(file|document|excel|word|spreadsheet|pdf|html)\b/i,
    /generate.*\b(file|document|excel|word|spreadsheet|pdf|html|code)\b/i,
    /write.*\b(file|document|excel|word|spreadsheet|pdf|html|code|script|function)\b/i,
    /build.*\b(app|website|page|dashboard|api)\b/i
  ];
  
  // SPEED OPTIMIZATION: Fast-path for file edits too
  const fileEditPatterns = [
    /add.*\b(to|in|into).*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /add.*\b(name|author|title|section).*\b(to|in|into|at)\b/i,
    /update.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /modify.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /change.*\b(in|the).*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /edit.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /put.*\b(in|at|into).*\b(document|file|doc|top|bottom)\b/i
  ];
  
  const isObviousTask = obviousTaskPatterns.some(pattern => pattern.test(goal));
  const isFileEdit = fileEditPatterns.some(pattern => pattern.test(goal));
  
  // CRITICAL: For file edits, check if there are files in the conversation
  // If no files exist, we need to ask for clarification (not fast-path)
  if (isFileEdit) {
    // Check if there are recent files in the conversation
    const hasRecentFiles = messages.length > 0 && messages.some(m => 
      m.content && (
        m.content.includes('.docx') || 
        m.content.includes('.xlsx') ||
        m.content.includes('.pdf') ||
        m.content.includes('document') ||
        m.content.includes('file')
      )
    );
    
    if (!hasRecentFiles) {
      console.log('[AutoReply] ⚠️ File edit requested but no files in context - routing to specialist for clarification');
      // Don't fast-path - let specialist handle the clarification
    } else {
      console.log(`[AutoReply] ⚡ Fast-path: File edit with existing files detected`);
      return {
        needsExecution: true,
        specialistResponse: null,
        specialist: 'fast-path',
        taskType: 'file_modification',
        isFileEdit: true
      };
    }
  } else if (isObviousTask) {
    // File creation - always safe to fast-path
    console.log(`[AutoReply] ⚡ Fast-path: Obvious task detected, skipping auto-reply LLM call`);
    return {
      needsExecution: true,
      specialistResponse: null,
      specialist: 'fast-path',
      taskType: 'data_generation',
      isFileEdit: false
    };
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
    
    // SPEED OPTIMIZATION: Send pre-fill message for simple_data_generation
    // This reassures user while specialist spins up (reduces perceived latency)
    if (taskType === 'simple_data_generation') {
      console.log('[AutoReply] ⚡ Simple doc generation - will send pre-fill message');
      // Note: Pre-fill message will be sent by AgenticAgent after specialist returns
    }
    
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
      // Pass conversation messages, profile context, AND onTokenStream for streaming
      // This enables real-time token streaming during specialist LLM calls
      const result = await coordinator.execute(goal, { messages, profileContext, onTokenStream });
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
  
  // GREETING DETECTION: Check if this is a simple greeting that doesn't need planning
  const greetingPatterns = [
    /^(hi|hello|hey|good\s+(morning|afternoon|evening)|greetings?)[\s!.]*$/i,
    /^(what('s|\s+is)\s+up|wassup|sup)[\s!.?]*$/i,
    /^(how\s+(are|r)\s+you|how's\s+it\s+going)[\s!.?]*$/i,
    /^(yo|hiya|howdy)[\s!.]*$/i,
    /^thanks?(\s+you)?[\s!.]*$/i,
    /^(ok|okay|got\s+it|understood)[\s!.]*$/i
  ];
  
  const isSimpleGreeting = greetingPatterns.some(pattern => pattern.test(goal.trim()));
  
  let model_info = await getDefaultModel(conversation_id)
  
  // Null check to prevent crashes
  if (!model_info) {
    console.warn('[AutoReply] No model found for conversation, using local fallback');
    model_info = { is_subscribe: false };  // Use local model as fallback
  }
  
  if (model_info.is_subscribe) {
    let replay = await auto_reply_server(goal, conversation_id)
    // If simple greeting, mark as fully handled to skip planning
    if (isSimpleGreeting) {
      console.log('[AutoReply] ✅ Simple greeting detected - skipping planning phase');
      return {
        handledBySpecialist: true,
        result: replay,
        specialist: 'auto_reply_greeting',
        taskType: 'general_chat'
      };
    }
    return replay
  }
  let replay = await auto_reply_local(goal, conversation_id)
  // If simple greeting, mark as fully handled to skip planning
  if (isSimpleGreeting) {
    console.log('[AutoReply] ✅ Simple greeting detected - skipping planning phase');
    return {
      handledBySpecialist: true,
      result: replay,
      specialist: 'auto_reply_greeting',
      taskType: 'general_chat'
    };
  }
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
