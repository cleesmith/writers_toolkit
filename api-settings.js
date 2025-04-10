// Get references to DOM elements
const settingsContainer = document.getElementById('settings-container');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');

// Store the settings schema and values
let settingsSchema = [];
let settingsValues = {};
let settingInputs = {};

// When the page loads, fetch the current API settings schema and values
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get API settings from the main process
    const result = await window.electronAPI.getClaudeApiSettings();
    
    if (result && result.schema && result.values) {
      // Store the schema and values
      settingsSchema = result.schema;
      settingsValues = result.values;
      
      // Render the settings form
      renderSettingsForm(settingsSchema, settingsValues);
    } else {
      showError('Failed to load API settings schema or values');
    }
  } catch (error) {
    console.error('Error fetching API settings:', error);
    showError('Failed to load API settings. Please try again.');
  }
  
  // Default to dark mode until we receive theme from main process
  document.body.classList.add('dark-mode');
  console.log('Initial theme set to dark mode');
});

// Render the settings form based on the schema
function renderSettingsForm(schema, values) {
  // Clear loading message
  settingsContainer.innerHTML = '';
  
  // Loop through each setting in the schema
  schema.forEach(setting => {
    // Create a setting group
    const settingGroup = document.createElement('div');
    settingGroup.className = 'setting-group';
    
    // Create label
    const label = document.createElement('label');
    label.className = 'setting-label';
    label.textContent = setting.label || setting.name;
    settingGroup.appendChild(label);
    
    // Create appropriate input based on setting type
    let input;
    switch (setting.type) {
      case 'number':
        input = document.createElement('input');
        input.type = 'number';
        input.min = setting.min !== undefined ? setting.min : '';
        input.max = setting.max !== undefined ? setting.max : '';
        input.step = setting.step || 1;
        input.value = values[setting.name] !== undefined ? values[setting.name] : (setting.default || '');
        break;
        
      case 'select':
        input = document.createElement('select');
        if (setting.options) {
          setting.options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option.value;
            optElement.textContent = option.label || option.value;
            input.appendChild(optElement);
          });
        }
        input.value = values[setting.name] !== undefined ? values[setting.name] : (setting.default || '');
        break;
        
      case 'boolean':
        // For boolean, we use a select with Yes/No options
        input = document.createElement('select');
        const trueOption = document.createElement('option');
        trueOption.value = 'true';
        trueOption.textContent = 'Yes';
        input.appendChild(trueOption);
        
        const falseOption = document.createElement('option');
        falseOption.value = 'false';
        falseOption.textContent = 'No';
        input.appendChild(falseOption);
        
        input.value = (values[setting.name] === true || values[setting.name] === 'true') ? 'true' : 'false';
        break;
        
      default: // Default to text input
        input = document.createElement('input');
        input.type = 'text';
        input.value = values[setting.name] !== undefined ? values[setting.name] : (setting.default || '');
    }
    
    // Add common properties
    input.id = `setting-${setting.name}`;
    input.setAttribute('data-setting-name', setting.name);
    input.setAttribute('data-setting-type', setting.type);
    settingGroup.appendChild(input);
    
    // Add validation error message container
    const errorText = document.createElement('div');
    errorText.id = `error-${setting.name}`;
    errorText.className = 'error-text';
    settingGroup.appendChild(errorText);
    
    // Add description if provided
    if (setting.description) {
      const description = document.createElement('div');
      description.className = 'setting-description';
      description.textContent = setting.description;
      description.style.fontSize = '12px';
      
      // Apply color based on current theme
      const isLightMode = document.body.classList.contains('light-mode');
      description.style.color = isLightMode ? '#666666' : '#888888';
      
      description.style.marginTop = '-10px';
      description.style.marginBottom = '15px';
      settingGroup.appendChild(description);
    }
    
    // Store reference to the input
    settingInputs[setting.name] = {
      element: input,
      errorElement: errorText,
      schema: setting
    };
    
    // Add the setting group to the container
    settingsContainer.appendChild(settingGroup);
  });
}

// Handle save button click
saveBtn.addEventListener('click', async () => {
  // Validate inputs
  if (!validateAllInputs()) {
    return;
  }
  
  try {
    // Collect values from form
    const settings = {};
    
    for (const settingName in settingInputs) {
      const input = settingInputs[settingName].element;
      const schema = settingInputs[settingName].schema;
      
      // Process the value based on setting type
      let value = input.value;
      
      switch (schema.type) {
        case 'number':
          value = parseFloat(value);
          // Convert to integer if step is 1
          if (schema.step === 1 || !schema.step) {
            value = Math.round(value);
          }
          break;
          
        case 'boolean':
          value = value === 'true';
          break;
          
        // Add other type conversions as needed
      }
      
      settings[settingName] = value;
    }
    
    // Save settings through main process
    const result = await window.electronAPI.saveClaudeApiSettings(settings);
    
    if (result && result.success) {
      // Close the dialog with success action
      window.electronAPI.closeApiSettingsDialog('saved', settings);
    } else {
      showError(result.message || 'Failed to save API settings');
    }
  } catch (error) {
    console.error('Error saving API settings:', error);
    showError('An error occurred while saving API settings');
  }
});

// Handle cancel button click
cancelBtn.addEventListener('click', () => {
  window.electronAPI.closeApiSettingsDialog('cancelled');
});

// Validate all inputs
function validateAllInputs() {
  let isValid = true;
  
  for (const settingName in settingInputs) {
    const input = settingInputs[settingName].element;
    const errorElement = settingInputs[settingName].errorElement;
    const schema = settingInputs[settingName].schema;
    
    // Reset error state
    errorElement.style.display = 'none';
    
    // Get value
    let value = input.value;
    
    // Check if required
    if (schema.required && (!value || value.trim() === '')) {
      showInputError(errorElement, 'This field is required');
      isValid = false;
      continue;
    }
    
    // Validate based on type
    switch (schema.type) {
      case 'number':
        value = parseFloat(value);
        
        if (isNaN(value)) {
          showInputError(errorElement, 'Please enter a valid number');
          isValid = false;
          break;
        }
        
        if (schema.min !== undefined && value < schema.min) {
          showInputError(errorElement, `Value must be at least ${schema.min}`);
          isValid = false;
          break;
        }
        
        if (schema.max !== undefined && value > schema.max) {
          showInputError(errorElement, `Value must be at most ${schema.max}`);
          isValid = false;
          break;
        }
        break;
        
      // Add other validation types as needed
    }
  }
  
  return isValid;
}

// Show error for a specific input
function showInputError(errorElement, message) {
  errorElement.textContent = message;
  errorElement.style.display = 'block';
}

// Helper function to show general errors
function showError(message) {
  // Create a simple error notification
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #f44336;
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    z-index: 1000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 500);
  }, 3000);
}

// Listen for theme messages from the main process
window.electronAPI.onSetTheme((theme) => {
  console.log('Received theme message:', theme);
  
  // Remove all theme classes first
  document.body.classList.remove('light-mode', 'dark-mode');
  
  // Apply the appropriate theme class
  if (theme === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.add('dark-mode');
  }
  
  // Update setting descriptions color based on theme
  const descriptions = document.querySelectorAll('.setting-description');
  descriptions.forEach(desc => {
    desc.style.color = theme === 'light' ? '#666666' : '#888888';
  });
  
  console.log('Theme applied:', theme, 'Body classes:', document.body.className);
});
