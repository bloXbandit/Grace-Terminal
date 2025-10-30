# Revision Context Logic - Documentation

## Overview

Grace maintains consistency across document/file revisions by detecting which libraries were used in previous implementations and instructing specialists to continue using the same approach.

---

## Primary Files

### 1. `src/context/ConversationContext.js`
**Main logic for detecting previous implementation**

**Key Methods:**
- `_detectPreviousImplementation()` - Async version (lines 214-277)
- `_detectPreviousImplementationSync()` - Sync version (lines 372-405)
- `getRoutingContext()` - Includes previousImplementation for routing (line 287)
- `getSpecialistContext()` - Includes previousImplementation for specialists (line 315)

**Detection Logic:**
- Scans last 10 messages for code patterns
- Looks in `message.memorized` and `message.content`
- Returns: `{ method, confidence, library }`

**Example Return:**
```javascript
{
  method: "Used Pillow/PIL to create image files",
  confidence: "high",
  library: "Pillow"
}
```

### 2. `src/agent/specialists/MultiAgentCoordinator.js`
**Uses revision context to maintain consistency**

**Key Sections:**
- **Lines 701-722**: Adds "PREVIOUS IMPLEMENTATION METHOD" to specialist system prompt
- **Lines 862-962**: Legacy detection logic (backward compatibility)
- **Lines 982-1005**: Passes routingContext to specialists

**Prompt Injection:**
```
**PREVIOUS IMPLEMENTATION METHOD:**
Used Pillow/PIL to create image files (Confidence: high)

**IMPORTANT:** When making revisions, you SHOULD use the SAME implementation approach as before for consistency.
- If previous revision used Pillow/PIL for images → Continue using Pillow/PIL (unless user explicitly requests otherwise)
- If previous revision used matplotlib → Continue using matplotlib
- If previous revision used pandas → Continue using pandas
- If previous revision used reportlab/fpdf → Continue using the same PDF library
- If previous revision used openpyxl → Continue using openpyxl
- Maintain consistency across revisions UNLESS user explicitly asks for a different approach
- If user says "instead", "rather", "switch to", or "use X instead" → Honor their request and change approach
```

### 3. `src/agent/AgenticAgent.js`
**Builds unified context once per request**

**Key Logic:**
- **Lines 217-228**: Builds ConversationContext
- **Line 225**: Gets routingContext from ConversationContext
- Passes to MultiAgentCoordinator for specialist routing

---

## How It Works

### Flow Diagram

```
1. User Request: "Add a blue square"
   ↓
2. AgenticAgent builds ConversationContext
   ↓
3. ConversationContext scans last 10 messages
   ↓
4. Detects: "Used Pillow/PIL to create image files"
   ↓
5. Returns: { method: "...", confidence: "high", library: "Pillow" }
   ↓
6. MultiAgentCoordinator receives via routingContext.previousImplementation
   ↓
7. Injects into specialist prompt: "You SHOULD use Pillow/PIL"
   ↓
8. Specialist maintains consistency → Uses Pillow/PIL again
```

### Example Scenario

**Initial Request:**
```
User: "Create an image with a red circle"
Grace: Uses Pillow/PIL
       Code: from PIL import Image, ImageDraw
       → Detected and cached
```

**Follow-up Request:**
```
User: "Add a blue square"
Grace: Sees previousImplementation = { library: "Pillow" }
       → Uses Pillow/PIL again (consistency)
       Code: from PIL import Image, ImageDraw  # Same library
```

**Explicit Override:**
```
User: "Use matplotlib instead"
Grace: Detects explicit override keyword
       → Switches to matplotlib
       Code: import matplotlib.pyplot as plt
```

---

## Detected Libraries

| Library | Detection Pattern | Confidence | Use Case |
|---------|------------------|------------|----------|
| **Pillow/PIL** | `PIL` + `Image.new`/`ImageDraw` | High | Image creation/manipulation |
| **matplotlib** | `matplotlib` + `plt.`/`pyplot` | High | Data visualization, charts |
| **pandas** | `pandas` + `DataFrame`/`pd.` | High | Data processing, CSV/Excel |
| **python-docx** | `python-docx` + `Document(` | High | Word document creation |
| **openpyxl** | `openpyxl`/`xlsxwriter` + `Workbook` | High | Excel file creation |

### Detection Code (ConversationContext.js)

```javascript
// Pillow/PIL Detection
if ((code.includes('PIL') || code.includes('from PIL')) && 
    (code.includes('Image.new') || code.includes('ImageDraw'))) {
  return { 
    method: 'Used Pillow/PIL to create image files', 
    confidence: 'high', 
    library: 'Pillow' 
  };
}

// matplotlib Detection
if ((code.includes('matplotlib') || code.includes('import matplotlib')) && 
    (code.includes('plt.') || code.includes('pyplot'))) {
  return { 
    method: 'Used matplotlib for data visualization', 
    confidence: 'high', 
    library: 'matplotlib' 
  };
}

// pandas Detection
if ((code.includes('pandas') || code.includes('import pandas')) && 
    (code.includes('DataFrame') || code.includes('pd.'))) {
  return { 
    method: 'Used pandas for data processing', 
    confidence: 'high', 
    library: 'pandas' 
  };
}

// python-docx Detection
if ((code.includes('python-docx') || code.includes('from docx')) && 
    code.includes('Document(')) {
  return { 
    method: 'Used python-docx for Word document creation', 
    confidence: 'high', 
    library: 'python-docx' 
  };
}

// openpyxl Detection
if ((code.includes('openpyxl') || code.includes('xlsxwriter')) && 
    (code.includes('Workbook') || code.includes('load_workbook'))) {
  return { 
    method: 'Used openpyxl/xlsxwriter for Excel file creation', 
    confidence: 'high', 
    library: 'openpyxl' 
  };
}
```

