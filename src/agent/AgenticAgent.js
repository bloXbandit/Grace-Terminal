require('dotenv').config();
const planning = require("@src/agent/planning/index.js");
const auto_reply = require("@src/agent/auto-reply/index")
const summary = require("@src/agent/summary/index")

const completeCodeAct = require("@src/agent/code-act/code-act.js");
const TaskManager = require('./TaskManager'); // assume task manager path
const Message = require('@src/utils/message.js');
const Conversation = require('@src/models/Conversation')
const File = require('@src/models/File')
const { getTodoMd } = require('@src/utils/planning.js');
const { write_code } = require('@src/runtime/utils/tools');
const { v4: uuidv4 } = require("uuid");
const path = require('path')
const { getDirpath } = require('@src/utils/electron');

const LocalRuntime = require("@src/runtime/LocalRuntime")
const DockerRuntime = require("@src/runtime/DockerRuntime");
const LocalDockerRuntime = require("@src/runtime/DockerRuntime.local");
// const MockDockerRuntime = require("@src/runtime/MockDockerRuntime");


const RUNTIME_TYPE = process.env.RUNTIME_TYPE || 'local-docker';
const runtimeMap = {
  'local': LocalRuntime,
  'docker': DockerRuntime,
  'local-docker': LocalDockerRuntime,
  // 'mock': MockDockerRuntime  // For local testing without Docker - disabled (file missing)
}

const { retrieveAndFormatPreviousSummary } = require('./conversationHistoryUtils');
const { getAllFilesRecursively, getFilesMetadata, ensureDirectoryExists } = require('./fileUtils');
// const { createStaticConf } = require('@src/utils/nginx-static');
const { createFilesVersion } = require('@src/utils/versionManager');

class AgenticAgent {
  constructor(context = {}) {
    this.logs = [];
    this.taskManager = new TaskManager('task_log.md', context.conversation_id); // assume task manager path
    const RunTime = runtimeMap[RUNTIME_TYPE];
    this.runtime = new RunTime(context);
    context.runtime = this.runtime;
    this.context = context;
    this.onTokenStream = context.onTokenStream;
    this.is_stop = false;
    this.mcp_server_ids = context.mcp_server_ids || [];
    context.task_manager = this.taskManager;
    // 规划模式
    this.planning_mode = context.planning_mode || 'base';
  }

  setGoal(goal) {
    this.goal = goal;
    this.context.goal = goal;
  }

  async _publishMessage(options) {
    const { uuid, action_type, status, content, json, task_id, meta_content, filepath } = options;
    
    // CRITICAL: Convert content to string before Message.format
    const ResponseValidator = require('@src/utils/responseValidator');
    let safeContent = content;
    if (typeof content !== 'string') {
      console.error('[AgenticAgent] Content is not a string:', typeof content, content);
      safeContent = ResponseValidator.intelligentStringConversion(content);
    }
    
    const msg = Message.format({
      uuid,
      action_type,
      status,
      content: safeContent,
      // @ts-ignore
      json,
      task_id,
      meta_content,
      filepath
    });
    this.onTokenStream(msg);
    await Message.saveToDB(msg, this.context.conversation_id);
  }

  async _getConversationDirPath() {
    const dir_name = 'Conversation_' + this.context.conversation_id.slice(0, 6);
    const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', this.context.user_id);
    return path.join(WORKSPACE_DIR, dir_name);
  }

