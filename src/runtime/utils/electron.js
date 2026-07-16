// const { app } = require('electron');
const resolve = require('path').resolve;
const resourcesPath = process.resourcesPath;
console.log('LEMON_AI_PATH', process.env.LEMON_AI_PATH);
const LEMON_AI_PATH = process.env.LEMON_AI_PATH;

const getFilepath = (dir = 'database', filename) => {

  let filepath = resolve(__dirname, '../../../', dir, filename);
  if (resourcesPath && resourcesPath.indexOf('node_modules') === -1) {
    filepath = resolve(resourcesPath, dir, filename);
  }

  if (LEMON_AI_PATH) {
    filepath = resolve(LEMON_AI_PATH, dir, filename);
  }
  console.log('filepath', filepath);
  return filepath;
}


//处理文件夹路径
// ROOT-CAUSE FIX (same as src/utils/electron.js): user_<id> must be appended
// LAST — the resourcesPath/LEMON_AI_PATH overrides used to silently drop it.
const getDirpath = (dir, user_id) => {

  let filepath = resolve(__dirname, '../../../', dir);
  if (process.env.ACTUAL_HOST_WORKSPACE_PATH) {
    filepath = resolve(__dirname, '../../../../', dir);
  }
  if (resourcesPath && resourcesPath.indexOf('node_modules') === -1) {
    filepath = resolve(resourcesPath, dir);
  }

  if (LEMON_AI_PATH) {
    filepath = resolve(LEMON_AI_PATH, dir);
  }
  if (user_id) {
    filepath = resolve(filepath, `user_${user_id}`)
  }
  return filepath;
}

module.exports = exports = {
  getFilepath,
  getDirpath
}