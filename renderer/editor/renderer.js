// DOM Elements
const editor = document.getElementById('editor');
const positionDisplay = document.getElementById('position');
const statsDisplay = document.getElementById('statistics');
const currentFileDisplay = document.getElementById('currentFile');
const newButton = document.getElementById('btnNew');
const openButton = document.getElementById('btnOpen');
const saveButton = document.getElementById('btnSave');
const saveAsButton = document.getElementById('btnSaveAs');
const fontSizeSelect = document.getElementById('fontSize');
const wordWrapCheckbox = document.getElementById('wordWrap');

// Track the current file
let currentFilePath = null;
let documentChanged = false;

// Initialize editor
function initEditor() {
  // Set up tab key behavior
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      
      // Insert a tab at cursor position
      const start = this.selectionStart;
      const end = this.selectionEnd;
      
      this.value = this.value.substring(0, start) + 
                    "  " + 
                    this.value.substring(end);
      
      // Put cursor after the inserted tab
      this.selectionStart = this.selectionEnd = start + 2;
      
      documentChanged = true;
    }
  });
  
  // Update the cursor position and stats display
  editor.addEventListener('keyup', updatePositionAndStats);
  editor.addEventListener('click', updatePositionAndStats);
  editor.addEventListener('input', () => {
    documentChanged = true;
    updatePositionAndStats();
  });
  
  // Initial update
  updatePositionAndStats();
  
  // Set up event listeners for file operations
  setupEventListeners();
}

// Update the position and statistics displays
function updatePositionAndStats() {
  const text = editor.value;
  
  // Get cursor position
  const cursorPos = editor.selectionStart;
  
  // Calculate line and column
  const lines = text.substr(0, cursorPos).split('\n');
  const lineNumber = lines.length;
  const columnNumber = lines[lines.length - 1].length + 1;
  
  // Update displays
  positionDisplay.textContent = `Line: ${lineNumber}, Column: ${columnNumber}`;
  statsDisplay.textContent = `Characters: ${text.length}, Words: ${countWords(text)}`;
}

// Count words in text
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Set up event listeners
function setupEventListeners() {
  // Button handlers
  newButton.addEventListener('click', newFile);
  openButton.addEventListener('click', openFile);
  saveButton.addEventListener('click', saveFile);
  saveAsButton.addEventListener('click', saveFileAs);
  
  // Font size changes
  fontSizeSelect.addEventListener('change', function() {
    editor.style.fontSize = `${this.value}px`;
  });
  
  // Word wrap toggle
  wordWrapCheckbox.addEventListener('change', function() {
    editor.style.whiteSpace = this.checked ? 'pre-wrap' : 'pre';
  });
  
  // IPC events from main process
  window.api.onFileNew(newFile);
  window.api.onFileSaveRequest(saveFile);
  window.api.onFileSaveAsRequest(saveFileAs);
  window.api.onFileOpened(handleFileOpened);
  
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

// File operations
async function newFile() {
  if (documentChanged) {
    if (!confirm('You have unsaved changes. Create a new file anyway?')) {
      return;
    }
  }
  
  editor.value = '';
  currentFilePath = null;
  currentFileDisplay.textContent = 'No file opened';
  documentChanged = false;
  updatePositionAndStats();
}

async function openFile() {
  if (documentChanged) {
    if (!confirm('You have unsaved changes. Open a different file anyway?')) {
      return;
    }
  }
  
  await window.api.openFileDialog();
  // The response is handled by the onFileOpened event
}

async function saveFile() {
  if (!currentFilePath) {
    return saveFileAs();
  }
  
  const content = editor.value;
  const result = await window.api.saveFile({
    filePath: currentFilePath,
    content,
    saveAs: false
  });
  
  if (result && result.success) {
    documentChanged = false;
  }
}

async function saveFileAs() {
  const content = editor.value;
  const result = await window.api.saveFile({
    filePath: currentFilePath,
    content,
    saveAs: true
  });
  
  if (result && result.success) {
    currentFilePath = result.filePath;
    currentFileDisplay.textContent = currentFilePath;
    documentChanged = false;
  }
}

// Handle opened file data from main process
function handleFileOpened(data) {
  if (data && data.filePath && data.content !== undefined) {
    currentFilePath = data.filePath;
    editor.value = data.content;
    currentFileDisplay.textContent = currentFilePath;
    documentChanged = false;
    updatePositionAndStats();
  }
}

// Initialize the editor when the document is ready
document.addEventListener('DOMContentLoaded', initEditor);