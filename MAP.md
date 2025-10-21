# 📄 GRACE AI - FILE/DOCUMENT DELIVERY ARCHITECTURE MAP

> **The Complete Chain: Every Link Must Match**

---

## 🎯 THE 7-STAGE PIPELINE

### **STAGE 1: Intent Detection** 🔍
```
User Input: "Create a Word doc with red text"
    ↓
📂 src/agent/intent-detection/index.js
    ↓
Detection Result: task_type = 'data_generation'
```

---

### **STAGE 2: Specialist Routing** 🧭
```
📂 src/agent/auto-reply/index.js
    ↓
Calls → MultiAgentCoordinator.execute()
    ↓
📂 src/agent/specialists/MultiAgentCoordinator.js
    ↓
Routes to → GPT-4o (data_generation specialist)
    ↓
⚠️  CRITICAL: For tool-requiring tasks (data_generation, code_generation)
    Returns: result.result (plain string)
    NOT: { handledBySpecialist: true }
    
    Why: AgenticAgent checks if reply is an object with handledBySpecialist
          Since it's just a string, AgenticAgent continues to planning!
    
    For non-tool tasks (general_chat, analysis):
    Returns: { handledBySpecialist: true, result: "..." }
          This stops execution after specialist response
```

---

### **STAGE 3: Planning** 📋
```
📂 src/agent/AgenticAgent.js → run()
    ↓
Calls → planning(goal, options)
    ↓
📂 src/agent/planning/index.js
    ↓
Creates Task Array:
    [
      {
        id: "task_001",
        requirement: "Create Word document with 'Love' in red text",
        tool: "file_generator"
      }
    ]
    ↓
Publishes to Frontend:
    onTokenStream({
      action_type: 'plan',
      status: 'success',
      json: tasks  ← Frontend displays task list
    })
```

---

### **STAGE 4: Task Execution** ⚙️
```
📂 src/agent/AgenticAgent.js → _executeTasks()
    ↓
For each task:
    📂 src/agent/code-act/code-act.js → completeCodeAct()
        ↓
    Calls → thinking(requirement, context)
        ↓
    📂 src/agent/code-act/thinking.js
        ↓
    LLM Returns XML:
        <write_code>
          <filename>love.docx</filename>
          <content>...</content>
          <language>docx</language>
        </write_code>
        ↓
    Parsed Action:
        {
          type: 'write_code',
          params: {
            filename: 'love.docx',
            content: '...',
            language: 'docx'
          }
        }
```

---

### **STAGE 5: Tool Execution → File Creation** 🛠️
```
📂 src/runtime/LocalRuntime.js → execute_action()
    ↓
Switch: case 'write_code'
    ↓
Calls → write_code(action, uuid, user_id)
    ↓
📂 src/editor/coding.js → write_code()
    ↓
Calls → FileGenerator.execute()
    ↓
📂 src/tools/FileGenerator.js
    ↓
Creates Physical File:
    📁 /workspace/user_1/Conversation_XXX/love.docx
    ↓
Returns Result Object:
    {
      status: 'success',
      content: 'File /workspace/.../love.docx written successfully.',
      meta: {
        action_type: 'file',  ← CRITICAL for download link
        filepath: '/workspace/.../love.docx',
        url: '/workspace/.../love.docx',
        filename: 'love.docx'
      }
    }
```

---

### **STAGE 6: Message Publishing** 📤
```
📂 src/agent/AgenticAgent.js → _publishMessage()
    ↓
Sends to Stream:
    onTokenStream({
      role: 'assistant',
      status: 'success',
      action_type: 'file',  ← MUST match meta.action_type
      content: 'File written successfully.',
      meta: {
        filepath: '/workspace/.../love.docx',
        url: '/workspace/.../love.docx',  ← Frontend uses this
        filename: 'love.docx'
      }
    })
    ↓
📂 src/utils/stream.util.js
    ↓
Processing:
    JSON.stringify(msg) → Base64 encode → SSE stream
```

---

### **STAGE 7: Frontend Rendering** 🎨
```
📂 frontend/src/view/chat/components/Message/Index.vue
    ↓
Receives & Decodes:
    Base64 → JSON → Message Object
    ↓
Checks:
    if (message.action_type === 'file')
    ↓
Renders:
    <FileMessage>
      <a :href="message.meta.url" download>
        📄 love.docx - Download
      </a>
    </FileMessage>
```

---

## 🔗 CRITICAL MATCHING POINTS

