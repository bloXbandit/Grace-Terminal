const path = require('path');

const { getDirpath } = require('./utils/electron');
const resolveWorkspaceDir = async (user_id) => {
  const WORKSPACE_DIR = getDirpath(process.env.WORKSPACE_DIR || 'workspace', user_id);
  return WORKSPACE_DIR;
}

/**
 * restrict filepath to workspace dir
 * @param {string} filepath 
 * @returns {Promise<string>}
 */
const restrictFilepath = async (filepath, user_id) => {
  const workspace_dir = await resolveWorkspaceDir(user_id);

  let fp = String(filepath);
  const resolvedPath = path.resolve(fp);
  const resolvedWorkspace = path.resolve(workspace_dir);
  if (resolvedPath.startsWith(resolvedWorkspace)) {
    return resolvedPath;
  }
  // workspace_dir now already includes user_<id> (getDirpath root fix) —
  // strip a duplicate leading user segment from relative paths to avoid
  // /workspace/user_1/user_1/... doubling.
  if (user_id) {
    fp = fp.replace(new RegExp(`^/?user_${user_id}/`), '');
  }
  return path.resolve(resolvedWorkspace, fp);
}

module.exports = {
  resolveWorkspaceDir,
  restrictFilepath
}