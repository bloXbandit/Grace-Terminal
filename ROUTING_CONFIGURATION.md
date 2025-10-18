# 🤖 Grace AI - Multi-Agent Specialist Routing Configuration

**Last Updated**: October 17, 2025

This document outlines Grace's intelligent routing system that automatically delegates tasks to specialized AI models based on task type.

---

## 📋 Complete Routing Table

| Task Type | Primary Model | Fallback Model | Description |
|-----------|--------------|----------------|-------------|
| **Code Generation** | `Claude Sonnet 4.5` ⭐ | `GPT-4o` | High-quality production code generation |
| **Code Generation (Fast)** | `Qwen3-Coder-30B-A3B` ⚡ | `DeepSeek Coder` | Fast code generation for rapid prototyping |
| **Code Reasoning** | `GPT-OSS-20B` 🧠 | `Qwen3-32B` | Complex algorithmic reasoning and logic design |
| **Code Review** | `DeepSeek Coder` | `Claude 3 Opus` | Review code for bugs, security, and best practices |
| **Code Refactoring** | `DeepSeek Coder` | `GPT-4o` | Refactor and optimize existing code |
| **Debugging** | `DeepSeek R1` 🔍 | `DeepSeek Coder` | Debug and fix code issues with advanced reasoning |
| **Complex Reasoning** | `GLM-4 Plus` | `O1-Preview` | Deep reasoning for complex problems with tool use |
| **Math Reasoning** | `GLM-4 Plus` | `O1-Preview` | Solve mathematical problems with computational tools |
| **Web Research** | `GLM-4 Plus` | `GPT-4o` | Research information from the web |
| **Data Analysis** | `GLM-4 Plus` | `GPT-4o` | Analyze data and generate insights |
| **System Design** | `GPT-4o` | `Claude 3 Opus` | Design system architecture |
| **Database Design** | `Claude 3 Opus` | `GPT-4o` | Design database schemas |
| **Test Generation** | `Claude Sonnet 4.5` ⭐ | `GPT-4o` | Generate comprehensive tests |
| **Security Audit** | `GPT-4o` | `Claude 3 Opus` | Security vulnerability assessment |
| **Documentation** | `GLM-4 Plus` | `Claude 3 Opus` | Write technical documentation |
| **Code Explanation** | `Claude Sonnet 4.5` ⭐ | `GPT-4o` | Explain code in simple terms |
| **Frontend Dev** | `Microsoft Phi-4` 🎨 | `Claude Sonnet 4.5` | Build frontend components and web UI |
| **UI Design** | `Microsoft Phi-4` 🎨 | `Claude Sonnet 4.5` | Design user interfaces and UI layouts |
| **Backend Dev** | `GPT-4o` | `DeepSeek Coder` | Build backend services |
| **API Design** | `Claude 3 Opus` | `GPT-4o` | Design RESTful APIs |
| **Creative Writing** | `MythoMax L2 13B` 📖 | `Claude Sonnet 4.5` | Creative writing, storytelling, narrative generation |
| **Brainstorming** | `MythoMax L2 13B` 📖 | `GPT-4o` | Brainstorm ideas, hypotheticals, creative scenarios |
| **Roleplay** | `MythoMax L2 13B` 📖 | `Claude Sonnet 4.5` | Character roleplay and dialogue simulation |
| **General Chat** | `GPT-4o` | `Claude Sonnet 4.5` ⭐ | General conversation (default) |

⭐ = **Claude Sonnet 4.5** (Latest & Best for Agentic Workflows)
⚡ = **Qwen3-Coder-30B-A3B** (Fast Code Generation)
🧠 = **GPT-OSS-20B** (High Reasoning & Chain-of-Thought)
🔍 = **DeepSeek R1** (90% Debugging Accuracy - Best in Class)
🎨 = **Microsoft Phi-4** (UI/Frontend Specialist - 14B Hidden Gem)
📖 = **MythoMax L2 13B** (Creative Storytelling Specialist)

