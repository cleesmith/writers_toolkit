// migrate.js
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const electronStore = require('electron-store');

// In newer versions, electron-store exports the Store class as a property
// or it might be the default export
const Store = electronStore.default || electronStore;

// Paths
const tinyDBPath = path.join(__dirname, 'writers_toolkit_tinydb.json');

// Create interface for CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to prompt with question
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Main migration function
async function migrate() {
  console.log('==================================================');
  console.log('  Writer\'s Toolkit - TinyDB to electron-store Migration');
  console.log('==================================================');
  console.log('');
  console.log('This script will migrate data from the TinyDB JSON file');
  console.log('to electron-store for your Electron app.');
  console.log('');
  
  // Verify electron-store is working correctly
  console.log('Checking electron-store import...');
  console.log('electron-store module type:', typeof electronStore);
  console.log('Store constructor type:', typeof Store);
  
  if (typeof Store !== 'function') {
    console.error('ERROR: electron-store is not exporting a constructor function');
    console.error('Try running: npm uninstall electron-store && npm install electron-store@8.1.0');
    return false;
  }
  
  // Check if TinyDB file exists
  if (!fs.existsSync(tinyDBPath)) {
    console.error(`ERROR: TinyDB file not found at: ${tinyDBPath}`);
    console.log('Make sure the file exists in the same directory as this script.');
    return false;
  }
  
  console.log(`Source TinyDB file found: ${tinyDBPath}`);
  
  try {
    // Create the store and configure it to store in the current directory
    const storeConfig = {
      name: 'writers-toolkit-db',
      cwd: __dirname // Store in the same directory as this script
    };
    console.log('Creating store with config:', storeConfig);
    
    const store = new Store(storeConfig);
    
    console.log(`Store will be located at: ${store.path}`);
    
    // Check if the store already has data
    const storeSize = Object.keys(store.store || {}).length;
    if (storeSize > 0) {
      console.log(`WARNING: electron-store already contains data`);
      const answer = await prompt('Do you want to overwrite the existing data? (yes/no): ');
      
      if (answer.toLowerCase() !== 'yes') {
        console.log('Migration aborted by user.');
        return false;
      }
      
      // Create a backup before overwriting
      const storeContent = fs.readFileSync(store.path, 'utf8');
      const backupPath = `${store.path}.backup-${Date.now()}`;
      fs.writeFileSync(backupPath, storeContent);
      console.log(`Created backup of existing electron-store data at: ${backupPath}`);
    }
    
    // Read TinyDB data
    console.log('Reading TinyDB data...');
    const tinyDBContent = fs.readFileSync(tinyDBPath, 'utf8');
    const tinyDBData = JSON.parse(tinyDBContent);
    
    // Output some stats about the data
    const toolCount = Object.keys(tinyDBData.tools || {}).length;
    const settingsCount = Object.keys(tinyDBData.settings || {}).length;
    
    console.log(`Found ${toolCount} tools and ${settingsCount} settings entries`);
    
    // Clear the store before adding new data
    store.clear();
    
    // Add the tools and settings to the store
    console.log('Migrating data to electron-store...');
    store.set('tools', tinyDBData.tools || {});
    store.set('settings', tinyDBData.settings || {});
    
    console.log('');
    console.log('Migration completed successfully!');
    console.log(`Data stored at: ${store.path}`);
    console.log('');
    console.log('Stats:');
    console.log(`- Tools migrated: ${toolCount}`);
    console.log(`- Settings migrated: ${settingsCount}`);
    
    return true;
  } catch (error) {
    console.error('ERROR during migration:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the migration and exit when done
migrate()
  .then(success => {
    if (success) {
      console.log('');
      console.log('You can now use electron-store with your Writer\'s Toolkit app.');
      console.log('The database.js file has been updated to use electron-store.');
    } else {
      console.log('');
      console.log('Migration failed or was aborted. Please check the errors above.');
    }
    rl.close();
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    rl.close();
    process.exit(1);
  });

// Handle CTRL+C
rl.on('SIGINT', () => {
  console.log('\nMigration aborted by user.');
  rl.close();
  process.exit(0);
});
