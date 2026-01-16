<template>
  <div class="studio-suite">
    <!-- Sidebar: Avatar Management -->
    <div class="studio-sidebar">
      <div class="sidebar-header">
        <a-button type="link" @click="toGrace" class="back-btn"><LeftOutlined /> Grace</a-button>
        <h2>Studio Suite</h2>
        <a-button type="primary" shape="circle" @click="showCreate = true"><PlusOutlined /></a-button>
      </div>

      <div class="avatar-list">
        <div 
          v-for="t in twins" 
          :key="t.id" 
          class="avatar-item" 
          :class="{ active: selectedTwin?.id === t.id }"
          @click="selectTwin(t)"
        >
          <img :src="getAvatar(t)" class="avatar-thumb" />
          <div class="avatar-info">
            <span class="avatar-name">{{ t.name }}</span>
            <a-tag v-if="t.is_default" color="blue" size="small">Default</a-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content: Studio Workspace -->
    <div class="studio-workspace" v-if="selectedTwin">
      <div class="workspace-header">
        <div class="twin-identity">
          <img :src="getAvatar(selectedTwin)" class="identity-avatar" />
          <div class="identity-text">
            <h3>{{ selectedTwin.name }}</h3>
            <p>Digital Twin ID: #{{ selectedTwin.id }}</p>
          </div>
        </div>
        <div class="workspace-actions">
          <a-button @click="openEdit(selectedTwin)">Edit Traits</a-button>
          <a-button v-if="!selectedTwin.is_default" @click="setDefault(selectedTwin)">Set Default</a-button>
          <a-button danger @click="remove(selectedTwin)">Delete</a-button>
        </div>
      </div>

      <div class="workspace-grid">
        <!-- Generation Section -->
        <div class="gen-section card">
          <div class="section-header">
            <h4><VideoCameraOutlined /> Create New Clip</h4>
            <div class="preset-selector">
              <a-radio-group v-model:value="preset" button-style="solid" size="small">
                <a-radio-button value="youtube"><YoutubeOutlined /> YouTube</a-radio-button>
                <a-radio-button value="instagram"><InstagramOutlined /> Instagram</a-radio-button>
                <a-radio-button value="tiktok"><TikTokOutlined /> TikTok</a-radio-button>
              </a-radio-group>
            </div>
          </div>
          
          <a-form layout="vertical">
            <a-form-item label="Script / Speech Content">
              <a-textarea 
                v-model:value="script" 
                placeholder="Enter the script for your twin to speak..." 
                :rows="8"
                class="script-input"
              />
            </a-form-item>
            
            <a-row :gutter="16">
              <a-col :span="12">
                <a-form-item label="Background Scene">
                  <a-input v-model:value="bgOverride" placeholder="e.g. Modern office, Beach" />
                </a-form-item>
              </a-col>
              <a-col :span="12">
                <a-form-item label="Mood Override">
                  <a-select v-model:value="moodOverride">
                    <a-select-option value="professional">Professional</a-select-option>
                    <a-select-option value="friendly">Friendly</a-select-option>
                    <a-select-option value="energetic">Energetic</a-select-option>
                  </a-select>
                </a-form-item>
              </a-col>
            </a-row>

            <a-button 
              type="primary" 
              block 
              size="large" 
              @click="genVideo" 
              :loading="generating"
              class="gen-btn"
            >
              Generate LongCat Video
            </a-button>
          </a-form>
        </div>

        <!-- Gallery Section -->
        <div class="gallery-section card">
          <div class="section-header">
            <h4><PlaySquareOutlined /> Generated Clips</h4>
            <a-button type="link" size="small" @click="loadVideos">Refresh</a-button>
          </div>
          
          <div class="video-grid" v-if="videos.length">
            <div v-for="v in videos" :key="v.id" class="video-item">
              <div class="video-preview">
                <video v-if="v.status === 'completed'" :src="v.video_url" controls></video>
                <div v-else class="video-status">
                  <a-spin v-if="v.status === 'processing'" />
                  <span>{{ v.status }}</span>
                </div>
              </div>
              <div class="video-meta">
                <span class="video-date">{{ formatDate(v.created_at) }}</span>
                <a-button type="link" size="small" :href="v.video_url" target="_blank" v-if="v.status === 'completed'">Download</a-button>
              </div>
            </div>
          </div>
          <div v-else class="empty-gallery">
            <p>No clips generated yet.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="empty-workspace" v-else>
      <div class="empty-content">
        <VideoCameraOutlined style="font-size: 64px; color: #eee" />
        <h3>Select or Create a Digital Twin</h3>
        <p>Your AI Studio Suite for hyper-realistic social media content.</p>
        <a-button type="primary" @click="showCreate = true">Create Your First Twin</a-button>
      </div>
    </div>

    <!-- Create Modal -->
    <a-modal v-model:open="showCreate" title="Create Digital Twin" @ok="create" @cancel="reset" width="600px">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="Name" required>
              <a-input v-model:value="form.name" placeholder="e.g. Professional Avatar" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="Gender">
              <a-select v-model:value="form.traits.gender">
                <a-select-option value="male">Male</a-select-option>
                <a-select-option value="female">Female</a-select-option>
                <a-select-option value="neutral">Neutral</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="Face Photo (Reference)" required>
          <a-upload 
            :before-upload="() => false" 
            :file-list="files" 
            @change="handleFile"
            accept="image/*"
            list-type="picture-card"
          >
            <div v-if="files.length === 0" class="upload-area">
              <UserOutlined />
              <div>Upload Photo</div>
            </div>
          </a-upload>
          <p class="help-text">We'll use this to generate your 3D "Sim-style" avatar and LongCat video.</p>
        </a-form-item>

        <a-form-item label="Voice Sample (For Cloning)">
          <a-upload 
            :before-upload="() => false" 
            :file-list="voiceFiles" 
            @change="handleVoiceFile"
            accept="audio/*"
          >
            <a-button><AudioOutlined /> Upload 30s-60s Sample</a-button>
          </a-upload>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Edit Traits Modal -->
    <a-modal v-model:open="showEdit" title="Edit Twin Traits" @ok="updateTwin">
      <a-form layout="vertical">
        <a-form-item label="Default Mood">
          <a-select v-model:value="editForm.traits.mood">
            <a-select-option value="professional">Professional</a-select-option>
            <a-select-option value="friendly">Friendly</a-select-option>
            <a-select-option value="energetic">Energetic</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Default Background">
          <a-input v-model:value="editForm.traits.background" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import { 
  UserOutlined, AudioOutlined, VideoCameraOutlined, 
  PlusOutlined, LeftOutlined, YoutubeOutlined, 
  InstagramOutlined, TikTokOutlined, PlaySquareOutlined 
} from '@ant-design/icons-vue'
import http from '@/utils/http'
import { useRouter } from 'vue-router'

