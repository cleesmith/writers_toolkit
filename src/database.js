// src/database.js (ESM import fix)
// In Electron 22+, electron-store is an ESM module, 
// so we must use dynamic import.

const path = require('path');
const os = require('os');

let Store = null;

class Database {
  constructor() {
    this.store = null;
    this.isInitialized = false;
  }

  // Called once to initialize the store
  async init() {
    if (!this.isInitialized) {
      // If not already imported, do a dynamic import of electron-store.
      if (!Store) {
        // Dynamic import returns a module namespace, so we need to reference .default
        const storeModule = await import('electron-store');
        Store = storeModule.default;
      }

      this.store = new Store({
        name: 'writers-toolkit-db',
        cwd: path.join(__dirname, '..'),
        defaults: {
          tools: {},
          settings: {
            '1': {
              default_save_dir: path.join(os.homedir(), 'writing'),
              tools_config_json_dir: '.',
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
            }
          }
        }
      });

      this.isInitialized = true;
      console.log(`Database location: ${this.store.path}`);
    }
  }

  // Retrieve all tools (excluding any name starting with underscore)
  getTools() {
    if (!this.isInitialized || !this.store) {
      throw new Error('Store not initialized. Call init() first.');
    }

    const tools = this.store.get('tools', {});
    const toolsList = [];

    // Convert from the object format to an array of tools
    Object.values(tools).forEach(tool => {
      if (tool.name && !tool.name.startsWith('_')) {
        toolsList.push({
          name: tool.name,
          title: tool.title || tool.name,
          description: tool.description || 'No description available'
        });
      }
    });

    return toolsList;
  }

  // Retrieve a specific tool by name
  getToolByName(toolName) {
    if (!this.isInitialized || !this.store) {
      throw new Error('Store not initialized. Call init() first.');
    }

    const tools = this.store.get('tools', {});

    // Search for the matching tool
    for (const toolId in tools) {
      if (tools[toolId].name === toolName) {
        return tools[toolId];
      }
    }

    return null;
  }

  // Example addOrUpdateTool method
  async addOrUpdateTool(tool) {
    if (!this.isInitialized || !this.store) {
      throw new Error('Store not initialized. Call init() first.');
    }

    const tools = this.store.get('tools', {});

    // Find if the tool already exists
    let toolId = null;
    for (const id in tools) {
      if (tools[id].name === tool.name) {
        toolId = id;
        break;
      }
    }

    // If no existing tool, create a new ID
    if (!toolId) {
      const ids = Object.keys(tools).map(id => parseInt(id, 10));
      const maxId = ids.length > 0 ? Math.max(...ids) : 0;
      toolId = (maxId + 1).toString();
    }

    // Update tools object
    tools[toolId] = tool;

    // Save back to store
    this.store.set('tools', tools);
    return true;
  }

  // Example deleteTool method
  async deleteTool(toolName) {
    if (!this.isInitialized || !this.store) {
      throw new Error('Store not initialized. Call init() first.');
    }

    const tools = this.store.get('tools', {});

    // Find the tool ID
    let toolId = null;
    for (const id in tools) {
      if (tools[id].name === toolName) {
        toolId = id;
        break;
      }
    }

    if (toolId) {
      delete tools[toolId];
      this.store.set('tools', tools);
      return true;
    }

    return false;
  }

  // Retrieve global settings from 'settings.1'
  getGlobalSettings() {
    if (!this.isInitialized || !this.store) {
      throw new Error('Store not initialized. Call init() first.');
    }
    return this.store.get('settings.1', {});
  }

  // Update global settings
  async updateGlobalSettings(settings) {
    if (!this.isInitialized || !this.store) {
      throw new Error('Store not initialized. Call init() first.');
    }

    const currentSettings = this.store.get('settings.1', {});
    this.store.set('settings.1', {
      ...currentSettings,
      ...settings
    });
    return true;
  }

  // Return the schema for Claude API settings
  getClaudeApiSettingsSchema() {
    if (!this.isInitialized || !this.store) {
      throw new Error('Store not initialized. Call init() first.');
    }

    return [
      {
        name: 'max_retries',
        label: 'Max Retries',
        type: 'number',
        min: 0,
        max: 5,
        step: 1,
        default: 1,
        required: true,
        description: 'Maximum number of retry attempts if the API call fails.'
      },
      {
        name: 'request_timeout',
        label: 'Request Timeout (seconds)',
        type: 'number',
        min: 30,
        max: 600,
        step: 30,
        default: 300,
        required: true,
        description: 'Maximum time (in seconds) to wait for a response from the API.'
      },
      {
        name: 'context_window',
        label: 'Context Window (tokens)',
        type: 'number',
        min: 50000,
        max: 200000,
        step: 10000,
        default: 200000,
        required: true,
        description: 'Maximum number of tokens for the context window.'
      },
      {
        name: 'thinking_budget_tokens',
        label: 'Thinking Budget (tokens)',
        type: 'number',
        min: 1000,
        max: 100000,
        step: 1000,
        default: 32000,
        required: true,
        description: 'Maximum tokens for model thinking.'
      },
      {
        name: 'betas_max_tokens',
        label: 'Betas Max Tokens',
        type: 'number',
        min: 10000,
        max: 200000,
        step: 1000,
        default: 128000,
        required: true,
        description: 'Maximum tokens for beta features.'
      },
      {
        name: 'desired_output_tokens',
        label: 'Desired Output Tokens',
        type: 'number',
        min: 1000,
        max: 30000,
        step: 1000,
        default: 12000,
        required: true,
        description: 'Target number of tokens for the model\'s output.'
      }
    ];
  }
}

// Export a singleton instance
const databaseInstance = new Database();

module.exports = databaseInstance;
