const router = require("koa-router")();
const axios = require('axios');
const {
  saveGitHubConnection,
  getGitHubConnection,
  disconnectGitHub,
  updateGitHubSettings,
  listRepositories
} = require('@src/services/github');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:5005/api/users/github/callback';

/**
 * Initiate GitHub OAuth flow
 */
router.get("/github/connect", async (ctx) => {
  const user_id = ctx.state.user.id;
  
  // Store user_id in session for callback
  ctx.session.github_oauth_user_id = user_id;
  
  const scopes = [
    'repo',      // Full control of repositories
    'user:email' // Read user email
  ].join(' ');
  
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${encodeURIComponent(scopes)}&state=${user_id}`;
  
  ctx.redirect(authUrl);
});

/**
 * GitHub OAuth callback
 */
router.get("/github/callback", async (ctx) => {
  try {
    const { code, state } = ctx.query;
    const user_id = parseInt(state) || ctx.session.github_oauth_user_id;
    
    if (!code) {
      ctx.body = '<html><body><script>window.close();</script><p>Authorization cancelled</p></body></html>';
      return;
    }
    
    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL
      },
      {
        headers: { Accept: 'application/json' }
      }
    );
    
    const { access_token, scope } = tokenResponse.data;
    
    if (!access_token) {
      throw new Error('Failed to get access token');
    }
    
    // Get user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json'
      }
    });
    
    const githubUser = userResponse.data;
    
    // Save connection
    await saveGitHubConnection(user_id, {
      access_token,
      username: githubUser.login,
      user_id: githubUser.id,
      avatar_url: githubUser.avatar_url,
      email: githubUser.email,
      scopes: scope ? scope.split(',') : []
    });
    
    // Close popup and refresh parent
    ctx.body = `
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'github-connected' }, '*');
              window.close();
            } else {
              window.location.href = '/settings/github';
            }
          </script>
          <p>✅ GitHub connected! You can close this window.</p>
        </body>
      </html>
    `;
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    ctx.body = `
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'github-error', error: '${error.message}' }, '*');
              window.close();
            }
          </script>
          <p>❌ Error connecting GitHub: ${error.message}</p>
        </body>
      </html>
    `;
  }
});

/**
 * Get GitHub connection status
 */
router.get("/github/status", async (ctx) => {
  try {
    const user_id = ctx.state.user.id;
    const connection = await getGitHubConnection(user_id);
    
    if (!connection) {
      ctx.body = {
        success: true,
        connected: false
      };
      return;
    }
    
    ctx.body = {
      success: true,
      connected: true,
      github_username: connection.github_username,
      avatar_url: connection.avatar_url,
      email: connection.email,
      default_repo: connection.default_repo,
      auto_commit: connection.auto_commit,
      commit_message_template: connection.commit_message_template,
      connected_at: connection.connected_at,
      last_used_at: connection.last_used_at
    };
  } catch (error) {
    console.error('Error getting GitHub status:', error);
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

/**
 * Update GitHub settings
 */
router.post("/github/settings", async (ctx) => {
  try {
    const user_id = ctx.state.user.id;
    const settings = ctx.request.body;
    
    await updateGitHubSettings(user_id, settings);
    
    ctx.body = {
      success: true,
      message: 'Settings updated'
    };
  } catch (error) {
    console.error('Error updating GitHub settings:', error);
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

/**
 * List repositories
 */
router.get("/github/repositories", async (ctx) => {
  try {
    const user_id = ctx.state.user.id;
    const repos = await listRepositories(user_id);
    
    ctx.body = {
      success: true,
      repositories: repos
    };
  } catch (error) {
    console.error('Error listing repositories:', error);
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

/**
 * Disconnect GitHub
 */
router.post("/github/disconnect", async (ctx) => {
  try {
    const user_id = ctx.state.user.id;
    await disconnectGitHub(user_id);
    
    ctx.body = {
      success: true,
      message: 'GitHub disconnected'
    };
  } catch (error) {
    console.error('Error disconnecting GitHub:', error);
    ctx.body = {
      success: false,
      error: error.message
    };
  }
});

module.exports = router;
