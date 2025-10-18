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

  const memory = await describeLocalMemory(context);
  const tools = await resolveToolPrompt(); // system tools
  const servers = await resolveServers(context);
  const mcpToolsPrompt = await resolveMcpServerPrompt(servers); // mcp server tools
  // console.log("mcpToolsPrompt", mcpToolsPrompt);
  const uploadFileDescription = describeUploadFiles(context.files || []);
  const previousResult = await loadConversationMemory(context.conversation_id);
  const app_ports = JSON.stringify([context.runtime.app_port_1, context.runtime.app_port_2])
  const system = describeSystem();
  const knowledge = await resolveThinkingKnowledge(context);

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

  const thinking_options = {
    system, // 系统信息
    app_ports, // 端口信息
    previous: previousResult, // 前置记录结果
    memory, // 执行记录
    files: uploadFileDescription, // 上传文件信息
    goal, // 主任务目标
    requirement, // 当前需求
    reflection, // 反馈信息
    best_practices_knowledge: knowledge,
    tools: tools + '\n' + mcpToolsPrompt, // 工具列表
    user_profile: profileContext, // User profile context
    specialist_guidance: specialistGuidance // Specialist routing guidance
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