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
      <div class="interrupt-btn btn" v-if="isVoiceEnabled && isVoiceSessionActive" @click="handleInterruptGrace">
        <a-tooltip title="Interrupt Grace" placement="bottom" :arrow="false">
          <StopOutlined />
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
import { ShareAltOutlined, ToolOutlined, StopOutlined } from '@ant-design/icons-vue'
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

const handleInterruptGrace = () => {
  console.log('[Voice] Interrupt Grace button pressed')

  if (rearmTimeout) {
    clearTimeout(rearmTimeout)
    rearmTimeout = null
  }

  // Stop current playback
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    if (currentAudio.src) {
      URL.revokeObjectURL(currentAudio.src)
    }
    currentAudio = null
  }

  // Clear audio queue
  if (audioQueue && audioQueue.length > 0) {
    for (const item of audioQueue) {
      if (item && item.url) {
        URL.revokeObjectURL(item.url)
      }
    }
  }
  audioQueue = []
  isPlayingAudio = false

  // Reset streaming / TTS chain
  sentenceBuffer = ''
  ttsChain = Promise.resolve()
  firstAudioPending = false
  pendingTtsCount = 0
  agentStreamDone = true
  activeTurnId = null

  // Cancel any pending requests (agent stream and TTS)
  if (abortController) {
    abortController.abort()
    abortController = null
  }

  // Set last playback ended time for gating
  lastPlaybackEndedAt = Date.now()

  if (!isVoiceSessionActive.value) return

  voiceState.value = 'LISTENING'
  emitter.emit('voice-status', { status: 'listening' })

  // Rearm listening after a short delay
  setTimeout(() => {
    if (!isVoiceSessionActive.value || voiceState.value !== 'LISTENING') return

    audioChunks = []
    recordingStartTime = Date.now()

    if (micStream) {
      mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        if (!isVoiceSessionActive.value) return
        if (audioChunks.length === 0) return
        const nextBlob = new Blob(audioChunks, { type: 'audio/webm' })
        await processAudio(nextBlob)
      }

      if (mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
    }
  }, 300)

  console.log('[Voice] Grace interrupted and listening re-armed')
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
let audioQueue = []
let isPlayingAudio = false
let sentenceBuffer = ''
let ttsChain = Promise.resolve()
let firstAudioPending = false
let activeTurnId = null
let agentStreamDone = false
let pendingTtsCount = 0
let rearmTimeout = null
let bargeInRafId = null
let bargeInGraceTimeout = null
let vadRafId = null
let voiceSessionStartedAt = null
let lastPlaybackEndedAt = 0

// VAD snapshot for STT gating / self-heal
let vadLastSpeechAt = null
let vadPeakEnergy = 0
let vadDynamicSpeechThreshold = 0

// STT anti-loop state
let suspiciousTranscriptCount = 0
let lastSuspiciousResetTime = 0
let emptyTranscriptCount = 0
let lastEmptyTranscriptAt = 0

// Voice STT hard-gating constants
const MIN_STT_DURATION_MS = 300 // Minimum recording duration before calling STT
const POST_TTS_STT_BLOCK_MS = 1000 // Block STT for this long after TTS playback ends
const TWO_HIT_THRESHOLD = 2 // Require this many non-suspicious recordings after phantom

// VAD settings
const SILENCE_THRESHOLD = 0.021 // Energy threshold for silence
const SILENCE_DURATION = 250 // ms of silence before auto-stop (reduced from 1200ms)
const MIN_RECORDING_DURATION = 400 // ms minimum recording (reduced for short utterances)
const MAX_RECORDING_DURATION = 9000 // ms max recording before forced processing
const MIN_BLOB_SIZE = 2000 // bytes minimum to send to Whisper (reduced)
const POST_TTS_COOLDOWN = 800 // ms cooldown after TTS before rearming
const BARGE_IN_GRACE_PERIOD = 600 // ms grace period after TTS starts
const VOICE_START_WARMUP_MS = 2200
const FIRST_CHUNK_MIN_CHARS = 36
// Speech-start gating settings
const SPEECH_THRESHOLD = 0.02 // Energy threshold to detect speech start
const SPEECH_CONSECUTIVE_FRAMES = 3 // Number of consecutive frames above threshold to trigger speech start

// Adaptive speech-start tuning (helps when mic gain/noise floor varies)
const SPEECH_THRESHOLD_FLOOR = 0.012 // Never require more than this minimum energy to consider speech
const SPEECH_START_MARGIN = 0.018 // How far above noise floor we require before declaring speech

