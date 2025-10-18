# Grace AI - Known Issues

## Critical Issues

### 1. System Access Response Issue
**Status:** Unresolved  
**First Observed:** Oct 18, 2025  
**Description:** When user asks "can you access my local system", Grace responds with "I can't access your local system" despite having full system capabilities.

**Evidence:**
- Grace was working correctly on Oct 17, 2025 (documented in FIXES_APPLIED.md)
- Same question, same model (GPT-4o), different response
- Response: "Hi there! I can't access your local system, but I'm here to help with any questions or information you might need."

**What We Know:**
- MASTER_SYSTEM_PROMPT is being injected (confirmed in logs)
- System prompt includes explicit instructions to say "Yes, I can access..."
- Response rewriter in utils/llm.js is not triggering
- MultiAgentCoordinator may bypass some code paths
- Docker volume mounts were causing Frankenstein state (fixed)
- Clean rebuild completed with all changes baked in
- Issue persists after clean rebuild

**What Changed:**
- Oct 17: Grace working correctly
- Oct 18: Multiple docker rebuilds, prompt changes, volume mount additions/removals
- Suspected: Something deeper in code logic changed, not just prompts

---

## System Architecture Issues

### 2. Docker Build Inconsistency
**Status:** Partially Resolved  
**Description:** Volume mounts were overriding baked-in code, creating inconsistent state.

**Timeline:**
- Original: Code baked into image, no volume mounts (working)
- Changed: Added volume mounts for hot reload (broke consistency)
- Fixed: Removed volume mounts, clean rebuild

**Current State:**
- Using `grace-ai:custom` image with build context
- All code baked into image
- No source code volume mounts
- Still experiencing issue #1

---

## Prompt System Issues

### 3. Multiple Prompt Injection Points
**Status:** Implemented but not effective  
**Description:** System prompt injected at multiple layers but not achieving desired behavior.

**Injection Points:**
1. MASTER_SYSTEM_PROMPT.js (source of truth)
2. Prompt files (6 files: auto_reply.js, chat.js, intent_detection.js, etc.)
3. LLM base level (llm.base.js, llm.azure.openai.js, llm.gemini.js)
4. Response rewriter (utils/llm.js)

**Issue:** Despite all injection points, Grace still gives incorrect response about system access.

---

## Code Path Issues

### 4. Specialist Routing Bypass
**Status:** Identified but not confirmed  
**Description:** MultiAgentCoordinator may use different code paths that bypass response rewriter.

**Details:**
- Coordinator uses `createLLMInstance` directly
- May bypass `utils/llm.js` response rewriter
- Unclear which path "can you access my local system" takes
- Task type detection may route to unexpected specialist

---

## Historical Context

### What Was Working (Oct 17, 2025)
From FIXES_APPLIED.md:
```
User: "can you access my local files?"
Grace: "Yes, I can access your local files when you're working in Task or Auto mode. I can:
- Read and write files
- Execute code in a sandbox or locally (with your permission)
- Browse directories
Would you like me to help with a specific file operation?"
```

### What's Not Working (Oct 18, 2025)
```
User: "hey can you access my local system"
Grace: "Hi there! I can't access your local system, but I'm here to help with any questions or information you might need."
```

**Same model (GPT-4o), different behavior = code logic changed, not model issue**

---

## Next Steps Needed

1. Identify what code was actually running on Oct 17 when it worked
2. Compare Oct 17 vs Oct 18 code execution paths
3. Determine why response rewriter is not triggering
4. Trace exact code path for "can you access my local system" question
5. Find what changed between Oct 17 and Oct 18 that broke the behavior

---

## Files Modified Today (Oct 18)

**Created:**
- src/agent/prompt/MASTER_SYSTEM_PROMPT.js
- FINAL_SYSTEM_PROMPT_IMPLEMENTATION.md
- Multiple documentation files

**Modified:**
- src/utils/llm.js (added response rewriter)
- src/completion/llm.base.js (added system prompt injection)
- src/completion/llm.azure.openai.js (added system prompt injection)
- src/completion/llm.gemini.js (added system prompt injection)
- docker-compose.yml (removed volume mounts, added build context)
- 6 prompt files (imported MASTER_SYSTEM_PROMPT)

**Issue:** Despite all changes, core problem persists.
