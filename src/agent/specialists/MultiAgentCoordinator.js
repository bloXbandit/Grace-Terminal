const { SPECIALIST_ROUTING, DEFAULT_ROUTING } = require('./routing.config');
const createLLMInstance = require("@src/completion/llm.one.js");
const RoutingPreference = require('@src/models/RoutingPreference');

/**
 * Multi-Agent Coordinator
 * Routes tasks to specialist AI models and coordinates their responses
 */
class MultiAgentCoordinator {
  constructor(context = {}) {
    this.context = context;
    this.conversation_id = context.conversation_id;
    this.user_id = context.user_id;
    
    // Load user's custom routing preferences (from DB)
    this.customRouting = {};
    this.loadUserPreferences();
  }
  
  /**
   * Load user's custom routing preferences from database
   */
  async loadUserPreferences() {
    try {
      const preferences = await RoutingPreference.findAll({
        where: {
          user_id: this.user_id,
          is_active: true
        }
      });
      
      preferences.forEach(pref => {
        this.customRouting[pref.task_type] = {
          primary: pref.primary_model,
          fallback: pref.fallback_model,
          systemPrompt: SPECIALIST_ROUTING[pref.task_type]?.systemPrompt || ''
        };
      });
    } catch (error) {
      console.error('[Coordinator] Error loading user preferences:', error);
    }
  }