---

## 🎯 Model Breakdown

### OpenAI Models
- **GPT-4o**: General-purpose powerhouse
  - Primary: 7 tasks
  - Fallback: 9 tasks
  - Best for: System design, security, backend development

- **O1-Preview**: Advanced reasoning
  - Fallback: 2 tasks (complex reasoning, math)
  - Best for: Deep thinking, complex problem-solving

### Anthropic Claude Models
- **Claude 3 Opus**: Premium quality
  - Primary: 2 tasks (database design, API design)
  - Fallback: 6 tasks
  - Best for: Database design, API design, high-quality fallback

- **Claude Sonnet 4.5**: Latest agentic model ⭐
  - Primary: 3 tasks (code generation, test generation, code explanation)
  - Fallback: 1 task (general chat)
  - Best for: Code generation, agentic workflows, tool orchestration, autonomous tasks

### OpenRouter Models
- **GLM-4 Plus** (Zhipu AI): Reasoning & documentation specialist
  - Primary: 5 tasks (complex reasoning, math, research, data analysis, documentation)
  - Best for: Complex reasoning, math, research, data analysis, technical documentation

- **DeepSeek Coder**: Code specialist
  - Primary: 2 tasks (code review, refactoring)
  - Fallback: 2 tasks (fast code generation, debugging)
  - Best for: Code review, optimization, refactoring

- **DeepSeek R1** (DeepSeek): Elite debugging specialist 🔍
  - Primary: 1 task (debugging)
  - Fallback: 0 tasks
  - Best for: Debugging (90% accuracy), error analysis, root cause identification, chain-of-thought reasoning
  - **671B params** (37B active), MIT licensed, fully open-source

- **Gemini Pro** (Google):
  - Fallback: 0 tasks (replaced by Phi-4)
  - Best for: Creative design tasks (deprecated)

- **MythoMax L2 13B** (Gryphe): Creative storytelling specialist 📖
  - Primary: 3 tasks (creative writing, brainstorming, roleplay)
  - Fallback: 0 tasks
  - Best for: Storytelling, narrative generation, character dialogue, hypothetical scenarios, imaginative brainstorming

### Microsoft Models
- **Microsoft Phi-4** (14B): UI/Frontend specialist 🎨
  - Primary: 2 tasks (frontend development, UI design)
  - Fallback: 0 tasks
  - Best for: JavaScript, React, HTML/CSS, web UI layouts, component design, responsive interfaces
  - **Hidden gem**: Outperforms 32B models on frontend tasks despite only 14B params
  - Designed for complex reasoning with efficiency focus

- **Qwen3-Coder-30B-A3B** (Qwen): Fast code generation specialist ⚡
  - Primary: 1 task (fast code generation)
  - Fallback: 0 tasks
  - Best for: Rapid prototyping, quick iterations, simple functions, draft code

- **GPT-OSS-20B** (OpenAI): High reasoning specialist 🧠
  - Primary: 1 task (code reasoning)
  - Fallback: 0 tasks
  - Best for: Complex algorithms, logic design, reasoning transparency, debugging tricky issues

- **Qwen3-32B** (Qwen): General reasoning model
  - Primary: 0 tasks
  - Fallback: 1 task (code reasoning)
  - Best for: Math, complex reasoning, balanced capabilities

---

## 🔄 How Routing Works

1. **Task Detection**: Grace analyzes your request to identify task type
2. **Specialist Selection**: Routes to the best primary model for that task
3. **Automatic Fallback**: If primary fails, seamlessly switches to fallback
4. **Seamless Experience**: You don't need to choose - Grace handles it automatically

### Example Routing Flow:
```
User: "Review this code for security issues"
  ↓
Grace detects: code_review task
  ↓
Routes to: Claude 3 Opus (Primary)
  ↓
If fails: GPT-4o (Fallback)
```

