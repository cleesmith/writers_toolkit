// cd utilities
// node anthropic-api-test.js
// ... and ignore this:
//    (node:92815) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/cleesmith/writers_toolkit_node_electron/utilities/anthropic-api-test.js is not specified and it doesn't parse as CommonJS.
//    Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
//    To eliminate this warning, add "type": "module" to /Users/cleesmith/writers_toolkit_node_electron/package.json.
//    (Use `node --trace-warnings ...` to show where the warning was created)

// Import the Anthropic SDK
import Anthropic from '@anthropic-ai/sdk';

// Anthropic client (automatically uses ANTHROPIC_API_KEY from environment)
const anthropic = new Anthropic();

// Async function to test streaming API connection
async function testAnthropicStreamingAPI() {
  try {
    // Start a streaming message request
    const stream = await anthropic.messages.create({
      // Using Haiku model for quick, cost-effective testing
      model: "claude-3-haiku-20240307",
      max_tokens: 300,
      stream: true, // Enable streaming
      messages: [
        {
          role: "user",
          content: "list the planets"
        }
      ]
    });

    // Process the streaming response
    let fullResponse = '';
    
    // Iterate through the stream and handle each chunk
    for await (const messageStream of stream) {
      // Check if the chunk is a text content type
      if (messageStream.type === 'content_block_delta' && messageStream.delta.type === 'text_delta') {
        // Extract the text chunk
        const textChunk = messageStream.delta.text;
        
        // Print the chunk in real-time
        process.stdout.write(textChunk);
        
        // Accumulate the full response
        fullResponse += textChunk;
      }
    }

    // Optional: Add a newline after streaming completes
    console.log('\n\n--- Stream Complete ---');
    
    // Optional: Log the total accumulated response
    console.log('Full Accumulated Response:', fullResponse);

  } catch (error) {
    // Detailed error logging
    console.error('Streaming API Call Failed:', error);
    
    // Help diagnose common issues
    if (error.message.includes('AuthenticationError')) {
      console.error('Authentication failed. Check your API key:');
      console.error('1. Ensure the API key is correct');
      console.error('2. Verify your Anthropic account status');
    }
  }
}

// Run the test function
testAnthropicStreamingAPI();
