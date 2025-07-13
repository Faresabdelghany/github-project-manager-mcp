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

  private formatDateForGitHub(dateString?: string): string | undefined {
    if (!dateString) return undefined;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
      }
      return date.toISOString();
    } catch (error) {
      console.error('Date formatting error:', error);
      return undefined;
    }
  }

  // Helper method to determine if owner is a user or organization
  private async getOwnerType(): Promise<'USER' | 'ORGANIZATION'> {
    try {
      const query = `
        query($login: String!) {
          user(login: $login) {
            id
          }
          organization(login: $login) {
            id
          }
        }
      `;
      
      const result = await this.graphqlWithAuth(query, { login: this.owner });
      
      if (result.organization) {
        return 'ORGANIZATION';
      } else if (result.user) {
        return 'USER';
      } else {
        throw new Error(`Unable to determine owner type for ${this.owner}`);
      }
    } catch (error) {
      console.error('Error determining owner type:', error);
      // Default to USER if unable to determine
      return 'USER';
    }
  }

  // Helper method to get repository ID for Projects v2
  private async getRepositoryId(): Promise<string> {
    try {
      const query = `
        query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            id
          }
        }
      `;
      
      const result = await this.graphqlWithAuth(query, { 
        owner: this.owner, 
        name: this.repo 
      });
      
      return result.repository.id;
    } catch (error) {
      throw new Error(`Failed to get repository ID: ${error.message}`);
    }
  }

  private createSprintDescription(metadata: any): string {
    const sprintData = {
      type: 'sprint',
      sprintNumber: metadata.sprintNumber,
      goals: metadata.goals || [],
      duration: metadata.duration || 14,
      startDate: metadata.startDate,
      endDate: metadata.endDate,
      description: metadata.description || '',
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return `<!-- SPRINT_METADATA:${JSON.stringify(sprintData)} -->\n\n${metadata.description || ''}`;
  }

  private parseSprintDescription(description: string): any {
    if (!description) return null;
    
    const match = description.match(/<!-- SPRINT_METADATA:(.*?) -->/);
    if (!match) return null;

    try {
      return JSON.parse(match[1]);
    } catch (error) {
      return null;
    }
  }

  private getSprintStatus(sprintData: any, milestone: any): string {
    const today = new Date();
    const startDate = new Date(sprintData.startDate);
    const endDate = new Date(sprintData.endDate || milestone.due_on);

    if (milestone.state === 'closed') {
      return 'completed';
    }

    if (today < startDate) {
      return 'planned';
    } else if (today >= startDate && today <= endDate) {
      return 'active';
    } else if (today > endDate) {
      return 'overdue';
    }

    return 'unknown';
  }

  private async getNextSprintNumber(): Promise<number> {
    try {
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: 'all',
        per_page: 100
      });

      let maxSprintNumber = 0;
      
      response.data.forEach(milestone => {
        const sprintData = this.parseSprintDescription(milestone.description || '');
        if (sprintData && sprintData.type === 'sprint' && sprintData.sprintNumber) {
          maxSprintNumber = Math.max(maxSprintNumber, sprintData.sprintNumber);
        }
      });

      return maxSprintNumber + 1;
    } catch (error) {
      console.error('Error getting next sprint number:', error);
      return 1;
    }
  }

  // AI-powered issue analysis methods
  private analyzeIssueComplexity(issue: any): number {
    let complexity = 1;
    
    // Analyze title complexity
    const titleWords = issue.title.split(' ').length;
    if (titleWords > 10) complexity += 1;
    
    // Analyze body complexity
    if (issue.body) {
      const bodyLength = issue.body.length;
      if (bodyLength > 1000) complexity += 2;
      else if (bodyLength > 500) complexity += 1;
      
      // Check for technical keywords
      const technicalKeywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security'];
      const techCount = technicalKeywords.filter(keyword => 
        issue.body.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      complexity += Math.min(techCount, 3);
    }
    
    // Analyze labels for complexity indicators
    const complexityLabels = issue.labels.filter((label: any) => 
      ['epic', 'large', 'complex', 'research', 'spike'].some(keyword => 
        label.name.toLowerCase().includes(keyword)
      )
    );
    complexity += complexityLabels.length;
    
    // Check for dependencies or linked issues
    if (issue.body && issue.body.includes('#')) {
      complexity += 1;
    }
    
    return Math.min(complexity, 8); // Cap at 8 story points
  }

  private calculateIssuePriority(issue: any): number {
    let priority = 1;
    
    // Priority labels
    const priorityMap = {
      'critical': 5,
      'high': 4,
      'medium': 3,
      'low': 2,
      'lowest': 1
    };
    
    for (const label of issue.labels) {
      const labelName = label.name.toLowerCase();
      for (const [key, value] of Object.entries(priorityMap)) {
        if (labelName.includes(key)) {
          priority = Math.max(priority, value);
        }
      }
    }
    
    // Bug priority boost
    const isBug = issue.labels.some((label: any) => 
      label.name.toLowerCase().includes('bug')
    );
    if (isBug) priority += 1;
    
    // Recent activity boost
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUpdate < 7) priority += 0.5;
    
    return Math.min(priority, 5);
  }

  private groupIssuesByTheme(issues: any[]): { [theme: string]: any[] } {
    const themes: { [theme: string]: any[] } = {
      'Frontend': [],
      'Backend': [],
      'Database': [],
      'Infrastructure': [],
      'Testing': [],
      'Documentation': [],
      'Bug Fixes': [],
      'Feature': [],
      'Other': []
    };
    
    issues.forEach(issue => {
      let categorized = false;
      
      // Check labels first
      for (const label of issue.labels) {
        const labelName = label.name.toLowerCase();
        if (labelName.includes('frontend') || labelName.includes('ui') || labelName.includes('css')) {
          themes['Frontend'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('backend') || labelName.includes('api') || labelName.includes('server')) {
          themes['Backend'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('database') || labelName.includes('db') || labelName.includes('sql')) {
          themes['Database'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('infrastructure') || labelName.includes('devops') || labelName.includes('deploy')) {
          themes['Infrastructure'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('test') || labelName.includes('qa')) {
          themes['Testing'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('doc') || labelName.includes('readme')) {
          themes['Documentation'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('bug') || labelName.includes('fix')) {
          themes['Bug Fixes'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('feature') || labelName.includes('enhancement')) {
          themes['Feature'].push(issue);
          categorized = true;
          break;
        }
      }
      
      // If not categorized by labels, check title/body
      if (!categorized) {
        const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
        if (text.includes('frontend') || text.includes('ui') || text.includes('interface')) {
          themes['Frontend'].push(issue);
        } else if (text.includes('backend') || text.includes('api') || text.includes('server')) {
          themes['Backend'].push(issue);
        } else if (text.includes('database') || text.includes('db')) {
          themes['Database'].push(issue);
        } else if (text.includes('deploy') || text.includes('infrastructure')) {
          themes['Infrastructure'].push(issue);
        } else if (text.includes('test')) {
          themes['Testing'].push(issue);
        } else if (text.includes('document')) {
          themes['Documentation'].push(issue);
        } else if (text.includes('bug') || text.includes('fix') || text.includes('error')) {
          themes['Bug Fixes'].push(issue);
        } else {
          themes['Other'].push(issue);
        }
      }
    });
    
    // Remove empty themes
    Object.keys(themes).forEach(key => {
      if (themes[key].length === 0) {
        delete themes[key];
      }
    });
    
    return themes;
  }

  private categorizeIssuesByType(issues: any[]): { [type: string]: any[] } {
    const categories = {
      'Epic': [],
      'Feature': [],
      'Bug': [],
      'Task': [],
      'Research': [],
      'Infrastructure': [],
      'Documentation': []
    };
    
    issues.forEach(issue => {
      let categorized = false;
      
      // Check labels for type indicators
      for (const label of issue.labels) {
        const labelName = label.name.toLowerCase();
        if (labelName.includes('epic')) {
          categories['Epic'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('feature') || labelName.includes('enhancement')) {
          categories['Feature'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('bug') || labelName.includes('fix')) {
          categories['Bug'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('research') || labelName.includes('spike') || labelName.includes('investigation')) {
          categories['Research'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('infrastructure') || labelName.includes('devops') || labelName.includes('deploy')) {
          categories['Infrastructure'].push(issue);
          categorized = true;
          break;
        } else if (labelName.includes('doc') || labelName.includes('readme')) {
          categories['Documentation'].push(issue);
          categorized = true;
          break;
        }
      }
      
      // If not categorized by labels, check title/body
      if (!categorized) {
        const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
        if (text.includes('epic') || issue.title.toLowerCase().startsWith('epic:')) {
          categories['Epic'].push(issue);
        } else if (text.includes('feature') || text.includes('add') || text.includes('implement')) {
          categories['Feature'].push(issue);
        } else if (text.includes('bug') || text.includes('fix') || text.includes('error')) {
          categories['Bug'].push(issue);
        } else if (text.includes('research') || text.includes('investigate') || text.includes('spike')) {
          categories['Research'].push(issue);
        } else if (text.includes('deploy') || text.includes('infrastructure') || text.includes('setup')) {
          categories['Infrastructure'].push(issue);
        } else if (text.includes('document') || text.includes('readme') || text.includes('guide')) {
          categories['Documentation'].push(issue);
        } else {
          categories['Task'].push(issue);
        }
      }
    });
    
    // Remove empty categories
    Object.keys(categories).forEach(key => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });
    
    return categories;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // PROJECT MANAGEMENT (Fixed GitHub Projects v2)
          {
            name: 'create_project',
            description: 'Create a new GitHub Projects v2 project',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Project title' },
                description: { type: 'string', description: 'Project description (optional)' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_projects',
            description: 'List GitHub Projects v2 projects',
            inputSchema: {
              type: 'object',
              properties: {
                first: { type: 'number', description: 'Number of projects to fetch (max 100, default 20)', minimum: 1, maximum: 100 },
                include_closed: { type: 'boolean', description: 'Include closed projects (default: false)' }
              },
              required: []
            }
          },
          {
            name: 'get_project',
            description: 'Get detailed information about a specific GitHub Projects v2 project',
            inputSchema: {
              type: 'object',
              properties: {
                project_number: { type: 'number', description: 'Project number' }
              },
              required: ['project_number']
            }
          },
          {
            name: 'update_project',
            description: 'Update GitHub Projects v2 project details',
            inputSchema: {
              type: 'object',
              properties: {
                project_number: { type: 'number', description: 'Project number' },
                title: { type: 'string', description: 'New project title' },
                description: { type: 'string', description: 'New project description' },
                closed: { type: 'boolean', description: 'Whether to close the project' }
              },
              required: ['project_number']
            }
          },
          {
            name: 'delete_project',
            description: 'Delete a GitHub Projects v2 project',
            inputSchema: {
              type: 'object',
              properties: {
                project_number: { type: 'number', description: 'Project number' },
                confirm: { type: 'boolean', description: 'Confirmation required (must be true)' }
              },
              required: ['project_number', 'confirm']
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
          {
            name: 'get_issue',
            description: 'Get detailed issue information',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number' }
              },
              required: ['issue_number']
            }
          },
          {
            name: 'update_issue',
            description: 'Update existing issues',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number' },
                title: { type: 'string', description: 'Issue title' },
                body: { type: 'string', description: 'Issue description' },
                state: { type: 'string', enum: ['open', 'closed'], description: 'Issue state' },
                labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
                assignees: { type: 'array', items: { type: 'string' }, description: 'Issue assignees' },
                milestone: { type: 'number', description: 'Milestone number' }
              },
              required: ['issue_number']
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
          {
            name: 'get_milestone_metrics',
            description: 'Get progress metrics for milestones',
            inputSchema: {
              type: 'object',
              properties: {
                milestone_number: { type: 'number', description: 'Milestone number' }
              },
              required: ['milestone_number']
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
          },
          // REPOSITORY INSIGHTS
          {
            name: 'get_repository_summary',
            description: 'Get comprehensive repository summary with metrics',
            inputSchema: {
              type: 'object',
              properties: {
                include_trends: { type: 'boolean', description: 'Include trend analysis (default: true)' }
              },
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
          // PROJECT MANAGEMENT (Fixed GitHub Projects v2)
          case 'create_project':
            return await this.handleCreateProject(args);
          case 'list_projects':
            return await this.handleListProjects(args);
          case 'get_project':
            return await this.handleGetProject(args);
          case 'update_project':
            return await this.handleUpdateProject(args);
          case 'delete_project':
            return await this.handleDeleteProject(args);

          // ISSUE MANAGEMENT
          case 'create_issue':
            return await this.handleCreateIssue(args);
          case 'list_issues':
            return await this.handleListIssues(args);
          case 'get_issue':
            return await this.handleGetIssue(args);
          case 'update_issue':
            return await this.handleUpdateIssue(args);

          // MILESTONE MANAGEMENT
          case 'create_milestone':
            return await this.handleCreateMilestone(args);
          case 'list_milestones':
            return await this.handleListMilestones(args);
          case 'get_milestone_metrics':
            return await this.handleGetMilestoneMetrics(args);

          // LABELS
          case 'create_label':
            return await this.handleCreateLabel(args);
          case 'list_labels':
            return await this.handleListLabels(args);

          // REPOSITORY INSIGHTS
          case 'get_repository_summary':
            return await this.handleGetRepositorySummary(args);

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

  // FIXED PROJECT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateProject(args: any) {
    this.validateRepoConfig();

    try {
      const ownerType = await this.getOwnerType();
      
      const mutation = `
        mutation($input: CreateProjectV2Input!) {
          createProjectV2(input: $input) {
            projectV2 {
              id
              number
              title
              url
              shortDescription
              closed
              createdAt
              updatedAt
            }
          }
        }
      `;

      const input = {
        ownerId: ownerType === 'ORGANIZATION' ? 
          await this.getOrganizationId() : 
          await this.getUserId(),
        title: args.title,
        ...(args.description && { shortDescription: args.description })
      };

      const result = await this.graphqlWithAuth(mutation, { input });
      const project = result.createProjectV2.projectV2;

      return {
        content: [{
          type: "text",
          text: `✅ **GitHub Projects v2 project created successfully!**\n\n**Title:** ${project.title}\n**Number:** ${project.number}\n**ID:** ${project.id}\n**Description:** ${project.shortDescription || 'None'}\n**Status:** ${project.closed ? 'Closed' : 'Open'}\n**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n**URL:** ${project.url}\n\n💡 **Next Steps:**\n• Use 'add_item_to_project' to add issues and pull requests\n• Use 'create_project_field' to add custom fields\n• Use 'create_project_view' to create custom views`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  private async handleListProjects(args: any) {
    this.validateRepoConfig();

    try {
      const ownerType = await this.getOwnerType();
      const first = Math.min(args.first || 20, 100);
      const includeClosedFilter = args.include_closed ? '' : 'open: true';

      const query = ownerType === 'ORGANIZATION' ? `
        query($login: String!, $first: Int!) {
          organization(login: $login) {
            projectsV2(first: $first, ${includeClosedFilter}) {
              nodes {
                id
                number
                title
                shortDescription
                url
                closed
                createdAt
                updatedAt
                items {
                  totalCount
                }
              }
              totalCount
            }
          }
        }
      ` : `
        query($login: String!, $first: Int!) {
          user(login: $login) {
            projectsV2(first: $first, ${includeClosedFilter}) {
              nodes {
                id
                number
                title
                shortDescription
                url
                closed
                createdAt
                updatedAt
                items {
                  totalCount
                }
              }
              totalCount
            }
          }
        }
      `;

      const result = await this.graphqlWithAuth(query, { 
        login: this.owner, 
        first 
      });

      const projectsData = ownerType === 'ORGANIZATION' ? 
        result.organization.projectsV2 : 
        result.user.projectsV2;

      const projects = projectsData.nodes;
      const totalCount = projectsData.totalCount;

      let response = `📋 **GitHub Projects v2** - Found ${projects.length} projects (${totalCount} total)\n\n`;

      if (projects.length === 0) {
        response += "No projects found.";
      } else {
        projects.forEach((project: any) => {
          response += `**${project.title}** (#${project.number})\n`;
          response += `   📝 Description: ${project.shortDescription || 'None'}\n`;
          response += `   📊 Items: ${project.items.totalCount}\n`;
          response += `   🔄 Status: ${project.closed ? 'Closed' : 'Open'}\n`;
          response += `   📅 Created: ${new Date(project.createdAt).toLocaleDateString()}\n`;
          response += `   🔗 ${project.url}\n\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: response
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  private async handleGetProject(args: any) {
    this.validateRepoConfig();

    try {
      const ownerType = await this.getOwnerType();
      
      const query = ownerType === 'ORGANIZATION' ? `
        query($login: String!, $number: Int!) {
          organization(login: $login) {
            projectV2(number: $number) {
              id
              number
              title
              shortDescription
              readme
              url
              closed
              public
              createdAt
              updatedAt
              items(first: 100) {
                totalCount
                nodes {
                  id
                  type
                  content {
                    ... on Issue {
                      number
                      title
                      state
                      url
                    }
                    ... on PullRequest {
                      number
                      title
                      state
                      url
                    }
                  }
                }
              }
              fields(first: 20) {
                nodes {
                  id
                  name
                  dataType
                }
              }
              views(first: 20) {
                nodes {
                  id
                  name
                  layout
                }
              }
            }
          }
        }
      ` : `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              id
              number
              title
              shortDescription
              readme
              url
              closed
              public
              createdAt
              updatedAt
              items(first: 100) {
                totalCount
                nodes {
                  id
                  type
                  content {
                    ... on Issue {
                      number
                      title
                      state
                      url
                    }
                    ... on PullRequest {
                      number
                      title
                      state
                      url
                    }
                  }
                }
              }
              fields(first: 20) {
                nodes {
                  id
                  name
                  dataType
                }
              }
              views(first: 20) {
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

      const result = await this.graphqlWithAuth(query, { 
        login: this.owner, 
        number: args.project_number 
      });

      const project = ownerType === 'ORGANIZATION' ? 
        result.organization.projectV2 : 
        result.user.projectV2;

      if (!project) {
        throw new Error(`Project #${args.project_number} not found`);
      }

      let response = `🎯 **Project Details: ${project.title}**\n\n`;
      response += `**Number:** #${project.number}\n`;
      response += `**ID:** ${project.id}\n`;
      response += `**Description:** ${project.shortDescription || 'None'}\n`;
      response += `**Status:** ${project.closed ? 'Closed' : 'Open'}\n`;
      response += `**Visibility:** ${project.public ? 'Public' : 'Private'}\n`;
      response += `**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n`;
      response += `**Updated:** ${new Date(project.updatedAt).toLocaleDateString()}\n`;
      response += `**URL:** ${project.url}\n\n`;

      // Items summary
      response += `**📊 Items (${project.items.totalCount}):**\n`;
      const issueCount = project.items.nodes.filter((item: any) => item.type === 'ISSUE').length;
      const prCount = project.items.nodes.filter((item: any) => item.type === 'PULL_REQUEST').length;
      response += `   • Issues: ${issueCount}\n`;
      response += `   • Pull Requests: ${prCount}\n\n`;

      // Custom fields
      if (project.fields.nodes.length > 0) {
        response += `**🔧 Custom Fields (${project.fields.nodes.length}):**\n`;
        project.fields.nodes.forEach((field: any) => {
          response += `   • ${field.name} (${field.dataType})\n`;
        });
        response += `\n`;
      }

      // Views
      if (project.views.nodes.length > 0) {
        response += `**👀 Views (${project.views.nodes.length}):**\n`;
        project.views.nodes.forEach((view: any) => {
          response += `   • ${view.name} (${view.layout})\n`;
        });
        response += `\n`;
      }

      // Recent items
      if (project.items.nodes.length > 0) {
        response += `**📋 Recent Items:**\n`;
        project.items.nodes.slice(0, 10).forEach((item: any) => {
          const content = item.content;
          if (content) {
            const type = item.type === 'ISSUE' ? '🐛' : '🔀';
            response += `   ${type} #${content.number}: ${content.title} (${content.state})\n`;
          }
        });
        if (project.items.totalCount > 10) {
          response += `   ... and ${project.items.totalCount - 10} more items\n`;
        }
      }

      return {
        content: [{
          type: "text",
          text: response
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get project: ${error.message}`);
    }
  }

  private async handleUpdateProject(args: any) {
    this.validateRepoConfig();

    try {
      const ownerType = await this.getOwnerType();
      
      // First get the project ID
      const projectQuery = ownerType === 'ORGANIZATION' ? `
        query($login: String!, $number: Int!) {
          organization(login: $login) {
            projectV2(number: $number) {
              id
              title
              shortDescription
              closed
            }
          }
        }
      ` : `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              id
              title
              shortDescription
              closed
            }
          }
        }
      `;

      const projectResult = await this.graphqlWithAuth(projectQuery, { 
        login: this.owner, 
        number: args.project_number 
      });

      const project = ownerType === 'ORGANIZATION' ? 
        projectResult.organization.projectV2 : 
        projectResult.user.projectV2;

      if (!project) {
        throw new Error(`Project #${args.project_number} not found`);
      }

      const mutation = `
        mutation($input: UpdateProjectV2Input!) {
          updateProjectV2(input: $input) {
            projectV2 {
              id
              number
              title
              shortDescription
              closed
              url
              updatedAt
            }
          }
        }
      `;

      const input: any = {
        projectId: project.id
      };

      if (args.title) input.title = args.title;
      if (args.description !== undefined) input.shortDescription = args.description;
      if (args.closed !== undefined) input.closed = args.closed;

      const result = await this.graphqlWithAuth(mutation, { input });
      const updatedProject = result.updateProjectV2.projectV2;

      return {
        content: [{
          type: "text",
          text: `✅ **Project updated successfully!**\n\n**Title:** ${updatedProject.title}\n**Number:** #${updatedProject.number}\n**Description:** ${updatedProject.shortDescription || 'None'}\n**Status:** ${updatedProject.closed ? 'Closed' : 'Open'}\n**Updated:** ${new Date(updatedProject.updatedAt).toLocaleDateString()}\n**URL:** ${updatedProject.url}`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  private async handleDeleteProject(args: any) {
    this.validateRepoConfig();

    if (!args.confirm) {
      throw new Error('Project deletion requires confirmation. Set confirm: true to proceed.');
    }

    try {
      const ownerType = await this.getOwnerType();
      
      // First get the project ID
      const projectQuery = ownerType === 'ORGANIZATION' ? `
        query($login: String!, $number: Int!) {
          organization(login: $login) {
            projectV2(number: $number) {
              id
              title
              items {
                totalCount
              }
            }
          }
        }
      ` : `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              id
              title
              items {
                totalCount
              }
            }
          }
        }
      `;

      const projectResult = await this.graphqlWithAuth(projectQuery, { 
        login: this.owner, 
        number: args.project_number 
      });

      const project = ownerType === 'ORGANIZATION' ? 
        projectResult.organization.projectV2 : 
        projectResult.user.projectV2;

      if (!project) {
        throw new Error(`Project #${args.project_number} not found`);
      }

      const mutation = `
        mutation($input: DeleteProjectV2Input!) {
          deleteProjectV2(input: $input) {
            projectV2 {
              id
              title
            }
          }
        }
      `;

      const input = {
        projectId: project.id
      };

      await this.graphqlWithAuth(mutation, { input });

      return {
        content: [{
          type: "text",
          text: `✅ **Project deleted successfully!**\n\n**Project:** ${project.title} (#${args.project_number})\n**Items removed:** ${project.items.totalCount}\n\n⚠️ **Note:** This action cannot be undone. All project items, views, and custom fields have been permanently deleted.`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  // Helper methods for GraphQL operations
  private async getOrganizationId(): Promise<string> {
    const query = `
      query($login: String!) {
        organization(login: $login) {
          id
        }
      }
    `;
    
    const result = await this.graphqlWithAuth(query, { login: this.owner });
    return result.organization.id;
  }

  private async getUserId(): Promise<string> {
    const query = `
      query($login: String!) {
        user(login: $login) {
          id
        }
      }
    `;
    
    const result = await this.graphqlWithAuth(query, { login: this.owner });
    return result.user.id;
  }

  // ISSUE MANAGEMENT (Working implementations)
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

  private async handleGetIssue(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: args.issue_number
      });

      const issue = response.data;
      let result = `📝 **Issue Details: ${issue.title}**\n\n`;
      result += `**Number:** #${issue.number}\n`;
      result += `**State:** ${issue.state}\n`;
      result += `**Author:** ${issue.user?.login}\n`;
      result += `**Created:** ${new Date(issue.created_at).toLocaleDateString()}\n`;
      result += `**Updated:** ${new Date(issue.updated_at).toLocaleDateString()}\n`;
      result += `**Labels:** ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n`;
      result += `**Assignees:** ${issue.assignees?.map((a: any) => a.login).join(', ') || 'None'}\n`;
      result += `**Milestone:** ${issue.milestone?.title || 'None'}\n`;
      result += `**Comments:** ${issue.comments}\n`;
      result += `**URL:** ${issue.html_url}\n\n`;
      
      if (issue.body) {
        result += `**Description:**\n${issue.body.length > 200 ? issue.body.substring(0, 200) + '...' : issue.body}`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get issue: ${error.message}`);
    }
  }

  private async handleUpdateIssue(args: any) {
    this.validateRepoConfig();

    try {
      const updateData: any = {
        owner: this.owner,
        repo: this.repo,
        issue_number: args.issue_number
      };

      if (args.title) updateData.title = args.title;
      if (args.body) updateData.body = args.body;
      if (args.state) updateData.state = args.state;
      if (args.labels) updateData.labels = args.labels;
      if (args.assignees) updateData.assignees = args.assignees;
      if (args.milestone) updateData.milestone = args.milestone;

      const response = await this.octokit.rest.issues.update(updateData);

      return {
        content: [{
          type: "text",
          text: `✅ **Issue updated successfully!**\n\n**Title:** ${response.data.title}\n**Number:** #${response.data.number}\n**State:** ${response.data.state}\n**Labels:** ${response.data.labels.map((l: any) => l.name).join(', ') || 'None'}\n**Assignees:** ${response.data.assignees?.map((a: any) => a.login).join(', ') || 'None'}\n**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to update issue: ${error.message}`);
    }
  }

  // MILESTONE MANAGEMENT (Working implementations)
  private async handleCreateMilestone(args: any) {
    this.validateRepoConfig();
    
    try {
      const response = await this.octokit.rest.issues.createMilestone({
        owner: this.owner,
        repo: this.repo,
        title: args.title,
        description: args.description,
        due_on: this.formatDateForGitHub(args.due_on),
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

  private async handleGetMilestoneMetrics(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.getMilestone({
        owner: this.owner,
        repo: this.repo,
        milestone_number: args.milestone_number
      });

      const milestone = response.data;
      const totalIssues = milestone.open_issues + milestone.closed_issues;
      const progress = totalIssues > 0 ? Math.round((milestone.closed_issues / totalIssues) * 100) : 0;
      const daysRemaining = milestone.due_on ? Math.ceil((new Date(milestone.due_on).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

      let result = `📊 **Milestone Metrics: ${milestone.title}**\n\n`;
      result += `**Progress:** ${progress}% completed\n`;
      result += `**Issues:** ${milestone.closed_issues} closed, ${milestone.open_issues} open (${totalIssues} total)\n`;
      
      if (milestone.due_on) {
        result += `**Due Date:** ${new Date(milestone.due_on).toLocaleDateString()}\n`;
        if (daysRemaining !== null) {
          if (daysRemaining > 0) {
            result += `**Days Remaining:** ${daysRemaining}\n`;
          } else if (daysRemaining === 0) {
            result += `**Status:** ⚠️ Due today!\n`;
          } else {
            result += `**Status:** ❌ Overdue by ${Math.abs(daysRemaining)} days\n`;
          }
        }
      }
      
      result += `**URL:** ${milestone.html_url}`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get milestone metrics: ${error.message}`);
    }
  }

  // LABELS (Working implementations)
  private async handleCreateLabel(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.createLabel({
        owner: this.owner,
        repo: this.repo,
        name: args.name,
        color: args.color.replace('#', ''),
        description: args.description || ""
      });

      return {
        content: [{
          type: "text",
          text: `✅ Label created successfully!\n\n**Name:** ${response.data.name}\n**Color:** #${response.data.color}\n**Description:** ${response.data.description || "None"}`
        }]
      };
    } catch (error: any) {
      if (error.status === 422) {
        throw new Error(`Label "${args.name}" already exists`);
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

  // REPOSITORY INSIGHTS
  private async handleGetRepositorySummary(args: any) {
    this.validateRepoConfig();

    try {
      const includeTrends = args.include_trends !== false;

      // Get repository basic info
      const repoResponse = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      const repo = repoResponse.data;

      // Get issues summary
      const [openIssues, closedIssues, openMilestones, closedMilestones, labels] = await Promise.all([
        this.octokit.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: 'open',
          per_page: 100
        }),
        this.octokit.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: 'closed',
          per_page: 100
        }),
        this.octokit.rest.issues.listMilestones({
          owner: this.owner,
          repo: this.repo,
          state: 'open'
        }),
        this.octokit.rest.issues.listMilestones({
          owner: this.owner,
          repo: this.repo,
          state: 'closed'
        }),
        this.octokit.rest.issues.listLabelsForRepo({
          owner: this.owner,
          repo: this.repo
        })
      ]);

      const openIssuesList = openIssues.data.filter(issue => !issue.pull_request);
      const closedIssuesList = closedIssues.data.filter(issue => !issue.pull_request);
      const openPRs = openIssues.data.filter(issue => issue.pull_request);
      const closedPRs = closedIssues.data.filter(issue => issue.pull_request);

      // Calculate metrics
      const totalIssues = openIssuesList.length + closedIssuesList.length;
      const totalPRs = openPRs.length + closedPRs.length;
      const issueCompletionRate = totalIssues > 0 ? Math.round((closedIssuesList.length / totalIssues) * 100) : 0;
      const prMergeRate = totalPRs > 0 ? Math.round((closedPRs.length / totalPRs) * 100) : 0;

      // Categorize issues
      const issueCategories = this.categorizeIssuesByType([...openIssuesList, ...closedIssuesList]);
      const themeGroups = this.groupIssuesByTheme([...openIssuesList, ...closedIssuesList]);

      // Calculate complexity metrics
      const totalComplexity = [...openIssuesList, ...closedIssuesList]
        .reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
      const completedComplexity = closedIssuesList
        .reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);

      let result = `📊 **Repository Summary: ${repo.name}**\n\n`;
      result += `**Description:** ${repo.description || 'No description'}\n`;
      result += `**Language:** ${repo.language || 'Not specified'}\n`;
      result += `**Stars:** ${repo.stargazers_count} ⭐\n`;
      result += `**Forks:** ${repo.forks_count} 🍴\n`;
      result += `**Created:** ${new Date(repo.created_at).toLocaleDateString()}\n`;
      result += `**Updated:** ${new Date(repo.updated_at).toLocaleDateString()}\n`;
      result += `**Size:** ${repo.size} KB\n\n`;

      result += `## 📈 **Project Metrics**\n\n`;
      result += `**Issues:**\n`;
      result += `   • Open: ${openIssuesList.length}\n`;
      result += `   • Closed: ${closedIssuesList.length}\n`;
      result += `   • Total: ${totalIssues}\n`;
      result += `   • Completion Rate: ${issueCompletionRate}%\n\n`;

      result += `**Pull Requests:**\n`;
      result += `   • Open: ${openPRs.length}\n`;
      result += `   • Closed: ${closedPRs.length}\n`;
      result += `   • Total: ${totalPRs}\n`;
      result += `   • Merge Rate: ${prMergeRate}%\n\n`;

      result += `**Milestones:**\n`;
      result += `   • Open: ${openMilestones.data.length}\n`;
      result += `   • Closed: ${closedMilestones.data.length}\n`;
      result += `   • Total: ${openMilestones.data.length + closedMilestones.data.length}\n\n`;

      result += `**Labels:** ${labels.data.length}\n\n`;

      result += `## 🎯 **Work Breakdown**\n\n`;
      Object.entries(issueCategories).forEach(([category, issues]) => {
        const categoryComplexity = issues.reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
        result += `**${category}:** ${issues.length} issues (${categoryComplexity} story points)\n`;
      });
      result += `\n`;

      result += `## 🏗️ **Theme Analysis**\n\n`;
      Object.entries(themeGroups).forEach(([theme, issues]) => {
        const openThemeIssues = issues.filter(issue => issue.state === 'open').length;
        const closedThemeIssues = issues.filter(issue => issue.state === 'closed').length;
        result += `**${theme}:** ${issues.length} total (${openThemeIssues} open, ${closedThemeIssues} closed)\n`;
      });
      result += `\n`;

      result += `## 📊 **Complexity Metrics**\n\n`;
      result += `**Total Story Points:** ${totalComplexity}\n`;
      result += `**Completed Story Points:** ${completedComplexity}\n`;
      result += `**Remaining Story Points:** ${totalComplexity - completedComplexity}\n`;
      result += `**Progress:** ${totalComplexity > 0 ? Math.round((completedComplexity / totalComplexity) * 100) : 0}%\n\n`;

      // Priority analysis
      const highPriorityIssues = openIssuesList.filter(issue => this.calculateIssuePriority(issue) >= 4);
      const mediumPriorityIssues = openIssuesList.filter(issue => {
        const priority = this.calculateIssuePriority(issue);
        return priority >= 3 && priority < 4;
      });

      result += `## 🔥 **Priority Breakdown (Open Issues)**\n\n`;
      result += `**High Priority:** ${highPriorityIssues.length} issues\n`;
      result += `**Medium Priority:** ${mediumPriorityIssues.length} issues\n`;
      result += `**Low Priority:** ${openIssuesList.length - highPriorityIssues.length - mediumPriorityIssues.length} issues\n\n`;

      // Milestone progress
      if (openMilestones.data.length > 0) {
        result += `## 🎯 **Active Milestones**\n\n`;
        openMilestones.data.slice(0, 5).forEach(milestone => {
          const progress = milestone.open_issues + milestone.closed_issues > 0 
            ? Math.round((milestone.closed_issues / (milestone.open_issues + milestone.closed_issues)) * 100)
            : 0;
          result += `**${milestone.title}:** ${progress}% complete\n`;
          result += `   • ${milestone.closed_issues}/${milestone.open_issues + milestone.closed_issues} issues\n`;
          if (milestone.due_on) {
            const daysUntilDue = Math.ceil((new Date(milestone.due_on).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            result += `   • Due: ${daysUntilDue > 0 ? `in ${daysUntilDue} days` : `${Math.abs(daysUntilDue)} days overdue`}\n`;
          }
          result += `\n`;
        });
      }

      // Trends analysis (if requested)
      if (includeTrends) {
        const recentIssues = [...openIssuesList, ...closedIssuesList]
          .filter(issue => {
            const createdDate = new Date(issue.created_at);
            const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
            return createdDate >= thirtyDaysAgo;
          });

        const recentlyClosedIssues = closedIssuesList
          .filter(issue => {
            const closedDate = new Date(issue.closed_at!);
            const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
            return closedDate >= thirtyDaysAgo;
          });

        result += `## 📈 **Recent Trends (Last 30 Days)**\n\n`;
        result += `**New Issues:** ${recentIssues.length}\n`;
        result += `**Closed Issues:** ${recentlyClosedIssues.length}\n`;
        result += `**Net Change:** ${recentIssues.length - recentlyClosedIssues.length > 0 ? '+' : ''}${recentIssues.length - recentlyClosedIssues.length}\n\n`;
      }

      result += `## 💡 **Recommendations**\n\n`;
      
      if (highPriorityIssues.length > 5) {
        result += `• ⚠️ **${highPriorityIssues.length} high priority issues** need immediate attention\n`;
      }
      
      const unassignedIssues = openIssuesList.filter(issue => 
        !issue.assignees || issue.assignees.length === 0
      );
      
      if (unassignedIssues.length > 10) {
        result += `• 👥 **${unassignedIssues.length} unassigned issues** should be assigned to team members\n`;
      }
      
      if (openMilestones.data.length === 0) {
        result += `• 🎯 **No active milestones** - consider creating milestones for better project planning\n`;
      }
      
      const unlabeledIssues = openIssuesList.filter(issue => issue.labels.length === 0);
      if (unlabeledIssues.length > openIssuesList.length * 0.3) {
        result += `• 🏷️ **${unlabeledIssues.length} unlabeled issues** should be categorized with labels\n`;
      }
      
      result += `• 📊 **Regular reviews** recommended for milestone and issue management\n`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get repository summary: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: 15 core tools with FIXED GraphQL Projects v2 support");
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