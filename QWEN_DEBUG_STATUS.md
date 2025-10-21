# Qwen Model Debug Status

## Issue Summary
Qwen specialist (`openrouter/qwen/qwen3-coder-30b-a3b-instruct`) returns empty content when called with `stream: false`.

## What We Know

### ✅ Confirmed Working:
1. **Qwen model exists** on OpenRouter
2. **Direct curl test succeeds** - Returns full response with content
3. **API call succeeds** - No 400/500 errors
4. **Request is made** - Logs show LLM request with correct parameters
5. **Response is received** - 67 bytes returned in 59 seconds

### ❌ Problem:
- **Specialist returns empty string** - `{ type: 'string', length: 0, preview: '' }`
- **No content parsed** - Response data not being extracted
- **Planning gets nothing** - Can't generate tasks without specialist response
- **No execution** - Tasks array is empty, so nothing runs

## Root Cause Investigation

### Hypothesis 1: Non-Streaming Response Format ✅ FIXED
**Issue:** Code only looked for `choice.delta.content` (streaming), not `choice.message.content` (non-streaming)

**Fix Applied:**
```javascript
// Added in llm.base.js messageToValue()
if (choice.message && choice.message.content) {
  return { type: "text", text: choice.message.content };
}
```

**Status:** Fix applied but still returns empty - investigating further

### Hypothesis 2: Stream Parsing Issue 🔍 INVESTIGATING
**Issue:** Even with `stream: false` in request body, axios uses `responseType: "stream"`, so response comes as stream

**Current Investigation:**
- Added logging to see raw stream chunks
- Checking if non-streaming JSON is being split incorrectly
- Response might be: `{"id":"...","choices":[{"message":{"content":"..."}}]}`
- But parser expects: `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`

### Hypothesis 3: Response Timeout/Truncation
**Observation:** Request took 59 seconds, returned only 67 bytes
- Normal response should be much larger
- Might be timing out before full response received
- Or response is being truncated

## Next Steps

1. **Check raw stream data** - See what format the response actually has
2. **Handle non-streaming JSON** - If response is single JSON object, parse it directly
3. **Check timeout settings** - Ensure we're not cutting off the response
4. **Consider switching to streaming** - Change specialist to use `stream: true`

## Test Mode
- ✅ Using **TASK mode** (correct for file creation)
- ✅ Test expects: plan, write_code, finish_summery
- ✅ Break points: intent_detection, specialist_routing, planning, thinking, execution, summary

## Workaround
Temporarily using GPT-4o for data_generation tasks until Qwen issue is resolved.
