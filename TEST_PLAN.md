# Grace AI System Access Fix - Test Plan

## Prerequisites

1. Pull the latest changes from GitHub:
```bash
cd ~/Grace-Terminal
git pull origin main
```

2. Rebuild Docker image with fixes baked in:
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

3. Access Grace AI at: http://localhost:5005

## Test Cases

### Test 1: System Access Question (Primary Issue)

**Test in Chat Mode:**
1. Open Grace AI web interface
2. Select "Chat" mode
3. Type: "can you access my local system"
4. Press Enter

**Expected Response:**
```
Yes, I can access your local system when you need me to. I have both sandbox capabilities for isolated code execution and the ability to work with your local files and environment when requested.
```

**❌ FAIL if response contains:**
- "I can't access"
- "I don't have access"
- "I'm not able to access"
- Any denial of system access capabilities

**✅ PASS if response:**
- Confirms system access capability
- Mentions both sandbox and local system access
- Offers to help with system tasks

---

### Test 2: Sandbox Capability Question

**Test in Auto Mode:**
1. Switch to "Auto" mode
2. Type: "do you have a sandbox"
3. Press Enter

**Expected Response:**
```
Yes, I have full sandbox capabilities for safe code execution in an isolated Docker environment.
```

**❌ FAIL if response:**
- Denies having a sandbox
- Is uncertain about sandbox capabilities
- Says "I'm not sure"

**✅ PASS if response:**
- Confirms sandbox capabilities
- Mentions Docker or isolated environment
- Expresses confidence

---

### Test 3: Agent Routing Question

**Test in Task Mode:**
1. Switch to "Task" mode
2. Type: "do you have agent routing"
3. Press Enter

**Expected Response:**
```
Yes, I have a multi-agent routing system that uses specialist AI models for different tasks like code generation, debugging, creative writing, and more.
```

**❌ FAIL if response:**
- Denies having agent routing
- Doesn't mention specialist models
- Is vague or uncertain

**✅ PASS if response:**
- Confirms multi-agent routing
- Mentions specialist models
- May list example task types

---

### Test 4: General Capabilities Question

**Test in Chat Mode:**
1. Type: "what can you do"
2. Press Enter

**Expected Response should include:**
- ✅ File creation and manipulation
- ✅ Code execution in sandbox
- ✅ Local system access (when requested)
- ✅ Web browsing and research
- ✅ Multi-agent specialist routing
- ✅ Terminal commands

**❌ FAIL if response:**
- Denies any of the above capabilities
- Says "I can't" for things Grace CAN do
- Is overly modest or uncertain

**✅ PASS if response:**
- Lists multiple capabilities accurately
- Is confident and specific
- Offers to demonstrate capabilities

---

### Test 5: Variations of System Access Question

Test these variations to ensure consistency:

**Variation 1:** "can you access my local files"
**Expected:** Yes, with explanation of local file access

**Variation 2:** "are you able to work with my system files"
**Expected:** Yes, confirms ability to work with system files

**Variation 3:** "can you read files on my computer"
**Expected:** Yes, explains local file reading capability

**Variation 4:** "do you have access to my machine"
**Expected:** Yes, explains system access with sandbox/local distinction

**❌ FAIL if ANY variation:**
- Denies the capability
- Says "I can't" or "I'm not able to"

**✅ PASS if ALL variations:**
- Confirm the capability
- Provide helpful context
- Maintain consistent messaging

---

### Test 6: Identity Consistency

Test Grace's identity across all modes:

**Test A - Chat Mode:**
Type: "what's your name"
**Expected:** "I'm Grace" or "I'm Grace AI"
**❌ FAIL if:** Says "Lemon AI", "Claude", "GPT", or any other name

**Test B - Auto Mode:**
Type: "who are you"
**Expected:** "I'm Grace" or "I'm Grace AI"
**❌ FAIL if:** Identity is inconsistent with Chat mode

**Test C - Task Mode:**
Type: "introduce yourself"
**Expected:** Introduces as Grace AI with capabilities
**❌ FAIL if:** Uses different identity

---

