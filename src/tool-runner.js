// src/tool-runner.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { app } = require('electron');
const appState = require('./state');

class ToolRunner {
  constructor() {
    this.runningProcesses = new Map();
    // Store app root directory for relative path resolution
    this.appRoot = path.resolve(path.join(__dirname, '..'));
  }
  
  async runTool(toolName, optionValues, logCallback) {
    // Generate unique ID for this tool run
    const runId = uuidv4();
    
    // Create tracking file for outputs
    const tempDir = app.getPath('temp') || os.tmpdir();
    const trackingFile = path.join(tempDir, `${runId}.txt`);
    
    // Add output tracking to options
    const options = { ...optionValues };
    options['--output_tracking'] = trackingFile;
    
    // Check if the tool is a JavaScript tool
    if (toolName.endsWith('.js')) {
      return this.runJavaScriptTool(toolName, options, trackingFile, runId, logCallback);
    } else {
      if (logCallback) {
        logCallback(`ERROR: Unsupported tool type: ${toolName}`);
        logCallback('Only JavaScript (.js) tools are supported.');
      }
      return Promise.reject(new Error(`Unsupported tool type: ${toolName}`));
    }
  }
  
  async runJavaScriptTool(toolName, optionValues, trackingFile, runId, logCallback) {
    try {
      // Get the tool path - using relative path from app root
      const toolPath = path.join(this.appRoot, 'tools', toolName);
      
      if (!fs.existsSync(toolPath)) {
        if (logCallback) {
          logCallback(`ERROR: Cannot find tool at path: ${toolPath}`);
        }
        return Promise.reject(new Error(`Tool not found: ${toolPath}`));
      }
      
      // Build arguments list for node.js
      const args = [];
      
      // Add the script path
      args.push(toolPath);
      
      // Add all the options
      for (const [name, value] of Object.entries(optionValues)) {
        if (name.startsWith('--')) {
          // This is a flag argument like --verbose
          if (typeof value === 'boolean') {
            if (value) args.push(name);
          } else {
            args.push(name);
            args.push(String(value));
          }
        } else if (name === 'input_file' || name === 'output_file') {
          // For file paths, add them as positional or named arguments
          if (name === 'input_file') {
            args.push(String(value)); // Positional argument
          } else {
            args.push(`--${name}`);
            args.push(String(value));
          }
        } else {
          // Convert to flag format for other options
          args.push(`--${name}`);
          args.push(String(value));
        }
      }
      
      // Log the command
      const cmdString = `node ${args.join(' ')}`;
      if (logCallback) logCallback(`Running command: ${cmdString}`);
      
      return new Promise((resolve, reject) => {
        // Spawn the node process
        const process = spawn('node', args);
        
        // Store reference to the process
        this.runningProcesses.set(runId, process);
        
        let stdout = '';
        let stderr = '';
        
        // Capture stdout
        process.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          if (logCallback) logCallback(text);
        });
        
        // Capture stderr
        process.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          if (logCallback) logCallback(`ERROR: ${text}`);
        });
        
        // Handle process completion
        process.on('close', (code) => {
          this.runningProcesses.delete(runId);
          
          if (logCallback) {
            logCallback(`\nProcess finished with return code ${code}Done!`);
            logCallback(`\nTool finished with exit code: ${code}`);
          }
          
          // Check for output tracking file
          let createdFiles = [];
          if (fs.existsSync(trackingFile)) {
            try {
              const fileContent = fs.readFileSync(trackingFile, 'utf8');
              createdFiles = fileContent.split('\n')
                .filter(line => line.trim())
                .map(line => {
                  const filePath = line.trim();
                  return path.resolve(filePath);
                })
                .filter(filePath => fs.existsSync(filePath));
            } catch (error) {
              if (logCallback) {
                logCallback(`Error reading output files list: ${error.message}`);
              }
            }
          }
          
          resolve({ stdout, stderr, createdFiles, code });
        });
        
        process.on('error', (error) => {
          this.runningProcesses.delete(runId);
          reject(error);
        });
      });
    } catch (error) {
      if (logCallback) {
        logCallback(`Error running JavaScript tool: ${error.message}`);
      }
      return Promise.reject(error);
    }
  }
  
  stopTool(runId) {
    const process = this.runningProcesses.get(runId);
    if (process) {
      process.kill();
      this.runningProcesses.delete(runId);
      return true;
    }
    return false;
  }
}

module.exports = new ToolRunner();