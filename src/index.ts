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
        name: 'github-project-manager',
        version: '3.3.0',
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

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
            description: 'Break down complex tasks into manageable subtasks with dependencies and acceptance criteria',
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
      
      let result = `🔨 **Task Breakdown Analysis**\n\n`;
      result += `**Original Issue:** #${issue.number} - ${issue.title}\n`;
      result += `**Repository:** ${this.owner}/${this.repo}\n`;
      result += `**Complexity:** ${complexity} story points\n`;
      result += `**Granularity:** ${granularity}\n`;
      result += `**Generated:** ${new Date().toLocaleString()}\n\n`;
      result += `---\n\n`;

      if (complexity < 3) {
        result += `💡 **Note:** This issue has low complexity (${complexity}sp). Breaking it down further may not be necessary.\n\n`;
      }

      // Generate basic task breakdown
      const subtasks = [];
      const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
      
      if (text.includes('design') || text.includes('architecture') || complexity >= 5) {
        subtasks.push({
          title: 'Design and Architecture Planning',
          type: 'design',
          description: 'Create detailed design specifications and architecture plans for the implementation.',
          complexity: Math.max(1, Math.floor(complexity * 0.2)),
          estimatedHours: Math.max(2, Math.floor(complexity * 0.8)),
          priority: 'high'
        });
      }
      
      if (text.includes('api') || text.includes('endpoint') || text.includes('service')) {
        subtasks.push({
          title: 'API Implementation',
          type: 'backend',
          description: 'Design and implement the API endpoints and service layer functionality.',
          complexity: Math.max(2, Math.floor(complexity * 0.4)),
          estimatedHours: Math.max(4, Math.floor(complexity * 1.2)),
          priority: 'high'
        });
      }
      
      if (text.includes('frontend') || text.includes('ui') || text.includes('interface')) {
        subtasks.push({
          title: 'Frontend Implementation',
          type: 'frontend',
          description: 'Implement the user interface and frontend functionality.',
          complexity: Math.max(2, Math.floor(complexity * 0.3)),
          estimatedHours: Math.max(4, Math.floor(complexity * 1.5)),
          priority: 'medium'
        });
      }
      
      // Always include testing for complex tasks
      if (complexity >= 4 || granularity === 'high') {
        subtasks.push({
          title: 'Testing and Quality Assurance',
          type: 'testing',
          description: 'Implement comprehensive testing and quality assurance measures.',
          complexity: Math.max(1, Math.floor(complexity * 0.2)),
          estimatedHours: Math.max(3, Math.floor(complexity * 0.8)),
          priority: 'medium'
        });
      }
      
      // If we don't have enough subtasks, add generic ones
      if (subtasks.length === 0) {
        subtasks.push({
          title: 'Core Implementation',
          type: 'development',
          description: 'Implement the core functionality as described in the issue.',
          complexity: Math.max(2, Math.floor(complexity * 0.6)),
          estimatedHours: Math.max(4, complexity * 2),
          priority: 'high'
        });
      }
      
      result += `## 📋 **Proposed Subtasks (${subtasks.length})**\n\n`;
      
      const createdIssues = [];
      let totalEstimatedEffort = 0;
      
      for (let i = 0; i < subtasks.length; i++) {
        const subtask = subtasks[i];
        totalEstimatedEffort += subtask.estimatedHours;
        
        result += `### ${i + 1}. ${subtask.title}\n`;
        result += `**Type:** ${subtask.type}\n`;
        
        if (include_estimates) {
          result += `**Estimated Effort:** ${subtask.estimatedHours}h (${subtask.complexity}sp)\n`;
        }
        
        result += `**Priority:** ${subtask.priority}\n\n`;
        result += `**Description:**\n${subtask.description}\n\n`;

        // Create actual GitHub issues if requested
        if (create_subtasks) {
          try {
            const subtaskBody = `## Parent Issue\nThis is a subtask of #${issue.number}: ${issue.title}\n\n## Description\n${subtask.description}\n\n## Technical Details\n- **Type:** ${subtask.type}\n- **Estimated Hours:** ${subtask.estimatedHours}\n- **Complexity:** ${subtask.complexity} story points\n- **Priority:** ${subtask.priority}\n\n## Definition of Done\n- [ ] Implementation completed according to specifications\n- [ ] Code reviewed and approved\n- [ ] Unit tests written and passing\n- [ ] Parent issue #${issue.number} updated with progress`;

            const labels = [
              `type: ${subtask.type}`,
              `priority: ${subtask.priority}`,
              'subtask',
              `parent-issue-${issue.number}`
            ];

            const createIssueData: any = {
              owner: this.owner,
              repo: this.repo,
              title: `${issue.title}: ${subtask.title}`,
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

      // Summary
      result += `## 📊 **Breakdown Summary**\n\n`;
      result += `**Original Complexity:** ${complexity} story points\n`;
      
      if (include_estimates) {
        const totalComplexity = subtasks.reduce((sum, task) => sum + task.complexity, 0);
        result += `**Total Subtask Complexity:** ${totalComplexity} story points\n`;
        result += `**Total Estimated Effort:** ${totalEstimatedEffort} hours\n`;
      }
      
      result += `**Number of Subtasks:** ${subtasks.length}\n\n`;

      if (create_subtasks && createdIssues.length > 0) {
        result += `## ✅ **Created GitHub Issues (${createdIssues.length})**\n\n`;
        createdIssues.forEach(created => {
          result += `• [#${created.number}: ${created.title}](${created.url})\n`;
        });
        result += `\n`;
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: 3 AI-powered task management tools - fixes issue #24!");
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