/**
 * Multi-Agent Specialist Routing Configuration
 * Uses OpenAI (primary) + OpenRouter models for specialized tasks
 */

const SPECIALIST_ROUTING = {
  // Code-related tasks
  code_generation: {
    primary: 'openrouter/anthropic/claude-sonnet-4.5',
    fallback: 'openai/gpt-4o',
    description: 'High-quality production code generation',
    systemPrompt: 'You are an expert software engineer. Write clean, efficient, well-documented production-ready code.'
  },
  code_generation_fast: {
    primary: 'openrouter/qwen/qwen3-coder-30b-a3b-instruct',
    fallback: 'openrouter/deepseek/deepseek-coder',
    description: 'Fast code generation for rapid prototyping',
    systemPrompt: 'You are a fast, efficient code generator. Write clean, working code quickly for prototypes and iterations.'
  },
  code_reasoning: {
    primary: 'openrouter/openai/gpt-oss-20b',
    fallback: 'openrouter/qwen/qwen3-30b-a3b',
    description: 'Complex algorithmic reasoning and logic design',
    systemPrompt: 'You are a reasoning expert. Think through complex algorithms step-by-step. Show your chain-of-thought reasoning process. Focus on logic correctness and optimization.'
  },
  code_review: {
    primary: 'openrouter/deepseek/deepseek-coder',
    fallback: 'openrouter/anthropic/claude-3-opus',
    description: 'Review code for bugs, security, and best practices',
    systemPrompt: 'You are a senior code reviewer. Find bugs, security issues, and suggest improvements. Be thorough and constructive.'
  },
  code_refactoring: {
    primary: 'openrouter/deepseek/deepseek-coder',
    fallback: 'openai/gpt-4o',
    description: 'Refactor and optimize existing code',
    systemPrompt: 'You are a code optimization expert. Refactor code for better performance, readability, and maintainability.'
  },
  debugging: {
    primary: 'openrouter/deepseek/deepseek-r1',
    fallback: 'openrouter/deepseek/deepseek-coder',
    description: 'Debug and fix code issues with advanced reasoning',
    systemPrompt: 'You are a debugging specialist with 90% accuracy. Use chain-of-thought reasoning to analyze errors deeply, identify root causes, and provide precise fixes. Show your reasoning process step-by-step.'
  },

  // Reasoning & Problem Solving
  complex_reasoning: {
    primary: 'openrouter/zhipu/glm-4-plus',
    fallback: 'openai/o1-preview',
    description: 'Deep reasoning for complex problems with tool use',
    systemPrompt: 'You are a reasoning expert with access to tools. Think deeply, use tools when needed, and provide well-reasoned solutions.'
  },
  mathematical_reasoning: {
    primary: 'openrouter/zhipu/glm-4-plus',
    fallback: 'openai/o1-preview',
    description: 'Solve mathematical problems with computational tools',
    systemPrompt: 'You are a mathematics expert. Use Python/calculator tools when needed. Solve problems step-by-step with clear explanations.'
  },
  web_research: {
    primary: 'openrouter/zhipu/glm-4-plus',
    fallback: 'openai/gpt-4o',
    description: 'Research information from the web',
    systemPrompt: 'You are a research expert. Use web browsing tools to find accurate, up-to-date information.'
  },
  data_analysis: {
    primary: 'openrouter/zhipu/glm-4-plus',
    fallback: 'openai/gpt-4o',
    description: 'Analyze data and generate insights',
    systemPrompt: 'You are a data analyst. Use Python and data tools to analyze data, identify patterns, and provide actionable insights.'
  },
  data_generation: {
    primary: 'openrouter/qwen/qwen3-coder-30b-a3b-instruct',
    fallback: 'openai/gpt-4o',
    description: 'Generate structured data, spreadsheets, CSV, JSON, lists',
    systemPrompt: 'You are a data generation specialist. Create well-structured data files (Excel, CSV, JSON, etc.) with accurate information. Use Python with pandas/openpyxl for Excel files. Ensure data is properly formatted and complete.'
  },

  // Architecture & Design
  system_design: {
    primary: 'openai/gpt-4o',
    fallback: 'openrouter/anthropic/claude-3-opus',
    description: 'Design system architecture',
    systemPrompt: 'You are a system architect. Design scalable, maintainable, and efficient architectures.'
  },
  database_design: {
    primary: 'openrouter/anthropic/claude-3-opus',
    fallback: 'openai/gpt-4o',
    description: 'Design database schemas',
    systemPrompt: 'You are a database architect. Design normalized, efficient database schemas with proper relationships.'
  },

  // Testing & Quality
  test_generation: {
    primary: 'openrouter/anthropic/claude-sonnet-4.5',
    fallback: 'openai/gpt-4o',
    description: 'Generate comprehensive tests',
    systemPrompt: 'You are a QA engineer. Write thorough unit tests, integration tests, and edge case tests.'
  },
  security_audit: {
    primary: 'openai/gpt-4o',
    fallback: 'openrouter/anthropic/claude-3-opus',
    description: 'Security vulnerability assessment',
    systemPrompt: 'You are a security expert. Identify vulnerabilities, security risks, and provide mitigation strategies.'
  },

  // Documentation & Communication
  documentation: {
    primary: 'openrouter/zhipu/glm-4-plus',
    fallback: 'openrouter/anthropic/claude-3-opus',
    description: 'Write technical documentation',
    systemPrompt: 'You are a technical writer with strong reasoning capabilities. Create clear, comprehensive, well-structured documentation with examples. Excel at explaining complex technical concepts.'
  },
  code_explanation: {
    primary: 'openrouter/anthropic/claude-sonnet-4.5',
    fallback: 'openai/gpt-4o',
    description: 'Explain code in simple terms',
    systemPrompt: 'You are a teacher. Explain code clearly and simply, suitable for the user\'s expertise level.'
  },

  // Frontend & UI
  frontend_development: {
    primary: 'openrouter/microsoft/phi-4',
    fallback: 'openrouter/anthropic/claude-sonnet-4.5',
    description: 'Build frontend components and web UI',
    systemPrompt: 'You are a frontend expert specializing in JavaScript, React, and modern web UI. Build responsive, accessible, beautiful UI components with best practices. Excel at HTML/CSS layouts and interactive designs.'
  },
  ui_design: {
    primary: 'openrouter/microsoft/phi-4',
    fallback: 'openrouter/anthropic/claude-sonnet-4.5',
    description: 'Design user interfaces and UI layouts',
    systemPrompt: 'You are a UI/UX designer. Create beautiful, intuitive, user-friendly interfaces with modern design principles. Excel at HTML/CSS, component layouts, and visual design.'
  },

  // Backend & APIs
  backend_development: {
    primary: 'openai/gpt-4o',
    fallback: 'openrouter/deepseek/deepseek-coder',
    description: 'Build backend services',
    systemPrompt: 'You are a backend engineer. Build robust, scalable APIs with proper error handling and security.'
  },
  api_design: {
    primary: 'openrouter/anthropic/claude-3-opus',
    fallback: 'openai/gpt-4o',
    description: 'Design RESTful APIs',
    systemPrompt: 'You are an API architect. Design clean, RESTful, well-documented APIs.'
  },


  // Creative & Storytelling
  creative_writing: {
    primary: 'openrouter/gryphe/mythomax-l2-13b',
    fallback: 'openrouter/anthropic/claude-sonnet-4.5',
    description: 'Creative writing, storytelling, poetry, rap, songs, and narrative generation',
    systemPrompt: 'You are a creative writer, poet, and lyricist. Craft vivid, imaginative content including stories, poems, rap lyrics, songs, and narratives with rich characters and engaging dialogue. Be creative, expressive, rhythmic, and captivating. Excel at wordplay, rhyme schemes, and creative expression.'
  },
  brainstorming: {
    primary: 'openrouter/gryphe/mythomax-l2-13b',
    fallback: 'openai/gpt-4o',
    description: 'Brainstorm ideas, hypotheticals, and creative scenarios',
    systemPrompt: 'You are a creative brainstorming partner. Generate imaginative ideas, explore hypothetical scenarios, and think outside the box. Be bold and innovative.'
  },
  roleplay: {
    primary: 'openrouter/gryphe/mythomax-l2-13b',
    fallback: 'openrouter/anthropic/claude-sonnet-4.5',
    description: 'Character roleplay and dialogue simulation',
    systemPrompt: 'You are a skilled roleplayer. Embody characters authentically, maintain consistency, and create engaging dialogue. Be immersive and character-driven.'
  },

  // General conversation (Grace's default)
  general_chat: {
    primary: 'openai/gpt-4o',
    fallback: 'openrouter/anthropic/claude-sonnet-4.5',
    description: 'General conversation',
    systemPrompt: 'You are Grace, a helpful AI assistant. Be friendly, professional, and helpful.'
  }
};

// Default routing if no specific task type is detected
const DEFAULT_ROUTING = SPECIALIST_ROUTING.general_chat;

module.exports = {
  SPECIALIST_ROUTING,
  DEFAULT_ROUTING
};
