const { DataTypes } = require('sequelize');
const BaseModel = require('./BaseModel');
const sequelize = require('./index.js');

/**
 * SkillGap Model - Track identified skill gaps and learning progress
 * Enables proactive skill acquisition
 */
class SkillGap extends BaseModel {
  static associate(models) {
    // No direct associations needed
  }
}

SkillGap.init(
  {
    skill_area: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Skill area identified (e.g., "security auditing", "async programming")'
    },
    task_type: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Related task type'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Description of the skill gap'
    },
    identified_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When this gap was identified'
    },
    failure_count: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: 'Number of failures that led to identification'
    },
    severity: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium',
      comment: 'How critical is this skill gap'
    },
    status: {
      type: DataTypes.ENUM('identified', 'learning', 'practicing', 'mastered', 'archived'),
      defaultValue: 'identified',
      comment: 'Current status of skill acquisition'
    },
    learning_resources: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON array of learning resources (docs, examples, etc.)'
    },
    practice_tasks: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON array of practice tasks completed'
    },
    mastery_level: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: 'Mastery level (0-1): 0=novice, 0.5=intermediate, 1=expert'
    },
    success_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of successful applications after learning'
    },
    last_practiced_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last time this skill was practiced'
    },
    mastered_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When mastery was achieved'
    },
    related_self_edits: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON array of self-edit IDs related to this skill'
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional metadata as JSON'
    }
  },
  {
    sequelize,
    modelName: 'SkillGap',
    tableName: 'skill_gaps',
    indexes: [
      { fields: ['skill_area'] },
      { fields: ['task_type'] },
      { fields: ['status'] },
      { fields: ['severity'] },
      { fields: ['mastery_level'] },
      { fields: ['identified_at'] }
    ]
  }
);

module.exports = SkillGap;
