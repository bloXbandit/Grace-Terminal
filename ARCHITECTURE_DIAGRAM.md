# Grace AI Architecture - Before and After Fix

## Before Fix ❌

### Specialist Routing Path (BROKEN)
```
┌─────────────────┐
│  User Question  │
│ "can you access │
│  my system?"    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ MultiAgentCoordinator   │
│ detectTaskType()        │
│ → "general_chat"        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ callSpecialist()        │
│                         │
│ messages: [             │
│   {                     │
│     role: "system",     │
│     content: "You are   │  ❌ ONLY specialist prompt
│     Grace, a helpful    │  ❌ NO MASTER_SYSTEM_PROMPT
│     AI assistant..."    │  ❌ NO capability info
│   }                     │
│ ]                       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ llm.base.js             │
│                         │
│ if (messages[0].role    │
│    === 'system')        │
│   → SKIP injection ❌   │  ❌ Skips MASTER_SYSTEM_PROMPT
│                         │     because system msg exists
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ LLM (GPT-4o)            │
│                         │
│ Receives:               │
│ - Generic prompt only   │  ❌ No capability info
│ - No MASTER_SYSTEM_PROMPT│
│                         │
│ Response:               │
│ "I can't access your    │  ❌ WRONG RESPONSE
│  local system..."       │
└─────────────────────────┘
```

---

## After Fix ✅

### Specialist Routing Path (FIXED)
```
┌─────────────────┐
│  User Question  │
│ "can you access │
│  my system?"    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ MultiAgentCoordinator   │
│ detectTaskType()        │
│ → "general_chat"        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ callSpecialist()                        │
│                                         │
│ const fullSystemPrompt =                │
│   MASTER_SYSTEM_PROMPT +                │  ✅ PREPENDS MASTER_SYSTEM_PROMPT
│   "\n\n---\n\n" +                       │
│   specialistPrompt                      │
│                                         │
│ messages: [                             │
│   {                                     │
│     role: "system",                     │
│     content: fullSystemPrompt           │  ✅ Full prompt with capabilities
│   }                                     │
│ ]                                       │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ llm.base.js             │
│                         │
│ if (messages[0].role    │
│    === 'system')        │
│   → SKIP injection ✅   │  ✅ Correctly skips because
│                         │     MASTER_SYSTEM_PROMPT already there
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ LLM (GPT-4o)                            │
│                                         │
│ Receives:                               │
│ - MASTER_SYSTEM_PROMPT (identity +      │  ✅ Full capability info
│   capabilities)                         │
│ - Specialist prompt (task-specific)     │
│                                         │
│ Response:                               │
│ "Yes, I can access your local system    │  ✅ CORRECT RESPONSE
│  when you need me to. I have both       │
│  sandbox capabilities..."               │
└─────────────────────────────────────────┘
```

---

## Non-Specialist Path (Already Working, Now Cleaner)

### Before Fix (Had Duplication)
```
┌─────────────────┐
│  User Question  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ resolveAutoReplyPrompt()│
│                         │
│ Returns:                │
│ "${MASTER_SYSTEM_PROMPT}│  ⚠️  Duplication
│  ...task instructions..." │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ llm.base.js             │
│                         │
│ Injects:                │
│ MASTER_SYSTEM_PROMPT    │  ⚠️  Duplication
│ (as system message)     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ LLM receives:           │
│ - MASTER_SYSTEM_PROMPT  │  ⚠️  Appears twice
│   (system message)      │
│ - MASTER_SYSTEM_PROMPT  │
│   (in user message)     │
└─────────────────────────┘
```

### After Fix (Clean)
```
┌─────────────────┐
│  User Question  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ resolveAutoReplyPrompt()│
│                         │
│ Returns:                │
│ "...task instructions..." │  ✅ No MASTER_SYSTEM_PROMPT
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ llm.base.js             │
│                         │
│ Injects:                │
│ MASTER_SYSTEM_PROMPT    │  ✅ Single injection
│ (as system message)     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ LLM receives:           │
│ - MASTER_SYSTEM_PROMPT  │  ✅ Appears once (clean)
│   (system message)      │
│ - Task instructions     │
│   (user message)        │
└─────────────────────────┘
```

---

## Key Changes Summary

| Component | Before | After | Impact |
|-----------|--------|-------|--------|
| **MultiAgentCoordinator.callSpecialist()** | Only specialist prompt | MASTER_SYSTEM_PROMPT + specialist prompt | ✅ Capabilities info reaches LLM |
| **utils/llm.js** | Response rewriter band-aid | Removed | ✅ Cleaner code, fix at source |
| **Prompt files** | Included MASTER_SYSTEM_PROMPT | Removed duplication | ✅ Single source of truth |
| **llm.base.js** | Injection logic | Unchanged | ✅ Still works correctly |

---

## Result

**Before:** Grace denied system access capabilities ❌
**After:** Grace correctly confirms all capabilities ✅

All routing paths now deliver MASTER_SYSTEM_PROMPT to the LLM, ensuring consistent and accurate responses about Grace's capabilities.
