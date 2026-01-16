const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const fal = require('@fal-ai/serverless-client');

/**
 * DigitalTwinService
 * Handles digital twin creation and video generation using LongCat-Video-Avatar via fal.ai
 * Primary Voice: Fish Audio | Fallback: ElevenLabs
 */
class DigitalTwinService {
  constructor() {
    this.falKey = process.env.FAL_KEY;
    this.fishAudioKey = process.env.FISH_AUDIO_API_KEY;
    this.elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;

    // fal.ai LongCat model endpoint
    this.longCatModel = 'fal-ai/longcat-video-avatar';
    
    // Initialize fal client
    if (this.falKey) {
      fal.config({
        credentials: this.falKey,
      });
    }
  }

  /**
   * Create a new digital twin
   */
  async createTwin({ user_id, name, face_image_path, traits = {}, model_type = 'longcat' }) {
    console.log('[DigitalTwin] Creating twin:', { user_id, name, model_type });
    
    try {
      await fs.access(face_image_path);
    } catch (e) {
      throw new Error(`Face image not found: ${face_image_path}`);
    }

    const face_image_url = await this._uploadFile(face_image_path);
    const DigitalTwin = require('@src/models/DigitalTwin');
    
    const twin = await DigitalTwin.create({
      user_id,
      name,
      face_image_path,
      face_image_url,
      traits,
      hf_model_type: model_type,
      status: 'active'
    });

    console.log('[DigitalTwin] ✅ Twin created:', twin.id);
    return twin;
  }

