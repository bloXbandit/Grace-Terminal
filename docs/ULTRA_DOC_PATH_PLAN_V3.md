# Ultra Doc Path – v3 Implementation Plan (REVISED)

**Status:** REVISING after post-implementation analysis  
**Scope:** AUTO mode Word/Excel doc requests with typo resilience  
**Date:** 2025-11-20 (Revised after testing)

---

## CRITICAL REALIZATIONS FROM TESTING

### ❌ What We Got Wrong Initially:
1. **Routing was NOT the problem** - `detect_intent()` LLM already handles typos perfectly for routing to agent mode
2. **We over-engineered routing** - Adding regex-based `isDocLike()` BEFORE `detect_intent()` created a bypass that missed typos
3. **The real problem**: Once in agent mode, Ultra's `simpleFileGenPattern` regex in `auto_reply` is too strict

### ✅ What Actually Needs Fixing:
1. **Ultra detection in auto_reply** - Add normalization ONLY here (line ~387)
2. **Python JSON marshaling bug** - CRITICAL: Don't escape JSON for direct Python embedding
3. **UI message handling** - Better handling of execution failures and retry loops
4. **Fallback semantics** - Return `null` on schema fail (already correct in existing code)

### 🔍 Actual Architecture:
```
AUTO Mode Request
    ↓
detect_intent() LLM ← Already handles ALL typos, no changes needed
    ↓
intent = 'agent' or 'chat'
    ↓
AgenticAgent.run()
    ↓
auto_reply() fast-path check
    ↓
simpleFileGenPattern regex ← THIS is where typos break (needs normalization)
    ↓
Ultra path or fallback to planner
```

---

## Core Design Principles (REVISED)

1. **Don't break existing spell-check:** `detect_intent()` LLM already handles routing typos - leave it alone
2. **Normalize ONLY in Ultra block:** Add local normalization in `auto_reply` for regex matching
3. **Fix Python JSON bug:** Use `json.loads()` with raw strings, NOT direct string escaping
4. **Clean Fallback:** Ultra schema fail → `return null` → full agentic flow
5. **Better UI handling:** Improve error messaging and retry loop UX

---

## 1. ~~Routing Layer – Doc Bias (run.js)~~ [REMOVED - NOT NEEDED]

**DECISION:** Remove the routing layer changes entirely.

### Why Remove?
- `detect_intent()` LLM at line 398 already handles typos perfectly
- Adding regex-based `isDocLike()` check BEFORE the LLM creates a brittle bypass
- Typo-heavy requests that miss the regex fall through to `detect_intent()` anyway
- No benefit, just adds complexity and potential for routing misses

### Original Routing Layer Helpers (DO NOT IMPLEMENT)

```js
function normalizeGoalText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.toLowerCase().trim();
  
  // Collapse 3+ repeated letters: okkkk → ok
  s = s.replace(/([a-z])\1{2,}/g, '$1');
  
  const replacements = [
    [/makeme/g, 'make me'],
    [/wr?d+d?oc+ument|wr?d+doc+ument|docu?ment/gi, 'word document'],
    [/docx?/gi, 'docx'],
    [/exel|xlxs|spreedsheet|spreadhseet/gi, 'excel'],
    [/\bwerd\b/gi, 'word'],   // typo: werd → word
    [/\bdok\b/gi, 'doc'],     // typo: dok → doc
    [/\bu\b/g, 'you'],
  ];
  
  for (const [pattern, rep] of replacements) {
    s = s.replace(pattern, rep);
  }
  
  return s.replace(/\s+/g, ' ');
}

function isDocLike(normalizedGoal) {
  // Exclude multi-step / infrastructure requests
  const hasMultiStepVerbs = /\b(deploy|monitor|automate|pipeline|scrape|crawler|cron|api|service|ci|cd|kubernetes|docker compose|research.*then|first.*then)\b/.test(normalizedGoal);
  
  if (hasMultiStepVerbs) {
    return { wordDoc: false, excel: false, isMultiStep: true };
  }
  
  // Doc/Excel detection
  const hasDocToken = /\b(word document|word doc|docx|report|document)\b/.test(normalizedGoal);
  const hasExcelToken = /\b(excel|spreadsheet|xlsx)\b/.test(normalizedGoal);
  const hasMakeCreateWrite = /\b(make|create|write|generate|draft)\b/.test(normalizedGoal);
  const hasTopicPhrase = /\babout\b/.test(normalizedGoal) || /\bfor\b/.test(normalizedGoal);
  
  return {
    wordDoc: hasDocToken && hasMakeCreateWrite && hasTopicPhrase,
    excel: hasExcelToken && hasMakeCreateWrite,
    isMultiStep: false,
  };
}
```

