<template>
  <div class="chat-header">
    <div class="header-left">
      <h1 class="chat-title">{{ title }}</h1>
    </div>

    <div class="header-right">
      <!-- <div class="share-btn" @click="$emit('share')">
        <Share />
        <span style="min-width: max-content;">{{ $t('lemon.chatHeader.share') }}</span>
      </div> -->
      <div class="search-file-btn btn ">
        <a-tooltip :title="$t('lemon.chatHeader.viewAllFiles')" placement="bottom" :arrow="false">
          <SearchFile @click="handleFileExplorer" />
        </a-tooltip>
      </div>
      <!-- <div class="collect-btn btn" @click="handleCollect" :class="{ 'favorite': isFavorite }">
        <a-tooltip :title="favoriteTitle" placement="bottom" :arrow="false">
          <Collect @click="$emit('collect')" />
        </a-tooltip>
      </div> -->
      <div class="voice-btn btn" v-if="isVoiceEnabled" @click="handleVoiceToggle" :class="{ 'active': isVoiceSessionActive }">
        <a-tooltip title="Voice" placement="bottom" :arrow="false">
          <Microphone />
        </a-tooltip>
      </div>
      <div class="more-btn btn" @click="handleMore">
        <a-tooltip :title="$t('lemon.chatHeader.moreOptions')" placement="bottom" :arrow="false">
          <More />
        </a-tooltip>
        <div class="more-menu" v-if="showMore">
          <div class="edit-name" @click="handleEditName">
            <Edit />
            <span>{{ $t('lemon.chatHeader.rename') }}</span>
            <div style="width: 16px; height: 16px;"></div>
          </div>
        </div>
      </div>
    </div>
    <a-modal 
      v-model:open="open" 
      :title="$t('lemon.chatHeader.editTitle')" 
      centered  
      :width="400" 
      class="edit-title-modal" 
      :footer="null"
    > 
      <span class="edit-title">{{ $t('lemon.chatHeader.enterNewTitle') }}</span>
      <a-input v-model:value="titleValue" class="edit-title-input" />
      <footer>
        <div class="footer-btn">
          <div class="cancel-btn" @click="handleCancel">{{ $t('lemon.chatHeader.cancel') }}</div>
          <div class="confirm-btn" @click="handleOk">{{ $t('lemon.chatHeader.confirm') }}</div>
        </div>
      </footer>
    </a-modal>
  </div>
</template>

<script setup>
import emitter from '@/utils/emitter'
import { ShareAltOutlined, ToolOutlined } from '@ant-design/icons-vue'
import workspaceService from '@/services/workspace'
import { useChatStore } from '@/store/modules/chat'
import Share from '@/assets/svg/share.svg'
import Collect from '@/assets/svg/collect.svg'
import SearchFile from '@/assets/svg/searchFile.svg'
import { useI18n } from 'vue-i18n'
import More from '@/assets/svg/more.svg'
import Microphone from '@/assets/svg/microphone.svg'
import Edit from '@/assets/svg/edit.svg'
const { t } = useI18n()
import { ref, onMounted, onUnmounted, computed } from 'vue'

const handleTerminal = () => {
  emitter.emit('preview-close', false)
  emitter.emit('terminal-visible', true)
}
const handleFileExplorer = () => {
  emitter.emit('file-explorer-visible', true)
}

import { storeToRefs } from 'pinia'
const chatStore = useChatStore()
const { chat } = storeToRefs(chatStore)

const props = defineProps({
  title: {
    type: String,
    default: ''
  }
})

const titleValue = ref('')
const showMore = ref(false)

const isFavorite = computed(() => chat.value.is_favorite)
const favoriteTitle = computed(() => isFavorite.value ? t('lemon.chatHeader.unfavorite') : t('lemon.chatHeader.favorite'))
const handleCollect = () => {
  if (isFavorite.value) {
    chatStore.unfavorite()
  } else {
    chatStore.favorite()
  }
}
const handleMore = () => {
  showMore.value = !showMore.value
}

