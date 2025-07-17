#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';

import { GitHubConfig } from './shared/types.js';
import { toolRegistry, toolDefinitions } from './tools/index.js';

class GitHubProjectManagerServer {
  private server: Server;
  private config: GitHubConfig;

  constructor() {
    this.server = new Server(
      {
        name: 'github-project-manager',
        version: '3.1.0',
      }
    );

    // Initialize GitHub configuration
    this.config = this.initializeConfig();
    this.setupToolHandlers();
  }

  private initializeConfig(): GitHubConfig {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    const octokit = new Octokit({ auth: token });
    const graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });

    return {
      owner: process.env.GITHUB_OWNER || '',
      repo: process.env.GITHUB_REPO || '',
      octokit,
      graphqlWithAuth
    };
  }

  private setupToolHandlers() {
    // Register tool definitions
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: toolDefinitions,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Get the tool handler from registry
        const toolHandler = toolRegistry[name as keyof typeof toolRegistry];
        
        if (!toolHandler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        // Log tool usage for monitoring
        console.error(`🔧 Tool called: ${name}`);
        
        // Execute the tool and return proper MCP response
        const toolResponse = await toolHandler(this.config, args);
        
        console.error(`✅ Tool completed: ${name}`);
        return toolResponse;
      } catch (error) {
        console.error(`❌ Tool failed: ${request.params.name} - ${error instanceof Error ? error.message : String(error)}`);
        
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError, 
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private validateConfiguration(): void {
    const issues = [];
    
    if (!this.config.owner) {
      issues.push('GITHUB_OWNER environment variable not set');
    }
    
    if (!this.config.repo) {
      issues.push('GITHUB_REPO environment variable not set');
    }
    
    if (issues.length > 0) {
      console.error('⚠️  Configuration warnings:');
      issues.forEach(issue => console.error(`   • ${issue}`));
      console.error('   Some tools may not function properly without repository context.');
    }
  }

  private displayCapabilities(): void {
    const webhookCapabilities = [
      'setup_webhooks',
      'list_webhooks', 
      'test_webhook',
      'remove_webhooks',
      'get_webhook_deliveries',
      'get_webhook_status'
    ];
    
    const liveUpdateCapabilities = [
      'get_live_project_status',
      'get_live_sprint_metrics',
      'subscribe_to_updates',
      'get_recent_activity',
      'get_live_repository_health'
    ];

    const webhookTools = webhookCapabilities.filter(tool => tool in toolRegistry);
    const liveUpdateTools = liveUpdateCapabilities.filter(tool => tool in toolRegistry);
    
    console.error('🎯 Core Project Management:');
    console.error('   • Issue management and tracking');
    console.error('   • Milestone planning and progress');
    console.error('   • Label organization and categorization');
    console.error('   • Analytics and complexity analysis');
    console.error('');
    
    if (webhookTools.length > 0) {
      console.error('🔄 Real-Time Webhooks (Phase 3.1):');
      webhookTools.forEach(tool => {
        console.error(`   • ${tool.replace(/_/g, ' ')}`);
      });
      console.error('');
    }
    
    if (liveUpdateTools.length > 0) {
      console.error('📊 Live Updates (Phase 3.1):');
      liveUpdateTools.forEach(tool => {
        console.error(`   • ${tool.replace(/_/g, ' ')}`);
      });
      console.error('');
    }

    console.error('💡 Phase 3.1 Features:');
    console.error('   • Zero manual refresh required');
    console.error('   • Real-time project synchronization');
    console.error('   • Event-driven workflow automation');
    console.error('   • Live sprint and team metrics');
    console.error('   • Comprehensive webhook management');
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error("🚀 GitHub Project Manager MCP server running on stdio");
    console.error(`📦 Repository: ${this.config.owner}/${this.config.repo || '[not configured]'}`);
    console.error(`🛠️  Tools available: ${Object.keys(toolRegistry).length} tools`);
    console.error(`🌟 Version: 3.1.0 - Phase 3.1 Complete`);
    console.error("✨ Modular architecture with real-time webhooks");
    console.error("");
    
    this.validateConfiguration();
    this.displayCapabilities();
    
    if (process.env.GITHUB_WEBHOOK_SECRET) {
      console.error("🔐 Webhook security: Secret configured");
    } else {
      console.error("⚠️  Webhook security: No secret configured (optional but recommended)");
    }
    
    console.error("");
    console.error("🔄 Ready for real-time GitHub project management!");
    console.error("💡 Try 'get_live_project_status' for immediate project insights");
  }
}

async function main() { 
  try {
    const server = new GitHubProjectManagerServer(); 
    await server.run(); 
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    
    if (error instanceof Error && error.message.includes('GITHUB_TOKEN')) {
      console.error("");
      console.error("🔧 Setup required:");
      console.error("   export GITHUB_TOKEN=\"your-github-token\"");
      console.error("   export GITHUB_OWNER=\"your-username\"");
      console.error("   export GITHUB_REPO=\"your-repository\"");
      console.error("");
      console.error("📚 For Phase 3.1 webhook features, also set:");
      console.error("   export WEBHOOK_URL=\"https://your-server.com/webhook\"");
      console.error("   export GITHUB_WEBHOOK_SECRET=\"your-secret\"");
    }
    
    process.exit(1);
  }
}

main().catch(console.error);
