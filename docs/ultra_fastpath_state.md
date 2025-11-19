# Ultra DOCX Fast-Path – Current State & Issues

## 1. Execution Layers & How They Connect

- **Profile extraction**
  - Triggered on each `/api/agent/run`.
  - Uses LLM to pull explicit user details (name, etc.) from the latest message.
  - Non-critical: failures/timeouts are logged but the main task continues.

- **Intent detection (chat vs agent)**
  - LLM classifies the current message using conversation history.
  - For file-generation phrases like `make me a word document ...`, it returns `intent: "agent"`.
  - Log evidence:
    - `意图识别结果: agent`
    - `Mode Selection] Final mode: agent (original mode param: auto)`

- **Agentic routing (AgenticAgent)**
  - With `intent: agent`, the system uses the full agent/task pipeline.
  - Builds `ConversationContext` (messages, files, tasks, profile):
    - `ConversationContext] Built context ... { files: 0, tasks: 0, messages: 3, hasProfile: true }`
  - Passes this context into the `auto_reply` module:
    - `[AgenticAgent] Passing files to auto_reply: []`
    - `[AutoReply] Called with files: 0`

- **AutoReply routing inside the agent**
  - Checks for mode commands (none here).
  - Runs the **ultra fast-path** detector:
    - `[AutoReply] ⚡⚡ ULTRA Fast-path: Simple single-file generation detected`
    - `[AutoReply] Pattern matched: make me a word document about`
  - If ultra takes over and succeeds, it generates and executes Python directly.
  - If ultra returns `null`, AgenticAgent treats it as no auto reply and falls back (or in the current log, just ends with `auto_reply` result `null`).

## 2. Ultra DOCX Path – What It Is Supposed to Do

- **Trigger condition**
  - Regex on the goal text (e.g. `make me a word document about ...`) hits `simpleFileGenPattern`.
  - Sets `isWordDoc = true`, `isExcel = false`, and extracts a normalized title + topics.

- **LLM call for structured content**
  - `auto-reply/index.js` calls the general LLM wrapper with a **strict JSON prompt**:
    - Asks for an `UltraDocumentSchema`:
      ```json
      {
        "title": "Document Title",
        "sections": [
          { "heading": "Introduction", "body": "..." },
          ...
        ]
      }
      ```
    - For the pizza run, the LLM actually streamed a very rich JSON document (multiple sections, long bodies).

- **JSON cleanup & parsing (current JS code)**
  - Takes the raw streamed content (`rawResponse`) and:
    - Trims whitespace.
    - If a ```json fenced block exists, extracts the inner text.
    - Otherwise strips stray ``` fence markers.
  - Tries `JSON.parse(cleaned)`.
  - On failure, tries to salvage between the first `{` and last `}`.
  - **New behavior (code now in `auto-reply/index.js`):**
    - If JSON parses but `sections` is weird:
      - Loosely treats any object with `heading` / `title` / `name` + `body`/`content`/`text`/`paragraphs`/`description` as a section.
      - If nothing is usable, wraps the entire JSON/text into **one fallback section**.
    - If JSON **cannot parse at all**:
      - Still builds a `schema`:
        ```js
        schema = {
          title,
          sections: [{ heading: title, body: cleaned || rawResponse || '' }]
        };
        ```
      - This is meant to guarantee that *any* valid text from the LLM can be written into a DOCX, even if formatting is broken.

- **Python generation (write_code) without FileGenerator**
  - When `schema` exists and `isWordDoc` is true, `auto_reply` constructs an internal XML action plan:
    - `<write_code>` step: writes `create_doc_<timestamp>.py` with embedded `python-docx` script.
    - `<terminal_run>` step: runs `python3 create_doc_<timestamp>.py` **directly in the sandbox**.
  - This path **does not go through** the FileGenerator specialist or `runtime.executeCommand` – it is a direct `write_code + terminal_run` pair.
  - The Python template:
    - Imports `python-docx` and helpers.
    - Embeds `title` and `sections` from the JS `schema` into Python variables.
    - Iterates sections and writes headings + body paragraphs.

## 3. Normal Agentic File Generation Path (Non-Ultra)

- **Planner + FileGenerator**
  - For more complex tasks or when ultra is not used / returns `null`, the system uses the agentic planner and specialists (e.g. FileGenerator).
  - That path issues tool calls like:
    - `<write_code>` with `path=create_pizza_research_doc.py` (or similar).
    - Then a follow-up `<terminal_run>` (or an internal `runtime.executeCommand`) to actually execute the script.
  - Earlier logs (not in this snippet) have shown issues like `runtime.executeCommand is not a function`, meaning some file-gen actions never actually run inside the sandbox.

