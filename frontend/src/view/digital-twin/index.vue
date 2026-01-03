<template>
  <div class="twin-page">
    <div class="twin-header">
      <a-button @click="toGrace" style="margin-right: 10px;">← Back to Chat</a-button>
      <h1>Digital Twin</h1>
      <a-button type="primary" @click="showCreate = true">+ Create Twin</a-button>
    </div>

    <div v-if="!twins.length" class="empty">
      <UserOutlined style="font-size: 48px; color: #ccc" />
      <p>No twins yet. Upload a photo to create your AI avatar.</p>
    </div>

    <div v-else class="twin-grid">
      <div v-for="t in twins" :key="t.id" class="twin-card" :class="{ default: t.is_default }">
        <img :src="getImg(t)" class="twin-img" />
        <div class="twin-body">
          <strong>{{ t.name }}</strong>
          <span>{{ t.videos_generated || 0 }} videos</span>
        </div>
        <div class="twin-actions">
          <a-button size="small" @click="openVideo(t)">Generate</a-button>
          <a-button size="small" v-if="!t.is_default" @click="setDefault(t)">Set Default</a-button>
          <a-button size="small" danger @click="remove(t)">Delete</a-button>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <a-modal v-model:open="showCreate" title="Create Twin" @ok="create" @cancel="reset">
      <a-form layout="vertical">
        <a-form-item label="Name" required>
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="Face Photo" required>
          <a-upload 
            :before-upload="() => false" 
            :file-list="files" 
            @change="handleFile"
            accept="image/*"
            list-type="picture-card"
          >
            <div v-if="files.length === 0" class="upload-area">
              <UserOutlined />
              <div>Upload Face Photo</div>
            </div>
          </a-upload>
          <div class="upload-guide">
            <p><strong>Requirements:</strong></p>
            <ul>
              <li>Clear, front-facing photo</li>
              <li>Good lighting, neutral background</li>
              <li>Face clearly visible (no sunglasses)</li>
              <li>File size: Under 10MB</li>
            </ul>
          </div>
        </a-form-item>

        <a-form-item label="Voice Sample (Optional)">
          <a-upload 
            :before-upload="() => false" 
            :file-list="voiceFiles" 
            @change="handleVoiceFile"
            accept="audio/*"
            list-type="text"
          >
            <a-button><AudioOutlined /> Upload Voice Sample</a-button>
          </a-upload>
          <div class="upload-guide">
            <p><strong>For Voice Cloning:</strong></p>
            <ul>
              <li>Record 30-60 seconds of clear speech</li>
              <li>Speak naturally in your normal voice</li>
              <li>Quiet environment, no background noise</li>
              <li>Formats: MP3, WAV, M4A</li>
            </ul>
          </div>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Video Modal -->
    <a-modal v-model:open="showVideo" title="Generate Video" @ok="genVideo">
      <a-textarea v-model:value="script" placeholder="What should your twin say?" />
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { UserOutlined, AudioOutlined } from '@ant-design/icons-vue'
import http from '@/utils/http'
import { useRouter } from 'vue-router'

const router = useRouter()
const twins = ref([])
const showCreate = ref(false)
const showVideo = ref(false)
const files = ref([])
const voiceFiles = ref([])
const faceFileObj = ref(null)
const voiceFileObj = ref(null)
const script = ref('')
const selectedTwin = ref(null)
const creating = ref(false)

const form = ref({ name: '', traits: { gender: 'neutral' }, model_type: 'sadtalker_fast' })

onMounted(() => load())

async function load() {
  const res = await http.get('/api/digital-twin')
  twins.value = res.data || []
}

function getImg(t) {
  return t.face_image_url || `/api/file/preview?path=${t.face_image_path}`
}

