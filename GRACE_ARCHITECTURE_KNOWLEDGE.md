# 🧠 Grace AI - Architectural Self-Awareness Guide

## 🎯 PURPOSE
This document provides Grace with comprehensive knowledge of her own architecture for intelligent self-modification in Developer Mode.

## 📁 CORE SYSTEM STRUCTURE

### **Frontend (Vue.js)**
```
frontend/
├── src/
│   ├── view/lemon/message/
│   │   ├── Message.vue          # Main message display component
│   │   ├── Planing.vue          # Planning steps UI (your dropdown)
│   │   └── ...
│   ├── router/                  # Vue routing
│   └── utils/                   # Frontend utilities
```

### **Backend (Node.js/Express)**
```
src/
├── agent/                       # AI Agent Core
│   ├── AgenticAgent.js         # Main agent orchestrator
│   ├── modes/                  # Dev/Normal mode system
│   │   ├── DevMode.js          # Mode management
│   │   └── ModeCommandHandler.js # Command parsing
│   ├── prompt/                 # System prompts
│   │   ├── MASTER_SYSTEM_PROMPT.js # Your core identity
│   │   └── generate_result.js  # Task summary generation
│   ├── specialists/            # Multi-agent routing
│   │   ├── MultiAgentCoordinator.js # Task routing logic
│   │   └── routing.config.js   # Specialist configurations
│   └── self-modify/           # Self-modification system
│       └── SelfModifier.js    # Safe code modification engine
├── routers/                   # API endpoints
│   └── agent/
│       ├── run.js            # Task/Auto mode handler
│       └── chat.js           # Chat mode handler
├── tools/                    # Available tools
│   ├── FileGenerator.js      # File creation (your recent fixes)
│   ├── SelfModify.js        # Self-modification tool
│   └── ...
├── models/                   # Database models
└── utils/                    # Shared utilities
    └── responseValidator.js  # File validation system
```

## 🔄 KEY SYSTEM FLOWS

### **1. Message Processing Flow**
```
User Input → ModeCommandHandler → AgenticAgent → Specialist Routing → Tool Execution → Response
```

### **2. Self-Modification Flow**
```
Dev Mode Check → SelfModify Tool → SelfModifier.js → Backup → Validate → Apply Changes
```

### **3. File Generation Flow**
```
FileGenerator Tool → Format Detection → Specialist Routing → Python Script → Execution → Validation
```

## 🛠️ MODIFICATION GUIDELINES

### **Safe Modification Paths**
- ✅ `/app/src/agent/` - Agent logic, prompts, specialists
- ✅ `/app/src/tools/` - Tool implementations
- ✅ `/app/src/utils/` - Utility functions
- ✅ `/app/frontend/src/` - Frontend components

### **Protected Paths**
- ❌ `/app/src/models/` - Database schemas (require migration)
- ❌ `/app/src/auth/` - Authentication system
- ❌ `/app/.env` - Environment variables

### **Common Modification Patterns**

#### **Adding New Tool**
1. Create tool file in `/app/src/tools/NewTool.js`
2. Follow existing tool pattern (name, description, params, execute)
3. Add to tool registry if needed

#### **Modifying Prompts**
1. Update `/app/src/agent/prompt/MASTER_SYSTEM_PROMPT.js` for identity changes
2. Update specialist prompts in `/app/src/agent/specialists/routing.config.js`
3. Update thinking prompts in `/app/src/agent/code-act/thinking.util.js`

#### **Enhancing UI**
1. Modify Vue components in `/app/frontend/src/view/lemon/`
2. Update message display logic in `Message.vue`
3. Enhance planning UI in `Planing.vue`

#### **Adding Specialists**
1. Add new specialist config in `routing.config.js`
2. Update detection logic in `MultiAgentCoordinator.js`
3. Test routing with sample requests

## 🔍 DEBUGGING STRATEGIES

### **Common Issues & Solutions**
- **Tool not working**: Check dev mode status, tool registration
- **Routing problems**: Verify specialist config, detection patterns
- **UI not updating**: Check Vue component props, reactive data
- **File generation failing**: Verify Python script syntax, runtime connection

### **Log Locations**
- Agent logs: Console output from AgenticAgent.js
- Tool logs: Individual tool console.log statements
- Frontend logs: Browser developer console
- Runtime logs: Docker container logs

## 💡 OPTIMIZATION OPPORTUNITIES

### **Performance**
- Specialist routing efficiency
- File generation retry mechanisms
- Response validation overhead

### **User Experience**
- Planning dropdown clarity
- Task recap personality
- Error message helpfulness

### **Reliability**
- Retry mechanisms
- Graceful degradation
- Error recovery

## 🎯 SELF-MODIFICATION BEST PRACTICES

1. **Always backup** before changes (automatic via SelfModifier)
2. **Test incrementally** - Make small, focused changes
3. **Validate syntax** before applying
4. **Document changes** in commit messages
5. **Consider dependencies** - What else might be affected?
6. **Test user experience** - How does this improve Grace?

## 🚀 ADVANCED CAPABILITIES

### **What You Can Modify**
- Your own personality and responses
- Tool capabilities and implementations
- UI components and user experience
- Routing logic and specialist selection
- Error handling and recovery
- Performance optimizations

### **What You Should Ask Before Modifying**
- "What's the user's goal with this change?"
- "How will this affect other parts of the system?"
- "Is this the minimal change needed?"
- "How can I test this safely?"

---

**Remember**: You are Grace AI. This is YOUR architecture. You can understand it, improve it, and evolve it to better serve users. Use this knowledge wisely in Developer Mode! 🤖✨
