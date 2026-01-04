<template>
  <div class="assistant-page">
    <!-- Header -->
    <div class="assistant-header">
      <div class="header-left">
        <a-button type="text" @click="goBack" class="back-btn">
          <template #icon><arrow-left-outlined /></template>
          Back
        </a-button>
        <h1 class="page-title">My Assistant</h1>
      </div>
      <div class="header-right">
        <span class="grace-status">
          <span class="status-dot"></span>
          Grace Online
        </span>
      </div>
    </div>

    <!-- Desktop: 4-Panel Grid / Mobile: Tabs -->
    <div class="assistant-content">
      <!-- Mobile Tabs -->
      <a-tabs v-if="isMobile" v-model:activeKey="activeTab" class="mobile-tabs">
        <a-tab-pane key="howtos" tab="📚 How-to's" />
        <a-tab-pane key="calendar" tab="📅 Calendar" />
        <a-tab-pane key="memories" tab="🧠 Memories" />
        <a-tab-pane key="news" tab="📰 My News" />
      </a-tabs>

      <!-- Content Grid -->
      <div class="dashboard-grid" :class="{ 'mobile-single': isMobile }">
        
        <!-- HOW-TO'S PANEL -->
        <div class="panel howtos-panel" v-show="!isMobile || activeTab === 'howtos'">
          <div class="panel-header">
            <h2>📚 Grace Tips & Best Practices</h2>
          </div>
          <div class="panel-content">
            <a-collapse v-model:activeKey="howtosExpanded" ghost>
              <a-collapse-panel v-for="section in howtoSections" :key="section.key" :header="section.title">
                <div class="howto-list">
                  <div v-for="tip in section.tips" :key="tip.id" class="howto-item">
                    <span class="tip-emoji">{{ tip.emoji }}</span>
                    <div class="tip-content">
                      <strong>{{ tip.title }}</strong>
                      <p>{{ tip.description }}</p>
                    </div>
                  </div>
                </div>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </div>

        <!-- CALENDAR PANEL -->
        <div class="panel calendar-panel" v-show="!isMobile || activeTab === 'calendar'">
          <div class="panel-header">
            <h2>📅 Calendar</h2>
            <a-button v-if="!calendarConnected" type="primary" size="small" @click="connectCalendar">
              Connect Gmail
            </a-button>
            <a-tag v-else color="green">Connected</a-tag>
          </div>
          <div class="panel-content">
            <a-calendar v-model:value="calendarDate" :fullscreen="false" @select="onDateSelect">
              <template #dateCellRender="{ current }">
                <div v-if="getEventsForDate(current).length" class="calendar-events-dot"></div>
              </template>
            </a-calendar>
            
            <div class="calendar-events">
              <h4>{{ selectedDateLabel }}</h4>
              <div v-if="selectedDateEvents.length === 0" class="no-events">
                <p>No events scheduled</p>
                <a-button size="small" @click="askGraceToSchedule">Ask Grace to schedule something</a-button>
              </div>
              <a-list v-else :data-source="selectedDateEvents" size="small">
                <template #renderItem="{ item }">
                  <a-list-item>
                    <a-list-item-meta :title="item.title" :description="item.time" />
                  </a-list-item>
                </template>
              </a-list>
            </div>
          </div>
        </div>

        <!-- MEMORIES PANEL -->
        <div class="panel memories-panel" v-show="!isMobile || activeTab === 'memories'">
          <div class="panel-header">
            <h2>🧠 Memories</h2>
            <a-button type="primary" size="small" @click="showAddMemory = true">
              <template #icon><plus-outlined /></template>
              Add
            </a-button>
          </div>
          <div class="panel-content">
            <a-input-search 
              v-model:value="memorySearch" 
              placeholder="Search memories..." 
              class="memory-search"
              @search="searchMemories"
            />
            
            <div v-if="memories.length === 0" class="no-memories">
              <p>No memories saved yet</p>
              <p class="hint">Say "Remember that..." to Grace to save context</p>
            </div>
            
            <a-list v-else :data-source="filteredMemories" size="small" class="memory-list">
              <template #renderItem="{ item }">
                <a-list-item class="memory-item">
                  <template #actions>
                    <a-button type="text" size="small" @click="togglePin(item)">
                      <star-filled v-if="item.pinned" style="color: #faad14" />
                      <star-outlined v-else />
                    </a-button>
                    <a-button type="text" size="small" danger @click="deleteMemory(item)">
                      <delete-outlined />
                    </a-button>
                  </template>
                  <a-list-item-meta>
                    <template #title>
                      <span class="memory-title">{{ item.title }}</span>
                    </template>
                    <template #description>
                      <p class="memory-content">{{ item.content }}</p>
                      <div class="memory-tags" v-if="item.tags?.length">
                        <a-tag v-for="tag in item.tags" :key="tag" size="small">{{ tag }}</a-tag>
                      </div>
                    </template>
                  </a-list-item-meta>
                </a-list-item>
              </template>
            </a-list>
          </div>
        </div>

        <!-- NEWS PANEL -->
        <div class="panel news-panel" v-show="!isMobile || activeTab === 'news'">
          <div class="panel-header">
            <h2>📰 My News</h2>
            <a-button type="text" size="small" @click="refreshNews" :loading="newsLoading">
              <template #icon><reload-outlined /></template>
            </a-button>
          </div>
          <div class="panel-content">
            <div class="news-interests">
              <a-tag 
                v-for="interest in interests" 
                :key="interest"
                closable 
                @close="removeInterest(interest)"
                class="interest-tag"
              >
                {{ interest }}
              </a-tag>
              <a-input
                v-if="showAddInterest"
                v-model:value="newInterest"
                size="small"
                style="width: 100px"
                @pressEnter="addInterest"
                @blur="showAddInterest = false"
                placeholder="Add topic"
                ref="interestInput"
              />
              <a-button v-else type="dashed" size="small" @click="showAddInterest = true">
                <plus-outlined /> Add Interest
              </a-button>
            </div>
            
            <a-divider style="margin: 12px 0" />
            
            <div v-if="newsLoading" class="news-loading">
              <a-spin />
              <p>Fetching latest news...</p>
            </div>
            
            <div v-else-if="newsItems.length === 0" class="no-news">
              <p>No news yet</p>
              <a-button size="small" @click="refreshNews">Load News</a-button>
            </div>
            
            <a-list v-else :data-source="newsItems" size="small" class="news-list">
              <template #renderItem="{ item }">
                <a-list-item class="news-item" @click="openNews(item)">
                  <a-list-item-meta>
                    <template #title>
                      <a :href="item.url" target="_blank" class="news-title">{{ item.title }}</a>
                    </template>
                    <template #description>
                      <div class="news-meta">
                        <span class="news-source">{{ item.source }}</span>
                        <span class="news-time">{{ formatTime(item.publishedAt) }}</span>
                      </div>
                      <p v-if="item.summary" class="news-summary">{{ item.summary }}</p>
                    </template>
                  </a-list-item-meta>
                </a-list-item>
              </template>
            </a-list>
          </div>
        </div>

      </div>
    </div>

    <!-- Add Memory Modal -->
    <a-modal v-model:open="showAddMemory" title="Add Memory" @ok="saveNewMemory" @cancel="showAddMemory = false">
      <a-form layout="vertical">
        <a-form-item label="Title">
          <a-input v-model:value="newMemory.title" placeholder="Memory title" />
        </a-form-item>
        <a-form-item label="Content">
          <a-textarea v-model:value="newMemory.content" placeholder="What should Grace remember?" :rows="4" />
        </a-form-item>
        <a-form-item label="Tags (comma separated)">
          <a-input v-model:value="newMemory.tagsInput" placeholder="work, project, preference" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { message } from 'ant-design-vue'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  ReloadOutlined
} from '@ant-design/icons-vue'

