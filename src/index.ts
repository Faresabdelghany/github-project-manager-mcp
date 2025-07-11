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
import { z } from 'zod';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Modern GitHub Project Manager MCP Server with Complete Sprint Management
 * Phase 2.3: Modern MCP SDK Features Integration - Resources & Prompt Templates
 */

interface SprintData {
  sprintNumber: number;
  title: string;
  goals: string[];
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'completed' | 'overdue';
  teamMembers: string[];
  capacity: number;
  velocity: number;
  issues: number[];
  metadata: Record<string, any>;
  milestoneNumber?: number;
  createdAt: string;
  updatedAt: string;
}

interface SprintMetrics {
  burndownData: { date: string; remaining: number; completed: number }[];
  velocityTrend: number[];
  completionRate: number;
  averageIssueComplexity: number;
  teamPerformance: { member: string; completed: number; assigned: number; storyPoints: number }[];
  riskAssessment: 'low' | 'medium' | 'high';
  forecastedCompletion: string;
  daysRemaining: number;
  issuesCompleted: number;
  issuesTotal: number;
  storyPointsCompleted: number;
  storyPointsTotal: number;
}

class SprintService {
  private sprints: Map<number, SprintData> = new Map();
  private dataFile: string;

  constructor(private owner: string, private repo: string) {
    this.dataFile = join(process.cwd(), `.github-pm-sprints-${owner}-${repo}.json`);
    this.loadSprints();
  }

  private async loadSprints(): Promise<void> {
    try {
      const data = await fs.readFile(this.dataFile, 'utf8');
      const sprintsArray: SprintData[] = JSON.parse(data);
      this.sprints.clear();
      sprintsArray.forEach(sprint => {
        this.sprints.set(sprint.sprintNumber, sprint);
      });
    } catch (error) {
      this.sprints.clear();
    }
  }

  private async saveSprints(): Promise<void> {
    try {
      const sprintsArray = Array.from(this.sprints.values());
      await fs.writeFile(this.dataFile, JSON.stringify(sprintsArray, null, 2));
    } catch (error) {
      console.error('Failed to save sprints:', error);
      throw new Error('Failed to persist sprint data');
    }
  }

  async addSprint(sprint: SprintData): Promise<void> {
    sprint.updatedAt = new Date().toISOString();
    this.sprints.set(sprint.sprintNumber, sprint);
    await this.saveSprints();
  }

  getSprint(sprintNumber: number): SprintData | null {
    return this.sprints.get(sprintNumber) || null;
  }

  getAllSprints(): SprintData[] {
    return Array.from(this.sprints.values());
  }

  getActiveSprints(): SprintData[] {
    return this.getAllSprints().filter(sprint => sprint.status === 'active');
  }

  getNextSprintNumber(): number {
    const maxNumber = Math.max(0, ...Array.from(this.sprints.keys()));
    return maxNumber + 1;
  }

  updateSprintStatus(): void {
    const today = new Date();
    let updated = false;

    for (const sprint of this.sprints.values()) {
      const endDate = new Date(sprint.endDate);
      const startDate = new Date(sprint.startDate);
      
      let newStatus = sprint.status;
      
      if (today < startDate) {
        newStatus = 'planned';
      } else if (today >= startDate && today <= endDate) {
        newStatus = 'active';
      } else if (today > endDate && sprint.status !== 'completed') {
        newStatus = 'overdue';
      }
      
      if (newStatus !== sprint.status) {
        sprint.status = newStatus;
        sprint.updatedAt = new Date().toISOString();
        updated = true;
      }
    }

    if (updated) {
      this.saveSprints().catch(console.error);
    }
  }
}

class GitHubProjectManagerServer {
  private server: Server;
  private octokit: Octokit;
  private graphqlWithAuth: any;
  private owner: string;
  private repo: string;
  private sprintService: SprintService;

  constructor() {
    this.server = new Server(
      {
        name: 'github-project-manager',
        version: '3.2.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
      }
    );

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
    this.sprintService = new SprintService(this.owner, this.repo);

    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
  }

  private validateRepoConfig() {
    if (!this.owner || !this.repo) {
      throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
    }
  }

  private analyzeIssueComplexity(issue: any): number {
    let complexity = 1;
    
    const titleWords = issue.title.split(' ').length;
    if (titleWords > 10) complexity += 1;
    
    if (issue.body) {
      const bodyLength = issue.body.length;
      if (bodyLength > 1000) complexity += 2;
      else if (bodyLength > 500) complexity += 1;
      
      const technicalKeywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security'];
      const techCount = technicalKeywords.filter(keyword => 
        issue.body.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      complexity += Math.min(techCount, 3);
    }
    
    const complexityLabels = issue.labels?.filter((label: any) => 
      ['epic', 'large', 'complex', 'research', 'spike'].some(keyword => 
        label.name.toLowerCase().includes(keyword)
      )
    ) || [];
    complexity += complexityLabels.length;
    
    if (issue.body && issue.body.includes('#')) {
      complexity += 1;
    }
    
    return Math.min(complexity, 8);
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
    
    const isBug = (issue.labels || []).some((label: any) => 
      label.name.toLowerCase().includes('bug')
    );
    if (isBug) priority += 1;
    
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUpdate < 7) priority += 0.5;
    
    return Math.min(priority, 5);
  }

