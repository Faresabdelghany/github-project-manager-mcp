// Test script to verify Phase 3.1 implementation
import { toolRegistry, toolDefinitions } from './build/tools/index.js';

console.log('🧪 Testing Phase 3.1 Implementation...\n');

// Check total number of tools
console.log(`📊 Total tools available: ${Object.keys(toolRegistry).length}`);
console.log(`📊 Total tool definitions: ${toolDefinitions.length}\n`);

// Check for Phase 3.1 webhook management tools
const webhookManagementTools = [
  'setup_webhooks',
  'list_webhooks',
  'test_webhook',
  'remove_webhooks',
  'get_webhook_deliveries',
  'get_webhook_status'
];

console.log('🔧 Webhook Management Tools:');
webhookManagementTools.forEach(tool => {
  const exists = tool in toolRegistry;
  console.log(`   ${exists ? '✅' : '❌'} ${tool}`);
});

// Check for Phase 3.1 live update tools
const liveUpdateTools = [
  'get_live_project_status',
  'get_live_sprint_metrics',
  'subscribe_to_updates',
  'get_recent_activity',
  'get_live_repository_health'
];

console.log('\n📊 Live Update Tools:');
liveUpdateTools.forEach(tool => {
  const exists = tool in toolRegistry;
  console.log(`   ${exists ? '✅' : '❌'} ${tool}`);
});

// Check if WebhookService exists
try {
  const { WebhookService } = await import('./build/services/webhook-service.js');
  console.log('\n🚀 WebhookService: ✅ Successfully imported');
  console.log(`   Class definition: ${typeof WebhookService}`);
} catch (error) {
  console.log('\n🚀 WebhookService: ❌ Import failed');
  console.log(`   Error: ${error.message}`);
}

// List all available tools
console.log('\n📋 All Available Tools:');
Object.keys(toolRegistry).sort().forEach((tool, index) => {
  console.log(`   ${index + 1}. ${tool}`);
});

console.log('\n🎯 Phase 3.1 Test Complete!');
