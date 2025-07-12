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

class GitHubProjectManagerServer {
  private server: Server;
  private octokit: Octokit;
  private graphqlWithAuth: any;
  private owner: string;
  private repo: string;

  constructor() {
    this.server = new Server(
      {
        name: 'github-project-manager',
        version: '3.0.0',
      }
    );

    // Initialize Octokit with GitHub token
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    this.octokit = new Octokit({ auth: token });
    
    // Initialize GraphQL client with authentication
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
    
    this.owner = process.env.GITHUB_OWNER || '';
    this.repo = process.env.GITHUB_REPO || '';

    this.setupToolHandlers();
  }

  private validateRepoConfig() {
    if (!this.owner || !this.repo) {
      throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // PROJECT MANAGEMENT
          {
            name: 'create_project',
            description: 'Create a new GitHub Projects v2',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Project title' },
                description: { type: 'string', description: 'Project description' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_projects',
            description: 'List GitHub Projects v2 for the repository owner',
            inputSchema: {
              type: 'object',
              properties: {
                first: { type: 'number', description: 'Number of projects to fetch (default: 10)' }
              },
              required: []
            }
          },
          {
            name: 'get_project',
            description: 'Get details of a specific GitHub Projects v2',
            inputSchema: {
              type: 'object',
              properties: {
                project_number: { type: 'number', description: 'Project number' }
              },
              required: ['project_number']
            }
          },
          // MILESTONE MANAGEMENT
          {
            name: 'create_milestone',
            description: 'Create a project milestone',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Milestone title' },
                description: { type: 'string', description: 'Milestone description' },
                due_on: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
                state: { type: 'string', enum: ['open', 'closed'], description: 'Milestone state' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_milestones',
            description: 'List milestones with filtering options',
            inputSchema: {
              type: 'object',
              properties: {
                state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Milestone state filter' }
              },
              required: []
            }
          },
          // ISSUE MANAGEMENT
          {
            name: 'create_issue',
            description: 'Create a new GitHub issue',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Issue title' },
                body: { type: 'string', description: 'Issue description' },
                labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
                assignees: { type: 'array', items: { type: 'string' }, description: 'Issue assignees' },
                milestone: { type: 'number', description: 'Milestone number' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_issues',
            description: 'List issues with filtering and sorting',
            inputSchema: {
              type: 'object',
              properties: {
                state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state' },
                labels: { type: 'string', description: 'Comma-separated list of labels' },
                assignee: { type: 'string', description: 'Filter by assignee' },
                milestone: { type: 'string', description: 'Filter by milestone' }
              },
              required: []
            }
          },
          // LABELS
          {
            name: 'create_label',
            description: 'Create a new GitHub label',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Label name' },
                color: { type: 'string', description: 'Label color (hex without #)' },
                description: { type: 'string', description: 'Label description' }
              },
              required: ['name', 'color']
            }
          },
          {
            name: 'list_labels',
            description: 'List all available labels',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          // PROJECT MANAGEMENT
          case 'create_project':
            return await this.handleCreateProject(args);
          case 'list_projects':
            return await this.handleListProjects(args);
          case 'get_project':
            return await this.handleGetProject(args);

          // MILESTONE MANAGEMENT
          case 'create_milestone':
            return await this.handleCreateMilestone(args);
          case 'list_milestones':
            return await this.handleListMilestones(args);

          // ISSUE MANAGEMENT
          case 'create_issue':
            return await this.handleCreateIssue(args);
          case 'list_issues':
            return await this.handleListIssues(args);

          // LABELS
          case 'create_label':
            return await this.handleCreateLabel(args);
          case 'list_labels':
            return await this.handleListLabels(args);

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  // PROJECT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateProject(args: any) {
    this.validateRepoConfig();

    try {
      // Get the repository owner's node ID for GitHub Projects v2
      const ownerQuery = `
        query($owner: String!) {
          repositoryOwner(login: $owner) {
            id
            login
          }
        }
      `;

      const ownerData: any = await this.graphqlWithAuth(ownerQuery, {
        owner: this.owner
      });

      const ownerId = ownerData.repositoryOwner.id;

      // Create the project using GraphQL
      const createProjectMutation = `
        mutation($ownerId: ID!, $title: String!, $description: String) {
          createProjectV2(input: {
            ownerId: $ownerId
            title: $title
            description: $description
          }) {
            projectV2 {
              id
              number
              title
              shortDescription
              url
              public
              closed
              createdAt
              updatedAt
            }
          }
        }
      `;

      const projectData: any = await this.graphqlWithAuth(createProjectMutation, {
        ownerId,
        title: args.title,
        description: args.description || null
      });

      const project = projectData.createProjectV2.projectV2;

      let result = `🚀 **GitHub Project v2 created successfully!**\n\n`;
      result += `**Title:** ${project.title}\n`;
      result += `**Number:** #${project.number}\n`;
      result += `**Description:** ${project.shortDescription || 'None'}\n`;
      result += `**Public:** ${project.public}\n`;
      result += `**Status:** ${project.closed ? 'Closed' : 'Open'}\n`;
      result += `**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n`;
      result += `**URL:** ${project.url}\n\n`;
      result += `💡 **Next Steps:**\n`;
      result += `• Add issues to the project using the GitHub web interface\n`;
      result += `• Configure project views and fields\n`;
      result += `• Set up project workflows and automation`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  private async handleListProjects(args: any) {
    this.validateRepoConfig();

    try {
      const first = args.first || 10;

      // Query for projects owned by the repository owner
      const listProjectsQuery = `
        query($owner: String!, $first: Int!) {
          repositoryOwner(login: $owner) {
            projectsV2(first: $first, orderBy: {field: UPDATED_AT, direction: DESC}) {
              nodes {
                id
                number
                title
                shortDescription
                url
                public
                closed
                createdAt
                updatedAt
                items(first: 5) {
                  totalCount
                }
              }
              totalCount
            }
          }
        }
      `;

      const data: any = await this.graphqlWithAuth(listProjectsQuery, {
        owner: this.owner,
        first
      });

      const projects = data.repositoryOwner.projectsV2.nodes;
      const totalCount = data.repositoryOwner.projectsV2.totalCount;

      let result = `📋 **GitHub Projects v2** - Found ${totalCount} projects\n\n`;
      
      if (projects.length === 0) {
        result += "No projects found for this owner.";
      } else {
        projects.forEach((project: any) => {
          result += `**${project.title}** (#${project.number})\n`;
          result += `   📝 Description: ${project.shortDescription || 'No description'}\n`;
          result += `   📊 Items: ${project.items.totalCount}\n`;
          result += `   🔒 Visibility: ${project.public ? 'Public' : 'Private'}\n`;
          result += `   📅 Updated: ${new Date(project.updatedAt).toLocaleDateString()}\n`;
          result += `   🔗 URL: ${project.url}\n\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  private async handleGetProject(args: any) {
    this.validateRepoConfig();

    try {
      // Query for a specific project by number
      const getProjectQuery = `
        query($owner: String!, $number: Int!) {
          repositoryOwner(login: $owner) {
            projectV2(number: $number) {
              id
              number
              title
              shortDescription
              readme
              url
              public
              closed
              createdAt
              updatedAt
              items(first: 20) {
                totalCount
                nodes {
                  id
                  type
                  content {
                    ... on Issue {
                      number
                      title
                      state
                      assignees(first: 3) {
                        nodes {
                          login
                        }
                      }
                    }
                    ... on PullRequest {
                      number
                      title
                      state
                      assignees(first: 3) {
                        nodes {
                          login
                        }
                      }
                    }
                  }
                }
              }
              fields(first: 10) {
                nodes {
                  id
                  name
                  dataType
                }
              }
              views(first: 5) {
                nodes {
                  id
                  name
                  layout
                }
              }
            }
          }
        }
      `;

      const data: any = await this.graphqlWithAuth(getProjectQuery, {
        owner: this.owner,
        number: args.project_number
      });

      const project = data.repositoryOwner.projectV2;

      if (!project) {
        throw new Error(`Project #${args.project_number} not found`);
      }

      let result = `📊 **Project Details: ${project.title}**\n\n`;
      result += `**Number:** #${project.number}\n`;
      result += `**Description:** ${project.shortDescription || 'No description'}\n`;
      result += `**Visibility:** ${project.public ? 'Public' : 'Private'}\n`;
      result += `**Status:** ${project.closed ? 'Closed' : 'Open'}\n`;
      result += `**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n`;
      result += `**Updated:** ${new Date(project.updatedAt).toLocaleDateString()}\n`;
      result += `**URL:** ${project.url}\n\n`;

      // Project items
      result += `**📋 Items (${project.items.totalCount} total):**\n`;
      if (project.items.nodes.length > 0) {
        project.items.nodes.forEach((item: any) => {
          if (item.content) {
            const content = item.content;
            const assignees = content.assignees?.nodes.map((a: any) => a.login).join(', ') || 'Unassigned';
            result += `   • #${content.number}: ${content.title} (${content.state}) - ${assignees}\n`;
          }
        });
      } else {
        result += `   No items in this project\n`;
      }

      // Project fields
      if (project.fields.nodes.length > 0) {
        result += `\n**🏷️ Custom Fields:**\n`;
        project.fields.nodes.forEach((field: any) => {
          result += `   • ${field.name} (${field.dataType})\n`;
        });
      }

      // Project views
      if (project.views.nodes.length > 0) {
        result += `\n**👁️ Views:**\n`;
        project.views.nodes.forEach((view: any) => {
          result += `   • ${view.name} (${view.layout})\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get project: ${error.message}`);
    }
  }

  // MILESTONE MANAGEMENT IMPLEMENTATIONS
  private async handleCreateMilestone(args: any) {
    this.validateRepoConfig();
    
    try {
      const response = await this.octokit.rest.issues.createMilestone({
        owner: this.owner,
        repo: this.repo,
        title: args.title,
        description: args.description,
        due_on: args.due_on,
        state: args.state || 'open'
      });

      return {
        content: [{
          type: "text",
          text: `✅ **Milestone created successfully!**\n\n**Title:** ${response.data.title}\n**Number:** ${response.data.number}\n**Description:** ${response.data.description || 'None'}\n**Due Date:** ${response.data.due_on || 'Not set'}\n**State:** ${response.data.state}\n**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to create milestone: ${error.message}`);
    }
  }

  private async handleListMilestones(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: args.state || 'open',
        per_page: 100
      });

      let result = `🎯 **Repository Milestones** - Found ${response.data.length} milestones\n\n`;
      
      if (response.data.length === 0) {
        result += "No milestones found.";
      } else {
        response.data.forEach(milestone => {
          const progress = milestone.closed_issues + milestone.open_issues > 0 
            ? Math.round((milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100)
            : 0;
          
          result += `**${milestone.title}** (#${milestone.number})\n`;
          result += `   📅 Due: ${milestone.due_on ? new Date(milestone.due_on).toLocaleDateString() : 'Not set'}\n`;
          result += `   📊 Progress: ${progress}% (${milestone.closed_issues}/${milestone.closed_issues + milestone.open_issues} issues completed)\n`;
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

  // ISSUE MANAGEMENT IMPLEMENTATIONS
  private async handleCreateIssue(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: args.title,
        body: args.body,
        labels: args.labels,
        assignees: args.assignees,
        milestone: args.milestone
      });

      return {
        content: [{
          type: "text",
          text: `✅ **Issue created successfully!**\n\n**Title:** ${response.data.title}\n**Number:** #${response.data.number}\n**State:** ${response.data.state}\n**Labels:** ${response.data.labels.map((l: any) => l.name).join(', ') || 'None'}\n**Assignees:** ${response.data.assignees?.map((a: any) => a.login).join(', ') || 'None'}\n**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  private async handleListIssues(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: args.state || 'open',
        labels: args.labels,
        assignee: args.assignee,
        milestone: args.milestone,
        per_page: 50
      });

      let result = `📋 **Repository Issues** - Found ${response.data.length} issues\n\n`;
      
      if (response.data.length === 0) {
        result += "No issues found matching the criteria.";
      } else {
        response.data.forEach(issue => {
          result += `**${issue.title}** (#${issue.number})\n`;
          result += `   🏷️ Labels: ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n`;
          result += `   👤 Assignees: ${issue.assignees?.map((a: any) => a.login).join(', ') || 'None'}\n`;
          result += `   📅 Created: ${new Date(issue.created_at).toLocaleDateString()}\n`;
          result += `   🔗 ${issue.html_url}\n\n`;
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

  // LABELS IMPLEMENTATIONS
  private async handleCreateLabel(args: any) {
    this.validateRepoConfig();
    const { name, color, description } = args;

    try {
      const response = await this.octokit.rest.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name,
        color: color.replace('#', ''),
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
    this.validateRepoConfig();

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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🚀 GitHub Project Manager MCP server running on stdio");
    console.error(`📦 Repository: ${this.owner}/${this.repo}`);
    console.error("🛠️  Tools available: 9 core project management tools with GitHub Projects v2 support");
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