// Audio optimization settings
const TARGET_SAMPLE_RATE = 16000 // Target sample rate for STT
const SHORT_UTTERANCE_DURATION = 1200 // ms threshold for short utterance optimization

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
    
    // Get microphone stream with echo cancellation and noise suppression
    micStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        echoCancellation: true, 
        noiseSuppression: true, 
        autoGainControl: true 
      } 
    })

    voiceSessionStartedAt = Date.now()
    
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
      if (!isVoiceSessionActive.value) return
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

  if (rearmTimeout) {
    clearTimeout(rearmTimeout)
    rearmTimeout = null
  }

  if (bargeInGraceTimeout) {
    clearTimeout(bargeInGraceTimeout)
    bargeInGraceTimeout = null
  }

  if (bargeInRafId) {
    cancelAnimationFrame(bargeInRafId)
    bargeInRafId = null
  }

  if (vadRafId) {
    cancelAnimationFrame(vadRafId)
    vadRafId = null
  }
  
  // Stop current audio playback
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    URL.revokeObjectURL(currentAudio.src)
    currentAudio = null
  }

  // Revoke any queued audio URLs
  if (audioQueue && audioQueue.length > 0) {
    for (const item of audioQueue) {
      if (item && item.url) {
        URL.revokeObjectURL(item.url)
      }
    }
  }
  
  // Cancel any pending requests
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  
  // Reset STT anti-loop state
  suspiciousTranscriptCount = 0
  lastSuspiciousResetTime = 0
  emptyTranscriptCount = 0
  lastEmptyTranscriptAt = 0

  // Reset VAD snapshot
  vadLastSpeechAt = null
  vadPeakEnergy = 0
  vadDynamicSpeechThreshold = 0
  
  // Clear streaming state
  audioQueue = []
  isPlayingAudio = false
  sentenceBuffer = ''
  ttsChain = Promise.resolve()
  firstAudioPending = false

  activeTurnId = null
  agentStreamDone = false
  pendingTtsCount = 0

  if (rearmTimeout) {
    clearTimeout(rearmTimeout)
    rearmTimeout = null
  }

  if (bargeInGraceTimeout) {
    clearTimeout(bargeInGraceTimeout)
    bargeInGraceTimeout = null
  }
  if (bargeInRafId) {
    cancelAnimationFrame(bargeInRafId)
    bargeInRafId = null
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

// Soft-restart the recorder/VAD without re-requesting microphone permissions.
// This is used to self-heal when we get stuck in repeated empty STT results.
const softRestartListening = (reason) => {
  if (!isVoiceSessionActive.value) return
  if (!micStream || !mediaRecorder) return
  if (voiceState.value !== 'LISTENING') return

  console.log('[Voice] Soft restart listening:', reason)

  try {
    if (vadRafId) {
      cancelAnimationFrame(vadRafId)
      vadRafId = null
    }
  } catch (e) {}

  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
  } catch (e) {}

  audioChunks = []
  recordingStartTime = Date.now()

  setTimeout(() => {
    if (!isVoiceSessionActive.value) return
    if (!mediaRecorder || mediaRecorder.state !== 'inactive') return
    try {
      mediaRecorder.start(100)
      startVADLoop()
    } catch (e) {
      console.error('[Voice] Soft restart failed:', e)
    }
  }, 120)
}

const startVADLoop = () => {
  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  let silenceStartTime = null
  let speechStarted = false // Track if speech has been detected
  let consecutiveSpeechFrames = 0 // Count consecutive frames above speech threshold
  let peakEnergy = 0 // Track peak energy for short utterance detection
  let energyHistory = [] // Keep track of recent energy levels
  
  // Adaptive noise floor variables
  let noiseFloor = null
  let lastSpeechAt = null
  const NOISE_FLOOR_ALPHA = 0.98 // EMA smoothing factor
  const MIN_SILENCE_THRESHOLD = 0.008
  const MAX_SILENCE_THRESHOLD = 0.05
  const SILENCE_MARGIN = 0.01
  const SPEECH_MARGIN = 0.02
  const TRAILING_SILENCE_DURATION = 500 // ms to wait after last speech
  const STUCK_DETECTOR_THRESHOLD = 3500 // ms after which we check for stuck recording
  
  const checkSilence = () => {
    if (voiceState.value !== 'LISTENING') return

    // Fallback: if we never reach "silence" (noise floor / echo), force a turn to process.
    if (recordingStartTime && Date.now() - recordingStartTime > MAX_RECORDING_DURATION) {
      if (speechStarted) {
        console.log('[Voice] Max recording duration reached with speech detected, stopping recording')
        stopRecordingForProcessing()
      } else {
        console.log('[Voice] Max recording duration reached without speech, rearming')
        // No speech detected, just rearm without processing
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop()
        }
        // Reset and restart
        silenceStartTime = null
        speechStarted = false
        consecutiveSpeechFrames = 0
        recordingStartTime = Date.now()
        setTimeout(() => {
          if (voiceState.value === 'LISTENING' && mediaRecorder && mediaRecorder.state === 'inactive') {
            mediaRecorder.start(100)
          }
        }, 100)
      }
      return
    }
    
    analyser.getByteFrequencyData(dataArray)
    
    // Calculate average energy
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const normalizedEnergy = average / 255
    
    // Track peak energy and recent history for short utterance detection
    peakEnergy = Math.max(peakEnergy, normalizedEnergy)
    energyHistory.push(normalizedEnergy)
    if (energyHistory.length > 10) energyHistory.shift() // Keep last 10 samples
    
    // Adaptive noise floor estimation (before speech starts)
    if (!speechStarted) {
      if (noiseFloor === null) {
        noiseFloor = normalizedEnergy
      } else {
        noiseFloor = NOISE_FLOOR_ALPHA * noiseFloor + (1 - NOISE_FLOOR_ALPHA) * normalizedEnergy
      }
    }
    
    // Calculate dynamic silence threshold
    const dynamicSilenceThreshold = Math.min(Math.max(noiseFloor + SILENCE_MARGIN, MIN_SILENCE_THRESHOLD), MAX_SILENCE_THRESHOLD)

    // Calculate dynamic speech threshold for speech-start gating.
    // This prevents cases where a low-gain mic requires yelling, while still rejecting room noise.
    const dynamicSpeechThreshold = Math.max(
      SPEECH_THRESHOLD_FLOOR,
      Math.min(SPEECH_THRESHOLD, noiseFloor + SPEECH_START_MARGIN)
    )

    // Update shared VAD snapshot for STT gating / self-heal
    vadDynamicSpeechThreshold = dynamicSpeechThreshold
    vadPeakEnergy = peakEnergy
    vadLastSpeechAt = lastSpeechAt
    
    // Speech-start gating: only consider silence after we've detected speech
    if (!speechStarted) {
      if (normalizedEnergy > dynamicSpeechThreshold) {
        consecutiveSpeechFrames++
        if (consecutiveSpeechFrames >= SPEECH_CONSECUTIVE_FRAMES) {
          speechStarted = true
          console.log('[Voice] Speech started detected')
        }
      } else {
        consecutiveSpeechFrames = 0
      }
      // Don't check for silence until speech has started
      silenceStartTime = null
      lastSpeechAt = null
    } else {
      // After speech has started, track last speech time for better end-of-utterance detection
      if (normalizedEnergy > dynamicSilenceThreshold + SPEECH_MARGIN) {
        lastSpeechAt = Date.now()
      }
      
      // Stuck detector: if we've been recording for a while and energy is flat, force stop
      // But only if we've actually had real speech energy (to avoid noise blobs)
      const recordingDuration = Date.now() - recordingStartTime
      if (recordingDuration > STUCK_DETECTOR_THRESHOLD && energyHistory.length >= 5) {
        // Check if energy has been relatively flat
        const energyVariance = Math.max(...energyHistory) - Math.min(...energyHistory)
        if (energyVariance < 0.02) { // Very flat energy
          // Only trigger stuck detector if we've had real speech energy
          if (peakEnergy > (dynamicSpeechThreshold * 2) && lastSpeechAt) {
            console.log('[Voice] Stuck detector triggered: flat energy for extended period')
            stopRecordingForProcessing()
            return
          } else {
            // No real speech detected, just rearm without processing
            console.log('[Voice] Stuck detector: no real speech, rearming')
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop()
            }
            // Reset and restart
            silenceStartTime = null
            speechStarted = false
            consecutiveSpeechFrames = 0
            recordingStartTime = Date.now()
            setTimeout(() => {
              if (voiceState.value === 'LISTENING' && mediaRecorder && mediaRecorder.state === 'inactive') {
                mediaRecorder.start(100)
              }
            }, 100)
            return
          }
        }
      }
      
      // Check for trailing silence based on last speech time
      if (lastSpeechAt && (Date.now() - lastSpeechAt > TRAILING_SILENCE_DURATION)) {
        // Check minimum recording duration
        const recordingDuration = Date.now() - recordingStartTime
        
        // For short, clear utterances, allow earlier stop
        const isShortClearUtterance = recordingDuration < SHORT_UTTERANCE_DURATION && 
                                    peakEnergy > (dynamicSpeechThreshold * 2) && 
                                    energyHistory.length >= 5 &&
                                    energyHistory.slice(-3).every(e => e < dynamicSilenceThreshold)
        
        if (recordingDuration > MIN_RECORDING_DURATION || isShortClearUtterance) {
          console.log('[Voice] Trailing silence detected, stopping recording (short utterance:', isShortClearUtterance, ')')
          stopRecordingForProcessing()
        }
      } else if (normalizedEnergy < dynamicSilenceThreshold) {
        // Fallback to energy-based silence detection
        if (!silenceStartTime) {
          silenceStartTime = Date.now()
        } else if (Date.now() - silenceStartTime > SILENCE_DURATION) {
          // Check minimum recording duration
          const recordingDuration = Date.now() - recordingStartTime
          
          // For short, clear utterances, allow earlier stop
          const isShortClearUtterance = recordingDuration < SHORT_UTTERANCE_DURATION && 
                                      peakEnergy > (dynamicSpeechThreshold * 2) && 
                                      energyHistory.length >= 5 &&
                                      energyHistory.slice(-3).every(e => e < dynamicSilenceThreshold)
          
          if (recordingDuration > MIN_RECORDING_DURATION || isShortClearUtterance) {
            console.log('[Voice] Energy-based silence detected, stopping recording (short utterance:', isShortClearUtterance, ')')
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
    }
    
    // Continue VAD loop
    vadRafId = requestAnimationFrame(checkSilence)
  }

  if (vadRafId) {
    cancelAnimationFrame(vadRafId)
    vadRafId = null
  }

  checkSilence()
}

const stopRecordingForProcessing = () => {
  if (voiceState.value !== 'LISTENING') return

  // If we never saw real speech energy, don't send to STT.
  // This prevents long empty-transcript streaks when VAD false-triggers.
  const hasRealSpeech = !!vadLastSpeechAt && (vadPeakEnergy > (Math.max(vadDynamicSpeechThreshold || 0, SPEECH_THRESHOLD_FLOOR) * 2))
  if (!hasRealSpeech) {
    console.log('[Voice] No real speech detected in segment, rearming without STT')
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    audioChunks = []
    recordingStartTime = Date.now()
    if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
      setTimeout(() => {
        if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive' && voiceState.value === 'LISTENING') {
          mediaRecorder.start(100)
          startVADLoop()
        }
      }, 120)
    }
    return
  }
  
  console.log('[Voice] Silence detected, stopping recording')
  voiceState.value = 'PROCESSING'
  emitter.emit('voice-status', { status: 'processing' })
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
}

