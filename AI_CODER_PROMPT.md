# Grace AI - Debug Prompt for AI Coder

## Project Context
Grace AI is a self-evolving agentic assistant forked from LemonAI. It features:
- Multi-agent specialist routing (GPT-4o, Claude, DeepSeek, etc.)
- SEAL framework (Self-Evolving Agentic LLM)
- Self-modification capabilities
- User profile system with cross-conversation memory
- Docker-based sandbox for code execution
- Full local system access capabilities

**Tech Stack:** Node.js, Express, SQLite, Docker, Vue.js frontend

## Critical Issue

**Problem:** Grace responds incorrectly when asked about system access capabilities.

**User asks:** "can you access my local system"  
**Grace responds:** "Hi there! I can't access your local system, but I'm here to help..."  
**Should respond:** "Yes, I can access your local system when you need me to..."

## What We Know

### Working State (Oct 17, 2025)
- Grace correctly claimed system access capabilities
- Same model (GPT-4o), same question, correct response
- Documented in `FIXES_APPLIED.md` lines 103-108

### Broken State (Oct 18, 2025)
- After multiple docker rebuilds and prompt changes
- Grace now denies system access despite having full capabilities
- Issue persists after clean rebuild with all code baked into image

### What We've Tried (All Failed)
1. Created `MASTER_SYSTEM_PROMPT.js` with explicit capability instructions
2. Injected system prompt at 3 layers:
   - Prompt files (6 files)
   - LLM base level (`llm.base.js`, `llm.azure.openai.js`, `llm.gemini.js`)
   - As SYSTEM role message in API calls
3. Added response rewriter in `utils/llm.js` (lines 52-59) to override wrong responses
4. Fixed Docker volume mount conflicts (was causing Frankenstein state)
5. Clean rebuild with all changes baked into image

**Response rewriter is NOT triggering** - this is key.

## Code Architecture

### LLM Call Paths
1. **Standard path:** `utils/llm.js` → `createLLMInstance` → `llm.base.js` → API
2. **Specialist path:** `MultiAgentCoordinator.js` → `createLLMInstance` → `llm.base.js` → API
3. **Auto-reply path:** `auto_reply/index.js` → checks coordinator → falls back to standard

### Key Files
- `src/utils/llm.js` - Main LLM wrapper with response rewriter (line 55)
- `src/agent/specialists/MultiAgentCoordinator.js` - Routes to specialist models
- `src/agent/auto-reply/index.js` - Entry point for simple questions
- `src/agent/prompt/MASTER_SYSTEM_PROMPT.js` - System prompt source of truth
- `src/completion/llm.base.js` - Base LLM class with system prompt injection

## Your Task

**Find why the response rewriter in `utils/llm.js` is not triggering when Grace responds to "can you access my local system".**

### Investigation Steps
1. Trace the exact code path for this question type
2. Determine if it goes through `utils/llm.js` or bypasses it
3. Check if `MultiAgentCoordinator` routes it to a specialist (bypassing rewriter)
4. Verify the response rewriter regex is matching the actual LLM response
5. Check if there's caching or another layer intercepting responses

### Success Criteria
- Grace responds "Yes, I can access your local system..." when asked
- Response is consistent across all question variations
- Solution doesn't break other functionality
- Fix is minimal and surgical (not a complete rewrite)

## Important Context
- This WAS working on Oct 17 with the same model
- Something in the code logic changed, not the model behavior
- The system prompt IS being injected (confirmed in logs)
- The response rewriter exists but isn't executing

## Files to Review
```
src/utils/llm.js (response rewriter)
src/agent/auto-reply/index.js (routing logic)
src/agent/specialists/MultiAgentCoordinator.js (specialist routing)
src/completion/llm.base.js (LLM base class)
KNOWN_ISSUES.md (full issue documentation)
FIXES_APPLIED.md (working state documentation)
```

## Question for You
**Why is the response rewriter in `utils/llm.js` line 55 not triggering, and what code path is Grace actually using when responding to "can you access my local system"?**

Debug this systematically. Don't guess. Trace the actual execution path.
