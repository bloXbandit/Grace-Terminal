# 🔴 CRITICAL FIXES NEEDED

## Issue 1: Document Generation Failing ❌

**Problem:**
- Grace tries to use action type "document" which doesn't exist
- Error: "Unknown action type: document"
- Documents are NOT being created
- Grace falsely claims files are in workspace

**Root Cause:**
- Grace is using wrong action type "document" instead of "terminal_run" or "file_generator"
- The data_generation specialist prompt tells her to use terminal_run, but she's not following it

**Fix Needed:**
1. Ensure Grace uses `terminal_run` tool with Python scripts for document generation
2. OR ensure Grace uses `file_generator` tool (already exists in /src/tools/FileGenerator.js)
3. Fix the action execution to recognize file_generator as a valid tool
4. Update prompts to be more explicit about using terminal_run

**Expected Behavior:**
- User: "make me a word doc"
- Grace: Uses terminal_run with python-docx to create .docx file
- Grace: Returns file content or download link in chat
- Grace: Does NOT claim it's in workspace unless user asked for local placement

---

## Issue 2: Profile Memory Not Persisting ❌

**Problem:**
- User tells Grace their name is "kenny" in one conversation
- Grace acknowledges and says she'll remember
- New conversation: Grace doesn't remember the name at all
- Profile extraction is running but not persisting across conversations

**Root Cause:**
- Profile extraction may be extracting wrong values (hallucinating "John" instead of "kenny")
- Profile data may not be saved to database correctly
- Profile context may not be loaded in new conversations
- UserProfile table may have issues

**Fix Needed:**
1. Verify UserProfile table exists and is accessible
2. Check if upsertProfile is actually saving to database
3. Verify getProfileContext is loading data in new conversations
4. Fix profile extraction to use actual user input, not hallucinate names
5. Test profile persistence across conversation modes (chat, task, auto)

**Expected Behavior:**
- User: "my name is kenny" (Conversation 1)
- Grace: Extracts and saves name="kenny" to UserProfile table
- User: "do you know my name?" (Conversation 2, different mode)
- Grace: "Yes, your name is Kenny!"

---

## Issue 3: Exception Error in Logs ⚠️

**Problem:**
- "Task exception terminated: Reached the maximum number of consecutive exceptions (3)"
- This is blocking document generation
- Related to "Unknown action type: document"

**Root Cause:**
- Same as Issue 1 - wrong action type being used
- Runtime doesn't recognize "document" as valid action
- After 3 failures, task terminates

**Fix Needed:**
- Fix Issue 1 (document generation)
- This error will disappear once correct action types are used

---

## Issue 4: File Delivery Behavior ⚠️

**Problem:**
- Grace claims files are "placed in workspace"
- User didn't ask for local placement
- Files should be delivered in chat like normal

**Expected Behavior:**
- Default: Generate file in sandbox, provide download link or content in chat
- Only if user says "save to my desktop" or "put in my workspace": Then save locally
- Always be honest about where file actually is

**Fix Needed:**
- Update MASTER_SYSTEM_PROMPT to clarify default behavior
- Update data_generation specialist prompt
- Ensure file delivery matches user's request

---

## Priority Order:
1. **HIGHEST**: Fix document generation (Issue 1 + 3)
2. **HIGH**: Fix profile memory persistence (Issue 2)
3. **MEDIUM**: Fix file delivery behavior (Issue 4)

---

## Testing Checklist:
- [ ] Create Word document (.docx) - should work
- [ ] Create Excel spreadsheet (.xlsx) - should work
- [ ] Create PDF (.pdf) - should work
- [ ] Tell Grace your name in chat mode
- [ ] Start new conversation in task mode
- [ ] Ask if Grace remembers your name - should say yes
- [ ] Verify file is delivered in chat, not claimed to be in workspace
