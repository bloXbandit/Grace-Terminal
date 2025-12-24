// @ts-ignore
const router = require("koa-router")();
const handleStream = require("@src/utils/stream.util");

const uuid = require("uuid");
// REMOVED: sportsQueryMiddleware - Using auto-reply fast-path instead for proper streaming
const { Op } = require('sequelize');
const Conversation = require("@src/models/Conversation");
const AgenticAgent = require("@src/agent/AgenticAgent");
const detect_intent = require("@src/agent/intent-detection");
const chat_completion = require('@src/agent/chat-completion/index')
const Message = require("@src/utils/message");
const Agent = require('@src/models/Agent')
const calcToken = require('@src/completion/calc.token.js');
const File = require('@src/models/File')
const Model = require('@src/models/Model')
const path = require('path')
const fs = require('fs').promises
const { getDirpath } = require('@src/utils/electron');
const RUNTIME_TYPE = process.env.RUNTIME_TYPE || 'local-docker'


let closeContainer
if (RUNTIME_TYPE && RUNTIME_TYPE === 'local-docker') {
  closeContainer = async () => {
    console.log('[Local] Skipping container close in local mode')
  }
}

const activeAgents = new Map();
// JOB QUEUE: Store pending tasks per conversation
// Map<conversation_id, Array<{ question, files, context, mode, agent_id, queuedAt }>>
const taskQueues = new Map();
const MessageTable = require('@src/models/Message');

const handle_feedback = require("@src/knowledge/feedback");
const Knowledge = require("@src/models/Knowledge");
const ENABLE_KNOWLEDGE = process.env.ENABLE_KNOWLEDGE || "ON"
const { getProfileContext } = require('@src/services/userProfile');
const { extractProfileFromMessage } = require('@src/agent/profile/extract');
const MultiAgentCoordinator = require('@src/agent/specialists/MultiAgentCoordinator');
const TaskLogger = require('@src/agent/seal/TaskLogger');
const modeCommandHandler = require('@src/agent/modes/ModeCommandHandler');
const devMode = require('@src/agent/modes/DevMode');

/**
 * @swagger
 * /api/agent/run:
 *   post:
 *     tags:
 *       - Agent
 *     summary: Execute code task and push results in real-time via SSE
 *     description: |
 *       Intelligent task execution endpoint that can automatically choose between agent mode and chat mode.
 *       - Agent mode: For complex tasks requiring code execution, file operations, or system interactions
 *       - Chat mode: For simple conversations and general Q&A
 *       - Auto mode (default): Uses AI-based intent detection to choose the appropriate mode
 *       Results are streamed in real-time via SSE.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               question:
 *                 type: string
 *                 description: User's question or instruction
 *               conversation_id:
 *                 type: string
 *                 description: Conversation ID, used to identify the current conversation
 *               mode:
 *                 type: string
 *                 enum: [auto, agent, chat, twins]
 *                 default: auto
 *                 description: |
 *                   Execution mode:
 *                   - 'auto': Automatically choose between agent and chat based on intent detection
 *                   - 'agent': Force use agent mode for complex tasks
 *                   - 'chat': Force use chat mode for simple conversation
 *                   - 'twins': Execute both chat and agent modes in sequence
 *               fileIds:
 *                 type:json
 *             required:
 *               - question
 *     responses:
 *       200:
 *         description: 流式响应开启
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: SSE 数据流，每条数据为一个 token
 */
