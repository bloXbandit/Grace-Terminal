---
description: End‑to‑End Chat Execution & UI Consistency Debug Flow
auto_execution_mode: 3
---

1. Reproduce with a single, known test
Pick or write a deterministic test (e.g. node test_grace_live.js test word).
Run it and copy the exact failure:
Breakpoint where it stops (llm_call, execution, etc.).
Top stack trace line and file:line (auto-reply/index.js:566:14).
This anchors everything in one reproducible scenario.

2. Read backend logs around that run
docker logs grace-app --tail 80
Look for:
[AutoReply] ..., [AgenticAgent] ..., [CodeAct] ....
Errors (ReferenceError, TypeError), or “Failed ...”.
Any lines with the goal text or conversation id from the test.
You want: “What happened right before it blew up?” and “Which code path?” (ultra vs agentic).

3. Confirm which file & line is actually running
Once you see e.g. auto_reply (/app/src/agent/auto-reply/index.js:566:14):
Open the host file at that line.
If it doesn’t match the error context, check container copy:
docker exec grace-app sed -n '560,575p' /app/src/agent/auto-reply/index.js
This avoids chasing stale code or wrong branches.
Goal: host code and container code match around the failing line.

4. Map the execution path in your head
For ultra-like flows, explicitly map:

Routing: regex → 
auto_reply
.
LLM: 
src/utils/llm
 call.
Action generation: XML / preGeneratedAction.
Execution: 
code-act.js
 → 
runtime.write_code
 + terminal_run.
UI: streamed tokens + finish_summery summary.
Now you know where your change belongs and what you mustn’t touch.

5. Localize the bug with minimal code inspection
Use grep to find all occurrences of critical symbols:
e.g. grep "sections" auto-reply/index.js
Check just the small block around the failing line (10–30 lines).
Ask: “Is this JS or Python code? Is this string interpolation or real code?”
This is where we noticed ${sections} inside a JS template literal for Python.

6. Add targeted logs (only where needed)
Add short, structured logs right before suspect points:
e.g. [AutoReply] DEBUG: about to start marshaling
Sample the first 200–500 chars of generated XML/Python.
Re-run the test and confirm:
Do these logs appear?
Does the content look like you expect (placeholders replaced, correct filetype)?
If logs do not appear, you’re failing before that point.

7. Fix one narrow layer at a time
Decide which layer is responsible:
Regex / routing?
LLM prompt / schema?
Marshaling (JS → Python)?
Execution / sandbox tool?
Summary / UI masking?
Apply a small, scoped change in that layer only:
Example: remove all ${...} from Python body and build it by concatenation.
Or filter .py out of filesWithVersions before building “Created N files” summary.
Re-run the same test after each small change.

8. Reconfirm end-to-end behavior and UI mapping
Test script:
See breakpoints move from llm_call → execution → thinking.
Logs:
Confirm LLM schema, generated script, and final ✅ Created X.docx.
Confirm no backend leaks you wanted to hide.
UI:
Check chat delivery:
No .py success lines.
Summary shows only user-facing docs (e.g. ✅ Created Adhd.docx).
File appears in workspace panel.
This closes the loop: code → logs → test harness → UI all aligned.

9. Quick-fix vs full workflow
Quick fix (small bug):
Steps 1–3, 5, 7, 8.
One test, one log scan, one tiny change.
Full workflow (like sections bug):
Steps 1–8 with:
Container vs host comparison.
LLM JSON inspection.
Marshaling + Python template review.
Docker restart when needed.