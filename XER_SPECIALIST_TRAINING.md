# XER Specialist Training & Implementation Plan

## Overview
Train Grace AI to become an expert in Primavera P6 XER file analysis, manipulation, and project scheduling using the PyP6Xer library.

---

## Specialist Configuration

### Model Selection
**Primary:** `openrouter/qwen/qwen3-coder-30b-a3b-instruct`
- Fast code generation
- Good at structured data parsing
- Already handles data_generation tasks

**Fallback:** `openrouter/anthropic/claude-sonnet-4.5`
- Strong analytical capabilities
- Excellent at complex scheduling logic

### Task Type
`xer_analysis` - New task type for P6/XER operations

---

## Training Approach

### 1. System Prompt Enhancement
Add XER-specific knowledge to specialist system prompt:

```
You are an expert Primavera P6 scheduler and PyP6Xer programmer.

CORE CAPABILITIES:
- Parse and analyze XER files using xerparser.reader.Reader
- Perform critical path analysis and float calculations
- Calculate Earned Value Management (EVM) metrics
- Assess schedule quality (DCMA 14-point)
- Analyze resource utilization and over-allocation
- Export data to Excel, JSON, and reports

KEY LIBRARY PATTERNS:
1. Load: xer = Reader("file.xer")
2. Access: xer.projects, xer.activities, xer.resources, xer.relations
3. Convert hours to days: hours / 8.0
4. Critical path: activity.total_float_hr_cnt <= 0
5. EVM: PV, EV, AC, CPI = EV/AC, SPI = EV/PV

ALWAYS:
- Import: from xerparser.reader import Reader
- Handle None values in float calculations
- Convert hours to days for user-friendly output
- Use list comprehensions for filtering
- Return JSON for structured data
- Include error handling for missing XER files

REFERENCE: /XER_PROGRAMMING_GUIDE.md
```

### 2. Intent Detection Keywords
Add to MultiAgentCoordinator task detection:

```javascript
xer_keywords: [
  'xer', 'primavera', 'p6', 'schedule',
  'critical path', 'float', 'earned value',
  'dcma', 'resource leveling', 'project schedule',
  'wbs', 'activity', 'predecessor', 'successor'
]
```

### 3. Example Prompts for Training

**Critical Path:**
```
"Analyze the critical path in project.xer and show activities with zero or negative float"
```

**Earned Value:**
```
"Calculate EVM metrics (CPI, SPI, CV, SV) for project.xer"
```

**Schedule Quality:**
```
"Perform a DCMA 14-point schedule quality check on project.xer"
```

**Resource Analysis:**
```
"Show resource utilization and identify over-allocated resources in project.xer"
```

**Export:**
```
"Export project.xer activities to Excel with duration, float, and status"
```

---

## Implementation Steps

### Phase 1: Routing Setup
1. Add `xer_analysis` task type to routing.config.js
2. Update intent detection in MultiAgentCoordinator
3. Add XER keywords to task classification

### Phase 2: Specialist Configuration
1. Create XER-specific system prompt
2. Configure primary/fallback models
3. Add XER_PROGRAMMING_GUIDE.md to context

### Phase 3: Tool Integration
1. Verify P6XerTool.js is registered
2. Test xerparser library in Docker
3. Ensure Python dependencies are installed

### Phase 4: Testing
1. Test critical path analysis
2. Test EVM calculations
3. Test schedule quality checks
4. Test resource analysis
5. Test data export (Excel, JSON)

---

## Code Generation Patterns

### Pattern 1: Basic Analysis
```python
from xerparser.reader import Reader
import json

xer = Reader("{{xer_file}}")

# Analysis logic here

result = {
    'project': project.proj_short_name,
    'metrics': {...}
}

print(json.dumps(result))
```

### Pattern 2: Critical Path
```python
from xerparser.reader import Reader

xer = Reader("{{xer_file}}")
critical = []

for activity in xer.activities:
    if activity.total_float_hr_cnt is not None:
        float_days = activity.total_float_hr_cnt / 8.0
        if float_days <= 0:
            critical.append({
                'code': activity.task_code,
                'name': activity.task_name,
                'float': float_days
            })

print(f"Critical activities: {len(critical)}")
for act in critical:
    print(f"  {act['code']}: {act['name']} (Float: {act['float']:.1f} days)")
```

