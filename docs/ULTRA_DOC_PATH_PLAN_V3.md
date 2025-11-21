# Ultra Doc Path – v3 Implementation Plan

**Status:** Ready for implementation  
**Scope:** AUTO mode Word/Excel doc requests with typo resilience  
**Date:** 2025-11-20

---

## Core Design Principles

1. **Decoupled Normalization:** `run.js` and `auto_reply` each do their own normalization independently
2. **Clean Fallback:** Ultra schema fail → `return null` → full agentic flow (not dead error)
3. **Guaranteed finish_summery:** Ultra success always hits `finish_action()` in CodeAct
4. **Grace-style messaging:** No todo lists in Ultra, just natural progress blips

---

## 1. Routing Layer – Doc Bias (run.js)

### Location
- **File:** `src/routers/agent/run.js`
- **Area:** AUTO mode intent logic around lines ~317–364

### Add Helper Functions (near top of file, ~lines 40-80)

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

## 2. Ultra Fast-Path – Local Normalization (auto-reply/index.js)

### Location
- **File:** `src/agent/auto-reply/index.js`
- **Area:** Ultra block around `simpleFileGenPattern` (~line 387)

### Add Local Helper (near top of Ultra block)

```js
function normalizeGoalTextLocal(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.toLowerCase().trim();
  s = s.replace(/([a-z])\1{2,}/g, '$1'); // okkkk → ok
  
  const replacements = [
    [/makeme/g, 'make me'],
    [/wr?d+d?oc+ument|wr?d+doc+ument|docu?ment/gi, 'word document'],
    [/docx?/gi, 'docx'],
    [/exel|xlxs|spreedsheet|spreadhseet/gi, 'excel'],
    [/\bwerd\b/gi, 'word'],
    [/\bdok\b/gi, 'doc'],
    [/\bu\b/g, 'you'],
  ];
  
  for (const [pattern, rep] of replacements) s = s.replace(pattern, rep);
  return s.replace(/\s+/g, ' ');
}
```

### Use Normalized Goal in Ultra Detection (~line 387)

```js
// OLD:
// const simpleFileGenPattern = goal.match(/...regex.../i);

// NEW:
const normalizedGoal = normalizeGoalTextLocal(goal);
const simpleFileGenPattern = normalizedGoal.match(/...existing Ultra regex.../i);
```

**Why:** Ultra now benefits from same typo resilience as routing, but stays **decoupled** (no shared context variable).

---

## 3. Fallback Semantics – Schema Fail → Full Agent

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

## 4. Guaranteed `finish_summery` Emission

### Location
- **File:** `src/agent/code-act/code-act.js`
- **Area:** Multi-action execution block (~lines 428–543)

### Current State
Ultra uses `preGeneratedAction` → multi-action path in CodeAct → should hit `finish_action()`.

### QA Check (no changes needed if already working)

Ensure this block always executes for Ultra:

```js
if (actions.length > 1 && task.preGeneratedAction) {
  // Execute write_code, then terminal_run
  // Scan conversation dir for new .docx/.xlsx
  // Build summary (filter out .py files)
  // Send plan message
  
  if (allActionsSucceeded) {
    await finish_action(/* ... */);  // ← Emits finish_summery SSE
  }
}
```

**Optional enhancement** (if Ultra sometimes doesn't hit finish_action):

```js
// If Ultra task created files, send finish_summery even if allActionsSucceeded is false
if (task.isUltraDoc && context.generate_files && context.generate_files.length > 0) {
  await finish_action(/* ... with degraded summary if needed */);
}
```

---

## 5. Grace-Style Messaging (No Todo Lists for Ultra)

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

## 6. Frontend – Message Prop Types (Diagnostic Only)

### Current State

- `Message.vue` expects `message: Object` ✅
- `ChatMessages.vue` passes `message` as Object ✅

### Implementation Step

**Do NOT blindly change prop types.**

1. Run Ultra test with browser DevTools open
2. Capture any actual Vue warnings (component name, prop, expected/received)
3. Fix the **real source** (likely a wrapper or meta formatting issue)
4. Verify `finish_summery` message shape matches other messages

**Files to inspect if issues arise:**

- `frontend/src/view/lemon/message/Message.vue`
- `frontend/src/view/lemon/components/ChatMessages.vue`
- `frontend/src/services/chat.js`
- `frontend/src/store/modules/chat.js`

---

## 7. Test Validation Protocol

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
