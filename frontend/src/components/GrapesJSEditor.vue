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

// Register custom commands for right-click context menu
const registerCustomCommands = (editorInstance) => {
  // Change Image command
  editorInstance.Commands.add('change-image', {
    run(editor, sender, options) {
      const selected = editor.getSelected();
      if (selected && selected.is('image')) {
        const newSrc = prompt('Enter new image URL:');
        if (newSrc) selected.set('src', newSrc);
      }
    }
  });

  // Change Background Color command
  editorInstance.Commands.add('change-bg-color', {
    run(editor) {
      const selected = editor.getSelected();
      if (selected) {
        const color = prompt('Enter background color (e.g., #ff0000):');
        if (color) selected.setStyle({ 'background-color': color });
      }
    }
  });

  // Change Text Color command
  editorInstance.Commands.add('change-text-color', {
    run(editor) {
      const selected = editor.getSelected();
      if (selected) {
        const color = prompt('Enter text color:');
        if (color) selected.setStyle({ 'color': color });
      }
    }
  });

  // Change Border Color command
  editorInstance.Commands.add('change-border-color', {
    run(editor) {
      const selected = editor.getSelected();
      if (selected) {
        const color = prompt('Enter border color:');
        if (color) selected.setStyle({ 'border-color': color });
      }
    }
  });

  // Add Shadow command
  editorInstance.Commands.add('add-shadow', {
    run(editor) {
      const selected = editor.getSelected();
      if (selected) {
        selected.setStyle({ 'box-shadow': '0 4px 6px rgba(0,0,0,0.1)' });
      }
    }
  });

  // Round Corners command
  editorInstance.Commands.add('round-corners', {
    run(editor) {
      const selected = editor.getSelected();
      if (selected) {
        selected.setStyle({ 'border-radius': '8px' });
      }
    }
  });

  // Make Transparent command
  editorInstance.Commands.add('make-transparent', {
    run(editor) {
      const selected = editor.getSelected();
      if (selected) {
        const opacity = prompt('Enter transparency (0-1, e.g., 0.5):');
        if (opacity) selected.setStyle({ 'opacity': opacity });
      }
    }
  });

  console.log('[GrapesJS] Custom commands registered successfully');
};

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
    await StudioEditor({
      root: editorContainer.value,
      licenseKey,
      project: {
        type: 'web',
        default: projectData,
      },
      layout: {
        default: {
          type: 'row',
          style: { height: '100%' },
          children: [
            { type: 'sidebarLeft' },
            {
              type: 'column',
              grow: true,
              children: [
                {
                  type: 'row',
                  style: { padding: '5px', gap: '5px', borderBottomWidth: 1, alignItems: 'center' },
                  children: [
                    {
                      type: 'button',
                      tooltip: 'Quick Edit',
                      label: 'Quick Edit',
                      onClick: ({ editor, event }) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        editor.runCommand('studio:layoutToggle', {
                          id: 'quickEditPopover',
                          header: false,
                          layout: {
                            type: 'column',
                            style: { padding: '8px', gap: '4px', minWidth: '180px' },
                            children: [
                              { type: 'text', content: 'Quick Edits', style: { fontWeight: 'bold', marginBottom: '4px' } },
                              {
                                type: 'button',
                                label: 'Change Image',
                                style: { justifyContent: 'flex-start' },
                                onClick: ({ editor }) => {
                                  editor.runCommand('change-image');
                                  editor.runCommand('studio:layoutRemove', { id: 'quickEditPopover' });
                                }
                              },
                              { type: 'text', content: 'Colors', style: { fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' } },
                              {
                                type: 'button',
                                label: 'Background Color',
                                style: { justifyContent: 'flex-start' },
                                onClick: ({ editor }) => {
                                  editor.runCommand('change-bg-color');
                                  editor.runCommand('studio:layoutRemove', { id: 'quickEditPopover' });
                                }
                              },
                              {
                                type: 'button',
                                label: 'Text Color',
                                style: { justifyContent: 'flex-start' },
                                onClick: ({ editor }) => {
                                  editor.runCommand('change-text-color');
                                  editor.runCommand('studio:layoutRemove', { id: 'quickEditPopover' });
                                }
                              },
                              {
                                type: 'button',
                                label: 'Border Color',
                                style: { justifyContent: 'flex-start' },
                                onClick: ({ editor }) => {
                                  editor.runCommand('change-border-color');
                                  editor.runCommand('studio:layoutRemove', { id: 'quickEditPopover' });
                                }
                              },
                              { type: 'text', content: 'Effects', style: { fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' } },
                              {
                                type: 'button',
                                label: 'Add Shadow',
                                style: { justifyContent: 'flex-start' },
                                onClick: ({ editor }) => {
                                  editor.runCommand('add-shadow');
                                  editor.runCommand('studio:layoutRemove', { id: 'quickEditPopover' });
                                }
                              },
                              {
                                type: 'button',
                                label: 'Round Corners',
                                style: { justifyContent: 'flex-start' },
                                onClick: ({ editor }) => {
                                  editor.runCommand('round-corners');
                                  editor.runCommand('studio:layoutRemove', { id: 'quickEditPopover' });
                                }
                              },
                              {
                                type: 'button',
                                label: 'Make Transparent',
                                style: { justifyContent: 'flex-start' },
                                onClick: ({ editor }) => {
                                  editor.runCommand('make-transparent');
                                  editor.runCommand('studio:layoutRemove', { id: 'quickEditPopover' });
                                }
                              }
                            ]
                          },
                          placer: { type: 'popover', closeOnClickAway: true, x: rect.x, y: rect.y + rect.height },
                          style: { maxHeight: '400px', overflow: 'auto' }
                        });
                      }
                    }
                  ]
                },
                { type: 'canvasSidebarTop', grow: true }
              ]
            },
            { type: 'sidebarRight' }
          ]
        }
      },
      styleManager: {
        sectors: [
          {
            name: 'Colors & Backgrounds',
            open: true,
            properties: [
              { property: 'background-color', name: 'Background Color' },
              { property: 'color', name: 'Text Color' },
              { property: 'border-color', name: 'Border Color' }
            ]
          },
          {
            name: 'Borders & Corners',
            open: false,
            properties: [
              { property: 'border-radius', name: 'Rounded Corners' },
              { property: 'border-width', name: 'Border Thickness' },
              { property: 'border-style', name: 'Border Type' }
            ]
          },
          {
            name: 'Shadows & Effects',
            open: false,
            properties: [
              { property: 'box-shadow', name: 'Drop Shadow' },
              { property: 'text-shadow', name: 'Text Glow' },
              { property: 'opacity', name: 'Transparency' }
            ]
          },
          {
            name: 'Spacing',
            open: false,
            properties: [
              { property: 'padding', name: 'Inner Spacing' },
              { property: 'margin', name: 'Outer Spacing' }
            ]
          },
          {
            name: 'Advanced',
            open: false,
            properties: [
              'blend-mode',
              'backdrop-filter',
              'transform',
              'transform-origin',
              'filter',
              'cursor'
            ]
          }
        ]
      },
      storage: {
        type: 'self',
        autosaveChanges: 15,
        project: projectData,
        onSave: async ({ project }) => {
          try {
            console.log('[GrapesJS] Saving project...', project);
            await saveProject(project);
            message.success('Changes saved');
          } catch (error) {
            console.error('[GrapesJS] Save failed:', error);
            message.error('Failed to save changes');
          }
        },
      },
      theme: 'dark',
      onEditor: (ed) => {
        editor.value = ed;
        // Register custom commands for right-click menu
        registerCustomCommands(ed);
      },
      onReady: () => {
        loadingProgress.value = 'Ready';
      },
    });

    // Wait for the editor instance to be available
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Editor instance not available within timeout'));
      }, 10000);
      
      const checkEditor = () => {
        if (editor.value) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkEditor, 100);
        }
      };
      
      checkEditor();
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
    
    // Get the current project from editor
    const project = editor.value.getProject();
    const pages = project.getPages();
    
    console.log('[GrapesJS] Found pages:', pages.length);
    
    if (!pages || pages.length === 0) {
      throw new Error('No pages to save');
    }
    
    // Extract HTML content from pages
    const savedFiles = [];
    
    for (const page of pages) {
      const pageName = page.getName();
      const pageComponent = page.getComponent();
      
      // Extract the HTML content from the component
      let htmlContent = '';
      
      if (pageComponent) {
        // Get the HTML from the component
        htmlContent = pageComponent.toHTML();
        
        // Extract inline styles and create a complete HTML document
        const css = editor.value.getCss();
        const js = editor.value.getJs();
        
        // Create a complete HTML document
        const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageName}</title>
    <style>
${css}
    </style>
</head>
<body>
${htmlContent}
    <script>
${js}
    </script>
</body>
</html>`;
        
        // Determine the save path
        let filepath = props.filepath;
        
        // If this is not the main page, create a separate file
        if (pageName !== 'index' && pages.length > 1) {
          const baseDir = props.filepath.substring(0, props.filepath.lastIndexOf('/'));
          filepath = `${baseDir}/${pageName}.html`;
        }
        
        console.log(`[GrapesJS] Saving page: ${pageName} to ${filepath}`);
        
        // Save the HTML file
        const result = await workspaceService.saveFile({
          filepath: filepath,
          content: fullHtml
        });
        
        savedFiles.push({
          filepath: filepath,
          filename: pageName + '.html',
          result: result
        });
      }
    }
    
    // Emit success event
    emit('save', {
      filepath: props.filepath,
      files: savedFiles
    });
    
    // Also emit a generic 'saved' event so parent can refresh preview
    emit('saved', {
      filepath: props.filepath,
      timestamp: Date.now()
    });
    
    // Show success message
    message.success('Visual editor changes saved');
    
    console.log('[GrapesJS] All files saved successfully:', savedFiles);
    
  } catch (error) {
    console.error('[GrapesJS] Save failed:', error);
    throw error;
  }
};

const getFileSavePath = (file) => {
  const filename = file.name || 'index.html';
  const basepath = props.filepath || filename;
  const lastSlash = basepath.lastIndexOf('/');
  if (lastSlash === -1) {
    return filename;
  }

  const dir = basepath.substring(0, lastSlash);
  const baseName = basepath.substring(lastSlash + 1);
  if (filename === baseName) {
    return basepath;
  }

  return `${dir}/${filename}`;
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
