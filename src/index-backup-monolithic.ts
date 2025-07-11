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
import { getAllTools, getAllHandlers, getToolsSummary } from './tools/index.js';
import { ServerConfig } from './types/index.js';

/**
 * GitHub Project Manager MCP Server
 * 
 * A modular, professional-grade MCP server for comprehensive GitHub project management.
 * Each tool is organized in its own file within the /tools directory for maintainability.
 */
class GitHubProjectManagerServer {
  private server: Server;
  private octokit: Octokit;
  private config: ServerConfig;
  private tools: any[];
  private handlers: Record<string, any>;

  constructor() {
    // Initialize server
    this.server = new Server(
      {
        name: 'github-project-manager-modular',
        version: '3.0.0',
      }
    );

    // Validate and set up configuration
    this.config = this.loadConfiguration();
    
    // Initialize GitHub client
    this.octokit = new Octokit({ auth: this.config.token });

    // Load all tools and handlers from modular files
    this.tools = getAllTools();
    this.handlers = getAllHandlers();

    // Set up request handlers
    this.setupRequestHandlers();

    // Log startup information
    this.logStartupInfo();
  }

  /**
   * Load and validate configuration from environment variables
   */
  private loadConfiguration(): ServerConfig {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    if (!owner || !repo) {
      console.warn('⚠️ GITHUB_OWNER and GITHUB_REPO not set - some tools may fail');
    }

    return {
      token,
      owner: owner || '',
      repo: repo || ''
    };
  }

  /**
   * Set up MCP request handlers
   */
  private setupRequestHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: this.tools };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        // Find and execute the requested tool
        const handler = this.handlers[name];
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        // Execute the tool with the configured GitHub client and repository info
        return await handler(args, this.octokit, this.config.owner, this.config.repo);

      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        // Log the error for debugging
        console.error(`Tool execution error [${request.params.name}]:`, error);
        
        throw new McpError(
          ErrorCode.InternalError, 
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * Log startup information and tool summary
   */
  private logStartupInfo(): void {
    const summary = getToolsSummary();
    const totalTools = summary.reduce((sum, cat) => sum + cat.toolCount, 0);

    console.error('🚀 GitHub Project Manager MCP Server Starting...');
    console.error(`📦 Version: 3.0.0 (Modular Architecture)`);
    console.error(`🔧 Total Tools: ${totalTools}`);
    console.error(`📁 Repository: ${this.config.owner}/${this.config.repo || '[not configured]'}`);
    console.error('');
    console.error('📊 Tool Categories:');
    
    summary.forEach(category => {
      console.error(`   • ${category.category}: ${category.toolCount} tools`);
    });
    console.error('');
  }

  /**
   * Start the MCP server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('✅ GitHub Project Manager MCP server running on stdio');
    console.error('🎯 Ready to handle requests!');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> { 
  try {
    const server = new GitHubProjectManagerServer(); 
    await server.run(); 
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch(console.error);
