const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const { v4: uuidv4 } = require('uuid');
const appState = require('./src/state.js');

// Store references to windows
let mainWindow = null;
let projectDialogWindow = null;
let apiSettingsWindow = null;
let toolSetupRunWindow = null;

// Flag to control whether to show the project dialog
let shouldShowProjectDialog = true;

// Store the currently selected tool
let currentTool = null;

// Set application name
app.name = "Writer's Toolkit";

// Define menu template
const menuTemplate = [
  {
    label: 'Writer\'s Toolkit',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  // File menu
  {
    label: 'File',
    submenu: [
      { label: 'New Project' },
      { label: 'Open Project' },
      { type: 'separator' },
      { label: 'API Settings', click: () => showApiSettingsDialog() },
      { type: 'separator' },
      { label: 'Close Window', accelerator: 'CmdOrCtrl+W', role: 'close' }
    ]
  },
  // Edit menu with standard operations
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' }
    ]
  },
  // Add more menus as needed
];

// Set the application menu
const menu = Menu.buildFromTemplate(menuTemplate);
Menu.setApplicationMenu(menu);

// Function to create project selection dialog
function createProjectDialog() {
  // Create the dialog window
  projectDialogWindow = new BrowserWindow({
    width: 600,
    height: 650,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  projectDialogWindow.loadFile(path.join(__dirname, 'project-dialog.html'));

  // Show the window when ready
  projectDialogWindow.once('ready-to-show', () => {
    projectDialogWindow.show();
  });

  // Track window destruction
  projectDialogWindow.on('closed', () => {
    projectDialogWindow = null;
  });
  
  return projectDialogWindow;
}

// Show the project dialog
function showProjectDialog() {
  if (!projectDialogWindow || projectDialogWindow.isDestroyed()) {
    createProjectDialog();
    
    // Pass the current theme to the dialog
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (projectDialogWindow && !projectDialogWindow.isDestroyed()) {
            projectDialogWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  } else {
    projectDialogWindow.show();
  }
}

// Create the main application window
function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#111111', // Dark background
    autoHideMenuBar: false,
  });

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// Setup handlers for project operations
function setupProjectHandlers() {
  // Get list of projects
  ipcMain.handle('get-projects', async () => {
    try {
      // Ensure projects directory exists
      await fs.promises.mkdir(appState.PROJECTS_DIR, { recursive: true });
      
      // List all directories in the projects folder
      const items = await fs.promises.readdir(appState.PROJECTS_DIR);
      
      // Filter to only include directories and exclude hidden directories
      const projects = [];
      for (const item of items) {
        if (item.startsWith('.')) {
          continue; // Skip hidden items
        }
        
        const itemPath = path.join(appState.PROJECTS_DIR, item);
        const stats = await fs.promises.stat(itemPath);
        if (stats.isDirectory()) {
          projects.push(item);
        }
      }
      
      return projects.sort(); // Sort alphabetically
    } catch (error) {
      console.error('Error listing projects:', error);
      return [];
    }
  });
  
  // Open an existing project
  ipcMain.handle('open-project', async (event, projectName) => {
    try {
      const projectPath = path.join(appState.PROJECTS_DIR, projectName);
      
      // Check if the project directory exists
      if (!fs.existsSync(projectPath)) {
        return {
          success: false,
          message: `Project directory does not exist: ${projectPath}`
        };
      }
      
      // Update application state
      appState.CURRENT_PROJECT = projectName;
      appState.CURRENT_PROJECT_PATH = projectPath;
      appState.DEFAULT_SAVE_DIR = projectPath;
      
      // Save to electron-store
      if (appState.store) {
        appState.store.set('settings', {
          default_save_dir: projectPath,
          current_project: projectName,
          current_project_path: projectPath
        });
      }
      
      return {
        success: true,
        projectPath
      };
    } catch (error) {
      console.error('Error opening project:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
  
  // Create a new project
  ipcMain.handle('create-project', async (event, projectName) => {
    try {
      const projectPath = path.join(appState.PROJECTS_DIR, projectName);
      
      // Check if the project already exists
      if (fs.existsSync(projectPath)) {
        return {
          success: false,
          message: `Project '${projectName}' already exists`
        };
      }
      
      // Create the project directory
      await fs.promises.mkdir(projectPath, { recursive: true });
      
      // Update application state
      appState.CURRENT_PROJECT = projectName;
      appState.CURRENT_PROJECT_PATH = projectPath;
      appState.DEFAULT_SAVE_DIR = projectPath;
      
      // Save to electron-store
      if (appState.store) {
        appState.store.set('settings', {
          default_save_dir: projectPath,
          current_project: projectName,
          current_project_path: projectPath
        });
      }
      
      return {
        success: true,
        projectPath
      };
    } catch (error) {
      console.error('Error creating project:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
}

// Function to create the tool setup and run dialog
function createToolSetupRunDialog(toolName) {
  // Create the dialog window
  toolSetupRunWindow = new BrowserWindow({
    width: mainWindow.getSize()[0],
    height: mainWindow.getSize()[1],
    x: mainWindow.getPosition()[0],
    y: mainWindow.getPosition()[1],
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  toolSetupRunWindow.loadFile(path.join(__dirname, 'tool-setup-run.html'));

  // Show the window when ready
  toolSetupRunWindow.once('ready-to-show', () => {
    toolSetupRunWindow.show();
    
    // Send the current theme as soon as the window is ready
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  });

  // Track window destruction
  toolSetupRunWindow.on('closed', () => {
    toolSetupRunWindow = null;
  });
  
  // Prevent the tool window from being resized or moved
  toolSetupRunWindow.setResizable(false);
  toolSetupRunWindow.setMovable(false);
  
  return toolSetupRunWindow;
}

// Show the tool setup dialog
function showToolSetupRunDialog(toolName) {
  if (!toolSetupRunWindow || toolSetupRunWindow.isDestroyed()) {
    createToolSetupRunDialog(toolName);
  } else {
    toolSetupRunWindow.show();
    
    // Re-apply the theme when showing an existing window
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
            toolSetupRunWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  }
}

// Setup handlers for tool operations
function setupToolHandlers() {
  // This local `database` reference is initially null, so we lazy-load it.
  let database = null;
  let toolRunner = null;

  ipcMain.handle('get-tools', async () => {
    try {
      // Lazy load the database module if not already loaded
      if (!database) {
        database = require('./src/database.js');

        // IMPORTANT: Initialize the database store
        await database.init();
      }

      // Now the store is initialized, so we can call getTools()
      return database.getTools();

    } catch (error) {
      console.error('Error getting tools:', error);
      return [];
    }
  });

  ipcMain.handle('get-tool-options', async (event, toolName) => {
    try {
      if (!database) {
        database = require('./src/database.js');
        await database.init();
      }
      const tool = database.getToolByName(toolName);
      return tool ? tool.options || [] : [];
    } catch (error) {
      console.error('Error getting tool options:', error);
      return [];
    }
  });
  
  // Show tool setup dialog
  ipcMain.on('show-tool-setup-dialog', (event, toolName) => {
    // Store the currently selected tool
    currentTool = toolName;
    showToolSetupRunDialog(toolName);
  });
  
  // Handle tool dialog closing
  ipcMain.on('close-tool-dialog', (event, action, data) => {
    console.log('Tool dialog close action:', action);
    
    if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
      toolSetupRunWindow.hide();
    }
  });
  
  // Get current tool
  ipcMain.handle('get-current-tool', () => {
    try {
      if (!database) {
        database = require('./src/database.js');
        database.init();
      }
      
      if (currentTool) {
        return database.getToolByName(currentTool);
      }
      return null;
    } catch (error) {
      console.error('Error getting current tool:', error);
      return null;
    }
  });
  
  // Run tool
  ipcMain.handle('start-tool-run', async (event, toolName, optionValues) => {
    try {
      // Lazy load the tool runner if not already loaded
      if (!toolRunner) {
        toolRunner = require('./src/tool-runner.js');
      }
      
      // Start the tool and get the run ID
      const runId = uuidv4();
      
      // Run the tool and handle output
      toolRunner.runTool(toolName, optionValues, (output) => {
        // Send output to renderer
        if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
          toolSetupRunWindow.webContents.send('tool-output', { runId, text: output });
        }
      })
      .then(result => {
        // Send completion notification
        if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
          toolSetupRunWindow.webContents.send('tool-finished', { runId, ...result });
        }
      })
      .catch(error => {
        console.error(`Error running tool ${toolName}:`, error);
        if (toolSetupRunWindow && !toolSetupRunWindow.isDestroyed()) {
          toolSetupRunWindow.webContents.send('tool-error', { 
            runId, 
            error: error.message 
          });
        }
      });
      
      return runId;
    } catch (error) {
      console.error('Error starting tool run:', error);
      throw error;
    }
  });
  
  // Stop tool execution
  ipcMain.handle('stop-tool', async (event, runId) => {
    try {
      if (!toolRunner) {
        toolRunner = require('./src/tool-runner.js');
      }
      
      return toolRunner.stopTool(runId);
    } catch (error) {
      console.error('Error stopping tool:', error);
      throw error;
    }
  });
  
  // Store tool options in app state
  ipcMain.handle('set-tool-options', (event, options) => {
    try {
      appState.OPTION_VALUES = options;
      return true;
    } catch (error) {
      console.error('Error setting tool options:', error);
      return false;
    }
  });
}

// Function to create the API settings dialog
function createApiSettingsDialog() {
  // Create the dialog window
  apiSettingsWindow = new BrowserWindow({
    width: 600,
    height: 800,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#121212', // Dark background
    autoHideMenuBar: true,
  });

  // Load the HTML file
  apiSettingsWindow.loadFile(path.join(__dirname, 'api-settings.html'));

  // Wait for the window to be ready before showing
  apiSettingsWindow.once('ready-to-show', () => {
    apiSettingsWindow.show();
    
    // Send the current theme as soon as the window is ready
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
            console.log('Sending theme to API settings window:', isLightMode ? 'light' : 'dark');
            apiSettingsWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  });

  // Track window destruction
  apiSettingsWindow.on('closed', () => {
    apiSettingsWindow = null;
  });
  
  return apiSettingsWindow;
}

// Show the API settings dialog
function showApiSettingsDialog() {
  if (!apiSettingsWindow || apiSettingsWindow.isDestroyed()) {
    createApiSettingsDialog();
  } else {
    apiSettingsWindow.show();
    
    // Re-apply the theme when showing an existing window
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript('document.body.classList.contains("light-mode")')
        .then(isLightMode => {
          if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
            console.log('Re-sending theme to API settings window:', isLightMode ? 'light' : 'dark');
            apiSettingsWindow.webContents.send('set-theme', isLightMode ? 'light' : 'dark');
          }
        })
        .catch(err => console.error('Error getting theme:', err));
    }
  }
}

// Set up API settings handlers
function setupApiSettingsHandlers() {
  // Lazy load the database module to avoid circular dependencies
  let database = null;
  
  // Get Claude API settings
  ipcMain.handle('get-claude-api-settings', async () => {
    try {
      // Load the database module if not already loaded
      if (!database) {
        database = require('./src/database.js');
      }
      
      // Return the schema and current values
      return {
        schema: database.getClaudeApiSettingsSchema(),
        values: appState.settings_claude_api_configuration
      };
    } catch (error) {
      console.error('Error getting Claude API settings:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
  
  // Save Claude API settings
  ipcMain.handle('save-claude-api-settings', async (event, settings) => {
    try {
      // Update app state with new settings
      appState.settings_claude_api_configuration = {
        ...appState.settings_claude_api_configuration,
        ...settings
      };
      
      // Save to electron-store
      if (appState.store) {
        appState.store.set('claude_api_configuration', appState.settings_claude_api_configuration);
      }
      
      return {
        success: true
      };
    } catch (error) {
      console.error('Error saving Claude API settings:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });
  
  // Handle API settings dialog closing
  ipcMain.on('close-api-settings-dialog', (event, action, data) => {
    console.log('API settings dialog close action:', action);
    
    if (apiSettingsWindow && !apiSettingsWindow.isDestroyed()) {
      apiSettingsWindow.hide();
      
      // If settings were saved, could notify the main window if needed
      if (action === 'saved' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('api-settings-updated', data);
      }
    }
  });
}

// Set up all IPC handlers
function setupIPCHandlers() {
  setupProjectHandlers();
  setupToolHandlers();
  setupApiSettingsHandlers();
  
  // Handle quit request from renderer
  ipcMain.on('app-quit', () => {
    console.log('Quit requested from renderer');
    app.quit();
  });
  
  // Show project dialog
  ipcMain.on('show-project-dialog', () => {
    showProjectDialog();
  });
  
  // Show API settings dialog
  ipcMain.on('show-api-settings-dialog', () => {
    showApiSettingsDialog();
  });
  
  // Get current project info
  ipcMain.handle('get-project-info', () => {
    return {
      current_project: appState.CURRENT_PROJECT,
      current_project_path: appState.CURRENT_PROJECT_PATH
    };
  });
  
  // File selection dialog
  ipcMain.handle('select-file', async (event, options) => {
    try {
      console.log('Select file dialog requested with options:', options);
      
      // Ensure base directory is inside ~/writing
      const homePath = os.homedir();
      const writingPath = path.join(homePath, 'writing');
      let startPath = options.defaultPath || appState.DEFAULT_SAVE_DIR || writingPath;
      
      // Force path to be within ~/writing
      if (!startPath.startsWith(writingPath)) {
        startPath = writingPath;
      }
      
      // Set default filters to only show .txt files
      const defaultFilters = [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ];
      
      // For tokens_words_counter.js, only allow .txt files
      if (currentTool === 'tokens_words_counter.js') {
        // Only use text files filter for this tool
        options.filters = [{ name: 'Text Files', extensions: ['txt', 'md'] }];
      }
      
      const dialogOptions = {
        title: options.title || 'Select File',
        defaultPath: startPath,
        buttonLabel: options.buttonLabel || 'Select',
        filters: options.filters || defaultFilters,
        properties: ['openFile'],
        // Restrict to ~/writing directory
        message: 'Please select a file within your writing projects'
      };
      
      console.log('Dialog options:', dialogOptions);
      
      const result = await dialog.showOpenDialog(
        options.parentWindow || toolSetupRunWindow || mainWindow, 
        dialogOptions
      );
      
      console.log('Dialog result:', result);
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      const selectedPath = result.filePaths[0];
      
      // Verify the selected path is within ~/writing directory
      if (!selectedPath.startsWith(writingPath)) {
        console.warn('Selected file is outside allowed directory:', selectedPath);
        // Could show an error dialog here
        return null;
      }
      
      return selectedPath;
    } catch (error) {
      console.error('Error in file selection:', error);
      throw error;
    }
  });
  
  // Directory selection dialog
  ipcMain.handle('select-directory', async (event, options) => {
    try {
      console.log('Select directory dialog requested with options:', options);
      
      // Ensure base directory is inside ~/writing
      const homePath = os.homedir();
      const writingPath = path.join(homePath, 'writing');
      let startPath = options.defaultPath || appState.DEFAULT_SAVE_DIR || writingPath;
      
      // Force path to be within ~/writing
      if (!startPath.startsWith(writingPath)) {
        startPath = writingPath;
      }
      
      const dialogOptions = {
        title: options.title || 'Select Directory',
        defaultPath: startPath,
        buttonLabel: options.buttonLabel || 'Select',
        properties: ['openDirectory'],
        message: 'Please select a directory within your writing projects'
      };
      
      console.log('Dialog options:', dialogOptions);
      
      const result = await dialog.showOpenDialog(
        options.parentWindow || toolSetupRunWindow || mainWindow, 
        dialogOptions
      );
      
      console.log('Dialog result:', result);
      
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      
      const selectedPath = result.filePaths[0];
      
      // Verify the selected path is within ~/writing directory
      if (!selectedPath.startsWith(writingPath)) {
        console.warn('Selected directory is outside allowed directory:', selectedPath);
        return null;
      }
      
      return selectedPath;
    } catch (error) {
      console.error('Error in directory selection:', error);
      throw error;
    }
  });
  
  // Handle project dialog closing
  ipcMain.on('close-project-dialog', (event, action, data) => {
    console.log('Dialog close action:', action);
    
    if (projectDialogWindow && !projectDialogWindow.isDestroyed()) {
      if (action === 'cancelled') {
        // For Cancel, disable auto-showing and destroy the window
        shouldShowProjectDialog = false;
        projectDialogWindow.destroy();
        projectDialogWindow = null;
      } else {
        // For other actions, just hide the window
        projectDialogWindow.hide();
        
        // If a project was selected or created, notify the main window
        if ((action === 'project-selected' || action === 'project-created') && 
            mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('project-updated', {
            action,
            project: data
          });
        }
      }
    }
  });
}

// Initialize the app state and then create the window
async function main() {
  try {
    // Initialize AppState before using it
    await appState.initialize();
    
    // Set up IPC handlers
    setupIPCHandlers();
    
    // Create the main window
    createWindow();
    
    // Check if a project is selected, if not, show the project dialog
    if (!appState.CURRENT_PROJECT && shouldShowProjectDialog) {
      // Give the main window time to load first
      setTimeout(() => {
        showProjectDialog();
      }, 500);
    }
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
}

// This method will be called when Electron has finished initialization
app.whenReady().then(main);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});