### Integrate into AUTO Mode Logic (~lines 317-354)

```js
if (mode === 'auto') {
  if (files && files.length > 0) {
    // existing: file upload forces agent
    intent = 'agent';
  } else {
    // NEW: Doc-bias for AUTO mode
    const norm = normalizeGoalText(question);
    const docIntent = isDocLike(norm);
    
    if (docIntent.wordDoc || docIntent.excel) {
      console.log('[AUTO] Doc-like intent detected → agent mode', docIntent);
      intent = 'agent';  // Forces AgenticAgent → auto_reply → Ultra path
      // NO context.normalizedGoal passed – keep routing decoupled
    } else {
      // Existing detect_intent(...) behavior for non-doc requests
      intent = detect_intent(question, /* ... */);
    }
  }
}
```

**Key:** This only biases routing to `'agent'` mode. Ultra detection happens independently in `auto_reply`.

---

## 2. Ultra Fast-Path – Local Normalization (auto-reply/index.js) ✅

### Location
- **File:** `src/agent/auto-reply/index.js`
- **Area:** Ultra block around `simpleFileGenPattern` (~line 387)

### Add Local Helper (near top of Ultra block)

```js
// Ultra Doc Path: Local normalization for typo-resilient regex matching
const normalizeGoalTextLocal = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.toLowerCase().trim();
  
  // Collapse 3+ repeated letters: okkkk → ok, doocument → document
  s = s.replace(/([a-z])\1{2,}/g, '$1');
  
  // AGGRESSIVE typo replacements for common misspellings
  const replacements = [
    [/makeme/g, 'make me'],
    [/\bmakke\b/g, 'make'],           // makke → make
    [/\bdoocument\b/g, 'document'],   // doocument → document
    [/\bwr?d+d?oc+ument\b/gi, 'word document'],
    [/\bdocx?\b/gi, 'docx'],
    [/\bexel\b/gi, 'excel'],          // exel → excel
    [/\bxlxs\b/gi, 'xlsx'],           // xlxs → xlsx
    [/\bspreedsheet\b/gi, 'spreadsheet'],
    [/\bwerd\b/gi, 'word'],           // werd → word
    [/\bdok\b/gi, 'doc'],             // dok → doc
    [/\byouo?\b/g, 'you'],            // youo → you
    [/\bu\b/g, 'you'],                // u → you
  ];
  
  for (const [pattern, rep] of replacements) {
    s = s.replace(pattern, rep);
  }
  
  return s.replace(/\s+/g, ' ').trim();
};
```

### Use Normalized Goal in Ultra Detection (~line 408)

```js
// OLD:
// const simpleFileGenPattern = goal.match(/...regex.../i);

// NEW:
const normalizedGoal = normalizeGoalTextLocal(goal);
const simpleFileGenPattern = normalizedGoal.match(/(?:can you |could you |would you |please |lets |let's |lemme |i wanna |i want to |i want |i need |make me |give me |build me |get me |help me )?(?:(create|make|generate|write|build|produce|draft)(?:\s+\w+){0,3}\s+)?(a |an |the |me |some )?(?:new )?(word document|word doc|excel file|spreadsheet|docx|excel|xlsx)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?|(?:document|doc)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?/i);
```

**Why:** Ultra regex now matches normalized text, catching typos like "makke", "doocument", "youo" that `detect_intent()` routed here.

**Key Difference from Routing:** We DON'T bypass `detect_intent()` - we just make Ultra's regex more forgiving once we're IN agent mode.

---

## 3. Python JSON Marshaling Fix – CRITICAL BUG ⚠️

### Location
- **File:** `src/agent/auto-reply/index.js`
- **Area:** Python script generation for DOCX (~line 646, 690)

### ❌ WRONG APPROACH (DO NOT DO THIS):

```js
// BAD: Escaping JSON string for direct Python embedding
const pythonEscape = (str) => {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')    // ← This breaks when used with JSON.stringify()
    .replace(/'/g, "\\'");
};

const sectionsPython = pythonEscape(JSON.stringify(schema.sections));

// Creates invalid Python:
// sections = [{"heading":"...", "body":"{\\n \\"title\\"..."}]
//                                            ^^^ SyntaxError
```

### ✅ CORRECT APPROACH:

