/**
 * Response Validator - Strategic file existence validation
 * Validates Grace's delivery claims without disrupting workflow
 */

const fs = require('fs');
const path = require('path');

class ResponseValidator {
  
  /**
   * Lightweight file delivery validation - passthrough layer with graceful fallback
   * @param {string} response - Grace's response text
   * @param {string} conversationId - Current conversation ID
   * @returns {string} - Enhanced response or original if validation fails
   */
  static validateFileDeliveryClaims(response, conversationId) {
    try {
      // FAILSAFE: Ensure we always have a string to work with
      if (typeof response !== 'string') {
        response = String(response?.content || response?.message || response || '');
      }

      // TARGETED: Only check responses that claim file creation/delivery
      const hasFileClaimPattern = /(?:created|generated|built|made|saved)\s+\w+\.\w+|file.*(?:ready|available|created)|saved to.*workspace/i;
      
      if (!hasFileClaimPattern.test(response)) {
        return response; // No file claims - pass through unchanged
      }

      // Extract any filenames mentioned (any extension)
      const filenames = response.match(/\b\w+\.\w{2,5}\b/g) || [];
      
      if (filenames.length === 0) {
        return response; // No filenames found - pass through
      }

      // Quick validation check
      const verifiedFiles = [];
      for (const filename of filenames) {
        if (this.quickFileCheck(filename, conversationId)) {
          verifiedFiles.push(filename);
        }
      }

      // Enhance response only if files are verified
      if (verifiedFiles.length > 0) {
        return response.replace(/(\b\w+\.\w{2,5}\b)/g, (match) => {
          return verifiedFiles.includes(match) ? `${match} ✅` : match;
        });
      }

      return response; // Return original if no files verified

    } catch (error) {
      console.warn('[ResponseValidator] Validation failed, passing through:', error.message);
      return response; // FAILSAFE: Always return original response on any error
    }
  }

  /**
   * Quick file existence check - lightweight and fast
   */
  static quickFileCheck(filename, conversationId) {
    try {
      // Check most common locations only
      const commonPaths = [
        `./workspace/Conversation_${conversationId}/${filename}`,
        `./workspace/${filename}`,
        `./${filename}`
      ];

      for (const filePath of commonPaths) {
        try {
          if (fs.statSync(filePath).isFile()) {
            return true;
          }
        } catch (err) {
          // Continue to next path
        }
      }
      return false;
    } catch (error) {
      return false; // Fail silently
    }
  }
}

module.exports = ResponseValidator;
