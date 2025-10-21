# Quick Test Guide

## Once Build Completes

### 1. Run the Comprehensive Test
```bash
node test_grace_live.js test word
```

This will capture:
- ✅ What Qwen specialist actually returns
- ✅ Whether it's empty or has content
- ✅ What planning generates
- ✅ Why action parsing fails
- ✅ What execution errors occur
- ✅ Full LLM request/response cycle

### 2. What to Look For

**Specialist Response:**
```
📦 [Specialist] openrouter/qwen/qwen3-coder-30b-a3b-instruct returned: {
  type: 'string',
  length: 0,        ← SHOULD NOT BE 0!
  preview: ''       ← SHOULD HAVE CONTENT!
}
```

**Auto Reply Content:**
```
💬 Auto reply: empty  ← PROBLEM! Should have instructions
```

**Action Parsing:**
```
🔴 Action parsing failed: [resolveActions] Invalid input - not a string
```

**Execution:**
```
🔴 Execution failed: Reached the maximum number of consecutive execution failures (3)
```

### 3. Expected Issues to Diagnose

1. **If Qwen returns empty:**
   - Check if LLM API call succeeded
   - Check if response was streamed vs non-streamed
   - Check if response format is correct

2. **If planning returns zero tasks:**
   - Check what planning prompt was sent
   - Check what planning LLM returned
   - Check if task parsing failed

3. **If action parsing fails:**
   - Check what format LLM returned
   - Check if it's XML vs JSON vs plain text
   - Check if thinking template is correct

4. **If execution fails:**
   - Check what action was attempted
   - Check error stack trace
   - Check if file paths are valid

### 4. Next Steps After Test

Based on test results:
- If Qwen returns empty → Fix specialist LLM call
- If planning fails → Fix planning prompt/parsing
- If actions fail → Fix action XML format
- If execution fails → Fix execution logic

## Summary

The test will show you EXACTLY where the flow breaks and what data is (or isn't) being passed between components.
