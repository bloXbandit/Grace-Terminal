# Grace AI - Execution Issues Tracker

**Purpose**: Systematically track and resolve issues across different execution modes
**Last Updated**: 2025-10-23 4:07pm UTC-04:00

---

## 🎯 Mode: CHAT

### ✅ Working
- **LLM Streaming**: Successfully using `openai/gpt-5-pro` via OpenRouter
- **Response Generation**: Chat responses are being generated
- **Profile Extraction**: Running without 400/401 errors

### ⚠️ Issues Identified

#### Issue #1: Stream Hang / Incomplete Response
**Source**: `test_grace_live.js` test run
**Log Evidence**:
```
✗ ❌ STREAM HANG: No data received for 30.014s
⚠ Received 2 chunks before hang
✗ ❌ HANG DETECTED: No activity for 46.272s

[LLM Stream] First chunk received: data: {"id":"gen-1761249302-3wYcIjvNYX0PI8kmDx38"...
(repeated 25 times - same chunk)
[][ProfileExtract] Extracted 0 profile items from message
-x- POST /api/agent/run 200 34s 67b
Chat stream closed
```
**Status**: 🟢 FIX APPLIED (Ready for Testing)
**Priority**: HIGH
**Root Cause**: Multiple concurrent LLM streams + missing `[DONE]` marker handling
**Analysis**:
- "First chunk" logged 25 times = 25 DIFFERENT concurrent LLM calls, not a loop!
- Multiple profile extraction calls in same request:
  - `routers/agent/run.js` line 232 (profile extraction #1)
  - `routers/agent/run.js` line 293 (profile extraction #2 - DUPLICATE!)
  - `routers/agent/chat.js` line 162 (chat mode profile extraction)
- OpenRouter sends `data: [DONE]` to signal stream end (per docs)
- Current code waits for `response.data.on("end")` which may not fire
- Streams complete on backend (200 response) but Promise never resolves

**Real Issues**:
1. **Duplicate profile extraction calls** causing excessive API usage
2. **Stream not detecting `[DONE]` marker** to close properly
3. **No explicit stream end handling** when `[DONE]` received

**Fix Applied**:
1. ✅ Removed duplicate profile extraction call at line 293 in `run.js`
   - Now only 1 call per request (line 232) for TASK/AUTO modes
   - CHAT mode still has 1 call (line 162 in `chat.js`)
2. ✅ Fixed model selection for new conversations
   - Removed hardcoded `model_id = 48` in chat.js
   - Now uses default_model_setting table (GPT-5 Pro, model 52)
3. ✅ Fixed model_id format in database
   - Removed incorrect `openrouter/` prefix from models 20, 21, 22
   - Now: `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/gpt-5-pro`
4. ⏳ TODO: Add explicit `[DONE]` marker detection if still needed after testing

#### Issue #2: SEAL TaskExecution - Null start_time
**Source**: Docker logs
**Log Evidence**:
```
❌ [SEAL] Error logging task: ValidationError [SequelizeValidationError]: 
notNull Violation: TaskExecution.start_time cannot be null
```
**Status**: 🔴 UNRESOLVED
**Priority**: MEDIUM
**Notes**: Task logging fails due to missing start_time field. Non-blocking but clutters logs.

#### Issue #3: Agent Recommend - Undefined agent_id
**Source**: Docker logs
**Log Evidence**:
```
Error updating agent recommend for agent undefined: 
Error: WHERE parameter "id" has invalid "undefined" value
```
**Status**: 🔴 UNRESOLVED
**Priority**: LOW
**Notes**: Agent recommendation system trying to update with undefined ID. Non-critical.

---

## 🎯 Mode: TASK

### ✅ Working
- TBD (not tested yet)

### ⚠️ Issues Identified
- TBD (awaiting test run)

---

## 🎯 Mode: AUTO

### ✅ Working
- TBD (not tested yet)

### ⚠️ Issues Identified
- TBD (awaiting test run)

---

## 📊 Resolution Progress

### Completed Fixes ✅
1. **401 Errors (OpenAI API)** - Fixed by migrating to OpenRouter
   - Updated `routing.config.js` fallbacks
   - Updated `src/utils/llm.js` fallback model
   - Updated `MultiAgentCoordinator.js` task decomposition
   - Updated database models to use OpenRouter platform

2. **400 Errors (Bad Request)** - Fixed by correcting platform_name case
   - Changed `platform_name: 'OpenRouter'` → `'openrouter'` (lowercase)
   - Location: `src/utils/llm.js` line 45

3. **API Key Fallback Chain** - Enhanced for redundancy
   - Added OpenAI key as final fallback in MultiAgentCoordinator
   - Chain: `OPENROUTER_API_KEY` → `OPENAI_API_KEY` → empty string

### In Progress 🔄
- None currently

### Pending Investigation 🔍
1. Stream hang issue (Chat mode)
2. SEAL TaskExecution null start_time
3. Agent recommend undefined agent_id

---

## 🔧 Next Steps

1. **Immediate**: Investigate stream hang in chat mode
   - Check if it's a timeout issue
   - Verify SSE connection handling
   - Test with different message lengths

2. **Short-term**: Fix SEAL logging errors
   - Add start_time initialization
   - Add null checks for agent_id

3. **Testing Queue**:
   - [ ] Test TASK mode execution
   - [ ] Test AUTO mode execution
   - [ ] Test Dev Mode (AI-to-AI communication)

---

## 📝 Notes & Observations

- **OpenRouter Integration**: Successfully routing all requests through OpenRouter
- **Model Usage**: `openai/gpt-5-pro` is the primary model (McNabb #5 🏈)
- **Profile Extraction**: Working correctly (extracted 0 items from "hello" - expected behavior)
- **Docker Rebuild**: Required for code changes (source not mounted as volume)

---

## 🎮 Test Commands

```bash
# Chat mode test
node test_grace_live.js test chat

# Task mode test
node test_grace_live.js test task

# Auto mode test
node test_grace_live.js test auto

# Monitor logs
docker logs grace-app -f 2>&1 | grep -E "400|401|Error|success"
```
