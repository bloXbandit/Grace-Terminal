require('module-alias/register');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * SelfModifier - Allows Grace to safely modify her own code
 * Implements safety checks and rollback mechanisms
 */
class SelfModifier {
  constructor(options = {}) {
    this.baseDir = options.baseDir || '/app';
    this.backupDir = path.join(this.baseDir, '.backups');
    this.allowedPaths = options.allowedPaths || [
      '/app/src/agent',
      '/app/src/utils',
      '/app/src/tools'
    ];
    this.restrictedPaths = [
      '/app/src/models',
      '/app/src/routers/auth'
      // .env is now managed via EnvManager tool for safety
    ];
  }

  /**
   * Check if path is safe to modify
   * @param {string} filePath - Path to check
   * @returns {boolean} - Whether path is safe
   */
  isSafeToModify(filePath) {
    const absolutePath = path.resolve(filePath);
    
    // Check if in restricted paths
    for (const restricted of this.restrictedPaths) {
      if (absolutePath.startsWith(restricted)) {
        return false;
      }
    }

    // Check if in allowed paths
    for (const allowed of this.allowedPaths) {
      if (absolutePath.startsWith(allowed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create backup of file before modification
   * @param {string} filePath - File to backup
   * @returns {string} - Backup file path
   */
  async createBackup(filePath) {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      
      const timestamp = Date.now();
      const fileName = path.basename(filePath);
      const backupPath = path.join(this.backupDir, `${fileName}.${timestamp}.backup`);
      
      const content = await fs.readFile(filePath, 'utf8');
      await fs.writeFile(backupPath, content, 'utf8');
      
      console.log(`✅ [SelfModify] Backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('❌ [SelfModify] Backup failed:', error);
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Restore from backup
   * @param {string} backupPath - Backup file path
   * @param {string} originalPath - Original file path
   */
  async restoreBackup(backupPath, originalPath) {
    try {
      const content = await fs.readFile(backupPath, 'utf8');
      await fs.writeFile(originalPath, content, 'utf8');
      console.log(`✅ [SelfModify] Restored from backup: ${originalPath}`);
    } catch (error) {
      console.error('❌ [SelfModify] Restore failed:', error);
      throw error;
    }
  }

  /**
   * Validate code syntax before applying
   * @param {string} code - Code to validate
   * @param {string} fileType - File extension
   * @returns {Object} - Validation result
   */
  async validateCode(code, fileType) {
    try {
      if (fileType === '.js') {
        // Try to parse as JavaScript
        new Function(code);
        return { valid: true };
      }
      
      if (fileType === '.json') {
        JSON.parse(code);
        return { valid: true };
      }

      // For other types, just check it's not empty
      return { valid: code.trim().length > 0 };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Modify a file with safety checks
   * @param {Object} modification - Modification details
   * @returns {Object} - Result of modification
   */
  async modifyFile(modification) {
    const {
      filePath,
      newContent,
      reason,
      requestedBy = 'Grace'
    } = modification;

    try {
      console.log(`🔧 [SelfModify] Modifying: ${filePath}`);
      console.log(`📝 [SelfModify] Reason: ${reason}`);

      // Safety check 1: Is path allowed?
      if (!this.isSafeToModify(filePath)) {
        throw new Error(`Path not allowed for modification: ${filePath}`);
      }

      // Safety check 2: Does file exist?
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        throw new Error(`File does not exist: ${filePath}`);
      }

      // Safety check 3: Validate new code
      const fileType = path.extname(filePath);
      const validation = await this.validateCode(newContent, fileType);
      if (!validation.valid) {
        throw new Error(`Invalid code: ${validation.error}`);
      }

      // Create backup
      const backupPath = await this.createBackup(filePath);

      // Apply modification
      await fs.writeFile(filePath, newContent, 'utf8');
      console.log(`✅ [SelfModify] File modified successfully`);

      // Log modification
      await this.logModification({
        filePath,
        backupPath,
        reason,
        requestedBy,
        timestamp: new Date(),
        success: true
      });

      return {
        success: true,
        filePath,
        backupPath,
        message: 'Modification applied successfully'
      };
    } catch (error) {
      console.error('❌ [SelfModify] Modification failed:', error);
      
      // Log failed attempt
      await this.logModification({
        filePath,
        reason,
        requestedBy,
        timestamp: new Date(),
        success: false,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add a new file (e.g., new tool, new agent)
   * @param {Object} fileData - New file data
   * @returns {Object} - Result
   */
  async addNewFile(fileData) {
    const {
      filePath,
      content,
      reason,
      requestedBy = 'Grace'
    } = fileData;

    try {
      console.log(`➕ [SelfModify] Adding new file: ${filePath}`);

      // Safety check: Is path allowed?
      if (!this.isSafeToModify(filePath)) {
        throw new Error(`Path not allowed: ${filePath}`);
      }

      // Safety check: File shouldn't exist
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (exists) {
        throw new Error(`File already exists: ${filePath}`);
      }

      // Validate code
      const fileType = path.extname(filePath);
      const validation = await this.validateCode(content, fileType);
      if (!validation.valid) {
        throw new Error(`Invalid code: ${validation.error}`);
      }

      // Create directory if needed
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`✅ [SelfModify] New file created`);

      await this.logModification({
        filePath,
        reason,
        requestedBy,
        timestamp: new Date(),
        success: true,
        action: 'create'
      });

      return {
        success: true,
        filePath,
        message: 'File created successfully'
      };
    } catch (error) {
      console.error('❌ [SelfModify] File creation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Hot reload modified code (requires restart for some changes)
   * @param {string} filePath - File that was modified
   */
  async hotReload(filePath) {
    try {
      // Clear require cache for the module
      delete require.cache[require.resolve(filePath)];
      console.log(`🔄 [SelfModify] Module cache cleared for: ${filePath}`);
      
      return {
        success: true,
        message: 'Module reloaded (some changes may require server restart)'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Log modification to file
   * @param {Object} logEntry - Log entry
   */
  async logModification(logEntry) {
    try {
      const logPath = path.join(this.backupDir, 'modifications.log');
      const logLine = JSON.stringify({
        ...logEntry,
        timestamp: logEntry.timestamp.toISOString()
      }) + '\n';
      
      await fs.appendFile(logPath, logLine, 'utf8');
    } catch (error) {
      console.error('❌ [SelfModify] Logging failed:', error);
    }
  }

  /**
   * Get modification history
   * @param {number} limit - Number of entries to return
   * @returns {Array} - Modification history
   */
  async getHistory(limit = 50) {
    try {
      const logPath = path.join(this.backupDir, 'modifications.log');
      const content = await fs.readFile(logPath, 'utf8');
      const lines = content.trim().split('\n');
      
      return lines
        .slice(-limit)
        .map(line => JSON.parse(line))
        .reverse();
    } catch (error) {
      return [];
    }
  }
}

// Create singleton instance
const selfModifier = new SelfModifier({
  baseDir: '/app',
  allowedPaths: [
    '/app/src/agent',
    '/app/src/utils',
    '/app/src/tools',
    '/app/src/agent/prompt'
  ]
});

module.exports = selfModifier;
