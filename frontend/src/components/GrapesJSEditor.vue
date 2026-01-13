<template>
  <div class="grapesjs-editor-container">
    <div v-if="loading" class="loading-overlay">
      <a-spin tip="Loading visual editor..." />
      <div class="loading-progress">{{ loadingProgress }}</div>
    </div>
    <div v-if="error" class="error-state">
      <div class="error-content">
        <h3>Visual Editor Failed to Load</h3>
        <p>{{ error }}</p>
        <div class="error-actions">
          <button @click="retryInit" class="retry-btn">Retry</button>
          <button @click="emit('close')" class="close-btn">Close</button>
        </div>
      </div>
    </div>
    <div ref="editorContainer" class="editor-wrapper"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { message } from 'ant-design-vue';
import workspaceService from '@/services/workspace';

const props = defineProps({
  filepath: {
    type: String,
    required: true
  },
  htmlContent: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['save', 'close']);

const editorContainer = ref(null);
const editor = ref(null);
const loading = ref(true);
const error = ref(null);
const loadingProgress = ref('Initializing...');

let StudioEditor = null;
let initRetryCount = 0;
const MAX_RETRIES = 2;

onMounted(async () => {
  // Add keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcut);
  await initializeEditor();
});

const initializeEditor = async () => {
  if (!editorContainer.value) return;
  
  try {
    loadingProgress.value = 'Loading SDK...';
    
    // Dynamically import GrapesJS Studio SDK
    const module = await import('@grapesjs/studio-sdk');
    StudioEditor = module.default;
    
    loadingProgress.value = 'Loading styles...';
    // Import styles
    await import('@grapesjs/studio-sdk/style');
    
    loadingProgress.value = 'Validating license...';
    // Validate license key
    const licenseKey = import.meta.env.VITE_GRAPEJS_API_KEY;
    if (!licenseKey) {
      throw new Error('GrapesJS license key not configured. Set VITE_GRAPEJS_API_KEY in .env');
    }
    
    loadingProgress.value = 'Parsing HTML...';
    // Parse HTML content to extract pages
    const projectData = await parseHTMLToProject(props.htmlContent);

    loadingProgress.value = 'Initializing editor...';
    // Initialize GrapesJS editor
    editor.value = StudioEditor.init({
      container: editorContainer.value,
      height: '100%',
      width: '100%',
      
      // License key from environment
      licenseKey: licenseKey,
      
      // Project configuration
      project: {
        type: 'web',
        default: projectData
      },
      
      // Storage configuration
      storage: {
        type: 'self',
        autosaveChanges: 15, // Increased from 5 to reduce save frequency
        
        // Load project from prop (no async loading needed)
        project: projectData,
        
        // Save callback
        onSave: async ({ project }) => {
          try {
            console.log('[GrapesJS] Saving project...', project);
            await saveProject(project);
            message.success('Changes saved');
          } catch (error) {
            console.error('[GrapesJS] Save failed:', error);
            message.error('Failed to save changes');
          }
        }
      },
      
      // Theme configuration
      theme: {
        mode: 'dark', // Match Grace's dark theme
      },
      
      // Layout configuration
      layout: {
        panels: {
          // Show all default panels
          blocks: true,
          styles: true,
          traits: true,
          layers: true,
          pages: true, // Multi-page support
        }
      }
    });

    loading.value = false;
    error.value = null;
    console.log('[GrapesJS] Editor initialized successfully');
  } catch (err) {
    console.error('[GrapesJS] Initialization failed:', err);
    error.value = err.message || 'Failed to initialize visual editor';
    loading.value = false;
  }
};

const parseHTMLToProject = async (htmlContent) => {
  // Enhanced multi-page parser
  const pages = [];
  
  if (!htmlContent || htmlContent.trim() === '') {
    pages.push({
      name: 'index',
      component: '<h1>Empty Page</h1>'
    });
  } else {
    // Try to detect multi-page structure
    // Look for page markers like <!-- PAGE:about.html --> or similar patterns
    const pageMarkers = htmlContent.match(/<!--\s*PAGE:\s*([^\s]+)\.html\s*-->/gi);
    
    if (pageMarkers && pageMarkers.length > 1) {
      // Multi-page detected
      const sections = htmlContent.split(/<!--\s*PAGE:\s*[^\s]+\.html\s*-->/i);
      const pageNames = [];
      
      // Extract page names from markers
      pageMarkers.forEach(marker => {
        const match = marker.match(/PAGE:\s*([^\s]+)\.html/i);
        if (match) {
          pageNames.push(match[1]);
        }
      });
      
      // Create pages from sections (skip first empty section)
      for (let i = 1; i < sections.length && i <= pageNames.length; i++) {
        const content = sections[i].trim();
        if (content) {
          pages.push({
            name: pageNames[i - 1] || `page${i}`,
            component: content
          });
        }
      }
    } else {
      // Single page - use filename or 'index'
      pages.push({
        name: getPageName(props.filepath),
        component: htmlContent
      });
    }
  }
  
  return {
    pages: pages
  };
};

const getPageName = (filepath) => {
  if (!filepath) return 'Page';
  const filename = filepath.split('/').pop();
  return filename.replace(/\.html?$/i, '') || 'Page';
};

const saveProject = async (projectData) => {
  try {
    console.log('[GrapesJS] Starting save process...');
    
    // Export HTML files using studio:projectFiles command
    const files = await editor.value.runCommand('studio:projectFiles');
    
    console.log('[GrapesJS] Exported files:', files);
    
    if (!files || files.length === 0) {
      throw new Error('No files to save');
    }
    
    // Transaction-like save with rollback capability
    const savedFiles = [];
    const originalContents = new Map();
    
    try {
      // First, backup original files for potential rollback
      for (const file of files) {
        const filepath = getFileSavePath(file);
        try {
          const originalContent = await workspaceService.getFile(filepath);
          originalContents.set(filepath, originalContent);
        } catch (err) {
          // File might not exist yet, that's OK
          console.log(`[GrapesJS] File ${filepath} doesn't exist yet, will create`);
        }
      }
      
      // Save each file
      for (const file of files) {
        const filename = file.name || 'index.html';
        const content = file.content;
        const filepath = getFileSavePath(file);
        
        console.log(`[GrapesJS] Saving file: ${filepath}`);
        
        const result = await workspaceService.saveFile({
          filepath: filepath,
          content: content
        });
        
        savedFiles.push({
          filepath: filepath,
          filename: filename,
          result: result
        });
      }
      
      // Emit success event only after all files are saved
      emit('save', {
        filepath: props.filepath,
        files: savedFiles
      });
      
      console.log('[GrapesJS] All files saved successfully:', savedFiles);
      
    } catch (saveError) {
      // Attempt rollback
      console.warn('[GrapesJS] Save failed, attempting rollback...');
      
      for (const [filepath, originalContent] of originalContents) {
        try {
          await workspaceService.saveFile({
            filepath: filepath,
            content: originalContent
          });
          console.log(`[GrapesJS] Rolled back file: ${filepath}`);
        } catch (rollbackError) {
          console.error(`[GrapesJS] Failed to rollback ${filepath}:`, rollbackError);
        }
      }
      
      throw saveError;
    }
    
  } catch (error) {
    console.error('[GrapesJS] Export/save failed:', error);
    throw error;
  }
};

const getFileSavePath = (file) => {
  const filename = file.name || 'index.html';
  let filepath = props.filepath;
  
  // If multiple files, save each with its own name
  const files = editor.value ? editor.value.runCommand('studio:projectFiles') : [];
  if (files.length > 1) {
    const dir = filepath.substring(0, filepath.lastIndexOf('/'));
    filepath = `${dir}/${filename}`;
  }
  
  return filepath;
};

const retryInit = async () => {
  if (initRetryCount >= MAX_RETRIES) {
    error.value = 'Maximum retry attempts reached. Please refresh the page.';
    return;
  }
  
  initRetryCount++;
  error.value = null;
  loading.value = true;
  
  console.log(`[GrapesJS] Retry attempt ${initRetryCount}/${MAX_RETRIES}`);
  await initializeEditor();
};

const handleKeyboardShortcut = (event) => {
  // Ctrl+S or Cmd+S to save
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    if (editor.value && !loading.value && !error.value) {
      saveProject();
    }
  }
  
  // Escape to close
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
};

