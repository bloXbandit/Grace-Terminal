// src/models/UserSubscription.js

const sequelize = require('./index.js');
const { Model, DataTypes } = require('sequelize');

class UserSubscription extends Model {}

const fields = {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'Foreign key to users table'
  },
  tier_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: 'Foreign key to pricing_tiers table'
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  status: {
    type: DataTypes.ENUM('active', 'cancelled', 'expired', 'trial'),
    allowNull: false,
    defaultValue: 'trial'
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
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

UserSubscription.init(fields, {
  sequelize,
  modelName: 'user_subscription',
  tableName: 'user_subscriptions',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = exports = UserSubscription;