// Sports queries now handled via auto-reply fast-path for proper streaming support
router.post("/run", async (ctx, next) => {
  const { request, response } = ctx;
  const body = request.body || {};
  let { question, conversation_id, fileIds, mcp_server_ids = [], model_id, agent_id, mode = 'auto' } = body;
  const isVoiceTask = ctx.headers['x-voice-task'] === 'true';

  // Get default model if not provided
  if (!model_id) {
    const DefaultModelSetting = require('@src/models/DefaultModelSetting');
    const defaultSetting = await DefaultModelSetting.findOne({ where: { setting_type: 'assistant' } });
    model_id = defaultSetting?.model_id || 22; // Fallback to GPT-5 Pro (model 22)
  }

  await Conversation.update({ model_id, status: "running" }, { where: { conversation_id } })
  if (agent_id) {
    await Agent.update({ mcp_server_ids }, { where: { id: agent_id } })
  }
  let files = [];
  console.log("当前运行任务：")
  const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', ctx.state.user.id);
  const dir_name = 'Conversation_' + conversation_id.slice(0, 6);
  const dir_path = path.join(WORKSPACE_DIR, dir_name);
  await fs.mkdir(dir_path, { recursive: true });

  // 准备记忆模块处理选项（但根据模式不同时机处理）
  const feedbackOptions = {
    user_feedback: question,
    conversation_id,
    agent_id,
  };

  console.log('[Agent Router] ========== FILE PROCESSING ==========');
  console.log('[Agent Router] fileIds from current message:', fileIds);
  console.log('[Agent Router] fileIds type:', typeof fileIds);
  console.log('[Agent Router] fileIds is array:', Array.isArray(fileIds));
  
  // STEP 1: Process newly uploaded files (if any) - move them to conversation folder
  if (Array.isArray(fileIds) && fileIds.length > 0) {
    console.log('[Agent Router] Processing', fileIds.length, 'newly uploaded file(s)');
    for (const fileId of fileIds) {
      await File.update(
        { conversation_id: conversation_id },
        { where: { id: fileId } }
      );
    }
    
    const newFiles = await File.findAll({
      where: { id: fileIds }
    });
    console.log('[Agent Router] New files from DB:', newFiles.length);

    // Move newly uploaded files from temp upload folder to conversation folder
    const uploadDir = path.join(WORKSPACE_DIR, 'upload');
    const targetUploadDir = path.join(dir_path, 'upload');
    await fs.mkdir(targetUploadDir, { recursive: true });

    for (const file of newFiles) {
      const srcPath = path.join(uploadDir, file.name);
      const destPath = path.join(targetUploadDir, file.name);

      try {
        await fs.rename(srcPath, destPath);
        // CRITICAL: Update file.url to relative path after moving
        await File.update(
          { url: `upload/${file.name}` },
          { where: { id: file.id } }
        );
      } catch (err) {
        if (err.code === 'EXDEV' || err.code === 'EEXIST') {
          // Cross-partition or exists, copy then delete
          await fs.copyFile(srcPath, destPath);
          await fs.unlink(srcPath);
          // CRITICAL: Update file.url to relative path after copying
          await File.update(
            { url: `upload/${file.name}` },
            { where: { id: file.id } }
          );
        } else {
          throw err;
        }
      }
    }
  }
  
  // STEP 2: Load ALL files for this conversation (for agent context)
  // This gives agent persistent file access across all messages
  if (conversation_id) {
    files = await File.findAll({
      where: { conversation_id: conversation_id },
      order: [['create_at', 'DESC']] // Newest first
    });
    console.log('[Agent Router] Total conversation files loaded:', files.length);
    console.log('[Agent Router] Files:', files.map(f => ({ id: f.id, name: f.name, url: f.url })));
  } else {
    files = [];
    console.log('[Agent Router] No conversation_id yet, no files loaded');
  }
  if (!conversation_id) {
    conversation_id = uuid.v4();
    const title = 'Conversation_' + conversation_id.slice(0, 6);
    const newConversation = await Conversation.create({
      conversation_id: conversation_id,
      content: question,
      title: title,
      status: 'running',
      modeType: 'task',
      user_id: ctx.state.user.id,
      model_id: model_id  // Use the default model we just looked up
    });
  }

  body.responseType = body.responseType || "sse";
  const { stream, onTokenStream } = handleStream(body.responseType, response);

  // Check for mode commands (/dev, /normal, /dev status)
  const modeCommandResult = await modeCommandHandler.handleCommand(question, conversation_id);
  if (modeCommandResult) {
    // This was a mode command, return the result directly
    const content = modeCommandResult.message || modeCommandResult.error || 'Mode command executed';
    const msg = Message.format({
      status: modeCommandResult.success ? 'success' : 'failure',
      action_type: 'auto_reply',
      content: content
    });
    // Send full message object like AgenticAgent does
    onTokenStream(msg);
    // Give stream time to flush before ending
    await new Promise(resolve => setImmediate(resolve));
    await Message.saveToDB(msg, conversation_id);
    await Conversation.update({ status: 'done' }, { where: { conversation_id } });
    ctx.body = stream;
    stream.end();
    return;
  }
  // 处理文件信息，用于消息保存
  for (let file of files) {
    file.filename = file.name
    // CRITICAL: url may be absolute (/app/workspace/.../upload/file.pdf) or relative (upload/file.pdf)
    // Extract just the filename and construct correct path
    const filename = path.basename(file.url);
    file.filepath = path.join(dir_path, 'upload', filename)
  }

  const newFiles = files.map(file => {
    let obj = file.dataValues
    // CRITICAL: Ensure name/filename is set
    // Priority: obj.name from DB > extract from url > 'unknown'
    const dbName = obj.name;
    const urlFilename = obj.url ? path.basename(obj.url) : null;
    const finalName = dbName || urlFilename || 'unknown';
    
    obj.filename = finalName;
    obj.name = finalName; // Set both for compatibility
    
    // CRITICAL: url may be absolute or relative, extract just filename
    const filename = path.basename(obj.url || finalName);
    obj.filepath = path.join(dir_path, 'upload', filename)
    
    console.log('[Agent Router] File path constructed:', { 
      dbName,
      urlFilename,
      finalName,
      url: obj.url, 
      filename, 
      dir_path: dir_path.substring(0, 50), 
      filepath: obj.filepath 
    });
    return obj
  })

  console.log('[Agent Router] newFiles created:', newFiles.length);
  console.log('[Agent Router] newFiles:', JSON.stringify(newFiles.map(f => ({ name: f.name, filepath: f.filepath })), null, 2));

  // Get user profile context (non-invasive)
  let profileContext = '';
  try {
    profileContext = await getProfileContext(ctx.state.user.id);
  } catch (err) {
    console.error('Profile context error (non-critical):', err);
  }

  // Initialize Multi-Agent Coordinator (ONLY for Task/Auto modes)
  const coordinator = new MultiAgentCoordinator({
    conversation_id,
    user_id: ctx.state.user.id
  });

  const context = {
    onTokenStream,
    conversation_id,
    user_id: ctx.state.user.id,
    mcp_server_ids,
    agent_id,
    profileContext, // Add profile context to agent
    coordinator, // Add coordinator for specialist routing (Task/Auto modes only)
    enableSpecialistRouting: true, // Enable routing for complex tasks
    files: newFiles, // CRITICAL: Add uploaded files for file analyzer access
    newlyUploadedFileIds: fileIds || [], // OPTIMIZATION: Track which files are new uploads (skip cache check)
    isVoiceTask // Add voice task indicator to context
  }

  console.log('[Agent Router] Context created with files:', context.files ? context.files.length : 0);
  if (context.files && context.files.length > 0) {
    console.log('[Agent Router] Context files detail:', context.files.map(f => ({ 
      name: f.name, 
      filename: f.filename, 
      filepath: f.filepath 
    })));
  }

  // CRITICAL FIX: Synchronous profile extraction with timeout to prevent race conditions
  if (!isVoiceTask) {
    try {
      await Promise.race([
        extractProfileFromMessage(ctx.state.user.id, question, conversation_id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile extraction timeout')), 2000)
        )
      ]);
      console.log('[Task] Profile extraction completed successfully');
    } catch (err) {
      console.error('[Task] Profile extraction failed (continuing anyway):', err.message);
    }
  }

  // 根据mode参数确定处理方式
  let intent;
  if (mode === 'auto') {
    // CRITICAL: If files are uploaded, automatically use agent mode
    if (files && files.length > 0) {
      console.log(`[AUTO Mode] 📎 File upload detected (${files.length} file(s)) - forcing agent mode`);
      intent = 'agent';
    } else {
      const q = (question || '').trim();

      // VOICE FAST-PATH (hard default):
      // For voice turns, avoid *all* intent-detection LLM calls.
      // Default to chat unless the text clearly looks like a command/task.
      if (isVoiceTask) {
        const looksLikeCommand = /\b(make|create|generate|build|write|run|execute|open|edit|fix|debug|refactor|install|deploy|docker|git|commit|push|pull|search|download|summarize|analyze|plan)\b/i.test(q);
        const simpleFileGenPattern = /^(can\s+(you\s+)?(please\s+)?(make|create|generate|write|draft)\s+(a\s+)?(word|docx?|document)\s+(about|on|regarding)?\s*(.+))$/i;
        const isDocCommand = simpleFileGenPattern.test(q);

        if (looksLikeCommand || isDocCommand) {
          intent = 'agent';
          console.log(`[AUTO Mode] 🎤 Voice command detected, skipping intent detection -> agent (q="${q}")`);
        } else {
          intent = 'chat';
          console.log(`[AUTO Mode] 🎤 Voice default, skipping intent detection -> chat (q="${q}")`);
        }
      }

      if (intent) {
        // intent decided by voice fast-path
      } else {
        // 自动选择：使用意图识别
        console.log('自动模式：开始意图识别...');
        try {
          // 获取上下文消息用于意图识别
          // For short questions, we can use minimal context to reduce latency
          let contextMessages = [];
          if (question.length > 50) {  // For longer questions, get full context
            contextMessages = await MessageTable.findAll({
              where: {
                conversation_id: conversation_id
              },
              order: [['create_at', 'ASC']]
            });
          } else {  // For short questions, use minimal context
            contextMessages = await MessageTable.findAll({
              where: {
                conversation_id: conversation_id
              },
              order: [['create_at', 'DESC']],
              limit: 3  // Only get last 3 messages for short questions
            });
            contextMessages = contextMessages.reverse(); // Reverse to maintain chronological order
          }

          // 构建上下文格式
          const messagesContext = contextMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          }));

          intent = await detect_intent(question, conversation_id, messagesContext);
          console.log('意图识别结果:', intent);

          // 将结果标准化为小写
          intent = intent.toLowerCase().trim();
          if (intent !== 'chat' && intent !== 'agent') {
            console.log('意图识别结果异常，默认使用agent模式');
            intent = 'agent';
          }
        } catch (error) {
          console.error('意图识别失败，默认使用agent模式:', error);
          intent = 'agent';
        }
      }
    }
  } else {
    // 用户指定模式
    intent = mode.toLowerCase();
    console.log('用户指定模式:', intent);
    // 验证模式参数
    if (intent !== 'chat' && intent !== 'agent' && intent !== 'twins') {
      console.log('无效的模式参数，默认使用agent模式');
      intent = 'agent';
    }
  }

  // 根据最终确定的意图选择不同的处理方式
  // 发送模式通知到前端
  const modeNotification = `__lemon_mode__${JSON.stringify({ mode: intent })}\n\n`;
  onTokenStream(modeNotification);

  // 提取公共参数
  const commonParams = {
    conversation_id, question, newFiles, feedbackOptions,
    onTokenStream, stream, context, agent_id, ctx,
    profileContext, // CRITICAL: Pass profile context to all modes
    isVoiceTask
  };

  // 执行对应的模式
  console.log(`[Mode Selection] Final mode: ${intent} (original mode param: ${mode})`);
  
  if (intent === 'chat') {
    await executeChatMode(commonParams);
  } else if (intent === 'twins') {
    await executeTwinsMode(commonParams, dir_path);
  } else {
    // Agent mode: Process feedback first, then execute task
    console.log('[Agent Mode] Using agent mode for task execution');

    // Agent mode: Synchronously process feedback (ensure memory is updated before task execution)
    if (ENABLE_KNOWLEDGE === "ON") {
      try {
        await handle_feedback(feedbackOptions);
        // 更新条目数
        const knowledge_count = await Knowledge.count({ where: { agent_id: agent_id } });
        await Agent.update({ knowledge_count }, { where: { id: agent_id } });
        console.log('[Agent Mode] Feedback processing complete, starting task execution');
      } catch (error) {
        console.error('[Agent Mode] Feedback processing failed:', error);
      }
    }

    // Agent mode stream close handling (includes screenshot logic)
    stream.on('close', async () => {
      console.log('Agent stream closed');
      await closeContainer(ctx.state.user.id)
      // todo 实现新的takeScreenshotAndUpload
      // 如果agent有制定的replay_conversation_id,则不更新screen_shot_url

      //更新 Conversation 的截图
      // await Conversation.update({ screen_shot_url: screen_url }, { where: { conversation_id } })

      // Check if task completed successfully and update recommend field
      await updateAgentRecommend(conversation_id, agent_id);
    });

    const onCompleted = () => {
      stream.end();
    };

    // INTERRUPTIBLE EXECUTION: Check if conversation already has active agent
    // RACE CONDITION FIX: Use atomic check-and-set to prevent duplicate executions
    const existingExecution = activeAgents.get(conversation_id);
    if (existingExecution) {
      console.log(`[Run] ⚠️ Conversation ${conversation_id} already has active execution ${existingExecution.executionId}`);
      
      // JOB QUEUE: Add task to queue for auto-retry after current execution completes
      if (!taskQueues.has(conversation_id)) {
        taskQueues.set(conversation_id, []);
      }
      
      const queuedTask = {
        question,
        files: newFiles,
        context: { ...context }, // Clone context
        mode,
        agent_id,
        queuedAt: Date.now(),
        stream, // Keep stream reference for response
        onTokenStream
      };
      
      taskQueues.get(conversation_id).push(queuedTask);
      const queuePosition = taskQueues.get(conversation_id).length;
      
      console.log(`[Queue] Task queued for ${conversation_id}, position: ${queuePosition}`);
      
      // Send notification to user
      const notificationMsg = Message.format({
        role: 'system',
        status: 'success',
        content: `⚡ Hold up! I'm still working on your previous request. I'll start this one right after... (Queue position: ${queuePosition})`,
        action_type: 'progress',
        task_id: conversation_id
      });
      onTokenStream(notificationMsg);
      await Message.saveToDB(notificationMsg, conversation_id);
      
      // Save queued message to DB
      const queuedMsg = Message.format({
        role: 'user',
        status: 'success',
        content: question,
        action_type: 'question',
        task_id: conversation_id,
        json: newFiles
      });
      await Message.saveToDB(queuedMsg, conversation_id);
      
      // Don't end stream yet - will be used when task executes
      return;
    }
    
    // RACE CONDITION FIX: Generate execution ID and reserve slot IMMEDIATELY
    // This prevents another request from slipping through before agent is created
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const reservationTime = Date.now();
    
    // Reserve the slot with a placeholder to block concurrent requests
    activeAgents.set(conversation_id, { 
      executionId, 
      startTime: reservationTime,
      reserved: true // Marker that agent is being created
    });
    console.log(`[Run] 🔒 Reserved slot ${executionId} for conversation ${conversation_id}`);
    
    // Save user message (Agent mode)
    const msg = Message.format({
      role: 'user',
      status: 'success',
      content: question,
      action_type: 'question',
      task_id: conversation_id,
      json: newFiles
    });
    const message = await Message.saveToDB(msg, conversation_id);
    // await syncQuestionVectorData(message.id,question,conversation_id)

    console.log(`[Run] Starting execution ${executionId} for conversation ${conversation_id}`);
    
    // Add execution ID to context so all messages from this run are tagged
    context.executionId = executionId;

    const agent = new AgenticAgent(context);
    // Update the reservation with the actual agent instance
    activeAgents.set(conversation_id, { agent, executionId, startTime: reservationTime });

    const startTime = Date.now();
    agent.run(question).then(async (content) => {
      console.log('content', content);
      
      // SEAL: Log successful task execution
      try {
        const conversation = await Conversation.findOne({ where: { conversation_id } });
        const execution = activeAgents.get(conversation_id);
        await TaskLogger.logTask({
          user_id: ctx.state.user?.id || 1,
          conversation_id,
          task_type: mode === 'agent' ? 'agent_task' : 'chat',
          task_description: question,
          input_data: { question, mode, files: newFiles },
          output_data: { content },
          model_used: conversation?.model_id || 'default',
          execution_time_ms: execution ? Date.now() - execution.startTime : Date.now() - startTime,
          success: true,
          tools_used: agent.toolsUsed || [],
          metadata: { agent_id, mode, executionId: execution?.executionId }
        });
      } catch (logError) {
        console.error('SEAL logging error:', logError);
      }
      
      onCompleted();
      activeAgents.delete(conversation_id);
      
      // AUTO-RETRY: Process next queued task if any
      await processNextQueuedTask(conversation_id);
    }).catch(async (error) => {
      const msg = Message.format({ status: 'success', action_type: 'error', content: error.message });
      onTokenStream(msg);
      await Message.saveToDB(msg, conversation_id);
      console.error('Agent run error:', error);
      
      // SEAL: Log failed task execution
      try {
        await TaskLogger.logTask({
          user_id: ctx.state.user?.id || 1,
          conversation_id,
          task_type: mode === 'agent' ? 'agent_task' : 'chat',
          task_description: question,
          input_data: { question, mode, files: newFiles },
          output_data: { error: error.message },
          model_used: 'default',
          execution_time_ms: Date.now() - startTime,
          success: false,
          error_message: error.message,
          tools_used: [],
          metadata: { agent_id, mode, executionId }
        });
      } catch (logError) {
        console.error('SEAL logging error:', logError);
      }
      
      onCompleted();
      activeAgents.delete(conversation_id);
      
      // AUTO-RETRY: Process next queued task if any
      await processNextQueuedTask(conversation_id);
    });
  }

  ctx.body = stream;
  ctx.status = 200;
});

