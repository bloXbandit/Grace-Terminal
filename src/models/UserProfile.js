const sequelize = require('./index.js');
const { Model, DataTypes } = require("sequelize");

class UserProfile extends Model { }

const fields = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Profile entry ID'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User ID this profile belongs to'
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Profile key (e.g., "name", "profession", "interests")'
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Profile value'
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 1.0,
    comment: 'Confidence level (0.0 to 1.0) - higher means more certain'
  },
  source: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Source of information (e.g., "conversation_id", "explicit", "inferred")'
  },
  last_updated: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Last update timestamp'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation timestamp'
  }
};

UserProfile.init(fields, {
  sequelize,
  modelName: 'user_profile',
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'key']
    }
  ]
});

module.exports = exports = UserProfile;
