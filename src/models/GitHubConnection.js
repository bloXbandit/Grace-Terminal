const sequelize = require('./index.js');
const { Model, DataTypes } = require("sequelize");

class GitHubConnection extends Model { }

const fields = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    comment: 'GitHub connection ID'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'User ID this GitHub account belongs to'
  },
  github_username: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'GitHub username'
  },
  github_user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'GitHub user ID'
  },
  access_token: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Encrypted GitHub access token'
  },
  refresh_token: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Encrypted GitHub refresh token'
  },
  token_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Token expiration date'
  },
  scopes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Granted OAuth scopes (comma-separated)'
  },
  avatar_url: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'GitHub avatar URL'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'GitHub email'
  },
  default_repo: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Default repository for commits (owner/repo)'
  },
  auto_commit: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Auto-commit changes made by Grace'
  },
  commit_message_template: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '🤖 Grace AI: {description}',
    comment: 'Template for commit messages'
  },
  connected_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When GitHub was connected'
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last time GitHub integration was used'
  }
};

GitHubConnection.init(fields, {
  sequelize,
  modelName: 'github_connection',
  indexes: [
    {
      unique: true,
      fields: ['user_id']
    },
    {
      fields: ['github_user_id']
    }
  ]
});

module.exports = exports = GitHubConnection;