/**
 * AUTO-RETRY: Process next queued task for a conversation
 */
async function processNextQueuedTask(conversation_id) {
  const queue = taskQueues.get(conversation_id);
  
  if (!queue || queue.length === 0) {
    console.log(`[Queue] No pending tasks for ${conversation_id}`);
    taskQueues.delete(conversation_id);
    return;
  }
  
  // Get next task from queue
  const nextTask = queue.shift();
  console.log(`[Queue] Processing next task for ${conversation_id}, ${queue.length} remaining`);
  
  // Send notification
  const startMsg = Message.format({
    role: 'system',
    status: 'success',
    content: `🚀 Starting your queued request now...`,
    action_type: 'progress',
    task_id: conversation_id
  });
  nextTask.onTokenStream(startMsg);
  await Message.saveToDB(startMsg, conversation_id);
  
  // Execute the queued task
  try {
    // RACE CONDITION FIX: Reserve slot immediately (same pattern as main execution)
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const reservationTime = Date.now();
    
    // Reserve the slot first
    activeAgents.set(conversation_id, { 
      executionId, 
      startTime: reservationTime,
      reserved: true 
    });
    console.log(`[Queue] 🔒 Reserved slot ${executionId} for queued task`);
    
    nextTask.context.executionId = executionId;
    
    const agent = new AgenticAgent(nextTask.context);
    // Update reservation with actual agent
    activeAgents.set(conversation_id, { agent, executionId, startTime: reservationTime });
    
    const startTime = Date.now();
    agent.run(nextTask.question).then(async (content) => {
      console.log('[Queue] Queued task completed successfully');
      
      // Log task execution
      try {
        const conversation = await Conversation.findOne({ where: { conversation_id } });
        const execution = activeAgents.get(conversation_id);
        await TaskLogger.logTask({
          user_id: nextTask.context.user_id || 1,
          conversation_id,
          task_type: nextTask.mode === 'agent' ? 'agent_task' : 'chat',
          task_description: nextTask.question,
          input_data: { question: nextTask.question, mode: nextTask.mode, files: nextTask.files },
          output_data: { content },
          model_used: conversation?.model_id || 'default',
          execution_time_ms: execution ? Date.now() - execution.startTime : Date.now() - startTime,
          success: true,
          tools_used: agent.toolsUsed || [],
          metadata: { agent_id: nextTask.agent_id, mode: nextTask.mode, executionId: execution?.executionId, queued: true }
        });
      } catch (logError) {
        console.error('[Queue] SEAL logging error:', logError);
      }
      
      nextTask.stream.end();
      activeAgents.delete(conversation_id);
      
      // Process next task if any
      await processNextQueuedTask(conversation_id);
    }).catch(async (error) => {
      console.error('[Queue] Queued task failed:', error);
      
      const errorMsg = Message.format({ 
        status: 'success', 
        action_type: 'error', 
        content: error.message 
      });
      nextTask.onTokenStream(errorMsg);
      await Message.saveToDB(errorMsg, conversation_id);
      
      // Log failed task
      try {
        await TaskLogger.logTask({
          user_id: nextTask.context.user_id || 1,
          conversation_id,
          task_type: nextTask.mode === 'agent' ? 'agent_task' : 'chat',
          task_description: nextTask.question,
          input_data: { question: nextTask.question, mode: nextTask.mode, files: nextTask.files },
          output_data: { error: error.message },
          model_used: 'default',
          execution_time_ms: Date.now() - startTime,
          success: false,
          error_message: error.message,
          tools_used: [],
          metadata: { agent_id: nextTask.agent_id, mode: nextTask.mode, executionId, queued: true }
        });
      } catch (logError) {
        console.error('[Queue] SEAL logging error:', logError);
      }
      
      nextTask.stream.end();
      activeAgents.delete(conversation_id);
      
      // Process next task if any
      await processNextQueuedTask(conversation_id);
    });
  } catch (error) {
    console.error('[Queue] Error starting queued task:', error);
    nextTask.stream.end();
    
    // Try next task
    await processNextQueuedTask(conversation_id);
  }
}

