const fs = require('fs').promises; // 使用 fs.promises 支持 async/await
const path = require('path');

/**
 * 递归获取指定目录下所有文件的路径。
 * @param {string} directoryPath - 要搜索的目录路径。
 * @returns {Promise<string[]>} 包含所有文件路径的数组。
 */
async function getAllFilesRecursively(directoryPath) {
  let fileList = [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      // 过滤掉 node_modules 目录
      if (entry.name === 'node_modules') {
        continue;
      }
      fileList = fileList.concat(await getAllFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

/**
 * 获取文件路径列表的元数据（文件名、大小等）。
 * @param {string[]} filepaths - 文件路径数组。
 * @param {Date} [filterAfterTime] - 可选：只返回此时间之后修改的文件。
 * @returns {Promise<Array<{filepath: string, filename: string, filesize: number, modified: Date, created: Date, type: string, isNew: boolean, isModified: boolean}>>} 包含文件元数据的数组，按修改时间倒序排序。
 */
async function getFilesMetadata(filepaths, filterAfterTime = null) {
  const filesMetadata = await Promise.all(
    filepaths.map(async (file) => {
      const stats = await fs.stat(file);
      const ext = path.extname(file).substring(1); // Remove leading dot
      
      return {
        filepath: file,
        filename: path.basename(file), // 使用 path.basename 更安全地提取文件名
        filesize: stats.size,
        modified: stats.mtime, // Modification time
        created: stats.birthtime, // Creation time
        type: ext || 'unknown', // File extension (e.g., "docx", "xlsx", "py")
        mtime: stats.mtime, // Keep for sorting
        birthtime: stats.birthtime // Keep for filtering
      };
    })
  );

  // Filter by modification time if specified and add flags
  let filtered = filesMetadata;
  if (filterAfterTime) {
    filtered = filesMetadata.filter(file => file.mtime >= filterAfterTime);
    console.log(`[FileUtils] Filtered ${filesMetadata.length} files to ${filtered.length} files created after ${filterAfterTime.toISOString()}`);
    
    // Add isNew and isModified flags
    filtered = filtered.map(file => ({
      ...file,
      isNew: file.birthtime >= filterAfterTime, // File created during this task
      isModified: file.mtime >= filterAfterTime && file.birthtime < filterAfterTime // File modified during this task
    }));
    
    // 按修改时间倒序排序（最新的文件在前面）
    return filtered.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).map(({ mtime, birthtime, ...rest }) => rest);
  }

  // If no filter, add default flags and sort
  const withFlags = filesMetadata.map(file => ({
    ...file,
    isNew: false,
    isModified: false
  }));
  
  // 按修改时间倒序排序（最新的文件在前面）
  return withFlags.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).map(({ mtime, birthtime, ...rest }) => rest);
}

/**
 * 确保指定目录存在，如果不存在则创建。
 * @param {string} directoryPath - 要确保存在的目录路径。
 * @returns {Promise<void>}
 */
async function ensureDirectoryExists(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

module.exports = {
  getAllFilesRecursively,
  getFilesMetadata,
  ensureDirectoryExists,
};