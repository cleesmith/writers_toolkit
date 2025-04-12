// Get elements
const themeToggleBtn = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const quitButton = document.getElementById('quit-button');
const apiSettingsBtn = document.getElementById('api-settings-btn');
const body = document.body;

// Track theme state (initially dark)
let isDarkMode = true;

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

// Initialize icons on page load
updateThemeIcons();

// Toggle between dark and light mode
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

// Quit application when quit button is clicked
quitButton.addEventListener('click', () => {
  window.electronAPI.quitApp();
});

// Project selection functionality
const selectProjectBtn = document.getElementById('select-project-btn');
const currentProjectName = document.getElementById('current-project-name');
const currentProjectPath = document.getElementById('current-project-path');

// Tool selection functionality
const toolSelect = document.getElementById('tool-select');
const toolDescription = document.getElementById('tool-description');
const setupRunBtn = document.getElementById('setup-run-btn');

// Load current project info when the app starts
async function loadProjectInfo() {
  try {
    const projectInfo = await window.electronAPI.getProjectInfo();
    updateProjectDisplay(projectInfo);
  } catch (error) {
    console.error('Error loading project info:', error);
  }
}

// Update the project display in the UI
function updateProjectDisplay(projectInfo) {
  if (projectInfo && projectInfo.current_project) {
    currentProjectName.textContent = projectInfo.current_project;
    currentProjectName.classList.remove('no-project');
    
    if (projectInfo.current_project_path) {
      currentProjectPath.textContent = `Project Path: ${projectInfo.current_project_path}`;
      currentProjectPath.style.display = 'block';
    } else {
      currentProjectPath.style.display = 'none';
    }
  } else {
    currentProjectName.textContent = 'No project selected';
    currentProjectName.classList.add('no-project');
    currentProjectPath.style.display = 'none';
  }
}

// Handle the select project button click
selectProjectBtn.addEventListener('click', () => {
  window.electronAPI.selectProject();
});

// Listen for project updates from the main process
window.electronAPI.onProjectUpdated((event) => {
  if (event.project) {
    updateProjectDisplay({
      current_project: event.project.projectName,
      current_project_path: event.project.projectPath
    });
    
    // Reload tools list after project change
    loadTools();
  }
});

// Load the list of tools
async function loadTools() {
  try {
    const tools = await window.electronAPI.getTools();
    
    // Clear any existing options
    toolSelect.innerHTML = '';
    
    // Add tools to the dropdown
    tools.forEach(tool => {
      const option = document.createElement('option');
      option.value = tool.name;
      option.textContent = tool.title;
      option.dataset.description = tool.description;
      toolSelect.appendChild(option);
    });
    
    // Select the first tool by default
    if (tools.length > 0) {
      toolSelect.value = tools[0].name;
      toolDescription.textContent = tools[0].description;
    } else {
      toolDescription.textContent = 'No tools available.';
    }
  } catch (error) {
    console.error('Error loading tools:', error);
    toolDescription.textContent = 'Error loading tools.';
  }
}

// Update the description when a different tool is selected
toolSelect.addEventListener('change', () => {
  const selectedOption = toolSelect.options[toolSelect.selectedIndex];
  if (selectedOption) {
    toolDescription.textContent = selectedOption.dataset.description || 'No description available.';
  }
});

// Handle the Setup & Run button
setupRunBtn.addEventListener('click', () => {
  const selectedTool = toolSelect.value;
  if (!selectedTool) {
    alert('Please select a tool first.');
    return;
  }
  
  // Launch the tool setup dialog
  window.electronAPI.showToolSetupDialog(selectedTool);
});

// Editor button handler
const openEditorBtn = document.getElementById('open-editor-btn');
if (openEditorBtn) {
  openEditorBtn.addEventListener('click', async () => {
    try {
      const success = await window.electronAPI.launchEditor();
      if (!success) {
        console.error('Failed to launch editor');
        // You could show an error notification here if you have one
      }
    } catch (error) {
      console.error('Error launching editor:', error);
    }
  });
}

// Open API Settings dialog
if (apiSettingsBtn) {
  apiSettingsBtn.addEventListener('click', () => {
    window.electronAPI.showApiSettingsDialog();
  });
}

// Listen for API settings updates
window.electronAPI.onApiSettingsUpdated((settings) => {
  console.log('API settings updated:', settings);
  // Could refresh any UI that depends on these settings
});

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadProjectInfo();
  loadTools();
});
