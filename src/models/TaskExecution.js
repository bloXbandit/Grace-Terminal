const { DataTypes } = require('sequelize');
const BaseModel = require('./BaseModel');
const sequelize = require('./index.js');

/**
 * TaskExecution Model - Track every task execution for SEAL learning
 * Part of the SEAL (Self-Adapting LLM) implementation
 */
class TaskExecution extends BaseModel {
  static associate(models) {
    // Associations
    this.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
    this.belongsTo(models.Conversation, {
      foreignKey: 'conversation_id',
      as: 'conversation'
    });
  }
}

TaskExecution.init(
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'User ID'
    },
    conversation_id: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Conversation ID'
    },
    task_type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Type of task: code_review, debugging, web_research, data_analysis, etc.'
    },
    specialist_used: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Which specialist model was used (e.g., claude-opus, deepseek-coder, glm-4-plus)'
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Task start timestamp'
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Task end timestamp'
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Task duration in seconds'
    },
    status: {
      type: DataTypes.ENUM('success', 'failure', 'partial', 'timeout'),
      allowNull: false,
      defaultValue: 'success',
      comment: 'Task execution status'
    },
    user_feedback_score: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'User feedback rating (1-5)'
    },
    user_feedback_text: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional detailed user feedback'
    },
    error_type: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Type of error if failed'
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if failed'
    },
    tokens_used: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Total tokens used for this task'
    },
    prompt_tokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Prompt tokens used'
    },
    completion_tokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Completion tokens used'
    },
    context_data: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON string of task context and metadata'
    },
    self_edit_applied: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether a self-edit was applied for this task'
    },
    self_edit_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Reference to self-edit if one was used'
    }
  },
  {
    sequelize,
    modelName: 'TaskExecution',
    tableName: 'task_executions',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['conversation_id'] },
      { fields: ['task_type'] },
      { fields: ['status'] },
      { fields: ['start_time'] },
      { fields: ['specialist_used'] }
    ]
  }
);

module.exports = TaskExecution;
