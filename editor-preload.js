const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // File operations
    saveFile: (data) => ipcRenderer.invoke('save-file', data),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    
    // Event listeners
    onFileNew: (callback) => ipcRenderer.on('file-new', () => callback()),
    onFileSaveRequest: (callback) => ipcRenderer.on('file-save-request', () => callback()),
    onFileSaveAsRequest: (callback) => ipcRenderer.on('file-save-as-request', () => callback()),
    onFileOpened: (callback) => ipcRenderer.on('file-opened', (_, data) => callback(data))
  }
);