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

const write_code = async (action, uuid) => {
  // Handle all path parameter variants
  let { path: filepath, file_path, '@_file_path': xmlFilePath, content } = action.params;
  filepath = filepath || file_path || xmlFilePath;
  
  if (!filepath) {
    throw new Error('write_code requires a file path parameter');
  }
  
  filepath = await restrictFilepath(filepath);
  await write_file(filepath, content);
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

module.exports = {
  write_code
};