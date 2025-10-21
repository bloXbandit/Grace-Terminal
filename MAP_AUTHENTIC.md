# 🗺️ GRACE AI - AUTHENTIC MESSAGE FLOW MAP

**Source:** Code analysis + Type definitions + Actual logs  
**Purpose:** Show exact data structures and connections from backend → frontend  
**Last Updated:** 2025-01-20

---

## 📐 TYPE DEFINITIONS (Source of Truth)

### **Backend Message Structure** (`src/utils/message.js`)

```typescript
interface Message {
  role: 'user' | 'assistant';
  uuid: string;
  status: 'success' | 'failure' | 'running';
  content: string;
  comments: string;
  memorized: string | boolean;
  timestamp: number;
  type: string;
  meta: {
    pid: string;
    task_id: string | null;
    action_type: 'plan' | 'task' | 'auto_reply' | 'finish' | 'search' | 
                  'file' | 'terminal' | 'todo' | 'browser' | 'question' | 
                  'finish_summery' | 'progress' | 'write_code' | 'read_file' |
                  'terminal_run' | 'error' | 'stop' | 'coding' | 'update_status';
    filepath: string;
    url: string;
    json: Array<any>;
    content: string;
    is_active: boolean;
  };
}
```

### **Action Structure** (`types/LocalRuntime.d.ts`)

```typescript
interface Action {
  type: string;  // e.g., 'write_code', 'terminal_run', 'read_file'
  params: Record<string, any>;
}

interface ActionResult {
  uuid?: string;
  status: 'success' | 'failure' | string;
  content: string;
  error?: any;
  memorized?: boolean;
  meta?: {
    action_type?: string;
    filepath?: string;
    url?: string;
    [key: string]: any;
  };
}
```

---

## 🔄 COMPLETE MESSAGE FLOW (8 Stages)

### **STAGE 1: User Request → Conversation**
```
📂 src/routers/agent/run.js (POST /api/agent/run)
    ↓
Input: { goal: string, conversation_id: string, mode: string }
    ↓
Creates: AgenticAgent instance
    ↓
Calls: agent.run(goal, options)
```

**Message Sent:**
```javascript
{
  role: 'user',
  content: goal,
  timestamp: Date.now()
}
```

---

### **STAGE 2: Auto Reply → Specialist Routing**
```
📂 src/agent/AgenticAgent.js → run()
    ↓
Calls: auto_reply(goal, context)
    ↓
📂 src/agent/auto-reply/index.js
    ↓
Detects task type (e.g., 'data_generation')
    ↓
Calls: coordinator.execute(goal)
    ↓
📂 src/agent/specialists/MultiAgentCoordinator.js
    ↓
Routes to specialist (e.g., openrouter/qwen/qwen3-coder-30b-a3b-instruct)
```

**Returns (for tool-requiring tasks):**
```javascript
// Just a string, NOT an object
return result.result;  // Type: string
```

**Returns (for non-tool tasks):**
```javascript
return {
  handledBySpecialist: true,
  result: string,
  specialist: string,
  taskType: string
};
```

**Critical Check in AgenticAgent.js (line 116):**
```javascript
if (reply && typeof reply === 'object' && reply.handledBySpecialist) {
  // Stop here - specialist handled everything
  await this._publishMessage({ action_type: 'auto_reply', status: 'success', content: reply.result });
  return reply;
}
// If reply is a string → continue to planning
```

---

### **STAGE 3: Planning**
```
📂 src/agent/AgenticAgent.js → run()
    ↓
Calls: planning(goal, options)
    ↓
📂 src/agent/planning/index.js
    ↓
LLM generates task breakdown
    ↓
Returns: Array of tasks
```

**Task Structure:**
```javascript
{
  id: string,           // e.g., "1760985720_0001"
  title: string,
  description: string,
  requirement: string,
  status: 'pending' | 'running' | 'completed'
}
```

**Message Published:**
```javascript
{
  role: 'assistant',
  uuid: '',
  status: 'success',
  content: '',
  meta: {
    action_type: 'plan',
    json: [tasks],  // Array of task objects
    is_active: true
  }
}
```

---

### **STAGE 4: Task Execution Loop**
```
📂 src/agent/AgenticAgent.js → run()
    ↓
For each task:
    ↓
Calls: code_act(task.requirement, context)
    ↓
📂 src/agent/code-act/code-act.js
    ↓
Calls: thinking(requirement, context)
    ↓
📂 src/agent/code-act/thinking.js
```

**Thinking Flow:**
```javascript
if (context.enableSpecialistRouting) {
  try {
    const result = await context.coordinator.execute(prompt, options);
    content = result.result || result.content || result;
  } catch (error) {
    // Fallback to default model
    content = await call(prompt, conversation_id, 'assistant', options);
  }
} else {
  content = await call(prompt, conversation_id, 'assistant', options);
}
```

**Returns:** XML string with action
```xml
<write_code>
  <path>/workspace/user_1/Conversation_XXX/file.docx</path>
  <content>File content here</content>
</write_code>
```