- **Key distinction vs ultra**
  - Ultra: **one-shot** direct `write_code + terminal_run` coming from `auto_reply` itself.
  - Full agent/task mode: multi-step planner → FileGenerator tool → separate execution runtime.
  - Failures in the FileGenerator / runtime layer do **not** affect ultra’s ability to run its own Python, but they *do* affect any fallback routes that rely on the general file-gen pipeline.

## 4. Current Issues Highlighted by Logs & Code

### 4.1 DB / LLM logging sync

- At startup:
  - `Error during sync: SequelizeUniqueConstraintError`
  - `SQLITE_CONSTRAINT: UNIQUE constraint failed: llm_logs_backup.id`
- Impact:
  - LLM log backup/sync is broken (duplicate IDs in `llm_logs_backup`).
  - Core app still continues (`GraceAI@0.4.0 start` and Vite dev server come up), but historical logging into the backup table is unreliable.

### 4.2 Ultra pizza run – beautiful JSON, parse still failed (old behavior)

- For the pizza request:
  - Ultra fast-path triggered correctly.
  - LLM streamed a long ` ```json` block with:
    - Title: `"The Art and Science of Pizza: Baking Styles and Varieties"`.
    - Many `sections` with long, valid-looking `heading` + `body` pairs.
  - However, the actual raw stream included extra junk and truncation:
    - A stray `json` token before `{`.
    - The response continued after the last logged section (Sicilian/Grandma, Roman, California, etc.), and the final JSON was not syntactically valid.

- The log from that run:
  - `[AutoReply] ULTRA timing: LLM_ms = 44586 chars = 8279`
  - `⚠️ Ultra JSON.parse failed first pass: Unexpected token 'j', "json {` ...`
  - `⚠️ Ultra JSON salvage parse failed: Expected ',' or ']' after array element in JSON at position 7494 (line 39 column 6)`
  - `⚠️ Ultra LLM response could not be parsed as JSON`
  - `⚠️ Ultra DOCX schema unavailable - returning null for agentic fallback`

- What this means:
  - The LLM *did* produce all the pizza content you wanted.
  - Because of OpenRouter’s streaming format / extra `json` tokens and incomplete close, the JSON as seen by JS was invalid.
  - The then-active code did **not** build a fallback `schema` from the raw text; it simply gave up and returned `null`.
  - Result: AgenticAgent saw `auto_reply` result as `null` and treated the task as done with no doc produced.

- State **after** code edits (not yet confirmed live in your container):
  - The JS now, on parse failure, creates a single-section `schema` from `cleaned || rawResponse` instead of returning `null`.
  - That would prevent `Ultra DOCX schema unavailable` for this kind of malformed-but-rich output.

### 4.3 File generation not reliably executing in sandbox (non-ultra)

- Separate from ultra, the general file-gen path has shown:
  - Planner creates `<write_code>` actions.
  - Some runs do **not** successfully execute the generated scripts inside the Docker sandbox (e.g. `runtime.executeCommand` issues from previous logs).
  - That means: even when the planner builds good Python for doc creation, the actual `.py` file may not be run or its outputs (like `.docx`) may not appear.

- Combined with ultra issues:
  - When ultra returns `null` (as in the old pizza run), the system depends on the general agentic pipeline to produce the file.
  - Any instability in the FileGenerator / sandbox execution makes this fallback unreliable.

### 4.4 Confusion in Docker service naming

- `docker-compose ps` previously showed:
  - Service: `grace` (container `grace-app`)
- Manual commands you tried:
  - `docker-compose stop grace-app`
  - `docker-compose up -d grace-app`
  - These returned `no such service: grace-app` because the compose service is named `grace`, not `grace-app`.
- Effect:
  - Restart attempts using the wrong service name don’t reload the new JS code, so logs still reflect the old ultra behavior.

## 5. Summary of Current Ultra Fast-Path State

- **Execution layers** are working end-to-end:
  - Profile → intent → agent mode → AgenticAgent → AutoReply → ultra pattern match.
- **Ultra DOCX design** is conceptually right:
  - One-shot LLM JSON → `schema` → generated Python → `python-docx` in sandbox.
- **Real issues right now**:
  - LLM JSON is often wrapped/duplicated in streaming ` ```json` blocks and not strictly valid.
  - Old ultra code treated any JSON parse failure as a hard stop, discarding rich content.
  - New JS code is written to always salvage text into a schema, but the running container still needs to be rebuilt/restarted with the updated `auto-reply/index.js`.
  - The general FileGenerator / runtime execution path has its own reliability issues in the sandbox, so falling back from ultra is not a guaranteed save.

- **Net effect for your pizza-style requests (today)**:
  - You *can* see that the LLM produced an excellent multi-section pizza document in the logs.
  - Ultra fast-path, in the code that was actually running for that log, failed purely on schema/JSON parsing and then returned `null`.
  - The fallback agent/task path did not step in to generate a doc from that same content inside the sandbox.