// Preprocess audio blob to optimize for STT
const preprocessAudioBlob = async (audioBlob) => {
  console.log('[Voice] Preprocessing dormant: sending original webm/opus for speed')
  return audioBlob
}

// Convert AudioBuffer to WAV blob
const bufferToWave = (audioBuffer) => {
  const length = audioBuffer.length
  const numberOfChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2)
  const view = new DataView(arrayBuffer)
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }
  
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * numberOfChannels * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numberOfChannels * 2, true)
  view.setUint16(32, numberOfChannels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * numberOfChannels * 2, true)
  
  // Write PCM data
  const channelData = audioBuffer.getChannelData(0)
  let offset = 44
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
    offset += 2
  }
  
  return new Blob([view], { type: 'audio/wav' })
}

const processAudio = async (audioBlob) => {
  try {
    const turnId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const tTurnStart = performance.now()
    console.log('[Voice] Processing audio blob, size:', audioBlob.size)
    
    // Preprocess audio for STT optimization (downsample, trim silence)
    const processedBlob = await preprocessAudioBlob(audioBlob)
    
    // Check minimum blob size to avoid Whisper decode errors
    if (processedBlob.size < MIN_BLOB_SIZE) {
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
    
    // Pre-STT hard-gating checks to reduce phantom API calls
    if (!recordingStartTime) {
      recordingStartTime = Date.now()
    }
    const recordingDuration = Date.now() - recordingStartTime
    const timeSincePlayback = Date.now() - lastPlaybackEndedAt
    const isWithinPostPlaybackBlock = timeSincePlayback < POST_TTS_STT_BLOCK_MS
    const isTooShort = recordingDuration < MIN_STT_DURATION_MS && processedBlob.size < 40000
    
    // Skip STT if recording is too short
    if (isTooShort) {
      console.log(`[Voice] STT skipped: reason=too_short duration=${recordingDuration}ms size=${processedBlob.size}`)
      // Continue listening
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    }
    
    // Skip STT if within post-playback block window
    if (isWithinPostPlaybackBlock) {
      console.log(`[Voice] STT skipped: reason=post_playback_block time_since_playback=${timeSincePlayback}ms`)
      // Continue listening
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    }
    
    // Two-hit anti-loop: check if we're in a suspicious streak
    const now = Date.now()
    if (suspiciousTranscriptCount >= TWO_HIT_THRESHOLD && (now - lastSuspiciousResetTime) < 10000) {
      console.log(`[Voice] STT skipped: reason=anti_loop suspicious_count=${suspiciousTranscriptCount}`)
      // Require one more non-suspicious recording before allowing STT
      // Continue listening without calling STT
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    }
    
    // Step 1: Transcribe audio
    const formData = new FormData()
    // Use processed blob if it's different (smaller), otherwise use original
    const blobToSend = processedBlob.size < audioBlob.size ? processedBlob : audioBlob
    const fileName = blobToSend.type.includes('wav') ? 'recording.wav' : 'recording.webm'
    formData.append('audio', blobToSend, fileName)
    
    const tSttStart = performance.now()
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
    const tSttEnd = performance.now()
    console.log('[Voice] Transcription response:', responseData)
    const { text } = responseData

    console.log(`[Voice] Turn ${turnId} STT ms:`, Math.round(tSttEnd - tSttStart))
    
    const trimmedText = (text || '').trim()

    const wordCount = trimmedText.length ? trimmedText.split(/\s+/).filter(Boolean).length : 0

    // Spurious transcript gate: discard tiny/commonly-spurious transcripts that occur
    // right after TTS playback or from tiny audio blobs (prevents phantom "you" loops)
    const isRightAfterPlayback = timeSincePlayback < 2000 // 2 seconds
    const isTinyBlob = processedBlob.size < 5000 // Very small blob
    const looksSpurious = /^(you|your|u|yeah|yes|no|ok|okay|uh|um|uhh|umm|oh|ah|eh|heh|lol|lmao|lmfao|thanks for watching)$/i.test(trimmedText)
    
    // Track suspicious transcripts for two-hit anti-loop
    const isSuspicious = (isRightAfterPlayback || isTinyBlob) && looksSpurious
    
    if (isSuspicious) {
      suspiciousTranscriptCount++
      lastSuspiciousResetTime = now
      console.log('[Voice] Discarding spurious STT transcript (likely phantom):', trimmedText, 
                  'Blob size:', processedBlob.size, 'Time since playback:', timeSincePlayback + 'ms',
                  'Suspicious count:', suspiciousTranscriptCount)
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    } else {
      // Reset suspicious counter on good transcript
      if (suspiciousTranscriptCount > 0) {
        console.log(`[Voice] Resetting suspicious transcript count: ${suspiciousTranscriptCount} -> 0`)
        suspiciousTranscriptCount = 0
      }
    }

    // Warm-up guard: discard tiny/commonly-spurious early transcripts right after session start
    // (helps prevent occasional first-turn hallucinated "Bye." when user is silent)
    if (voiceSessionStartedAt && (Date.now() - voiceSessionStartedAt) < VOICE_START_WARMUP_MS) {
      const isTiny = trimmedText.length > 0 && trimmedText.length <= 15
      const looksSpurious = /^(bye\.?|goodbye\.?|thank you( for watching)?\.?|thanks\.?|hello\.?|hey\.?|hi\.?|thanks for watching)/i.test(trimmedText)
      if (isTiny || looksSpurious) {
        console.log('[Voice] Discarding warm-up STT transcript:', trimmedText)
        voiceState.value = 'LISTENING'
        emitter.emit('voice-status', { status: 'listening' })
        audioChunks = []
        recordingStartTime = Date.now()
        if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
          mediaRecorder.start(100)
          startVADLoop()
        }
        return
      }
    }

    const lowerText = trimmedText.toLowerCase()
    const containsUrlLike = /(https?:\/\/\S+|\bwww\.[^\s]+|\b[^\s]+\.(com|org|net|io|ai|gov|edu)\b)/i.test(trimmedText)
    const containsLeakagePhrase = /\b(for more|visit|subscribe|like and subscribe|thanks for watching)\b/i.test(lowerText)
    const isVerySmallBlobForLongText = processedBlob.size < 9000 && wordCount >= 6
    const isSuspiciousPlaybackWindow = timeSincePlayback < 5000 && processedBlob.size < 14000
    if ((containsUrlLike || containsLeakagePhrase || isVerySmallBlobForLongText) && (isSuspiciousPlaybackWindow || processedBlob.size < 12000)) {
      console.log('[Voice] Discarding suspicious STT transcript (likely leakage):', trimmedText,
                  'Blob size:', processedBlob.size, 'Words:', wordCount, 'Time since playback:', timeSincePlayback + 'ms')
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    }

    // Additional filter for stubborn phantom transcripts
    if (/^(you|thanks for watching)$/i.test(trimmedText) || 
        (timeSincePlayback < 3000 && /^(u|yeah|yes|no|ok|okay)$/i.test(trimmedText))) {
      console.log('[Voice] Discarding stubborn phantom STT transcript:', trimmedText,
                  'Time since playback:', timeSincePlayback + 'ms')
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        mediaRecorder.start(100)
        startVADLoop()
      }
      return
    }
    
    // Show transcribed text to user for confirmation
    emitter.emit('voice-transcription', { text: trimmedText, timestamp: Date.now() })
    
    if (!trimmedText || trimmedText.length === 0) {
      const now = Date.now()
      if (!lastEmptyTranscriptAt || (now - lastEmptyTranscriptAt) > 4000) {
        emptyTranscriptCount = 0
      }
      emptyTranscriptCount++
      lastEmptyTranscriptAt = now

      const backoffMs = emptyTranscriptCount >= 3 ? 2000 : 700
      console.log(`[Voice] Empty STT transcript, rearming with backoff=${backoffMs}ms count=${emptyTranscriptCount}`)

      // Self-heal: if we get stuck in a long empty-transcript streak, restart recorder/VAD.
      if (emptyTranscriptCount >= 8) {
        emptyTranscriptCount = 0
        lastEmptyTranscriptAt = 0
        voiceState.value = 'LISTENING'
        emitter.emit('voice-status', { status: 'listening' })
        audioChunks = []
        recordingStartTime = Date.now()
        softRestartListening('empty_stt_streak')
        return
      }

      // Continue listening if no text (with backoff to avoid rapid loops)
      voiceState.value = 'LISTENING'
      emitter.emit('voice-status', { status: 'listening' })
      audioChunks = []
      recordingStartTime = Date.now()
      
      // Only restart if we still have an active session and mediaRecorder
      if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
        setTimeout(() => {
          if (isVoiceSessionActive.value && mediaRecorder && mediaRecorder.state === 'inactive') {
            mediaRecorder.start(100)
            startVADLoop()
          }
        }, backoffMs)
      }
      return
    }

    if (emptyTranscriptCount > 0) {
      emptyTranscriptCount = 0
      lastEmptyTranscriptAt = 0
    }
    
    // Create abort controller for this turn
    abortController = new AbortController()

    // Step 2: Prepare for Streaming
    audioQueue = []
    isPlayingAudio = false
    sentenceBuffer = ''
    ttsChain = Promise.resolve()
    firstAudioPending = true
    activeTurnId = turnId
    agentStreamDone = false
    pendingTtsCount = 0
    
    // Step 3: Send to agent
    const tAgentStart = performance.now()
    const agentResponse = await fetch('/api/agent/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Conversation-Id': chatStore.conversationId,
        'X-Voice-Task': 'true' // For rate limiting
      },
      body: JSON.stringify({
        question: trimmedText,
        conversation_id: chatStore.conversationId,
        mode: 'auto',
        responseType: 'sse'
      }),
      signal: abortController.signal
    })

    const tAgentHeaders = performance.now()
    console.log(`[Voice] Turn ${turnId} agent headers ms:`, Math.round(tAgentHeaders - tAgentStart))
    
    if (!agentResponse.ok) {
      const errText = await agentResponse.text().catch(() => '')
      throw new Error(`Agent request failed (${agentResponse.status}): ${errText || 'Unknown error'}`)
    }

    const contentType = (agentResponse.headers.get('content-type') || '').toLowerCase()

    // Helper to process text chunks for streaming TTS with micro-chunk dispatch
    let firstTokenWallTime = null
    const FIRST_CHUNK_MAX_WAIT_MS = 450

    const processTokenForTTS = async (textChunk) => {
      sentenceBuffer += textChunk

      if (firstTokenWallTime === null && sentenceBuffer.trim().length > 0) {
        firstTokenWallTime = Date.now()
      }
      
      // Micro-chunk dispatch for first audio
      if (firstAudioPending) {
        const trimmed = sentenceBuffer.trim()
        const minFirstChunkChars = 22
        const softMaxFirstChunkChars = 22
        const hardMaxFirstChunkChars = 44
        const hasMinChars = trimmed.length >= minFirstChunkChars
        const hasSafeBoundary = /([.!?,:;]\s|[\r\n])/.test(sentenceBuffer)
        const hasWordBoundary = /\s/.test(sentenceBuffer) && trimmed.length >= minFirstChunkChars

        const waitedLongEnough = firstTokenWallTime !== null && (Date.now() - firstTokenWallTime) >= FIRST_CHUNK_MAX_WAIT_MS
        
        if (hasMinChars && (hasSafeBoundary || hasWordBoundary || waitedLongEnough)) {
          let cutIndex = -1
          let cutIndexSoft = -1
          
          const safeRe = /([.!?,:;]\s|[\r\n])/g
          let match
          while ((match = safeRe.exec(sentenceBuffer)) !== null) {
            const end = match.index + match[0].length
            const candidate = sentenceBuffer.slice(0, end).trim()
            if (candidate.length >= minFirstChunkChars && candidate.length <= hardMaxFirstChunkChars) {
              cutIndex = end
              if (candidate.length <= softMaxFirstChunkChars) {
                cutIndexSoft = end
              }
            }
          }

          if (cutIndexSoft !== -1) {
            cutIndex = cutIndexSoft
          }

          // If no good sentence/clause boundary within the soft limit, prefer a clean word boundary
          // around the target length to avoid clipping the last word.
          if (cutIndex === -1 && trimmed.length >= minFirstChunkChars) {
            const target = Math.min(sentenceBuffer.length, softMaxFirstChunkChars)
            const slice = sentenceBuffer.slice(0, target)
            let spaceMatch = slice.lastIndexOf(' ')
            let attempts = 0
            while (spaceMatch > 0 && attempts < 6) {
              const end = spaceMatch + 1
              const candidate = sentenceBuffer.slice(0, end).trim()
              if (candidate.length >= minFirstChunkChars && !isDanglingFragment(candidate)) {
                cutIndex = end
                break
              }
              attempts++
              spaceMatch = slice.lastIndexOf(' ', Math.max(0, spaceMatch - 1))
            }
          }

          if (cutIndex === -1 && trimmed.length >= minFirstChunkChars) {
            const limited = sentenceBuffer.slice(0, Math.min(sentenceBuffer.length, hardMaxFirstChunkChars))
            let spaceMatch = limited.lastIndexOf(' ')
            let attempts = 0
            while (spaceMatch > 0 && attempts < 8) {
              const end = spaceMatch + 1
              const candidate = sentenceBuffer.slice(0, end).trim()
              if (candidate.length >= minFirstChunkChars && !isDanglingFragment(candidate)) {
                cutIndex = end
                break
              }
              attempts++
              spaceMatch = limited.lastIndexOf(' ', Math.max(0, spaceMatch - 1))
            }
          }

          if (cutIndex === -1) {
            return
          }

          const chunkText = sentenceBuffer.slice(0, cutIndex).trim()
          sentenceBuffer = sentenceBuffer.slice(cutIndex)
          
          if (chunkText.length > 0 && !isDanglingFragment(chunkText)) {
            const sanitized = sanitizeSpokenText(chunkText)
            if (sanitized) {
              if (sanitized.length < minFirstChunkChars) {
                // Sanitization can shorten text; re-buffer and wait for more content.
                sentenceBuffer = `${chunkText} ${sentenceBuffer}`
                return
              }
              console.log(`[Voice] Micro-chunk dispatch (${sanitized.length} chars):`, sanitized.substring(0, 30) + (sanitized.length > 30 ? '...' : ''))
              // Set flag immediately to prevent multiple first chunks
              firstAudioPending = false
              pendingTtsCount++
              ttsChain = ttsChain
                .then(() => queueTTSChunk(sanitized, turnId, tTurnStart))
                .finally(() => {
                  pendingTtsCount = Math.max(0, pendingTtsCount - 1)
                  maybeFinishTurn(turnId)
                })
            }
          }
        }
        return
      }
      
      // After first audio: coalesce larger chunks with minimum length guard
      const trimmed = sentenceBuffer.trim()
      const hasLargeBuffer = trimmed.length >= 80
      const hasSentenceBoundary = /([.!?]+)(\s+|$)/.test(sentenceBuffer)
      const hasClauseBoundary = /([,:;]\s|[\r\n])/.test(sentenceBuffer)
      const minCoalescedChars = 20  // Don't dispatch tiny chunks after first audio
      
      if (hasLargeBuffer && (hasSentenceBoundary || hasClauseBoundary)) {
        const match = sentenceBuffer.match(/([.!?,:;]+)(\s+|[\r\n])/)
        const index = match ? match.index + match[0].length : sentenceBuffer.length
        const sentence = sentenceBuffer.slice(0, index).trim()
        sentenceBuffer = sentenceBuffer.slice(index)
        
        // Guard against tiny coalesced chunks: re-buffer instead of dispatching.
        if (sentence.length > 0 && sentence.length < minCoalescedChars) {
          sentenceBuffer = `${sentence} ${sentenceBuffer}`
          return
        }

        if (sentence.length > 0) {
          const sanitized = sanitizeSpokenText(sentence)
          if (sanitized) {
            // Sanitization can shorten text; avoid dispatching tiny chunks.
            if (sanitized.length < minCoalescedChars) {
              sentenceBuffer = `${sentence} ${sentenceBuffer}`
              return
            }
            console.log(`[Voice] Coalesced chunk dispatch (${sanitized.length} chars)`)
            pendingTtsCount++
            ttsChain = ttsChain
              .then(() => queueTTSChunk(sanitized, turnId, tTurnStart))
              .finally(() => {
                pendingTtsCount = Math.max(0, pendingTtsCount - 1)
                maybeFinishTurn(turnId)
              })
          }
        }
      }
    }
    
    // Helper to detect dangling fragments that shouldn't be dispatched
    const isDanglingFragment = (text) => {
      // Don't dispatch single letters or partial contractions
      if (/^[A-Za-z]’?$/.test(text)) return true
      // Don't dispatch partial words ending in apostrophe
      if (/\w+’$/.test(text)) return true
      // Don't dispatch trailing hyphens
      if (text.endsWith('-')) return true

      // Avoid first chunks that end mid-thought without punctuation
      if (!/[.!?]$/.test(text)) {
        const lastWord = (text.trim().split(/\s+/).pop() || '').toLowerCase()

        // Avoid tiny word fragments that often happen mid-word in streaming (e.g. 'yo' then later 'u').
        // Allow a small set of valid short words.
        if (lastWord.length > 0 && lastWord.length <= 2) {
          const allowedShort = new Set(['i', 'a', 'an', 'am', 'we', 'he', 'me', 'my', 'no', 'ok', 'to', 'of', 'in', 'on', 'at'])
          if (!allowedShort.has(lastWord)) return true
        }

        if ([
          'what', 'which', 'who', 'when', 'where', 'why', 'how',
          'that', 'this', 'these', 'those',
          'to', 'and', 'but', 'or', 'so', 'because',
          'a', 'an', 'the',
          'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
          'do', 'does', 'did', 'have', 'has', 'had',
          'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must',
          'on', 'in', 'at', 'for', 'with', 'from', 'about', 'regarding'
        ].includes(lastWord)) {
          return true
        }
      }
      return false
    }

    // /api/agent/run defaults to SSE. Its SSE payload is base64-encoded per event.
    if (contentType.includes('text/event-stream') && agentResponse.body) {
      const reader = agentResponse.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let tAgentFirstToken = null
      let lastJsonAssistantContent = ''

      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          // Process any remaining text in buffer as final chunk
          if (sentenceBuffer.trim().length > 0) {
            const sanitized = sanitizeSpokenText(sentenceBuffer)
            if (sanitized) {
              const minCoalescedChars = 12
              const hasPriorAudio = !firstAudioPending || pendingTtsCount > 0 || audioQueue.length > 0
              // Avoid choppy tiny tail chunks at end-of-stream when we've already spoken content.
              if (hasPriorAudio && sanitized.length < minCoalescedChars) {
                sentenceBuffer = ''
              } else {
                pendingTtsCount++
                ttsChain = ttsChain
                  .then(() => queueTTSChunk(sanitized, turnId, tTurnStart))
                  .finally(() => {
                    pendingTtsCount = Math.max(0, pendingTtsCount - 1)
                    maybeFinishTurn(turnId)
                  })
              }
            }
          }
          agentStreamDone = true
          maybeFinishTurn(turnId)
          break
        }
        
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

          if (tAgentFirstToken === null && decoded && decoded.trim().length > 0) {
            tAgentFirstToken = performance.now()
            const ttftMs = Math.round(tAgentFirstToken - tAgentStart)
            console.log(`[Voice] Turn ${turnId} agent TTFT ms:`, ttftMs)
          }

          // Handle structured messages vs plain text
          const decodedTrimmed = (decoded || '').trim()
          if (decodedTrimmed.startsWith('{') && decodedTrimmed.endsWith('}')) {
            try {
              const obj = JSON.parse(decodedTrimmed)

              // Deliver structured agent events to UI (doc/tool execution, finish summary, etc.)
              if (obj && obj.meta && obj.meta.action_type) {
                try {
                  messageFun.handleMessage(obj, chatStore.messages)
                  
                  // Provide TTS feedback for key events in voice mode
                  const actionType = obj.meta.action_type
                  let ttsMessage = null
                  
                  if (actionType === 'finish_summery' && obj.message) {
                    // Task completion - speak a brief confirmation
                    if (obj.message.includes('Created') || obj.message.includes('completed') || obj.message.includes('finished')) {
                      ttsMessage = "Done! I've completed that for you."
                    }
                  } else if (actionType === 'progress' && obj.message) {
                    // Progress updates - only speak meaningful ones
                    const msg = obj.message.toLowerCase()
                    if (msg.includes('creating') || msg.includes('generating') || msg.includes('building')) {
                      ttsMessage = "Just a moment, I'm working on that..."
                    }
                  } else if (actionType === 'coding' && obj.message) {
                    // Code execution feedback
                    const msg = obj.message.toLowerCase()
                    if (msg.includes('running') || msg.includes('executing')) {
                      ttsMessage = "I'm executing the code now..."
                    }
                  }
                  
                  // Queue the TTS message if we have one
                  if (ttsMessage && isVoiceSessionActive.value) {
                    const sanitized = sanitizeSpokenText(ttsMessage)
                    if (sanitized) {
                      pendingTtsCount++
                      ttsChain = ttsChain
                        .then(() => queueTTSChunk(sanitized, turnId, tTurnStart))
                        .finally(() => {
                          pendingTtsCount = Math.max(0, pendingTtsCount - 1)
                          maybeFinishTurn(turnId)
                        })
                    }
                  }
                } catch (e) {}
                continue
              }
              if (obj && (!obj.role || obj.role === 'assistant') && typeof obj.content === 'string') {
                const next = obj.content
                let delta = ''
                if (lastJsonAssistantContent && next.startsWith(lastJsonAssistantContent)) {
                  delta = next.slice(lastJsonAssistantContent.length)
                } else if (!lastJsonAssistantContent) {
                  delta = next
                }
                lastJsonAssistantContent = next
                if (delta && delta.trim().length > 0) {
                  processTokenForTTS(delta)
                }
              }
            } catch (e) {
              // ignore
            }
          } else {
            // Plain text fragments
            if (!decoded.includes('lemon mode') && 
                !decoded.includes('__lemon_') && 
                !decoded.includes('PID:') && 
                !decoded.includes('event: message') &&
                decoded.trim().length > 0) {
              // Do not await; avoid stalling the stream loop
              processTokenForTTS(decoded)
            }
          }
        }
      }

      const tAgentDone = performance.now()
      console.log(`[Voice] Turn ${turnId} agent total ms:`, Math.round(tAgentDone - tAgentStart))
      agentStreamDone = true
      maybeFinishTurn(turnId)
      
    } else {
      // Fallback: non-SSE response
      const responseText = await agentResponse.text()
      console.log('[Voice] Raw agent response:', responseText)
      
      let textToSpeak = responseText
      try {
        const parsed = JSON.parse(responseText)
        if (parsed && typeof parsed.content === 'string') {
          textToSpeak = parsed.content
        }
      } catch (e) {}
      
      const sanitized = sanitizeSpokenText(textToSpeak)
      if (sanitized) {
          pendingTtsCount++
          ttsChain = ttsChain
            .then(() => queueTTSChunk(sanitized, turnId, tTurnStart))
            .finally(() => {
              pendingTtsCount = Math.max(0, pendingTtsCount - 1)
              maybeFinishTurn(turnId)
            })
      }
      agentStreamDone = true
      maybeFinishTurn(turnId)
    }
    
    // Safety check: if no audio was queued, reset (give TTS time to return)
    setTimeout(() => {
        if (!isPlayingAudio && audioQueue.length === 0 && voiceState.value === 'PROCESSING' && pendingTtsCount === 0) {
             console.log('[Voice] No audio generated, restarting listener')
             agentStreamDone = true
             maybeFinishTurn(turnId)
        }
    }, 4500)
    
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