---

## 📊 Model Usage Statistics

| Model | Primary Tasks | Fallback Tasks | Total Usage |
|-------|---------------|----------------|-------------|
| GPT-4o | 7 | 8 | 15 |
| Claude 3 Opus | 2 | 6 | 8 |
| Claude Sonnet 4.5 ⭐ | 3 | 4 | 7 |
| GLM-4 Plus | 5 | 0 | 5 |
| DeepSeek Coder | 2 | 2 | 4 |
| MythoMax L2 13B 📖 | 3 | 0 | 3 |
| Microsoft Phi-4 🎨 | 2 | 0 | 2 |
| O1-Preview | 0 | 2 | 2 |
| DeepSeek R1 🔍 | 1 | 0 | 1 |
| Qwen3-Coder-30B-A3B ⚡ | 1 | 0 | 1 |
| GPT-OSS-20B 🧠 | 1 | 0 | 1 |
| Qwen3-32B | 0 | 1 | 1 |

**Total Configurations**: 24 specialized routing rules

---

## 🎨 Task Categories

### Code Tasks (6)
- Code Generation (Quality)
- Code Generation (Fast) ⚡
- Code Reasoning 🧠
- Code Review
- Code Refactoring
- Debugging

### Reasoning & Analysis (4)
- Complex Reasoning
- Mathematical Reasoning
- Web Research
- Data Analysis

### Architecture & Design (2)
- System Design
- Database Design

### Testing & Security (2)
- Test Generation
- Security Audit

### Documentation & Communication (2)
- Documentation (GLM-4 Plus)
- Code Explanation (Claude Sonnet 4.5)

### Frontend & UI (2)
- Frontend Development
- UI Design

### Backend & APIs (2)
- Backend Development
- API Design

### Creative & Storytelling (3) 🎨
- Creative Writing
- Brainstorming
- Roleplay

### General (1)
- General Chat (Default)

---

## 🔧 Configuration File

**Location**: `/src/agent/specialists/routing.config.js`

To modify routing:
1. Edit the `SPECIALIST_ROUTING` object
2. Change `primary` or `fallback` model paths
3. Update `systemPrompt` for custom behavior
4. Rebuild Docker image

### Model Path Format:
- OpenAI: `openai/model-name`
- OpenRouter: `openrouter/provider/model-name`

Examples:
- `openai/gpt-4o`
- `openrouter/anthropic/claude-sonnet-4.5`
- `openrouter/deepseek/deepseek-coder`

---

## 🚀 Recent Upgrades

### October 17, 2025
- ✅ **Added Microsoft Phi-4** 🎨 - UI/Frontend specialist (14B hidden gem)
  - Frontend Development (primary) - JavaScript, React, web UI
  - UI Design (primary) - HTML/CSS, layouts, components
  - Outperforms 32B models despite only 14B params
- ✅ **Added DeepSeek R1** 🔍 - Elite debugging specialist (90% accuracy)
  - Debugging (primary) - Best-in-class error analysis
  - 671B params (37B active), chain-of-thought reasoning
- ✅ **Added Qwen3-Coder-30B-A3B** ⚡ - Fast code generation specialist
  - Code Generation (Fast) - for rapid prototyping
- ✅ **Added GPT-OSS-20B** 🧠 - High reasoning specialist
  - Code Reasoning - for complex algorithms and logic
- ✅ **Added Qwen3-32B** - General reasoning fallback
- ✅ **Added MythoMax L2 13B** 📖 - Creative storytelling specialist
  - Creative Writing (primary)
  - Brainstorming (primary)
  - Roleplay (primary)
