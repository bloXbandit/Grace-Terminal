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
          <label for="name">
            Preferred Name *
            <button
              v-if="profile.name"
              type="button"
              class="btn-clear"
              @click="clearField('name')"
            >Clear</button>
            <span v-if="savedFields.name" class="saved-badge">✓ Saved</span>
          </label>
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
          <label for="profession">
            Profession *
            <button
              v-if="profile.profession"
              type="button"
              class="btn-clear"
              @click="clearField('profession')"
            >Clear</button>
            <span v-if="savedFields.profession" class="saved-badge">✓ Saved</span>
          </label>
          <input
            id="profession"
            v-model="profile.profession"
            type="text"
            placeholder="e.g., Software Developer, Designer, Student"
            @blur="saveField('profession')"
            @focus="originalValues.profession = profile.profession"
          />
          <span class="field-hint">Helps Grace tailor technical explanations</span>
        </div>

        <div class="form-group">
          <label for="expertise_level">
            Expertise Level *
            <button
              v-if="profile.expertise_level"
              type="button"
              class="btn-clear"
              @click="clearField('expertise_level')"
            >Clear</button>
            <span v-if="savedFields.expertise_level" class="saved-badge">✓ Saved</span>
          </label>
          <select
            id="expertise_level"
            v-model="profile.expertise_level"
            @change="saveField('expertise_level')"
            @focus="originalValues.expertise_level = profile.expertise_level"
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
          <label for="interests">
            Interests
            <button
              v-if="profile.interests"
              type="button"
              class="btn-clear"
              @click="clearField('interests')"
            >Clear</button>
            <span v-if="savedFields.interests" class="saved-badge">✓ Saved</span>
          </label>
          <textarea
            id="interests"
            v-model="profile.interests"
            placeholder="e.g., AI, Web Development, Design, Startups"
            rows="3"
            @blur="saveField('interests')"
            @focus="originalValues.interests = profile.interests"
          ></textarea>
          <span class="field-hint">Topics you're passionate about</span>
        </div>

        <div class="form-group">
          <label for="goals">
            Current Goals
            <button
              v-if="profile.goals"
              type="button"
              class="btn-clear"
              @click="clearField('goals')"
            >Clear</button>
            <span v-if="savedFields.goals" class="saved-badge">✓ Saved</span>
          </label>
          <textarea
            id="goals"
            v-model="profile.goals"
            placeholder="e.g., Build a SaaS product, Learn React, Launch a startup"
            rows="3"
            @blur="saveField('goals')"
            @focus="originalValues.goals = profile.goals"
          ></textarea>
          <span class="field-hint">What you're working towards</span>
        </div>

        <div class="form-group">
          <label for="location">
            Location
            <button
              v-if="profile.location"
              type="button"
              class="btn-clear"
              @click="clearField('location')"
            >Clear</button>
            <span v-if="savedFields.location" class="saved-badge">✓ Saved</span>
          </label>
          <input
            id="location"
            v-model="profile.location"
            type="text"
            placeholder="e.g., San Francisco, Remote"
            @blur="saveField('location')"
            @focus="originalValues.location = profile.location"
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
import { ref, onMounted, onBeforeUnmount } from 'vue';
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
const savedFields = ref({});

// Show a transient "Saved" badge for a field
const flashSaved = (key) => {
  savedFields.value[key] = true;
  setTimeout(() => {
    savedFields.value[key] = false;
  }, 2000);
};

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
          originalValues.value[item.key] = item.value;
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
  if (Object.prototype.hasOwnProperty.call(originalValues.value, key) && originalValues.value[key] === value) {
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

      originalValues.value[key] = value.trim()
      flashSaved(key);
      
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

// Clear/delete a field value (removes from backend + form)
const clearField = async (key) => {
  const hadValue = profile.value[key] && profile.value[key].trim() !== '';
  try {
    const response = await http.del(`/api/users/profile/${key}`);
    if (response.data && response.data.success) {
      profile.value[key] = '';
      originalValues.value[key] = '';
      console.log(`[Profile] Cleared ${key}`);

      // Refresh learned profile section
      const learnedResponse = await http.get('/api/users/profile');
      if (learnedResponse.data && learnedResponse.data.success) {
        learnedProfile.value = learnedResponse.data.profile.filter(
          item => item.source && item.source.startsWith('conversation')
        );
      }
    } else {
      console.error('Failed to clear field:', response.data?.error);
    }
  } catch (error) {
    // If nothing was persisted yet, still clear the local form value
    if (hadValue) {
      profile.value[key] = '';
      originalValues.value[key] = '';
    }
    console.error('Failed to clear field:', error);
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

// Flush all dirty fields before component is destroyed (prevents data loss on SPA navigation)
const flushDirtyFields = async () => {
  const pending = [];
  for (const key of Object.keys(profile.value)) {
    const value = profile.value[key];
    if (value && value.trim() !== '') {
      const original = originalValues.value[key];
      if (original !== value.trim()) {
        pending.push(saveField(key));
      }
    }
  }
  if (pending.length > 0) {
    await Promise.all(pending);
    console.log(`[Profile] Flushed ${pending.length} dirty field(s) before unmount`);
  }
};

onMounted(() => {
  loadProfile();
  setupProfileListener();
});

onBeforeUnmount(() => {
  flushDirtyFields();
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
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #444;
  font-size: 14px;
}

.btn-clear {
  border: none;
  background: transparent;
  color: #d9534f;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}

.btn-clear:hover {
  background: #fdecea;
}

.saved-badge {
  font-size: 12px;
  font-weight: 600;
  color: #2e7d32;
  background: #e8f5e9;
  padding: 2px 8px;
  border-radius: 10px;
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
