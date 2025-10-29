# Grace AI - Revision Logic Issues & Fixes

## Summary
This document details all the issues we encountered and fixed related to Grace's document revision and follow-up request handling. These issues were discovered through real user interactions and systematically addressed.

---

## 🔴 Issue #1: Implementation Regression (Image → Text)

### **Problem:**
Grace switched implementation methods between revisions, regressing from better to worse approaches.

**Example:**
```
User: "add a ⭐ at the top"
Grace: Creates red star IMAGE using Pillow ✅

User: "make it 3 instead of 1"
Grace: Uses text asterisks (* * *) instead of images ❌
```

### **Root Cause:**
- No memory of previous implementation method
- Specialist didn't know the 1st revision used Pillow/PIL
- Each revision started from scratch without context

### **Fix:**
**File:** `src/agent/specialists/MultiAgentCoordinator.js` (lines 778-884)

**Solution:**
1. **Implementation Tracking** - Scans recent messages for code patterns (Pillow, matplotlib, pandas, etc.)
2. **Context Passing** - Stores detected method in `context.previousImplementation`
3. **Specialist Instruction** - Adds to system prompt: "SHOULD use the SAME implementation approach"
4. **Confidence Scoring** - High confidence = "SHOULD", Medium = "CONSIDER"

**Code:**
```javascript
// Detect Pillow/PIL image creation (strong match)
const hasPIL = code.includes('PIL') || code.includes('from PIL');
const hasImageOps = code.includes('Image.new') || code.includes('ImageDraw');
if (hasPIL && hasImageOps) {
  context.previousImplementation = {
    method: 'Used Pillow/PIL to create image files',
    confidence: 'high'
  };
}
```

**Result:** ✅ Revisions maintain consistent implementation approach

---

## 🔴 Issue #2: File Duplication Instead of Modification

### **Problem:**
Grace created NEW files with modified names instead of overwriting the original.

**Example:**
```
Original file: poker_beginners_guide.docx
User: "make it 3 stars"
Grace: Creates poker_beginners_guide_updated.docx ❌
Should: Modify poker_beginners_guide.docx ✅
```

### **Root Cause:**
- Weak file modification instructions ("IMPORTANT" was ignored)
- No explicit examples of correct vs wrong approaches
- Specialist defaulted to safe behavior (create new file)

### **Fix:**
**File:** `src/agent/specialists/MultiAgentCoordinator.js` (lines 618-650)

**Solution:**
1. **Upgraded to CRITICAL level** - Changed from "IMPORTANT" to "🚨 CRITICAL FILE MODIFICATION RULES"
2. **Explicit Examples** - Added side-by-side correct vs wrong code
3. **4-Rule Framework:**
   - RULE 1: Check for existing files first
   - RULE 2: Load existing files, don't create new ones
   - RULE 3: Save with exact same filename
   - RULE 4: Complete working example

**Before:**
```
IMPORTANT: Always load existing files
```

**After:**
```
🚨 CRITICAL FILE MODIFICATION RULES - READ CAREFULLY:

RULE 2: LOAD EXISTING FILES, DON'T CREATE NEW ONES
✅ CORRECT: doc = Document('love_document.docx')
❌ WRONG: doc = Document()

RULE 3: SAVE WITH THE EXACT SAME FILENAME
✅ CORRECT: doc.save('love_document.docx')
❌ WRONG: doc.save('love_document_updated.docx')
```

**Result:** ✅ Files modified in-place, no more duplicates

---

## 🔴 Issue #3: Placeholder Values (John Doe)

### **Problem:**
Grace used placeholder values when information was missing instead of asking the user.

**Example:**
```
User: "add my name as author"
Grace: Creates document with "Author: John Doe" ❌
Should: Ask "What's your name?" and wait ✅
```

### **Root Cause:**
- Specialist was too proactive, trying to complete tasks without all information
- No instruction to STOP and ASK when data is missing
- Defaulted to common placeholder values

### **Fix:**
**File:** `src/agent/specialists/routing.config.js` (lines 23-28)

**Solution:**
```
**CRITICAL: NEVER USE PLACEHOLDER VALUES**
- If user's name is needed → ASK: "What's your name?"
- If data is missing → ASK for it, DON'T guess
- NEVER use "John Doe", "example.com", or any placeholder
- STOP and WAIT for user response when information is missing
```

**Result:** ✅ Grace asks for missing information instead of guessing

---

## 🔴 Issue #4: Profile Save Failure (Transaction Error)

### **Problem:**
Grace extracted user's name correctly but failed to save it to the database.

**Example:**
```
Logs: [ProfileExtract] Extracted 1 profile items: name = Kenny Grey ✅
Logs: Error: Cannot read properties of undefined (reading 'transaction') ❌
Result: Name was lost, not available for later use
```

### **Root Cause:**
- Incorrect sequelize import: `const { sequelize } = require('@src/models')`
- Models export sequelize directly, not as `{ sequelize }`
- Transaction creation failed due to undefined object

