const fs = require('fs').promises;
const path = require('path');
const { getDirpath } = require('@src/utils/electron');
const { getAllFilesRecursively } = require('@src/agent/fileUtils');
const File = require('@src/models/File');

/**
 * File Registry - Single Source of Truth for Files
 * 
 * Syncs database ↔ filesystem and provides unified file access.
 * 
 * Features:
 * - Auto-syncs DB with filesystem
 * - Registers new files in both places
 * - Detects and registers orphaned files
 * - Single API for all file operations
 * 
 * Usage:
 *   const registry = new FileRegistry(conversationId, userId);
 *   await registry.register(filePath, fileName);
 *   const files = await registry.getAll(); // Auto-synced!
 */
class FileRegistry {
  constructor(conversationId, userId) {
    if (!conversationId) {
      throw new Error('[FileRegistry] conversationId is required');
    }
    if (!userId) {
      throw new Error('[FileRegistry] userId is required');
    }
    
    this.conversationId = conversationId;
    this.userId = userId;
    
    // Follow Grace's workspace path pattern
    const dir_name = 'Conversation_' + conversationId.slice(0, 6);
    const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', userId);
    this.conversationDir = path.join(WORKSPACE_DIR, dir_name);
    
    console.log(`[FileRegistry] Initialized for ${dir_name}`);
  }

  /**
   * Get all files (syncs DB ↔ filesystem)
   * This is the main method - always returns synced, up-to-date file list
   */
  async getAll() {
    try {
      // Load from database
      const dbFiles = await File.findAll({
        where: { conversation_id: this.conversationId },
        order: [['create_at', 'DESC']]
      });
      
      // Scan filesystem
      let fsFiles = [];
      try {
        const allFiles = await getAllFilesRecursively(this.conversationDir);
        // Filter to document types only
        fsFiles = allFiles.filter(f => 
          f.endsWith('.docx') || f.endsWith('.xlsx') || f.endsWith('.pdf') ||
          f.endsWith('.pptx') || f.endsWith('.csv') || f.endsWith('.txt') ||
          f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
        );
      } catch (error) {
        // Directory doesn't exist yet - that's okay
        console.log('[FileRegistry] Conversation directory not found (new conversation)');
      }
      
      // Sync: Add missing files to database
      for (const fsFile of fsFiles) {
        const fileName = path.basename(fsFile);
        const exists = dbFiles.find(f => f.name === fileName);
        
        if (!exists) {
          console.log('[FileRegistry] Found orphaned file, registering:', fileName);
          await this.register(fsFile, fileName);
        }
      }
      
      // Return fresh list from database (now synced)
      const syncedFiles = await File.findAll({
        where: { conversation_id: this.conversationId },
        order: [['create_at', 'DESC']]
      });
      
      console.log(`[FileRegistry] Synced ${syncedFiles.length} files`);
      
      return syncedFiles.map(f => ({
        id: f.id,
        file_name: f.name,
        file_path: f.url,
        file_type: path.extname(f.name),
        created_at: f.create_at
      }));
      
    } catch (error) {
      console.error('[FileRegistry] getAll failed:', error);
      return [];
    }
  }

  /**
   * Register new file (adds to both DB and ensures filesystem presence)
   * @param {string} filePath - Full path to file
   * @param {string} fileName - File name
   * @returns {Object} File record
   */
  async register(filePath, fileName) {
    try {
      // Check if already registered
      const existing = await File.findOne({
        where: {
          conversation_id: this.conversationId,
          name: fileName
        }
      });
      
      if (existing) {
        console.log('[FileRegistry] File already registered:', fileName);
        const updates = {};
        if (existing.url !== filePath) {
          updates.url = filePath;
        }
        if (!existing.user_id && this.userId) {
          updates.user_id = this.userId;
        }
        if (Object.keys(updates).length > 0) {
          await existing.update(updates);
        }
        return existing.get({ plain: true });
      }

      // Register in database
      const fileRecord = await File.create({
        conversation_id: this.conversationId,
        user_id: this.userId,
        name: fileName,
        url: filePath,
        create_at: new Date(),
        update_at: new Date()
      });

      console.log('[FileRegistry] Registered new file:', fileName);

      return fileRecord.get({ plain: true });
      
    } catch (error) {
      console.error('[FileRegistry] Register failed:', error);
      throw error;
    }
  }

  /**
   * Check if file exists (checks both DB and filesystem)
   * @param {string} fileName - File name to check
   * @returns {boolean} True if file exists
   */
  async exists(fileName) {
    try {
      // Check database first (faster)
      const dbFile = await File.findOne({
        where: {
          conversation_id: this.conversationId,
          name: fileName
        }
      });
      
      if (dbFile) {
        return true;
      }
      
      // Check filesystem
      const filePath = path.join(this.conversationDir, fileName);
      try {
        await fs.access(filePath);
        // File exists in filesystem but not DB - register it
        console.log('[FileRegistry] Found unregistered file:', fileName);
        await this.register(filePath, fileName);
        return true;
      } catch {
        return false;
      }
      
    } catch (error) {
      console.error('[FileRegistry] exists check failed:', error);
      return false;
    }
  }

  /**
   * Get file by name
   * @param {string} fileName - File name
   * @returns {Object|null} File record or null
   */
  async get(fileName) {
    try {
      const file = await File.findOne({
        where: {
          conversation_id: this.conversationId,
          name: fileName
        }
      });
      
      if (file) {
        return {
          id: file.id,
          file_name: file.name,
          file_path: file.url,
          file_type: path.extname(file.name),
          created_at: file.create_at
        };
      }

      // Not in DB - check filesystem and register if found
      const filePath = path.join(this.conversationDir, fileName);
      try {
        await fs.access(filePath);
        console.log('[FileRegistry] Found unregistered file, registering:', fileName);
        return await this.register(filePath, fileName);
      } catch {
        return null;
      }
      
    } catch (error) {
      console.error('[FileRegistry] get failed:', error);
      return null;
    }
  }

  /**
   * Delete file (both DB and filesystem)
   * @param {string} fileName - File name to delete
   * @returns {boolean} True if deleted
   */
  async delete(fileName) {
    try {
      const file = await this.get(fileName);
      if (!file) {
        console.log('[FileRegistry] File not found for deletion:', fileName);
        return false;
      }
      
      // Delete from filesystem
      try {
        await fs.unlink(file.file_path);
        console.log('[FileRegistry] Deleted file from filesystem:', fileName);
      } catch (error) {
        console.error('[FileRegistry] Error deleting file from filesystem:', error);
        // Continue to delete from DB even if filesystem delete fails
      }
      
      // Delete from database
      await File.destroy({
        where: {
          conversation_id: this.conversationId,
          name: fileName
        }
      });
      
      console.log('[FileRegistry] Deleted file from database:', fileName);
      return true;
      
    } catch (error) {
      console.error('[FileRegistry] delete failed:', error);
      return false;
    }
  }

  /**
   * Get conversation directory path
   * @returns {string} Full path to conversation directory
   */
  getConversationDir() {
    return this.conversationDir;
  }

  /**
   * Ensure conversation directory exists
   */
  async ensureDir() {
    try {
      await fs.mkdir(this.conversationDir, { recursive: true });
      console.log('[FileRegistry] Ensured directory exists:', this.conversationDir);
    } catch (error) {
      console.error('[FileRegistry] Failed to create directory:', error);
      throw error;
    }
  }
}

module.exports = FileRegistry;
