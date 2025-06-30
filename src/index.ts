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
        version: '2.6.0',
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

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // PROJECT MANAGEMENT
          {
            name: 'create_project',
            description: 'Create a new GitHub project',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Project title' },
                description: { type: 'string', description: 'Project description (note: will be mentioned but not set due to API limitations)' },
                visibility: { type: 'string', enum: ['private', 'public'], description: 'Project visibility (note: will be mentioned but not set due to API limitations)' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_projects',
            description: 'List GitHub projects',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Project status filter' }
              },
              required: ['status']
            }
          },
          {
            name: 'add_item_to_project',
            description: 'Add an issue or pull request to a GitHub project',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'GitHub Project v2 ID' },
                content_id: { type: 'string', description: 'Issue or Pull Request Node ID' },
                content_type: { type: 'string', enum: ['issue', 'pull_request'], description: 'Type of content' },
                issue_number: { type: 'number', description: 'Issue number (alternative to content_id)' },
                pr_number: { type: 'number', description: 'Pull request number (alternative to content_id)' }
              },
              required: ['project_id']
            }
          },
          // SPRINT MANAGEMENT
          {
            name: 'create_sprint',
            description: 'Create a new development sprint',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Sprint title' },
                description: { type: 'string', description: 'Sprint description' },
                start_date: { type: 'string', description: 'Sprint start date (YYYY-MM-DD)' },
                end_date: { type: 'string', description: 'Sprint end date (YYYY-MM-DD)' },
                duration: { type: 'number', description: 'Sprint duration in days (default: 14)', minimum: 7, maximum: 28 },
                goals: { type: 'array', items: { type: 'string' }, description: 'Sprint goals and objectives' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_sprints',
            description: 'List development sprints with filtering and sorting options',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['active', 'completed', 'planned', 'overdue', 'all'], description: 'Sprint status filter' },
                sort_by: { type: 'string', enum: ['created', 'start_date', 'end_date', 'sprint_number'], description: 'Sort criteria (default: sprint_number)' },
                order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (default: desc)' }
              },
              required: []
            }
          },
          {
            name: 'get_current_sprint',
            description: 'Get detailed information about the currently active sprint',
            inputSchema: {
              type: 'object',
              properties: {
                include_issues: { type: 'boolean', description: 'Include list of sprint issues (default: true)' },
                include_burndown: { type: 'boolean', description: 'Include burndown and velocity data (default: true)' }
              },
              required: []
            }
          },
          {
            name: 'update_sprint',
            description: 'Update existing sprint details and properties',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number to update' },
                milestone_number: { type: 'number', description: 'Milestone number to update (alternative to sprint_number)' },
                title: { type: 'string', description: 'New sprint title' },
                description: { type: 'string', description: 'New sprint description' },
                start_date: { type: 'string', description: 'New sprint start date (YYYY-MM-DD)' },
                end_date: { type: 'string', description: 'New sprint end date (YYYY-MM-DD)' },
                duration: { type: 'number', description: 'New sprint duration in days', minimum: 7, maximum: 28 },
                goals: { type: 'array', items: { type: 'string' }, description: 'Updated sprint goals and objectives' },
                status: { type: 'string', enum: ['open', 'closed'], description: 'Sprint status (open=active, closed=completed)' }
              },
              required: []
            }
          },
          {
            name: 'add_issues_to_sprint',
            description: 'Assign multiple issues to an existing sprint',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number to add issues to' },
                milestone_number: { type: 'number', description: 'Milestone number to add issues to (alternative to sprint_number)' },
                issue_numbers: { type: 'array', items: { type: 'number' }, description: 'Array of issue numbers to add to the sprint' },
                validate_state: { type: 'boolean', description: 'Only add open issues (default: true)' },
                allow_reassignment: { type: 'boolean', description: 'Allow moving issues from other sprints (default: false)' },
                max_capacity_check: { type: 'boolean', description: 'Check if adding issues exceeds sprint capacity (default: false)' }
              },
              required: ['issue_numbers']
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
          {
            name: 'get_overdue_milestones',
            description: 'Find overdue milestones',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'get_upcoming_milestones',
            description: 'Get upcoming milestones within timeframes',
            inputSchema: {
              type: 'object',
              properties: {
                days: { type: 'number', description: 'Number of days to look ahead' }
              },
              required: ['days']
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
          case 'add_item_to_project':
            return await this.handleAddItemToProject(args);

          // SPRINT MANAGEMENT
          case 'create_sprint':
            return await this.handleCreateSprint(args);
          case 'list_sprints':
            return await this.handleListSprints(args);
          case 'get_current_sprint':
            return await this.handleGetCurrentSprint(args);
          case 'update_sprint':
            return await this.handleUpdateSprint(args);
          case 'add_issues_to_sprint':
            return await this.handleAddIssuesToSprint(args);

          // MILESTONE MANAGEMENT
          case 'create_milestone':
            return await this.handleCreateMilestone(args);
          case 'list_milestones':
            return await this.handleListMilestones(args);
          case 'get_milestone_metrics':
            return await this.handleGetMilestoneMetrics(args);
          case 'get_overdue_milestones':
            return await this.handleGetOverdueMilestones(args);
          case 'get_upcoming_milestones':
            return await this.handleGetUpcomingMilestones(args);

          // ISSUE MANAGEMENT
          case 'create_issue':
            return await this.handleCreateIssue(args);
          case 'list_issues':
            return await this.handleListIssues(args);
          case 'get_issue':
            return await this.handleGetIssue(args);
          case 'update_issue':
            return await this.handleUpdateIssue(args);

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

  // SPRINT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateSprint(args: any) {
    this.validateRepoConfig();

    try {
      // Calculate dates if not provided
      let startDate = args.start_date;
      let endDate = args.end_date;
      const duration = args.duration || 14;

      if (!startDate) {
        startDate = new Date().toISOString().split('T')[0]; // Today
      }

      if (!endDate && startDate) {
        const start = new Date(startDate);
        const end = new Date(start.getTime() + (duration * 24 * 60 * 60 * 1000));
        endDate = end.toISOString().split('T')[0];
      }

      // Get next sprint number
      const sprintNumber = await this.getNextSprintNumber();
      
      // Create sprint title with number if not provided
      const sprintTitle = args.title.includes('Sprint') ? args.title : `Sprint ${sprintNumber}: ${args.title}`;

      // Create sprint metadata
      const sprintMetadata = {
        sprintNumber,
        goals: args.goals || [],
        duration,
        startDate,
        endDate,
        description: args.description || ''
      };

      // Create milestone with sprint metadata
      const sprintDescription = this.createSprintDescription(sprintMetadata);
      
      const response = await this.octokit.rest.issues.createMilestone({
        owner: this.owner,
        repo: this.repo,
        title: sprintTitle,
        description: sprintDescription,
        due_on: this.formatDateForGitHub(endDate),
        state: 'open'
      });

      const milestone = response.data;
      
      let result = `🏃‍♂️ **Sprint created successfully!**\n\n`;
      result += `**Sprint:** ${milestone.title}\n`;
      result += `**Number:** Sprint ${sprintNumber}\n`;
      result += `**Duration:** ${duration} days\n`;
      result += `**Start Date:** ${startDate}\n`;
      result += `**End Date:** ${endDate}\n`;
      result += `**State:** ${milestone.state}\n`;
      
      if (args.goals && args.goals.length > 0) {
        result += `**Goals:**\n`;
        args.goals.forEach((goal: string, index: number) => {
          result += `   ${index + 1}. ${goal}\n`;
        });
      }
      
      result += `**Milestone Number:** ${milestone.number}\n`;
      result += `**URL:** ${milestone.html_url}\n\n`;
      result += `💡 **Next Steps:**\n`;
      result += `• Use 'add_issues_to_sprint' to add issues to this sprint\n`;
      result += `• Use 'get_current_sprint' to view active sprint details\n`;
      result += `• Use 'get_sprint_metrics' to track progress`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to create sprint: ${error.message}`);
    }
  }

  private async handleListSprints(args: any) {
    this.validateRepoConfig();

    try {
      // Get all milestones to search for sprints
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: 'all',
        per_page: 100
      });

      // Filter for sprints and parse metadata
      const sprints = response.data
        .map(milestone => {
          const sprintData = this.parseSprintDescription(milestone.description || '');
          if (!sprintData || sprintData.type !== 'sprint') {
            return null;
          }

          const status = this.getSprintStatus(sprintData, milestone);
          const progress = milestone.closed_issues + milestone.open_issues > 0 
            ? Math.round((milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100)
            : 0;

          return {
            ...sprintData,
            milestone,
            status,
            progress,
            totalIssues: milestone.closed_issues + milestone.open_issues,
            closedIssues: milestone.closed_issues,
            openIssues: milestone.open_issues
          };
        })
        .filter(sprint => sprint !== null);

      // Filter by status if specified
      let filteredSprints = sprints;
      if (args.status && args.status !== 'all') {
        filteredSprints = sprints.filter(sprint => sprint.status === args.status);
      }

      // Sort sprints
      const sortBy = args.sort_by || 'sprint_number';
      const order = args.order || 'desc';
      
      filteredSprints.sort((a, b) => {
        let aValue, bValue;
        
        switch (sortBy) {
          case 'created':
            aValue = new Date(a.createdAt || a.milestone.created_at);
            bValue = new Date(b.createdAt || b.milestone.created_at);
            break;
          case 'start_date':
            aValue = new Date(a.startDate);
            bValue = new Date(b.startDate);
            break;
          case 'end_date':
            aValue = new Date(a.endDate || a.milestone.due_on);
            bValue = new Date(b.endDate || b.milestone.due_on);
            break;
          case 'sprint_number':
          default:
            aValue = a.sprintNumber;
            bValue = b.sprintNumber;
            break;
        }

        if (order === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
      });

      // Generate output
      let result = `🏃‍♂️ **Development Sprints** - Found ${filteredSprints.length} sprints`;
      if (args.status && args.status !== 'all') {
        result += ` (${args.status})`;
      }
      result += `\n\n`;

      if (filteredSprints.length === 0) {
        result += args.status && args.status !== 'all' 
          ? `No ${args.status} sprints found.`
          : "No sprints found. Use 'create_sprint' to create your first sprint.";
      } else {
        filteredSprints.forEach(sprint => {
          const statusIcon = {
            'active': '🟢',
            'completed': '✅',
            'planned': '📅',
            'overdue': '🔴'
          }[sprint.status] || '❓';

          const today = new Date();
          const startDate = new Date(sprint.startDate);
          const endDate = new Date(sprint.endDate || sprint.milestone.due_on);
          
          let timeInfo = '';
          if (sprint.status === 'active') {
            const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            timeInfo = `${daysRemaining} days remaining`;
          } else if (sprint.status === 'planned') {
            const daysUntilStart = Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            timeInfo = `starts in ${daysUntilStart} days`;
          } else if (sprint.status === 'overdue') {
            const daysOverdue = Math.ceil((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
            timeInfo = `${daysOverdue} days overdue`;
          } else if (sprint.status === 'completed') {
            timeInfo = `completed ${new Date(sprint.milestone.closed_at || endDate).toLocaleDateString()}`;
          }

          result += `${statusIcon} **${sprint.milestone.title}** (#${sprint.milestone.number})\n`;
          result += `   📊 Progress: ${sprint.progress}% (${sprint.closedIssues}/${sprint.totalIssues} issues)\n`;
          result += `   📅 ${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}\n`;
          
          if (timeInfo) {
            result += `   ⏰ ${timeInfo}\n`;
          }
          
          result += `   ⏱️  Duration: ${sprint.duration} days\n`;
          
          if (sprint.goals && sprint.goals.length > 0) {
            result += `   🎯 Goals: ${sprint.goals.length} defined\n`;
          }
          
          result += `   🔗 ${sprint.milestone.html_url}\n\n`;
        });

        // Add summary statistics
        const statusCounts = {
          active: filteredSprints.filter(s => s.status === 'active').length,
          completed: filteredSprints.filter(s => s.status === 'completed').length,
          planned: filteredSprints.filter(s => s.status === 'planned').length,
          overdue: filteredSprints.filter(s => s.status === 'overdue').length
        };

        result += `📈 **Sprint Summary:**\n`;
        result += `• Active: ${statusCounts.active} | Completed: ${statusCounts.completed} | Planned: ${statusCounts.planned} | Overdue: ${statusCounts.overdue}\n\n`;
        result += `💡 **Available Actions:**\n`;
        result += `• Use 'get_current_sprint' to view active sprint details\n`;
        result += `• Use 'create_sprint' to create a new sprint\n`;
        result += `• Use 'add_issues_to_sprint' to assign issues to sprints`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to list sprints: ${error.message}`);
    }
  }

  private async handleGetCurrentSprint(args: any) {
    this.validateRepoConfig();

    try {
      const includeIssues = args.include_issues !== false; // Default true
      const includeBurndown = args.include_burndown !== false; // Default true

      // Get all open milestones to find active sprints
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100
      });

      // Find active sprint(s)
      const today = new Date();
      const activeSprints = response.data
        .map(milestone => {
          const sprintData = this.parseSprintDescription(milestone.description || '');
          if (!sprintData || sprintData.type !== 'sprint') {
            return null;
          }

          const status = this.getSprintStatus(sprintData, milestone);
          return status === 'active' ? { ...sprintData, milestone, status } : null;
        })
        .filter(sprint => sprint !== null);

      if (activeSprints.length === 0) {
        return {
          content: [{
            type: "text",
            text: `🔍 **No Active Sprint Found**\n\nThere is currently no active sprint running.\n\n💡 **Actions you can take:**\n• Use 'list_sprints' to see all sprints\n• Use 'create_sprint' to start a new sprint\n• Check if any sprints are planned for the future\n\n📅 A sprint is considered active when today falls between its start and end dates.`
          }]
        };
      }

      // Handle multiple active sprints (edge case)
      if (activeSprints.length > 1) {
        let result = `⚠️ **Multiple Active Sprints Detected**\n\nFound ${activeSprints.length} active sprints:\n\n`;
        activeSprints.forEach((sprint, index) => {
          result += `${index + 1}. **${sprint.milestone.title}** (#${sprint.milestone.number})\n`;
          result += `   📅 ${new Date(sprint.startDate).toLocaleDateString()} → ${new Date(sprint.endDate || sprint.milestone.due_on).toLocaleDateString()}\n\n`;
        });
        result += `💡 Consider closing or adjusting sprint dates to have only one active sprint at a time.`;
        
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }

      // Get current active sprint details
      const currentSprint = activeSprints[0];
      const milestone = currentSprint.milestone;
      const startDate = new Date(currentSprint.startDate);
      const endDate = new Date(currentSprint.endDate || milestone.due_on);
      const totalIssues = milestone.closed_issues + milestone.open_issues;
      const progress = totalIssues > 0 ? Math.round((milestone.closed_issues / totalIssues) * 100) : 0;

      // Calculate time metrics
      const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysPassed = totalDays - daysRemaining;
      const timeProgress = totalDays > 0 ? Math.round((daysPassed / totalDays) * 100) : 0;

      // Build result
      let result = `🟢 **Current Active Sprint**\n\n`;
      result += `**Sprint:** ${milestone.title}\n`;
      result += `**Number:** Sprint ${currentSprint.sprintNumber}\n`;
      result += `**Status:** Active (${daysRemaining} days remaining)\n`;
      result += `**Duration:** ${currentSprint.duration} days\n`;
      result += `**Period:** ${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}\n\n`;

      // Progress section
      result += `📊 **Progress Overview**\n`;
      result += `• **Issue Completion:** ${progress}% (${milestone.closed_issues}/${totalIssues} issues)\n`;
      result += `• **Time Progress:** ${timeProgress}% (${daysPassed}/${totalDays} days)\n`;
      
      if (progress > timeProgress + 10) {
        result += `• **Velocity:** 🟢 Ahead of schedule\n`;
      } else if (progress < timeProgress - 10) {
        result += `• **Velocity:** 🔴 Behind schedule\n`;
      } else {
        result += `• **Velocity:** 🟡 On track\n`;
      }
      result += `\n`;

      // Goals section
      if (currentSprint.goals && currentSprint.goals.length > 0) {
        result += `🎯 **Sprint Goals**\n`;
        currentSprint.goals.forEach((goal, index) => {
          result += `${index + 1}. ${goal}\n`;
        });
        result += `\n`;
      }

      // Burndown data
      if (includeBurndown) {
        result += `📈 **Burndown Metrics**\n`;
        const idealBurnRemaining = Math.max(0, totalIssues - Math.round((totalIssues * daysPassed) / totalDays));
        const actualRemaining = milestone.open_issues;
        
        result += `• **Ideal Remaining:** ${idealBurnRemaining} issues\n`;
        result += `• **Actual Remaining:** ${actualRemaining} issues\n`;
        
        if (actualRemaining <= idealBurnRemaining) {
          result += `• **Trend:** 🟢 Burning down faster than ideal\n`;
        } else {
          result += `• **Trend:** 🔴 Burning down slower than ideal\n`;
        }
        result += `\n`;
      }

      // Sprint issues
      if (includeIssues && totalIssues > 0) {
        const issuesResponse = await this.octokit.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          milestone: milestone.number.toString(),
          state: 'all',
          per_page: 100
        });

        const openIssues = issuesResponse.data.filter(issue => issue.state === 'open');
        const closedIssues = issuesResponse.data.filter(issue => issue.state === 'closed');

        result += `📋 **Sprint Issues**\n`;
        
        if (openIssues.length > 0) {
          result += `\n**🔓 Open Issues (${openIssues.length}):**\n`;
          openIssues.forEach(issue => {
            const labels = issue.labels.map((l: any) => l.name).join(', ') || 'no labels';
            const assignees = issue.assignees?.map((a: any) => a.login).join(', ') || 'unassigned';
            result += `• **${issue.title}** (#${issue.number})\n`;
            result += `  🏷️ ${labels} | 👤 ${assignees}\n`;
          });
        }

        if (closedIssues.length > 0) {
          result += `\n**✅ Completed Issues (${closedIssues.length}):**\n`;
          closedIssues.forEach(issue => {
            result += `• **${issue.title}** (#${issue.number})\n`;
          });
        }
        
        result += `\n`;
      }

      // Actions section
      result += `💡 **Available Actions**\n`;
      result += `• Use 'add_issues_to_sprint' to add more issues\n`;
      result += `• Use 'get_sprint_metrics' for detailed analytics\n`;
      result += `• Use 'list_sprints' to see all sprints\n`;
      result += `• Track progress at: ${milestone.html_url}`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get current sprint: ${error.message}`);
    }
  }

  private async handleUpdateSprint(args: any) {
    this.validateRepoConfig();

    try {
      // Identify the sprint to update
      let milestone = null;
      
      if (args.milestone_number) {
        // Direct milestone approach
        const response = await this.octokit.rest.issues.getMilestone({
          owner: this.owner,
          repo: this.repo,
          milestone_number: args.milestone_number
        });
        milestone = response.data;
      } else if (args.sprint_number) {
        // Find by sprint number
        const milestonesResponse = await this.octokit.rest.issues.listMilestones({
          owner: this.owner,
          repo: this.repo,
          state: 'all',
          per_page: 100
        });

        const targetSprint = milestonesResponse.data.find(m => {
          const sprintData = this.parseSprintDescription(m.description || '');
          return sprintData && sprintData.type === 'sprint' && sprintData.sprintNumber === args.sprint_number;
        });

        if (!targetSprint) {
          throw new Error(`Sprint #${args.sprint_number} not found`);
        }
        milestone = targetSprint;
      } else {
        throw new Error('Must provide either sprint_number or milestone_number to identify the sprint to update');
      }

      // Parse existing sprint metadata
      const existingSprintData = this.parseSprintDescription(milestone.description || '');
      if (!existingSprintData || existingSprintData.type !== 'sprint') {
        throw new Error(`Milestone #${milestone.number} is not a sprint`);
      }

      // Prepare updated data
      const updatedSprintData = { ...existingSprintData };
      let milestoneUpdateData: any = {
        owner: this.owner,
        repo: this.repo,
        milestone_number: milestone.number
      };

      // Update sprint metadata fields
      if (args.description !== undefined) updatedSprintData.description = args.description;
      if (args.goals !== undefined) updatedSprintData.goals = args.goals;
      if (args.duration !== undefined) updatedSprintData.duration = args.duration;
      if (args.start_date !== undefined) updatedSprintData.startDate = args.start_date;
      if (args.end_date !== undefined) {
        updatedSprintData.endDate = args.end_date;
      } else if (args.duration !== undefined && updatedSprintData.startDate) {
        // Recalculate end date if duration changed
        const start = new Date(updatedSprintData.startDate);
        const end = new Date(start.getTime() + (updatedSprintData.duration * 24 * 60 * 60 * 1000));
        updatedSprintData.endDate = end.toISOString().split('T')[0];
      }

      // Update milestone fields
      if (args.title) {
        const sprintNumber = updatedSprintData.sprintNumber;
        const newTitle = args.title.includes('Sprint') ? args.title : `Sprint ${sprintNumber}: ${args.title}`;
        milestoneUpdateData.title = newTitle;
      }

      if (args.status) milestoneUpdateData.state = args.status;
      
      // Update due date based on end date
      if (updatedSprintData.endDate) {
        milestoneUpdateData.due_on = this.formatDateForGitHub(updatedSprintData.endDate);
      }

      // Create updated description with metadata
      const updatedDescription = this.createSprintDescription(updatedSprintData);
      milestoneUpdateData.description = updatedDescription;

      // Update the milestone
      const updateResponse = await this.octokit.rest.issues.updateMilestone(milestoneUpdateData);
      const updatedMilestone = updateResponse.data;

      // Parse the final updated sprint data
      const finalSprintData = this.parseSprintDescription(updatedMilestone.description || '');
      const status = this.getSprintStatus(finalSprintData, updatedMilestone);

      // Build response
      let result = `✅ **Sprint updated successfully!**\n\n`;
      result += `**Sprint:** ${updatedMilestone.title}\n`;
      result += `**Number:** Sprint ${finalSprintData.sprintNumber}\n`;
      result += `**Status:** ${status} (${updatedMilestone.state})\n`;
      result += `**Duration:** ${finalSprintData.duration} days\n`;
      result += `**Period:** ${new Date(finalSprintData.startDate).toLocaleDateString()} → ${new Date(finalSprintData.endDate || updatedMilestone.due_on).toLocaleDateString()}\n`;

      if (finalSprintData.goals && finalSprintData.goals.length > 0) {
        result += `**Goals:**\n`;
        finalSprintData.goals.forEach((goal: string, index: number) => {
          result += `   ${index + 1}. ${goal}\n`;
        });
      }

      result += `**Milestone Number:** ${updatedMilestone.number}\n`;
      result += `**URL:** ${updatedMilestone.html_url}\n\n`;

      // Show what was changed
      const changes = [];
      if (args.title) changes.push('title');
      if (args.description !== undefined) changes.push('description');
      if (args.start_date) changes.push('start date');
      if (args.end_date) changes.push('end date');
      if (args.duration) changes.push('duration');
      if (args.goals) changes.push('goals');
      if (args.status) changes.push('status');

      if (changes.length > 0) {
        result += `📝 **Updated:** ${changes.join(', ')}\n\n`;
      }

      result += `💡 **Available Actions:**\n`;
      result += `• Use 'get_current_sprint' to view active sprint details\n`;
      result += `• Use 'list_sprints' to see all sprints\n`;
      result += `• Use 'add_issues_to_sprint' to manage sprint issues`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to update sprint: ${error.message}`);
    }
  }

  private async handleAddIssuesToSprint(args: any) {
    this.validateRepoConfig();

    try {
      // Validate input
      if (!args.issue_numbers || !Array.isArray(args.issue_numbers) || args.issue_numbers.length === 0) {
        throw new Error('Must provide an array of issue numbers to add to the sprint');
      }

      // Find the target sprint/milestone
      let targetMilestone = null;
      
      if (args.milestone_number) {
        // Direct milestone approach
        const response = await this.octokit.rest.issues.getMilestone({
          owner: this.owner,
          repo: this.repo,
          milestone_number: args.milestone_number
        });
        targetMilestone = response.data;
      } else if (args.sprint_number) {
        // Find by sprint number
        const milestonesResponse = await this.octokit.rest.issues.listMilestones({
          owner: this.owner,
          repo: this.repo,
          state: 'all',
          per_page: 100
        });

        const targetSprint = milestonesResponse.data.find(m => {
          const sprintData = this.parseSprintDescription(m.description || '');
          return sprintData && sprintData.type === 'sprint' && sprintData.sprintNumber === args.sprint_number;
        });

        if (!targetSprint) {
          throw new Error(`Sprint #${args.sprint_number} not found`);
        }
        targetMilestone = targetSprint;
      } else {
        throw new Error('Must provide either sprint_number or milestone_number to identify the target sprint');
      }

      // Verify this is actually a sprint
      const sprintData = this.parseSprintDescription(targetMilestone.description || '');
      if (!sprintData || sprintData.type !== 'sprint') {
        throw new Error(`Milestone #${targetMilestone.number} is not a sprint`);
      }

      // Configuration options
      const validateState = args.validate_state !== false; // Default true
      const allowReassignment = args.allow_reassignment === true; // Default false
      const maxCapacityCheck = args.max_capacity_check === true; // Default false

      // Process each issue
      const results = {
        assigned: [],
        failed: [],
        warnings: []
      };

      for (const issueNumber of args.issue_numbers) {
        try {
          // Get issue details
          const issueResponse = await this.octokit.rest.issues.get({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber
          });

          const issue = issueResponse.data;

          // Validation checks
          const validationErrors = [];

          // Check if issue is open (if validation enabled)
          if (validateState && issue.state !== 'open') {
            validationErrors.push(`Issue #${issueNumber} is ${issue.state}, not open`);
          }

          // Check for existing milestone assignment
          if (issue.milestone && !allowReassignment) {
            if (issue.milestone.number === targetMilestone.number) {
              results.warnings.push(`Issue #${issueNumber} already assigned to this sprint`);
              continue;
            } else {
              validationErrors.push(`Issue #${issueNumber} already assigned to milestone "${issue.milestone.title}"`);
            }
          }

          // If validation failed, record and continue
          if (validationErrors.length > 0) {
            results.failed.push({
              issueNumber,
              title: issue.title,
              errors: validationErrors
            });
            continue;
          }

          // Assign issue to sprint milestone
          await this.octokit.rest.issues.update({
            owner: this.owner,
            repo: this.repo,
            issue_number: issueNumber,
            milestone: targetMilestone.number
          });

          results.assigned.push({
            issueNumber,
            title: issue.title,
            labels: issue.labels.map((l: any) => l.name),
            assignees: issue.assignees?.map((a: any) => a.login) || [],
            previousMilestone: issue.milestone?.title || null
          });

        } catch (error: any) {
          results.failed.push({
            issueNumber,
            title: `Unknown (Error: ${error.message})`,
            errors: [`Failed to process: ${error.message}`]
          });
        }
      }

      // Get updated sprint information
      const updatedMilestoneResponse = await this.octokit.rest.issues.getMilestone({
        owner: this.owner,
        repo: this.repo,
        milestone_number: targetMilestone.number
      });
      const updatedMilestone = updatedMilestoneResponse.data;

      // Build comprehensive result report
      let result = `📋 **Issues Added to Sprint**\n\n`;
      result += `**Sprint:** ${targetMilestone.title}\n`;
      result += `**Sprint Number:** ${sprintData.sprintNumber}\n`;
      result += `**Milestone:** #${targetMilestone.number}\n\n`;

      // Success section
      if (results.assigned.length > 0) {
        result += `✅ **Successfully Assigned (${results.assigned.length} issues):**\n`;
        results.assigned.forEach(item => {
          result += `• **${item.title}** (#${item.issueNumber})\n`;
          if (item.labels.length > 0) {
            result += `  🏷️ ${item.labels.join(', ')}\n`;
          }
          if (item.assignees.length > 0) {
            result += `  👤 ${item.assignees.join(', ')}\n`;
          }
          if (item.previousMilestone) {
            result += `  📦 Moved from: ${item.previousMilestone}\n`;
          }
        });
        result += `\n`;
      }

      // Warnings section
      if (results.warnings.length > 0) {
        result += `⚠️ **Warnings (${results.warnings.length}):**\n`;
        results.warnings.forEach(warning => {
          result += `• ${warning}\n`;
        });
        result += `\n`;
      }

      // Failures section
      if (results.failed.length > 0) {
        result += `❌ **Failed to Assign (${results.failed.length} issues):**\n`;
        results.failed.forEach(item => {
          result += `• **${item.title}** (#${item.issueNumber})\n`;
          item.errors.forEach(error => {
            result += `  ❗ ${error}\n`;
          });
        });
        result += `\n`;
      }

      // Updated sprint metrics
      result += `📊 **Updated Sprint Status:**\n`;
      result += `• **Total Issues:** ${updatedMilestone.open_issues + updatedMilestone.closed_issues}\n`;
      result += `• **Open Issues:** ${updatedMilestone.open_issues}\n`;
      result += `• **Completed Issues:** ${updatedMilestone.closed_issues}\n`;
      
      const progress = (updatedMilestone.open_issues + updatedMilestone.closed_issues) > 0 
        ? Math.round((updatedMilestone.closed_issues / (updatedMilestone.open_issues + updatedMilestone.closed_issues)) * 100)
        : 0;
      result += `• **Progress:** ${progress}%\n\n`;

      // Capacity check if enabled
      if (maxCapacityCheck) {
        const totalIssues = updatedMilestone.open_issues + updatedMilestone.closed_issues;
        const estimatedCapacity = sprintData.duration * 2; // Rough estimate: 2 issues per day
        
        if (totalIssues > estimatedCapacity) {
          result += `⚠️ **Capacity Warning:** Sprint has ${totalIssues} issues but estimated capacity is ${estimatedCapacity} issues (${sprintData.duration} days). Consider sprint planning review.\n\n`;
        }
      }

      // Next actions
      result += `💡 **Next Actions:**\n`;
      result += `• Use 'get_current_sprint' to view sprint details\n`;
      result += `• Use 'list_sprints' to see all sprint progress\n`;
      result += `• Use 'get_sprint_metrics' for detailed analytics\n`;
      result += `• Track progress at: ${targetMilestone.html_url}`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to add issues to sprint: ${error.message}`);
    }
  }

  // PROJECT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateProject(args: any) {
    this.validateRepoConfig();

    try {
      // Get repository and owner IDs
      const getRepoQuery = `
        query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            id
            owner {
              id
              login
            }
          }
        }
      `;

      const repoResult = await this.graphqlWithAuth(getRepoQuery, {
        owner: this.owner,
        name: this.repo
      });

      const ownerId = repoResult.repository.owner.id;

      // Create the project (using only supported fields)
      const createProjectMutation = `
        mutation($input: CreateProjectV2Input!) {
          createProjectV2(input: $input) {
            projectV2 {
              id
              title
              url
              number
              createdAt
              updatedAt
            }
          }
        }
      `;

      const projectResult = await this.graphqlWithAuth(createProjectMutation, {
        input: {
          ownerId: ownerId,
          title: args.title
        }
      });

      const project = projectResult.createProjectV2.projectV2;
      
      return {
        content: [{
          type: "text",
          text: `✅ **GitHub Project v2 created successfully!**\n\n**Title:** ${project.title}\n**Number:** #${project.number}\n**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n**ID:** ${project.id}\n**URL:** ${project.url}\n\n💡 **Note:** Description "${args.description || 'N/A'}" and visibility "${args.visibility || 'N/A'}" mentioned but not set due to GitHub GraphQL API limitations. You can update these manually in the project settings.`
        }]
      };
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('GitHub authentication failed. Please check your GITHUB_TOKEN has "project" scope permissions.');
      }
      if (error.errors) {
        const errorMessages = error.errors.map((e: any) => e.message).join(', ');
        throw new Error(`GraphQL Error: ${errorMessages}`);
      }
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  private async handleListProjects(args: any) {
    this.validateRepoConfig();

    try {
      // Get owner projects
      const getOwnerQuery = `
        query($owner: String!) {
          repositoryOwner(login: $owner) {
            id
            login
            ... on User {
              projectsV2(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
                nodes {
                  id
                  title
                  shortDescription
                  url
                  number
                  public
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
            ... on Organization {
              projectsV2(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
                nodes {
                  id
                  title
                  shortDescription
                  url
                  number
                  public
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
        }
      `;

      const ownerResult = await this.graphqlWithAuth(getOwnerQuery, {
        owner: this.owner
      });

      const projects = ownerResult.repositoryOwner.projectsV2.nodes;
      const totalCount = ownerResult.repositoryOwner.projectsV2.totalCount;

      // Filter projects based on status
      let filteredProjects = projects;
      if (args.status === 'open') {
        filteredProjects = projects.filter((p: any) => !p.closed);
      } else if (args.status === 'closed') {
        filteredProjects = projects.filter((p: any) => p.closed);
      }

      let result = `📋 **GitHub Projects v2** - Found ${filteredProjects.length} projects (${totalCount} total)\n\n`;
      
      if (filteredProjects.length === 0) {
        result += `No ${args.status} projects found.`;
      } else {
        filteredProjects.forEach((project: any) => {
          const statusIcon = project.closed ? '🔒' : '🔓';
          const visibilityIcon = project.public ? '🌐' : '🔒';
          
          result += `${statusIcon} **${project.title}** (#${project.number})\n`;
          result += `   📝 ${project.shortDescription || 'No description'}\n`;
          result += `   ${visibilityIcon} ${project.public ? 'Public' : 'Private'}\n`;
          result += `   📦 Items: ${project.items.totalCount}\n`;
          result += `   📅 Updated: ${new Date(project.updatedAt).toLocaleDateString()}\n`;
          result += `   🆔 ID: ${project.id}\n`;
          result += `   🔗 ${project.url}\n\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('GitHub authentication failed. Please check your GITHUB_TOKEN has "project" scope permissions.');
      }
      if (error.errors) {
        const errorMessages = error.errors.map((e: any) => e.message).join(', ');
        throw new Error(`GraphQL Error: ${errorMessages}`);
      }
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  private async handleAddItemToProject(args: any) {
    this.validateRepoConfig();

    try {
      let contentId = args.content_id;
      let contentType = args.content_type;

      // If no direct content_id provided, resolve from issue/PR number
      if (!contentId) {
        if (args.issue_number) {
          const issueQuery = `
            query($owner: String!, $name: String!, $number: Int!) {
              repository(owner: $owner, name: $name) {
                issue(number: $number) {
                  id
                  title
                  number
                  url
                }
              }
            }
          `;

          const issueResult = await this.graphqlWithAuth(issueQuery, {
            owner: this.owner,
            name: this.repo,
            number: args.issue_number
          });

          if (!issueResult.repository.issue) {
            throw new Error(`Issue #${args.issue_number} not found`);
          }

          contentId = issueResult.repository.issue.id;
          contentType = 'issue';
        } else if (args.pr_number) {
          const prQuery = `
            query($owner: String!, $name: String!, $number: Int!) {
              repository(owner: $owner, name: $name) {
                pullRequest(number: $number) {
                  id
                  title
                  number
                  url
                }
              }
            }
          `;

          const prResult = await this.graphqlWithAuth(prQuery, {
            owner: this.owner,
            name: this.repo,
            number: args.pr_number
          });

          if (!prResult.repository.pullRequest) {
            throw new Error(`Pull Request #${args.pr_number} not found`);
          }

          contentId = prResult.repository.pullRequest.id;
          contentType = 'pull_request';
        } else {
          throw new Error('Must provide either content_id/content_type, issue_number, or pr_number');
        }
      }

      // Add item to project
      const addItemMutation = `
        mutation($input: AddProjectV2ItemByIdInput!) {
          addProjectV2ItemById(input: $input) {
            item {
              id
              content {
                ... on Issue {
                  id
                  title
                  number
                  url
                }
                ... on PullRequest {
                  id
                  title
                  number
                  url
                }
              }
            }
          }
        }
      `;

      const addResult = await this.graphqlWithAuth(addItemMutation, {
        input: {
          projectId: args.project_id,
          contentId: contentId
        }
      });

      const item = addResult.addProjectV2ItemById.item;
      const content = item.content;
      
      return {
        content: [{
          type: "text",
          text: `✅ **Item added to project successfully!**\n\n**Type:** ${contentType === 'issue' ? 'Issue' : 'Pull Request'}\n**Title:** ${content.title}\n**Number:** #${content.number}\n**URL:** ${content.url}\n**Project Item ID:** ${item.id}`
        }]
      };
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error('GitHub authentication failed. Please check your GITHUB_TOKEN has "project" scope permissions.');
      }
      if (error.errors) {
        const errorMessages = error.errors.map((e: any) => e.message).join(', ');
        throw new Error(`GraphQL Error: ${errorMessages}`);
      }
      throw new Error(`Failed to add item to project: ${error.message}`);
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

  private async handleGetOverdueMilestones(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100
      });

      const today = new Date();
      const overdueMilestones = response.data.filter(milestone => 
        milestone.due_on && new Date(milestone.due_on) < today
      );

      let result = `⚠️ **Overdue Milestones** - Found ${overdueMilestones.length} overdue milestones\n\n`;
      
      if (overdueMilestones.length === 0) {
        result += "🎉 No overdue milestones! All on track.";
      } else {
        overdueMilestones.forEach(milestone => {
          const daysOverdue = Math.ceil((today.getTime() - new Date(milestone.due_on!).getTime()) / (1000 * 60 * 60 * 24));
          const progress = milestone.closed_issues + milestone.open_issues > 0 
            ? Math.round((milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100)
            : 0;
          
          result += `**${milestone.title}** (#${milestone.number})\n`;
          result += `   ❌ Overdue by: ${daysOverdue} days\n`;
          result += `   📊 Progress: ${progress}%\n`;
          result += `   📅 Was due: ${new Date(milestone.due_on!).toLocaleDateString()}\n\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get overdue milestones: ${error.message}`);
    }
  }

  private async handleGetUpcomingMilestones(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        sort: 'due_on',
        direction: 'asc',
        per_page: 100
      });

      const today = new Date();
      const futureDate = new Date(today.getTime() + (args.days * 24 * 60 * 60 * 1000));
      
      const upcomingMilestones = response.data.filter(milestone => 
        milestone.due_on && 
        new Date(milestone.due_on) >= today && 
        new Date(milestone.due_on) <= futureDate
      );

      let result = `📅 **Upcoming Milestones** (next ${args.days} days) - Found ${upcomingMilestones.length} milestones\n\n`;
      
      if (upcomingMilestones.length === 0) {
        result += `No milestones due in the next ${args.days} days.`;
      } else {
        upcomingMilestones.forEach(milestone => {
          const daysUntilDue = Math.ceil((new Date(milestone.due_on!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const progress = milestone.closed_issues + milestone.open_issues > 0 
            ? Math.round((milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100)
            : 0;
          
          result += `**${milestone.title}** (#${milestone.number})\n`;
          result += `   📅 Due in: ${daysUntilDue} days (${new Date(milestone.due_on!).toLocaleDateString()})\n`;
          result += `   📊 Progress: ${progress}%\n`;
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
      throw new Error(`Failed to get upcoming milestones: ${error.message}`);
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
          text: `✅ **Issue created successfully!**\n\n**Title:** ${response.data.title}\n**Number:** #${response.data.number}\n**State:** ${response.data.state}\n**Labels:** ${response.data.labels.map((l: any) => l.name).join(', ') || 'None'}\n**Assignees:** ${response.data.assignees?.map((a: any) => a.login).join(', ') || 'None'}\n**Node ID:** ${response.data.node_id}\n**URL:** ${response.data.html_url}\n\n💡 **Use Node ID with 'add_item_to_project' to add to projects.**`
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
          result += `   🔗 ${issue.html_url}\n`;
          result += `   🆔 Node ID: ${issue.node_id}\n\n`;
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
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: 20 comprehensive project management tools (including add_issues_to_sprint)");
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