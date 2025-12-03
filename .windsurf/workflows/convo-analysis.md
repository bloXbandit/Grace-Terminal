---
description: 
auto_execution_mode: 3
---

When analyzing GRACEai execution:

Get FULL logs first - don't truncate
bash
docker logs grace-app --tail 2000 > /tmp/grace.log
docker logs lemon-runtime-sandbox --tail 2000 > /tmp/sandbox.log
Search systematically (like Ctrl+F):
Conversation ID → find all related entries
Look for execution markers: ULTRA, write_code, terminal_run, finish_summery
Check for outcomes: ✅ Created, Error, SyntaxError
Match grace-app → sandbox flow:
grace-app: shows intent detection, Ultra trigger, action XML generation
sandbox: shows actual Python execution, stdout/stderr
Don't assume - grep for actual proof:
Success: grep for "Created.*docx"
Failure: grep for "Error|SyntaxError|Traceback"
Read what user sends completely - they already did the Ctrl+F work