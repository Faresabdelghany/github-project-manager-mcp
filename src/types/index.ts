import { Octokit } from '@octokit/rest';

// Base tool interface
export interface BaseTool {
  name: string;
  description: string;
  inputSchema: any;
}

// Tool handler function signature
export interface ToolHandler {
  (args: any, octokit: Octokit, owner: string, repo: string): Promise<ToolResponse>;
}

// Standard response format for all tools
export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

// Tool category for organization
export interface ToolCategory {
  name: string;
  tools: BaseTool[];
  handlers: Record<string, ToolHandler>;
}

// Configuration for the MCP server
export interface ServerConfig {
  owner: string;
  repo: string;
  token: string;
}

// Shared validation utilities
export interface ValidationConfig {
  owner: string;
  repo: string;
}