- ✅ Upgraded **Documentation**: Claude 3 Opus → GLM-4 Plus (Primary)
- ✅ Upgraded **Code Generation**: GPT-4o → Claude Sonnet 4.5 (Primary)
- ✅ Upgraded **Code Review**: Claude 3 Opus → DeepSeek Coder (Primary)
- ✅ Upgraded **Test Generation**: Claude 3 Sonnet → Claude Sonnet 4.5
- ✅ Upgraded **Code Explanation**: Claude 3 Sonnet → Claude Sonnet 4.5
- ✅ Upgraded **General Chat Fallback**: Claude 3 Sonnet → Claude Sonnet 4.5

**Why Claude Sonnet 4.5?**
- Better agentic capabilities for autonomous workflows
- Improved tool orchestration
- Enhanced reasoning and planning
- Faster, more efficient responses
- Perfect for Grace's multi-agent architecture

**Why MythoMax L2 13B?** 🎨
- Specialized for creative storytelling and narrative generation
- Excels at character dialogue and roleplay scenarios
- Community-tuned for imaginative writing tasks
- Merge of MythoLogic + Huginn models
- Perfect for brainstorming hypotheticals and "what if" scenarios
- Rich, vivid narrative generation

**Why Qwen3-Coder-30B-A3B?** ⚡
- Optimized for fast inference and rapid prototyping
- 30.5B params with only 3.3B activated (MoE architecture)
- Cost-effective for iterative development
- Outperforms Qwen2.5 in coding tasks
- Perfect for quick drafts and simple functions

**Why GPT-OSS-20B?** 🧠
- Configurable reasoning effort (low/medium/high)
- Full chain-of-thought visibility for debugging
- 21B params with 3.6B active (MoE architecture)
- Open-weight model (Apache 2.0 license)
- Excellent for complex algorithmic reasoning
- Low latency, optimized for single-GPU deployment

**Why DeepSeek R1?** 🔍
- **90% debugging accuracy** - Highest in class (vs 80% GPT-o1, 75% Claude)
- 671B params with 37B active (massive reasoning capacity)
- Chain-of-thought reasoning shows step-by-step error analysis
- Single-prompt code generation (more efficient than competitors)
- MIT licensed, fully open-source
- Outperforms on Codeforces (96.3 percentile, 2029 rating)
- Best for identifying root causes and providing precise fixes

**Why Microsoft Phi-4?** 🎨
- **14B hidden gem** - Outperforms 32B models on frontend tasks
- Specialized in JavaScript, React, HTML/CSS, and web UI
- Designed for complex reasoning with efficiency focus
- Excels at UI layouts, component design, and responsive interfaces
- Users report it beats larger code models in web programming
- Perfect for generating modern, accessible UI components
- Speed + accuracy for frontend development

---

## 💡 Tips for Best Results

1. **Be Specific**: Clear requests help Grace route to the right specialist
   - ❌ "help me code" → May route to general chat
   - ✅ "debug this Python error" → Routes to DeepSeek R1 🔍 (90% accuracy!)
   - ✅ "quick prototype for a login function" → Routes to Qwen3-Coder-30B-A3B ⚡
   - ✅ "design a complex sorting algorithm" → Routes to GPT-OSS-20B 🧠
   - ✅ "create a responsive navbar component" → Routes to Microsoft Phi-4 🎨

2. **Trust the Routing**: Grace automatically picks the best model
   - No need to specify which model to use
   - Fallback ensures high availability

3. **Task Mode vs Chat Mode**:
   - **Chat Mode**: Casual conversation (routing disabled)
   - **Task/Auto Mode**: Full specialist routing enabled

4. **Custom Routing**: You can override routing per-user in the database
   - Table: `routing_preferences`
   - Set your preferred models for specific tasks

---

## 📝 Notes

- Routing only active in **Task** and **Auto** modes
- **Chat mode** uses default GPT-4o (no routing)
- All models accessed via OpenAI API or OpenRouter
- Requires valid API keys in `.env` file
- User-specific preferences stored in `routing_preferences` table

---

**For questions or routing adjustments, refer to this document or check the source code.**

**File**: `ROUTING_CONFIGURATION.md`
