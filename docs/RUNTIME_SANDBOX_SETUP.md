# Runtime Sandbox Auto-Setup

## Overview
The runtime sandbox (`lemon-runtime-sandbox`) is automatically configured and kept in sync with `grace-app` during builds to prevent stale mismatches and configuration issues.

---

## Automatic Setup

### During Rebuild
When you run `make rebuild`, the system automatically:

1. ✅ Validates the codebase
2. ✅ Rebuilds `grace-app` container
3. ✅ **Sets up runtime sandbox** (new!)
   - Stops and removes old sandbox container
   - Creates fresh container with correct config
   - Connects to `graceai_default` network
   - Maps ports correctly (`32811:32811`)
   - Mounts workspace volume
   - Installs all Python modules
   - Verifies module installation
   - Tests connection to grace-app

---

## Manual Commands

### Full Rebuild (App + Sandbox)
```bash
make rebuild
```
This is the recommended way. It ensures both containers are in sync.

### Sandbox Only (if grace-app is already running)
```bash
make setup-sandbox
```
Use this if you only need to recreate the sandbox without rebuilding grace-app.

### Direct Script
```bash
bash scripts/setup-runtime-sandbox.sh
```
Same as `make setup-sandbox` but more explicit.

---

## What Gets Installed

### Python Modules (Auto-Synced)
The following modules are automatically installed in the sandbox:
- **Documents**: python-docx, reportlab, PyPDF2, pypdf, pdfplumber, pdfminer.six
- **Spreadsheets**: pandas, openpyxl, xlsxwriter
- **Presentations**: python-pptx
- **Images**: Pillow, pytesseract, pdf2image
- **Data Viz**: matplotlib, seaborn, plotly
- **Data Science**: numpy, pandas, scikit-learn
- **Web**: requests, beautifulsoup4, lxml
- **Specialized**: PyP6XER (P6/XER files), cryptography

**Note**: These modules match what's in `grace-app`'s Dockerfile to prevent version mismatches.

---

## Configuration

### Container Specs
- **Name**: `lemon-runtime-sandbox`
- **Image**: `grace-runtime-sandbox:custom`
- **Network**: `graceai_default` (same as grace-app)
- **Port**: `32811:32811` (CRITICAL - must match)
- **Volume**: `./workspace:/workspace` (shared with grace-app)

### Port Mapping Explained
```
grace-app → http://host.docker.internal:32811/execute_action
                                        ↓
                            Host machine port 32811
                                        ↓
                    lemon-runtime-sandbox port 32811
                                        ↓
                        action_execution_server.js
```

**Why 32811:32811?**
- The server inside the container listens on `32811`
- Docker maps host port `32811` to container port `32811`
- grace-app connects via `host.docker.internal:32811`
- ❌ OLD (broken): `8080:32811` - server on 32811, Docker expected 8080

---

## Troubleshooting

### Socket Hang Up Errors
```
Error: socket hang up at Socket.socketOnEnd
```
**Cause**: Port mapping mismatch (8080:32811 instead of 32811:32811)  
**Fix**: Run `make setup-sandbox` to recreate with correct ports

### Module Not Found Errors
```
ModuleNotFoundError: No module named 'openpyxl'
```
**Cause**: Python modules not installed or container restarted  
**Fix**: Run `make setup-sandbox` to reinstall modules

### Connection Refused
```
ECONNREFUSED 172.20.0.3:32811
```
**Cause**: Containers not on same network  
**Fix**: Run `make setup-sandbox` (auto-connects to `graceai_default`)

### Stale Container
**Symptoms**: Old behavior persists after code changes  
**Fix**: Run `make rebuild` for full refresh

---

## Verification

### Check Container Status
```bash
docker ps | grep sandbox
# Should show: lemon-runtime-sandbox, Up, 0.0.0.0:32811->32811/tcp
```

### Check Network
```bash
docker network inspect graceai_default --format='{{range .Containers}}{{.Name}} {{end}}'
# Should show: grace-app lemon-runtime-sandbox
```

### Test Connection
```bash
docker exec grace-app curl -X POST http://host.docker.internal:32811/execute_action \
  -H "Content-Type: application/json" \
  -d '{"action":{"type":"test"},"uuid":"test"}'
# Should return: {"message":"Received POST /action"}
```

### Check Modules
```bash
docker exec lemon-runtime-sandbox pip3 list | grep -i "pandas\|openpyxl\|docx"
```

---

## Why This Matters

### Before Auto-Setup
❌ Manual container creation  
❌ Easy to forget Python modules  
❌ Port mismatches cause silent failures  
❌ Containers out of sync with grace-app  
❌ Debugging takes hours

### After Auto-Setup
✅ One command rebuilds everything  
✅ Modules always installed  
✅ Ports always correct  
✅ Containers always in sync  
✅ Just works™

---

## Files Modified

- ✅ `Makefile` - Added sandbox setup to `rebuild` target
- ✅ `scripts/setup-runtime-sandbox.sh` - New automated setup script
- ✅ `docs/RUNTIME_SANDBOX_SETUP.md` - This documentation

---

## Integration Points

The sandbox setup integrates with:
1. **make rebuild** - Full system rebuild
2. **make validate** - Pre-build validation (grace-app only, sandbox checked after)
3. **docker compose** - grace-app orchestration
4. **Workspace volume** - Shared between both containers

---

## Best Practices

1. **Always use `make rebuild`** when updating dependencies
2. **Run `make setup-sandbox`** if you manually stopped the sandbox
3. **Never edit DockerRuntime.local.js** port settings (keep 32811)
4. **Check logs** if something doesn't work: `docker logs lemon-runtime-sandbox`
5. **Keep grace-app and sandbox in sync** by using the Makefile targets

---

## Future Improvements

Potential enhancements:
- [ ] Add sandbox to docker-compose.yml for unified orchestration
- [ ] Build custom sandbox image with modules pre-installed (no pip on startup)
- [ ] Add sandbox health check to validation script
- [ ] Auto-restart sandbox if grace-app restarts
- [ ] Version pinning for Python modules

---

**Last Updated**: November 11, 2025  
**Status**: ✅ Production Ready