  /**
   * Detect task type from user's request
   */
  detectTaskType(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Context-aware creative detection (before keyword matching)
    // Detects artistic/creative intent even without specific keywords
    const creativeIndicators = [
      // Artistic mediums
      /\b(art|artistic|creative|imagination|imaginative)\b/i,
      // Content creation
      /\b(story|stories|narrative|plot|character|dialogue|scene)\b/i,
      /\b(poem|poetry|verse|rhyme|stanza|lyric|lyrics|song|rap|music)\b/i,
      /\b(script|screenplay|movie|film|video|cinematic|visual)\b/i,
      /\b(concept|idea|theme|motif|metaphor|symbolism)\b/i,
      // Creative actions
      /\b(write|compose|craft|create|design|imagine|envision)\b.*\b(about|for|with)\b/i,
      // Emotional/expressive language
      /\b(emotional|expressive|vivid|dramatic|poetic|artistic)\b/i,
      // Entertainment/media
      /\b(entertainment|performance|show|production|content)\b/i
    ];
    
    // Check for multiple creative indicators (context-based)
    let creativeScore = 0;
    for (const pattern of creativeIndicators) {
      if (pattern.test(message)) {
        creativeScore++;
      }
    }
    
    // If 2+ creative indicators, route to creative_writing
    if (creativeScore >= 2) {
      console.log(`[Coordinator] Creative context detected (score: ${creativeScore})`);
      return 'creative_writing';
    }
    
    // P6 Project Management / XER Analysis detection
    const p6Indicators = [
      /\b(xer|primavera|p6)\b/i,
      /\b(project.*schedule|schedule.*analysis)\b/i,
      /\b(dcma|14.*point)\b/i,
      /\b(critical.*path|float.*analysis)\b/i,
      /\b(earned.*value|evm|cpi|spi)\b/i,
      /\b(resource.*utilization|over.*allocat)\b/i,
      /\b(wbs|work.*breakdown)\b/i,
      /\b(activity.*code|predecessor|successor)\b/i
    ];
    
    let p6Score = 0;
    for (const pattern of p6Indicators) {
      if (pattern.test(message)) {
        p6Score++;
      }
    }
    
    if (p6Score >= 1) {
      console.log(`[Coordinator] P6 project management detected (score: ${p6Score})`);
      return 'p6_project_management';
    }
    
    // Context-aware data generation detection
    // Detects when user needs structured data/files created
    const dataGenIndicators = [
      // File formats
      /\b(excel|xlsx|xls|spreadsheet|workbook)\b/i,
      /\b(csv|comma.*separated|tsv|tab.*separated)\b/i,
      /\b(json|yaml|xml|data.*file)\b/i,
      /\b(text.*file|txt|document|doc|word.*doc)\b/i,
      // Data structures
      /\b(table|rows|columns|dataset|data.*set)\b/i,
      /\b(list|array|collection|entries)\b/i,
      // Data actions
      /\b(organize|structure|format|compile|aggregate)\b/i,
      /\b(populate|fill|generate|create|build|make)\b/i,
      // Data content indicators
      /\b(states|countries|cities|names|addresses|products|items)\b/i,
      /\b(records|entries|data.*points|information)\b/i,
      // Output/export language
      /\b(export|output|save.*as|download|file)\b/i,
      // File placement/location
      /\b(place|put|save|store|write).*\b(on|to|in|at).*\b(desktop|folder|directory)\b/i,
      /\b(desktop|downloads|documents|folder)\b/i,
      // Mentions uploading/having data
      /\b(upload|uploaded|attach|data.*from|based.*on)\b/i
    ];
    
    // Check for multiple data generation indicators
    let dataGenScore = 0;
    for (const pattern of dataGenIndicators) {
      if (pattern.test(message)) {
        dataGenScore++;
      }
    }
    
    // If 2+ data indicators, route to data_generation
    if (dataGenScore >= 2) {
      console.log(`[Coordinator] Data generation context detected (score: ${dataGenScore})`);
      return 'data_generation';
    }
    
    // Context-aware code task detection
    // Detects programming/development intent even without explicit "code" keyword
    const codeIndicators = [
      // Programming languages
      /\b(python|javascript|typescript|java|c\+\+|rust|go|ruby|php|swift|kotlin)\b/i,
      /\b(react|vue|angular|node|express|django|flask|spring)\b/i,
      // Code artifacts
      /\b(function|class|method|component|module|package|library)\b/i,
      /\b(api|endpoint|route|handler|controller|service)\b/i,
      /\b(variable|constant|array|object|interface|type)\b/i,
      // Development actions
      /\b(implement|build|develop|program|code|script|write)\b/i,
      /\b(debug|fix|solve|troubleshoot|error|bug|issue)\b/i,
      /\b(refactor|optimize|improve|clean.*up|rewrite)\b/i,
      /\b(test|unit.*test|integration|testing)\b/i,
      // Technical concepts
      /\b(algorithm|logic|recursion|iteration|loop|conditional)\b/i,
      /\b(async|promise|callback|event|listener)\b/i,
      /\b(database|query|sql|orm|schema)\b/i,
      // Code quality
      /\b(performance|efficiency|scalable|maintainable)\b/i,
      /\b(security|vulnerability|sanitize|validate)\b/i,
      // Development context
      /\b(repository|repo|git|commit|branch|pull.*request)\b/i,
      /\b(deploy|production|staging|environment)\b/i
    ];
    
    // Check for multiple code indicators
    let codeScore = 0;
    for (const pattern of codeIndicators) {
      if (pattern.test(message)) {
        codeScore++;
      }
    }
    
    // If 3+ code indicators, determine specific code task type
    if (codeScore >= 3) {
      console.log(`[Coordinator] Code context detected (score: ${codeScore})`);
      
      // Determine specific code task based on action words
      if (message.match(/debug|fix|error|bug|issue|troubleshoot|broken|not.*working/i)) {
        return 'debugging';
      }
      if (message.match(/refactor|optimize|improve|clean|rewrite|better/i)) {
        return 'code_refactoring';
      }
      if (message.match(/review|check|audit|analyze.*code|look.*at.*code/i)) {
        return 'code_review';
      }
      if (message.match(/test|testing|unit.*test|integration.*test|spec/i)) {
        return 'test_generation';
      }
      if (message.match(/security|vulnerability|exploit|sanitize|validate|safe/i)) {
        return 'security_audit';
      }
      if (message.match(/algorithm|complex.*logic|reasoning|optimization|efficient/i)) {
        return 'code_reasoning';
      }
      if (message.match(/quick|fast|simple|basic|prototype|draft|rapid/i)) {
        return 'code_generation_fast';
      }
      
      // Default to high-quality code generation
      return 'code_generation';
    }
    
    // Security audit (check before code_review to catch security-specific requests)
    if (message.match(/security|vulnerability|vulnerabilities|exploit|penetration/i)) {
      return 'security_audit';
    }
    
    // Fast code generation (quick/simple tasks)
    if (message.match(/quick|fast|simple|basic|prototype|draft|rapid/i) && 
        message.match(/code|function|script|implement/i)) {
      return 'code_generation_fast';
    }
    
    // Reasoning-heavy coding (complex logic/algorithms)
    if (message.match(/algorithm|complex.*logic|optimize.*algorithm|reasoning.*code|think.*through.*code|step.*by.*step.*code/i) && 
        message.match(/code|implement|solve|design/i)) {
      return 'code_reasoning';
    }
    
    // Code tasks (order matters - most specific first)
    if (message.match(/review.*code|code.*review|check.*code|audit.*code/i)) {
      return 'code_review';
    }
    if (message.match(/refactor|optimize.*code|improve.*code|clean.*up.*code/i)) {
      return 'code_refactoring';
    }
    if (message.match(/debug|fix.*bug|error|issue.*with.*code/i)) {
      return 'debugging';
    }
    if (message.match(/generate.*code|write.*code|create.*function|implement/i)) {
      return 'code_generation';
    }
    if (message.match(/test|unit.*test|integration.*test|write.*test/i)) {
      return 'test_generation';
    }
    
    // Design & Architecture
    if (message.match(/design.*system|architecture|scalable|microservice/i)) {
      return 'system_design';
    }
    if (message.match(/database.*design|schema|table.*structure|erd/i)) {
      return 'database_design';
    }
    if (message.match(/design.*ui|design.*interface|mockup|wireframe/i)) {
      return 'ui_design';
    }
    
    // Documentation (check before backend to catch "write documentation")
    if (message.match(/write.*document|create.*document|document|readme|write.*doc/i)) {
      return 'documentation';
    }
    
    // API Design (check before backend_development)
    if (message.match(/design.*api|rest.*api.*design|api.*endpoint.*design/i)) {
      return 'api_design';
    }
    
    // Frontend/Backend
    if (message.match(/frontend|react|vue|component|ui component/i)) {
      return 'frontend_development';
    }
    if (message.match(/backend|server|build.*api|create.*api|endpoint|route/i)) {
      return 'backend_development';
    }
    
    // Web Research (check before general reasoning)
    if (message.match(/search|research|find.*information|look.*up|browse|web/i)) {
      return 'web_research';
    }
    
    // Math & Reasoning
    if (message.match(/calculate|solve|math|equation|formula/i)) {
      return 'mathematical_reasoning';
    }
    if (message.match(/analyze|reason|think|complex.*problem/i)) {
      return 'complex_reasoning';
    }
    
    // Data Generation (before data_analysis)
    if (message.match(/create.*excel|generate.*excel|make.*excel|excel.*file/i) ||
        message.match(/create.*csv|generate.*csv|make.*csv|csv.*file/i) ||
        message.match(/create.*spreadsheet|generate.*spreadsheet|make.*spreadsheet/i) ||
        message.match(/create.*json|generate.*json|make.*json|json.*file/i) ||
        message.match(/generate.*list|create.*list|make.*list.*of/i) ||
        message.match(/generate.*data|create.*data.*file|structured.*data/i)) {
      return 'data_generation';
    }
    
    // Data Analysis
    if (message.match(/analyze.*data|data.*analysis|insights|trends|visualize.*data/i)) {
      return 'data_analysis';
    }
    
    // Creative & Storytelling (specific keyword fallback)
    // Note: Context-aware detection happens earlier, this catches explicit creative requests
    if (message.match(/write.*story|creative.*writing|storytelling|narrative|fiction|novel|character.*dialogue|poem|poetry|rap|song|lyrics|verse|rhyme|haiku|limerick|creative.*text/i)) {
      return 'creative_writing';
    }
    if (message.match(/brainstorm|hypothetical|what.*if|imagine|scenario|creative.*ideas/i)) {
      return 'brainstorming';
    }
    if (message.match(/roleplay|role.*play|act.*as|pretend.*you.*are|character.*simulation/i)) {
      return 'roleplay';
    }
    
    // Intelligent fallback routing - Grace makes smart decisions when uncertain
    return this.intelligentFallbackRouting(userMessage);
  }

