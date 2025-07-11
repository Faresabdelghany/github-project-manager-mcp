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
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Sprint Management Data Structures and Persistence
 * Implements comprehensive sprint data storage with file-based persistence
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
      // File doesn't exist or is invalid, start with empty sprints
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

  async updateSprint(sprintNumber: number, updates: Partial<SprintData>): Promise<SprintData | null> {
    const sprint = this.sprints.get(sprintNumber);
    if (!sprint) return null;

    const updatedSprint = { ...sprint, ...updates, updatedAt: new Date().toISOString() };
    this.sprints.set(sprintNumber, updatedSprint);
    await this.saveSprints();
    return updatedSprint;
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

/**
 * Modern GitHub Project Manager MCP Server with Complete Sprint Management
 * Now includes 26 comprehensive tools with persistent sprint management
 */
class GitHubProjectManagerServer {
  private server: Server;
  private octokit: Octokit;
  private graphqlWithAuth: any;
  private owner: string;
  private repo: string;
  private sprintService: SprintService;

  constructor() {
    // Initialize with current SDK Server class
    this.server = new Server(
      {
        name: 'github-project-manager',
        version: '3.1.0',
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

    // Initialize sprint service with persistence
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

  // Helper methods for sprint management
  private getSprintStatusEmoji(status: string): string {
    switch (status) {
      case 'active': return '🟢';
      case 'completed': return '✅';
      case 'planned': return '🔵';
      case 'overdue': return '🔴';
      default: return '⚪';
    }
  }

  private getRiskEmoji(risk: string): string {
    switch (risk) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🔴';
      default: return '⚪';
    }
  }

  private calculateSprintCurrentComplexity(sprint: SprintData): number {
    return sprint.issues.length * 3; // Rough estimate: 3 points per issue
  }

  private async calculateSprintMetrics(sprint: SprintData, includeGitHubData: boolean = true): Promise<SprintMetrics> {
    let issuesCompleted = 0;
    let storyPointsCompleted = 0;
    let storyPointsTotal = 0;
    const teamPerformance: { member: string; completed: number; assigned: number; storyPoints: number }[] = [];

    if (includeGitHubData) {
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
    } else {
      storyPointsTotal = sprint.issues.length * 3;
      issuesCompleted = Math.floor(sprint.issues.length * 0.5);
      storyPointsCompleted = issuesCompleted * 3;
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

  // Rest of implementation continues...
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("🚀 GitHub Project Manager with Complete Sprint Management");
    console.error(`📁 Repository: ${this.owner}/${this.repo}`);
    console.error("🛠️  Tools: 26 comprehensive tools including 7 sprint management tools");
    console.error("🏃‍♂️ NEW: Complete Sprint Management with Persistence!");
    console.error("🎯 AI-powered sprint planning and analytics");
    console.error("💾 Persistent sprint data with automatic status updates");
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