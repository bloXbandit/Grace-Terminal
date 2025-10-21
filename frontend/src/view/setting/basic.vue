<template>
  <div class="user-settings">
    <h2>{{ $t(`setting.basic.title`) }}</h2>

    <!-- Language Settings -->
    <div class="setting-section">
      <langService/>
    </div>

    <!-- User Profile Settings -->
    <div class="setting-section">
      <h3>👤 User Profile</h3>
      <p class="section-description">Help Grace understand you better</p>
      
      <div class="profile-form">
        <div class="form-group">
          <label for="name">Preferred Name *</label>
          <a-input
            id="name"
            v-model:value="profile.name"
            placeholder="What should Grace call you?"
            @blur="saveField('name')"
          />
          <span class="field-hint">This is how Grace will address you</span>
        </div>

        <div class="form-group">
          <label for="profession">Profession *</label>
          <a-input
            id="profession"
            v-model:value="profile.profession"
            placeholder="e.g., Software Developer, Designer, Student"
            @blur="saveField('profession')"
          />
          <span class="field-hint">Helps Grace tailor technical explanations</span>
        </div>

        <div class="form-group">
          <label for="expertise_level">Expertise Level *</label>
          <a-select
            id="expertise_level"
            v-model:value="profile.expertise_level"
            placeholder="Select level..."
            @change="saveField('expertise_level')"
            style="width: 100%"
          >
            <a-select-option value="beginner">Beginner</a-select-option>
            <a-select-option value="intermediate">Intermediate</a-select-option>
            <a-select-option value="advanced">Advanced</a-select-option>
            <a-select-option value="expert">Expert</a-select-option>
          </a-select>
          <span class="field-hint">How Grace adjusts complexity</span>
        </div>

        <div class="form-group">
          <label for="interests">Interests & Technologies</label>
          <a-textarea
            id="interests"
            v-model:value="profile.interests"
            placeholder="e.g., React, Python, AI/ML, Web3, Mobile Development"
            :rows="3"
            @blur="saveField('interests')"
          />
          <span class="field-hint">Technologies and topics you're interested in</span>
        </div>

        <div class="form-group">
          <label for="goals">Current Goals</label>
          <a-textarea
            id="goals"
            v-model:value="profile.goals"
            placeholder="e.g., Build a SaaS product, Learn React, Launch a startup"
            :rows="3"
            @blur="saveField('goals')"
          />
          <span class="field-hint">What you're working towards</span>
        </div>

        <div class="form-group">
          <label for="location">Location</label>
          <a-input
            id="location"
            v-model:value="profile.location"
            placeholder="e.g., San Francisco, Remote"
            @blur="saveField('location')"
          />
          <span class="field-hint">For time zone context</span>
        </div>

        <div class="form-actions">
          <a-button type="primary" @click="saveAll" :loading="saving">
            💾 Save All Changes
          </a-button>
          <a-button @click="loadProfile">
            🔄 Refresh
          </a-button>
        </div>
      </div>
    </div>

    <!-- Developer Mode Settings -->
    <div class="setting-section">
      <h3>🔧 Developer Mode</h3>
      <p class="section-description">Advanced feature for modifying Grace's code and capabilities</p>
      
      <div class="dev-mode-toggle">
        <a-switch 
          v-model:checked="devModeEnabled" 
          @change="toggleDevMode"
          :loading="devModeLoading"
        />
        <span class="toggle-label">
          {{ devModeEnabled ? '🔥 Dev Mode Active' : '🔒 Dev Mode Disabled' }}
        </span>
      </div>

      <div class="dev-mode-info" v-if="devModeEnabled">
        <div class="warning-box">
          <strong>⚠️ Advanced Feature:</strong> When enabled, Grace can modify her own code, prompts, and capabilities.
        </div>
        <div class="capabilities-list">
          <strong>Capabilities when enabled:</strong>
          <ul>
            <li>✅ Modify source code and prompts</li>
            <li>✅ Add new tools and capabilities</li>
            <li>✅ Fix bugs in her own logic</li>
            <li>✅ Update routing and configurations</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import langService from '@/components/lang/index.vue'
import http from '@/utils/http'

const saving = ref(false)
const devModeEnabled = ref(false)
const devModeLoading = ref(false)

const profile = ref({
  name: '',
  profession: '',
  expertise_level: '',
  interests: '',
  goals: '',
  location: ''
})