// 检查任务是否正常完成并更新 agent recommend 字段
async function updateAgentRecommend(conversation_id, agent_id) {
  try {
    const agent = await Agent.findOne({ where: { id: agent_id } });
    if (!agent) {
      console.log(`Agent ${agent_id} not found`);
      return;
    }

    // 检查是否存在 action_type 为 "finish_summery" 的消息
    const messages = await MessageTable.findAll({
      where: {
        conversation_id: conversation_id
      }
    });

    let finishMessage = null;
    for (const message of messages) {
      try {
        let meta = message.meta;
        if (typeof meta === 'string') {
          meta = JSON.parse(meta);
        }
        console.log('meta', meta.action_type)
        if (meta && meta.action_type === 'finish_summery') {
          finishMessage = message;
          break;
        }
      } catch (error) {
        // 忽略JSON解析错误，继续检查下一条消息
        continue;
      }
    }

    if (finishMessage) {
      // 任务正常完成，将 recommend 设为 0（如果之前是 -1）
      if (agent.recommend === -1) {
        await Agent.update({ recommend: 0 }, { where: { id: agent_id } });
        console.log(`Agent ${agent_id} recommend updated to 0 (task completed successfully)`);
      }
    } else {
      // 任务未正常完成，将 recommend 设为 -1
      await Agent.update({ recommend: -1 }, { where: { id: agent_id } });
      console.log(`Agent ${agent_id} recommend updated to -1 (task not completed)`);
    }
  } catch (error) {
    console.error(`Error updating agent recommend for agent ${agent_id}:`, error);
  }
}

