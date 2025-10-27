# GRACEai Execution Baseline - Working Configuration
**Date:** October 26, 2025  
**Status:** ✅ WORKING - write_code + terminal_run execution successful

---

## Git Commit Hash
**grace-app:** `4ecfac596e8ac984dc6c53697c7a363baa130538`  
**Commit Message:** "WIP: Attempt write_code routing to runtime sandbox"

**Custom Sandbox Image:** `grace-runtime-sandbox:custom`  
- Built from: `hexdolemonai/lemon-runtime-sandbox:latest`
- Includes: Custom action handlers + Python packages

---

## Test Case - NFL QB Ratings Excel Generation
**Conversation ID:** `a2007232-9390-4cac-b6d0-86d11f1ccdd9`  
**Request:** Create Excel spreadsheet with NFL QB ratings for 2025

### Execution Flow

**1. write_code Action**
- **File:** `todo.md`
- **Path:** `/workspace/user_1/Conversation_a20072/todo.md`
- **Status:** ✅ Success
- **Result:** "File /workspace/user_1/Conversation_a20072/todo.md written successfully"

**2. terminal_run Action**
- **Command:** `python3 -c "import pandas as pd..."`
- **Working Directory:** `./user_1/Conversation_a20072`
- **Status:** ✅ Success
- **Output:** "✅ Created: nfl_qb_2025_ratings.xlsx"
- **File Created:** `nfl_qb_2025_ratings.xlsx` (6176 bytes)

---

## Architecture Overview

### Container Communication
```
grace-app (graceai_default network)
    ↓
    HTTP POST to http://host.docker.internal:32811/execute_action
    ↓
lemon-runtime-sandbox (graceai_default network)
    ↓
    Executes action and returns result
```

### Key Components

**grace-app Container:**
- **Network:** `graceai_default`
- **Port:** 5005
- **Source Mount:** `./src:/app/src` (hot-reload)
- **Workspace Mount:** `./workspace:/app/workspace`

**lemon-runtime-sandbox Container:**
- **Network:** `graceai_default` (CRITICAL - must be on same network)
- **Ports:** 32811 (action server), 40232, 53596, 55184
- **Workspace Mount:** `./workspace:/workspace` (CRITICAL - shared with grace-app)
- **Image:** `grace-runtime-sandbox:custom`

---

## Code Path Analysis

### grace-app: DockerRuntime.local.js

**write_code Handler (Lines 241-252):**
```javascript
case 'write_code':
  // Prepend user_id AND conversation directory to ALL path parameters
  if (action.params.path) {
    action.params.origin_path = action.params.path;
    action.params.path = path.join(`user_${this.user_id}`, dir_name, action.params.path);
  } else if (action.params.file_path) {
    action.params.file_path = path.join(`user_${this.user_id}`, dir_name, action.params.file_path);
  } else if (action.params['@_file_path']) {
    action.params['@_file_path'] = path.join(`user_${this.user_id}`, dir_name, action.params['@_file_path']);
  }
  result = await this._call_docker_action(action, uuid);
  break;
```

**terminal_run Handler (Lines 256-267):**
```javascript
case 'terminal_run':
  if (action.params.cwd) {
    action.params.origin_cwd = action.params.cwd;
    action.params.cwd = path.join(`user_${this.user_id}`, dir_name, action.params.cwd)
  } else {
    action.params.cwd = `./user_${this.user_id}/${dir_name}`
  }
  if (action.params.origin_cwd) {
    action.params.cwd = action.params.origin_cwd
  }
  result = await this._call_docker_action(action, uuid);
  break;
```

