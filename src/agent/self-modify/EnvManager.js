require('module-alias/register');
const fs = require('fs').promises;
const path = require('path');

/**
 * EnvManager - Safely manage environment variables
 * Allows Grace to add new API keys and configs without breaking existing ones
 */
class EnvManager {
  constructor(options = {}) {
    this.envPath = options.envPath || path.join(process.cwd(), '.env');
    this.backupDir = path.join(process.cwd(), '.backups');
  }

  /**
   * Parse .env file into key-value pairs
   * @param {string} content - .env file content
   * @returns {Object} - Parsed environment variables
   */
  parseEnv(content) {
    const env = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      
      // Parse KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        env[key] = value;
      }
    }
    
    return env;
  }

  /**
   * Convert env object back to .env format
   * @param {Object} env - Environment variables
   * @param {string} originalContent - Original .env content for preserving comments
   * @returns {string} - .env file content
   */
  stringifyEnv(env, originalContent = '') {
    const lines = [];
    const existingKeys = new Set();
    
    // Preserve original structure and comments
    if (originalContent) {
      const originalLines = originalContent.split('\n');
      
      for (const line of originalLines) {
        const trimmed = line.trim();
        
        // Keep comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          lines.push(line);
          continue;
        }
        
        // Update existing keys
        const match = trimmed.match(/^([^=]+)=/);
        if (match) {
          const key = match[1].trim();
          if (env.hasOwnProperty(key)) {
            lines.push(`${key}=${env[key]}`);
            existingKeys.add(key);
          } else {
            lines.push(line); // Keep unchanged
          }
        }
      }
    }
    
    // Add new keys at the end
    const newKeys = Object.keys(env).filter(key => !existingKeys.has(key));
    if (newKeys.length > 0) {
      lines.push(''); // Empty line before new section
      lines.push('# Added by Grace');
      for (const key of newKeys) {
        lines.push(`${key}=${env[key]}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Create backup of .env file
   * @returns {string} - Backup file path
   */
  async createBackup() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      
      const timestamp = Date.now();
      const backupPath = path.join(this.backupDir, `.env.${timestamp}.backup`);
      
      const content = await fs.readFile(this.envPath, 'utf8');
      await fs.writeFile(backupPath, content, 'utf8');
      
      console.log(`✅ [EnvManager] Backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('❌ [EnvManager] Backup failed:', error);
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Read current environment variables
   * @returns {Object} - Current env vars
   */
  async readEnv() {
    try {
      const content = await fs.readFile(this.envPath, 'utf8');
      return this.parseEnv(content);
    } catch (error) {
      console.error('❌ [EnvManager] Read failed:', error);
      throw error;
    }
  }

  /**
   * Add or update environment variable
   * @param {string} key - Variable name
   * @param {string} value - Variable value
   * @param {string} reason - Why this is needed
   * @returns {Object} - Result
   */
  async setEnvVar(key, value, reason) {
    try {
      console.log(`🔧 [EnvManager] Setting ${key}`);
      console.log(`📝 [EnvManager] Reason: ${reason}`);

      // Validate key format
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
        throw new Error(`Invalid env var name: ${key}. Must be UPPERCASE_WITH_UNDERSCORES`);
      }

      // Protected keys that should never be modified
      const protectedKeys = [
        'DATABASE_URL',
        'JWT_SECRET',
        'ADMIN_PASSWORD',
        'ENCRYPTION_KEY'
      ];

      if (protectedKeys.includes(key)) {
        throw new Error(`Cannot modify protected variable: ${key}`);
      }

      // Create backup
      const backupPath = await this.createBackup();

      // Read current env
      const originalContent = await fs.readFile(this.envPath, 'utf8');
      const env = this.parseEnv(originalContent);

      // Check if updating existing key
      const isUpdate = env.hasOwnProperty(key);
      const oldValue = isUpdate ? env[key] : null;

      // Set new value
      env[key] = value;

      // Write back
      const newContent = this.stringifyEnv(env, originalContent);
      await fs.writeFile(this.envPath, newContent, 'utf8');

      console.log(`✅ [EnvManager] ${isUpdate ? 'Updated' : 'Added'} ${key}`);

      // Log modification
      await this.logModification({
        key,
        oldValue,
        newValue: value,
        reason,
        action: isUpdate ? 'update' : 'add',
        backupPath,
        timestamp: new Date()
      });

      return {
        success: true,
        action: isUpdate ? 'updated' : 'added',
        key,
        backupPath,
        message: `✅ ${isUpdate ? 'Updated' : 'Added'} ${key}. Restart server for changes to take effect.`
      };
    } catch (error) {
      console.error('❌ [EnvManager] Set failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add multiple environment variables at once
   * @param {Object} vars - Key-value pairs to add
   * @param {string} reason - Why these are needed
   * @returns {Object} - Result
   */
  async setMultipleVars(vars, reason) {
    try {
      console.log(`🔧 [EnvManager] Setting ${Object.keys(vars).length} variables`);

      // Create backup
      const backupPath = await this.createBackup();

      // Read current env
      const originalContent = await fs.readFile(this.envPath, 'utf8');
      const env = this.parseEnv(originalContent);

      // Validate all keys first
      for (const key of Object.keys(vars)) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
          throw new Error(`Invalid env var name: ${key}`);
        }
      }

      // Apply all changes
      const changes = [];
      for (const [key, value] of Object.entries(vars)) {
        const isUpdate = env.hasOwnProperty(key);
        env[key] = value;
        changes.push({
          key,
          action: isUpdate ? 'updated' : 'added'
        });
      }

      // Write back
      const newContent = this.stringifyEnv(env, originalContent);
      await fs.writeFile(this.envPath, newContent, 'utf8');

      console.log(`✅ [EnvManager] Applied ${changes.length} changes`);

      // Log modification
      await this.logModification({
        changes,
        reason,
        backupPath,
        timestamp: new Date()
      });

      return {
        success: true,
        changes,
        backupPath,
        message: `✅ Applied ${changes.length} changes. Restart server for changes to take effect.`
      };
    } catch (error) {
      console.error('❌ [EnvManager] Batch set failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get value of environment variable
   * @param {string} key - Variable name
   * @returns {string|null} - Variable value
   */
  async getEnvVar(key) {
    try {
      const env = await this.readEnv();
      return env[key] || null;
    } catch (error) {
      console.error('❌ [EnvManager] Get failed:', error);
      return null;
    }
  }

  /**
   * List all environment variables (with sensitive values masked)
   * @returns {Object} - Env vars with masked values
   */
  async listEnvVars() {
    try {
      const env = await this.readEnv();
      const masked = {};
      
      const sensitivePatterns = [
        /KEY/i,
        /SECRET/i,
        /PASSWORD/i,
        /TOKEN/i,
        /API/i
      ];

      for (const [key, value] of Object.entries(env)) {
        const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
        
        if (isSensitive && value) {
          // Mask sensitive values
          masked[key] = value.substring(0, 4) + '****' + value.substring(value.length - 4);
        } else {
          masked[key] = value;
        }
      }

      return masked;
    } catch (error) {
      console.error('❌ [EnvManager] List failed:', error);
      return {};
    }
  }

  /**
   * Log modification to file
   * @param {Object} logEntry - Log entry
   */
  async logModification(logEntry) {
    try {
      const logPath = path.join(this.backupDir, 'env_modifications.log');
      const logLine = JSON.stringify({
        ...logEntry,
        timestamp: logEntry.timestamp.toISOString()
      }) + '\n';
      
      await fs.appendFile(logPath, logLine, 'utf8');
    } catch (error) {
      console.error('❌ [EnvManager] Logging failed:', error);
    }
  }

  /**
   * Get modification history
   * @param {number} limit - Number of entries
   * @returns {Array} - Modification history
   */
  async getHistory(limit = 20) {
    try {
      const logPath = path.join(this.backupDir, 'env_modifications.log');
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
const envManager = new EnvManager();

module.exports = envManager;