// 找到除了todo.md以外最后生成的文件
async function getFinalFile(dir_path) {
  const files = await fs.readdir(dir_path, { withFileTypes: true });
  let latestFile = null;
  let latestMtime = 0;
  let todoFile = null;

  for (const entry of files) {
    if (entry.isFile()) {
      if (entry.name === 'todo.md') {
        todoFile = path.join(dir_path, entry.name);
        continue;
      }
      const filePath = path.join(dir_path, entry.name);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latestFile = filePath;
      }
    }
  }

  if (latestFile) {
    return latestFile;
  } else if (todoFile) {
    return todoFile;
  } else {
    // fallback: if even todo.md doesn't exist, return null
    return null;
  }
}

/**
 * @swagger
 * /api/agent/stop:
 *   post:
 *     tags:
 *       - Agent
 *     summary: 停止正在执行的 Agent 任务
 *     description: |
 *       接收一个 `conversation_id` 并尝试停止对应的 AgenticAgent 实例。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               conversation_id:
 *                 type: string
 *                 description: 要停止的 Agent 的对话 ID
 *             required:
 *               - conversation_id
 *     responses:
 *       200:
 *         description: Agent 成功停止或未找到活跃 Agent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: string
 *                 code:
 *                   type: integer
 *                   description: Status code
 *                 msg:
 *                   type: string
 *                   description: Message
 */
