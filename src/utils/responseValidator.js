/**
 * Response Validator - Strategic file existence validation
 * Validates Grace's delivery claims without disrupting workflow
 */

const fs = require('fs');
const path = require('path');

class ResponseValidator {
  
  /**
   * Validate file delivery claims in Grace's response
   * @param {string} response - Grace's response text
   * @param {string} conversationId - Current conversation ID
   * @returns {string} - Validated and corrected response
   */
  static validateFileDeliveryClaims(response, conversationId) {
    try {
      // Pattern to detect file delivery claims
      const deliveryPatterns = [
        /(?:created|generated|saved|built|made)\s+([^.\s]+\.(?:docx|pdf|xlsx|csv|json|xml|png|jpg|svg|html|md|txt|zip|pptx|xer|mpp))/gi,
        /(?:file|document)\s+(?:is\s+)?(?:ready|available|created|saved)/gi,
        /(?:saved to|placed in|available in)\s+(?:workspace|your\s+workspace)/gi
      ];

      let hasDeliveryClaims = false;
      for (const pattern of deliveryPatterns) {
        if (pattern.test(response)) {
          hasDeliveryClaims = true;
          break;
        }
      }

      if (!hasDeliveryClaims) {
        return response; // No delivery claims to validate
      }

      console.log('[ResponseValidator] File delivery claims detected, validating...');

      // Extract potential filenames from response
      const filenameMatches = response.match(/([^.\s]+\.(?:docx|pdf|xlsx|csv|json|xml|png|jpg|svg|html|md|txt|zip|pptx|xer|mpp))/gi);
      
      if (!filenameMatches) {
        return response; // No specific filenames found
      }

      const validatedFiles = [];
      const missingFiles = [];

      // Check each mentioned file
      for (const filename of filenameMatches) {
        const fileExists = this.checkFileExists(filename, conversationId);
        if (fileExists.exists) {
          validatedFiles.push({
            name: filename,
            path: fileExists.path,
            size: fileExists.size
          });
        } else {
          missingFiles.push(filename);
        }
      }

      // Strategically modify response based on validation results
      return this.adjustResponseForValidation(response, validatedFiles, missingFiles);

    } catch (error) {
      console.error('[ResponseValidator] Validation error:', error);
      return response; // Return original response on error
    }
  }

  /**
   * Check if file actually exists in expected locations
   */
  static checkFileExists(filename, conversationId) {
    const possiblePaths = [
      // Conversation-specific workspace
      path.resolve(`./workspace/Conversation_${conversationId}/${filename}`),
      // General workspace
      path.resolve(`./workspace/${filename}`),
      // Current working directory
      path.resolve(`./${filename}`)
    ];

    for (const filePath of possiblePaths) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          return {
            exists: true,
            path: filePath,
            size: stats.size,
            relativePath: path.relative(process.cwd(), filePath)
          };
        }
      } catch (err) {
        // File doesn't exist at this path, continue checking
      }
    }

    return { exists: false };
  }

  /**
   * Strategically adjust response based on file validation results
   */
  static adjustResponseForValidation(response, validatedFiles, missingFiles) {
    let adjustedResponse = response;

    if (validatedFiles.length > 0 && missingFiles.length === 0) {
      // All files verified - enhance response with confidence
      adjustedResponse = this.enhanceVerifiedResponse(response, validatedFiles);
    } else if (missingFiles.length > 0) {
      // Some files missing - provide honest correction
      adjustedResponse = this.correctMissingFilesResponse(response, validatedFiles, missingFiles);
    }

    return adjustedResponse;
  }

  /**
   * Enhance response when all files are verified
   */
  static enhanceVerifiedResponse(response, validatedFiles) {
    // Add verification badges to build confidence
    let enhanced = response;

    for (const file of validatedFiles) {
      const sizeText = file.size > 0 ? ` (${this.formatFileSize(file.size)})` : '';
      const verificationBadge = ` ✅ Verified${sizeText}`;
      
      // Add verification badge after filename mentions
      enhanced = enhanced.replace(
        new RegExp(`(${this.escapeRegex(file.name)})`, 'gi'),
        `$1${verificationBadge}`
      );
    }

    return enhanced;
  }

  /**
   * Correct response when files are missing
   */
  static correctMissingFilesResponse(response, validatedFiles, missingFiles) {
    let corrected = response;

    // Replace overconfident claims with honest status
    const overconfidentPatterns = [
      /(?:saved to|placed in|available in)\s+(?:workspace|your\s+workspace)/gi,
      /(?:file|document)\s+(?:is\s+)?(?:ready|available)/gi
    ];

    for (const pattern of overconfidentPatterns) {
      corrected = corrected.replace(pattern, 'file creation attempted');
    }

    // Add honest disclaimer at the end
    if (missingFiles.length > 0) {
      const disclaimer = `\n\n⚠️ **File Status Update:** I attempted to create ${missingFiles.join(', ')} but cannot verify the file${missingFiles.length > 1 ? 's' : ''} ${missingFiles.length > 1 ? 'were' : 'was'} successfully saved. Please check your workspace or let me know if you need me to retry the file creation.`;
      corrected += disclaimer;
    }

    return corrected;
  }

  /**
   * Helper methods
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = ResponseValidator;
