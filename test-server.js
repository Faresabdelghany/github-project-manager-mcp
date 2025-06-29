#!/usr/bin/env node

// Test script for enhanced GitHub Project Manager MCP server
import { execSync } from 'child_process';

const token = process.env.GITHUB_TOKEN || 'test_token';
const owner = process.env.GITHUB_OWNER || 'Faresabdelghany';
const repo = process.env.GITHUB_REPO || 'course-management-system';

console.log('Testing Enhanced GitHub Project Manager MCP Server');
console.log('===========================================');
console.log(`Token: ${token ? 'Set' : 'Not Set'}`);
console.log(`Owner: ${owner}`);
console.log(`Repo: ${repo}`);
console.log();

// Test the server startup
try {
  const result = execSync('node build/index.js', {
    env: {
      ...process.env,
      GITHUB_TOKEN: token,
      GITHUB_OWNER: owner,
      GITHUB_REPO: repo
    },
    timeout: 2000,
    encoding: 'utf8'
  });
  console.log('Server Output:', result);
} catch (error) {
  if (error.status === 'SIGTERM' || error.signal === 'SIGTERM') {
    console.log('✅ Server started successfully (terminated by timeout)');
    console.log('Server Error Output:', error.stderr);
  } else {
    console.log('❌ Server failed:', error.message);
  }
}
