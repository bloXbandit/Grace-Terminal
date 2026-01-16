const DigitalTwinService = require('@src/utils/digital_twin');
const path = require('path');
const fs = require('fs').promises;

/**
 * Digital Twin Tool
 * Allows Grace to generate hyper-realistic videos using the user's digital twin (LongCat)
 */
module.exports = {
  name: 'digital_twin',
  description: 'Generate a hyper-realistic video of the user\'s digital twin (AI avatar) speaking a script. Use this when the user asks to "make a video of me", "generate a twin video", or "say this as my avatar".',
  parameters: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: 'The text script for the digital twin to speak. Should be natural and in the user\'s voice style.'
      },
      background: {
        type: 'string',
        description: 'Optional description of the background scene (e.g., "in a modern office", "at a beach").'
      },
      twin_id: {
        type: 'string',
        description: 'Optional specific twin ID. If not provided, the user\'s default twin will be used.'
      }
    },
    required: ['script']
  },

  async execute({ script, background, twin_id }, { state }) {
    const service = new DigitalTwinService();
    const userId = state.user.id;
    
    try {
      let twin;
      if (twin_id) {
        const DigitalTwin = require('@src/models/DigitalTwin');
        twin = await DigitalTwin.findOne({ where: { id: twin_id, user_id: userId } });
      } else {
        twin = await service.getDefaultTwin(userId);
      }

      if (!twin) {
        return {
          error: 'No digital twin found. Please create one first in the Digital Twin settings page.',
          suggestion: 'You can create your digital twin by uploading a photo and voice sample in the Digital Twin section.'
        };
      }

      // Create output directory
      const outputDir = path.join(process.cwd(), 'workspace', `user_${userId}`, 'twin_videos');
      await fs.mkdir(outputDir, { recursive: true });

      console.log(`[Tool: DigitalTwin] Generating video for user ${userId} using twin ${twin.id}`);
      
      const result = await service.generateVideo({
        twin_id: twin.id,
        script,
        user_id: userId,
        conversation_id: state.conversation_id || null,
        background: background || twin.traits?.background,
        output_dir: outputDir
      });

      return {
        success: true,
        message: 'Digital twin video generation started successfully using LongCat AI.',
        video_id: result.video_id,
        preview_url: result.video_url,
        status: 'processing',
        info: 'The video is being generated via fal.ai. It will appear in your gallery once complete.'
      };
    } catch (error) {
      console.error('[Tool: DigitalTwin] Execution failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to initiate video generation.'
      };
    }
  }
};
