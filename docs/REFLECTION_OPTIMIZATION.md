# Reflection Model Optimization - GPT-4o-mini

## Overview
Optimized reflection to use GPT-4o-mini via OpenAI directly, bypassing conversation model selection. This provides:
- **Faster reflection** (~30-60s faster than GPT-5)
- **Lower cost** (GPT-4o-mini is ~10x cheaper)
- **No interference** with main conversation models

## Setup Instructions

### 1. Add OpenAI API Key to Environment
```bash
# In your .env file or docker-compose.yml
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 2. Add Model via UI (Optional)
If you want to track usage in the UI:
1. Go to Settings → Models
2. Click "Add Model"
3. Fill in:
   - **Platform:** OpenAI
   - **Model ID:** `gpt-4o-mini`
   - **Model name:** `GPT-4o Mini (Reflection)`
   - **Group name:** `OpenAI`

**Note:** The model will work even without adding it to the UI, as it's hardcoded in the reflection module.

### 3. Restart Containers
```bash
docker restart grace-app
```

## Code Changes

### 1. Dedicated Reflection Model
**File:** `src/agent/reflection/llm.evaluate.js`

Added hardcoded GPT-4o-mini configuration that bypasses conversation model selection:
```javascript
const REFLECTION_MODEL = {
  model_name: 'gpt-4o-mini',
  platform_name: 'openai',
  api_key: process.env.OPENAI_API_KEY || '',
  api_url: 'https://api.openai.com/v1/chat/completions',
  base_url: 'https://api.openai.com/v1',
  is_subscribe: false
};
```

### 2. Skip Reflection on Clean Success
**File:** `src/agent/code-act/code-act.js` (line 357-366)

Skip reflection when execution succeeds without errors:
```javascript
if (action_result.status === 'success' && !action_result.stderr && !action_result.error) {
  console.log('[CodeAct] Clean success - skipping reflection');
  reflection_result = { status: 'success', comments: 'Execution successful' };
} else {
  reflection_result = await reflection(requirement, action_result, context.conversation_id);
}
```

### 3. Better Inline Syntax Detection
**File:** `src/agent/planning/index.js` (line 60-64)

Detect Python control flow that fails in inline `-c` mode:
```javascript
const hasComplexSyntax = /\b(for|while|if|def|class)\b/.test(pythonCode);
const useScriptFile = codeLength > 2000 || lineCount > 50 || hasComplexSyntax;
```

## Performance Impact

### Before Optimization
```
20:31:27 - Plan created
20:31:41 - First inline command (14 seconds)
20:31:47 - Retry command (6 seconds)
20:33:32 - Finish message (1m 45s total)
```

### After Optimization
**Expected improvements:**
- **Skip reflection on success:** Saves ~1-2 minutes per successful task
- **Faster reflection model:** Saves ~30-60 seconds when reflection runs
- **Better syntax detection:** Saves ~20 seconds by avoiding inline failures

**Total time savings:** 1-3 minutes per task (40-60% faster)

## Fallback Behavior

If OpenAI API call fails:
1. Logs error message
2. Falls back to conversation's default model
3. Continues execution normally

## Monitoring

Check logs for reflection model usage:
```bash
docker logs grace-app | grep Reflection
```

Expected output:
```
[Reflection] Using GPT-4o-mini via OpenAI
[CodeAct] Clean success - skipping reflection
```

## API Reference

OpenAI GPT-4o-mini documentation:
https://platform.openai.com/docs/models/gpt-4o-mini

**Pricing:**
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens

**Speed:**
- ~2-5 seconds for typical reflection prompts
- ~10x faster than GPT-5 Pro

## Notes

- ✅ **Isolated:** Only affects reflection, not main conversation
- ✅ **Fast:** GPT-4o-mini is optimized for speed
- ✅ **Cheap:** ~10x cheaper than GPT-5 Pro
- ✅ **Reliable:** Fallback to default model if OpenAI fails
- ✅ **No UI changes:** Works transparently in background
