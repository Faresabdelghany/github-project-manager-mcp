import { GitHubConfig } from '../../shared/types.js';

/**
 * AI-powered task expansion system
 * Breaks down complex tasks into manageable subtasks using intelligent decomposition
 */

interface SubTask {
  title: string;
  description: string;
  complexity: number;
  priority: 'high' | 'medium' | 'low';
  dependencies: string[];
  labels: string[];
  assignee?: string;
  category: string;
  estimatedHours: number;
  acceptanceCriteria: string[];
}

interface TaskBreakdown {
  originalTask: {
    number: number;
    title: string;
    complexity: number;
    labels: string[];
  };
  subtasks: SubTask[];
  totalComplexity: number;
  recommendedApproach: string;
  riskAssessment: string[];
  timeline: string;
  dependencies: { [key: string]: string[] };
}

interface DecompositionTemplate {
  name: string;
  pattern: RegExp[];
  subtaskTemplate: (context: any) => SubTask[];
  description: string;
}

export async function expandTask(config: GitHubConfig, args: any) {
  const { owner, repo, octokit } = config;

  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
  }

  try {
    const issueNumber = args.issue_number;
    const createSubIssues = args.create_sub_issues !== false;
    const assignToSprint = args.assign_to_sprint === true;
    const targetMilestone = args.target_milestone;
    const maxSubtasks = args.max_subtasks || 8;
    const minComplexity = args.min_complexity || 1;
    const templateType = args.template_type || 'auto';
    const includeChecklist = args.include_checklist !== false;

    if (!issueNumber) {
      throw new Error('issue_number is required');
    }

    // Get the issue details
    const issueResponse = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    });

    const issue = issueResponse.data;

    // Analyze the task complexity
    const originalComplexity = analyzeTaskComplexity(issue);

    if (originalComplexity < 3 && args.force !== true) {
      return {
        content: [{
          type: "text",
          text: `⚠️ **Task Expansion Not Recommended**\n\n` +
                `Issue #${issueNumber}: "${issue.title}"\n\n` +
                `**Complexity Analysis:** ${originalComplexity} story points\n\n` +
                `This task has relatively low complexity and may not benefit from decomposition. ` +
                `Tasks with complexity < 3 points are usually better kept as single units of work.\n\n` +
                `**Recommendations:**\n` +
                `• Keep as a single task for atomic completion\n` +
                `• Add detailed acceptance criteria instead\n` +
                `• Consider pair programming if knowledge transfer is needed\n\n` +
                `Use \`force: true\` parameter to expand anyway.`
        }]
      };
    }

    // Perform intelligent task decomposition
    const breakdown = await performTaskDecomposition(issue, {
      templateType,
      maxSubtasks,
      minComplexity,
      originalComplexity
    });

    // Create sub-issues if requested
    let createdIssues: any[] = [];
    if (createSubIssues && breakdown.subtasks.length > 0) {
      createdIssues = await createSubTaskIssues(config, breakdown, {
        parentIssue: issue,
        assignToSprint,
        targetMilestone,
        includeChecklist
      });
    }

    // Generate response
    let result = `🧩 **AI-Powered Task Expansion**\n\n`;
    result += `**Original Task:** #${issue.number} - ${issue.title}\n`;
    result += `**Original Complexity:** ${originalComplexity} story points\n`;
    result += `**Decomposed Into:** ${breakdown.subtasks.length} subtasks (${breakdown.totalComplexity} total points)\n\n`;

    // Task breakdown summary
    result += `## 📊 **Decomposition Summary**\n\n`;
    result += `**Approach:** ${breakdown.recommendedApproach}\n`;
    result += `**Timeline:** ${breakdown.timeline}\n`;
    result += `**Complexity Distribution:**\n`;
    
    const complexityDistribution = breakdown.subtasks.reduce((acc, task) => {
      acc[task.complexity] = (acc[task.complexity] || 0) + 1;
      return acc;
    }, {} as { [key: number]: number });
    
    Object.entries(complexityDistribution).forEach(([complexity, count]) => {
      result += `• ${complexity} points: ${count} tasks\n`;
    });
    result += `\n`;

    // Risk assessment
    if (breakdown.riskAssessment.length > 0) {
      result += `## ⚠️ **Risk Assessment**\n\n`;
      breakdown.riskAssessment.forEach(risk => {
        result += `• ${risk}\n`;
      });
      result += `\n`;
    }

    // Subtasks breakdown
    result += `## 🔍 **Detailed Subtask Breakdown**\n\n`;
    
    // Group subtasks by category
    const categorizedTasks = breakdown.subtasks.reduce((acc, task) => {
      if (!acc[task.category]) acc[task.category] = [];
      acc[task.category].push(task);
      return acc;
    }, {} as { [category: string]: SubTask[] });

    Object.entries(categorizedTasks).forEach(([category, tasks]) => {
      result += `### 📂 ${category}\n\n`;
      
      tasks.forEach((task, index) => {
        const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
        
        result += `#### ${index + 1}. ${priorityEmoji} ${task.title}\n\n`;
        result += `**Description:** ${task.description}\n\n`;
        result += `**Details:**\n`;
        result += `• 📊 Complexity: ${task.complexity} story points\n`;
        result += `• ⏱️ Estimated Hours: ${task.estimatedHours}h\n`;
        result += `• 🎯 Priority: ${task.priority}\n`;
        result += `• 🏷️ Labels: ${task.labels.join(', ')}\n`;
        
        if (task.assignee) {
          result += `• 👤 Suggested Assignee: ${task.assignee}\n`;
        }
        
        if (task.dependencies.length > 0) {
          result += `• 🔗 Dependencies: ${task.dependencies.join(', ')}\n`;
        }
        
        if (task.acceptanceCriteria.length > 0) {
          result += `\n**Acceptance Criteria:**\n`;
          task.acceptanceCriteria.forEach(criteria => {
            result += `- [ ] ${criteria}\n`;
          });
        }
        
        result += `\n---\n\n`;
      });
    });

    // Dependencies visualization
    if (Object.keys(breakdown.dependencies).length > 0) {
      result += `## 🔗 **Task Dependencies**\n\n`;
      result += `**Dependency Chain:**\n`;
      Object.entries(breakdown.dependencies).forEach(([task, deps]) => {
        if (deps.length > 0) {
          result += `• "${task}" depends on: ${deps.join(', ')}\n`;
        }
      });
      result += `\n`;
    }

    // Implementation plan
    result += `## 🎯 **Recommended Implementation Plan**\n\n`;
    
    // Sort tasks by dependencies and priority
    const implementationOrder = calculateImplementationOrder(breakdown.subtasks, breakdown.dependencies);
    
    result += `**Phase 1: Foundation** (Parallel work possible)\n`;
    implementationOrder.phase1.forEach(task => {
      result += `• ${task.title} (${task.complexity}sp)\n`;
    });
    
    if (implementationOrder.phase2.length > 0) {
      result += `\n**Phase 2: Core Development** (After dependencies resolved)\n`;
      implementationOrder.phase2.forEach(task => {
        result += `• ${task.title} (${task.complexity}sp)\n`;
      });
    }
    
    if (implementationOrder.phase3.length > 0) {
      result += `\n**Phase 3: Integration & Finalization**\n`;
      implementationOrder.phase3.forEach(task => {
        result += `• ${task.title} (${task.complexity}sp)\n`;
      });
    }

    // Created issues summary
    if (createdIssues.length > 0) {
      result += `\n## ✅ **Created Sub-Issues**\n\n`;
      result += `Successfully created ${createdIssues.length} sub-issues:\n\n`;
      
      createdIssues.forEach(createdIssue => {
        result += `• #${createdIssue.number}: ${createdIssue.title}\n`;
        result += `  🔗 ${createdIssue.html_url}\n`;
      });
      
      result += `\n**Parent Issue Updated:** Added task breakdown checklist and references to sub-issues.\n`;
    }

    // Next steps
    result += `\n## 🚀 **Next Steps**\n\n`;
    result += `1. **Review the breakdown** and adjust complexity estimates if needed\n`;
    result += `2. **Assign team members** based on skill requirements and availability\n`;
    result += `3. **Start with Phase 1 tasks** that have no dependencies\n`;
    result += `4. **Set up regular check-ins** to track progress and resolve blockers\n`;
    
    if (!createSubIssues) {
      result += `5. **Create GitHub issues** for each subtask using \`create_sub_issues: true\`\n`;
    }
    
    if (breakdown.riskAssessment.length > 0) {
      result += `6. **Address identified risks** before starting implementation\n`;
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

async function performTaskDecomposition(issue: any, options: any): Promise<TaskBreakdown> {
  const { templateType, maxSubtasks, minComplexity, originalComplexity } = options;
  
  // Analyze the issue content
  const issueContext = analyzeIssueContext(issue);
  
  // Select appropriate decomposition template
  const template = selectDecompositionTemplate(issue, templateType);
  
  // Generate subtasks using the template
  let subtasks = template.subtaskTemplate(issueContext);
  
  // Apply constraints
  subtasks = subtasks.slice(0, maxSubtasks);
  subtasks = subtasks.filter(task => task.complexity >= minComplexity);
  
  // Ensure total complexity is reasonable
  const totalComplexity = subtasks.reduce((sum, task) => sum + task.complexity, 0);
  if (totalComplexity > originalComplexity * 1.3) {
    // Adjust complexity to avoid inflation
    const adjustmentFactor = (originalComplexity * 1.1) / totalComplexity;
    subtasks.forEach(task => {
      task.complexity = Math.max(1, Math.round(task.complexity * adjustmentFactor));
    });
  }
  
  // Build dependency graph
  const dependencies = buildDependencyGraph(subtasks);
  
  // Generate recommendations
  const recommendedApproach = generateRecommendedApproach(template, issueContext);
  const riskAssessment = performRiskAssessment(issue, subtasks);
  const timeline = estimateTimeline(subtasks, dependencies);

  return {
    originalTask: {
      number: issue.number,
      title: issue.title,
      complexity: originalComplexity,
      labels: issue.labels.map((l: any) => l.name)
    },
    subtasks,
    totalComplexity: subtasks.reduce((sum, task) => sum + task.complexity, 0),
    recommendedApproach,
    riskAssessment,
    timeline,
    dependencies
  };
}

function analyzeIssueContext(issue: any) {
  const title = issue.title.toLowerCase();
  const body = (issue.body || '').toLowerCase();
  const labels = issue.labels.map((l: any) => l.name.toLowerCase());
  
  const context = {
    isFeature: labels.includes('feature') || labels.includes('enhancement') || title.includes('add') || title.includes('implement'),
    isBug: labels.includes('bug') || title.includes('fix') || title.includes('error'),
    isRefactor: labels.includes('refactor') || title.includes('refactor') || title.includes('improve'),
    isInfrastructure: labels.includes('infrastructure') || labels.includes('devops') || title.includes('deploy'),
    isResearch: labels.includes('research') || labels.includes('spike') || title.includes('investigate'),
    isDocumentation: labels.includes('documentation') || title.includes('docs') || title.includes('readme'),
    isTesting: labels.includes('testing') || labels.includes('test') || title.includes('test'),
    
    // Technical areas
    isFrontend: labels.some(l => ['frontend', 'ui', 'ux'].includes(l)) || body.includes('frontend') || body.includes('ui'),
    isBackend: labels.some(l => ['backend', 'api', 'server'].includes(l)) || body.includes('backend') || body.includes('api'),
    isDatabase: labels.some(l => ['database', 'db'].includes(l)) || body.includes('database') || body.includes('sql'),
    isMobile: labels.some(l => ['mobile', 'ios', 'android'].includes(l)) || body.includes('mobile'),
    
    // Complexity indicators
    hasApiIntegration: body.includes('api') || body.includes('integration'),
    hasDataMigration: body.includes('migration') || body.includes('migrate'),
    hasSecurityRequirements: body.includes('security') || body.includes('auth'),
    hasPerformanceRequirements: body.includes('performance') || body.includes('optimization'),
    
    // Project structure
    title,
    body,
    labels,
    assignees: issue.assignees?.map((a: any) => a.login) || [],
    milestone: issue.milestone?.title
  };
  
  return context;
}

function selectDecompositionTemplate(issue: any, templateType: string): DecompositionTemplate {
  const templates: DecompositionTemplate[] = [
    // Feature Implementation Template
    {
      name: 'Feature Implementation',
      pattern: [/implement|add|create|build/i, /feature|functionality/i],
      description: 'Standard feature development workflow',
      subtaskTemplate: (context) => [
        {
          title: 'Research and Requirements Analysis',
          description: `Research existing solutions and define detailed requirements for ${context.title}`,
          complexity: 2,
          priority: 'high' as const,
          dependencies: [],
          labels: ['research', 'requirements'],
          category: 'Planning',
          estimatedHours: 8,
          acceptanceCriteria: [
            'Requirements documented and reviewed',
            'Technical approach decided',
            'Dependencies identified'
          ]
        },
        {
          title: 'Design and Architecture',
          description: `Design the architecture and user interface for ${context.title}`,
          complexity: 3,
          priority: 'high' as const,
          dependencies: ['Research and Requirements Analysis'],
          labels: ['design', 'architecture'],
          category: 'Design',
          estimatedHours: 12,
          acceptanceCriteria: [
            'Architecture diagram created',
            'API endpoints defined',
            'UI/UX mockups ready'
          ]
        },
        {
          title: 'Core Implementation',
          description: `Implement the main functionality for ${context.title}`,
          complexity: 5,
          priority: 'medium' as const,
          dependencies: ['Design and Architecture'],
          labels: ['implementation', context.isFrontend ? 'frontend' : 'backend'],
          category: 'Development',
          estimatedHours: 20,
          acceptanceCriteria: [
            'Core functionality implemented',
            'Basic error handling added',
            'Code follows standards'
          ]
        },
        {
          title: 'Testing and Validation',
          description: `Create comprehensive tests for ${context.title}`,
          complexity: 3,
          priority: 'medium' as const,
          dependencies: ['Core Implementation'],
          labels: ['testing', 'qa'],
          category: 'Quality Assurance',
          estimatedHours: 12,
          acceptanceCriteria: [
            'Unit tests written and passing',
            'Integration tests added',
            'Edge cases covered'
          ]
        },
        {
          title: 'Documentation and Polish',
          description: `Document ${context.title} and add final polish`,
          complexity: 2,
          priority: 'low' as const,
          dependencies: ['Testing and Validation'],
          labels: ['documentation', 'polish'],
          category: 'Documentation',
          estimatedHours: 6,
          acceptanceCriteria: [
            'User documentation written',
            'Code comments added',
            'README updated'
          ]
        }
      ]
    },
    
    // Bug Fix Template
    {
      name: 'Bug Fix',
      pattern: [/fix|bug|error|issue/i],
      description: 'Systematic bug investigation and resolution',
      subtaskTemplate: (context) => [
        {
          title: 'Bug Investigation and Reproduction',
          description: `Investigate and consistently reproduce the bug described in ${context.title}`,
          complexity: 2,
          priority: 'high' as const,
          dependencies: [],
          labels: ['investigation', 'bug'],
          category: 'Analysis',
          estimatedHours: 6,
          acceptanceCriteria: [
            'Bug consistently reproduced',
            'Steps to reproduce documented',
            'Impact assessment completed'
          ]
        },
        {
          title: 'Root Cause Analysis',
          description: `Identify the root cause of the bug and plan the fix`,
          complexity: 3,
          priority: 'high' as const,
          dependencies: ['Bug Investigation and Reproduction'],
          labels: ['analysis', 'debugging'],
          category: 'Analysis',
          estimatedHours: 8,
          acceptanceCriteria: [
            'Root cause identified',
            'Fix strategy planned',
            'Potential side effects assessed'
          ]
        },
        {
          title: 'Implement Fix',
          description: `Implement the fix for ${context.title}`,
          complexity: 3,
          priority: 'medium' as const,
          dependencies: ['Root Cause Analysis'],
          labels: ['fix', 'implementation'],
          category: 'Development',
          estimatedHours: 10,
          acceptanceCriteria: [
            'Fix implemented and tested',
            'No new bugs introduced',
            'Code reviewed'
          ]
        },
        {
          title: 'Regression Testing',
          description: `Perform thorough regression testing to ensure the fix works correctly`,
          complexity: 2,
          priority: 'medium' as const,
          dependencies: ['Implement Fix'],
          labels: ['testing', 'regression'],
          category: 'Quality Assurance',
          estimatedHours: 6,
          acceptanceCriteria: [
            'Original bug resolved',
            'No regression detected',
            'Test cases added for prevention'
          ]
        }
      ]
    },
    
    // Refactoring Template
    {
      name: 'Refactoring',
      pattern: [/refactor|improve|optimize|cleanup/i],
      description: 'Systematic code improvement and optimization',
      subtaskTemplate: (context) => [
        {
          title: 'Code Analysis and Planning',
          description: `Analyze current code and plan refactoring approach for ${context.title}`,
          complexity: 2,
          priority: 'medium' as const,
          dependencies: [],
          labels: ['analysis', 'planning'],
          category: 'Planning',
          estimatedHours: 8,
          acceptanceCriteria: [
            'Current code analyzed',
            'Refactoring plan documented',
            'Risks identified'
          ]
        },
        {
          title: 'Create Comprehensive Tests',
          description: `Create tests to ensure refactoring doesn't break functionality`,
          complexity: 3,
          priority: 'high' as const,
          dependencies: ['Code Analysis and Planning'],
          labels: ['testing', 'safety'],
          category: 'Quality Assurance',
          estimatedHours: 12,
          acceptanceCriteria: [
            'Comprehensive test coverage',
            'All tests passing',
            'Edge cases covered'
          ]
        },
        {
          title: 'Implement Refactoring',
          description: `Perform the actual refactoring of ${context.title}`,
          complexity: 4,
          priority: 'medium' as const,
          dependencies: ['Create Comprehensive Tests'],
          labels: ['refactor', 'implementation'],
          category: 'Development',
          estimatedHours: 16,
          acceptanceCriteria: [
            'Code refactored as planned',
            'All tests still passing',
            'Performance maintained or improved'
          ]
        },
        {
          title: 'Documentation Update',
          description: `Update documentation to reflect refactored code`,
          complexity: 1,
          priority: 'low' as const,
          dependencies: ['Implement Refactoring'],
          labels: ['documentation'],
          category: 'Documentation',
          estimatedHours: 4,
          acceptanceCriteria: [
            'Code comments updated',
            'Architecture docs updated',
            'API docs reflect changes'
          ]
        }
      ]
    }
  ];

  // Auto-select template based on issue context
  if (templateType === 'auto') {
    const context = analyzeIssueContext(issue);
    
    if (context.isBug) {
      return templates.find(t => t.name === 'Bug Fix')!;
    } else if (context.isRefactor) {
      return templates.find(t => t.name === 'Refactoring')!;
    } else {
      return templates.find(t => t.name === 'Feature Implementation')!;
    }
  }
  
  // Find template by name
  const selectedTemplate = templates.find(t => 
    t.name.toLowerCase().includes(templateType.toLowerCase())
  );
  
  return selectedTemplate || templates[0]; // Default to Feature Implementation
}

function buildDependencyGraph(subtasks: SubTask[]): { [key: string]: string[] } {
  const dependencies: { [key: string]: string[] } = {};
  
  subtasks.forEach(task => {
    if (task.dependencies.length > 0) {
      dependencies[task.title] = task.dependencies;
    }
  });
  
  return dependencies;
}

function generateRecommendedApproach(template: DecompositionTemplate, context: any): string {
  const approaches = {
    'Feature Implementation': 'Incremental development with continuous testing and validation',
    'Bug Fix': 'Systematic investigation followed by careful implementation and thorough testing',
    'Refactoring': 'Test-driven refactoring with comprehensive safety checks'
  };
  
  let approach = approaches[template.name as keyof typeof approaches] || 'Standard iterative development';
  
  // Add context-specific recommendations
  if (context.hasApiIntegration) {
    approach += '. Include API contract testing and mocking.';
  }
  
  if (context.hasSecurityRequirements) {
    approach += ' Pay special attention to security testing and code review.';
  }
  
  if (context.hasPerformanceRequirements) {
    approach += ' Include performance benchmarking and optimization.';
  }
  
  return approach;
}

function performRiskAssessment(issue: any, subtasks: SubTask[]): string[] {
  const risks: string[] = [];
  const context = analyzeIssueContext(issue);
  
  // Complexity risks
  const totalComplexity = subtasks.reduce((sum, task) => sum + task.complexity, 0);
  if (totalComplexity > 15) {
    risks.push('High total complexity may lead to scope creep or timeline overruns');
  }
  
  // Dependency risks
  const hasManyDependencies = subtasks.some(task => task.dependencies.length > 2);
  if (hasManyDependencies) {
    risks.push('Complex dependencies may cause bottlenecks and coordination issues');
  }
  
  // Technical risks
  if (context.hasApiIntegration) {
    risks.push('API integration may face rate limiting or external service downtime');
  }
  
  if (context.hasDataMigration) {
    risks.push('Data migration carries risk of data loss or corruption');
  }
  
  if (context.hasSecurityRequirements) {
    risks.push('Security implementation requires careful review to avoid vulnerabilities');
  }
  
  // Resource risks
  if (context.assignees.length === 0) {
    risks.push('No assignees identified - resource allocation may be unclear');
  }
  
  if (context.assignees.length === 1 && totalComplexity > 8) {
    risks.push('Single assignee for complex task may create knowledge silos');
  }
  
  return risks;
}

function estimateTimeline(subtasks: SubTask[], dependencies: { [key: string]: string[] }): string {
  const totalHours = subtasks.reduce((sum, task) => sum + task.estimatedHours, 0);
  const totalDays = Math.ceil(totalHours / 6); // Assuming 6 productive hours per day
  
  // Calculate critical path
  const criticalPathLength = calculateCriticalPathLength(subtasks, dependencies);
  const parallelEfficiency = Math.max(0.6, 1 - (criticalPathLength / subtasks.length));
  
  const adjustedDays = Math.ceil(totalDays * parallelEfficiency);
  
  if (adjustedDays <= 3) {
    return `3-5 days (${totalHours} hours total)`;
  } else if (adjustedDays <= 7) {
    return `1-2 weeks (${totalHours} hours total)`;
  } else if (adjustedDays <= 14) {
    return `2-3 weeks (${totalHours} hours total)`;
  } else {
    return `3-4 weeks (${totalHours} hours total)`;
  }
}

function calculateCriticalPathLength(subtasks: SubTask[], dependencies: { [key: string]: string[] }): number {
  // Simplified critical path calculation
  const taskMap = new Map(subtasks.map(task => [task.title, task]));
  const visited = new Set<string>();
  
  function dfs(taskTitle: string): number {
    if (visited.has(taskTitle)) return 0;
    visited.add(taskTitle);
    
    const task = taskMap.get(taskTitle);
    if (!task) return 0;
    
    const deps = dependencies[taskTitle] || [];
    const maxDepPath = Math.max(0, ...deps.map(dep => dfs(dep)));
    
    return 1 + maxDepPath;
  }
  
  return Math.max(...subtasks.map(task => dfs(task.title)));
}

function calculateImplementationOrder(subtasks: SubTask[], dependencies: { [key: string]: string[] }) {
  const taskMap = new Map(subtasks.map(task => [task.title, task]));
  const phase1: SubTask[] = [];
  const phase2: SubTask[] = [];
  const phase3: SubTask[] = [];
  
  // Phase 1: No dependencies or research/planning tasks
  subtasks.forEach(task => {
    const deps = dependencies[task.title] || [];
    if (deps.length === 0 || task.category === 'Planning' || task.category === 'Analysis') {
      phase1.push(task);
    }
  });
  
  // Phase 2: Dependent on Phase 1
  subtasks.forEach(task => {
    if (phase1.includes(task)) return;
    
    const deps = dependencies[task.title] || [];
    const allDepsInPhase1 = deps.every(dep => 
      phase1.some(p1Task => p1Task.title === dep)
    );
    
    if (allDepsInPhase1 && deps.length > 0) {
      phase2.push(task);
    }
  });
  
  // Phase 3: Everything else
  subtasks.forEach(task => {
    if (!phase1.includes(task) && !phase2.includes(task)) {
      phase3.push(task);
    }
  });
  
  return { phase1, phase2, phase3 };
}

async function createSubTaskIssues(
  config: GitHubConfig, 
  breakdown: TaskBreakdown, 
  options: any
): Promise<any[]> {
  const { octokit, owner, repo } = config;
  const { parentIssue, assignToSprint, targetMilestone, includeChecklist } = options;
  
  const createdIssues: any[] = [];
  
  // Create issues for each subtask
  for (const subtask of breakdown.subtasks) {
    const issueBody = buildSubTaskIssueBody(subtask, parentIssue, includeChecklist);
    
    const createIssueResponse = await octokit.rest.issues.create({
      owner,
      repo,
      title: `${subtask.title} (Part of #${parentIssue.number})`,
      body: issueBody,
      labels: [...subtask.labels, 'subtask', `complexity-${subtask.complexity}`],
      assignees: subtask.assignee ? [subtask.assignee] : undefined,
      milestone: targetMilestone || parentIssue.milestone?.number
    });
    
    createdIssues.push(createIssueResponse.data);
  }
  
  // Update parent issue with subtask references
  if (includeChecklist) {
    await updateParentIssueWithChecklist(config, parentIssue, createdIssues, breakdown);
  }
  
  return createdIssues;
}

function buildSubTaskIssueBody(subtask: SubTask, parentIssue: any, includeChecklist: boolean): string {
  let body = `**Parent Issue:** #${parentIssue.number}\n\n`;
  body += `**Description:** ${subtask.description}\n\n`;
  body += `**Category:** ${subtask.category}\n`;
  body += `**Complexity:** ${subtask.complexity} story points\n`;
  body += `**Estimated Hours:** ${subtask.estimatedHours}h\n`;
  body += `**Priority:** ${subtask.priority}\n\n`;
  
  if (subtask.dependencies.length > 0) {
    body += `**Dependencies:**\n`;
    subtask.dependencies.forEach(dep => {
      body += `- ${dep}\n`;
    });
    body += `\n`;
  }
  
  if (subtask.acceptanceCriteria.length > 0) {
    body += `**Acceptance Criteria:**\n`;
    subtask.acceptanceCriteria.forEach(criteria => {
      body += `- [ ] ${criteria}\n`;
    });
    body += `\n`;
  }
  
  body += `---\n`;
  body += `*This is a subtask generated by AI-powered task expansion.*`;
  
  return body;
}

async function updateParentIssueWithChecklist(
  config: GitHubConfig,
  parentIssue: any,
  createdIssues: any[],
  breakdown: TaskBreakdown
): Promise<void> {
  const { octokit, owner, repo } = config;
  
  let checklistSection = `\n\n---\n\n## 🧩 **Task Breakdown Checklist**\n\n`;
  checklistSection += `*This task has been decomposed into ${createdIssues.length} subtasks:*\n\n`;
  
  createdIssues.forEach(issue => {
    checklistSection += `- [ ] #${issue.number}: ${issue.title}\n`;
  });
  
  checklistSection += `\n**Total Complexity:** ${breakdown.totalComplexity} story points\n`;
  checklistSection += `**Timeline:** ${breakdown.timeline}\n`;
  
  const updatedBody = (parentIssue.body || '') + checklistSection;
  
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: parentIssue.number,
    body: updatedBody,
    labels: [...parentIssue.labels.map((l: any) => l.name), 'expanded', 'parent-task']
  });
}

function analyzeTaskComplexity(issue: any): number {
  let complexity = 1;
  
  // Title complexity
  const titleWords = issue.title.split(' ').length;
  if (titleWords > 10) complexity += 1;
  
  // Body complexity
  if (issue.body) {
    const bodyLength = issue.body.length;
    if (bodyLength > 1000) complexity += 2;
    else if (bodyLength > 500) complexity += 1;
    
    // Technical keywords
    const technicalKeywords = [
      'api', 'database', 'migration', 'refactor', 'architecture', 
      'integration', 'security', 'performance', 'scalability'
    ];
    const techCount = technicalKeywords.filter(keyword => 
      issue.body.toLowerCase().includes(keyword)
    ).length;
    complexity += Math.min(techCount, 3);
  }
  
  // Label complexity
  const complexityLabels = issue.labels.filter((label: any) => 
    ['epic', 'large', 'complex', 'research', 'spike'].some(keyword => 
      label.name.toLowerCase().includes(keyword)
    )
  );
  complexity += complexityLabels.length;
  
  return Math.min(complexity, 8); // Cap at 8 story points
}
