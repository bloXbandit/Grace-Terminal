/**
 * Response Validator - Strategic file existence validation
 * Validates Grace's delivery claims without disrupting workflow
 */

const fs = require('fs');
const path = require('path');

class ResponseValidator {
  
  /**
   * Remove code blocks and technical artifacts from user-facing messages
   * @param {string} content - Message content to clean
   * @returns {string} - Cleaned content
   */
  static removeCodeBlocks(content) {
    if (typeof content !== 'string') return content;
    
    // Remove markdown code blocks
    content = content.replace(/```[\s\S]*?```/g, '');
    
    // Remove inline code
    content = content.replace(/`[^`]+`/g, '');
    
    // Remove Python script references
    content = content.replace(/temp_script_\d+\.py/g, '');
    
    // Remove file paths in output
    content = content.replace(/\/workspace\/[^\s]+/g, '');
    content = content.replace(/\/app\/workspace\/[^\s]+/g, '');
    
    // Remove XML tags that might leak through
    content = content.replace(/<\/?[a-z_]+>/gi, '');
    
    return content.trim();
  }

  /**
   * Lightweight file delivery validation - passthrough layer with graceful fallback
   * @param {string} response - Grace's response text
   * @param {string} conversationId - Current conversation ID
   * @param {object} meta - Message metadata (optional)
   * @returns {string} - Enhanced response or original if validation fails
   */
  static validateFileDeliveryClaims(response, conversationId, meta = {}) {
    try {
      // INTELLIGENT: Convert objects to meaningful strings
      if (typeof response !== 'string') {
        response = this.intelligentStringConversion(response);
      }

      // Clean code snippets from finish_summery messages
      if (meta && meta.action_type === 'finish_summery') {
        response = this.removeCodeBlocks(response);
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
   * Intelligent object-to-string conversion that preserves content
   */
  static intelligentStringConversion(obj) {
    try {
      // Handle null/undefined
      if (obj === null || obj === undefined) {
        return '';
      }

      // Already a string
      if (typeof obj === 'string') {
        return obj;
      }

      // Handle common response object patterns
      if (typeof obj === 'object') {
        // Try common content properties first
        if (obj.content && typeof obj.content === 'string') {
          return obj.content;
        }
        if (obj.message && typeof obj.message === 'string') {
          return obj.message;
        }
        if (obj.text && typeof obj.text === 'string') {
          return obj.text;
        }
        if (obj.response && typeof obj.response === 'string') {
          return obj.response;
        }
        if (obj.result && typeof obj.result === 'string') {
          return obj.result;
        }

        // Handle nested content objects
        if (obj.content && typeof obj.content === 'object') {
          return this.intelligentStringConversion(obj.content);
        }

        // Handle arrays - join meaningful content
        if (Array.isArray(obj)) {
          return obj.map(item => this.intelligentStringConversion(item)).join(' ');
        }

        // For complex objects, try to extract meaningful text
        const meaningfulText = this.extractMeaningfulText(obj);
        if (meaningfulText) {
          return meaningfulText;
        }

        // Last resort: clean JSON stringify
        return JSON.stringify(obj, null, 0)
          .replace(/[{}[\]"]/g, '') // Remove JSON syntax
          .replace(/,/g, ' ') // Replace commas with spaces
          .replace(/:/g, ': ') // Make colons readable
          .trim();
      }

      // Handle primitives
      return String(obj);
    } catch (error) {
      console.warn('[ResponseValidator] String conversion failed:', error);
      return String(obj || '');
    }
  }

  /**
   * Extract meaningful text from complex objects
   */
  static extractMeaningfulText(obj) {
    try {
      const textFields = [];
      
      // Recursively find string values
      const extractStrings = (item, depth = 0) => {
        if (depth > 3) return; // Prevent infinite recursion
        
        if (typeof item === 'string' && item.length > 0) {
          textFields.push(item);
        } else if (typeof item === 'object' && item !== null) {
          Object.values(item).forEach(value => extractStrings(value, depth + 1));
        }
      };

      extractStrings(obj);
      
      // Return joined meaningful text
      return textFields.length > 0 ? textFields.join(' ').trim() : null;
    } catch (error) {
      return null;
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
