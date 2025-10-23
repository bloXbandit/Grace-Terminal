thats not it<template>
  <div class="routing-preferences">
    <div class="settings-header">
      <h1>🎯 Routing Preferences</h1>
      <p>Customize how Grace routes different types of tasks to AI specialists</p>
    </div>

    <div class="settings-content">
      <a-spin :spinning="loading">
        <div class="preferences-section">
          <h2>Task Routing Configuration</h2>
          <p class="section-description">
            Configure which AI models Grace uses for different types of tasks. 
            This allows you to optimize performance and cost based on your preferences.
          </p>

          <div class="preferences-grid">
            <div 
              v-for="taskType in availableTaskTypes" 
              :key="taskType.key"
              class="preference-card"
            >
              <div class="task-header">
                <h3>{{ taskType.name }}</h3>
                <p class="task-description">{{ taskType.description }}</p>
              </div>

              <div class="model-selection">
                <div class="model-field">
                  <label>Primary Model</label>
                  <a-select
                    :value="preferences[taskType.key]?.primary_model"
                    :placeholder="getDefaultModel(taskType.key, 'primary')"
                    @change="updatePreference(taskType.key, 'primary_model', $event)"
                    style="width: 100%"
                  >
                    <a-select-option 
                      v-for="model in availableModels" 
                      :key="model.key" 
                      :value="model.key"
                    >
                      {{ model.name }}
                    </a-select-option>
                  </a-select>
                </div>

                <div class="model-field">
                  <label>Fallback Model</label>
                  <a-select
                    :value="preferences[taskType.key]?.fallback_model"
                    :placeholder="getDefaultModel(taskType.key, 'fallback')"
                    @change="updatePreference(taskType.key, 'fallback_model', $event)"
                    style="width: 100%"
                  >
                    <a-select-option 
                      v-for="model in availableModels" 
                      :key="model.key" 
                      :value="model.key"
                    >
                      {{ model.name }}
                    </a-select-option>
                  </a-select>
                </div>
              </div>

              <div class="preference-actions">
                <a-button 
                  size="small" 
                  @click="resetToDefault(taskType.key)"
                  :disabled="!hasCustomPreference(taskType.key)"
                >
                  Reset to Default
                </a-button>
              </div>
            </div>
          </div>

          <div class="global-actions">
            <a-button type="primary" @click="saveAllPreferences" :loading="saving">
              Save All Preferences
            </a-button>
            <a-button @click="resetAllToDefaults" style="margin-left: 12px">
              Reset All to Defaults
            </a-button>
          </div>
        </div>
      </a-spin>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import http from '@/utils/http'

const loading = ref(false)
const saving = ref(false)
const preferences = reactive({})

// Available task types with descriptions
const availableTaskTypes = ref([
  { key: 'code_generation', name: 'Code Generation', description: 'Writing, creating, and generating code' },
  { key: 'code_review', name: 'Code Review', description: 'Analyzing and reviewing existing code' },
  { key: 'debugging', name: 'Debugging', description: 'Finding and fixing bugs in code' },
  { key: 'data_analysis', name: 'Data Analysis', description: 'Processing and analyzing data' },
  { key: 'creative_writing', name: 'Creative Writing', description: 'Creative content and storytelling' },
  { key: 'technical_writing', name: 'Technical Writing', description: 'Documentation and technical content' },
  { key: 'web_research', name: 'Web Research', description: 'Online research and information gathering' },
  { key: 'system_design', name: 'System Design', description: 'Architecture and system design' },
  { key: 'general_chat', name: 'General Chat', description: 'Casual conversation and Q&A' }
])

