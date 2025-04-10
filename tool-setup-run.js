// Get UI elements
const toolNameElement = document.getElementById('tool-name');
const dialogToolNameElement = document.getElementById('dialog-tool-name');
const closeBtn = document.getElementById('close-btn');
const setupBtn = document.getElementById('setup-btn');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const forceQuitBtn = document.getElementById('force-quit-btn');
const outputElement = document.getElementById('output');
const elapsedTimeElement = document.getElementById('elapsed-time');

// Dialog elements
const setupDialogOverlay = document.getElementById('setup-dialog-overlay');
const setupDialogClose = document.getElementById('setup-dialog-close');
const setupDialogCancel = document.getElementById('setup-dialog-cancel');
const setupDialogApply = document.getElementById('setup-dialog-apply');
const dialogOptionsContainer = document.getElementById('dialog-options-container');

// Tool state
let toolData = null;
let currentToolOptions = [];
let isRunning = false;
let startTime = null;
let timerInterval = null;
let currentRunId = null;
let setupCompleted = false;
let currentOptionValues = {};

// Initialize when the window loads
window.addEventListener('DOMContentLoaded', async () => {
  // Get tool info from main process
  try {
    toolData = await window.electronAPI.getCurrentTool();
    
    if (toolData) {
      // Set tool name in both main view and dialog
      toolNameElement.textContent = toolData.title || toolData.name;
      dialogToolNameElement.textContent = toolData.title || toolData.name;
      document.title = `Writer's Toolkit - ${toolData.title || toolData.name}`;
      
      // Get tool options
      currentToolOptions = await window.electronAPI.getToolOptions(toolData.name);
      console.log('Loaded tool options:', currentToolOptions);
      
      // Disable Run button until setup is completed
      runBtn.disabled = true;
    } else {
      outputElement.textContent = 'Error: No tool selected!';
    }
  } catch (error) {
    console.error('Error loading tool data:', error);
    outputElement.textContent = `Error loading tool: ${error.message}`;
  }
  
  // Apply theme if one is set
  window.electronAPI.onSetTheme((theme) => {
    document.body.className = theme === 'light' ? 'light-mode' : 'dark-mode';
  });
});

// Close button handler
closeBtn.addEventListener('click', () => {
  // Before closing, stop any running tool
  if (isRunning && currentRunId) {
    window.electronAPI.stopTool(currentRunId)
      .then(() => {
        window.electronAPI.closeToolDialog('cancelled');
      })
      .catch(error => {
        console.error('Error stopping tool:', error);
        window.electronAPI.closeToolDialog('cancelled');
      });
  } else {
    window.electronAPI.closeToolDialog('cancelled');
  }
});

// Force Quit button handler - always enabled and immediately quits the app
forceQuitBtn.addEventListener('click', () => {
  console.log('Force quit requested');
  window.electronAPI.quitApp();
});

// Setup button handler - now opens the setup dialog
setupBtn.addEventListener('click', () => {
  console.log('Setup button clicked');
  // Generate form controls for options
  generateOptionsForm(currentToolOptions);
  // Show the dialog
  showSetupDialog();
});

// Setup dialog close button
setupDialogClose.addEventListener('click', () => {
  hideSetupDialog();
});

// Setup dialog cancel button
setupDialogCancel.addEventListener('click', () => {
  hideSetupDialog();
});

// Setup dialog apply button
setupDialogApply.addEventListener('click', () => {
  console.log('Apply settings clicked');
  // Validate the form
  if (!validateOptionsForm()) {
    console.log('Form validation failed');
    return; // Don't close dialog if validation fails
  }
  
  // Gather all options from form
  currentOptionValues = gatherOptionValues();
  console.log('Gathered option values:', currentOptionValues);
  
  // Display setup information in output area
  outputElement.textContent = `Tool: ${toolData.title || toolData.name}\n\nOptions:\n`;
  
  // Add each option and its value
  for (const [key, value] of Object.entries(currentOptionValues)) {
    outputElement.textContent += `${key}: ${value}\n`;
  }
  
  outputElement.textContent += '\nReady to run. Click the "Run" button to execute.';
  
  // Store the options for the run
  window.electronAPI.setToolOptions(currentOptionValues);
  
  // Enable Run button
  runBtn.disabled = false;
  setupCompleted = true;
  
  // Close the dialog
  hideSetupDialog();
});

