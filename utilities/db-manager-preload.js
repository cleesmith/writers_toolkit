// db-manager-preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('dbAPI', {
  // Tool operations
  getTools: () => ipcRenderer.invoke('get-tools'),
  getTool: (id) => ipcRenderer.invoke('get-tool', id),
  addTool: (tool) => ipcRenderer.invoke('add-tool', tool),
  updateTool: (id, tool) => ipcRenderer.invoke('update-tool', id, tool),
  deleteTool: (id) => ipcRenderer.invoke('delete-tool', id),
  
  // Settings operations
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
});
