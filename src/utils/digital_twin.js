const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * DigitalTwinService
 * Handles digital twin creation and video generation using Hugging Face Spaces
 */
class DigitalTwinService {
  constructor() {
    this.token = process.env.HUGGINGFACE_TOKEN;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    // Hugging Face Spaces for different models
    this.spaces = {
      sadtalker: 'vinthony/SadTalker',
      wav2lip: 'radames/Wav2Lip',
      // Add more models as needed
    };
    
    // TTS service (using OpenAI by default)
    this.ttsProvider = 'openai'; // Can be 'openai', 'elevenlabs', etc.
  }

  async _loadGradio() {
    return import('@gradio/client');
  }

  /**
   * Create a new digital twin from a face image
   * @param {Object} params
   * @param {number} params.user_id - User ID
   * @param {string} params.name - Twin name
   * @param {string} params.face_image_path - Path to face image
   * @param {Object} params.traits - Twin traits (age, gender, style, etc.)
   * @param {string} params.model_type - Model type (sadtalker, wav2lip, etc.)
   * @returns {Promise<Object>} Twin data
   */
  async createTwin({ user_id, name, face_image_path, traits = {}, model_type = 'sadtalker' }) {
    console.log('[DigitalTwin] Creating twin:', { user_id, name, model_type });
    
    // Validate face image exists
    try {
      await fs.access(face_image_path);
    } catch (e) {
      throw new Error(`Face image not found: ${face_image_path}`);
    }

    // Upload face image to get public URL (for API calls)
    const face_image_url = await this._uploadFile(face_image_path);
    
    // Duplicate Hugging Face space for this twin (optional, for dedicated processing)
    let hf_space_id = null;
    if (this.token) {
      try {
        hf_space_id = await this._duplicateSpace(model_type);
      } catch (e) {
        console.warn('[DigitalTwin] Space duplication failed, will use public space:', e.message);
      }
    }

    const DigitalTwin = require('@src/models/DigitalTwin');
    
    const twin = await DigitalTwin.create({
      user_id,
      name,
      face_image_path,
      face_image_url,
      traits,
      hf_space_id,
      hf_model_type: model_type,
      status: 'active'
    });

    console.log('[DigitalTwin] ✅ Twin created:', twin.id);
    return twin;
  }

  /**
   * Generate a talking head video from a digital twin
   * @param {Object} params
   * @param {number} params.twin_id - Digital twin ID
   * @param {string} params.script - Text script
   * @param {number} params.user_id - User ID
   * @param {string} params.conversation_id - Conversation ID
   * @param {string} params.background - Background scene (optional)
   * @param {string} params.output_dir - Output directory
   * @returns {Promise<Object>} Video data
   */
  async generateVideo({ twin_id, script, user_id, conversation_id, background, output_dir }) {
    console.log('[DigitalTwin] Generating video for twin:', twin_id);
    
    const startTime = Date.now();
    
    // Load twin data
    const DigitalTwin = require('@src/models/DigitalTwin');
    const twin = await DigitalTwin.findByPk(twin_id);
    if (!twin) {
      throw new Error(`Twin not found: ${twin_id}`);
    }

    // Create video record
    const TwinVideo = require('@src/models/TwinVideo');
    const video = await TwinVideo.create({
      twin_id,
      user_id,
      conversation_id,
      script,
      background: background || twin.default_background,
      style: twin.default_style,
      status: 'processing'
    });

    try {
      // Step 1: Generate audio from script using TTS
      console.log('[DigitalTwin] Step 1: Generating audio from script...');
      const audioPath = await this._generateAudio(script, twin, output_dir);
      
      // Upload audio to get public URL
      const audioUrl = await this._uploadFile(audioPath);
      
      await video.update({
        audio_path: audioPath,
        audio_url: audioUrl
      });

      // Step 2: Generate video using SadTalker (or other model)
      console.log('[DigitalTwin] Step 2: Generating talking head video...');
      const videoPath = await this._generateTalkingHead({
        face_image_url: twin.face_image_url,
        audio_url: audioUrl,
        model_type: twin.hf_model_type,
        hf_space_id: twin.hf_space_id,
        output_dir
      });

      const videoFilename = path.basename(videoPath);
      const videoUrl = await this._uploadFile(videoPath);
      
      // Get video duration
      const duration = await this._getVideoDuration(videoPath);
      
      const processingTime = Date.now() - startTime;
      
      await video.update({
        video_path: videoPath,
        video_url: videoUrl,
        video_filename: videoFilename,
        duration_seconds: duration,
        status: 'completed',
        processing_time_ms: processingTime,
        completed_at: new Date()
      });

      // Update twin stats
      await twin.update({
        videos_generated: twin.videos_generated + 1,
        last_used_at: new Date()
      });

      console.log('[DigitalTwin] ✅ Video generated:', {
        video_id: video.id,
        filename: videoFilename,
        duration,
        processing_time_ms: processingTime
      });

      return {
        video_id: video.id,
        video_path: videoPath,
        video_url: videoUrl,
        video_filename: videoFilename,
        duration_seconds: duration,
        processing_time_ms: processingTime
      };

    } catch (error) {
      console.error('[DigitalTwin] Video generation failed:', error);
      
      await video.update({
        status: 'failed',
        error_message: error.message || String(error)
      });

      throw error;
    }
  }

