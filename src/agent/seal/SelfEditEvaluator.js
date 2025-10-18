require('module-alias/register');
const SelfEdit = require('@src/models/SelfEdit');
const PerformanceMetric = require('@src/models/PerformanceMetric');
const TaskLogger = require('./TaskLogger');

/**
 * SelfEditEvaluator - Evaluate and rank self-edit candidates
 * Implements ReST-EM algorithm for continuous improvement
 */
class SelfEditEvaluator {
  constructor(options = {}) {
    this.evaluation_window_days = options.evaluation_window_days || 7;
    this.min_samples = options.min_samples || 10;
  }

  /**
   * Evaluate self-edit candidates based on recent performance
   * @param {Array} candidates - Self-edit candidates to evaluate
   * @param {string} taskType - Type of task to evaluate
   * @returns {Array} - Ranked candidates with scores
   */
  async evaluateCandidates(candidates, taskType) {
    try {
      console.log(`🔬 [SEAL] Evaluating ${candidates.length} self-edit candidates for ${taskType}`);
      
      const results = [];

      for (const candidate of candidates) {
        // Calculate score based on multiple factors
        const score = await this.calculateCandidateScore(candidate, taskType);
        
        results.push({
          ...candidate,
          evaluation_score: score.overall,
          metrics: score.breakdown
        });
      }

      // Sort by score (highest first)
      const ranked = results.sort((a, b) => b.evaluation_score - a.evaluation_score);
      
      console.log(`✅ [SEAL] Top candidate score: ${ranked[0].evaluation_score.toFixed(2)}`);
      
      return ranked;
    } catch (error) {
      console.error('❌ [SEAL] Error evaluating candidates:', error);
      return candidates;
    }
  }

  /**
   * Calculate score for a self-edit candidate
   * @param {Object} candidate - Self-edit candidate
   * @param {string} taskType - Task type
   * @returns {Object} - Score breakdown
   */
  async calculateCandidateScore(candidate, taskType) {
    try {
      // Get recent performance metrics
      const metrics = await TaskLogger.calculateMetrics(taskType);
      
      if (!metrics || metrics.total_executions < this.min_samples) {
        // Not enough data, use heuristic scoring
        return this.heuristicScore(candidate);
      }

      // Score based on multiple factors
      const scores = {
        success_rate: metrics.success_rate / 100, // 0-1
        user_satisfaction: metrics.avg_feedback_score / 5, // 0-1
        efficiency: this.calculateEfficiencyScore(metrics.avg_execution_time),
        cost_effectiveness: this.calculateCostScore(metrics.total_cost, metrics.total_executions),
        novelty: this.calculateNoveltyScore(candidate)
      };

      // Weighted average
      const weights = {
        success_rate: 0.35,
        user_satisfaction: 0.30,
        efficiency: 0.15,
        cost_effectiveness: 0.10,
        novelty: 0.10
      };

      const overall = Object.keys(scores).reduce((sum, key) => {
        return sum + (scores[key] * weights[key]);
      }, 0);

      return {
        overall: overall * 100, // 0-100 scale
        breakdown: scores
      };
    } catch (error) {
      console.error('❌ [SEAL] Error calculating score:', error);
      return { overall: 50, breakdown: {} };
    }
  }

  /**
   * Heuristic scoring when not enough data
   * @param {Object} candidate - Self-edit candidate
   * @returns {Object} - Heuristic score
   */
  heuristicScore(candidate) {
    // Score based on edit quality indicators
    let score = 50; // Base score

    // Reward detailed reasoning
    if (candidate.reasoning && candidate.reasoning.length > 100) {
      score += 10;
    }

    // Reward specific improvements
    if (candidate.improvement_description && candidate.improvement_description.length > 50) {
      score += 10;
    }

    // Reward diverse strategies
    if (candidate.strategy_type && candidate.strategy_type !== 'default') {
      score += 10;
    }

    return {
      overall: Math.min(score, 100),
      breakdown: { heuristic: true }
    };
  }

  /**
   * Calculate efficiency score based on execution time
   * @param {number} avgTime - Average execution time in ms
   * @returns {number} - Efficiency score (0-1)
   */
  calculateEfficiencyScore(avgTime) {
    // Faster is better, but with diminishing returns
    // Target: < 5000ms = 1.0, > 30000ms = 0.0
    if (avgTime < 5000) return 1.0;
    if (avgTime > 30000) return 0.0;
    return 1.0 - ((avgTime - 5000) / 25000);
  }

  /**
   * Calculate cost effectiveness score
   * @param {number} totalCost - Total cost
   * @param {number} totalExecutions - Total executions
   * @returns {number} - Cost score (0-1)
   */
  calculateCostScore(totalCost, totalExecutions) {
    const avgCost = totalCost / totalExecutions;
    // Target: < $0.01 = 1.0, > $0.10 = 0.0
    if (avgCost < 0.01) return 1.0;
    if (avgCost > 0.10) return 0.0;
    return 1.0 - ((avgCost - 0.01) / 0.09);
  }

  /**
   * Calculate novelty score (encourage exploration)
   * @param {Object} candidate - Self-edit candidate
   * @returns {number} - Novelty score (0-1)
   */
  calculateNoveltyScore(candidate) {
    // Simple novelty: reward different temperatures and strategies
    const temp = candidate.temperature || 0.7;
    // Higher temperature = more novel (within reason)
    return Math.min(temp / 1.0, 1.0);
  }

  /**
   * Select top-K self-edits for application
   * @param {Array} rankedCandidates - Ranked self-edit candidates
   * @param {number} k - Number to select
   * @returns {Array} - Top-K candidates
   */
  selectTopK(rankedCandidates, k = 3) {
    return rankedCandidates.slice(0, k);
  }

  /**
   * Update performance metrics in database
   * @param {string} taskType - Task type
   * @param {Object} metrics - Performance metrics
   */
  async updatePerformanceMetrics(taskType, metrics) {
    try {
      const existing = await PerformanceMetric.findOne({
        where: { task_type: taskType }
      });

      if (existing) {
        await PerformanceMetric.update(metrics, {
          where: { task_type: taskType }
        });
      } else {
        await PerformanceMetric.create({
          task_type: taskType,
          ...metrics
        });
      }

      console.log(`📈 [SEAL] Performance metrics updated for ${taskType}`);
    } catch (error) {
      console.error('❌ [SEAL] Error updating metrics:', error);
    }
  }
}

module.exports = SelfEditEvaluator;
