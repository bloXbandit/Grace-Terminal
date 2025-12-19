# Voice Framework (Frontend) — `ChatHeader.vue`

This document maps the **current voice/speech implementation exactly as it exists in code**.

**Primary file**
- `frontend/src/view/lemon/components/ChatHeader.vue`

**Backend endpoints used**
- `POST /api/voice/transcribe`
- `POST /api/agent/run` (SSE streaming)
- `POST /api/voice/synthesize`

---

## 1) State Machine + Session Flags

### State
`voiceState` is a string enum:
- `IDLE`
- `LISTENING`
- `PROCESSING`
- `SPEAKING`

### Session flag
`isVoiceSessionActive` (boolean) drives the mic button active styling and guards “auto-rearm” restarts.

**Key invariant:**
- Recording/VAD loops run only when `voiceState === 'LISTENING'`.
- Barge-in detection runs only when `voiceState === 'SPEAKING'`.

---

## 2) Core Runtime Objects (mutable refs)

These are module-scoped variables (not Vue refs):
- `mediaRecorder`: `MediaRecorder | null`
- `audioChunks`: `BlobPart[]`
- `audioContext`: `AudioContext | null`
- `analyser`: `AnalyserNode | null`
- `microphone`: `MediaStreamAudioSourceNode | null`
- `micStream`: `MediaStream | null` (**preserved** across `MediaRecorder` restarts)
- `silenceTimer`: unused after VAD loop (legacy)
- `recordingStartTime`: `number | null`
- `currentAudio`: `HTMLAudioElement | null`
- `abortController`: `AbortController | null`

---

## 3) Key Tunables (VAD + Guards)

Defined in `ChatHeader.vue`:
- `SILENCE_THRESHOLD = 0.01`
- `SILENCE_DURATION = 500` ms
- `MIN_RECORDING_DURATION = 800` ms
- `MIN_BLOB_SIZE = 5000` bytes

Implications:
- Speech must end and stay under threshold for ~`500ms` before the turn is closed.
- If the user only speaks briefly (<`800ms`), the system keeps listening.
- If the audio blob is too small (<`5KB`), the blob is discarded and listening continues.

---

## 4) User Interaction Entry Point

### `handleVoiceToggle()`
Triggered by clicking the microphone button.

Behavior:
- If `voiceState === 'IDLE'` => `startVoiceSession()`
- Else (any other state) => `endVoiceSession()`

Logs:
- `[Voice] Button clicked, state: ...`
- `[Voice] Chat ID: ...` (uses `chatStore.conversationId`)

---

## 5) Session Start

### `startVoiceSession()`
1. Sets:
   - `voiceState = 'LISTENING'`
   - `isVoiceSessionActive = true`
   - emits `voice-status: listening`
2. Acquires mic:
   - `micStream = await navigator.mediaDevices.getUserMedia({ audio: true })`
3. Creates `MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })`
4. Registers recorder callbacks:
   - `ondataavailable`: push chunks
   - `onstop`: build `Blob(audioChunks)` and call `processAudio(blob)`
5. Creates `AudioContext`, `AnalyserNode`, and `MediaStreamAudioSourceNode` for VAD
6. Starts:
   - `mediaRecorder.start(100)`
   - `startVADLoop()`

Failure:
- If mic permissions fail, emits `voice-status: error` and calls `endVoiceSession()`.

---

## 6) Session End / Cleanup

### `endVoiceSession()`
Stops everything and resets to `IDLE`.

Actions:
- Stops `MediaRecorder` (if active)
- Disconnects `microphone`
- Stops mic tracks via `micStream.getTracks().forEach(track.stop())` and nulls `micStream`
- Closes `audioContext`
- Stops any playing audio (`currentAudio.pause()`, revokes URL)
- Aborts in-flight requests via `abortController.abort()`
- Resets state:
  - `voiceState = 'IDLE'`
  - `isVoiceSessionActive = false`
  - emits `voice-status: idle`
- Nulls internal refs (`mediaRecorder`, `audioContext`, `analyser`, `microphone`, `currentAudio`, etc.)

---

## 7) VAD (Silence Detection)

### `startVADLoop()`
Runs a `requestAnimationFrame` loop while `voiceState === 'LISTENING'`.

Logic per frame:
- `analyser.getByteFrequencyData()`
- compute `normalizedEnergy = average / 255`
- if `normalizedEnergy < SILENCE_THRESHOLD`:
  - start `silenceStartTime`
  - if silence lasts longer than `SILENCE_DURATION` and recording length > `MIN_RECORDING_DURATION`:
    - `stopRecordingForProcessing()`
