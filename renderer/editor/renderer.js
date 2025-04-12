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
const wordWrapSelect = document.getElementById('wordWrap');
const themeToggleBtn = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const quitButton = document.getElementById('quit-button');
const findInput = document.getElementById('find-input');
const findNextBtn = document.getElementById('find-next-btn');
const body = document.body;

// Track the current file
let currentFilePath = null;
let documentChanged = false;

// Track theme state (initially dark)
let isDarkMode = true;

// Keep track of the current find state
let currentFindIndex = -1;
let findMatches = [];

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
  
  // Update displays with formatted numbers
  positionDisplay.textContent = `Line: ${lineNumber}, Column: ${columnNumber}`;
  statsDisplay.textContent = `Characters: ${text.length.toLocaleString()} & Words: ${countWords(text).toLocaleString()}`;
}

// Count words in text
function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Set up event listeners
function setupEventListeners() {
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
  
  // Font size changes
  fontSizeSelect.addEventListener('change', function() {
    editor.style.fontSize = `${this.value}px`;
  });
  
  // Word wrap toggle
  wordWrapSelect.addEventListener('change', function() {
    const isWrapped = this.value === 'on';
    editor.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
  });
  
  // IPC events from main process
  if (window.api) {
    window.api.onFileNew && window.api.onFileNew(newFile);
    window.api.onFileSaveRequest && window.api.onFileSaveRequest(saveFile);
    window.api.onFileSaveAsRequest && window.api.onFileSaveAsRequest(saveFileAs);
    window.api.onFileOpened && window.api.onFileOpened(handleFileOpened);
  }
  
  // Find functionality
  setupFindEventListeners();
  
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
  if (documentChanged) {
    // Ask user about unsaved changes
    const confirmQuit = confirm('You have unsaved changes. Quit anyway?');
    if (confirmQuit) {
      // User confirmed quit, so force quit regardless of document state
      documentChanged = false; // Reset this flag to avoid additional checks
      
      // Directly quit the application without further checks
      if (window.api && window.api.quitApp) {
        window.api.quitApp();
      }
    }
    // If not confirmed, do nothing (stay in the app)
  } else {
    // No unsaved changes, quit directly
    if (window.api && window.api.quitApp) {
      window.api.quitApp();
    }
  }
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
  
  if (window.api && window.api.openFileDialog) {
    await window.api.openFileDialog();
    // The response is handled by the onFileOpened event
  }
}

async function saveFile() {
  if (!currentFilePath) {
    return saveFileAs();
  }
  
  const content = editor.value;
  
  if (window.api && window.api.saveFile) {
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
  }
}

async function saveFileAs() {
  const content = editor.value;
  
  if (window.api && window.api.saveFile) {
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
  if (data && data.filePath && data.content !== undefined) {
    currentFilePath = data.filePath;
    editor.value = data.content;
    currentFileDisplay.textContent = currentFilePath;
    documentChanged = false;
    updatePositionAndStats();
  }
}

// Find functionality
function setupFindEventListeners() {
  // Find button click
  findNextBtn.addEventListener('click', performFind);
  
  // Enter key in find input
  findInput.addEventListener('keydown', function(e) {
    // Prevent editor from receiving these keystrokes
    e.stopPropagation();
    
    if (e.key === 'Enter') {
      e.preventDefault();
      performFind();
    }
  });
  
  // Prevent other keyboard events from reaching the editor
  findInput.addEventListener('keyup', function(e) {
    e.stopPropagation();
  });
  
  findInput.addEventListener('keypress', function(e) {
    e.stopPropagation();
  });
}

// Perform the find operation
function performFind() {
  const findText = findInput.value.trim();
  
  // Don't search for empty strings
  if (!findText) {
    currentFindIndex = -1;
    findMatches = [];
    return;
  }
  
  const content = editor.value;
  findMatches = [];
  
  // Find all occurrences of the search text
  let position = content.indexOf(findText, 0);
  
  while (position !== -1) {
    findMatches.push({
      start: position,
      end: position + findText.length
    });
    
    // Find next occurrence
    position = content.indexOf(findText, position + 1);
  }
  
  // If no matches, reset
  if (findMatches.length === 0) {
    currentFindIndex = -1;
    alert('No matches found');
    return;
  }
  
  // Move to the next match or first if we're at the end
  if (currentFindIndex < 0 || currentFindIndex >= findMatches.length - 1) {
    currentFindIndex = 0;
  } else {
    currentFindIndex++;
  }
  
  // Highlight the current match
  highlightCurrentMatch();
}

// Highlight the current match
function highlightCurrentMatch() {
  if (currentFindIndex < 0 || findMatches.length === 0) return;
  
  const match = findMatches[currentFindIndex];
  
  // Select the text in the editor
  editor.focus();
  editor.setSelectionRange(match.start, match.end);
  
  // Scroll to make the match visible
  editor.blur();
  editor.focus();
  
  // Update status to show match position
  statsDisplay.textContent = `Found ${currentFindIndex + 1}/${findMatches.length} - Characters: ${editor.value.length.toLocaleString()} & Words: ${countWords(editor.value).toLocaleString()}`;
}

// Escape special characters for use in a RegExp
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Initialize the editor when the document is ready
document.addEventListener('DOMContentLoaded', initEditor);