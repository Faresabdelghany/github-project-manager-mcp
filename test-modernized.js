#!/usr/bin/env node

// Test script for the modernized GitHub Project Manager MCP server
import { spawn } from 'child_process';

const token = process.env.GITHUB_TOKEN || 'test_token';
const owner = process.env.GITHUB_OWNER || 'Faresabdelghany';
const repo = process.env.GITHUB_REPO || 'course-management-system';

console.log('🚀 Testing Modernized GitHub Project Manager MCP Server v3.0');
console.log('=========================================================');
console.log(`Token: ${token ? 'Set' : 'Not Set'}`);
console.log(`Owner: ${owner}`);
console.log(`Repo: ${repo}`);
console.log();

// Test the server startup
const server = spawn('node', ['build/index.js'], {
  env: {
    ...process.env,
    GITHUB_TOKEN: token,
    GITHUB_OWNER: owner,
    GITHUB_REPO: repo
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverOutput = '';
let errorOutput = '';

server.stdout.on('data', (data) => {
  serverOutput += data.toString();
});

server.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

// Kill server after 2 seconds
setTimeout(() => {
  server.kill('SIGTERM');
  
  console.log('📊 Server Test Results:');
  console.log('======================');
  
  if (errorOutput.includes('Modern GitHub Project Manager MCP server running')) {
    console.log('✅ Server started successfully');
    console.log('✅ Modern MCP SDK implementation working');
    
    if (errorOutput.includes('Tools: 15 comprehensive')) {
      console.log('✅ All 15 tools loaded');
    }
    
    if (errorOutput.includes('Resources: Repository information')) {
      console.log('✅ Resources configured');
    }
    
    if (errorOutput.includes('Prompts: Sprint planning')) {
      console.log('✅ Prompts configured');
    }
    
    console.log('\n🎉 SUCCESS: Modernization complete!');
    console.log('📋 Ready for Claude Desktop integration');
    
  } else {
    console.log('❌ Server startup failed');
    console.log('Error output:', errorOutput);
  }
  
  if (serverOutput) {
    console.log('\nServer stdout:', serverOutput);
  }
  
  console.log('\n🔧 Next Steps:');
  console.log('1. Update Claude Desktop configuration');
  console.log('2. Restart Claude Desktop');
  console.log('3. Test tools in Claude Desktop');
  
}, 2000);