- else:
  - reset `silenceStartTime`

### `stopRecordingForProcessing()`
- Sets `voiceState = 'PROCESSING'`
- emits `voice-status: processing`
- calls `mediaRecorder.stop()`

Logs:
- `[Voice] Silence detected, stopping recording`

---

## 8) Turn Processing Pipeline

### `processAudio(audioBlob)`
This is the orchestrator for each turn:

#### (A) Guard: minimum blob size
If `audioBlob.size < MIN_BLOB_SIZE`:
- Logs: `[Voice] Audio blob too small, discarding and continuing session`
- Sets `voiceState = 'LISTENING'`
- Resets `audioChunks`, `recordingStartTime`
- **Recreates** `MediaRecorder` using preserved `micStream` (if needed) and restarts:
  - `mediaRecorder.start(100)`
  - `startVADLoop()`

#### (B) STT: `/api/voice/transcribe`
- Build `FormData` with `audio` = `recording.webm`
- `fetch('/api/voice/transcribe', { method: 'POST', body: formData })`

Logs:
- `[Voice] Sending to transcribe endpoint`
- `[Voice] Transcribe response status: ...`
- `[Voice] Transcription response: { text, duration }`

If transcription is empty:
- resumes listening and (if needed) restarts recorder.

#### (C) Agent: `/api/agent/run` (SSE)
- Creates `abortController = new AbortController()`
- Sends:
  - headers: `X-Conversation-Id: chatStore.conversationId`, `X-Voice-Task: true`
  - body: `{ question: text, conversation_id: chatStore.conversationId, mode: 'auto', responseType: 'sse' }`

#### (D) SSE extraction (base64 tokens)
When `content-type` includes `text/event-stream`:
- Reads `agentResponse.body.getReader()`
- Splits frames by `\n\n`
- For each frame:
  - find `data: ...`
  - base64 decode via `atob()`
  - if decoded looks like JSON object `{...}`:
    - `JSON.parse(decoded)` and if `obj.content` exists and role is assistant:
      - `lastAssistantContent = obj.content`
  - else:
    - append to `messageToSpeak` **except** filtered protocol markers:
      - excludes `lemon mode`, `__lemon_`, `PID:`, `event: message`

Final selection:
- `messageToSpeak = (lastAssistantContent || messageToSpeak || '').trim()`

Fallback (non-SSE):
- reads `.text()`, attempts `JSON.parse`, uses `parsed.content` if present.

Debug logs:
- `[Voice] Raw agent response:` (non-SSE path)
- `[Voice] Message before sanitization:`

#### (E) Sanitization
`sanitizeSpokenText()` removes known protocol-like artifacts:
- `__lemon_out_end__...__`
- `event: message`
- `data:`
- `PID:...`
- `lemon mode ...`
- `action_type ...`, `status ...`
- JSON objects via `/\{[^}]*\}/g`
- then trims; if `<10 chars` returns empty

Debug logs:
- `[Voice] Message after sanitization:`

If empty after sanitize:
- resumes listening and restarts recording/VAD.

#### (F) TTS: `/api/voice/synthesize`
- POST JSON:
  - `{ text: messageToSpeak, voice: 'alloy' }`
- Uses same `abortController.signal` so barge-in can cancel.

#### (G) Playback + auto-rearm
If synth OK:
- `audioUrl = URL.createObjectURL(blob)`
- `currentAudio = new Audio(audioUrl)`
- sets `voiceState = 'SPEAKING'` and emits `voice-status: speaking`
- `currentAudio.onended`:
  - revokes URL
  - clears `currentAudio`
  - clears `abortController`
  - logs: `[Voice] Speech finished, rearming for next turn`
  - sets `voiceState = 'LISTENING'`
  - resets `audioChunks`, `recordingStartTime`
  - `mediaRecorder.start(100)`
  - `startVADLoop()`

If playback error:
- same “resume listening + restart recording/VAD” behavior.

---

## 9) Barge-in (Interrupt Grace While She Speaks)

### `setupBargeInDetection()`
Runs only while `voiceState === 'SPEAKING'`.

Algorithm:
- Uses the same `analyser` energy estimate
- If `normalizedEnergy > 0.2` for **> 20 consecutive frames**:
  - logs: `[Voice] Barge-in detected, interrupting playback`
  - calls `handleBargeIn()`