// Streaming TTS Helper Functions
const queueTTSChunk = async (text, turnId, tTurnStart) => {
  try {
    if (!isVoiceSessionActive.value || !abortController || abortController.signal.aborted) return
    if (activeTurnId && turnId !== activeTurnId) return

    const tTtsStart = performance.now()
    const response = await fetch('/api/voice/synthesize-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: 'alloy' }),
      signal: abortController?.signal
    })

    if (response.ok) {
      const blob = await response.blob()
      if (!isVoiceSessionActive.value || !abortController || abortController.signal.aborted) return
      const tTtsEnd = performance.now()
      console.log(`[Voice] TTS Chunk ready (${text.length} chars) ms:`, Math.round(tTtsEnd - tTtsStart))

      const isFirst = firstAudioPending
      if (isFirst) firstAudioPending = false

      audioQueue.push({ blob, url: URL.createObjectURL(blob), tTurnStart: isFirst ? tTurnStart : null })
      playNextChunk()
    } else {
      const errText = await response.text().catch(() => '')
      console.error('[Voice] TTS Chunk non-OK:', response.status, errText)
    }
  } catch (err) {
    console.error('[Voice] TTS Chunk error:', err)
  }
}

const playNextChunk = async () => {
  if (isPlayingAudio || audioQueue.length === 0) return

  isPlayingAudio = true
  const chunk = audioQueue.shift()
  currentAudio = new Audio(chunk.url)
  
  voiceState.value = 'SPEAKING'
  emitter.emit('voice-status', { status: 'speaking' })

  currentAudio.onplay = () => {
    if (chunk.tTurnStart) {
       // Only log this for the very first chunk of the turn
       console.log(`[Voice] Turn first audio ms:`, Math.round(performance.now() - chunk.tTurnStart))
    }
  }

  currentAudio.onended = () => {
    URL.revokeObjectURL(chunk.url)
    currentAudio = null
    isPlayingAudio = false
    lastPlaybackEndedAt = Date.now();

    if (bargeInGraceTimeout) {
      clearTimeout(bargeInGraceTimeout)
      bargeInGraceTimeout = null
    }
    if (bargeInRafId) {
      cancelAnimationFrame(bargeInRafId)
      bargeInRafId = null
    }

    if (audioQueue.length > 0) {
      playNextChunk()
    } else {
      maybeFinishTurn(activeTurnId)
    }
  }
  
  currentAudio.onerror = () => {
    URL.revokeObjectURL(chunk.url)
    isPlayingAudio = false
    if (bargeInGraceTimeout) {
      clearTimeout(bargeInGraceTimeout)
      bargeInGraceTimeout = null
    }
    if (bargeInRafId) {
      cancelAnimationFrame(bargeInRafId)
      bargeInRafId = null
    }
    playNextChunk()
  }

  await currentAudio.play()
  setupBargeInDetection()
}

