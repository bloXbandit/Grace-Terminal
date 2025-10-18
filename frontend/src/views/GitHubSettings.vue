<template>
  <div class="github-settings">
    <div class="settings-header">
      <h1>🐙 GitHub Integration</h1>
      <p>Let Grace commit code directly to your repositories</p>
    </div>

    <div class="settings-content">
      <!-- Not Connected State -->
      <div v-if="!connected" class="connection-card">
        <div class="connection-icon">🔗</div>
        <h2>Connect Your GitHub Account</h2>
        <p>Grace can commit code changes, create files, and manage your repositories automatically.</p>
        
        <div class="benefits">
          <div class="benefit">
            <span class="benefit-icon">✅</span>
            <span>Auto-commit code changes</span>
          </div>
          <div class="benefit">
            <span class="benefit-icon">✅</span>
            <span>Create and update files</span>
          </div>
          <div class="benefit">
            <span class="benefit-icon">✅</span>
            <span>Full repository access</span>
          </div>
          <div class="benefit">
            <span class="benefit-icon">✅</span>
            <span>Secure OAuth authentication</span>
          </div>
        </div>

        <button @click="connectGitHub" class="btn-connect">
          <span class="github-logo">🐙</span>
          Connect GitHub
        </button>

        <p class="privacy-note">
          🔒 Your GitHub token is encrypted and stored securely. Grace only accesses repositories you authorize.
        </p>
      </div>

      <!-- Connected State -->
      <div v-else class="connected-state">
        <div class="connection-status">
          <img :src="status.avatar_url" alt="GitHub Avatar" class="github-avatar" />
          <div class="status-info">
            <h3>✅ Connected as @{{ status.github_username }}</h3>
            <p class="status-meta">
              Connected {{ formatDate(status.connected_at) }}
              <span v-if="status.last_used_at"> • Last used {{ formatDate(status.last_used_at) }}</span>
            </p>
          </div>
          <button @click="disconnect" class="btn-disconnect">Disconnect</button>
        </div>

        <div class="settings-section">
          <h2>Repository Settings</h2>
          
          <div class="form-group">
            <label for="default_repo">Default Repository</label>
            <select
              id="default_repo"
              v-model="settings.default_repo"
              @change="saveSettings"
            >
              <option value="">Select a repository...</option>
              <option
                v-for="repo in repositories"
                :key="repo.full_name"
                :value="repo.full_name"
              >
                {{ repo.full_name }} {{ repo.private ? '🔒' : '' }}
              </option>
            </select>
            <span class="field-hint">Grace will commit to this repository by default</span>
          </div>


          <div class="form-group">
            <label for="commit_template">Commit Message Template</label>
            <input
              id="commit_template"
              v-model="settings.commit_message_template"
              type="text"
              placeholder="🤖 Grace AI: {description}"
              @blur="saveSettings"
            />
            <span class="field-hint">Use {description} for the commit description, {files} for file list</span>
          </div>
        </div>

        <div class="settings-section">
          <h2>Your Repositories</h2>
          <div class="repositories-list">
            <div v-if="loadingRepos" class="loading">Loading repositories...</div>
            <div v-else-if="repositories.length === 0" class="no-repos">
              No repositories found
            </div>
            <div
              v-else
              v-for="repo in repositories"
              :key="repo.full_name"
              class="repo-item"
            >
              <div class="repo-info">
                <div class="repo-name">
                  {{ repo.name }}
                  <span v-if="repo.private" class="repo-badge">Private</span>
                </div>
                <div class="repo-description">{{ repo.description || 'No description' }}</div>
              </div>
              <a :href="repo.url" target="_blank" class="repo-link">
                View on GitHub →
              </a>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2>How It Works</h2>
          <div class="how-it-works">
            <div class="step">
              <div class="step-number">1</div>
              <div class="step-content">
                <h4>Grace Creates Code</h4>
                <p>When you ask Grace to build something, she writes the code locally</p>
              </div>
            </div>
            <div class="step">
              <div class="step-number">2</div>
              <div class="step-content">
                <h4>You Request Commit</h4>
                <p>Say "commit this to GitHub" or "push this to my repo" when ready</p>
              </div>
            </div>
            <div class="step">
              <div class="step-number">3</div>
              <div class="step-content">
                <h4>Grace Commits</h4>
                <p>Grace commits the code to your repository with a descriptive message</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { request } from '@/utils/request';

const connected = ref(false);
const status = ref({});
const settings = ref({
  default_repo: '',
  auto_commit: false,
  commit_message_template: '🤖 Grace AI: {description}'
});
const repositories = ref([]);
const loadingRepos = ref(false);