router.post("/stop", async ({ state, request, response }) => {
  const { conversation_id } = request.body || {};

  // INTERRUPTIBLE EXECUTION: Get execution object (contains agent, executionId, startTime)
  const execution = activeAgents.get(conversation_id);
  const agent = execution?.agent;

  await Conversation.update({ status: 'stop' }, { where: { conversation_id: conversation_id } });
  await closeContainer(state.user.id)

  // Get agent_id from conversation
  const conversation = await Conversation.findOne({ where: { conversation_id } });
  const agent_id = conversation ? conversation.agent_id : null;

  if (agent) {
    try {
      console.log(`[Stop] Stopping execution ${execution.executionId} for conversation ${conversation_id}`);
      
      if (typeof agent.stop === 'function') {
        await agent.stop();
        activeAgents.delete(conversation_id);

        // Check completion status after stop
        if (agent_id) {
          await updateAgentRecommend(conversation_id, agent_id);
        }

        response.success(`Agent execution ${execution.executionId} stopped`)
      } else {
        response.fail('Agent has no stop method')
      }
    } catch (error) {
      response.fail(`Error stopping Agent ${conversation_id}: ${error.message}`)
    }
  } else {
    response.fail(`No active agent found for conversation ${conversation_id}`)
  }
});

async function getHistoryMessageSequence(messages, pid) {
  let history_messages = []
  let current_message = messages.find(message => message.id === pid)
  history_messages.push(current_message)
  if (typeof current_message.meta === 'string') {
    current_message.meta = JSON.parse(current_message.meta);
  }
  while (!(current_message.meta.pid === -1)) {
    current_message = messages.find(message => message.id === current_message.meta.pid)
    if (typeof current_message.meta === 'string') {
      current_message.meta = JSON.parse(current_message.meta);
    }
    history_messages.push(current_message)
  }
  // reverse
  history_messages.reverse()
  return history_messages
}

