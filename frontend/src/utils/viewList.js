import { useChatStore } from '@/store/modules/chat';
import { timestamp } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import time from './time';

// 初始化 chatStore 和 messages
const chatStore = useChatStore();

// Normalize file objects for consistent UI handling
const normalizeFileObject = (file) => {
  if (!file || typeof file !== 'object') return file;
  
  const normalized = { ...file };
  
  // Ensure filepath exists (priority: filepath > path > url)
  if (!normalized.filepath) {
    if (normalized.path) {
      normalized.filepath = normalized.path;
    } else if (normalized.url) {
      normalized.filepath = normalized.url;
    }
  }
  
  // Ensure filename exists (priority: filename > name > extract from path)
  if (!normalized.filename) {
    if (normalized.name) {
      normalized.filename = normalized.name;
    } else if (normalized.filepath) {
      normalized.filename = normalized.filepath.split('/').pop();
    }
  }
  
  // Ensure name exists (priority: name > filename)
  if (!normalized.name) {
    normalized.name = normalized.filename;
  }
  
  return normalized;
};

// 提取所有 meta.action_type 为 plan 的消息中 meta.json 的 actions，合并为扁平列表
function viewRealTime(messages){
  const result = [];
  // 遍历 messages
  messages.value.forEach((message) => {
    // 检查 meta.action_type 是否为 plan
    if (message.meta?.action_type === 'plan') {
      // 确保 meta.json 存在且是数组
      if (Array.isArray(message.meta.json)) {
        // 遍历 meta.json
        message.meta.json.forEach((jsonItem) => {
          // 确保 actions 存在且是数组
          if (Array.isArray(jsonItem.actions)) {
            // 将 actions 添加到结果列表
            jsonItem.actions.forEach((action) => {
              // 添加 action
              if(action.status!== 'running'){
                result.push(action)
              }
            });
          }
        });
      }
    }
  });
  return result;
};

// Filter and normalize files from messages
const viewLocal = (messages, showAll = false) => {
  let list = [];
  
  if (!Array.isArray(messages)) {
    return list;
  }
  
  // Process each message
  messages.forEach((message) => {
    if (!message || !message.meta) return;
    
    const { action_type, json } = message.meta;
    
    // Handle finish_summery messages with file arrays
    if (action_type === 'finish_summery' && Array.isArray(json)) {
      const filteredFiles = json.filter(file => {
        const name = file?.name || file?.file_name || file?.title || '';
        return !name.endsWith('.py');
      });
      
      // Normalize each file object to fix old videos
      const normalizedFiles = filteredFiles.map(normalizeFileObject);
      list = list.concat(normalizedFiles);
    }
    
    // Handle question messages with file arrays
    else if (action_type === 'question' && Array.isArray(json)) {
      const normalizedFiles = json.map(normalizeFileObject);
      list = list.concat(normalizedFiles);
    }
    
    // Handle other message types with file arrays
    else if (Array.isArray(json)) {
      const normalizedFiles = json.map(normalizeFileObject);
      list = list.concat(normalizedFiles);
    }
  });
  
  if(!showAll){
    return handlePassImg(list);
  }
  return list;
};


const imageType = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico']
function handlePassImg(fileList){
  const result = [];
  fileList.forEach(element => {
    if (!imageType.includes(element?.filename?.split('.').pop())) {
      result.push(element);
    }
  });
return result;
}


export const viewList = {
  viewRealTime,
  viewLocal
};