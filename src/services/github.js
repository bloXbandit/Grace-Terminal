const GitHubConnection = require('@src/models/GitHubConnection');
const crypto = require('crypto');
const { Octokit } = require('@octokit/rest');

// Encryption key from environment
const ENCRYPTION_KEY = process.env.GITHUB_TOKEN_ENCRYPTION_KEY || 'change-this-to-32-char-secret!!';

/**
 * Encrypt token for storage
 */
const encryptToken = (token) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

/**
 * Decrypt token from storage
 */
const decryptToken = (encryptedToken) => {
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

/**
 * Save GitHub connection
 */
const saveGitHubConnection = async (user_id, githubData) => {
  try {
    const {
      access_token,
      refresh_token,
      username,
      user_id: github_user_id,
      avatar_url,
      email,
      scopes
    } = githubData;

    const encryptedAccessToken = encryptToken(access_token);
    const encryptedRefreshToken = refresh_token ? encryptToken(refresh_token) : null;

    const [connection, created] = await GitHubConnection.findOrCreate({
      where: { user_id },
      defaults: {
        user_id,
        github_username: username,
        github_user_id: String(github_user_id),
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        scopes: scopes ? scopes.join(',') : '',
        avatar_url,
        email,
        connected_at: new Date()
      }
    });

    if (!created) {
      // Update existing connection
      connection.github_username = username;
      connection.github_user_id = String(github_user_id);
      connection.access_token = encryptedAccessToken;
      connection.refresh_token = encryptedRefreshToken;
      connection.scopes = scopes ? scopes.join(',') : '';
      connection.avatar_url = avatar_url;
      connection.email = email;
      await connection.save();
    }

    return connection;
  } catch (error) {
    console.error('Error saving GitHub connection:', error);
    throw error;
  }
};

/**
 * Get GitHub connection for user
 */
const getGitHubConnection = async (user_id) => {
  try {
    return await GitHubConnection.findOne({
      where: { user_id }
    });
  } catch (error) {
    console.error('Error getting GitHub connection:', error);
    return null;
  }
};

/**
 * Get Octokit instance for user
 */
const getOctokit = async (user_id) => {
  const connection = await getGitHubConnection(user_id);
  if (!connection) {
    throw new Error('GitHub not connected');
  }

  const accessToken = decryptToken(connection.access_token);
  
  return new Octokit({
    auth: accessToken
  });
};

/**
 * Disconnect GitHub
 */
const disconnectGitHub = async (user_id) => {
  try {
    await GitHubConnection.destroy({
      where: { user_id }
    });
    return true;
  } catch (error) {
    console.error('Error disconnecting GitHub:', error);
    return false;
  }
};

/**
 * Update GitHub settings
 */
const updateGitHubSettings = async (user_id, settings) => {
  try {
    const connection = await getGitHubConnection(user_id);
    if (!connection) {
      throw new Error('GitHub not connected');
    }

    if (settings.default_repo !== undefined) {
      connection.default_repo = settings.default_repo;
    }
    if (settings.auto_commit !== undefined) {
      connection.auto_commit = settings.auto_commit;
    }
    if (settings.commit_message_template !== undefined) {
      connection.commit_message_template = settings.commit_message_template;
    }

    await connection.save();
    return connection;
  } catch (error) {
    console.error('Error updating GitHub settings:', error);
    throw error;
  }
};

/**
 * Create a commit
 */
const createCommit = async (user_id, options) => {
  try {
    const connection = await getGitHubConnection(user_id);
    if (!connection) {
      throw new Error('GitHub not connected');
    }

    const octokit = await getOctokit(user_id);
    const {
      owner,
      repo,
      branch = 'main',
      message,
      files // Array of { path, content }
    } = options;

    // Get current commit SHA
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    const currentCommitSha = refData.object.sha;

    // Get current tree
    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha
    });
    const currentTreeSha = commitData.tree.sha;

    // Create blobs for each file
    const blobs = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64'
        });
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blob.sha
        };
      })
    );

    // Create new tree
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree: blobs
    });

    // Apply commit message template
    const commitMessage = connection.commit_message_template
      .replace('{description}', message)
      .replace('{files}', files.map(f => f.path).join(', '));

    // Create commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha]
    });

    // Update reference
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha
    });

    // Update last_used_at
    connection.last_used_at = new Date();
    await connection.save();

    return {
      success: true,
      commit_sha: newCommit.sha,
      commit_url: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`
    };
  } catch (error) {
    console.error('Error creating commit:', error);
    throw error;
  }
};

/**
 * List user repositories
 */
const listRepositories = async (user_id) => {
  try {
    const octokit = await getOctokit(user_id);
    
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100
    });

    return repos.map(repo => ({
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      url: repo.html_url,
      default_branch: repo.default_branch
    }));
  } catch (error) {
    console.error('Error listing repositories:', error);
    throw error;
  }
};

module.exports = {
  saveGitHubConnection,
  getGitHubConnection,
  getOctokit,
  disconnectGitHub,
  updateGitHubSettings,
  createCommit,
  listRepositories
};
