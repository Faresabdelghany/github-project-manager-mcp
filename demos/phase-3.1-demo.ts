#!/usr/bin/env node

/**
 * Phase 3.1 Demo Script - Real-Time Updates & Webhooks Integration
 * 
 * This script demonstrates the complete webhook and real-time functionality
 * of the GitHub Project Manager MCP server.
 */

import { Octokit } from '@octokit/rest';
import { WebhookService } from '../src/services/webhook-service.js';
import { GitHubConfig } from '../src/shared/types.js';

// Demo configuration
const DEMO_CONFIG = {
  // Replace these with your actual values for testing
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || 'your-github-token',
  GITHUB_OWNER: process.env.GITHUB_OWNER || 'your-username',
  GITHUB_REPO: process.env.GITHUB_REPO || 'your-repo',
  WEBHOOK_URL: process.env.WEBHOOK_URL || 'https://your-webhook-endpoint.com/github-webhook',
  WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || 'your-secret'
};

async function runPhase31Demo() {
  console.log('🚀 Phase 3.1 Demo: Real-Time Updates & Webhooks Integration\n');
  
  // Initialize GitHub configuration
  const config: GitHubConfig = {
    owner: DEMO_CONFIG.GITHUB_OWNER,
    repo: DEMO_CONFIG.GITHUB_REPO,
    octokit: new Octokit({ auth: DEMO_CONFIG.GITHUB_TOKEN }),
    graphqlWithAuth: null // Will be set if needed
  };

  const webhookService = new WebhookService(config);

  try {
    // Demo 1: Setup Webhooks
    console.log('📡 Demo 1: Setting up webhooks for real-time updates...');
    const webhookResult = await webhookService.setupWebhook({
      webhook_url: DEMO_CONFIG.WEBHOOK_URL,
      events: ['issues', 'milestone', 'pull_request', 'push'],
      secret: DEMO_CONFIG.WEBHOOK_SECRET,
      active: true
    });
    console.log(webhookResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');

    // Demo 2: List Configured Webhooks
    console.log('📋 Demo 2: Listing configured webhooks...');
    const listResult = await webhookService.listWebhooks();
    console.log(listResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');

    // Demo 3: Test Webhook Connectivity
    console.log('🧪 Demo 3: Testing webhook connectivity...');
    const testResult = await webhookService.testWebhook({});
    console.log(testResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');

    // Demo 4: Get Live Project Status
    console.log('📊 Demo 4: Getting live project status...');
    const liveStatusResult = await webhookService.getLiveProjectStatus();
    console.log(liveStatusResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');

    // Demo 5: Get Recent Activity
    console.log('🕐 Demo 5: Getting recent activity...');
    const activityResult = await webhookService.getRecentActivity({
      timeframe: '7d',
      include_issues: true,
      include_pull_requests: true,
      include_milestones: true
    });
    console.log(activityResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');

    // Demo 6: Subscribe to Updates
    console.log('📡 Demo 6: Setting up real-time update subscription...');
    const subscribeResult = webhookService.subscribeToUpdates({
      subscription_id: 'demo-subscription-001',
      events: ['issue_opened', 'issue_closed', 'milestone_created'],
      callback: 'console-logger'
    });
    console.log(subscribeResult.content[0].text);
    console.log('\n' + '='.repeat(80) + '\n');

    // Demo 7: Webhook Event Processing Simulation
    console.log('⚡ Demo 7: Simulating webhook event processing...');
    
    const sampleWebhookEvent = {
      action: 'opened',
      repository: {
        name: config.repo,
        full_name: `${config.owner}/${config.repo}`,
        owner: { login: config.owner }
      },
      sender: {
        login: 'demo-user',
        type: 'User'
      },
      issue: {
        number: 999,
        title: 'Demo Issue for Phase 3.1 Testing',
        body: 'This is a demonstration issue to show real-time webhook processing.',
        state: 'open',
        labels: [{ name: 'demo', color: 'blue' }],
        assignees: [],
        html_url: `https://github.com/${config.owner}/${config.repo}/issues/999`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        comments: 0,
        user: { login: 'demo-user' }
      }
    };

    console.log('Processing sample webhook event...');
    await webhookService.processWebhookEvent(sampleWebhookEvent);
    console.log('✅ Webhook event processed successfully!');
    console.log('\n' + '='.repeat(80) + '\n');

    // Demo 8: Security Features
    console.log('🔐 Demo 8: Demonstrating webhook security features...');
    const samplePayload = JSON.stringify(sampleWebhookEvent);
    const isValid = webhookService.verifyWebhookSignature(samplePayload, 'sha256=test-signature');
    console.log(`Webhook signature verification: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    console.log('Note: This demo uses a test signature. In production, use proper HMAC signatures.');
    console.log('\n' + '='.repeat(80) + '\n');

    console.log('🎉 Phase 3.1 Demo completed successfully!');
    console.log('\n📝 Summary of demonstrated features:');
    console.log('✅ Webhook setup and management');
    console.log('✅ Real-time project status tracking');
    console.log('✅ Live activity monitoring');
    console.log('✅ Event-driven update subscriptions');
    console.log('✅ Webhook event processing');
    console.log('✅ Security features (signature validation)');
    console.log('\n💡 Next steps:');
    console.log('• Set up your webhook endpoint to receive GitHub events');
    console.log('• Configure the MCP server with your repository details');
    console.log('• Start using real-time tools in Claude Desktop');
    console.log('• Monitor webhook deliveries and project status live');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    console.log('\n🔧 Troubleshooting tips:');
    console.log('• Ensure GITHUB_TOKEN has proper repository permissions');
    console.log('• Verify repository owner and name are correct');
    console.log('• Check webhook URL is accessible from GitHub');
    console.log('• Confirm network connectivity to GitHub API');
  }
}

// Sample webhook endpoint handler (for reference)
function createSampleWebhookHandler() {
  console.log('\n📖 Sample Webhook Endpoint Handler:');
  console.log(`
import express from 'express';
import crypto from 'crypto';
import { WebhookService } from './webhook-service.js';

const app = express();
app.use(express.json());

app.post('/github-webhook', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  
  // Verify webhook signature
  const isValid = webhookService.verifyWebhookSignature(payload, signature);
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process the webhook event
  try {
    await webhookService.processWebhookEvent(req.body);
    res.status(200).send('Event processed');
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Processing failed');
  }
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
`);
}

// Environment setup helper
function showEnvironmentSetup() {
  console.log('\n🔧 Environment Setup for Phase 3.1:');
  console.log(`
# Required environment variables:
export GITHUB_TOKEN="your-github-personal-access-token"
export GITHUB_OWNER="your-github-username"
export GITHUB_REPO="your-repository-name"
export WEBHOOK_URL="https://your-server.com/github-webhook"
export GITHUB_WEBHOOK_SECRET="your-webhook-secret"

# GitHub token scopes needed:
# - repo (full repository access)
# - admin:repo_hook (webhook management)
# - read:org (if using organization repositories)

# Webhook endpoint requirements:
# - Must be publicly accessible from GitHub
# - Should use HTTPS for production
# - Must respond to POST requests
# - Should validate webhook signatures
`);
}

// Run the demo
if (require.main === module) {
  showEnvironmentSetup();
  createSampleWebhookHandler();
  runPhase31Demo().catch(console.error);
}

export { runPhase31Demo, createSampleWebhookHandler, showEnvironmentSetup };
