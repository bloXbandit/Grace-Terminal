<template>
  <transition name="slide-fade">
    <div v-if="visible" class="profile-notification">
      <div class="notification-content">
        <div class="notification-icon">🧠</div>
        <div class="notification-text">
          <div class="notification-title">Grace learned about you!</div>
          <div class="notification-message">{{ message }}</div>
        </div>
        <button class="notification-close" @click="close">×</button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const visible = ref(false);
const message = ref('');
let hideTimeout = null;

// Listen for profile update events
const handleProfileUpdate = (event) => {
  const { key, value } = event.detail;
  
  const messages = {
    name: `Added "${value}" as your preferred name`,
    profession: `Noted your profession: ${value}`,
    interests: `Learned about your interest in ${value}`,
    expertise_level: `Set your expertise level: ${value}`,
    location: `Noted your location: ${value}`,
    goals: `Saved your goal: ${value}`
  };
  
  message.value = messages[key] || `Learned: ${key} = ${value}`;
  visible.value = true;
  
  // Auto-hide after 5 seconds
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    visible.value = false;
  }, 5000);
};

const close = () => {
  visible.value = false;
  if (hideTimeout) clearTimeout(hideTimeout);
};

onMounted(() => {
  window.addEventListener('profile-learned', handleProfileUpdate);
});

onUnmounted(() => {
  window.removeEventListener('profile-learned', handleProfileUpdate);
  if (hideTimeout) clearTimeout(hideTimeout);
});
</script>

<style scoped>
.profile-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  max-width: 400px;
}

.notification-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 20px;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 12px;
}

.notification-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.notification-text {
  flex: 1;
}

.notification-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.notification-message {
  font-size: 13px;
  opacity: 0.95;
}

.notification-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 24px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  flex-shrink: 0;
  line-height: 1;
}

.notification-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Animations */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.3s ease-in;
}

.slide-fade-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
