# Docker Runtime Architecture

## Container Setup

### Main Application Container: `grace-app`
- **Image:** `grace-ai:custom` (built from `./containers/app/Dockerfile`)
- **Port:** `5005:5005`
- **Network:** `graceai_default`
- **Mounts:**
  - `./src:/app/src` (hot-reload, no rebuild needed)
  - `./workspace:/app/workspace` (shared workspace)
  - `./data:/app/data` (database)
  - `.env` file (API keys)

### Runtime Sandbox Container: `lemon-runtime-sandbox`
- **Image:** `grace-runtime-sandbox:custom` (built from `./containers/runtime-sandbox/Dockerfile`)
- **Port:** `32811:3000`
- **Network:** `graceai_default` (MUST match grace-app)
- **Mounts:**
  - `./workspace:/workspace` (shared workspace)

## Communication Flow

```
grace-app (DockerRuntime.local.js)
    ↓ HTTP POST to http://lemon-runtime-sandbox:32811/execute_action
lemon-runtime-sandbox (action_execution_server.js)
    ↓ Executes action (write_code, terminal_run)
    ↓ Returns result
grace-app (receives result)
```

## Path Translation

### grace-app → sandbox (outgoing)
- **write_code:** Prepends `user_${user_id}/Conversation_${conv_id}/` to paths
- **terminal_run:** Converts `/app/workspace/` → `/workspace/` for cwd

### sandbox → grace-app (incoming)
- **write_code result:** Converts `/workspace/` → `/app/workspace/` for filepath

### Path Pattern
- grace-app sees: `/app/workspace/user_1/Conversation_a20072/file.py`
- sandbox sees: `/workspace/user_1/Conversation_a20072/file.py`
- Both resolve to same physical file via shared mount

## Required Sandbox Files

### `/chataa/code/chataa/action_execution_server.js`
- Listens on port 3000
- Routes actions to handlers
- Returns results in format: `{ uuid, status, content, meta }`

### `/chataa/code/chataa/terminal_run.js`
- Executes shell commands via `/bin/bash`
- Handles cwd parameter
- Returns stdout/stderr

### `/chataa/code/chataa/utils/tools.js`
- **write_code handler:**
  - Accepts: `path`, `file_path`, `@_file_path`, `content`, `#text`
  - Handles XML parsing variants
  - Returns: `{ status, content, meta: { filepath } }`
- **restrictFilepath:** Validates and normalizes paths

## Rebuild Checklist (No Cache)

### 1. Stop and remove existing containers
```bash
docker stop grace-app lemon-runtime-sandbox
docker rm grace-app lemon-runtime-sandbox
```

### 2. Remove old network (if needed)
```bash
docker network rm graceai_default
```

### 3. Build main app
```bash
docker-compose build --no-cache
```

### 4. Build sandbox
```bash
cd containers/runtime-sandbox
docker build --no-cache -t grace-runtime-sandbox:custom .
cd ../..
```

### 5. Start main app (creates network)
```bash
docker-compose up -d
```

### 6. Start sandbox on same network
```bash
docker run -d \
  --name lemon-runtime-sandbox \
  --network graceai_default \
  -p 32811:3000 \
  -v $PWD/workspace:/workspace \
  grace-runtime-sandbox:custom \
  sh -c "node /chataa/code/chataa/action_execution_server.js --port=3000 & exec tail -f /dev/null"
```

### 7. Verify connectivity
```bash
# Check both containers are on same network
docker inspect grace-app | grep -A 10 "Networks"
docker inspect lemon-runtime-sandbox | grep -A 10 "Networks"

# Check sandbox is reachable from grace-app
docker exec grace-app curl -X POST http://lemon-runtime-sandbox:3000/execute_action
```

## Critical Configuration

### DockerRuntime.local.js (grace-app)
```javascript
// Line 86: Fixed port for sandbox
this.host_port = 32811;

// Lines 240-252: write_code path handling
case 'write_code':
  // Prepend user_id/conversation to path
  action.params.path = path.join(`user_${this.user_id}`, dir_name, action.params.path);
  result = await this._call_docker_action(action, uuid);
  // Convert sandbox response path
  if (result && result.meta && result.meta.filepath) {
    result.meta.filepath = result.meta.filepath.replace('/workspace/', '/app/workspace/');
  }
  break;

// Lines 257-272: terminal_run path handling
case 'terminal_run':
  if (action.params.cwd) {
    action.params.origin_cwd = action.params.cwd;
    action.params.cwd = path.join(`user_${this.user_id}`, dir_name, action.params.cwd)
  } else {
    action.params.cwd = `./user_${this.user_id}/${dir_name}`
  }
  if (action.params.origin_cwd) {
    // Convert grace-app path to sandbox path
    let cwd = action.params.origin_cwd;
    if (cwd.startsWith('/app/workspace/')) {
      cwd = cwd.replace('/app/workspace/', '/workspace/');
    }
    action.params.cwd = cwd;
  }
  result = await this._call_docker_action(action, uuid);
  break;
```

### _call_docker_action (grace-app)
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

## Sandbox Python Packages

Installed via Dockerfile:
- pypdf, pypdf2
- python-docx
- openpyxl
- pandas
- matplotlib
- requests

## Network Requirements

- **MUST:** Both containers on `graceai_default` network
- **MUST:** Sandbox accessible at `lemon-runtime-sandbox:3000` from grace-app
- **MUST:** Shared workspace volume mounted to both containers
- **Port 32811:** External access to sandbox (for debugging)
- **Port 5005:** External access to grace-app API

## Hot-Reload Behavior

- **grace-app:** Changes to `./src` files reload automatically (no restart needed)
- **sandbox:** Changes require rebuild and container restart
- **workspace:** Files are immediately visible to both containers (shared mount)

## Troubleshooting

### "Cannot read properties of undefined (reading 'split')"
- **Cause:** Trying to read dynamic ports from container
- **Fix:** Use fixed port `this.host_port = 32811` (line 86)

### "ENOENT: no such file or directory"
- **Cause:** Path mismatch between grace-app and sandbox
- **Fix:** Ensure path conversion in write_code/terminal_run

### "Received undefined" in write_code
- **Cause:** XML parsing creates `#text` instead of `content`
- **Fix:** Sandbox tools.js handles both variants (lines 23-28)

### "network graceai_default not found"
- **Cause:** Network doesn't exist
- **Fix:** Run `docker-compose up -d` first to create network

### Containers can't communicate
- **Cause:** Different networks
- **Fix:** Verify both on `graceai_default` with `docker inspect`