  /**
   * Generate multiple twin videos for website sections
   * @param {Object} params
   * @param {number} params.twin_id - Digital twin ID
   * @param {Array} params.sections - Website sections with scripts
   * @param {number} params.user_id - User ID
   * @param {string} params.conversation_id - Conversation ID
   * @param {string} params.output_dir - Output directory
   * @returns {Promise<Object>} Video paths for each section
   */
  async generateWebsiteVideos({ twin_id, sections, user_id, conversation_id, output_dir }) {
    console.log('[DigitalTwin] Generating website videos for', sections.length, 'sections');
    
    const videos = {};
    
    for (const section of sections) {
      console.log(`[DigitalTwin] Generating video for section: ${section.name}`);
      
      try {
        const result = await this.generateVideo({
          twin_id,
          script: section.script,
          user_id,
          conversation_id,
          background: section.background || 'professional',
          output_dir
        });
        
        videos[section.name] = {
          path: result.video_path,
          url: result.video_url,
          filename: result.video_filename,
          duration: result.duration_seconds
        };
        
        console.log(`[DigitalTwin] ✅ Section "${section.name}" video generated`);
        
      } catch (error) {
        console.error(`[DigitalTwin] Failed to generate video for section "${section.name}":`, error);
        videos[section.name] = {
          path: null,
          url: null,
          filename: null,
          duration: null,
          error: error.message
        };
      }
    }
    
    const successCount = Object.values(videos).filter(v => v.path !== null).length;
    console.log(`[DigitalTwin] Website videos complete: ${successCount}/${sections.length} successful`);
    
    return videos;
  }

  /**
   * Generate audio from text using TTS
   * @private
   */
  async _generateAudio(text, twin, output_dir) {
    if (this.ttsProvider === 'openai') {
      return this._generateAudioOpenAI(text, twin, output_dir);
    }
    // Add other TTS providers here
    throw new Error(`Unsupported TTS provider: ${this.ttsProvider}`);
  }

