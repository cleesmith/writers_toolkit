const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Quit application
  quitApp: () => ipcRenderer.send('app-quit'),
  
  // Project management
  getProjects: () => ipcRenderer.invoke('get-projects'),
  getProjectInfo: () => ipcRenderer.invoke('get-project-info'),
  selectProject: () => ipcRenderer.send('show-project-dialog'),
  openProject: (projectName) => ipcRenderer.invoke('open-project', projectName),
  createProject: (projectName) => ipcRenderer.invoke('create-project', projectName),
  closeDialog: (action, data) => ipcRenderer.send('close-project-dialog', action, data),
  onProjectUpdated: (callback) => ipcRenderer.on('project-updated', (_, data) => callback(data)),
  // Launch the text editor
  launchEditor: () => ipcRenderer.invoke('launch-editor'),
  
  // General file handling
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  selectDirectory: (options) => ipcRenderer.invoke('select-directory', options),
  
  // Tool management
  getTools: () => ipcRenderer.invoke('get-tools'),
  getToolOptions: (toolName) => ipcRenderer.invoke('get-tool-options', toolName),
  showToolSetupDialog: (toolName) => ipcRenderer.send('show-tool-setup-dialog', toolName),
  closeToolDialog: (action, data) => ipcRenderer.send('close-tool-dialog', action, data),
  getCurrentTool: () => ipcRenderer.invoke('get-current-tool'),
  startToolRun: (toolName, options) => ipcRenderer.invoke('start-tool-run', toolName, options),
  stopTool: (runId) => ipcRenderer.invoke('stop-tool', runId),
  setToolOptions: (options) => ipcRenderer.invoke('set-tool-options', options),
  onToolOutput: (callback) => ipcRenderer.on('tool-output', (_, data) => callback(data)),
  onToolFinished: (callback) => ipcRenderer.on('tool-finished', (_, data) => callback(data)),
  onToolError: (callback) => ipcRenderer.on('tool-error', (_, data) => callback(data)),
  removeAllListeners: (channel) => {
    if (channel === 'tool-output') ipcRenderer.removeAllListeners('tool-output');
    if (channel === 'tool-finished') ipcRenderer.removeAllListeners('tool-finished');
    if (channel === 'tool-error') ipcRenderer.removeAllListeners('tool-error');
  },
  
  // API settings
  getClaudeApiSettings: () => ipcRenderer.invoke('get-claude-api-settings'),
  saveClaudeApiSettings: (settings) => ipcRenderer.invoke('save-claude-api-settings', settings),
  showApiSettingsDialog: () => ipcRenderer.send('show-api-settings-dialog'),
  closeApiSettingsDialog: (action, data) => ipcRenderer.send('close-api-settings-dialog', action, data),
  onApiSettingsUpdated: (callback) => ipcRenderer.on('api-settings-updated', (_, data) => callback(data)),
  
  onSetTheme: (callback) => ipcRenderer.on('set-theme', (_, theme) => callback(theme)),
});