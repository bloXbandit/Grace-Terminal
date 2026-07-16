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

// PHASE 2: Import unified context management
const ConversationContext = require('@src/context/ConversationContext');

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
    // CANCELLATION: let inner loops (code-act think/act) poll for user stop
    context.isStopped = () => this.is_stop;
    this.mcp_server_ids = context.mcp_server_ids || [];
    context.task_manager = this.taskManager;
    // 规划模式
    this.planning_mode = context.planning_mode || 'base';
    // Track session start time to filter files created in this session
    // Use current time - files created during this session will have mtime >= this
    this.sessionStartTime = new Date();
    
    // PHASE 2: Create unified conversation context manager
    // Only create if we have required IDs (some contexts like 'continue' may not have them yet)
    if (context.conversation_id && context.user_id) {
      try {
        this.conversationContext = new ConversationContext(context);
        console.log('[AgenticAgent] Unified context manager initialized');
      } catch (error) {
        console.error('[AgenticAgent] Failed to initialize context manager:', error.message);
        this.conversationContext = null;
      }
    } else {
      this.conversationContext = null;
    }
  }

  setGoal(goal) {
    this.goal = goal;
    this.context.goal = goal;
  }

  async _publishMessage(options) {
    const { uuid, action_type, status, content, json, task_id, meta_content, filepath } = options;
    
    // CRITICAL FIX: Throttle progress and task messages to reduce UI noise
    if ((action_type === 'progress' || action_type === 'task') && status === 'running') {
      const now = Date.now();
      if (now - this.lastProgressTime < this.PROGRESS_THROTTLE_MS) {
        console.log(`[AgenticAgent] Throttled ${action_type} message to reduce UI noise`);
        return; // Skip this message
      }
      this.lastProgressTime = now;
    }
    
    // CRITICAL: Convert content to string before Message.format
    const ResponseValidator = require('@src/utils/responseValidator');
    let safeContent = content;
    if (typeof content !== 'string') {
      console.error('[AgenticAgent] Content is not a string:', typeof content, content);
      safeContent = ResponseValidator.intelligentStringConversion(content);
    }
    
    // CRITICAL: Strip Python code blocks AND inline commands AND technical processing notes from content before publishing to UI
    // Code blocks are for execution only, not for user display
    if (safeContent && typeof safeContent === 'string') {
      const originalContent = safeContent;
      
      // Remove Python code blocks: ```python\n...\n```
      safeContent = safeContent.replace(/```python\n[\s\S]+?\n```/g, '').trim();
      
      // Remove XML-style Python tags: <python3>...</python3>
      safeContent = safeContent.replace(/<python3>[\s\S]*?<\/python3>/gi, '').trim();
      
      // Remove XML web_browse tags: <web_browse>...</web_browse>
      safeContent = safeContent.replace(/<web_browse>[\s\S]*?<\/web_browse>/gi, '').trim();
      
      // Remove XML query tags: <query>...</query>
      safeContent = safeContent.replace(/<query>[\s\S]*?<\/query>/gi, '').trim();
      
      // Remove execute_code blocks: <execute_code>...</execute_code>
      safeContent = safeContent.replace(/<execute_code>[\s\S]*?<\/execute_code>/gi, '').trim();
      
      // Remove markdown code blocks: ```python...``` and ```...```
      safeContent = safeContent.replace(/```[\w]*\n[\s\S]*?```/gi, '').trim();
      
      // Remove inline Python commands: python3 -c "..."
      safeContent = safeContent.replace(/python3?\s+-c\s+["'][\s\S]+?["']/g, '').trim();
      
      // Remove any remaining python3 command lines
      safeContent = safeContent.replace(/^python3?\s+.+$/gm, '').trim();
      
      // Remove print() statements (common Python execution artifacts)
      safeContent = safeContent.replace(/print\s*\(["'][\s\S]*?["']\)/gi, '').trim();
      safeContent = safeContent.replace(/^print\s*\(.+\)$/gm, '').trim();
      
      // CRITICAL FIX: Remove technical processing notes that leak backend details
      // Pattern: "Updated X with Y" or "Loaded existing X"
      safeContent = safeContent.replace(/^(Updated|Loaded|Modified|Created|Saved)\s+[\w_]+\.(docx|xlsx|pdf|txt|pptx)\s+(with|using|from|to)\s+.+?[.!]/gmi, '').trim();
      
      // Remove "nice! now add a section" type thinking-out-loud
      safeContent = safeContent.replace(/^(nice!|great!|okay,?)\s+now\s+.+$/gmi, '').trim();
      
      // Remove multi-line thinking blocks (The user wants me to...)
      safeContent = safeContent.replace(/The user wants me to:?\n[\s\S]+?(?=\n\n|$)/gi, '').trim();
      
      // Remove progress messages (Looking that up..., Checking the web..., Finding info online...)
      safeContent = safeContent.replace(/^(Checking|Searching|Looking|Finding)\s+.+\.{3}$/gm, '').trim();
      safeContent = safeContent.replace(/^(Looking that up|Checking the web|Finding info online)\.{3}$/gm, '').trim();
      
      if (safeContent !== originalContent && safeContent.length < originalContent.length) {
        console.log('[AgenticAgent] Removed Python code, XML tags, and technical notes from message before publishing to UI');
      }
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
    let WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', this.context.user_id);
    // BUG GUARD: getDirpath drops the user_<id> segment when LEMON_AI_PATH is set
    // (always true in the container), but files actually live under user_<id>/.
    // This made artifact checks and file scans silently look in an empty directory.
    const userSeg = `user_${this.context.user_id}`;
    if (this.context.user_id && !WORKSPACE_DIR.includes(userSeg)) {
      const fs = require('fs');
      const withUser = path.join(WORKSPACE_DIR, userSeg);
      if (fs.existsSync(withUser)) {
        WORKSPACE_DIR = withUser;
      }
    }
    return path.join(WORKSPACE_DIR, dir_name);
  }

  /**
   * Make task titles user-friendly by hiding technical backend details
   */
  _makeTaskTitleUserFriendly(title, description) {
    if (!title) return title;
    
    // For name/profile gathering tasks, use simple waiting message
    if (title.toLowerCase().includes('information gathering') || 
        title.toLowerCase().includes('check user profile') ||
        description?.toLowerCase().includes('ask user') ||
        description?.toLowerCase().includes('what\'s your name')) {
      return '💬 Waiting for your response...';
    }
    
    // For document updates, simplify
    if (title.toLowerCase().includes('document update') || 
        title.toLowerCase().includes('document finalization')) {
      return '📝 Updating document...';
    }
    
    // For delivery/confirmation tasks, simplify
    if (title.toLowerCase().includes('delivery') || 
        title.toLowerCase().includes('confirm document')) {
      return '✅ Finishing up...';
    }
    
    // Keep existing friendly titles
    return title;
  }

  /**
   * Make task descriptions user-friendly
   */
  _makeTaskDescriptionUserFriendly(description) {
    if (!description) return description;
    
    // Hide technical details about profile checking, Python execution, etc.
    if (description.toLowerCase().includes('check user profile') ||
        description.toLowerCase().includes('execute python') ||
        description.toLowerCase().includes('terminal_run') ||
        description.toLowerCase().includes('write_code')) {
      return ''; // Hide technical descriptions
    }
    
    return description;
  }

  // 初始化设置和自动回复
  async _initialSetupAndAutoReply() {
    // SPEED OPTIMIZATION: Run container connection and directory setup in parallel
    const conversationDirPath = await this._getConversationDirPath();
    
    const dockerRuntimeTypes = ['docker', 'e2b', 'local-docker'];
    const setupPromises = [
      ensureDirectoryExists(conversationDirPath)
    ];
    
    // Only connect container if needed (skip for existing conversations)
    if (dockerRuntimeTypes.includes(RUNTIME_TYPE) && !this.context.containerConnected) {
      setupPromises.push(this.context.runtime.connect_container());
      this.context.containerConnected = true;
    }
    
    await Promise.all(setupPromises);

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

    // PHASE 2: Build unified context once (if available)
    // SPEED OPTIMIZATION: For initial message, only load minimal context
    let routingContext = null;
    if (this.conversationContext) {
      try {
        const requestId = `req-${Date.now()}`;
        const startTime = Date.now();
        await this.conversationContext.build({ requestId });
        routingContext = this.conversationContext.getRoutingContext();
        const duration = Date.now() - startTime;
        console.log(`[AgenticAgent] Built unified context for routing in ${duration}ms`);
      } catch (error) {
        console.error('[AgenticAgent] Failed to build context:', error);
      }
    }
    
    // Get recent conversation messages for context-aware routing (last 5 messages)
    // BACKWARD COMPATIBILITY: If no unified context, use old method
    let recentMessages = routingContext?.recentMessages || [];
    if (!routingContext) {
      try {
        const MessageTable = require('@src/models/Message');
        const messages = await MessageTable.findAll({
          where: { conversation_id: this.context.conversation_id },
          order: [['create_at', 'DESC']],
          limit: 5
        });
        // Convert to simple format and reverse to chronological order
        recentMessages = messages.reverse().map(m => ({
          role: m.role,
          content: m.content
        }));
      } catch (e) {
        // No messages yet or error - continue without context
      }
    }

    // CRITICAL: Pass onTokenStream to auto_reply so specialist calls can stream tokens
    // This eliminates the wait gap during specialist LLM calls
    // CRITICAL: Pass files for upload detection and analysis
    console.log('[AgenticAgent] context.files:', this.context.files ? this.context.files.length : 0);
    console.log('[AgenticAgent] context.newlyUploadedFileIds:', this.context.newlyUploadedFileIds || []);
    console.log('[AgenticAgent] Passing files to auto_reply:', this.context.files || []);
    
    // Add voice task indicator to recent messages for auto_reply to detect
    const isVoiceTask = this.context.isVoiceTask;
    let voiceAwareMessages = recentMessages;
    if (isVoiceTask) {
      console.log('[AgenticAgent] Adding voice task indicator for auto_reply');
      voiceAwareMessages = [...recentMessages, { role: 'system', content: 'x-voice-task: true' }];
    }
    
    const reply = await auto_reply(this.goal, this.context.conversation_id, this.context.user_id, voiceAwareMessages, this.context.profileContext, this.onTokenStream, this.context.files || [], this.context.newlyUploadedFileIds || []);
    
    // Check if specialist needs execution (don't publish object, just store for planning)
    if (reply && typeof reply === 'object' && reply.needsExecution) {
      console.log('[AgenticAgent] Specialist provided code - storing for execution');
      this.context.specialistResponse = reply.specialistResponse;
      this.context.specialist = reply.specialist;
      this.context.taskType = reply.taskType;
      
      // CRITICAL: Check for ultra-fast-path flags (skipPlanning, directExecution)
      if (reply.skipPlanning || reply.directExecution) {
        console.log('[AgenticAgent] ⚡⚡ ULTRA Fast-path detected: skipPlanning=' + reply.skipPlanning + ', directExecution=' + reply.directExecution);
        this.skipPlanning = true;
        
        // CRITICAL: Store pre-generated action if provided
        if (reply.preGeneratedAction) {
          console.log('[AgenticAgent] ⚡⚡ Pre-generated action detected - will bypass thinking()');
          this.preGeneratedAction = reply.preGeneratedAction;
        }
      }
      
      // Don't publish the object, just return null to continue to planning (or skip if flag set)
      return null;
    }
    
    // Check if specialist handled it
    if (reply && typeof reply === 'object' && reply.handledBySpecialist) {
      // Don't send auto_reply with full result - finish_summery will handle it
      // This prevents duplicate content display in UI
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

  // Execute planning phase
  async _performPlanning() {
    // CRITICAL: Skip planning if ultra-fast-path flag is set (simple single-file generation)
    if (this.skipPlanning) {
      console.log('[AgenticAgent] ⚡⚡ Skipping planning phase (ultra-fast-path enabled)');
      console.log('[AgenticAgent] Creating simple single-task plan for direct execution');

      // Create a minimal plan with just one task
      // UI CLEANLINESS: For metadata_revision fast-path, suppress progress chatter
      if (this.context.taskType !== 'metadata_revision') {
        const { sendProgressMessage } = require('@src/routers/agent/utils/coding-messages');
        await sendProgressMessage(
          this.onTokenStream,
          this.context.conversation_id,
          'On it! Creating your document now...',
          'progress'
        );
      }
      
      // Set up a simple task for the task manager
      // CRITICAL: Include preGeneratedAction if available (bypasses thinking LLM call)
      const task = {
        id: 'task_1',
        title: 'Generate Document',
        description: this.goal,
        requirement: this.goal, // CodeAct expects 'requirement' field
        status: 'pending'
      };
      
      // CRITICAL: Add pre-generated action XML to task (bypasses thinking())
      if (this.preGeneratedAction) {
        console.log('[AgenticAgent] ⚡⚡ Adding preGeneratedAction to task - will execute directly');
        task.preGeneratedAction = this.preGeneratedAction;
      }
      
      // CRITICAL: TaskManager doesn't have addTask(), use setTasks([task]) instead
      await this.taskManager.setTasks([task]);
      console.log('[AgenticAgent] ⚡⚡ Ultra fast-path task created and ready for execution');
      
      return;
    }
    
    await this.plan(this.goal);
  }

  // Execute task loop
  async _executeTasks() {
    console.log('====== start execute ======');
    await this.run_loop();
  }

  // 生成最终输出
  async _generateFinalOutput() {
    const tasks = this.taskManager.getTasks();
    // HONESTY: [].every() === true, so an empty plan used to report 'success' and the
    // summary LLM would claim work was done when nothing executed and no files exist.
    const status = tasks.length === 0
      ? 'failed'
      : (tasks.every(t => t.status === 'completed') ? 'success' : 'partial_failure');
    if (tasks.length === 0) {
      console.error('[AgenticAgent] ⚠️ No tasks were planned/executed — reporting failure, not success');
    }
    const finalResult = {
      goal: this.goal,
      status,
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
    
    // CRITICAL FIX: Scan workspace for newly created document files from Python scripts
    // Only for agentic flows that need document delivery (not Ultra)
    const fs = require('fs').promises;
    const path = require('path');
    
    // Skip versioning if code-act already handled it (ultra-fast-path)
    // Check if any task has preGeneratedAction indicating ultra-fast-path
    const hasPreGeneratedAction = tasks.some(task => task.preGeneratedAction);
    
    if (!hasPreGeneratedAction) {
      try {
        // Check if this is a document revision task (avoid unnecessary scanning)
        const isDocumentRevision = tasks.some(task => 
          task.description && task.description.toLowerCase().includes('document') &&
          (task.description.toLowerCase().includes('update') || 
           task.description.toLowerCase().includes('modify') || 
           task.description.toLowerCase().includes('author') ||
           task.description.toLowerCase().includes('revision'))
        );
        
        if (isDocumentRevision) {
          // CRITICAL FIX: Use correct workspace path with user_1 prefix
          // Documents are saved to /app/workspace/user_1/Conversation_XXXXXX/ not /app/workspace/Conversation_XXXXXX/
          const workspacePath = `/app/workspace/user_1/Conversation_${this.context.conversation_id.substring(0, 6)}`;
          const allFiles = await fs.readdir(workspacePath);
          const documentFiles = allFiles.filter(file => 
            file.endsWith('.docx') || file.endsWith('.xlsx') || file.endsWith('.pdf')
          );
          
          // Convert back to Set to ensure deduplication
          const filesToProcessSet = new Set(filesToProcess);
          
          for (const docFile of documentFiles) {
            const fullPath = path.join(workspacePath, docFile);
            const stats = await fs.stat(fullPath);
            
            // Only include document files created/modified during this session
            if (stats.mtime >= this.sessionStartTime) {
              filesToProcessSet.add(fullPath);
              console.log(`[AgenticAgent] Added session-created document file to delivery: ${docFile}`);
            }
          }
          
          // Update filesToProcess with scanned documents
          filesToProcess.splice(0, filesToProcess.length, ...Array.from(filesToProcessSet));
        }
      } catch (error) {
        console.error('[AgenticAgent] Failed to scan workspace for document files:', error);
        // Continue with original filesToProcess
      }
    }
    
    // CRITICAL FIX: Only show files created/modified in this session
    // This prevents old files from previous sessions showing up in the UI
    const newFiles = await getFilesMetadata(filesToProcess, this.sessionStartTime);
    
    if (!hasPreGeneratedAction) {
      // Only create versions for full agentic flow (not ultra tasks)
      // 创建文件版本 - VERSION ALL FILES (not just .html)
      const state = {
        user: { id: this.context.user_id }
      }
      // Create versions for ALL file types (docx, xlsx, html, etc.)
      for (const file of newFiles) {
        try {
          const FileVersion = require('@src/models/FileVersion');
          const { extractRelativePath } = require('@src/utils/filePathHelper');
          const { createVersion } = require('@src/utils/versionManager');
          
          const relativePath = extractRelativePath(file.filepath);
          const fs = require('fs');
          
          // Only version if file exists
          if (fs.existsSync(file.filepath)) {
            await createVersion(file.filepath, this.context.conversation_id, { state, action: 'Agent Coding' });
            console.log(`[AgenticAgent] Created version for: ${file.filename}`);
          }
        } catch (error) {
          console.error(`[AgenticAgent] Failed to create version for ${file.filename}:`, error.message);
        }
      }
    } else {
      console.log('[AgenticAgent] Skipping versioning - code-act already handled ultra task files');
    }

    // CRITICAL FIX: Attach version IDs to files so UI can fetch correct version
    const FileVersion = require('@src/models/FileVersion');
    const { extractRelativePath } = require('@src/utils/filePathHelper');
    const filesWithVersions = await Promise.all(newFiles.map(async (file) => {
      try {
        const relativePath = extractRelativePath(file.filepath);
        const version = await FileVersion.findOne({
          where: { 
            conversation_id: this.context.conversation_id,
            filepath: relativePath,
            active: true
          },
          order: [['create_at', 'DESC']]
        });
        
        return {
          ...file,
          version_id: version ? version.id : null,
          version_number: version ? version.version : null
        };
      } catch (error) {
        console.error('[AgenticAgent] Failed to fetch version for file:', file.filename, error);
        return file; // Return file without version if fetch fails
      }
    }));

    // ARTIFACT-GROUNDED COMPLETION: verify what actually exists on disk against
    // what tasks claimed, what the goal implied, AND what the intent classifier
    // expected. Feeds an honest status and a grounding block in the summary prompt.
    const { verifyArtifacts } = require('./artifactVerification');
    let extraExpected = [];
    try {
      const { getCachedClassification } = require('@src/agent/intent-classifier');
      const classification = getCachedClassification(this.context.conversation_id, this.goal);
      if (classification && Array.isArray(classification.expected_artifacts)) {
        extraExpected = classification.expected_artifacts;
      }
    } catch { /* classifier optional */ }

    let verification = verifyArtifacts({ tasks, goal: this.goal, verifiedFiles: filesWithVersions, extraExpected });

    // COMPLETION-DRIVEN REPAIR: up to 3 passes converting "honest failure" into
    // actual delivery. Each pass targets whatever is STILL missing; stops early
    // when satisfied, when a pass makes no progress, or on user stop.
    let repairPass = 0;
    while (!verification.satisfied && !hasPreGeneratedAction && !this.is_stop && tasks.length > 0 && repairPass < 3) {
      repairPass++;
      const missing = [...verification.missingClaims, ...verification.missingGoalArtifacts];
      console.log(`[AgenticAgent] 🔧 Repair pass ${repairPass}/3 — missing:`, missing.join(', '));
      try {
        await this._publishMessage({
          action_type: 'progress', status: 'running',
          content: repairPass === 1 ? '🔧 Finishing up remaining deliverables...' : `🔧 Completing remaining files (pass ${repairPass})...`
        });

        // DETERMINISTIC repair: generate each missing file's content directly and
        // write it — no open-ended think/act loop. Max 3 files per pass.
        const missingConcrete = [...new Set(missing.map(m => {
          const t = (m || '').trim().toLowerCase();
          if (/^[\w\-]+\.(html|css|js|json|py|md|txt)$/.test(t)) return t;   // concrete filename
          if (t.includes('html frontend') || t === 'file of type .html') return 'index.html';
          if (t === 'file of type .css') return 'styles.css';
          if (t === 'file of type .js') return 'script.js';
          return null;
        }).filter(Boolean))].slice(0, 3);

        if (missingConcrete.length === 0) {
          console.log('[AgenticAgent] Repair: nothing concretely actionable — stopping');
          break;
        }

        const beforeCount = verification.verifiedNames.length;
        const call = require('@src/utils/llm');
        for (const filename of missingConcrete) {
          if (this.is_stop) break;
          const genPrompt = `Generate the COMPLETE contents of the file "${filename}" for this goal:\n${this.goal}\n\nFiles that already exist and must be integrated with: ${verification.verifiedNames.join(', ') || 'none'}${verification.verifiedNames.some(n => n.endsWith('.py')) ? ' (a Flask backend serving JSON — the frontend should fetch from its endpoints, e.g. /api/sales on http://localhost:5000)' : ''}.\n\nRules:\n- Respond with ONLY the raw file contents. No markdown fences, no explanations.\n- Make it complete, modern, and production-quality.\n- ${filename.endsWith('.html') ? 'If no separate .css/.js files are being created, inline styles and scripts in this HTML.' : 'Keep it self-contained.'}`;

          let content = await call(genPrompt, this.context.conversation_id, 'assistant', {
            temperature: 0.4, max_tokens: 8000, skip_system_prompt: true
          });
          if (typeof content !== 'string' || !content.trim()) continue;
          // strip accidental fences
          content = content.replace(/^```[\w]*\n/, '').replace(/\n```\s*$/, '');

          const writeResult = await this.runtime.execute_action(
            { type: 'write_code', params: { path: filename, content } },
            this.context,
            `repair_${repairPass}`
          );
          console.log(`[AgenticAgent] Repair wrote ${filename}:`, writeResult && writeResult.status);
        }

        // Fresh scan + re-verify after the pass
        const freshList = await getAllFilesRecursively(dirPath);
        const freshFiles = await getFilesMetadata(freshList, this.sessionStartTime);
        const known = new Set(filesWithVersions.map(f => f.filepath));
        for (const f of freshFiles) {
          if (!known.has(f.filepath)) filesWithVersions.push(f);
        }
        verification = verifyArtifacts({ tasks, goal: this.goal, verifiedFiles: filesWithVersions, extraExpected });
        if (verification.satisfied) {
          console.log(`[AgenticAgent] ✅ Repair delivered all artifacts (pass ${repairPass})`);
          break;
        }
        if (verification.verifiedNames.length <= beforeCount) {
          console.warn('[AgenticAgent] Repair pass made no progress — stopping to avoid a loop');
          break;
        }
      } catch (repairError) {
        console.error('[AgenticAgent] Repair pass failed (non-fatal):', repairError.message);
        break;
      }
    }

    // CONDITIONAL SELF-HEAL GATE: only for web deliverables (html present), only
    // in the full agentic flow. Opens the page in headless Chrome, reads the
    // console, and fixes real JS code errors. Never blocks delivery on failure.
    if (!hasPreGeneratedAction && !this.is_stop) {
      try {
        const htmlFiles = filesWithVersions.filter(f => (f.filename || '').toLowerCase().endsWith('.html'));
        if (htmlFiles.length > 0) {
          await this._webVerifyAndHeal(htmlFiles);
        }
      } catch (gateErr) {
        console.error('[AgenticAgent] Web verify gate failed (non-fatal):', gateErr.message);
      }
    }

    if (!verification.satisfied) {
      console.warn('[AgenticAgent] ⚠️ Artifact verification FAILED — missing:',
        [...verification.missingClaims, ...verification.missingGoalArtifacts].join(', ') || '(none)');
      if (finalResult.status === 'success') {
        finalResult.status = 'partial_failure';
      }
      finalResult.missingArtifacts = [...verification.missingClaims, ...verification.missingGoalArtifacts];
    } else if (finalResult.status === 'partial_failure' && tasks.length > 0) {
      // repair delivered everything — reflect that honestly too
      finalResult.status = 'success';
      finalResult.missingArtifacts = [];
    }
    finalResult.verifiedFiles = verification.verifiedNames;

    // Skip summary if code-act already sent finish_summery (ultra-fast-path or fast-path with preGeneratedAction)
    // This uses the same condition as versioning to maintain consistency
    if (!hasPreGeneratedAction) {
      // Only generate summary for full agentic flow (no pre-generated actions)
      const summaryContent = await summary(this.goal, this.context.conversation_id, tasks, filesWithVersions, this.context.staticUrl, this.context.user_id, verification);
      const uuid = uuidv4();
      await this._publishMessage({ uuid, action_type: 'finish_summery', status: 'success', content: summaryContent, json: filesWithVersions });
      finalResult.summary = summaryContent;
    } else {
      console.log('[AgenticAgent] Skipping summary - code-act already sent finish_summery for ultra task');
      finalResult.summary = 'Task completed'; // Placeholder since code-act already sent message
    }
    
    // PHASE 2: Invalidate context after execution completes
    if (this.conversationContext) {
      this.conversationContext.invalidate();
      console.log('[AgenticAgent] Context invalidated after execution');
    }

    // LEARN AS SHE GOES: distill this task into a lesson — fire-and-forget so it
    // NEVER delays the user's result. Also self-clean the workspace of temp files.
    setImmediate(() => {
      try {
        const { distillAndStore } = require('@src/agent/learning/lessonMemory');
        distillAndStore({
          goal: this.goal,
          taskType: this.context.taskType || (tasks.length ? 'agent_task' : 'general'),
          status: finalResult.status,
          tasks,
          verifiedFiles: verification.verifiedNames,
          conversation_id: this.context.conversation_id
        }).catch(() => {});
      } catch { /* learning is optional */ }
      try {
        const { cleanupWorkspace } = require('@src/agent/learning/janitor');
        cleanupWorkspace(dirPath).catch(() => {});
      } catch { /* cleanup is optional */ }
    });

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
      
      // DEBUG: Log what auto_reply returned
      console.log('[AgenticAgent] DEBUG autoReplyResult:', JSON.stringify(autoReplyResult));
      console.log('[AgenticAgent] DEBUG autoReplyResult type:', typeof autoReplyResult);
      
      // If specialist needs execution, store response for planning to use
      if (autoReplyResult && autoReplyResult.needsExecution) {
        console.log(`[AgenticAgent] Specialist provided code/actions - storing for execution`);
        this.context.specialistResponse = autoReplyResult.specialistResponse;
        this.context.specialist = autoReplyResult.specialist;
        this.context.taskType = autoReplyResult.taskType;
        
        // CRITICAL: Check for skipPlanning flag (ultra-fast-path for simple tasks)
        if (autoReplyResult.skipPlanning || autoReplyResult.directExecution) {
          console.log(`[AgenticAgent] ⚡⚡ ULTRA Fast-path: skipPlanning=true, going directly to execution`);
          this.skipPlanning = true; // Set flag to skip planning phase
          
          // CRITICAL: Store pre-generated action if provided (bypasses thinking LLM call)
          if (autoReplyResult.preGeneratedAction) {
            console.log(`[AgenticAgent] ⚡⚡ Pre-generated action XML detected - will bypass thinking()`);
            this.preGeneratedAction = autoReplyResult.preGeneratedAction;
          }
        }
        // Continue to planning which will extract and execute the code (or skip if flag set)
      }
      
      // If specialist handled it completely, stop here
      else if (autoReplyResult && autoReplyResult.handledBySpecialist) {
        console.log(`[AgenticAgent] ✅ Task handled by ${autoReplyResult.specialist} specialist`);
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
          'api_design',          // API spec - just text/description
          'simple_data_generation'  // Simple docs - single-step execution (skip planning)
        ];
        
        if (directCompletionTasks.includes(autoReplyResult.taskType)) {
          console.log('[AgenticAgent] Direct completion task - checking if needs pre-fill');
          
          // SPEED OPTIMIZATION: Send pre-fill messages for tasks with potential wait times
          // This shows user we're working while specialist response is being processed
          const { sendProgressMessage } = require('@src/routers/agent/utils/coding-messages');
          
          // Task-specific pre-fill messages
          const preFillMessagesByType = {
            simple_data_generation: [
              'On it! Spinning up the doc generator...',
              'Got it. Let me cook this up real quick...',
              'Say less. Document incoming...',
              '🔥 Bet. Firing up the engines...',
              'Already on it. Give me a sec...',
              'Alright, let\'s make this happen...'
            ],
            creative_writing: [
              'Alright, let me get creative...',
              'On it! Crafting something good...',
              'Say less. Let me write this up...',
              'Got it. Time to create...',
              'Already on it. Give me a moment...'
            ],
            code_review: [
              'Reviewing the code now...',
              'On it! Let me analyze this...',
              'Got it. Checking the code...',
              'Already reviewing...'
            ],
            brainstorming: [
              'Let me think on this...',
              'Alright, brainstorming mode activated...',
              'Got it. Let me come up with some ideas...',
              'On it! Thinking...'
            ]
          };
          
          const messages = preFillMessagesByType[autoReplyResult.taskType];
          if (messages) {
            console.log(`[AgenticAgent] ⚡ Sending pre-fill message for ${autoReplyResult.taskType}`);
            const randomMessage = messages[Math.floor(Math.random() * messages.length)];
            
            await sendProgressMessage(
              this.onTokenStream,
              this.context.conversation_id,
              randomMessage,
              'progress'
            );
          }
          
          console.log('[AgenticAgent] Direct completion task - marking as done');
          await Conversation.update({ status: 'done' }, { where: { conversation_id: this.context.conversation_id } });
          // Send completion signal to stop UI spinner, include files for UI preview if available
          const filesJson = autoReplyResult.files || [];
          await this._publishMessage({ action_type: 'finish_summery', status: 'success', content: autoReplyResult.result || '', json: filesJson });
          return autoReplyResult.result;
        }
        
        // For tasks needing tools (code/data/file generation, math, research, etc.)
        // Specialist provides guidance, then we continue to planning for tool execution
        console.log('[AgenticAgent] Task requires tools - continuing to planning for execution');
        
        // SPEED OPTIMIZATION: Send pre-fill for tasks going to planning
        // Show user we're working while planning happens
        if (autoReplyResult && autoReplyResult.taskType) {
          const { sendProgressMessage } = require('@src/routers/agent/utils/coding-messages');
          
          const planningPreFillMessages = {
            complex_reasoning: [
              'Alright, let me think through this...',
              'On it! Working through the logic...',
              'Got it. Let me reason this out...',
              'Already analyzing...'
            ],
            code_generation: [
              'On it! Setting up the code...',
              'Got it. Let me build this...',
              'Already coding...',
              'Alright, let me write this up...'
            ],
            mathematical_reasoning: [
              'On it! Crunching the numbers...',
              'Got it. Let me solve this...',
              'Already calculating...',
              'Alright, working on the math...'
            ],
            data_generation: [
              'On it! Generating the data...',
              'Got it. Let me create this...',
              'Already building...',
              'Alright, setting this up...'
            ],
            web_research: [
              'On it! Searching for info...',
              'Got it. Let me look this up...',
              'Already researching...',
              'Alright, finding what you need...'
            ]
          };
          
          const messages = planningPreFillMessages[autoReplyResult.taskType];
          if (messages) {
            console.log(`[AgenticAgent] ⚡ Sending planning pre-fill for ${autoReplyResult.taskType}`);
            const randomMessage = messages[Math.floor(Math.random() * messages.length)];
            
            await sendProgressMessage(
              this.onTokenStream,
              this.context.conversation_id,
              randomMessage,
              'progress'
            );
          }
        }
        
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
      // PHASE 2: Use unified context if available, otherwise fallback to old method
      let files, previousResult, planningContext;
      
      if (this.conversationContext) {
        // New pattern: Get planning context from unified context manager
        planningContext = this.conversationContext.getPlanningContext();
        files = planningContext.files;
        previousResult = planningContext.previousResult;
        console.log('[AgenticAgent] Using unified context for planning');
      } else {
        // Old pattern: Load files and previous result separately (backward compatibility)
        files = await File.findAll({ where: { conversation_id: this.context.conversation_id } });
        const conversationDirPath = await this._getConversationDirPath();
        previousResult = await retrieveAndFormatPreviousSummary(this.context.conversation_id, conversationDirPath);
        console.log('[AgenticAgent] Using legacy context loading for planning');
      }
      
      this.context.files = files;

      const planning_mode = this.planning_mode;
      const options = {
        conversation_id: this.context.conversation_id,
        agent_id: this.context.agent_id,
        planning_mode,
        files,
        previousResult,
        specialistResponse: this.context.specialistResponse, // Pass specialist code to planning
        planningContext // Pass full planning context for future use
      }
      const plannedTasks = await planning(goal, options) || [];

      await this.taskManager.setTasks(plannedTasks);
      const tasks = this.taskManager.getTasks();
      
      // Make task titles user-friendly (hide backend technical details)
      const userFriendlyTasks = tasks.map(task => ({
        ...task,
        title: this._makeTaskTitleUserFriendly(task.title, task.description),
        description: this._makeTaskDescriptionUserFriendly(task.description)
      }));
      
      await this._publishMessage({ action_type: 'plan', status: 'success', content: '', json: userFriendlyTasks });

      console.log('====== planning completed ======');

      // TODO.MD GENERATION DISABLED - User does not need todo list in UI
      // const uuid = uuidv4();
      // const dir_name = 'Conversation_' + this.context.conversation_id.slice(0, 6);

      // await this._publishMessage({ action_type: 'write_code', status: 'running', content: "todo.md", json: {}, task_id: null, uuid });

      // const todo_md = await getTodoMd(tasks);
      // const action = {
      //   type: 'write_code',
      //   params: {
      //     path: `${dir_name}/todo.md`,
      //     content: todo_md
      //   }
      // };
      // const result = await write_code(action, uuid, this.context.user_id);

      // if (!this.context.generate_files) {
      //   this.context.generate_files = [];
      // }
      // this.context.generate_files.push(result.meta.filepath);

      // await this._publishMessage({
      //   action_type: result.meta.action_type,
      //   status: result.status,
      //   content: result.content || '',
      //   filepath: result.meta.filepath,
      //   json: {},
      //   task_id: null,
      //   uuid,
      //   meta_content: todo_md
      // });

      return true;
    } catch (error) {
      global.logging(this.context, 'AgenticAgent.plan', 'error', error);
      // CRITICAL: do NOT swallow planning failures — that produced empty plans and
      // hallucinated success summaries. Propagate so run() marks the conversation
      // failed and the user gets an honest error instead of a fake "all done!".
      console.error('[AgenticAgent] Planning failed:', error.message);
      throw error;
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
      // TODO.MD GENERATION DISABLED - User does not need todo list in UI
      // const uuid = uuidv4();
      // const dir_name = 'Conversation_' + this.context.conversation_id.slice(0, 6);
      // const new_tasks = this.taskManager.getTasks();
      // const todo_md = await getTodoMd(new_tasks);
      // const action = {
      //   type: 'write_code',
      //   params: {
      //     path: `${dir_name}/todo.md`,
      //     content: todo_md
      //   }
      // };

      // await this._publishMessage({
      //   action_type: 'write_code',
      //   status: 'running',
      //   content: "todo.md",
      //   json: {},
      //   task_id: task.id,
      //   uuid
      // });
      // const todoRes = await write_code(action, uuid, this.context.user_id);
      // await this._publishMessage({
      //   action_type: todoRes.meta.action_type,
      //   status: todoRes.status,
      //   content: todoRes.content || '',
      //   filepath: todoRes.meta.filepath,
      //   json: {},
      //   task_id: task.id,
      //   uuid,
      //   meta_content: todo_md
      // });
    }
  }

  async run_loop() {
    const loggerKey = 'AgenticAgent.run_loop';
    const manager = this.taskManager;
    while (true) {
      // CANCELLATION: honor user stop between tasks — previously the loop kept
      // executing every remaining pending task after the user hit stop.
      if (this.is_stop) {
        global.logging(this.context, loggerKey, '====== stopped by user, exiting task loop ======');
        return;
      }
      const task = await manager.resolvePendingTask();
      if (!task) {
        global.logging(this.context, loggerKey, '====== no task ======');
        return;
      }
      global.logging(this.context, loggerKey, task);
      this.context.task = task;
      
      // TWEAK 1: Pass previous task results to current task for multi-phase flows
      if (this.context.previousTaskResult) {
        console.log('[AgenticAgent] Passing previous task result to current task');
        task.previousResult = this.context.previousTaskResult;
      }
      
      try {
        const result = await completeCodeAct(task, this.context);
        global.logging(this.context, loggerKey, result);
        // CANCELLATION: task was stopped mid-execution — exit quietly without
        // marking the conversation failed (user asked for this, it's not an error)
        if (result.status === 'stopped' || this.is_stop) {
          global.logging(this.context, loggerKey, '====== task stopped by user ======');
          return;
        }
        if (result.status === 'failure') {
          await this.handle_task_status(task, 'failed', {
            content: result.comments,
            memorized: result.memorized || '',
            comments: result.comments,
          });
          // RESILIENCE: a single failed task no longer aborts the whole run.
          // Continue to remaining tasks — _generateFinalOutput then runs artifact
          // verification, the repair pass, and an honest grounded summary.
          // (Previously this stopped everything, so verification/repair never ran.)
          console.warn(`[AgenticAgent] Task ${task.id} failed — continuing with remaining tasks`);
          continue;
        }
        if (result.status === 'revise_plan') {
          await this.handle_task_status(task, 'revise_plan', {
            content: result.content || '',
            memorized: result.memorized || '',
            params: result.params || {}
          });
          continue;
        }

        // ARTIFACT GATE: a task that claimed file writes cannot be 'completed'
        // unless those files actually exist on disk. Marks the task failed and
        // continues — the final summary then reports the miss honestly.
        try {
          const { extractClaimedArtifacts } = require('./artifactVerification');
          const claimed = extractClaimedArtifacts([{
            ...task,
            result: typeof result.content === 'string' ? result.content : '',
            memorized: typeof result.memorized === 'string' ? result.memorized : ''
          }]);
          if (claimed.length > 0) {
            const dirPath = await this._getConversationDirPath();
            const existing = new Set(
              (await getAllFilesRecursively(dirPath)).map(f => path.basename(f).toLowerCase())
            );
            const missing = claimed.filter(n => !existing.has(n));
            if (missing.length > 0) {
              console.warn(`[AgenticAgent] ⚠️ Artifact gate: task ${task.id} claimed files that do not exist: ${missing.join(', ')}`);
              await this.handle_task_status(task, 'failed', {
                content: `Expected file(s) were not created: ${missing.join(', ')}`,
                comments: 'artifact verification failed'
              });
              continue;
            }
          }
        } catch (gateError) {
          // Verification must never break execution — log and proceed
          console.error('[AgenticAgent] Artifact gate error (non-fatal):', gateError.message);
        }

        await this.handle_task_status(task, 'completed', {
          content: result.content,
          memorized: result.memorized || ''
        });
        
        // TWEAK 1: Store result for next task to use in multi-phase flows
        if (result.content) {
          console.log('[AgenticAgent] Storing task result for next task');
          this.context.previousTaskResult = result.content;
        }
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
   * CONDITIONAL SELF-HEAL: open generated HTML in headless Chrome (DevTools MCP),
   * read the console, and fix real JS CODE errors (SyntaxError/ReferenceError/
   * TypeError). Network/CORS/favicon noise under file:// is deliberately ignored —
   * those are false positives outside a served context. One fix round per file,
   * max 2 files, always fail-soft.
   */
  async _webVerifyAndHeal(htmlFiles) {
    const DevTools = require('@src/tools/DevTools');
    const fsP = require('fs').promises;
    const CODE_ERROR_RE = /(SyntaxError|ReferenceError|TypeError|is not defined|Unexpected token|Uncaught)/;
    const NOISE_RE = /(Failed to load resource|net::|CORS|favicon|ERR_FILE_NOT_FOUND|Access-Control)/;

    const readCodeErrors = async () => {
      const con = await DevTools.execute({ operation: 'console' });
      const lines = ((con && con.content) || '').match(/\[error\][^\n]*/g) || [];
      return lines.filter(l => CODE_ERROR_RE.test(l) && !NOISE_RE.test(l));
    };

    for (const f of htmlFiles.slice(0, 2)) {
      if (this.is_stop) return;
      const abs = f.filepath;
      const nav = await DevTools.execute({ operation: 'navigate', url: 'file://' + abs });
      if (!nav || nav.status !== 'success') {
        console.warn('[WebVerify] could not open', f.filename, '— skipping gate');
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
      const errors = await readCodeErrors();
      if (errors.length === 0) {
        console.log('[WebVerify] ✅', f.filename, '— console clean');
        continue;
      }

      console.warn('[WebVerify] 🩹', f.filename, 'JS errors:', errors.join(' | ').slice(0, 300));
      await this._publishMessage({
        action_type: 'progress', status: 'running',
        content: '🔬 Verifying the page in a real browser and fixing issues...'
      });

      try {
        const current = await fsP.readFile(abs, 'utf8');
        const call = require('@src/utils/llm');
        let fixed = await call(
          `Fix the JavaScript errors in this HTML file. Browser console reported:\n${errors.join('\n')}\n\nReturn ONLY the complete corrected file contents — no markdown fences, no commentary.\n\n${current.slice(0, 24000)}`,
          this.context.conversation_id, 'assistant',
          { temperature: 0.2, max_tokens: 12000, skip_system_prompt: true }
        );
        if (typeof fixed === 'string' && fixed.trim().length > 200) {
          fixed = fixed.replace(/^```[\w]*\n/, '').replace(/\n```\s*$/, '');
          await fsP.writeFile(abs, fixed);
          // re-check once
          await DevTools.execute({ operation: 'navigate', url: 'file://' + abs });
          await new Promise(r => setTimeout(r, 1200));
          const residual = await readCodeErrors();
          console.log(residual.length === 0
            ? `[WebVerify] ✅ healed ${f.filename}`
            : `[WebVerify] ⚠️ residual errors remain in ${f.filename}: ${residual.join(' | ').slice(0, 200)}`);
        }
      } catch (healErr) {
        console.error('[WebVerify] heal attempt failed (non-fatal):', healErr.message);
      }
    }
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