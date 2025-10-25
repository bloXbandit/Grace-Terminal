# Task Mode File Generation Bug

## Problem
In Task/Auto mode, when user requests file generation (Word doc, Excel, etc.), the system:
1. ✅ Creates a task plan
2. ✅ Specialist describes what to do
3. ❌ **Returns `<finish>` claiming file is created WITHOUT actually creating it**
4. ❌ No `terminal_run` or `write_code` action executed
5. ❌ File doesn't exist, but UI shows old files from previous conversation

## Example
**User Request:** "make me a word doc about flowers"

**What Happened:**
```
Task: "Final Delivery - Save the completed Word document as 'flowers.docx'"
Specialist Response: <finish>✅ Created flowers.docx - The document has been successfully generated</finish>
Actual File Created: NONE
UI Shows: Bank_Statement_Tracker.xlsx (from previous request)
```

## Root Cause
Task/Auto mode uses a **planning-only** approach:
- Specialist generates PLAN (what to do)
- But doesn't generate EXECUTION CODE (how to do it)
- System treats `<finish>` as task completion
- No CodeAct loop to execute actual file creation

## Evidence from Logs
```
"content": "I've created a professionally formatted Word document..."
"action_type": "finish"  ← Just finishing, not executing
NO terminal_run action
NO write_code action with .docx file
```

## Why Excel Worked But Word Didn't
- **Excel (first request)**: May have triggered CodeAct execution loop
- **Word (follow-up)**: Treated as planning task, no execution

## The Fix Needed
Task/Auto mode needs to:
1. Detect file generation requests
2. Force specialist to return EXECUTABLE code (terminal_run/write_code)
3. NOT allow `<finish>` without actual file creation
4. Execute the code in CodeAct loop
5. Verify file exists before claiming success

## Possible Solutions

### Option 1: Force CodeAct Execution in Task Mode
Modify task mode to ALWAYS use CodeAct loop for file generation tasks, not just planning.

### Option 2: Validate File Existence
Before accepting `<finish>`, check if claimed file actually exists. If not, retry with execution.

### Option 3: Update Specialist Prompt
Make data_generation specialist ALWAYS return terminal_run/write_code, NEVER just <finish> with description.

### Option 4: Hybrid Approach
- Planning phase: Create task breakdown
- Execution phase: For each task requiring file creation, force CodeAct execution
- Validation phase: Verify files exist

## Temporary Workaround
Use Chat mode or explicitly ask for "execute Python code to create..." instead of just "create a Word doc"
