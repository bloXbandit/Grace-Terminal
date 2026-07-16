const resolveToolPrompt = require('@src/agent/prompt/tool');

// 提示词转换函数
const { describeLocalMemory, loadConversationMemory, describeUploadFiles, describeSystem } = require("./thinking.util");

const resolveServers = require("@src/mcp/server.js");
const { resolveMcpServerPrompt } = require("@src/mcp/prompt.js");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const { resolveThinkingKnowledge } = require("@src/knowledge/index");

// 模板加载解析
const { resolveTemplate, loadTemplate } = require("@src/utils/template");

const { resolveEvaluateOptions } = require("./evaluate.prompt");

const resolveThinkingPrompt = async (requirement = '', context = {}) => {

  const { reflection = '', goal = '', depth = 1, profileContext = '' } = context;
  global.logging(context, 'thinking.prompt', `goal: ${goal}`);
  
  // TWEAK 1: Include previous task results for multi-phase flows
  const previousTaskResult = context.previousTaskResult || context.researchResults || '';
  const taskPreviousResult = context.task?.previousResult || '';

  const memory = await describeLocalMemory(context);
  const tools = await resolveToolPrompt(); // system tools
  const servers = await resolveServers(context);
  const mcpToolsPrompt = await resolveMcpServerPrompt(servers); // mcp server tools
  // console.log("mcpToolsPrompt", mcpToolsPrompt);
  const uploadFileDescription = describeUploadFiles(context.files || []);
  const previousResult = await loadConversationMemory(context.conversation_id);
  const app_ports = JSON.stringify([context.runtime.app_port_1, context.runtime.app_port_2])
  const system = await describeSystem(context);
  const knowledge = await resolveThinkingKnowledge(context);
  
  // Add workspace path for file operations
  const { getDirpath } = require('@src/utils/electron');
  const path = require('path');
  const fsSync = require('fs');
  const dir_name = 'Conversation_' + context.conversation_id.slice(0, 6);
  let WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', context.user_id);
  // BUG GUARD: getDirpath drops user_<id> when LEMON_AI_PATH is set (always, in-container).
  // Without this, the agent is told the WRONG workspace path and can't find its own files.
  const userSeg = `user_${context.user_id}`;
  if (context.user_id && !WORKSPACE_DIR.includes(userSeg)) {
    const withUser = path.join(WORKSPACE_DIR, userSeg);
    if (fsSync.existsSync(withUser)) WORKSPACE_DIR = withUser;
  }
  const workspace_path = path.join(WORKSPACE_DIR, dir_name);

  // COMPOUND/ITERATIVE WORK: list files already in this conversation so the agent
  // KNOWS what it built before and can read/modify them (instead of concluding
  // "the file doesn't exist" and starting over).
  let workspace_files_listing = '';
  try {
    if (fsSync.existsSync(workspace_path)) {
      const entries = fsSync.readdirSync(workspace_path)
        .filter(f => !/^(temp_script_|create_doc_|create_excel_|create_pdf_|nohup\.out|__pycache__|\.)/.test(f))
        .filter(f => { try { return fsSync.statSync(path.join(workspace_path, f)).isFile(); } catch { return false; } });
      if (entries.length > 0) {
        workspace_files_listing = `\n\n**FILES ALREADY IN YOUR WORKSPACE (from earlier in this conversation):**\n`
          + entries.map(f => `- ${f}`).join('\n')
          + `\nTo modify one: (1) <read_file><path>FILENAME</path></read_file> (just the filename), (2) then write_code with the SAME filename containing the COMPLETE UPDATED FILE — every existing function/section PLUS your change. write_code REPLACES the whole file: writing only the new part DESTROYS existing work. Do NOT recreate from scratch or claim the file doesn't exist.`;
      }
    }
  } catch (e) { /* best-effort */ }

  // Check if specialist routing is enabled (Task/Auto modes only)
  const specialistGuidance = context.enableSpecialistRouting ? `

## 🤖 Multi-Agent Collaboration System

You have access to a team of specialist AI agents and can orchestrate complex tasks:

### Available Specialists:
- **Code Generation**: Claude Sonnet 4.5 (quality) / Qwen3-Coder-30B-A3B (fast)
- **Code Review**: DeepSeek Coder
- **Debugging**: DeepSeek R1 (90% accuracy - best in class)
- **Code Reasoning**: GPT-OSS-20B (complex algorithms)
- **Frontend/UI**: Microsoft Phi-4 (14B hidden gem)
- **Backend**: GPT-4o
- **Database Design**: Claude 3 Opus
- **Security Audit**: GPT-4o
- **Test Generation**: Claude Sonnet 4.5
- **Documentation**: GLM-4 Plus
- And more...

### Collaboration Modes:

**1. Ask a Specialist (Simple Consultation)**
\`\`\`javascript
const review = await context.coordinator.askSpecialist('code_review', 
  'Review this code for security issues: [code]'
);
\`\`\`

**2. Multi-Agent Collaboration (Complex Tasks)**
For complex tasks like "build authentication system", the system automatically:
- Detects complexity
- Decomposes into subtasks
- Routes to appropriate specialists
- Synthesizes results with QC

The system handles this automatically, but you can also manually delegate:
\`\`\`javascript
const subtasks = [
  { type: 'database_design', prompt: 'Design auth schema', description: 'DB Schema' },
  { type: 'backend_development', prompt: 'Build auth API', description: 'API', dependencies: [0] },
  { type: 'security_audit', prompt: 'Review security', description: 'Security Check', dependencies: [0,1] }
];
const results = await context.coordinator.collaborate(userMessage, subtasks);
\`\`\`

**3. Check Task Complexity**
\`\`\`javascript
const isComplex = context.coordinator.detectComplexity(userMessage);
if (isComplex) {
  // Use multi-agent approach
}
\`\`\`

### When to Use Multi-Agent Collaboration:
- ✅ Full-stack features (database + API + frontend)
- ✅ Security-critical code (needs multiple reviews)
- ✅ Production systems (needs comprehensive testing)
- ✅ Complex algorithms (needs reasoning + review)
- ✅ Any task requiring multiple perspectives

### Quality Control:
Results from multiple specialists are automatically synthesized and cross-validated for consistency and completeness.

Use specialists strategically to deliver the highest quality solutions!
` : '';

  // TWEAK 1: Build research context from previous task results
  const researchContext = previousTaskResult || taskPreviousResult 
    ? `\n\n## Previous Task Results (Use this data!):\n${previousTaskResult || taskPreviousResult}\n`
    : '';

  // LEARN AS SHE GOES: inject the few most-relevant lessons from past work.
  // Pure DB + keyword scoring (no LLM call) — a few ms, ~5 prompt lines.
  let lessons_block = '';
  try {
    const { retrieveLessons } = require('@src/agent/learning/lessonMemory');
    lessons_block = await retrieveLessons(goal || requirement || '', context.taskType || null);
  } catch (e) { /* learning optional */ }

  const thinking_options = {
    system, // 系统信息
    app_ports, // 端口信息
    previous: previousResult + researchContext, // 前置记录结果 + research from previous task
    memory, // 执行记录
    files: uploadFileDescription, // 上传文件信息
    goal, // 主任务目标
    requirement, // 当前需求
    reflection, // 反馈信息
    best_practices_knowledge: knowledge,
    tools: tools + '\n' + mcpToolsPrompt, // 工具列表
    user_profile: profileContext, // User profile context
    specialist_guidance: specialistGuidance, // Specialist routing guidance
    workspace_path: workspace_path, // Workspace directory for file operations
    workspace_files: workspace_files_listing, // Files already built this conversation
    lessons: lessons_block // Relevant lessons from past executions
  }

  // 动态评估提示词
  const evaluate_options = await resolveEvaluateOptions(context);
  Object.assign(thinking_options, evaluate_options)
  global.logging(context, 'thinking.prompt', `evaluate_options.current_plan: ${evaluate_options.current_plan}`);

  const promptTemplate = await loadTemplate('thinking.txt');
  const thinking_prompt = await resolveTemplate(promptTemplate, thinking_options)

  return thinking_prompt;
}

module.exports = resolveThinkingPrompt;