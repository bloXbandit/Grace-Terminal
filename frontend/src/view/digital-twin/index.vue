<template>
  <div class="twin-page">
    <div class="twin-header">
      <a-button @click="toGrace" style="margin-right: 10px;">← Back to Chat</a-button>
      <h1>Digital Twin <a-tag color="blue">LongCat AI</a-tag></h1>
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
          <div class="twin-info">
            <strong>{{ t.name }}</strong>
            <div class="twin-stats">
              <a-tag size="small">{{ t.videos_generated || 0 }} videos</a-tag>
              <a-tag v-if="t.voice_cloned" color="green" size="small">Voice Cloned</a-tag>
            </div>
          </div>
        </div>
        <div class="twin-actions">
          <a-button size="small" type="primary" @click="openVideo(t)">Generate</a-button>
          <a-button size="small" @click="openEdit(t)">Edit Traits</a-button>
          <a-dropdown>
            <template #overlay>
              <a-menu>
                <a-menu-item v-if="!t.is_default" @click="setDefault(t)">Set Default</a-menu-item>
                <a-menu-item danger @click="remove(t)">Delete</a-menu-item>
              </a-menu>
            </template>
            <a-button size="small">More</a-button>
          </a-dropdown>
        </div>
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
            <p><strong>LongCat Requirements:</strong> Clear, front-facing photo with neutral lighting.</p>
          </div>
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
          <div class="upload-guide">
            <p>Using <strong>Fish Audio</strong> for hyper-realistic voice cloning.</p>
          </div>
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
            <a-select-option value="calm">Calm</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Default Background">
          <a-input v-model:value="editForm.traits.background" placeholder="e.g. A modern office, a cozy library" />
        </a-form-item>
        <a-form-item label="Movement Style">
          <a-select v-model:value="editForm.traits.style">
            <a-select-option value="natural">Natural</a-select-option>
            <a-select-option value="expressive">Expressive</a-select-option>
            <a-select-option value="minimal">Minimal</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Video Generation Modal -->
    <a-modal v-model:open="showVideo" title="Generate LongCat Video" @ok="genVideo" :confirmLoading="generating">
      <div class="video-gen-preview" v-if="selectedTwin">
        <img :src="getImg(selectedTwin)" class="preview-thumb" />
        <div class="preview-info">
          <strong>{{ selectedTwin.name }}</strong>
          <p>Model: LongCat-Video-Avatar (fal.ai)</p>
        </div>
      </div>
      <a-form-item label="Script / Speech Content">
        <a-textarea 
          v-model:value="script" 
          placeholder="What should your twin say? LongCat supports up to 5 minutes of stable video." 
          :rows="6"
        />
      </a-form-item>
      <a-form-item label="Scene Override (Optional)">
        <a-input v-model:value="bgOverride" placeholder="e.g. Standing in front of a sunset" />
      </a-form-item>
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
const showEdit = ref(false)
const showVideo = ref(false)
const files = ref([])
const voiceFiles = ref([])
const faceFileObj = ref(null)
const voiceFileObj = ref(null)
const script = ref('')
const bgOverride = ref('')
const selectedTwin = ref(null)
const creating = ref(false)
const generating = ref(false)

const form = ref({ 
  name: '', 
  traits: { gender: 'neutral', mood: 'professional', style: 'natural' }, 
  model_type: 'longcat' 
})

const editForm = ref({
  id: null,
  traits: { mood: 'professional', background: '', style: 'natural' }
})

onMounted(() => load())

async function load() {
  try {
    console.log('[DigitalTwin] Loading twins...');
    const res = await http.get('/api/digital-twin');
    console.log('[DigitalTwin] API response:', res);
    console.log('[DigitalTwin] res.data:', res.data);
    console.log('[DigitalTwin] res.data type:', typeof res.data, Array.isArray(res.data));
    
    // Handle different response formats
    if (res.data && Array.isArray(res.data)) {
      twins.value = res.data;
    } else if (res.data && res.data.data && Array.isArray(res.data.data)) {
      twins.value = res.data.data;
    } else if (Array.isArray(res)) {
      twins.value = res;
    } else {
      twins.value = [];
    }
    
    console.log('[DigitalTwin] twins.value set to:', twins.value);
  } catch (error) {
    console.error('[DigitalTwin] Load failed:', error);
    message.error('Failed to load twins');
    twins.value = [];
  }
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
  if (!raw) return
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
  if (!raw) return
  voiceFiles.value = [file]
  voiceFileObj.value = raw
}

async function create() {
  if (creating.value) return
  if (!form.value.name || !files.value.length) {
    message.error('Name and Face Photo are required')
    return
  }

  try {
    creating.value = true
    const fd = new FormData()
    fd.append('face_image', faceFileObj.value)
    fd.append('name', form.value.name)
    fd.append('traits', JSON.stringify(form.value.traits))
    fd.append('model_type', 'longcat')
    
    if (voiceFileObj.value) {
      fd.append('voice_sample', voiceFileObj.value)
    }

    await http.post('/api/digital-twin', fd)
    message.success('Digital Twin created successfully')
    showCreate.value = false
    reset()
    load()
  } catch (e) {
    message.error(e?.response?.data?.msg || 'Failed to create twin')
  } finally {
    creating.value = false
  }
}

function openEdit(t) {
  selectedTwin.value = t
  editForm.value = {
    id: t.id,
    traits: { ...t.traits }
  }
  showEdit.value = true
}

async function updateTwin() {
  try {
    await http.put(`/api/digital-twin/${editForm.value.id}`, {
      traits: editForm.value.traits
    })
    message.success('Traits updated')
    showEdit.value = false
    load()
  } catch (e) {
    message.error('Update failed')
  }
}

function openVideo(t) {
  selectedTwin.value = t
  script.value = ''
  bgOverride.value = t.traits?.background || ''
  showVideo.value = true
}

async function genVideo() {
  if (!script.value) {
    message.error('Please enter a script')
    return
  }
  try {
    generating.value = true
    await http.post(`/api/digital-twin/${selectedTwin.value.id}/generate-video`, { 
      script: script.value,
      background: bgOverride.value
    })
    message.success('LongCat generation started. This may take a few minutes.')
    showVideo.value = false
  } catch (e) {
    message.error(e?.response?.data?.msg || 'Generation failed')
  } finally {
    generating.value = false
  }
}

function reset() {
  form.value = { name: '', traits: { gender: 'neutral', mood: 'professional', style: 'natural' }, model_type: 'longcat' }
  files.value = []
  voiceFiles.value = []
  faceFileObj.value = null
  voiceFileObj.value = null
}

function toGrace() { router.push('/grace') }

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
.twin-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
.twin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
.empty { text-align: center; padding: 100px; background: #fafafa; border-radius: 12px; }
.twin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
.twin-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); transition: transform 0.2s; }
.twin-card:hover { transform: translateY(-4px); }
.twin-card.default { border: 2px solid #1890ff; }
.twin-img { width: 100%; height: 220px; object-fit: cover; }
.twin-body { padding: 16px; }
.twin-info { display: flex; flex-direction: column; gap: 4px; }
.twin-stats { display: flex; gap: 8px; margin-top: 4px; }
.twin-actions { padding: 12px 16px; border-top: 1px solid #f0f0f0; display: flex; gap: 8px; }
.upload-area { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 104px; }
.upload-guide { margin-top: 8px; font-size: 12px; color: #8c8c8c; }
.video-gen-preview { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; padding: 12px; background: #f9f9f9; border-radius: 8px; }
.preview-thumb { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; }
</style>