### `handleBargeIn()`
- Stops `currentAudio`, revokes URL
- Aborts in-flight requests via `abortController.abort()`
- Sets `voiceState = 'LISTENING'` and emits `voice-status: listening`
- Resets `audioChunks`, `recordingStartTime`
- Recreates `MediaRecorder` using preserved `micStream` and restarts:
  - `mediaRecorder.start(100)`
  - `startVADLoop()`
  - `setupBargeInDetection()` (re-armed)

---

## 10) Expected Console Log Trace (happy path)

Typical sequence (matches your logs):
1. `[Voice] Button clicked, state: IDLE`
2. `[Voice] Silence detected, stopping recording`
3. `[Voice] Processing audio blob, size: ...`
4. `[Voice] Sending to transcribe endpoint`
5. `[Voice] Transcribe response status: 200`
6. `[Voice] Transcription response: {text: ..., duration: ...}`
7. `[Voice] Message before sanitization: ...`
8. `[Voice] Message after sanitization: ...`
9. `[Voice] Speech finished, rearming for next turn`

---

# Issues Observed + What Code Indicates

## A) Long delay after user speech
**What the framework does:**
- Voice response time is dominated by:
  - STT (`/api/voice/transcribe`)
  - LLM agent (`/api/agent/run`)
  - TTS (`/api/voice/synthesize`)

**Most likely bottleneck:** `/api/agent/run` model latency (same as your normal chat latency).
- Voice is **not** mutually exclusive from chat speed: voice waits for agent output before TTS.

**Safe mitigations (no architecture change):**
- Reduce response length (system prompt / max tokens) for voice turns.
- Use a faster model *for voice turns only* (requires server-side routing based on `X-Voice-Task: true`).

## B) “I never said thank you” but transcript becomes “Thank you …”
**What code indicates:**
- Grace is responding to *exactly* what STT returns in `{ text }`.
- Your grace-app logs confirm the backend received:
  - `user: Thank you for watching!`
  - `user: Thank you very much.`

So this is not the agent “forcing a behavior” — it is **STT mis-transcription** (or the audio input contains that phrase, e.g., speaker bleed/echo).

**Likely causes:**
- Echo/feedback loop: system audio or Grace TTS leaking into mic input
- Noise gating/VAD segmenting: if VAD cuts your utterance weirdly, Whisper can hallucinate common phrases
- Audio device selection issues (wrong mic, or “stereo mix”)

**Safe mitigations:**
- Add UI log/preview showing the transcribed text *before* it is sent to `/api/agent/run` (code already logs this, but showing in UI is better).
- Add a short “cooldown” after TTS ends before resuming recording (to avoid capturing the tail of Grace’s audio).
- Use echo cancellation + noise suppression constraints in `getUserMedia`:
  - `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`

## C) Barge-in still triggers sometimes
**What code does now:**
- Threshold `normalizedEnergy > 0.2` AND `>20` consecutive frames while `SPEAKING`.

**Likely cause when it still triggers:**
- The analyser is reading the microphone stream; if Grace’s audio is audible in the room (or routed into mic), it will look like “speech”.

**Safe mitigations:**
- Add a minimum “grace period” after `currentAudio.onplay` before checking barge-in (e.g., 300–600ms).
- Pause/disable barge-in if the user is using speakers (hard to detect reliably) or allow user setting.

## D) Session goes idle / no docker logs after a few turns
**What code suggests:**
- `endVoiceSession()` is called when user presses mic button (toggle) or component unmount.
- If an AbortError occurs, `processAudio` currently returns early (by design).

**Most likely real-world cause:**
- UI toggling / route changes / component remounts
- An abort occurs (barge-in) and you stop session via toggle right after

**Safe mitigations:**
- Add explicit UI indicator for `voiceState` and `isVoiceSessionActive`.
- Add structured logs for transitions:
  - `IDLE -> LISTENING -> PROCESSING -> SPEAKING -> LISTENING`

---

# Notes / Known Non-Voice Warnings

You’re seeing Vue warnings:
- `Invalid prop: type check failed for prop "message". Expected Array, got Object`

This is unrelated to the voice pipeline in `ChatHeader.vue` (it’s about message rendering components elsewhere).

---

# Next Steps (if you want changes)

If you want me to implement mitigations (not just document):
- Add audio constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`) in `getUserMedia`
- Add a post-TTS cooldown before rearming
- Add a small initial delay before enabling barge-in checks after `onplay`
- Add UI-level display of transcribed text to confirm/override before sending
