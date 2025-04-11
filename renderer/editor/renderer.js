// Load CodeMirror using require, which is available in Electron preload context
const CodeMirror = require('codemirror');
// Load CodeMirror addons
require('codemirror/addon/search/search');
require('codemirror/addon/search/searchcursor');
require('codemirror/addon/search/jump-to-line');
require('codemirror/addon/dialog/dialog');
require('codemirror/addon/wrap/hardwrap');
require('codemirror/addon/selection/active-line');
require('codemirror/mode/plain/plain');

// DOM Elements
const editorArea = document.getElementById('editor-area');
const positionDisplay = document.getElementById('position');
const statsDisplay = document.getElementById('statistics');
const currentFileDisplay = document.getElementById('currentFile');
const newButton = document.getElementById('btnNew');
const openButton = document.getElementById('btnOpen');
const saveButton = document.getElementById('btnSave');
const saveAsButton = document.getElementById('btnSaveAs');
const fontSizeSelect = document.getElementById('fontSize');
const wordWrapSelect = document.getElementById('wordWrap');
const themeToggleBtn = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const quitButton = document.getElementById('quit-button');
const findButton = document.getElementById('find-button');
const body = document.body;

// CodeMirror editor instance
let editor;

// Track the current file
let currentFilePath = null;
let documentChanged = false;

// Track theme state (initially dark)
let isDarkMode = true;

// Initialize editor
function initEditor() {
  console.log('Initializing editor...');
  
  // Initialize CodeMirror
  editor = CodeMirror(editorArea, {
    mode: 'text/plain',
    lineNumbers: false,
    lineWrapping: true,
    autofocus: true,
    styleActiveLine: true,
    value: "// Start typing here...",
    viewportMargin: Infinity
  });
  
  // Set up CodeMirror custom key mapping for tab
  editor.setOption("extraKeys", {
    Tab: function(cm) {
      const spaces = Array(3).join(" "); // 2 spaces
      cm.replaceSelection(spaces);
    }
  });
  
  // Listen for changes in the editor content
  editor.on("change", function() {
    documentChanged = true;
    updatePositionAndStats();
  });
  
  // Listen for cursor activity
  editor.on("cursorActivity", function() {
    updatePositionAndStats();
  });
  
  // Initial update
  updatePositionAndStats();
  
  // Set up event listeners for file operations
  setupEventListeners();
}

// Update the position and statistics displays
function updatePositionAndStats() {
  if (!editor) return;
  
  // Get cursor position
  const cursor = editor.getCursor();
  const lineNumber = cursor.line + 1; // CodeMirror lines are 0-indexed
  const columnNumber = cursor.ch + 1; // CodeMirror columns are 0-indexed
  
  // Get content stats
  const text = editor.getValue();
  const characterCount = text.length;
  const wordCount = countWords(text);
  
  // Update displays with formatted numbers
  positionDisplay.textContent = `Line: ${lineNumber}, Column: ${columnNumber}`;
  statsDisplay.textContent = `Characters: ${characterCount.toLocaleString()} & Words: ${wordCount.toLocaleString()}`;
}

// Count words in text
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Set up event listeners
function setupEventListeners() {
  console.log('Setting up event listeners...');
  console.log('API available:', !!window.api);
  
  // Theme toggle
  themeToggleBtn.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    
    if (isDarkMode) {
      body.classList.remove('light-mode');
      body.classList.add('dark-mode');
    } else {
      body.classList.remove('dark-mode');
      body.classList.add('light-mode');
    }
    
    // Update icons when theme changes
    updateThemeIcons();
  });
  
  // Button handlers
  newButton.addEventListener('click', newFile);
  openButton.addEventListener('click', openFile);
  saveButton.addEventListener('click', saveFile);
  saveAsButton.addEventListener('click', saveFileAs);
  
  // Quit button handler
  quitButton.addEventListener('click', quitApp);
  
  // Find button triggers CodeMirror's search functionality
  findButton.addEventListener('click', () => {
    editor.execCommand('find');
  });
  
  // Font size changes
  fontSizeSelect.addEventListener('change', function() {
    const fontSize = this.value;
    // Update CodeMirror font size
    const cmElement = document.querySelector('.CodeMirror');
    if (cmElement) {
      cmElement.style.fontSize = `${fontSize}px`;
    }
  });
  
  // Word wrap toggle
  wordWrapSelect.addEventListener('change', function() {
    const isWrapped = this.value === 'on';
    editor.setOption('lineWrapping', isWrapped);
  });
  
  // Set up keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl+F for find - Handled by CodeMirror
    // Ctrl+S for save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
    }
    
    // Ctrl+Shift+S for save as
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      saveFileAs();
    }
    
    // Ctrl+N for new file
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      newFile();
    }
    
    // Ctrl+O for open file
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      openFile();
    }
    
    // Ctrl+Q for quit
    if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
      e.preventDefault();
      quitApp();
    }
  });
  
  // IPC events from main process
  if (window.api) {
    console.log('Setting up IPC event listeners...');
    window.api.onFileNew && window.api.onFileNew(newFile);
    window.api.onFileSaveRequest && window.api.onFileSaveRequest(saveFile);
    window.api.onFileSaveAsRequest && window.api.onFileSaveAsRequest(saveFileAs);
    window.api.onFileOpened && window.api.onFileOpened(handleFileOpened);
  } else {
    console.error('API not available! Check your preload script.');
  }
  
  // Window close handling
  window.addEventListener('beforeunload', (e) => {
    if (documentChanged) {
      // Standard method to ask user about unsaved changes
      e.returnValue = false;
      
      // Custom dialog would be handled in main process in a real app
      if (confirm('You have unsaved changes. Do you want to save them before closing?')) {
        saveFile();
      }
    }
  });
}

