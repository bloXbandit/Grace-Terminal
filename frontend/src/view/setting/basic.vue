<template>
  <div class="user-settings">
    <h2>{{ $t(`setting.basic.title`) }}</h2>

    <!-- Language Settings -->
    <div class="setting-section">
      <langService/>
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

const devModeEnabled = ref(false)
const devModeLoading = ref(false)

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

onMounted(() => {
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