**_call_docker_action Method (Lines 330-338):**
```javascript
async _call_docker_action(action, uuid) {
  const host = DOCKER_HOST_ADDR ? DOCKER_HOST_ADDR : 'localhost'
  const request = {
    method: 'POST',
    url: `http://${host}:${this.host_port}/execute_action`,
    data: { action: action, uuid: uuid },
  };
  const response = await axios(request);
  return response.data.data
}
```

---

## Path Resolution

### write_code Paths
- **Input:** `todo.md`
- **Transformed:** `user_1/Conversation_a20072/todo.md`
- **Final in Sandbox:** `/workspace/user_1/Conversation_a20072/todo.md`

### terminal_run Paths
- **Input cwd:** Not specified (uses default)
- **Transformed:** `./user_1/Conversation_a20072`
- **Final in Sandbox:** `/workspace/user_1/Conversation_a20072`

### Path Pattern
```
user_${user_id}/Conversation_${conversation_id_first_6_chars}/${filename}
```

---

## Sandbox Customizations

### Custom Files Added
1. **action_execution_server.js** - Added write_code handler
2. **terminal_run.js** - Changed shell from `sh` to `/bin/bash`
3. **utils/tools.js** - Handle multiple path parameter variants (path, file_path, @_file_path)

### Python Packages Installed
- pypdf, pypdf2
- python-docx
- openpyxl, xlsxwriter
- pandas, numpy
- pillow
- pdfplumber, reportlab
- matplotlib, seaborn
- requests, beautifulsoup4, lxml

---

## Agents Involved

### Request Flow
1. **User Request** → grace-app API endpoint
2. **AgenticAgent** → Coordinates task execution
3. **Specialist Agent** → Generates Python code for Excel creation
4. **CodeAct Agent** → Executes write_code and terminal_run actions
5. **DockerRuntime** → Routes actions to sandbox
6. **Runtime Sandbox** → Executes Python code and writes files

### Action Types Used
- **write_code** - Write todo.md file to workspace
- **terminal_run** - Execute Python script with pandas
- **finish** - Complete task and return results

---

## Critical Success Factors

### Network Configuration
✅ Both containers on `graceai_default` network  
✅ grace-app can reach sandbox via `host.docker.internal:32811`

### Volume Mounts
✅ Shared workspace: `./workspace` mounted to both containers  
✅ grace-app: `/app/workspace`  
✅ sandbox: `/workspace`

### Path Handling
✅ grace-app prepends `user_${user_id}/Conversation_${conv_id}/`  
✅ Sandbox receives full path and writes to shared volume  
✅ terminal_run executes in correct working directory

### Action Routing
✅ write_code calls `_call_docker_action` (not local method)  
✅ terminal_run calls `_call_docker_action`  
✅ Sandbox has handlers for both action types

---

## Dockerfile - grace-runtime-sandbox:custom

```dockerfile
# Start from the original lemon runtime sandbox image
FROM hexdolemonai/lemon-runtime-sandbox:latest

# Install Python packages for document processing
RUN pip install --no-cache-dir \
    pypdf \
    pypdf2 \
    python-docx \
    openpyxl \
    xlsxwriter \
    pandas \
    numpy \
    pillow \
    pdfplumber \
    reportlab \
    matplotlib \
    seaborn \
    requests \
    beautifulsoup4 \
    lxml

# Copy our customized files
COPY action_execution_server.js /chataa/code/chataa/action_execution_server.js
COPY terminal_run.js /chataa/code/chataa/terminal_run.js
COPY tools.js /chataa/code/chataa/utils/tools.js

# Ensure proper permissions
RUN chmod +x /chataa/code/chataa/action_execution_server.js && \
    chmod +x /chataa/code/chataa/terminal_run.js && \
    chmod +x /chataa/code/chataa/utils/tools.js

# Set the command to run action_execution_server
CMD ["node", "/chataa/code/chataa/action_execution_server.js", "--port=32811"]
```

---

## Startup Commands

### grace-app
```bash
docker-compose up -d
```

### lemon-runtime-sandbox
```bash
docker run -d --name lemon-runtime-sandbox \
  --network graceai_default \
  -p 32811:32811 -p 40232:40232 -p 53596:53596 -p 55184:55184 \
  -v $PWD/workspace:/workspace \
  grace-runtime-sandbox:custom
```

---

## Verification Commands

### Check Network
```bash
docker network inspect graceai_default --format='{{range .Containers}}{{.Name}} {{end}}'
# Expected: lemon-runtime-sandbox grace-app
```

### Test Sandbox Connectivity
```bash
curl -s http://localhost:32811/execute_action -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":{"type":"terminal_run","params":{"command":"echo","args":"test","cwd":"."}},"uuid":"test123"}'
# Expected: {"message":"Received POST /action","data":{...}}
```

### Check Logs
```bash
# grace-app logs
docker logs grace-app 2>&1 | grep -E "write_code|terminal_run|execute_action"

# sandbox logs
docker logs lemon-runtime-sandbox 2>&1 | grep -E "POST|Received|terminal_run"
```

---

## Known Issues & Solutions

### Issue: Containers can't communicate
**Solution:** Ensure both on `graceai_default` network
```bash
docker network connect graceai_default lemon-runtime-sandbox
```

### Issue: Sandbox exits immediately
**Solution:** Ensure CMD is set in Dockerfile to run action_execution_server

### Issue: Files not found after write_code
**Solution:** Ensure workspace volume is mounted to both containers at correct paths

### Issue: Python packages missing
**Solution:** Rebuild custom sandbox image with required packages in Dockerfile

---

## Future Considerations

### For More Complex Requests
- Monitor path resolution for nested directories
- Verify all Python dependencies are installed in sandbox
- Check memory/CPU limits if processing large files
- Ensure timeout settings accommodate long-running scripts

### Scaling
- Consider adding more sandbox instances for parallel execution
- Implement health checks for sandbox availability
- Add retry logic for transient network failures

---

**END OF BASELINE DOCUMENT**
