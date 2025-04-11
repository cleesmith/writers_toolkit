// main.js
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      // Use a preload script to expose safe APIs.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// IPC handler to open a file and read its contents.
ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Text Files', extensions: ['txt', 'js', 'md'] }
    ]
  });
  if (canceled || filePaths.length === 0) return { canceled: true };
  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return { canceled: false, filePath: filePaths[0], content };
  } catch (err) {
    console.error(err);
    return { canceled: true };
  }
});

// IPC handler to save file.
ipcMain.handle('file:save', async (event, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [
      { name: 'Text Files', extensions: ['txt', 'js', 'md'] }
    ]
  });
  if (canceled || !filePath) return { canceled: true };
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { canceled: false, filePath };
  } catch (err) {
    console.error(err);
    return { canceled: true };
  }
});

// IPC handler to quit the app.
ipcMain.handle('app:quit', () => {
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