```js
// GOOD: Use Python's json module to parse JSON string
const sectionsJSON = JSON.stringify(schema.sections);

const pyDocScript = 
  "import sys\n" +
  "import os\n" +
  "import json\n" +  // ← Add json import
  "sys.path.append('/usr/local/lib/python3.11/site-packages')\n" +
  "from docx import Document\n" +
  "from docx.shared import Pt, RGBColor\n" +
  "from docx.enum.text import WD_PARAGRAPH_ALIGNMENT\n" +
  "import re\n" +
  "\n" +
  "def sanitize_text(text):\n" +
  "    return text.replace('\\x00', '')\n" +
  "\n" +
  "# LLM-generated UltraDocumentSchema\n" +
  "title = '''{{TITLE}}'''\n" +
  "sections_json = '''{{SECTIONS_JSON}}'''\n" +  // ← Triple-quoted raw string
  "sections = json.loads(sections_json)\n" +     // ← Parse with json.loads()
  "\n" +
  "doc = Document()\n" +
  "# ... rest of DOCX generation\n";

// Replace placeholders
pyDocScript = pyDocScript
  .replace('{{TITLE}}', schema.title)
  .replace('{{SECTIONS_JSON}}', sectionsJSON);
```

**Why This Works:**
- Triple-quoted strings in Python preserve all quotes and backslashes literally
- `json.loads()` handles all escaping properly
- No need for manual character escaping

**Critical Note:** The `pythonEscape()` function should ONLY be used for simple string literals (title, author), NOT for JSON structures.

---

## 4. Fallback Semantics – Schema Fail → Full Agent

### Location
- **File:** `src/agent/auto-reply/index.js`
- **Area:** Ultra block, LLM/JSON error handling

### Current Behavior
When Ultra can't parse schema or build reliable content, it currently might return generic fallback.

### New Behavior (CRITICAL)

**Schema/LLM hard fail (before code exists):**

```js
// After attempting to parse/salvage JSON schema
if (!schema || !schema.sections || schema.sections.length === 0) {
  console.log('[AutoReply][Ultra] Schema unusable – returning null for full agentic fallback');
  return null;  // ← NOT handledBySpecialist: true
}
```

**Why `null` and not `handledBySpecialist`?**

- `return null` → `AgenticAgent` proceeds to full planning + specialists + CodeAct
- `return { handledBySpecialist: true, result: '...' }` → execution STOPS with a dead error message

**Result:** User gets full agentic flow (slower but functional) instead of a dead end.

### Runtime Execution Fail

If Ultra successfully generates code but Python/terminal fails:

- Handled by existing **CodeAct retry/reflection** loop
- No new fallback logic needed

---

## 5. UI Message Handling – Fix Retry Loops and Error UX

### Problem
When Ultra Python script fails:
1. CodeAct retry mechanism kicks in (3 attempts)
2. Each retry creates new `write_code` action
3. User sees looping "File written successfully" messages for `.py` files
4. After 3 failures: "Task exception terminated: max consecutive execution failures"
5. `finish_summery` never emitted → UI hangs or shows incomplete state

### Location
- **File:** `src/agent/code-act/code-act.js`
- **Area:** Multi-action execution and error handling (~lines 428-570)

### Solution A: Better Error Messages for Ultra Failures

```js
if (actions.length > 1 && task.preGeneratedAction) {
  // ... execute actions ...
  
  if (!allActionsSucceeded) {
    console.log('[CodeAct] Ultra multi-action failed - sending user-friendly error');
    
    // Send graceful failure message instead of raw Python errors
    const errorMessage = Message.format({
      status: 'failure',
      task_id: task.id,
      action_type: 'progress',
      content: 'I encountered an issue creating that document. Let me try a different approach...',
      meta: { action_type: 'progress' }
    });
    
    if (context.onTokenStream) {
      context.onTokenStream(errorMessage);
    }
    
    // Return null to trigger full agentic fallback
    return null;
  }
  
  // Success path - existing finish_action() call
  if (allActionsSucceeded) {
    await finish_action(finishAction, contextWithTask, task.id);
    return result;
  }
}
```

### Solution B: Suppress .py File Messages in Ultra Path

The masking logic already exists but may not be catching all cases:

```js
// CRITICAL: Mask /workspace/... Python file success messages from UI
if (action_result.content && /^File \/workspace\/.*\.py written successfully\.?\s*$/.test(action_result.content)) {
  console.log('[CodeAct] Masking Python file success message from UI (multi-action)');
  action_result.content = ''; // Hide from UI stream
}
```

**Verify this regex catches all variations** of the success message.

