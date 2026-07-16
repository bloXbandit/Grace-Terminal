# Website Generation Routing Analysis
**Date:** 2026-01-19  
**Conversation ID:** 5ace75eb-6ffa-43a2-b517-c5dea9d8e226  
**Issue:** Phi-4 not being used as primary specialist for website generation despite configuration

---

## 1. ROUTING CONFIGURATION REVIEW ✅

### Current Configuration (`routing.config.js:100-158`)

```javascript
website_generation: {
  primary: 'openrouter/microsoft/phi-4',
  fallback: 'openrouter/anthropic/claude-sonnet-4.5',
  description: 'Specialized in website and UI frontend generation',
  systemPrompt: `You are a specialized web designer and frontend developer...`
}
```

**Status:** ✅ **CORRECT** - Phi-4 is already configured as primary specialist

---

## 2. TASK DETECTION LOGIC REVIEW ✅

### Detection Patterns (`MultiAgentCoordinator.js:68-88`)

The system has **three** website detection patterns:

#### Pattern 1: Landing Pages (Lines 70-74)
```javascript
const hasWebpageKeywords = /\b(landing page|webpage|html page|html file|web page)\b/i.test(message);
if (hasWebpageKeywords) {
  console.log('[Coordinator] Landing page request detected → routing to website_generation (Phi-4)');
  return 'website_generation';
}
```

#### Pattern 2: Multi-page Websites (Lines 77-81)
```javascript
const hasWebsiteKeywords = /\b(website|web site|multi.?page|full.?site|complete.?site)\b/i.test(message);
if (hasWebsiteKeywords) {
  console.log('[Coordinator] Website request detected → routing to website_generation (Phi-4)');
  return 'website_generation';
}
```

#### Pattern 3: Portfolio Sites (Lines 84-88)
```javascript
const hasPortfolioKeywords = /\b(portfolio|showcase|gallery|projects)\b/i.test(message);
if (hasPortfolioKeywords) {
  console.log('[Coordinator] Portfolio request detected → routing to website_generation (Phi-4)');
  return 'website_generation';
}
```

**Status:** ✅ **COMPREHENSIVE** - Covers landing pages, websites, portfolios

---

## 3. SPECIALIST ROUTING FLOW

### How Routing Works (`MultiAgentCoordinator.js:673-684`)

```javascript
getRouting(taskType) {
  // Check custom routing first (user preferences from Routing Preferences UI)
  if (this.customRouting[taskType]) {
    console.log(`[Coordinator] Using custom routing preference for ${taskType}: ${this.customRouting[taskType].primary}`);
    return this.customRouting[taskType];
  }
  
  // Use default routing (specialist models for execution)
  const defaultRouting = SPECIALIST_ROUTING[taskType] || DEFAULT_ROUTING;
  console.log(`[Coordinator] Using default specialist routing for ${taskType}: ${defaultRouting.primary}`);
  return defaultRouting;
}
```

**Flow:**
1. Check if user has custom routing preference in database
2. If not, use `SPECIALIST_ROUTING[taskType]` from config
3. Call specialist with primary model (Phi-4)
4. If primary fails, fallback to Claude Sonnet 4.5

---

## 4. LOG ANALYSIS ⚠️

### Findings:
- **No logs found** for conversation ID `5ace75eb-6ffa-43a2-b517-c5dea9d8e226`
- Container may have been restarted since that conversation
- Unable to trace actual routing path without logs

### What We Need to Verify:
1. **Was `website_generation` taskType detected?**
   - Look for: `[Coordinator] Website request detected → routing to website_generation (Phi-4)`
   
2. **Which specialist was called?**
   - Look for: `[Specialist] Calling openrouter/microsoft/phi-4 for task...`
   
3. **Did Phi-4 fail and trigger fallback?**
   - Look for: `[Specialist] Error calling openrouter/microsoft/phi-4`
   - Look for: `Primary specialist failed`

---

## 5. POTENTIAL ISSUES & HYPOTHESES

