const sequelize = require('./index.js');
const { Model, DataTypes } = require("sequelize");

class RoutingPreference extends Model { }

const fields = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Routing preference ID'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User ID'
  },
  task_type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Task type (e.g., code_review, debugging, etc.)'
  },
  primary_model: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Primary model to use (e.g., openai/gpt-4o)'
  },
  fallback_model: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Fallback model if primary fails'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this routing is active'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation timestamp'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Last update timestamp'
  }
};

RoutingPreference.init(fields, {
  sequelize,
  modelName: 'routing_preference',
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'task_type']
    }
  ]
});

module.exports = exports = RoutingPreference;
