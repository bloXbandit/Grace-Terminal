const sequelize = require('./index.js');
const { Model, DataTypes } = require("sequelize");

/**
 * DigitalTwin Model
 * Stores user's digital twin profiles for video generation
 */
class DigitalTwin extends Model { }

const fields = {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'Digital twin ID'
  },
  user_id: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    comment: 'User ID who owns this twin'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Twin name (e.g., "My Professional Twin", "Casual Me")'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Twin description and use case'
  },
  
  // Face data
  face_image_path: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Path to reference face image'
  },
  face_image_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Public URL of face image (for API calls)'
  },
  
  // Voice data (optional, for future voice cloning)
  voice_sample_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Path to voice sample audio file'
  },
  voice_sample_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Public URL of voice sample'
  },
  voice_clone_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Voice clone ID from TTS service (e.g., ElevenLabs)'
  },
  
  // Twin characteristics
  traits: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'JSON object with twin traits: {age, gender, ethnicity, style, personality}'
  },
  
  // Generation settings
  default_background: {
    type: DataTypes.STRING(200),
    allowNull: true,
    defaultValue: 'office',
    comment: 'Default background scene (office, studio, outdoor, etc.)'
  },
  default_style: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'professional',
    comment: 'Default video style (professional, casual, energetic, etc.)'
  },
  
  // Hugging Face integration
  hf_space_id: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Duplicated Hugging Face space ID for this twin'
  },
  hf_model_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'sadtalker',
    comment: 'Model type: sadtalker, wav2lip, etc.'
  },
  
  // Usage stats
  videos_generated: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total videos generated with this twin'
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time this twin was used'
  },
  
  // Status
  status: {
    type: DataTypes.ENUM('active', 'processing', 'failed', 'archived'),
    allowNull: false,
    defaultValue: 'processing',
    comment: 'Twin status: active (ready), processing (being created), failed, archived'
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Is this the user\'s default twin?'
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
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Soft delete timestamp'
  }
};

DigitalTwin.init(fields, {
  sequelize,
  modelName: 'digital_twin',
  tableName: 'digital_twins',
  timestamps: true,
  paranoid: true, // Enables soft deletes
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at'
});

module.exports = exports = DigitalTwin;