  /**
   * Intelligent fallback routing when Grace can't confidently categorize the request
   * Analyzes request characteristics and routes to the most capable specialist
   * Ensures 90%+ chance of routing to a specialist rather than general chat
   */
  intelligentFallbackRouting(userMessage) {
    const message = userMessage.toLowerCase();
    
    console.log('[Coordinator] Using intelligent fallback routing for ambiguous request...');
    
    // Analyze request complexity and characteristics
    const complexity = this.analyzeComplexity(message);
    const hasCodeKeywords = /\b(code|function|class|variable|syntax|programming|development|script|algorithm)\b/i.test(message);
    const hasCreativeKeywords = /\b(write|create|make|generate|design|build|craft)\b/i.test(message);
    const hasAnalysisKeywords = /\b(analyze|explain|understand|help|how|why|what|compare|review)\b/i.test(message);
    const hasDataKeywords = /\b(data|file|document|spreadsheet|list|export|save)\b/i.test(message);
    const isQuestion = /\?|how|what|why|when|where|can you|do you|will you|should/i.test(message);
    
    // Intelligent routing decision tree (90%+ specialist routing)
    
    // 1. Code-related but ambiguous -> Route to best code specialist
    if (hasCodeKeywords || message.includes('debug') || message.includes('fix')) {
      console.log('[Coordinator] Code-related ambiguous request → routing to code_generation');
      return 'code_generation'; // Claude Sonnet 4.5 - best for code
    }
    
    // 2. Creative but ambiguous -> Route to creative specialist  
    if (hasCreativeKeywords && !hasCodeKeywords) {
      console.log('[Coordinator] Creative ambiguous request → routing to creative_writing');
      return 'creative_writing'; // Mythomax - specialized for creativity
    }
    
    // 3. Data/file related -> Route to data specialist
    if (hasDataKeywords) {
      console.log('[Coordinator] Data-related ambiguous request → routing to data_generation');
      return 'data_generation'; // Qwen - excellent for structured data
    }
    
    // 4. Complex analysis/reasoning needed -> Route to reasoning specialist
    if (complexity.isComplex || hasAnalysisKeywords) {
      console.log('[Coordinator] Complex reasoning needed → routing to complex_reasoning');
      return 'complex_reasoning'; // GLM-4 Plus - strong reasoning
    }
    
    // 5. Question about capabilities/help -> Route to general but with best model
    if (isQuestion && (message.includes('can you') || message.includes('do you') || message.includes('help'))) {
      console.log('[Coordinator] Capability question → routing to general_chat with premium model');
      return 'general_chat'; // Will use Claude Sonnet 4.5 fallback
    }
    
    // 6. Ultimate fallback - Route to Claude Sonnet 4.5 (most capable general model)
    // This ensures Grace almost never handles complex requests herself
    console.log('[Coordinator] Ultimate fallback → routing to complex_reasoning (Claude Sonnet 4.5)');
    return 'complex_reasoning'; // Claude Sonnet 4.5 fallback - handles anything
  }
  