// Available models (matching backend routing.config.js)
const availableModels = ref([
  // OpenAI Models
  { key: 'openai/gpt-5-pro', name: 'GPT-5 Pro (OpenAI)' },
  { key: 'openai/gpt-4o', name: 'GPT-4o (OpenAI)' },
  { key: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (OpenAI)' },
  { key: 'openai/o1-preview', name: 'GPT-o1 Preview (OpenAI)' },
  
  // Anthropic Models
  { key: 'openrouter/anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
  { key: 'openrouter/anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { key: 'openrouter/anthropic/claude-3-opus', name: 'Claude 3 Opus' },
  
  // DeepSeek Models
  { key: 'openrouter/deepseek/deepseek-r1', name: 'DeepSeek R1 (Reasoning)' },
  { key: 'openrouter/deepseek/deepseek-coder', name: 'DeepSeek Coder' },
  { key: 'openrouter/deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  
  // Qwen Models
  { key: 'openrouter/qwen/qwen3-coder-30b-a3b-instruct', name: 'Qwen3 Coder 30B' },
  { key: 'openrouter/qwen/qwen3-30b-a3b', name: 'Qwen3 30B' },
  
  // GLM Models
  { key: 'openrouter/zhipu/glm-4-plus', name: 'GLM-4 Plus' },
  { key: 'openrouter/z-ai/glm-4.6', name: 'GLM-4.6' },
  
  // Other Models
  { key: 'openrouter/openai/gpt-oss-20b', name: 'GPT OSS 20B' },
  { key: 'openrouter/microsoft/phi-4', name: 'Phi-4 (Microsoft)' },
  { key: 'openrouter/google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
  { key: 'openrouter/meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
  { key: 'openrouter/gryphe/mythomax-l2-13b', name: 'MythoMax L2 13B (Creative)' }
])

// Default routing configuration (matching backend routing.config.js exactly)
const defaultRouting = {
  'code_generation': { primary: 'openrouter/anthropic/claude-sonnet-4.5', fallback: 'openai/gpt-5-pro' },
  'code_review': { primary: 'openrouter/deepseek/deepseek-coder', fallback: 'openrouter/anthropic/claude-3-opus' },
  'debugging': { primary: 'openrouter/deepseek/deepseek-r1', fallback: 'openrouter/deepseek/deepseek-coder' },
  'data_analysis': { primary: 'openrouter/z-ai/glm-4.6', fallback: 'openai/gpt-5-pro' },
  'creative_writing': { primary: 'openrouter/gryphe/mythomax-l2-13b', fallback: 'openrouter/anthropic/claude-sonnet-4.5' },
  'technical_writing': { primary: 'openrouter/anthropic/claude-sonnet-4.5', fallback: 'openai/gpt-5-pro' },
  'web_research': { primary: 'openrouter/z-ai/glm-4.6', fallback: 'openai/gpt-5-pro' },
  'system_design': { primary: 'openrouter/z-ai/glm-4.6', fallback: 'openai/o1-preview' },
  'general_chat': { primary: 'openai/gpt-5-pro', fallback: 'openrouter/anthropic/claude-sonnet-4.5' }
}

// Load user preferences
const loadPreferences = async () => {
  loading.value = true
  try {
    const response = await http.get('/api/users/routing-preferences')
    if (response.data && response.data.preferences) {
      Object.assign(preferences, response.data.preferences)
    }
  } catch (error) {
    console.error('Failed to load routing preferences:', error)
    message.error('Failed to load preferences')
  } finally {
    loading.value = false
  }
}

// Get default model for a task type
const getDefaultModel = (taskType, modelType) => {
  const config = defaultRouting[taskType]
  if (!config) return 'Default'
  return availableModels.value.find(m => m.key === config[modelType])?.name || 'Default'
}

// Update a specific preference
const updatePreference = (taskType, field, value) => {
  if (!preferences[taskType]) {
    preferences[taskType] = {}
  }
  preferences[taskType][field] = value
}

// Check if task type has custom preference
const hasCustomPreference = (taskType) => {
  return preferences[taskType] && 
    (preferences[taskType].primary_model || preferences[taskType].fallback_model)
}

// Reset single task type to default
const resetToDefault = (taskType) => {
  if (preferences[taskType]) {
    delete preferences[taskType]
  }
  message.success(`Reset ${taskType} to default`)
}

// Reset all to defaults
const resetAllToDefaults = async () => {
  try {
    await http.delete('/api/users/routing-preferences')
    Object.keys(preferences).forEach(key => {
      delete preferences[key]
    })
    message.success('All routing preferences reset to defaults')
  } catch (error) {
    console.error('Failed to reset all preferences:', error)
    message.error('Failed to reset preferences')
  }
}

// Save all preferences
const saveAllPreferences = async () => {
  saving.value = true
  try {
    await http.post('/api/users/routing-preferences', {
      preferences: preferences
    })
    message.success('Routing preferences saved successfully!')
  } catch (error) {
    console.error('Failed to save routing preferences:', error)
    message.error('Failed to save preferences')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadPreferences()
})
</script>

<style scoped>
.routing-preferences {
  padding: 24px;
  max-width: 1200px;
}

.settings-header {
  margin-bottom: 32px;
}

.settings-header h1 {
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1f2937;
}

.settings-header p {
  font-size: 16px;
  color: #6b7280;
  margin: 0;
}

.preferences-section h2 {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1f2937;
}

.section-description {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 24px;
  line-height: 1.5;
}

.preferences-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.preference-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px;
  background: #ffffff;
}

.task-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  color: #1f2937;
}

.task-description {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 16px;
}

.model-selection {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.model-field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
}

.preference-actions {
  display: flex;
  justify-content: flex-end;
}

.global-actions {
  display: flex;
  justify-content: center;
  padding-top: 24px;
  border-top: 1px solid #e5e7eb;
}
</style>