const router = useRouter()
const twins = ref([])
const videos = ref([])
const selectedTwin = ref(null)
const showCreate = ref(false)
const showEdit = ref(false)
const generating = ref(false)
const creating = ref(false)

// Form states
const script = ref('')
const preset = ref('youtube')
const bgOverride = ref('')
const moodOverride = ref('professional')
const files = ref([])
const voiceFiles = ref([])
const faceFileObj = ref(null)
const voiceFileObj = ref(null)

const form = ref({ 
  name: '', 
  traits: { gender: 'neutral', mood: 'professional', style: 'natural' }
})

const editForm = ref({ id: null, traits: {} })

onMounted(() => load())

async function load() {
  try {
    const res = await http.get('/api/digital-twin')
    twins.value = res.data || []
    if (twins.value.length && !selectedTwin.value) {
      selectTwin(twins.value.find(t => t.is_default) || twins.value[0])
    }
  } catch (error) {
    console.error('[DigitalTwin] Load failed:', error)
    message.error('Failed to load twins')
    twins.value = []
  }
}

function selectTwin(t) {
  selectedTwin.value = t
  bgOverride.value = t.traits?.background || ''
  moodOverride.value = t.traits?.mood || 'professional'
  loadVideos()
}

async function loadVideos() {
  if (!selectedTwin.value) return
  const res = await http.get(`/api/digital-twin/${selectedTwin.value.id}/videos`)
  videos.value = res.data || []
}

function getAvatar(t) {
  // Use the generated Sim-style avatar if available, otherwise fallback to photo
  const avatarUrl = t.traits?.avatar_url
  if (avatarUrl) return avatarUrl
  return t.face_image_url || `/api/file/preview?path=${t.face_image_path}`
}