  /**
   * Analyze request complexity to help with intelligent routing
   */
  analyzeComplexity(message) {
    const complexityIndicators = {
      longRequest: message.length > 100,
      multipleSteps: (message.match(/and|then|also|plus|additionally/g) || []).length >= 2,
      technicalTerms: /\b(algorithm|architecture|implementation|optimization|performance|scalability|integration|framework|library|database|api|backend|frontend)\b/i.test(message),
      businessTerms: /\b(strategy|analysis|report|presentation|proposal|requirements|specification|workflow|process)\b/i.test(message),
      complexQuestions: /\b(how.*work|why.*happen|what.*difference|compare.*between|pros.*cons|advantages.*disadvantages)\b/i.test(message)
    };
    
    const complexityScore = Object.values(complexityIndicators).filter(Boolean).length;
    
    return {
      isComplex: complexityScore >= 2,
      score: complexityScore,
      indicators: complexityIndicators
    };
  }

  /**
   * Get routing config for a task type
   */
  getRouting(taskType) {
    // Check custom routing first (user preferences)
    if (this.customRouting[taskType]) {
      return this.customRouting[taskType];
    }
    
    // Use default routing
    return SPECIALIST_ROUTING[taskType] || DEFAULT_ROUTING;
  }

  /**
   * Call a specialist model using Grace's existing LLM infrastructure
   */
  async callSpecialist(modelPath, systemPrompt, userMessage, options = {}) {
    try {
      // Parse model path (e.g., "openai/gpt-4o" or "openrouter/anthropic/claude-3-opus")
      const parts = modelPath.split('/');
      const provider = parts[0];
      const modelName = parts.slice(1).join('/');
      
      console.log(`[Specialist] Calling ${modelPath} for task...`);
      
      // Create model string for Grace's LLM system
      const model = `provider#${provider}#${modelName}`;
      
      // Get streaming callback if provided
      const onTokenStream = options.onTokenStream || (() => {});
      
      // Create LLM instance with streaming support
      const llm = await createLLMInstance(model, onTokenStream, {});
      
      // CRITICAL: Prepend MASTER_SYSTEM_PROMPT to ensure Grace's identity and capabilities are always present
      const { MASTER_SYSTEM_PROMPT } = require('@src/agent/prompt/MASTER_SYSTEM_PROMPT');
      const fullSystemPrompt = `${MASTER_SYSTEM_PROMPT}\n\n---\n\n${systemPrompt}`;
      
      // Build context - use existing messages if provided, otherwise create new
      let contextMessages;
      if (options.messages && options.messages.length > 0) {
        // Use existing conversation history, but replace/prepend system prompt
        contextMessages = [...options.messages];
        // Replace first message if it's a system message, otherwise prepend
        if (contextMessages[0]?.role === 'system') {
          contextMessages[0] = { role: 'system', content: fullSystemPrompt };
        } else {
          contextMessages.unshift({ role: 'system', content: fullSystemPrompt });
        }
      } else {
        // No conversation history, create simple context
        contextMessages = [
          { role: 'system', content: fullSystemPrompt },
          { role: 'user', content: userMessage }
        ];
      }
      
      const context = { messages: contextMessages };
      
      // Call the model with streaming
      const result = await llm.completion('', context, {
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 4000,
        stream: !!options.onTokenStream // Enable streaming if callback provided
      });
      
      return result;
      
    } catch (error) {
      console.error(`[Specialist] Error calling ${modelPath}:`, {
        message: error.message,
        stack: error.stack,
        modelPath
      });
      
      // Return a graceful error response instead of throwing
      // This prevents the entire task from failing
      return {
        error: true,
        message: `Specialist call failed: ${error.message}`,
        fallback_needed: true
      };
    }
  }

