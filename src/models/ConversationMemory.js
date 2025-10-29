const { Model, DataTypes } = require('sequelize');

/**
 * ConversationMemory Model
 * Stores summarized conversation segments for long-context retrieval
 */
class ConversationMemory extends Model {}

const fields = {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  conversation_id: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'Foreign key to conversations table'
  },
  memory_type: {
    type: DataTypes.ENUM('summary', 'key_fact', 'decision', 'context'),
    allowNull: false,
    defaultValue: 'summary',
    comment: 'Type of memory: summary (compressed messages), key_fact (important info), decision (user choices), context (background)'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'The summarized or extracted content'
  },
  message_range_start: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Starting message ID for this summary'
  },
  message_range_end: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Ending message ID for this summary'
  },
  importance_score: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.5,
    comment: 'Importance score 0-1 for retrieval ranking'
  },
  embedding: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: 'JSON-encoded embedding vector for semantic search'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata (topics, entities, etc.)'
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
  tableName: 'conversation_memories',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['conversation_id']
    },
    {
      fields: ['memory_type']
    },
    {
      fields: ['importance_score']
    }
  ]
};

const sequelize = require('./index');

ConversationMemory.init(fields, {
  ...options,
  sequelize
});

module.exports = ConversationMemory;
