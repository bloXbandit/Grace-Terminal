const thinking = require("./thinking");
const { resolveActions } = require("@src/utils/resolve");
const Message = require("@src/utils/message");
const LocalMemory = require("@src/agent/memory/LocalMemory");
const { isPauseRequiredError } = require("@src/utils/errors");
const fs = require('fs');
const path = require('path');

// Reflection module
const reflection = require("@src/agent/reflection/index");
const MAX_RETRY_TIMES = 3;
const MAX_TOTAL_RETRIES = 10; // add：max retries times 
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const finish_action = async (action, context, task_id) => {
  const { memory, onTokenStream, conversation_id, user_id } = context;
  const memorized_content = await memory.getMemorizedContent();
  
  // Check if this is an ultra task (has preGeneratedAction in context)
  const isUltraTask = context.task && context.task.preGeneratedAction;
  
  // 1. Send dummy meta message only for non-ultra tasks to reduce noise
  if (onTokenStream && !isUltraTask) {
    const dummyMetaMessage = Message.format({
      status: "success",
      task_id: task_id,
      action_type: 'meta_placeholder',
      content: 'Processing file generation...',
      json: [],
      is_active: true,
      timestamp: new Date().valueOf()
    });
    
    // Send in non-blocking way
    setTimeout(() => {
      try {
        onTokenStream(dummyMetaMessage);
        console.log('[DummyMeta] Sent placeholder meta message');
      } catch (e) {
        console.error('[DummyMeta] Failed to send placeholder:', e);
      }
    }, 0);
  }

  // 2. Process files and create versions
  const { createVersion } = require('@src/utils/versionManager');
  const { extractRelativePath } = require('@src/utils/filePathHelper');
  const filesWithVersions = [];
  
  if (context.generate_files?.length > 0) {
    for (const filepath of context.generate_files) {
      try {
        const relativePath = extractRelativePath(filepath);
        const stats = fs.statSync(filepath);
        
        // Create version for each file
        await createVersion(filepath, conversation_id, { 
          action: 'Agent Coding',
          user_id: user_id
        });
        
        // Build object matching AgenticAgent's structure
        filesWithVersions.push({
          filepath,
          filename: path.basename(filepath),
          filesize: stats.size,
          relativePath,
          id: undefined,  // Will be populated later
          version: undefined  // Will be populated later
        });
      } catch (err) {
        console.error('[finish_action] Version creation failed:', err);
      }
    }
    
    // NEW: Fetch version IDs (same as AgenticAgent)
    const FileVersion = require('@src/models/FileVersion');
    for (const file of filesWithVersions) {
      try {
        const version = await FileVersion.findOne({
          where: {
            conversation_id: context.conversation_id,
            filepath: file.relativePath,
            active: true
          }
        });
        
        if (version) {
          file.id = version.getDataValue('id'); // Correct Sequelize property access
          file.version = version.getDataValue('version');
        }
      } catch (err) {
        console.error('[finish_action] Version fetch failed:', err);
      }
    }
  }
  
  // 3. Prepare the actual result with improved summary for ultra tasks
  let summaryMessage = action?.params?.message || 'Task completed successfully';
  
  // Enhanced summary for ultra tasks - list created files
  if (isUltraTask && filesWithVersions.length > 0) {
    // Separate Python helper scripts from user-facing files
    const nonPyFiles = filesWithVersions.filter(f => !f.filename?.endsWith('.py') && !f.filepath.endsWith('.py'));
    const filesForSummary = nonPyFiles.length > 0 ? nonPyFiles : filesWithVersions;

    const fileNames = filesForSummary.map(f => f.filename || f.filepath.split('/').pop());
    if (fileNames.length === 1) {
      summaryMessage = `✅ Created ${fileNames[0]}`;
    } else {
      summaryMessage = `✅ Created ${fileNames.length} files: ${fileNames.join(', ')}`;
    }
    console.log(`[UltraTask] Enhanced summary: ${summaryMessage}`);
  }
  
  const result = {
    status: "success",
    comments: "Task Success!",
    content: summaryMessage,
    memorized: memorized_content,
    meta: {
      action_type: "finish_summery",
      task_id: task_id,
      filepath: '',
      url: '',
      json: filesWithVersions || [],
      is_active: true
    },
    timestamp: new Date().valueOf()
  };
  
  // 4. Format and send the actual message
  const msg = Message.format({
    status: "success",
    task_id: task_id,
    action_type: 'finish_summery',
    content: result.content,
    comments: result.comments,
    memorized: result.memorized,
    json: result.meta.json
  });
  
  // Send the message if we have a token stream
  if (onTokenStream) {
    try {
      onTokenStream(msg);
      console.log('[FinishAction] Sent finish_summery message');
    } catch (e) {
      console.error('[FinishAction] Failed to send finish_summery:', e);
      throw e; // Re-throw to handle upstream
    }
  }
  
  // Save to database
  try {
    await Message.saveToDB(msg, conversation_id);
    console.log('[FinishAction] Message saved to database');
  } catch (e) {
    console.error('[FinishAction] Failed to save message to database:', e);
    // Don't fail the operation if DB save fails
  }
  
  return result;
};

