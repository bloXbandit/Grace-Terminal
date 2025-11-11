/**
 * File Analysis Cache
 * Persists file analysis results across messages in a conversation
 * Prevents redundant PDF/DOCX extraction and analysis
 */

// Cache structure: Map<fileId, { analysis, timestamp }>
const analysisCache = new Map();

// Cache TTL: 1 hour (files don't change during conversation)
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Get cached analysis for a file
 * @param {number|string} fileId - File ID from database
 * @returns {object|null} Cached analysis or null if not found/expired
 */
function getCachedAnalysis(fileId) {
  if (!fileId) return null;
  
  const cached = analysisCache.get(fileId);
  if (!cached) return null;
  
  // Check if cache expired
  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL) {
    console.log(`[FileAnalysisCache] Cache expired for file ${fileId} (age: ${Math.round(age/1000)}s)`);
    analysisCache.delete(fileId);
    return null;
  }
  
  console.log(`[FileAnalysisCache] ✅ Cache HIT for file ${fileId} (age: ${Math.round(age/1000)}s)`);
  return cached.analysis;
}

/**
 * Store analysis in cache
 * @param {number|string} fileId - File ID from database
 * @param {object} analysis - Analysis object from fileAnalyzer
 */
function setCachedAnalysis(fileId, analysis) {
  if (!fileId || !analysis) return;
  
  analysisCache.set(fileId, {
    analysis,
    timestamp: Date.now()
  });
  
  console.log(`[FileAnalysisCache] 💾 Cached analysis for file ${fileId}`);
}

/**
 * Clear cache for specific file (e.g., when file is updated)
 * @param {number|string} fileId - File ID from database
 */
function clearCacheForFile(fileId) {
  if (!fileId) return;
  analysisCache.delete(fileId);
  console.log(`[FileAnalysisCache] 🗑️ Cleared cache for file ${fileId}`);
}

/**
 * Clear all cache (e.g., for testing or memory management)
 */
function clearAllCache() {
  const size = analysisCache.size;
  analysisCache.clear();
  console.log(`[FileAnalysisCache] 🗑️ Cleared all cache (${size} entries)`);
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
function getCacheStats() {
  return {
    size: analysisCache.size,
    entries: Array.from(analysisCache.entries()).map(([fileId, data]) => ({
      fileId,
      age: Math.round((Date.now() - data.timestamp) / 1000),
      hasAnalysis: !!data.analysis
    }))
  };
}

module.exports = {
  getCachedAnalysis,
  setCachedAnalysis,
  clearCacheForFile,
  clearAllCache,
  getCacheStats
};
