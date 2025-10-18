const { DataTypes } = require('sequelize');
const BaseModel = require('./BaseModel');
const sequelize = require('./index.js');

/**
 * PerformanceMetric Model - Aggregated performance statistics
 * Used for meta-learning and strategy optimization
 */
class PerformanceMetric extends BaseModel {
  static associate(models) {
    // No direct associations needed
  }
}

PerformanceMetric.init(
  {
    task_type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Task type being measured'
    },
    specialist_model: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Specialist model if applicable'
    },
    time_period: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Time period: daily, weekly, monthly, all_time'
    },
    period_start: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Start of measurement period'
    },
    period_end: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'End of measurement period'
    },
    total_executions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total number of task executions'
    },
    successful_executions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of successful executions'
    },
    failed_executions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of failed executions'
    },
    success_rate: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Success rate (0-1)'
    },
    avg_duration_seconds: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Average task duration'
    },
    avg_tokens_used: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Average tokens per task'
    },
    avg_user_satisfaction: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Average user feedback score (1-5)'
    },
    total_user_feedback: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of user feedback submissions'
    },
    improvement_rate: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Rate of improvement vs previous period'
    },
    self_edits_applied: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of self-edits applied in this period'
    },
    best_self_edit_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID of best performing self-edit'
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional statistics as JSON'
    }
  },
  {
    sequelize,
    modelName: 'PerformanceMetric',
    tableName: 'performance_metrics',
    indexes: [
      { fields: ['task_type'] },
      { fields: ['specialist_model'] },
      { fields: ['time_period'] },
      { fields: ['period_start', 'period_end'] },
      { fields: ['success_rate'] }
    ]
  }
);

module.exports = PerformanceMetric;