// 按时间顺序获取消息上下文，且总token不超过128k
function getMessagesContextByTime(messages) {
  // 消息已经按时间排序，从最新往旧累加token，超过128k就丢弃更旧的
  const reversed = messages.slice().reverse();

  let totalTokens = 0;
  const limited = [];
  for (const msg of reversed) {
    const tokens = calcToken(msg.content || "");
    if (totalTokens + tokens > 131072) break;
    limited.push(msg);
    totalTokens += tokens;
  }

  // 再反转回来，保持从旧到新的时间顺序
  const finalContext = limited.reverse();

  // 转换为 openai 标准格式
  return finalContext.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

// 执行Chat模式
async function executeChatMode(params) {
  const { stream, conversation_id } = params;
  console.log('使用对话模式');

  // Chat模式的stream关闭处理（无需截图逻辑）
  stream.on('close', async () => {
    console.log('Chat stream closed');
  });

  await runChatPhase(params, false); // standalone chat mode
}

// 执行Twins模式
async function executeTwinsMode(params, dir_path) {
  const { question, mode, agent_id } = ctx.request.body;
  let { conversation_id, mcp_server_ids, fileIds } = ctx.request.body;
  console.log('[Agent Router] ========== NEW REQUEST ==========');
  console.log('[Agent Router] conversation_id:', conversation_id);
  console.log('[Agent Router] fileIds received:', fileIds);
  console.log('[Agent Router] question:', question);

  // Twins模式的stream关闭处理（包含截图逻辑，因为最终会执行agent）
  stream.on('close', async () => {
    console.log('Twins stream closed');
    await closeContainer(ctx.state.user.id)
    const screen_url = ''
    const agent = await Agent.findOne({ where: { id: agent_id } })
    if (agent.replay_conversation_id == null) {
      console.log('update screen_shot_url', screen_url)
      await Agent.update({ screen_shot_url: screen_url }, { where: { id: agent_id } })
    }
    // await Conversation.update({ screen_shot_url: screen_url }, { where: { conversation_id } })
    await updateAgentRecommend(conversation_id, agent_id);
  });

  // 第一阶段：Chat
  console.log('Twins模式 - 第一阶段：对话模式');
  const chatModeNotification = `__lemon_mode__${JSON.stringify({ mode: 'chat', stage: 'first' })}\n\n`;
  onTokenStream(chatModeNotification);

  await runChatPhase(params, true); // twins mode
}

// 通用Chat执行函数
async function runChatPhase(params, isTwinsMode) {
  const { conversation_id, question, newFiles, onTokenStream, stream, agent_id, feedbackOptions, profileContext, isVoiceTask } = params;

  // 准备上下文消息
  let messagesContext = []
  let messages = []
  if (isVoiceTask) {
    messages = await MessageTable.findAll({
      where: {
        conversation_id: conversation_id
      },
      order: [['create_at', 'DESC']],
      limit: 5
    })
    messages = messages.reverse()
    if (messages.length > 0) {
      messagesContext = getMessagesContextByTime(messages)
    }
  } else {
    messages = await MessageTable.findAll({
      where: {
        conversation_id: conversation_id
      },
      order: [['create_at', 'ASC']]
    })
    if (messages.length > 0) {
      messagesContext = getMessagesContextByTime(messages)
    }
  }

  // CRITICAL FIX: Use MASTER_SYSTEM_PROMPT + profileContext for consistent capabilities across all modes
  const { MASTER_SYSTEM_PROMPT } = require('@src/agent/prompt/MASTER_SYSTEM_PROMPT');
  
  // Add quick file analysis for chat mode
  let fileContext = '';
  if (newFiles && newFiles.length > 0) {
    console.log(`[Chat Mode] 📎 Analyzing ${newFiles.length} uploaded file(s) for context`);
    try {
      const { analyzeFiles, generateContextSummary } = require('@src/utils/fileAnalyzer');
      // Quick analysis for chat mode (don't block if it fails)
      const analyses = await Promise.race([
        analyzeFiles(newFiles.map(f => ({ filename: f.name, filepath: f.filepath }))),
        new Promise((_, reject) => setTimeout(() => reject(new Error('File analysis timeout')), 5000))
      ]);
      if (analyses && analyses.length > 0) {
        fileContext = '\n\n' + generateContextSummary(analyses);
        console.log(`[Chat Mode] ✅ File analysis complete - added context for ${analyses.length} file(s)`);
      }
    } catch (err) {
      console.log('[Chat Mode] ⚠️ File analysis skipped:', err.message);
    }
  }
  
  let sysPromptMessage = {
    role: 'system',
    content: `${MASTER_SYSTEM_PROMPT}

${profileContext || ''}${fileContext}${isVoiceTask ? `

VOICE MODE GUIDELINES:
- Keep responses concise and conversational (1-2 sentences maximum)
- Avoid announcing headers or sections like "Let me break this down:"
- Speak naturally, not like reading a document
- Ask only one question at a time if you need clarification
- Focus on the most important point first` : ''}`
  }
  messagesContext.unshift(sysPromptMessage)

  // 保存用户消息
  const userMsg = Message.format({
    role: 'user',
    status: 'success',
    content: question,
    action_type: 'chat',
    task_id: conversation_id,
    type: 'chat',
    pid: -1,
    json: newFiles
  });
  let userMessage = await Message.saveToDB(userMsg, conversation_id);
  // await syncQuestionVectorData(userMessage.id,question,conversation_id)
  let new_pid = userMessage.id

  // 创建 AbortController 用于流控制
  const abortController = new AbortController();
  activeAgents.set(conversation_id, { abort: () => abortController.abort() });

  // Chat完成回调
  const onChatCompleted = async (message_id, new_pid) => {
    if (isTwinsMode) {
      // Twins模式：Chat完成后发送结束标记，然后执行Agent
      const raw = `__lemon_out_end__{"message_id":"${message_id}","pid":"${new_pid}"}\n\n`;
      onTokenStream(raw);
      await runAgentPhase(params);
    } else {
      // 纯Chat模式：结束流
      const raw = `__lemon_out_end__{"message_id":"${message_id}","pid":"${new_pid}"}\n\n`;
      onTokenStream(raw);
      stream.end();
      await Conversation.update({ status: 'done' }, { where: { conversation_id } })
      activeAgents.delete(conversation_id);
    }

    // Chat模式反馈处理（异步）
    if (ENABLE_KNOWLEDGE === "ON" && agent_id) {
      try {
        await handle_feedback(feedbackOptions);
        const knowledge_count = await Knowledge.count({ where: { agent_id: agent_id } });
        await Agent.update({ knowledge_count }, { where: { id: agent_id } });
        console.log('Chat阶段反馈处理完成');
      } catch (error) {
        console.error('Chat阶段反馈处理失败:', error);
      }
    }
  };

  // 调用大模型
  const options = {
    temperature: 0.7,
    messages: messagesContext,
    signal: abortController.signal
  }

  if (isVoiceTask) {
    // Keep voice responses concise to reduce generation time and improve conversational flow.
    options.max_tokens = 150
  }

  chat_completion(question, options, conversation_id, onTokenStream).then(async (content) => {
    const assistant_msg = Message.format({
      role: 'assistant',
      status: 'success',
      content: content,
      action_type: 'chat',
      task_id: conversation_id,
      type: 'chat',
      pid: new_pid
    });
    let new_message = await Message.saveToDB(assistant_msg, conversation_id);
    await onChatCompleted(new_message.id, new_pid);
  }).catch(async (error) => {
    const content = error.message
    const assistant_msg = Message.format({
      role: 'assistant',
      status: 'success',
      content: content,
      action_type: 'chat',
      task_id: conversation_id,
      type: 'chat',
      pid: new_pid
    });
    let new_message = await Message.saveToDB(assistant_msg, conversation_id);
    await onChatCompleted(new_message.id, new_pid);
  });
}

// 执行Agent阶段（用于Twins模式的第二阶段）
async function runAgentPhase(params) {
  const { conversation_id, question, newFiles, onTokenStream, stream, context, agent_id, feedbackOptions } = params;

  console.log('[Twins Mode] Second phase: Agent mode');
  const agentModeNotification = `__lemon_mode__${JSON.stringify({ mode: 'agent', stage: 'second' })}\n\n`;
  onTokenStream(agentModeNotification);

  // Agent mode: Synchronously process feedback
  if (ENABLE_KNOWLEDGE === "ON" && agent_id) {
    try {
      await handle_feedback(feedbackOptions);
      const knowledge_count = await Knowledge.count({ where: { agent_id: agent_id } });
      await Agent.update({ knowledge_count }, { where: { id: agent_id } });
      console.log('[Twins-Agent Phase] Feedback processing complete, starting task execution');
    } catch (error) {
      console.error('[Twins-Agent Phase] Feedback processing failed:', error);
    }
  }

  // Save user message (Agent mode in Twins)
  const agentMsg = Message.format({
    role: 'user',
    status: 'success',
    content: question,
    action_type: 'question',
    task_id: conversation_id,
    json: newFiles
  });
  const message = await Message.saveToDB(agentMsg, conversation_id);
  // await syncQuestionVectorData(message.id,question,conversation_id)
  const agentOnCompleted = () => {
    stream.end();
  };

  const agent = new AgenticAgent(context);
  activeAgents.set(conversation_id, agent);

  agent.run(question).then(async (content) => {
    console.log('Agent阶段完成');
    agentOnCompleted();
    activeAgents.delete(conversation_id);
  }).catch(async (error) => {
    const msg = Message.format({ status: 'success', action_type: 'error', content: error.message });
    onTokenStream(msg);
    await Message.saveToDB(msg, conversation_id);
    console.error('Agent阶段错误:', error);
    agentOnCompleted();
    activeAgents.delete(conversation_id);
  });
}


module.exports = exports = router.routes();