### **✅ Match Point 1: Specialist Response**
```javascript
// For TOOL-REQUIRING tasks (data_generation, code_generation):

// ❌ WRONG - Blocks file creation
return { handledBySpecialist: true, result: "..." }

// ✅ CORRECT - Allows planning to continue
if (needsTools) {
  return result.result;  // Just the string, NOT an object
}

// For NON-TOOL tasks (general_chat, analysis):
return { handledBySpecialist: true, result: "..." }  // ✅ This is correct
```

### **✅ Match Point 2: Action Type**
```javascript
// Tool returns:
meta: { action_type: 'file' }

// Message MUST have:
action_type: 'file'  ← Frontend checks this!
```

### **✅ Match Point 3: File Path Format**
```javascript
// Tool creates:
filepath: '/workspace/user_1/Conversation_XXX/love.docx'

// Message MUST have:
meta: {
  filepath: '/workspace/user_1/Conversation_XXX/love.docx',
  url: '/workspace/user_1/Conversation_XXX/love.docx',  ← Same path
  filename: 'love.docx'
}
```

### **✅ Match Point 4: Message Object Structure**
```javascript
// Backend sends:
{
  role: 'assistant',
  action_type: 'file',
  content: 'File written...',
  meta: { filepath, url, filename }
}

// Frontend expects:
message.action_type === 'file'
message.meta.url  ← For download link
message.meta.filename  ← For display
```

---

## 🚨 COMMON BREAK POINTS

### **❌ Break Point 1: Specialist Blocks Execution**
```
Problem: Specialist returns { handledBySpecialist: true } for file tasks
Effect:  AgenticAgent stops execution before planning/file creation
Fix:     For tool-requiring tasks, return just the string (result.result)
         NOT an object with handledBySpecialist property
         
Code:    if (needsTools) { return result.result; }
```

### **❌ Break Point 2: Action Type Mismatch**
```
Problem: Tool returns action_type: 'write_code', message has action_type: 'task'
Effect:  Frontend doesn't render download link
Fix:     Must match action_type: 'file' throughout
```

### **❌ Break Point 3: Missing File Metadata**
```
Problem: Message has content but no meta.url
Effect:  Frontend can't create download link
Fix:     Must include full meta object with filepath/url/filename
```

### **❌ Break Point 4: Wrong Message Format**
```
Problem: Sending just content string instead of full object
Effect:  Frontend shows "Expected Array, got Object" error
Fix:     Must send complete message object with all fields
```

---

## ✅ VERIFICATION CHECKLIST

**For file delivery to work, verify ALL of these:**

- [ ] Specialist returns plain string (NOT object with `handledBySpecialist: true`)
- [ ] Planning creates task with `tool: 'file_generator'`
- [ ] Thinking returns XML with `<write_code>` action
- [ ] FileGenerator.execute() creates physical file
- [ ] Tool returns `meta.action_type = 'file'`
- [ ] Message published with `action_type: 'file'`
- [ ] Message includes `meta: { filepath, url, filename }`
- [ ] Frontend receives full message object
- [ ] Frontend renders download link from `meta.url`

---

## 🎯 THE GOLDEN RULE

> **Every link in this chain must match the contract!**
> 
> One broken link = entire delivery fails

**Contract Format:**
```javascript
{
  role: 'assistant',
  status: 'success',
  action_type: 'file',  // MUST match throughout
  content: 'File written successfully.',
  meta: {
    action_type: 'file',  // MUST match parent
    filepath: '/workspace/...',
    url: '/workspace/...',  // MUST be accessible
    filename: 'file.ext'
  }
}
```

---

## 💡 TECHNICAL INSIGHT: The String vs Object Pattern

**Why does auto-reply return different types?**

```javascript
// In src/agent/auto-reply/index.js (lines 54-65):

if (needsTools) {
  // Return JUST the string - AgenticAgent continues to planning
  return result.result;  // Type: string
}

// For non-tool tasks:
return {
  handledBySpecialist: true,  // AgenticAgent stops here
  result: result.result,
  specialist: result.specialist
};  // Type: object
```

**How AgenticAgent decides to continue:**

```javascript
// In src/agent/AgenticAgent.js (line 116):

if (reply && typeof reply === 'object' && reply.handledBySpecialist) {
  // Specialist handled it completely - STOP
  await this._publishMessage({ ... });
  return reply;
}

// If reply is a string, this check fails → continues to planning!
```

**The Pattern:**
- **String return** = "Specialist provided initial response, but continue to planning/tools"
- **Object with `handledBySpecialist: true`** = "Specialist completed everything, stop here"

This elegant pattern allows the same routing system to handle both simple chat and complex file-generation tasks! 🎯

---

**Last Updated:** 2025-01-20  
**Status:** ✅ All fixes applied & MAP verified 100% accurate  
**Commit:** `a92b1da`
