// db-manager-renderer.js
document.addEventListener('DOMContentLoaded', () => {
  // Tab management
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      
      // Add active class to the clicked tab
      tab.classList.add('active');
      
      // Hide all tab contents
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Show the corresponding tab content
      const tabName = tab.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      // Special handling for settings tab - load settings when clicked
      if (tabName === 'settings') {
        loadSettings();
      }
    });
  });
  
  // Tool management
  const toolsGrid = document.getElementById('tools-grid');
  const addToolBtn = document.getElementById('add-tool-btn');
  const toolModalOverlay = document.getElementById('tool-modal-overlay');
  const toolModalTitle = document.getElementById('tool-modal-title');
  const toolModalClose = document.getElementById('tool-modal-close');
  const toolModalCancel = document.getElementById('tool-modal-cancel');
  const toolModalSave = document.getElementById('tool-modal-save');
  const toolForm = document.getElementById('tool-form');
  const toolId = document.getElementById('tool-id');
  const toolName = document.getElementById('tool-name');
  const toolTitle = document.getElementById('tool-title');
  const toolDescription = document.getElementById('tool-description');
  const toolHelpText = document.getElementById('tool-help-text');
  const toolOptions = document.getElementById('tool-options');
  
  // Settings management
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const defaultSaveDir = document.getElementById('default-save-dir');
  const toolsConfigDir = document.getElementById('tools-config-dir');
  const currentProject = document.getElementById('current-project');
  const currentProjectPath = document.getElementById('current-project-path');
  const maxRetries = document.getElementById('max-retries');
  const requestTimeout = document.getElementById('request-timeout');
  const contextWindow = document.getElementById('context-window');
  const thinkingBudget = document.getElementById('thinking-budget');
  const betasMaxTokens = document.getElementById('betas-max-tokens');
  const desiredOutput = document.getElementById('desired-output');
  const selectSaveDirBtn = document.getElementById('select-save-dir-btn');
  const selectConfigDirBtn = document.getElementById('select-config-dir-btn');
  
  // Notification
  const notification = document.getElementById('notification');
  
  // Load tools initially
  loadTools();
  
  // Show tool modal for adding a new tool
  addToolBtn.addEventListener('click', () => {
    toolModalTitle.textContent = 'Add New Tool';
    toolForm.reset();
    toolId.value = '';
    toolOptions.value = '[]';
    toolModalOverlay.classList.add('active');
  });
  
  // Close modal with X button
  toolModalClose.addEventListener('click', () => {
    toolModalOverlay.classList.remove('active');
  });
  
  // Close modal with Cancel button
  toolModalCancel.addEventListener('click', () => {
    toolModalOverlay.classList.remove('active');
  });
  
  // Handle form submission
  toolModalSave.addEventListener('click', async () => {
    // Validate form
    if (!toolName.value || !toolTitle.value || !toolDescription.value) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }
    
    // Prepare tool data
    const toolData = {
      name: toolName.value,
      title: toolTitle.value,
      description: toolDescription.value,
      help_text: toolHelpText.value || null
    };
    
    // Parse options if provided
    if (toolOptions.value.trim()) {
      try {
        toolData.options = JSON.parse(toolOptions.value);
      } catch (error) {
        showNotification('Invalid JSON in options field', 'error');
        return;
      }
    }
    
    try {
      let result;
      
      if (toolId.value) {
        // Update existing tool - ensure ID is a string
        const id = String(toolId.value);
        result = await window.dbAPI.updateTool(id, toolData);
        if (result.success) {
          showNotification('Tool updated successfully', 'success');
        } else {
          showNotification(`Error updating tool: ${result.message}`, 'error');
        }
      } else {
        // Add new tool
        result = await window.dbAPI.addTool(toolData);
        if (result.success) {
          showNotification('Tool added successfully', 'success');
        } else {
          showNotification(`Error adding tool: ${result.message}`, 'error');
        }
      }
      
      // Close modal and reload tools
      toolModalOverlay.classList.remove('active');
      loadTools();
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  });
  
  // Save settings
  saveSettingsBtn.addEventListener('click', async () => {
    try {
      const settings = {
        default_save_dir: defaultSaveDir.value,
        tools_config_json_dir: toolsConfigDir.value,
        claude_api_configuration: {
          max_retries: parseInt(maxRetries.value) || 1,
          request_timeout: parseInt(requestTimeout.value) || 300,
          context_window: parseInt(contextWindow.value) || 200000,
          thinking_budget_tokens: parseInt(thinkingBudget.value) || 32000,
          betas_max_tokens: parseInt(betasMaxTokens.value) || 128000,
          desired_output_tokens: parseInt(desiredOutput.value) || 12000
        }
      };
      
      const result = await window.dbAPI.updateSettings(settings);
      
      if (result.success) {
        showNotification('Settings saved successfully', 'success');
      } else {
        showNotification(`Error: ${result.message}`, 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  });
  
  // Browse for directories
  selectSaveDirBtn.addEventListener('click', async () => {
    try {
      const result = await window.dbAPI.selectDirectory();
      if (result.success && !result.canceled) {
        defaultSaveDir.value = result.path;
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  });
  
  selectConfigDirBtn.addEventListener('click', async () => {
    try {
      const result = await window.dbAPI.selectDirectory();
      if (result.success && !result.canceled) {
        toolsConfigDir.value = result.path;
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  });
  
  // Load tools from database - FIXED
  async function loadTools() {
    try {
      const result = await window.dbAPI.getTools();
      
      // Get the parent grid element
      const gridElement = toolsGrid.parentElement;
      
      // Remove all existing tool rows (all elements after the headers)
      const headers = gridElement.querySelectorAll('.grid-header');
      const lastHeader = headers[headers.length - 1];
      let nextElement = lastHeader.nextElementSibling;
      
      while (nextElement) {
        const elementToRemove = nextElement;
        nextElement = nextElement.nextElementSibling;
        gridElement.removeChild(elementToRemove);
      }
      
      // Remove the empty tools-grid container
      if (toolsGrid.parentElement === gridElement) {
        gridElement.removeChild(toolsGrid);
      }
      
      if (!result.success) {
        showNotification(`Error: ${result.message}`, 'error');
        return;
      }
      
      // Display tools
      result.tools.forEach(tool => {
        // Name cell
        const nameCell = document.createElement('div');
        nameCell.className = 'grid-cell';
        nameCell.textContent = tool.name;
        
        // Description cell
        const descCell = document.createElement('div');
        descCell.className = 'grid-cell';
        descCell.textContent = tool.description;
        
        // Actions cell
        const actionsCell = document.createElement('div');
        actionsCell.className = 'grid-cell';
        
        const actions = document.createElement('div');
        actions.className = 'actions';
        
        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-outline';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => editTool(tool.id));
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteTool(tool.id, tool.name));
        
        // Add buttons to actions
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        actionsCell.appendChild(actions);
        
        // Add cells directly to the grid element (parent of tools-grid)
        // This makes them direct children of the grid, following CSS grid layout
        gridElement.appendChild(nameCell);
        gridElement.appendChild(descCell);
        gridElement.appendChild(actionsCell);
      });
    } catch (error) {
      showNotification(`Error loading tools: ${error.message}`, 'error');
    }
  }
  
  // Edit a tool - FIXED
  async function editTool(id) {
    try {
      // Ensure ID is a string
      id = String(id);
      
      const result = await window.dbAPI.getTool(id);
      
      if (!result.success) {
        showNotification(`Error: ${result.message}`, 'error');
        return;
      }
      
      const tool = result.tool;
      
      // Set modal title
      toolModalTitle.textContent = 'Edit Tool';
      
      // Fill form with tool data
      toolId.value = id;
      toolName.value = tool.name || '';
      toolTitle.value = tool.title || '';
      toolDescription.value = tool.description || '';
      toolHelpText.value = tool.help_text || '';
      
      // Format options as JSON
      if (tool.options) {
        toolOptions.value = JSON.stringify(tool.options, null, 2);
      } else {
        toolOptions.value = '[]';
      }
      
      // Show modal
      toolModalOverlay.classList.add('active');
    } catch (error) {
      showNotification(`Error loading tool: ${error.message}`, 'error');
    }
  }
  
  // Delete a tool
  async function deleteTool(id, name) {
    if (!confirm(`Are you sure you want to delete the tool "${name}"?`)) {
      return;
    }
    
    try {
      const result = await window.dbAPI.deleteTool(id);
      
      if (result.success) {
        showNotification('Tool deleted successfully', 'success');
        loadTools();
      } else {
        showNotification(`Error: ${result.message}`, 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  }
  
  // Load settings
  async function loadSettings() {
    try {
      const result = await window.dbAPI.getSettings();
      
      // If settings are found, populate the form
      if (result.success && result.settings) {
        const settings = result.settings;
        
        // Project settings
        defaultSaveDir.value = settings.default_save_dir || '';
        toolsConfigDir.value = settings.tools_config_json_dir || '.';
        currentProject.value = settings.current_project || 'None';
        currentProjectPath.value = settings.current_project_path || '';
        
        // Claude API settings
        if (settings.claude_api_configuration) {
          const api = settings.claude_api_configuration;
          maxRetries.value = api.max_retries || 1;
          requestTimeout.value = api.request_timeout || 300;
          contextWindow.value = api.context_window || 200000;
          thinkingBudget.value = api.thinking_budget_tokens || 32000;
          betasMaxTokens.value = api.betas_max_tokens || 128000;
          desiredOutput.value = api.desired_output_tokens || 12000;
        }
      } else {
        // Set default values
        defaultSaveDir.value = '';
        toolsConfigDir.value = '.';
        currentProject.value = 'None';
        currentProjectPath.value = '';
        maxRetries.value = 1;
        requestTimeout.value = 300;
        contextWindow.value = 200000;
        thinkingBudget.value = 32000;
        betasMaxTokens.value = 128000;
        desiredOutput.value = 12000;
      }
    } catch (error) {
      showNotification(`Error loading settings: ${error.message}`, 'error');
    }
  }
  
  // Show notification
  function showNotification(message, type = 'success') {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
      notification.classList.remove('show');
    }, 3000);
  }
});