### Test 7: Specialist Routing Still Works

**Test Code Generation:**
1. Type: "write a Python function to calculate fibonacci numbers"
2. Check console logs for: `[Specialist] Calling openrouter/anthropic/claude-sonnet-4.5`
3. Verify code is generated

**Expected:**
- ✅ Code is generated correctly
- ✅ Specialist routing logs appear
- ✅ Grace maintains identity in response

**❌ FAIL if:**
- No code generated
- Specialist routing broken
- Grace denies coding capability

---

### Test 8: Creative Writing Routing

**Test Creative Task:**
1. Type: "write a short poem about AI"
2. Check console logs for: `[Specialist] Calling openrouter/gryphe/mythomax-l2-13b`
3. Verify poem is generated

**Expected:**
- ✅ Creative content generated
- ✅ Routed to creative specialist
- ✅ Grace maintains identity

**❌ FAIL if:**
- No creative content
- Wrong specialist used
- Grace denies creative capability

---

### Test 9: No MASTER_SYSTEM_PROMPT Duplication

**Check Console Logs:**
1. Open browser developer console (F12)
2. Look at Network tab
3. Find LLM API calls
4. Check request payload

**Expected:**
- ✅ MASTER_SYSTEM_PROMPT appears ONCE as system message
- ✅ No duplication in user message
- ✅ Specialist prompts properly appended

**❌ FAIL if:**
- MASTER_SYSTEM_PROMPT appears multiple times
- System message is empty
- Prompts are malformed

---

### Test 10: Cross-Mode Consistency

**Test Sequence:**
1. Chat mode: "can you access my local system"
2. Auto mode: "can you access my local system"
3. Task mode: "can you access my local system"

**Expected:**
- ✅ All three modes give consistent "Yes" responses
- ✅ Wording may vary slightly but message is same
- ✅ No mode denies the capability

**❌ FAIL if:**
- Any mode denies capability
- Responses are contradictory
- One mode says "yes" and another says "no"

---

## Debugging Commands

If tests fail, check these:

### Check Docker Image
```bash
docker images | grep grace-ai
# Should show: grace-ai:custom
```

### Check Running Container
```bash
docker ps | grep grace
# Should show running container
```

### View Container Logs
```bash
docker logs grace-app
# Look for errors or prompt injection logs
```

### Check Code in Container
```bash
docker exec -it grace-app cat /app/src/agent/specialists/MultiAgentCoordinator.js | grep -A 5 "MASTER_SYSTEM_PROMPT"
# Should show the prepending logic
```

### Verify No Volume Mounts
```bash
docker inspect grace-app | grep -A 10 "Mounts"
# Should NOT show /app/src or /app/frontend mounts
# Should ONLY show: workspace, data, .backups, docker.sock, .cache
```

---

## Success Criteria

**All tests must pass for the fix to be considered successful:**

- ✅ Test 1: System access question answered correctly
- ✅ Test 2: Sandbox capability confirmed
- ✅ Test 3: Agent routing confirmed
- ✅ Test 4: General capabilities listed accurately
- ✅ Test 5: All variations answered consistently
- ✅ Test 6: Identity consistent across modes
- ✅ Test 7: Code generation routing works
- ✅ Test 8: Creative writing routing works
- ✅ Test 9: No prompt duplication
- ✅ Test 10: Cross-mode consistency

**If ANY test fails:**
1. Check Docker rebuild was done correctly
2. Verify latest code is in container
3. Check console logs for errors
4. Verify .env file is present and correct

---

## Rollback Plan

If tests fail and issues cannot be resolved:

```bash
cd ~/Grace-Terminal
git log --oneline -5
# Find commit before fix (cd100fd)
git checkout cd100fd
docker-compose down
docker-compose build
docker-compose up -d
```

Then investigate why the fix didn't work as expected.

---

## Notes

- All tests should be run in a clean browser session (clear cache/cookies)
- Test with the default model (GPT-4o) first
- If tests pass with GPT-4o, try other models to verify consistency
- Document any unexpected behavior even if tests pass
- Check console logs for any warnings or errors during testing