---

## Override Detection

### Explicit Override Keywords

When Grace detects these keywords, she honors the user's request to change libraries:

```javascript
const explicitOverride = /\b(instead|rather|switch to|change to|use.*instead|forget.*use|different approach|new approach|try.*different)\b/i;
```

**Examples:**
- "Use matplotlib **instead**"
- "**Switch to** pandas"
- "**Rather** use openpyxl"
- "Try a **different approach**"
- "**Forget** Pillow, use matplotlib"

**Location:** `MultiAgentCoordinator.js` line 867

---

## Confidence Levels

### High Confidence
- **Instruction:** "You **SHOULD** use the SAME implementation approach"
- **When:** Both library import AND usage detected
- **Example:** `from PIL import Image` + `Image.new()`

### Medium Confidence (Not Currently Used)
- **Instruction:** "You **CONSIDER** using the same approach"
- **When:** Only library import detected, no usage
- **Example:** `import matplotlib` but no `plt.` calls

### No Detection
- **Instruction:** No previous implementation guidance
- **When:** No matching patterns found in last 10 messages
- **Behavior:** Specialist chooses best approach

---

## Context Objects

### Routing Context (for MultiAgentCoordinator)
```javascript
{
  hasFiles: true,
  files: [...],
  recentMessages: [...],  // Last 10 messages
  previousImplementation: {
    method: "Used Pillow/PIL to create image files",
    confidence: "high",
    library: "Pillow"
  },
  profile: {...},
  isFollowUp: true
}
```

### Specialist Context
```javascript
{
  files: [...],
  profile: {...},
  profileContext: "User: Kenny Grey\nProfession: ...",
  taskHistory: [...],
  previousImplementation: {
    method: "Used Pillow/PIL to create image files",
    confidence: "high",
    library: "Pillow"
  }
}
```

---

## Benefits

### 1. Consistency
- Same library across revisions
- Predictable behavior
- Easier debugging

### 2. Efficiency
- No library switching overhead
- Reuses existing code patterns
- Faster execution

### 3. User Control
- Explicit override support
- Flexible when needed
- Honors user preferences

---

## Edge Cases

### Multiple Libraries in Same Message
**Behavior:** Returns first detected library (most recent in reverse scan)

**Example:**
```python
# Message contains both Pillow and matplotlib
from PIL import Image
import matplotlib.pyplot as plt
```
**Result:** Returns Pillow (detected first in reverse scan)

### No Previous Implementation
**Behavior:** Specialist chooses best approach based on task

**Example:**
```
User: "Create a chart"  # First request in conversation
Grace: Chooses matplotlib (common for charts)
```

### Conflicting User Instructions
**Behavior:** Explicit override takes precedence

**Example:**
```
Previous: Used Pillow
User: "Use matplotlib instead"
Grace: Switches to matplotlib (honors explicit override)
```

---

## Testing

### Test Consistency
```bash
# 1. Create initial file
User: "Create an image with a red circle"

# 2. Verify library used
Check logs: Should use Pillow/PIL

# 3. Make revision
User: "Add a blue square"

# 4. Verify same library
Check logs: Should still use Pillow/PIL
```

### Test Override
```bash
# 1. Create with Pillow
User: "Create an image with a red circle"

# 2. Override
User: "Use matplotlib instead to add a chart"

# 3. Verify switch
Check logs: Should use matplotlib
```

---

## Troubleshooting

### Issue: Grace not maintaining consistency
**Check:**
1. Are messages being saved with `memorized` field?
2. Is ConversationContext being built?
3. Is routingContext being passed to specialist?

**Debug:**
```javascript
console.log('[ConversationContext] Previous implementation:', 
  this._detectPreviousImplementationSync());
```

### Issue: Grace not honoring override
**Check:**
1. Is override keyword in the regex pattern?
2. Is explicitOverride check happening before prompt injection?

**Debug:**
```javascript
console.log('[Coordinator] Explicit override detected:', 
  explicitOverride.test(userMessage));
```

---

## Future Enhancements

### Potential Improvements
1. **Multi-library tracking**: Track multiple libraries per conversation
2. **Confidence decay**: Lower confidence over time if not used
3. **User preference learning**: Remember user's preferred libraries
4. **Library compatibility checks**: Warn if switching causes issues

---

## Related Documentation

- `GRACE_ARCHITECTURE_KNOWLEDGE.md` - Overall system architecture
- `src/context/README.md` - ConversationContext details
- `src/agent/specialists/README.md` - Specialist routing system

---

**Last Updated:** October 30, 2025  
**Commit:** ee28f17