const open = ref(false)

const handleEditName = () => {
  open.value = true
  titleValue.value = chatStore.chat.title;
}

const handleOk = () => {
  open.value = false
  chatStore.updateConversationTitle(titleValue.value)
}

const handleCancel = () => {
  open.value = false
}

const isVoiceEnabled = ref(import.meta.env.VITE_VOICE_ENABLED === 'true')
const voiceState = ref('IDLE') // IDLE | LISTENING | PROCESSING | SPEAKING
const isVoiceSessionActive = ref(false) // Whether session is active (for button styling)

// Voice session refs
let mediaRecorder = null
let audioChunks = []
let audioContext = null
let analyser = null
let microphone = null
let micStream = null // Preserve the raw stream for barge-in
let silenceTimer = null
let recordingStartTime = null
let currentAudio = null
let abortController = null

// VAD settings
const SILENCE_THRESHOLD = 0.01 // Energy threshold for silence
const SILENCE_DURATION = 500 // ms of silence before auto-stop (reduced from 1200ms)
const MIN_RECORDING_DURATION = 800 // ms minimum recording
const MIN_BLOB_SIZE = 5000 // bytes minimum to send to Whisper

const handleVoiceToggle = () => {
  console.log('[Voice] Button clicked, state:', voiceState.value)
  console.log('[Voice] Chat ID:', chatStore.conversationId)
  
  if (voiceState.value === 'IDLE') {
    startVoiceSession()
  } else {
    // Any other state means we're in a session - end it
    endVoiceSession()
  }
}

// Voice session management
const startVoiceSession = async () => {
  try {
    voiceState.value = 'LISTENING'
    isVoiceSessionActive.value = true
    emitter.emit('voice-status', { status: 'listening' })
    
    // Get microphone stream and preserve it
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    
    // Setup MediaRecorder
    mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })
    audioChunks = []
    recordingStartTime = Date.now()
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data)
      }
    }
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
      await processAudio(audioBlob)
    }
    
    // Setup AudioContext for VAD
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    analyser = audioContext.createAnalyser()
    microphone = audioContext.createMediaStreamSource(micStream)
    analyser.smoothingTimeConstant = 0.8
    analyser.fftSize = 256
    microphone.connect(analyser)
    
    // Start recording
    mediaRecorder.start(100) // Collect data every 100ms
    startVADLoop()
    
  } catch (error) {
    console.error('Error accessing microphone:', error)
    emitter.emit('voice-status', { status: 'error', message: 'Microphone access denied' })
    endVoiceSession()
  }
}

const endVoiceSession = () => {
  console.log('[Voice] Ending voice session')
  
  // Stop recording
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  
  // Stop microphone tracks
  if (microphone) {
    microphone.disconnect()
  }
  
  // Stop the mic stream tracks
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop())
    micStream = null
  }
  
  // Close AudioContext
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close()
  }
  
  // Clear timers
  if (silenceTimer) {
    clearTimeout(silenceTimer)
    silenceTimer = null
  }
  
  // Stop current audio playback
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    URL.revokeObjectURL(currentAudio.src)
    currentAudio = null
  }
  
  // Cancel any pending requests
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  
  // Reset state
  voiceState.value = 'IDLE'
  isVoiceSessionActive.value = false
  emitter.emit('voice-status', { status: 'idle' })
  
  // Clean up refs
  mediaRecorder = null
  audioContext = null
  analyser = null
  microphone = null
  audioChunks = []
  recordingStartTime = null
}

