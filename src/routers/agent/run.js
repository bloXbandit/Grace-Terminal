// @ts-ignore
const router = require("koa-router")();
const handleStream = require("@src/utils/stream.util");

const uuid = require("uuid");
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
    console.log('本地不执行')
  }
}

const activeAgents = new Map();
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
router.post("/run", async (ctx, next) => {
  const { request, response } = ctx;
  const body = request.body || {};
  let { question, conversation_id, fileIds, mcp_server_ids = [], model_id, agent_id, mode = 'auto' } = body;


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

  if (Array.isArray(fileIds) && fileIds.length > 0) {
    for (const fileId of fileIds) {
      await File.update(
        { conversation_id: conversation_id },
        { where: { id: fileId } }
      );
    }
    files = await File.findAll({
      where: {
        id: fileIds
      }
    });

    // 根据文件名把文件从 upload文件夹内，移动到 dir_name下面的upload文件夹内
    const uploadDir = path.join(WORKSPACE_DIR, 'upload');
    const targetUploadDir = path.join(dir_path, 'upload');
    await fs.mkdir(targetUploadDir, { recursive: true });


    for (const file of files) {
      // 假设 file.filename 字段存在，且为文件名
      const srcPath = path.join(uploadDir, file.name);
      const destPath = path.join(targetUploadDir, file.name);

      try {
        // 尝试移动文件，如果目标已存在则覆盖
        await fs.rename(srcPath, destPath);
      } catch (err) {
        if (err.code === 'EXDEV' || err.code === 'EEXIST') {
          // 跨分区或已存在，尝试复制再删除
          await fs.copyFile(srcPath, destPath);
          await fs.unlink(srcPath);
        } else {
          // 其他错误抛出
          throw err;
        }
      }

    }
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
    });
  }

  body.responseType = body.responseType || "sse";
  const { stream, onTokenStream } = handleStream(body.responseType, response);

  // Check for mode commands (/dev, /normal, /dev status)
  const modeCommandResult = await modeCommandHandler.handleCommand(question, conversation_id);
  if (modeCommandResult) {
    // This was a mode command, return the result directly
    const msg = Message.format({
      status: 'success',
      action_type: 'auto_reply',
      content: modeCommandResult.message
    });
    onTokenStream(msg);
    await Message.saveToDB(msg, conversation_id);
    await Conversation.update({ status: 'done' }, { where: { conversation_id } });
    ctx.body = stream;
    stream.end();
    return;
  }
  // 处理文件信息，用于消息保存
  for (let file of files) {
    file.filename = file.name
    file.filepath = path.join(dir_path, file.url)
  }

  const newFiles = files.map(file => {
    let obj = file.dataValues
    obj.filename = obj.name
    obj.filepath = path.join(dir_path, obj.url)
    return obj
  })

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
  }

  // Extract profile info from user message (non-blocking)
  extractProfileFromMessage(ctx.state.user.id, question, conversation_id).catch(err => {
    console.error('Profile extraction error (non-critical):', err);
  });

  // 根据mode参数确定处理方式
  let intent;
  if (mode === 'auto') {
    // 自动选择：使用意图识别
    console.log('自动模式：开始意图识别...');
    try {
      // 获取上下文消息用于意图识别
      const contextMessages = await MessageTable.findAll({
        where: {
          conversation_id: conversation_id
        },
        order: [['create_at', 'ASC']]
      })

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
    onTokenStream, stream, context, agent_id, ctx
  };

  // 执行对应的模式
  if (intent === 'chat') {
    await executeChatMode(commonParams);
  } else if (intent === 'twins') {
    await executeTwinsMode(commonParams, dir_path);
  } else {
    // Agent 模式：先处理反馈，再执行任务
    console.log('使用智能体模式');

    // Agent模式：同步处理反馈（确保记忆更新后再执行任务）
    if (ENABLE_KNOWLEDGE === "ON") {
      try {
        await handle_feedback(feedbackOptions);
        // 更新条目数
        const knowledge_count = await Knowledge.count({ where: { agent_id: agent_id } });
        await Agent.update({ knowledge_count }, { where: { id: agent_id } });
        console.log('Agent模式反馈处理完成，开始执行任务');
      } catch (error) {
        console.error('Agent模式反馈处理失败:', error);
      }
    }

    // Agent模式的stream关闭处理（包含截图逻辑）
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

    // 保存用户消息 (智能体模式)
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

    const agent = new AgenticAgent(context);
    activeAgents.set(conversation_id, agent);

    const startTime = Date.now();
    agent.run(question).then(async (content) => {
      console.log('content', content);
      
      // SEAL: Log successful task execution
      try {
        const conversation = await Conversation.findOne({ where: { conversation_id } });
        await TaskLogger.logTask({
          user_id: ctx.state.user?.id || 1,
          conversation_id,
          task_type: mode === 'agent' ? 'agent_task' : 'chat',
          task_description: question,
          input_data: { question, mode, files: newFiles },
          output_data: { content },
          model_used: conversation?.model_id || 'default',
          execution_time_ms: Date.now() - startTime,
          success: true,
          tools_used: agent.toolsUsed || [],
          metadata: { agent_id, mode }
        });
      } catch (logError) {
        console.error('SEAL logging error:', logError);
      }
      
      onCompleted();
      activeAgents.delete(conversation_id);
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
          metadata: { agent_id, mode }
        });
      } catch (logError) {
        console.error('SEAL logging error:', logError);
      }
      
      onCompleted();
      activeAgents.delete(conversation_id);
    });
  }


  // completeCodeAct(task, context).then(async content => {
  //   console.log('content', content);
  //   onCompleted();
  // });
  ctx.body = stream;
  ctx.status = 200;
});

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

  const agent = activeAgents.get(conversation_id);

  await Conversation.update({ status: 'stop' }, { where: { conversation_id: conversation_id } });
  await closeContainer(state.user.id)

  // Get agent_id from conversation
  const conversation = await Conversation.findOne({ where: { conversation_id } });
  const agent_id = conversation ? conversation.agent_id : null;

  if (agent) {
    try {
      if (typeof agent.stop === 'function') {
        await agent.stop();
        activeAgents.delete(conversation_id);

        // Check completion status after stop
        if (agent_id) {
          await updateAgentRecommend(conversation_id, agent_id);
        }

        response.success('Agent is stopped')
      } else {
        response.fail('Agent has no stop method')
      }
    } catch (error) {
      response.fail(`Error stopping Agent ${conversation_id}: ${error.message}`)
    }
  } else {
    response.fail(`Agent with conversation_id ${conversation_id} not found`)
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
  const { stream, ctx, agent_id, conversation_id, onTokenStream } = params;
  console.log('使用双重模式：先对话，后智能体');

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
  const { conversation_id, question, newFiles, onTokenStream, stream, agent_id, feedbackOptions } = params;

  // 准备上下文消息
  let messagesContext = []
  const messages = await MessageTable.findAll({
    where: {
      conversation_id: conversation_id
    },
    order: [['create_at', 'ASC']]
  })

  if (messages.length > 0) {
    messagesContext = getMessagesContextByTime(messages)
  }

  // CRITICAL FIX: Use MASTER_SYSTEM_PROMPT for consistent capabilities across all modes
  const { MASTER_SYSTEM_PROMPT } = require('@src/agent/prompt/MASTER_SYSTEM_PROMPT');
  let sysPromptMessage = {
    role: 'system',
    content: MASTER_SYSTEM_PROMPT
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

  console.log('Twins模式 - 第二阶段：智能体模式');
  const agentModeNotification = `__lemon_mode__${JSON.stringify({ mode: 'agent', stage: 'second' })}\n\n`;
  onTokenStream(agentModeNotification);

  // Agent模式：同步处理反馈
  if (ENABLE_KNOWLEDGE === "ON" && agent_id) {
    try {
      await handle_feedback(feedbackOptions);
      const knowledge_count = await Knowledge.count({ where: { agent_id: agent_id } });
      await Agent.update({ knowledge_count }, { where: { id: agent_id } });
      console.log('Agent阶段反馈处理完成，开始执行任务');
    } catch (error) {
      console.error('Agent阶段反馈处理失败:', error);
    }
  }

  // 保存用户消息 (智能体模式)
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