  // 初始化设置和自动回复
  async _initialSetupAndAutoReply() {
    const dockerRuntimeTypes = ['docker', 'e2b', 'local-docker'];
    if (dockerRuntimeTypes.includes(RUNTIME_TYPE)) {
      await this.context.runtime.connect_container()
    }
    // 使用外部函数确保目录存在
    const conversationDirPath = await this._getConversationDirPath();
    await ensureDirectoryExists(conversationDirPath);

    // 创建nginx静态文件配置（仅在docker/e2b环境下）
    if (RUNTIME_TYPE === 'docker' || RUNTIME_TYPE === 'e2b') {
      try {
        // const nginxResult = await createStaticConf(this.context.conversation_id, conversationDirPath);
        console.log(`Nginx static config created for ${nginxResult.subdomain}`);
        // 保存静态文件访问地址到上下文
        this.context.staticUrl = nginxResult.url;
      } catch (error) {
        console.error('Failed to create nginx static config:', error);
      }
    } else {
      console.log(`Skipping nginx setup for RUNTIME_TYPE: ${RUNTIME_TYPE}`);
    }

    const reply = await auto_reply(this.goal, this.context.conversation_id, this.context.user_id);
    
    // Check if specialist needs execution (don't publish object, just store for planning)
    if (reply && typeof reply === 'object' && reply.needsExecution) {
      console.log('[AgenticAgent] Specialist provided code - storing for execution');
      this.context.specialistResponse = reply.specialistResponse;
      this.context.specialist = reply.specialist;
      this.context.taskType = reply.taskType;
      // Don't publish the object, just return null to continue to planning
      return null;
    }
    
    // Check if specialist handled it
    if (reply && typeof reply === 'object' && reply.handledBySpecialist) {
      // Format creative content for better readability
      const formattedContent = this._formatCreativeContent(reply.result);
      await this._publishMessage({ action_type: 'auto_reply', status: 'success', content: formattedContent });
      return reply; // Return specialist result
    }
    
    // CRITICAL: Don't publish error objects from failed specialist calls
    // The fallback will handle the request, so no need to show the error
    if (reply && typeof reply === 'object' && reply.error) {
      console.log('[AgenticAgent] Specialist failed but fallback will handle it, not publishing error');
      return null; // Continue to planning with fallback
    }
    
    await this._publishMessage({ action_type: 'auto_reply', status: 'success', content: reply });
    return null; // Continue to planning
  }

  // 执行规划阶段
  async _performPlanning() {
    await this.plan(this.goal);
  }

  // 执行任务循环
  async _executeTasks() {
    console.log('====== start execute ======');
    await this.run_loop();
  }

  // 生成最终输出
  async _generateFinalOutput() {
    const tasks = this.taskManager.getTasks();
    const finalResult = {
      goal: this.goal,
      status: tasks.every(t => t.status === 'completed') ? 'success' : 'partial_failure',
      tasks: tasks,
      logs: this.logs
    };

    const dirPath = await this._getConversationDirPath();
    let filesSet = new Set(await getAllFilesRecursively(dirPath)); // 使用外部函数

    if (this.context.generate_files && Array.isArray(this.context.generate_files)) {
      for (const file of this.context.generate_files) {
        filesSet.add(file);
      }
    }
    const filesToProcess = Array.from(filesSet);
    const newFiles = await getFilesMetadata(filesToProcess); // 使用外部函数

    // 创建文件版本
    const state = {
      user: { id: this.context.user_id }
    }
    await createFilesVersion(this.context.conversation_id, newFiles, '.html', state);

    const summaryContent = await summary(this.goal, this.context.conversation_id, tasks, newFiles, this.context.staticUrl);
    const uuid = uuidv4();
    await this._publishMessage({ uuid, action_type: 'finish_summery', status: 'success', content: summaryContent, json: newFiles });

    finalResult.summary = summaryContent;
    return finalResult;
  }

  async loadContext() {
    await this.taskManager.loadTasks();
    const conversation = await Conversation.findOne({ where: { conversation_id: this.context.conversation_id } });
    const goal = conversation.dataValues.content;
    this.setGoal(goal);
    global.logging(this.context, 'AgenticAgent', `loadContext goal: ${goal}`);
  }

  async continue() {
    await this.loadContext();

    const tasks = this.taskManager.getTasks();
    this.context.tasks = tasks;
    global.logging(this.context, 'AgenticAgent.continue', tasks);
    // return;
    if (!tasks || tasks.length === 0) {
      global.logging(this.context, 'AgenticAgent.continue', 'No tasks found to continue.');
      await this._publishMessage({ action_type: 'finish', status: 'success', content: 'No tasks found to continue.' });
      return;
    }
    await this._publishMessage({ action_type: 'continue', status: 'success', content: 'Continuing task execution...', json: tasks });
    await this._executeTasks();
    await this._generateFinalOutput();
  }

