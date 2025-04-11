// main.js
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Define writing directory
const WRITING_DIR = path.join(os.homedir(), 'writing');
if (!fs.existsSync(WRITING_DIR)) {
  fs.mkdirSync(WRITING_DIR, { recursive: true });
  console.log(`Created writing directory: ${WRITING_DIR}`);
}

// Store window reference
let mainWindow;

function createWindow() {
  console.log('Creating main window');
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Text Editor'
  });
  
  // Load HTML file
  mainWindow.loadFile('index.html');
  
  // Open DevTools
  mainWindow.webContents.openDevTools();
  
  console.log('Main window created');
}

// Set up IPC handlers
function setupIPC() {
  console.log('Setting up IPC handlers');
  
  // Open file handler
  ipcMain.handle('editor:open-file', async () => {
    console.log('Handling editor:open-file request');
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Text File',
        defaultPath: WRITING_DIR,
        filters: [
          { name: 'Text Files', extensions: ['txt'] }
        ],
        properties: ['openFile']
      });
      
      console.log('Dialog result:', result);
      
      // If dialog was canceled
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }
      
      // Get selected file path
      const filePath = result.filePaths[0];
      console.log('Selected file path:', filePath);
      
      // Read file content
      const content = fs.readFileSync(filePath, 'utf8');
      console.log('File content read, length:', content.length);
      
      // Return both file path and content
      return { 
        canceled: false, 
        filePath: filePath, 
        content: content 
      };
    } catch (error) {
      console.error('Error in open file handler:', error);
      return { 
        canceled: true, 
        error: error.message 
      };
    }
  });
  
  // Save file handler
  ipcMain.handle('editor:save-file', async (event, content) => {
    console.log('Handling editor:save-file request');
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Text File',
        defaultPath: WRITING_DIR,
        filters: [
          { name: 'Text Files', extensions: ['txt'] }
        ]
      });
      
      console.log('Save dialog result:', result);
      
      // If dialog was canceled
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      
      // Get selected file path
      const filePath = result.filePath;
      console.log('Selected save path:', filePath);
      
      // Ensure file has .txt extension
      let finalPath = filePath;
      if (!finalPath.toLowerCase().endsWith('.txt')) {
        finalPath += '.txt';
      }
      
      // Write content to file
      fs.writeFileSync(finalPath, content, 'utf8');
      console.log('File saved successfully');
      
      return { 
        canceled: false, 
        filePath: finalPath 
      };
    } catch (error) {
      console.error('Error in save file handler:', error);
      return { 
        canceled: true, 
        error: error.message 
      };
    }
  });
  
  // Quit app handler
  ipcMain.handle('editor:quit-app', () => {
    console.log('Handling editor:quit-app request');
    app.quit();
    return { success: true };
  });
  
  console.log('IPC handlers registered');
}

// App lifecycle events
app.whenReady().then(() => {
  console.log('App is ready');
  createWindow();
  setupIPC();
});

app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});