// Load profile from backend
const loadProfile = async () => {
  try {
    const response = await http.get('/api/users/profile')
    
    if (response.data && response.data.success) {
      // Populate form fields
      response.data.profile.forEach(item => {
        if (profile.value.hasOwnProperty(item.key)) {
          profile.value[item.key] = item.value
        }
      })
    }
  } catch (error) {
    console.error('Failed to load profile:', error)
  }
}

// Save individual field
const saveField = async (key) => {
  const value = profile.value[key]
  if (!value || value.trim() === '') return
  
  try {
    await http.post('/api/users/profile', {
      key,
      value: value.trim(),
      confidence: 1.0,
      source: 'settings'
    })
    
    message.success(`${key} saved successfully!`)
  } catch (error) {
    console.error('Failed to save field:', error)
    message.error(`Failed to save ${key}`)
  }
}

// Save all fields
const saveAll = async () => {
  saving.value = true
  try {
    for (const [key, value] of Object.entries(profile.value)) {
      if (value && value.trim() !== '') {
        await saveField(key)
      }
    }
    message.success('All profile settings saved successfully!')
  } catch (error) {
    console.error('Failed to save all:', error)
    message.error('Failed to save some settings')
  } finally {
    saving.value = false
  }
}

// Load dev mode status
const loadDevModeStatus = async () => {
  try {
    const conversationId = localStorage.getItem('current_conversation_id')
    if (!conversationId) return
    
    const response = await http.get(`/api/dev-mode/status?conversation_id=${conversationId}`)
    if (response.success) {
      devModeEnabled.value = response.enabled
    }
  } catch (error) {
    console.error('Failed to load dev mode status:', error)
  }
}

// Toggle dev mode
const toggleDevMode = async () => {
  devModeLoading.value = true
  try {
    const conversationId = localStorage.getItem('current_conversation_id')
    
    if (!conversationId) {
      message.warning('Please start a conversation first')
      devModeEnabled.value = !devModeEnabled.value // Revert
      return
    }
    
    const endpoint = devModeEnabled.value ? '/api/dev-mode/enable' : '/api/dev-mode/disable'
    const response = await http.post(endpoint, { conversation_id: conversationId })
    
    if (response.success) {
      const status = devModeEnabled.value ? '🔥 Dev Mode Activated' : '🔒 Dev Mode Disabled'
      message.success(`${status}\n\n${response.message}`)
    } else {
      message.error(`Failed to toggle dev mode: ${response.message}`)
      devModeEnabled.value = !devModeEnabled.value // Revert
    }
  } catch (error) {
    console.error('Failed to toggle dev mode:', error)
    message.error('Failed to toggle dev mode')
    devModeEnabled.value = !devModeEnabled.value // Revert
  } finally {
    devModeLoading.value = false
  }
}

// Load profile on component mount
onMounted(() => {
  loadProfile()
  loadDevModeStatus()
})
</script>

<style scoped>
.user-settings {
  padding: 16px;
  max-width: 800px;
}

.setting-section {
  margin-bottom: 32px;
  padding: 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.setting-section h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.section-description {
  margin: 0 0 20px 0;
  color: #6b7280;
  font-size: 14px;
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 500;
  color: #374151;
  font-size: 14px;
}

.field-hint {
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}

.form-actions .ant-btn {
  height: 40px;
  border-radius: 6px;
  font-weight: 500;
}

.form-actions .ant-btn-primary {
  background: #3b82f6;
  border-color: #3b82f6;
}

.form-actions .ant-btn-primary:hover {
  background: #2563eb;
  border-color: #2563eb;
}

/* Dev Mode Styles */
.dev-mode-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.dev-mode-toggle .toggle-label {
  font-weight: 500;
  font-size: 14px;
  color: #374151;
}

.dev-mode-info {
  margin-top: 16px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.warning-box {
  padding: 12px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 6px;
  margin-bottom: 12px;
  color: #92400e;
  font-size: 13px;
}

.capabilities-list {
  font-size: 13px;
  color: #374151;
}

.capabilities-list ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.capabilities-list li {
  margin: 4px 0;
}

@media screen and (max-width: 768px) {
  h2 {
    display: none !important;
  }
  .user-settings {
    padding: 8px !important;
  }
  .setting-section {
    padding: 16px;
    margin-bottom: 16px;
  }
  .form-actions {
    flex-direction: column;
  }
}
</style>