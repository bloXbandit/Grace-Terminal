<template>
  <div v-if="visible" class="video-overhaul-overlay" @click.self="close">
    <div class="video-overhaul-modal">
      <div class="video-overhaul-header">
        <h3>{{ title }}</h3>
        <div class="header-controls">
          <button class="download-btn" @click="download" title="Download video">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="close-btn" @click="close">&times;</button>
        </div>
      </div>
      
      <div class="video-overhaul-content">
        <!-- Loading state -->
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>Loading video...</p>
          <div class="loading-details">{{ loadingText }}</div>
        </div>
        
        <!-- Error state -->
        <div v-else-if="error" class="error-state">
          <div class="error-icon">⚠️</div>
          <h4>Failed to load video</h4>
          <p>{{ error }}</p>
          <div class="error-details">
            <small>{{ errorDetails }}</small>
          </div>
          <button class="retry-btn" @click="retry">Retry</button>
        </div>
        
        <!-- Video player -->
        <div v-else class="video-player-container">
          <video 
            ref="videoPlayer"
            controls 
            autoplay 
            preload="metadata"
            style="width: 100%; height: auto; max-height: 70vh;"
            @loadeddata="onVideoLoaded"
            @error="onVideoError"
            @play="onPlay"
            @pause="onPause"
          >
            <source :src="videoUrl" :type="videoMimeType">
            Your browser does not support the video tag.
          </video>
          
          <!-- Video info -->
          <div class="video-info">
            <div class="video-stats">
              <span>{{ formatFileSize(fileSize) }}</span>
              <span>{{ videoMimeType }}</span>
              <span v-if="duration">{{ formatDuration(duration) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
const videoUrl = ref('')
const loading = ref(false)
const error = ref('')
const errorDetails = ref('')
const loadingText = ref('')
const title = ref('Video Preview')
const fileSize = ref(0)
const duration = ref(0)
const videoPlayer = ref(null)

const videoMimeType = computed(() => {
  if (!title.value) return 'video/mp4'
  const ext = title.value.split('.').pop()?.toLowerCase()
  const types = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska'
  }
  return types[ext] || 'video/mp4'
})

// COMPLETE OVERHAUL: Bulletproof video loading with streaming endpoint
const loadVideo = async (file) => {
  console.log('[VideoOverhaul] Loading video:', file)
  
  // Resolve file path - handle all possible field names
  const filePath = file.filepath || file.path || file.url
  if (!filePath) {
    error.value = 'No file path provided'
    errorDetails.value = 'File object missing filepath, path, and url fields'
    visible.value = true
    return
  }
  
  title.value = file.filename || file.name || filePath.split('/').pop() || 'video'
  loading.value = true
  error.value = ''
  errorDetails.value = ''
  loadingText.value = 'Initializing video stream...'
  visible.value = true
  
  try {
    // Use the streaming endpoint URL directly so the browser can manage Range requests and seeking
    // Note: native <video> requests cannot set Authorization headers; local dev falls back to local admin.
    loadingText.value = 'Connecting to video server...'

    // Clean up old blob URL if exists
    if (videoUrl.value && videoUrl.value.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl.value)
    }

    videoUrl.value = `/api/file/video-stream?path=${encodeURIComponent(filePath)}`
    loading.value = false
    
  } catch (err) {
    console.error('[VideoOverhaul] Load error:', err)
    error.value = err.message || 'Failed to load video'
    errorDetails.value = err.details || 'Check console for technical details'
    loading.value = false
  }
}

const onVideoLoaded = () => {
  if (videoPlayer.value) {
    duration.value = videoPlayer.value.duration
    console.log('[VideoOverhaul] Video loaded, duration:', duration.value)
  }
}

const onVideoError = (e) => {
  console.error('[VideoOverhaul] Video playback error:', e)
  error.value = 'Video playback failed'
  errorDetails.value = 'The video file may be corrupted or unsupported'
}

const onPlay = () => {
  console.log('[VideoOverhaul] Video playing')
}

const onPause = () => {
  console.log('[VideoOverhaul] Video paused')
}

const retry = () => {
  if (window.currentVideoFile) {
    loadVideo(window.currentVideoFile)
  }
}

const download = async () => {
  if (!window.currentVideoFile) return
  
  try {
    const filePath = window.currentVideoFile.filepath || window.currentVideoFile.path || window.currentVideoFile.url
    const token = localStorage.getItem('access_token')
    
    const response = await fetch(`/api/file/video-stream?path=${encodeURIComponent(filePath)}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    
    if (!response.ok) throw new Error('Download failed')
    
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = title.value
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
  } catch (err) {
    console.error('[VideoOverhaul] Download error:', err)
    alert('Download failed: ' + err.message)
  }
}

const close = () => {
  if (videoUrl.value && videoUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(videoUrl.value)
  }
  videoUrl.value = ''
  if (videoPlayer.value) {
    videoPlayer.value.pause()
    videoPlayer.value.src = ''
  }
  visible.value = false
  loading.value = false
  error.value = ''
  errorDetails.value = ''
  duration.value = 0
  fileSize.value = 0
  window.currentVideoFile = null
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Global function for easy access
window.showVideoOverhaul = (file) => {
  window.currentVideoFile = file
  loadVideo(file)
}

// Keyboard shortcuts
const handleKeydown = (e) => {
  if (!visible.value) return
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  close()
})
</script>

<style scoped>
.video-overhaul-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.video-overhaul-modal {
  background: #1a1a1a;
  border-radius: 12px;
  width: 95%;
  max-width: 1000px;
  max-height: 95vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}

.video-overhaul-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #333;
  background: #222;
}

.video-overhaul-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.download-btn, .close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  color: #ccc;
  transition: all 0.2s;
}

.download-btn:hover, .close-btn:hover {
  background: #333;
  color: #fff;
}

.close-btn {
  font-size: 24px;
  width: 40px;
  height: 40px;
}

.video-overhaul-content {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  flex: 1;
}

.loading-state {
  text-align: center;
  color: #ccc;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top: 3px solid #007acc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-details {
  margin-top: 8px;
  font-size: 14px;
  color: #999;
}

.error-state {
  text-align: center;
  color: #ff6b6b;
  padding: 40px;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-state h4 {
  margin: 0 0 8px 0;
  color: #ff6b6b;
}

.error-state p {
  margin: 0 0 16px 0;
}

.error-details {
  margin-bottom: 20px;
}

.error-details small {
  color: #999;
  font-family: monospace;
  background: #222;
  padding: 8px 12px;
  border-radius: 4px;
  display: inline-block;
}

.retry-btn {
  background: #007acc;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.retry-btn:hover {
  background: #005a9e;
}

.video-player-container {
  width: 100%;
  padding: 20px;
}

.video-info {
  margin-top: 12px;
  padding: 12px;
  background: #222;
  border-radius: 6px;
}

.video-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #999;
}

.video-stats span {
  background: #333;
  padding: 4px 8px;
  border-radius: 4px;
}
</style>