const startVADLoop = () => {
  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  let silenceStartTime = null
  
  const checkSilence = () => {
    if (voiceState.value !== 'LISTENING') return
    
    analyser.getByteFrequencyData(dataArray)
    
    // Calculate average energy
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const normalizedEnergy = average / 255
    
    if (normalizedEnergy < SILENCE_THRESHOLD) {
      if (!silenceStartTime) {
        silenceStartTime = Date.now()
      } else if (Date.now() - silenceStartTime > SILENCE_DURATION) {
        // Check minimum recording duration
        if (Date.now() - recordingStartTime > MIN_RECORDING_DURATION) {
          stopRecordingForProcessing()
        } else {
          // Too short, reset and continue listening
          console.log('[Voice] Recording too short, continuing...')
          silenceStartTime = null
        }
      }
    } else {
      // Speech detected, reset silence timer
      silenceStartTime = null
    }
    
    // Continue VAD loop
    requestAnimationFrame(checkSilence)
  }
  
  checkSilence()
}

const stopRecordingForProcessing = () => {
  if (voiceState.value !== 'LISTENING') return
  
  console.log('[Voice] Silence detected, stopping recording')
  voiceState.value = 'PROCESSING'
  emitter.emit('voice-status', { status: 'processing' })
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
}

const processAudio = async (audioBlob) => {
  try {
    console.log('[Voice] Processing audio blob, size:', audioBlob.size)
    
    // Check minimum blob size to avoid Whisper decode errors
    if (audioBlob.size < MIN_BLOB_SIZE) {
      console.log('[Voice] Audio blob too small, discarding and continuing session')
      // Continue listening instead of ending session
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = [] // Reset chunks
      recordingStartTime = Date.now() // Reset timer
      
      // Only restart if we still have an active session and mediaRecorder
      if (isVoiceSessionActive.value && mediaRecorder && micStream && mediaRecorder.state === 'inactive') {
        // Create new MediaRecorder with the preserved stream
        mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data)
          }
        }
        
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
          await processAudio(audioBlob)
        }
        
        mediaRecorder.start(100) // Start recording again
        startVADLoop()
      }
      return
    }
    
    // Step 1: Transcribe audio
    const formData = new FormData()
    formData.append('audio', audioBlob, 'recording.webm')
    
    console.log('[Voice] Sending to transcribe endpoint')
    const transcribeResponse = await fetch('/api/voice/transcribe', {
      method: 'POST',
      body: formData
    })
    
    console.log('[Voice] Transcribe response status:', transcribeResponse.status)
    
    if (!transcribeResponse.ok) {
      const errorData = await transcribeResponse.json().catch(() => ({}))
      console.error('[Voice] Transcription error:', errorData)
      throw new Error(`Transcription failed: ${errorData.error || 'Unknown error'}`)
    }
    
    const responseData = await transcribeResponse.json()
    console.log('[Voice] Transcription response:', responseData)
    const { text } = responseData
    
    if (!text || text.trim().length === 0) {
      // Continue listening if no text
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      
      // Only restart if we still have an active session and mediaRecorder
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    }
    
    // Create abort controller for this turn
    abortController = new AbortController()
    
    // Step 2: Send to agent
    const agentResponse = await fetch('/api/agent/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Conversation-Id': chatStore.conversationId,
        'X-Voice-Task': 'true' // For rate limiting
      },
      body: JSON.stringify({
        question: text,
        conversation_id: chatStore.conversationId,
        mode: 'auto',
        responseType: 'sse'
      }),
      signal: abortController.signal
    })
    
    // Step 3: Get response and synthesize
    if (!agentResponse.ok) {
      const errText = await agentResponse.text().catch(() => '')
      throw new Error(`Agent request failed (${agentResponse.status}): ${errText || 'Unknown error'}`)
    }

    const contentType = (agentResponse.headers.get('content-type') || '').toLowerCase()
    let messageToSpeak = ''

    // /api/agent/run defaults to SSE. Its SSE payload is base64-encoded per event.
    if (contentType.includes('text/event-stream') && agentResponse.body) {
      const reader = agentResponse.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let lastAssistantContent = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by blank lines
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''

        for (const frame of frames) {
          const lines = frame.split('\n')
          const dataLine = lines.find(l => l.startsWith('data: '))
          if (!dataLine) continue

          const b64 = dataLine.slice('data: '.length).trim()
          if (!b64) continue

          let decoded = ''
          try {
            decoded = atob(b64)
          } catch (e) {
            continue
          }

          // Some tokens are JSON-stringified Message objects; others can be plain text.
          if (decoded.startsWith('{') && decoded.endsWith('}')) {
            try {
              const obj = JSON.parse(decoded)
              if (obj && typeof obj.content === 'string') {
                // Prefer the latest assistant content if present
                if (!obj.role || obj.role === 'assistant') {
                  lastAssistantContent = obj.content
                }
              }
            } catch (e) {
              // ignore
            }
          } else {
            // Collect plain text fragments as fallback, but filter out protocol markers
            if (!decoded.includes('lemon mode') && 
                !decoded.includes('__lemon_') && 
                !decoded.includes('PID:') && 
                !decoded.includes('event: message') &&
                decoded.trim().length > 0) {
              messageToSpeak += decoded
            }
          }
        }
      }

      messageToSpeak = (lastAssistantContent || messageToSpeak || '').trim()
    } else {
      // Fallback: non-SSE response
      const responseText = await agentResponse.text()
      console.log('[Voice] Raw agent response:', responseText)
      messageToSpeak = responseText
      try {
        const parsed = JSON.parse(responseText)
        if (parsed && typeof parsed.content === 'string') {
          messageToSpeak = parsed.content
        }
      } catch (e) {
        // Keep raw text if not JSON
      }
      messageToSpeak = (messageToSpeak || '').trim()
    }

    console.log('[Voice] Message before sanitization:', messageToSpeak)
    
    // Sanitize the text to remove protocol markers
    messageToSpeak = sanitizeSpokenText(messageToSpeak)
    
    console.log('[Voice] Message after sanitization:', messageToSpeak)

    if (!messageToSpeak) {
      console.log('[Voice] No valid content to speak, continuing session')
      // Continue listening if no valid content
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      
      // Only restart if we still have an active session and mediaRecorder
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    }
    
    // Step 4: Synthesize speech
    const synthesizeResponse = await fetch('/api/voice/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Conversation-Id': chatStore.conversationId
      },
      body: JSON.stringify({
        text: messageToSpeak,
        voice: 'alloy'
      }),
      signal: abortController.signal
    })
    
    if (synthesizeResponse.ok) {
      const audioBlob = await synthesizeResponse.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      currentAudio = new Audio(audioUrl)
      
      voiceState.value = 'SPEAKING'
      emitter.emit('voice-status', { status: 'speaking' })
      
      currentAudio.onplay = () => {
        voiceState.value = 'SPEAKING'
        emitter.emit('voice-status', { status: 'speaking' })
      }
      
      currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        currentAudio = null
        abortController = null
        
        // Auto-rearm for next turn
        console.log('[Voice] Speech finished, rearming for next turn')
        voiceState.value = 'LISTENING'
        emitter.emit('voice-status', { status: 'listening' })
        audioChunks = []
        recordingStartTime = Date.now()
        mediaRecorder.start(100)
        startVADLoop()
      }
      
      currentAudio.onerror = (error) => {
        console.error('[Voice] Audio playback error:', error)
        URL.revokeObjectURL(audioUrl)
        currentAudio = null
        abortController = null
        
        // Continue listening on error
        voiceState.value = 'LISTENING'
        emitter.emit('voice-status', { status: 'listening' })
        audioChunks = []
        recordingStartTime = Date.now()
        mediaRecorder.start(100)
        startVADLoop()
      }
      
      await currentAudio.play()
      
      // Start barge-in detection during playback
      setupBargeInDetection()
    } else {
      throw new Error('Speech synthesis failed')
    }
    
  } catch (error) {
    console.error('Voice processing error:', error)
    // Don't abort on AbortError (user interruption)
    if (error.name === 'AbortError') {
      console.log('[Voice] Request was aborted, likely due to barge-in or session end')
      return
    }
    
    // Continue listening on error
    voiceState.value = 'LISTENING'
    emitter.emit('voice-status', { status: 'listening' })
    audioChunks = []
    recordingStartTime = Date.now()
    
    // Only restart if we still have an active session and mediaRecorder
    if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
      mediaRecorder.start(100)
      startVADLoop()
    }
  }
}

