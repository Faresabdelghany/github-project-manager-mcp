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
        version: '3.0.0',
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

        // Execute the tool and return proper MCP response
        const toolResponse = await toolHandler(this.config, args);
        return toolResponse;
      } catch (error) {
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error("🚀 GitHub Project Manager MCP server running on stdio");
    console.error(`📦 Repository: ${this.config.owner}/${this.config.repo}`);
    console.error(`🛠️  Tools available: ${Object.keys(toolRegistry).length} modular tools`);
    console.error("✨ Modular architecture with organized tool structure");
  }
}

async function main() { 
  try {
    const server = new GitHubProjectManagerServer(); 
    await server.run(); 
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

main().catch(console.error);