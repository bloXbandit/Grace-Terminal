<template>
  <div v-if="visible" class="simple-video-preview-overlay" @click.self="close">
    <div class="simple-video-preview-modal">
      <div class="simple-video-preview-header">
        <h3>{{ fileName }}</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>
      <div class="simple-video-preview-content">
        <video 
          v-if="fileUrl"
          controls 
          autoplay 
          style="width: 100%; max-height: 70vh;"
          @error="handleVideoError"
        >
          <source :src="fileUrl" :type="videoMimeType">
          Your browser does not support the video tag.
        </video>
        <div v-else-if="loading" class="loading">
          Loading video...
        </div>
        <div v-else class="error">
          Failed to load video: {{ errorText }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { message } from 'ant-design-vue'

const visible = ref(false)
const fileUrl = ref('')
const loading = ref(false)
const errorText = ref('')
const fileName = ref('')

const videoMimeType = computed(() => {
  if (!fileName.value) return 'video/mp4'
  const ext = fileName.value.split('.').pop()?.toLowerCase()
  const types = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo'
  }
  return types[ext] || 'video/mp4'
})

const show = async (file) => {
  console.log('[SimpleVideoPreview] show called with:', file)
  
  // Resolve file path - handle all possible field names
  const filePath = file.filepath || file.path || file.url
  if (!filePath) {
    errorText.value = 'No file path provided'
    visible.value = true
    return
  }
  
  fileName.value = file.filename || file.name || filePath.split('/').pop() || 'video'
  loading.value = true
  errorText.value = ''
  visible.value = true
  
  try {
    // Direct fetch to bypass Vue reactivity issues
    const token = localStorage.getItem('access_token')
    const response = await fetch('/api/file/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ path: filePath })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const blob = await response.blob()
    console.log('[SimpleVideoPreview] got blob:', blob.type, blob.size)
    
    // Check if we actually got a video
    if (!blob.type.startsWith('video/') && blob.size > 0) {
      const text = await blob.text()
      console.error('[SimpleVideoPreview] Got non-video response:', text.slice(0, 200))
      throw new Error('Server returned non-video content')
    }
    
    fileUrl.value = URL.createObjectURL(blob)
    loading.value = false
    
  } catch (error) {
    console.error('[SimpleVideoPreview] Error:', error)
    errorText.value = error.message
    loading.value = false
  }
}

const handleVideoError = (e) => {
  console.error('[SimpleVideoPreview] Video error:', e)
  errorText.value = 'Video playback failed'
}

const close = () => {
  if (fileUrl.value) {
    URL.revokeObjectURL(fileUrl.value)
    fileUrl.value = ''
  }
  visible.value = false
  loading.value = false
  errorText.value = ''
}

// Expose show method globally
window.showSimpleVideoPreview = show
</script>

<style scoped>
.simple-video-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.simple-video-preview-modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.simple-video-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.simple-video-preview-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #f5f5f5;
}

.simple-video-preview-content {
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.loading, .error {
  color: #666;
  font-size: 16px;
}

.error {
  color: #ff4d4f;
}
</style>
