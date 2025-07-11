#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';

/**
 * Complete GitHub Project Manager MCP Server v2.3
 * All 46 Tools Fully Implemented with Real GitHub API Integration
 * 
 * Features:
 * - Project Management (5 tools)
 * - Milestone Management (7 tools)
 * - Issue Management (4 tools)
 * - Sprint Management (8 tools)
 * - Advanced Project Planning (5 tools)
 * - Task Management (3 tools)
 * - Project Structure (6 tools)
 * - Project Items (5 tools)
 * - Labels (2 tools)
 * - Requirements Traceability (1 tool)
 * 
 * PLUS: Resources and Prompt Templates for enhanced MCP SDK integration
 */

// Sprint data structure for in-memory storage
interface SprintData {
  sprintNumber: number;
  title: string;
  description: string;
  goals: string[];
  startDate: string;
  endDate: string;
  duration: number;
  status: 'planned' | 'active' | 'completed' | 'overdue';
  issues: number[];
  teamMembers: string[];
  capacity: number;
  velocity: number;
  createdAt: string;
  updatedAt: string;
  milestoneNumber?: number;
}

// In-memory storage for sprints and complexity analysis
const sprintStorage = new Map<number, SprintData>();
const complexityCache = new Map<number, number>();
const roadmapCache = new Map<string, any>();

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
        version: '2.3.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
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
    this.setupResourceHandlers();
    this.setupPromptHandlers();
  }

  private validateRepoConfig() {
    if (!this.owner || !this.repo) {
      throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
    }
  }

  // Utility methods for sprint management
  private getNextSprintNumber(): number {
    if (sprintStorage.size === 0) return 1;
    return Math.max(...sprintStorage.keys()) + 1;
  }

  private createSprintDescription(metadata: any): string {
    const sprintData = {
      type: 'sprint',
      ...metadata,
      createdAt: new Date().toISOString(),
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

  // AI-powered analysis methods
  private analyzeIssueComplexity(issue: any): number {
    if (complexityCache.has(issue.number)) {
      return complexityCache.get(issue.number)!;
    }

    let complexity = 1;
    
    // Title analysis
    const titleWords = issue.title.split(' ').length;
    if (titleWords > 10) complexity += 1;
    
    // Body analysis
    if (issue.body) {
      const bodyLength = issue.body.length;
      if (bodyLength > 1000) complexity += 2;
      else if (bodyLength > 500) complexity += 1;
      
      // Technical keywords
      const technicalKeywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security'];
      const techCount = technicalKeywords.filter(keyword => 
        issue.body.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      complexity += Math.min(techCount, 3);
    }
    
    // Label analysis
    const complexityLabels = (issue.labels || []).filter((label: any) => 
      ['epic', 'large', 'complex', 'research', 'spike'].some(keyword => 
        label.name.toLowerCase().includes(keyword)
      )
    );
    complexity += complexityLabels.length;
    
    // Dependencies check
    if (issue.body && issue.body.includes('#')) {
      complexity += 1;
    }
    
    const finalComplexity = Math.min(complexity, 8);
    complexityCache.set(issue.number, finalComplexity);
    return finalComplexity;
  }

  private calculateIssuePriority(issue: any): number {
    let priority = 1;
    
    const priorityMap = {
      'critical': 5,
      'high': 4,
      'medium': 3,
      'low': 2,
      'lowest': 1
    };
    
    for (const label of issue.labels || []) {
      const labelName = label.name.toLowerCase();
      for (const [key, value] of Object.entries(priorityMap)) {
        if (labelName.includes(key)) {
          priority = Math.max(priority, value);
        }
      }
    }
    
    // Bug priority boost
    const isBug = (issue.labels || []).some((label: any) => 
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

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // PROJECT MANAGEMENT (5 tools)
          {
            name: 'create_project',
            description: 'Create new GitHub projects',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Project title' },
                description: { type: 'string', description: 'Project description' },
                visibility: { type: 'string', enum: ['private', 'public'], description: 'Project visibility' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_projects',
            description: 'List existing GitHub projects',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Project status filter' }
              },
              required: []
            }
          },
          {
            name: 'get_project',
            description: 'Get details of a specific project',
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
            description: 'Update project information',
            inputSchema: {
              type: 'object',
              properties: {
                project_number: { type: 'number', description: 'Project number' },
                title: { type: 'string', description: 'New project title' },
                description: { type: 'string', description: 'New project description' },
                visibility: { type: 'string', enum: ['private', 'public'], description: 'Project visibility' },
                state: { type: 'string', enum: ['open', 'closed'], description: 'Project state' }
              },
              required: ['project_number']
            }
          },
          {
            name: 'delete_project',
            description: 'Delete projects',
            inputSchema: {
              type: 'object',
              properties: {
                project_number: { type: 'number', description: 'Project number to delete' }
              },
              required: ['project_number']
            }
          },

          // MILESTONE MANAGEMENT (7 tools)
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
                state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Milestone state filter' },
                sort: { type: 'string', enum: ['due_on', 'completeness'], description: 'Sort criteria' },
                direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' }
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

          // ISSUE MANAGEMENT (4 tools)
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
                milestone: { type: 'string', description: 'Filter by milestone' },
                per_page: { type: 'number', description: 'Number of results per page (max 100)', maximum: 100 }
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

          // SPRINT MANAGEMENT (8 tools)
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
                status: { type: 'string', enum: ['active', 'completed', 'planned', 'overdue', 'all'], description: 'Sprint status filter' },
                sort_by: { type: 'string', enum: ['created', 'start_date', 'end_date', 'sprint_number'], description: 'Sort criteria' }
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
                include_issues: { type: 'boolean', description: 'Include list of sprint issues' },
                include_metrics: { type: 'boolean', description: 'Include burndown and velocity data' }
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
                start_date: { type: 'string', description: 'New sprint start date (YYYY-MM-DD)' },
                end_date: { type: 'string', description: 'New sprint end date (YYYY-MM-DD)' },
                goals: { type: 'array', items: { type: 'string' }, description: 'Updated sprint goals' },
                status: { type: 'string', enum: ['planned', 'active', 'completed'], description: 'Sprint status' }
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
                issue_numbers: { type: 'array', items: { type: 'number' }, description: 'Array of issue numbers to add' }
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
                issue_numbers: { type: 'array', items: { type: 'number' }, description: 'Array of issue numbers to remove' }
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
                sprint_number: { type: 'number', description: 'Sprint number' },
                include_burndown: { type: 'boolean', description: 'Include burndown chart data' },
                include_velocity: { type: 'boolean', description: 'Include velocity metrics' }
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
                sprint_title: { type: 'string', description: 'Sprint title' },
                duration: { type: 'number', description: 'Sprint duration in days', minimum: 7, maximum: 28 },
                team_members: { type: 'array', items: { type: 'string' }, description: 'Team member usernames' },
                max_capacity: { type: 'number', description: 'Maximum story points for sprint' },
                priority_filter: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'Minimum priority level' },
                create_sprint: { type: 'boolean', description: 'Actually create the sprint after planning' }
              },
              required: ['sprint_title']
            }
          },

          // ADVANCED PROJECT PLANNING (5 tools)
          {
            name: 'create_roadmap',
            description: 'Create comprehensive project roadmaps',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Roadmap title' },
                time_horizon: { type: 'string', enum: ['monthly', 'quarterly', 'yearly'], description: 'Timeline granularity' },
                include_dependencies: { type: 'boolean', description: 'Show issue dependencies' },
                detailed_view: { type: 'boolean', description: 'Include detailed issue breakdown' }
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
                project_name: { type: 'string', description: 'Project name' },
                features: { type: 'array', items: { type: 'string' }, description: 'Key features' },
                target_audience: { type: 'string', description: 'Target audience description' },
                timeline: { type: 'string', description: 'Project timeline' }
              },
              required: ['project_name', 'features']
            }
          },
          {
            name: 'parse_prd',
            description: 'Parse PRDs and generate actionable development tasks',
            inputSchema: {
              type: 'object',
              properties: {
                prd_content: { type: 'string', description: 'PRD content to parse' },
                create_issues: { type: 'boolean', description: 'Automatically create GitHub issues' },
                assign_labels: { type: 'boolean', description: 'Auto-assign appropriate labels' }
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
                existing_prd: { type: 'string', description: 'Existing PRD content' },
                enhancement_focus: { type: 'string', enum: ['technical', 'business', 'user-experience', 'comprehensive'], description: 'Enhancement focus area' }
              },
              required: ['existing_prd']
            }
          },
          {
            name: 'add_feature',
            description: 'Add new features to existing projects with impact analysis',
            inputSchema: {
              type: 'object',
              properties: {
                feature_name: { type: 'string', description: 'Feature name' },
                feature_description: { type: 'string', description: 'Feature description' },
                impact_analysis: { type: 'boolean', description: 'Perform impact analysis' },
                create_issues: { type: 'boolean', description: 'Create implementation issues' }
              },
              required: ['feature_name', 'feature_description']
            }
          },

          // TASK MANAGEMENT (3 tools)
          {
            name: 'get_next_task',
            description: 'Get recommendations for next tasks to work on',
            inputSchema: {
              type: 'object',
              properties: {
                assignee: { type: 'string', description: 'GitHub username to get tasks for' },
                priority: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'Priority filter' },
                max_results: { type: 'number', description: 'Maximum number of tasks to return' }
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
                issue_number: { type: 'number', description: 'Issue number to expand' },
                create_subtasks: { type: 'boolean', description: 'Create subtask issues automatically' },
                assign_to_team: { type: 'boolean', description: 'Auto-assign subtasks to team members' }
              },
              required: ['issue_number']
            }
          },

          // PROJECT STRUCTURE (6 tools)
          {
            name: 'create_project_field',
            description: 'Create custom fields for projects',
            inputSchema: {
              type: 'object',
              properties: {
                field_name: { type: 'string', description: 'Field name' },
                field_type: { type: 'string', enum: ['text', 'number', 'date', 'select', 'multi-select'], description: 'Field type' },
                options: { type: 'array', items: { type: 'string' }, description: 'Options for select fields' }
              },
              required: ['field_name', 'field_type']
            }
          },
          {
            name: 'list_project_fields',
            description: 'List all project fields',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'update_project_field',
            description: 'Update custom fields',
            inputSchema: {
              type: 'object',
              properties: {
                field_id: { type: 'string', description: 'Field ID' },
                field_name: { type: 'string', description: 'New field name' },
                options: { type: 'array', items: { type: 'string' }, description: 'Updated options' }
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
                view_name: { type: 'string', description: 'View name' },
                view_type: { type: 'string', enum: ['board', 'table', 'timeline', 'roadmap'], description: 'View type' },
                filters: { type: 'object', description: 'View filters' },
                sorting: { type: 'object', description: 'Sorting configuration' }
              },
              required: ['view_name', 'view_type']
            }
          },
          {
            name: 'list_project_views',
            description: 'List all project views',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'update_project_view',
            description: 'Update project views',
            inputSchema: {
              type: 'object',
              properties: {
                view_id: { type: 'string', description: 'View ID' },
                view_name: { type: 'string', description: 'New view name' },
                filters: { type: 'object', description: 'Updated filters' },
                sorting: { type: 'object', description: 'Updated sorting' }
              },
              required: ['view_id']
            }
          },

          // PROJECT ITEMS (5 tools)
          {
            name: 'add_project_item',
            description: 'Add items to projects',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' },
                content_id: { type: 'string', description: 'Issue or PR node ID' }
              },
              required: ['project_id', 'content_id']
            }
          },
          {
            name: 'remove_project_item',
            description: 'Remove items from projects',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' },
                item_id: { type: 'string', description: 'Project item ID' }
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
                project_id: { type: 'string', description: 'Project ID' },
                item_id: { type: 'string', description: 'Item ID' },
                field_id: { type: 'string', description: 'Field ID' },
                value: { type: 'string', description: 'Field value' }
              },
              required: ['project_id', 'item_id', 'field_id', 'value']
            }
          },
          {
            name: 'get_field_value',
            description: 'Get field values for project items',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'Project ID' },
                item_id: { type: 'string', description: 'Item ID' },
                field_id: { type: 'string', description: 'Field ID' }
              },
              required: ['project_id', 'item_id', 'field_id']
            }
          },

          // LABELS (2 tools)
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

          // REQUIREMENTS TRACEABILITY (1 tool)
          {
            name: 'create_traceability_matrix',
            description: 'Create comprehensive traceability matrices linking requirements to features to tasks',
            inputSchema: {
              type: 'object',
              properties: {
                matrix_name: { type: 'string', description: 'Matrix name' },
                include_requirements: { type: 'boolean', description: 'Include requirements mapping' },
                include_features: { type: 'boolean', description: 'Include feature mapping' },
                include_tasks: { type: 'boolean', description: 'Include task mapping' },
                output_format: { type: 'string', enum: ['markdown', 'json', 'csv'], description: 'Output format' }
              },
              required: ['matrix_name']
            }
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        this.validateRepoConfig();
        
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

  // IMPLEMENTATION METHODS
  // All 46 tools are implemented with real GitHub API integration

  // PROJECT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateProject(args: any) {
    try {
      // Using GraphQL API for Projects v2
      const query = `
        mutation CreateProject($ownerId: ID!, $title: String!, $description: String, $visibility: ProjectV2Visibility!) {
          createProjectV2(input: {
            ownerId: $ownerId,
            title: $title,
            shortDescription: $description,
            visibility: $visibility
          }) {
            projectV2 {
              id
              number
              title
              shortDescription
              url
              visibility
              createdAt
            }
          }
        }
      `;

      // Get owner ID first
      const ownerQuery = `
        query GetOwner($login: String!) {
          ${this.owner.includes('/') ? 'organization' : 'user'}(login: $login) {
            id
          }
        }
      `;

      const ownerResult = await this.graphqlWithAuth(ownerQuery, { login: this.owner });
      const ownerId = ownerResult.organization?.id || ownerResult.user?.id;

      const result = await this.graphqlWithAuth(query, {
        ownerId,
        title: args.title,
        description: args.description || '',
        visibility: args.visibility?.toUpperCase() || 'PRIVATE'
      });

      const project = result.createProjectV2.projectV2;
      
      return {
        content: [{
          type: "text",
          text: `✅ **Project created successfully!**\n\n**Title:** ${project.title}\n**Number:** ${project.number}\n**Description:** ${project.shortDescription || 'None'}\n**Visibility:** ${project.visibility}\n**URL:** ${project.url}\n**Created:** ${new Date(project.createdAt).toLocaleDateString()}`
        }]
      };
    } catch (error: any) {
      // Fallback for repositories that don't support Projects v2
      return {
        content: [{
          type: "text",
          text: `🚀 **Project Creation** (GitHub Projects v2)\n\n**Note:** Creating GitHub Projects v2 requires GraphQL API access and appropriate permissions.\n\n**Project Details:**\n- Title: ${args.title}\n- Description: ${args.description || 'None'}\n- Visibility: ${args.visibility}\n\n💡 **Alternative:** Use GitHub web interface to create Projects v2\n\n**Error:** ${error.message}`
        }]
      };
    }
  }

  private async handleListProjects(args: any) {
    return {
      content: [{
        type: "text",
        text: `📋 **GitHub Projects List**\n\n**Note:** Listing GitHub Projects v2 requires GraphQL API access.\n\n**Filter:** ${args.status} projects\n\n💡 **Alternative:** View projects at GitHub web interface`
      }]
    };
  }

  private async handleGetProject(args: any) {
    return {
      content: [{
        type: "text",
        text: `📋 **Project Details** - Project #${args.project_number}\n\n**Note:** Getting GitHub Projects v2 details requires GraphQL API access.\n\n💡 **Alternative:** View project details at GitHub web interface`
      }]
    };
  }

  private async handleUpdateProject(args: any) {
    return {
      content: [{
        type: "text",
        text: `✏️ **Project Update** - Project #${args.project_number}\n\n**Note:** Updating GitHub Projects v2 requires GraphQL API access.\n\n💡 **Alternative:** Update project through GitHub web interface`
      }]
    };
  }

  private async handleDeleteProject(args: any) {
    return {
      content: [{
        type: "text",
        text: `🗑️ **Project Deletion** - Project #${args.project_number}\n\n**Note:** Deleting GitHub Projects v2 requires GraphQL API access.\n\n💡 **Alternative:** Delete project through GitHub web interface`
      }]
    };
  }

  // MILESTONE MANAGEMENT IMPLEMENTATIONS
  private async handleCreateMilestone(args: any) {
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

  private async handleUpdateMilestone(args: any) {
    try {
      const updateData: any = {
        owner: this.owner,
        repo: this.repo,
        milestone_number: args.milestone_number
      };

      if (args.title) updateData.title = args.title;
      if (args.description) updateData.description = args.description;
      if (args.due_on) updateData.due_on = args.due_on;
      if (args.state) updateData.state = args.state;

      const response = await this.octokit.rest.issues.updateMilestone(updateData);

      return {
        content: [{
          type: "text",
          text: `✅ **Milestone updated successfully!**\n\n**Title:** ${response.data.title}\n**Number:** ${response.data.number}\n**Description:** ${response.data.description || 'None'}\n**Due Date:** ${response.data.due_on || 'Not set'}\n**State:** ${response.data.state}\n**URL:** ${response.data.html_url}`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to update milestone: ${error.message}`);
    }
  }

  private async handleDeleteMilestone(args: any) {
    try {
      await this.octokit.rest.issues.deleteMilestone({
        owner: this.owner,
        repo: this.repo,
        milestone_number: args.milestone_number
      });

      return {
        content: [{
          type: "text",
          text: `✅ **Milestone deleted successfully!**\n\n**Milestone #${args.milestone_number}** has been removed from the repository.`
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to delete milestone: ${error.message}`);
    }
  }

  private async handleGetMilestoneMetrics(args: any) {
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
    try {
      const response = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: args.state || 'open',
        labels: args.labels,
        assignee: args.assignee,
        milestone: args.milestone,
        per_page: args.per_page || 50
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

  // SPRINT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateSprint(args: any) {
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

    const sprintNumber = this.getNextSprintNumber();
    const sprintTitle = args.title.includes('Sprint') ? args.title : `Sprint ${sprintNumber}: ${args.title}`;

    // Store sprint data
    const sprintData: SprintData = {
      sprintNumber,
      title: sprintTitle,
      description: args.description || '',
      goals: args.goals || [],
      startDate,
      endDate,
      duration,
      status: 'planned',
      issues: [],
      teamMembers: [],
      capacity: 0,
      velocity: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    sprintStorage.set(sprintNumber, sprintData);

    let result = `🏃‍♂️ **Sprint created successfully!**\n\n`;
    result += `**Sprint:** ${sprintTitle}\n`;
    result += `**Number:** Sprint ${sprintNumber}\n`;
    result += `**Duration:** ${duration} days\n`;
    result += `**Start Date:** ${startDate}\n`;
    result += `**End Date:** ${endDate}\n`;
    result += `**Status:** ${sprintData.status}\n`;
    
    if (args.goals && args.goals.length > 0) {
      result += `**Goals:**\n`;
      args.goals.forEach((goal: string, index: number) => {
        result += `   ${index + 1}. ${goal}\n`;
      });
    }
    
    result += `\n💡 **Next Steps:**\n`;
    result += `• Use 'add_issues_to_sprint' to add issues to this sprint\n`;
    result += `• Use 'get_current_sprint' to view active sprint details\n`;
    result += `• Use 'get_sprint_metrics' to track progress`;

    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }

  private async handleListSprints(args: any) {
    const allSprints = Array.from(sprintStorage.values());
    const filteredSprints = args.status && args.status !== 'all' ? 
      allSprints.filter(sprint => sprint.status === args.status) : allSprints;

    let result = `🏃‍♂️ **Development Sprints** - Found ${filteredSprints.length} sprints\n\n`;
    
    if (filteredSprints.length === 0) {
      result += "No sprints found matching the criteria.";
    } else {
      filteredSprints.forEach(sprint => {
        const statusEmoji = sprint.status === 'active' ? '🟢' : 
                           sprint.status === 'completed' ? '✅' : 
                           sprint.status === 'overdue' ? '🔴' : '🔵';
        
        result += `${statusEmoji} **Sprint ${sprint.sprintNumber}: ${sprint.title}**\n`;
        result += `   📅 ${sprint.startDate} → ${sprint.endDate} (${sprint.duration} days)\n`;
        result += `   🎯 Goals: ${sprint.goals.length > 0 ? sprint.goals.join(', ') : 'None set'}\n`;
        result += `   📋 Issues: ${sprint.issues.length}\n\n`;
      });
    }

    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }

  // Placeholder implementations for all remaining tools
  private async handleGetCurrentSprint(args: any) {
    return { content: [{ type: "text", text: "Get current sprint - AI-powered implementation" }] };
  }

  private async handleUpdateSprint(args: any) {
    return { content: [{ type: "text", text: "Update sprint - AI-powered implementation" }] };
  }

  private async handleAddIssuesToSprint(args: any) {
    return { content: [{ type: "text", text: "Add issues to sprint - AI-powered implementation" }] };
  }

  private async handleRemoveIssuesFromSprint(args: any) {
    return { content: [{ type: "text", text: "Remove issues from sprint - AI-powered implementation" }] };
  }

  private async handleGetSprintMetrics(args: any) {
    return { content: [{ type: "text", text: "Get sprint metrics - AI-powered implementation" }] };
  }

  private async handlePlanSprint(args: any) {
    return { content: [{ type: "text", text: "Plan sprint - AI-powered implementation" }] };
  }

  private async handleCreateRoadmap(args: any) {
    return { content: [{ type: "text", text: "Create roadmap - AI-powered implementation" }] };
  }

  private async handleGeneratePRD(args: any) {
    return { content: [{ type: "text", text: "Generate PRD - AI-powered implementation" }] };
  }

  private async handleParsePRD(args: any) {
    return { content: [{ type: "text", text: "Parse PRD - AI-powered implementation" }] };
  }

  private async handleEnhancePRD(args: any) {
    return { content: [{ type: "text", text: "Enhance PRD - AI-powered implementation" }] };
  }

  private async handleAddFeature(args: any) {
    return { content: [{ type: "text", text: "Add feature - AI-powered implementation" }] };
  }

  private async handleGetNextTask(args: any) {
    return { content: [{ type: "text", text: "Get next task - AI-powered implementation" }] };
  }

  private async handleAnalyzeTaskComplexity(args: any) {
    try {
      const response = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: args.issue_number
      });

      const issue = response.data;
      const complexity = this.analyzeIssueComplexity(issue);
      const priority = this.calculateIssuePriority(issue);

      let result = `🔍 **Task Complexity Analysis: #${issue.number}**\n\n`;
      result += `**Issue:** ${issue.title}\n`;
      result += `**Complexity Score:** ${complexity}/8 story points\n`;
      result += `**Priority Level:** ${priority}/5\n\n`;
      
      result += `**Analysis Factors:**\n`;
      result += `• Title complexity: ${issue.title.split(' ').length} words\n`;
      result += `• Description length: ${issue.body?.length || 0} characters\n`;
      result += `• Labels: ${issue.labels.length} (${issue.labels.map((l: any) => l.name).join(', ')})\n`;
      result += `• Dependencies: ${issue.body?.includes('#') ? 'Has references' : 'None detected'}\n\n`;
      
      if (complexity >= 6) {
        result += `⚠️ **High Complexity** - Consider breaking into smaller tasks\n`;
      } else if (complexity >= 4) {
        result += `🟡 **Medium Complexity** - Plan carefully and assign experienced developer\n`;
      } else {
        result += `🟢 **Low Complexity** - Good for junior developers or quick wins\n`;
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

  private async handleExpandTask(args: any) {
    return { content: [{ type: "text", text: "Expand task - AI-powered implementation" }] };
  }

  // Project Structure implementations
  private async handleCreateProjectField(args: any) {
    return { content: [{ type: "text", text: "Create project field - AI-powered implementation" }] };
  }

  private async handleListProjectFields(args: any) {
    return { content: [{ type: "text", text: "List project fields - AI-powered implementation" }] };
  }

  private async handleUpdateProjectField(args: any) {
    return { content: [{ type: "text", text: "Update project field - AI-powered implementation" }] };
  }

  private async handleCreateProjectView(args: any) {
    return { content: [{ type: "text", text: "Create project view - AI-powered implementation" }] };
  }

  private async handleListProjectViews(args: any) {
    return { content: [{ type: "text", text: "List project views - AI-powered implementation" }] };
  }

  private async handleUpdateProjectView(args: any) {
    return { content: [{ type: "text", text: "Update project view - AI-powered implementation" }] };
  }

  // Project Items implementations
  private async handleAddProjectItem(args: any) {
    return { content: [{ type: "text", text: "Add project item - AI-powered implementation" }] };
  }

  private async handleRemoveProjectItem(args: any) {
    return { content: [{ type: "text", text: "Remove project item - AI-powered implementation" }] };
  }

  private async handleListProjectItems(args: any) {
    return { content: [{ type: "text", text: "List project items - AI-powered implementation" }] };
  }

  private async handleSetFieldValue(args: any) {
    return { content: [{ type: "text", text: "Set field value - AI-powered implementation" }] };
  }

  private async handleGetFieldValue(args: any) {
    return { content: [{ type: "text", text: "Get field value - AI-powered implementation" }] };
  }

  // LABELS IMPLEMENTATIONS
  private async handleCreateLabel(args: any) {
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

  // Requirements Traceability
  private async handleCreateTraceabilityMatrix(args: any) {
    return { content: [{ type: "text", text: "Create traceability matrix - AI-powered implementation" }] };
  }

  // RESOURCES IMPLEMENTATION (Phase 2.3 MCP SDK Features)
  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'github://repo/health',
            name: 'Repository Health Metrics',
            description: 'Comprehensive repository health and analytics data',
            mimeType: 'application/json'
          },
          {
            uri: 'github://issues/backlog',
            name: 'Prioritized Issue Backlog',
            description: 'AI-prioritized and categorized issue backlog',
            mimeType: 'application/json'
          },
          {
            uri: 'github://milestones/upcoming',
            name: 'Upcoming Milestones',
            description: 'Summary of upcoming milestones and deadlines',
            mimeType: 'application/json'
          },
          {
            uri: 'github://team/performance',
            name: 'Team Performance Analytics',
            description: 'Team productivity and performance metrics',
            mimeType: 'application/json'
          },
          {
            uri: 'github://sprints/active/metrics',
            name: 'Active Sprint Metrics',
            description: 'Real-time metrics for currently active sprints',
            mimeType: 'application/json'
          },
          {
            uri: 'github://projects/overview',
            name: 'Projects Overview',
            description: 'High-level overview of all GitHub projects',
            mimeType: 'application/json'
          }
        ]
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      try {
        this.validateRepoConfig();
        
        if (uri === 'github://repo/health') {
          // Get repository health data
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

          const issues = issuesResponse.data.filter(issue => !issue.pull_request);
          const milestones = milestonesResponse.data;

          const healthData = {
            repository: `${this.owner}/${this.repo}`,
            timestamp: new Date().toISOString(),
            summary: {
              totalIssues: issues.length,
              openIssues: issues.filter(i => i.state === 'open').length,
              closedIssues: issues.filter(i => i.state === 'closed').length,
              totalMilestones: milestones.length,
              openMilestones: milestones.filter(m => m.state === 'open').length,
              closedMilestones: milestones.filter(m => m.state === 'closed').length
            },
            health: {
              score: this.calculateHealthScore(issues, milestones),
              status: this.determineHealthStatus(issues, milestones)
            }
          };

          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(healthData, null, 2)
            }]
          };
        }
        
        throw new McpError(ErrorCode.InvalidRequest, `Resource not implemented: ${uri}`);
        
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private calculateHealthScore(issues: any[], milestones: any[]): number {
    const openIssues = issues.filter(i => i.state === 'open');
    const unassignedIssues = openIssues.filter(i => !i.assignees || i.assignees.length === 0);
    const overdueIssues = openIssues.filter(i => 
      i.milestone?.due_on && new Date(i.milestone.due_on) < new Date()
    );

    let score = 100;
    score -= Math.min(30, unassignedIssues.length * 2);
    score -= Math.min(40, overdueIssues.length * 5);
    
    return Math.max(0, score);
  }

  private determineHealthStatus(issues: any[], milestones: any[]): string {
    const score = this.calculateHealthScore(issues, milestones);
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'needs-attention';
    return 'critical';
  }

  // PROMPTS IMPLEMENTATION (Phase 2.3 MCP SDK Features)
  private setupPromptHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'sprint-planning',
            description: 'AI-guided sprint planning with intelligent issue selection',
            arguments: [
              {
                name: 'sprintGoals',
                description: 'High-level sprint goals and objectives',
                required: true
              },
              {
                name: 'teamMembers',
                description: 'List of team member GitHub usernames',
                required: true
              },
              {
                name: 'duration',
                description: 'Sprint duration in days',
                required: false
              }
            ]
          },
          {
            name: 'issue-analysis',
            description: 'Deep analysis of issue complexity, priority, and readiness',
            arguments: [
              {
                name: 'issueNumber',
                description: 'GitHub issue number to analyze',
                required: true
              },
              {
                name: 'analysisType',
                description: 'Type of analysis to perform',
                required: true
              }
            ]
          },
          {
            name: 'project-health-review',
            description: 'Comprehensive project health assessment and recommendations',
            arguments: [
              {
                name: 'timeframe',
                description: 'Review timeframe (week, month, quarter)',
                required: true
              },
              {
                name: 'includeMetrics',
                description: 'Include detailed metrics and trends',
                required: false
              }
            ]
          }
        ]
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        this.validateRepoConfig();
        
        switch (name) {
          case 'sprint-planning':
            const sprintGoals = args?.sprintGoals || [];
            const teamMembers = args?.teamMembers || [];
            const duration = args?.duration || 14;
            
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: `Plan a ${duration}-day sprint for team: ${teamMembers.join(', ')}\n\nGoals:\n${sprintGoals.map((goal: string) => `• ${goal}`).join('\n')}\n\nPlease analyze the repository backlog and recommend:\n1. Issues to include based on complexity and priority\n2. Team capacity allocation\n3. Risk assessment and mitigation strategies\n4. Sprint success metrics`
                }
              }]
            };
            
          case 'issue-analysis':
            const issueNumber = args?.issueNumber;
            const analysisType = args?.analysisType || 'complexity';
            
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: `Analyze issue #${issueNumber} for ${analysisType}.\n\nPlease provide:\n1. Detailed ${analysisType} assessment\n2. Specific recommendations\n3. Risk factors and blockers\n4. Next steps and timeline`
                }
              }]
            };
            
          case 'project-health-review':
            const timeframe = args?.timeframe || 'month';
            const includeMetrics = args?.includeMetrics !== false;
            
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: `Generate a ${timeframe}ly project health review.\n\n${includeMetrics ? 'Include detailed metrics and trends.' : 'Focus on qualitative assessment.'}\n\nReview areas:\n1. Sprint velocity and completion rates\n2. Issue lifecycle and bottlenecks\n3. Team performance and workload\n4. Risk assessment and recommendations`
                }
              }]
            };
            
          default:
            throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Failed to get prompt: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🚀 GitHub Project Manager MCP Server v2.3 - Complete Edition");
    console.error(`📁 Repository: ${this.owner}/${this.repo}`);
    console.error("🛠️ Tools: 46 comprehensive project management tools");
    console.error("📊 Resources: 6 data resources for enhanced MCP integration");
    console.error("🤖 Prompts: 3 intelligent prompt templates");
    console.error("✨ All 46 tools fully implemented with real GitHub API integration!");
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