  /**
   * Execute task with automatic specialist routing
   */
  async execute(userMessage, options = {}) {
    // Detect task type
    const taskType = this.detectTaskType(userMessage);
    console.log(`[Coordinator] Detected task type: ${taskType}`);
    
    // Get routing config
    const routing = this.getRouting(taskType);
    console.log(`[Coordinator] Using model: ${routing.primary}`);
    
    try {
      // Try primary specialist
      const result = await this.callSpecialist(
        routing.primary,
        routing.systemPrompt,
        userMessage,
        options
      );
      
      // Check if specialist returned an error (graceful failure)
      if (result.error && result.fallback_needed) {
        console.log(`[Coordinator] Primary specialist failed gracefully, trying fallback: ${routing.fallback}`);
        throw new Error(result.message); // Trigger fallback
      }
      
      const executionReport = this.generateExecutionReport({
        taskType,
        specialist: routing.primary,
        modelName: this.getModelDisplayName(routing.primary),
        usedFallback: false
      });
      
      return {
        success: true,
        result: result,
        specialist: routing.primary,
        taskType: taskType,
        executionReport
      };
      
    } catch (primaryError) {
      console.log(`[Coordinator] Primary failed, trying fallback: ${routing.fallback}`);
      
      try {
        // Try fallback specialist
        const result = await this.callSpecialist(
          routing.fallback,
          routing.systemPrompt,
          userMessage,
          options
        );
        
        const executionReport = this.generateExecutionReport({
          taskType,
          specialist: routing.fallback,
          modelName: this.getModelDisplayName(routing.fallback),
          usedFallback: true
        });
        
        return {
          success: true,
          result: result,
          specialist: routing.fallback,
          taskType: taskType,
          usedFallback: true,
          executionReport
        };
        
      } catch (fallbackError) {
        console.error('[Coordinator] Both primary and fallback failed');
        throw new Error('All specialists failed to respond');
      }
    }
  }

