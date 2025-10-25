# Multi-Agent Context Sharing Fix

## Problem
When multiple specialists collaborate on complex tasks (e.g., full-stack app), they lack:
1. **Workspace path** - Don't know where to save files
2. **Shared context** - Can't see what previous specialists created
3. **Dependency enforcement** - Don't wait for dependencies or receive their results

## Current Flow (BROKEN)
```
User: "Build auth system with database and API"
  ↓
Coordinator.decomposeTask() → [database_design, backend, security_audit]
  ↓
For each subtask:
  - callSpecialist(prompt) ❌ No workspace_path
  - Specialist generates code ❌ No knowledge of previous files
  - Saves to ??? ❌ Wrong location
```

## Required Fixes

### Fix 1: Pass workspace_path to all specialists
**File:** `src/agent/specialists/MultiAgentCoordinator.js`
**Line:** 775-780 (collaborate method)

```javascript
// BEFORE
const result = await this.callSpecialist(
  routing.primary,
  routing.systemPrompt,
  subtask.prompt,
  subtask.options || {}
);

// AFTER
const { getDirpath } = require('@src/utils/electron');
const path = require('path');
const dir_name = 'Conversation_' + this.conversation_id.slice(0, 6);
const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', this.user_id);
const workspace_path = path.join(WORKSPACE_DIR, dir_name);

const result = await this.callSpecialist(
  routing.primary,
  routing.systemPrompt,
  subtask.prompt,
  {
    ...subtask.options,
    workspace_path: workspace_path,  // ✅ Add workspace context
    conversation_id: this.conversation_id,
    user_id: this.user_id
  }
);
```

### Fix 2: Inject workspace_path into specialist system prompts
**File:** `src/agent/specialists/MultiAgentCoordinator.js`
**Line:** 550-625 (callSpecialist method)

```javascript
// BEFORE (line 556)
const fullSystemPrompt = systemPrompt;

// AFTER
const workspace_info = options.workspace_path ? `

**WORKSPACE DIRECTORY:**
Your working directory for this conversation is: ${options.workspace_path}

**CRITICAL: For terminal_run actions that create files:**
You MUST include <cwd>${options.workspace_path}</cwd> in your XML:
\`\`\`xml
<terminal_run>
<command>python3</command>
<args>-c "import pandas; df.to_excel('report.xlsx')"</args>
<cwd>${options.workspace_path}</cwd>
</terminal_run>
\`\`\`

**For write_code actions:**
Use relative paths only (system handles workspace automatically):
\`\`\`xml
<write_code file_path="schema.sql">
CREATE TABLE users...
</write_code>
\`\`\`
` : '';

const fullSystemPrompt = systemPrompt + workspace_info;
```

### Fix 3: Share context between subtasks (dependency results)
**File:** `src/agent/specialists/MultiAgentCoordinator.js`
**Line:** 766-799 (collaborate method)

```javascript
// BEFORE
async collaborate(userMessage, subtasks) {
  const results = [];
  
  for (const subtask of subtasks) {
    const result = await this.callSpecialist(...);
    results.push({ subtask, result, specialist });
  }
  
  return results;
}

// AFTER
async collaborate(userMessage, subtasks) {
  const results = [];
  const completedWork = []; // Track what's been done
  
  for (let i = 0; i < subtasks.length; i++) {
    const subtask = subtasks[i];
    
    // Wait for dependencies
    if (subtask.dependencies && subtask.dependencies.length > 0) {
      console.log(`[Collaboration] Waiting for dependencies: ${subtask.dependencies}`);
      // Dependencies are already completed (sequential execution)
    }
    
    // Build context from previous work
    const previousContext = subtask.dependencies?.length > 0 
      ? `\n\n**PREVIOUS WORK:**\n${subtask.dependencies.map(depIdx => 
          `${results[depIdx].subtask}:\n${results[depIdx].result}`
        ).join('\n\n')}`
      : '';
    
    // Add context to prompt
    const enhancedPrompt = subtask.prompt + previousContext;
    
    const result = await this.callSpecialist(
      routing.primary,
      routing.systemPrompt,
      enhancedPrompt,  // ✅ Include previous work
      {
        ...subtask.options,
        workspace_path: workspace_path,
        previous_files: completedWork.flatMap(r => r.files || [])  // ✅ Share file list
      }
    );
    
    results.push({
      subtask: subtask.description,
      result: result,
      specialist: routing.primary,
      files: this.extractCreatedFiles(result)  // ✅ Track created files
    });
    
    completedWork.push(results[i]);
  }
  
  return results;
}

// Helper method
extractCreatedFiles(result) {
  const fileMatches = result.match(/Created:\s*([^\s\n]+\.(docx|xlsx|pdf|txt|csv|py|js|sql|json))/gi);
  return fileMatches ? fileMatches.map(m => m.replace('Created:', '').trim()) : [];
}
```

### Fix 4: Update specialist prompts to acknowledge shared context
**File:** `src/agent/specialists/routing.config.js`

Add to all code-related specialists:

```javascript
**MULTI-AGENT COLLABORATION:**
You may be working as part of a team. If you see "PREVIOUS WORK" in your prompt:
- Review what other specialists have created
- Build upon their work (don't recreate)
- Reference their files by name
- Maintain consistency with their approach
```

## Testing Plan

1. **Simple test:** "Create a Word doc" → Should save to workspace
2. **Multi-agent test:** "Build auth system with database and API"
   - Should decompose into subtasks
   - Each subtask should know workspace path
   - Backend should see database schema
   - All files should be in same conversation folder

## Expected Outcome

```
User: "Build full-stack dashboard with database"
  ↓
Decompose: [database_design, backend_api, frontend_ui]
  ↓
Subtask 1 (database_design):
  - Receives workspace_path
  - Creates schema.sql in workspace
  - Returns: "Created: schema.sql"
  ↓
Subtask 2 (backend_api):
  - Receives workspace_path
  - Sees "PREVIOUS WORK: schema.sql created"
  - Creates api.py that imports schema
  - Saves to same workspace
  ↓
Subtask 3 (frontend_ui):
  - Receives workspace_path
  - Sees "PREVIOUS WORK: schema.sql, api.py"
  - Creates index.html that calls API
  - Saves to same workspace
  ↓
All files in: /workspace/user_1/Conversation_XXXXXX/
```

## Priority: HIGH
This is critical for complex multi-file projects where specialists need to collaborate.
