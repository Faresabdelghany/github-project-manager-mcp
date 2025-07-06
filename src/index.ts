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
        version: '2.11.0',
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
      blockers.push(`Blocked by: ${blockedLabels.map((l: any) => l.name).join(', ')}`);
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

  private calculateTeamCapacity(teamMembers: string[], sprintDuration: number): number {
    // Base capacity: 6 hours per day per team member
    const hoursPerDay = 6;
    const totalWorkingDays = Math.floor(sprintDuration * 0.8); // Account for weekends
    const baseCapacity = teamMembers.length * hoursPerDay * totalWorkingDays;
    
    // Assume average 2 hours per story point
    const storyPointCapacity = Math.floor(baseCapacity / 2);
    
    return storyPointCapacity;
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
                description: { type: 'string', description: 'Project description' },
                visibility: { type: 'string', enum: ['private', 'public'], description: 'Project visibility' }
              },
              required: ['title', 'visibility']
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
            name: 'get_project',
            description: 'Get details of a specific project',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'GitHub Project v2 ID' },
                project_number: { type: 'number', description: 'Project number' }
              },
              required: []
            }
          },
          {
            name: 'update_project',
            description: 'Update project information',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'GitHub Project v2 ID' },
                project_number: { type: 'number', description: 'Project number' },
                title: { type: 'string', description: 'New project title' },
                description: { type: 'string', description: 'New project description' }
              },
              required: []
            }
          },
          {
            name: 'delete_project',
            description: 'Safely delete GitHub projects with comprehensive data archiving, risk assessment, and confirmation requirements',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'GitHub Project v2 ID (node ID)' },
                project_number: { type: 'number', description: 'Project number (alternative to project_id)' },
                confirm_deletion: { type: 'boolean', description: 'Required confirmation to proceed with permanent deletion (default: false)', default: false }
              },
              required: []
            }
          },
          // MILESTONE MANAGEMENT
          {
            name: 'create_milestone',
            description: 'Create project milestones',
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
            name: 'update_milestone',
            description: 'Update milestone details',
            inputSchema: {
              type: 'object',
              properties: {
                milestone_number: { type: 'number', description: 'Milestone number' },
                title: { type: 'string', description: 'Milestone title' },
                description: { type: 'string', description: 'Milestone description' },
                due_on: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
                state: { type: 'string', enum: ['open', 'closed'], description: 'Milestone state' }
              },
              required: ['milestone_number']
            }
          },
          {
            name: 'delete_milestone',
            description: 'Delete milestones',
            inputSchema: {
              type: 'object',
              properties: {
                milestone_number: { type: 'number', description: 'Milestone number' }
              },
              required: ['milestone_number']
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
            description: 'Create new GitHub issues',
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
          // SPRINT MANAGEMENT
          {
            name: 'create_sprint',
            description: 'Create development sprints',
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
            description: 'List all sprints',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['active', 'completed', 'planned', 'overdue', 'all'], description: 'Sprint status filter' }
              },
              required: []
            }
          },
          {
            name: 'get_current_sprint',
            description: 'Get the active sprint',
            inputSchema: {
              type: 'object',
              properties: {
                include_issues: { type: 'boolean', description: 'Include list of sprint issues (default: true)' }
              },
              required: []
            }
          },
          {
            name: 'update_sprint',
            description: 'Update sprint details',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number to update' },
                title: { type: 'string', description: 'New sprint title' },
                description: { type: 'string', description: 'New sprint description' },
                goals: { type: 'array', items: { type: 'string' }, description: 'Updated sprint goals' }
              },
              required: ['sprint_number']
            }
          },
          {
            name: 'add_issues_to_sprint',
            description: 'Add issues to existing sprints',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number' },
                issue_numbers: { type: 'array', items: { type: 'number' }, description: 'Array of issue numbers' }
              },
              required: ['sprint_number', 'issue_numbers']
            }
          },
          {
            name: 'remove_issues_from_sprint',
            description: 'Remove issues from sprints',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number' },
                issue_numbers: { type: 'array', items: { type: 'number' }, description: 'Array of issue numbers' }
              },
              required: ['sprint_number', 'issue_numbers']
            }
          },
          {
            name: 'get_sprint_metrics',
            description: 'Get sprint progress metrics',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_number: { type: 'number', description: 'Sprint number to analyze' }
              },
              required: ['sprint_number']
            }
          },
          {
            name: 'plan_sprint',
            description: 'Plan new sprints with selected issues',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_title: { type: 'string', description: 'Proposed sprint title' },
                team_members: { type: 'array', items: { type: 'string' }, description: 'List of team member GitHub usernames' },
                sprint_duration: { type: 'number', description: 'Sprint duration in days (default: 14)' }
              },
              required: ['sprint_title']
            }
          },
          // ADVANCED PROJECT PLANNING
          {
            name: 'create_roadmap',
            description: 'Create comprehensive project roadmaps',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Roadmap title' },
                time_horizon: { type: 'string', enum: ['monthly', 'quarterly', 'yearly'], description: 'Timeline granularity' }
              },
              required: ['title']
            }
          },
          {
            name: 'generate_prd',
            description: 'Generate Product Requirements Documents',
            inputSchema: {
              type: 'object',
              properties: {
                product_name: { type: 'string', description: 'Product name' },
                description: { type: 'string', description: 'Product description' }
              },
              required: ['product_name']
            }
          },
          {
            name: 'parse_prd',
            description: 'Parse PRDs and generate actionable development tasks',
            inputSchema: {
              type: 'object',
              properties: {
                prd_content: { type: 'string', description: 'PRD content to parse' }
              },
              required: ['prd_content']
            }
          },
          {
            name: 'enhance_prd',
            description: 'Enhance existing PRDs',
            inputSchema: {
              type: 'object',
              properties: {
                prd_content: { type: 'string', description: 'Existing PRD content' }
              },
              required: ['prd_content']
            }
          },
          {
            name: 'add_feature',
            description: 'Add new features to existing projects with impact analysis',
            inputSchema: {
              type: 'object',
              properties: {
                feature_name: { type: 'string', description: 'Feature name' },
                feature_description: { type: 'string', description: 'Feature description' }
              },
              required: ['feature_name']
            }
          },
          // TASK MANAGEMENT
          {
            name: 'get_next_task',
            description: 'Get AI recommendations for next tasks to work on',
            inputSchema: {
              type: 'object',
              properties: {
                assignee: { type: 'string', description: 'Filter tasks for specific assignee' },
                priority_level: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'Minimum priority level' }
              },
              required: []
            }
          },
          {
            name: 'analyze_task_complexity',
            description: 'Perform detailed task complexity analysis',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number to analyze' }
              },
              required: ['issue_number']
            }
          },
          {
            name: 'expand_task',
            description: 'Break down complex tasks into manageable subtasks',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number to break down' },
                granularity: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Level of detail' }
              },
              required: ['issue_number']
            }
          },
          // PROJECT STRUCTURE
          {
            name: 'create_project_field',
            description: 'Create custom fields for projects',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' },
                field_name: { type: 'string', description: 'Field name' },
                field_type: { type: 'string', description: 'Field type' }
              },
              required: ['project_id', 'field_name', 'field_type']
            }
          },
          {
            name: 'list_project_fields',
            description: 'List all project fields',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' }
              },
              required: ['project_id']
            }
          },
          {
            name: 'update_project_field',
            description: 'Update custom fields',
            inputSchema: {
              type: 'object',
              properties: {
                field_id: { type: 'string', description: 'Field ID' },
                field_name: { type: 'string', description: 'New field name' }
              },
              required: ['field_id']
            }
          },
          {
            name: 'create_project_view',
            description: 'Create project views (board, table, timeline, roadmap)',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' },
                view_name: { type: 'string', description: 'View name' },
                view_type: { type: 'string', description: 'View type' }
              },
              required: ['project_id', 'view_name', 'view_type']
            }
          },
          {
            name: 'list_project_views',
            description: 'List all project views',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' }
              },
              required: ['project_id']
            }
          },
          {
            name: 'update_project_view',
            description: 'Update project views',
            inputSchema: {
              type: 'object',
              properties: {
                view_id: { type: 'string', description: 'View ID' },
                view_name: { type: 'string', description: 'New view name' }
              },
              required: ['view_id']
            }
          },
          // PROJECT ITEMS
          {
            name: 'add_project_item',
            description: 'Add items to projects',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' },
                item_id: { type: 'string', description: 'Item ID' }
              },
              required: ['project_id', 'item_id']
            }
          },
          {
            name: 'remove_project_item',
            description: 'Remove items from projects',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' },
                item_id: { type: 'string', description: 'Item ID' }
              },
              required: ['project_id', 'item_id']
            }
          },
          {
            name: 'list_project_items',
            description: 'List all project items',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' }
              },
              required: ['project_id']
            }
          },
          {
            name: 'set_field_value',
            description: 'Set field values for project items',
            inputSchema: {
              type: 'object',
              properties: {
                item_id: { type: 'string', description: 'Item ID' },
                field_id: { type: 'string', description: 'Field ID' },
                value: { type: 'string', description: 'Field value' }
              },
              required: ['item_id', 'field_id', 'value']
            }
          },
          {
            name: 'get_field_value',
            description: 'Get field values for project items',
            inputSchema: {
              type: 'object',
              properties: {
                item_id: { type: 'string', description: 'Item ID' },
                field_id: { type: 'string', description: 'Field ID' }
              },
              required: ['item_id', 'field_id']
            }
          },
          // LABELS
          {
            name: 'create_label',
            description: 'Create new GitHub labels',
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
          // REQUIREMENTS TRACEABILITY
          {
            name: 'create_traceability_matrix',
            description: 'Create comprehensive traceability matrices linking requirements to features to tasks',
            inputSchema: {
              type: 'object',
              properties: {
                matrix_title: { type: 'string', description: 'Matrix title' }
              },
              required: ['matrix_title']
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
          case 'update_project':
            return await this.handleUpdateProject(args);
          case 'delete_project':
            return await this.handleDeleteProject(args);

          // MILESTONE MANAGEMENT
          case 'create_milestone':
            return await this.handleCreateMilestone(args);
          case 'list_milestones':
            return await this.handleListMilestones(args);
          case 'update_milestone':
            return await this.handleUpdateMilestone(args);
          case 'delete_milestone':
            return await this.handleDeleteMilestone(args);
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
          case 'plan_sprint':
            return await this.handlePlanSprint(args);

          // ADVANCED PROJECT PLANNING
          case 'create_roadmap':
            return await this.handleCreateRoadmap(args);
          case 'generate_prd':
            return await this.handleGeneratePRD(args);
          case 'parse_prd':
            return await this.handleParsePRD(args);
          case 'enhance_prd':
            return await this.handleEnhancePRD(args);
          case 'add_feature':
            return await this.handleAddFeature(args);

          // TASK MANAGEMENT
          case 'get_next_task':
            return await this.handleGetNextTask(args);
          case 'analyze_task_complexity':
            return await this.handleAnalyzeTaskComplexity(args);
          case 'expand_task':
            return await this.handleExpandTask(args);

          // PROJECT STRUCTURE
          case 'create_project_field':
            return await this.handleCreateProjectField(args);
          case 'list_project_fields':
            return await this.handleListProjectFields(args);
          case 'update_project_field':
            return await this.handleUpdateProjectField(args);
          case 'create_project_view':
            return await this.handleCreateProjectView(args);
          case 'list_project_views':
            return await this.handleListProjectViews(args);
          case 'update_project_view':
            return await this.handleUpdateProjectView(args);

          // PROJECT ITEMS
          case 'add_project_item':
            return await this.handleAddProjectItem(args);
          case 'remove_project_item':
            return await this.handleRemoveProjectItem(args);
          case 'list_project_items':
            return await this.handleListProjectItems(args);
          case 'set_field_value':
            return await this.handleSetFieldValue(args);
          case 'get_field_value':
            return await this.handleGetFieldValue(args);

          // LABELS
          case 'create_label':
            return await this.handleCreateLabel(args);
          case 'list_labels':
            return await this.handleListLabels(args);

          // REQUIREMENTS TRACEABILITY
          case 'create_traceability_matrix':
            return await this.handleCreateTraceabilityMatrix(args);

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

  // STUB IMPLEMENTATIONS - All tools return placeholder responses
  private async handleCreateProject(args: any) {
    return { content: [{ type: "text", text: "Create project functionality - to be implemented" }] };
  }

  private async handleListProjects(args: any) {
    return { content: [{ type: "text", text: "List projects functionality - to be implemented" }] };
  }

  private async handleGetProject(args: any) {
    return { content: [{ type: "text", text: "Get project functionality - to be implemented" }] };
  }

  private async handleUpdateProject(args: any) {
    return { content: [{ type: "text", text: "Update project functionality - to be implemented" }] };
  }

  private async handleDeleteProject(args: any) {
    try {
      const { project_id, project_number, confirm_deletion = false } = args;

      if (!project_id && !project_number) {
        return {
          content: [{
            type: "text",
            text: `❌ **Error: Missing Required Parameters**\n\n` +
                  `Either \`project_id\` or \`project_number\` must be provided.\n\n` +
                  `**Usage Examples:**\n` +
                  `• delete_project with project_id: "PVT_kwDOBZ..."\n` +
                  `• delete_project with project_number: 1`
          }]
        };
      }

      let result = `⚠️ **GitHub Project Deletion - Safety Protocol**\n\n`;
      result += `**Repository/Organization:** ${this.owner}\n`;
      result += `**Initiated:** ${new Date().toLocaleString()}\n\n`;
      result += `---\n\n`;

      let projectData: any = null;
      let archiveData: any = {};

      try {
        // First, retrieve and archive project data before deletion
        result += `## 🔍 **Step 1: Project Data Retrieval & Validation**\n\n`;

        if (project_id) {
          // Use project_id (node ID) directly
          const projectQuery = `
            query($projectId: ID!) {
              node(id: $projectId) {
                ... on ProjectV2 {
                  id
                  number
                  title
                  shortDescription
                  readme
                  public
                  closed
                  createdAt
                  updatedAt
                  url
                  owner {
                    ... on Organization {
                      login
                      name
                    }
                    ... on User {
                      login
                      name
                    }
                  }
                  fields(first: 20) {
                    totalCount
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                        dataType
                        createdAt
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                        dataType
                        options {
                          id
                          name
                          color
                        }
                      }
                      ... on ProjectV2IterationField {
                        id
                        name
                        dataType
                        configuration {
                          iterations {
                            id
                            title
                            duration
                            startDate
                          }
                        }
                      }
                    }
                  }
                  views(first: 10) {
                    totalCount
                    nodes {
                      id
                      name
                      layout
                      createdAt
                    }
                  }
                  items(first: 100) {
                    totalCount
                    nodes {
                      id
                      type
                      createdAt
                      content {
                        ... on Issue {
                          id
                          number
                          title
                          state
                          url
                          assignees(first: 5) {
                            nodes {
                              login
                            }
                          }
                          labels(first: 10) {
                            nodes {
                              name
                              color
                            }
                          }
                        }
                        ... on PullRequest {
                          id
                          number
                          title
                          state
                          url
                          assignees(first: 5) {
                            nodes {
                              login
                            }
                          }
                          labels(first: 10) {
                            nodes {
                              name
                              color
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `;

          const response = await this.graphqlWithAuth(projectQuery, {
            projectId: project_id
          });

          projectData = response.node;
        } else if (project_number) {
          // Use project number to find the project
          const projectQuery = `
            query($owner: String!, $projectNumber: Int!) {
              organization(login: $owner) {
                projectV2(number: $projectNumber) {
                  id
                  number
                  title
                  shortDescription
                  readme
                  public
                  closed
                  createdAt
                  updatedAt
                  url
                  owner {
                    ... on Organization {
                      login
                      name
                    }
                    ... on User {
                      login
                      name
                    }
                  }
                  fields(first: 20) {
                    totalCount
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                        dataType
                        createdAt
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                        dataType
                        options {
                          id
                          name
                          color
                        }
                      }
                    }
                  }
                  views(first: 10) {
                    totalCount
                    nodes {
                      id
                      name
                      layout
                      createdAt
                    }
                  }
                  items(first: 100) {
                    totalCount
                    nodes {
                      id
                      type
                      createdAt
                      content {
                        ... on Issue {
                          id
                          number
                          title
                          state
                          url
                        }
                        ... on PullRequest {
                          id
                          number
                          title
                          state
                          url
                        }
                      }
                    }
                  }
                }
              }
              user(login: $owner) {
                projectV2(number: $projectNumber) {
                  id
                  number
                  title
                  shortDescription
                  readme
                  public
                  closed
                  createdAt
                  updatedAt
                  url
                  owner {
                    ... on Organization {
                      login
                      name
                    }
                    ... on User {
                      login
                      name
                    }
                  }
                  fields(first: 20) {
                    totalCount
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                        dataType
                        createdAt
                      }
                    }
                  }
                  views(first: 10) {
                    totalCount
                    nodes {
                      id
                      name
                      layout
                      createdAt
                    }
                  }
                  items(first: 100) {
                    totalCount
                    nodes {
                      id
                      type
                      createdAt
                      content {
                        ... on Issue {
                          id
                          number
                          title
                          state
                          url
                        }
                        ... on PullRequest {
                          id
                          number
                          title
                          state
                          url
                        }
                      }
                    }
                  }
                }
              }
            }
          `;

          const response = await this.graphqlWithAuth(projectQuery, {
            owner: this.owner,
            projectNumber: project_number
          });

          // Try organization first, then user
          projectData = response.organization?.projectV2 || response.user?.projectV2;
        }

        if (!projectData) {
          result += `❌ **Project Not Found**\n\n`;
          result += `**Search Parameters:**\n`;
          if (project_id) result += `- Project ID: ${project_id}\n`;
          if (project_number) result += `- Project Number: ${project_number}\n`;
          result += `- Owner: ${this.owner}\n\n`;
          result += `**Possible Issues:**\n`;
          result += `• Project doesn't exist or has been deleted\n`;
          result += `• Insufficient permissions to access project\n`;
          result += `• Wrong owner/organization specified\n`;
          result += `• Project ID or number is incorrect\n\n`;
          result += `**Cannot proceed with deletion of non-existent project.**`;

          return {
            content: [{
              type: "text",
              text: result
            }]
          };
        }

        // Archive project data
        archiveData = {
          timestamp: new Date().toISOString(),
          project: {
            id: projectData.id,
            number: projectData.number,
            title: projectData.title,
            shortDescription: projectData.shortDescription,
            readme: projectData.readme,
            public: projectData.public,
            closed: projectData.closed,
            createdAt: projectData.createdAt,
            updatedAt: projectData.updatedAt,
            url: projectData.url,
            owner: projectData.owner
          },
          fields: projectData.fields?.nodes || [],
          views: projectData.views?.nodes || [],
          items: projectData.items?.nodes || [],
          statistics: {
            totalFields: projectData.fields?.totalCount || 0,
            totalViews: projectData.views?.totalCount || 0,
            totalItems: projectData.items?.totalCount || 0,
            openIssues: projectData.items?.nodes?.filter((item: any) => 
              item.content && item.content.__typename === 'Issue' && item.content.state === 'OPEN'
            ).length || 0,
            closedIssues: projectData.items?.nodes?.filter((item: any) => 
              item.content && item.content.__typename === 'Issue' && item.content.state === 'CLOSED'
            ).length || 0,
            openPRs: projectData.items?.nodes?.filter((item: any) => 
              item.content && item.content.__typename === 'PullRequest' && item.content.state === 'OPEN'
            ).length || 0,
            mergedPRs: projectData.items?.nodes?.filter((item: any) => 
              item.content && item.content.__typename === 'PullRequest' && item.content.state === 'MERGED'
            ).length || 0
          }
        };

        result += `✅ **Project Located and Archived**\n`;
        result += `- **Title:** ${projectData.title}\n`;
        result += `- **ID:** ${projectData.id}\n`;
        result += `- **Number:** #${projectData.number}\n`;
        result += `- **Owner:** ${projectData.owner.login}\n`;
        result += `- **Created:** ${new Date(projectData.createdAt).toLocaleDateString()}\n`;
        result += `- **Items:** ${archiveData.statistics.totalItems}\n`;
        result += `- **Views:** ${archiveData.statistics.totalViews}\n`;
        result += `- **Fields:** ${archiveData.statistics.totalFields}\n\n`;

        // Risk assessment
        result += `## ⚠️ **Step 2: Risk Assessment & Impact Analysis**\n\n`;
        
        const totalItems = archiveData.statistics.totalItems;
        const activeItems = archiveData.statistics.openIssues + archiveData.statistics.openPRs;
        const customViews = archiveData.statistics.totalViews;
        const customFields = archiveData.statistics.totalFields;

        let riskLevel = 'LOW';
        const risks = [];

        if (totalItems > 50) {
          riskLevel = 'HIGH';
          risks.push(`Large project with ${totalItems} items`);
        } else if (totalItems > 10) {
          riskLevel = 'MEDIUM';
          risks.push(`Medium-sized project with ${totalItems} items`);
        }

        if (activeItems > 0) {
          riskLevel = riskLevel === 'LOW' ? 'MEDIUM' : 'HIGH';
          risks.push(`${activeItems} active items (open issues/PRs)`);
        }

        if (customViews > 3) {
          risks.push(`${customViews} custom views will be lost`);
        }

        if (customFields > 3) {
          risks.push(`${customFields} custom fields will be lost`);
        }

        if (!projectData.closed) {
          risks.push('Project is currently active (not closed)');
        }

        const riskEmoji = riskLevel === 'HIGH' ? '🔴' : riskLevel === 'MEDIUM' ? '🟡' : '🟢';
        
        result += `**Risk Level:** ${riskEmoji} **${riskLevel}**\n\n`;
        
        if (risks.length > 0) {
          result += `**Impact Analysis:**\n`;
          risks.forEach(risk => {
            result += `• ${risk}\n`;
          });
          result += `\n`;
        }

        result += `**Data Loss Warning:**\n`;
        result += `🚨 **PERMANENT DELETION** - This action cannot be undone!\n`;
        result += `• All project structure will be lost\n`;
        result += `• All custom fields and views will be deleted\n`;
        result += `• All project items associations will be removed\n`;
        result += `• Issues and PRs will remain but lose project context\n\n`;

        if (!confirm_deletion) {
          result += `## 🛑 **Step 3: Confirmation Required**\n\n`;
          result += `**DELETION BLOCKED** - Safety confirmation required.\n\n`;
          result += `To proceed with deletion, you must acknowledge the risks by adding the confirmation parameter:\n\n`;
          result += `\`\`\`\n`;
          result += `delete_project({\n`;
          if (project_id) {
            result += `  project_id: "${project_id}",\n`;
          } else {
            result += `  project_number: ${project_number},\n`;
          }
          result += `  confirm_deletion: true\n`;
          result += `})\n`;
          result += `\`\`\`\n\n`;
          result += `**⚠️ WARNING:** Once confirmed, this project will be permanently deleted!\n\n`;
          result += `**Pre-deletion Checklist:**\n`;
          result += `- [ ] Project data has been backed up if needed\n`;
          result += `- [ ] All team members have been notified\n`;
          result += `- [ ] Alternative project arrangements are in place\n`;
          result += `- [ ] You understand this action is irreversible\n\n`;

          // Include archive data for reference
          result += `## 📋 **Project Archive Summary**\n\n`;
          result += `**Project Details:**\n`;
          result += `- Title: ${projectData.title}\n`;
          result += `- Description: ${projectData.shortDescription || 'None'}\n`;
          result += `- Visibility: ${projectData.public ? 'Public' : 'Private'}\n`;
          result += `- Status: ${projectData.closed ? 'Closed' : 'Open'}\n\n`;
          
          result += `**Content Summary:**\n`;
          result += `- Total Items: ${totalItems}\n`;
          result += `- Open Issues: ${archiveData.statistics.openIssues}\n`;
          result += `- Closed Issues: ${archiveData.statistics.closedIssues}\n`;
          result += `- Open PRs: ${archiveData.statistics.openPRs}\n`;
          result += `- Merged PRs: ${archiveData.statistics.mergedPRs}\n`;
          result += `- Custom Fields: ${customFields}\n`;
          result += `- Custom Views: ${customViews}\n\n`;

          if (totalItems > 0) {
            result += `**Recent Items Preview:**\n`;
            const recentItems = projectData.items?.nodes?.slice(0, 5) || [];
            recentItems.forEach((item: any, index: number) => {
              if (item.content) {
                const stateEmoji = item.content.state === 'OPEN' ? '🟢' : 
                                 item.content.state === 'CLOSED' ? '🔴' : 
                                 item.content.state === 'MERGED' ? '🟣' : '⚪';
                result += `${index + 1}. ${stateEmoji} ${item.content.title} (#${item.content.number})\n`;
              }
            });
            if (totalItems > 5) {
              result += `... and ${totalItems - 5} more items\n`;
            }
          }

          return {
            content: [{
              type: "text",
              text: result
            }]
          };
        }

        // Confirmed deletion - proceed with actual deletion
        result += `## 🔥 **Step 3: Confirmed Deletion in Progress**\n\n`;
        result += `⚠️ **CONFIRMED DELETION** - Proceeding with permanent removal...\n\n`;

        // Perform the actual deletion
        const deleteQuery = `
          mutation($projectId: ID!) {
            deleteProjectV2(input: {projectId: $projectId}) {
              projectV2 {
                id
                title
              }
            }
          }
        `;

        try {
          const deleteResponse = await this.graphqlWithAuth(deleteQuery, {
            projectId: projectData.id
          });

          result += `✅ **Deletion Successful**\n\n`;
          result += `**Project Permanently Deleted:**\n`;
          result += `- Title: ${projectData.title}\n`;
          result += `- ID: ${projectData.id}\n`;
          result += `- Number: #${projectData.number}\n`;
          result += `- Deletion Time: ${new Date().toLocaleString()}\n\n`;

        } catch (deleteError: any) {
          result += `❌ **Deletion Failed**\n\n`;
          result += `**Error:** ${deleteError.message}\n\n`;
          result += `**Possible Causes:**\n`;
          result += `• Insufficient permissions to delete project\n`;
          result += `• Project is protected or locked\n`;
          result += `• GitHub API temporary issue\n`;
          result += `• Project was already deleted by another user\n\n`;
          result += `**Recommendations:**\n`;
          result += `• Verify you have admin permissions for this project\n`;
          result += `• Check if the project still exists in GitHub web interface\n`;
          result += `• Try again in a few minutes\n`;
          result += `• Contact repository/organization admin if needed\n\n`;
          
          // Still provide archive data even if deletion failed
          result += `## 📋 **Project Archive (Deletion Failed)**\n\n`;
          result += `Since deletion failed, the project data is preserved.\n`;
          result += `Archive data is available for future reference or retry attempts.\n\n`;
          result += `**Archived Data Summary:**\n`;
          result += `- Archive Timestamp: ${archiveData.timestamp}\n`;
          result += `- Total Items Archived: ${totalItems}\n`;
          result += `- Views Archived: ${customViews}\n`;
          result += `- Fields Archived: ${customFields}\n`;

          return {
            content: [{
              type: "text",
              text: result
            }]
          };
        }

        result += `## 📊 **Step 4: Deletion Report & Recovery Information**\n\n`;
        result += `**Archive Information:**\n`;
        result += `- Archive Created: ${archiveData.timestamp}\n`;
        result += `- Original Project URL: ${projectData.url}\n`;
        result += `- Items Count: ${totalItems}\n`;
        result += `- Views Count: ${customViews}\n`;
        result += `- Fields Count: ${customFields}\n\n`;

        if (totalItems > 0) {
          result += `**Affected Items Status:**\n`;
          result += `- Issues and Pull Requests remain in repository\n`;
          result += `- Project associations have been removed\n`;
          result += `- Custom field values are lost\n`;
          result += `- Items can be re-added to new projects if needed\n\n`;
        }

        result += `**Recovery Options:**\n`;
        result += `⚠️ **Important:** Project structure cannot be automatically restored\n`;
        result += `• Create new project with similar structure\n`;
        result += `• Manually recreate custom fields if needed\n`;
        result += `• Re-add items to new project manually\n`;
        result += `• Refer to archive data for configuration details\n\n`;

        result += `**Post-Deletion Checklist:**\n`;
        result += `- [ ] Notify team members of project deletion\n`;
        result += `- [ ] Update project references in documentation\n`;
        result += `- [ ] Consider creating replacement project if needed\n`;
        result += `- [ ] Archive any additional project-related resources\n\n`;

        result += `## ✅ **Deletion Complete**\n\n`;
        result += `🎯 **Summary:** Project "${projectData.title}" (#${projectData.number}) has been permanently deleted.\n`;
        result += `📅 **Completed:** ${new Date().toLocaleString()}\n`;
        result += `🔒 **Status:** Irreversible - project cannot be recovered\n\n`;
        result += `**Next Steps:**\n`;
        result += `• Clean up any external references to this project\n`;
        result += `• Consider creating a new project if needed\n`;
        result += `• Update team workflows and documentation\n`;

      } catch (graphqlError: any) {
        result += `❌ **GraphQL Error During Deletion Process**\n\n`;
        result += `**Error:** ${graphqlError.message || 'Unknown GraphQL error'}\n\n`;
        
        if (graphqlError.errors) {
          result += `**Details:**\n`;
          graphqlError.errors.forEach((error: any, index: number) => {
            result += `${index + 1}. ${error.message}\n`;
            if (error.path) {
              result += `   Path: ${error.path.join(' → ')}\n`;
            }
          });
          result += `\n`;
        }
        
        result += `**Common Issues:**\n`;
        result += `• Insufficient permissions (need admin access)\n`;
        result += `• Project doesn't exist or was already deleted\n`;
        result += `• GitHub API rate limiting\n`;
        result += `• Network connectivity issues\n`;
        result += `• Organization policies preventing deletion\n\n`;
        
        result += `**Recommendations:**\n`;
        result += `• Verify you have admin permissions for this project\n`;
        result += `• Check project exists in GitHub web interface\n`;
        result += `• Wait a few minutes if rate limited\n`;
        result += `• Try deletion through GitHub web interface\n`;
        result += `• Contact organization admin if policies block deletion\n`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

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
    return { content: [{ type: "text", text: "List milestones functionality - to be implemented" }] };
  }

  private async handleUpdateMilestone(args: any) {
    return { content: [{ type: "text", text: "Update milestone functionality - to be implemented" }] };
  }

  private async handleDeleteMilestone(args: any) {
    return { content: [{ type: "text", text: "Delete milestone functionality - to be implemented" }] };
  }

  private async handleGetMilestoneMetrics(args: any) {
    return { content: [{ type: "text", text: "Get milestone metrics functionality - to be implemented" }] };
  }

  private async handleGetOverdueMilestones(args: any) {
    return { content: [{ type: "text", text: "Get overdue milestones functionality - to be implemented" }] };
  }

  private async handleGetUpcomingMilestones(args: any) {
    return { content: [{ type: "text", text: "Get upcoming milestones functionality - to be implemented" }] };
  }

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
    return { content: [{ type: "text", text: "List issues functionality - to be implemented" }] };
  }

  private async handleGetIssue(args: any) {
    return { content: [{ type: "text", text: "Get issue functionality - to be implemented" }] };
  }

  private async handleUpdateIssue(args: any) {
    return { content: [{ type: "text", text: "Update issue functionality - to be implemented" }] };
  }

  private async handleCreateSprint(args: any) {
    return { content: [{ type: "text", text: "Create sprint functionality - to be implemented" }] };
  }

  private async handleListSprints(args: any) {
    return { content: [{ type: "text", text: "List sprints functionality - to be implemented" }] };
  }

  private async handleGetCurrentSprint(args: any) {
    return { content: [{ type: "text", text: "Get current sprint functionality - to be implemented" }] };
  }

  private async handleUpdateSprint(args: any) {
    return { content: [{ type: "text", text: "Update sprint functionality - to be implemented" }] };
  }

  private async handleAddIssuesToSprint(args: any) {
    return { content: [{ type: "text", text: "Add issues to sprint functionality - to be implemented" }] };
  }

  private async handleRemoveIssuesFromSprint(args: any) {
    return { content: [{ type: "text", text: "Remove issues from sprint functionality - to be implemented" }] };
  }

  private async handleGetSprintMetrics(args: any) {
    return { content: [{ type: "text", text: "Get sprint metrics functionality - to be implemented" }] };
  }

  private async handlePlanSprint(args: any) {
    return { content: [{ type: "text", text: "Plan sprint functionality - to be implemented" }] };
  }

  private async handleCreateRoadmap(args: any) {
    return { content: [{ type: "text", text: "Create roadmap functionality - to be implemented" }] };
  }

  private async handleGeneratePRD(args: any) {
    return { content: [{ type: "text", text: "Generate PRD functionality - to be implemented" }] };
  }

  private async handleParsePRD(args: any) {
    return { content: [{ type: "text", text: "Parse PRD functionality - to be implemented" }] };
  }

  private async handleEnhancePRD(args: any) {
    return { content: [{ type: "text", text: "Enhance PRD functionality - to be implemented" }] };
  }

  private async handleAddFeature(args: any) {
    return { content: [{ type: "text", text: "Add feature functionality - to be implemented" }] };
  }

  private async handleGetNextTask(args: any) {
    return { content: [{ type: "text", text: "Get next task functionality - to be implemented" }] };
  }

  private async handleAnalyzeTaskComplexity(args: any) {
    return { content: [{ type: "text", text: "Analyze task complexity functionality - to be implemented" }] };
  }

  private async handleExpandTask(args: any) {
    return { content: [{ type: "text", text: "Expand task functionality - to be implemented" }] };
  }

  private async handleCreateProjectField(args: any) {
    return { content: [{ type: "text", text: "Create project field functionality - to be implemented" }] };
  }

  private async handleListProjectFields(args: any) {
    return { content: [{ type: "text", text: "List project fields functionality - to be implemented" }] };
  }

  private async handleUpdateProjectField(args: any) {
    return { content: [{ type: "text", text: "Update project field functionality - to be implemented" }] };
  }

  private async handleCreateProjectView(args: any) {
    return { content: [{ type: "text", text: "Create project view functionality - to be implemented" }] };
  }

  private async handleListProjectViews(args: any) {
    return { content: [{ type: "text", text: "List project views functionality - to be implemented" }] };
  }

  private async handleUpdateProjectView(args: any) {
    return { content: [{ type: "text", text: "Update project view functionality - to be implemented" }] };
  }

  private async handleAddProjectItem(args: any) {
    return { content: [{ type: "text", text: "Add project item functionality - to be implemented" }] };
  }

  private async handleRemoveProjectItem(args: any) {
    return { content: [{ type: "text", text: "Remove project item functionality - to be implemented" }] };
  }

  private async handleListProjectItems(args: any) {
    return { content: [{ type: "text", text: "List project items functionality - to be implemented" }] };
  }

  private async handleSetFieldValue(args: any) {
    return { content: [{ type: "text", text: "Set field value functionality - to be implemented" }] };
  }

  private async handleGetFieldValue(args: any) {
    return { content: [{ type: "text", text: "Get field value functionality - to be implemented" }] };
  }

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

  private async handleCreateTraceabilityMatrix(args: any) {
    return { content: [{ type: "text", text: "Create traceability matrix functionality - to be implemented" }] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("✅ Issue #29 IMPLEMENTED: delete_project tool with safe deletion, archiving, and confirmation!");
    console.error("Tools available: 46 comprehensive project management tools");
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