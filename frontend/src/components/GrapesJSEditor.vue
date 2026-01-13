<template>
  <div class="grapesjs-editor-container">
    <div v-if="loading" class="loading-overlay">
      <a-spin tip="Loading editor..." />
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

let StudioEditor = null;

onMounted(async () => {
  try {
    // Dynamically import GrapesJS Studio SDK
    const module = await import('@grapesjs/studio-sdk');
    StudioEditor = module.default;
    
    // Import styles
    await import('@grapesjs/studio-sdk/style');
    
    // Initialize editor
    await initializeEditor();
  } catch (error) {
    console.error('[GrapesJS] Failed to load editor:', error);
    message.error('Failed to load visual editor');
    loading.value = false;
  }
});

const initializeEditor = async () => {
  if (!editorContainer.value || !StudioEditor) return;

  try {
    // Parse HTML content to extract pages
    const projectData = await parseHTMLToProject(props.htmlContent);

    // Initialize GrapesJS editor
    editor.value = StudioEditor.init({
      container: editorContainer.value,
      height: '100%',
      width: '100%',
      
      // License key from environment
      licenseKey: import.meta.env.VITE_GRAPEJS_API_KEY || '',
      
      // Project configuration
      project: {
        type: 'web',
        default: projectData
      },
      
      // Storage configuration
      storage: {
        type: 'self',
        autosaveChanges: 5, // Auto-save every 5 changes
        
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
    console.log('[GrapesJS] Editor initialized successfully');
  } catch (error) {
    console.error('[GrapesJS] Initialization failed:', error);
    message.error('Failed to initialize editor');
    loading.value = false;
  }
};

const parseHTMLToProject = async (htmlContent) => {
  // Simple parser: treat entire HTML as single page
  // TODO: Enhance to detect multiple pages if needed
  return {
    pages: [
      {
        name: getPageName(props.filepath),
        component: htmlContent || '<h1>Empty Page</h1>'
      }
    ]
  };
};

const getPageName = (filepath) => {
  if (!filepath) return 'Page';
  const filename = filepath.split('/').pop();
  return filename.replace(/\.html?$/i, '') || 'Page';
};

const saveProject = async (projectData) => {
  try {
    // Export HTML files using studio:projectFiles command
    const files = await editor.value.runCommand('studio:projectFiles');
    
    console.log('[GrapesJS] Exported files:', files);
    
    // Save each page as separate HTML file
    for (const file of files) {
      const filename = file.name || 'index.html';
      const content = file.content;
      
      // Determine filepath
      let filepath = props.filepath;
      if (files.length > 1) {
        // Multi-page: save with different names
        const dir = filepath.substring(0, filepath.lastIndexOf('/'));
        filepath = `${dir}/${filename}`;
      }
      
      // Save to backend
      await workspaceService.saveFile({
        filepath: filepath,
        content: content
      });
      
      console.log('[GrapesJS] Saved file:', filepath);
    }
    
    // Emit save event to update preview
    emit('save', {
      filepath: props.filepath,
      files: files
    });
    
  } catch (error) {
    console.error('[GrapesJS] Export/save failed:', error);
    throw error;
  }
};

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy();
  }
});
</script>

<style scoped lang="less">
.grapesjs-editor-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #1a1a1a;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  z-index: 1000;
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
