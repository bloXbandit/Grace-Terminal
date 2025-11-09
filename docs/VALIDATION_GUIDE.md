# GRACEai Validation System - Quick Guide

## ✅ What It Does

Prevents deployment failures from missing dependencies when:
- Rebuilding with `--no-cache`  
- Setting up on new machine
- After dependency changes

## 🎯 How To Use

### **Validation is OPT-IN** (Not Automatic)

Run validation **manually** before rebuilds:

```bash
# Option 1: Validate only (no build)
make validate

# Option 2: Safe rebuild (validates first, then rebuilds)
make rebuild
```

## Quick Commands

```bash
# Check system health before building
make validate

# Rebuild with validation (recommended)
make rebuild

# Quick restart (no validation)
make restart
```

## What Gets Checked

### Pre-Build Validation (`make validate`)
- ✅ Node.js dependencies (sequelize, koa, etc.)
- ✅ Python packages in Dockerfile (PyP6XER, pdfplumber, etc.)
- ✅ Docker configuration (volumes, mounts)
- ✅ Critical source files
- ✅ Frontend build status

### Why Not Automatic?

Automatic validation on **every** startup caused issues:
- ❌ Async validation blocked server startup
- ❌ Caused `ECONNREFUSED` errors
- ❌ Made debugging harder

**Solution**: Validation is **opt-in** via Makefile commands, runs BEFORE building.

## Usage Scenarios

### On New Machine
```bash
make validate   # Check first
make rebuild    # If validated OK
```

### After Git Pull
```bash
make validate   # Quick check
make restart    # If only code changed
make rebuild    # If dependencies changed
```

### Before Deployment
```bash
make validate   # Always validate first
```

## Example Output

### ✅ Success
```
✅ All checks passed!
System is ready for build.
```

### ❌ Failure
```
❌ Failed with 1 error(s)

CRITICAL ERRORS:
- Missing Python package: PyP6XER

Fix: Add to containers/app/Dockerfile
make rebuild
```

## Files Created

- `scripts/validate-build.sh` - Validation script
- `src/utils/startup-validator.js` - Validator module (not auto-run)
- `Makefile` - Enhanced with `validate` and `safe-build` targets

## Key Point

**Validation is a TOOL, not a BLOCKER.**  
Run it when you need it, especially before major changes or deploys.