onBeforeUnmount(() => {
  // Remove keyboard shortcut listener
  document.removeEventListener('keydown', handleKeyboardShortcut);
  
  // Cleanup editor
  if (editor.value) {
    try {
      // Stop any running commands
      if (editor.value.stopCommand) {
        editor.value.stopCommand('studio:projectFiles');
      }
      
      // Destroy editor instance
      editor.value.destroy();
    } catch (err) {
      console.warn('[GrapesJS] Error during cleanup:', err);
    }
    
    editor.value = null;
  }
  
  // Clear SDK reference
  StudioEditor = null;
});
</script>

<style scoped lang="less">
.grapesjs-editor-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #1a1a1a;
  z-index: 1001; /* Ensure above other modals */
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  z-index: 1002;
  gap: 16px;
}

.loading-progress {
  color: #ffffff;
  font-size: 14px;
  opacity: 0.7;
}

.error-state {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  z-index: 1002;
}

.error-content {
  text-align: center;
  color: #ffffff;
  max-width: 400px;
  padding: 32px;
}

.error-content h3 {
  color: #ff4d4f;
  margin-bottom: 16px;
}

.error-content p {
  margin-bottom: 24px;
  opacity: 0.8;
}

.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.retry-btn, .close-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.retry-btn {
  background: #1890ff;
  color: white;
}

.retry-btn:hover {
  background: #40a9ff;
}

.close-btn {
  background: #434343;
  color: white;
}

.close-btn:hover {
  background: #595959;
}

.editor-wrapper {
  width: 100%;
  height: 100%;
}

/* Override GrapesJS styles to match Grace's theme */
:deep(.gjs-editor) {
  background: #1a1a1a;
}

:deep(.gjs-pn-panel) {
  background: #2a2a2a;
  border-color: #3a3a3a;
}

:deep(.gjs-block) {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #ffffff;
}

:deep(.gjs-block:hover) {
  background: #3a3a3a;
}
</style>