/**
 * Helper function to handle retry logic
 * @param {number} retryCount - Current consecutive retry count
 * @param {number} totalRetryAttempts - Current total retry attempts
 * @param {number} maxRetries - Maximum consecutive retry count
 * @param {number} maxTotalRetries - Maximum total retry attempts
 * @param {string} errorMessage - Error message (optional)
 * @returns {Object} - Contains whether to continue retrying and error result (if termination is needed)
 */
const retryHandle = (retryCount, totalRetryAttempts, maxRetries, maxTotalRetries, errorMessage = "") => {
  // check if max consecutive retry times is reached
  if (retryCount >= maxRetries) {
    return {
      shouldContinue: false,
      result: {
        status: "failure",
        comments: `Reached the maximum number of consecutive ${errorMessage ? "exceptions" : "execution failures"} (${maxRetries})${errorMessage ? ": " + errorMessage : ""}`,
      },
    };
  }
  // check if max total retry times is reached
  if (totalRetryAttempts >= maxTotalRetries) {
    return {
      shouldContinue: false,
      result: {
        status: "failure",
        comments: `Reached the maximum total retry attempts (${maxTotalRetries})${errorMessage ? ": " + errorMessage : ""}`,
      },
    };
  }
  // can continue retry
  return { shouldContinue: true };
};

const { checkConsecutiveAssistantXml, completeMessagesContent } = require("./message");

// const MAX_CONTENT_LENGTH = 1e5;
const MAX_CONTENT_LENGTH = 5 * 1e4;

/**
 * Execute code behavior until task completion or maximum retry times reached
 * @param {Object} task - Task object containing requirement and id
 * @param {Object} context - Context object
 * @returns {Promise<Object>} - Task execution result
 */
