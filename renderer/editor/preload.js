// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Log when preload script executes
console.log('Preload script is running');

// Expose simplified API to renderer
contextBridge.exposeInMainWorld('textEditorAPI', {
  // File operations
  openFile: async () => {
    console.log("Sending openFile request to main process");
    const result = await ipcRenderer.invoke('editor:open-file');
    console.log("Received result from main process:", result);
    return result;
  },
  
  saveFile: async (content) => {
    console.log("Sending saveFile request with content length:", content.length);
    const result = await ipcRenderer.invoke('editor:save-file', content);
    console.log("Received result from main process:", result);
    return result;
  },
  
  // App operations
  quitApp: async () => {
    console.log("Sending quitApp request to main process");
    return await ipcRenderer.invoke('editor:quit-app');
  }
});

// Log APIs that were exposed
console.log('APIs exposed:', Object.keys(contextBridge.getExposedAPIs()));
