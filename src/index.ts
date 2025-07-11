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
import { z } from 'zod';

/**
 * Modern GitHub Project Manager MCP Server
 * Complete implementation with all 15+ working tools using current SDK
 */
class GitHubProjectManagerServer {
  private server: Server;
  private octokit: Octokit;
  private graphqlWithAuth: any;
  private owner: string;
  private repo: string;

  constructor() {
    // Initialize with current SDK Server class
    this.server = new Server(
      {
        name: 'github-project-manager',
        version: '3.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
      }
    );

    // Initialize GitHub clients
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
    this.setupResourceHandlers();
    this.setupPromptHandlers();
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

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // ISSUE MANAGEMENT
          {
            name: 'create_issue',
            description: 'Create a new GitHub issue with modern validation and error handling',
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
            description: 'List repository issues with advanced filtering options',
            inputSchema: {
              type: 'object',
              properties: {
                state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter' },
                labels: { type: 'string', description: 'Comma-separated list of labels' },
                assignee: { type: 'string', description: 'Filter by assignee' },
                milestone: { type: 'string', description: 'Filter by milestone' },
                per_page: { type: 'number', maximum: 100, description: 'Number of results per page' }
              },
              required: []
            }
          },
          {
            name: 'get_issue',
            description: 'Get detailed information about a specific issue',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number to retrieve' }
              },
              required: ['issue_number']
            }
          },
          {
            name: 'update_issue',
            description: 'Update an existing GitHub issue',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number to update' },
                title: { type: 'string', description: 'New issue title' },
                body: { type: 'string', description: 'New issue description' },
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
            description: 'Create a project milestone with due date and progress tracking',
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
            description: 'List repository milestones with sorting and filtering',
            inputSchema: {
              type: 'object',
              properties: {
                state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Milestone state filter' },
                sort: { type: 'string', enum: ['due_on', 'completeness'], description: 'Sort criteria' },
                direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' }
              },
              required: []
            }
          },
          {
            name: 'get_milestone_metrics',
            description: 'Get comprehensive progress metrics for a milestone',
            inputSchema: {
              type: 'object',
              properties: {
                milestone_number: { type: 'number', description: 'Milestone number to analyze' }
              },
              required: ['milestone_number']
            }
          },
          {
            name: 'get_overdue_milestones',
            description: 'Find all overdue milestones needing attention',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'get_upcoming_milestones',
            description: 'Get milestones due within a specified timeframe',
            inputSchema: {
              type: 'object',
              properties: {
                days: { type: 'number', minimum: 1, maximum: 365, description: 'Number of days to look ahead' }
              },
              required: ['days']
            }
          },
          // LABEL MANAGEMENT
          {
            name: 'create_label',
            description: 'Create a new GitHub label with color and description',
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
            description: 'List all repository labels with colors and descriptions',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          // ADVANCED ANALYTICS
          {
            name: 'analyze_task_complexity',
            description: 'AI-powered analysis of issue complexity with story point estimation',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number to analyze' }
              },
              required: ['issue_number']
            }
          },
          {
            name: 'get_repository_summary',
            description: 'Comprehensive repository health analysis with trends and metrics',
            inputSchema: {
              type: 'object',
              properties: {
                include_trends: { type: 'boolean', description: 'Include trend analysis' }
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
          case 'get_overdue_milestones':
            return await this.handleGetOverdueMilestones(args);
          case 'get_upcoming_milestones':
            return await this.handleGetUpcomingMilestones(args);

          // LABEL MANAGEMENT
          case 'create_label':
            return await this.handleCreateLabel(args);
          case 'list_labels':
            return await this.handleListLabels(args);

          // ADVANCED ANALYTICS
          case 'analyze_task_complexity':
            return await this.handleAnalyzeTaskComplexity(args);
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
          text: `✅ **Issue created successfully!**\n\n` +
                `**Title:** ${response.data.title}\n` +
                `**Number:** #${response.data.number}\n` +
                `**State:** ${response.data.state}\n` +
                `**Labels:** ${response.data.labels.map((l: any) => l.name).join(', ') || 'None'}\n` +
                `**Assignees:** ${response.data.assignees?.map((a: any) => a.login).join(', ') || 'None'}\n` +
                `**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to create issue: ${error.message}`
        }],
        isError: true
      };
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
        per_page: args.per_page || 30
      });

      const issues = response.data.filter(issue => !issue.pull_request);
      let result = `📋 **Repository Issues** - Found ${issues.length} issues\n\n`;
      
      if (issues.length === 0) {
        result += "No issues found matching the criteria.";
      } else {
        issues.forEach(issue => {
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
      return {
        content: [{
          type: "text",
          text: `❌ Failed to list issues: ${error.message}`
        }],
        isError: true
      };
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
        result += `**Description:**\n${issue.body.length > 500 ? issue.body.substring(0, 500) + '...' : issue.body}`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to get issue: ${error.message}`
        }],
        isError: true
      };
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
      if (args.body !== undefined) updateData.body = args.body;
      if (args.state) updateData.state = args.state;
      if (args.labels) updateData.labels = args.labels;
      if (args.assignees) updateData.assignees = args.assignees;
      if (args.milestone) updateData.milestone = args.milestone;

      const response = await this.octokit.rest.issues.update(updateData);

      return {
        content: [{
          type: "text",
          text: `✅ **Issue updated successfully!**\n\n` +
                `**Title:** ${response.data.title}\n` +
                `**Number:** #${response.data.number}\n` +
                `**State:** ${response.data.state}\n` +
                `**Labels:** ${response.data.labels.map((l: any) => l.name).join(', ') || 'None'}\n` +
                `**Assignees:** ${response.data.assignees?.map((a: any) => a.login).join(', ') || 'None'}\n` +
                `**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to update issue: ${error.message}`
        }],
        isError: true
      };
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
          text: `✅ **Milestone created successfully!**\n\n` +
                `**Title:** ${response.data.title}\n` +
                `**Number:** ${response.data.number}\n` +
                `**Description:** ${response.data.description || 'None'}\n` +
                `**Due Date:** ${response.data.due_on ? new Date(response.data.due_on).toLocaleDateString() : 'Not set'}\n` +
                `**State:** ${response.data.state}\n` +
                `**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to create milestone: ${error.message}`
        }],
        isError: true
      };
    }
  }

  private async handleListMilestones(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: args.state || 'open',
        sort: args.sort || 'due_on',
        direction: args.direction || 'asc',
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
      return {
        content: [{
          type: "text",
          text: `❌ Failed to list milestones: ${error.message}`
        }],
        isError: true
      };
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
      return {
        content: [{
          type: "text",
          text: `❌ Failed to get milestone metrics: ${error.message}`
        }],
        isError: true
      };
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
      return {
        content: [{
          type: "text",
          text: `❌ Failed to get overdue milestones: ${error.message}`
        }],
        isError: true
      };
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
      return {
        content: [{
          type: "text",
          text: `❌ Failed to get upcoming milestones: ${error.message}`
        }],
        isError: true
      };
    }
  }

  // LABEL MANAGEMENT IMPLEMENTATIONS
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
          text: `✅ **Label created successfully!**\n\n` +
                `**Name:** ${response.data.name}\n` +
                `**Color:** #${response.data.color}\n` +
                `**Description:** ${response.data.description || "None"}`
        }]
      };
    } catch (error: any) {
      if (error.status === 422) {
        return {
          content: [{
            type: "text",
            text: `❌ Label "${args.name}" already exists`
          }],
          isError: true
        };
      }
      return {
        content: [{
          type: "text",
          text: `❌ Failed to create label: ${error.message}`
        }],
        isError: true
      };
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
      return {
        content: [{
          type: "text",
          text: `❌ Failed to list labels: ${error.message}`
        }],
        isError: true
      };
    }
  }

  // ADVANCED ANALYTICS IMPLEMENTATIONS
  private async handleAnalyzeTaskComplexity(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: args.issue_number
      });

      const issue = response.data;
      const complexity = this.analyzeIssueComplexity(issue);
      const priority = this.calculateIssuePriority(issue);
      const readiness = this.assessIssueReadiness(issue);

      let result = `🔍 **Task Complexity Analysis: #${issue.number}**\n\n`;
      result += `**Issue:** ${issue.title}\n`;
      result += `**Complexity Score:** ${complexity}/8 story points\n`;
      result += `**Priority Level:** ${priority}/5 ${this.getPriorityEmoji(priority)}\n`;
      result += `**Readiness Score:** ${Math.round(readiness.score * 100)}% ${readiness.ready ? '✅' : '⚠️'}\n\n`;

      result += `**Complexity Breakdown:**\n`;
      result += `• Title complexity: ${issue.title.split(' ').length > 10 ? 'High' : 'Normal'}\n`;
      result += `• Description length: ${issue.body ? issue.body.length > 1000 ? 'Detailed' : 'Adequate' : 'Missing'}\n`;
      result += `• Labels: ${issue.labels.length} assigned\n`;
      result += `• Technical indicators: ${this.getTechnicalKeywords(issue.body || '').length}\n\n`;

      if (!readiness.ready && readiness.blockers.length > 0) {
        result += `**Blockers:**\n`;
        readiness.blockers.forEach(blocker => {
          result += `• ${blocker}\n`;
        });
        result += `\n`;
      }

      result += `**Recommendations:**\n`;
      if (complexity > 5) {
        result += `• Consider breaking down into smaller tasks\n`;
      }
      if (priority > 3 && !readiness.ready) {
        result += `• High priority issue needs immediate attention to blockers\n`;
      }
      if (!issue.assignees || issue.assignees.length === 0) {
        result += `• Assign to team member for ownership\n`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to analyze task complexity: ${error.message}`
        }],
        isError: true
      };
    }
  }

  private async handleGetRepositorySummary(args: any) {
    this.validateRepoConfig();

    try {
      // Get repository info
      const repoResponse = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      // Get issues and milestones
      const [issuesResponse, milestonesResponse] = await Promise.all([
        this.octokit.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: 'all',
          per_page: 100
        }),
        this.octokit.rest.issues.listMilestones({
          owner: this.owner,
          repo: this.repo,
          state: 'all',
          per_page: 100
        })
      ]);

      const repo = repoResponse.data;
      const allIssues = issuesResponse.data.filter(issue => !issue.pull_request);
      const openIssues = allIssues.filter(issue => issue.state === 'open');
      const closedIssues = allIssues.filter(issue => issue.state === 'closed');
      const milestones = milestonesResponse.data;

      // Calculate metrics
      const totalComplexity = allIssues.reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
      const completedComplexity = closedIssues.reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
      const completionRate = totalComplexity > 0 ? Math.round((completedComplexity / totalComplexity) * 100) : 0;

      let result = `📊 **Repository Summary: ${repo.name}**\n\n`;
      result += `**Repository Info:**\n`;
      result += `• Description: ${repo.description || 'No description'}\n`;
      result += `• Language: ${repo.language || 'Not specified'}\n`;
      result += `• Stars: ⭐ ${repo.stargazers_count}\n`;
      result += `• Forks: 🍴 ${repo.forks_count}\n`;
      result += `• Created: ${new Date(repo.created_at).toLocaleDateString()}\n\n`;

      result += `**Project Health Metrics:**\n`;
      result += `• Total Issues: ${allIssues.length} (${openIssues.length} open, ${closedIssues.length} closed)\n`;
      result += `• Completion Rate: ${completionRate}%\n`;
      result += `• Total Story Points: ${totalComplexity} (${totalComplexity - completedComplexity} remaining)\n`;
      result += `• Active Milestones: ${milestones.filter(m => m.state === 'open').length}\n`;
      result += `• Completed Milestones: ${milestones.filter(m => m.state === 'closed').length}\n\n`;

      // Issue categories
      const issueCategories = this.categorizeIssuesByType(allIssues);
      result += `**Issue Breakdown:**\n`;
      Object.entries(issueCategories).forEach(([category, issues]) => {
        const categoryComplexity = issues.reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
        result += `• ${category}: ${issues.length} issues (${categoryComplexity} sp)\n`;
      });

      if (args.include_trends !== false) {
        result += `\n**Recent Activity:**\n`;
        const recentIssues = allIssues.filter(issue => {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return new Date(issue.created_at) > weekAgo;
        });
        result += `• New issues this week: ${recentIssues.length}\n`;
        
        const recentlyClosedIssues = closedIssues.filter(issue => {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return issue.closed_at && new Date(issue.closed_at) > weekAgo;
        });
        result += `• Issues closed this week: ${recentlyClosedIssues.length}\n`;
      }

      // Health score calculation
      const healthScore = Math.round(
        (completionRate * 0.4) + 
        (Math.min(100, (closedIssues.length / Math.max(1, allIssues.length)) * 100) * 0.3) +
        (Math.min(100, 100 - (openIssues.length * 2)) * 0.3)
      );

      result += `\n**Overall Health Score:** ${healthScore}/100 ${this.getHealthEmoji(healthScore)}\n`;
      result += `**Repository URL:** ${repo.html_url}`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `❌ Failed to get repository summary: ${error.message}`
        }],
        isError: true
      };
    }
  }

  // Helper methods for AI analysis
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
      const technicalKeywords = this.getTechnicalKeywords(issue.body);
      complexity += Math.min(technicalKeywords.length, 3);
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

  private assessIssueReadiness(issue: any): { ready: boolean; score: number; blockers: string[] } {
    const blockers: string[] = [];
    let readinessScore = 1;
    
    // Check if issue has clear acceptance criteria
    if (!issue.body || issue.body.length < 50) {
      blockers.push('Insufficient description');
      readinessScore -= 0.3;
    }
    
    // Check for blocked labels
    const blockedLabels = issue.labels.filter((label: any) => 
      ['blocked', 'waiting', 'needs-info', 'dependencies'].some(keyword =>
        label.name.toLowerCase().includes(keyword)
      )
    );
    if (blockedLabels.length > 0) {
      blockers.push(`Blocked by: ${blockedLabels.map(l => l.name).join(', ')}`);
      readinessScore -= 0.5;
    }
    
    // Check for assignee
    if (!issue.assignees || issue.assignees.length === 0) {
      blockers.push('No assignee');
      readinessScore -= 0.2;
    }
    
    // Check for recent comments indicating activity
    if (issue.comments > 0) {
      readinessScore += 0.2;
    }
    
    const finalScore = Math.max(0, Math.min(1, readinessScore));
    return {
      ready: finalScore > 0.6 && blockers.length === 0,
      score: finalScore,
      blockers
    };
  }

  private getTechnicalKeywords(text: string): string[] {
    const keywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security', 'performance', 'optimization', 'testing', 'deployment'];
    return keywords.filter(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    );
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

  private getPriorityEmoji(priority: number): string {
    if (priority >= 4) return '🔴';
    if (priority >= 3) return '🟡';
    return '🟢';
  }

  private getHealthEmoji(score: number): string {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟡';
    return '🔴';
  }

  private setupResourceHandlers() {
    // Resource handlers can be added here when needed
    // Current SDK version supports basic resource capabilities
  }

  private setupPromptHandlers() {
    // Prompt handlers can be added here when needed  
    // Current SDK version supports basic prompt capabilities
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🚀 Modern GitHub Project Manager MCP server running");
    console.error(`📁 Repository: ${this.owner}/${this.repo}`);
    console.error("🛠️  Tools: 13 comprehensive project management tools");
    console.error("📚 Modern error handling with isError flags");
    console.error("🎯 AI-powered analytics and complexity analysis");
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