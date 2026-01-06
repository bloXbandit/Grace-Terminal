# Website/Landing Page Routing Sequence

## Overview
This document outlines the exact routing sequence for website/landing page requests in GRACEai. This ensures requests like "make me a landing page" or "create a website" are correctly routed to code generation instead of being misclassified as video generation or general chat.

---

## Successful Test Cases

### Test Case 1: Landing Page
**Request:** "make me a landing page for p6 training courses, add the trainer name: Kenny Grey"

### Test Case 2: Website with Design Elements
**Request:** "make me a front page website for a mobile Barber service called 'jeepers Cuts'.. make the colors green and blu with a large hair clipper on home page as centerpiece"

**Result:** Both requests successfully routed to code_generation and created HTML files.

---

## Routing Sequence (Step-by-Step)

### 1. **Initial Request Entry**
- User submits request via `/api/agent/run`
- Request enters `AgenticAgent.js`

### 2. **Media Fast-Path Check** (FIRST GATE)
**File:** `src/agent/auto-reply/index.js:619-634`

```javascript
// CRITICAL: Check for website/webpage requests FIRST
const isWebsiteRequest = /\b(website|webpage|web page|landing page|web site|html page|front page|home page)\b/i.test(String(goal || ''));

const mediaFastPathHeuristic = isWebsiteRequest ? false : (() => {
  const hasAction = /\b(create|make|generate|...)\b/i.test(q);
  const hasMedia = /\b(photo|image|picture|...)\b/i.test(q);
  return mediaEarlyTrigger || (hasAction && hasMedia);
})();

const photoVideoPattern = isWebsiteRequest 
  ? null  // Skip media pattern matching for website requests
  : (mediaFastPathHeuristic ? [goal] : goal.match(/...regex.../));
```

**Key Logic:**
- ✅ If request contains website keywords → `isWebsiteRequest = true`
- ✅ `mediaFastPathHeuristic` → Returns `false`
- ✅ `photoVideoPattern` → Set to `null`
- ✅ Media fast-path is **SKIPPED**

**Log Output:**
```
[AutoReply] Media fast-path check: {
  mediaFastPathHeuristic: false,
  regexMatched: false,
  preview: 'Create a beautiful HTML landing page...'
}
```

### 3. **Task Type Detection** (SECOND GATE)
**File:** `src/agent/specialists/MultiAgentCoordinator.js:65-74`

```javascript
detectTaskType(userMessage, context = {}) {
  const message = userMessage.toLowerCase();
  
  // CRITICAL: Check for webpage/website/landing page requests FIRST
  const hasWebpageKeywords = /\b(landing page|webpage|website|html page|html file|web page|web site)\b/i.test(message);
  if (hasWebpageKeywords) {
    console.log('[Coordinator] HTML/webpage request detected → routing to code_generation');
    return 'code_generation';
  }
  
  // ... rest of detection logic
}
```

**Key Logic:**
- ✅ Webpage detection happens **FIRST** (before any other patterns)
- ✅ If webpage keywords detected → Returns `'code_generation'`
- ✅ Prevents other patterns from overriding

**Log Output:**
```
[Coordinator] HTML/webpage request detected → routing to code_generation
[AutoReply] Detected task type: code_generation
```

### 4. **Specialist Routing Decision** (THIRD GATE)
**File:** `src/agent/auto-reply/index.js:2634-2649`

```javascript
const requiresToolExecution = [
  'data_generation',
  'code_generation',  // ← Website requests need planning/execution
  'system_design',
  'web_research'
];

const needsTools = requiresToolExecution.includes(taskType);

if (needsTools) {
  console.log(`[AutoReply] Task type ${taskType} requires tools - skipping auto_reply specialist`);
  console.log(`[AutoReply] Continuing directly to planning and execution`);
  return null; // Let AgenticAgent handle planning and execution
}
```

**Key Logic:**
- ✅ `code_generation` is in `requiresToolExecution` array
- ✅ Skips specialist (no LLM hallucination)
- ✅ Returns `null` to continue to planning

**Log Output:**
```
[AutoReply] Task type code_generation requires tools - skipping auto_reply specialist
[AutoReply] Continuing directly to planning and execution
```

