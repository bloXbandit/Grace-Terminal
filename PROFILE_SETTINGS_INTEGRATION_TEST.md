# Profile & Settings Integration Test Plan

## ✅ What's Already Connected

### 1. Profile Context Flow
```
UI (profile.vue) 
  → POST /api/users/profile 
  → userProfile.js (upsertProfile)
  → Database (user_profile table)
  → getProfileContext() 
  → run.js (loads profile)
  → AgenticAgent (context.profileContext)
  → auto_reply (profileContext param)
  → MultiAgentCoordinator (options.profileContext)
  → Specialists (system prompt injection)
  → Chat/Thinking/Summary (all receive profile)
```

**Status:** ✅ FULLY CONNECTED

### 2. Routing Preferences Flow
```
UI (routing-preferences.vue)
  → POST /api/routing-preferences
  → RoutingPreference model
  → Database (routing_preferences table)
  → MultiAgentCoordinator.loadUserPreferences()
  → getRouting(taskType)
  → Uses custom routing or falls back to defaults
```

**Status:** ✅ FULLY CONNECTED

### 3. Default Model Settings
```
UI (default-model.vue / defaultModelSetting.vue)
  → POST /api/default-model
  → DefaultModelSetting model
  → Database (default_model_settings table)
  → getDefaultModel(conversation_id)
  → Used in all LLM calls
```

**Status:** ✅ FULLY CONNECTED

---

## 🔧 What Was Fixed

### Fix #2: UI Persistence (Just Implemented)
**Problem:** `saveField()` called `loadProfile()` after save, causing:
- Race conditions
- UI flickering
- Inefficient double-loading

**Solution:**
```javascript
// BEFORE (Bad):
if (response.data.success) {
  await loadProfile(); // ❌ Reloads entire form
}

// AFTER (Good):
if (response.data.success) {
  console.log(`[Profile] Saved ${key}`); // ✅ Trust v-model
  // Only refresh "What Grace Learned" section
}
```

**Files Modified:**
- `frontend/src/view/setting/profile.vue` (lines 192-209)

---

## 🧪 Testing Scenarios

### Test 1: Profile Personalization
**Steps:**
1. Go to Settings → Profile
2. Set:
   - Name: "Kenny Grey"
   - Profession: "Expert Rocket Scientist"
   - Expertise Level: "Expert"
3. Save fields (blur or click away)
4. Start new conversation
5. Ask: "Create a document about quantum physics"

**Expected:**
- ✅ No UI flickering when saving
- ✅ Fields persist after page refresh
- ✅ Grace addresses you as "Kenny Grey"
- ✅ Content is tailored to expert level
- ✅ Specialist uses profile context

**Verify in logs:**
```
[Profile] Saved name: Kenny Grey
[Specialist] Adding user profile context
```

---

### Test 2: Routing Preferences
**Steps:**
1. Go to Settings → Routing Preferences
2. Change "Data Generation" primary model to different model
3. Save preferences
4. Ask Grace to "create an excel file"

**Expected:**
- ✅ Uses your custom model (not default)
- ✅ Preferences persist after restart

**Verify in logs:**
```
[Coordinator] Using custom routing for data_generation
[Coordinator] Primary model: [your selected model]
```

---

### Test 3: Default Model
**Steps:**
1. Go to Settings → Default Model
2. Change default model
3. Start new conversation
4. Send any message

**Expected:**
- ✅ Uses your selected default model
- ✅ Persists across conversations

**Verify in logs:**
```
[getDefaultModel] Using model: [your selected model]
```

---

### Test 4: Long Conversation Memory
**Steps:**
1. Have a conversation with 30+ messages
2. Check database: `SELECT * FROM conversation_memories`
3. Continue conversation after 30 messages

**Expected:**
- ✅ Auto-summarization kicks in at 30 messages
- ✅ Summaries stored in database
- ✅ Context includes recent + summaries
- ✅ Grace remembers early conversation details

**Verify in logs:**
```
[Memory] Auto-summarized 50 old messages
[Memory] Created summary for 50 messages (importance: 0.7)
[ConversationContext] Built hierarchical context
```

---

## 📊 Settings Coverage Matrix

| Setting | UI Component | Backend API | Database | Used By | Status |
|---------|-------------|-------------|----------|---------|--------|
| **Profile (name, profession, etc.)** | profile.vue | /api/users/profile | user_profile | All agents | ✅ Connected |
| **Routing Preferences** | routing-preferences.vue | /api/routing-preferences | routing_preferences | MultiAgentCoordinator | ✅ Connected |
| **Default Model** | defaultModelSetting.vue | /api/default-model | default_model_settings | All LLM calls | ✅ Connected |
| **MCP Servers** | mcp.vue | /api/mcp | mcp_servers | Tool execution | ✅ Connected |
| **Experience/Knowledge** | experience.vue | /api/experience | experience | Planning phase | ✅ Connected |

---

## 🎯 Summary

### ✅ Fully Integrated Settings:
1. **Profile Context** - Flows to all agents (chat, auto-reply, specialists, thinking, summary)
2. **Routing Preferences** - Custom model selection per task type
3. **Default Model** - System-wide model selection
4. **Long-Context Memory** - Auto-summarization for 1000+ message conversations

### 🔧 Recent Fixes:
1. **UI Persistence** - No more flickering or race conditions
2. **Profile → Specialists** - Profile context now injected into specialist prompts
3. **Hierarchical Memory** - Support for long conversations

### 🚀 Ready to Test:
All settings are end-to-end connected. Test the scenarios above to verify!
