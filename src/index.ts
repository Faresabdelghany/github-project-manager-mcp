#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

class GitHubProjectManagerServer {
  private server: Server;
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor() {
    this.server = new Server({ name: "github-project-manager", version: "1.0.0" });
    
    // Initialize GitHub API client
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }
    
    this.octokit = new Octokit({ auth: githubToken });
    this.owner = process.env.GITHUB_OWNER || "";
    this.repo = process.env.GITHUB_REPO || "";
    
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ 
      tools: [
        { 
          name: "create_issue", 
          description: "Create a new GitHub issue in the configured repository", 
          inputSchema: { 
            type: "object", 
            properties: { 
              title: { type: "string", description: "Issue title" },
              body: { type: "string", description: "Issue description" },
              labels: { type: "array", items: { type: "string" }, description: "Labels to add" },
              assignees: { type: "array", items: { type: "string" }, description: "Assignees" }
            }, 
            required: ["title"] 
          } 
        },
        { 
          name: "list_issues", 
          description: "List issues from the configured repository", 
          inputSchema: { 
            type: "object", 
            properties: { 
              state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state" },
              labels: { type: "string", description: "Comma-separated list of labels" },
              assignee: { type: "string", description: "Assignee username" }
            } 
          } 
        },
        { 
          name: "create_label", 
          description: "Create a new label in the configured repository", 
          inputSchema: { 
            type: "object", 
            properties: { 
              name: { type: "string", description: "Label name" },
              color: { type: "string", description: "Label color (hex without #)" },
              description: { type: "string", description: "Label description" }
            }, 
            required: ["name", "color"] 
          } 
        },
        { 
          name: "list_labels", 
          description: "List all labels in the configured repository", 
          inputSchema: { 
            type: "object", 
            properties: {} 
          } 
        },
        { 
          name: "create_milestone", 
          description: "Create a new milestone in the configured repository", 
          inputSchema: { 
            type: "object", 
            properties: { 
              title: { type: "string", description: "Milestone title" },
              description: { type: "string", description: "Milestone description" },
              due_on: { type: "string", description: "Due date (ISO 8601 format)" }
            }, 
            required: ["title"] 
          } 
        },
        { 
          name: "list_milestones", 
          description: "List milestones from the configured repository", 
          inputSchema: { 
            type: "object", 
            properties: { 
              state: { type: "string", enum: ["open", "closed", "all"], description: "Milestone state" }
            } 
          } 
        }
      ] 
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case "create_issue": return await this.handleCreateIssue(args);
          case "list_issues": return await this.handleListIssues(args);
          case "create_label": return await this.handleCreateLabel(args);
          case "list_labels": return await this.handleListLabels(args);
          case "create_milestone": return await this.handleCreateMilestone(args);
          case "list_milestones": return await this.handleListMilestones(args);
          default: throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return { 
          content: [{ 
            type: "text", 
            text: `Error: ${error instanceof Error ? error.message : String(error)}` 
          }], 
          isError: true 
        };
      }
    });
  }

  private async handleCreateIssue(args: any) {
    const { title, body, labels, assignees } = args;
    
    if (!this.owner || !this.repo) {
      throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables must be set");
    }

    try {
      const response = await this.octokit.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body: body || "",
        labels: labels || [],
        assignees: assignees || []
      });

      return {
        content: [{
          type: "text",
          text: `✅ Issue created successfully!\n\n**Title:** ${response.data.title}\n**Number:** #${response.data.number}\n**URL:** ${response.data.html_url}\n**State:** ${response.data.state}`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  private async handleListIssues(args: any) {
    const { state = "open", labels, assignee } = args;
    
    if (!this.owner || !this.repo) {
      throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables must be set");
    }

    try {
      const response = await this.octokit.rest.issues.list({
        owner: this.owner,
        repo: this.repo,
        state: state as any,
        labels: labels,
        assignee: assignee,
        per_page: 30
      });

      const issues = response.data.map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        assignee: issue.assignee?.login || "Unassigned",
        labels: issue.labels.map((label: any) => label.name).join(", "),
        url: issue.html_url
      }));

      let result = `📋 **Issues (${state})** - Found ${issues.length} issues\n\n`;
      
      if (issues.length === 0) {
        result += "No issues found.";
      } else {
        issues.forEach(issue => {
          result += `**#${issue.number}** - ${issue.title}\n`;
          result += `   🏷️ Labels: ${issue.labels || "None"}\n`;
          result += `   👤 Assignee: ${issue.assignee}\n`;
          result += `   🔗 ${issue.url}\n\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to list issues: ${error.message}`);
    }
  }

  private async handleCreateLabel(args: any) {
    const { name, color, description } = args;
    
    if (!this.owner || !this.repo) {
      throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables must be set");
    }

    try {
      const response = await this.octokit.rest.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name,
        color: color.replace('#', ''), // Remove # if present
        description: description || ""
      });

      return {
        content: [{
          type: "text",
          text: `✅ Label created successfully!\n\n**Name:** ${response.data.name}\n**Color:** #${response.data.color}\n**Description:** ${response.data.description || "None"}`
        }]
      };
    } catch (error: any) {
      if (error.status === 422) {
        throw new Error(`Label "${name}" already exists`);
      }
      throw new Error(`Failed to create label: ${error.message}`);
    }
  }

  private async handleListLabels(args: any) {
    if (!this.owner || !this.repo) {
      throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables must be set");
    }

    try {
      const response = await this.octokit.rest.issues.listLabelsForRepo({
        owner: this.owner,
        repo: this.repo,
        per_page: 100
      });

      let result = `🏷️ **Repository Labels** - Found ${response.data.length} labels\n\n`;
      
      if (response.data.length === 0) {
        result += "No labels found.";
      } else {
        response.data.forEach(label => {
          result += `**${label.name}** 🎨 #${label.color}\n`;
          if (label.description) {
            result += `   📝 ${label.description}\n`;
          }
          result += "\n";
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to list labels: ${error.message}`);
    }
  }

  private async handleCreateMilestone(args: any) {
    const { title, description, due_on } = args;
    
    if (!this.owner || !this.repo) {
      throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables must be set");
    }

    try {
      const milestoneData: any = {
        owner: this.owner,
        repo: this.repo,
        title,
        description: description || ""
      };

      if (due_on) {
        milestoneData.due_on = due_on;
      }

      const response = await this.octokit.rest.issues.createMilestone(milestoneData);

      return {
        content: [{
          type: "text",
          text: `✅ Milestone created successfully!\n\n**Title:** ${response.data.title}\n**Number:** ${response.data.number}\n**Description:** ${response.data.description || "None"}\n**Due Date:** ${response.data.due_on ? new Date(response.data.due_on).toLocaleDateString() : "Not set"}\n**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to create milestone: ${error.message}`);
    }
  }

  private async handleListMilestones(args: any) {
    const { state = "open" } = args;
    
    if (!this.owner || !this.repo) {
      throw new Error("GITHUB_OWNER and GITHUB_REPO environment variables must be set");
    }

    try {
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: state as any,
        per_page: 30
      });

      let result = `🎯 **Milestones (${state})** - Found ${response.data.length} milestones\n\n`;
      
      if (response.data.length === 0) {
        result += "No milestones found.";
      } else {
        response.data.forEach(milestone => {
          result += `**${milestone.title}** (#${milestone.number})\n`;
          if (milestone.description) {
            result += `   📝 ${milestone.description}\n`;
          }
          result += `   📊 Progress: ${milestone.closed_issues}/${milestone.open_issues + milestone.closed_issues} issues closed\n`;
          if (milestone.due_on) {
            result += `   📅 Due: ${new Date(milestone.due_on).toLocaleDateString()}\n`;
          }
          result += `   🔗 ${milestone.html_url}\n\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to list milestones: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
  }
}

async function main() { 
  try {
    const server = new GitHubProjectManagerServer(); 
    await server.run(); 
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main().catch(console.error);