### **Fix:**
**File:** `src/services/userProfile.js` (line 8)

**Before:**
```javascript
const { sequelize } = require('@src/models');
```

**After:**
```javascript
const sequelize = require('@src/models');
```

**Result:** ✅ User profiles save correctly (Kenny Grey stored successfully)

---

## 🔴 Issue #5: Python Code Leakage in UI

### **Problem:**
Python code blocks and inline commands were visible in the chat UI.

**Example:**
```
User sees in chat:
"python3 -c \"from docx import Document;import sys;try:doc=Document('file.docx')..."
```

### **Root Cause:**
- Filter only caught code blocks (````python\n...\n````)
- Didn't catch inline commands (`python3 -c "..."`)
- Specialist responses published before filtering

### **Fix:**
**File:** `src/agent/AgenticAgent.js` (lines 71-88)

**Solution:**
```javascript
// Remove Python code blocks: ```python\n...\n```
safeContent = safeContent.replace(/```python\n[\s\S]+?\n```/g, '').trim();

// Remove inline Python commands: python3 -c "..."
safeContent = safeContent.replace(/python3?\s+-c\s+["'][\s\S]+?["']/g, '').trim();

// Remove any remaining python3 command lines
safeContent = safeContent.replace(/^python3?\s+.+$/gm, '').trim();
```

**Result:** ✅ Code blocks hidden from UI, only execution results shown

---

## 🔴 Issue #6: Verbose Processing Notes

### **Problem:**
Technical backend details exposed in task progress notes.

**Example:**
```
❌ "Information Gathering - Check user profile to retrieve stored name information"
❌ "Document Update - Once name is confirmed, execute Python code to update..."
❌ "Delivery - Confirm document has been updated with author name"
```

### **Root Cause:**
- LLM-generated task titles were too technical
- Exposed internal logic and implementation details
- Made users think system was waiting on something complex

### **Fix:**
**File:** `src/agent/AgenticAgent.js` (lines 114-156)

**Solution:**
```javascript
_makeTaskTitleUserFriendly(title, description) {
  // For name/profile gathering tasks
  if (title.includes('information gathering') || 
      description?.includes('ask user')) {
    return '💬 Waiting for your response...';
  }
  
  // For document updates
  if (title.includes('document update')) {
    return '📝 Updating document...';
  }
  
  // For delivery/confirmation
  if (title.includes('delivery')) {
    return '✅ Finishing up...';
  }
}
```

**Result:** ✅ Simple, user-friendly progress messages

---

## 🔴 Issue #7: Context Loss ("Which document?")

### **Problem:**
Grace asked "Which document?" even though a document existed in the conversation.

**Example:**
```
User: "make me a word document about US-China relations" 
Grace: Creates us_china_gop_relations.docx ✅

User: "can you add a red star"
Grace: "Which document? We haven't created any documents yet" ❌
```

### **Root Cause:**
- "can you X" detected as capability question, not action request
- Routed to `general_chat` which doesn't have file context
- Specialist with file list was never called

### **Fix:**
**File:** `src/agent/specialists/MultiAgentCoordinator.js` (lines 389-393)

**Solution:**
```javascript
// If files exist, "can you X" is likely an action request
if (isQuestion && message.includes('can you')) {
  if (hasFiles && (message.includes('add') || message.includes('include') || 
                   message.includes('modify') || message.includes('change'))) {
    return 'data_generation'; // Route to specialist with file context
  }
}
```

**Result:** ✅ "Can you add X" with files → Routes to specialist with file awareness

---

## 🔴 Issue #8: Content Hallucination ("By: Grace AI")

### **Problem:**
Grace added content that was never requested.

**Example:**
```
User: "add my name as author"
Grace: Adds "By: Grace AI" in the footer ❌
Nobody asked for "Grace AI" or anything in the footer!
```

### **Root Cause:**
- Specialist being "creative" and adding its own touches
- No explicit instruction to ONLY add requested content
- Trying to be helpful but overstepping

### **Fix:**
**File:** `src/agent/specialists/routing.config.js` (lines 36-42)

**Solution:**
```
**CRITICAL: NEVER HALLUCINATE CONTENT**
- ONLY add what the user explicitly requested
- DO NOT add your own creative touches (e.g., "By: Grace AI", extra formatting)
- If user says "add my name as author" → Add ONLY their name, nothing else
- DO NOT add footers, headers, or metadata unless explicitly requested
- Example WRONG: User asks for "author name" → You add "By: Grace AI" in footer ❌
- Example RIGHT: User asks for "author name" → You add "Author: [Their Name]" ✅
```

**Result:** ✅ Grace only adds explicitly requested content

---

## 🔴 Issue #9: Creating New Files Instead of Modifying

### **Problem:**
When asked to add content to existing document, Grace created a NEW blank document.

**Example:**
```
Existing: love_document.docx (full essay about love)
User: "add my name as author"
Grace: Creates NEW love_document.docx with ONLY "Author: Kenny" ❌
Result: Original content lost!
```