  /**
   * Multi-agent collaboration for complex tasks
   * Grace breaks down task and delegates to multiple specialists
   */
  async collaborate(userMessage, subtasks) {
    const results = [];
    
    for (const subtask of subtasks) {
      console.log(`[Collaboration] Working on: ${subtask.description}`);
      
      const routing = this.getRouting(subtask.type);
      
      try {
        const result = await this.callSpecialist(
          routing.primary,
          routing.systemPrompt,
          subtask.prompt,
          subtask.options || {}
        );
        
        results.push({
          subtask: subtask.description,
          result: result,
          specialist: routing.primary
        });
        
      } catch (error) {
        console.error(`[Collaboration] Subtask failed: ${subtask.description}`);
        results.push({
          subtask: subtask.description,
          error: error.message,
          specialist: routing.primary
        });
      }
    }
    
    return results;
  }

  /**
   * Grace asks a specialist for help (conversational)
   */
  async askSpecialist(taskType, question) {
    const routing = this.getRouting(taskType);
    
    console.log(`[Grace → ${routing.primary}] ${question}`);
    
    try {
      const response = await this.callSpecialist(
        routing.primary,
        routing.systemPrompt,
        question
      );
      
      console.log(`[${routing.primary} → Grace] Response received`);
      
      return response;
      
    } catch (error) {
      console.log(`[Grace] ${routing.primary} couldn't help, trying ${routing.fallback}...`);
      
      const response = await this.callSpecialist(
        routing.fallback,
        routing.systemPrompt,
        question
      );
      
      return response;
    }
  }