// Update icon visibility based on the current theme
function updateThemeIcons() {
  if (isDarkMode) {
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }
}

// Quit the application
function quitApp() {
  console.log('Quit button clicked');
  
  if (documentChanged) {
    // Ask user about unsaved changes
    const confirmQuit = confirm('You have unsaved changes. Quit anyway?');
    if (confirmQuit) {
      // User confirmed quit, so force quit regardless of document state
      documentChanged = false; // Reset this flag to avoid additional checks
      
      // Directly quit the application without further checks
      if (window.api && window.api.quitApp) {
        window.api.quitApp();
      } else {
        console.error('quitApp API not available!');
      }
    }
    // If not confirmed, do nothing (stay in the app)
  } else {
    // No unsaved changes, quit directly
    if (window.api && window.api.quitApp) {
      window.api.quitApp();
    } else {
      console.error('quitApp API not available!');
    }
  }
}

// File operations
async function newFile() {
  console.log('New file button clicked');
  
  if (documentChanged) {
    if (!confirm('You have unsaved changes. Create a new file anyway?')) {
      return;
    }
  }
  
  editor.setValue('');
  currentFilePath = null;
  currentFileDisplay.textContent = 'No file opened';
  documentChanged = false;
  updatePositionAndStats();
}

async function openFile() {
  console.log('Open file button clicked');
  
  if (documentChanged) {
    if (!confirm('You have unsaved changes. Open a different file anyway?')) {
      return;
    }
  }
  
  if (window.api && window.api.openFileDialog) {
    try {
      await window.api.openFileDialog();
      // The response is handled by the onFileOpened event
    } catch (err) {
      console.error('Error opening file:', err);
    }
  } else {
    console.error('openFileDialog API not available!');
  }
}

async function saveFile() {
  console.log('Save file button clicked');
  
  if (!currentFilePath) {
    return saveFileAs();
  }
  
  const content = editor.getValue();
  
  if (window.api && window.api.saveFile) {
    try {
      const result = await window.api.saveFile({
        filePath: currentFilePath,
        content,
        saveAs: false
      });
      
      if (result && result.success) {
        documentChanged = false;
        // Show saved notification briefly
        showNotification('File saved successfully');
      }
    } catch (err) {
      console.error('Error saving file:', err);
    }
  } else {
    console.error('saveFile API not available!');
  }
}

async function saveFileAs() {
  console.log('Save as file button clicked');
  
  const content = editor.getValue();
  
  if (window.api && window.api.saveFile) {
    try {
      const result = await window.api.saveFile({
        filePath: currentFilePath,
        content,
        saveAs: true
      });
      
      if (result && result.success) {
        currentFilePath = result.filePath;
        currentFileDisplay.textContent = currentFilePath;
        documentChanged = false;
        // Show saved notification briefly
        showNotification('File saved successfully');
      }
    } catch (err) {
      console.error('Error saving file as:', err);
    }
  } else {
    console.error('saveFile API not available!');
  }
}

// Show a brief notification
function showNotification(message, duration = 2000) {
  // Create notification element if it doesn't exist
  let notification = document.getElementById('notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = 'notification';
    document.body.appendChild(notification);
  }
  
  // Set message and show
  notification.textContent = message;
  notification.style.opacity = '1';
  
  // Hide after duration
  setTimeout(() => {
    notification.style.opacity = '0';
  }, duration);
}

// Handle opened file data from main process
function handleFileOpened(data) {
  console.log('File opened event received:', data);
  
  if (data && data.filePath && data.content !== undefined) {
    currentFilePath = data.filePath;
    editor.setValue(data.content);
    currentFileDisplay.textContent = currentFilePath;
    documentChanged = false;
    updatePositionAndStats();
  }
}

// Initialize the editor when the document is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Document ready, initializing editor...');
  initEditor();
});