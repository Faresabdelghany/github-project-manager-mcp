#!/usr/bin/env node

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const token = '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';
const owner = 'Faresabdelghany';
const repo = 'github-project-manager-mcp';

console.log('🧠 Testing analyze_task_complexity tool on issue #54');
console.log('===============================================');

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

let serverOutput = '';

server.stdout.on('data', (data) => {
  const output = data.toString();
  serverOutput += output;
  console.log('Server:', output.trim());
});

server.stderr.on('data', (data) => {
  console.error('Server Error:', data.toString().trim());
});

// Wait for server to be ready
await setTimeout(2000);

if (serverOutput.includes('Tools available')) {
  console.log('✅ Server is ready, testing analyze_task_complexity...');
  
  // Test the analyze_task_complexity tool on issue #54
  const testMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "analyze_task_complexity",
      arguments: {
        issue_number: 54
      }
    }
  }) + '\n';

  console.log('📋 Analyzing issue #54 complexity...');
  server.stdin.write(testMessage);
  
  // Wait for response
  await setTimeout(5000);
  
  console.log('✅ Analysis complete!');
} else {
  console.log('❌ Server not ready');
}

server.kill('SIGTERM');
console.log('🏁 Test completed');
