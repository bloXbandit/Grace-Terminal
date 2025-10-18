require('module-alias/register');
const SelfEditGenerator = require('./SelfEditGenerator');
const SelfEditEvaluator = require('./SelfEditEvaluator');
const TaskLogger = require('./TaskLogger');
const SelfEdit = require('@src/models/SelfEdit');
const SkillGap = require('@src/models/SkillGap');

/**
 * SEALCoordinator - Main orchestrator for SEAL framework
 * Implements the continuous improvement loop
 */
class SEALCoordinator {
  constructor(options = {}) {
    this.generator = new SelfEditGenerator(options);
    this.evaluator = new SelfEditEvaluator(options);
    this.improvement_interval_hours = options.improvement_interval_hours || 24;
    this.min_tasks_for_improvement = options.min_tasks_for_improvement || 20;
    this.isRunning = false;
  }

  /**
   * Start the continuous improvement loop
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  [SEAL] Already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 [SEAL] Starting continuous improvement loop');
    console.log(`📅 [SEAL] Improvement cycle: every ${this.improvement_interval_hours} hours`);

    // Run immediately on start
    await this.runImprovementCycle();

    // Schedule periodic improvements
    this.intervalId = setInterval(async () => {
      await this.runImprovementCycle();
    }, this.improvement_interval_hours * 60 * 60 * 1000);
  }

  /**
   * Stop the continuous improvement loop
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 [SEAL] Stopped continuous improvement loop');
  }

  /**
   * Run a single improvement cycle
   */
  async runImprovementCycle() {
    try {
      console.log('\n🔄 [SEAL] === Starting Improvement Cycle ===');
      
      // 1. Identify areas for improvement
      const improvementAreas = await this.identifyImprovementAreas();
      
      if (improvementAreas.length === 0) {
        console.log('✅ [SEAL] No improvement areas identified. System performing well!');
        return;
      }

      console.log(`🎯 [SEAL] Found ${improvementAreas.length} areas for improvement`);

      // 2. Generate and evaluate self-edits for each area
      for (const area of improvementAreas) {
        await this.improveArea(area);
      }

      // 3. Detect and log skill gaps
      await this.detectSkillGaps();

      console.log('✅ [SEAL] === Improvement Cycle Complete ===\n');
    } catch (error) {
      console.error('❌ [SEAL] Error in improvement cycle:', error);
    }
  }

  /**
   * Identify areas that need improvement
   * @returns {Array} - List of improvement areas
   */
  async identifyImprovementAreas() {
    try {
      const areas = [];

      // Get all task types with recent activity
      const recentTasks = await TaskLogger.getRecentTasks({ limit: 1000 });
      const taskTypes = [...new Set(recentTasks.map(t => t.task_type))];

      for (const taskType of taskTypes) {
        const metrics = await TaskLogger.calculateMetrics(taskType);
        
        // Skip if not enough data
        if (metrics.total_executions < this.min_tasks_for_improvement) {
          continue;
        }

        // Identify if improvement needed
        const needsImprovement = 
          metrics.success_rate < 80 || // Low success rate
          metrics.avg_feedback_score < 3.5 || // Low user satisfaction
          metrics.avg_execution_time > 15000; // Slow execution

        if (needsImprovement) {
          areas.push({
            task_type: taskType,
            metrics: metrics,
            priority: this.calculatePriority(metrics)
          });
        }
      }

      // Sort by priority
      return areas.sort((a, b) => b.priority - a.priority);
    } catch (error) {
      console.error('❌ [SEAL] Error identifying improvement areas:', error);
      return [];
    }
  }

  /**
   * Calculate priority for improvement area
   * @param {Object} metrics - Performance metrics
   * @returns {number} - Priority score
   */
  calculatePriority(metrics) {
    let priority = 0;

    // High volume tasks are higher priority
    priority += Math.min(metrics.total_executions / 10, 50);

    // Low success rate increases priority
    if (metrics.success_rate < 50) priority += 30;
    else if (metrics.success_rate < 80) priority += 15;

    // Low feedback increases priority
    if (metrics.avg_feedback_score < 2) priority += 30;
    else if (metrics.avg_feedback_score < 3.5) priority += 15;

    return priority;
  }

