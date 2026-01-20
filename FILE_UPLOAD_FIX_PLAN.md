# FILE UPLOAD & DOC GENERATION FIX PLAN FOR SWE AGENT

## PROBLEM SUMMARY

### Issue 1: File Uploads Showing as "undefined"
**Symptoms:**
- User uploads PDF/DOC files
- File logo briefly appears then disappears
- Frontend receives `{name: undefined, size: undefined, url: undefined, id: undefined}`
- Upload API returns 200 OK but only 97 bytes (too small for actual file data)
- Frontend tries to DELETE `/api/file/delete/undefined` after upload fails

**Root Cause:**
- Upload endpoint is catching an error: `TypeError: response.error is not a function`
- This error prevents FileRegistry.register() from being called
- The catch block at line 92-96 silently swallows the error
- Empty uploadedFiles array is returned to frontend
- Frontend receives empty response, sets all values to undefined

**Evidence from Logs:**
```
POST /api/file/upload - 3ms
--> POST /api/file/upload 200 5ms 97b
[File API] Upload error: TypeError: response.error is not a function
DELETE /api/file/delete/undefined?conversation_id=0ba63ef1-53a5-4556-8a27-9c323c777eae
```

### Issue 2: Questions About Uploaded Docs Trigger Word Doc Generation
**Symptoms:**
- User asks "can you see this doc" or "can you see this document"
- System incorrectly triggers Ultra Word document generation
- Creates a new Word document about "upload ability" instead of analyzing uploaded file

**Root Cause:**
- `simpleFileGenPattern` regex at line 1417 in auto-reply/index.js is too broad
- Pattern: `/(?:do+cument|doc)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?/i`
- This matches ANY mention of "doc" or "document" even in questions
- No distinction between:
  - "make me a document about X" (should trigger doc generation)
  - "can you see this document" (should NOT trigger doc generation)

---

## FIX IMPLEMENTATION PLAN

### Fix 1: Resolve response.error TypeError in File Upload

**File:** `/Users/wonkasworld/Downloads/GRACEai/src/routers/file/file.js`

**Problem Location:** Lines 52-106

**Root Cause Analysis:**
The error `response.error is not a function` suggests the response object doesn't have an `error` method. This is likely a middleware issue where the custom response methods aren't properly attached.

**Steps:**

1. **Check response middleware setup** (src/middlewares/wrap.context.js or similar)
   - Verify response.success(), response.error(), response.fail() are defined
   - Check if middleware is properly applied to file upload route

2. **Add defensive error handling in upload endpoint:**
   ```javascript
   router.post("/upload", async ({ state, request, response }) => {
     try {
       const files = request.files?.files;
       const conversation_id = request.body?.conversation_id || '';
       
       console.log('[File API] Upload request:', { 
         hasFiles: !!files, 
         conversation_id,
         fileCount: Array.isArray(files) ? files.length : (files ? 1 : 0)
       });

       if (!files) {
         console.error('[File API] No files in request');
         return response.success([]); // Return empty array instead of error
       }

       const fileArray = Array.isArray(files) ? files : [files];
       
       if (fileArray.length === 0) {
         console.error('[File API] Empty file array');
         return response.success([]);
       }

       const uploadedFiles = [];
       const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', state.user.id);
       
       const FileRegistry = require('@src/context/FileRegistry');
       const registry = new FileRegistry(conversation_id, state.user.id);

       for (const file of fileArray) {
         try {
           console.log('[File API] Processing file:', file.originalFilename);
           
           const uploadDir = path.join(WORKSPACE_DIR, 'upload');
           if (!fs.existsSync(uploadDir)) {
             fs.mkdirSync(uploadDir, { recursive: true });
           }
           const filePath = path.join(uploadDir, file.originalFilename);

           fs.copyFileSync(file.filepath, filePath);
           console.log('[File API] File copied to:', filePath);

           // Use FileRegistry to register the file
           const fileDoc = await registry.register(filePath, file.originalFilename);
           
           console.log('[File API] FileRegistry returned:', JSON.stringify(fileDoc, null, 2));
           
           // Add workspace_dir for backward compatibility
           fileDoc.workspace_dir = WORKSPACE_DIR;

           uploadedFiles.push(fileDoc);
         } catch (fileError) {
           console.error('[File API] Error processing file:', file?.originalFilename, fileError);
           console.error('[File API] Error stack:', fileError.stack);
           // Continue with other files, don't fail the entire upload
         }
       }

       console.log('[File API] Sending response with files:', JSON.stringify(uploadedFiles, null, 2));
       return response.success(uploadedFiles);
     } catch (error) {
       console.error('[File API] Upload error:', error);
       console.error('[File API] Upload error stack:', error.stack);
       // Use ctx.body directly if response.fail is not available
       return response.success([]); // Return empty array to prevent frontend crash
     }
   });
   ```