// Text sanitization to remove protocol markers
const sanitizeSpokenText = (text) => {
  if (!text || typeof text !== 'string') return ''
  
  // Remove known protocol markers and patterns
  let sanitized = text
    .replace(/__lemon_out_end__[^]*?__/gi, '') // Remove lemon end markers
    .replace(/event:\s*message/gi, '') // Remove SSE event markers
    .replace(/data:\s*/gi, '') // Remove SSE data markers
    .replace(/PID[:\s]*\d+/gi, '') // Remove PID references
    .replace(/lemon\s+mode[^]*?(?=\n|$)/gi, '') // Remove lemon mode lines
    .replace(/action_type[^]*?(?=\n|$)/gi, '') // Remove action_type lines
    .replace(/status[^]*?(?=\n|$)/gi, '') // Remove status lines
    .replace(/\{[^}]*\}/g, '') // Remove JSON objects
    .replace(/^\s*[\d\W]+\s*$/gm, '') // Remove lines with only numbers/symbols
    .replace(/\n{3,}/g, '\n\n') // Reduce multiple newlines
    .trim()
  
  // If after sanitization we have no meaningful content, return empty
  if (sanitized.length < 10) return ''
  
  return sanitized
}

// Barge-in: detect speech during playback
const setupBargeInDetection = () => {
  if (!microphone || !analyser) return
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  let speechDetected = false
  let speechFrameCount = 0
  
  const checkForSpeech = () => {
    if (voiceState.value !== 'SPEAKING') {
      speechDetected = false
      speechFrameCount = 0
      return
    }
    
    analyser.getByteFrequencyData(dataArray)
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const normalizedEnergy = average / 255
    
    // Much higher threshold for barge-in to avoid false positives
    if (normalizedEnergy > 0.2) { // 20x higher than silence threshold (less sensitive)
      speechFrameCount++
      if (speechFrameCount > 20 && !speechDetected) { // Require 20 consecutive frames (more strict)
        speechDetected = true
        console.log('[Voice] Barge-in detected, interrupting playback')
        handleBargeIn()
      }
    } else {
      speechDetected = false
      speechFrameCount = 0
    }
    
    if (voiceState.value === 'SPEAKING') {
      requestAnimationFrame(checkForSpeech)
    }
  }
  
  checkForSpeech()
}