### Solution C: Reduce Retry Count for Ultra

Ultra is meant to be fast-path. If it fails, fall back immediately instead of retrying 3 times:

```js
// In CodeAct error handling
if (task.preGeneratedAction && task.isUltraDoc) {
  console.log('[CodeAct] Ultra fast-path failed - immediate fallback, no retry');
  maxRetries = 0;  // Don't retry Ultra, just fall back to planner
}
```

---

## 6. Guaranteed `finish_summery` Emission ✅

### Current State
Ultra uses `preGeneratedAction` → multi-action path in CodeAct → already hits `finish_action()` at line ~541.

### QA Verification (no changes needed)

The existing code at lines 465-542 already:
- Executes all actions sequentially
- Scans for new .docx/.xlsx files
- Builds summary message
- Sends plan message via `onTokenStream`
- Calls `finish_action()` which emits `finish_summery`

**Status:** ✅ Already correct, verified in code review.

---

## 7. Grace-Style Messaging (No Todo Lists for Ultra)

### 5.1 Ultra JSON Prompt (auto-reply/index.js)

**Location:** Ultra JSON schema prompt block (~lines 461–485)

**Add instruction:**

```js
const prompt = `
You are Grace, creating a ${isWordDoc ? 'Word document' : 'Excel spreadsheet'}.

DO NOT explain your plan. NO bullet lists or todo items.
Just generate the structured content directly (title + sections).

${/* rest of existing prompt */}
`;
```

### 5.2 Ultra Skip-Planning Progress Message (AgenticAgent.js)

**Location:** `_performPlanning()` skip-planning block (~lines 321–357)

**Current message:**

```js
sendProgressMessage('On it! Creating your document now...');
```

**✅ Already Grace-y.** Just ensure it doesn't include plan/todo formatting.

### 5.3 Generic Planner (Non-Ultra)

**No changes.** Full agentic flows can still use structured plans; we only suppress them for Ultra fast-path.

---

## 8. Frontend – Vue Prop Type Warnings (Low Priority)

### Observed Warnings

```
[Vue warn]: Invalid prop: type check failed for prop "message". Expected Array, got Object
[Vue warn]: Invalid prop: type check failed for prop "content". Expected String, got Array
```

### Status
**Pre-existing issue, NOT caused by v3 implementation.**

### Diagnosis Needed

These warnings appear throughout the UI, not just in Ultra path. Likely causes:
1. Some Vue components incorrectly define `message` prop as `Array` when it should be `Object`
2. Some components define `content` prop as `String` when it receives `Array` (multi-line content)

### Implementation Step

**Do NOT fix blindly - requires systematic audit:**

1. Run any flow (not just Ultra) with browser DevTools open
2. Capture exact component names and prop types from warnings
3. Audit frontend component prop definitions:
   - `frontend/src/components/Message/`
   - `frontend/src/components/ChatMessages/`
   - Message wrapper components
4. Fix prop type definitions to match actual data structures
5. Verify all message types (chat, progress, action, finish_summery) work correctly

**Priority:** Low - these are warnings only, functionality works despite type mismatches.

---

- `frontend/src/view/lemon/message/Message.vue`
- `frontend/src/view/lemon/components/ChatMessages.vue`
- `frontend/src/services/chat.js`
- `frontend/src/store/modules/chat.js`

---

## 9. Implementation Summary (REVISED)

### What Changed from Original v3 Plan?

**❌ REMOVED:** Routing layer normalization in `run.js`
- **Why:** `detect_intent()` LLM already handles typos perfectly
- **Result:** Simpler architecture, no routing regression

**✅ KEPT:** Ultra block normalization in `auto_reply/index.js`
- **Why:** This is where typos actually break (regex matching)
- **Result:** Ultra catches typo-heavy doc requests

**✅ ADDED:** Python JSON marshaling fix
- **Critical bug discovered during testing**
- **Solution:** Use `json.loads()` instead of direct string escaping

**✅ ADDED:** UI error handling improvements
- **Problem:** Retry loops and confusing error messages
- **Solution:** Better failure UX, reduced Ultra retries

### Files to Modify (REVISED LIST)

1. **src/agent/auto-reply/index.js** - ONLY file that needs changes:
   - Add `normalizeGoalTextLocal()` helper (~line 388)
   - Use normalized goal for Ultra regex matching (~line 408)
   - Fix Python script to use `json.loads()` (~line 690)
   - Ensure schema-fail returns `null` (~line 625)

2. **src/agent/code-act/code-act.js** - Optional UI improvements:
   - Better error messages for Ultra failures
   - Reduce retry count for Ultra fast-path

