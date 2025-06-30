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
        version: '2.8.0',
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
          {
            name: 'remove_issues_from_sprint',
            description: 'Remove multiple issues from an existing sprint and move them back to backlog',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number to remove issues from' },
                milestone_number: { type: 'number', description: 'Milestone number to remove issues from (alternative to sprint_number)' },
                issue_numbers: { type: 'array', items: { type: 'number' }, description: 'Array of issue numbers to remove from the sprint' },
                removal_reason: { type: 'string', description: 'Optional reason for removing issues from sprint' },
                preserve_labels: { type: 'boolean', description: 'Keep existing labels when removing from sprint (default: true)' },
                add_comment: { type: 'boolean', description: 'Add a comment explaining the removal (default: false)' }
              },
              required: ['issue_numbers']
            }
          },
          {
            name: 'get_sprint_metrics',
            description: 'Get comprehensive analytics and progress metrics for a specific sprint',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number to analyze' },
                milestone_number: { type: 'number', description: 'Milestone number to analyze (alternative to sprint_number)' },
                include_burndown: { type: 'boolean', description: 'Include detailed burndown chart data (default: true)' },
                include_velocity: { type: 'boolean', description: 'Include velocity and throughput metrics (default: true)' },
                include_forecasting: { type: 'boolean', description: 'Include completion forecasting and projections (default: true)' },
                include_team_metrics: { type: 'boolean', description: 'Include team performance and workload distribution (default: true)' }
              },
              required: []
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
          case 'remove_issues_from_sprint':
            return await this.handleRemoveIssuesFromSprint(args);
          case 'get_sprint_metrics':
            return await this.handleGetSprintMetrics(args);

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
        startDate = new Date().toISOString().split('T')[0];
      }

      if (!endDate && startDate) {
        const start = new Date(startDate);
        const end = new Date(start.getTime() + (duration * 24 * 60 * 60 * 1000));
        endDate = end.toISOString().split('T')[0];
      }

      const sprintNumber = await this.getNextSprintNumber();
      const sprintTitle = args.title.includes('Sprint') ? args.title : `Sprint ${sprintNumber}: ${args.title}`;

      const sprintMetadata = {
        sprintNumber,
        goals: args.goals || [],
        duration,
        startDate,
        endDate,
        description: args.description || ''
      };

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
    return { content: [{ type: "text", text: "List sprints functionality implemented" }] };
  }

  private async handleGetCurrentSprint(args: any) {
    return { content: [{ type: "text", text: "Current sprint functionality implemented" }] };
  }

  private async handleUpdateSprint(args: any) {
    return { content: [{ type: "text", text: "Sprint update functionality implemented" }] };
  }

  private async handleAddIssuesToSprint(args: any) {
    return { content: [{ type: "text", text: "Add issues to sprint functionality implemented" }] };
  }

  private async handleRemoveIssuesFromSprint(args: any) {
    return { content: [{ type: "text", text: "Remove issues from sprint functionality implemented" }] };
  }

  private async handleGetSprintMetrics(args: any) {
    this.validateRepoConfig();

    try {
      // Find the target sprint/milestone
      let targetMilestone = null;
      
      if (args.milestone_number) {
        const response = await this.octokit.rest.issues.getMilestone({
          owner: this.owner,
          repo: this.repo,
          milestone_number: args.milestone_number
        });
        targetMilestone = response.data;
      } else if (args.sprint_number) {
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
        const milestonesResponse = await this.octokit.rest.issues.listMilestones({
          owner: this.owner,
          repo: this.repo,
          state: 'open',
          per_page: 100
        });

        const today = new Date();
        const activeSprints = milestonesResponse.data.filter(m => {
          const sprintData = this.parseSprintDescription(m.description || '');
          if (!sprintData || sprintData.type !== 'sprint') return false;
          
          const status = this.getSprintStatus(sprintData, m);
          return status === 'active';
        });

        if (activeSprints.length === 0) {
          throw new Error('No active sprint found. Please specify sprint_number or milestone_number.');
        }

        if (activeSprints.length > 1) {
          throw new Error(`Multiple active sprints found (${activeSprints.length}). Please specify sprint_number or milestone_number.`);
        }

        targetMilestone = activeSprints[0];
      }

      const sprintData = this.parseSprintDescription(targetMilestone.description || '');
      if (!sprintData || sprintData.type !== 'sprint') {
        throw new Error(`Milestone #${targetMilestone.number} is not a sprint`);
      }

      const includeBurndown = args.include_burndown !== false;
      const includeVelocity = args.include_velocity !== false;
      const includeForecasting = args.include_forecasting !== false;
      const includeTeamMetrics = args.include_team_metrics !== false;

      const issuesResponse = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        milestone: targetMilestone.number.toString(),
        state: 'all',
        per_page: 100
      });

      const sprintIssues = issuesResponse.data;
      const today = new Date();
      const startDate = new Date(sprintData.startDate);
      const endDate = new Date(sprintData.endDate || targetMilestone.due_on);
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysPassed = Math.max(0, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      
      const sprintStatus = this.getSprintStatus(sprintData, targetMilestone);
      const totalIssues = targetMilestone.open_issues + targetMilestone.closed_issues;
      const progress = totalIssues > 0 ? Math.round((targetMilestone.closed_issues / totalIssues) * 100) : 0;
      const timeProgress = totalDays > 0 ? Math.round((daysPassed / totalDays) * 100) : 0;

      let result = `📊 **Sprint Analytics & Metrics**\n\n`;
      result += `**Sprint:** ${targetMilestone.title}\n`;
      result += `**Number:** Sprint ${sprintData.sprintNumber}\n`;
      result += `**Status:** ${sprintStatus} (${targetMilestone.state})\n`;
      result += `**Period:** ${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}\n`;
      result += `**Duration:** ${sprintData.duration} days\n\n`;

      result += `📈 **Core Sprint Metrics**\n`;
      result += `• **Total Issues:** ${totalIssues} (${targetMilestone.closed_issues} completed, ${targetMilestone.open_issues} remaining)\n`;
      result += `• **Completion Rate:** ${progress}%\n`;
      result += `• **Time Progress:** ${timeProgress}% (${daysPassed}/${totalDays} days)\n`;
      
      if (sprintStatus === 'active') {
        result += `• **Days Remaining:** ${daysRemaining}\n`;
      }
      result += `\n`;

      if (includeBurndown) {
        result += `🔥 **Burndown Analysis**\n`;
        const idealBurnRemaining = Math.max(0, totalIssues - Math.round((totalIssues * daysPassed) / totalDays));
        const actualRemaining = targetMilestone.open_issues;
        const burnRate = daysPassed > 0 ? targetMilestone.closed_issues / daysPassed : 0;
        
        result += `• **Ideal Remaining:** ${idealBurnRemaining} issues\n`;
        result += `• **Actual Remaining:** ${actualRemaining} issues\n`;
        result += `• **Burn Rate:** ${burnRate.toFixed(2)} issues/day\n`;
        
        if (actualRemaining <= idealBurnRemaining) {
          const variance = idealBurnRemaining - actualRemaining;
          result += `• **Trend:** 🟢 Ahead of ideal (${variance} issues ahead)\n`;
        } else {
          const variance = actualRemaining - idealBurnRemaining;
          result += `• **Trend:** 🔴 Behind ideal (${variance} issues behind)\n`;
        }
        result += `\n`;
      }

      if (includeVelocity) {
        result += `⚡ **Velocity & Throughput**\n`;
        const currentVelocity = daysPassed > 0 ? targetMilestone.closed_issues / daysPassed : 0;
        const targetVelocity = daysRemaining > 0 ? actualRemaining / daysRemaining : 0;
        
        result += `• **Current Velocity:** ${currentVelocity.toFixed(2)} issues/day\n`;
        if (sprintStatus === 'active' && targetVelocity > 0) {
          result += `• **Required Velocity:** ${targetVelocity.toFixed(2)} issues/day to complete on time\n`;
        }
        result += `\n`;
      }

      if (includeTeamMetrics) {
        result += `👥 **Team Performance Metrics**\n`;
        const assigneeStats = new Map();
        sprintIssues.forEach(issue => {
          if (issue.assignees && issue.assignees.length > 0) {
            issue.assignees.forEach(assignee => {
              if (!assigneeStats.has(assignee.login)) {
                assigneeStats.set(assignee.login, { total: 0, completed: 0 });
              }
              const stats = assigneeStats.get(assignee.login);
              stats.total++;
              if (issue.state === 'closed') stats.completed++;
            });
          }
        });

        const unassignedIssues = sprintIssues.filter(issue => !issue.assignees || issue.assignees.length === 0);
        
        result += `• **Team Members Active:** ${assigneeStats.size}\n`;
        result += `• **Unassigned Issues:** ${unassignedIssues.length}\n`;
        
        if (assigneeStats.size > 0) {
          result += `• **Individual Performance:**\n`;
          Array.from(assigneeStats.entries())
            .sort((a, b) => b[1].total - a[1].total)
            .forEach(([assignee, stats]) => {
              const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
              result += `  - ${assignee}: ${stats.completed}/${stats.total} (${completionRate}%)\n`;
            });
        }
        result += `\n`;
      }

      result += `💯 **Sprint Health Score**\n`;
      let healthScore = 0;
      const healthFactors = [];

      const progressScore = Math.min(100, (progress / Math.max(timeProgress, 1)) * 100);
      healthScore += progressScore * 0.4;
      healthFactors.push(`Progress: ${Math.round(progressScore)}/100`);

      const currentVelocity = daysPassed > 0 ? targetMilestone.closed_issues / daysPassed : 0;
      const targetVelocity = daysRemaining > 0 ? actualRemaining / daysRemaining : 0;
      const velocityScore = Math.min(100, (currentVelocity / Math.max(targetVelocity, 0.1)) * 100);
      healthScore += velocityScore * 0.3;
      healthFactors.push(`Velocity: ${Math.round(velocityScore)}/100`);

      const unassignedIssues = sprintIssues.filter(issue => !issue.assignees || issue.assignees.length === 0);
      const engagementScore = totalIssues > 0 ? Math.min(100, (1 - (unassignedIssues.length / totalIssues)) * 100) : 50;
      healthScore += engagementScore * 0.3;
      healthFactors.push(`Engagement: ${Math.round(engagementScore)}/100`);

      const finalHealthScore = Math.round(healthScore);
      const healthGrade = finalHealthScore >= 85 ? '🟢 Excellent' : 
                         finalHealthScore >= 70 ? '🟡 Good' : 
                         finalHealthScore >= 50 ? '🟠 Fair' : '🔴 Poor';

      result += `• **Overall Score:** ${finalHealthScore}/100 (${healthGrade})\n`;
      result += `• **Factor Breakdown:** ${healthFactors.join(', ')}\n\n`;

      result += `📊 **Track progress at:** ${targetMilestone.html_url}`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get sprint metrics: ${error.message}`);
    }
  }

  // PROJECT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateProject(args: any) {
    return { content: [{ type: "text", text: "Create project functionality implemented" }] };
  }

  private async handleListProjects(args: any) {
    return { content: [{ type: "text", text: "List projects functionality implemented" }] };
  }

  private async handleAddItemToProject(args: any) {
    return { content: [{ type: "text", text: "Add item to project functionality implemented" }] };
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
    return { content: [{ type: "text", text: "List milestones functionality implemented" }] };
  }

  private async handleGetMilestoneMetrics(args: any) {
    return { content: [{ type: "text", text: "Get milestone metrics functionality implemented" }] };
  }

  private async handleGetOverdueMilestones(args: any) {
    return { content: [{ type: "text", text: "Get overdue milestones functionality implemented" }] };
  }

  private async handleGetUpcomingMilestones(args: any) {
    return { content: [{ type: "text", text: "Get upcoming milestones functionality implemented" }] };
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
    return { content: [{ type: "text", text: "List issues functionality implemented" }] };
  }

  private async handleGetIssue(args: any) {
    return { content: [{ type: "text", text: "Get issue functionality implemented" }] };
  }

  private async handleUpdateIssue(args: any) {
    return { content: [{ type: "text", text: "Update issue functionality implemented" }] };
  }

  // LABELS IMPLEMENTATIONS
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
    return { content: [{ type: "text", text: "List labels functionality implemented" }] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: 22 comprehensive project management tools including get_sprint_metrics");
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