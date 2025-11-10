// src/models/PricingTier.js

const sequelize = require('./index.js');
const { Model, DataTypes } = require('sequelize');

class PricingTier extends Model {}

const fields = {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  tier_name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Tier name (e.g., Free, Pro, Enterprise)'
  },
  price_monthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Monthly price in USD'
  },
  price_yearly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Yearly price in USD'
  },
  features: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'JSON array of features included in this tier'
  },
  max_conversations: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: -1,
    comment: 'Max conversations per month (-1 = unlimited)'
  },
  max_tokens: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: -1,
    comment: 'Max tokens per month (-1 = unlimited)'
  },
  dev_mode_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether dev mode is enabled for this tier'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this tier is currently available'
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Display order (lower = shown first)'
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

PricingTier.init(fields, {
  sequelize,
  modelName: 'pricing_tier',
  tableName: 'pricing_tiers',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = exports = PricingTier;

