# GRACEai Validation System

## Overview

The validation system ensures GRACEai has all required dependencies and files before starting. This prevents runtime errors from missing packages or configurations, especially when:

- Rebuilding with `--no-cache`
- Setting up on a new machine
- Fresh cloning the repository
- After major dependency changes

## Components

### 1. Startup Validator (`src/utils/startup-validator.js`)

**Runs automatically** when the backend starts. Validates:

✅ **Node.js packages** (express, sequelize, koa, etc.)  
✅ **Python packages** (pdfplumber, docx, openpyxl, PyP6XER, etc.)  
✅ **Required files** (fileAnalyzer.js, auto-reply, P6XerTool, etc.)  
✅ **Required directories** (workspace, data, src, frontend, public)  
✅ **Frontend build** (index.html, assets/)

**Behavior:**
- ❌ **CRITICAL ERRORS** → Server refuses to start (exits with code 1)
- ⚠️ **WARNINGS** → Server starts but logs warnings
- ✅ **ALL PASSED** → Server starts normally

### 2. Pre-Build Validator (`scripts/validate-build.sh`)

**Runs manually or via Makefile** before Docker builds. Validates:

✅ package.json and dependencies  
✅ Dockerfile configuration  
✅ docker-compose.yml volumes  
✅ Critical source files  
✅ Frontend directory and build  
✅ Environment variables (.env)

**Usage:**
```bash
# Manual validation
bash scripts/validate-build.sh

# Via Makefile
make validate
```

## Makefile Commands

### Existing Commands (Enhanced)

```bash
# Rebuild with validation (RECOMMENDED)
make rebuild
# Now includes automatic validation before rebuild

# Quick restart (no validation)
make restart
# Use for code-only changes
```

### New Commands

```bash
# Run validation only
make validate
# Checks system without building

# Safe build with extra checks
make safe-build
# Validates → Rebuilds → Health checks
```

## Validation on Different Machines

### Fresh Setup (New Laptop)

```bash
# 1. Clone repository
git clone <repo-url>
cd GRACEai

# 2. Validate before anything else
make validate

# 3. If validation passes, rebuild
make rebuild

# 4. Check startup logs
docker logs grace-app | grep "Startup Validator"
```

### After Pulling Updates

```bash
# 1. Pull latest code
git pull

# 2. Validate
make validate

# 3. If package.json changed, rebuild
make rebuild

# 4. If only code changed, restart
make restart
```

### Zero-Cache Rebuild

```bash
# Always validate first
make rebuild
# Automatically runs validation before --no-cache build
```

## What Gets Checked

### Critical Node.js Packages
- express
- sequelize
- koa, koa-router
- All dependencies in package.json

### Critical Python Packages
- pdfplumber (PDF extraction)
- python-docx (Word docs)
- openpyxl (Excel files)
- PyP6XER → xerparser (Primavera P6 XER files)
- pandas, PyPDF2, pypdf

### Critical Files
- `src/utils/fileAnalyzer.js` - File upload analyzer
- `src/agent/auto-reply/index.js` - Auto-reply with file detection
- `src/tools/P6XerTool.js` - Primavera P6 tool
- `package.json` - Dependencies
- `.env` - Environment config (optional warning)

### Critical Directories
- `workspace/` - User workspaces
- `data/` - Database
- `src/` - Source code
- `frontend/` - Frontend app
- `public/` - Built frontend assets

### Frontend Build
- `public/index.html` - Main HTML
- `public/assets/` - JS/CSS bundles

## Error Handling

### Example: Missing Dependency

**Startup logs:**
```
🔍 [Startup Validator] Running system checks...

📦 Checking Node.js packages...
  ✓ express
  ✓ sequelize
  ✗ koa-router - MISSING

❌ CRITICAL ERRORS:
   - Missing Node package: koa-router

💥 STARTUP VALIDATION FAILED - Cannot start server
```

**Fix:**
```bash
# Add to package.json
npm install koa-router

# Or rebuild Docker
make rebuild
```

### Example: Missing Python Package

**Startup logs:**
```
🐍 Checking Python packages...
  ✓ pdfplumber
  ✗ PyP6XER - MISSING

❌ CRITICAL ERRORS:
   - Missing Python package: PyP6XER
```

**Fix:**
```bash
# Add to containers/app/Dockerfile
RUN pip3 install --no-cache-dir PyP6XER

# Rebuild
make rebuild
```

### Example: Missing Frontend Build

**Startup logs:**
```
🎨 Checking frontend build...
  ⚠ index.html - MISSING

⚠️ WARNINGS:
   - Frontend build may be incomplete: missing index.html
```

**Fix:**
```bash
# Build frontend
cd frontend
npm run build

# Restart (no rebuild needed)
docker compose restart
```

## Bypassing Validation (NOT RECOMMENDED)

If you need to skip validation temporarily:

```bash
# Skip pre-build validation
docker compose build --no-cache grace

# Startup validation cannot be bypassed
# (It's built into the app startup)
```

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
# .github/workflows/deploy.yml
steps:
  - name: Validate System
    run: make validate
    
  - name: Build Docker
    run: docker compose build --no-cache
    if: steps.validate.outcome == 'success'
```

## Monitoring

Check validation results in logs:

```bash
# Startup validation
docker logs grace-app | grep "Startup Validator" -A 20

# Pre-build validation
make validate
```

## Extending Validation

### Add New Package Check

Edit `src/utils/startup-validator.js`:

```javascript
const requiredPackages = [
  'express',
  'your-new-package',  // Add here
];
```

### Add New File Check

```javascript
const requiredFiles = [
  'src/app.js',
  'src/your-new-file.js',  // Add here
];
```

### Add New Python Package

```javascript
const requiredPackages = [
  'pandas',
  'your-python-package',  // Add here
];
```

## Benefits

✅ **Catch errors early** - Before runtime  
✅ **Clear error messages** - Know exactly what's missing  
✅ **Prevents silent failures** - File analyzer won't silently fail  
✅ **Cross-machine consistency** - Same checks everywhere  
✅ **Documentation** - Validation output documents requirements  
✅ **CI/CD ready** - Automated validation in pipelines

## Troubleshooting

### Validation passes but app crashes

Check specific module imports:
```bash
docker exec grace-app node -e "require('./src/utils/fileAnalyzer')"
```

### Pre-build validation fails

Fix the reported errors, then:
```bash
make validate  # Run again
make rebuild   # If validation passes
```

### Startup validation hangs

Check Python execution:
```bash
docker exec grace-app python3 --version
docker exec grace-app python3 -c "import pdfplumber"
```

## Summary

The validation system provides **defense-in-depth**:

1. **Pre-build** - Catch structural issues
2. **Startup** - Catch runtime dependency issues
3. **Makefile** - Automatic validation in rebuild workflow

**Use `make rebuild` for all builds** to ensure validation runs automatically!