  /**
   * MODERN MCP SDK FEATURE: RESOURCE HANDLERS
   * Expose GitHub data as MCP resources for enhanced accessibility
   */
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
          const healthData = await this.getRepositoryHealthResource();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(healthData, null, 2)
            }]
          };
        }
        
        if (uri === 'github://issues/backlog') {
          const backlogData = await this.getIssuesBacklogResource();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(backlogData, null, 2)
            }]
          };
        }
        
        if (uri === 'github://milestones/upcoming') {
          const milestonesData = await this.getUpcomingMilestonesResource();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(milestonesData, null, 2)
            }]
          };
        }
        
        if (uri === 'github://team/performance') {
          const teamData = await this.getTeamPerformanceResource();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(teamData, null, 2)
            }]
          };
        }
        
        if (uri === 'github://sprints/active/metrics') {
          const sprintData = await this.getActiveSprintMetricsResource();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(sprintData, null, 2)
            }]
          };
        }
        
        if (uri === 'github://projects/overview') {
          const projectsData = await this.getProjectsOverviewResource();
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(projectsData, null, 2)
            }]
          };
        }
        
        if (uri.startsWith('github://sprints/') && uri.includes('/metrics')) {
          const match = uri.match(/github:\/\/sprints\/(\d+)\/metrics/);
          if (match) {
            const sprintNumber = parseInt(match[1]);
            const sprintMetricsData = await this.getSprintMetricsResource(sprintNumber);
            return {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(sprintMetricsData, null, 2)
              }]
            };
          }
        }
        
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(ErrorCode.InternalError, `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  /**
   * MODERN MCP SDK FEATURE: PROMPT TEMPLATE HANDLERS
   * Create intelligent prompt templates for common project management workflows
   */
  private setupPromptHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'sprint-planning',
            description: 'AI-guided sprint planning with intelligent issue selection and capacity management',
            arguments: [
              { name: 'sprintGoals', description: 'Array of sprint goals and objectives', required: true },
              { name: 'teamMembers', description: 'Array of team member GitHub usernames', required: true },
              { name: 'duration', description: 'Sprint duration in days (default: 14)', required: false }
            ]
          },
          {
            name: 'issue-analysis',
            description: 'Deep AI-powered analysis of GitHub issues for complexity, priority, and readiness',
            arguments: [
              { name: 'issueNumber', description: 'Issue number to analyze', required: true },
              { name: 'analysisType', description: 'Type of analysis: complexity, priority, readiness, dependencies', required: true }
            ]
          },
          {
            name: 'project-health-review',
            description: 'Comprehensive project health review with metrics and recommendations',
            arguments: [
              { name: 'timeframe', description: 'Review timeframe: week, month, quarter', required: true },
              { name: 'includeMetrics', description: 'Include detailed metrics and trends', required: false }
            ]
          },
          {
            name: 'roadmap-planning',
            description: 'Strategic roadmap creation with milestone and dependency analysis',
            arguments: [
              { name: 'timeHorizon', description: 'Planning horizon: quarterly, yearly', required: true },
              { name: 'focusAreas', description: 'Array of focus areas or themes', required: false }
            ]
          },
          {
            name: 'risk-assessment',
            description: 'Project risk evaluation with mitigation strategies',
            arguments: [
              { name: 'scope', description: 'Assessment scope: sprint, milestone, project', required: true },
              { name: 'riskTypes', description: 'Types of risks to assess', required: false }
            ]
          },
          {
            name: 'team-retrospective',
            description: 'Sprint retrospective guidance with team performance insights',
            arguments: [
              { name: 'sprintNumber', description: 'Sprint number for retrospective', required: true },
              { name: 'includeMetrics', description: 'Include performance metrics', required: false }
            ]
          }
        ]
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'sprint-planning':
            return await this.getSprintPlanningPrompt(args);
          case 'issue-analysis':
            return await this.getIssueAnalysisPrompt(args);
          case 'project-health-review':
            return await this.getProjectHealthReviewPrompt(args);
          case 'roadmap-planning':
            return await this.getRoadmapPlanningPrompt(args);
          case 'risk-assessment':
            return await this.getRiskAssessmentPrompt(args);
          case 'team-retrospective':
            return await this.getTeamRetrospectivePrompt(args);
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

  /**
   * RESOURCE DATA IMPLEMENTATIONS
   */
  private async getRepositoryHealthResource() {
    const issuesResponse = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: 100
    });

    const milestonesResponse = await this.octokit.rest.issues.listMilestones({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: 100
    });

    const issues = issuesResponse.data.filter(issue => !issue.pull_request);
    const openIssues = issues.filter(issue => issue.state === 'open');
    const closedIssues = issues.filter(issue => issue.state === 'closed');
    
    const totalComplexity = issues.reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
    const avgComplexity = issues.length > 0 ? totalComplexity / issues.length : 0;
    
    const unassignedIssues = openIssues.filter(issue => !issue.assignees || issue.assignees.length === 0);
    const overdueIssues = openIssues.filter(issue => 
      issue.milestone?.due_on && new Date(issue.milestone.due_on) < new Date()
    );

    return {
      repository: `${this.owner}/${this.repo}`,
      timestamp: new Date().toISOString(),
      health: {
        score: Math.max(0, 100 - (unassignedIssues.length * 2) - (overdueIssues.length * 5)),
        status: unassignedIssues.length > 10 || overdueIssues.length > 5 ? 'needs-attention' : 'healthy'
      },
      issues: {
        total: issues.length,
        open: openIssues.length,
        closed: closedIssues.length,
        unassigned: unassignedIssues.length,
        overdue: overdueIssues.length,
        avgComplexity: Math.round(avgComplexity * 10) / 10
      },
      milestones: {
        total: milestonesResponse.data.length,
        active: milestonesResponse.data.filter(m => m.state === 'open').length,
        overdue: milestonesResponse.data.filter(m => 
          m.state === 'open' && m.due_on && new Date(m.due_on) < new Date()
        ).length
      },
      sprints: {
        total: this.sprintService.getAllSprints().length,
        active: this.sprintService.getActiveSprints().length
      }
    };
  }

  private async getIssuesBacklogResource() {
    const response = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc',
      per_page: 100
    });

    const issues = response.data.filter(issue => !issue.pull_request);
    
    const prioritizedIssues = issues
      .map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        complexity: this.analyzeIssueComplexity(issue),
        priority: this.calculateIssuePriority(issue),
        assignees: issue.assignees?.map(a => a.login) || [],
        labels: issue.labels.map(l => l.name),
        milestone: issue.milestone?.title || null,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        url: issue.html_url
      }))
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.complexity - b.complexity;
      });

    const categories = {
      'High Priority': prioritizedIssues.filter(i => i.priority >= 4),
      'Medium Priority': prioritizedIssues.filter(i => i.priority === 3),
      'Low Priority': prioritizedIssues.filter(i => i.priority < 3),
      'Unassigned': prioritizedIssues.filter(i => i.assignees.length === 0),
      'Bugs': prioritizedIssues.filter(i => i.labels.some(l => l.toLowerCase().includes('bug'))),
      'Features': prioritizedIssues.filter(i => i.labels.some(l => l.toLowerCase().includes('feature')))
    };

    return {
      repository: `${this.owner}/${this.repo}`,
      timestamp: new Date().toISOString(),
      totalIssues: issues.length,
      categories,
      summary: {
        highPriority: categories['High Priority'].length,
        mediumPriority: categories['Medium Priority'].length,
        lowPriority: categories['Low Priority'].length,
        unassigned: categories['Unassigned'].length,
        avgComplexity: prioritizedIssues.length > 0 ? 
          prioritizedIssues.reduce((sum, i) => sum + i.complexity, 0) / prioritizedIssues.length : 0
      }
    };
  }

  private async getUpcomingMilestonesResource() {
    const response = await this.octokit.rest.issues.listMilestones({
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      sort: 'due_on',
      direction: 'asc',
      per_page: 50
    });

    const today = new Date();
    const milestones = response.data
      .filter(milestone => milestone.due_on)
      .map(milestone => {
        const dueDate = new Date(milestone.due_on!);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const progress = milestone.open_issues + milestone.closed_issues > 0 
          ? Math.round((milestone.closed_issues / (milestone.open_issues + milestone.closed_issues)) * 100)
          : 0;

        return {
          number: milestone.number,
          title: milestone.title,
          description: milestone.description,
          dueDate: milestone.due_on,
          daysUntilDue,
          progress,
          openIssues: milestone.open_issues,
          closedIssues: milestone.closed_issues,
          totalIssues: milestone.open_issues + milestone.closed_issues,
          status: daysUntilDue < 0 ? 'overdue' : daysUntilDue < 7 ? 'urgent' : 'upcoming',
          url: milestone.html_url
        };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    return {
      repository: `${this.owner}/${this.repo}`,
      timestamp: new Date().toISOString(),
      milestones,
      summary: {
        total: milestones.length,
        overdue: milestones.filter(m => m.status === 'overdue').length,
        urgent: milestones.filter(m => m.status === 'urgent').length,
        upcoming: milestones.filter(m => m.status === 'upcoming').length,
        avgProgress: milestones.length > 0 ? 
          milestones.reduce((sum, m) => sum + m.progress, 0) / milestones.length : 0
      }
    };
  }

  private async getTeamPerformanceResource() {
    const issuesResponse = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: 100
    });

    const issues = issuesResponse.data.filter(issue => !issue.pull_request);
    const teamPerformance: Record<string, any> = {};

    issues.forEach(issue => {
      if (issue.assignees) {
        issue.assignees.forEach((assignee: any) => {
          if (!teamPerformance[assignee.login]) {
            teamPerformance[assignee.login] = {
              username: assignee.login,
              avatar: assignee.avatar_url,
              assigned: 0,
              completed: 0,
              storyPoints: 0,
              completedStoryPoints: 0,
              avgComplexity: 0,
              issues: []
            };
          }

          const complexity = this.analyzeIssueComplexity(issue);
          teamPerformance[assignee.login].assigned++;
          teamPerformance[assignee.login].storyPoints += complexity;
          teamPerformance[assignee.login].issues.push({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            complexity
          });

          if (issue.state === 'closed') {
            teamPerformance[assignee.login].completed++;
            teamPerformance[assignee.login].completedStoryPoints += complexity;
          }
        });
      }
    });

    Object.values(teamPerformance).forEach((member: any) => {
      member.completionRate = member.assigned > 0 ? 
        Math.round((member.completed / member.assigned) * 100) : 0;
      member.avgComplexity = member.assigned > 0 ? 
        Math.round((member.storyPoints / member.assigned) * 10) / 10 : 0;
      member.velocity = member.completedStoryPoints;
    });

    return {
      repository: `${this.owner}/${this.repo}`,
      timestamp: new Date().toISOString(),
      teamMembers: Object.values(teamPerformance),
      summary: {
        totalMembers: Object.keys(teamPerformance).length,
        avgCompletionRate: Object.values(teamPerformance).length > 0 ?
          Object.values(teamPerformance).reduce((sum: number, member: any) => sum + member.completionRate, 0) / Object.values(teamPerformance).length : 0,
        totalVelocity: Object.values(teamPerformance).reduce((sum: number, member: any) => sum + member.velocity, 0)
      }
    };
  }

  private async getActiveSprintMetricsResource() {
    const activeSprints = this.sprintService.getActiveSprints();
    const sprintMetrics = [];

    for (const sprint of activeSprints) {
      const metrics = await this.calculateSprintMetrics(sprint);
      sprintMetrics.push({
        sprintNumber: sprint.sprintNumber,
        title: sprint.title,
        status: sprint.status,
        goals: sprint.goals,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        teamMembers: sprint.teamMembers,
        metrics
      });
    }

    return {
      repository: `${this.owner}/${this.repo}`,
      timestamp: new Date().toISOString(),
      activeSprints: sprintMetrics,
      summary: {
        totalActiveSprints: activeSprints.length,
        avgCompletionRate: sprintMetrics.length > 0 ?
          sprintMetrics.reduce((sum, s) => sum + s.metrics.completionRate, 0) / sprintMetrics.length : 0,
        totalStoryPoints: sprintMetrics.reduce((sum, s) => sum + s.metrics.storyPointsTotal, 0),
        completedStoryPoints: sprintMetrics.reduce((sum, s) => sum + s.metrics.storyPointsCompleted, 0)
      }
    };
  }

  private async getProjectsOverviewResource() {
    // Since GitHub Projects v2 requires GraphQL, we'll provide a simulated overview
    // based on milestones and sprints as project proxies
    const milestonesResponse = await this.octokit.rest.issues.listMilestones({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: 100
    });

    const sprints = this.sprintService.getAllSprints();
    const milestones = milestonesResponse.data;

    return {
      repository: `${this.owner}/${this.repo}`,
      timestamp: new Date().toISOString(),
      note: 'GitHub Projects v2 requires GraphQL access - showing milestone-based project overview',
      milestones: milestones.map(milestone => ({
        number: milestone.number,
        title: milestone.title,
        state: milestone.state,
        progress: milestone.open_issues + milestone.closed_issues > 0 ?
          Math.round((milestone.closed_issues / (milestone.open_issues + milestone.closed_issues)) * 100) : 0,
        totalIssues: milestone.open_issues + milestone.closed_issues,
        dueDate: milestone.due_on,
        url: milestone.html_url
      })),
      sprints: sprints.map(sprint => ({
        number: sprint.sprintNumber,
        title: sprint.title,
        status: sprint.status,
        goals: sprint.goals,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        issueCount: sprint.issues.length
      })),
      summary: {
        totalMilestones: milestones.length,
        activeMilestones: milestones.filter(m => m.state === 'open').length,
        totalSprints: sprints.length,
        activeSprints: sprints.filter(s => s.status === 'active').length
      }
    };
  }

  private async getSprintMetricsResource(sprintNumber: number) {
    const sprint = this.sprintService.getSprint(sprintNumber);
    if (!sprint) {
      throw new Error(`Sprint ${sprintNumber} not found`);
    }

    const metrics = await this.calculateSprintMetrics(sprint);
    
    return {
      repository: `${this.owner}/${this.repo}`,
      timestamp: new Date().toISOString(),
      sprint: {
        number: sprint.sprintNumber,
        title: sprint.title,
        status: sprint.status,
        goals: sprint.goals,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        teamMembers: sprint.teamMembers,
        capacity: sprint.capacity,
        velocity: sprint.velocity
      },
      metrics,
      insights: {
        velocityTrend: metrics.velocityTrend.length > 1 ? 
          metrics.velocityTrend[metrics.velocityTrend.length - 1] > metrics.velocityTrend[metrics.velocityTrend.length - 2] ? 'increasing' : 'decreasing' : 'stable',
        riskLevel: metrics.riskAssessment,
        recommendedActions: this.getSprintRecommendations(metrics)
      }
    };
  }

  private getSprintRecommendations(metrics: SprintMetrics): string[] {
    const recommendations = [];
    
    if (metrics.completionRate < 30 && metrics.daysRemaining < 3) {
      recommendations.push('Consider removing low-priority issues from sprint');
      recommendations.push('Focus team on critical path items');
    }
    
    if (metrics.riskAssessment === 'high') {
      recommendations.push('Schedule daily standups to address blockers');
      recommendations.push('Consider pair programming on complex issues');
    }
    
    if (metrics.teamPerformance.some(tp => tp.completed === 0)) {
      recommendations.push('Check in with team members who haven\'t completed any issues');
    }
    
    if (metrics.averageIssueComplexity > 5) {
      recommendations.push('Break down complex issues into smaller tasks');
    }
    
    return recommendations;
  }

  private async calculateSprintMetrics(sprint: SprintData): Promise<SprintMetrics> {
    let issuesCompleted = 0;
    let storyPointsCompleted = 0;
    let storyPointsTotal = 0;
    const teamPerformance: { member: string; completed: number; assigned: number; storyPoints: number }[] = [];

    for (const issueNumber of sprint.issues) {
      try {
        const response = await this.octokit.rest.issues.get({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber
        });
        
        const issue = response.data;
        const complexity = this.analyzeIssueComplexity(issue);
        storyPointsTotal += complexity;
        
        if (issue.state === 'closed') {
          issuesCompleted++;
          storyPointsCompleted += complexity;
        }

        if (issue.assignees) {
          issue.assignees.forEach((assignee: any) => {
            let memberPerf = teamPerformance.find(tp => tp.member === assignee.login);
            if (!memberPerf) {
              memberPerf = { member: assignee.login, completed: 0, assigned: 0, storyPoints: 0 };
              teamPerformance.push(memberPerf);
            }
            memberPerf.assigned++;
            memberPerf.storyPoints += complexity;
            if (issue.state === 'closed') {
              memberPerf.completed++;
            }
          });
        }
      } catch (error) {
        storyPointsTotal += 3;
      }
    }

    const completionRate = storyPointsTotal > 0 ? Math.round((storyPointsCompleted / storyPointsTotal) * 100) : 0;
    const averageIssueComplexity = sprint.issues.length > 0 ? storyPointsTotal / sprint.issues.length : 0;
    
    const today = new Date();
    const endDate = new Date(sprint.endDate);
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    
    let riskAssessment: 'low' | 'medium' | 'high' = 'low';
    if (completionRate < 30 && daysRemaining < 3) {
      riskAssessment = 'high';
    } else if (completionRate < 60 && daysRemaining < 5) {
      riskAssessment = 'medium';
    }

    let forecastedCompletion = '';
    if (completionRate > 0 && daysRemaining > 0) {
      const sprintDays = Math.ceil((today.getTime() - new Date(sprint.startDate).getTime()) / (1000 * 60 * 60 * 24));
      const dailyVelocity = storyPointsCompleted / Math.max(1, sprintDays);
      const remainingPoints = storyPointsTotal - storyPointsCompleted;
      const daysToComplete = remainingPoints / Math.max(1, dailyVelocity);
      
      if (daysToComplete <= daysRemaining) {
        forecastedCompletion = `On track - ${Math.ceil(daysToComplete)} days`;
      } else {
        forecastedCompletion = `At risk - needs ${Math.ceil(daysToComplete)} days`;
      }
    }

    const burndownData: { date: string; remaining: number; completed: number }[] = [];
    const sprintStartDate = new Date(sprint.startDate);
    const sprintDays = Math.ceil((endDate.getTime() - sprintStartDate.getTime()) / (1000 * 60 * 60 * 24));
    
    for (let day = 0; day <= Math.min(sprintDays, 14); day++) {
      const date = new Date(sprintStartDate.getTime() + (day * 24 * 60 * 60 * 1000));
      const progress = day / sprintDays;
      const completed = Math.floor(storyPointsCompleted * progress);
      const remaining = storyPointsTotal - completed;
      
      burndownData.push({
        date: date.toISOString().split('T')[0],
        remaining: Math.max(0, remaining),
        completed
      });
    }

    const velocityTrend = burndownData.map((data, index) => 
      index > 0 ? data.completed - burndownData[index - 1].completed : data.completed
    );

    return {
      burndownData,
      velocityTrend,
      completionRate,
      averageIssueComplexity,
      teamPerformance,
      riskAssessment,
      forecastedCompletion,
      daysRemaining,
      issuesCompleted,
      issuesTotal: sprint.issues.length,
      storyPointsCompleted,
      storyPointsTotal
    };
  }

  /**
   * PROMPT TEMPLATE IMPLEMENTATIONS
   */
  private async getSprintPlanningPrompt(args: any) {
    const sprintGoals = args?.sprintGoals || [];
    const teamMembers = args?.teamMembers || [];
    const duration = args?.duration || 14;

    // Get current backlog and team performance data
    const backlogData = await this.getIssuesBacklogResource();
    const teamData = await this.getTeamPerformanceResource();

    const promptText = `# Sprint Planning Assistant

## Sprint Configuration
- **Duration:** ${duration} days
- **Team Members:** ${teamMembers.join(', ')}
- **Sprint Goals:**
${sprintGoals.map((goal: string) => `  • ${goal}`).join('\n')}

## Current Repository State
- **Open Issues:** ${backlogData.totalIssues}
- **High Priority Issues:** ${backlogData.summary.highPriority}
- **Unassigned Issues:** ${backlogData.summary.unassigned}
- **Team Velocity:** ${teamData.summary.totalVelocity} story points

## Planning Guidance Needed

Please analyze the repository backlog and provide:

1. **Issue Recommendations**
   - Which specific issues should be included in this sprint?
   - What is the recommended priority order?
   - Are there any dependencies that need consideration?

2. **Capacity Planning**
   - What is the realistic story point capacity for this team?
   - How should work be distributed among team members?
   - Are there any potential capacity constraints?

3. **Risk Assessment**
   - What are the main risks for this sprint?
   - Which issues might be blocking or complex?
   - What mitigation strategies should be considered?

4. **Success Metrics**
   - What specific metrics should be tracked?
   - How will sprint goals be measured?
   - What would constitute a successful sprint completion?

Use the repository data above to provide specific, actionable recommendations for sprint planning.`;

    return {
      description: `AI-guided sprint planning for ${duration}-day sprint with ${teamMembers.length} team members`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText
          }
        }
      ]
    };
  }

  private async getIssueAnalysisPrompt(args: any) {
    const issueNumber = args?.issueNumber;
    const analysisType = args?.analysisType || 'complexity';

    if (!issueNumber) {
      throw new Error('issueNumber is required for issue analysis');
    }

    // Get the specific issue
    const issueResponse = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    const issue = issueResponse.data;
    const complexity = this.analyzeIssueComplexity(issue);
    const priority = this.calculateIssuePriority(issue);

    const promptText = `# Issue Analysis: #${issue.number}

## Issue Details
- **Title:** ${issue.title}
- **State:** ${issue.state}
- **Created:** ${new Date(issue.created_at).toLocaleDateString()}
- **Updated:** ${new Date(issue.updated_at).toLocaleDateString()}
- **Author:** ${issue.user?.login}
- **Assignees:** ${issue.assignees?.map(a => a.login).join(', ') || 'None'}
- **Labels:** ${issue.labels.map(l => l.name).join(', ') || 'None'}
- **Milestone:** ${issue.milestone?.title || 'None'}

## Current Analysis
- **Calculated Complexity:** ${complexity} story points
- **Calculated Priority:** ${priority}/5
- **Comments:** ${issue.comments}

## Issue Description
${issue.body || 'No description provided'}

## Analysis Request: ${analysisType.toUpperCase()}

Please provide a detailed ${analysisType} analysis for this issue including:

1. **${analysisType.charAt(0).toUpperCase() + analysisType.slice(1)} Assessment**
   - Detailed evaluation based on the issue content
   - Specific factors contributing to the assessment
   - Comparison with similar issues in the repository

2. **Recommendations**
   - Specific actions to take based on this analysis
   - Timeline and resource requirements
   - Risk factors and mitigation strategies

3. **Implementation Guidance**
   - Breaking down the work into manageable tasks
   - Technical considerations and dependencies
   - Testing and validation requirements

4. **Success Criteria**
   - How to measure completion of this issue
   - Quality gates and acceptance criteria
   - Performance and security considerations

Provide specific, actionable insights based on the issue content and repository context.`;

    return {
      description: `${analysisType} analysis for issue #${issueNumber}: ${issue.title}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText
          }
        }
      ]
    };
  }

  private async getProjectHealthReviewPrompt(args: any) {
    const timeframe = args?.timeframe || 'month';
    const includeMetrics = args?.includeMetrics !== false;

    const healthData = await this.getRepositoryHealthResource();
    const teamData = await this.getTeamPerformanceResource();
    const milestonesData = await this.getUpcomingMilestonesResource();

    const promptText = `# Project Health Review - ${timeframe.toUpperCase()}

## Repository Overview
- **Repository:** ${this.owner}/${this.repo}
- **Health Score:** ${healthData.health.score}/100
- **Status:** ${healthData.health.status}

## Current Metrics
${includeMetrics ? `
### Issues
- **Total Issues:** ${healthData.issues.total}
- **Open:** ${healthData.issues.open}
- **Closed:** ${healthData.issues.closed}  
- **Unassigned:** ${healthData.issues.unassigned}
- **Overdue:** ${healthData.issues.overdue}
- **Average Complexity:** ${healthData.issues.avgComplexity}

### Milestones
- **Total:** ${healthData.milestones.total}
- **Active:** ${healthData.milestones.active}
- **Overdue:** ${healthData.milestones.overdue}

### Team Performance
- **Team Members:** ${teamData.summary.totalMembers}
- **Average Completion Rate:** ${Math.round(teamData.summary.avgCompletionRate)}%
- **Total Velocity:** ${teamData.summary.totalVelocity} story points

### Upcoming Milestones
- **Total:** ${milestonesData.summary.total}
- **Overdue:** ${milestonesData.summary.overdue}
- **Urgent (< 7 days):** ${milestonesData.summary.urgent}
- **Average Progress:** ${Math.round(milestonesData.summary.avgProgress)}%
` : ''}

## Review Request

Please provide a comprehensive ${timeframe}ly project health review including:

1. **Overall Assessment**
   - Current project health and trajectory
   - Key achievements and progress made
   - Major challenges and bottlenecks identified

2. **Performance Analysis**
   - Team productivity and velocity trends
   - Issue resolution patterns and cycles
   - Milestone completion effectiveness

3. **Risk Identification**
   - Current and emerging project risks
   - Resource allocation concerns
   - Timeline and delivery risks

4. **Strategic Recommendations**
   - Immediate actions needed (next 1-2 weeks)
   - Medium-term improvements (next month)
   - Long-term strategic adjustments

5. **Process Improvements**
   - Workflow optimization opportunities
   - Team collaboration enhancements
   - Quality assurance improvements

6. **Success Metrics Tracking**
   - Key Performance Indicators to monitor
   - Success criteria for next ${timeframe}
   - Measurement and reporting recommendations

Provide specific, data-driven insights and actionable recommendations for improving project health and delivery success.`;

    return {
      description: `${timeframe}ly project health review for ${this.owner}/${this.repo}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText
          }
        }
      ]
    };
  }

  private async getRoadmapPlanningPrompt(args: any) {
    const timeHorizon = args?.timeHorizon || 'quarterly';
    const focusAreas = args?.focusAreas || [];

    const milestonesData = await this.getUpcomingMilestonesResource();
    const healthData = await this.getRepositoryHealthResource();
    const sprintsData = this.sprintService.getAllSprints();

    const promptText = `# Strategic Roadmap Planning - ${timeHorizon.toUpperCase()}

## Current Project State
- **Repository:** ${this.owner}/${this.repo}
- **Active Milestones:** ${healthData.milestones.active}
- **Total Sprints:** ${sprintsData.length}
- **Active Sprints:** ${sprintsData.filter(s => s.status === 'active').length}

## Focus Areas
${focusAreas.length > 0 ? focusAreas.map((area: string) => `- ${area}`).join('\n') : '- No specific focus areas defined'}

## Upcoming Milestones
${milestonesData.milestones.slice(0, 10).map(m => 
  `- **${m.title}** (Due: ${new Date(m.dueDate).toLocaleDateString()}) - ${m.progress}% complete`
).join('\n')}

## Current Challenges
- **Overdue Issues:** ${healthData.issues.overdue}
- **Unassigned Issues:** ${healthData.issues.unassigned}
- **Health Score:** ${healthData.health.score}/100

## Roadmap Planning Request

Please create a strategic ${timeHorizon} roadmap that includes:

1. **Vision and Objectives**
   - Clear strategic vision for the ${timeHorizon}
   - Specific, measurable objectives
   - Alignment with focus areas and current project state

2. **Timeline and Milestones**
   - Recommended milestone structure and timeline
   - Dependencies between major deliverables
   - Critical path analysis and risk mitigation

3. **Resource Planning**
   - Team capacity and skill requirements
   - Technology and infrastructure needs
   - Budget and timeline considerations

4. **Priority Framework**
   - Criteria for prioritizing features and initiatives
   - Trade-off decisions and rationale
   - Stakeholder alignment strategies

5. **Risk Management**
   - Potential roadmap risks and dependencies
   - Contingency planning for delays or changes
   - Success metrics and milestone gates

6. **Execution Strategy**
   - Sprint and release planning approach
   - Team organization and responsibilities
   - Communication and stakeholder management

Provide a comprehensive, actionable roadmap that balances ambition with realistic delivery capabilities.`;

    return {
      description: `Strategic ${timeHorizon} roadmap planning for ${this.owner}/${this.repo}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText
          }
        }
      ]
    };
  }

  private async getRiskAssessmentPrompt(args: any) {
    const scope = args?.scope || 'project';
    const riskTypes = args?.riskTypes || ['technical', 'timeline', 'resource', 'quality'];

    const healthData = await this.getRepositoryHealthResource();
    const milestonesData = await this.getUpcomingMilestonesResource();
    const activeSprints = this.sprintService.getActiveSprints();

    const promptText = `# Risk Assessment - ${scope.toUpperCase()} SCOPE

## Current Project Context
- **Repository:** ${this.owner}/${this.repo}
- **Health Score:** ${healthData.health.score}/100 (${healthData.health.status})
- **Open Issues:** ${healthData.issues.open}
- **Overdue Issues:** ${healthData.issues.overdue}
- **Active Milestones:** ${healthData.milestones.active}
- **Overdue Milestones:** ${healthData.milestones.overdue}
- **Active Sprints:** ${activeSprints.length}

## Risk Categories to Assess
${Array.isArray(riskTypes) ? riskTypes.map((type: string) => `- ${type.charAt(0).toUpperCase() + type.slice(1)} risks`).join('\n') : '- All risk categories'}

## Current Risk Indicators
- **Unassigned Issues:** ${healthData.issues.unassigned} (potential resource risk)
- **Overdue Items:** ${healthData.issues.overdue + healthData.milestones.overdue} (timeline risk)
- **Average Issue Complexity:** ${healthData.issues.avgComplexity} (technical risk)

## Risk Assessment Request

Please provide a comprehensive risk assessment for the ${scope} including:

1. **Risk Identification**
   - Specific risks identified within each category
   - Current risk indicators and warning signs
   - Potential impact assessment for each risk

2. **Risk Analysis**
   - Probability and impact matrix for identified risks
   - Dependencies and cascading risk effects
   - Timeline and criticality assessment

3. **Risk Prioritization**
   - High, medium, and low priority risk ranking
   - Immediate attention requirements
   - Long-term monitoring needs

4. **Mitigation Strategies**
   - Specific mitigation actions for each priority risk
   - Resource requirements and timeline for implementation
   - Preventive measures and early warning systems

5. **Contingency Planning**
   - Fallback options for high-priority risks
   - Alternative approaches and workarounds
   - Emergency response procedures

6. **Monitoring and Review**
   - Key risk indicators to track
   - Review frequency and escalation triggers
   - Risk communication and reporting framework

Focus on actionable insights and practical mitigation strategies that can be implemented immediately.`;

    return {
      description: `Risk assessment for ${scope} scope in ${this.owner}/${this.repo}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText
          }
        }
      ]
    };
  }

  private async getTeamRetrospectivePrompt(args: any) {
    const sprintNumber = args?.sprintNumber;
    const includeMetrics = args?.includeMetrics !== false;

    if (!sprintNumber) {
      throw new Error('sprintNumber is required for team retrospective');
    }

    const sprint = this.sprintService.getSprint(sprintNumber);
    if (!sprint) {
      throw new Error(`Sprint ${sprintNumber} not found`);
    }

    let sprintMetrics = null;
    if (includeMetrics) {
      try {
        sprintMetrics = await this.calculateSprintMetrics(sprint);
      } catch (error) {
        console.error('Failed to calculate sprint metrics:', error);
      }
    }

    const promptText = `# Team Retrospective - Sprint ${sprint.sprintNumber}

## Sprint Overview
- **Title:** ${sprint.title}
- **Duration:** ${sprint.startDate} to ${sprint.endDate}
- **Status:** ${sprint.status}
- **Team Members:** ${sprint.teamMembers.join(', ')}

## Sprint Goals
${sprint.goals.map((goal: string) => `- ${goal}`).join('\n')}

${sprintMetrics ? `
## Sprint Metrics
- **Completion Rate:** ${sprintMetrics.completionRate}%
- **Issues Completed:** ${sprintMetrics.issuesCompleted}/${sprintMetrics.issuesTotal}
- **Story Points:** ${sprintMetrics.storyPointsCompleted}/${sprintMetrics.storyPointsTotal}
- **Risk Assessment:** ${sprintMetrics.riskAssessment}
- **Average Issue Complexity:** ${Math.round(sprintMetrics.averageIssueComplexity * 10) / 10}

## Team Performance
${sprintMetrics.teamPerformance.map(tp => 
  `- **${tp.member}:** ${tp.completed}/${tp.assigned} issues (${tp.storyPoints} story points)`
).join('\n')}

## Velocity Trend
- **Forecasted Completion:** ${sprintMetrics.forecastedCompletion}
- **Days Remaining:** ${sprintMetrics.daysRemaining}
` : ''}

## Retrospective Guidance Request

Please facilitate a comprehensive sprint retrospective covering:

1. **What Went Well** 🎉
   - Achievements and successes during the sprint
   - Effective processes and team collaboration
   - Technical wins and learning opportunities

2. **What Could Be Improved** 🔧
   - Challenges and bottlenecks encountered
   - Process inefficiencies and workflow issues
   - Communication and coordination gaps

3. **Sprint Goal Analysis** 🎯
   - Assessment of sprint goal achievement
   - Alignment between planned and actual work
   - Impact of scope changes and discoveries

4. **Team Performance Insights** 👥
   - Individual and collective performance patterns
   - Workload distribution and capacity utilization
   - Skill development and knowledge sharing

5. **Process Optimization** ⚡
   - Workflow and methodology improvements
   - Tool and technology enhancement opportunities
   - Meeting and communication effectiveness

6. **Action Items for Next Sprint** 📋
   - Specific, actionable improvements to implement
   - Process changes and experiment suggestions
   - Team development and skill building priorities

7. **Metrics and Measurement** 📊
   - Key indicators for sprint success
   - Areas where better measurement is needed
   - Success criteria for upcoming sprints

Please provide structured questions and discussion points to help the team reflect effectively and identify concrete improvements for future sprints.`;

    return {
      description: `Team retrospective for Sprint ${sprintNumber}: ${sprint.title}`,
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: promptText
          }
        }
      ]
    };
  }

  /**
   * BASIC TOOL HANDLERS (Placeholder implementations)
   */
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_issue',
            description: 'Create a new GitHub issue',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Issue title' },
                body: { type: 'string', description: 'Issue description' },
                labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
                assignees: { type: 'array', items: { type: 'string' }, description: 'Issue assignees' }
              },
              required: ['title']
            }
          },
          {
            name: 'list_labels',
            description: 'List all repository labels',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        this.validateRepoConfig();
        
        switch (name) {
          case 'create_issue':
            const response = await this.octokit.rest.issues.create({
              owner: this.owner,
              repo: this.repo,
              title: args.title,
              body: args.body,
              labels: args.labels,
              assignees: args.assignees
            });
            return {
              content: [{
                type: "text",
                text: `✅ Issue created: #${response.data.number} - ${response.data.title}\nURL: ${response.data.html_url}`
              }]
            };
            
          case 'list_labels':
            const labelsResponse = await this.octokit.rest.issues.listLabelsForRepo({
              owner: this.owner,
              repo: this.repo
            });
            return {
              content: [{
                type: "text",
                text: `🏷️ Repository Labels (${labelsResponse.data.length}):\n\n${labelsResponse.data.map(label => 
                  `• ${label.name} (#${label.color}) - ${label.description || 'No description'}`
                ).join('\n')}`
              }]
            };
            
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🚀 GitHub Project Manager v3.2.0 - Modern MCP SDK Features");
    console.error(`📁 Repository: ${this.owner}/${this.repo}`);
    console.error("🔗 NEW: 6 Resources for live GitHub data access");
    console.error("🤖 NEW: 6 Prompt Templates for AI-guided workflows");
    console.error("🛠️  Tools: Enhanced with modern MCP capabilities");
    console.error("✨ Phase 2.3: Resources & Prompts Integration Complete!");
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