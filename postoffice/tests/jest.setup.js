// Jest setup file - runs before tests
// Load test environment variables

const fs = require('fs');
const path = require('path');

// Load .env.test if it exists
const envTestPath = path.join(__dirname, '.env.test');
if (fs.existsSync(envTestPath)) {
  const envContent = fs.readFileSync(envTestPath, 'utf-8');
  
  envContent.split('\n').forEach(line => {
    // Skip empty lines and comments
    if (!line || line.trim().startsWith('#')) {
      return;
    }
    
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      // Only set if not already defined
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Set default test environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.EMAIL_ENABLED = process.env.EMAIL_ENABLED || 'false';
process.env.EMAIL_DEBUG = process.env.EMAIL_DEBUG || 'false';