const maybeFinishTurn = (turnId) => {
  if (!isVoiceSessionActive.value) return
  if (!turnId || turnId !== activeTurnId) return
  if (!agentStreamDone) return
  if (pendingTtsCount !== 0) return
  if (isPlayingAudio) return
  if (audioQueue.length !== 0) return
  if (rearmTimeout) return

  console.log('[Voice] Speech finished, waiting cooldown before rearming')
  rearmTimeout = setTimeout(() => {
    rearmTimeout = null
    if (!isVoiceSessionActive.value) return
    console.log('[Voice] Cooldown finished, rearming for next turn')
    voiceState.value = 'LISTENING'
    emitter.emit('voice-status', { status: 'listening' })
    audioChunks = []
    recordingStartTime = Date.now()

    if (mediaRecorder && mediaRecorder.state === 'inactive') {
      mediaRecorder.start(100)
      startVADLoop()
      return
    }

    if (!mediaRecorder && micStream) {
      mediaRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }
      mediaRecorder.onstop = async () => {
        if (!isVoiceSessionActive.value) return
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
        await processAudio(audioBlob)
      }
      mediaRecorder.start(100)
      startVADLoop()
    }
  }, POST_TTS_COOLDOWN)
}

// Text sanitization to remove protocol markers
function sanitizeSpokenText(text) {
  if (!text) return ''
  let sanitized = String(text)
  
  // Remove known protocol markers and patterns
  sanitized = sanitized
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

  // Strip/normalize markdown so TTS doesn't read formatting ("star star", etc.)
  sanitized = sanitized
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1') // italics
    .replace(/__(.*?)__/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // inline/code fences fragments
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+/gm, '') // unordered bullets
    .replace(/^\s*\d+\.\s+/gm, '') // ordered bullets
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // markdown links
    .replace(/\s*\*\s*/g, ' ') // stray asterisks

  // Remove emojis  // Strip emoji and other symbols that TTS often reads awkwardly.
  // Keep basic punctuation.
  sanitized = sanitized
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '') // flags
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '') // emoji blocks
    .replace(/[\u{2600}-\u{26FF}]/gu, '') // misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '') // dingbats

  // Strip common mojibake sequences that show up when UTF-8 emoji bytes are mis-decoded.
  // Example: "ð" etc.
  sanitized = sanitized
    .replace(/[\u00C0-\u00FF]{2,}/g, (m) => {
      // If it's mostly mojibake markers, drop it.
      if (/^[\u00C0-\u00FF]+$/.test(m) && /[\u00D0-\u00FF]/.test(m)) return ''
      return m
    })
    .replace(/[ðÐ][\u0080-\u00BF]{1,4}/g, '')
  sanitized = sanitized
    .replace(/\s{2,}/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
  
  // If after sanitization we have no meaningful content, return empty
  // Allow short meaningful replies like "Hey." but block pure punctuation/noise.
  if (!/[A-Za-z0-9]/.test(sanitized)) return ''
  if (sanitized.length < 2) return ''
  
  return sanitized
}