  async run(goal = '') {
    this.setGoal(goal);

    try {
      // Check for /dev mode commands in task mode
      const modeCommandHandler = require('@src/agent/modes/ModeCommandHandler');
      const modeCommandResult = await modeCommandHandler.handleCommand(goal, this.context.conversation_id);
      if (modeCommandResult) {
        // This was a mode command, publish and return
        await this._publishMessage({ 
          action_type: 'finish', 
          status: 'success', 
          content: modeCommandResult.message 
        });
        return modeCommandResult.message;
      }
      
      const autoReplyResult = await this._initialSetupAndAutoReply();
      
      // If specialist needs execution, store response for planning to use
      if (autoReplyResult && autoReplyResult.needsExecution) {
        console.log(`[AgenticAgent] Specialist provided code/actions - storing for execution`);
        this.context.specialistResponse = autoReplyResult.specialistResponse;
        this.context.specialist = autoReplyResult.specialist;
        this.context.taskType = autoReplyResult.taskType;
        // Continue to planning which will extract and execute the code
      }
      
      // If specialist handled it completely, stop here
      else if (autoReplyResult && autoReplyResult.handledBySpecialist) {
        console.log(`[AgenticAgent] Task handled by ${autoReplyResult.specialist} specialist`);
        console.log('[AgenticAgent] Task type:', autoReplyResult.taskType);
        
        // For PURE text tasks, specialist result is final (no tools needed)
        // Tasks that need file creation/code execution should continue to planning
        const directCompletionTasks = [
          'creative_writing',    // Stories, poems, lyrics - just text
          'general_chat',        // Conversation - just text
          'code_explanation',    // Explaining code - just text
          'code_review',         // Reviewing code - just text (no file creation)
          'brainstorming',       // Ideas - just text
          'roleplay',            // Character dialogue - just text
          'system_design',       // Architecture diagrams - just text/description
          'database_design',     // Schema design - just text/description
          'api_design'           // API spec - just text/description
        ];
        
        if (directCompletionTasks.includes(autoReplyResult.taskType)) {
          console.log('[AgenticAgent] Direct completion task (text-only) - marking as done');
          await Conversation.update({ status: 'done' }, { where: { conversation_id: this.context.conversation_id } });
          // Send completion signal to stop UI spinner
          await this._publishMessage({ action_type: 'finish_summery', status: 'success', content: '' });
          return autoReplyResult.result;
        }
        
        // For tasks needing tools (code/data/file generation, math, research, etc.)
        // Specialist provides guidance, then we continue to planning for tool execution
        console.log('[AgenticAgent] Task requires tools - continuing to planning for execution');
        
        // For other tasks, specialist provided initial response but may need follow-up
        console.log('[AgenticAgent] Specialist provided initial response, checking if follow-up needed');
        // Continue to planning only if needed
      }
    } catch (error) {
      console.error("Auto reply failed:", error);
      throw error
    }

    try {

      if (this.is_stop) return;

      await this._performPlanning();
      if (this.is_stop) return;

      await this._executeTasks();
      if (this.is_stop) return;

      const finalResult = await this._generateFinalOutput();

      await Conversation.update({ status: 'done' }, { where: { conversation_id: this.context.conversation_id } });

      return finalResult;
    } catch (error) {
      await Conversation.update({ status: 'failed' }, { where: { conversation_id: this.context.conversation_id } });
      global.logging(this.context, 'AgenticAgent.run', 'error', error);
      throw error;
    }
  }

  async plan(goal = '') {
    try {
      const files = await File.findAll({ where: { conversation_id: this.context.conversation_id } });
      this.context.files = files;

      const conversationDirPath = await this._getConversationDirPath();
      const previousResult = await retrieveAndFormatPreviousSummary(this.context.conversation_id, conversationDirPath);

      const planning_mode = this.planning_mode;
      const options = {
        conversation_id: this.context.conversation_id,
        agent_id: this.context.agent_id,
        planning_mode,
        files,
        previousResult,
        specialistResponse: this.context.specialistResponse, // Pass specialist code to planning
      }
      const plannedTasks = await planning(goal, options) || [];

      await this.taskManager.setTasks(plannedTasks);
      const tasks = this.taskManager.getTasks();
      await this._publishMessage({ action_type: 'plan', status: 'success', content: '', json: tasks });

      console.log('====== planning completed ======');

      const uuid = uuidv4();
      const dir_name = 'Conversation_' + this.context.conversation_id.slice(0, 6);

      await this._publishMessage({ action_type: 'write_code', status: 'running', content: "todo.md", json: {}, task_id: null, uuid });

      const todo_md = await getTodoMd(tasks);
      const action = {
        type: 'write_code',
        params: {
          path: `${dir_name}/todo.md`,
          content: todo_md
        }
      };
      const result = await write_code(action, uuid, this.context.user_id);

      if (!this.context.generate_files) {
        this.context.generate_files = [];
      }
      this.context.generate_files.push(result.meta.filepath);

      await this._publishMessage({
        action_type: result.meta.action_type,
        status: result.status,
        content: result.content || '',
        filepath: result.meta.filepath,
        json: {},
        task_id: null,
        uuid,
        meta_content: todo_md
      });

      return true;
    } catch (error) {
      global.logging(this.context, 'AgenticAgent.plan', 'error', error);
    }
  }