---

### **STAGE 5: Action Parsing**
```
📂 src/agent/code-act/code-act.js
    ↓
Calls: resolveActions(content)
    ↓
📂 src/utils/resolve.js
    ↓
Parses XML → Action object
```

**Action Object Created:**
```javascript
{
  type: 'write_code',  // Extracted from XML tag name
  params: {
    path: '/workspace/user_1/Conversation_XXX/file.docx',
    content: 'File content here'
  }
}
```

---

### **STAGE 6: Runtime Execution**
```
📂 src/agent/code-act/code-act.js
    ↓
Calls: runtime.execute_action(action, context)
    ↓
📂 src/runtime/LocalRuntime.js (or DockerRuntime.js)
    ↓
switch (action.type) {
  case 'write_code':
    result = await this.write_code(action, uuid);
    break;
}
    ↓
📂 src/runtime/utils/tools.js → write_code()
```

**write_code() Returns:**
```javascript
{
  uuid: string,
  status: 'success',
  content: 'File /workspace/.../file.docx written successfully.',
  meta: {
    action_type: 'write_code',  // ← NOT 'file'!
    filepath: '/workspace/user_1/Conversation_XXX/file.docx'
  }
}
```

**LocalRuntime.js Formats Message (line 127):**
```javascript
const msg = Message.format({
  status: result.status,
  memorized: result.memorized || '',
  content: result.content || '',
  action_type: type,  // ← This is 'write_code'
  task_id: task_id,
  uuid: uuid || '',
  url: meta_url,
  json: meta_json,
  filepath: meta_file_path,
  meta_content: meta_content
});
```

**Message Published:**
```javascript
{
  role: 'assistant',
  uuid: 'xxx-xxx-xxx',
  status: 'success',
  content: 'File /workspace/.../file.docx written successfully.',
  meta: {
    action_type: 'write_code',  // ← Individual file creation
    filepath: '/workspace/user_1/Conversation_XXX/file.docx',
    task_id: '1760985720_0001',
    is_active: true
  }
}
```

---

### **STAGE 7: Task Completion Tracking**
```
📂 src/agent/AgenticAgent.js → run()
    ↓
After each task completes:
    ↓
Collects files from task results
    ↓
Adds to newFiles array
```

**File Object Structure:**
```javascript
{
  filepath: string,
  filename: string,  // Extracted from filepath
  url: string,       // Same as filepath for local files
  content: string    // Optional
}
```

---

### **STAGE 8: Final Summary (File Delivery)**
```
📂 src/agent/AgenticAgent.js → run()
    ↓
After ALL tasks complete:
    ↓
Calls: summary(goal, conversation_id, tasks, newFiles, staticUrl)
    ↓
📂 src/agent/summary/index.js
    ↓
Generates summary content
    ↓
Returns: Summary text
    ↓
AgenticAgent publishes finish_summery message
```

**Message Published (line 172):**
```javascript
await this._publishMessage({
  uuid: uuidv4(),
  action_type: 'finish_summery',  // ← THIS is what frontend shows!
  status: 'success',
  content: summaryContent,
  json: newFiles  // ← Array of ALL files created
});
```

**Complete Message Structure:**
```javascript
{
  role: 'assistant',
  uuid: 'xxx-xxx-xxx',
  status: 'success',
  content: 'Task completed successfully. Created 2 files...',
  meta: {
    action_type: 'finish_summery',  // ← Frontend checks this!
    json: [
      {
        filepath: '/workspace/user_1/Conversation_XXX/file1.docx',
        filename: 'file1.docx',
        url: '/workspace/user_1/Conversation_XXX/file1.docx'
      },
      {
        filepath: '/workspace/user_1/Conversation_XXX/file2.pdf',
        filename: 'file2.pdf',
        url: '/workspace/user_1/Conversation_XXX/file2.pdf'
      }
    ],
    is_active: true
  }
}
```

---

## 🎨 FRONTEND EXPECTATIONS

### **Message Component** (`frontend/src/view/lemon/message/Message.vue`)

**Action Type Handlers:**
```javascript
// Line 4-31: Conditional rendering based on action_type
v-if="message?.meta?.action_type === 'plan'"          → Shows Planing component
v-else-if="message?.meta?.action_type === 'update_status'" → Shows loading
v-else-if="message?.meta?.action_type === 'coding'"  → Shows CodingMessage
v-else-if="message?.meta?.action_type === 'stop'"    → Shows stop icon
v-else-if="message?.meta?.action_type === 'error'"   → Shows error message
v-else                                                → Shows Markdown content
```

**File List Display (line 66-68):**
```javascript
const showFiles = computed(() => {
  const actions = new Set(["finish_summery", "question", "progress", "chat"]);
  return actions.has(props.message?.meta?.action_type);
});
```

**✅ Files ONLY show when `action_type` is:**
- `finish_summery` ← **PRIMARY file delivery method**
- `question`
- `progress`
- `chat`

**❌ Files DO NOT show for:**
- `write_code` (individual file creation messages)
- `file` (not used in actual code)