### **Root Cause:**
- Used `Document()` instead of `Document('love_document.docx')`
- Didn't check for existing files before creating new ones
- File modification rules not explicit enough

### **Fix:**
**File:** `src/agent/specialists/MultiAgentCoordinator.js` (lines 620-650)

**Solution:**
```
RULE 1: ALWAYS CHECK FOR EXISTING FILES FIRST
- Before creating ANY new file, CHECK if a similar file already exists
- If user says "add X to the document" → They mean the EXISTING document

RULE 2: LOAD EXISTING FILES, DON'T CREATE NEW ONES
- ✅ CORRECT: doc = Document('love_document.docx')  # Loads existing
- ❌ WRONG: doc = Document()  # Creates blank new document

RULE 4: COMPLETE EXAMPLE
# ✅ CORRECT APPROACH:
doc = Document('love_document.docx')  # Load existing
doc.paragraphs[0].insert_paragraph_before('Author: Kenny')
doc.save('love_document.docx')  # Save with SAME name

# ❌ WRONG APPROACH:
doc = Document()  # Creates blank - loses all content!
doc.add_paragraph('Author: Kenny')
doc.save('love_document_with_author.docx')  # Creates duplicate!
```

**Result:** ✅ Existing files loaded and modified, content preserved

---

## 📊 Summary of All Fixes

| Issue | Impact | Fix Location | Status |
|-------|--------|--------------|--------|
| Implementation Regression | Medium | MultiAgentCoordinator.js | ✅ Fixed |
| File Duplication | High | MultiAgentCoordinator.js | ✅ Fixed |
| Placeholder Values | Medium | routing.config.js | ✅ Fixed |
| Profile Save Failure | High | userProfile.js | ✅ Fixed |
| Python Code Leakage | High | AgenticAgent.js | ✅ Fixed |
| Verbose Processing Notes | Low | AgenticAgent.js | ✅ Fixed |
| Context Loss | High | MultiAgentCoordinator.js | ✅ Fixed |
| Content Hallucination | Medium | routing.config.js | ✅ Fixed |
| New File Creation | High | MultiAgentCoordinator.js | ✅ Fixed |

---

## 🎯 Key Principles Established

1. **Consistency Over Creativity** - Maintain implementation approach across revisions
2. **Modify, Don't Duplicate** - Always load and overwrite existing files
3. **Ask, Don't Guess** - Request missing information instead of using placeholders
4. **Show Results, Hide Code** - Filter technical details from UI
5. **Context Awareness** - Use file lists and conversation history for routing
6. **Explicit Over Implicit** - Only add what user explicitly requests
7. **User-Friendly Language** - Hide backend complexity in progress messages

---

## 🚀 Testing Scenarios

### Test 1: Multi-Step Revision
```
1. "make me a word document about poker"
2. "add a ⭐ at the top"  → Should use Pillow
3. "make it 3 instead of 1"  → Should use Pillow again (not text)
4. Check: poker_beginners_guide.docx (not _updated.docx)
```

### Test 2: Name Request
```
1. "make a document about love"
2. "add my name as author, if you don't know ask"
3. Grace should ask: "What's your name?"
4. User: "Kenny Grey"
5. Check: love_document.docx modified (not new file created)
6. Check: Only "Author: Kenny Grey" added (no "By: Grace AI")
```

### Test 3: Follow-up with Files
```
1. "make a document about US-China relations"
2. "can you add a red star at the top"
3. Grace should NOT ask "which document?"
4. Should add star to us_china_relations.docx
```

---

## 📝 Commits

1. `90a21ab` - Soften revision continuity: Override detection, expanded libraries, confidence scoring
2. `c7242bb` - Fix Python code leakage in UI - strip code blocks before display
3. `61d844b` - Clean up redundant code block filters
4. `43d5f15` - Major UX fixes: Profile save, Python leakage, processing notes, context awareness
5. `e11a35f` - Fix file duplication and content hallucination in revisions

---

**Status:** All issues fixed and deployed ✅  
**Last Updated:** October 29, 2025  
**Next Steps:** Monitor user interactions for any remaining edge cases

---

## 🔍 High-Level Context Architecture Concerns

### **Concern #1: Context Fragmentation Across Components**

**Issue:** Context is built and passed differently across multiple layers without a unified strategy.

**Evidence:**
1. **AgenticAgent** builds context with:
   - `recentMessages` (last 5 messages)
   - `sessionStartTime` (for file filtering)
   - `specialistResponse` (from auto-reply)
   - `files` (from File model)
   - `previousResult` (from conversationHistoryUtils)

2. **MultiAgentCoordinator** builds separate context with:
   - `hasFiles` (from filesystem scan)
   - `lastAction` (not implemented)
   - `isFollowUp` (pronoun detection)
   - `previousImplementation` (from message scanning)

3. **Thinking/Planning** builds yet another context with:
   - `memory` (from LocalMemory)
   - `previousResult` (from Task model)
   - `uploadFileDescription` (from context.files)
   - `profileContext` (from user profile)

