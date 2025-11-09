# Grace Request Flow Map
## Conversation ID: 0fd8c1e8-863f-4d63-93f5-08087bd7db4b

**Purpose:** Document the complete logic flow of how Grace processes user requests  
**Use Case:** QC all logic paths and code execution flows  
**Date:** 2025-11-09

---

## 📋 Table of Contents
1. [Request Entry Points](#request-entry-points)
2. [File Processing Flow](#file-processing-flow)
3. [Intent Classification](#intent-classification)
4. [Auto-Reply Logic](#auto-reply-logic)
5. [Specialist Routing](#specialist-routing)
6. [Tool Execution Flow](#tool-execution-flow)
7. [Response Generation](#response-generation)

---

## 1. Request Entry Points

### HTTP Endpoint
```
POST /api/agent/run
```

### Router Processing (`src/routers/agent/run.js`)

**Step 1: Extract Request Parameters**
```javascript
const { question, mode, agent_id } = ctx.request.body;
let { conversation_id, mcp_server_ids, fileIds } = ctx.request.body;
```

**Step 2: File Processing (Two-Phase)**

Phase 1 - Process New Uploads:
```
[Agent Router] fileIds from current message: [ 5 ]
[Agent Router] Processing 1 newly uploaded file(s)
[Agent Router] New files from DB: 1
```

Phase 2 - Load All Conversation Files:
```
[Agent Router] Total conversation files loaded: 1
[Agent Router] Files: lox.pdf
```

---

## 2. File Processing Flow

### File Upload Detection
```
Location: src/routers/agent/run.js:126-181
```

**Logic:**
1. Check if `fileIds` array has new uploads
2. If yes → Move files from temp to conversation folder
3. Load ALL files for this conversation from DB
4. Map to `newFiles` array with filepath info

**Code Path:**
```javascript
// STEP 1: Process newly uploaded files
if (Array.isArray(fileIds) && fileIds.length > 0) {
  for (const fileId of fileIds) {
    await File.update({ conversation_id }, { where: { id: fileId } });
  }
  // Move files to conversation folder
  const uploadDir = path.join(WORKSPACE_DIR, 'upload');
  const targetUploadDir = path.join(dir_path, 'upload');
  await fs.rename(srcPath, destPath);
}

// STEP 2: Load ALL conversation files
if (conversation_id) {
  files = await File.findAll({
    where: { conversation_id },
    order: [['create_at', 'DESC']]
  });
}
```

---

## 3. Intent Classification

### Mode Detection
```
Location: src/routers/agent/run.js:269-308
```

**Decision Tree:**
```
if (mode === 'auto') {
  → Run intent detection
  → Classify as 'chat' or 'agent'
} else {
  → Use user-specified mode
}
```

**Observed Behavior:**
- Mode defaults to 'agent' for task execution
- Intent classifier analyzes user question + context

---

## 4. Auto-Reply Logic

### Entry Point
```
Location: src/agent/auto-reply/index.js
Function: auto_reply()
```

### Decision Flow

**1. Mode Command Check**
```javascript
const modeCommandResult = await modeCommandHandler.handleCommand(goal, conversation_id);
if (modeCommandResult) return modeCommandResult.message;
```

**2. File Upload Detection**
```javascript
if (files && files.length > 0) {
  console.log(`[AutoReply] 📎 Detected ${files.length} uploaded file(s)`);
  const analyses = await analyzeFiles(files);
  for (let i = 0; i < files.length; i++) {
    files[i]._analysis = analyses[i];
  }
  return null; // Route to specialist
}
```

**3. Fast-Path Detection**
```javascript
// Obvious task patterns
if (obviousTaskPatterns.some(pattern => pattern.test(goal))) {
  return { needsExecution: true, specialist: 'fast-path' };
}

// File edit patterns
if (isFileEdit && hasRecentFiles) {
  return { needsExecution: true, taskType: 'file_modification' };
}
```

**Observed in Logs:**
```
[AutoReply] ⚡ Fast-path: File edit with existing files detected
```

**4. Specialist Routing Check**
```javascript
const coordinator = new MultiAgentCoordinator({ conversation_id, user_id });
const taskType = coordinator.detectTaskType(goal);

if (taskType !== 'general_chat') {
  const result = await coordinator.execute(goal, { messages, profileContext });
  return result;
}
```

---

## 5. Specialist Routing

### Coordinator Logic
```
Location: src/agent/specialists/MultiAgentCoordinator.js
```

### Routing Process

**Step 1: Build Context**
```
[Coordinator] Building routing context (legacy mode)
[Coordinator] Found 2 files in conversation
```

**Step 2: Task Type Detection**
```
[Coordinator] Detected task type: complex_reasoning
```

**Step 3: Model Selection**
```
[Coordinator] Using model: openrouter/z-ai/glm-4.6
```

**Step 4: Fallback Logic**
```
[Coordinator] Using intelligent fallback routing for ambiguous request...
[Coordinator] Ultimate fallback → routing to complex_reasoning (Claude Sonnet 4.5)
```

### Specialist Execution

**File Context Injection:**
```
[Specialist] Calling openrouter/z-ai/glm-4.6 for task...
[Specialist] Adding file context: 3 files found
```

**Filename Extraction:**
```
[Specialist] Extracted planned filename: mold_making_guide_updated.docx
```

**Response:**
```
[Specialist] openrouter/z-ai/glm-4.6 returned: {
  // Contains planned actions/code
}
```

---

## 6. Tool Execution Flow

### Execution Entry
```
Location: src/agent/AgenticAgent.js → CodeAct
```

### Observed Execution Sequence

**Example Request: "great.. could you also add a red star ?"**

**Routing:**
```
[AutoReply] Routing to specialist: complex_reasoning
[Coordinator] Detected task type: complex_reasoning
[Specialist] Calling openrouter/z-ai/glm-4.6
```

**Tool Execution Attempt 1:**
```javascript
Action: terminal_run
Command: python3 import docx; from docx.shared import RGBColor; ...
Status: FAILURE
Error: syntax error near unexpected token `('
```

**Retry Logic:**
```
[Coordinator] Building routing context (legacy mode)
[Coordinator] Found 2 files in conversation
```

**Tool Execution Attempt 2:**
```javascript
Action: write_code
File: add_red_star.py
Status: SUCCESS
```

**Tool Execution Attempt 3:**
```javascript
Action: terminal_run
Command: python3 add_red_star.py
Status: SUCCESS
```

### Code Act Execution
```
Location: src/agent/code-act
```

**Action Types:**
- `write_code` - Write Python/shell scripts
- `terminal_run` - Execute commands
- `file` - File operations

**Execution Pattern:**
```
[CodeAct] Executing action type: terminal_run
action terminal_run
{ uuid, status: 'running', content: command, meta: { action_type } }
[Runtime] 📄 Sending heartbeat for document generation
{ uuid, status: 'success', content: output }
[CodeAct] Action result: { status, content, stderr }
```

---

## 7. Response Generation

### Message Formatting
```
Location: src/models/Message.js
Function: Message.format()
```

**Progress Messages:**
```json
{
  "role": "system",
  "status": "success",
  "content": "Building your file right now...",
  "meta": {
    "task_id": "0fd8c1e8-863f-4d63-93f5-08087bd7db4b",
    "action_type": "progress"
  }
}
```

**Code Execution Messages:**
```json
{
  "role": "assistant",
  "status": "running",
  "content": "add_red_star.py",
  "meta": {
    "action_type": "write_code"
  }
}
```

### File Versioning
```
[AgenticAgent] Session started at 2025-11-09T06:45:11.777Z
[AgenticAgent] Found 3 new files
[AgenticAgent] Created version for: mold_making_guide_updated_v2.docx
[AgenticAgent] Created version for: add_red_star.py
[AgenticAgent] Context invalidated after execution
```

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ 1. HTTP Request: POST /api/agent/run                   │
│    - question: "add a red star"                        │
│    - fileIds: []                                       │
│    - mode: "auto"                                      │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 2. File Processing (run.js:126-181)                    │
│    ✓ Load conversation files: lox.pdf (1 file)        │
│    ✓ Create newFiles array                            │
│    ✓ Add to context                                   │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Intent Classification (run.js:269-308)              │
│    → Mode: 'auto'                                      │
│    → Detect intent → 'agent'                          │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Auto-Reply Check (auto-reply/index.js)              │
│    ✗ Not a mode command                               │
│    ✗ No new file uploads                              │
│    ✓ File edit pattern detected                       │
│    → Return: { needsExecution: true }                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Specialist Routing (MultiAgentCoordinator.js)       │
│    → Build context (2 files)                          │
│    → Detect: complex_reasoning                        │
│    → Select: openrouter/z-ai/glm-4.6                  │
│    → Add file context                                 │
│    → Execute specialist                               │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Planning (AgenticAgent.js)                          │
│    → Specialist returns plan                          │
│    → Extract actions                                  │
│    → Queue for execution                              │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Tool Execution (code-act/)                          │
│    Attempt 1: terminal_run (inline Python) → FAIL     │
│    Attempt 2: write_code (add_red_star.py) → SUCCESS  │
│    Attempt 3: terminal_run (execute script) → SUCCESS │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 8. File Versioning (AgenticAgent.js)                   │
│    → Create version: mold_making_guide_updated_v2.docx │
│    → Create version: add_red_star.py                  │
│    → Invalidate context                               │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 9. Response Stream                                     │
│    → Send progress messages                           │
│    → Send execution results                           │
│    → Send final success message                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🔍 Key Observations for QC

### Strengths
1. ✅ **File Persistence**: All conversation files loaded, not just current message
2. ✅ **Retry Logic**: Failed inline Python → Successful script approach
3. ✅ **File Versioning**: Automatic versioning for generated files
4. ✅ **Fallback Routing**: Intelligent fallback when task type ambiguous
5. ✅ **Progress Updates**: Real-time progress messages to user

### Areas to Review
1. ⚠️ **Error Handling**: Initial terminal_run failure due to bash syntax
2. ⚠️ **Context Management**: Context invalidation after execution
3. ⚠️ **File Path Consistency**: Ensure paths work across Docker/local
4. ⚠️ **Retry Strategy**: Could be more explicit about retry logic

### Logic Gaps
1. **File Analysis**: Files loaded but not always analyzed (`_analysis` property)
2. **Mode Transition**: Chat vs Agent mode transitions not always clear
3. **Tool Selection**: Why specialist chose inline Python first, then script?

---

## 📝 Code Locations Reference

| Component | File Path | Key Functions |
|-----------|-----------|---------------|
| Request Router | `src/routers/agent/run.js` | `executeTwinsMode()`, file processing |
| Auto-Reply | `src/agent/auto-reply/index.js` | `auto_reply()`, fast-path detection |
| Coordinator | `src/agent/specialists/MultiAgentCoordinator.js` | `execute()`, `detectTaskType()` |
| Agent Core | `src/agent/AgenticAgent.js` | `run()`, versioning, context |
| Code Act | `src/agent/code-act/` | Tool execution, action handling |
| File Analyzer | `src/utils/fileAnalyzer.js` | `analyzeFiles()` |
| File Display | `src/agent/code-act/thinking.util.js` | `describeUploadFiles()` |

---

## 🎯 Testing Scenarios

### Scenario 1: File Upload + Request
```
User: [uploads lox.pdf] "can you see this?"
Expected: Agent confirms file visibility with name, type, path
Actual: [Needs verification with new file persistence logic]
```

### Scenario 2: File Edit
```
User: "add author name to the document"
Expected: Fast-path detection → File edit with existing files
Actual: ✅ Works as documented above
```

### Scenario 3: Complex Request
```
User: "add a red star"
Expected: Specialist routing → Tool execution → File generation
Actual: ✅ Works with retry logic (inline fail → script success)
```

---

**Document Generated:** 2025-11-09  
**Conversation ID:** 0fd8c1e8-863f-4d63-93f5-08087bd7db4b  
**Purpose:** QC and logic verification  
**Status:** Initial mapping complete, ready for agent QC review
