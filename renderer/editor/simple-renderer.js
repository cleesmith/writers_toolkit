// simple-renderer.js
console.log('Simple renderer script loading');

// Set up CodeMirror
const editor = CodeMirror.fromTextArea(document.getElementById('editor'), {
  lineNumbers: true,
  mode: 'text/plain',
  theme: 'monokai',
  lineWrapping: true
});

// Log API availability
console.log('API available:', {
  textEditorAPI: !!window.textEditorAPI
});

// Open File button
document.getElementById('openBtn').addEventListener('click', async () => {
  console.log('Open button clicked');
  
  if (!window.textEditorAPI) {
    console.error('textEditorAPI not available');
    alert('Error: API not available');
    return;
  }
  
  try {
    const result = await window.textEditorAPI.openFile();
    console.log('Open file result:', result);
    
    if (result && result.canceled === false && result.content) {
      console.log('Setting editor content');
      editor.setValue(result.content);
    }
  } catch (error) {
    console.error('Error opening file:', error);
    alert('Failed to open file: ' + error.message);
  }
});

// Save File button
document.getElementById('saveBtn').addEventListener('click', async () => {
  console.log('Save button clicked');
  
  if (!window.textEditorAPI) {
    console.error('textEditorAPI not available');
    alert('Error: API not available');
    return;
  }
  
  try {
    const content = editor.getValue();
    console.log('Getting editor content, length:', content.length);
    
    const result = await window.textEditorAPI.saveFile(content);
    console.log('Save file result:', result);
    
    if (result && result.canceled === false) {
      console.log('File saved successfully');
      alert('File saved successfully!');
    }
  } catch (error) {
    console.error('Error saving file:', error);
    alert('Failed to save file: ' + error.message);
  }
});

// Find button
document.getElementById('findBtn').addEventListener('click', () => {
  console.log('Find button clicked');
  editor.execCommand('find');
});

// Quit button
document.getElementById('quitBtn').addEventListener('click', async () => {
  console.log('Quit button clicked');
  
  if (!window.textEditorAPI) {
    console.error('textEditorAPI not available');
    alert('Error: API not available');
    return;
  }
  
  try {
    await window.textEditorAPI.quitApp();
  } catch (error) {
    console.error('Error quitting app:', error);
    alert('Failed to quit: ' + error.message);
  }
});

console.log('Simple renderer script loaded successfully');