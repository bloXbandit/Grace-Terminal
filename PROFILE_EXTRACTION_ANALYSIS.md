# Profile Extraction Flow Analysis

**Date**: 2025-10-23 4:24pm UTC-04:00
**Purpose**: Analyze profile extraction calls across all 3 modes to identify duplicate calls

---

## Architecture Overview

### Endpoints & Modes
- **`POST /api/agent/chat`** → `src/routers/agent/chat.js` → **CHAT mode only**
- **`POST /api/agent/run`** → `src/routers/agent/run.js` → **TASK & AUTO modes**

### Profile Extraction Function
- **Location**: `src/agent/profile/extract.js`
- **Function**: `extractProfileFromMessage(user_id, user_message, conversation_id)`
- **Purpose**: Extract user profile info from messages (runs in background)
- **Timeout**: 2 seconds (wrapped in Promise.race)

---

## Mode 1: CHAT Mode

### Endpoint: `/api/agent/chat`
**File**: `src/routers/agent/chat.js`

### Profile Extraction Calls:
1. **Line 162**: Single call after mode command check
```javascript
await Promise.race([
  extractProfileFromMessage(user_id, question, conversation_id),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Profile extraction timeout')), 2000)
  )
]);
```

### Flow:
```
User sends "hi" in CHAT mode
  ↓
POST /api/agent/chat
  ↓
Mode command check (line 44)
  ↓
Profile extraction (line 162) ← SINGLE CALL
  ↓
LLM chat completion (line 214)
  ↓
Response streamed to user
```

**✅ CHAT MODE: 1 profile extraction call (CORRECT)**

---

## Mode 2: TASK Mode

### Endpoint: `/api/agent/run` with `mode='task'`
**File**: `src/routers/agent/run.js`

### Profile Extraction Calls:
1. **Line 232**: First call (labeled "[Task]")
```javascript
// CRITICAL FIX: Synchronous profile extraction with timeout to prevent race conditions
try {
  await Promise.race([
    extractProfileFromMessage(ctx.state.user.id, question, conversation_id),
    ...
  ]);
  console.log('[Task] Profile extraction completed successfully');
}
```

2. **Line 293**: Second call (labeled "[Auto]") 
```javascript
// CRITICAL FIX: Synchronous profile extraction with timeout - ALL MODES
try {
  await Promise.race([
    extractProfileFromMessage(ctx.state.user.id, question, conversation_id),
    ...
  ]);
  console.log('[Auto] Profile extraction completed successfully');
}
```

### Flow:
```
User sends task in TASK mode
  ↓
POST /api/agent/run (mode='task')
  ↓
Profile extraction #1 (line 232) ← FIRST CALL
  ↓
Mode determination (lines 242-283)
  ↓
Profile extraction #2 (line 293) ← SECOND CALL (DUPLICATE!)
  ↓
Task execution via AgenticAgent
  ↓
Response streamed to user
```

**❌ TASK MODE: 2 profile extraction calls (DUPLICATE!)**

---

## Mode 3: AUTO Mode

### Endpoint: `/api/agent/run` with `mode='auto'`
**File**: `src/routers/agent/run.js`

### Profile Extraction Calls:
1. **Line 232**: First call (labeled "[Task]")
2. **Line 293**: Second call (labeled "[Auto]")

### Flow:
```
User sends message in AUTO mode
  ↓
POST /api/agent/run (mode='auto')
  ↓
Profile extraction #1 (line 232) ← FIRST CALL
  ↓
Intent detection (chat vs agent) (lines 244-273)
  ↓
Profile extraction #2 (line 293) ← SECOND CALL (DUPLICATE!)
  ↓
Route to chat or agent based on intent
  ↓
Response streamed to user
```

**❌ AUTO MODE: 2 profile extraction calls (DUPLICATE!)**

---

## Summary

| Mode | Endpoint | Profile Extraction Calls | Status |
|------|----------|-------------------------|--------|
| **CHAT** | `/api/agent/chat` | 1 call (line 162) | ✅ CORRECT |
| **TASK** | `/api/agent/run` | 2 calls (lines 232, 293) | ❌ DUPLICATE |
| **AUTO** | `/api/agent/run` | 2 calls (lines 232, 293) | ❌ DUPLICATE |

---

## Root Cause Analysis

### Why Two Calls in run.js?

Looking at the code structure:

```javascript
// Line 229-240: FIRST CALL (before mode determination)
// Comment says "to prevent race conditions"
await extractProfileFromMessage(...);

// Lines 242-283: Mode determination logic
if (mode === 'auto') {
  // Intent detection
} else {
  // User specified mode
}

// Lines 290-301: SECOND CALL (after mode determination)
// Comment says "ALL MODES"
await extractProfileFromMessage(...);
```

### Hypothesis:
The **first call (line 232)** was added to extract profile **before** mode determination.
The **second call (line 293)** was added to ensure profile extraction happens for **all modes**.

This resulted in **BOTH calls executing** for TASK and AUTO modes.

---

## Impact Analysis

### Current Behavior (User sends "hi" in UI):
- **CHAT mode**: 1 profile extraction + 1 chat response = **2 LLM calls**
- **TASK mode**: 2 profile extractions + 1 task response = **3 LLM calls**
- **AUTO mode**: 2 profile extractions + 1 response = **3 LLM calls**

### Observed Logs:
```
[LLM Stream] First chunk received: data: {"id":"gen-1761249302-3wYcIjvNYX0PI8kmDx38"...
(repeated 25 times)
```

**25 chunks = Multiple concurrent LLM calls from:**
- Main response (1 call)
- Profile extraction #1 (1 call)
- Profile extraction #2 (1 call)
- Possibly more from multi-agent coordination

---

## Recommendations

### Option 1: Remove First Call (Line 232)
**Pros**: 
- Simplest fix
- Keeps profile extraction for all modes (line 293)
- Reduces API calls by 33%

**Cons**:
- Loses "race condition prevention" mentioned in comment
- Need to verify what race condition was being prevented

### Option 2: Remove Second Call (Line 293)
**Pros**:
- Keeps the "race condition prevention" logic
- Profile extraction happens early

**Cons**:
- Comment says "ALL MODES" - might have been intentional
- Need to verify all modes still work

### Option 3: Add Deduplication Check
**Pros**:
- Safest approach
- Prevents duplicate calls even if code structure changes

**Cons**:
- More complex
- Adds state management

---

## Recommended Action

**Remove the SECOND call (line 293)** because:
1. The FIRST call (line 232) already runs for all modes
2. The comment "ALL MODES" is misleading - it runs AFTER mode determination
3. The FIRST call happens earlier, which is better for race condition prevention
4. Reduces unnecessary API calls and potential 400 errors

**Code to Remove**: Lines 290-301 in `src/routers/agent/run.js`
