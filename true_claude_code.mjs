#!/usr/bin/env node

/**
 * true_claude_code.mjs - Code analysis and modification tool for Node.js/Electron applications
 * 
 * This tool helps analyze and modify Node.js and Electron applications by:
 * - Fixing specific errors or bugs
 * - Implementing new features
 * - Analyzing entire codebases
 * 
 * It uses the Anthropic Claude API with beta features like thinking mode
 * to provide comprehensive code analysis and targeted modifications.
 * 
 * Usage examples:
 *   Single file:
 *     node true_claude_code.mjs --file main.js --problem "Uncaught TypeError in line 45"
 *   
 *   Directory:
 *     node true_claude_code.mjs --directory . --feature "Add dark mode toggle to settings"
 *   
 *   With screenshot:
 *     node true_claude_code.mjs --file main.js --problem "Fix this error" --screenshot error.png
 *   
 *   Preview mode (no API call):
 *     node true_claude_code.mjs --directory . --feature "Add dark mode toggle" --preview
 * 
 * Requires: @anthropic-ai/sdk, argparse
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { ArgumentParser } from 'argparse';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parses command-line arguments for code analysis and modification
 * @returns {Object} Parsed command-line arguments
 */
function parseArguments() {
    const parser = new ArgumentParser({
        description: 'Analyze and modify Node.js/Electron code using Claude API.',
        epilog: `
Example usages:
  node true_claude_code.mjs --file main.js --problem "Uncaught TypeError in renderer process"
  node true_claude_code.mjs --directory . --feature "Add dark mode toggle to settings"
  node true_claude_code.mjs --file main.js --problem "Fix this error" --screenshot error.png
  node true_claude_code.mjs --directory . --feature "Add dark mode toggle" --preview
        `
    });

    // Input Source Arguments (file or directory)
    const sourceGroup = parser.add_mutually_exclusive_group({ required: true });
    
    sourceGroup.add_argument('--file', {
        type: 'str',
        help: "Path to single code file to analyze or modify"
    });
    
    sourceGroup.add_argument('--directory', {
        type: 'str',
        help: "Path to directory containing code to analyze or modify"
    });

    // Task Arguments (problem or feature)
    const taskGroup = parser.add_mutually_exclusive_group({ required: true });
    
    taskGroup.add_argument('--problem', {
        type: 'str',
        help: "Description of the error or issue to fix (provide error message or behavior)"
    });
    
    taskGroup.add_argument('--feature', {
        type: 'str',
        help: "Description of the new feature to implement"
    });

    // Screenshot Arguments
    parser.add_argument('--screenshot', {
        type: 'str',
        help: "Path to screenshot image (.png) showing the issue or desired feature"
    });

    parser.add_argument('--screenshots', {
        type: 'str',
        help: "Comma-separated list of paths to screenshot images (.png) showing the issue or desired feature"
    });

    // Output Arguments
    parser.add_argument('--output_file', {
        type: 'str',
        help: "File to write the modified code to (for single file mode only)"
    });

    parser.add_argument('--env_info', {
        type: 'str',
        default: '',
        help: "Environment information string (Node.js, Electron, npm versions, etc.)"
    });

    // File Selection Arguments (for directory mode)
    parser.add_argument('--include', {
        type: 'str',
        default: ".js,.html,.css,.json",
        help: "Comma-separated list of file extensions to include (default: .js,.html,.css,.json)"
    });

    parser.add_argument('--exclude', {
        type: 'str',
        default: "node_modules,dist,.git,package-lock.json",
        help: "Comma-separated list of directories/files to exclude (default: node_modules,dist,.git,package-lock.json)"
    });

    parser.add_argument('--ignore_gitignore', {
        action: 'store_true',
        help: "Don't use .gitignore patterns to exclude files (default: false)"
    });

    // Preview Mode - Allows checking what would be sent to API without actually sending
    parser.add_argument('--preview', {
        action: 'store_true',
        help: "Preview mode: prepare prompt and count tokens but don't call API (except free token counting)"
    });

    // API Configuration Arguments
    parser.add_argument('--request_timeout', {
        type: 'int',
        default: 300,
        help: 'Maximum timeout for each *streamed chunk* of output (default: 300 seconds)'
    });
    
    parser.add_argument('--max_retries', {
        type: 'int',
        default: 0,
        help: 'Maximum times to retry request, may get expensive if too many'
    });
    
    parser.add_argument('--context_window', {
        type: 'int',
        default: 200000,
        help: 'Context window for Claude 3.7 Sonnet (default: 200000)'
    });
    
    parser.add_argument('--betas_max_tokens', {
        type: 'int',
        default: 128000,
        help: 'Maximum tokens for AI output (default: 128000)'
    });
    
    parser.add_argument('--thinking_budget_tokens', {
        type: 'int',
        default: 32000,
        help: 'Maximum tokens for AI thinking (default: 32000)'
    });
    
    parser.add_argument('--desired_output_tokens', {
        type: 'int',
        default: 96000, // changed from 8000
        help: 'User desired number of tokens to generate before stopping output (max 96000)'
    });    

    parser.add_argument('--show_token_stats', {
        action: 'store_true',
        help: 'Show tokens stats but do not call API (default: False)'
    });

    // Output Configuration Arguments
    parser.add_argument('--save_dir', {
        type: 'str',
        default: ".",
        help: 'Directory to save output files (default: current directory)'
    });

    return parser.parse_args();
}