**Problem:** These contexts don't share data or build on each other - they're independent silos.

**Impact:**
- Duplicate work (scanning files 3+ times)
- Inconsistent state (one component sees files, another doesn't)
- Context loss between phases
- No cumulative context growth

---

### **Concern #2: No Persistent Context Growth Mechanism**

**Issue:** Context is rebuilt from scratch on every request instead of growing incrementally.

**Evidence:**
- `buildRoutingContext()` scans messages every time (lines 778-884)
- `retrieveAndFormatPreviousSummary()` rebuilds conversation history from DB
- `loadConversationMemory()` reads all tasks from DB
- No caching or incremental updates

**Problem:** As conversations grow, context building becomes exponentially slower.

**Example:**
```
Message 1: Scan 10 messages (10ms)
Message 10: Scan 100 messages (100ms)
Message 100: Scan 1000 messages (1000ms)
```

**Impact:**
- Performance degradation over long conversations
- Repeated database queries
- No learning from previous context builds

---

### **Concern #3: Context Not Passed Between Phases**

**Issue:** Context built in one phase is lost in the next phase.

**Evidence:**
1. **Auto-Reply Phase:**
   - Builds `recentMessages` (5 messages)
   - Passes to coordinator
   - Coordinator builds own context (ignores recentMessages)

2. **Planning Phase:**
   - Receives `specialistResponse`
   - Doesn't receive routing context (hasFiles, previousImplementation)
   - Rebuilds file list from scratch

3. **Execution Phase:**
   - LocalMemory stores task-level context
   - Doesn't have access to conversation-level context
   - No awareness of files, previous implementations, or user profile

**Problem:** Each phase operates in isolation without cumulative knowledge.

**Impact:**
- Repeated work
- Context loss
- Inconsistent behavior

---

### **Concern #4: File Context Inconsistency**

**Issue:** Files are tracked in 4 different places with different formats.

**Evidence:**
1. **File Model (Database):**
   ```javascript
   files = await File.findAll({ where: { conversation_id } })
   ```

2. **Filesystem Scan:**
   ```javascript
   files = await getAllFilesRecursively(conversationDir)
   ```

3. **Context.generate_files (Array):**
   ```javascript
   this.context.generate_files.push(result.meta.filepath)
   ```

4. **Session-based Filtering:**
   ```javascript
   newFiles = await getFilesMetadata(filesToProcess, this.sessionStartTime)
   ```

**Problem:** No single source of truth for "what files exist in this conversation"

**Impact:**
- Race conditions (file created but not in DB yet)
- Stale data (DB has file but filesystem doesn't)
- Duplicate file detection
- Inconsistent file lists across components

---

### **Concern #5: Task Context Not Accessible to Specialists**

**Issue:** Specialists don't have access to task history or execution context.

**Evidence:**
- `callSpecialist()` receives only:
  - `systemPrompt`
  - `userMessage`
  - `options.messages` (conversation history)
  - `options.routingContext` (hasFiles, previousImplementation)

- Specialists DON'T receive:
  - Completed tasks and their results
  - Failed tasks and errors
  - Task dependencies
  - Execution memory

**Problem:** Specialists can't learn from previous task outcomes.

**Example:**
```
Task 1: Create document (SUCCESS)
Task 2: Add author name (FAILED - file not found)
Task 3: Add author name (retry)

Specialist for Task 3 doesn't know Task 2 failed or why
```

**Impact:**
- Repeated errors
- No learning from failures
- Can't adapt approach based on previous results

---

### **Concern #6: Memory Fragmentation**

**Issue:** Multiple memory systems that don't communicate.

**Evidence:**
1. **LocalMemory (Task-level):**
   - Stores messages per task
   - File-based (JSON)
   - Cleared after task completion

2. **Message Table (Conversation-level):**
   - Stores all messages
   - Database-based
   - Permanent

3. **Task Table (Task-level):**
   - Stores task status and results
   - Database-based
   - Has `memorized` field (execution details)

4. **Context Object (Runtime-only):**
   - Stores ephemeral state
   - Lost after request completes

**Problem:** No unified memory that spans task → conversation → session.

**Impact:**
- Context loss between tasks
- Can't reference previous task details
- No long-term learning

---

### **Concern #7: Profile Context Not Integrated**

**Issue:** User profile exists but isn't consistently used.

**Evidence:**
- Profile extracted and saved (userProfile.js)
- Profile loaded in thinking.prompt.js as `profileContext`
- Profile NOT passed to:
  - MultiAgentCoordinator
  - Specialists
  - Planning phase
  - Summary phase

**Problem:** User preferences and information not available where needed.

**Example:**
```
User profile: name = "Kenny Grey"
Specialist: Asks "What's your name?" (doesn't have profile access)
```

**Impact:**
- Repeated questions
- Ignoring user preferences
- Inconsistent personalization

---

## 🎯 Recommended Architecture Changes

### **1. Unified Context Manager**
Create a `ConversationContext` class that:
- Builds context once per request
- Caches results
- Grows incrementally
- Shared across all components

### **2. Context Inheritance**
```
ConversationContext (top-level)
  ├─ RoutingContext (for coordinator)
  ├─ PlanningContext (for planning)
  ├─ ExecutionContext (for tasks)
  └─ SpecialistContext (for specialists)
```

### **3. Single Source of Truth for Files**
- File registry that syncs DB ↔ Filesystem
- Real-time updates
- Consistent across all components

### **4. Task Memory Integration**
- Pass task history to specialists
- Include failure reasons
- Enable learning from previous attempts

### **5. Profile Integration**
- Pass user profile to all components
- Use profile for personalization
- Update profile based on interactions

---

**Priority:** High - These architectural issues compound over long conversations and multi-step tasks


--------
FIXXX

Grace AI - Context Architecture Fixes Implementation Guide

Date: October 29, 2025
Status: Ready for Implementation
Priority: High




Executive Summary

This document provides a step-by-step implementation guide to fix 6 critical architectural issues in Grace's context management system. Each fix is minimal, safe, and follows Grace's existing patterns.

Issues Addressed:

1.
✅ Profile Context Integration (ALREADY FIXED)

2.
🔧 Context Fragmentation

3.
🔧 No Persistent Context Growth

4.
🔧 Phase Isolation

5.
🔧 File Context Inconsistency

6.
🔧 Task Memory Gaps

7.
🔧 Memory Fragmentation

Implementation Time: 4-6 hours
Risk Level: Medium
Breaking Changes: None




Fix #1: Unified ConversationContext Manager

Problem

Context is built separately in 3+ places:

•
AgenticAgent builds recentMessages, sessionStartTime, files

•
MultiAgentCoordinator builds hasFiles, isFollowUp, previousImplementation

•
Thinking/Planning builds memory, previousResult, profileContext

Result: Duplicate work, inconsistent state, context loss

Solution

Create a single ConversationContext class that builds context once and shares it across all components.

Implementation

File: src/context/ConversationContext.js (NEW FILE)

Key Features:

•
Builds context once per request

•
Caches results for 5 seconds

•
Provides specialized context for each phase:

•
getRoutingContext() - For MultiAgentCoordinator

•
getPlanningContext() - For thinking/planning

•
getSpecialistContext() - For specialists

•
getExecutionContext() - For task execution



•
Incremental updates (add file/task without full rebuild)

•
Manual invalidation after major changes

Core Methods:

JavaScript


class ConversationContext {
  constructor(conversationId, userId) {
    this.conversationId = conversationId;
    this.userId = userId;
    this.cache = { files: null, tasks: null, messages: null, profile: null };
  }

  // Build complete context (with caching)
  async build(options = {}) {
    // Check cache first
    if (cached && fresh) return cached;
    
    // Load in parallel
    const [files, tasks, messages, profile] = await Promise.all([
      this._loadFiles(),
      this._loadTasks(),
      this._loadMessages(),
      this._loadProfile()
    ]);
    
    // Cache results
    this.cache = { files, tasks, messages, profile, lastUpdated: Date.now() };
    return this._buildContextObject();
  }

  // Get context for routing
  getRoutingContext() {
    return {
      hasFiles: this.cache.files?.length > 0,
      files: this.cache.files || [],
      recentMessages: this.cache.messages?.slice(-10) || [],
      previousImplementation: this._detectPreviousImplementation(),
      profile: this.cache.profile
    };
  }

  // Get context for planning
  getPlanningContext() {
    return {
      files: this.cache.files || [],
      tasks: this.cache.tasks || [],
      recentMessages: this.cache.messages?.slice(-5) || [],
      profile: this.cache.profile,
      previousResult: this._getLastTaskResult()
    };
  }

  // Get context for specialists
  getSpecialistContext() {
    return {
      files: this.cache.files || [],
      profileContext: this._formatProfileContext(),
      taskHistory: this._formatTaskHistory(),
      previousImplementation: this._detectPreviousImplementation()
    };
  }

  // Invalidate cache after changes
  invalidate() {
    this.cache.lastUpdated = null;
  }

  // Update cache incrementally
  async incrementalUpdate(type, data) {
    if (type === 'file') this.cache.files.push(data);
    if (type === 'task') this.cache.tasks.push(data);
    if (type === 'message') this.cache.messages.push(data);
    this.cache.lastUpdated = Date.now();
  }
}


Usage in AgenticAgent.js:

JavaScript


// At top of file
const ConversationContext = require('@src/context/ConversationContext');

class AgenticAgent {
  constructor(conversationId, userId) {
    // Create unified context manager
    this.context = new ConversationContext(conversationId, userId);
  }

  async run(userMessage, options = {}) {
    // Build context ONCE
    await this.context.build();
    
    // Phase 1: Auto-Reply (uses routing context)
    const routingContext = this.context.getRoutingContext();
    const autoReply = await this.coordinator.route(userMessage, routingContext);
    
    // Phase 2: Planning (uses planning context)
    const planningContext = this.context.getPlanningContext();
    const plan = await this.planner.createPlan(userMessage, planningContext);
    
    // Phase 3: Execution (uses execution context)
    const executionContext = this.context.getExecutionContext();
    const result = await this.executor.execute(plan, executionContext);
    
    // Invalidate after execution
    this.context.invalidate();
    
    return result;
  }
}


Benefits:

•
✅ Context built once, used everywhere

•
✅ 50-90% reduction in database queries

•
✅ Consistent state across all components

•
✅ No context loss between phases




Fix #2: Single Source of Truth for Files

Problem

Files tracked in 4 different places:

1.
File model (database)

2.
Filesystem scan

3.
context.generate_files array

4.
Session-based filtering

Result: Race conditions, stale data, inconsistent file lists

Solution

Create a FileRegistry class that syncs database ↔ filesystem and provides unified file access.

Implementation

File: src/context/FileRegistry.js (NEW FILE)

Key Features:

•
Auto-syncs database with filesystem

•
Single API for all file operations

•
Registers new files in both places

•
Detects and registers orphaned files

Core Methods:

JavaScript


class FileRegistry {
  constructor(conversationId) {
    this.conversationId = conversationId;
    this.conversationDir = `/workspace/${conversationId}`;
  }

  // Get all files (syncs DB ↔ filesystem)
  async getAll() {
    // Load from database
    const dbFiles = await File.findAll({ where: { conversation_id: this.conversationId } });
    
    // Scan filesystem
    const fsFiles = await getAllFilesRecursively(this.conversationDir);
    
    // Sync: Add missing files to database
    for (const fsFile of fsFiles) {
      const exists = dbFiles.find(f => f.file_path === fsFile.path);
      if (!exists) {
        await this.register(fsFile.path, fsFile.name);
      }
    }
    
    // Return unified list
    return await File.findAll({ where: { conversation_id: this.conversationId } });
  }

  // Register new file
  async register(filePath, fileName) {
    const existing = await File.findOne({
      where: { conversation_id: this.conversationId, file_path: filePath }
    });
    
    if (existing) return existing;
    
    return await File.create({
      conversation_id: this.conversationId,
      file_name: fileName,
      file_path: filePath,
      file_type: path.extname(fileName),
      created_at: new Date()
    });
  }

  // Check if file exists (checks both DB and filesystem)
  async exists(fileName) {
    const dbFile = await File.findOne({
      where: { conversation_id: this.conversationId, file_name: fileName }
    });
    
    if (dbFile) return true;
    
    // Check filesystem
    const filePath = path.join(this.conversationDir, fileName);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Get file by name
  async get(fileName) {
    const file = await File.findOne({
      where: { conversation_id: this.conversationId, file_name: fileName }
    });
    
    if (!file) {
      // Check filesystem and register if found
      const filePath = path.join(this.conversationDir, fileName);
      try {
        await fs.access(filePath);
        return await this.register(filePath, fileName);
      } catch {
        return null;
      }
    }
    
    return file;
  }

  // Delete file (both DB and filesystem)
  async delete(fileName) {
    const file = await this.get(fileName);
    if (!file) return false;
    
    // Delete from filesystem
    try {
      await fs.unlink(file.file_path);
    } catch (error) {
      console.error('[FileRegistry] Error deleting file:', error);
    }
    
    // Delete from database
    await file.destroy();
    return true;
  }
}


Usage Example:

JavaScript


// In code-act.js or anywhere files are created
const FileRegistry = require('@src/context/FileRegistry');

const registry = new FileRegistry(conversationId);

// After creating a file
await registry.register(filePath, fileName);

// Check if file exists before creating
if (await registry.exists('document.docx')) {
  // Load existing file
  const file = await registry.get('document.docx');
} else {
  // Create new file
}

// Get all files
const files = await registry.getAll();


Integration with ConversationContext:

JavaScript


// In ConversationContext._loadFiles()
async _loadFiles() {
  const registry = new FileRegistry(this.conversationId);
  return await registry.getAll(); // Auto-synced!
}


Benefits:

•
✅ No more race conditions

•
✅ No more stale file lists

•
✅ Single API for all file operations

•
✅ Auto-detects orphaned files




Fix #3: Context Inheritance Between Phases

Problem

Context built in auto-reply phase is lost in planning phase. Each phase rebuilds context from scratch.

Example:

Plain Text


Auto-Reply: Builds context (100ms)
Planning: Rebuilds context (100ms)  ← Duplicate work!
Execution: Rebuilds context (100ms) ← Duplicate work!


Solution

Build context once in AgenticAgent, pass to all phases.

Implementation

File: src/agent/AgenticAgent.js (MODIFY)

Before:

JavaScript


async run(userMessage, options = {}) {
  // Auto-reply builds its own context
  const autoReply = await this.coordinator.route(userMessage);
  
  // Planning builds its own context
  const plan = await this.planner.createPlan(userMessage);
  
  // Execution builds its own context
  const result = await this.executor.execute(plan);
}


After:

JavaScript


async run(userMessage, options = {}) {
  // Build context ONCE
  await this.context.build();
  
  // Pass routing context to auto-reply
  const routingContext = this.context.getRoutingContext();
  const autoReply = await this.coordinator.route(userMessage, routingContext);
  
  // Pass planning context to planner
  const planningContext = this.context.getPlanningContext();
  const plan = await this.planner.createPlan(userMessage, planningContext);
  
  // Pass execution context to executor
  const executionContext = this.context.getExecutionContext();
  const result = await this.executor.execute(plan, executionContext);
  
  // Invalidate after execution
  this.context.invalidate();
}


File: src/agent/specialists/MultiAgentCoordinator.js (MODIFY)

Before:

JavaScript


async route(userMessage, options = {}) {
  // Build routing context from scratch
  const hasFiles = await this._checkFiles();
  const previousImplementation = await this._detectImplementation();
  // ...
}


After:

JavaScript


async route(userMessage, options = {}) {
  // Use passed context (already built!)
  const { hasFiles, files, previousImplementation, profile } = options;
  // No need to rebuild!
}


Benefits:

•
✅ Context built once, used 3+ times

•
✅ 66% reduction in context building time

•
✅ Consistent state across all phases

•
✅ No data loss between phases




Fix #4: Task Memory Integration for Specialists

Problem

Specialists don't know about previous task failures/successes. They repeat the same mistakes.

Example:

Plain Text


Task 1: Add author name (FAILED - file not found)
Task 2: Add author name (retry)

Specialist for Task 2 doesn't know Task 1 failed or why!


Solution

Pass task history to specialists so they can learn and adapt.

Implementation

File: src/agent/specialists/MultiAgentCoordinator.js (MODIFY)

Location: Inside callSpecialist method, after profile context injection (around line 620)

Add this code:

JavaScript


// CRITICAL: Get task history context
let taskHistoryContext = '';
if (options.taskHistory && options.taskHistory.length > 0) {
  const recentTasks = options.taskHistory.slice(0, 5);
  const taskItems = recentTasks.map(t => {
    let status = t.status === 'completed' ? '✅' : '❌';
    let errorInfo = t.error ? ` (Error: ${t.error})` : '';
    return `${status} ${t.title}${errorInfo}`;
  }).join('\n');
  
  taskHistoryContext = `\n\n**RECENT TASK HISTORY:**\n${taskItems}\n\n**IMPORTANT:** Learn from previous task failures. If a task failed, try a different approach.`;
  console.log('[Specialist] Adding task history context');
}

// Add to system prompt (along with profile and file context)
if (contextMessages[0]?.role === 'system') {
  contextMessages[0].content += existingFilesContext + userProfileContext + taskHistoryContext;
} else {
  contextMessages.unshift({ 
    role: 'system', 
    content: fullSystemPrompt + existingFilesContext + userProfileContext + taskHistoryContext 
  });
}


Update ConversationContext to provide task history:

JavaScript


// In ConversationContext.getSpecialistContext()
getSpecialistContext() {
  return {
    files: this.cache.files || [],
    profileContext: this._formatProfileContext(),
    taskHistory: this.cache.tasks || [], // ← Add this
    previousImplementation: this._detectPreviousImplementation()
  };
}


Usage in AgenticAgent:

JavaScript


// When calling specialist
const specialistContext = this.context.getSpecialistContext();
const response = await this.coordinator.callSpecialist(
  specialist,
  userMessage,
  specialistContext // ← Includes task history
);


Benefits:

•
✅ Specialists learn from previous failures

•
✅ No repeated errors

•
✅ Adaptive approach based on task history

•
✅ Better error recovery




Fix #5: Persistent Context Caching

Problem

Context rebuilt from scratch on every request. As conversations grow, this becomes exponentially slower.

Example:

Plain Text


Message 1: Scan 10 messages (10ms)
Message 10: Scan 100 messages (100ms)
Message 100: Scan 1000 messages (1000ms) ← Too slow!


Solution

Cache context for 5 seconds, use incremental updates.

Implementation

Already included in ConversationContext class!

Key features:

JavaScript


class ConversationContext {
  async build(options = {}) {
    const { forceRefresh = false } = options;
    
    // Check cache (5-second TTL)
    if (!forceRefresh && this.cache.lastUpdated && 
        (Date.now() - this.cache.lastUpdated < 5000)) {
      console.log('[ConversationContext] Using cached context');
      return this._buildContextObject();
    }
    
    // Build fresh context
    console.log('[ConversationContext] Building fresh context...');
    // ... load from database
  }

  // Incremental update (more efficient than full rebuild)
  async incrementalUpdate(type, data) {
    if (type === 'file') this.cache.files.push(data);
    if (type === 'task') this.cache.tasks.push(data);
    if (type === 'message') this.cache.messages.push(data);
    this.cache.lastUpdated = Date.now();
  }

  // Manual invalidation after major changes
  invalidate() {
    this.cache.lastUpdated = null;
  }
}


Usage:

JavaScript


// In AgenticAgent
await this.context.build(); // First request: 100ms
await this.context.build(); // Second request (within 5s): 1ms ← Cached!

// After creating a file
await createFile(...);
this.context.incrementalUpdate('file', fileData); // Add to cache without rebuild

// After major changes
this.context.invalidate(); // Force rebuild on next request


Benefits:

•
✅ 90%+ reduction in context building time

•
✅ Scales to long conversations

•
✅ Incremental updates avoid full rebuilds

•
✅ Manual invalidation for control




Implementation Checklist

Phase 1: Create New Files




Create src/context/ directory




Create src/context/ConversationContext.js




Create src/context/FileRegistry.js

Phase 2: Implement ConversationContext




Copy ConversationContext class code




Implement build() method




Implement getRoutingContext() method




Implement getPlanningContext() method




Implement getSpecialistContext() method




Implement getExecutionContext() method




Implement caching logic




Implement incremental updates




Test in isolation

Phase 3: Implement FileRegistry




Copy FileRegistry class code




Implement getAll() method (with sync)




Implement register() method




Implement exists() method




Implement get() method




Implement delete() method




Test in isolation

Phase 4: Integrate with AgenticAgent




Import ConversationContext




Create context manager in constructor




Build context once in run() method




Pass routing context to coordinator




Pass planning context to planner




Pass execution context to executor




Add invalidation after execution




Test integration

Phase 5: Update MultiAgentCoordinator




Accept context in route() method




Remove duplicate context building




Add task history to specialist context




Update callSpecialist() to use task history




Test specialist responses

Phase 6: Update File Operations




Replace File.findAll() with FileRegistry.getAll()




Replace file creation with FileRegistry.register()




Update file existence checks




Test file sync

Phase 7: Testing




Test context caching (should be 90%+ faster on second call)




Test file registry sync (create file in filesystem, should appear in DB)




Test context inheritance (routing → planning → execution)




Test task memory (specialist should see previous failures)




Test long conversations (should not slow down)




Test incremental updates (add file without full rebuild)

Phase 8: Deployment




Backup database




Commit changes




Deploy to production




Monitor logs for errors




Monitor performance metrics




Testing Scenarios

Test 1: Context Caching Performance

JavaScript


const context = new ConversationContext(conversationId, userId);

console.time('First build');
await context.build();
console.timeEnd('First build'); // Expected: ~100ms

console.time('Cached build');
await context.build();
console.timeEnd('Cached build'); // Expected: ~1ms (90%+ faster!)


Test 2: File Registry Sync

JavaScript


const registry = new FileRegistry(conversationId);

// Create file in filesystem only (not in DB)
fs.writeFileSync('/workspace/conv123/test.txt', 'hello');

// Registry should detect and register it
const files = await registry.getAll();
console.log(files); // Should include test.txt


Test 3: Context Inheritance

JavaScript


const context = new ConversationContext(conversationId, userId);
await context.build();

// All phases use same context (no rebuild)
const routingCtx = context.getRoutingContext();
const planningCtx = context.getPlanningContext();
const execCtx = context.getExecutionContext();

// All should have same files (no duplicate queries)
console.log(routingCtx.files === planningCtx.files); // true


Test 4: Task Memory

JavaScript


// Create a failed task
await Task.create({
  conversation_id: conversationId,
  title: 'Add author name',
  status: 'failed',
  error: 'File not found'
});

// Next specialist call should see this
const context = new ConversationContext(conversationId, userId);
await context.build();
const specialistCtx = context.getSpecialistContext();

console.log(specialistCtx.taskHistory);
// Should include: "❌ Add author name (Error: File not found)"


Test 5: Incremental Updates

JavaScript


const context = new ConversationContext(conversationId, userId);
await context.build();

// Add a file without rebuilding entire context
const newFile = { file_name: 'test.txt', file_path: '/workspace/test.txt' };
await context.incrementalUpdate('file', newFile);

// File should be in cache
const files = context.cache.files;
console.log(files); // Should include test.txt





Expected Benefits

Performance

•
50-90% reduction in database queries

•
66% reduction in context building time

•
Scales to long conversations without performance degradation

Consistency

•
Single source of truth for files

•
No context loss between phases

•
No race conditions or stale data

Intelligence

•
Specialists learn from previous task failures

•
Adaptive approach based on task history

•
Better error recovery

Maintainability

•
Centralized context management

•
Clear separation of concerns

•
Easy to debug and test




Rollback Plan

If issues arise:

1.
Stop Grace app:

2.
Revert code changes:

3.
Remove new files:

4.
Restart Grace app:

System will fall back to original context building (no data loss).




Risk Assessment

Low Risk:

•
ConversationContext is additive (doesn't break existing code)

•
FileRegistry wraps existing File model (safe)

•
Caching has manual invalidation (control)

Medium Risk:

•
Changes to AgenticAgent.js (core file)

•
Changes to MultiAgentCoordinator.js (core file)

Mitigation:

•
Test incrementally (one fix at a time)

•
Keep rollback plan ready

•
Monitor logs closely after deployment






