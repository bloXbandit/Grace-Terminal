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
  
  // Handle content from multiple XML formats:
  // 1. <content>text</content> → content = "text"
  // 2. <write_code file_path="...">text</write_code> → #text = "text"
  // 3. <content><![CDATA[text]]></content> → content = { '#text': 'text' }
  let fileContent = content;
  if (!fileContent && xmlText) {
    fileContent = xmlText;
  } else if (fileContent && typeof fileContent === 'object' && fileContent['#text']) {
    fileContent = fileContent['#text'];
  }
  
  if (!filepath) {
    throw new Error('write_code requires a file path parameter (path, file_path, or @_file_path)');
  }
  
  if (!fileContent) {
    throw new Error('write_code requires content parameter (content or #text)');
  }
  
  filepath = await restrictFilepath(filepath);
  await write_file(filepath, fileContent);
  // CRITICAL: Mask Python file success messages for ultra tasks (hide from UI)
  // Only hide .py files which are temporary scripts, keep actual document/file messages
  let successMessage = `File ${filepath} written successfully.`;
  if (filepath.endsWith('.py')) {
    // For Python scripts, return minimal message that won't show in UI
    successMessage = ''; // Empty message = won't appear in UI stream
  }

  // Also suppress internal workflow artifacts that are not useful to show in chat UI
  if (/\/todo\.md$/i.test(filepath)) {
    successMessage = '';
  }
  return {
    uuid,
    status: 'success',
    content: successMessage,
    meta: {
      action_type: action.type,
      filepath
    }
  };
}

module.exports = {
  write_code
};