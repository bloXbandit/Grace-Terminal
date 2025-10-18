const { getGitHubConnection, createCommit } = require('@src/services/github');

const GitCommitTool = {
  name: "git_commit",
  description: "Commit code changes to user's GitHub repository. ONLY use this tool when the user EXPLICITLY asks you to commit to GitHub, create a git repo, or mentions GitHub/git. Do NOT use this tool automatically - only when requested. Requires user to have GitHub connected in settings.",
  params: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description: "Array of files to commit. Each file should have 'path' and 'content' properties.",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File path relative to repository root (e.g., 'src/App.js')"
            },
            content: {
              type: "string",
              description: "Complete file content"
            }
          },
          required: ["path", "content"]
        }
      },
      message: {
        type: "string",
        description: "Commit message describing the changes"
      },
      repository: {
        type: "string",
        description: "Repository in format 'owner/repo'. If not provided, uses user's default repository."
      },
      branch: {
        type: "string",
        description: "Branch name. Defaults to 'main'."
      }
    },
    required: ["files", "message"]
  },
  
  async execute(params, context = {}) {
    const { files, message, repository, branch = 'main' } = params;
    const { user_id } = context;

    try {
      if (!user_id) {
        return {
          success: false,
          error: "user_id required in context"
        };
      }

      // Check if GitHub is connected
      const connection = await getGitHubConnection(user_id);
      if (!connection) {
        return {
          success: false,
          error: "github_not_connected",
          message: `❌ **GitHub Not Connected**

To commit code to GitHub, please connect your GitHub account:

1. Go to Settings → GitHub
2. Click "Connect GitHub"
3. Authorize Grace AI

Once connected, I can commit code changes directly to your repositories!`
        };
      }

      // Determine repository
      let owner, repo;
      if (repository) {
        [owner, repo] = repository.split('/');
      } else if (connection.default_repo) {
        [owner, repo] = connection.default_repo.split('/');
      } else {
        return {
          success: false,
          error: "no_repository",
          message: `❌ **No Repository Specified**

Please either:
1. Specify a repository: "owner/repo"
2. Set a default repository in Settings → GitHub

Example: "Commit to myusername/myproject"`
        };
      }

      if (!owner || !repo) {
        return {
          success: false,
          error: "Invalid repository format. Use 'owner/repo'"
        };
      }

      console.log(`🔧 [GitCommit] Committing ${files.length} files to ${owner}/${repo}`);

      // Create commit
      const result = await createCommit(user_id, {
        owner,
        repo,
        branch,
        message,
        files
      });

      return {
        success: true,
        commit_sha: result.commit_sha,
        commit_url: result.commit_url,
        message: `✅ **Committed to GitHub!**

**Repository:** ${owner}/${repo}
**Branch:** ${branch}
**Files:** ${files.map(f => f.path).join(', ')}
**Commit:** [${result.commit_sha.substring(0, 7)}](${result.commit_url})

Your changes are now live on GitHub! 🎉`
      };
    } catch (error) {
      console.error('❌ [GitCommit] Error:', error);
      
      // Handle common errors
      if (error.message.includes('Not Found')) {
        return {
          success: false,
          error: "repository_not_found",
          message: `❌ Repository not found or you don't have access.

Make sure:
1. The repository exists
2. You have write access
3. The repository name is correct (owner/repo)`
        };
      }

      if (error.message.includes('Bad credentials')) {
        return {
          success: false,
          error: "invalid_token",
          message: `❌ GitHub token expired or invalid.

Please reconnect your GitHub account:
1. Go to Settings → GitHub
2. Click "Disconnect"
3. Click "Connect GitHub" again`
        };
      }

      return {
        success: false,
        error: error.message,
        message: `❌ Failed to commit: ${error.message}`
      };
    }
  }
};

module.exports = GitCommitTool;