function handleFile({ fileList: fl }) {
  const file = fl[fl.length - 1]
  if (!file) {
    files.value = []
    faceFileObj.value = null
    return
  }

  const raw = file.originFileObj
  if (!raw) {
    message.error('Upload failed to provide a file object')
    files.value = []
    faceFileObj.value = null
    return
  }
  
  // Client-side validation for twin photos
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const maxSize = 10 * 1024 * 1024 // 10MB
  
  if (!allowedTypes.includes(raw.type)) {
    message.error('Only JPEG, PNG, GIF, and WebP images are allowed for twin photos')
    return
  }
  
  if (raw.size > maxSize) {
    message.error('File size must be under 10MB')
    return
  }
  
  // Check if filename suggests document
  const filename = (raw.name || file.name || '').toLowerCase()
  if (filename.includes('doc') || filename.includes('pdf') || filename.includes('sheet')) {
    message.error('Please upload a face photo, not a document file')
    return
  }
  
  // Keep only the latest file
  files.value = [file]
  faceFileObj.value = raw
}

function handleVoiceFile({ fileList: fl }) {
  const file = fl[fl.length - 1]
  if (!file) {
    voiceFiles.value = []
    voiceFileObj.value = null
    return
  }

  const raw = file.originFileObj
  if (!raw) {
    message.error('Upload failed to provide a voice file object')
    voiceFiles.value = []
    voiceFileObj.value = null
    return
  }
  
  // Client-side validation for voice samples
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a']
  const maxSize = 50 * 1024 * 1024 // 50MB for audio
  
  if (!allowedTypes.includes(raw.type) && !raw.type.startsWith('audio/')) {
    message.error('Only audio files (MP3, WAV, M4A) are allowed for voice samples')
    return
  }
  
  if (raw.size > maxSize) {
    message.error('Voice sample must be under 50MB')
    return
  }
  
  voiceFiles.value = [file]
  voiceFileObj.value = raw
}

async function create() {
  if (creating.value) return
  if (!form.value.name || !files.value.length || !faceFileObj.value) {
    message.error('Fill all fields')
    return
  }

  try {
    creating.value = true
    const fd = new FormData()
    fd.append('face_image', faceFileObj.value)
    fd.append('name', form.value.name)
    fd.append('traits', JSON.stringify(form.value.traits))
    fd.append('model_type', form.value.model_type)
    
    if (voiceFileObj.value) {
      fd.append('voice_sample', voiceFileObj.value)
    }

    await http.post('/api/digital-twin', fd)
    message.success('Twin created')
    showCreate.value = false
    reset()
    load()
  } catch (e) {
    const backendMsg = e?.response?.data?.msg
    message.error(backendMsg || e?.message || 'Failed to create twin')
  } finally {
    creating.value = false
  }
}

function reset() {
  form.value = { name: '', traits: { gender: 'neutral' }, model_type: 'sadtalker_fast' }
  files.value = []
  voiceFiles.value = []
  faceFileObj.value = null
  voiceFileObj.value = null
  script.value = ''
  selectedTwin.value = null
}

function toGrace() {
  router.push('/grace')
}

function openVideo(t) {
  selectedTwin.value = t
  script.value = ''
  showVideo.value = true
}

async function genVideo() {
  await http.post(`/api/digital-twin/${selectedTwin.value.id}/generate-video`, { script: script.value })
  message.success('Video generating...')
  showVideo.value = false
}

async function setDefault(t) {
  await http.post(`/api/digital-twin/${t.id}/set-default`)
  message.success('Default updated')
  load()
}

async function remove(t) {
  await http.delete(`/api/digital-twin/${t.id}`)
  message.success('Deleted')
  load()
}
</script>

<style scoped>
.twin-page { padding: 24px; }
.twin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.empty { text-align: center; padding: 60px; }
.twin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.twin-card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.twin-card.default { border: 2px solid #1890ff; }
.twin-img { width: 100%; height: 180px; object-fit: cover; }
.twin-body { padding: 12px; display: flex; justify-content: space-between; align-items: center; }
.twin-actions { padding: 8px 12px; display: flex; gap: 8px; }

/* Twin-specific upload styles */
.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 104px;
  cursor: pointer;
}

.upload-area .anticon {
  font-size: 24px;
  color: #666;
  margin-bottom: 8px;
}

.upload-guide {
  margin-top: 12px;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 12px;
}

.upload-guide p {
  margin: 0 0 8px 0;
  color: #333;
}

.upload-guide ul {
  margin: 0;
  padding-left: 16px;
  color: #666;
}

.upload-guide li {
  margin-bottom: 4px;
}

:deep(.ant-upload-list-picture-card .ant-upload-list-item) {
  border: 2px solid #1890ff;
}
</style>
