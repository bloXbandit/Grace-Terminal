import { ref, computed } from 'vue'

// Global timer state
const isTimerActive = ref(false)
const timeRemaining = ref(0)
const totalDuration = ref(0)
const timerLabel = ref('')
let timerInterval = null

export function useGenerationTimer() {
  const startTimer = (duration = 120000, label = 'Generating...') => {
    if (isTimerActive.value) {
      // Don't start if already running
      return
    }
    
    totalDuration.value = duration
    timeRemaining.value = duration
    timerLabel.value = label
    isTimerActive.value = true
    
    timerInterval = setInterval(() => {
      timeRemaining.value -= 1000
      
      if (timeRemaining.value <= 0) {
        // Timer completed but generation might still be running
        // Keep showing "Taking longer than expected..."
        timeRemaining.value = 0
      }
    }, 1000)
  }
  
  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    isTimerActive.value = false
    timeRemaining.value = 0
    totalDuration.value = 0
    timerLabel.value = ''
  }
  
  const progressPercent = computed(() => {
    if (totalDuration.value === 0) return 0
    return Math.max(0, Math.min(100, ((totalDuration.value - timeRemaining.value) / totalDuration.value) * 100))
  })
  
  const formatTime = (ms) => {
    const seconds = Math.ceil(ms / 1000)
    if (seconds <= 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  
  const displayText = computed(() => {
    if (!isTimerActive.value) return ''
    
    if (timeRemaining.value === 0) {
      return `${timerLabel.value} Taking longer than expected...`
    }
    
    return `${timerLabel.value} ${formatTime(timeRemaining.value)} remaining`
  })
  
  // Auto-stop timer on component unmount
  const cleanup = () => {
    stopTimer()
  }
  
  return {
    isTimerActive,
    timeRemaining,
    totalDuration,
    timerLabel,
    progressPercent,
    displayText,
    startTimer,
    stopTimer,
    formatTime,
    cleanup
  }
}