/**
 * Count words in a text string
 * @param {string} text - Text to count words in
 * @returns {number} Number of words
 */
function countWords(text) {
    return text.replace(/(\r\n|\r|\n)/g, ' ').split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if file exists
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Read a single code file with error handling
 * @param {string} filePath - Path to the code file
 * @returns {Promise<string>} File content
 */
async function readFile(filePath) {
    try {
        const absolutePath = path.resolve(filePath);
        if (!await fileExists(absolutePath)) {
            console.error(`Error: File '${filePath}' not found.`);
            process.exit(1);
        }
        
        const content = await fs.readFile(absolutePath, 'utf-8');
        return content.trim();
    } catch (error) {
        console.error(`Error reading file '${filePath}': ${error.message}`);
        process.exit(1);
    }
}

/**
 * Read and encode a screenshot file as base64
 * @param {string} filePath - Path to the screenshot file
 * @returns {Promise<string>} Base64-encoded image data
 */
async function readScreenshot(filePath) {
    try {
        const absolutePath = path.resolve(filePath);
        if (!await fileExists(absolutePath)) {
            console.error(`Error: Screenshot file '${filePath}' not found.`);
            process.exit(1);
        }
        
        // Check if it's a PNG file
        if (!filePath.toLowerCase().endsWith('.png')) {
            console.warn(`Warning: Screenshot '${filePath}' is not a PNG file. Results may vary.`);
        }
        
        const imageBuffer = await fs.readFile(absolutePath);
        return imageBuffer.toString('base64');
    } catch (error) {
        console.error(`Error reading screenshot '${filePath}': ${error.message}`);
        process.exit(1);
    }
}

/**
 * Parse .gitignore file into an array of patterns
 * @param {string} gitignorePath - Path to .gitignore file
 * @returns {Promise<string[]>} Array of gitignore patterns
 */
async function parseGitignore(gitignorePath) {
    try {
        if (!await fileExists(gitignorePath)) {
            return [];
        }
        
        const content = await fs.readFile(gitignorePath, 'utf-8');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch (error) {
        console.warn(`Warning: Error reading .gitignore file: ${error.message}`);
        return [];
    }
}

/**
 * Check if a file should be ignored based on gitignore patterns
 * @param {string} filePath - Relative file path to check
 * @param {string[]} patterns - Array of gitignore patterns
 * @returns {boolean} True if file should be ignored
 */
function isIgnoredByGitignore(filePath, patterns) {
    if (!patterns || patterns.length === 0) {
        return false;
    }
    
    for (const pattern of patterns) {
        // Simple implementation of gitignore pattern matching
        // This is not a complete implementation but covers basic patterns
        
        // Exact match
        if (pattern === filePath) {
            return true;
        }
        
        // Directory pattern (ends with /)
        if (pattern.endsWith('/') && filePath.startsWith(pattern)) {
            return true;
        }
        
        // File pattern with wildcard (e.g. *.log)
        if (pattern.startsWith('*.')){
            const extension = pattern.substring(1);
            if (filePath.endsWith(extension)) {
                return true;
            }
        }
        
        // Simple path pattern
        if (filePath.startsWith(pattern) || filePath.indexOf('/' + pattern) !== -1) {
            return true;
        }
    }
    
    return false;
}

/**
 * Read all files in a directory with filtering
 * @param {string} dirPath - Directory path
 * @param {string} includeExt - Comma-separated list of extensions to include
 * @param {string} excludePaths - Comma-separated list of paths to exclude
 * @param {boolean} useGitignore - Whether to respect .gitignore patterns
 * @returns {Promise<Map<string, string>>} Map of relative file paths to file contents
 */
async function readDirectory(dirPath, includeExt, excludePaths, useGitignore) {
    const fileMap = new Map();
    const includeExtensions = includeExt.split(',');
    const excludePatterns = excludePaths.split(',');
    
    // Parse .gitignore if needed
    let gitignorePatterns = [];
    if (useGitignore) {
        const gitignorePath = path.join(dirPath, '.gitignore');
        gitignorePatterns = await parseGitignore(gitignorePath);
        
        if (gitignorePatterns.length > 0) {
            console.log(`Loaded ${gitignorePatterns.length} patterns from .gitignore`);
        }
    }
    
    async function processDirectory(dir, relativeDir = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.join(relativeDir, entry.name);
            
            // Skip excluded paths
            let shouldExclude = false;
            for (const pattern of excludePatterns) {
                if (relativePath === pattern || relativePath.startsWith(pattern + path.sep)) {
                    shouldExclude = true;
                    break;
                }
            }
            
            // Check gitignore patterns
            if (!shouldExclude && useGitignore && isIgnoredByGitignore(relativePath, gitignorePatterns)) {
                shouldExclude = true;
            }
            
            if (shouldExclude) {
                continue;
            }
            
            if (entry.isDirectory()) {
                await processDirectory(fullPath, relativePath);
            } else if (entry.isFile()) {
                // Only include files with specified extensions
                const ext = path.extname(entry.name);
                if (includeExtensions.includes(ext) || includeExtensions.includes('*')) {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        fileMap.set(relativePath, content);
                    } catch (error) {
                        console.error(`Error reading file '${fullPath}': ${error.message}`);
                    }
                }
            }
        }
    }
    
    await processDirectory(dirPath);
    return fileMap;
}

