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
  }
  
  async runTool(toolName, optionValues, logCallback) {
    // Generate unique ID for this tool run
    const runId = uuidv4();
    
    // If we have Python tools, we need to run them with Node.js child_process
    // OR convert them to JavaScript
    
    // For simplicity in this example, we'll assume Python tools
    // In a real implementation, you might convert the tools to JavaScript
    
    // Get the tool path - For Python tools, we'll look in the tools directory
    const toolPath = path.join(appState.APP_ROOT || __dirname, '..', 'tools', toolName);
    
    // Create tracking file for outputs
    const tempDir = app.getPath('temp') || os.tmpdir();
    const trackingFile = path.join(tempDir, `${runId}.txt`);
    
    // Add output tracking to options
    const options = { ...optionValues };
    options['--output_tracking'] = trackingFile;
    
    // Build arguments list
    const args = [];
    
    // Add -u flag for unbuffered output
    args.push('-u');
    
    // Add the script path
    args.push(toolPath);
    
    // Add all the options
    for (const [name, value] of Object.entries(options)) {
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
    const cmdString = `python ${args.join(' ')}`;
    if (logCallback) logCallback(`Running command: ${cmdString}`);
    
    return new Promise((resolve, reject) => {
      // Spawn the process
      const process = spawn('python', args);
      
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
          logCallback(`\nProcess finished with return code ${code}`);
          logCallback('Done!');
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
