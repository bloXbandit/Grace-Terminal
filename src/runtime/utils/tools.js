const { restrictFilepath } = require('../runtime.util');
const fs = require('fs').promises;;
const path = require('path');

const write_file = async (filepath, content) => {
  // Ensure the directory exists
  const dir = path.dirname(filepath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EXIST') {
      throw err;
    }
  }
  return fs.writeFile(filepath, content);
}

const write_code = async (action, uuid, user_id) => {
  // Handle both 'path' and 'file_path' (XML attribute becomes '@_file_path')
  let { path: filepath, file_path, '@_file_path': xmlFilePath, content, '#text': xmlText } = action.params;
  filepath = filepath || file_path || xmlFilePath;
  
  // Handle content from both element and text node
  const fileContent = content || xmlText;
  
  if (!filepath) {
    throw new Error('write_code requires a file path parameter (path, file_path, or @_file_path)');
  }
  
  if (!fileContent) {
    throw new Error('write_code requires content parameter (content or #text)');
  }
  
  filepath = await restrictFilepath(filepath, user_id);
  await write_file(filepath, fileContent);
  // const result = await executeCode(filepath);
  // return result;
  return {
    uuid,
    status: 'success',
    content: `File ${filepath} written successfully.`,
    meta: {
      action_type: action.type,
      filepath
    }
  };
}

const git_commit = async (action, uuid, user_id) => {
  try {
    const GitCommitTool = require('@src/tools/GitCommit');
    const result = await GitCommitTool.execute(action.params, { user_id });
    
    return {
      uuid,
      status: result.success ? 'success' : 'error',
      content: result.message || result.error,
      meta: {
        action_type: action.type,
        commit_sha: result.commit_sha,
        commit_url: result.commit_url
      }
    };
  } catch (error) {
    return {
      uuid,
      status: 'error',
      content: `Git commit failed: ${error.message}`,
      meta: {
        action_type: action.type
      }
    };
  }
}

module.exports = {
  write_code,
  git_commit
};