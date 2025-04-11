const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Define the restricted directory
const WRITING_DIR = path.join(os.homedir(), 'writing');

// Ensure the writing directory exists
if (!fs.existsSync(WRITING_DIR)) {
  fs.mkdirSync(WRITING_DIR, { recursive: true });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'editor-preload.js')
    },
    title: 'Writer\'s Toolkit - Editor'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'editor', 'index.html'));
  
  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set up the menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('file-new');
          }
        },
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            await openFile();
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: async () => {
            mainWindow.webContents.send('file-save-request');
          }
        },
        {
          label: 'Save As',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => {
            mainWindow.webContents.send('file-save-as-request');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// File opening function
async function openFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    defaultPath: WRITING_DIR,
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (canceled || filePaths.length === 0) return;

  const filePath = filePaths[0];
  
  // Verify file is within the allowed directory
  if (!filePath.startsWith(WRITING_DIR)) {
    dialog.showErrorBox(
      'Access Denied',
      `Files can only be opened from the ${WRITING_DIR} directory.`
    );
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    mainWindow.webContents.send('file-opened', { filePath, content });
  } catch (error) {
    dialog.showErrorBox('Error', `Failed to open file: ${error.message}`);
  }
}

// File saving function
async function saveFile(event, { filePath, content, saveAs = false }) {
  let finalPath = filePath;

  // If no path or saveAs is true, show save dialog
  if (!finalPath || saveAs) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save File',
      defaultPath: WRITING_DIR,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !newPath) return { success: false };
    finalPath = newPath;
  }

  // Verify file is within the allowed directory
  if (!finalPath.startsWith(WRITING_DIR)) {
    dialog.showErrorBox(
      'Access Denied',
      `Files can only be saved to the ${WRITING_DIR} directory.`
    );
    return { success: false };
  }

  try {
    fs.writeFileSync(finalPath, content, 'utf8');
    return { success: true, filePath: finalPath };
  } catch (error) {
    dialog.showErrorBox('Error', `Failed to save file: ${error.message}`);
    return { success: false };
  }
}

// Handle IPC events
function setupIPC() {
  ipcMain.handle('save-file', saveFile);
  
  ipcMain.handle('open-file-dialog', async () => {
    return await openFile();
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  setupIPC();
  
  // Check if a file path was passed as an argument
  const fileArg = process.argv.find(arg => 
    arg.endsWith('.txt') || arg.endsWith('.md')
  );
  
  if (fileArg && fs.existsSync(fileArg)) {
    const filePath = path.resolve(fileArg);
    // Only open if in allowed directory
    if (filePath.startsWith(WRITING_DIR)) {
      const content = fs.readFileSync(filePath, 'utf8');
      mainWindow.webContents.send('file-opened', { filePath, content });
    }
  }
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});