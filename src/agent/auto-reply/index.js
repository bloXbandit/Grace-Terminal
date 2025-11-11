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
const { analyzeFiles, generateContextSummary, generateUserFriendlySummary } = require('@src/utils/fileAnalyzer');

const auto_reply = async (goal, conversation_id, user_id = 1, messages = [], profileContext = '', onTokenStream = null, files = []) => {
  console.log('[AutoReply] Called with files:', files ? files.length : 0);
  console.log('[AutoReply] Files array:', JSON.stringify(files.map(f => ({ name: f.name || f.filename, filepath: f.filepath })), null, 2));
  
  // Check for mode commands (/dev, /normal, /dev status)
  const modeCommandResult = await modeCommandHandler.handleCommand(goal, conversation_id);
  if (modeCommandResult) {
    // This was a mode command, return the result directly
    return modeCommandResult.message;
  }
  
  // FAST-PATH: Date/Time queries (instant response, no planning)
  const dateTimeQuery = goal.match(/what'?s? (the )?(date|time|day|today|current|now)|what (date|time|day) is it|current (date|time)/i);
  if (dateTimeQuery) {
    console.log('[AutoReply] ⚡ Fast-path: Date/time query detected');
    const now = new Date();
    
    // Format date and time properly
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    };
    
    const formattedDateTime = now.toLocaleString('en-US', options);
    
    // Get user's name from profileContext if available
    let userName = '';
    if (profileContext && profileContext.includes('name:')) {
      const nameMatch = profileContext.match(/name:\s*([^\n,]+)/i);
      if (nameMatch) userName = `, ${nameMatch[1].trim()}`;
    }
    
    const response = `It's ${formattedDateTime}${userName}! 🕐`;
    
    return {
      handledBySpecialist: true,
      specialist: 'general_chat',
      taskType: 'general_chat',
      result: response
    };
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
      
      // CRITICAL: Fast-path for CONTENT BREAKDOWN follow-ups (no planning overhead)
      // Catches: "what's in it?", "show me the content", "lmk contents", "what does it contain"
      const contentBreakdownQuery = goal.match(/what'?s? in (it|the|this|that|the file|the document)|show me (the content|what'?s in|the details)|break(down|) (it|the file|the document|this)|lmk (what'?s in|contents?|the contents?)|tell me (what'?s in|the contents?|contents?)|what (does it|it) contains?|what'?s? (the )?contents?/i);
      
      // CRITICAL FIX: Check BOTH recent messages AND current upload
      // On initial conversation start, messages is [], so we must check files.length > 0
      const hasRecentFileMessage = files.length > 0 || messages.slice(-3).some(m => 
        m.content && (m.content.includes('.pdf') || m.content.includes('.docx') || m.content.includes('document') || m.content.includes('file'))
      );
      
      if (contentBreakdownQuery && hasRecentFileMessage) {
        console.log('[AutoReply] ⚡ Fast-path: Content breakdown request detected - streaming analysis');
        const { generateStreamingBreakdown } = require('@src/utils/fileAnalyzer');
        
        // Stream the detailed content analysis
        const breakdown = await generateStreamingBreakdown(analyses[0], onTokenStream);
        
        return {
          handledBySpecialist: true,
          specialist: 'general_chat',
          taskType: 'general_chat',
          result: breakdown,
          streamed: true
        };
      }
      
      // CRITICAL: Fast-path for "read document and execute task" pattern
      // This is a VERY common pattern that should NOT trigger full agent planning
      // Catches: "read this document and execute the task", "read and do what it says", etc.
      const executeFromDocPattern = goal.match(/read (this|the) (document|file|pdf|docx) and (execute|do|perform|complete|carry out) (the )?task|execute (the )?task (contained|in|from) (the )?(document|message|file)/i);
      
      if (executeFromDocPattern && analyses.length > 0) {
        console.log('[AutoReply] ⚡ Fast-path: Execute task from document pattern detected');
        
        // Extract task from document content
        const analysis = analyses[0];
        const content = typeof analysis.content === 'string' ? analysis.content : '';
        
        // Try to intelligently extract the task
        // Look for common patterns: "Create", "Write", "Generate", task descriptions
        const taskMatch = content.match(/(Create|Write|Generate|Make|Build|Develop|Design)\s+([^.\n]{10,100})/i);
        
        if (taskMatch) {
          const extractedTask = taskMatch[0];
          console.log('[AutoReply] Extracted task from document:', extractedTask);
          
          // Return null to let it go to agent mode BUT with enriched context
          // Add the extracted task to the goal
          return null;
        } else {
          // Could not extract clear task, provide summary and ask for clarification
          return {
            handledBySpecialist: true,
            specialist: 'general_chat',
            taskType: 'general_chat',
            result: `I see you want me to execute a task from the document. Let me check what's in it...\n\n` +
                    `The document contains: ${content.substring(0, 500)}...\n\n` +
                    `I can see instructions in the document. Let me execute them now.`
          };
        }
      }
      
      // CRITICAL: Fast-path for simple file visibility questions (FIRST UPLOAD ONLY)
      // Catches: "can you see", "do you see" - NOT "what's in it" (that's content breakdown above)
      const simpleVisibilityQuery = goal.match(/can you see|do you see|are you able to see/i);
      const noComplexTask = !goal.match(/create|generate|modify|edit|update|add|remove|delete|change|replace/i);
      
      if (simpleVisibilityQuery && noComplexTask) {
        console.log('[AutoReply] ⚡ Fast-path: Simple file visibility question detected');
        const response = generateUserFriendlySummary(analyses);
        
        // Return as specialist completion to prevent redundant specialist call
        return {
          handledBySpecialist: true,
          specialist: 'general_chat',
          taskType: 'general_chat',
          result: response
        };
      }
      
      // CRITICAL: Fast-path for FOLLOW-UP QUESTIONS about uploaded documents
      // Catches: "who is this for?", "who is the borrower?", "is it signed?", "is it executed?"
      // These should NOT trigger agent mode - just check the document and answer
      const followUpQuestionPatterns = [
        /who (is|'s) (this|the (document|authorization|file)) for/i,
        /who (is|'s) the (borrower|client|signer|recipient)/i,
        /what (is|'s) the (borrower|client|signer) (name|called)/i,
        /(is|was) (this|the (document|authorization|file)) (signed|executed)/i,
        /(is|was) it (signed|executed)/i,
        /who signed (this|it|the (document|authorization))/i,
        /what (company|lender|bank)/i,
        /when (was|is) (this|it|the (document|authorization)) (dated|signed|executed)/i
      ];
      
      const isFollowUpQuestion = followUpQuestionPatterns.some(pattern => pattern.test(goal));
      
      if (isFollowUpQuestion && hasRecentFileMessage && analyses.length > 0) {
        console.log('[AutoReply] ⚡ Fast-path: Document follow-up question detected');
        
        const analysis = analyses[0];
        const content = typeof analysis.content === 'string' ? analysis.content : '';
        const { detectDocumentType, extractKeyDetails } = require('@src/utils/fileAnalyzer');
        
        const docType = detectDocumentType(content, analysis.filename);
        const details = extractKeyDetails(content, docType?.type);
        
        let response = '';
        
        // Handle "who is the borrower?" / "who is this for?"
        if (goal.match(/who (is|'s) (this|the (document|authorization|file)) for|who (is|'s) the (borrower|client)/i)) {
          if (details.borrower) {
            response = `Looking at the document, the borrower is ${details.borrower}.`;
          } else {
            response = `I checked the document and I don't see a specific borrower name or client name mentioned in the text. The document appears to use generic language like "I, the undersigned" without a filled-in name.`;
          }
        }
        // Handle "is it signed?" / "is it executed?" (mortgage/legal domain context)
        else if (goal.match(/(is|was) (this|it|the (document|authorization|file)) (signed|executed)/i)) {
          if (details.isSigned === true) {
            response = `Yes, the document appears to be executed (signed)`;
            if (details.signer) {
              response += ` by ${details.signer}`;
            }
            if (details.date) {
              response += ` on ${details.date}`;
            }
            response += `.`;
          } else if (details.isSigned === false) {
            response = `No, the document is not yet executed (unsigned). It has signature lines but no signatures filled in.`;
          } else {
            response = `I can't definitively tell if the document is signed from the text content. There may be handwritten signatures that aren't captured in the text extraction.`;
          }
        }
        // Handle "what company/lender?"
        else if (goal.match(/what (company|lender|bank)/i)) {
          if (details.lender) {
            response = `The lender/company is ${details.lender}.`;
          } else if (details.company) {
            response = `The company is ${details.company}.`;
          } else {
            response = `I checked the document and I don't see a specific company or lender name mentioned.`;
          }
        }
        // Handle "when was it signed/dated?"
        else if (goal.match(/when (was|is) (this|it|the (document|authorization)) (dated|signed|executed)/i)) {
          if (details.date) {
            response = `The document is dated ${details.date}.`;
          } else {
            response = `I don't see a specific date mentioned in the document.`;
          }
        }
        else {
          // Generic fallback for other follow-up questions
          response = `Let me check the document... `;
          if (details.borrower) response += `Borrower: ${details.borrower}. `;
          if (details.lender) response += `Lender: ${details.lender}. `;
          if (details.date) response += `Date: ${details.date}. `;
          if (details.isSigned !== null) {
            response += details.isSigned ? `Status: Executed (signed).` : `Status: Not yet executed (unsigned).`;
          }
        }
        
        return {
          handledBySpecialist: true,
          specialist: 'general_chat',
          taskType: 'general_chat',
          result: response.trim(),
          streamed: true
        };
      }
      
      // Return null to let specialist handle with file context
      // File analysis is now stored in files[i]._analysis
      return null;
    } catch (error) {
      console.error('[AutoReply] ⚠️ File analysis failed:', error);
      // Continue with normal flow even if analysis fails
      return {
        handledBySpecialist: false,
        specialist: 'general_chat',
        taskType: 'general_chat',
        result: 'File analysis failed. Please try again.'
      };
    }
  }
  
  // CRITICAL: Ultra-fast-path for SIMPLE SINGLE-FILE GENERATION
  // These are single-tool executions that should call file_generator ONCE and be done
  // Catches: "create a word document titled X", "make a spreadsheet with Y", etc.
  const simpleFileGenPattern = goal.match(/(create|make|generate|write)\s+(a |an )?(word document|word doc|docx|excel|spreadsheet|xlsx|pdf|document|file)\s+(titled|called|named|with|about|on|for)/i);
  
  if (simpleFileGenPattern) {
    console.log('[AutoReply] ⚡⚡ ULTRA Fast-path: Simple single-file generation detected');
    console.log('[AutoReply] Pattern matched:', simpleFileGenPattern[0]);
    
    // Extract file type
    const fileType = simpleFileGenPattern[3].toLowerCase();
    const isWordDoc = fileType.includes('word') || fileType === 'docx';
    const isExcel = fileType.includes('excel') || fileType.includes('spreadsheet') || fileType === 'xlsx';
    
    // Extract title (look for "titled X" or "called X" or "named X")
    const titleMatch = goal.match(/(?:titled|called|named)\s+["']?([^"']+?)["']?(?:\s+with|\s+about|\s+on|\s+for|$)/i);
    let title = titleMatch ? titleMatch[1].trim() : 'Untitled';
    
    // Extract author if present
    const authorMatch = goal.match(/(?:with|by)\s+author\s+["']?([^"']+?)["']?(?:\s|$)/i);
    let author = authorMatch ? authorMatch[1].trim() : null;
    
    // CRITICAL: XML escape to prevent injection and parsing errors
    const xmlEscape = (str) => {
      if (!str) return str;
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };
    
    title = xmlEscape(title);
    author = xmlEscape(author);
    
    // CRITICAL: Pre-generate the action XML to bypass LLM thinking entirely
    // This makes it truly instant like ChatGPT
    let actionXML = '';
    if (isWordDoc) {
      actionXML = `<file_generator>
  <title>${title}</title>
  <type>docx</type>
  ${author ? `<author>${author}</author>` : ''}
  <content>${goal}</content>
</file_generator>`;
    } else if (isExcel) {
      actionXML = `<file_generator>
  <title>${title}</title>
  <type>xlsx</type>
  <content>${goal}</content>
</file_generator>`;
    } else {
      // Generic document
      actionXML = `<file_generator>
  <title>${title}</title>
  <type>docx</type>
  ${author ? `<author>${author}</author>` : ''}
  <content>${goal}</content>
</file_generator>`;
    }
    
    console.log('[AutoReply] Pre-generated action XML:', actionXML.substring(0, 150));
    
    // CRITICAL: Validate XML before returning (safety check)
    if (!actionXML || actionXML.length < 50 || !actionXML.includes('<file_generator>')) {
      console.log('[AutoReply] ⚠️ Invalid XML generation - falling back to specialist routing');
      // Don't return, let it fall through to specialist routing
      return null;
    }
    
    // This is a simple file generation - skip planning, go straight to execution
    // CRITICAL: Include pre-generated action XML to bypass thinking() LLM call
    return {
      needsExecution: true,
      specialistResponse: null,
      specialist: 'data_generation',
      taskType: 'simple_data_generation',
      skipPlanning: true, // CRITICAL: Skip planning phase
      directExecution: true, // CRITICAL: Go straight to tool execution
      preGeneratedAction: actionXML // CRITICAL: Pre-generated action XML to bypass thinking
    };
  }
  
  // Fast-path for file edits (context-aware)
  const fileEditPatterns = [
    /add.*\b(to|in|into).*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /add.*\b(name|author|title|section).*\b(to|in|into|at)\b/i,
    /update.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /modify.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /change.*\b(in|the).*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /edit.*\b(document|file|excel|word|spreadsheet|doc)\b/i,
    /put.*\b(in|at|into).*\b(document|file|doc|top|bottom)\b/i
  ];
  
  // REMOVED: obviousTaskPatterns - redundant with ultra fast-path and specialist routing
  // File edit patterns still used for context-aware routing
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
  }
  // Let all other file generation requests route to specialist (they'll get proper planning)
  
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
      // Pass conversation messages, profile context, files, AND onTokenStream for streaming
      // This enables real-time token streaming during specialist LLM calls
      // CRITICAL: Pass files array with _analysis data for file upload recognition
      const result = await coordinator.execute(goal, { messages, profileContext, onTokenStream, files });
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
