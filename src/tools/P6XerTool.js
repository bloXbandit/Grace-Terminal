/**
 * P6XerTool - Complete Primavera P6 XER File Analysis and Manipulation
 * 
 * This tool provides FULL ACCESS to PyP6Xer library capabilities:
 * - Read/Write XER files
 * - Parse all project elements (activities, resources, calendars, WBS, relationships)
 * - Schedule analysis (critical path, float, DCMA 14-point quality assessment)
 * - Resource management (utilization, allocation, cost analysis)
 * - Earned value analysis
 * - Progress tracking
 * - Data export and modification
 * 
 * Based on: https://github.com/HassanEmam/PyP6Xer
 */

// Exact fallback message as defined in MASTER_SYSTEM_PROMPT
const UNAVAILABLE_MESSAGE = "XER analysis/execution is unavailable at this time.";

const p6xer_tool = {
  name: "p6xer_tool",
  description: `Complete Primavera P6 XER file parser and analyzer using PyP6Xer library. 
  
  CAPABILITIES:
  1. READ XER FILES - Parse all project data
  2. WRITE XER FILES - Export modified data
  3. PROJECT ANALYSIS - Activities, WBS, relationships, resources
  4. SCHEDULE ANALYSIS - Critical path, float analysis, schedule quality
  5. RESOURCE ANALYSIS - Utilization, allocation, over-allocation detection
  6. EARNED VALUE MANAGEMENT - PV, EV, AC, CPI, SPI calculations
  7. DCMA 14-POINT ASSESSMENT - Comprehensive schedule quality check
  8. DATA MODIFICATION - Update activities, resources, progress
  9. REPORTING - Generate custom reports and summaries
  
  Use this for ANY Primavera P6 XER file operation.`,
  
  params: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: [
          "parse", "write", "summary", "activities", "resources", 
          "critical_path", "float_analysis", "dcma14", "earned_value",
          "resource_utilization", "overallocated_resources", "schedule_quality",
          "progress_report", "modify_activity", "custom_analysis"
        ],
        description: "Operation to perform on XER file"
      },
      xer_file: {
        type: "string",
        description: "Path to XER file (required for most operations)"
      },
      output_file: {
        type: "string",
        description: "Output file path (for write operations)"
      },
      filters: {
        type: "object",
        description: "Filters for analysis (e.g., {status: 'TK_Active', duration_min: 10})",
        properties: {
          status: { type: "string" },
          duration_min: { type: "number" },
          duration_max: { type: "number" },
          float_max: { type: "number" },
          resource_type: { type: "string" },
          wbs_id: { type: "string" },
          activity_code: { type: "string" }
        }
      },
      modifications: {
        type: "object",
        description: "Modifications to apply (for modify_activity operation)",
        properties: {
          activity_id: { type: "string" },
          phys_complete_pct: { type: "number" },
          status_code: { type: "string" },
          duration: { type: "number" }
        }
      },
      dcma_params: {
        type: "object",
        description: "Parameters for DCMA 14-point analysis",
        properties: {
          duration_limit: { type: "number", default: 20 },
          lag_limit: { type: "number", default: 0 },
          tf_limit: { type: "number", default: 0 }
        }
      }
    },
    required: ["operation"]
  },

  async execute(params, context = {}) {
    const { operation, xer_file, output_file, filters, modifications, dcma_params } = params;
    const { runtime } = context;

    if (!runtime) {
      console.error('[P6XerTool] Runtime not available - PyP6XER cannot execute');
      return { 
        success: false, 
        error: UNAVAILABLE_MESSAGE,
        userMessage: UNAVAILABLE_MESSAGE,
        enforced: true  // Flag to prevent LLM from rephrasing
      };
    }

    try {
      console.log(`[P6XerTool] Operation: ${operation}`);

      const pythonScript = this.generateScript(operation, {
        xer_file,
        output_file,
        filters: filters || {},
        modifications: modifications || {},
        dcma_params: dcma_params || { duration_limit: 20, lag_limit: 0, tf_limit: 0 }
      });

      if (!pythonScript) {
        return { success: false, error: `Unsupported operation: ${operation}` };
      }

      const scriptPath = `/tmp/p6xer_${Date.now()}.py`;
      await runtime.writeFile(scriptPath, pythonScript);
      const result = await runtime.executeCommand(`python3 ${scriptPath}`);
      await runtime.executeCommand(`rm ${scriptPath}`);

      if (result.exit_code !== 0) {
        console.error('[P6XerTool] PyP6XER execution failed:', result.stderr);
        return {
          success: false,
          error: UNAVAILABLE_MESSAGE,
          userMessage: UNAVAILABLE_MESSAGE,
          details: result.stderr,
          exit_code: result.exit_code,
          enforced: true  // Flag to prevent LLM from rephrasing
        };
      }

      // Parse JSON output from Python script
      try {
        const output = JSON.parse(result.stdout);
        return {
          success: true,
          operation: operation,
          ...output
        };
      } catch (e) {
        // If not JSON, return raw output
        return {
          success: true,
          operation: operation,
          output: result.stdout
        };
      }

    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  generateScript(operation, params) {
    const { xer_file, output_file, filters, modifications, dcma_params } = params;

    const baseImport = `from xerparser.reader import Reader
from xerparser.dcma14.analysis import DCMA14
import json
from datetime import datetime

`;

    switch (operation) {
      case "parse":
        return baseImport + this.genParse(xer_file);
      
      case "summary":
        return baseImport + this.genSummary(xer_file);
      
      case "activities":
        return baseImport + this.genActivities(xer_file, filters);
      
      case "resources":
        return baseImport + this.genResources(xer_file, filters);
      
      case "critical_path":
        return baseImport + this.genCriticalPath(xer_file);
      
      case "float_analysis":
        return baseImport + this.genFloatAnalysis(xer_file, filters);
      
      case "dcma14":
        return baseImport + this.genDCMA14(xer_file, dcma_params);
      
      case "earned_value":
        return baseImport + this.genEarnedValue(xer_file);
      
      case "resource_utilization":
        return baseImport + this.genResourceUtilization(xer_file);
      
      case "overallocated_resources":
        return baseImport + this.genOverallocatedResources(xer_file);
      
      case "schedule_quality":
        return baseImport + this.genScheduleQuality(xer_file);
      
      case "progress_report":
        return baseImport + this.genProgressReport(xer_file);
      
      case "modify_activity":
        return baseImport + this.genModifyActivity(xer_file, output_file, modifications);
      
      case "write":
        return baseImport + this.genWrite(xer_file, output_file);
      
      case "custom_analysis":
        return baseImport + this.genCustomAnalysis(xer_file, filters);
      
      default:
        return null;
    }
  },

  esc(str) {
    return (str || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  },

  genParse(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

result = {
    'projects': len(xer.projects),
    'activities': len(xer.activities),
    'resources': len(xer.resources),
    'calendars': len(xer.calendars),
    'relationships': len(xer.relations)
}

print(json.dumps(result))`;
  },

  genSummary(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

projects = []
for project in xer.projects:
    projects.append({
        'id': project.proj_id,
        'name': project.proj_short_name,
        'full_name': project.proj_node_name,
        'activities': len(project.activities),
        'start_date': str(project.plan_start_date) if project.plan_start_date else None,
        'finish_date': str(project.plan_end_date) if project.plan_end_date else None
    })

result = {
    'summary': {
        'total_projects': len(xer.projects),
        'total_activities': len(xer.activities),
        'total_resources': len(xer.resources),
        'total_relationships': len(xer.relations)
    },
    'projects': projects
}

print(json.dumps(result))`;
  },

  genActivities(xer_file, filters) {
    const filterCode = this.buildFilterCode(filters);
    return `xer = Reader('${this.esc(xer_file)}')

activities = []
for activity in xer.activities:
    ${filterCode}
    activities.append({
        'id': activity.task_id,
        'code': activity.task_code,
        'name': activity.task_name,
        'duration': activity.target_drtn_hr_cnt / 8.0 if activity.target_drtn_hr_cnt else 0,
        'status': activity.status_code,
        'start_date': str(activity.target_start_date) if activity.target_start_date else None,
        'finish_date': str(activity.target_end_date) if activity.target_end_date else None,
        'total_float': activity.total_float_hr_cnt / 8.0 if activity.total_float_hr_cnt else None,
        'free_float': activity.free_float_hr_cnt / 8.0 if activity.free_float_hr_cnt else None,
        'percent_complete': activity.phys_complete_pct or 0,
        'predecessors': len(activity.predecessors),
        'successors': len(activity.successors)
    })

result = {
    'count': len(activities),
    'activities': activities
}

print(json.dumps(result))`;
  },

  genResources(xer_file, filters) {
    return `xer = Reader('${this.esc(xer_file)}')

resources = []
for resource in xer.resources:
    assignments = [a for a in xer.activityresources if a.rsrc_id == resource.rsrc_id]
    total_hours = sum(a.target_qty or 0 for a in assignments)
    
    resources.append({
        'id': resource.rsrc_id,
        'name': resource.rsrc_name,
        'type': resource.rsrc_type,
        'assignments': len(assignments),
        'total_hours': total_hours,
        'total_cost': sum((a.target_cost or 0) for a in assignments)
    })

result = {
    'count': len(resources),
    'resources': resources
}

print(json.dumps(result))`;
  },

  genCriticalPath(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

critical_activities = []
for activity in xer.activities:
    if activity.total_float_hr_cnt is not None and activity.total_float_hr_cnt <= 0:
        critical_activities.append({
            'id': activity.task_id,
            'code': activity.task_code,
            'name': activity.task_name,
            'duration': activity.target_drtn_hr_cnt / 8.0 if activity.target_drtn_hr_cnt else 0,
            'start_date': str(activity.target_start_date) if activity.target_start_date else None,
            'finish_date': str(activity.target_end_date) if activity.target_end_date else None,
            'total_float': activity.total_float_hr_cnt / 8.0 if activity.total_float_hr_cnt else 0
        })

result = {
    'critical_path_count': len(critical_activities),
    'total_activities': len(xer.activities),
    'critical_percentage': (len(critical_activities) / len(xer.activities)) * 100 if len(xer.activities) > 0 else 0,
    'critical_activities': critical_activities
}

print(json.dumps(result))`;
  },

  genFloatAnalysis(xer_file, filters) {
    const float_max = filters.float_max || 10;
    return `xer = Reader('${this.esc(xer_file)}')

float_categories = {
    'negative': [],
    'zero': [],
    'low': [],  # 0-5 days
    'medium': [],  # 5-10 days
    'high': []  # >10 days
}

for activity in xer.activities:
    if activity.total_float_hr_cnt is None:
        continue
    
    float_days = activity.total_float_hr_cnt / 8.0
    
    act_data = {
        'id': activity.task_id,
        'code': activity.task_code,
        'name': activity.task_name,
        'total_float': float_days
    }
    
    if float_days < 0:
        float_categories['negative'].append(act_data)
    elif float_days == 0:
        float_categories['zero'].append(act_data)
    elif float_days <= 5:
        float_categories['low'].append(act_data)
    elif float_days <= 10:
        float_categories['medium'].append(act_data)
    else:
        float_categories['high'].append(act_data)

result = {
    'negative_float': {'count': len(float_categories['negative']), 'activities': float_categories['negative']},
    'zero_float': {'count': len(float_categories['zero']), 'activities': float_categories['zero']},
    'low_float': {'count': len(float_categories['low']), 'activities': float_categories['low']},
    'medium_float': {'count': len(float_categories['medium']), 'activities': float_categories['medium']},
    'high_float': {'count': len(float_categories['high']), 'activities': float_categories['high']}
}

print(json.dumps(result))`;
  },

  genDCMA14(xer_file, dcma_params) {
    const { duration_limit, lag_limit, tf_limit } = dcma_params;
    return `xer = Reader('${this.esc(xer_file)}')

# Perform DCMA 14-point analysis on first project
project = xer.projects[0] if len(xer.projects) > 0 else None

if project:
    dcma = DCMA14(project, duration_limit=${duration_limit}, lag_limit=${lag_limit}, tf_limit=${tf_limit})
    analysis_results = dcma.analysis()
    
    # Convert to JSON-serializable format
    result = analysis_results
    print(json.dumps(result, default=str))
else:
    print(json.dumps({'error': 'No projects found in XER file'}))`;
  },

  genEarnedValue(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

ev_metrics = []

for project in xer.projects:
    planned_value = 0
    earned_value = 0
    actual_cost = 0
    
    for activity in project.activities:
        assignments = [a for a in xer.activityresources if a.task_id == activity.task_id]
        
        activity_planned = sum(a.target_cost or 0 for a in assignments)
        activity_actual = sum((a.act_reg_cost or 0) + (a.act_ot_cost or 0) for a in assignments)
        
        if activity.phys_complete_pct:
            activity_earned = activity_planned * (activity.phys_complete_pct / 100)
        else:
            activity_earned = 0
        
        planned_value += activity_planned
        earned_value += activity_earned
        actual_cost += activity_actual
    
    cpi = earned_value / actual_cost if actual_cost > 0 else 0
    spi = earned_value / planned_value if planned_value > 0 else 0
    
    ev_metrics.append({
        'project_id': project.proj_id,
        'project_name': project.proj_short_name,
        'planned_value': planned_value,
        'earned_value': earned_value,
        'actual_cost': actual_cost,
        'cost_variance': earned_value - actual_cost,
        'schedule_variance': earned_value - planned_value,
        'cpi': cpi,
        'spi': spi,
        'performance_status': 'On Track' if cpi >= 0.95 and spi >= 0.95 else 'At Risk'
    })

result = {
    'earned_value_metrics': ev_metrics
}

print(json.dumps(result))`;
  },

  genResourceUtilization(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

resource_utilization = []

for resource in xer.resources:
    assignments = [a for a in xer.activityresources if a.rsrc_id == resource.rsrc_id]
    
    total_hours = sum(a.target_qty or 0 for a in assignments)
    actual_hours = sum(a.act_reg_qty or 0 for a in assignments)
    remaining_hours = sum(a.remain_qty or 0 for a in assignments)
    
    resource_utilization.append({
        'id': resource.rsrc_id,
        'name': resource.rsrc_name,
        'type': resource.rsrc_type,
        'total_assignments': len(assignments),
        'planned_hours': total_hours,
        'actual_hours': actual_hours,
        'remaining_hours': remaining_hours,
        'utilization_pct': (actual_hours / total_hours * 100) if total_hours > 0 else 0
    })

result = {
    'resource_count': len(resource_utilization),
    'resources': resource_utilization
}

print(json.dumps(result))`;
  },

  genOverallocatedResources(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

overallocated = []

for resource in xer.resources:
    if resource.rsrc_type != "RT_Labor":
        continue
    
    assignments = [a for a in xer.activityresources if a.rsrc_id == resource.rsrc_id]
    
    total_hours = sum(a.target_qty or 0 for a in assignments)
    max_available = 2080  # 40 hours * 52 weeks
    
    if total_hours > max_available:
        overallocated.append({
            'id': resource.rsrc_id,
            'name': resource.rsrc_name,
            'allocated_hours': total_hours,
            'available_hours': max_available,
            'excess_hours': total_hours - max_available,
            'overallocation_pct': ((total_hours - max_available) / max_available) * 100
        })

result = {
    'overallocated_count': len(overallocated),
    'resources': overallocated
}

print(json.dumps(result))`;
  },

  genScheduleQuality(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

issues = []

# Check for activities without predecessors
no_predecessors = [a for a in xer.activities if not a.predecessors and a.task_type != "TT_Mile"]
if len(no_predecessors) > 1:
    issues.append({
        'type': 'no_predecessors',
        'severity': 'high',
        'count': len(no_predecessors),
        'message': f'Multiple start activities without predecessors: {len(no_predecessors)}'
    })

# Check for activities without successors
no_successors = [a for a in xer.activities if not a.successors and a.task_type != "TT_Mile"]
if len(no_successors) > 1:
    issues.append({
        'type': 'no_successors',
        'severity': 'high',
        'count': len(no_successors),
        'message': f'Multiple finish activities without successors: {len(no_successors)}'
    })

# Check for long duration activities
long_activities = [a for a in xer.activities if a.target_drtn_hr_cnt and (a.target_drtn_hr_cnt / 8.0) > 20]
if long_activities:
    issues.append({
        'type': 'long_duration',
        'severity': 'medium',
        'count': len(long_activities),
        'message': f'Activities with duration > 20 days: {len(long_activities)}'
    })

# Check for negative float
negative_float = [a for a in xer.activities if a.total_float_hr_cnt and a.total_float_hr_cnt < 0]
if negative_float:
    issues.append({
        'type': 'negative_float',
        'severity': 'high',
        'count': len(negative_float),
        'message': f'Activities with negative float: {len(negative_float)}'
    })

# Check for missing resources
no_resources = [a for a in xer.activities if not any(ar.task_id == a.task_id for ar in xer.activityresources)]
if no_resources:
    issues.append({
        'type': 'no_resources',
        'severity': 'low',
        'count': len(no_resources),
        'message': f'Activities without resource assignments: {len(no_resources)}'
    })

result = {
    'total_issues': len(issues),
    'quality_score': max(0, 100 - (len(issues) * 10)),
    'issues': issues
}

print(json.dumps(result))`;
  },

  genProgressReport(xer_file) {
    return `xer = Reader('${this.esc(xer_file)}')

progress_data = []

for project in xer.projects:
    activities = project.activities
    
    total_activities = len(activities)
    completed = len([a for a in activities if a.status_code == "TK_Complete"])
    in_progress = len([a for a in activities if a.status_code == "TK_Active"])
    not_started = len([a for a in activities if a.status_code == "TK_NotStart"])
    
    completion_rate = (completed / total_activities) * 100 if total_activities > 0 else 0
    
    progress_data.append({
        'project_id': project.proj_id,
        'project_name': project.proj_short_name,
        'total_activities': total_activities,
        'completed': completed,
        'in_progress': in_progress,
        'not_started': not_started,
        'completion_pct': completion_rate
    })

result = {
    'progress_report': progress_data
}

print(json.dumps(result))`;
  },

  genModifyActivity(xer_file, output_file, modifications) {
    const { activity_id, phys_complete_pct, status_code, duration } = modifications;
    return `xer = Reader('${this.esc(xer_file)}')

# Find and modify activity
modified = False
for activity in xer.activities:
    if activity.task_id == '${this.esc(activity_id)}':
        ${phys_complete_pct !== undefined ? `activity.phys_complete_pct = ${phys_complete_pct}` : ''}
        ${status_code ? `activity.status_code = '${this.esc(status_code)}'` : ''}
        ${duration !== undefined ? `activity.target_drtn_hr_cnt = ${duration * 8}` : ''}
        modified = True
        break

if modified:
    xer.write('${this.esc(output_file)}')
    result = {'success': True, 'message': 'Activity modified and saved'}
else:
    result = {'success': False, 'error': 'Activity not found'}

print(json.dumps(result))`;
  },

  genWrite(xer_file, output_file) {
    return `xer = Reader('${this.esc(xer_file)}')
xer.write('${this.esc(output_file)}')

result = {'success': True, 'output_file': '${this.esc(output_file)}'}
print(json.dumps(result))`;
  },

  genCustomAnalysis(xer_file, filters) {
    return `xer = Reader('${this.esc(xer_file)}')

# Custom analysis - user can modify this
result = {
    'projects': [{'id': p.proj_id, 'name': p.proj_short_name} for p in xer.projects],
    'total_activities': len(xer.activities),
    'total_resources': len(xer.resources),
    'total_relationships': len(xer.relations)
}

print(json.dumps(result))`;
  },

  buildFilterCode(filters) {
    let code = '';
    if (filters.status) {
      code += `if activity.status_code != '${this.esc(filters.status)}': continue\n    `;
    }
    if (filters.duration_min !== undefined) {
      code += `if not activity.target_drtn_hr_cnt or (activity.target_drtn_hr_cnt / 8.0) < ${filters.duration_min}: continue\n    `;
    }
    if (filters.duration_max !== undefined) {
      code += `if activity.target_drtn_hr_cnt and (activity.target_drtn_hr_cnt / 8.0) > ${filters.duration_max}: continue\n    `;
    }
    if (filters.float_max !== undefined) {
      code += `if activity.total_float_hr_cnt and (activity.total_float_hr_cnt / 8.0) > ${filters.float_max}: continue\n    `;
    }
    return code;
  }
};

module.exports = p6xer_tool;

