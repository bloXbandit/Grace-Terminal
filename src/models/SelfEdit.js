const { DataTypes } = require('sequelize');
const BaseModel = require('./BaseModel');
const sequelize = require('./index.js');

/**
 * SelfEdit Model - Store self-generated improvements and training data
 * Core component of SEAL (Self-Adapting LLM) framework
 */
class SelfEdit extends BaseModel {
  static associate(models) {
    this.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  }
}

SelfEdit.init(
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'User ID (null for global self-edits)'
    },
    task_type: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Task type this self-edit applies to'
    },
    edit_name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Descriptive name for this self-edit'
    },
    synthetic_data: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON array of synthetic training examples'
    },
    prompt_template: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Improved prompt template'
    },
    optimization_config: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON object with learning rate, epochs, etc.'
    },
    augmentation_strategies: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON array of data augmentation strategies'
    },
    reasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'LLM reasoning for why this self-edit was generated'
    },
    generation_temperature: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Temperature used to generate this self-edit'
    },
    evaluation_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: 'Performance score from evaluation (0-1)'
    },
    success_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of successful applications'
    },
    failure_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of failed applications'
    },
    usage_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Total number of times used'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether this self-edit is currently active'
    },
    is_winner: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this was selected as winner in ReST-EM'
    },
    rest_em_iteration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Which ReST-EM iteration generated this'
    },
    parent_edit_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Parent self-edit if this is an evolution'
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time this self-edit was used'
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional metadata as JSON'
    }
  },
  {
    sequelize,
    modelName: 'SelfEdit',
    tableName: 'self_edits',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['task_type'] },
      { fields: ['is_active'] },
      { fields: ['is_winner'] },
      { fields: ['evaluation_score'] },
      { fields: ['rest_em_iteration'] }
    ]
  }
);

module.exports = SelfEdit;