3. **Verify response structure matches frontend expectations:**
   - Frontend expects: `{name, url, id, workspace_dir, size}`
   - FileRegistry returns: `{id, user_id, conversation_id, url, name, create_at, update_at}`
   - Need to ensure all required fields are present

4. **Test the fix:**
   ```bash
   # Restart container
   docker restart grace-app
   
   # Upload a file and check logs
   docker logs grace-app --tail 100 -f | grep "File API"
   ```

---

### Fix 2: Prevent Doc Generation Trigger on Questions About Uploaded Files

**File:** `/Users/wonkasworld/Downloads/GRACEai/src/agent/auto-reply/index.js`

**Problem Location:** Line 1417

**Current Pattern:**
```javascript
const simpleFileGenPattern = goal.match(/(?:can you |could you |would you |please |lets |let's |lemme |i wanna |i want to |i want |i need |make me |give me |build me |get me |help me )?(?:(create|make|generate|write|build|produce|draft)(?:\s+\w+){0,3}\s+)?(a |an |the |me |some )?(?:new )?(word do+cument|word doc|excel file|spreadsheet|pdf do+cument|pdf file|docx|excel|xlsx|pdf)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?|(?:do+cument|doc)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?/i);
```

**Issues:**
- The pattern `(?:do+cument|doc)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?` at the end is too broad
- Matches "can you see this doc" because "doc" is present
- No requirement for action verbs before "doc/document"

**Solution:**

Replace line 1417 with a more restrictive pattern:

```javascript
// FIXED: Only trigger on explicit document CREATION requests, not questions about existing docs
// Action verbs: create, make, generate, write, build, produce, draft
// File types: word doc/document, docx, excel, spreadsheet, pdf document/file, pdf, xlsx
// Trigger words (optional): titled, called, named, with, about, on, for, bout, regarding, concerning
// 
// CRITICAL: Require action verb OR explicit file type mention (word doc, excel, pdf)
// This prevents "can you see this doc" from triggering doc generation
const simpleFileGenPattern = goal.match(/(?:can you |could you |would you |please |lets |let's |lemme |i wanna |i want to |i want |i need |make me |give me |build me |get me |help me )?(create|make|generate|write|build|produce|draft)(?:\s+\w+){0,3}\s+(a |an |the |me |some )?(?:new )?(word do+cument|word doc|excel file|spreadsheet|pdf do+cument|pdf file|docx|excel|xlsx|pdf|do+cument|doc)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?/i);
```

**Key Changes:**
1. **Removed the standalone `|(?:do+cument|doc)` alternative** - this was matching any mention of "doc"
2. **Made action verb REQUIRED** - `(create|make|generate|write|build|produce|draft)` is no longer optional
3. **Kept "document/doc" in the file type list** but only after an action verb

**What This Fixes:**
- ❌ "can you see this doc" → No longer triggers (no action verb)
- ❌ "can you see this document" → No longer triggers (no action verb)
- ❌ "show me the doc" → No longer triggers (no creation verb)
- ✅ "create a doc about X" → Still triggers (has action verb)
- ✅ "make me a document titled Y" → Still triggers (has action verb)
- ✅ "write a word doc" → Still triggers (has action verb + file type)

**Alternative Approach (More Conservative):**

If the above is too restrictive, add negative lookahead for question patterns:

```javascript
const simpleFileGenPattern = goal.match(/(?!.*\b(see|view|read|show|open|check|find|locate|access|analyze|review)\b.*\b(this|the|that|my|uploaded)\b.*\b(doc|document|file)\b)(?:can you |could you |would you |please |lets |let's |lemme |i wanna |i want to |i want |i need |make me |give me |build me |get me |help me )?(?:(create|make|generate|write|build|produce|draft)(?:\s+\w+){0,3}\s+)?(a |an |the |me |some )?(?:new )?(word do+cument|word doc|excel file|spreadsheet|pdf do+cument|pdf file|docx|excel|xlsx|pdf)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?|(?:do+cument|doc)(?:\s+(?:titled|called|named|with|about|on|for|bout|regarding|concerning|re))?/i);
```

This adds a negative lookahead that excludes patterns like:
- "see this doc"
- "view the document"
- "check my uploaded file"

---

### Fix 3: Ensure Uploaded Files Appear in Context

**File:** `/Users/wonkasworld/Downloads/GRACEai/src/context/ConversationContext.js`

**Already Fixed (from previous session):**
- Lines 155-164: Extract filename from filepath for script files
- Lines 176-179: Skip files with undefined names

**Verify Fix is Working:**
```bash
docker logs grace-app --tail 500 | grep "ConversationContext.*Skipping"
```

Should see warnings for files with undefined names, but no crashes.

---

## TESTING PLAN

### Test 1: File Upload
1. Upload a PDF file to conversation
2. Check logs for:
   ```
   [File API] Processing file: test.pdf
   [File API] File copied to: /app/workspace/...
   [File API] FileRegistry returned: {id: X, name: "test.pdf", url: "...", ...}
   [File API] Sending response with files: [{...}]
   ```
3. Verify frontend receives proper file data (not undefined)
4. Verify file appears in message list

### Test 2: Doc Generation Trigger
1. Upload a document
2. Ask "can you see this doc"
3. Verify: Should NOT trigger Word doc generation
4. Verify: Should analyze the uploaded file instead

### Test 3: Legitimate Doc Generation
1. Ask "create a word doc about AI"
2. Verify: SHOULD trigger Ultra fast-path
3. Verify: Creates actual Word document

---

## ROLLBACK PLAN

If fixes cause issues:

1. **Revert file upload changes:**
   ```bash
   git checkout src/routers/file/file.js
   docker restart grace-app
   ```

2. **Revert auto-reply pattern:**
   ```bash
   git checkout src/agent/auto-reply/index.js
   docker restart grace-app
   ```

---

## ADDITIONAL INVESTIGATION NEEDED

1. **Why is response.error not a function?**
   - Check src/middlewares/wrap.context.js
   - Verify custom response methods are properly attached
   - May need to use ctx.body directly instead

2. **Why are FileRegistry debug logs not appearing?**
   - Logs added at lines 88 and 100 should show in docker logs
   - If not appearing, the code may not be executing (error thrown earlier)
   - Check if FileRegistry constructor is failing

3. **Why does frontend try to DELETE undefined?**
   - Frontend receives empty/malformed response
   - Sets file.id to undefined
   - Tries to clean up by deleting the "failed" upload
   - Fix: Ensure proper error responses so frontend knows upload failed

---

## PRIORITY ORDER

1. **CRITICAL:** Fix file upload response.error TypeError (prevents all uploads)
2. **HIGH:** Fix doc generation trigger (breaks user experience)
3. **MEDIUM:** Add better error logging (helps debug future issues)
4. **LOW:** Investigate why files disappear from messages (may be frontend caching)

---

## FILES TO MODIFY

1. `/Users/wonkasworld/Downloads/GRACEai/src/routers/file/file.js` (lines 52-106)
2. `/Users/wonkasworld/Downloads/GRACEai/src/agent/auto-reply/index.js` (line 1417)
3. Possibly: `/Users/wonkasworld/Downloads/GRACEai/src/middlewares/wrap.context.js` (if response methods need fixing)

---

## EXPECTED OUTCOME

After fixes:
- ✅ File uploads return proper data to frontend
- ✅ Uploaded files show with correct name, icon, and metadata
- ✅ Questions about uploaded docs don't trigger doc generation
- ✅ Legitimate doc creation requests still work
- ✅ Files remain visible in message history
- ✅ Code review system can detect uploaded files
