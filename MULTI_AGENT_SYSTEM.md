# Multi-Agent Specialist System

## Overview
Grace now has a **Multi-Agent Coordinator** that automatically routes tasks to specialist AI models based on task type. This enables Grace to leverage the strengths of different models (GPT-4o, Claude, DeepSeek, etc.) for optimal results.

## Architecture

### 1. **Specialist Routing** (`src/agent/specialists/routing.config.js`)
Defines which models are best for specific tasks:

- **Code Generation**: GPT-4o → DeepSeek Coder
- **Code Review**: Claude Opus → GPT-4o
- **Debugging**: DeepSeek Coder → GPT-4o
- **Testing**: Claude Sonnet → GPT-4o
- **System Design**: GPT-4o → Claude Opus
- **Database Design**: Claude Opus → GPT-4o
- **Math/Reasoning**: O1-Preview → Claude Opus
- **Documentation**: Claude Opus → GPT-4o
- **Security Audit**: GPT-4o → Claude Opus

### 2. **Multi-Agent Coordinator** (`src/agent/specialists/MultiAgentCoordinator.js`)
Handles:
- Task type detection
- Specialist routing
- Fallback handling
- Multi-agent collaboration
- Conversational delegation

### 3. **User Preferences** (`src/models/RoutingPreference.js`)
Users can customize which models to use for each task type via UI.

## How It Works

### Automatic Task Detection
```javascript
User: "Review this code for bugs"
  ↓
Grace detects: code_review
  ↓
Routes to: Claude Opus
  ↓
Returns: Detailed code review
```

### Multi-Agent Collaboration
```javascript
User: "Build a todo app"
  ↓
Grace (Coordinator):
  1. Database Design → Claude Opus
  2. Frontend Code → GPT-4o
  3. Backend API → GPT-4o
  4. Tests → Claude Sonnet
  5. Security Audit → GPT-4o
  ↓
Grace integrates all results
  ↓
Returns: Complete todo app
```

### Conversational Delegation
```javascript
Grace: "I need help optimizing this algorithm"
  ↓ Asks DeepSeek Coder
DeepSeek: "Here's an O(n) solution..."
  ↓
Grace: "Now I need tests for it"
  ↓ Asks Claude Sonnet
Claude: "Here are comprehensive tests..."
  ↓
Grace implements and validates
```

## API Usage

### Basic Usage
```javascript
const MultiAgentCoordinator = require('@src/agent/specialists/MultiAgentCoordinator');

const coordinator = new MultiAgentCoordinator({
  conversation_id: 'conv_123',
  user_id: 1
});

// Automatic routing
const result = await coordinator.execute("Review this code for bugs: ...");
// Routes to Claude Opus automatically

console.log(result.specialist); // "openrouter/anthropic/claude-3-opus"
console.log(result.result); // Code review response
```

### Multi-Agent Collaboration
```javascript
const subtasks = [
  {
    type: 'database_design',
    description: 'Design database schema',
    prompt: 'Design a schema for a todo app with users and tasks'
  },
  {
    type: 'frontend_development',
    description: 'Build React components',
    prompt: 'Create React components for the todo app'
  },
  {
    type: 'test_generation',
    description: 'Write tests',
    prompt: 'Write tests for the todo app'
  }
];

const results = await coordinator.collaborate(userMessage, subtasks);
// Each subtask routes to its specialist automatically
```

### Ask Specialist Directly
```javascript
// Grace asks a specific specialist for help
const response = await coordinator.askSpecialist(
  'code_review',
  'Is this function secure?'
);
```

## User Customization

Users can customize routing preferences in the UI:

1. Go to **Settings → Model Routing**
2. Select task type (e.g., "Code Review")
3. Choose primary model (e.g., "Claude Opus")
4. Choose fallback model (e.g., "GPT-4o")
5. Save preferences

Preferences are stored in `routing_preference` table and automatically loaded.

## Available Models

### OpenAI (Primary Driver)
- `openai/gpt-4o` - General purpose, excellent at most tasks
- `openai/o1-preview` - Deep reasoning, math, complex problems
- `openai/gpt-4o-mini` - Faster, cheaper alternative

### OpenRouter (Specialists via your API key)
- `openrouter/anthropic/claude-3-opus` - Best for code review, documentation
- `openrouter/anthropic/claude-3-sonnet` - Good balance of speed/quality
- `openrouter/deepseek/deepseek-coder` - Specialized for coding
- `openrouter/deepseek/deepseek-math` - Specialized for mathematics
- `openrouter/google/gemini-pro` - Multimodal, data analysis
- `openrouter/zhipu/glm-4-32b` - Chinese models, multilingual
- And 100+ more available via OpenRouter

## Benefits

1. **Better Results**: Each task uses the model best suited for it
2. **Cost Optimization**: Use cheaper models for simple tasks
3. **Reliability**: Automatic fallback if primary model fails
4. **Flexibility**: Users can customize routing preferences
5. **Scalability**: Easy to add new specialists
6. **Transparency**: Logs show which specialist handled each task

## Error Handling

- Primary model fails → Automatically tries fallback
- Both fail → Returns graceful error to user
- All errors logged internally (user never sees technical errors)
- Non-blocking: Won't break existing Grace functionality

## Future Enhancements

- [ ] UI for routing configuration
- [ ] Performance metrics per specialist
- [ ] Cost tracking per model
- [ ] A/B testing different routing strategies
- [ ] Learning from user feedback to improve routing
- [ ] Grace-to-Grace collaboration (two instances working together)

## Integration Status

✅ Routing configuration created
✅ Multi-Agent Coordinator built
✅ Database model for user preferences
✅ Uses existing LLM infrastructure
⏳ UI integration (next step)
⏳ Integration into main chat/task endpoints (next step)

## Next Steps

1. Build UI for routing preferences
2. Integrate coordinator into chat endpoint
3. Integrate coordinator into task endpoint
4. Add performance monitoring
5. Test with real tasks