/**
 * Save output to a file
 * @param {string} filename - Path to save file
 * @param {string} content - Content to save
 */
async function saveOutput(filename, content) {
    try {
        const dirname = path.dirname(filename);
        await fs.mkdir(dirname, { recursive: true });
        await fs.writeFile(filename, content, 'utf-8');
        console.log(`Saved output to: ${filename}`);
    } catch (error) {
        console.error(`Error saving to '${filename}': ${error.message}`);
    }
}

/**
 * Calculate maximum tokens for API call
 * @param {Anthropic} client - Anthropic API client
 * @param {string} prompt - Prompt text
 * @param {Object} args - Command-line arguments
 * @returns {Promise<Object>} Token calculations
 */
async function calculateMaxTokens(client, prompt, args) {
    try {
        const response = await client.beta.messages.countTokens({
            model: "claude-3-7-sonnet-20250219",
            thinking: {
                type: "enabled",
                budget_tokens: args.thinking_budget_tokens
            },
            messages: [{ role: "user", content: prompt }],
            betas: ["output-128k-2025-02-19"]
        });

        // Calculate available tokens after prompt
        const promptTokens = response.input_tokens;
        const availableTokens = args.context_window - promptTokens;
        
        // Check if we have enough room for both thinking and desired output
        const requiredTokens = args.thinking_budget_tokens + args.desired_output_tokens;
        
        if (availableTokens < requiredTokens) {
            console.warn(`Warning: Not enough available tokens (${availableTokens}) for both thinking (${args.thinking_budget_tokens}) and desired output (${args.desired_output_tokens})`);
            console.warn(`Total required: ${requiredTokens}, Available: ${availableTokens}`);
            
            // Decide whether to adjust thinking budget or desired output
            // For now, we'll maintain thinking budget and reduce desired output
            const adjustedOutputTokens = Math.max(availableTokens - args.thinking_budget_tokens, 1000);
            console.warn(`Adjusting desired output tokens from ${args.desired_output_tokens} to ${adjustedOutputTokens}`);
            
            // Set max_tokens to accommodate both thinking and adjusted output
            const maxTokens = args.thinking_budget_tokens + adjustedOutputTokens;
            const thinkingBudget = args.thinking_budget_tokens;
            
            return { maxTokens, promptTokens, availableTokens, thinkingBudget, adjustedOutputTokens };
        }
        
        // Calculate the maximum possible output tokens
        const maxOutputTokens = Math.min(
            availableTokens - args.thinking_budget_tokens,  // What's left after thinking
            args.betas_max_tokens  // Beta feature ceiling (128K)
        );
        
        // Set max_tokens to accommodate both thinking and output
        const maxTokens = args.thinking_budget_tokens + maxOutputTokens;
        
        return {
            maxTokens,
            promptTokens,
            availableTokens,
            thinkingBudget: args.thinking_budget_tokens,
            maxOutputTokens
        };
    } catch (error) {
        console.error(`Error: client.beta.messages.countTokens: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Create a prompt for single file analysis
 * @param {string} codeContent - Content of the code file
 * @param {string} problem - Problem description
 * @param {string} feature - Feature description
 * @param {string} envInfo - Environment information
 * @param {Object|null} screenshots - Object with screenshot data
 * @returns {Array} Formatted message content for API
 */
function createSingleFilePrompt(codeContent, problem, feature, envInfo, screenshots) {
    let task = problem ? `PROBLEM TO FIX: ${problem}` : `NEW FEATURE TO IMPLEMENT: ${feature}`;
    
    let messageContent = [];
    
    // Add environment info if provided
    if (envInfo) {
        messageContent.push({
            type: "text",
            text: `=== ENVIRONMENT INFO ===\n${envInfo}\n=== END ENVIRONMENT INFO ===\n\n`
        });
    }
    
    // Add original code
    messageContent.push({
        type: "text",
        text: `=== ORIGINAL CODE ===\n${codeContent}\n=== END ORIGINAL CODE ===\n\n${task}\n\n`
    });

    // Add screenshots if provided
    if (screenshots && Object.keys(screenshots).length > 0) {
        Object.entries(screenshots).forEach(([name, data]) => {
            messageContent.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: "image/png",
                    data: data
                }
            });
            
            messageContent.push({
                type: "text",
                text: `Above is a screenshot (${name}) showing the issue or desired feature.\n\n`
            });
        });
    }
    
    // Add instructions
    messageContent.push({
        type: "text",
        text: `Provide the following in your response:

1. ANALYSIS:
   - Brief explanation of the problem's cause or how the new feature should be implemented
   - Any technical considerations to be aware of

2. MODIFIED CODE:
   - Complete rewritten version of the file with your changes
   - Include ALL necessary imports and code
   - Start with "MODIFIED CODE:" and then include the full code

3. EXPLANATION:
   - Explain the key changes made
   - How these changes fix the problem or implement the feature
   - Any potential edge cases or considerations for future development

IMPORTANT INSTRUCTIONS:
1. Focus only on addressing the specific problem or implementing the requested feature
2. Don't make unrelated "improvements" or optimizations unless absolutely necessary
3. Maintain compatibility with existing code structure and paradigms
4. Include appropriate error handling for new code
5. Add clear comments explaining the changes or new functionality
`
    });
    
    return messageContent;
}

/**
 * Create a prompt for multi-file analysis
 * @param {Map<string, string>} fileMap - Map of file paths to contents
 * @param {string} problem - Problem description
 * @param {string} feature - Feature description
 * @param {string} envInfo - Environment information
 * @param {Object|null} screenshots - Object with screenshot data
 * @returns {Array} Formatted message content for API
 */
function createMultiFilePrompt(fileMap, problem, feature, envInfo, screenshots) {
    // Create a directory listing for the project structure
    const fileList = Array.from(fileMap.keys()).join('\n');
    let task = problem ? `PROBLEM TO FIX: ${problem}` : `NEW FEATURE TO IMPLEMENT: ${feature}`;
    
    let messageContent = [];
    
    // Add environment info if provided
    if (envInfo) {
        messageContent.push({
            type: "text",
            text: `=== ENVIRONMENT INFO ===\n${envInfo}\n=== END ENVIRONMENT INFO ===\n\n`
        });
    }
    
    // Add project structure
    messageContent.push({
        type: "text",
        text: `=== PROJECT STRUCTURE ===\n${fileList}\n=== END PROJECT STRUCTURE ===\n\n`
    });
    
    // Add each file with its content
    for (const [filePath, content] of fileMap.entries()) {
        messageContent.push({
            type: "text",
            text: `=== FILE: ${filePath} ===\n${content}\n=== END FILE: ${filePath} ===\n\n`
        });
    }
    
    // Add task description
    messageContent.push({
        type: "text",
        text: `${task}\n\n`
    });
    
    // Add screenshots if provided
    if (screenshots && Object.keys(screenshots).length > 0) {
        Object.entries(screenshots).forEach(([name, data]) => {
            messageContent.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: "image/png",
                    data: data
                }
            });
            
            messageContent.push({
                type: "text",
                text: `Above is a screenshot (${name}) showing the issue or desired feature.\n\n`
            });
        });
    }
    
    // Add instructions
    messageContent.push({
        type: "text",
        text: `Please format your response as follows:

1. ANALYSIS:
   - Brief explanation of the problem's cause or how the new feature should be implemented
   - Any technical considerations to be aware of

2. MODIFIED FILES:
   - Only include files that need changes
   - Use the exact format below for each file

=== MODIFIED FILE: [relative/path/to/file.js] ===
[modified code with fixes or new feature implementation]
=== END MODIFIED FILE: [relative/path/to/file.js] ===

3. EXPLANATION:
   - Step-by-step explanation of the changes made
   - How these changes fix the problem or implement the feature
   - Any potential edge cases or considerations for future development

IMPORTANT INSTRUCTIONS:
1. Focus only on addressing the specific problem or implementing the requested feature
2. Don't make unrelated "improvements" or optimizations unless absolutely necessary
3. Maintain compatibility with existing code structure and paradigms
4. Include appropriate error handling for new code
5. Add clear comments explaining the changes or new functionality
6. Preserve file paths exactly as they appear in the project structure
`
    });
    
    return messageContent;
}

/**
 * Generate complete prompt text from message content array
 * @param {Array} messageContent - Array of message content items
 * @returns {string} Complete prompt text for token calculation
 */
function generateCompletePrompt(messageContent) {
    let promptText = '';
    
    for (const item of messageContent) {
        if (item.type === 'text') {
            promptText += item.text;
        } else if (item.type === 'image') {
            promptText += '[IMAGE PLACEHOLDER]\n';
        }
    }
    
    return promptText;
}

/**
 * Extract modified code from single file response
 * @param {string} fullResponse - Complete API response
 * @returns {string|null} Extracted modified code or null if not found
 */
function extractSingleFileCode(fullResponse) {
    const modifiedCodeMatch = fullResponse.match(/MODIFIED CODE:(.*?)(?:EXPLANATION:|$)/s);
    if (modifiedCodeMatch) {
        let modifiedCode = modifiedCodeMatch[1].trim();
        // Remove any markdown code block formatting
        modifiedCode = modifiedCode.replace(/^```(javascript|js)?\s*/m, '');
        modifiedCode = modifiedCode.replace(/^```\s*$/m, '');
        return modifiedCode;
    }
    return null;
}

/**
 * Extract and save modified files from multi-file response
 * @param {string} baseDir - Base directory for relative paths
 * @param {string} fullResponse - Complete API response
 * @returns {Promise<string[]>} Array of modified file paths
 */
async function extractAndSaveModifiedFiles(baseDir, fullResponse) {
    // Use regex to find all modified file blocks
    const filePattern = /=== MODIFIED FILE: (.*?) ===\s*([\s\S]*?)\s*=== END MODIFIED FILE: .*? ===/g;
    let match;
    const modifiedFiles = [];
    
    while ((match = filePattern.exec(fullResponse)) !== null) {
        const [_, relativePath, modifiedCode] = match;
        const fullPath = path.join(baseDir, relativePath);
        const dirPath = path.dirname(fullPath);
        
        // Create directory if it doesn't exist (for new files)
        await fs.mkdir(dirPath, { recursive: true });
        
        // Create backup of original file if it exists
        try {
            const originalExists = await fileExists(fullPath);
            if (originalExists) {
                const backupPath = `${fullPath}.backup`;
                await fs.copyFile(fullPath, backupPath);
                console.log(`Backup created at: ${backupPath}`);
            }
        } catch (error) {
            console.error(`Error creating backup for ${fullPath}: ${error.message}`);
        }
        
        // Save the modified file
        await fs.writeFile(fullPath, modifiedCode, 'utf-8');
        modifiedFiles.push(relativePath);
        console.log(`Saved modified file to: ${fullPath}`);
    }
    
    return modifiedFiles;
}

/**
 * Process the screenshot arguments and read the files
 * @param {Object} args - Command-line arguments
 * @returns {Promise<Object|null>} Object with screenshot data or null if none provided
 */
async function processScreenshots(args) {
    const screenshots = {};
    
    // Process single screenshot
    if (args.screenshot) {
        try {
            const data = await readScreenshot(args.screenshot);
            screenshots[path.basename(args.screenshot)] = data;
            console.log(`Loaded screenshot: ${args.screenshot}`);
        } catch (error) {
            console.error(`Error processing screenshot: ${error.message}`);
        }
    }
    
    // Process multiple screenshots
    if (args.screenshots) {
        const screenshotPaths = args.screenshots.split(',');
        for (const screenshotPath of screenshotPaths) {
            try {
                const data = await readScreenshot(screenshotPath.trim());
                screenshots[path.basename(screenshotPath.trim())] = data;
                console.log(`Loaded screenshot: ${screenshotPath.trim()}`);
            } catch (error) {
                console.error(`Error processing screenshot: ${error.message}`);
            }
        }
    }
    
    return Object.keys(screenshots).length > 0 ? screenshots : null;
}

/**
 * Process single file or directory using Anthropic API
 * @param {Anthropic} client - Anthropic API client
 * @param {Object} args - Command-line arguments
 * @returns {Promise<string>} Path to results file
 */
async function processCode(client, args) {
    let messageContent;
    let promptText;
    let fileMap;
    
    // Process screenshots if provided
    const screenshots = await processScreenshots(args);
    
    // Determine mode (single file or directory)
    const isSingleFile = !!args.file;
    
    // Generate appropriate prompt based on mode
    if (isSingleFile) {
        const codeContent = await readFile(args.file);
        messageContent = createSingleFilePrompt(
            codeContent, 
            args.problem || '', 
            args.feature || '', 
            args.env_info || '',
            screenshots
        );
        promptText = generateCompletePrompt(messageContent);
    } else {
        fileMap = await readDirectory(
            args.directory, 
            args.include, 
            args.exclude, 
            !args.ignore_gitignore
        );
        
        if (fileMap.size === 0) {
            console.error(`Error: No files found in directory '${args.directory}' matching the include/exclude filters.`);
            process.exit(1);
        }
        
        console.log(`Loaded ${fileMap.size} files from directory: ${args.directory}`);
        messageContent = createMultiFilePrompt(
            fileMap, 
            args.problem || '', 
            args.feature || '', 
            args.env_info || '',
            screenshots
        );
        promptText = generateCompletePrompt(messageContent);
    }
    
    // Calculate token stats - only text portion for token counting
    const { maxTokens, promptTokens, availableTokens, thinkingBudget } = 
        await calculateMaxTokens(client, promptText, args);

    console.log(`\nToken stats:`);
    console.log(`Max retries: ${args.max_retries}`);
    console.log(`Max AI model context window: [${args.context_window}] tokens`);
    console.log(`Input prompt tokens: [${promptTokens}] ...`);
    console.log(`Available tokens: [${availableTokens}]  = ${args.context_window} - ${promptTokens} = context_window - prompt`);
    console.log(`Desired output tokens: [${args.desired_output_tokens}]`);
    console.log(`\nMax output tokens (max_tokens): [${maxTokens}] tokens  = min(${availableTokens}, ${args.betas_max_tokens})`);
    console.log(`                                   = can not exceed: 'betas=["output-128k-2025-02-19"]'`);
    console.log(`AI model thinking budget: [${thinkingBudget}] tokens  = ${maxTokens} - ${args.desired_output_tokens}`);
    console.log(`                           = can not exceed: 32K`);
    
    if (thinkingBudget < args.thinking_budget_tokens) {
        console.error(`Error: prompt is too large to have a ${args.thinking_budget_tokens} thinking budget!`);
        process.exit(1);
    }

    if (args.show_token_stats) {
        console.log(`FYI: token stats shown without sending to API, to aid in making adjustments.`);
        process.exit(0);
    }
    
    // PREVIEW MODE - Save prompt and exit without making API call
    if (args.preview) {
        console.log("\n--- PREVIEW MODE: No API call will be made ---");
        
        // Save the prompt to a file for inspection (text portion only)
        const previewTimestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
        const taskType = args.problem ? 'problem_fix' : 'feature_add';
        const previewFilename = path.join(args.save_dir, `prompt_preview_${taskType}_${previewTimestamp}.txt`);
        
        await saveOutput(previewFilename, promptText);
        
        console.log(`\nPreview summary:`);
        console.log(`- Would process ${isSingleFile ? '1 file' : fileMap.size + ' files'}`);
        console.log(`- Complete prompt saved to: ${previewFilename}`);
        console.log(`- Total prompt tokens: ${promptTokens}`);
        console.log(`- Available tokens for response: ${availableTokens}`);
        console.log(`- Thinking budget: ${thinkingBudget} tokens`);
        
        // In directory mode, show list of included files
        if (!isSingleFile) {
            console.log("\nFiles that would be processed:");
            Array.from(fileMap.keys()).forEach(filePath => {
                console.log(`  - ${filePath}`);
            });
        }
        
        // Show screenshots that would be included
        if (screenshots) {
            console.log("\nScreenshots that would be included:");
            Object.keys(screenshots).forEach(name => {
                console.log(`  - ${name}`);
            });
        }
        
        const estimatedCost = promptTokens / 1000000 * 15; // Rough estimate: $15 per million tokens
        console.log(`\nEstimated API call cost: $${estimatedCost.toFixed(4)}`);
        
        console.log("\nRun the command without --preview to send to API");
        
        return previewFilename;
    }
    
    console.log(`\n--- Processing Code ---`);
    
    let fullResponse = "";
    let thinkingContent = "";
    
    const startTime = Date.now();
    
    const dt = new Date(startTime);
    const formattedTime = dt.toLocaleString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    }).toLowerCase();
    
    console.log(`****************************************************************************`);
    console.log(`*  sending to API at: ${formattedTime}`);
    console.log(`*  ... standby, as this usually takes a few minutes`);
    console.log(`****************************************************************************`);
    
    try {
        const responseStream = await client.beta.messages.stream({
            model: "claude-3-7-sonnet-20250219",
            max_tokens: maxTokens,
            messages: [{ role: "user", content: messageContent }],
            thinking: {
                type: "enabled",
                budget_tokens: thinkingBudget
            },
            betas: ["output-128k-2025-02-19"]
        });

        // Track both thinking and text output
        for await (const event of responseStream) {
            if (event.type === "content_block_delta") {
                if (event.delta.type === "thinking_delta") {
                    thinkingContent += event.delta.thinking;
                } else if (event.delta.type === "text_delta") {
                    fullResponse += event.delta.text;
                    // Print the response as it comes in
                    process.stdout.write(event.delta.text);
                }
            }
        }
        // Add a newline after streaming completes
        console.log();
    } catch (error) {
        console.error(`\nError during API call: ${error.message}`);
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    
    // Create results filename
    const taskType = args.problem ? 'problem_fix' : 'feature_add';
    const resultsFilename = path.join(args.save_dir, `code_results_${taskType}_${timestamp}.txt`);
    
    // Save the full analysis and results
    await saveOutput(resultsFilename, fullResponse);
    
    // Process modified code based on mode
    if (isSingleFile) {
        // Single file mode - extract and save modified code
        const modifiedCode = extractSingleFileCode(fullResponse);
        if (modifiedCode) {
            const outputFilename = args.output_file || `${path.basename(args.file, path.extname(args.file))}_modified${path.extname(args.file)}`;
            
            // Create backup of original file
            if (await fileExists(args.file)) {
                const backupPath = `${args.file}.backup`;
                await fs.copyFile(args.file, backupPath);
                console.log(`Backup created at: ${backupPath}`);
            }
            
            await saveOutput(outputFilename, modifiedCode);
        } else {
            console.log(`No modified code block found in the response.`);
        }
    } else {
        // Directory mode - extract and save all modified files
        const modifiedFiles = await extractAndSaveModifiedFiles(args.directory, fullResponse);
        if (modifiedFiles.length > 0) {
            console.log(`\nModified ${modifiedFiles.length} files:`);
            modifiedFiles.forEach(file => console.log(`  - ${file}`));
        } else {
            console.log(`No modified files found in the response.`);
        }
    }
    
    const outputWordCount = countWords(fullResponse);
    
    console.log(`\nElapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds.`);
    console.log(`Generated response has ${outputWordCount} words.`);
    
    let outputTokenCount = 0;
    try {
        const response = await client.beta.messages.countTokens({
            model: "claude-3-7-sonnet-20250219",
            thinking: {
                type: "enabled",
                budget_tokens: args.thinking_budget_tokens
            },
            messages: [{ role: "user", content: fullResponse }],
            betas: ["output-128k-2025-02-19"]
        });
        outputTokenCount = response.input_tokens;
        console.log(`Output is ${outputTokenCount} tokens (via client.beta.messages.countTokens)`);
    } catch (error) {
        console.error(`Error counting output tokens: ${error.message}`);
    }
    
    const stats = `
Details:
Max request timeout: ${args.request_timeout} seconds
Max retries: ${args.max_retries}
Max AI model context window: ${args.context_window} tokens
Betas max tokens: ${args.betas_max_tokens} tokens
Thinking budget tokens: ${args.thinking_budget_tokens} tokens
Desired output tokens: ${args.desired_output_tokens} tokens

Prompt tokens: ${promptTokens}
Available tokens after prompt: ${availableTokens}
Dynamic thinking budget: ${thinkingBudget} tokens
Setting max_tokens to: ${maxTokens} (requested: ${args.betas_max_tokens})

Elapsed time: ${minutes} minutes, ${seconds.toFixed(2)} seconds
Output has ${outputWordCount} words
Output is ${outputTokenCount} tokens (via client.beta.messages.countTokens)
Full response saved to: ${resultsFilename}
`;
    
    if (thinkingContent) {
        const thinkingFilename = path.join(args.save_dir, `code_thinking_${taskType}_${timestamp}.txt`);
        const thinkingOutput = `=== PROMPT USED ===\n${promptText}\n\n=== AI'S THINKING PROCESS ===\n\n${thinkingContent}\n=== END AI'S THINKING PROCESS ===\n${stats}`;
        
        await fs.writeFile(thinkingFilename, thinkingOutput, 'utf-8');
        console.log(`AI thinking saved to: ${thinkingFilename}\n`);
    } else {
        console.log(`No AI thinking content was captured.\n`);
    }
    
    return resultsFilename;
}

/**
 * Main function to run code analysis/modification process
 */
async function main() {
    try {
        // Parse command-line arguments
        const args = parseArguments();
        
        // Initialize Anthropic client
        const client = new Anthropic({
            timeout: args.request_timeout * 1000, // Convert to milliseconds
            maxRetries: args.max_retries
        });
        
        // Print initial setup information
        console.log(`Starting code analysis/modification tool with ${args.file ? 'single file' : 'directory'} mode`);
        if (args.file) {
            const filePath = path.resolve(args.file);
            console.log(`Source file: ${filePath}`);
        } else {
            console.log(`Source directory: ${path.resolve(args.directory)}`);
            console.log(`File filters: include=${args.include}, exclude=${args.exclude}`);
            console.log(`Respect .gitignore: ${!args.ignore_gitignore}`);
        }
        
        console.log(`Task: ${args.problem ? 'Fix problem: ' + args.problem : 'Add feature: ' + args.feature}`);
        
        if (args.screenshot) {
            console.log(`Screenshot: ${args.screenshot}`);
        }
        
        if (args.screenshots) {
            console.log(`Multiple screenshots: ${args.screenshots}`);
        }
        
        console.log(`Mode: ${args.preview ? 'Preview (no API call)' : 'Normal'}`);
        console.log(`Save directory: ${path.resolve(args.save_dir)}`);
        
        if (!args.preview) {
            console.log(`Max request timeout: ${args.request_timeout} seconds`);
            console.log(`Max retries: ${args.max_retries}`);
            console.log(`Context window: ${args.context_window} tokens`);
            console.log(`Betas max tokens: ${args.betas_max_tokens} tokens`);
            console.log(`Thinking budget tokens: ${args.thinking_budget_tokens} tokens`);
            console.log(`Desired output tokens: ${args.desired_output_tokens} tokens`);
        }
        
        // Create save directory if it doesn't exist
        await fs.mkdir(args.save_dir, { recursive: true });
        
        // Process the code
        const resultsFile = await processCode(client, args);
        
        // Final output
        if (args.preview) {
            console.log("\nPreview complete!");
            console.log(`Prompt saved to: ${resultsFile}`);
        } else {
            console.log("\nCode processing complete!");
            console.log(`Full analysis saved to: ${resultsFile}`);
        }
        
    } catch (error) {
        console.error(`\nAn error occurred: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
main();