  async handle_task_status(task, status, details = {}) {
    const manager = this.taskManager;
    await manager.updateTaskStatus(task.id, status, details);
    this.logs.push({ timestamp: new Date(), message: `Executing task ${task.id}: ${task.requirement}` });

    await this._publishMessage({
      action_type: status === 'failed' ? 'error' : 'task',
      status,
      content: details.content,
      json: { comments: details.comments, ...details.json, ...details.params || {} },
      task_id: task.id
    });

    if (status === 'completed') {
      const uuid = uuidv4();
      const dir_name = 'Conversation_' + this.context.conversation_id.slice(0, 6);
      const new_tasks = this.taskManager.getTasks();
      const todo_md = await getTodoMd(new_tasks);
      const action = {
        type: 'write_code',
        params: {
          path: `${dir_name}/todo.md`,
          content: todo_md
        }
      };

      await this._publishMessage({
        action_type: 'write_code',
        status: 'running',
        content: "todo.md",
        json: {},
        task_id: task.id,
        uuid
      });
      const todoRes = await write_code(action, uuid, this.context.user_id);
      await this._publishMessage({
        action_type: todoRes.meta.action_type,
        status: todoRes.status,
        content: todoRes.content || '',
        filepath: todoRes.meta.filepath,
        json: {},
        task_id: task.id,
        uuid,
        meta_content: todo_md
      });
    }
  }

  async run_loop() {
    const loggerKey = 'AgenticAgent.run_loop';
    const manager = this.taskManager;
    while (true) {
      const task = await manager.resolvePendingTask();
      if (!task) {
        global.logging(this.context, loggerKey, '====== no task ======');
        return;
      }
      global.logging(this.context, loggerKey, task);
      this.context.task = task;
      try {
        const result = await completeCodeAct(task, this.context);
        global.logging(this.context, loggerKey, result);
        if (result.status === 'failure') {
          await this.handle_task_status(task, 'failed', {
            content: result.comments,
            memorized: result.memorized || '',
            comments: result.comments,
          });
          await Conversation.update({ status: 'failed' }, { where: { conversation_id: this.context.conversation_id } });
          await this.stop();
          return;
        }
        if (result.status === 'revise_plan') {
          await this.handle_task_status(task, 'revise_plan', {
            content: result.content || '',
            memorized: result.memorized || '',
            params: result.params || {}
          });
          continue;
        }
        await this.handle_task_status(task, 'completed', {
          content: result.content,
          memorized: result.memorized || ''
        });
      } catch (error) {
        await this.handle_task_status(task, 'failed', { error: error.message });
        global.logging(this.context, loggerKey, error);
        global.safeExit && await global.safeExit(0);
      }
    }
  }

  async stop() {
    this.is_stop = true;
    await this._publishMessage({ action_type: 'stop', status: 'success' });
  }

  /**
   * Format creative content for better UI readability
   * Adds line breaks between scenes and bolds key elements
   */
  _formatCreativeContent(content) {
    if (!content || typeof content !== 'string') return content;
    
    // Add double line break after scene headers for better spacing
    content = content.replace(/(Scene \d+:)/g, '\n\n**$1**');
    
    // Bold title if present
    content = content.replace(/^(Title: .+)$/m, '**$1**');
    
    // Add line break before sections like Lyrics, Verse, Chorus, Bridge
    content = content.replace(/\n(Lyrics:|Verse \d+:|Chorus:|Bridge:|Outro:)/g, '\n\n**$1**');
    
    // Clean up any triple+ line breaks
    content = content.replace(/\n{3,}/g, '\n\n');
    
    return content.trim();
  }
}

module.exports = AgenticAgent;