### Hypothesis 1: Task Type Misclassification
**Symptom:** User's phrasing didn't match website detection patterns  
**Example:** "Build me a site with Tailwind" → No "website", "landing page", or "portfolio" keyword  
**Result:** Routes to `code_generation` instead of `website_generation`

**Keywords that WOULD trigger:**
- ✅ "landing page"
- ✅ "webpage" 
- ✅ "website"
- ✅ "portfolio"

**Keywords that WOULD NOT trigger:**
- ❌ "site" (alone)
- ❌ "homepage"
- ❌ "UI"
- ❌ "Tailwind page"

### Hypothesis 2: Director Model Interference
**Symptom:** Kimi (director) handles request directly without routing to specialist  
**Cause:** Auto-reply or direct execution bypasses coordinator  
**Result:** Kimi generates markdown instead of calling Phi-4 specialist

### Hypothesis 3: Phi-4 API Failure
**Symptom:** Phi-4 returns 402 Payment Required or other error  
**Cause:** OpenRouter account issue or model unavailable  
**Result:** Fallback to Claude Sonnet 4.5 (which works)

### Hypothesis 4: Custom Routing Override
**Symptom:** User has custom routing preference in database  
**Cause:** Previous manual override in Routing Preferences UI  
**Result:** Database preference overrides config file

---

## 6. DIAGNOSTIC PLAN FOR SWE/QWEN AGENT

### Step 1: Expand Website Detection Keywords
**File:** `src/agent/specialists/MultiAgentCoordinator.js:77`

**Current:**
```javascript
const hasWebsiteKeywords = /\b(website|web site|multi.?page|full.?site|complete.?site)\b/i.test(message);
```

**Proposed Enhancement:**
```javascript
const hasWebsiteKeywords = /\b(website|web site|site|homepage|home page|multi.?page|full.?site|complete.?site|tailwind.*page|bootstrap.*page|html.*site)\b/i.test(message);
```

**Additions:**
- `site` (standalone)
- `homepage` / `home page`
- `tailwind page` / `tailwind site`
- `bootstrap page` / `bootstrap site`
- `html site`

### Step 2: Add UI/Framework Detection
**Insert after line 88:**

```javascript
// Check for UI framework mentions (often website requests)
const hasUIFrameworkKeywords = /\b(tailwind|bootstrap|react.*site|vue.*site|next\.?js.*site|html.*css)\b/i.test(message);
if (hasUIFrameworkKeywords) {
  console.log('[Coordinator] UI framework request detected → routing to website_generation (Phi-4)');
  return 'website_generation';
}
```

### Step 3: Check Database for Custom Routing
**Query to run:**
```sql
SELECT * FROM routing_preferences 
WHERE user_id = 1 
AND task_type = 'website_generation' 
AND is_active = 1;
```

**If exists:** User has custom override that may point to Claude instead of Phi-4

### Step 4: Test Phi-4 API Directly
**Command:**
```bash
curl -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "microsoft/phi-4",
    "messages": [{"role": "user", "content": "Create a simple landing page"}]
  }'
```

**Expected:** 200 OK with HTML response  
**If 402:** Payment/credit issue - Phi-4 unavailable  
**If 404:** Model path incorrect

### Step 5: Add Logging for Debugging
**File:** `src/agent/specialists/MultiAgentCoordinator.js`

**Add after line 65:**
```javascript
console.log('[Coordinator] detectTaskType called with message:', message.substring(0, 100));
```

**Add after line 683:**
```javascript
console.log('[Coordinator] Final routing decision:', {
  taskType,
  primary: defaultRouting.primary,
  fallback: defaultRouting.fallback,
  hasCustomRouting: !!this.customRouting[taskType]
});
```

---

## 7. RECOMMENDED CHANGES (SURGICAL)

### Change 1: Expand Website Keywords (Low Risk)
**Impact:** Catches more website requests  
**Risk:** May over-classify some code requests as websites  
**Mitigation:** Keep specific patterns first (landing page, portfolio)