### 5. **Planning Phase**
**File:** `src/agent/AgenticAgent.js`

- Receives `null` from auto_reply
- Proceeds to planning with unified context
- LLM generates plan with `write_code` actions
- Creates tasks for HTML/CSS/JS file generation

**Log Output:**
```
[AgenticAgent] DEBUG autoReplyResult: null
[AgenticAgent] Using unified context for planning
```

### 6. **Execution Phase**
**File:** `src/agent/code-act.js`

- Executes `write_code` actions
- Creates HTML/CSS/JS files in workspace
- Scans workspace for created files
- Populates `filesWithVersions` for UI preview

### 7. **Summary Phase**
**File:** `src/agent/AgenticAgent.js`

- Generates user-friendly summary
- Masks technical details (no `.py` files mentioned)
- Returns file list for UI display

**Log Output:**
```
✅ Built you a sleek landing page with hero section, nav bar, and CTA button!
```

---

## Critical Success Factors

### 1. **Order of Checks Matters**
- Media fast-path check must happen **BEFORE** task type detection
- Webpage detection must happen **FIRST** in `detectTaskType()`
- If order is wrong, other patterns can override

### 2. **Exclusion Logic**
- `isWebsiteRequest` check prevents media fast-path from triggering
- Setting `photoVideoPattern = null` ensures no video generation
- Early return in `detectTaskType()` prevents fallback routing

### 3. **Tool Execution Flag**
- `code_generation` must be in `requiresToolExecution` array
- This ensures website requests skip specialist and go to planning
- Prevents LLM hallucination of file creation

---

## Common Pitfalls (Avoided)

### ❌ **Pitfall 1: Media Fast-Path Hijacking**
**Problem:** Regex matches "make a website with a large image"  
**Solution:** Check `isWebsiteRequest` FIRST and set `photoVideoPattern = null`

### ❌ **Pitfall 2: Late Webpage Detection**
**Problem:** Webpage detection in `intelligentFallbackRouting()` (called last)  
**Solution:** Move webpage detection to BEGINNING of `detectTaskType()`

### ❌ **Pitfall 3: Specialist Hallucination**
**Problem:** Specialist generates fake HTML instead of real files  
**Solution:** Include `code_generation` in `requiresToolExecution` to skip specialist

---

## File Locations

### Files Modified for This Fix:
1. **`src/agent/auto-reply/index.js`**
   - Lines 619-634: Media fast-path exclusion logic
   - Lines 2634-2649: Tool execution routing

2. **`src/agent/specialists/MultiAgentCoordinator.js`**
   - Lines 68-74: Early webpage detection

### Files Involved in Routing:
- `src/agent/AgenticAgent.js` - Main agent orchestration
- `src/agent/code-act.js` - Code execution and file creation
- `src/agent/auto-reply/index.js` - Fast-path and specialist routing
- `src/agent/specialists/MultiAgentCoordinator.js` - Task type detection

---

## Testing

### To Verify Routing Works:
```bash
node test_grace_live.js test "Phi-4"
```

### Expected Log Sequence:
1. `[AutoReply] Media fast-path check: { mediaFastPathHeuristic: false }`
2. `[Coordinator] HTML/webpage request detected → routing to code_generation`
3. `[AutoReply] Task type code_generation requires tools - skipping auto_reply specialist`
4. `[AutoReply] Continuing directly to planning and execution`
5. `✅ Built you a sleek landing page...`

### Red Flags (Indicates Broken Routing):
- `🎬 Generating video...` - Media fast-path triggered incorrectly
- `[Coordinator] No specialist detected → routing to general_chat` - Webpage detection failed
- Specialist generates HTML text instead of files - Missing tool execution flag

---

## Maintenance Notes

### When Adding New Website Keywords:
Update BOTH locations:
1. `auto-reply/index.js:620` - `isWebsiteRequest` regex
2. `MultiAgentCoordinator.js:70` - `hasWebpageKeywords` regex

### When Modifying Media Fast-Path:
Ensure `isWebsiteRequest` check happens BEFORE any regex matching.

### When Changing Task Types:
If adding new task types that need tool execution, add them to `requiresToolExecution` array.

---

**Last Updated:** January 6, 2026  
**Status:** ✅ Working correctly for landing page and website requests