const handleBargeIn = () => {
  // Stop current playback
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    URL.revokeObjectURL(currentAudio.src)
    currentAudio = null
  }
  
  // Cancel any pending requests
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  
  // Immediately return to listening
  voiceState.value = 'LISTENING'
  emitter.emit('voice-status', { status: 'listening' })
  audioChunks = []
  recordingStartTime = Date.now()
  
  // Start recording again
  if (micStream) {
    // Create new MediaRecorder with the preserved stream
    mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data)
      }
    }
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
      await processAudio(audioBlob)
    }
    
    mediaRecorder.start(100)
    startVADLoop()
    setupBargeInDetection() // Restart barge-in detection
  }
}

// Handle voice interruption (legacy)
const handleVoiceInterrupt = () => {
  if (voiceState.value !== 'IDLE') {
    endVoiceSession()
  }
}

// Listen for interruption events
emitter.on('voice-interrupt', handleVoiceInterrupt)

const handleClickOutside = (event) => {
  const moreBtn = document.querySelector('.more-btn');
  if (moreBtn && !moreBtn.contains(event.target)) {
    showMore.value = false;
  }
};

// 在组件挂载时添加事件监听
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

// 在组件卸载时移除事件监听
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  // Clean up voice session
  if (voiceState.value !== 'IDLE') {
    endVoiceSession()
  }
  emitter.off('voice-interrupt', handleVoiceInterrupt)
});

defineEmits(['share'])

</script>