// Run button handler
runBtn.addEventListener('click', async () => {
  if (isRunning) {
    outputElement.textContent += '\nTool is already running!';
    return;
  }
  
  if (!setupCompleted) {
    outputElement.textContent += '\nPlease complete Setup first.';
    return;
  }
  
  // Start timing
  startTime = Date.now();
  isRunning = true;
  startTimer();
  
  // Update UI
  runBtn.disabled = true;
  setupBtn.disabled = true;
  
  // Clear output and show starting message
  outputElement.textContent = `Starting ${toolData.title || toolData.name}...\n\n`;
  
  try {
    // Run the tool
    currentRunId = await window.electronAPI.startToolRun(toolData.name, currentOptionValues);
    console.log('Tool started with run ID:', currentRunId);
    
    // Listen for output messages
    window.electronAPI.onToolOutput((data) => {
      // Append output to the output element
      outputElement.textContent += data.text;
      
      // Auto scroll to bottom
      outputElement.scrollTop = outputElement.scrollHeight;
    });
    
    // Listen for tool completion
    window.electronAPI.onToolFinished((result) => {
      console.log('Tool finished:', result);
      isRunning = false;
      stopTimer();
      
      // Update UI
      runBtn.disabled = false;
      setupBtn.disabled = false;
      
      // Add completion message
      outputElement.textContent += `\n\nTool finished with exit code: ${result.code}`;
      
      if (result.createdFiles && result.createdFiles.length > 0) {
        outputElement.textContent += `\n\nFiles created/modified:\n${result.createdFiles.join('\n')}`;
      }
      
      currentRunId = null;
    });
    
    // Listen for tool errors
    window.electronAPI.onToolError((error) => {
      console.error('Tool error:', error);
      outputElement.textContent += `\n\nError: ${error.error}`;
      isRunning = false;
      stopTimer();
      
      // Update UI
      runBtn.disabled = false;
      setupBtn.disabled = false;
      currentRunId = null;
    });
  } catch (error) {
    // Handle errors
    console.error('Error running tool:', error);
    outputElement.textContent += `\nError running tool: ${error.message}`;
    isRunning = false;
    stopTimer();
    
    // Update UI
    runBtn.disabled = false;
    setupBtn.disabled = false;
  }
});

// Clear button handler - only clear output, not elapsed time
clearBtn.addEventListener('click', () => {
  outputElement.textContent = 'Output cleared.';
});

// Show the setup dialog
function showSetupDialog() {
  setupDialogOverlay.style.display = 'flex';
}

// Hide the setup dialog
function hideSetupDialog() {
  setupDialogOverlay.style.display = 'none';
}

