#!/usr/bin/env node

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs/promises');
const path = require('path');
const { ArgumentParser } = require('argparse');

// No need for fileURLToPath in CommonJS
// __dirname is available directly in CommonJS

/**
 * Parses command-line arguments for token and word counting
 * @returns {Object} Parsed command-line arguments
 */
function parseArguments() {
    const parser = new ArgumentParser({
        description: 'Count tokens and words in a text file using Claude API.',
        epilog: `
Example usages:
  node tokens_words_counter.js --text_file input.txt
  node tokens_words_counter.js --text_file input.txt --context_window 200000 --thinking_budget_tokens 32000
        `
    });

    // Input File Arguments
    parser.add_argument('--text_file', {
        type: 'str', 
        required: true, 
        help: "File containing the text to analyze (required)"
    });

    // Claude API Configuration Arguments
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
        default: 12000, 
        help: 'User desired number of tokens to generate before stopping output'
    });
    parser.add_argument('--request_timeout', {
        type: 'int', 
        default: 300, 
        help: 'Maximum timeout for each *streamed chunk* of output (default: 300 seconds)'
    });

    // Output Configuration Arguments
    parser.add_argument('--save_dir', {
        type: 'str', 
        default: ".", 
        help: 'Directory to save output files (default: current directory)'
    });
    parser.add_argument('--output_tracking', {
        type: 'str', 
        default: null, 
        help: 'UUID-based file for tracking output files (used by Writer\'s Toolkit)'
    });

    return parser.parse_args();
}

/**
 * Read text file content with error handling
 * @param {string} filePath - Path to the text file
 * @returns {Promise<string>} File content
 */
async function readTextFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (!content.trim()) {
            console.error(`Error: text file '${filePath}' is empty.`);
            process.exit(1);
        }
        return content;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Error: text file '${filePath}' not found.`);
        } else {
            console.error(`Error reading text file '${filePath}': ${error.message}`);
        }
        process.exit(1);
    }
}

/**
 * Count tokens in text using Anthropic API
 * @param {Anthropic} client - Anthropic API client
 * @param {string} text - Text to count tokens for
 * @returns {Promise<number>} Number of tokens
 */
async function countTokens(client, text) {
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
        const response = await client.beta.messages.countTokens({
            model: "claude-3-7-sonnet-20250219",
            thinking: {
                type: "enabled",
                budget_tokens: 128000
            },
            messages: [{ role: "user", content: text }],
            betas: ["output-128k-2025-02-19"]
        });

        return response.input_tokens;
    } catch (error) {
        console.error(`Token counting error: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Count words in a text string
 * @param {string} text - Text to count words in
 * @returns {number} Number of words
 */
function countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Write token and word count results to an output file
 * @param {Object} args - Command-line arguments
 * @param {number} wordCount - Total number of words
 * @param {number} promptTokens - Number of tokens in the prompt
 * @param {number} wordsPerToken - Ratio of words to tokens
 * @param {number} availableTokens - Remaining tokens in context window
 * @param {number} thinkingBudget - Tokens allocated for thinking
 * @returns {string} Path to the created output file
 */
async function writeOutputFile(args, wordCount, promptTokens, wordsPerToken, availableTokens, thinkingBudget) {
    // Create output filename based on input filename
    const inputBase = path.basename(args.text_file);
    const inputName = path.parse(inputBase).name;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(args.save_dir, `count_${inputName}_${timestamp}.txt`);

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputFile), { recursive: true });

    // Prepare content
    const content = `Token and Word Count Report
=========================

Analysis of file: ${args.text_file}
Generated on: ${new Date().toLocaleString()}

Word count: ${wordCount}
Token count: ${promptTokens}
Words per token ratio: ${wordsPerToken.toFixed(2)}

Context window: ${args.context_window} tokens
Available tokens: ${availableTokens} tokens
Thinking budget: ${thinkingBudget} tokens
Desired output tokens: ${args.desired_output_tokens} tokens`;

    // Write to file
    await fs.writeFile(outputFile, content, 'utf-8');
    console.log(`Report saved to: ${outputFile}`);
    return path.resolve(outputFile);
}

/**
 * Main function to run token and word counting process
 */
async function main() {
    // Parse command-line arguments
    const args = parseArguments();
    
    // Initialize Anthropic client
    const client = new Anthropic({
        timeout: args.request_timeout * 1000, // Convert to milliseconds
        maxRetries: 0
    });
    
    // Read input text file
    const text = await readTextFile(args.text_file);
    const wordCount = countWords(text);
    
    console.log(`Counting tokens for text file: ${args.text_file}`);
    const promptTokenCount = await countTokens(client, text);
    
    // Calculate available tokens after prompt
    const promptTokens = promptTokenCount;
    const availableTokens = args.context_window - promptTokens;
    
    // Calculate max tokens respecting API limits
    const maxTokens = Math.min(availableTokens, args.betas_max_tokens);
    
    // Calculate thinking budget
    let thinkingBudget = maxTokens - args.desired_output_tokens;
    
    if (thinkingBudget > 32000) {
        console.warn("Warning: thinking budget is larger than 32K, reset to 32K. Use batch for larger thinking budgets.");
        thinkingBudget = 32000;
    }
    
    // Display results
    console.log("\nToken stats:");
    console.log(`Word count: ${wordCount}`);
    console.log(`Max AI model context window: [${args.context_window}] tokens`);
    console.log(`Input prompt tokens: [${promptTokens}]`);
    console.log(`Available tokens: [${availableTokens}] = ${args.context_window} - ${promptTokens}`);
    console.log(`Desired output tokens: [${args.desired_output_tokens}]`);
    console.log(`AI model thinking budget: [${thinkingBudget}] tokens`);
    console.log(`Max output tokens (max_tokens): [${maxTokens}] tokens`);
    
    if (thinkingBudget < args.thinking_budget_tokens) {
        console.error(`Error: prompt is too large to have a ${args.thinking_budget_tokens} thinking budget!`);
        process.exit(1);
    } else {
        console.log("✓ Thinking budget is sufficient!");
        console.log(`✓ Text is ready for use with requested thinking budget of ${args.thinking_budget_tokens} tokens`);
    }
    
    // Calculate words per token ratio
    const wordsPerToken = promptTokens > 0 ? wordCount / promptTokens : 0;
    console.log(`Words per token ratio: ${wordsPerToken.toFixed(2)}\n`);
    
    console.log("***************************************************************************");
    console.log(`Counts for text file: ${args.text_file}`);
    console.log(`\n${wordCount} words`);
    console.log(`\n${promptTokens} tokens using 'client.beta.messages.countTokens'`);
    console.log("***************************************************************************");

    // Write output file
    const createdFiles = [];
    const outputFile = await writeOutputFile(
        args, wordCount, promptTokens, wordsPerToken, 
        availableTokens, thinkingBudget
    );
    createdFiles.push(outputFile);
}

// Run the main function and handle any unhandled promise rejections
main().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
});