  /**
   * Generate audio using OpenAI TTS
   * @private
   */
  async _generateAudioOpenAI(text, twin, output_dir) {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: this.openaiKey });

    // Choose voice based on twin traits
    const voice = this._selectVoice(twin.traits);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice,
      input: text
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const audioPath = path.join(output_dir, `audio_${Date.now()}.mp3`);
    await fs.writeFile(audioPath, buffer);

    console.log('[DigitalTwin] Audio generated:', audioPath);
    return audioPath;
  }

  /**
   * Select appropriate voice based on twin traits
   * @private
   */
  _selectVoice(traits = {}) {
    const { gender, age, style } = traits;
    
    // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
    if (gender === 'female') {
      if (style === 'professional') return 'nova';
      if (style === 'casual') return 'shimmer';
      return 'alloy';
    } else {
      if (style === 'professional') return 'onyx';
      if (style === 'casual') return 'echo';
      return 'fable';
    }
  }

  /**
   * Generate talking head video using Hugging Face Space
   * @private
   */
  async _generateTalkingHead({ face_image_url, audio_url, model_type, hf_space_id, output_dir }) {
    const { Client } = await this._loadGradio();
    
    // Connect to space (use duplicated space if available, otherwise public)
    const spaceId = hf_space_id || this.spaces[model_type];
    console.log('[DigitalTwin] Connecting to HF space:', spaceId);
    
    const client = await Client.connect(spaceId, {
      hf_token: this.token
    });

    // Call the prediction endpoint
    // SadTalker typically expects: (source_image, driven_audio, ...)
    console.log('[DigitalTwin] Calling prediction endpoint...');
    
    const result = await client.predict("/predict", {
      source_image: face_image_url,
      driven_audio: audio_url,
      preprocess: "crop",
      still_mode: true,
      use_enhancer: true
    });

    // Download the generated video
    const videoUrl = result.data[0]; // Adjust based on actual API response
    const videoPath = path.join(output_dir, `twin_video_${Date.now()}.mp4`);
    
    await this._downloadFile(videoUrl, videoPath);
    
    console.log('[DigitalTwin] Video downloaded:', videoPath);
    return videoPath;
  }

  /**
   * Duplicate a Hugging Face Space for dedicated processing
   * @private
   */
  async _duplicateSpace(model_type) {
    if (!this.token) {
      throw new Error('HUGGINGFACE_TOKEN required for space duplication');
    }

    const { Client } = await this._loadGradio();
    const sourceSpace = this.spaces[model_type];

    console.log('[DigitalTwin] Duplicating space:', sourceSpace);

    const client = await Client.duplicate(sourceSpace, {
      token: this.token,
      private: true,
      timeout: 60,
      hardware: 'cpu-basic' // Use 'cpu-upgrade' or 't4-small' for faster processing
    });

    const spaceId = client.config?.space_id || sourceSpace;
    console.log('[DigitalTwin] Space duplicated:', spaceId);
    
    return spaceId;
  }

  /**
   * Upload file to get public URL (using manus-upload-file utility)
   * @private
   */
  async _uploadFile(filePath) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(`manus-upload-file ${filePath}`);
      const url = stdout.trim();
      console.log('[DigitalTwin] File uploaded:', url);
      return url;
    } catch (error) {
      console.error('[DigitalTwin] File upload failed:', error);
      // Fallback: return local path
      return filePath;
    }
  }

  /**
   * Download file from URL
   * @private
   */
  async _downloadFile(url, outputPath) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.writeFile(outputPath, response.data);
  }

  /**
   * Get video duration (placeholder - would need ffprobe)
   * @private
   */
  async _getVideoDuration(videoPath) {
    // TODO: Use ffprobe to get actual duration
    // For now, return null
    return null;
  }

  /**
   * Get user's digital twins
   */
  async getUserTwins(user_id) {
    const DigitalTwin = require('@src/models/DigitalTwin');
    return await DigitalTwin.findAll({
      where: { user_id, status: 'active' },
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });
  }

  /**
   * Get user's default twin
   */
  async getDefaultTwin(user_id) {
    const DigitalTwin = require('@src/models/DigitalTwin');
    return await DigitalTwin.findOne({
      where: { user_id, is_default: true, status: 'active' }
    });
  }

  /**
   * Set a twin as default
   */
  async setDefaultTwin(twin_id, user_id) {
    const DigitalTwin = require('@src/models/DigitalTwin');
    
    // Unset all other twins as default
    await DigitalTwin.update(
      { is_default: false },
      { where: { user_id } }
    );

    // Set this twin as default
    await DigitalTwin.update(
      { is_default: true },
      { where: { id: twin_id, user_id } }
    );
  }
}

module.exports = DigitalTwinService;
