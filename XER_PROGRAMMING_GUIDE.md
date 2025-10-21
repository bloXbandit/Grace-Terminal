# PyP6Xer Programming Guide for Grace AI

**Complete Reference for Primavera P6 XER File Analysis**

*Based on PyP6Xer Library - https://github.com/HassanEmam/PyP6Xer*

## Quick Start

```python
from xerparser.reader import Reader

# Load XER file
xer = Reader("project.xer")

# Access projects
for project in xer.projects:
    print(f"Project: {project.proj_short_name}")
    for activity in project.activities:
        print(f"  Activity: {activity.task_name}")
```

## Core API Reference

### Reader Class
```python
xer = Reader("file.xer")
xer.projects         # List of Project objects
xer.activities       # List of all Task objects
xer.resources        # List of Resource objects
xer.relations        # List of TaskPred (relationship) objects
xer.activityresources # List of TaskResource (assignment) objects
xer.calendars        # List of Calendar objects
```

### Activity (Task) Properties
```python
activity.task_id              # Unique ID
activity.task_code            # Activity code
activity.task_name            # Activity name
activity.target_drtn_hr_cnt   # Duration in hours (divide by 8 for days)
activity.status_code          # TK_NotStart, TK_Active, TK_Complete
activity.target_start_date    # Planned start
activity.target_end_date      # Planned finish
activity.act_start_date       # Actual start
activity.act_end_date         # Actual finish
activity.phys_complete_pct    # % complete
activity.total_float_hr_cnt   # Total float in hours
activity.free_float_hr_cnt    # Free float in hours
activity.predecessors         # List of predecessor relationships
activity.successors           # List of successor relationships
```

### Critical Path Analysis
```python
def find_critical_path(xer_file):
    xer = Reader(xer_file)
    critical = []
    
    for activity in xer.activities:
        if activity.total_float_hr_cnt is not None:
            float_days = activity.total_float_hr_cnt / 8.0
            if float_days <= 0:
                critical.append({
                    'code': activity.task_code,
                    'name': activity.task_name,
                    'float': float_days,
                    'duration': activity.target_drtn_hr_cnt / 8.0
                })
    
    return critical
```

### Earned Value Analysis
```python
def calculate_evm(xer_file):
    xer = Reader(xer_file)
    
    pv = ev = ac = 0
    
    for activity in xer.activities:
        assignments = [a for a in xer.activityresources 
                      if a.task_id == activity.task_id]
        
        planned = sum(a.target_cost or 0 for a in assignments)
        actual = sum((a.act_reg_cost or 0) + (a.act_ot_cost or 0) 
                    for a in assignments)
        
        if activity.phys_complete_pct:
            earned = planned * (activity.phys_complete_pct / 100)
        else:
            earned = 0
        
        pv += planned
        ev += earned
        ac += actual
    
    cpi = ev / ac if ac > 0 else 0
    spi = ev / pv if pv > 0 else 0
    
    return {
        'PV': pv, 'EV': ev, 'AC': ac,
        'CPI': cpi, 'SPI': spi,
        'CV': ev - ac, 'SV': ev - pv
    }
```

### Resource Analysis
```python
def analyze_resources(xer_file):
    xer = Reader(xer_file)
    
    for resource in xer.resources:
        assignments = [a for a in xer.activityresources 
                      if a.rsrc_id == resource.rsrc_id]
        
        total_hours = sum(a.target_qty or 0 for a in assignments)
        actual_hours = sum(a.act_reg_qty or 0 for a in assignments)
        
        print(f"{resource.rsrc_name}: {total_hours:.1f}h planned, "
              f"{actual_hours:.1f}h actual")
```

### Schedule Quality Check
```python
def quality_check(xer_file):
    xer = Reader(xer_file)
    issues = []
    
    for project in xer.projects:
        activities = project.activities
        
        # Check 1: Multiple starts
        no_pred = [a for a in activities if not a.predecessors 
                  and a.task_type != "TT_Mile"]
        if len(no_pred) > 1:
            issues.append(f"Multiple starts: {len(no_pred)}")
        
        # Check 2: Long activities
        long = [a for a in activities 
               if a.target_drtn_hr_cnt and (a.target_drtn_hr_cnt/8.0) > 20]
        if long:
            issues.append(f"Long activities (>20d): {len(long)}")
        
        # Check 3: Negative float
        neg_float = [a for a in activities 
                    if a.total_float_hr_cnt and a.total_float_hr_cnt < 0]
        if neg_float:
            issues.append(f"Negative float: {len(neg_float)}")
    
    return issues
```

## Export Functions

### Export to JSON
```python
import json

def export_json(xer_file, output_file):
    xer = Reader(xer_file)
    
    data = {
        'projects': [{
            'name': p.proj_short_name,
            'activities': len(p.activities)
        } for p in xer.projects],
        'total_activities': len(xer.activities),
        'total_resources': len(xer.resources)
    }
    
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)
```

### Export to Excel
```python
import pandas as pd

def export_excel(xer_file, output_file):
    xer = Reader(xer_file)
    
    activities = []
    for a in xer.activities:
        activities.append({
            'Code': a.task_code,
            'Name': a.task_name,
            'Duration': a.target_drtn_hr_cnt / 8.0,
            'Status': a.status_code,
            'Float': a.total_float_hr_cnt / 8.0 if a.total_float_hr_cnt else None
        })
    
    df = pd.DataFrame(activities)
    df.to_excel(output_file, index=False)
```

## Common Patterns

### Filter Activities by Status
```python
active = [a for a in xer.activities if a.status_code == "TK_Active"]
completed = [a for a in xer.activities if a.status_code == "TK_Complete"]
```

### Find Activity Relationships
```python
# Find predecessors
preds = [r for r in xer.relations if r.task_id == activity_id]

# Find successors
succs = [r for r in xer.relations if r.pred_task_id == activity_id]
```

### Calculate Total Duration
```python
total_days = sum(a.target_drtn_hr_cnt / 8.0 for a in xer.activities 
                if a.target_drtn_hr_cnt)
```

## Status Codes Reference

**Activity Status:**
- `TK_NotStart` - Not Started
- `TK_Active` - In Progress
- `TK_Complete` - Completed

**Relationship Types:**
- `PR_FS` - Finish-to-Start
- `PR_SS` - Start-to-Start
- `PR_FF` - Finish-to-Finish
- `PR_SF` - Start-to-Finish

**Resource Types:**
- `RT_Labor` - Labor/Human Resource
- `RT_Mat` - Material
- `RT_Equip` - Equipment

**Task Types:**
- `TT_Task` - Regular Task
- `TT_Mile` - Start Milestone
- `TT_FinMile` - Finish Milestone
- `TT_LOE` - Level of Effort
