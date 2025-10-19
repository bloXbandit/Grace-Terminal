/**
 * LocalFileSystem Tool
 * Provides access to user's actual local filesystem (Desktop, Documents, Downloads, etc.)
 * Enables Grace to read/write files anywhere on the host machine
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const local_filesystem = {
  name: "local_filesystem",
  description: "Access user's ACTUAL local filesystem on their host machine. Can read/write files in Desktop, Documents, Downloads, and any other directory. Use this when user asks to place files 'on my desktop' or access files outside the workspace.",
  
  params: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["read", "write", "list", "exists", "delete", "mkdir"],
        description: "File operation to perform"
      },
      path: {
        type: "string",
        description: "File/directory path. Can use shortcuts: ~/Desktop, ~/Documents, ~/Downloads, or absolute paths"
      },
      content: {
        type: "string",
        description: "Content to write (for write action)"
      },
      encoding: {
        type: "string",
        enum: ["utf8", "binary", "base64"],
        default: "utf8",
        description: "File encoding"
      }
    },
    required: ["action", "path"]
  },

  async execute(params, context = {}) {
    const { action, path: userPath, content, encoding } = params;

    try {
      console.log(`[LocalFileSystem] ${action} on ${userPath}`);

      // Resolve path (handle ~/ shortcuts)
      const resolvedPath = this.resolvePath(userPath);

      // Security check (optional - can be disabled for full access)
      // if (!this.isPathAllowed(resolvedPath)) {
      //   return {
      //     success: false,
      //     error: `Access denied: ${resolvedPath}. For security, only user directories are accessible.`
      //   };
      // }

      switch (action) {
        case 'read':
          return await this.readFile(resolvedPath, encoding || 'utf8');
        case 'write':
          return await this.writeFile(resolvedPath, content, encoding || 'utf8');
        case 'list':
          return await this.listDirectory(resolvedPath);
        case 'exists':
          return await this.checkExists(resolvedPath);
        case 'delete':
          return await this.deleteFile(resolvedPath);
        case 'mkdir':
          return await this.makeDirectory(resolvedPath);
        default:
          return {
            success: false,
            error: `Unknown action: ${action}`
          };
      }

    } catch (error) {
      console.error('[LocalFileSystem] Error:', error);
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  },

  resolvePath(userPath) {
    // Check if running in Docker (has /host mount)
    const isDocker = require('fs').existsSync('/host/Desktop');
    const baseDir = isDocker ? '/host' : os.homedir();

    // Handle ~/ shortcuts
    if (userPath.startsWith('~/')) {
      if (isDocker) {
        return path.join('/host/home', userPath.slice(2));
      }
      return path.join(os.homedir(), userPath.slice(2));
    }

    // Handle common shortcuts
    const shortcuts = {
      'Desktop': path.join(baseDir, 'Desktop'),
      'Documents': path.join(baseDir, 'Documents'),
      'Downloads': path.join(baseDir, 'Downloads'),
      'Pictures': path.join(baseDir, 'Pictures'),
      'Music': path.join(baseDir, 'Music'),
      'Videos': path.join(baseDir, 'Videos')
    };

    if (shortcuts[userPath]) {
      return shortcuts[userPath];
    }

    // Return as-is if absolute path
    if (path.isAbsolute(userPath)) {
      // If in Docker and path starts with /home or /Users, remap to /host
      if (isDocker && (userPath.startsWith('/home') || userPath.startsWith('/Users'))) {
        return userPath.replace(/^\/(home|Users)\/[^/]+/, '/host/home');
      }
      return userPath;
    }

    // Relative to home directory
    if (isDocker) {
      return path.join('/host/home', userPath);
    }
    return path.join(os.homedir(), userPath);
  },

  isPathAllowed(resolvedPath) {
    // Optional security check - only allow user directories
    const homeDir = os.homedir();
    const allowedDirs = [
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'Pictures'),
      path.join(homeDir, 'Music'),
      path.join(homeDir, 'Videos'),
      path.join(homeDir, 'Grace-Terminal')
    ];

    return allowedDirs.some(dir => resolvedPath.startsWith(dir));
  },

  async readFile(filePath, encoding) {
    try {
      const content = await fs.readFile(filePath, encoding);
      const stats = await fs.stat(filePath);

      return {
        success: true,
        content: content,
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        message: `✅ Read file: ${filePath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error.message}`,
        code: error.code
      };
    }
  },

  async writeFile(filePath, content, encoding) {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, content, encoding);
      const stats = await fs.stat(filePath);

      return {
        success: true,
        path: filePath,
        size: stats.size,
        message: `✅ Wrote file: ${filePath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error.message}`,
        code: error.code
      };
    }
  },

  async listDirectory(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      const files = [];
      const directories = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);

        const item = {
          name: entry.name,
          path: fullPath,
          size: stats.size,
          modified: stats.mtime,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile()
        };

        if (entry.isDirectory()) {
          directories.push(item);
        } else {
          files.push(item);
        }
      }

      return {
        success: true,
        path: dirPath,
        directories: directories,
        files: files,
        total: entries.length,
        message: `✅ Listed ${entries.length} items in ${dirPath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list directory: ${error.message}`,
        code: error.code
      };
    }
  },

  async checkExists(filePath) {
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);

      return {
        success: true,
        exists: true,
        path: filePath,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          success: true,
          exists: false,
          path: filePath
        };
      }

      return {
        success: false,
        error: `Failed to check existence: ${error.message}`,
        code: error.code
      };
    }
  },

  async deleteFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        await fs.rmdir(filePath, { recursive: true });
      } else {
        await fs.unlink(filePath);
      }

      return {
        success: true,
        path: filePath,
        message: `✅ Deleted: ${filePath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete: ${error.message}`,
        code: error.code
      };
    }
  },

  async makeDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });

      return {
        success: true,
        path: dirPath,
        message: `✅ Created directory: ${dirPath}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create directory: ${error.message}`,
        code: error.code
      };
    }
  }
};

module.exports = local_filesystem;

