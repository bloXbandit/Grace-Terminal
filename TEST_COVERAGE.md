# Grace AI Comprehensive Test Coverage

## Enhanced Test Script Capabilities

The `test_grace_live.js` script now captures **EVERYTHING** across the entire multi-agent flow:

### 🎯 Frontend (SSE Stream) Monitoring

**Message Types Tracked:**
- ✅ `plan` - Task planning breakdown
- ✅ `write_code` - File creation with content preview
- ✅ `terminal_run` - Command execution
- ✅ `thinking` - LLM reasoning process
- ✅ `auto_reply` - Specialist responses
- ✅ `finish_summery` - Task completion summary
- ✅ `error` - Error messages with details

**Data Captured:**
- Message content (with previews)
- File paths created
- Commands executed
- Error details and comments
- Task completion status

### 🔍 Backend (Docker Logs) Monitoring

**LLM Level:**
- 🔍 **Request Details**: Model, message count, temperature, max_tokens, stream mode
- ❌ **Error Responses**: Status codes, API error messages, full response data
- ⏱️ **Performance**: Request duration, correlation tracking

**Specialist Level:**
- 📦 **Response Content**: Type, length, content preview
- 🎯 **Routing Decisions**: Which specialist was chosen
- 🤖 **Model Selection**: Which LLM model was used
- ✅ **Success/Failure**: Whether specialist handled the request

**Coordinator Level:**
- 📋 **Task Type Detection**: What type of task was identified
- 🎯 **Model Routing**: Which model was selected for the task
- 🔄 **Fallback Logic**: If/when fallbacks are triggered

**Execution Level:**
- 💭 **Thinking Process**: LLM reasoning and planning
- 🔴 **Action Parsing Errors**: Invalid XML/action format issues
- 🔴 **Execution Failures**: Failed task executions with stack traces
- ⚡ **Action Resolution**: What actions were extracted and executed

**Planning Level:**
- 📋 **Planning Prompts**: What was sent to planning LLM
- 📝 **Planning Markdown**: Raw planning output
- ✅ **Tasks Generated**: List of tasks created
- ❌ **Empty Tasks**: When planning returns zero tasks

### 🎪 Break Point Tracking

**Flow Stages:**
- `mode_command_detection` - Command mode detection
- `intent_detection` - Task type identification
- `specialist_routing` - Specialist selection
- `llm_call` - LLM API request
- `specialist_response` - Specialist return value
- `auto_reply` - Auto-reply processing
- `planning` - Task planning phase
- `thinking` - LLM thinking/reasoning
- `execution` - Task execution
- `summary` - Task completion summary
- `response` - Final response to user

**Error Break Points:**
- `action_parse_error` - Action XML parsing failed
- `execution_failure` - Task execution failed
- `error` - General error occurred

### 📊 Test Results Summary

**Metrics Captured:**
- Total duration
- Message count
- Action types executed
- LLM calls made
- Break points reached
- Missing break points (where flow stopped)
- Errors detected

**Error Analysis:**
- All errors categorized by type
- Stack traces for debugging
- Correlation with specific LLM calls
- Exact point where flow stopped

## Usage

### Run All Tests
```bash
node test_grace_live.js test
```

### Run Specific Mode
```bash
node test_grace_live.js test task    # All task mode tests
node test_grace_live.js test chat    # All chat mode tests
node test_grace_live.js test auto    # All auto mode tests
```

### Run Specific Test
```bash
node test_grace_live.js test word    # Word document test
```

### Monitor Logs Only
```bash
node test_grace_live.js monitor
```

## Test Output Example

```
━━━ Test: Word Document Creation ━━━

ℹ Goal: "Create a Word document with the text "love""
ℹ Mode: task
ℹ Using conversation ID: abc123...

🎮 [ModeCommand] Not a mode command
📋 Task type detected: data_generation
🎯 Coordinator routing to: openrouter/qwen/qwen3-coder-30b-a3b-instruct
🤖 Specialist calling: openrouter/qwen/qwen3-coder-30b-a3b-instruct
🔍 [LLM Request] { model: 'qwen/qwen3-coder-30b-a3b-instruct', messages: 2, stream: false }
📦 [Specialist] returned: { type: 'string', length: 0, preview: '' }
💬 Auto reply: empty
📋 Plan: [...]
🤔 Thinking: processing...
📝 File created: /workspace/user_1/document.docx
✅ Task completed!
📦 Summary: "Created Word document!"

━━━ Test Results ━━━

ℹ Duration: 5234ms
ℹ Messages received: 8
ℹ Action types: plan, write_code, finish_summery
ℹ LLM calls made: 3
ℹ Break points reached: intent_detection, specialist_routing, llm_call, planning, execution, summary

━━━ LLM Call Summary ━━━

1. qwen/qwen3-coder-30b-a3b-instruct - ✓ Success (1234ms)
2. gpt-4o - ✓ Success (2345ms)
3. gpt-4o - ✓ Success (567ms)

━━━ Errors Detected ━━━

🔴 action_parse_error
🔴 execution_failure

⚠️  Missed break points: none
✓ Test completed successfully
```

## What This Reveals

1. **Specialist Response Issues**: If specialist returns empty string
2. **Planning Failures**: If planning generates zero tasks
3. **Action Parsing Errors**: If LLM returns invalid XML format
4. **Execution Failures**: If tasks fail to execute
5. **LLM API Errors**: If API calls return 400/500 errors
6. **Flow Breaks**: Exactly where the process stops

## Current Known Issues

Based on previous runs:
- ✅ Qwen specialist returns empty content
- ✅ Planning generates zero tasks
- ✅ Action parsing fails with "Invalid input - not a string"
- ✅ Execution fails 3 times consecutively
- ✅ Summary lies about file creation when no files were made
