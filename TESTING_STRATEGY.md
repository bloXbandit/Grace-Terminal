# Grace AI Testing Strategy

## Overview
This document outlines the testing approach for catching Grace AI failures and regressions during development.

## Test Script Location
```
/Users/wonkasworld/Downloads/GRACEai/test_grace_live.js
```

## Purpose
The live test script provides a simple way to:
- **Catch Grace failures** before they reach production
- **Verify specialist routing** and multi-agent coordination
- **Test document generation** (Word, Excel, CSV)
- **Test code execution** (Python apps, dashboards)
- **Monitor execution flow** with detailed breakpoints

## Basic Usage

### Run All Tests
```bash
node test_grace_live.js test
```

### Run Specific Test
```bash
node test_grace_live.js test "Test Name"
```

### Examples
```bash
# Test document generation
node test_grace_live.js test "NFL QB"

# Test dashboard creation
node test_grace_live.js test "Full Stack"

# Test by mode
node test_grace_live.js test task
node test_grace_live.js test chat
```

## How It Works

1. **Calls Docker API** at `http://localhost:5005`
2. **Creates real conversations** with Grace
3. **Monitors execution** through breakpoints
4. **Verifies outputs** (files created, actions taken)
5. **Reports failures** with detailed logs

## Important Notes

### Docker Dependency
⚠️ **The test script ALWAYS uses the Docker container**
- Local code changes require Docker rebuild to test
- `docker-compose restart` does NOT reload code
- Must use `docker-compose build grace` for code changes

### Rebuild Process
```bash
# After code changes
docker-compose build grace
docker-compose up -d
sleep 60  # Wait for startup

# Then test
node test_grace_live.js test "Your Test"
```

## Test Categories

### Document Generation
- Word documents (`.docx`)
- Excel spreadsheets (`.xlsx`)
- CSV files (`.csv`)
- Uses **ORIGINAL METHOD** (direct execution)

### Web Development
- Flask apps
- Dashboards with frontend
- Uses **NEW METHOD** (write + execute)

### Data Processing
- Data analysis
- File transformations
- Uses **ORIGINAL METHOD** (direct execution)

## Catching Failures

The script detects:
- ❌ **Execution failures** (errors, crashes)
- ❌ **Empty responses** from specialists
- ❌ **Missing files** (expected outputs not created)
- ❌ **Routing issues** (wrong specialist called)
- ❌ **Timeout hangs** (no activity for 45s+)

## Test Output

### Success Indicators
```
✓ ✅ Created conversation
✓ ▶️  Execution phase started
✓ Received N messages
✓ Test completed successfully
```

### Failure Indicators
```
✗ ❌ HANG DETECTED
✗ 🔴 Execution failed
✗ ❌ Verification error
⚠ Missing expected actions
```

## Best Practices

1. **Test before committing** major changes
2. **Run full test suite** after specialist routing changes
3. **Check Docker logs** if tests fail unexpectedly
4. **Rebuild Docker** after planning/execution changes
5. **Add new test cases** for new features

## Recent Improvements

### Dual-Path Execution (Oct 2025)
- **Web apps**: Write to file + execute (avoids command-line limits)
- **Documents**: Direct execution (original working method)
- **Task type detection**: Routes to correct execution path

### Specialist Reflection
- Failed specialist actions now trigger reflection
- Automatic retry with adaptation
- Fallback chain: Primary → Fallback → GPT-5

### Empty Response Handling
- Detects empty specialist responses
- Triggers fallback to default model
- Ensures Grace always produces output

## Troubleshooting

### Test fails but UI works
- Docker may have newer code than test expects
- Rebuild Docker to sync

### Test works but UI fails
- Local changes not in Docker
- Run `docker-compose build grace`

### All tests timeout
- Check if Docker container is running
- Verify port 5005 is accessible
- Check Docker logs for startup errors

---

**Remember**: The test script is your first line of defense against regressions. Use it liberally! 🎯