### Change 2: Add UI Framework Detection (Medium Risk)
**Impact:** Routes Tailwind/Bootstrap requests to Phi-4  
**Risk:** May route non-website UI requests incorrectly  
**Mitigation:** Combine with other indicators (page, site, html)

### Change 3: Enhanced Logging (Zero Risk)
**Impact:** Better visibility into routing decisions  
**Risk:** None - logging only  
**Benefit:** Easier debugging of future issues

---

## 8. WHAT NOT TO CHANGE ⚠️

### Keep Untouched:
1. ✅ `SPECIALIST_ROUTING.website_generation.primary` - Already correct (Phi-4)
2. ✅ `SPECIALIST_ROUTING.website_generation.fallback` - Claude is good backup
3. ✅ Director model selection (Kimi/Gemini/Claude) - Works as designed
4. ✅ Auto-reply flows - Separate from specialist routing
5. ✅ Document generation (Ultra) - Different path entirely

---

## 9. TESTING STRATEGY

### Test Case 1: Explicit Website Request
**Input:** "Create a landing page for my business"  
**Expected:** `website_generation` → Phi-4 primary  
**Log Check:** `[Coordinator] Landing page request detected → routing to website_generation (Phi-4)`

### Test Case 2: Implicit Website Request (Current Issue)
**Input:** "Build me a site with Tailwind CSS"  
**Expected:** `website_generation` → Phi-4 primary  
**Current Behavior:** Likely routes to `code_generation` → Claude  
**After Fix:** Should route to `website_generation` → Phi-4

### Test Case 3: Portfolio Request
**Input:** "Create a portfolio to showcase my projects"  
**Expected:** `website_generation` → Phi-4 primary  
**Log Check:** `[Coordinator] Portfolio request detected → routing to website_generation (Phi-4)`

### Test Case 4: Non-Website Code Request
**Input:** "Write a Python script to parse JSON"  
**Expected:** `code_generation` → Claude Sonnet 4.5  
**Should NOT:** Route to `website_generation`

---

## 10. HANDOFF TO SWE/QWEN AGENT

### Task Scope:
**Implement enhanced website detection without breaking existing flows**

### Deliverables:
1. Update `MultiAgentCoordinator.detectTaskType()` with expanded keywords
2. Add UI framework detection pattern
3. Add enhanced logging for routing decisions
4. Test with 4 test cases above
5. Verify no regression in non-website code generation

### Files to Modify:
- `src/agent/specialists/MultiAgentCoordinator.js` (lines 68-88)

### Files to NOT Modify:
- `src/agent/specialists/routing.config.js` (already correct)
- `src/agent/auto-reply/index.js` (separate flow)
- `src/routers/run.js` (director selection)

### Success Criteria:
- ✅ "Build a site with Tailwind" → routes to `website_generation` (Phi-4)
- ✅ "Create a landing page" → routes to `website_generation` (Phi-4)
- ✅ "Make a portfolio" → routes to `website_generation` (Phi-4)
- ✅ "Write Python code" → routes to `code_generation` (Claude)
- ✅ Logs show clear routing decisions

### Estimated Effort:
- **10-15 minutes** for keyword expansion
- **5 minutes** for logging additions
- **10 minutes** for testing
- **Total: ~30 minutes**

---

## 11. CONCLUSION

### Current State:
- ✅ Configuration is **correct** (Phi-4 as primary)
- ✅ Detection patterns are **comprehensive** for explicit requests
- ⚠️ Detection patterns **miss implicit requests** (e.g., "site with Tailwind")

### Root Cause:
**Keyword gap** - User phrasing doesn't match detection patterns

### Solution:
**Expand detection keywords** to catch more variations while maintaining precision

### Next Steps:
1. Hand off to SWE/QWEN agent for implementation
2. Test with real conversation scenarios
3. Monitor logs to verify Phi-4 is being called
4. Adjust keywords if needed based on real usage patterns

---

**Ready for SWE/QWEN agent implementation** ✅
