const sequelize = require('./index.js');
const { Model, DataTypes } = require("sequelize");

/**
 * TwinVideo Model
 * Tracks videos generated using digital twins
 */
class TwinVideo extends Model { }

const fields = {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Video ID'
  },
  twin_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'Digital twin ID used'
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'User ID who generated this video'
  },
  conversation_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Conversation ID where video was generated'
  },
  
  // Input data
  script: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Text script for the video'
  },
  audio_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to generated audio file (TTS output)'
  },
  audio_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Public URL of audio file'
  },
  
  // Output data
  video_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to generated video file'
  },
  video_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Public URL of video file'
  },
  video_filename: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Video filename'
  },
  
  // Generation settings
  background: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Background scene used'
  },
  style: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Video style used'
  },
  duration_seconds: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Video duration in seconds'
  },
  
  // Processing info
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Video generation status'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Error message if generation failed'
  },
  processing_time_ms: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: 'Processing time in milliseconds'
  },
  
  // Metadata
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata (model version, parameters, etc.)'
  },
  
  // Timestamps
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation time'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Last update time'
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Completion time'
  }
};

TwinVideo.init(fields, {
  sequelize,
  modelName: 'twin_video',
  tableName: 'twin_videos',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = exports = TwinVideo;