  /**
   * Detect if task is complex enough to require multi-agent collaboration
   */
  detectComplexity(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Complex patterns that benefit from multiple specialists
    const complexPatterns = [
      // Full-stack development
      /build.*full.*stack/i,
      /create.*complete.*system/i,
      /entire.*application/i,
      /end.*to.*end/i,
      
      // Authentication & Security
      /implement.*authentication/i,
      /build.*auth.*system/i,
      /secure.*login/i,
      /user.*management.*system/i,
      
      // Complex features
      /build.*dashboard/i,
      /create.*admin.*panel/i,
      /implement.*payment/i,
      /build.*api.*with.*frontend/i,
      
      // Multi-component tasks
      /database.*and.*api/i,
      /frontend.*and.*backend/i,
      /ui.*and.*logic/i,
      
      // Explicit complexity indicators
      /complex/i,
      /comprehensive/i,
      /production.*ready/i,
      /enterprise/i
    ];
    
    return complexPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Decompose complex task into subtasks for different specialists
   */
  async decomposeTask(userMessage) {
    console.log('[Coordinator] Decomposing complex task...');
    
    // Use GPT-4o to intelligently break down the task
    const decompositionPrompt = `
You are Grace AI's task coordinator. Break down this complex request into specific subtasks for specialist models.

User Request: "${userMessage}"

Analyze the request and create a list of subtasks. For each subtask, specify:
1. type: The specialist type (e.g., 'database_design', 'backend_development', 'frontend_development', 'security_audit', 'test_generation')
2. description: Brief description of what needs to be done
3. prompt: Specific prompt for that specialist
4. dependencies: Array of subtask indices this depends on (empty if none)

Available specialist types:
- code_generation, code_generation_fast, code_reasoning, code_review, code_refactoring, debugging
- database_design, system_design, api_design
- frontend_development, ui_design, backend_development
- test_generation, security_audit, documentation
- complex_reasoning, mathematical_reasoning, data_analysis, data_generation, web_research

Return ONLY a JSON array of subtasks. Example:
[
  {
    "type": "database_design",
    "description": "Design database schema",
    "prompt": "Design a database schema for user authentication with...",
    "dependencies": []
  },
  {
    "type": "backend_development",
    "description": "Build API endpoints",
    "prompt": "Create REST API endpoints for...",
    "dependencies": [0]
  }
]
`;

    try {
      const llm = await createLLMInstance('provider#openai#gpt-4o', () => {}, {});
      const result = await llm.completion('', {
        messages: [
          { role: 'system', content: 'You are a task decomposition expert. Return only valid JSON.' },
          { role: 'user', content: decompositionPrompt }
        ]
      }, { temperature: 0.3, max_tokens: 2000 });
      
      // Parse JSON response
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const subtasks = JSON.parse(jsonMatch[0]);
        console.log(`[Coordinator] Decomposed into ${subtasks.length} subtasks`);
        return subtasks;
      }
      
      // Fallback: simple decomposition
      return this.simpleDecomposition(userMessage);
      
    } catch (error) {
      console.error('[Coordinator] Task decomposition failed:', error.message);
      return this.simpleDecomposition(userMessage);
    }
  }

  /**
   * Simple fallback decomposition if LLM decomposition fails
   */
  simpleDecomposition(userMessage) {
    const message = userMessage.toLowerCase();
    const subtasks = [];
    
    // Detect what's needed
    if (message.match(/database|schema|table/i)) {
      subtasks.push({
        type: 'database_design',
        description: 'Design database schema',
        prompt: `Design a database schema for: ${userMessage}`,
        dependencies: []
      });
    }
    
    if (message.match(/api|endpoint|backend|server/i)) {
      subtasks.push({
        type: 'backend_development',
        description: 'Build backend API',
        prompt: `Build backend API for: ${userMessage}`,
        dependencies: subtasks.length > 0 ? [0] : []
      });
    }
    
    if (message.match(/frontend|ui|interface|component/i)) {
      subtasks.push({
        type: 'frontend_development',
        description: 'Build frontend UI',
        prompt: `Build frontend UI for: ${userMessage}`,
        dependencies: []
      });
    }
    
    if (message.match(/test|testing/i) || subtasks.length > 0) {
      subtasks.push({
        type: 'test_generation',
        description: 'Generate tests',
        prompt: `Generate comprehensive tests for: ${userMessage}`,
        dependencies: Array.from({ length: subtasks.length }, (_, i) => i)
      });
    }
    
    if (message.match(/security|secure|auth/i)) {
      subtasks.push({
        type: 'security_audit',
        description: 'Security review',
        prompt: `Review security implications of: ${userMessage}`,
        dependencies: Array.from({ length: subtasks.length }, (_, i) => i)
      });
    }
    
    return subtasks.length > 0 ? subtasks : [{
      type: 'code_generation',
      description: 'Generate code',
      prompt: userMessage,
      dependencies: []
    }];
  }

