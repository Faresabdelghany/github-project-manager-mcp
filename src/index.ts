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
        version: '4.0.0',
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

  // AI-POWERED TASK ANALYSIS METHODS
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
      const technicalKeywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security', 'performance', 'scalability'];
      const techCount = technicalKeywords.filter(keyword => 
        issue.body.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      complexity += Math.min(techCount, 3);
    }
    
    // Analyze labels for complexity indicators
    const complexityLabels = issue.labels.filter((label: any) => 
      ['epic', 'large', 'complex', 'research', 'spike', 'architectural'].some(keyword => 
        label.name.toLowerCase().includes(keyword)
      )
    );
    complexity += complexityLabels.length;
    
    // Check for dependencies or linked issues
    if (issue.body && issue.body.match(/#\d+/g)) {
      complexity += Math.min(issue.body.match(/#\d+/g)!.length, 2);
    }
    
    return Math.min(complexity, 8); // Cap at 8 story points
  }

  private calculateIssuePriority(issue: any): number {
    let priority = 1;
    
    // Priority labels
    const priorityMap = {
      'critical': 5,
      'urgent': 5,
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
      label.name.toLowerCase().includes('bug') || label.name.toLowerCase().includes('fix')
    );
    if (isBug) priority += 1;
    
    // Security issue boost
    const isSecurity = issue.labels.some((label: any) => 
      label.name.toLowerCase().includes('security') || label.name.toLowerCase().includes('vulnerability')
    );
    if (isSecurity) priority += 2;
    
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
    
    // Check if issue has clear description
    if (!issue.body || issue.body.length < 50) {
      blockers.push('Insufficient description');
      readinessScore -= 0.3;
    }
    
    // Check for blocked labels
    const blockedLabels = issue.labels.filter((label: any) => 
      ['blocked', 'waiting', 'needs-info', 'dependencies', 'on-hold'].some(keyword =>
        label.name.toLowerCase().includes(keyword)
      )
    );
    if (blockedLabels.length > 0) {
      blockers.push(`Blocked by: ${blockedLabels.map((l: any) => l.name).join(', ')}`);
      readinessScore -= 0.5;
    }
    
    // Check for assignee
    if (!issue.assignees || issue.assignees.length === 0) {
      readinessScore -= 0.1; // Minor penalty for no assignee
    }
    
    // Check for acceptance criteria
    if (issue.body && issue.body.toLowerCase().includes('acceptance criteria')) {
      readinessScore += 0.2;
    }
    
    // Check for recent comments indicating activity
    if (issue.comments > 0) {
      readinessScore += 0.1;
    }
    
    // Check if issue is in a milestone
    if (issue.milestone) {
      readinessScore += 0.1;
    }
    
    const finalScore = Math.max(0, Math.min(1, readinessScore));
    return {
      ready: finalScore > 0.6 && blockers.length === 0,
      score: finalScore,
      blockers
    };
  }

  private categorizeIssuesByContext(issues: any[], context?: string): any[] {
    if (!context) return issues;
    
    const contextKeywords = context.toLowerCase().split(/[\s,]+/);
    
    return issues.filter(issue => {
      const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
      const labels = issue.labels.map((l: any) => l.name.toLowerCase()).join(' ');
      const allText = `${text} ${labels}`;
      
      return contextKeywords.some(keyword => allText.includes(keyword));
    });
  }

  private findSimilarIssues(targetIssue: any, allIssues: any[]): any[] {
    const targetText = `${targetIssue.title} ${targetIssue.body || ''}`.toLowerCase();
    const targetWords = targetText.split(/\s+/).filter(word => word.length > 3);
    
    return allIssues
      .filter(issue => issue.number !== targetIssue.number)
      .map(issue => {
        const issueText = `${issue.title} ${issue.body || ''}`.toLowerCase();
        const commonWords = targetWords.filter(word => issueText.includes(word));
        const similarity = commonWords.length / targetWords.length;
        
        return { issue, similarity };
      })
      .filter(({ similarity }) => similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(({ issue }) => issue);
  }

  private generateTaskSuggestions(issue: any): any[] {
    const suggestions = [];
    const complexity = this.analyzeIssueComplexity(issue);
    
    // Suggest breaking down complex issues
    if (complexity >= 5) {
      suggestions.push({
        type: 'breakdown',
        title: 'Consider breaking this into smaller tasks',
        description: 'This issue has high complexity and could benefit from being split into smaller, more manageable tasks.'
      });
    }
    
    // Suggest adding acceptance criteria
    if (!issue.body || !issue.body.toLowerCase().includes('acceptance criteria')) {
      suggestions.push({
        type: 'criteria',
        title: 'Add acceptance criteria',
        description: 'Define clear acceptance criteria to make this issue more actionable.'
      });
    }
    
    // Suggest assigning if unassigned
    if (!issue.assignees || issue.assignees.length === 0) {
      suggestions.push({
        type: 'assignment',
        title: 'Assign to team member',
        description: 'Assign this issue to ensure accountability and clear ownership.'
      });
    }
    
    // Suggest adding to milestone
    if (!issue.milestone) {
      suggestions.push({
        type: 'milestone',
        title: 'Add to milestone',
        description: 'Link this issue to a milestone to improve project planning and tracking.'
      });
    }
    
    return suggestions;
  }

  // Enhanced AI-powered subtask generation
  private generateIntelligentSubtasks(issue: any, complexity: number, granularity: string): any[] {
    const subtasks = [];
    const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
    const labels = issue.labels.map((l: any) => l.name.toLowerCase()).join(' ');
    const allText = `${text} ${labels}`;
    
    // Detect task types based on content analysis
    const taskTypes = this.analyzeTaskTypes(allText, complexity);
    
    // Generate subtasks based on identified types
    if (taskTypes.includes('research') || complexity >= 6) {
      subtasks.push({
        title: 'Research and Investigation',
        type: 'research',
        phase: 'planning',
        description: 'Conduct thorough research, investigate existing solutions, and analyze requirements.',
        complexity: Math.max(1, Math.floor(complexity * 0.15)),
        estimatedHours: Math.max(4, Math.floor(complexity * 1)),
        priority: 'high',
        acceptanceCriteria: [
          'All requirements are clearly understood and documented',
          'Research findings are documented with recommendations',
          'Technical approach is validated and approved'
        ]
      });
    }
    
    if (taskTypes.includes('design') || complexity >= 5) {
      subtasks.push({
        title: 'Design and Architecture',
        type: 'design',
        phase: 'planning',
        description: 'Create detailed technical design, architecture diagrams, and implementation specifications.',
        complexity: Math.max(2, Math.floor(complexity * 0.2)),
        estimatedHours: Math.max(6, Math.floor(complexity * 1.5)),
        priority: 'high',
        acceptanceCriteria: [
          'System architecture is designed and documented',
          'API contracts and data models are defined',
          'Design review is completed and approved'
        ]
      });
    }
    
    if (taskTypes.includes('backend') || taskTypes.includes('api')) {
      subtasks.push({
        title: 'Backend Implementation',
        type: 'backend',
        phase: 'implementation',
        description: 'Implement server-side logic, API endpoints, and data layer functionality.',
        complexity: Math.max(2, Math.floor(complexity * 0.4)),
        estimatedHours: Math.max(8, Math.floor(complexity * 2)),
        priority: 'high',
        acceptanceCriteria: [
          'All API endpoints are implemented and functional',
          'Data models and database schema are implemented',
          'Business logic is implemented according to specifications'
        ]
      });
    }
    
    if (taskTypes.includes('frontend') || taskTypes.includes('ui')) {
      subtasks.push({
        title: 'Frontend Implementation',
        type: 'frontend',
        phase: 'implementation',
        description: 'Implement user interface components and client-side functionality.',
        complexity: Math.max(2, Math.floor(complexity * 0.35)),
        estimatedHours: Math.max(8, Math.floor(complexity * 2.5)),
        priority: 'medium',
        acceptanceCriteria: [
          'All UI components are implemented according to design',
          'User interactions and workflows are functional',
          'Responsive design is implemented'
        ]
      });
    }
    
    // Always include testing for complex tasks
    if (complexity >= 3 || granularity === 'high') {
      subtasks.push({
        title: 'Testing and Quality Assurance',
        type: 'testing',
        phase: 'validation',
        description: 'Implement comprehensive testing suite and quality assurance.',
        complexity: Math.max(1, Math.floor(complexity * 0.25)),
        estimatedHours: Math.max(6, Math.floor(complexity * 1.5)),
        priority: 'medium',
        acceptanceCriteria: [
          'Unit tests achieve minimum 80% code coverage',
          'Integration tests cover all API endpoints',
          'All tests are passing and reliable'
        ]
      });
    }
    
    // If no specific subtasks identified, create generic implementation tasks
    if (subtasks.length === 0) {
      subtasks.push({
        title: 'Core Implementation',
        type: 'development',
        phase: 'implementation',
        description: 'Implement the core functionality as described in the issue requirements.',
        complexity: Math.max(2, Math.floor(complexity * 0.7)),
        estimatedHours: Math.max(4, complexity * 2.5),
        priority: 'high',
        acceptanceCriteria: [
          'All functional requirements are implemented',
          'Code follows established standards and patterns',
          'Implementation is tested and working correctly'
        ]
      });
    }
    
    return subtasks;
  }

  private analyzeTaskTypes(text: string, complexity: number): string[] {
    const types = [];
    
    // Research indicators
    if (text.includes('research') || text.includes('investigate') || complexity >= 6) {
      types.push('research');
    }
    
    // Design indicators
    if (text.includes('design') || text.includes('architecture') || complexity >= 5) {
      types.push('design');
    }
    
    // Backend indicators
    if (text.includes('api') || text.includes('backend') || text.includes('server') || text.includes('endpoint')) {
      types.push('backend', 'api');
    }
    
    // Frontend indicators
    if (text.includes('frontend') || text.includes('ui') || text.includes('interface') || text.includes('component')) {
      types.push('frontend', 'ui');
    }
    
    return [...new Set(types)]; // Remove duplicates
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // PROJECT MANAGEMENT
          {
            name: 'get_project',
            description: 'Get detailed information about a specific GitHub project including structure, fields, views, items, and progress metrics',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: { type: 'string', description: 'GitHub Project v2 ID (node ID)' },
                project_number: { type: 'number', description: 'Project number (alternative to project_id)' },
                owner_login: { type: 'string', description: 'Repository owner or organization login (defaults to configured owner)' },
                include_items: { type: 'boolean', description: 'Include project items (issues/PRs) (default: true)' },
                include_fields: { type: 'boolean', description: 'Include custom project fields (default: true)' },
                include_views: { type: 'boolean', description: 'Include project views (default: true)' },
                include_metrics: { type: 'boolean', description: 'Calculate and include progress metrics (default: true)' },
                items_limit: { type: 'number', description: 'Maximum number of items to retrieve (default: 50)', minimum: 1, maximum: 100 }
              },
              required: []
            }
          },
          // TASK MANAGEMENT
          {
            name: 'get_next_task',
            description: 'Get AI-powered recommendations for next tasks to work on based on priority, complexity, and readiness',
            inputSchema: {
              type: 'object',
              properties: {
                assignee: { type: 'string', description: 'Filter tasks for specific assignee (GitHub username)' },
                priority_level: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'Minimum priority level (default: medium)' },
                max_complexity: { type: 'number', description: 'Maximum complexity/story points (default: 8)', minimum: 1, maximum: 13 },
                include_blocked: { type: 'boolean', description: 'Include blocked tasks in recommendations (default: false)' },
                limit: { type: 'number', description: 'Maximum number of task recommendations (default: 5)', minimum: 1, maximum: 20 },
                context: { type: 'string', description: 'Current work context or focus area (e.g., "frontend", "backend", "testing")' },
                sprint_focus: { type: 'boolean', description: 'Prioritize tasks from current sprint (default: true)' }
              },
              required: []
            }
          },
          {
            name: 'analyze_task_complexity',
            description: 'Perform detailed AI-powered complexity analysis for tasks with risk assessment and effort estimation',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number to analyze' },
                include_suggestions: { type: 'boolean', description: 'Include complexity reduction suggestions (default: true)' },
                team_context: { type: 'array', items: { type: 'string' }, description: 'Team member skills/expertise for context' },
                similar_issues: { type: 'boolean', description: 'Find and analyze similar historical issues (default: true)' },
                breakdown_tasks: { type: 'boolean', description: 'Suggest task breakdown if complex (default: true)' }
              },
              required: ['issue_number']
            }
          },
          {
            name: 'expand_task',
            description: 'Break down complex tasks into manageable subtasks with dependencies and acceptance criteria - ENHANCED AI-POWERED VERSION',
            inputSchema: {
              type: 'object',
              properties: {
                issue_number: { type: 'number', description: 'Issue number to break down' },
                granularity: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Level of task breakdown detail (default: medium)' },
                create_subtasks: { type: 'boolean', description: 'Actually create GitHub issues for subtasks (default: false)' },
                assign_to: { type: 'string', description: 'Assignee for created subtasks' },
                add_to_sprint: { type: 'number', description: 'Sprint/milestone number to add subtasks to' },
                include_estimates: { type: 'boolean', description: 'Include effort estimates for subtasks (default: true)' },
                dependency_analysis: { type: 'boolean', description: 'Analyze and specify task dependencies (default: true)' }
              },
              required: ['issue_number']
            }
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'get_project':
            return await this.handleGetProject(args);
          case 'get_next_task':
            return await this.handleGetNextTask(args);
          case 'analyze_task_complexity':
            return await this.handleAnalyzeTaskComplexity(args);
          case 'expand_task':
            return await this.handleExpandTask(args);
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
  private async handleGetProject(args: any) {
    try {
      const {
        project_id,
        project_number,
        owner_login = this.owner,
        include_items = true,
        include_fields = true,
        include_views = true,
        include_metrics = true,
        items_limit = 50
      } = args;

      if (!project_id && !project_number) {
        throw new Error('Either project_id or project_number must be provided');
      }

      if (!owner_login) {
        throw new Error('owner_login must be provided or GITHUB_OWNER environment variable must be set');
      }

      let result = `🏗️ **GitHub Project Details**\n\n`;
      result += `**Repository/Organization:** ${owner_login}\n`;
      result += `**Retrieved:** ${new Date().toLocaleString()}\n\n`;
      result += `---\n\n`;

      let projectData: any = {};

      try {
        // First, get basic project information
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
                      url
                    }
                    ... on User {
                      login
                      name
                      url
                    }
                  }
                  ${include_fields ? `
                  fields(first: 20) {
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                        dataType
                        createdAt
                        updatedAt
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
                  ` : ''}
                  ${include_views ? `
                  views(first: 10) {
                    nodes {
                      id
                      name
                      layout
                      createdAt
                      updatedAt
                    }
                  }
                  ` : ''}
                  ${include_items ? `
                  items(first: ${items_limit}) {
                    totalCount
                    nodes {
                      id
                      type
                      createdAt
                      updatedAt
                      content {
                        ... on Issue {
                          id
                          number
                          title
                          state
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
                          url
                        }
                        ... on PullRequest {
                          id
                          number
                          title
                          state
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
                          url
                        }
                      }
                    }
                  }
                  ` : ''}
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
                      url
                    }
                    ... on User {
                      login
                      name
                      url
                    }
                  }
                  ${include_fields ? `
                  fields(first: 20) {
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                        dataType
                        createdAt
                        updatedAt
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
                  ` : ''}
                  ${include_views ? `
                  views(first: 10) {
                    nodes {
                      id
                      name
                      layout
                      createdAt
                      updatedAt
                    }
                  }
                  ` : ''}
                  ${include_items ? `
                  items(first: ${items_limit}) {
                    totalCount
                    nodes {
                      id
                      type
                      createdAt
                      updatedAt
                      content {
                        ... on Issue {
                          id
                          number
                          title
                          state
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
                          url
                        }
                        ... on PullRequest {
                          id
                          number
                          title
                          state
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
                          url
                        }
                      }
                    }
                  }
                  ` : ''}
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
                      url
                    }
                    ... on User {
                      login
                      name
                      url
                    }
                  }
                  ${include_fields ? `
                  fields(first: 20) {
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                        dataType
                        createdAt
                        updatedAt
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
                  ` : ''}
                  ${include_views ? `
                  views(first: 10) {
                    nodes {
                      id
                      name
                      layout
                      createdAt
                      updatedAt
                    }
                  }
                  ` : ''}
                  ${include_items ? `
                  items(first: ${items_limit}) {
                    totalCount
                    nodes {
                      id
                      type
                      createdAt
                      updatedAt
                      content {
                        ... on Issue {
                          id
                          number
                          title
                          state
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
                          url
                        }
                        ... on PullRequest {
                          id
                          number
                          title
                          state
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
                          url
                        }
                      }
                    }
                  }
                  ` : ''}
                }
              }
            }
          `;

          const response = await this.graphqlWithAuth(projectQuery, {
            owner: owner_login,
            projectNumber: project_number
          });

          // Try organization first, then user
          projectData = response.organization?.projectV2 || response.user?.projectV2;
        }

        if (!projectData) {
          result += `❌ **Project not found**\n\n`;
          result += `**Search Parameters:**\n`;
          if (project_id) result += `- Project ID: ${project_id}\n`;
          if (project_number) result += `- Project Number: ${project_number}\n`;
          result += `- Owner: ${owner_login}\n\n`;
          result += `**Possible Issues:**\n`;
          result += `• Project doesn't exist or has been deleted\n`;
          result += `• Insufficient permissions to access project\n`;
          result += `• Wrong owner/organization specified\n`;
          result += `• Project ID or number is incorrect\n\n`;
          result += `**Suggestions:**\n`;
          result += `• Verify project exists in GitHub web interface\n`;
          result += `• Check access permissions for the project\n`;
          result += `• Ensure correct owner login is specified\n`;
          result += `• Verify the project number or ID is correct`;

          return {
            content: [{
              type: "text",
              text: result
            }]
          };
        }

        // Basic project information
        result += `## 📋 **Project Overview**\n\n`;
        result += `**Title:** ${projectData.title}\n`;
        result += `**Number:** #${projectData.number}\n`;
        result += `**ID:** ${projectData.id}\n`;
        result += `**Status:** ${projectData.closed ? '🔒 Closed' : '🟢 Open'}\n`;
        result += `**Visibility:** ${projectData.public ? '🌍 Public' : '🔒 Private'}\n`;
        result += `**Owner:** ${projectData.owner.name || projectData.owner.login} (@${projectData.owner.login})\n`;
        result += `**Created:** ${new Date(projectData.createdAt).toLocaleDateString()}\n`;
        result += `**Updated:** ${new Date(projectData.updatedAt).toLocaleDateString()}\n`;
        result += `**URL:** ${projectData.url}\n\n`;

        if (projectData.shortDescription) {
          result += `**Description:** ${projectData.shortDescription}\n\n`;
        }

        if (projectData.readme) {
          const readmePreview = projectData.readme.length > 200 
            ? projectData.readme.substring(0, 200) + '...' 
            : projectData.readme;
          result += `**README Preview:**\n${readmePreview}\n\n`;
        }

        // Project fields information
        if (include_fields && projectData.fields?.nodes?.length > 0) {
          result += `## 🏷️ **Custom Fields (${projectData.fields.nodes.length})**\n\n`;
          
          projectData.fields.nodes.forEach((field: any, index: number) => {
            result += `${index + 1}. **${field.name}** (${field.dataType})\n`;
            
            if (field.options) {
              result += `   Options: ${field.options.map((opt: any) => `${opt.name} (${opt.color})`).join(', ')}\n`;
            }
            
            if (field.configuration?.iterations) {
              result += `   Iterations: ${field.configuration.iterations.length} configured\n`;
              field.configuration.iterations.slice(0, 3).forEach((iteration: any) => {
                result += `     • ${iteration.title} (${iteration.duration} days)\n`;
              });
            }
            
            result += `   Created: ${new Date(field.createdAt).toLocaleDateString()}\n\n`;
          });
        }

        // Project views information
        if (include_views && projectData.views?.nodes?.length > 0) {
          result += `## 👁️ **Views (${projectData.views.nodes.length})**\n\n`;
          
          projectData.views.nodes.forEach((view: any, index: number) => {
            result += `${index + 1}. **${view.name}** (${view.layout})\n`;
            result += `   Created: ${new Date(view.createdAt).toLocaleDateString()}\n`;
            result += `   Updated: ${new Date(view.updatedAt).toLocaleDateString()}\n\n`;
          });
        }

        // Project items and metrics
        if (include_items && projectData.items) {
          const items = projectData.items.nodes || [];
          const totalCount = projectData.items.totalCount || items.length;
          
          result += `## 📦 **Project Items (${totalCount} total, showing ${items.length})**\n\n`;

          if (include_metrics) {
            // Calculate metrics
            const issues = items.filter((item: any) => item.content && item.content.__typename === 'Issue');
            const pullRequests = items.filter((item: any) => item.content && item.content.__typename === 'PullRequest');
            
            const openIssues = issues.filter((item: any) => item.content.state === 'OPEN').length;
            const closedIssues = issues.filter((item: any) => item.content.state === 'CLOSED').length;
            const openPRs = pullRequests.filter((item: any) => item.content.state === 'OPEN').length;
            const mergedPRs = pullRequests.filter((item: any) => item.content.state === 'MERGED').length;
            const closedPRs = pullRequests.filter((item: any) => item.content.state === 'CLOSED').length;

            result += `### 📊 **Progress Metrics**\n\n`;
            result += `**Issues:**\n`;
            result += `- Open: ${openIssues}\n`;
            result += `- Closed: ${closedIssues}\n`;
            result += `- Completion Rate: ${issues.length > 0 ? Math.round((closedIssues / issues.length) * 100) : 0}%\n\n`;
            
            result += `**Pull Requests:**\n`;
            result += `- Open: ${openPRs}\n`;
            result += `- Merged: ${mergedPRs}\n`;
            result += `- Closed: ${closedPRs}\n`;
            result += `- Merge Rate: ${pullRequests.length > 0 ? Math.round((mergedPRs / pullRequests.length) * 100) : 0}%\n\n`;

            // Overall progress
            const totalItems = issues.length + pullRequests.length;
            const completedItems = closedIssues + mergedPRs;
            const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
            
            result += `**Overall Progress:** ${overallProgress}% (${completedItems}/${totalItems} items completed)\n\n`;
          }

          // List recent items
          if (items.length > 0) {
            result += `### 📝 **Recent Items (Latest ${Math.min(10, items.length)})**\n\n`;
            
            items.slice(0, 10).forEach((item: any, index: number) => {
              if (!item.content) return;
              
              const content = item.content;
              const stateEmoji = 
                content.state === 'OPEN' ? '🟢' :
                content.state === 'CLOSED' ? '🔴' :
                content.state === 'MERGED' ? '🟣' : '⚪';
              
              result += `${index + 1}. ${stateEmoji} **${content.title}** (#${content.number})\n`;
              
              if (content.assignees?.nodes?.length > 0) {
                result += `   Assigned: ${content.assignees.nodes.map((a: any) => a.login).join(', ')}\n`;
              }
              
              if (content.labels?.nodes?.length > 0) {
                result += `   Labels: ${content.labels.nodes.map((l: any) => l.name).join(', ')}\n`;
              }
              
              result += `   Updated: ${new Date(item.updatedAt).toLocaleDateString()}\n`;
              result += `   Link: ${content.url}\n\n`;
            });

            if (totalCount > items.length) {
              result += `... and ${totalCount - items.length} more items\n\n`;
            }
          }
        }

        // Summary and recommendations
        result += `## 🎯 **Summary & Recommendations**\n\n`;
        
        if (include_metrics && projectData.items) {
          const items = projectData.items.nodes || [];
          const issues = items.filter((item: any) => item.content && item.content.__typename === 'Issue');
          const totalItems = items.length;
          const completedItems = items.filter((item: any) => 
            item.content && (item.content.state === 'CLOSED' || item.content.state === 'MERGED')
          ).length;

          if (totalItems === 0) {
            result += `📝 **Getting Started:** This project is empty. Consider adding issues or pull requests to track your work.\n\n`;
          } else if (completedItems / totalItems < 0.3) {
            result += `🚀 **Early Stage:** Project is in early development with ${Math.round((completedItems / totalItems) * 100)}% completion.\n\n`;
          } else if (completedItems / totalItems < 0.7) {
            result += `⚡ **Active Development:** Project is progressing well with ${Math.round((completedItems / totalItems) * 100)}% completion.\n\n`;
          } else {
            result += `🎉 **Nearing Completion:** Project is well advanced with ${Math.round((completedItems / totalItems) * 100)}% completion.\n\n`;
          }

          // Specific recommendations
          result += `**Recommendations:**\n`;
          
          if (issues.filter((i: any) => !i.content.assignees || i.content.assignees.nodes.length === 0).length > 0) {
            result += `• Assign unassigned issues to team members\n`;
          }
          
          if (!projectData.fields || projectData.fields.nodes.length === 0) {
            result += `• Consider adding custom fields to better organize work\n`;
          }
          
          if (!projectData.views || projectData.views.nodes.length <= 1) {
            result += `• Create additional views to visualize work in different ways\n`;
          }
          
          if (projectData.shortDescription && projectData.shortDescription.length < 50) {
            result += `• Expand project description to provide more context\n`;
          }
          
          result += `• Regularly review and update project items\n`;
          result += `• Use project automation to streamline workflows\n`;
        }

        result += `\n💡 **Tip:** Use the project URL to access the full web interface for detailed management: ${projectData.url}`;

      } catch (graphqlError: any) {
        result += `❌ **GraphQL Error**\n\n`;
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
        
        result += `**Possible Causes:**\n`;
        result += `• Insufficient permissions to access project\n`;
        result += `• Project doesn't exist or was deleted\n`;
        result += `• GraphQL query syntax error\n`;
        result += `• GitHub API rate limiting\n`;
        result += `• Network connectivity issues\n\n`;
        
        result += `**Solutions:**\n`;
        result += `• Verify project exists and you have access\n`;
        result += `• Check GitHub token permissions\n`;
        result += `• Try with a different project ID/number\n`;
        result += `• Wait a few minutes if rate limited`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get project details: ${error.message}`);
    }
  }

  // TASK MANAGEMENT IMPLEMENTATIONS
  private async handleGetNextTask(args: any) {
    this.validateRepoConfig();

    try {
      const {
        assignee,
        priority_level = 'medium',
        max_complexity = 8,
        include_blocked = false,
        limit = 5,
        context,
        sprint_focus = true
      } = args;

      // Get all open issues
      const issuesResponse = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        assignee: assignee || undefined,
        per_page: 100
      });

      let candidateIssues = issuesResponse.data.filter(issue => !issue.pull_request);

      // Apply context filtering
      if (context) {
        candidateIssues = this.categorizeIssuesByContext(candidateIssues, context);
      }

      // Get milestones to identify current sprint
      let currentSprintMilestone = null;
      if (sprint_focus) {
        const milestonesResponse = await this.octokit.rest.issues.listMilestones({
          owner: this.owner,
          repo: this.repo,
          state: 'open',
          per_page: 50
        });

        // Find current sprint (milestone with earliest due date)
        const activeMilestones = milestonesResponse.data.filter(m => m.due_on && new Date(m.due_on) >= new Date());
        if (activeMilestones.length > 0) {
          currentSprintMilestone = activeMilestones.sort((a, b) => 
            new Date(a.due_on!).getTime() - new Date(b.due_on!).getTime()
          )[0];
        }
      }

      // Analyze and score each issue
      const scoredIssues = candidateIssues.map(issue => {
        const complexity = this.analyzeIssueComplexity(issue);
        const priority = this.calculateIssuePriority(issue);
        const readiness = this.assessIssueReadiness(issue);
        
        // Skip if too complex
        if (complexity > max_complexity) return null;
        
        // Skip if blocked (unless explicitly included)
        if (!include_blocked && readiness.blockers.length > 0) return null;
        
        // Skip if below priority threshold
        const priorityThresholds = { low: 1, medium: 2, high: 3 };
        if (priority < priorityThresholds[priority_level as keyof typeof priorityThresholds]) return null;

        // Calculate final score
        let score = priority * 0.4 + readiness.score * 0.3 + (1 / complexity) * 0.3;
        
        // Boost for current sprint
        if (sprint_focus && currentSprintMilestone && issue.milestone?.number === currentSprintMilestone.number) {
          score += 1.0;
        }
        
        // Recent activity boost
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceUpdate < 3) score += 0.2;
        
        return {
          issue,
          score,
          complexity,
          priority,
          readiness,
          daysSinceUpdate
        };
      }).filter(Boolean) as any[];

      // Sort by score and take top results
      const topTasks = scoredIssues
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      let result = `🎯 **AI-Powered Task Recommendations**\n\n`;
      result += `**Repository:** ${this.owner}/${this.repo}\n`;
      result += `**Criteria:** Priority ≥ ${priority_level}, Complexity ≤ ${max_complexity}sp\n`;
      
      if (assignee) result += `**Assignee:** ${assignee}\n`;
      if (context) result += `**Context:** ${context}\n`;
      if (currentSprintMilestone) result += `**Current Sprint:** ${currentSprintMilestone.title}\n`;
      
      result += `**Generated:** ${new Date().toLocaleString()}\n\n`;
      result += `---\n\n`;

      if (topTasks.length === 0) {
        result += `❌ **No suitable tasks found**\n\n`;
        result += `**Possible reasons:**\n`;
        result += `• All tasks exceed maximum complexity (${max_complexity}sp)\n`;
        result += `• No tasks meet minimum priority level (${priority_level})\n`;
        result += `• All available tasks are blocked\n`;
        result += `• Context filter too restrictive\n\n`;
        result += `**Suggestions:**\n`;
        result += `• Increase max_complexity parameter\n`;
        result += `• Lower priority_level filter\n`;
        result += `• Set include_blocked=true\n`;
        result += `• Broaden or remove context filter`;
      } else {
        result += `## 🚀 **Recommended Tasks (${topTasks.length})**\n\n`;

        topTasks.forEach((task, index) => {
          const { issue, score, complexity, priority, readiness, daysSinceUpdate } = task;
          
          const priorityEmoji = priority >= 4 ? '🔴' : priority >= 3 ? '🟡' : '🟢';
          const readinessEmoji = readiness.ready ? '✅' : '⚠️';
          
          result += `### ${index + 1}. ${priorityEmoji} **${issue.title}** (#${issue.number})\n`;
          result += `**Score:** ${score.toFixed(2)} | **Priority:** ${priority}/5 | **Complexity:** ${complexity}sp | **Ready:** ${readinessEmoji}\n\n`;
          
          // Why recommended
          const reasons = [];
          if (score >= 3) reasons.push('High overall score');
          if (priority >= 4) reasons.push('High priority');
          if (readiness.ready) reasons.push('Ready to start');
          if (complexity <= 3) reasons.push('Low complexity');
          if (daysSinceUpdate < 7) reasons.push('Recent activity');
          if (issue.milestone?.number === currentSprintMilestone?.number) reasons.push('Current sprint priority');
          
          if (reasons.length > 0) {
            result += `**Why recommended:** ${reasons.join(', ')}\n`;
          }
          
          // Task details
          result += `**Assignees:** ${issue.assignees?.map((a: any) => a.login).join(', ') || 'Unassigned'}\n`;
          result += `**Labels:** ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n`;
          result += `**Milestone:** ${issue.milestone?.title || 'None'}\n`;
          result += `**Updated:** ${daysSinceUpdate === 0 ? 'Today' : `${daysSinceUpdate} days ago`}\n`;
          
          // Readiness status
          if (!readiness.ready && readiness.blockers.length > 0) {
            result += `**Blockers:** ${readiness.blockers.join(', ')}\n`;
          }
          
          // Task suggestions
          const suggestions = this.generateTaskSuggestions(issue);
          if (suggestions.length > 0) {
            result += `**Suggestions:** ${suggestions.map(s => s.title).join(', ')}\n`;
          }
          
          result += `**Link:** ${issue.html_url}\n\n`;
          
          // Brief description
          if (issue.body) {
            const preview = issue.body.length > 150 ? issue.body.substring(0, 150) + '...' : issue.body;
            result += `${preview}\n\n`;
          }
          
          result += `---\n\n`;
        });

        // Summary insights
        result += `## 📊 **Insights & Recommendations**\n\n`;
        
        const avgComplexity = topTasks.reduce((sum, task) => sum + task.complexity, 0) / topTasks.length;
        const avgPriority = topTasks.reduce((sum, task) => sum + task.priority, 0) / topTasks.length;
        const readyTasks = topTasks.filter(task => task.readiness.ready).length;
        
        result += `**Average Complexity:** ${avgComplexity.toFixed(1)}sp\n`;
        result += `**Average Priority:** ${avgPriority.toFixed(1)}/5\n`;
        result += `**Ready to Start:** ${readyTasks}/${topTasks.length} tasks\n\n`;
        
        if (readyTasks < topTasks.length) {
          result += `💡 **Tip:** Focus on the ${readyTasks} ready tasks first, then address blockers for the remaining tasks.\n\n`;
        }
        
        // Context-specific advice
        if (context) {
          result += `🎯 **Context Focus:** Tasks filtered for "${context}" context. Consider broadening if more options needed.\n\n`;
        }
        
        // Sprint advice
        if (currentSprintMilestone) {
          const sprintTasks = topTasks.filter(task => task.issue.milestone?.number === currentSprintMilestone.number);
          if (sprintTasks.length > 0) {
            result += `🏃‍♂️ **Sprint Focus:** ${sprintTasks.length} recommended tasks are in current sprint "${currentSprintMilestone.title}".\n\n`;
          }
        }
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get next task recommendations: ${error.message}`);
    }
  }

  private async handleAnalyzeTaskComplexity(args: any) {
    this.validateRepoConfig();

    try {
      const {
        issue_number,
        include_suggestions = true,
        team_context = [],
        similar_issues = true,
        breakdown_tasks = true
      } = args;

      // Get the specific issue
      const issueResponse = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number
      });

      const issue = issueResponse.data;
      
      // Perform comprehensive analysis
      const complexity = this.analyzeIssueComplexity(issue);
      const priority = this.calculateIssuePriority(issue);
      const readiness = this.assessIssueReadiness(issue);

      let result = `🧮 **Comprehensive Task Complexity Analysis**\n\n`;
      result += `**Issue:** #${issue.number} - ${issue.title}\n`;
      result += `**Repository:** ${this.owner}/${this.repo}\n`;
      result += `**Analyzed:** ${new Date().toLocaleString()}\n\n`;
      result += `---\n\n`;

      // Core metrics
      result += `## 📊 **Core Metrics**\n\n`;
      result += `**Complexity Score:** ${complexity}/8 story points\n`;
      result += `**Priority Level:** ${priority}/5\n`;
      result += `**Readiness Score:** ${Math.round(readiness.score * 100)}%\n`;
      result += `**State:** ${issue.state}\n`;
      result += `**Assignees:** ${issue.assignees?.map((a: any) => a.login).join(', ') || 'Unassigned'}\n`;
      result += `**Labels:** ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n\n`;

      // Include suggestions and analysis based on the parameters
      if (include_suggestions && complexity >= 4) {
        result += `## 💡 **Complexity Reduction Suggestions**\n\n`;
        const suggestions = this.generateTaskSuggestions(issue);
        if (suggestions.length > 0) {
          suggestions.forEach(suggestion => {
            result += `• **${suggestion.title}:** ${suggestion.description}\n`;
          });
          result += `\n`;
        }
      }

      // Similar issues analysis
      if (similar_issues) {
        const allIssuesResponse = await this.octokit.rest.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: 'all',
          per_page: 100
        });
        
        const similarIssues = this.findSimilarIssues(issue, allIssuesResponse.data.filter(i => !i.pull_request));
        
        if (similarIssues.length > 0) {
          result += `## 🔍 **Similar Historical Issues**\n\n`;
          result += `Found ${similarIssues.length} similar issues for reference:\n\n`;
          
          similarIssues.slice(0, 3).forEach((similarIssue, index) => {
            const similarComplexity = this.analyzeIssueComplexity(similarIssue);
            result += `${index + 1}. **${similarIssue.title}** (#${similarIssue.number})\n`;
            result += `   • State: ${similarIssue.state}\n`;
            result += `   • Complexity: ${similarComplexity}sp\n`;
            result += `   • Link: ${similarIssue.html_url}\n\n`;
          });
        }
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
    this.validateRepoConfig();

    try {
      const {
        issue_number,
        granularity = 'medium',
        create_subtasks = false,
        assign_to,
        add_to_sprint,
        include_estimates = true,
        dependency_analysis = true
      } = args;

      // Get the issue to expand
      const issueResponse = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number
      });

      const issue = issueResponse.data;
      const complexity = this.analyzeIssueComplexity(issue);
      const priority = this.calculateIssuePriority(issue);
      
      let result = `🔨 **Enhanced AI-Powered Task Breakdown Analysis**\n\n`;
      result += `**Original Issue:** #${issue.number} - ${issue.title}\n`;
      result += `**Repository:** ${this.owner}/${this.repo}\n`;
      result += `**Complexity:** ${complexity} story points | **Priority:** ${priority}/5\n`;
      result += `**Granularity:** ${granularity} | **Dependency Analysis:** ${dependency_analysis ? 'enabled' : 'disabled'}\n`;
      result += `**Generated:** ${new Date().toLocaleString()}\n\n`;
      result += `---\n\n`;

      if (complexity < 3) {
        result += `💡 **Recommendation:** This issue has low complexity (${complexity}sp). Consider implementing as-is rather than breaking down further.\n\n`;
        if (!create_subtasks) {
          result += `🎯 **Suggested Actions:**\n`;
          result += `• Assign to a team member\n`;
          result += `• Add to current sprint if capacity allows\n`;
          result += `• Implement in a single focused session\n\n`;
        }
      }

      // Generate intelligent subtasks using enhanced AI analysis
      const subtasks = this.generateIntelligentSubtasks(issue, complexity, granularity);
      
      result += `## 🧠 **AI Analysis Results**\n\n`;
      result += `**Breakdown Strategy:** ${this.getBreakdownStrategy(complexity)}\n`;
      result += `**Risk Assessment:** ${this.assessImplementationRisk(subtasks, complexity)}\n`;
      result += `**Recommended Team Size:** ${this.recommendTeamSize(subtasks, complexity)} developer(s)\n`;
      result += `**Estimated Timeline:** ${this.estimateTimeline(subtasks)} days\n\n`;

      result += `## 📋 **Intelligent Subtask Breakdown (${subtasks.length})**\n\n`;
      
      const createdIssues = [];
      let totalEstimatedEffort = 0;
      let totalComplexity = 0;
      
      for (let i = 0; i < subtasks.length; i++) {
        const subtask = subtasks[i];
        totalEstimatedEffort += subtask.estimatedHours;
        totalComplexity += subtask.complexity;
        
        const priorityEmoji = subtask.priority === 'critical' ? '🔴' : 
                             subtask.priority === 'high' ? '🟠' : 
                             subtask.priority === 'medium' ? '🟡' : '🟢';
        
        result += `### ${i + 1}. ${priorityEmoji} **${subtask.title}**\n`;
        result += `**Type:** ${subtask.type} | **Phase:** ${subtask.phase || 'implementation'}\n`;
        
        if (include_estimates) {
          result += `**Effort:** ${subtask.estimatedHours}h (${subtask.complexity}sp) | **Priority:** ${subtask.priority}\n`;
        }
        
        result += `\n**Description:**\n${subtask.description}\n\n`;
        
        // Enhanced acceptance criteria
        if (subtask.acceptanceCriteria && subtask.acceptanceCriteria.length > 0) {
          result += `**Acceptance Criteria:**\n`;
          subtask.acceptanceCriteria.forEach(criteria => {
            result += `- [ ] ${criteria}\n`;
          });
          result += `\n`;
        }

        // Create actual GitHub issues if requested
        if (create_subtasks) {
          try {
            const subtaskBody = this.generateSubtaskIssueBody(issue, subtask, i);
            const labels = this.generateSubtaskLabels(subtask, issue.number);

            const createIssueData: any = {
              owner: this.owner,
              repo: this.repo,
              title: `[${i + 1}] ${issue.title}: ${subtask.title}`,
              body: subtaskBody,
              labels
            };

            if (assign_to) {
              createIssueData.assignees = [assign_to];
            }

            if (add_to_sprint) {
              createIssueData.milestone = add_to_sprint;
            }

            const subtaskResponse = await this.octokit.rest.issues.create(createIssueData);
            
            createdIssues.push({
              number: subtaskResponse.data.number,
              title: subtaskResponse.data.title,
              url: subtaskResponse.data.html_url
            });

            result += `✅ **Created Issue:** [#${subtaskResponse.data.number}](${subtaskResponse.data.html_url})\n\n`;
          } catch (error: any) {
            result += `❌ **Failed to create issue:** ${error.message}\n\n`;
          }
        }
        
        result += `---\n\n`;
      }

      // Enhanced summary and recommendations
      result += `## 📊 **Comprehensive Analysis Summary**\n\n`;
      result += `**Original Complexity:** ${complexity} story points\n`;
      result += `**Total Subtask Complexity:** ${totalComplexity} story points\n`;
      
      if (include_estimates) {
        result += `**Total Estimated Effort:** ${totalEstimatedEffort} hours\n`;
        result += `**Average Task Size:** ${Math.round(totalEstimatedEffort / subtasks.length)} hours per task\n`;
      }
      
      result += `**Number of Subtasks:** ${subtasks.length}\n\n`;

      // Implementation strategy recommendations
      result += `## 🎯 **Implementation Strategy**\n\n`;
      result += `${this.generateImplementationStrategy(subtasks, complexity)}\n\n`;

      if (create_subtasks && createdIssues.length > 0) {
        result += `## ✅ **Created GitHub Issues (${createdIssues.length})**\n\n`;
        createdIssues.forEach((created, index) => {
          result += `${index + 1}. [#${created.number}: ${created.title}](${created.url})\n`;
        });
        result += `\n`;
        
        // Add parent issue update
        try {
          const parentUpdateBody = this.generateParentIssueUpdate(issue, createdIssues);
          await this.octokit.rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: issue.number,
            body: parentUpdateBody
          });
          result += `📝 **Updated parent issue** #${issue.number} with subtask references.\n\n`;
        } catch (error: any) {
          result += `⚠️ **Could not update parent issue:** ${error.message}\n\n`;
        }
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to expand task: ${error.message}`);
    }
  }

  // Helper methods for enhanced expand_task functionality
  private getBreakdownStrategy(complexity: number): string {
    if (complexity <= 2) return 'Single Implementation';
    if (complexity <= 4) return 'Sequential Development';
    if (complexity <= 6) return 'Parallel Development with Dependencies';
    return 'Phased Implementation with Risk Mitigation';
  }

  private assessImplementationRisk(subtasks: any[], complexity: number): string {
    const hasExternalDeps = subtasks.some(task => task.type === 'integration');
    const hasComplexBackend = subtasks.some(task => task.type === 'backend' && task.complexity >= 3);
    const hasMultipleSystems = subtasks.length >= 5;
    
    let risk = 'Low';
    if (complexity >= 6 || hasMultipleSystems) risk = 'High';
    else if (complexity >= 4 || hasExternalDeps || hasComplexBackend) risk = 'Medium';
    
    return risk;
  }

  private recommendTeamSize(subtasks: any[], complexity: number): number {
    if (complexity <= 3) return 1;
    if (complexity <= 5) return 2;
    return Math.min(3, Math.ceil(subtasks.length / 2));
  }

  private estimateTimeline(subtasks: any[]): number {
    const totalHours = subtasks.reduce((sum, task) => sum + task.estimatedHours, 0);
    const hoursPerDay = 6; // Assuming 6 productive hours per day
    return Math.ceil(totalHours / hoursPerDay);
  }

  private generateImplementationStrategy(subtasks: any[], complexity: number): string {
    let strategy = '';
    
    if (complexity <= 3) {
      strategy = '**Linear Implementation:** Execute tasks sequentially with single developer focus.';
    } else if (subtasks.length >= 3) {
      strategy = `**Parallel Development:** ${subtasks.length} tasks can run in parallel. Recommend team collaboration with clear task ownership.`;
    } else {
      strategy = '**Sequential with Overlap:** Execute in dependency order with some overlap where possible.';
    }
    
    strategy += '\n\n**Start with:** Research and design tasks to unblock implementation work.';
    strategy += '\n**Prioritize:** High-priority tasks that unlock the most downstream work.';
    
    return strategy;
  }

  private generateSubtaskIssueBody(parentIssue: any, subtask: any, subtaskIndex: number): string {
    let body = `## 🔗 Parent Issue\n`;
    body += `This is a subtask of #${parentIssue.number}: ${parentIssue.title}\n\n`;
    
    body += `## 📋 Task Description\n`;
    body += `${subtask.description}\n\n`;
    
    body += `## 🎯 Acceptance Criteria\n`;
    if (subtask.acceptanceCriteria && subtask.acceptanceCriteria.length > 0) {
      subtask.acceptanceCriteria.forEach((criteria: string) => {
        body += `- [ ] ${criteria}\n`;
      });
    } else {
      body += `- [ ] Implementation completed according to specifications\n`;
      body += `- [ ] Code reviewed and approved\n`;
      body += `- [ ] Tests written and passing\n`;
    }
    body += `\n`;
    
    body += `## 📊 Task Details\n`;
    body += `- **Type:** ${subtask.type}\n`;
    body += `- **Phase:** ${subtask.phase || 'implementation'}\n`;
    body += `- **Estimated Hours:** ${subtask.estimatedHours}h\n`;
    body += `- **Complexity:** ${subtask.complexity} story points\n`;
    body += `- **Priority:** ${subtask.priority}\n\n`;
    
    body += `## ✅ Definition of Done\n`;
    body += `- [ ] All acceptance criteria are met\n`;
    body += `- [ ] Code follows project standards and patterns\n`;
    body += `- [ ] Appropriate tests are written and passing\n`;
    body += `- [ ] Documentation is updated if needed\n`;
    body += `- [ ] Code review is completed and approved\n`;
    body += `- [ ] Parent issue #${parentIssue.number} is updated with progress\n\n`;
    
    body += `---\n`;
    body += `*Generated by AI-powered task breakdown on ${new Date().toLocaleDateString()}*`;
    
    return body;
  }

  private generateSubtaskLabels(subtask: any, parentIssueNumber: number): string[] {
    const labels = [
      `type:${subtask.type}`,
      `priority:${subtask.priority}`,
      'subtask',
      `parent-issue-${parentIssueNumber}`
    ];
    
    if (subtask.phase) {
      labels.push(`phase:${subtask.phase}`);
    }
    
    if (subtask.complexity >= 4) {
      labels.push('complex');
    }
    
    return labels;
  }

  private generateParentIssueUpdate(parentIssue: any, createdIssues: any[]): string {
    let updateBody = `## 🔨 Task Breakdown Completed\n\n`;
    updateBody += `This issue has been broken down into ${createdIssues.length} manageable subtasks using AI-powered analysis:\n\n`;
    
    createdIssues.forEach((issue, index) => {
      updateBody += `${index + 1}. [#${issue.number}: ${issue.title}](${issue.url})\n`;
    });
    
    updateBody += `\n## 📊 Implementation Status\n`;
    updateBody += `- **Total Subtasks:** ${createdIssues.length}\n`;
    updateBody += `- **Completed:** 0/${createdIssues.length}\n`;
    updateBody += `- **In Progress:** 0/${createdIssues.length}\n`;
    updateBody += `- **Remaining:** ${createdIssues.length}/${createdIssues.length}\n\n`;
    
    updateBody += `## 🎯 Next Steps\n`;
    updateBody += `1. Review and refine subtasks as needed\n`;
    updateBody += `2. Assign subtasks to team members\n`;
    updateBody += `3. Add subtasks to appropriate sprint/milestone\n`;
    updateBody += `4. Begin implementation in dependency order\n`;
    updateBody += `5. Update this issue as subtasks are completed\n\n`;
    
    updateBody += `---\n`;
    updateBody += `*Generated by AI-powered task breakdown on ${new Date().toLocaleDateString()}*`;
    
    return updateBody;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🎉 GitHub Project Manager MCP server running on stdio");
    console.error(`📍 Repository: ${this.owner}/${this.repo}`);
    console.error("✅ Issue #27 IMPLEMENTED: get_project tool for comprehensive project details retrieval!");
    console.error("🚀 Tools available: 4 comprehensive tools (1 project management + 3 task management)");
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