3. **~~src/routers/agent/run.js~~** - **NO CHANGES NEEDED**
   - Keep `detect_intent()` LLM intact
   - Don't add routing normalization

### Priority Order

1. **Fix Python JSON bug** (blocking all Ultra)
2. **Add Ultra normalization** (typo handling)
3. **Improve UI error handling** (UX)
4. **Vue prop types audit** (low priority warnings)

---

## 10. Test Validation Protocol

### 7.1 Backend Validation

```bash
make validate
```

### 7.2 Automated Ultra Tests

```bash
node test_grace_live.js test auto
```

**Test cases:**

1. `"can you makeme a wrddoccument about apple farming"`
2. `"okkkk so like uhhh can u mayb mak a werd dok bout farming or smth?"`
3. `"Create an Excel spreadsheet with quarterly sales data"`

**Expected:**

- No `HANG DETECTED`
- Stream includes: `write_code` → `terminal_run` → `finish_summery`
- File created in workspace with proper extension

### 7.3 Manual UI Test

**Prompt:** `"can you makeme a wrddoccument about apple farming"`

**Verify:**

- ✅ Natural progress message (no todo list)
- ✅ `.docx` file appears in workspace
- ✅ Final bubble stable and visible
- ✅ No Vue warnings in browser console
- ✅ No conversation bleed between sessions

---

## 8. Implementation Order

### Phase 1: Routing (Low Risk)

1. Add `normalizeGoalText` + `isDocLike` to `run.js`
2. Integrate doc-bias into AUTO mode logic
3. Test: verify doc requests route to `intent = 'agent'`

### Phase 2: Ultra Hardening (Medium Risk)

1. Add `normalizeGoalTextLocal` to `auto_reply`
2. Wire `simpleFileGenPattern` to use normalized goal
3. Update schema-fail paths to `return null` (not `handledBySpecialist`)
4. Test: run `test_grace_live.js` with typo-heavy prompts

### Phase 3: Finish & UI (QA Focus)

1. Verify `finish_action()` always called for Ultra success
2. Run browser test, capture any Vue warnings
3. Fix real prop-type issues if found
4. Final validation: all anchor scenarios pass

---

## 9. Example Flow Walkthrough

**Input:** `"okkkk so like uhhh can u mayb mak a werd dok bout farming or smth?"`

### Step 1: Routing (`run.js`)

- `normalizeGoalText` → `"ok so like uh can you maybe make a word doc about farming or something"`
- `isDocLike` → `{ wordDoc: true, isMultiStep: false }`
- AUTO mode → `intent = 'agent'`

### Step 2: Auto-Reply (`auto-reply/index.js`)

- `normalizeGoalTextLocal` → same normalized string
- `simpleFileGenPattern` matches: prefix ("can you"), verb ("make"), type ("word doc")
- Ultra fires → LLM JSON → Python script → `preGeneratedAction`

### Step 3: Planning (`planning/index.js`)

- Detects `preGeneratedAction`
- Builds 2 tasks: `write_code`, `terminal_run`

### Step 4: Execution (`code-act/code-act.js`)

- Executes both actions
- Scans conversation dir → finds `Farming_Overview.docx`
- Calls `finish_action()` → emits `finish_summery` SSE

### Step 5: Frontend

- Receives `finish_summery` message as Object
- `Message.vue` renders file list + success message
- No hang, no warnings ✅

---

## 10. Key Corrections from v2

| Issue | v2 Approach | v3 Fix |
|-------|-------------|--------|
| Normalization coupling | Pass `context.normalizedGoal` from run.js | Each layer does own normalization independently |
| Ultra schema fail | Return `handledBySpecialist` error | Return `null` → full agentic fallback |
| "word doc" vs "word document" | Only matched "word document" | Now matches both in regex |
| werd/dok typos | Not handled | Added to replacement table |
| "Try once" complexity | Cross-layer state management | Keep fallback local to `auto_reply` |

---

## Summary

This v3 plan:

- ✅ Keeps routing and Ultra **decoupled** (no shared context)
- ✅ Provides **clean fallback** to full agent (not dead errors)
- ✅ Handles **extreme typos** (`"okkkk werd dok"`) via aggressive normalization
- ✅ Guarantees **`finish_summery`** emission for Ultra success
- ✅ Maintains **Grace-style UX** (no todo lists, natural messaging)
- ✅ Aligned with existing **GRACE_REQUEST_FLOW_MAP.md**

Ready for implementation.