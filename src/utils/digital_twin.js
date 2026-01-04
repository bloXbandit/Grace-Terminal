const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

/**
 * DigitalTwinService
 * Handles digital twin creation and video generation using Replicate API
 */
class DigitalTwinService {
  constructor() {
    this.replicateToken = process.env.REPLICATE_API_TOKEN;
    this.openaiKey = process.env.OPENAI_API_KEY;
    
    // Replicate models for talking head generation
    this.models = {
      sadtalker: 'cjwbw/sadtalker:a519cc0cfebaaeade068b23899165a11ec76aaa1d2b313d40d214f204ec957a3',
      sadtalker_fast: 'lucataco/sadtalker:85c698db7c0a66d5011435d0191db323034e1da04b912a6d365833141b6a285b'
    };
    
    // TTS service (using OpenAI by default)
    this.ttsProvider = 'openai'; // Can be 'openai', 'elevenlabs', etc.
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

    const DigitalTwin = require('@src/models/DigitalTwin');
    
    const twin = await DigitalTwin.create({
      user_id,
      name,
      face_image_path,
      face_image_url,
      traits,
      hf_model_type: model_type, // Keep field name for DB compatibility
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
      
      // Convert audio to base64 data URL for Replicate (localhost URLs won't work)
      const audioUrl = await this._fileToDataUrl(audioPath);
      
      await video.update({
        audio_path: audioPath,
        audio_url: audioUrl
      });

      // Step 2: Generate video using SadTalker (or other model)
      console.log('[DigitalTwin] Step 2: Generating talking head video...');
      
      // Convert face_image_path to base64 data URL for Replicate (localhost URLs won't work)
      const face_image_data_url = twin.face_image_path 
        ? await this._fileToDataUrl(twin.face_image_path)
        : twin.face_image_url;
      
      const videoPath = await this._generateTalkingHead({
        face_image_url: face_image_data_url,
        audio_url: audioUrl,
        audio_path: audioPath,
        model_type: twin.hf_model_type,
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
   * Generate audio using OpenAI TTS or cloned voice
   * @private
   */
  async _generateAudioOpenAI(text, twin, output_dir) {
    // Choose voice based on twin traits and availability
    const voice = this._selectVoice(twin.traits, twin);

    // If we have a cloned voice, use voice cloning service
    if (voice === 'cloned' && twin.voice_sample_path) {
      return this._generateClonedVoice(text, twin, output_dir);
    }

    // FALLBACK: Use OpenAI TTS
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: this.openaiKey });

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice,
      input: text
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const audioPath = path.join(output_dir, `audio_${Date.now()}.mp3`);
    await fs.writeFile(audioPath, buffer);

    console.log('[DigitalTwin] Audio generated with OpenAI voice:', voice);
    return audioPath;
  }

  /**
   * Generate audio using cloned voice (ElevenLabs or similar)
   * @private
   */
  async _generateClonedVoice(text, twin, output_dir) {
    if (!twin.voice_sample_path) {
      throw new Error('Voice sample path required for cloned voice');
    }

    // TODO: Integrate with voice cloning service (ElevenLabs, Coqui, etc.)
    // For now, fallback to OpenAI with closest voice match
    console.log('[DigitalTwin] Voice cloning not yet implemented, using OpenAI fallback');
    
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: this.openaiKey });

    // Select closest OpenAI voice based on twin traits
    const fallbackVoice = this._selectVoice(twin.traits);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: fallbackVoice,
      input: text
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const audioPath = path.join(output_dir, `audio_cloned_${Date.now()}.mp3`);
    await fs.writeFile(audioPath, buffer);

    console.log('[DigitalTwin] Generated audio with cloned voice fallback:', fallbackVoice);
    return audioPath;
  }

  /**
   * Select appropriate voice based on twin traits
   * @private
   */
  _selectVoice(traits = {}, twin = null) {
    // PRIORITY: Use user's cloned voice if available
    if (twin && twin.voice_sample_path && twin.voice_cloned) {
      console.log('[DigitalTwin] Using cloned voice:', twin.voice_sample_path);
      return 'cloned'; // Special marker for cloned voice
    }
    
    // FALLBACK: OpenAI voices based on traits
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
   * Generate talking head video using Replicate API
   * @private
   */
  async _generateTalkingHead({ face_image_url, audio_url, audio_path, model_type, output_dir }) {
    if (!this.replicateToken) {
      throw new Error('REPLICATE_API_TOKEN required for video generation');
    }

    // Validate audio duration (check file size as proxy)
    const audioStats = audio_path ? await fs.stat(audio_path) : { size: 0 };
    const audioSizeMB = audioStats.size / (1024 * 1024);
    
    // Rough estimate: 1MB ≈ 1 minute of audio at 128kbps
    if (audioSizeMB > 5) {
      console.warn('[DigitalTwin] Audio may be too long:', audioSizeMB.toFixed(2), 'MB');
      // Still proceed but warn
    }

    const modelVersion = this.models[model_type] || this.models.sadtalker_fast;
    console.log('[DigitalTwin] Using Replicate model:', modelVersion);
    console.log('[DigitalTwin] Audio size:', audioSizeMB.toFixed(2), 'MB');
    console.log('[DigitalTwin] Face image URL type:', face_image_url.substring(0, 50) + '...');
    console.log('[DigitalTwin] Audio URL type:', audio_url.substring(0, 50) + '...');

    // Start prediction
    const startResponse = await axios.post(
      'https://api.replicate.com/v1/predictions',
      {
        version: modelVersion.split(':')[1],
        input: {
          source_image: face_image_url,
          driven_audio: audio_url,
          preprocess: 'crop',
          still_mode: true,
          use_enhancer: false // Faster without enhancer
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${this.replicateToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const predictionId = startResponse.data.id;
    console.log('[DigitalTwin] Replicate prediction started:', predictionId);

    // Poll for completion (max 7 minutes for longer videos)
    const maxWaitMs = 7 * 60 * 1000;
    const pollIntervalMs = 3000;
    const startTime = Date.now();
    let result = null;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      const statusResponse = await axios.get(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.replicateToken}`
          }
        }
      );

      const status = statusResponse.data.status;
      console.log('[DigitalTwin] Prediction status:', status);

      if (status === 'succeeded') {
        result = statusResponse.data.output;
        break;
      } else if (status === 'failed' || status === 'canceled') {
        throw new Error(`Replicate prediction ${status}: ${statusResponse.data.error || 'Unknown error'}`);
      }
      // Continue polling for 'starting' or 'processing'
    }

    if (!result) {
      throw new Error('Replicate prediction timed out after 5 minutes');
    }

    // Download the generated video
    const videoUrl = typeof result === 'string' ? result : result[0];
    const videoPath = path.join(output_dir, `twin_video_${Date.now()}.mp4`);
    
    await this._downloadFile(videoUrl, videoPath);
    
    console.log('[DigitalTwin] Video downloaded:', videoPath);
    return videoPath;
  }

  /**
   * Upload file to get public URL
   * Returns HTTP URL via /api/file/preview endpoint for Replicate API
   * @private
   */
  async _uploadFile(filePath) {
    try {
      // Replicate requires publicly accessible HTTP URLs, not data URLs
      // Use the /api/file/preview endpoint to serve the file
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const publicUrl = `${baseUrl}/api/file/preview?path=${encodeURIComponent(filePath)}`;
      
      console.log('[DigitalTwin] File available at HTTP URL:', publicUrl);
      return publicUrl;
    } catch (error) {
      console.error('[DigitalTwin] File upload failed:', error);
      throw error;
    }
  }

  /**
   * Convert file to base64 data URL
   * Used for files that need to be sent to Replicate API (localhost URLs don't work)
   * @private
   */
  async _fileToDataUrl(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const base64 = fileBuffer.toString('base64');
      
      // Detect mime type from extension
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg'
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';
      
      const dataUrl = `data:${mimeType};base64,${base64}`;
      console.log('[DigitalTwin] Converted file to base64 data URL:', filePath, `(${(base64.length / 1024).toFixed(2)} KB)`);
      return dataUrl;
    } catch (error) {
      console.error('[DigitalTwin] File to data URL conversion failed:', error);
      throw error;
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
