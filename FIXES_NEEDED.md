# Fixes Needed

## ✅ FIXED: Qwen Non-Streaming Response
- **Issue:** Qwen specialist returned empty content
- **Root Cause:** Code only handled streaming SSE format, not non-streaming JSON
- **Fix:** Added conditional `responseType` and non-streaming JSON parsing
- **Status:** WORKING - Qwen now returns 425 characters of Python code

## 🔴 CRITICAL: Code Showing in UI (User-Facing Issue)
**Problem:** Users see raw Python code and terminal commands instead of clean results

**What user sees:**
```python
from docx import Document
doc = Document()
doc.add_heading('Love', 0)
doc.add_paragraph('love')
doc.save('love_document.docx')
```

**What user SHOULD see:**
```
✅ Created Word document "love_document.docx"
📥 Download: [love_document.docx]
```

**Root Cause:** Qwen specialist is returning code as CONTENT instead of as ACTIONS for execution

**Where to fix:** 
- Qwen should return code in a structured format (XML actions)
- OR auto-reply should NOT stream specialist response to user
- OR specialist response should be hidden and only execution results shown

## 🔴 CRITICAL: Execution Failures
**Problem:** Tasks fail 3 consecutive times with "action undefined"

**Errors:**
1. `[resolveActions] Invalid input - not a string: object`
2. `action undefined`
3. `Reached the maximum number of consecutive execution failures (3)`

**Root Cause:** Specialist returns error object when model fails (404 on o1-preview)

## 🟡 Test Script: Use Real Conversation ID
**Problem:** Test creates UUID but doesn't create DB record → "Conversation not found"

**Fix:** Query database for recent conversation and use that ID in test

## 🟡 Model 404: openai/o1-preview
**Problem:** `Request failed with status code 404` for o1-preview model

**Fix:** Remove or replace o1-preview references with valid models