<style lang="scss" scoped>
.chat-header {
  padding-top: .75rem;
  padding-bottom: .25rem;
  background: #f8f8f7;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-direction: row;
  gap: 4px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.chat-title {
  font-size: 18px;
  font-weight: 500;
  color: #34322d;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, Segoe UI Variable Display, Segoe UI, Helvetica, Apple Color Emoji, Arial, sans-serif, Segoe UI Emoji, Segoe UI Symbol;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: .5rem;

  .share-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border-radius: 100px;
    gap: .25rem;
    outline: 1px solid #0000000f;
    outline-offset: -1px;
    align-items: center;
    padding: 0 .75rem;
    height: 2rem;
    cursor: pointer;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: .5rem;
    padding: 5px;
    cursor: pointer;
  }
}

.more-menu {
  position: absolute;
  right: -50px;
  top: 50px;
  background: #fff;
  border-radius: .75rem;
  cursor: pointer;
  border: 1px solid #0000001f;
  min-width: max-content;

  .edit-name {
    display: flex;
    align-items: center;
    gap: .75rem;
    border-radius: .75rem;
    padding: 12px 16px;
    cursor: pointer;
  }
}

.favorite {
  color: #efa201 !important;
  svg {
    stroke: #efa201 !important;
    fill: #efa201 !important;
  }
}

.action-btn {
  padding: 6px 12px;
  border: 1px solid #e6e6e6;
  border-radius: 4px;
  background: transparent;
  color: #1f2329;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;

  &:hover {
    background: #f5f5f5;
  }

  i {
    font-size: 16px;
  }
  
  .voice-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    
    svg {
      width: 20px;
      height: 20px;
      color: #34322d;
    }
    
    &.active {
      background: #ff4d4f;
      svg {
        color: #fff;
        animation: pulse 1.5s infinite;
      }
    }
  }
}

.status-indicator {
  padding: 4px 16px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 500;
  background-color: #e0e0e0;
  color: #757575;
}

.edit-title {
  font-size: 13px;
  font-weight: 400;
  color: #858481;
}

.edit-title-input {
  margin-top: 10px;
}

.footer-btn {
  display: flex;
  padding-top: 1.25rem;
  gap: .5rem;
  justify-content: flex-end;

  .cancel-btn {
    cursor: pointer;
    font-size: 13px;
    font-weight: 400;
    color: #535350;
    font-size: .875rem;
    line-height: 1.25rem;
    padding-top: .5rem;
    padding-bottom: .5rem;
    padding-left: .75rem;
    padding-right: .75rem;
    border: 1px solid #0000001f;
    border-radius: 10px;
  }

  .confirm-btn {
    cursor: pointer;
    font-size: 13px;
    font-weight: 400;
    background: #1a1a19;
    color: #fff;
    font-size: .875rem;
    line-height: 1.25rem;
    padding-top: .5rem;
    padding-bottom: .5rem;
    padding-left: .75rem;
    padding-right: .75rem;
    border: 1px solid #ffffff33;
    border-radius: 10px;
  }
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

@media screen and (max-width: 768px) {
  .chat-title {
    padding-inline-start: 1.75rem;
    width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .share-btn {
    outline: none !important;
    padding: 5px !important;
    width: 28px !important;
    height: 28px !important;
    display: flex !important;
    span {
      display: none;
    }
  }
  .more-menu {
    right: -10px !important;
    left: auto;
  }
}

@media (hover: hover) and (pointer: fine) {
  .share-btn:hover {
    background: #37352f14;
  }
  .btn:hover {
    background: #37352f14;
  }
  .edit-name:hover {
    background: #37352f0f;
  }
  .confirm-btn:hover {
    opacity: .85;
  }
  .cancel-btn:hover {
    background: #37352f14;
  }
}
</style>
<style lang="scss">
.edit-title-modal {
  .ant-modal-header {
    margin-bottom: 5px !important;
  }
  .ant-modal-content {
    border-radius: 20px !important;
  }
}
</style>