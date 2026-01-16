<template>
  <div v-if="isTimerActive" class="generation-timer">
    <div class="timer-icon">⏱️</div>
    <div class="timer-content">
      <div class="timer-text">{{ displayText }}</div>
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          :style="{ 
            width: progressPercent + '%',
            backgroundColor: progressPercent > 80 ? '#ef4444' : progressPercent > 50 ? '#f59e0b' : '#10b981'
          }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGenerationTimer } from '@/composables/useGenerationTimer'

const {
  isTimerActive,
  progressPercent,
  displayText,
  cleanup
} = useGenerationTimer()

// Auto-cleanup on unmount
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(() => {
  cleanup()
})
</script>

<style scoped>
.generation-timer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 8px 0;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  animation: slideIn 0.3s ease-out;
}

.timer-icon {
  font-size: 16px;
  animation: pulse 2s infinite;
}

.timer-content {
  flex: 1;
}

.timer-text {
  font-weight: 500;
  color: #374151;
  margin-bottom: 4px;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
  border-radius: 2px;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
