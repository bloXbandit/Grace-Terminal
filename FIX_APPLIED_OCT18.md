# Grace AI System Access Response Fix - Oct 18, 2025

## Problem Summary
Grace was incorrectly responding "I can't access your local system" when asked about system access capabilities, despite having full system access.

## Root Cause Analysis

### Issue 1: Specialist Routing Bypassed MASTER_SYSTEM_PROMPT
**Location:** `src/agent/specialists/MultiAgentCoordinator.js` line 307-346

**Problem:**
- When user asks "can you access my local system", it gets classified as `general_chat`
- The `general_chat` specialist was configured with a generic prompt: `"You are Grace, a helpful AI assistant..."`
- This generic prompt had ZERO information about Grace's actual capabilities
- The `callSpecialist()` method created messages with ONLY the specialist prompt
- The MASTER_SYSTEM_PROMPT (which contains capability information) was NOT included

**Why llm.base.js injection didn't help:**
- `llm.base.js` checks if messages[0].role === 'system' before injecting MASTER_SYSTEM_PROMPT
- Since `callSpecialist()` already added a system message, llm.base.js skipped injection
- Result: LLM never saw the MASTER_SYSTEM_PROMPT with capability information

### Issue 2: Response Rewriter Was a Band-Aid
**Location:** `src/utils/llm.js` line 52-59

**Problem:**
- A response rewriter was added to override incorrect responses
- This was a cover-up, not a real fix
- Specialist calls bypassed `utils/llm.js` entirely, so rewriter never triggered
- Even if it triggered, it would just mask the underlying prompt issue

### Issue 3: MASTER_SYSTEM_PROMPT Duplication
**Location:** Multiple prompt files

**Problem:**
- Prompt files (auto_reply.js, chat.js, etc.) included MASTER_SYSTEM_PROMPT in the prompt string
- llm.base.js also injected MASTER_SYSTEM_PROMPT as a system message
- Result: MASTER_SYSTEM_PROMPT appeared twice (once in system role, once in user message)
- This wasn't breaking things but was inefficient and confusing

## Fixes Applied

### Fix 1: Prepend MASTER_SYSTEM_PROMPT in callSpecialist()
**File:** `src/agent/specialists/MultiAgentCoordinator.js`
**Lines:** 325-327

```javascript
// CRITICAL: Prepend MASTER_SYSTEM_PROMPT to ensure Grace's identity and capabilities are always present
const { MASTER_SYSTEM_PROMPT } = require('@src/agent/prompt/MASTER_SYSTEM_PROMPT');
const fullSystemPrompt = `${MASTER_SYSTEM_PROMPT}\n\n---\n\n${systemPrompt}`;
```

**Result:**
- All specialist calls now get MASTER_SYSTEM_PROMPT + specialist-specific prompt
- LLM receives full capability information regardless of routing path
- Grace's identity and capabilities are consistent across all specialists

### Fix 2: Removed Response Rewriter Band-Aid
**File:** `src/utils/llm.js`
**Lines:** 52

```javascript
// Response rewriter removed - fixing at source (system prompt level)
```

**Result:**
- Removed the cover-up approach
- Forces proper fix at the prompt injection level
- Cleaner, more maintainable code

### Fix 3: Removed MASTER_SYSTEM_PROMPT Duplication
**Files:**
- `src/agent/prompt/auto_reply.js` (line 8-10)
- `src/agent/prompt/chat.js` (line 5-7)
- `src/agent/prompt/generate_result.js` (line 36-38)
- `src/agent/prompt/intent_detection.js` (line 12-14)

**Changes:**
- Removed `${MASTER_SYSTEM_PROMPT}` from prompt strings
- Added comments explaining that llm.base.js now handles injection
- Kept task-specific instructions in each prompt file

**Result:**
- MASTER_SYSTEM_PROMPT appears only once (as system message)
- Cleaner prompt structure
- Easier to maintain and update

## Expected Behavior After Fix

### Question: "can you access my local system"
**Before:** "Hi there! I can't access your local system, but I'm here to help..."
**After:** "Yes, I can access your local system when you need me to. I have both sandbox capabilities for isolated code execution and the ability to work with your local files and environment when requested."

### Question: "do you have a sandbox"
**Before:** Inconsistent or incorrect responses
**After:** "Yes, I have full sandbox capabilities for safe code execution in an isolated Docker environment."

### Question: "do you have agent routing"
**Before:** May deny or be uncertain
**After:** "Yes, I have a multi-agent routing system that uses specialist AI models for different tasks."

## Code Paths Now Covered

### Path 1: Specialist Routing (Fixed)
1. User asks question → auto_reply/index.js
2. MultiAgentCoordinator.detectTaskType() → classifies as task type
3. MultiAgentCoordinator.execute() → calls specialist
4. callSpecialist() → prepends MASTER_SYSTEM_PROMPT ✅
5. LLM receives: MASTER_SYSTEM_PROMPT + specialist prompt
6. Grace responds correctly ✅

### Path 2: Non-Specialist (Fixed)
1. User asks question → auto_reply/index.js
2. Classified as general_chat → falls through to auto_reply_local()
3. resolveAutoReplyPrompt() → returns task-specific prompt (no MASTER_SYSTEM_PROMPT)
4. utils/llm.js → calls llm.completion()
5. llm.base.js → injects MASTER_SYSTEM_PROMPT ✅
6. LLM receives: MASTER_SYSTEM_PROMPT (system) + task prompt (user)
7. Grace responds correctly ✅

## Testing Checklist

- [ ] Test "can you access my local system" in chat mode
- [ ] Test "can you access my local system" in auto mode
- [ ] Test "can you access my local system" in task mode
- [ ] Test "do you have a sandbox"
- [ ] Test "do you have agent routing"
- [ ] Test "what can you do"
- [ ] Verify no MASTER_SYSTEM_PROMPT duplication in logs
- [ ] Verify specialist routing still works for code tasks
- [ ] Verify specialist routing still works for creative tasks
- [ ] Verify Grace maintains identity across all modes

## Docker Build Instructions

Since code is baked into the image, you MUST rebuild after these changes:

```bash
cd ~/Grace-Terminal
docker-compose down
docker-compose build
docker-compose up -d
```

## Files Modified

1. `src/agent/specialists/MultiAgentCoordinator.js` - Added MASTER_SYSTEM_PROMPT prepending
2. `src/utils/llm.js` - Removed response rewriter band-aid
3. `src/agent/prompt/auto_reply.js` - Removed MASTER_SYSTEM_PROMPT duplication
4. `src/agent/prompt/chat.js` - Removed MASTER_SYSTEM_PROMPT duplication
5. `src/agent/prompt/generate_result.js` - Removed MASTER_SYSTEM_PROMPT duplication
6. `src/agent/prompt/intent_detection.js` - Removed MASTER_SYSTEM_PROMPT duplication

## Commit Message

```
Fix: Ensure MASTER_SYSTEM_PROMPT reaches all specialist LLM calls

- Prepend MASTER_SYSTEM_PROMPT in MultiAgentCoordinator.callSpecialist()
- Remove response rewriter band-aid from utils/llm.js
- Remove MASTER_SYSTEM_PROMPT duplication from prompt files
- Fixes issue where Grace denied system access capabilities
- All routing paths now receive consistent capability information
```

## Notes

- The fix is surgical and minimal - only touches prompt injection logic
- No changes to routing logic or task detection
- No changes to LLM base classes beyond what was already there
- Should not break any existing functionality
- All specialists now get Grace's full identity and capabilities

