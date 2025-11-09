# GRACEai Foolproof Startup Guide

## 🚀 Quick Start (New Machine or Fresh Clone)

```bash
# 1. Validate FIRST
make validate

# 2. If validation passes, rebuild
make rebuild

# 3. Check it's running
docker ps
```

That's it! ✅

---

## 📋 Common Scenarios

### After Git Pull
```bash
make validate
make restart    # If only code changed
make rebuild    # If dependencies changed
```

### UI Shows Blank / ECONNREFUSED Errors
```bash
# Backend probably crashed
docker restart grace-app

# Still broken? Check logs
docker logs grace-app --tail 50
```

### After Changing package.json or Dockerfile
```bash
make validate   # Check first
make rebuild    # Full rebuild with --no-cache
```

### Setting Up on New Laptop
```bash
git clone <repo-url>
cd GRACEai
make validate
make rebuild
```

---

## ⚡ Quick Commands Reference

| Command | When To Use |
|---------|-------------|
| `make validate` | Before any rebuild, on new machine |
| `make rebuild` | After dependency changes, includes validation |
| `make restart` | After code-only changes |
| `docker restart grace-app` | Quick fix for crashes |

---

## 🔍 Troubleshooting

### Backend Won't Start
```bash
# 1. Check validation
make validate

# 2. If issues found, fix them then:
make rebuild

# 3. Check startup logs
docker logs grace-app | head -50
```

### UI Loads Blank / No Conversations
```bash
# Backend crashed - check if running
docker ps | grep grace-app

# If not running, restart
docker restart grace-app

# If still broken, rebuild
make rebuild
```

### Missing Python Packages (pdfplumber, PyP6XER, etc.)
```bash
# 1. Validation will catch this
make validate

# 2. Add to containers/app/Dockerfile
# RUN pip3 install --no-cache-dir <package-name>

# 3. Rebuild
make rebuild
```

### Port 3000 ECONNREFUSED
```bash
# Backend not running on port 3000
docker restart grace-app

# Check if it's up
docker exec grace-app curl -s http://localhost:3000 || echo "Still down"
```

---

## 🛡️ Golden Rule

**ALWAYS run `make validate` before `make rebuild`**

The validator catches 99% of issues before they break your system.

---

## 📝 What `make validate` Checks

✅ Node.js dependencies (package.json)  
✅ Python packages (PyP6XER, pdfplumber, etc.)  
✅ Docker configuration  
✅ Critical source files  
✅ Frontend build  
✅ Environment variables

**If validation passes → rebuild is safe**  
**If validation fails → fix errors first**

---

## Example: Complete Fresh Setup

```bash
# On new MacBook
git clone https://github.com/your-repo/GRACEai.git
cd GRACEai

# Validate system
make validate
# Output: ✅ All checks passed!

# Rebuild Docker
make rebuild
# Auto-validates, builds, starts

# Verify it's running
docker ps
# Should see grace-app running on port 3000

# Open browser
# http://localhost:5005
```

Done! 🎉

---

## When Things Go Wrong

1. **Run validation**: `make validate`
2. **Fix reported errors**
3. **Rebuild**: `make rebuild`
4. **Check logs**: `docker logs grace-app --tail 50`
5. **Still broken?** Share logs with team

**The validator tells you EXACTLY what's missing.**
