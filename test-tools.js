#!/usr/bin/env node

// Test specific MCP tools
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const token = process.env.GITHUB_TOKEN || 'test_token';
const owner = process.env.GITHUB_OWNER || 'Faresabdelghany';
const repo = process.env.GITHUB_REPO || 'course-management-system';

console.log('Testing GitHub Project Manager MCP Tools');
console.log('======================================');

// Start the server
const server = spawn('node', ['build/index.js'], {
  env: {
    ...process.env,
    GITHUB_TOKEN: token,
    GITHUB_OWNER: owner,
    GITHUB_REPO: repo
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let serverReady = false;

server.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('Server:', output);
  if (output.includes('Tools available: 13')) {
    serverReady = true;
  }
});

server.stderr.on('data', (data) => {
  console.error('Server Error:', data.toString());
});

// Wait for server to be ready
await setTimeout(1000);

if (serverReady) {
  console.log('✅ Server is ready with 13 tools');
  
  // Test list_labels tool
  const testMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "list_labels",
      arguments: {}
    }
  }) + '\n';

  console.log('Testing list_labels tool...');
  server.stdin.write(testMessage);
  
  // Wait for response
  await setTimeout(2000);
}

server.kill('SIGTERM');
console.log('Test completed');
