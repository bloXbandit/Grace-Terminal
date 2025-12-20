# Voice Streaming Implementation Handoff Brief

## Summary
Successfully implemented streaming TTS solution with Option A (Simple Streaming) to reduce perceived latency in Grace's voice responses. Added backend route for streaming TTS and refactored frontend to buffer agent text into sentences for sequential playback.

## Completed Features

### 1. Speech-Start Gating ✅
- **Problem**: VAD never reached silence, causing MAX_RECORDING_DURATION to trigger repeatedly with identical silent blobs, leading to hallucinated transcripts like "Thank you for watching"
- **Solution**: Added speech-start gating in VAD loop
  - `SPEECH_THRESHOLD = 0.02` - Energy threshold to detect speech start
  - `SPEECH_CONSECUTIVE_FRAMES = 3` - Consecutive frames above threshold required
  - Only considers silence after speech is detected
  - If max duration reached without speech, rearm without calling STT
- **Files Modified**: `frontend/src/view/lemon/components/ChatHeader.vue`

### 2. Backend Fast-Path for Voice Commands ✅
- **Problem**: Agent TTFT (Time To First Token) was ~5 seconds for simple voice commands
- **Solution**: Skip intent detection for deterministic voice patterns
  - Detects patterns like "make/create a word document" 
  - Directly sets mode to 'agent' bypassing LLM intent call
  - Checks `x-voice-task` header and `mode === 'auto'`
- **Files Modified**: `src/routers/agent/run.js`

### 3. Pre-Acknowledgment TTS ✅
- **Problem**: Long perceived latency while waiting for agent response
- **Solution**: Immediate audio feedback after STT
  - Plays random pre-ack phrase: "Got it... working on that", etc.
  - Masks agent thinking time (TTFT)
  - Triggered immediately after successful STT transcription
- **Files Modified**: `frontend/src/view/lemon/components/ChatHeader.vue`

### 4. SSE Ingestion Parity ✅
- **Problem**: Structured UI events (progress, files, attachments) not delivered in voice mode
- **Solution**: Reuse typed chat SSE ingestion
  - Voice SSE stream calls `messageFun.handleMessage(obj, chatStore.messages)` 
  - Ensures doc/tool execution results appear in UI
  - Already implemented in existing code

## Current Parameters & Tuning

### VAD Settings
```javascript
const SILENCE_THRESHOLD = 0.01      // Energy threshold for silence
const SILENCE_DURATION = 250        // ms of silence before auto-stop (reduced from 500ms)
const MIN_RECORDING_DURATION = 800  // ms minimum recording
const MAX_RECORDING_DURATION = 9000 // ms max recording before forced processing
const SPEECH_THRESHOLD = 0.02       // Energy threshold to detect speech start
const SPEECH_CONSECUTIVE_FRAMES = 3 // Frames above threshold for speech start
```

### TTS Streaming Settings
```javascript
const FIRST_CHUNK_MIN_CHARS = 36     // Raised from 18 to reduce teleprompter cadence
const VOICE_START_WARMUP_MS = 2200   // Warm-up discard window for spurious transcripts
```

## Remaining Tasks

### 1. Voice Doc/Tool Delivery TTS (In Progress)
- **Issue**: User hears nothing during doc/tool execution in voice mode
- **Proposed Solution**: 
  - Tap into specific `action_type` messages for TTS
  - Consider speaking progress updates or completion messages
  - Example: "I've created the document for you"

### 2. Optional Improvements
- Verify voice toggle stability after long sessions
- Fine-tune verbosity for common requests
- Add completion utterance when `finish_summery` or file-created events arrive

## Testing Recommendations

### Test Scenarios
1. **Silence Loop Test**: Start voice session, remain silent for 10+ seconds
   - Expected: No STT calls, no hallucinated transcripts
   - Log: `[Voice] Max recording duration reached without speech, rearming`

2. **Speech-Start Gating Test**: Play background noise or quiet speech
   - Expected: No processing until clear speech detected
   - Log: `[Voice] Speech started detected`

3. **Fast-Path Test**: Say "make a word document about marketing"
   - Expected: `[Voice Fast-Path] Simple document command detected, skipping intent detection`
   - Reduced TTFT (~2-3 seconds faster)

4. **Pre-Ack Test**: Any voice command
   - Expected: Immediate pre-ack TTS phrase before agent response

5. **Doc Generation UI Test**: Voice command to create document
   - Expected: See progress indicators and file attachment in UI

### Performance Metrics
- Target TTFT: <3 seconds for simple commands (with fast-path)
- Target first audio: <2 seconds after STT (with pre-ack)
- Total latency: 10-15 seconds (STT + agent + TTS)

## Architecture Notes

### Frontend Flow
1. Voice session starts with warm-up period (2200ms)
2. VAD loop with speech-start gating
3. Audio sent to Whisper for STT
4. Pre-ack TTS played immediately
5. Agent request with `x-voice-task: true` header
6. SSE stream processed for both TTS and UI events
7. Sequential audio playback

### Backend Changes
- New streaming TTS endpoint: `/api/voice/synthesize-stream`
- Fast-path intent detection for voice patterns
- No changes to core agent logic

### Safeguards Maintained
- Text sanitization to prevent protocol injection
- Audio queue management to prevent overlap
- State tracking for proper session cleanup
- Error handling for all async operations

## Files Modified
1. `frontend/src/view/lemon/components/ChatHeader.vue` - Main voice component
2. `src/routers/agent/run.js` - Backend fast-path implementation
3. `src/routers/voice/synthesize.js` - Streaming TTS endpoint

## Build Instructions
```bash
# Rebuild frontend
make rebuild-frontend

# Restart backend
docker-compose restart grace
```

## Next Steps for Coding Agent
1. Implement TTS for doc/tool execution progress/completion
2. Test all scenarios thoroughly
3. Monitor logs for any remaining issues
4. Consider additional latency optimizations if needed