### Pattern 3: EVM
```python
from xerparser.reader import Reader

xer = Reader("{{xer_file}}")
pv = ev = ac = 0

for activity in xer.activities:
    assignments = [a for a in xer.activityresources if a.task_id == activity.task_id]
    
    planned = sum(a.target_cost or 0 for a in assignments)
    actual = sum((a.act_reg_cost or 0) + (a.act_ot_cost or 0) for a in assignments)
    
    if activity.phys_complete_pct:
        earned = planned * (activity.phys_complete_pct / 100)
    else:
        earned = 0
    
    pv += planned
    ev += earned
    ac += actual

cpi = ev / ac if ac > 0 else 0
spi = ev / pv if pv > 0 else 0

print(f"CPI: {cpi:.3f} | SPI: {spi:.3f}")
print(f"Cost Variance: ${ev - ac:,.2f}")
print(f"Schedule Variance: ${ev - pv:,.2f}")
```

---

## Brainstorming Ideas

### 🎯 Idea 1: XER Chat Interface
**Concept:** Natural language interface for P6 schedules
```
User: "Show me critical activities in my schedule"
Grace: *Analyzes XER* "Found 23 critical activities. Top 5 by duration..."

User: "What's my CPI?"
Grace: *Calculates EVM* "Your CPI is 0.92, indicating 8% over budget"
```

### 🎯 Idea 2: Schedule Health Dashboard
**Concept:** Auto-generate visual dashboard from XER
- Critical path percentage
- EVM metrics (CPI, SPI)
- Resource utilization heatmap
- Schedule quality score
- Top risks (negative float, long activities)

### 🎯 Idea 3: Intelligent Schedule Optimization
**Concept:** AI-powered schedule recommendations
```
Grace analyzes XER and suggests:
- "Activity X123 has 45-day duration. Consider breaking into smaller tasks"
- "Resource 'John Smith' is over-allocated by 320 hours"
- "5 activities have no successors - verify logic"
```

### 🎯 Idea 4: XER Comparison Tool
**Concept:** Compare two XER files (baseline vs current)
```
User: "Compare baseline.xer with current.xer"
Grace: 
- "Schedule slipped 12 days"
- "15 new activities added"
- "Critical path changed: 8 activities now critical"
- "Budget increased by $45,000"
```

### 🎯 Idea 5: Automated DCMA Compliance
**Concept:** Full DCMA 14-point assessment with remediation
```
Grace runs all 14 checks:
✅ Single start milestone
❌ Multiple finish activities (3 found)
✅ All activities have logic
❌ 12 activities exceed 20-day duration
...
Score: 78/100

Recommendations:
1. Consolidate finish milestones
2. Break down long-duration activities
```

### 🎯 Idea 6: Resource Leveling Assistant
**Concept:** Identify and resolve resource conflicts
```
Grace: "Detected 3 over-allocated resources:
- John Smith: 2,400 hours (120% utilization)
  Suggested: Delay Activity X456 by 5 days
- Equipment A: 1,800 hours (90% utilization)
  Suggested: Extend duration of Activity Y789"
```

### 🎯 Idea 7: Predictive Schedule Analytics
**Concept:** ML-based completion forecasting
```
Based on current progress trends:
- Project completion: 15% likely to finish on time
- Estimated delay: 23 days
- Budget overrun: $67,000 (12%)
- Highest risk activities: [list]
```

### 🎯 Idea 8: XER to Gantt Visualization
**Concept:** Auto-generate Gantt charts from XER
- HTML/Canvas-based interactive Gantt
- Color-coded by float (red=critical, yellow=near-critical)
- Hover for activity details
- Export as PNG/PDF

### 🎯 Idea 9: Schedule Narrative Generator
**Concept:** Auto-write executive summary
```
Grace generates:
"Project ABC is currently 45% complete, 12 days behind schedule.
The critical path consists of 23 activities totaling 67 days.
Cost performance is favorable with CPI of 1.08.
Primary risks include Resource X over-allocation and 
Activity Y123 with negative 5-day float..."
```

### 🎯 Idea 10: Multi-Project Portfolio Analysis
**Concept:** Analyze multiple XER files simultaneously
```
User: "Analyze all projects in /schedules folder"
Grace:
- Total projects: 5
- Combined budget: $2.4M
- Overall CPI: 0.94
- Projects at risk: 2 (Project B, Project D)
- Shared resource conflicts: 3
```

---

## Next Steps

1. **Implement routing** for xer_analysis task type
2. **Add system prompt** with XER expertise
3. **Test with sample XER** files
4. **Iterate on code patterns** based on results
5. **Build example library** of common XER tasks
6. **Create test suite** for XER operations

---

## Success Metrics

✅ Grace can parse any valid XER file
✅ Grace calculates critical path accurately
✅ Grace computes EVM metrics correctly
✅ Grace performs DCMA quality checks
✅ Grace exports data to Excel/JSON
✅ Grace provides actionable insights
✅ Response time < 10 seconds for typical XER
✅ Code executes without errors 95%+ of the time