  /**
   * Generate and apply improvements for a specific area
   * @param {Object} area - Improvement area
   */
  async improveArea(area) {
    try {
      console.log(`\n🎯 [SEAL] Improving: ${area.task_type}`);
      console.log(`   Success Rate: ${area.metrics.success_rate.toFixed(1)}%`);
      console.log(`   User Satisfaction: ${area.metrics.avg_feedback_score.toFixed(2)}/5`);

      // 1. Generate self-edit candidates
      const candidates = await this.generator.generateForTaskType(area.task_type);
      
      if (candidates.length === 0) {
        console.log(`⚠️  [SEAL] No candidates generated for ${area.task_type}`);
        return;
      }

      console.log(`   Generated ${candidates.length} improvement candidates`);

      // 2. Evaluate candidates
      const rankedCandidates = await this.evaluator.evaluateCandidates(
        candidates,
        area.task_type
      );

      // 3. Select top candidates
      const topCandidates = this.evaluator.selectTopK(rankedCandidates, 3);
      
      console.log(`   Selected top ${topCandidates.length} candidates`);
      console.log(`   Best score: ${topCandidates[0].evaluation_score.toFixed(2)}/100`);

      // 4. Save to database for future application
      await this.generator.saveCandidates(topCandidates, {
        task_type: area.task_type,
        current_metrics: area.metrics
      });

      // 5. Update performance metrics
      await this.evaluator.updatePerformanceMetrics(area.task_type, area.metrics);

      console.log(`✅ [SEAL] Improvements saved for ${area.task_type}`);
    } catch (error) {
      console.error(`❌ [SEAL] Error improving ${area.task_type}:`, error);
    }
  }

  /**
   * Detect skill gaps based on task failures
   */
  async detectSkillGaps() {
    try {
      // Get failed tasks
      const failedTasks = await TaskLogger.getRecentTasks({
        success_only: false,
        limit: 500
      });

      const failures = failedTasks.filter(t => !t.success);
      
      if (failures.length === 0) {
        console.log('✅ [SEAL] No skill gaps detected');
        return;
      }

      // Group failures by error patterns
      const errorPatterns = {};
      
      for (const failure of failures) {
        const errorType = this.categorizeError(failure.error_message);
        if (!errorPatterns[errorType]) {
          errorPatterns[errorType] = [];
        }
        errorPatterns[errorType].push(failure);
      }

      // Log skill gaps
      for (const [errorType, tasks] of Object.entries(errorPatterns)) {
        if (tasks.length >= 3) { // Only if pattern appears multiple times
          await this.logSkillGap(errorType, tasks);
        }
      }
    } catch (error) {
      console.error('❌ [SEAL] Error detecting skill gaps:', error);
    }
  }

  /**
   * Categorize error message
   * @param {string} errorMessage - Error message
   * @returns {string} - Error category
   */
  categorizeError(errorMessage) {
    if (!errorMessage) return 'unknown';
    
    const msg = errorMessage.toLowerCase();
    
    if (msg.includes('timeout')) return 'timeout';
    if (msg.includes('api') || msg.includes('rate limit')) return 'api_error';
    if (msg.includes('parse') || msg.includes('json')) return 'parsing_error';
    if (msg.includes('permission') || msg.includes('access')) return 'permission_error';
    if (msg.includes('not found') || msg.includes('404')) return 'resource_not_found';
    
    return 'unknown';
  }

  /**
   * Log a skill gap
   * @param {string} skillArea - Skill area with gap
   * @param {Array} tasks - Related failed tasks
   */
  async logSkillGap(skillArea, tasks) {
    try {
      const existing = await SkillGap.findOne({
        where: { skill_area: skillArea }
      });

      if (existing) {
        // Update occurrence count
        await SkillGap.update(
          {
            occurrence_count: existing.occurrence_count + tasks.length,
            last_occurrence: new Date()
          },
          { where: { skill_area: skillArea } }
        );
      } else {
        // Create new skill gap entry
        await SkillGap.create({
          skill_area: skillArea,
          description: `Recurring ${skillArea} errors detected`,
          severity: tasks.length > 10 ? 'high' : 'medium',
          occurrence_count: tasks.length,
          learning_status: 'identified',
          last_occurrence: new Date()
        });
      }

      console.log(`🎓 [SEAL] Skill gap logged: ${skillArea} (${tasks.length} occurrences)`);
    } catch (error) {
      console.error('❌ [SEAL] Error logging skill gap:', error);
    }
  }

  /**
   * Get current SEAL status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      running: this.isRunning,
      interval_hours: this.improvement_interval_hours,
      min_tasks_threshold: this.min_tasks_for_improvement
    };
  }
}

// Create singleton instance
const sealCoordinator = new SEALCoordinator({
  improvement_interval_hours: 24, // Run daily
  min_tasks_for_improvement: 20,
  num_candidates: 3
});

module.exports = sealCoordinator;