// Barge-in: detect speech during playback
const setupBargeInDetection = () => {
  if (!microphone || !analyser) return

  if (bargeInGraceTimeout) {
    clearTimeout(bargeInGraceTimeout)
    bargeInGraceTimeout = null
  }
  if (bargeInRafId) {
    cancelAnimationFrame(bargeInRafId)
    bargeInRafId = null
  }
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  let speechDetected = false
  let speechFrameCount = 0
  let gracePeriodElapsed = false
  
  // Wait grace period before enabling detection
  bargeInGraceTimeout = setTimeout(() => {
    gracePeriodElapsed = true
    console.log('[Voice] Barge-in grace period elapsed, detection enabled')
  }, BARGE_IN_GRACE_PERIOD)
  
  const checkForSpeech = () => {
    if (voiceState.value !== 'SPEAKING') {
      speechDetected = false
      speechFrameCount = 0
      return
    }
    
    // Don't check for barge-in during grace period
    if (!gracePeriodElapsed) {
      bargeInRafId = requestAnimationFrame(checkForSpeech)
      return
    }
    
    analyser.getByteFrequencyData(dataArray)
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const normalizedEnergy = average / 255
    
    // Much higher threshold for barge-in to avoid false positives
    if (normalizedEnergy > 0.3) { // 30x higher than silence threshold (even less sensitive)
      speechFrameCount++
      if (speechFrameCount > 25 && !speechDetected) { // Require 25 consecutive frames (very strict)
        speechDetected = true
        console.log('[Voice] Barge-in detected, interrupting playback')
        handleBargeIn()
      }
    } else {
      speechDetected = false
      speechFrameCount = 0
    }
    
    if (voiceState.value === 'SPEAKING') {
      bargeInRafId = requestAnimationFrame(checkForSpeech)
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

  if (audioQueue && audioQueue.length > 0) {
    for (const item of audioQueue) {
      if (item && item.url) {
        URL.revokeObjectURL(item.url)
      }
    }
  }
  audioQueue = []
  isPlayingAudio = false
  sentenceBuffer = ''
  ttsChain = Promise.resolve()
  firstAudioPending = false
  lastPlaybackEndedAt = Date.now()
  
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
  if (isVoiceSessionActive.value && micStream) {
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
      background-color: #ff4d4f;
      color: white;
    }
  }

  .interrupt-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-left: 4px;

    &:hover {
      background-color: #f0f0f0;
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