// Load GitHub status
const loadStatus = async () => {
  try {
    const response = await request({
      url: '/api/users/github/status',
      method: 'GET'
    });
    
    if (response.success && response.connected) {
      connected.value = true;
      status.value = response;
      settings.value = {
        default_repo: response.default_repo || '',
        auto_commit: response.auto_commit || false,
        commit_message_template: response.commit_message_template || '🤖 Grace AI: {description}'
      };
      
      // Load repositories
      loadRepositories();
    }
  } catch (error) {
    console.error('Failed to load GitHub status:', error);
  }
};

// Load repositories
const loadRepositories = async () => {
  loadingRepos.value = true;
  try {
    const response = await request({
      url: '/api/users/github/repositories',
      method: 'GET'
    });
    
    if (response.success) {
      repositories.value = response.repositories;
    }
  } catch (error) {
    console.error('Failed to load repositories:', error);
  } finally {
    loadingRepos.value = false;
  }
};

// Connect GitHub
const connectGitHub = () => {
  const width = 600;
  const height = 700;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  const popup = window.open(
    '/api/users/github/connect',
    'GitHub OAuth',
    `width=${width},height=${height},left=${left},top=${top}`
  );
  
  // Listen for success message
  const handleMessage = (event) => {
    if (event.data.type === 'github-connected') {
      window.removeEventListener('message', handleMessage);
      loadStatus();
    }
  };
  
  window.addEventListener('message', handleMessage);
};

// Disconnect GitHub
const disconnect = async () => {
  if (!confirm('Are you sure you want to disconnect GitHub?')) {
    return;
  }
  
  try {
    await request({
      url: '/api/users/github/disconnect',
      method: 'POST'
    });
    
    connected.value = false;
    status.value = {};
    repositories.value = [];
  } catch (error) {
    console.error('Failed to disconnect GitHub:', error);
    alert('Failed to disconnect GitHub');
  }
};

// Save settings
const saveSettings = async () => {
  try {
    await request({
      url: '/api/users/github/settings',
      method: 'POST',
      data: settings.value
    });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};

// Format date
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return date.toLocaleDateString();
};

onMounted(() => {
  loadStatus();
});
</script>

<style scoped>
.github-settings {
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
}

.settings-header {
  margin-bottom: 40px;
}

.settings-header h1 {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #1a1a1a;
}

.settings-header p {
  font-size: 16px;
  color: #666;
}

.settings-content {
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.connection-card {
  text-align: center;
  padding: 40px 20px;
}

.connection-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.connection-card h2 {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #333;
}

.connection-card > p {
  font-size: 16px;
  color: #666;
  margin-bottom: 32px;
}

.benefits {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.benefit {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #444;
}

.benefit-icon {
  font-size: 18px;
}

.btn-connect {
  background: #24292e;
  color: white;
  padding: 16px 32px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s;
}

.btn-connect:hover {
  background: #1b1f23;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(36, 41, 46, 0.3);
}

.github-logo {
  font-size: 24px;
}

.privacy-note {
  margin-top: 24px;
  font-size: 13px;
  color: #888;
}

.connected-state {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #f8f9ff;
  border-radius: 12px;
  border: 2px solid #e5e7ff;
}

.github-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.status-info {
  flex: 1;
}

.status-info h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #333;
}

.status-meta {
  font-size: 13px;
  color: #666;
}

.btn-disconnect {
  padding: 10px 20px;
  background: #fff;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-disconnect:hover {
  border-color: #ff4444;
  color: #ff4444;
  background: #fff5f5;
}

.settings-section {
  padding-top: 32px;
  border-top: 1px solid #e5e5e5;
}

.settings-section:first-child {
  padding-top: 0;
  border-top: none;
}

.settings-section h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 20px;
  color: #333;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #444;
  font-size: 14px;
}

.form-group input[type="text"],
.form-group select {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #667eea;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.field-hint {
  display: block;
  font-size: 12px;
  color: #888;
  margin-top: 6px;
}

.repositories-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loading,
.no-repos {
  padding: 24px;
  text-align: center;
  color: #888;
  background: #f9f9f9;
  border-radius: 8px;
}

.repo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #f9f9f9;
  border-radius: 8px;
  transition: background 0.2s;
}

.repo-item:hover {
  background: #f0f0f0;
}

.repo-info {
  flex: 1;
}

.repo-name {
  font-weight: 600;
  font-size: 15px;
  color: #333;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.repo-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: #ffd43b;
  color: #333;
  border-radius: 4px;
  font-weight: 500;
}

.repo-description {
  font-size: 13px;
  color: #666;
}

.repo-link {
  font-size: 14px;
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

.repo-link:hover {
  text-decoration: underline;
}

.how-it-works {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.step-number {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.step-content h4 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #333;
}

.step-content p {
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}
</style>
