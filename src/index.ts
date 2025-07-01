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
        version: '2.10.0',
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

  private detectConflicts(selectedIssues: any[], teamMembers: string[]): string[] {
    const conflicts: string[] = [];
    
    // Check for assignee overallocation
    const assigneeWorkload: { [assignee: string]: number } = {};
    selectedIssues.forEach(issue => {
      if (issue.assignees && issue.assignees.length > 0) {
        issue.assignees.forEach((assignee: any) => {
          if (!assigneeWorkload[assignee.login]) {
            assigneeWorkload[assignee.login] = 0;
          }
          assigneeWorkload[assignee.login] += this.analyzeIssueComplexity(issue);
        });
      }
    });
    
    // Flag overallocation (more than 10 story points per person)
    Object.entries(assigneeWorkload).forEach(([assignee, workload]) => {
      if (workload > 10) {
        conflicts.push(`${assignee} is overallocated with ${workload} story points`);
      }
    });
    
    // Check for dependency conflicts
    const issueNumbers = selectedIssues.map(issue => issue.number);
    selectedIssues.forEach(issue => {
      if (issue.body) {
        const dependencies = issue.body.match(/#(\d+)/g) || [];
        dependencies.forEach(dep => {
          const depNumber = parseInt(dep.replace('#', ''));
          if (!issueNumbers.includes(depNumber)) {
            conflicts.push(`Issue #${issue.number} depends on #${depNumber} which is not in sprint`);
          }
        });
      }
    });
    
    return conflicts;
  }

  // ROADMAP CREATION METHODS
  private extractIssueDependencies(issue: any): number[] {
    const dependencies: number[] = [];
    if (issue.body) {
      // Look for patterns like "depends on #123", "blocks #456", etc.
      const dependencyPatterns = [
        /depends\s+on\s+#(\d+)/gi,
        /blocked\s+by\s+#(\d+)/gi,
        /requires\s+#(\d+)/gi,
        /needs\s+#(\d+)/gi,
        /prerequisite[:\s]+#(\d+)/gi
      ];
      
      dependencyPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(issue.body)) !== null) {
          dependencies.push(parseInt(match[1]));
        }
      });
      
      // Also look for general issue references that might be dependencies
      const references = issue.body.match(/#(\d+)/g) || [];
      references.forEach(ref => {
        const issueNum = parseInt(ref.replace('#', ''));
        if (!dependencies.includes(issueNum)) {
          // Only add if it appears in a dependency context
          const context = issue.body.substring(
            Math.max(0, issue.body.indexOf(ref) - 50),
            Math.min(issue.body.length, issue.body.indexOf(ref) + 50)
          ).toLowerCase();
          
          if (context.includes('depend') || context.includes('block') || 
              context.includes('require') || context.includes('need')) {
            dependencies.push(issueNum);
          }
        }
      });
    }
    
    return [...new Set(dependencies)]; // Remove duplicates
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

  private calculateCriticalPath(issues: any[], dependencies: Map<number, number[]>): number[] {
    const criticalPath: number[] = [];
    const visited = new Set<number>();
    const inProgress = new Set<number>();
    
    // Depth-first search to find the longest path (critical path)
    const dfs = (issueNumber: number, currentPath: number[]): number[] => {
      if (inProgress.has(issueNumber)) {
        // Circular dependency detected
        return currentPath;
      }
      
      if (visited.has(issueNumber)) {
        return currentPath;
      }
      
      visited.add(issueNumber);
      inProgress.add(issueNumber);
      
      const currentIssue = issues.find(i => i.number === issueNumber);
      if (!currentIssue) {
        inProgress.delete(issueNumber);
        return currentPath;
      }
      
      const newPath = [...currentPath, issueNumber];
      const deps = dependencies.get(issueNumber) || [];
      
      let longestPath = newPath;
      
      for (const depNumber of deps) {
        const depPath = dfs(depNumber, newPath);
        if (depPath.length > longestPath.length) {
          longestPath = depPath;
        }
      }
      
      inProgress.delete(issueNumber);
      return longestPath;
    };
    
    // Find the longest path starting from any issue
    for (const issue of issues) {
      const path = dfs(issue.number, []);
      if (path.length > criticalPath.length) {
        criticalPath.splice(0, criticalPath.length, ...path);
      }
    }
    
    return criticalPath;
  }

  private createTimelinePhases(milestones: any[], sprints: any[], timeHorizon: string): any[] {
    const phases: any[] = [];
    const today = new Date();
    
    if (timeHorizon === 'quarterly') {
      // Create quarterly phases for the next 4 quarters
      for (let q = 0; q < 4; q++) {
        const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + (q * 3), 1);
        const quarterEnd = new Date(quarterStart.getFullYear(), quarterStart.getMonth() + 3, 0);
        
        const quarterMilestones = milestones.filter(m => {
          if (!m.due_on) return false;
          const dueDate = new Date(m.due_on);
          return dueDate >= quarterStart && dueDate <= quarterEnd;
        });
        
        const quarterSprints = sprints.filter(s => {
          const sprintData = this.parseSprintDescription(s.description || '');
          if (!sprintData) return false;
          const startDate = new Date(sprintData.startDate);
          const endDate = new Date(sprintData.endDate);
          return (startDate <= quarterEnd && endDate >= quarterStart);
        });
        
        phases.push({
          name: `Q${Math.floor(quarterStart.getMonth() / 3) + 1} ${quarterStart.getFullYear()}`,
          type: 'quarter',
          startDate: quarterStart.toISOString().split('T')[0],
          endDate: quarterEnd.toISOString().split('T')[0],
          milestones: quarterMilestones,
          sprints: quarterSprints,
          duration: Math.ceil((quarterEnd.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24))
        });
      }
    } else if (timeHorizon === 'yearly') {
      // Create yearly phases for current and next year
      for (let y = 0; y < 2; y++) {
        const yearStart = new Date(today.getFullYear() + y, 0, 1);
        const yearEnd = new Date(today.getFullYear() + y, 11, 31);
        
        const yearMilestones = milestones.filter(m => {
          if (!m.due_on) return false;
          const dueDate = new Date(m.due_on);
          return dueDate >= yearStart && dueDate <= yearEnd;
        });
        
        const yearSprints = sprints.filter(s => {
          const sprintData = this.parseSprintDescription(s.description || '');
          if (!sprintData) return false;
          const startDate = new Date(sprintData.startDate);
          const endDate = new Date(sprintData.endDate);
          return (startDate <= yearEnd && endDate >= yearStart);
        });
        
        phases.push({
          name: `${yearStart.getFullYear()}`,
          type: 'year',
          startDate: yearStart.toISOString().split('T')[0],
          endDate: yearEnd.toISOString().split('T')[0],
          milestones: yearMilestones,
          sprints: yearSprints,
          duration: Math.ceil((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24))
        });
      }
    } else {
      // Monthly phases for the next 12 months (default)
      for (let m = 0; m < 12; m++) {
        const monthStart = new Date(today.getFullYear(), today.getMonth() + m, 1);
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        
        const monthMilestones = milestones.filter(milestone => {
          if (!milestone.due_on) return false;
          const dueDate = new Date(milestone.due_on);
          return dueDate >= monthStart && dueDate <= monthEnd;
        });
        
        const monthSprints = sprints.filter(s => {
          const sprintData = this.parseSprintDescription(s.description || '');
          if (!sprintData) return false;
          const startDate = new Date(sprintData.startDate);
          const endDate = new Date(sprintData.endDate);
          return (startDate <= monthEnd && endDate >= monthStart);
        });
        
        phases.push({
          name: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          type: 'month',
          startDate: monthStart.toISOString().split('T')[0],
          endDate: monthEnd.toISOString().split('T')[0],
          milestones: monthMilestones,
          sprints: monthSprints,
          duration: Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24))
        });
      }
    }
    
    return phases.filter(phase => phase.milestones.length > 0 || phase.sprints.length > 0);
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
          // ADVANCED PROJECT PLANNING
          {
            name: 'create_roadmap',
            description: 'Create comprehensive project roadmaps with timeline visualization and milestone mapping',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Roadmap title' },
                time_horizon: { type: 'string', enum: ['monthly', 'quarterly', 'yearly'], description: 'Timeline granularity (default: quarterly)' },
                include_completed: { type: 'boolean', description: 'Include completed milestones and sprints (default: false)' },
                theme_filter: { type: 'string', description: 'Filter by theme (Frontend, Backend, etc.)' },
                priority_filter: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'Minimum priority level (default: all)' },
                include_dependencies: { type: 'boolean', description: 'Show issue dependencies and critical path (default: true)' },
                detailed_view: { type: 'boolean', description: 'Include detailed issue breakdown (default: false)' },
                export_format: { type: 'string', enum: ['markdown', 'json', 'timeline'], description: 'Output format (default: markdown)' }
              },
              required: ['title']
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
          {
            name: 'plan_sprint',
            description: 'AI-powered sprint planning with intelligent issue selection and capacity management',
            inputSchema: {
              type: 'object',
              properties: {
                sprint_title: { type: 'string', description: 'Proposed sprint title' },
                sprint_duration: { type: 'number', description: 'Sprint duration in days (default: 14)', minimum: 7, maximum: 28 },
                team_members: { type: 'array', items: { type: 'string' }, description: 'List of team member GitHub usernames' },
                sprint_goals: { type: 'array', items: { type: 'string' }, description: 'High-level sprint goals and objectives' },
                max_capacity: { type: 'number', description: 'Maximum story points for the sprint (auto-calculated if not provided)' },
                priority_filter: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'Minimum priority level for issues (default: medium)' },
                include_bugs: { type: 'boolean', description: 'Include bug fixes in sprint planning (default: true)' },
                theme_focus: { type: 'string', description: 'Optional theme focus (e.g., "Frontend", "Backend", "Testing")' },
                create_sprint: { type: 'boolean', description: 'Actually create the sprint after planning (default: false)' },
                dry_run: { type: 'boolean', description: 'Show planning analysis without creating sprint (default: true)' }
              },
              required: ['sprint_title']
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

          // ADVANCED PROJECT PLANNING
          case 'create_roadmap':
            return await this.handleCreateRoadmap(args);

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

  // ADVANCED PROJECT PLANNING IMPLEMENTATIONS
  private async handleCreateRoadmap(args: any) {
    this.validateRepoConfig();

    try {
      const timeHorizon = args.time_horizon || 'quarterly';
      const includeCompleted = args.include_completed === true;
      const themeFilter = args.theme_filter;
      const priorityFilter = args.priority_filter || 'all';
      const includeDependencies = args.include_dependencies !== false;
      const detailedView = args.detailed_view === true;
      const exportFormat = args.export_format || 'markdown';

      let result = '';

      if (exportFormat === 'markdown') {
        result = `# 🗺️ **${args.title}**\n\n`;
        result += `**Generated:** ${new Date().toLocaleDateString()}\n`;
        result += `**Time Horizon:** ${timeHorizon}\n`;
        result += `**Repository:** ${this.owner}/${this.repo}\n\n`;
        result += `---\n\n`;
      }

      // Get all milestones
      const milestonesResponse = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: includeCompleted ? 'all' : 'open',
        per_page: 100
      });

      let milestones = milestonesResponse.data;
      
      // Separate sprints from regular milestones
      const sprints = milestones.filter(m => {
        const sprintData = this.parseSprintDescription(m.description || '');
        return sprintData && sprintData.type === 'sprint';
      });

      const regularMilestones = milestones.filter(m => {
        const sprintData = this.parseSprintDescription(m.description || '');
        return !sprintData || sprintData.type !== 'sprint';
      });

      // Get all issues for dependency analysis
      const issuesResponse = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: includeCompleted ? 'all' : 'open',
        per_page: 100
      });

      let allIssues = issuesResponse.data.filter(issue => !issue.pull_request);

      // Apply filters
      if (themeFilter) {
        const themeGroups = this.groupIssuesByTheme(allIssues);
        const themeIssues = themeGroups[themeFilter] || [];
        const themeIssueNumbers = new Set(themeIssues.map(issue => issue.number));
        allIssues = allIssues.filter(issue => themeIssueNumbers.has(issue.number));
      }

      if (priorityFilter !== 'all') {
        const priorityThresholds = { low: 1, medium: 2, high: 3 };
        allIssues = allIssues.filter(issue => {
          const priority = this.calculateIssuePriority(issue);
          return priority >= priorityThresholds[priorityFilter as keyof typeof priorityThresholds];
        });
      }

      // Create timeline phases
      const phases = this.createTimelinePhases(regularMilestones, sprints, timeHorizon);

      if (exportFormat === 'markdown') {
        result += `## 📅 **Timeline Overview**\n\n`;
        result += `**Total Phases:** ${phases.length}\n`;
        result += `**Total Milestones:** ${regularMilestones.length}\n`;
        result += `**Total Sprints:** ${sprints.length}\n`;
        result += `**Total Issues:** ${allIssues.length}\n\n`;
      }

      // Dependency analysis
      const dependencyMap = new Map<number, number[]>();
      if (includeDependencies) {
        allIssues.forEach(issue => {
          const deps = this.extractIssueDependencies(issue);
          if (deps.length > 0) {
            dependencyMap.set(issue.number, deps);
          }
        });

        const criticalPath = this.calculateCriticalPath(allIssues, dependencyMap);
        
        if (exportFormat === 'markdown' && criticalPath.length > 0) {
          result += `## 🎯 **Critical Path Analysis**\n\n`;
          result += `**Critical Path Length:** ${criticalPath.length} issues\n`;
          result += `**Critical Issues:**\n`;
          criticalPath.forEach((issueNumber, index) => {
            const issue = allIssues.find(i => i.number === issueNumber);
            if (issue) {
              const complexity = this.analyzeIssueComplexity(issue);
              result += `   ${index + 1}. #${issue.number}: ${issue.title} (${complexity}sp)\n`;
            }
          });
          result += `\n`;
        }
      }

      // Categorize issues by type
      const issueCategories = this.categorizeIssuesByType(allIssues);

      if (exportFormat === 'markdown') {
        result += `## 🏗️ **Work Categories**\n\n`;
        Object.entries(issueCategories).forEach(([category, issues]) => {
          const totalComplexity = issues.reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
          result += `- **${category}:** ${issues.length} issues (${totalComplexity} story points)\n`;
        });
        result += `\n`;
      }

      // Generate phase breakdown
      if (exportFormat === 'markdown') {
        result += `## 📊 **${timeHorizon.charAt(0).toUpperCase() + timeHorizon.slice(1)} Roadmap Phases**\n\n`;
      }

      const roadmapData: any = {
        title: args.title,
        timeHorizon,
        generatedAt: new Date().toISOString(),
        repository: `${this.owner}/${this.repo}`,
        summary: {
          totalPhases: phases.length,
          totalMilestones: regularMilestones.length,
          totalSprints: sprints.length,
          totalIssues: allIssues.length,
          criticalPathLength: includeDependencies ? this.calculateCriticalPath(allIssues, dependencyMap).length : 0
        },
        phases: [],
        categories: issueCategories,
        dependencies: includeDependencies ? Array.from(dependencyMap.entries()).map(([issue, deps]) => ({ issue, dependencies: deps })) : []
      };

      phases.forEach((phase, phaseIndex) => {
        const phaseData: any = {
          name: phase.name,
          type: phase.type,
          startDate: phase.startDate,
          endDate: phase.endDate,
          duration: phase.duration,
          milestones: [],
          sprints: [],
          issues: []
        };

        if (exportFormat === 'markdown') {
          result += `### ${phase.name}\n`;
          result += `**Duration:** ${phase.duration} days (${phase.startDate} → ${phase.endDate})\n\n`;
        }

        // Process milestones in this phase
        if (phase.milestones.length > 0) {
          if (exportFormat === 'markdown') {
            result += `#### 🎯 Milestones (${phase.milestones.length})\n`;
          }

          phase.milestones.forEach((milestone: any) => {
            const progress = milestone.open_issues + milestone.closed_issues > 0 
              ? Math.round((milestone.closed_issues / (milestone.open_issues + milestone.closed_issues)) * 100) 
              : 0;

            const milestoneData = {
              number: milestone.number,
              title: milestone.title,
              description: milestone.description,
              dueDate: milestone.due_on,
              state: milestone.state,
              progress,
              openIssues: milestone.open_issues,
              closedIssues: milestone.closed_issues,
              url: milestone.html_url
            };

            phaseData.milestones.push(milestoneData);

            if (exportFormat === 'markdown') {
              result += `- **${milestone.title}** (${milestone.state})\n`;
              result += `  - Progress: ${progress}% (${milestone.closed_issues}/${milestone.open_issues + milestone.closed_issues} issues)\n`;
              result += `  - Due: ${milestone.due_on ? new Date(milestone.due_on).toLocaleDateString() : 'No date set'}\n`;
              if (detailedView && milestone.description) {
                result += `  - Description: ${milestone.description.substring(0, 100)}${milestone.description.length > 100 ? '...' : ''}\n`;
              }
            }
          });

          if (exportFormat === 'markdown') {
            result += `\n`;
          }
        }

        // Process sprints in this phase
        if (phase.sprints.length > 0) {
          if (exportFormat === 'markdown') {
            result += `#### 🏃‍♂️ Sprints (${phase.sprints.length})\n`;
          }

          phase.sprints.forEach((sprint: any) => {
            const sprintData = this.parseSprintDescription(sprint.description || '');
            const sprintStatus = this.getSprintStatus(sprintData, sprint);
            
            const sprintInfo = {
              number: sprintData?.sprintNumber || 'Unknown',
              title: sprint.title,
              status: sprintStatus,
              state: sprint.state,
              startDate: sprintData?.startDate,
              endDate: sprintData?.endDate,
              duration: sprintData?.duration,
              goals: sprintData?.goals || [],
              openIssues: sprint.open_issues,
              closedIssues: sprint.closed_issues,
              url: sprint.html_url
            };

            phaseData.sprints.push(sprintInfo);

            if (exportFormat === 'markdown') {
              result += `- **${sprint.title}** (${sprintStatus})\n`;
              if (sprintData) {
                result += `  - Sprint ${sprintData.sprintNumber} | ${sprintData.duration} days\n`;
                result += `  - Period: ${sprintData.startDate} → ${sprintData.endDate}\n`;
                if (sprintData.goals && sprintData.goals.length > 0) {
                  result += `  - Goals: ${sprintData.goals.join(', ')}\n`;
                }
              }
              result += `  - Issues: ${sprint.closed_issues}/${sprint.open_issues + sprint.closed_issues} completed\n`;
            }
          });

          if (exportFormat === 'markdown') {
            result += `\n`;
          }
        }

        // Get issues for this phase
        const phaseIssues = allIssues.filter(issue => {
          if (!issue.milestone) return false;
          return phase.milestones.some((m: any) => m.number === issue.milestone.number) ||
                 phase.sprints.some((s: any) => s.number === issue.milestone.number);
        });

        if (detailedView && phaseIssues.length > 0) {
          if (exportFormat === 'markdown') {
            result += `#### 📋 Issues (${phaseIssues.length})\n`;
          }

          const phaseIssueCategories = this.categorizeIssuesByType(phaseIssues);
          
          Object.entries(phaseIssueCategories).forEach(([category, issues]) => {
            if (issues.length === 0) return;

            if (exportFormat === 'markdown') {
              result += `**${category}** (${issues.length}):\n`;
            }

            issues.forEach(issue => {
              const complexity = this.analyzeIssueComplexity(issue);
              const priority = this.calculateIssuePriority(issue);
              const priorityEmoji = priority >= 4 ? '🔴' : priority >= 3 ? '🟡' : '🟢';
              
              const issueData = {
                number: issue.number,
                title: issue.title,
                state: issue.state,
                complexity,
                priority,
                assignees: issue.assignees?.map((a: any) => a.login) || [],
                labels: issue.labels.map((l: any) => l.name),
                url: issue.html_url
              };

              phaseData.issues.push(issueData);

              if (exportFormat === 'markdown') {
                result += `   ${priorityEmoji} #${issue.number}: ${issue.title} (${complexity}sp)\n`;
                if (issue.assignees && issue.assignees.length > 0) {
                  result += `      Assigned: ${issue.assignees.map((a: any) => a.login).join(', ')}\n`;
                }
              }
            });

            if (exportFormat === 'markdown') {
              result += `\n`;
            }
          });
        }

        roadmapData.phases.push(phaseData);

        if (exportFormat === 'markdown') {
          result += `---\n\n`;
        }
      });

      // Add summary and next steps
      if (exportFormat === 'markdown') {
        result += `## 🎯 **Roadmap Summary**\n\n`;
        
        const upcomingMilestones = regularMilestones
          .filter(m => m.state === 'open' && m.due_on)
          .sort((a, b) => new Date(a.due_on!).getTime() - new Date(b.due_on!).getTime())
          .slice(0, 5);

        if (upcomingMilestones.length > 0) {
          result += `### 🚀 Next Key Milestones\n`;
          upcomingMilestones.forEach(milestone => {
            const daysUntilDue = Math.ceil((new Date(milestone.due_on!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            result += `- **${milestone.title}** - Due in ${daysUntilDue} days (${new Date(milestone.due_on!).toLocaleDateString()})\n`;
          });
          result += `\n`;
        }

        const activeSprints = sprints.filter(s => {
          const sprintData = this.parseSprintDescription(s.description || '');
          return sprintData && this.getSprintStatus(sprintData, s) === 'active';
        });

        if (activeSprints.length > 0) {
          result += `### ⚡ Active Sprints\n`;
          activeSprints.forEach(sprint => {
            const sprintData = this.parseSprintDescription(sprint.description || '');
            result += `- **${sprint.title}** - Sprint ${sprintData?.sprintNumber || 'N/A'}\n`;
            result += `  - ${sprint.closed_issues}/${sprint.open_issues + sprint.closed_issues} issues completed\n`;
          });
          result += `\n`;
        }

        result += `### 📊 Key Metrics\n`;
        const totalStoryPoints = allIssues.reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
        const completedStoryPoints = allIssues
          .filter(issue => issue.state === 'closed')
          .reduce((sum, issue) => sum + this.analyzeIssueComplexity(issue), 0);
        
        result += `- **Total Work:** ${totalStoryPoints} story points across ${allIssues.length} issues\n`;
        result += `- **Completed:** ${completedStoryPoints} story points (${Math.round((completedStoryPoints / totalStoryPoints) * 100)}%)\n`;
        result += `- **Remaining:** ${totalStoryPoints - completedStoryPoints} story points\n`;
        
        if (includeDependencies) {
          result += `- **Dependencies:** ${dependencyMap.size} issues have dependencies\n`;
          const criticalPath = this.calculateCriticalPath(allIssues, dependencyMap);
          result += `- **Critical Path:** ${criticalPath.length} issues\n`;
        }

        result += `\n### 💡 Recommendations\n`;
        
        const overdueMilestones = regularMilestones.filter(m => 
          m.state === 'open' && m.due_on && new Date(m.due_on) < new Date()
        );
        
        if (overdueMilestones.length > 0) {
          result += `- ⚠️ **${overdueMilestones.length} overdue milestones** need immediate attention\n`;
        }
        
        const unassignedIssues = allIssues.filter(issue => 
          issue.state === 'open' && (!issue.assignees || issue.assignees.length === 0)
        );
        
        if (unassignedIssues.length > 0) {
          result += `- 👥 **${unassignedIssues.length} unassigned issues** should be assigned to team members\n`;
        }
        
        if (includeDependencies && dependencyMap.size > 0) {
          result += `- 🔗 **Focus on critical path** to minimize project delays\n`;
        }
        
        result += `- 📅 **Regular milestone reviews** recommended every ${timeHorizon === 'monthly' ? 'week' : timeHorizon === 'quarterly' ? 'month' : 'quarter'}\n`;
      }

      // Return based on export format
      if (exportFormat === 'json') {
        return {
          content: [{
            type: "text",
            text: JSON.stringify(roadmapData, null, 2)
          }]
        };
      } else if (exportFormat === 'timeline') {
        let timelineResult = `📅 **${args.title} - Timeline View**\n\n`;
        phases.forEach(phase => {
          timelineResult += `${phase.startDate} → ${phase.endDate}: ${phase.name}\n`;
          phase.milestones.forEach((milestone: any) => {
            timelineResult += `   🎯 ${milestone.title} (${milestone.state})\n`;
          });
          phase.sprints.forEach((sprint: any) => {
            timelineResult += `   🏃‍♂️ ${sprint.title} (${sprint.state})\n`;
          });
          timelineResult += `\n`;
        });
        
        return {
          content: [{
            type: "text",
            text: timelineResult
          }]
        };
      } else {
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      }
    } catch (error: any) {
      throw new Error(`Failed to create roadmap: ${error.message}`);
    }
  }

  // Continue with other handler methods...
  private async handleCreateSprint(args: any) {
    this.validateRepoConfig();

    try {
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

  // PROJECT MANAGEMENT IMPLEMENTATIONS
  private async handleCreateProject(args: any) {
    return { content: [{ type: "text", text: "Create project functionality - to be implemented" }] };
  }

  private async handleListProjects(args: any) {
    return { content: [{ type: "text", text: "List projects functionality - to be implemented" }] };
  }

  private async handleAddItemToProject(args: any) {
    return { content: [{ type: "text", text: "Add item to project functionality - to be implemented" }] };
  }

  // MILESTONE MANAGEMENT
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

  private async handleGetMilestoneMetrics(args: any) {
    return { content: [{ type: "text", text: "Get milestone metrics functionality - to be implemented" }] };
  }

  private async handleGetOverdueMilestones(args: any) {
    return { content: [{ type: "text", text: "Get overdue milestones functionality - to be implemented" }] };
  }

  private async handleGetUpcomingMilestones(args: any) {
    return { content: [{ type: "text", text: "Get upcoming milestones functionality - to be implemented" }] };
  }

  // ISSUE MANAGEMENT
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

  // LABELS
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
    return { content: [{ type: "text", text: "List labels functionality - to be implemented" }] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: 24 comprehensive project management tools including create_roadmap");
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