// src/state.js
const path = require('path');
const os = require('os');

// Create a placeholder for Store that will be filled in later
let Store = null;

// Create the AppState class
class AppState {
  constructor() {
    // Application paths
    this.APP_ROOT = path.resolve(path.join(__dirname, '..'));
    
    // File system paths
    this.PROJECTS_DIR = path.join(os.homedir(), 'writing');
    this.DEFAULT_SAVE_DIR = this.PROJECTS_DIR;
    
    // Project tracking
    this.CURRENT_PROJECT = null;
    this.CURRENT_PROJECT_PATH = null;
    
    // Tool selection and execution state
    this.SELECTED_TOOL = null;
    this.IS_RUNNING = false;
    this.OPTION_VALUES = {};
    this.FULL_COMMAND = null;
    
    // Store will be initialized in initialize()
    this.store = null;
    this.initialized = false;
    
    // Default Claude API settings
    this.settings_claude_api_configuration = {
      max_retries: 1,
      request_timeout: 300,
      context_window: 200000,
      thinking_budget_tokens: 32000,
      betas_max_tokens: 128000,
      desired_output_tokens: 12000
    };
  }
  
  // Async initialization method
  async initialize() {
    if (this.initialized) return;
    
    try {
      if (!Store) {
        // Dynamically import electron-store
        const storeModule = await import('electron-store');
        Store = storeModule.default;
      }
      
      // Initialize persistent storage
      this.store = new Store({
        name: 'writers-toolkit-config'
      });
      
      // Load saved settings
      this.loadSettings();
      
      this.initialized = true;
      console.log('AppState initialized successfully');
    } catch (error) {
      console.error('Error initializing AppState:', error);
      throw error;
    }
  }
  
  loadSettings() {
    if (!this.store) {
      console.warn('Store not initialized, cannot load settings');
      return;
    }
    
    // Load settings from electron-store
    const settings = this.store.get('settings', {});
    
    // Apply saved settings if available
    if (settings.current_project) {
      this.CURRENT_PROJECT = settings.current_project;
    }
    
    if (settings.current_project_path) {
      const savedPath = settings.current_project_path;
      if (this.isPathValid(savedPath)) {
        this.CURRENT_PROJECT_PATH = savedPath;
        this.DEFAULT_SAVE_DIR = savedPath;
      }
    }
    
    // Load Claude API settings
    this.settings_claude_api_configuration = 
      this.store.get('claude_api_configuration', {
        max_retries: 1,
        request_timeout: 300,
        context_window: 200000,
        thinking_budget_tokens: 32000,
        betas_max_tokens: 128000,
        desired_output_tokens: 12000
      });
  }
  
  isPathValid(filePath) {
    // Verify path exists and is within PROJECTS_DIR
    try {
      const realPath = path.resolve(filePath);
      const realProjectsDir = path.resolve(this.PROJECTS_DIR);
      return realPath.startsWith(realProjectsDir);
    } catch (error) {
      console.error('Path validation error:', error);
      return false;
    }
  }
  
  // ... other methods to manage state
}

// Create a singleton instance
const appStateInstance = new AppState();

// Export the instance with an initialize method
module.exports = appStateInstance;