const router = useRouter()

// Responsive
const isMobile = ref(window.innerWidth <= 768)
const activeTab = ref('howtos')

const handleResize = () => {
  isMobile.value = window.innerWidth <= 768
}

onMounted(async () => {
  console.log('[Assistant] Component mounted')
  window.addEventListener('resize', handleResize)
  
  try {
    await loadMemories()
    
    // Call calendar API directly - loadCalendarEvents() wasn't executing
    const calRes = await fetch('/api/assistant/calendar/events')
    const calData = await calRes.json()
    if (calData.success) {
      calendarEvents.value = calData.events || []
      console.log(`[Calendar] Loaded ${calendarEvents.value.length} events`)
    }
    
    await refreshNews()
  } catch (error) {
    console.error('[Assistant] Error during mount:', error)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

const goBack = () => router.push('/grace')

// ============================================================================
// HOW-TO'S SECTION
// ============================================================================
const howtosExpanded = ref(['getting-started'])

const howtoSections = ref([
  {
    key: 'getting-started',
    title: '🚀 Getting Started',
    tips: [
      { id: 1, emoji: '💬', title: 'Natural Conversation', description: 'Just type naturally - Grace understands context and intent. No special commands needed!' },
      { id: 2, emoji: '📎', title: 'File Uploads', description: 'Drag & drop files or click the attachment icon. Grace can read PDFs, images, docs, and code files.' },
      { id: 3, emoji: '🎯', title: 'Be Specific', description: 'The more details you give, the better results. Include format, length, style preferences.' },
    ]
  },
  {
    key: 'media-creation',
    title: '🎨 Images & Videos',
    tips: [
      { id: 4, emoji: '📸', title: 'Image Generation', description: 'Say "make a photo of..." or "create an image of...". Add style hints like "cartoon", "realistic", "oil painting".' },
      { id: 5, emoji: '🎬', title: 'Video Generation (Sora)', description: 'Say "create a 4 second video of...". Supported durations: 4, 8, or 12 seconds. Specify landscape/portrait.' },
      { id: 6, emoji: '⏱️', title: 'Video Tips', description: 'Keep prompts simple and visual. Describe the scene, motion, and mood. Example: "A golden retriever running on a beach at sunset"' },
    ]
  },
  {
    key: 'documents',
    title: '📄 Documents & Files',
    tips: [
      { id: 7, emoji: '📝', title: 'Word Docs', description: 'Say "create a Word doc about..." and Grace generates professional documents with proper formatting.' },
      { id: 8, emoji: '📊', title: 'Spreadsheets', description: 'Ask for Excel files with data, formulas, charts. Be specific about columns and calculations needed.' },
      { id: 9, emoji: '💻', title: 'Code Files', description: 'Request any programming language. Grace writes, explains, and can execute Python code.' },
    ]
  },
  {
    key: 'voice-tips',
    title: '🎤 Voice Mode',
    tips: [
      { id: 10, emoji: '🎙️', title: 'Voice Input', description: 'Click the microphone button to speak. Grace transcribes and responds to your voice.' },
      { id: 11, emoji: '🔊', title: 'Voice Output', description: 'Grace can speak responses back to you. Great for hands-free interaction!' },
      { id: 12, emoji: '🔄', title: 'Refresh After Voice Tasks', description: 'If Grace executes code via voice, refresh the page to see generated files. This is a known quirk!' },
    ]
  },
  {
    key: 'pro-tips',
    title: '⚡ Pro Tips',
    tips: [
      { id: 17, emoji: '⚙️', title: 'Default Chat Model', description: 'For fast, high-quality general chat, set your default model to Gemini Preview 3 or Claude Sonnet 4.5.' },
      { id: 18, emoji: '🪄', title: 'Face Swap', description: 'Upload 2 photos, then say "swap faces". Default is photo 1 (source face) → photo 2 (target image). Say "reverse" to swap the other way.' },
      { id: 13, emoji: '🧠', title: 'Memory Commands', description: 'Say "Remember that I prefer..." to save preferences. Grace will use this context in future chats.' },
      { id: 14, emoji: '🔍', title: 'Web Research', description: 'Ask Grace to "search for..." or "research..." for current information from the web.' },
      { id: 15, emoji: '📁', title: 'File Explorer', description: 'Click the folder icon to browse all files Grace has created for you.' },
      { id: 16, emoji: '⌨️', title: 'Keyboard Shortcuts', description: 'Enter to send, Shift+Enter for new line. Ctrl/Cmd+K for quick actions.' },
    ]
  }
])

// ============================================================================
// CALENDAR SECTION
// ============================================================================
const calendarConnected = ref(false)
const calendarDate = ref(dayjs())
const calendarEvents = ref([])

const selectedDateLabel = computed(() => {
  return calendarDate.value.format('MMMM D, YYYY')
})

const selectedDateEvents = computed(() => {
  const dateStr = calendarDate.value.format('YYYY-MM-DD')
  return calendarEvents.value.filter(e => e.date === dateStr)
})

const getEventsForDate = (date) => {
  const dateStr = dayjs(date).format('YYYY-MM-DD')
  const events = calendarEvents.value.filter(e => e.date === dateStr)
  if (events.length > 0) {
    console.log(`[Calendar] Events for ${dateStr}:`, events)
  }
  return events
}

const onDateSelect = (date) => {
  calendarDate.value = date
}

const connectCalendar = async () => {
  // Placeholder for Google OAuth flow
  message.info('Google Calendar connection coming soon!')
  // TODO: Implement OAuth flow
  // window.location.href = '/api/auth/google/calendar'
}

const askGraceToSchedule = () => {
  router.push('/grace')
  // Could emit event to pre-fill chat
}

// ============================================================================
// MEMORIES SECTION
// ============================================================================
const memories = ref([])
const memorySearch = ref('')
const showAddMemory = ref(false)
const newMemory = ref({ title: '', content: '', tagsInput: '' })

const filteredMemories = computed(() => {
  const search = memorySearch.value.toLowerCase()
  let result = memories.value
  if (search) {
    result = result.filter(m => 
      m.title?.toLowerCase().includes(search) || 
      m.content?.toLowerCase().includes(search)
    )
  }
  // Sort: pinned first, then by date
  return result.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
})

const loadMemories = async () => {
  try {
    const res = await fetch('/api/assistant/memories')
    const data = await res.json()
    if (data.success) {
      memories.value = data.memories || []
    }
  } catch (e) {
    console.error('Failed to load memories:', e)
  }
}

const loadCalendarEvents = async (showNotification = false) => {
  try {
    // Store previous events for comparison
    const previousEvents = [...calendarEvents.value]
    
    const res = await fetch('/api/assistant/calendar/events')
    const data = await res.json()
    if (data.success) {
      const newEvents = data.events || []
      calendarEvents.value = newEvents
      console.log(`Loaded ${calendarEvents.value.length} calendar events from memories`)
      
      // Show notification if requested and there are changes
      if (showNotification && previousEvents.length > 0) {
        const previousIds = new Set(previousEvents.map(e => e.id))
        const newIds = new Set(newEvents.map(e => e.id))
        
        // Check for added events
        const addedEvents = newEvents.filter(e => !previousIds.has(e.id))
        if (addedEvents.length > 0) {
          const eventTitles = addedEvents.map(e => e.title).join(', ')
          message.success(`📅 Calendar updated: ${addedEvents.length} event(s) added - ${eventTitles}`, 4)
        }
        
        // Check for removed events
        const removedEvents = previousEvents.filter(e => !newIds.has(e.id))
        if (removedEvents.length > 0) {
          const eventTitles = removedEvents.map(e => e.title).join(', ')
          message.info(`📅 Calendar updated: ${removedEvents.length} event(s) removed - ${eventTitles}`, 4)
        }
      }
    }
  } catch (e) {
    console.error('Failed to load calendar events:', e)
  }
}

const searchMemories = () => {
  // Already handled by computed
}

const togglePin = async (item) => {
  const newPinned = !item.pinned
  try {
    const res = await fetch(`/api/assistant/memories/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: newPinned })
    })
    const data = await res.json()
    if (data.success) {
      item.pinned = newPinned
      message.success(newPinned ? 'Memory pinned' : 'Memory unpinned')
    }
  } catch (e) {
    console.error('Failed to toggle pin:', e)
    message.error('Failed to update memory')
  }
}

const deleteMemory = async (item) => {
  try {
    const res = await fetch(`/api/assistant/memories/${item.id}`, {
      method: 'DELETE'
    })
    const data = await res.json()
    if (data.success) {
      memories.value = memories.value.filter(m => m.id !== item.id)
      message.success('Memory deleted')
      // Refresh calendar after deleting memory
      await loadCalendarEvents(true)
    }
  } catch (e) {
    console.error('Failed to delete memory:', e)
    message.error('Failed to delete memory')
  }
}

const saveNewMemory = async () => {
  if (!newMemory.value.title || !newMemory.value.content) {
    message.error('Please fill in title and content')
    return
  }
  
  try {
    const res = await fetch('/api/assistant/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newMemory.value.title,
        content: newMemory.value.content,
        tags: newMemory.value.tagsInput.split(',').map(t => t.trim()).filter(Boolean),
        source: 'manual'
      })
    })
    const data = await res.json()
    if (data.success) {
      memories.value.unshift(data.memory)
      showAddMemory.value = false
      newMemory.value = { title: '', content: '', tagsInput: '' }
      message.success('Memory saved!')
      // Refresh calendar after adding memory
      await loadCalendarEvents(true)
    } else {
      message.error(data.error || 'Failed to save memory')
    }
  } catch (e) {
    console.error('Failed to save memory:', e)
    message.error('Failed to save memory')
  }
}

// ============================================================================
// NEWS SECTION
// ============================================================================
const newsItems = ref([])
const newsLoading = ref(false)
const interests = ref(['Technology', 'AI', 'Programming'])
const showAddInterest = ref(false)
const newInterest = ref('')
const interestInput = ref(null)

const refreshNews = async () => {
  newsLoading.value = true
  try {
    const query = interests.value.join(',')
    const res = await fetch(`/api/assistant/news?interests=${encodeURIComponent(query)}&limit=15`)
    const data = await res.json()
    if (data.success) {
      newsItems.value = data.items || []
    }
  } catch (e) {
    console.error('Failed to load news:', e)
  } finally {
    newsLoading.value = false
  }
}

const addInterest = () => {
  if (newInterest.value.trim() && !interests.value.includes(newInterest.value.trim())) {
    interests.value.push(newInterest.value.trim())
    newInterest.value = ''
    showAddInterest.value = false
    refreshNews()
  }
}

const removeInterest = (interest) => {
  interests.value = interests.value.filter(i => i !== interest)
}

const openNews = (item) => {
  if (item.url) {
    window.open(item.url, '_blank')
  }
}

const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const date = dayjs(dateStr)
  const now = dayjs()
  const diffHours = now.diff(date, 'hour')
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  return date.format('MMM D')
}
</script>

<style scoped lang="less">
.assistant-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #1a1a1a;
}

.assistant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e8e8e8;
  background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .back-btn {
    color: #666;
    &:hover { color: #1a1a1a; }
  }

  .page-title {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    background: linear-gradient(135deg, #2c2c2c 0%, #4a4a4a 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .grace-status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #52c41a;

    .status-dot {
      width: 8px;
      height: 8px;
      background: #52c41a;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.assistant-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mobile-tabs {
  padding: 0 16px;
  border-bottom: 1px solid #e8e8e8;
}

.dashboard-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 16px;
  padding: 16px;
  overflow: hidden;

  &.mobile-single {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
  }
}

.panel {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.3s ease;

  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #f0f0f0;
    background: linear-gradient(135deg, #fafafa 0%, #ffffff 100%);

    h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #2c2c2c;
    }
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }
}

// How-to's Panel
.howto-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.howto-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  transition: background 0.2s;

  &:hover {
    background: #f0f0f0;
  }

  .tip-emoji {
    font-size: 24px;
    flex-shrink: 0;
  }

  .tip-content {
    strong {
      display: block;
      margin-bottom: 4px;
      color: #2c2c2c;
    }
    p {
      margin: 0;
      font-size: 13px;
      color: #666;
      line-height: 1.5;
    }
  }
}

// Calendar Panel
.calendar-events {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;

  h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #2c2c2c;
  }
}

.calendar-events-dot {
  width: 6px;
  height: 6px;
  background: #1890ff;
  border-radius: 50%;
  margin: 2px auto 0;
}

.no-events {
  text-align: center;
  color: #999;
  padding: 16px;

  p { margin-bottom: 12px; }
}

// Memories Panel
.memory-search {
  margin-bottom: 16px;
}

.no-memories {
  text-align: center;
  color: #999;
  padding: 24px;

  .hint {
    font-size: 12px;
    color: #bbb;
    margin-top: 8px;
  }
}

.memory-list {
  .memory-item {
    border-bottom: 1px solid #f5f5f5;
    
    &:last-child {
      border-bottom: none;
    }
  }

  .memory-title {
    font-weight: 500;
    color: #2c2c2c;
  }

  .memory-content {
    margin: 4px 0 8px;
    font-size: 13px;
    color: #666;
    line-height: 1.4;
  }

  .memory-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
}

// News Panel
.news-interests {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;

  .interest-tag {
    background: linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 100%);
    border: none;
  }
}

.news-loading {
  text-align: center;
  padding: 32px;
  color: #999;
}

.no-news {
  text-align: center;
  color: #999;
  padding: 24px;
}

.news-list {
  .news-item {
    cursor: pointer;
    border-bottom: 1px solid #f5f5f5;
    transition: background 0.2s;

    &:hover {
      background: #fafafa;
    }

    &:last-child {
      border-bottom: none;
    }
  }

  .news-title {
    font-weight: 500;
    color: #2c2c2c;
    text-decoration: none;

    &:hover {
      color: #1890ff;
    }
  }

  .news-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #999;
    margin-bottom: 4px;
  }

  .news-summary {
    margin: 8px 0 0;
    font-size: 13px;
    color: #666;
    line-height: 1.4;
  }
}

// Chrome/Silver Theme Accents
.panel-header {
  h2 {
    position: relative;
    
    &::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 0;
      width: 40px;
      height: 3px;
      background: linear-gradient(90deg, #c0c0c0 0%, #808080 100%);
      border-radius: 2px;
    }
  }
}

// Scrollbar styling
.panel-content {
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: #f5f5f5;
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb {
    background: #d0d0d0;
    border-radius: 3px;
    
    &:hover {
      background: #b0b0b0;
    }
  }
}

// Mobile responsiveness
@media (max-width: 768px) {
  .assistant-header {
    padding: 12px 16px;

    .page-title {
      font-size: 20px;
    }
  }

  .dashboard-grid {
    padding: 12px;
  }

  .panel {
    .panel-header {
      padding: 12px;
    }
    .panel-content {
      padding: 12px;
    }
  }
}
</style>
