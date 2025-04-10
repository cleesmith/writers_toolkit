// Get UI elements
const toolNameElement = document.getElementById('tool-name');
const closeBtn = document.getElementById('close-btn');
const setupBtn = document.getElementById('setup-btn');
const runBtn = document.getElementById('run-btn');
const clearBtn = document.getElementById('clear-btn');
const forceQuitBtn = document.getElementById('force-quit-btn');
const optionsContainer = document.getElementById('options-container');
const outputElement = document.getElementById('output');
const elapsedTimeElement = document.getElementById('elapsed-time');

// Tool state
let toolData = null;
let currentToolOptions = [];
let isRunning = false;
let startTime = null;
let timerInterval = null;
let currentRunId = null;

// Initialize when the window loads
window.addEventListener('DOMContentLoaded', async () => {
  // Get tool info from main process
  try {
    toolData = await window.electronAPI.getCurrentTool();
    
    if (toolData) {
      // Set tool name
      toolNameElement.textContent = toolData.name;
      document.title = `Writer's Toolkit - ${toolData.name}`;
      
      // Get tool options
      currentToolOptions = await window.electronAPI.getToolOptions(toolData.name);
      
      // Generate form controls for options
      generateOptionsForm(currentToolOptions);
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

// Setup button handler
setupBtn.addEventListener('click', () => {
  // Gather all options from form
  const optionValues = gatherOptionValues();
  
  // Display setup information in output area
  outputElement.textContent = `Tool: ${toolData.name}\n\nOptions:\n`;
  
  // Add each option and its value
  for (const [key, value] of Object.entries(optionValues)) {
    outputElement.textContent += `${key}: ${value}\n`;
  }
  
  outputElement.textContent += '\nReady to run. Click the "Run" button to execute.';
  
  // Store the options for the run
  window.electronAPI.setToolOptions(optionValues);
});

// Run button handler
runBtn.addEventListener('click', async () => {
  if (isRunning) {
    outputElement.textContent += '\nTool is already running!';
    return;
  }
  
  // Gather all options from form
  const optionValues = gatherOptionValues();
  
  // Start timing
  startTime = Date.now();
  isRunning = true;
  startTimer();
  
  // Update UI
  runBtn.disabled = true;
  setupBtn.disabled = true;
  
  // Clear output and show starting message
  outputElement.textContent = `Starting ${toolData.name}...\n\n`;
  
  try {
    // Run the tool
    currentRunId = await window.electronAPI.startToolRun(toolData.name, optionValues);
    
    // Listen for output messages
    window.electronAPI.onToolOutput((data) => {
      // Append output to the output element
      outputElement.textContent += data.text;
      
      // Auto scroll to bottom
      outputElement.scrollTop = outputElement.scrollHeight;
    });
    
    // Listen for tool completion
    window.electronAPI.onToolFinished((result) => {
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
  } catch (error) {
    // Handle errors
    outputElement.textContent += `\nError running tool: ${error.message}`;
    isRunning = false;
    stopTimer();
    
    // Update UI
    runBtn.disabled = false;
    setupBtn.disabled = false;
  }
});

// Clear button handler
clearBtn.addEventListener('click', () => {
  outputElement.textContent = 'Output cleared.';
  
  // Reset timer display
  elapsedTimeElement.textContent = 'elapsed time: 0m 0s';
});

// Force Quit button handler
forceQuitBtn.addEventListener('click', async () => {
  if (isRunning && currentRunId) {
    try {
      await window.electronAPI.stopTool(currentRunId);
      
      // Update UI
      isRunning = false;
      stopTimer();
      runBtn.disabled = false;
      setupBtn.disabled = false;
      
      outputElement.textContent += '\n\nTool execution forcefully terminated.';
    } catch (error) {
      outputElement.textContent += `\n\nError stopping tool: ${error.message}`;
    }
  } else {
    outputElement.textContent += '\n\nNo tool currently running.';
  }
});

// Generate form controls for tool options
function generateOptionsForm(options) {
  optionsContainer.innerHTML = '';
  
  if (!options || options.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'This tool has no configurable options.';
    optionsContainer.appendChild(emptyMessage);
    return;
  }
  
  options.forEach(option => {
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    // Create label
    const label = document.createElement('label');
    label.setAttribute('for', `option-${option.name}`);
    label.textContent = option.label || option.name;
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
        browseBtn.addEventListener('click', async () => {
          try {
            const filePath = await window.electronAPI.selectFile({
              title: `Select ${option.label || option.name}`,
              filters: option.filters || [{ name: 'All Files', extensions: ['*'] }]
            });
            
            if (filePath) {
              input.value = filePath;
            }
          } catch (error) {
            console.error('Error selecting file:', error);
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
        browseDirBtn.addEventListener('click', async () => {
          try {
            const dirPath = await window.electronAPI.selectDirectory({
              title: `Select ${option.label || option.name}`
            });
            
            if (dirPath) {
              input.value = dirPath;
            }
          } catch (error) {
            console.error('Error selecting directory:', error);
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
    
    // Add required attribute if specified
    if (option.required) {
      input.required = true;
    }
    
    // Add the form group to the container
    optionsContainer.appendChild(formGroup);
  });
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