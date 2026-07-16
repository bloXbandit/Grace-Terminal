/**
 * Image Edit Runtime Tool
 * Handles image editing operations including face swap, technical edits, and AI edits
 */

const path = require('path');
const fs = require('fs').promises;
const { restrictFilepath } = require('./runtime.util');
const ImageEditService = require('@src/utils/image_edit');
const HuggingFaceFaceSwapService = require('@src/utils/huggingface_faceswap');

/**
 * Execute image edit operation
 * @param {Object} action - Action object with params
 * @param {string} uuid - Unique identifier for this action
 * @param {number} user_id - User ID for file path restriction
 * @param {Object} context - Conversation context with uploaded files
 * @returns {Promise<Object>} - Result object
 */
const image_edit = async (action, uuid, user_id, context = {}) => {
  try {
    const { request, output_path } = action.params;
    
    if (!request) {
      throw new Error('image_edit requires a request parameter describing the edit');
    }

    console.log('[image_edit] Processing request:', request);

    // Get uploaded images from context
    const uploadedImages = (context.files || []).filter(f => {
      const ext = path.extname(f.file_name || '').toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    });

    console.log('[image_edit] Found uploaded images:', uploadedImages.length);

    // Initialize services
    const imageEditService = new ImageEditService();
    await imageEditService.initialize();

    // Detect edit type
    const editType = imageEditService.detectEditType(request);
    console.log('[image_edit] Detected edit type:', editType.type, editType.operation);

    // Handle face swap specifically
    if (editType.type === 'huggingface_faceswap') {
      if (uploadedImages.length < 2) {
        return {
          uuid,
          status: 'error',
          content: `Face swap requires 2 uploaded images. Found ${uploadedImages.length}. Please upload:\n1. Source image (face to copy)\n2. Target image (body/background to put face on)`,
          meta: {
            action_type: 'image_edit',
            edit_type: 'faceswap',
            images_found: uploadedImages.length
          }
        };
      }

      // Determine source and target from upload order or user prompt
      let sourceImage, targetImage;
      
      // Check if user specified "first" or "second" in their request
      const requestLower = request.toLowerCase();
      const mentionsFirst = /\b(first|1st)\b/.test(requestLower);
      const mentionsSecond = /\b(second|2nd)\b/.test(requestLower);
      const mentionsMyFace = /\b(my face|me)\b/.test(requestLower);
      
      if (mentionsMyFace && mentionsSecond) {
        // "put my face on the second image" -> first upload = source, second = target
        sourceImage = uploadedImages[0];
        targetImage = uploadedImages[1];
      } else if (mentionsFirst && mentionsSecond) {
        // Explicit mention of both -> parse which is source
        if (/put.*first.*on.*second/.test(requestLower)) {
          sourceImage = uploadedImages[0];
          targetImage = uploadedImages[1];
        } else if (/put.*second.*on.*first/.test(requestLower)) {
          sourceImage = uploadedImages[1];
          targetImage = uploadedImages[0];
        } else {
          // Default: first upload = source
          sourceImage = uploadedImages[0];
          targetImage = uploadedImages[1];
        }
      } else {
        // Default behavior: first uploaded image = source (face to copy)
        // second uploaded image = target (body to put face on)
        sourceImage = uploadedImages[0];
        targetImage = uploadedImages[1];
      }

      console.log('[image_edit] Face swap order:', {
        source: sourceImage.file_name,
        target: targetImage.file_name
      });

      // Restrict file paths for security
      const sourcePath = await restrictFilepath(sourceImage.file_path, user_id);
      const targetPath = await restrictFilepath(targetImage.file_path, user_id);

      // Generate output path
      const dir_name = 'Conversation_' + context.conversation_id.slice(0, 6);
      const timestamp = Date.now();
      const outputFilename = output_path || `faceswap_${timestamp}.png`;
      const outputPath = await restrictFilepath(
        path.join(`user_${user_id}`, dir_name, outputFilename),
        user_id
      );

      // Execute face swap
      console.log('[image_edit] Executing face swap...');
      const faceSwapService = new HuggingFaceFaceSwapService();
      
      const result = await faceSwapService.swapFace({
        sourceImagePath: sourcePath,
        targetImagePath: targetPath,
        outputPath: outputPath
      });

      console.log('[image_edit] Face swap completed:', result.outputPath);

      return {
        uuid,
        status: 'success',
        content: `✅ Face swap completed! Created ${path.basename(result.outputPath)}`,
        meta: {
          action_type: 'image_edit',
          edit_type: 'faceswap',
          output_path: result.outputPath,
          source_image: sourceImage.file_name,
          target_image: targetImage.file_name,
          endpoint: result.endpoint
        }
      };
    }

    // Handle other edit types (technical, AI, etc.)
    // For now, return not implemented for non-face-swap operations
    return {
      uuid,
      status: 'error',
      content: `Image edit type "${editType.type}" with operation "${editType.operation}" is not yet implemented. Currently only face swap is supported.`,
      meta: {
        action_type: 'image_edit',
        edit_type: editType.type,
        operation: editType.operation
      }
    };

  } catch (error) {
    console.error('[image_edit] Error:', error);
    return {
      uuid,
      status: 'error',
      content: `Image edit failed: ${error.message}`,
      meta: {
        action_type: 'image_edit',
        error: error.message,
        stack: error.stack
      }
    };
  }
};

module.exports = image_edit;