// Generate form controls for tool options
function generateOptionsForm(options) {
  dialogOptionsContainer.innerHTML = '';
  
  if (!options || options.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'This tool has no configurable options.';
    dialogOptionsContainer.appendChild(emptyMessage);
    return;
  }
  
  options.forEach(option => {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    // Create label
    const label = document.createElement('label');
    label.setAttribute('for', `option-${option.name}`);
    label.textContent = option.label || option.name;
    if (option.required) {
      label.textContent += ' *';
    }
    formGroup.appendChild(label);
    
    // Add description if available
    if (option.description) {
      const description = document.createElement('p');
      description.className = 'option-description';
      description.textContent = option.description;
      formGroup.appendChild(description);
    }
    
    // Create input based on type
    let input;
    
    switch (option.type) {
      case 'boolean':
        const checkboxGroup = document.createElement('div');
        checkboxGroup.className = 'checkbox-group';
        
        input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `option-${option.name}`;
        input.name = option.name;
        input.checked = option.default === true;
        
        checkboxGroup.appendChild(input);
        formGroup.appendChild(checkboxGroup);
        break;
        
      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        input.id = `option-${option.name}`;
        input.name = option.name;
        input.value = option.default !== undefined ? option.default : '';
        
        if (option.min !== undefined) input.min = option.min;
        if (option.max !== undefined) input.max = option.max;
        if (option.step !== undefined) input.step = option.step;
        
        formGroup.appendChild(input);
        break;
        
      case 'select':
        input = document.createElement('select');
        input.id = `option-${option.name}`;
        input.name = option.name;
        
        if (option.choices && Array.isArray(option.choices)) {
          option.choices.forEach(choice => {
            const optionEl = document.createElement('option');
            optionEl.value = choice.value;
            optionEl.textContent = choice.label || choice.value;
            
            if (option.default === choice.value) {
              optionEl.selected = true;
            }
            
            input.appendChild(optionEl);
          });
        }
        
        formGroup.appendChild(input);
        break;
        
      case 'file':
        const fileContainer = document.createElement('div');
        fileContainer.className = 'file-input-container';
        
        input = document.createElement('input');
        input.type = 'text';
        input.id = `option-${option.name}`;
        input.name = option.name;
        input.value = option.default || '';
        input.readOnly = true;
        
        const browseBtn = document.createElement('button');
        browseBtn.type = 'button';
        browseBtn.textContent = 'Browse...';
        browseBtn.className = 'browse-button';
        
        // Improved file selection handler
        browseBtn.addEventListener('click', async (event) => {
          // Prevent default to ensure the event is properly handled
          event.preventDefault();
          event.stopPropagation();
          
          console.log('Browse button clicked for', option.name);
          
          try {
            const filters = option.filters || [{ name: 'All Files', extensions: ['*'] }];
            console.log('Using filters:', filters);
            
            const filePath = await window.electronAPI.selectFile({
              title: `Select ${option.label || option.name}`,
              filters: filters
            });
            
            console.log('Selected file path:', filePath);
            
            if (filePath) {
              input.value = filePath;
              
              // Trigger a change event to ensure validation recognizes the new value
              const changeEvent = new Event('change', { bubbles: true });
              input.dispatchEvent(changeEvent);
              
              // Clear any error message
              const errorElement = document.getElementById(`error-${option.name}`);
              if (errorElement) {
                errorElement.style.display = 'none';
              }
            }
          } catch (error) {
            console.error('Error selecting file:', error);
            outputElement.textContent += `\nError selecting file: ${error.message}\n`;
          }
        });
        
        fileContainer.appendChild(input);
        fileContainer.appendChild(browseBtn);
        formGroup.appendChild(fileContainer);
        break;
        
      case 'directory':
        const dirContainer = document.createElement('div');
        dirContainer.className = 'file-input-container';
        
        input = document.createElement('input');
        input.type = 'text';
        input.id = `option-${option.name}`;
        input.name = option.name;
        input.value = option.default || '';
        input.readOnly = true;
        
        const browseDirBtn = document.createElement('button');
        browseDirBtn.type = 'button';
        browseDirBtn.textContent = 'Browse...';
        browseDirBtn.className = 'browse-button';
        
        browseDirBtn.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          
          console.log('Browse directory button clicked for', option.name);
          
          try {
            const dirPath = await window.electronAPI.selectDirectory({
              title: `Select ${option.label || option.name}`
            });
            
            console.log('Selected directory path:', dirPath);
            
            if (dirPath) {
              input.value = dirPath;
              
              // Trigger change event
              const changeEvent = new Event('change', { bubbles: true });
              input.dispatchEvent(changeEvent);
              
              // Clear any error message
              const errorElement = document.getElementById(`error-${option.name}`);
              if (errorElement) {
                errorElement.style.display = 'none';
              }
            }
          } catch (error) {
            console.error('Error selecting directory:', error);
            outputElement.textContent += `\nError selecting directory: ${error.message}\n`;
          }
        });
        
        dirContainer.appendChild(input);
        dirContainer.appendChild(browseDirBtn);
        formGroup.appendChild(dirContainer);
        break;
        
      case 'textarea':
        input = document.createElement('textarea');
        input.id = `option-${option.name}`;
        input.name = option.name;
        input.rows = option.rows || 4;
        input.value = option.default || '';
        formGroup.appendChild(input);
        break;
        
      case 'text':
      default:
        input = document.createElement('input');
        input.type = 'text';
        input.id = `option-${option.name}`;
        input.name = option.name;
        input.value = option.default || '';
        formGroup.appendChild(input);
        break;
    }
    
    // Add error message container
    const errorMessage = document.createElement('div');
    errorMessage.id = `error-${option.name}`;
    errorMessage.className = 'error-message';
    errorMessage.style.display = 'none';
    formGroup.appendChild(errorMessage);
    
    // Add required attribute if specified
    if (option.required) {
      input.dataset.required = 'true';
      
      // Add input validation event
      input.addEventListener('change', () => {
        validateInput(input, errorMessage, option);
      });
      
      input.addEventListener('blur', () => {
        validateInput(input, errorMessage, option);
      });
    }
    
    // Add the form group to the container
    dialogOptionsContainer.appendChild(formGroup);
  });
}

// Validate a single input field
function validateInput(input, errorElement, option) {
  if (option.required && !input.value.trim()) {
    errorElement.textContent = 'This field is required';
    errorElement.style.display = 'block';
    return false;
  } else {
    errorElement.style.display = 'none';
    return true;
  }
}

// Validate the options form
function validateOptionsForm() {
  let isValid = true;
  
  currentToolOptions.forEach(option => {
    if (option.required) {
      const input = document.getElementById(`option-${option.name}`);
      const errorElement = document.getElementById(`error-${option.name}`);
      
      if (!input.value.trim()) {
        errorElement.textContent = 'This field is required';
        errorElement.style.display = 'block';
        isValid = false;
      } else {
        errorElement.style.display = 'none';
      }
    }
  });
  
  return isValid;
}

// Gather all option values from the form
function gatherOptionValues() {
  const values = {};
  
  currentToolOptions.forEach(option => {
    const inputElement = document.getElementById(`option-${option.name}`);
    
    if (inputElement) {
      if (option.type === 'boolean') {
        values[option.name] = inputElement.checked;
      } else if (option.type === 'number') {
        values[option.name] = inputElement.value ? parseFloat(inputElement.value) : '';
      } else {
        values[option.name] = inputElement.value;
      }
    }
  });
  
  return values;
}

// Timer functions
function startTimer() {
  // Update immediately
  updateElapsedTime();
  
  // Then update every second
  timerInterval = setInterval(updateElapsedTime, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateElapsedTime() {
  if (!startTime) return;
  
  const currentTime = Date.now();
  const elapsedMs = currentTime - startTime;
  
  const minutes = Math.floor(elapsedMs / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000);
  
  elapsedTimeElement.textContent = `elapsed time: ${minutes}m ${seconds}s`;
}