  /**
   * Generate a hyper-realistic video using LongCat
   */
  async generateVideo({ twin_id, script, user_id, conversation_id, background, output_dir }) {
    console.log('[DigitalTwin] Generating LongCat video for twin:', twin_id);
    const startTime = Date.now();
    
    const DigitalTwin = require('@src/models/DigitalTwin');
    const twin = await DigitalTwin.findByPk(twin_id);
    if (!twin) throw new Error(`Twin not found: ${twin_id}`);

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
      // Step 1: Generate Audio (Fish Audio -> ElevenLabs -> OpenAI)
      console.log('[DigitalTwin] Step 1: Generating cloned voice audio...');
      const audioPath = await this._generateAudio(script, twin, output_dir);
      
      // Step 2: Generate Video via fal.ai LongCat
      console.log('[DigitalTwin] Step 2: Generating LongCat video via fal.ai...');
      
      // Construct scene description from traits
      const sceneDescription = this._buildSceneDescription(twin, background);
      
      // Upload files to fal.ai or use data URLs
      const faceUrl = await this._fileToDataUrl(twin.face_image_path);
      const audioUrl = await this._fileToDataUrl(audioPath);

      const result = await fal.subscribe(this.longCatModel, {
        input: {
          image_url: faceUrl,
          audio_url: audioUrl,
          prompt: sceneDescription,
          motion_scale: 1.0,
          refinement: true
        },
        pollInterval: 3000,
      });

      if (!result || !result.video) {
        throw new Error('LongCat generation failed: No video output');
      }

      const videoUrl = result.video.url;
      const videoPath = path.join(output_dir, `twin_longcat_${Date.now()}.mp4`);
      await this._downloadFile(videoUrl, videoPath);

      const processingTime = Date.now() - startTime;
      await video.update({
        video_path: videoPath,
        video_url: await this._uploadFile(videoPath),
        video_filename: path.basename(videoPath),
        status: 'completed',
        processing_time_ms: processingTime,
        completed_at: new Date()
      });

      // Update twin stats
      await twin.update({
        videos_generated: (twin.videos_generated || 0) + 1,
        last_used_at: new Date()
      });

      return {
        video_id: video.id,
        video_path: videoPath,
        video_url: video.video_url,
        video_filename: video.video_filename,
        processing_time_ms: processingTime
      };
    } catch (error) {
      console.error('[DigitalTwin] LongCat generation failed:', error);
      await video.update({ status: 'failed', error_message: error.message });
      throw error;
    }
  }

  /**
   * Generate multiple twin videos for website sections
   */
  async generateWebsiteVideos({ twin_id, sections, user_id, conversation_id, output_dir }) {
    console.log('[DigitalTwin] Generating website videos for', sections.length, 'sections');
    const videos = {};
    for (const section of sections) {
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
          filename: result.video_filename
        };
      } catch (error) {
        console.error(`[DigitalTwin] Failed for section "${section.name}":`, error);
        videos[section.name] = { error: error.message };
      }
    }
    return videos;
  }

  /**
   * Internal Audio Generation Logic
   */
  async _generateAudio(text, twin, output_dir) {
    // 1. Try Fish Audio
    if (this.fishAudioKey && twin.voice_sample_path) {
      try {
        return await this._generateFishAudio(text, twin, output_dir);
      } catch (e) {
        console.warn('[DigitalTwin] Fish Audio failed, falling back to ElevenLabs:', e.message);
      }
    }

    // 2. Try ElevenLabs
    if (this.elevenLabsKey && twin.voice_sample_path) {
      try {
        return await this._generateElevenLabsAudio(text, twin, output_dir);
      } catch (e) {
        console.warn('[DigitalTwin] ElevenLabs failed, falling back to OpenAI:', e.message);
      }
    }

    // 3. Final Fallback: OpenAI
    return await this._generateOpenAIAudio(text, twin, output_dir);
  }

  async _generateFishAudio(text, twin, output_dir) {
    console.log('[DigitalTwin] Using Fish Audio for voice cloning...');
    const response = await axios.post('https://api.fish.audio/v1/tts', {
      text: text,
      reference_id: twin.traits.fish_voice_id || null,
    }, {
      headers: { 'Authorization': `Bearer ${this.fishAudioKey}`, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer'
    });

    const audioPath = path.join(output_dir, `audio_fish_${Date.now()}.mp3`);
    await fs.writeFile(audioPath, response.data);
    return audioPath;
  }

  async _generateElevenLabsAudio(text, twin, output_dir) {
    console.log('[DigitalTwin] Using ElevenLabs for voice cloning...');
    const voiceId = twin.traits.eleven_voice_id || '21m00Tcm4TlvDq8ikWAM';
    const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      text: text,
      model_id: 'eleven_monolingual_v1'
    }, {
      headers: { 'xi-api-key': this.elevenLabsKey, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer'
    });

    const audioPath = path.join(output_dir, `audio_eleven_${Date.now()}.mp3`);
    await fs.writeFile(audioPath, response.data);
    return audioPath;
  }

  async _generateOpenAIAudio(text, twin, output_dir) {
    console.log('[DigitalTwin] Using OpenAI TTS fallback...');
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: this.openaiKey });
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: twin.traits.gender === 'female' ? 'nova' : 'onyx',
      input: text
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const audioPath = path.join(output_dir, `audio_openai_${Date.now()}.mp3`);
    await fs.writeFile(audioPath, buffer);
    return audioPath;
  }

  _buildSceneDescription(twin, background) {
    const traits = twin.traits || {};
    const mood = traits.mood || 'professional';
    const style = traits.style || 'natural';
    const bg = background || traits.background || 'a neutral studio background';
    
    return `A hyper-realistic video of a person with a ${mood} expression, ${style} movements, in ${bg}. The lighting is cinematic and the identity is perfectly preserved.`;
  }

  async _fileToDataUrl(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    const base64 = fileBuffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.mp3' ? 'audio/mpeg' : (ext === '.wav' ? 'audio/wav' : 'image/jpeg');
    return `data:${mimeType};base64,${base64}`;
  }

  async _uploadFile(filePath) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/api/file/preview?path=${encodeURIComponent(filePath)}`;
  }

  async _downloadFile(url, outputPath) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.writeFile(outputPath, response.data);
  }

  async getUserTwins(user_id) {
    const DigitalTwin = require('@src/models/DigitalTwin');
    return await DigitalTwin.findAll({
      where: { user_id, status: 'active' },
      order: [['is_default', 'DESC'], ['created_at', 'DESC']]
    });
  }

  async getDefaultTwin(user_id) {
    const DigitalTwin = require('@src/models/DigitalTwin');
    return await DigitalTwin.findOne({
      where: { user_id, is_default: true, status: 'active' }
    });
  }

  async setDefaultTwin(twin_id, user_id) {
    const DigitalTwin = require('@src/models/DigitalTwin');
    await DigitalTwin.update({ is_default: false }, { where: { user_id } });
    await DigitalTwin.update({ is_default: true }, { where: { id: twin_id, user_id } });
  }
}

module.exports = DigitalTwinService;
