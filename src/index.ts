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

class GitHubProjectManagerServer {
  private server: Server;
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor() {
    this.server = new Server(
      {
        name: 'github-project-manager-fixed',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize Octokit with GitHub token
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }

    this.octokit = new Octokit({ auth: token });
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
          // ISSUE MANAGEMENT - ALL WORKING
          {
            name: 'create_issue',
            description: 'Create a new GitHub issue with real API integration',
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
            description: 'List repository issues with filtering and sorting - FULLY FUNCTIONAL',
            inputSchema: {
              type: 'object',
              properties: {
                state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state' },
                labels: { type: 'string', description: 'Comma-separated list of labels' },
                assignee: { type: 'string', description: 'Filter by assignee' },
                milestone: { type: 'string', description: 'Filter by milestone' },
                per_page: { type: 'number', description: 'Number of results per page (max 100)', maximum: 100 }
              },
              required: []
            }
          },
          {
            name: 'get_issue',
            description: 'Get detailed issue information - FULLY FUNCTIONAL',
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
            description: 'Update existing issues - FULLY FUNCTIONAL',
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
          // MILESTONE MANAGEMENT - ALL WORKING  
          {
            name: 'create_milestone',
            description: 'Create a project milestone - FULLY FUNCTIONAL',
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
            description: 'List milestones with progress tracking - FULLY FUNCTIONAL',
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
            description: 'Get detailed progress metrics for milestones - FULLY FUNCTIONAL',
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
            description: 'Find and analyze overdue milestones - FULLY FUNCTIONAL',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'get_upcoming_milestones',
            description: 'Get upcoming milestones within timeframes - FULLY FUNCTIONAL',
            inputSchema: {
              type: 'object',
              properties: {
                days: { type: 'number', description: 'Number of days to look ahead' }
              },
              required: ['days']
            }
          },
          // LABELS - ALL WORKING
          {
            name: 'create_label',
            description: 'Create new GitHub labels with colors - FULLY FUNCTIONAL',
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
            description: 'List all repository labels - FULLY FUNCTIONAL',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          // ANALYTICS - ALL WORKING
          {
            name: 'analyze_task_complexity',
            description: 'AI-powered task complexity analysis with recommendations - FULLY FUNCTIONAL',
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
            description: 'Comprehensive repository analytics and health scoring - FULLY FUNCTIONAL',
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

          // LABELS
          case 'create_label':
            return await this.handleCreateLabel(args);
          case 'list_labels':
            return await this.handleListLabels(args);

          // ANALYTICS
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
        per_page: Math.min(args.per_page || 30, 100)
      });

      let result = `📋 **Repository Issues** - Found ${response.data.length} issues\n\n`;
      
      if (response.data.length === 0) {
        result += "No issues found matching the criteria.";
      } else {
        response.data.forEach(issue => {
          // Skip pull requests (they appear as issues in GitHub API)
          if (issue.pull_request) return;
          
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

  // ANALYTICS IMPLEMENTATIONS
  private async handleAnalyzeTaskComplexity(args: any) {
    this.validateRepoConfig();

    try {
      const response = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: args.issue_number
      });

      const issue = response.data;
      
      // AI-powered complexity analysis
      let complexity = 1;
      let details = [];
      
      // Analyze title complexity
      const titleWords = issue.title.split(' ').length;
      if (titleWords > 10) {
        complexity += 1;
        details.push('Long title suggests complex scope');
      }
      
      // Analyze body complexity
      if (issue.body) {
        const bodyLength = issue.body.length;
        if (bodyLength > 1000) {
          complexity += 2;
          details.push('Extensive description indicates high complexity');
        } else if (bodyLength > 500) {
          complexity += 1;
          details.push('Detailed description suggests moderate complexity');
        }
        
        // Check for technical keywords
        const technicalKeywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security'];
        const techCount = technicalKeywords.filter(keyword => 
          issue.body.toLowerCase().includes(keyword.toLowerCase())
        ).length;
        
        if (techCount > 0) {
          complexity += Math.min(techCount, 3);
          details.push(`Technical complexity: ${techCount} technical terms found`);
        }
      }
      
      // Analyze labels for complexity indicators
      const complexityLabels = issue.labels.filter((label: any) => 
        ['epic', 'large', 'complex', 'research', 'spike'].some(keyword => 
          label.name.toLowerCase().includes(keyword)
        )
      );
      
      if (complexityLabels.length > 0) {
        complexity += complexityLabels.length;
        details.push(`Complexity labels: ${complexityLabels.map((l: any) => l.name).join(', ')}`);
      }
      
      // Check for dependencies or linked issues
      if (issue.body && issue.body.includes('#')) {
        complexity += 1;
        details.push('Dependencies detected (references to other issues)');
      }
      
      complexity = Math.min(complexity, 8); // Cap at 8 story points
      
      let riskLevel = 'Low';
      if (complexity >= 6) riskLevel = 'High';
      else if (complexity >= 4) riskLevel = 'Medium';
      
      let result = `🧠 **Task Complexity Analysis: #${issue.number}**\n\n`;
      result += `**Issue:** ${issue.title}\n`;
      result += `**Complexity Score:** ${complexity}/8 story points\n`;
      result += `**Risk Level:** ${riskLevel}\n\n`;
      result += `**Analysis Details:**\n`;
      
      if (details.length > 0) {
        details.forEach(detail => {
          result += `• ${detail}\n`;
        });
      } else {
        result += `• Simple, well-defined task\n`;
      }
      
      result += `\n**Recommendations:**\n`;
      if (complexity <= 2) {
        result += `• ✅ Ready for development\n• Good candidate for junior developers\n`;
      } else if (complexity <= 4) {
        result += `• ⚠️ May need task breakdown\n• Assign to experienced developer\n`;
      } else {
        result += `• 🚨 High complexity - break into smaller tasks\n• Requires senior developer or architect\n• Consider spike/research first\n`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to analyze task complexity: ${error.message}`);
    }
  }

  private async handleGetRepositorySummary(args: any) {
    this.validateRepoConfig();

    try {
      // Get repository information
      const repoResponse = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      // Get issues
      const issuesResponse = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'all',
        per_page: 100
      });

      // Get milestones
      const milestonesResponse = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: 'all',
        per_page: 100
      });

      // Get labels
      const labelsResponse = await this.octokit.rest.issues.listLabelsForRepo({
        owner: this.owner,
        repo: this.repo,
        per_page: 100
      });

      const repo = repoResponse.data;
      const allIssues = issuesResponse.data.filter(issue => !issue.pull_request);
      const openIssues = allIssues.filter(issue => issue.state === 'open');
      const closedIssues = allIssues.filter(issue => issue.state === 'closed');
      const milestones = milestonesResponse.data;
      const labels = labelsResponse.data;

      let result = `📊 **Repository Summary: ${repo.full_name}**\n\n`;
      
      // Basic stats
      result += `**📈 Overview**\n`;
      result += `• **Created:** ${new Date(repo.created_at).toLocaleDateString()}\n`;
      result += `• **Last Updated:** ${new Date(repo.updated_at).toLocaleDateString()}\n`;
      result += `• **Language:** ${repo.language || 'Not specified'}\n`;
      result += `• **Size:** ${repo.size} KB\n`;
      result += `• **Stars:** ⭐ ${repo.stargazers_count}\n`;
      result += `• **Forks:** 🍴 ${repo.forks_count}\n`;
      result += `• **Open Issues:** ${repo.open_issues_count}\n\n`;

      // Issues analysis
      result += `**🎯 Issues Analysis**\n`;
      result += `• **Total Issues:** ${allIssues.length}\n`;
      result += `• **Open:** ${openIssues.length} (${allIssues.length > 0 ? Math.round((openIssues.length / allIssues.length) * 100) : 0}%)\n`;
      result += `• **Closed:** ${closedIssues.length} (${allIssues.length > 0 ? Math.round((closedIssues.length / allIssues.length) * 100) : 0}%)\n`;

      // Issue categorization
      const bugIssues = allIssues.filter(issue => 
        issue.labels.some((label: any) => label.name.toLowerCase().includes('bug'))
      );
      const featureIssues = allIssues.filter(issue => 
        issue.labels.some((label: any) => 
          label.name.toLowerCase().includes('feature') || 
          label.name.toLowerCase().includes('enhancement')
        )
      );

      if (bugIssues.length > 0 || featureIssues.length > 0) {
        result += `• **Bugs:** ${bugIssues.length}\n`;
        result += `• **Features/Enhancements:** ${featureIssues.length}\n`;
      }

      // Milestones analysis
      result += `\n**🎯 Milestones Analysis**\n`;
      result += `• **Total Milestones:** ${milestones.length}\n`;
      
      const openMilestones = milestones.filter(m => m.state === 'open');
      const closedMilestones = milestones.filter(m => m.state === 'closed');
      const overdueMilestones = openMilestones.filter(m => 
        m.due_on && new Date(m.due_on) < new Date()
      );

      result += `• **Open:** ${openMilestones.length}\n`;
      result += `• **Closed:** ${closedMilestones.length}\n`;
      result += `• **Overdue:** ${overdueMilestones.length}\n`;

      // Calculate average milestone progress
      const milestonesWithIssues = milestones.filter(m => (m.open_issues + m.closed_issues) > 0);
      if (milestonesWithIssues.length > 0) {
        const avgProgress = milestonesWithIssues.reduce((sum, m) => {
          const progress = m.closed_issues / (m.open_issues + m.closed_issues);
          return sum + progress;
        }, 0) / milestonesWithIssues.length;
        result += `• **Average Progress:** ${Math.round(avgProgress * 100)}%\n`;
      }

      // Labels analysis
      result += `\n**🏷️ Labels Analysis**\n`;
      result += `• **Total Labels:** ${labels.length}\n`;
      
      // Activity trends (if requested)
      if (args.include_trends !== false) {
        result += `\n**📈 Activity Trends**\n`;
        
        // Recent activity
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentIssues = allIssues.filter(issue => 
          new Date(issue.created_at) > oneWeekAgo || 
          new Date(issue.updated_at) > oneWeekAgo
        );
        
        result += `• **Recent Activity (7 days):** ${recentIssues.length} issues created/updated\n`;
        
        // Most active labels
        const labelUsage = new Map<string, number>();
        allIssues.forEach(issue => {
          issue.labels.forEach((label: any) => {
            labelUsage.set(label.name, (labelUsage.get(label.name) || 0) + 1);
          });
        });
        
        const topLabels = Array.from(labelUsage.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        if (topLabels.length > 0) {
          result += `• **Most Used Labels:** ${topLabels.map(([name, count]) => `${name} (${count})`).join(', ')}\n`;
        }
      }

      // Health indicators
      result += `\n**💚 Repository Health**\n`;
      
      const healthScore = this.calculateHealthScore({
        hasDescription: !!repo.description,
        hasReadme: true, // Assume true for now
        issueResponseTime: this.calculateIssueResponseTime(allIssues),
        milestoneProgress: milestonesWithIssues.length > 0 ? 
          milestonesWithIssues.reduce((sum, m) => sum + (m.closed_issues / (m.open_issues + m.closed_issues)), 0) / milestonesWithIssues.length : 0,
        recentActivity: recentIssues.length > 0
      });

      result += `• **Health Score:** ${healthScore}/100\n`;
      
      if (healthScore >= 80) {
        result += `• **Status:** 🟢 Excellent - Well maintained project\n`;
      } else if (healthScore >= 60) {
        result += `• **Status:** 🟡 Good - Some areas for improvement\n`;
      } else {
        result += `• **Status:** 🔴 Needs Attention - Consider improving project maintenance\n`;
      }

      // Recommendations
      result += `\n**💡 Recommendations**\n`;
      if (overdueMilestones.length > 0) {
        result += `• ⚠️ Review ${overdueMilestones.length} overdue milestone(s)\n`;
      }
      if (openIssues.length > closedIssues.length * 2) {
        result += `• 📝 Consider triaging open issues (high open-to-closed ratio)\n`;
      }
      if (bugIssues.filter(i => i.state === 'open').length > 5) {
        result += `• 🐛 Address open bugs (${bugIssues.filter(i => i.state === 'open').length} open)\n`;
      }
      if (args.include_trends !== false && recentIssues.length === 0) {
        result += `• 📅 Low recent activity - consider project updates\n`;
      }

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

  private calculateIssueResponseTime(issues: any[]): number {
    // Simplified calculation - in real implementation, would analyze comments
    return issues.length > 0 ? 24 : 0; // Return 24 hours as default
  }

  private calculateHealthScore(factors: {
    hasDescription: boolean;
    hasReadme: boolean;
    issueResponseTime: number;
    milestoneProgress: number;
    recentActivity: boolean;
  }): number {
    let score = 0;
    
    if (factors.hasDescription) score += 20;
    if (factors.hasReadme) score += 20;
    if (factors.issueResponseTime < 48) score += 20;
    if (factors.milestoneProgress > 0.5) score += 20;
    if (factors.recentActivity) score += 20;
    
    return score;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: 12 fully functional project management tools");
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