const completeCodeAct = async (task = {}, context = {}) => {
  // Initialize parameters and environment
  const { requirement, id = 1, depth = 1 } = task;
  if (depth > 1) {
    // const task_manager = context.task_manager;
    // process.exit(0);
  }
  const maxRetries = context.max_retry_times || MAX_RETRY_TIMES;
  const maxTotalRetries = context.max_total_retries || MAX_TOTAL_RETRIES; // use context or default value

  // Initialize memory and runtime
  const memory_dir = context.conversation_id.slice(0, 6);
  const memory = new LocalMemory({ memory_dir: memory_dir, key: id });
  context.memory = memory;
  memory._loadMemory();
  // @ts-ignore

  let retryCount = 0;
  let totalRetryAttempts = 0; // add：total retries times counter

  const handleRetry = async () => {
    retryCount++;
    totalRetryAttempts++;
    context.retryCount = retryCount;
    // Exponential backoff to prevent API rate limits
    const delayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000); // 1s, 2s, 4s, 8s, max 10s
    console.log(`[CodeAct] Waiting ${delayMs}ms before retry...`);
    await delay(delayMs);
  }

  // Main execution loop with safety limit
  const MAX_LOOP_ITERATIONS = 10; // Prevent infinite API calls
  let loopIterations = 0;
  
  while (loopIterations < MAX_LOOP_ITERATIONS) {
    loopIterations++;
    console.log(`[CodeAct] Loop iteration ${loopIterations}/${MAX_LOOP_ITERATIONS}`);
    
    try {
      // CRITICAL: Check if task has pre-generated action (from specialist)
      let action = null;
      let actions = [];
      let content = '';
      
      if (task.preGeneratedAction || task.requirement?.includes('<tool')) {
        console.log('[CodeAct] Using pre-generated action from specialist');
        const actionXML = task.preGeneratedAction || task.requirement;
        console.log('[CodeAct] Action XML:', actionXML.substring(0, 200));
        actions = await resolveActions(actionXML);
        action = actions[0];
        console.log('[CodeAct] Parsed action:', JSON.stringify(action));
        if (actions.length > 1) {
          console.log('[CodeAct] Multiple actions detected:', actions.length);
        }
        content = actionXML;
      }
      
      // If no pre-generated action, use LLM thinking (skip for Ultra fast-path)
      if (!action && !context.task?.preGeneratedAction) {
        // 1. LLM thinking
        context.depth = depth || 1;
        content = await thinking(requirement, context);
        // console.log("thinking.result", content);

        // 2. Parse Action
        // try to parse action directly avoid llm don't continue
        const actions = await resolveActions(content);
        action = actions[0];
      } else if (context.task?.preGeneratedAction && !action) {
        console.log('[CodeAct] Ultra fast-path: Using preGeneratedAction, skipping thinking()');
      }
      const messages = await memory.getMessages();
      if (!action) {
        // Try to parse action again with all previous assistant messages
        content = completeMessagesContent(messages);
        const actions = resolveActions(content);
        action = actions[0];
      }
      console.log("action", action);

      if (action && action.type === 'parse_error') {
        const errorMsg = `CRITICAL ERROR: Your response was not valid XML. You MUST respond with ONE XML action tag only.

Example of CORRECT format:
<finish>
  <message>Your response here</message>
</finish>

OR

<write_code>
  <path>filename.py</path>
  <content><![CDATA[
your code here
]]></content>
</write_code>

DO NOT include any text outside the XML tags. Try again with proper XML format.`;
        
        await memory.addMessage('user', errorMsg);
        await handleRetry();
        continue;
      }

      /**
       * 任务处理
       */
      if (action && action.type === 'revise_plan') {
        return {
          status: 'revise_plan',
          params: action.params
        }
      }

      /**
       * 3. Action parse failed
       * ①. The max_tokens length is not enough, need to continue to supplement and improve
       * ②. The model return format is incorrect, parse action again
       */
      if (!action) {

        // Exceeded maximum length
        console.log("content.length", content.length, MAX_CONTENT_LENGTH);
        if (content.length > MAX_CONTENT_LENGTH) {
          return {
            status: "failure",
            comments: `Model output exception, stopping task`,
          }
        }

        // use retryHandle to handle retry logic
        const { shouldContinue, result } = retryHandle(retryCount, totalRetryAttempts, maxRetries, maxTotalRetries);
        if (!shouldContinue) {
          return result;
        }

        const status = checkConsecutiveAssistantXml(messages);
        if (status === 'to be continue') {
          continue;
        }

        // Feedback invalid format
        await memory.addMessage('user', "resolve action failed, Please only generate valid xml format content");

        await handleRetry();
        continue;
      }

      // 4. Check if action is 'finish' (task completed)
      if (action.type === "finish") {
        // Include task context so finish_action can detect ultra tasks
        const contextWithTask = { ...context, task };
        const result = await finish_action(action, contextWithTask, task.id);
        return result;
      }

      // 5. File versioning enforcement (prevent overwrites)
      if (action.type === 'write_code' && action.params) {
        const fs = require('fs');
        const path = require('path');
        const { getDirpath } = require('@src/utils/electron');
        
        // Get the file path parameter (handle all variants)
        let filepath = action.params.file_path || action.params.path || action.params['@_file_path'];
        
        if (filepath) {
          const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', context.user_id);
          const dir_name = 'Conversation_' + context.conversation_id.slice(0, 6);
          const fullPath = path.join(WORKSPACE_DIR, dir_name, filepath);
          
          // Check if file exists
          try {
            if (fs.existsSync(fullPath)) {
              // CRITICAL: Always create versioned files for document edits
              // This preserves previous versions in earlier response bubbles
              // Only skip versioning for temp scripts
              const isTempScript = filepath.includes('temp_script_') || filepath.includes('update_') || filepath.includes('finalize_');
              
              if (!isTempScript) {
                // Document file - create versioned copy
                const ext = path.extname(filepath);
                const basename = path.basename(filepath, ext);
                const dirname = path.dirname(filepath);
                
                // Generate versioned filename
                let newFilename;
                if (basename.includes('_updated') || basename.match(/_v\d+$/)) {
                  // Already versioned - increment
                  const match = basename.match(/_v(\d+)$/);
                  if (match) {
                    const version = parseInt(match[1]) + 1;
                    newFilename = `${basename.replace(/_v\d+$/, '')}_v${version}${ext}`;
                  } else {
                    newFilename = `${basename}_v2${ext}`;
                  }
                } else {
                  // First version
                  newFilename = `${basename}_updated${ext}`;
                }
                
                const newPath = dirname === '.' ? newFilename : path.join(dirname, newFilename);
                
                // Update all path parameter variants
                if (action.params.file_path) action.params.file_path = newPath;
                if (action.params.path) action.params.path = newPath;
                if (action.params['@_file_path']) action.params['@_file_path'] = newPath;
                
                console.log(`[FileVersioning] Creating versioned file: ${filepath} → ${newPath}`);
              } else {
                // Temp script - allow overwrite
                console.log(`[FileVersioning] Allowing temp script overwrite: ${filepath}`);
              }
            }
          } catch (err) {
            // File doesn't exist or error checking - proceed normally
          }
        }
      }
      
      // 6. Execute action(s)
      // CRITICAL: If multiple actions from preGeneratedAction (ultra-fast-path), execute ALL sequentially
      let action_result = null;
      let allActionsSucceeded = false;
      
      if (actions.length > 1 && task.preGeneratedAction) {
        console.log('[CodeAct] Executing multiple pre-generated actions:', actions.length);
        allActionsSucceeded = true; // Assume success, set false if any fails
        
        for (let i = 0; i < actions.length; i++) {
          const currentAction = actions[i];
          console.log(`[CodeAct] Executing action ${i + 1}/${actions.length} - type:`, currentAction.type);
          action_result = await context.runtime.execute_action(currentAction, context, task.id);
          console.log(`[CodeAct] Action ${i + 1} result:`, JSON.stringify(action_result).substring(0, 300));
          
          // CRITICAL: Mask /workspace/... Python file success messages from UI (multi-action)
          if (action_result.content && /^File \/workspace\/.*\.py written successfully\.?\s*$/.test(action_result.content)) {
            console.log('[CodeAct] Masking Python file success message from UI (multi-action)');
            action_result.content = ''; // Hide from UI stream
          }
          
          // Track generated files
          if (!context.generate_files) {
            context.generate_files = [];
          }
          if (action_result.meta && action_result.meta.filepath) {
            context.generate_files.push(action_result.meta.filepath);
          }
          
          // If any action fails, stop and handle error
          if (action_result.status === 'failure' || action_result.error) {
            console.log(`[CodeAct] Action ${i + 1} failed, stopping execution chain`);
            allActionsSucceeded = false;
            break;
          }
        }
        
        // If all actions succeeded, call finish_action to send finish_summery
        if (allActionsSucceeded) {
          console.log('[CodeAct] ✅ All multi-actions succeeded - calling finish_action');
          
          // CRITICAL: Scan for newly created files (e.g., .docx created by Python script)
          // context.generate_files only has write_code files (.py), not files created during execution
          try {
            const conversationDir = path.join('/app/workspace', `user_${context.user_id}`, `Conversation_${context.conversation_id.substring(0, 6)}`);
            const files = fs.readdirSync(conversationDir);
            const now = Date.now();
            
            for (const file of files) {
              const filepath = path.join(conversationDir, file);
              const stats = fs.statSync(filepath);
              const ageMs = now - stats.mtimeMs;
              
              // If file was modified in last 10 seconds and not already tracked
              if (ageMs < 10000 && !context.generate_files.includes(filepath)) {
                // Skip .py files (already tracked) and todo.md
                if (!file.endsWith('.py') && file !== 'todo.md') {
                  console.log(`[CodeAct] Found newly created file: ${file}`);
                  context.generate_files.push(filepath);
                }
              }
            }
          } catch (err) {
            console.error('[CodeAct] Error scanning for new files:', err);
          }
          
          // Build summary message with file information
          // Hide implementation artifacts (.py) and internal bookkeeping (todo.md)
          let summaryMessage = 'Task completed successfully.';
          if (context.generate_files && context.generate_files.length > 0) {
            const fileNames = context.generate_files
              .map(fp => path.basename(fp))
              .filter(name => name && !name.endsWith('.py') && name !== 'todo.md');
            if (fileNames.length > 0) {
              summaryMessage = `Successfully created ${fileNames.length} file(s): ${fileNames.join(', ')}`;
            }
          }
          
          // Create finish action object
          const finishAction = {
            type: 'finish',
            params: {
              message: summaryMessage
            }
          };
          
          // ULTRA-FAST-PATH FIX: Send dummy plan message first to satisfy frontend expectations
          // Frontend expects a plan message to exist before processing actions
          // FIX: Add files to actions array so they appear in "view all files"
          const ultraPlan = Message.format({
            status: 'success',
            task_id: task.id,
            action_type: 'plan',
            content: '',
            comments: '',
            memorized: '',
            json: [{
              id: task.id,
              name: 'Instant Execution',
              description: 'Ultra-fast-path execution',
              status: 'completed',
              actions: [{
                files: context.generate_files || [],
                is_ultra_fast: true
              }],
              is_ultra_fast: true
            }]
          });
          
          // Send plan message via onTokenStream
          const { onTokenStream } = context;
          if (onTokenStream) {
            onTokenStream(ultraPlan);
          }
          
          // Call finish_action to send finish_summery message to frontend
          // Include task context so finish_action can detect ultra tasks
          const contextWithTask = { ...context, task };
          const result = await finish_action(finishAction, contextWithTask, task.id);
          return result;
        }
      } else {
        // Single action - execute normally
        console.log('[CodeAct] Executing action type:', action.type);
        action_result = await context.runtime.execute_action(action, context, task.id);
        console.log('[CodeAct] Action result:', JSON.stringify(action_result).substring(0, 300));
        
        // CRITICAL: Auto-execute Python files after write_code
        // Full agent writes .py files but doesn't auto-execute them (unlike ultra-fast-path)
        // This ensures Python scripts are run after being written
        if (action.type === 'write_code' && action_result.status === 'success') {
          const filepath = action_result.meta?.filepath;
          if (filepath && filepath.endsWith('.py')) {
            console.log('[CodeAct] 🐍 Python file detected - auto-executing:', filepath);
            
            // Create terminal_run action to execute the Python file
            const filename = path.basename(filepath);
            const terminalAction = {
              type: 'terminal_run',
              params: {
                command: 'python3',
                args: filename,
                cwd: './' // Will be resolved to conversation directory by runtime
              }
            };
            
            // Execute the Python script
            console.log('[CodeAct] Executing Python script:', filename);
            const execResult = await context.runtime.execute_action(terminalAction, context, task.id);
            console.log('[CodeAct] Python execution result:', JSON.stringify(execResult).substring(0, 300));
            
            // Use execution result as the action result (contains actual output)
            action_result = execResult;
          }
        }
        
        // CRITICAL: Mask /workspace/... Python file success messages from UI
        if (action_result.content && /^File \/workspace\/.*\.py written successfully\.?\s*$/.test(action_result.content)) {
          console.log('[CodeAct] Masking Python file success message from UI');
          action_result.content = ''; // Hide from UI stream
        }
        
        if (!context.generate_files) {
          context.generate_files = [];
        }
        if (action_result.meta && action_result.meta.filepath) {
          context.generate_files.push(action_result.meta.filepath);
        }
      }
      // console.log("action_result", action_result);

      // 6. Reflection and evaluation
      // For pre-generated specialist actions, check if they succeeded before skipping reflection
      if (task.preGeneratedAction) {
        console.log('[CodeAct] Pre-generated specialist action detected');
        
        // Check if the action actually succeeded
        if (action_result.status === 'failure' || action_result.error) {
          console.log('[CodeAct] ⚠️ Specialist action failed - enabling reflection and retry');
          console.log('[CodeAct] Error:', action_result.error);
          
          // Clear the pre-generated flag so we can adapt and retry
          task.preGeneratedAction = false;
          
          // Use reflection to figure out how to fix the issue
          const reflection_result = await reflection(requirement, action_result, context.conversation_id);
          console.log("reflection_result", reflection_result);
          const { status, comments } = reflection_result;
          
          if (status === "failure") {
            // Add reflection to context for next iteration
            context.reflection = comments;
            console.log('[CodeAct] Reflection suggests:', comments);
            await memory.addMessage("user", comments);
            
            // NUANCE: Send conversational retry message to user
            if (context.onTokenStream && retryCount < maxRetries) {
              const { sendProgressMessage } = require('@src/routers/agent/utils/coding-messages');
              // Use natural reflection comments (now conversational after reflection/index.js update)
              await sendProgressMessage(context.onTokenStream, context.conversation_id, comments, 'progress');
            }
            
            // Retry with reflection guidance
            retryCount++;
            totalRetryAttempts++;
            console.log(`[CodeAct] Retrying with adaptation (${retryCount}/${maxRetries})...`);
            continue;
          }
        }
        
        // If successful, extract filename and finish
        console.log('[CodeAct] Specialist action succeeded - finishing');
        if (action_result.content) {
          const filenameMatch = action_result.content.match(/Created:\s*([^\s\n]+\.(docx|xlsx|pdf|txt|csv))/i);
          if (filenameMatch) {
            const filename = filenameMatch[1];
            // Construct workspace path: workspace/user_X/Conversation_XXXXXX/filename
            const { getDirpath } = require('@src/utils/electron');
            const path = require('path');
            const dir_name = 'Conversation_' + context.conversation_id.slice(0, 6);
            const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', context.user_id);
            const filepath = path.join(WORKSPACE_DIR, dir_name, filename);
            console.log('[CodeAct] Detected created file:', filepath);
            if (!context.generate_files) {
              context.generate_files = [];
            }
            context.generate_files.push(filepath);
          }
        }
        
        // Show user-friendly message without technical paths
        let userMessage = action_result.content || 'File created successfully';
        if (userMessage.includes('Created:')) {
          const filenameOnly = userMessage.match(/Created:\s*([^\s\n/]+)$/i);
          if (filenameOnly) {
            userMessage = `✅ ${filenameOnly[1]} created successfully`;
          } else {
            userMessage = '✅ File created successfully';
          }
        }
        const finish_result = { params: { message: userMessage } };
        // Include task context so finish_action can detect ultra tasks
        const contextWithTask = { ...context, task };
        const result = await finish_action(finish_result, contextWithTask, task.id);
        return result;
      }
      
      // Skip reflection for clean success (optimization: saves ~1-2 minutes)
      let reflection_result;
      if (action_result.status === 'success' && !action_result.stderr && !action_result.error) {
        console.log('[CodeAct] Clean success - skipping reflection');
        reflection_result = { status: 'success', comments: 'Execution successful' };
      } else {
        console.log('[CodeAct] Running reflection for error/partial result');
        reflection_result = await reflection(requirement, action_result, context.conversation_id);
        console.log("reflection_result", reflection_result);
      }
      const { status, comments } = reflection_result;

      // 7. Handle execution result
      if (status === "success") {
        retryCount = 0; // reset retryCount
        const { content } = action_result;
        const task_tool = task.tools && task.tools[0];
        if (action.type === task_tool) {
          const finish_result = { params: { message: content } }
          // Include task context so finish_action can detect ultra tasks
          const contextWithTask = { ...context, task };
          const result = await finish_action(finish_result, contextWithTask, task.id);
          return result;
        }
        continue;
      } else if (status === "failure") {
        // use retryHandle to handle retry logic
        const { shouldContinue, result } = retryHandle(retryCount, totalRetryAttempts, maxRetries, maxTotalRetries, comments);
        if (!shouldContinue) {
          return result;
        }
        retryCount++;
        totalRetryAttempts++;
        // log reflection result to memory and context for further evaluation and refinement
        context.reflection = comments;
        console.log("code-act.memory logging user prompt");
        await memory.addMessage("user", comments);
        // Exponential backoff for reflection retries
        const reflectionDelayMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        console.log(`[CodeAct] Reflection retry - waiting ${reflectionDelayMs}ms...`);
        await delay(reflectionDelayMs);
        console.log(`Retrying (${retryCount}/${maxRetries}). Total attempts: ${totalRetryAttempts}/${maxTotalRetries}...`);
      }
    } catch (error) {
      // 8. Exception handling
      console.error("An error occurred:", error);

      // 检查是否为需要暂停的错误类型: 积分不足 | LLM 调用失败
      if (isPauseRequiredError(error)) {
        return {
          status: "failure",
          comments: error.message,
          error: error
        };
      }

      // 普通错误处理逻辑
      // use retryHandle to handle retry logic, pass in error message
      await memory.addMessage("user", error.message);
      const { shouldContinue, result } = retryHandle(retryCount, totalRetryAttempts, maxRetries, maxTotalRetries, error.message);
      if (!shouldContinue) {
        return result;
      }
      
      // Apply exponential backoff before retrying (prevents 429 rate limit errors)
      await handleRetry();
      console.log(`Retrying (${retryCount}/${maxRetries}). Total attempts: ${totalRetryAttempts}/${maxTotalRetries}...`);
    }
  }
  
  // If we exit the loop without finishing, return failure
  console.error(`[CodeAct] Max loop iterations (${MAX_LOOP_ITERATIONS}) reached. Task incomplete.`);
  return {
    status: "failure",
    comments: `Task exceeded maximum execution attempts (${MAX_LOOP_ITERATIONS} iterations). This prevents infinite API calls. Please simplify the task or break it into smaller steps.`,
    error: new Error("Max loop iterations exceeded")
  };
};

module.exports = exports = completeCodeAct;
