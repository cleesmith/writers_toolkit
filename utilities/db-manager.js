const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

(async () => {
  // Dynamically import the electron-store module (ESM)
  const { default: Store } = await import('electron-store');

  // Create the store instance
  const store = new Store({
    name: 'writers-toolkit-db',
    cwd: __dirname // Store in the same directory as this script
  });

  // Global reference to the window object
  let mainWindow = null;

  // Function to create the browser window
  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'db-manager-preload.js')
      },
      title: "Writer's Toolkit Database Manager",
      backgroundColor: '#121212'
    });

    // Load the HTML file
    mainWindow.loadFile(path.join(__dirname, 'db-manager.html'));

    // When the window is closed, clear the reference to avoid memory leaks
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // Set up IPC handlers for database operations
  function setupIPCHandlers() {
    // Handler: Get all tools
    ipcMain.handle('get-tools', async () => {
      try {
        const tools = store.get('tools', {});
        const toolsList = [];

        // Convert the tools object into an array of tools
        Object.entries(tools).forEach(([id, tool]) => {
          if (tool.name) {
            toolsList.push({
              id,
              name: tool.name,
              title: tool.title || tool.name,
              description: tool.description || "No description available"
            });
          }
        });
        return { success: true, tools: toolsList };
      } catch (error) {
        console.error('Error getting tools:', error);
        return { success: false, message: error.message };
      }
    });

    // Handler: Get a specific tool by ID
    ipcMain.handle('get-tool', async (event, id) => {
      try {
        const tools = store.get('tools', {});
        if (!tools[id]) {
          return { success: false, message: 'Tool not found' };
        }
        return { success: true, tool: tools[id] };
      } catch (error) {
        console.error('Error getting tool:', error);
        return { success: false, message: error.message };
      }
    });

    // Handler: Add a new tool
    ipcMain.handle('add-tool', async (event, tool) => {
      try {
        const tools = store.get('tools', {});
        const ids = Object.keys(tools).map(id => parseInt(id, 10));
        const newId = (ids.length > 0 ? Math.max(...ids) + 1 : 1).toString();
        tools[newId] = tool;
        store.set('tools', tools);
        return { success: true, id: newId, tool };
      } catch (error) {
        console.error('Error adding tool:', error);
        return { success: false, message: error.message };
      }
    });

    // Handler: Update an existing tool
    ipcMain.handle('update-tool', async (event, id, tool) => {
      try {
        const tools = store.get('tools', {});
        if (!tools[id]) {
          return { success: false, message: 'Tool not found' };
        }
        tools[id] = tool;
        store.set('tools', tools);
        return { success: true, tool };
      } catch (error) {
        console.error('Error updating tool:', error);
        return { success: false, message: error.message };
      }
    });

    // Handler: Delete a tool
    ipcMain.handle('delete-tool', async (event, id) => {
      try {
        const tools = store.get('tools', {});
        if (!tools[id]) {
          return { success: false, message: 'Tool not found' };
        }
        delete tools[id];
        store.set('tools', tools);
        return { success: true };
      } catch (error) {
        console.error('Error deleting tool:', error);
        return { success: false, message: error.message };
      }
    });

    // Handler: Get settings
    ipcMain.handle('get-settings', async () => {
      try {
        const settings = store.get('settings.1', {});
        return { success: true, settings };
      } catch (error) {
        console.error('Error getting settings:', error);
        return { success: false, message: error.message };
      }
    });

    // Handler: Update settings
    ipcMain.handle('update-settings', async (event, settings) => {
      try {
        const currentSettings = store.get('settings.1', {});

        // Default settings to merge with
        const defaultSettings = {
          default_save_dir: path.join(require('os').homedir(), 'writing'),
          tools_config_json_dir: ".",
          current_project: null,
          current_project_path: null,
          claude_api_configuration: {
            max_retries: 1,
            request_timeout: 300,
            context_window: 200000,
            thinking_budget_tokens: 32000,
            betas_max_tokens: 128000,
            desired_output_tokens: 12000
          }
        };

        const updatedSettings = {
          ...defaultSettings,
          ...currentSettings,
          ...settings
        };

        store.set('settings.1', updatedSettings);
        return { success: true, settings: updatedSettings };
      } catch (error) {
        console.error('Error updating settings:', error);
        return { success: false, message: error.message };
      }
    });

    // Handler: Select a directory
    ipcMain.handle('select-directory', async () => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory']
        });
        if (result.canceled) {
          return { success: true, canceled: true };
        }
        return { success: true, path: result.filePaths[0], canceled: false };
      } catch (error) {
        console.error('Error selecting directory:', error);
        return { success: false, message: error.message };
      }
    });
  }

  // Register IPC handlers immediately so they’re ready before any renderer calls
  setupIPCHandlers();

  // Create the window once Electron is ready
  app.whenReady().then(createWindow);

  // Quit when all windows are closed (except on macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // On macOS, re-create a window when the app icon is clicked and no other windows are open
  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
})();
