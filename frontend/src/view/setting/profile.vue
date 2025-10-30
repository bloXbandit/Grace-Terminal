<template>
  <div class="profile-settings">
    <div class="settings-header">
      <h1>👤 Your Profile</h1>
      <p>Help Grace understand you better</p>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h2>Basic Information</h2>
        
        <div class="form-group">
          <label for="name">Preferred Name *</label>
          <input
            id="name"
            v-model="profile.name"
            type="text"
            placeholder="What should Grace call you?"
            @blur="saveField('name')"
            @focus="originalValues.name = profile.name"
          />
          <span class="field-hint">This is how Grace will address you</span>
        </div>

        <div class="form-group">
          <label for="profession">Profession *</label>
          <input
            id="profession"
            v-model="profile.profession"
            type="text"
            placeholder="e.g., Software Developer, Designer, Student"
            @blur="saveField('profession')"
          />
          <span class="field-hint">Helps Grace tailor technical explanations</span>
        </div>

        <div class="form-group">
          <label for="expertise_level">Expertise Level *</label>
          <select
            id="expertise_level"
            v-model="profile.expertise_level"
            @change="saveField('expertise_level')"
          >
            <option value="">Select level...</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="expert">Expert</option>
          </select>
          <span class="field-hint">How Grace adjusts complexity</span>
        </div>
      </div>

      <div class="settings-section">
        <h2>Optional Information</h2>
        
        <div class="form-group">
          <label for="interests">Interests</label>
          <textarea
            id="interests"
            v-model="profile.interests"
            placeholder="e.g., AI, Web Development, Design, Startups"
            rows="3"
            @blur="saveField('interests')"
          ></textarea>
          <span class="field-hint">Topics you're passionate about</span>
        </div>

        <div class="form-group">
          <label for="goals">Current Goals</label>
          <textarea
            id="goals"
            v-model="profile.goals"
            placeholder="e.g., Build a SaaS product, Learn React, Launch a startup"
            rows="3"
            @blur="saveField('goals')"
          ></textarea>
          <span class="field-hint">What you're working towards</span>
        </div>

        <div class="form-group">
          <label for="location">Location</label>
          <input
            id="location"
            v-model="profile.location"
            type="text"
            placeholder="e.g., San Francisco, Remote"
            @blur="saveField('location')"
          />
          <span class="field-hint">For time zone context</span>
        </div>
      </div>

      <div class="settings-section">
        <h2>What Grace Learned</h2>
        <div class="learned-items">
          <div v-if="learnedProfile.length === 0" class="no-learned">
            Grace hasn't learned anything about you yet. Start chatting!
          </div>
          <div
            v-for="item in learnedProfile"
            :key="item.key"
            class="learned-item"
          >
            <div class="learned-key">{{ formatKey(item.key) }}</div>
            <div class="learned-value">{{ item.value }}</div>
            <div class="learned-meta">
              <span class="confidence">{{ Math.round(item.confidence * 100) }}% confident</span>
              <span class="source">{{ formatSource(item.source) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-actions">
        <button @click="saveAll" class="btn-primary">
          💾 Save All Changes
        </button>
        <button @click="loadProfile" class="btn-secondary">
          🔄 Refresh
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import http from '@/utils/http';

const profile = ref({
  name: '',
  profession: '',
  expertise_level: '',
  interests: '',
  goals: '',
  location: ''
});

const originalValues = ref({});
const learnedProfile = ref([]);

// Listen for real-time profile updates from chat extraction
const setupProfileListener = () => {
  window.addEventListener('profile-learned', (event) => {
    const { key, value } = event.detail;
    
    // Update form field if it exists
    if (profile.value.hasOwnProperty(key)) {
      profile.value[key] = value;
    }
    
    // Refresh learned profile display
    loadProfile();
  });
};

// Load profile from backend
const loadProfile = async () => {
  try {
    const response = await http.get('/api/users/profile');
    
    if (response.data && response.data.success) {
      // Populate form fields
      response.data.profile.forEach(item => {
        if (profile.value.hasOwnProperty(item.key)) {
          profile.value[item.key] = item.value;
        }
      });
      
      // Show what Grace learned
      learnedProfile.value = response.data.profile.filter(
        item => item.source && item.source.startsWith('conversation')
      );
    }
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
};

// Save individual field
const saveField = async (key) => {
  const value = profile.value[key];
  if (!value || value.trim() === '') return;
  
  // CRITICAL FIX: Only save if value actually changed
  if (originalValues.value[key] === value) {
    console.log(`[Profile] No change detected for ${key}, skipping save`);
    return;
  }
  
  try {
    const response = await http.post('/api/users/profile', {
      key,
      value: value.trim(),
      confidence: 1.0,
      source: 'settings'
    });
    
    if (response.data && response.data.success) {
      console.log(`[Profile] Saved ${key}: ${value.trim()}`);
      
      // Only refresh learned profile section (not form fields)
      const learnedResponse = await http.get('/api/users/profile');
      if (learnedResponse.data && learnedResponse.data.success) {
        // Only show items learned from conversations (not settings)
        learnedProfile.value = learnedResponse.data.profile.filter(
          item => item.source && item.source.startsWith('conversation')
        );
      }
    } else {
      console.error('Failed to save field:', response.data?.message);
    }
  } catch (error) {
    console.error('Failed to save field:', error);
  }
};

// Save all fields
const saveAll = async () => {
  let savedCount = 0;
  for (const [key, value] of Object.entries(profile.value)) {
    if (value && value.trim() !== '') {
      await saveField(key);
      savedCount++;
    }
  }
  if (savedCount > 0) {
    alert(`✅ Profile saved! ${savedCount} fields updated.`);
  }
};

// Format key for display
const formatKey = (key) => {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Format source for display
const formatSource = (source) => {
  if (source === 'settings') return 'You entered this';
  if (source.startsWith('conversation')) return 'Grace learned this';
  return source;
};

onMounted(() => {
  loadProfile();
  setupProfileListener();
});
</script>

<style scoped>
.profile-settings {
  max-width: 800px;
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
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.settings-section {
  margin-bottom: 40px;
}

.settings-section:last-child {
  margin-bottom: 0;
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

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e5e5;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
  font-family: inherit;
  background: #f8f9ff;
  color: #333;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.form-group textarea {
  resize: vertical;
}

.field-hint {
  display: block;
  font-size: 12px;
  color: #888;
  margin-top: 6px;
}

.dev-mode-hint {
  background: #fff3cd;
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid #ff9800;
  color: #856404;
  font-size: 13px;
  line-height: 1.6;
}

.dev-mode-hint ul {
  margin: 8px 0 0 20px;
  padding: 0;
}

.dev-mode-hint li {
  margin: 4px 0;
}

.toggle-container {
  margin-bottom: 16px;
}

.toggle-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.toggle-checkbox {
  position: absolute;
  opacity: 0;
  cursor: pointer;
}

.toggle-slider {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 28px;
  background-color: #ccc;
  border-radius: 28px;
  transition: background-color 0.3s;
  margin-right: 12px;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 22px;
  width: 22px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

.toggle-checkbox:checked + .toggle-slider {
  background-color: #ff5722;
}

.toggle-checkbox:checked + .toggle-slider::before {
  transform: translateX(24px);
}

.toggle-text {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.learned-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.no-learned {
  padding: 24px;
  text-align: center;
  color: #888;
  background: #f9f9f9;
  border-radius: 8px;
}

.learned-item {
  padding: 16px;
  background: #f8f9ff;
  border-radius: 8px;
  border-left: 4px solid #667eea;
}

.learned-key {
  font-weight: 600;
  font-size: 13px;
  color: #667eea;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.learned-value {
  font-size: 15px;
  color: #333;
  margin-bottom: 8px;
}

.learned-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #888;
}

.confidence {
  font-weight: 500;
}

.settings-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid #e5e5e5;
}

.btn-primary,
.btn-secondary {
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f5f5f5;
  color: #666;
}

.btn-secondary:hover {
  background: #e5e5e5;
}
</style>
