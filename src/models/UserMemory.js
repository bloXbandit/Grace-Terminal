const { Model, DataTypes } = require('sequelize');

/**
 * UserMemory Model
 * Stores user-saved memories for the My Assistant page
 * These are explicit "remember" requests from users via Grace
 */
class UserMemory extends Model {}

const fields = {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: 'User who owns this memory'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Short title/summary of the memory'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Full memory content'
  },
  source: {
    type: DataTypes.ENUM('grace', 'manual'),
    allowNull: false,
    defaultValue: 'grace',
    comment: 'How the memory was created: grace (from conversation) or manual (user added)'
  },
  conversation_id: {
    type: DataTypes.STRING(64),
    allowNull: true,
    comment: 'Conversation where this memory was created (if from Grace)'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of tags for categorization'
  },
  pinned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether the memory is pinned to top'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
};

const options = {
  tableName: 'user_memories',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['pinned'] },
    { fields: ['source'] }
  ]
};

const sequelize = require('./index');

UserMemory.init(fields, {
  ...options,
  sequelize
});

module.exports = UserMemory;
