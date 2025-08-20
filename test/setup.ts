// Backend test setup
// Load test environment variables if dotenv is available
try {
  require('dotenv').config({ path: '.env.test' });
} catch (e) {
  // dotenv not required for tests
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost/test_db';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-api-key';

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};