function handleFile({ fileList: fl }) {
  const file = fl[fl.length - 1]
  if (!file) return
  faceFileObj.value = file.originFileObj
  files.value = [file]
}

function handleVoiceFile({ fileList: fl }) {
  const file = fl[fl.length - 1]
  if (!file) return
  voiceFileObj.value = file.originFileObj
  voiceFiles.value = [file]
}

async function create() {
  if (creating.value) return
  if (!form.value.name || !faceFileObj.value) {
    message.error('Name and Photo are required')
    return
  }
  try {
    creating.value = true
    const fd = new FormData()
    fd.append('face_image', faceFileObj.value)
    fd.append('name', form.value.name)
    fd.append('traits', JSON.stringify(form.value.traits))
    if (voiceFileObj.value) fd.append('voice_sample', voiceFileObj.value)

    await http.post('/api/digital-twin', fd)
    message.success('Digital Twin created with Sim-style avatar!')
    showCreate.value = false
    reset()
    load()
  } catch (e) {
    message.error('Creation failed')
  } finally {
    creating.value = false
  }
}

async function genVideo() {
  if (!script.value) return message.error('Enter a script')
  try {
    generating.value = true
    await http.post(`/api/digital-twin/${selectedTwin.value.id}/generate-video`, { 
      script: script.value,
      background: bgOverride.value,
      preset: preset.value,
      traits: { ...selectedTwin.value.traits, mood: moodOverride.value }
    })
    message.success('LongCat generation started!')
    loadVideos()
  } catch (e) {
    message.error('Generation failed')
  } finally {
    generating.value = false
  }
}

function openEdit(t) {
  editForm.value = { id: t.id, traits: { ...t.traits } }
  showEdit.value = true
}

async function updateTwin() {
  await http.put(`/api/digital-twin/${editForm.value.id}`, { traits: editForm.value.traits })
  message.success('Updated')
  showEdit.value = false
  load()
}

async function setDefault(t) {
  await http.post(`/api/digital-twin/${t.id}/set-default`)
  load()
}

async function remove(t) {
  await http.delete(`/api/digital-twin/${t.id}`)
  selectedTwin.value = null
  load()
}

function reset() {
  form.value = { name: '', traits: { gender: 'neutral' } }
  files.value = []
  voiceFiles.value = []
}

function toGrace() { router.push('/grace') }
function formatDate(d) { return new Date(d).toLocaleDateString() }
</script>

<style scoped>
.studio-suite { display: flex; height: 100vh; background: #f4f7f9; }

/* Sidebar */
.studio-sidebar { width: 300px; background: white; border-right: 1px solid #e1e8ed; display: flex; flex-direction: column; }
.sidebar-header { padding: 20px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
.sidebar-header h2 { margin: 0; font-size: 18px; }
.avatar-list { flex: 1; overflow-y: auto; padding: 10px; }
.avatar-item { display: flex; align-items: center; padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom: 8px; transition: all 0.2s; }
.avatar-item:hover { background: #f9f9f9; }
.avatar-item.active { background: #e6f7ff; border: 1px solid #91d5ff; }
.avatar-thumb { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; margin-right: 12px; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.avatar-info { display: flex; flex-direction: column; }
.avatar-name { font-weight: 600; font-size: 14px; }

/* Workspace */
.studio-workspace { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
.workspace-header { padding: 24px; background: white; border-bottom: 1px solid #e1e8ed; display: flex; justify-content: space-between; align-items: center; }
.twin-identity { display: flex; align-items: center; }
.identity-avatar { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; margin-right: 16px; }
.identity-text h3 { margin: 0; font-size: 20px; }
.identity-text p { margin: 0; color: #8c8c8c; font-size: 12px; }

.workspace-grid { padding: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.section-header h4 { margin: 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }

.script-input { font-family: inherit; font-size: 14px; border-radius: 8px; background: #fafafa; }
.gen-btn { margin-top: 16px; height: 50px; font-weight: 600; }

/* Gallery */
.video-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.video-item { background: #f9f9f9; border-radius: 8px; overflow: hidden; }
.video-preview { aspect-ratio: 16/9; background: #000; display: flex; align-items: center; justify-content: center; }
.video-preview video { width: 100%; height: 100%; }
.video-status { color: white; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.video-meta { padding: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }

.empty-workspace { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; }
.help-text { font-size: 12px; color: #8c8c8c; margin-top: 4px; }
</style>