  /**
   * Execute with automatic complexity detection and collaboration
   */
  async executeWithCollaboration(userMessage, options = {}) {
    const isComplex = this.detectComplexity(userMessage);
    
    if (!isComplex || options.forceSimple) {
      // Simple task - use single specialist
      console.log('[Coordinator] Simple task detected, using single specialist');
      return this.execute(userMessage, options);
    }
    
    // Complex task - use multi-agent collaboration
    console.log('[Coordinator] Complex task detected, using multi-agent collaboration');
    
    try {
      // Decompose task
      const subtasks = await this.decomposeTask(userMessage);
      
      // Execute with collaboration
      const results = await this.collaborate(userMessage, subtasks);
      
      // Synthesize results
      const synthesis = await this.synthesizeResults(userMessage, results);
      
      return {
        success: true,
        result: synthesis,
        mode: 'multi-agent',
        subtasks: results,
        taskType: 'complex_collaboration'
      };
      
    } catch (error) {
      console.error('[Coordinator] Multi-agent collaboration failed, falling back to single specialist');
      return this.execute(userMessage, options);
    }
  }

  /**
   * Synthesize results from multiple specialists into coherent response
   */
  async synthesizeResults(originalRequest, subtaskResults) {
    console.log('[Coordinator] Synthesizing results from multiple specialists...');
    
    const synthesisPrompt = `
You are Grace AI. You coordinated multiple specialist models to solve a complex task. Now synthesize their work into a coherent, complete solution.

Original Request: "${originalRequest}"

Specialist Results:
${subtaskResults.map((r, i) => `
${i + 1}. ${r.subtask} (by ${r.specialist}):
${r.result}
${r.error ? `ERROR: ${r.error}` : ''}
`).join('\n')}

Create a comprehensive, well-organized response that:
1. Integrates all specialist contributions
2. Shows how components work together
3. Provides clear implementation steps
4. Includes any warnings or considerations
5. Maintains consistency across all parts

Be thorough but concise. Format with clear sections.
`;

    try {
      const llm = await createLLMInstance('provider#openrouter#anthropic/claude-sonnet-4.5', () => {}, {});
      const synthesis = await llm.completion('', {
        messages: [
          { role: 'system', content: 'You are Grace AI, synthesizing multi-specialist results into a coherent solution.' },
          { role: 'user', content: synthesisPrompt }
        ]
      }, { temperature: 0.5, max_tokens: 4000 });
      
      return synthesis;
      
    } catch (error) {
      console.error('[Coordinator] Synthesis failed:', error.message);
      
      // Fallback: simple concatenation
      return subtaskResults.map(r => 
        `## ${r.subtask}\n\n${r.result || r.error}\n\n`
      ).join('');
    }
  }

  /**
   * Generate human-readable execution report
   */
  generateExecutionReport(info) {
    const { taskType, specialist, modelName, usedFallback } = info;
    
    const report = {
      taskType,
      specialist,
      modelName,
      usedFallback,
      timestamp: new Date().toISOString(),
      humanReadable: `**Task Execution Report:**
- **Task Type:** ${taskType}
- **Model Used:** ${modelName}
- **Specialist:** ${specialist}${usedFallback ? ' (fallback)' : ' (primary)'}
- **Timestamp:** ${new Date().toLocaleString()}`
    };
    
    // Store in context for Grace to reference
    if (this.context) {
      this.context.lastExecutionReport = report;
    }
    
    return report;
  }

  /**
   * Get friendly model display name
   */
  getModelDisplayName(modelPath) {
    const modelMap = {
      'openrouter/deepseek/deepseek-r1': 'DeepSeek R1 (Reasoning)',
      'openrouter/deepseek/deepseek-coder': 'DeepSeek Coder',
      'openrouter/deepseek/deepseek-chat': 'DeepSeek Chat',
      'openrouter/anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
      'openrouter/anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
      'openrouter/openai/gpt-4o': 'GPT-4o',
      'openrouter/openai/gpt-4o-mini': 'GPT-4o Mini',
      'openrouter/google/gemini-2.0-flash-thinking-exp': 'Gemini 2.0 Flash (Thinking)',
      'openrouter/qwen/qwen-2.5-coder-32b-instruct': 'Qwen 2.5 Coder 32B',
      'provider#openrouter#anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5'
    };
    
    return modelMap[modelPath] || modelPath;
  }

  /**
   * Get execution report for user
   */
  getLastExecutionReport() {
    return this.context?.lastExecutionReport || null;
  }
}

module.exports = MultiAgentCoordinator;