---

### **MessageFileList Component** (`frontend/src/components/MessageFileList/index.vue`)

**Expected Data Structure:**
```javascript
props: {
  message: {
    meta: {
      json: [  // ← Array of file objects
        {
          filepath: string,
          filename: string,  // Auto-extracted from filepath if missing
          url: string
        }
      ]
    }
  }
}
```

**File Display Logic (line 52-67):**
```javascript
const list = computed(() => {
  const json = props.message?.meta?.json;
  if (!json) return [];
  
  let files = JSON.parse(JSON.stringify(json));
  if (files && Array.isArray(files)) {
    for (const file of files) {
      if (file.filepath) {
        file.filename = file.filepath.split("/").pop();
      } else {
        file.filename = file.name || "";
      }
    }
    return files;
  }
  return files;
});
```

---

## 🔗 CRITICAL MATCHING POINTS

### **Match Point 1: Specialist Response Type**
```javascript
// For tool-requiring tasks (data_generation, code_generation):
if (needsTools) {
  return result.result;  // ✅ String - allows planning to continue
}

// For non-tool tasks (general_chat, analysis):
return {
  handledBySpecialist: true,  // ✅ Object - stops execution
  result: result.result
};
```

### **Match Point 2: Action Type Flow**
```javascript
// Individual file creation:
action_type: 'write_code'  // ← Not shown in UI

// Final delivery:
action_type: 'finish_summery'  // ← THIS shows files in UI
json: [array of files]
```

### **Match Point 3: File Object Structure**
```javascript
// Backend creates:
{
  filepath: '/workspace/user_1/Conversation_XXX/file.docx',
  url: '/workspace/user_1/Conversation_XXX/file.docx',
  content: 'optional'
}

// Frontend expects:
{
  filepath: string,  // Required
  filename: string,  // Auto-extracted if missing
  url: string        // Required for download
}
```

### **Match Point 4: Message Meta Structure**
```javascript
// Backend sends (Message.format):
meta: {
  pid: string,
  task_id: string | null,
  action_type: string,
  filepath: string,
  url: string,
  json: Array<any>,
  content: string,
  is_active: boolean
}

// Frontend expects (Message.vue):
message?.meta?.action_type  // Must match known types
message?.meta?.json         // Array for file lists
```

---

## 🚨 COMMON BREAK POINTS

### **Break Point 1: Specialist Blocks Execution**
```
Problem: Specialist returns { handledBySpecialist: true } for file tasks
Effect:  AgenticAgent stops before planning
Fix:     Return plain string for tool-requiring tasks
Code:    if (needsTools) { return result.result; }
```

### **Break Point 2: Missing API Keys**
```
Problem: process.env.OPENAI_API_KEY is undefined in container
Effect:  Specialist calls fail with 401 Unauthorized
Fix:     Add env_file: - .env to docker-compose.yml
Status:  ✅ FIXED
```

### **Break Point 3: Action Type Mismatch**
```
Problem: Using action_type: 'file' but frontend expects 'finish_summery'
Effect:  Files don't show in UI
Fix:     Use 'finish_summery' for final file delivery
```

### **Break Point 4: Missing File Metadata**
```
Problem: File object missing filepath or url
Effect:  Frontend can't render download link
Fix:     Ensure { filepath, url } in file objects
```

### **Break Point 5: Invalid Message Format**
```
Problem: Sending string instead of message object
Effect:  Frontend shows "Expected Array, got Object" error
Fix:     Always send complete message object with role, meta, etc.
```

---

## ✅ VERIFICATION CHECKLIST

**For file delivery to work:**

- [ ] Specialist returns plain string for tool-requiring tasks
- [ ] API keys loaded in container (check with `docker exec grace-app printenv`)
- [ ] Planning creates tasks successfully
- [ ] Thinking returns XML with `<write_code>` action
- [ ] Runtime executes write_code and creates physical file
- [ ] File added to newFiles array with { filepath, url }
- [ ] After all tasks complete, finish_summery message published
- [ ] finish_summery includes `meta.json` array with all files
- [ ] Frontend receives message with `action_type: 'finish_summery'`
- [ ] MessageFileList component renders file download links

---

## 📊 ROUTING & HANDLERS

### **Backend Routes**
```
POST /api/agent/run → src/routers/agent/run.js
  ↓
AgenticAgent.run()
  ↓
auto_reply() → MultiAgentCoordinator.execute()
  ↓
planning() → LLM generates tasks
  ↓
code_act() → thinking() → LLM generates actions
  ↓
runtime.execute_action() → Executes write_code, etc.
  ↓
_publishMessage() → Sends to frontend via onTokenStream
```

### **Frontend Handlers**
```
WebSocket/SSE receives message
  ↓
store/modules/chat.js → Adds to messages array
  ↓
Message.vue → Renders based on action_type
  ↓
MessageFileList.vue → Shows files from meta.json
```

---

**Status:** ✅ All fixes applied, API keys loaded, ready for testing  
**Next:** Test document creation to verify complete flow
