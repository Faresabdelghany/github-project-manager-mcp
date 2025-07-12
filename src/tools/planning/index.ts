import { GitHubConfig, ToolResponse } from '../../shared/types.js';
import { validateRepoConfig, handleToolError, createSuccessResponse } from '../../utils/helpers.js';

/**
 * PRD Template Structure
 */
interface PRDSection {
  title: string;
  content: string;
  priority: 'high' | 'medium' | 'low';
}

interface PRDTemplate {
  title: string;
  overview: string;
  objectives: string[];
  targetAudience: string[];
  requirements: {
    functional: string[];
    nonFunctional: string[];
    technical: string[];
  };
  userStories: {
    epic: string;
    stories: string[];
  }[];
  acceptanceCriteria: string[];
  dependencies: string[];
  risks: string[];
  timeline: {
    phase: string;
    duration: string;
    deliverables: string[];
  }[];
  successMetrics: string[];
}

/**
 * Feature Impact Analysis
 */
interface FeatureImpact {
  technical: {
    complexity: number;
    effort: string;
    risks: string[];
    dependencies: string[];
  };
  business: {
    value: number;
    priority: string;
    stakeholders: string[];
    metrics: string[];
  };
  user: {
    personas: string[];
    journeys: string[];
    benefits: string[];
  };
}

/**
 * Generate a comprehensive Product Requirements Document
 */
export async function generatePRD(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    validateRepoConfig(config);

    const {
      title,
      description,
      features = [],
      target_audience = ['developers', 'end-users'],
      objectives = [],
      complexity = 'medium',
      timeline = '3-6 months',
      format = 'markdown'
    } = args;

    // Generate comprehensive PRD template
    const prd: PRDTemplate = {
      title: title || 'Product Requirements Document',
      overview: description || 'A comprehensive product designed to meet user needs and business objectives.',
      objectives: objectives.length > 0 ? objectives : [
        'Deliver a high-quality product that meets user needs',
        'Ensure scalable and maintainable architecture',
        'Provide excellent user experience',
        'Meet performance and security requirements'
      ],
      targetAudience: target_audience,
      requirements: {
        functional: generateFunctionalRequirements(features, complexity),
        nonFunctional: generateNonFunctionalRequirements(complexity),
        technical: generateTechnicalRequirements(features, complexity)
      },
      userStories: generateUserStories(features, target_audience),
      acceptanceCriteria: generateAcceptanceCriteria(features),
      dependencies: generateDependencies(features, complexity),
      risks: generateRisks(complexity, features),
      timeline: generateTimeline(timeline, features),
      successMetrics: generateSuccessMetrics(objectives, features)
    };

    let result = '';

    if (format === 'json') {
      result = JSON.stringify(prd, null, 2);
    } else {
      result = formatPRDAsMarkdown(prd);
    }

    // Optionally create a GitHub issue with the PRD
    if (args.create_issue) {
      const issueBody = format === 'markdown' ? result : `\`\`\`json\n${result}\n\`\`\``;
      
      await config.octokit.rest.issues.create({
        owner: config.owner,
        repo: config.repo,
        title: `📋 PRD: ${prd.title}`,
        body: issueBody,
        labels: ['prd', 'documentation', 'planning']
      });

      result += `\n\n✅ **PRD Issue Created!**\nThe PRD has been saved as a GitHub issue with labels: 'prd', 'documentation', 'planning'`;
    }

    return createSuccessResponse(result);
  } catch (error) {
    return handleToolError(error, 'generate_prd');
  }
}

/**
 * Parse existing PRD and generate actionable development tasks
 */
export async function parsePRD(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    validateRepoConfig(config);

    const {
      prd_content,
      issue_number,
      create_tasks = true,
      task_format = 'github_issues',
      sprint_assignment = false
    } = args;

    let prdContent = prd_content;

    // If issue_number provided, fetch PRD from GitHub issue
    if (issue_number && !prd_content) {
      const issueResponse = await config.octokit.rest.issues.get({
        owner: config.owner,
        repo: config.repo,
        issue_number: issue_number
      });
      prdContent = issueResponse.data.body || '';
    }

    if (!prdContent) {
      throw new Error('No PRD content provided. Use either prd_content or issue_number parameter.');
    }

    // Parse PRD content and extract actionable tasks
    const tasks = await extractTasksFromPRD(prdContent);
    const epics = organizeTasksIntoEpics(tasks);

    let result = `🔍 **PRD Analysis Complete**\n\n`;
    result += `**Source:** ${issue_number ? `Issue #${issue_number}` : 'Provided content'}\n`;
    result += `**Tasks Identified:** ${tasks.length}\n`;
    result += `**Epics Created:** ${epics.length}\n\n`;

    // Create GitHub issues for tasks if requested
    const createdIssues: any[] = [];
    if (create_tasks && task_format === 'github_issues') {
      for (const epic of epics) {
        // Create epic issue
        const epicIssue = await config.octokit.rest.issues.create({
          owner: config.owner,
          repo: config.repo,
          title: `🎯 Epic: ${epic.title}`,
          body: formatEpicDescription(epic),
          labels: ['epic', 'prd-derived', epic.priority]
        });

        createdIssues.push(epicIssue.data);

        // Create tasks for this epic
        for (const task of epic.tasks) {
          const taskIssue = await config.octokit.rest.issues.create({
            owner: config.owner,
            repo: config.repo,
            title: task.title,
            body: formatTaskDescription(task, epicIssue.data.number),
            labels: ['task', 'prd-derived', task.priority, task.category]
          });

          createdIssues.push(taskIssue.data);
        }
      }

      result += `✅ **${createdIssues.length} GitHub Issues Created**\n\n`;
    }

    // Format results
    result += `## 📋 **Extracted Tasks**\n\n`;
    epics.forEach((epic, index) => {
      result += `### ${index + 1}. ${epic.title} (${epic.priority} priority)\n`;
      result += `${epic.description}\n\n`;
      result += `**Tasks:**\n`;
      epic.tasks.forEach((task, taskIndex) => {
        result += `   ${taskIndex + 1}. **${task.title}** (${task.complexity}sp)\n`;
        result += `      - Category: ${task.category}\n`;
        result += `      - Priority: ${task.priority}\n`;
        result += `      - Effort: ${task.effort}\n`;
        if (task.dependencies.length > 0) {
          result += `      - Dependencies: ${task.dependencies.join(', ')}\n`;
        }
        result += `\n`;
      });
    });

    if (createdIssues.length > 0) {
      result += `\n## 🔗 **Created Issues**\n\n`;
      createdIssues.forEach(issue => {
        result += `- [${issue.title}](${issue.html_url}) (#${issue.number})\n`;
      });
    }

    return createSuccessResponse(result);
  } catch (error) {
    return handleToolError(error, 'parse_prd');
  }
}

/**
 * Enhance existing PRD with additional analysis and recommendations
 */
export async function enhancePRD(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    validateRepoConfig(config);

    const {
      issue_number,
      prd_content,
      enhancement_type = 'comprehensive',
      include_market_analysis = true,
      include_technical_analysis = true,
      include_risk_analysis = true,
      include_metrics = true,
      update_issue = false
    } = args;

    let originalPRD = prd_content;

    // Fetch PRD from GitHub issue if provided
    if (issue_number && !prd_content) {
      const issueResponse = await config.octokit.rest.issues.get({
        owner: config.owner,
        repo: config.repo,
        issue_number: issue_number
      });
      originalPRD = issueResponse.data.body || '';
    }

    if (!originalPRD) {
      throw new Error('No PRD content found. Provide either prd_content or issue_number.');
    }

    // Analyze existing PRD
    const analysis = analyzePRDCompleteness(originalPRD);
    
    let enhancement = `# 🚀 **Enhanced PRD Analysis**\n\n`;
    enhancement += `**Enhancement Type:** ${enhancement_type}\n`;
    enhancement += `**Completeness Score:** ${analysis.completeness}%\n\n`;

    // Add completeness analysis
    enhancement += `## 📊 **PRD Analysis**\n\n`;
    enhancement += `### Strengths\n`;
    analysis.strengths.forEach(strength => {
      enhancement += `- ✅ ${strength}\n`;
    });
    enhancement += `\n### Areas for Improvement\n`;
    analysis.gaps.forEach(gap => {
      enhancement += `- ⚠️ ${gap}\n`;
    });
    enhancement += `\n`;

    // Add market analysis if requested
    if (include_market_analysis) {
      enhancement += generateMarketAnalysis(originalPRD);
    }

    // Add technical analysis if requested
    if (include_technical_analysis) {
      enhancement += generateTechnicalAnalysis(originalPRD);
    }

    // Add risk analysis if requested
    if (include_risk_analysis) {
      enhancement += generateRiskAnalysis(originalPRD);
    }

    // Add success metrics if requested
    if (include_metrics) {
      enhancement += generateEnhancedMetrics(originalPRD);
    }

    // Generate recommendations
    enhancement += generateRecommendations(analysis, enhancement_type);

    // Update GitHub issue if requested
    if (update_issue && issue_number) {
      const updatedBody = originalPRD + '\n\n---\n\n' + enhancement;
      
      await config.octokit.rest.issues.update({
        owner: config.owner,
        repo: config.repo,
        issue_number: issue_number,
        body: updatedBody
      });

      enhancement += `\n\n✅ **Issue #${issue_number} Updated**\nThe enhanced PRD has been appended to the original issue.`;
    }

    return createSuccessResponse(enhancement);
  } catch (error) {
    return handleToolError(error, 'enhance_prd');
  }
}

/**
 * Add new feature to existing project with comprehensive impact analysis
 */
export async function addFeature(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    validateRepoConfig(config);

    const {
      feature_name,
      feature_description,
      target_milestone,
      impact_scope = 'full',
      create_issues = true,
      assign_team = [],
      priority = 'medium',
      estimate_effort = true
    } = args;

    if (!feature_name) {
      throw new Error('feature_name is required');
    }

    // Analyze current project state
    const projectState = await analyzeCurrentProjectState(config);
    
    // Perform comprehensive impact analysis
    const impact = await analyzeFeatureImpact(config, {
      name: feature_name,
      description: feature_description,
      priority,
      scope: impact_scope
    }, projectState);

    let result = `🎯 **Feature Impact Analysis: ${feature_name}**\n\n`;
    
    // Technical Impact
    result += `## 🔧 **Technical Impact**\n`;
    result += `**Complexity Score:** ${impact.technical.complexity}/10\n`;
    result += `**Estimated Effort:** ${impact.technical.effort}\n`;
    result += `**Risk Level:** ${impact.technical.risks.length > 0 ? 'High' : 'Low'}\n\n`;
    
    if (impact.technical.risks.length > 0) {
      result += `**Technical Risks:**\n`;
      impact.technical.risks.forEach(risk => {
        result += `- ⚠️ ${risk}\n`;
      });
      result += `\n`;
    }

    if (impact.technical.dependencies.length > 0) {
      result += `**Dependencies:**\n`;
      impact.technical.dependencies.forEach(dep => {
        result += `- 🔗 ${dep}\n`;
      });
      result += `\n`;
    }

    // Business Impact
    result += `## 💼 **Business Impact**\n`;
    result += `**Value Score:** ${impact.business.value}/10\n`;
    result += `**Priority:** ${impact.business.priority}\n`;
    result += `**Stakeholders:** ${impact.business.stakeholders.join(', ')}\n\n`;

    if (impact.business.metrics.length > 0) {
      result += `**Success Metrics:**\n`;
      impact.business.metrics.forEach(metric => {
        result += `- 📊 ${metric}\n`;
      });
      result += `\n`;
    }

    // User Impact
    result += `## 👥 **User Impact**\n`;
    result += `**Target Personas:** ${impact.user.personas.join(', ')}\n\n`;
    
    if (impact.user.benefits.length > 0) {
      result += `**User Benefits:**\n`;
      impact.user.benefits.forEach(benefit => {
        result += `- ✨ ${benefit}\n`;
      });
      result += `\n`;
    }

    // Implementation Plan
    const implementationPlan = generateImplementationPlan(feature_name, feature_description, impact);
    result += `## 🚀 **Implementation Plan**\n\n`;
    implementationPlan.phases.forEach((phase, index) => {
      result += `### Phase ${index + 1}: ${phase.name}\n`;
      result += `**Duration:** ${phase.duration}\n`;
      result += `**Deliverables:**\n`;
      phase.deliverables.forEach(deliverable => {
        result += `- ${deliverable}\n`;
      });
      result += `\n`;
    });

    // Create GitHub issues if requested
    const createdIssues: any[] = [];
    if (create_issues) {
      // Create epic for the feature
      const epicIssue = await config.octokit.rest.issues.create({
        owner: config.owner,
        repo: config.repo,
        title: `🎯 Epic: ${feature_name}`,
        body: formatFeatureEpic(feature_name, feature_description, impact, implementationPlan),
        labels: ['epic', 'feature', priority],
        milestone: target_milestone,
        assignees: assign_team
      });

      createdIssues.push(epicIssue.data);

      // Create implementation tasks
      for (const phase of implementationPlan.phases) {
        for (const deliverable of phase.deliverables) {
          const taskIssue = await config.octokit.rest.issues.create({
            owner: config.owner,
            repo: config.repo,
            title: `${phase.name}: ${deliverable}`,
            body: `Part of Epic: #${epicIssue.data.number}\n\n**Phase:** ${phase.name}\n**Duration:** ${phase.duration}\n\n**Description:**\n${deliverable}`,
            labels: ['task', 'feature', priority, phase.name.toLowerCase().replace(/\s+/g, '-')],
            milestone: target_milestone,
            assignees: assign_team
          });

          createdIssues.push(taskIssue.data);
        }
      }

      result += `\n## ✅ **Created Issues**\n`;
      result += `**Total Issues:** ${createdIssues.length}\n\n`;
      createdIssues.forEach(issue => {
        result += `- [${issue.title}](${issue.html_url}) (#${issue.number})\n`;
      });
    }

    // Recommendations
    result += `\n## 💡 **Recommendations**\n\n`;
    if (impact.technical.complexity > 7) {
      result += `- ⚠️ **High Complexity:** Consider breaking this feature into smaller phases\n`;
    }
    if (impact.technical.risks.length > 2) {
      result += `- 🛡️ **Risk Mitigation:** Develop prototypes to validate technical approaches\n`;
    }
    if (impact.business.value > 8) {
      result += `- 🚀 **High Value:** Prioritize this feature for next sprint planning\n`;
    }
    if (impact.technical.dependencies.length > 3) {
      result += `- 🔗 **Dependencies:** Review dependency management and consider parallel development\n`;
    }

    return createSuccessResponse(result);
  } catch (error) {
    return handleToolError(error, 'add_feature');
  }
}

/**
 * Create comprehensive project roadmaps with timeline visualization
 */
export async function createRoadmap(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    validateRepoConfig(config);

    const {
      title,
      time_horizon = 'quarterly',
      include_completed = false,
      include_dependencies = true,
      focus_areas = [],
      format = 'markdown'
    } = args;

    // Fetch project data
    const [milestones, issues, labels] = await Promise.all([
      config.octokit.rest.issues.listMilestones({
        owner: config.owner,
        repo: config.repo,
        state: include_completed ? 'all' : 'open',
        per_page: 100
      }),
      config.octokit.rest.issues.listForRepo({
        owner: config.owner,
        repo: config.repo,
        state: include_completed ? 'all' : 'open',
        per_page: 100
      }),
      config.octokit.rest.issues.listLabelsForRepo({
        owner: config.owner,
        repo: config.repo,
        per_page: 100
      })
    ]);

    const roadmapData = {
      title: title || `${config.repo} Project Roadmap`,
      timeHorizon: time_horizon,
      generatedAt: new Date().toISOString(),
      repository: `${config.owner}/${config.repo}`,
      milestones: milestones.data,
      issues: issues.data.filter(issue => !issue.pull_request),
      labels: labels.data,
      summary: {
        totalMilestones: milestones.data.length,
        totalIssues: issues.data.length,
        openMilestones: milestones.data.filter(m => m.state === 'open').length,
        openIssues: issues.data.filter(i => i.state === 'open').length
      }
    };

    let result = '';

    if (format === 'json') {
      result = JSON.stringify(roadmapData, null, 2);
    } else {
      result = generateRoadmapMarkdown(roadmapData, include_dependencies, focus_areas);
    }

    return createSuccessResponse(result);
  } catch (error) {
    return handleToolError(error, 'create_roadmap');
  }
}

// Helper functions for PRD generation
function generateFunctionalRequirements(features: string[], complexity: string): string[] {
  const baseRequirements = [
    'User authentication and authorization',
    'Data persistence and retrieval',
    'Input validation and error handling',
    'Core business logic implementation'
  ];

  if (complexity === 'high') {
    baseRequirements.push(
      'Advanced workflow management',
      'Real-time data synchronization',
      'Complex business rules engine',
      'Advanced analytics and reporting'
    );
  }

  features.forEach(feature => {
    baseRequirements.push(`Implementation of ${feature} functionality`);
  });

  return baseRequirements;
}

function generateNonFunctionalRequirements(complexity: string): string[] {
  const requirements = [
    'Performance: Response time < 2 seconds for 95% of requests',
    'Scalability: Support for concurrent users based on load requirements',
    'Security: Data encryption, secure authentication, input sanitization',
    'Reliability: 99.9% uptime SLA',
    'Maintainability: Clean code, documentation, automated testing'
  ];

  if (complexity === 'high') {
    requirements.push(
      'High Availability: Multi-region deployment with failover',
      'Performance: Sub-second response times for critical operations',
      'Compliance: GDPR, SOC2, or industry-specific compliance requirements'
    );
  }

  return requirements;
}

function generateTechnicalRequirements(features: string[], complexity: string): string[] {
  const requirements = [
    'Modern web framework (React, Vue, Angular, etc.)',
    'RESTful API design with OpenAPI documentation',
    'Database design with proper indexing and relationships',
    'Version control with Git and proper branching strategy',
    'Automated testing (unit, integration, e2e)',
    'CI/CD pipeline setup'
  ];

  if (complexity === 'high') {
    requirements.push(
      'Microservices architecture with API gateway',
      'Event-driven architecture with message queues',
      'Caching strategy (Redis, Memcached)',
      'Monitoring and observability (logs, metrics, tracing)',
      'Infrastructure as Code (Terraform, CloudFormation)'
    );
  }

  return requirements;
}

function generateUserStories(features: string[], targetAudience: string[]): any[] {
  const userStories = [];

  targetAudience.forEach(persona => {
    features.forEach(feature => {
      userStories.push({
        epic: `${persona} ${feature} Experience`,
        stories: [
          `As a ${persona}, I want to access ${feature} so that I can accomplish my goals efficiently`,
          `As a ${persona}, I want ${feature} to be intuitive so that I can use it without extensive training`,
          `As a ${persona}, I want reliable ${feature} functionality so that I can depend on it for my work`
        ]
      });
    });
  });

  return userStories;
}

function generateAcceptanceCriteria(features: string[]): string[] {
  const criteria = [
    'All functional requirements are implemented and tested',
    'User interface is responsive and accessible',
    'Performance meets specified benchmarks',
    'Security requirements are validated',
    'Error handling provides clear user feedback',
    'Documentation is complete and up-to-date'
  ];

  features.forEach(feature => {
    criteria.push(`${feature} functionality works as specified in user stories`);
  });

  return criteria;
}

function generateDependencies(features: string[], complexity: string): string[] {
  const dependencies = [
    'Development team availability',
    'Design system and UI/UX specifications',
    'Third-party service integrations',
    'Infrastructure and hosting environment'
  ];

  if (complexity === 'high') {
    dependencies.push(
      'Legacy system integration requirements',
      'Data migration from existing systems',
      'Compliance and security audit completion',
      'Performance testing environment setup'
    );
  }

  return dependencies;
}

function generateRisks(complexity: string, features: string[]): string[] {
  const risks = [
    'Scope creep affecting timeline',
    'Technical challenges requiring additional research',
    'Resource availability and team capacity',
    'Integration complexity with existing systems'
  ];

  if (complexity === 'high') {
    risks.push(
      'Performance bottlenecks under high load',
      'Security vulnerabilities in complex integrations',
      'Data consistency issues in distributed systems',
      'Compliance requirements changing during development'
    );
  }

  return risks;
}

function generateTimeline(timelineString: string, features: string[]): any[] {
  const phases = [
    {
      phase: 'Planning & Design',
      duration: '2-3 weeks',
      deliverables: [
        'Technical architecture document',
        'UI/UX designs and prototypes',
        'Project setup and environment configuration'
      ]
    },
    {
      phase: 'Core Development',
      duration: '6-8 weeks',
      deliverables: [
        'Core functionality implementation',
        'API development and documentation',
        'Database design and setup'
      ]
    },
    {
      phase: 'Feature Development',
      duration: '4-6 weeks',
      deliverables: features.map(feature => `${feature} feature implementation`)
    },
    {
      phase: 'Testing & Polish',
      duration: '2-3 weeks',
      deliverables: [
        'Comprehensive testing suite',
        'Performance optimization',
        'Bug fixes and refinements'
      ]
    },
    {
      phase: 'Deployment & Launch',
      duration: '1-2 weeks',
      deliverables: [
        'Production deployment',
        'User documentation',
        'Launch monitoring and support'
      ]
    }
  ];

  return phases;
}

function generateSuccessMetrics(objectives: string[], features: string[]): string[] {
  const metrics = [
    'User adoption rate and engagement metrics',
    'System performance and reliability metrics',
    'User satisfaction scores and feedback',
    'Business value delivered (ROI, efficiency gains)',
    'Code quality metrics (test coverage, maintainability)'
  ];

  objectives.forEach(objective => {
    metrics.push(`Metrics specific to: ${objective}`);
  });

  return metrics;
}

function formatPRDAsMarkdown(prd: PRDTemplate): string {
  let markdown = `# ${prd.title}\n\n`;
  
  markdown += `## Overview\n${prd.overview}\n\n`;
  
  markdown += `## Objectives\n`;
  prd.objectives.forEach(obj => {
    markdown += `- ${obj}\n`;
  });
  markdown += `\n`;

  markdown += `## Target Audience\n`;
  prd.targetAudience.forEach(audience => {
    markdown += `- ${audience}\n`;
  });
  markdown += `\n`;

  markdown += `## Requirements\n\n`;
  
  markdown += `### Functional Requirements\n`;
  prd.requirements.functional.forEach(req => {
    markdown += `- ${req}\n`;
  });
  markdown += `\n`;

  markdown += `### Non-Functional Requirements\n`;
  prd.requirements.nonFunctional.forEach(req => {
    markdown += `- ${req}\n`;
  });
  markdown += `\n`;

  markdown += `### Technical Requirements\n`;
  prd.requirements.technical.forEach(req => {
    markdown += `- ${req}\n`;
  });
  markdown += `\n`;

  markdown += `## User Stories\n\n`;
  prd.userStories.forEach((epic, index) => {
    markdown += `### Epic ${index + 1}: ${epic.epic}\n`;
    epic.stories.forEach(story => {
      markdown += `- ${story}\n`;
    });
    markdown += `\n`;
  });

  markdown += `## Acceptance Criteria\n`;
  prd.acceptanceCriteria.forEach(criteria => {
    markdown += `- ${criteria}\n`;
  });
  markdown += `\n`;

  markdown += `## Dependencies\n`;
  prd.dependencies.forEach(dep => {
    markdown += `- ${dep}\n`;
  });
  markdown += `\n`;

  markdown += `## Risks\n`;
  prd.risks.forEach(risk => {
    markdown += `- ${risk}\n`;
  });
  markdown += `\n`;

  markdown += `## Timeline\n\n`;
  prd.timeline.forEach((phase, index) => {
    markdown += `### Phase ${index + 1}: ${phase.phase}\n`;
    markdown += `**Duration:** ${phase.duration}\n\n`;
    markdown += `**Deliverables:**\n`;
    phase.deliverables.forEach(deliverable => {
      markdown += `- ${deliverable}\n`;
    });
    markdown += `\n`;
  });

  markdown += `## Success Metrics\n`;
  prd.successMetrics.forEach(metric => {
    markdown += `- ${metric}\n`;
  });
  markdown += `\n`;

  return markdown;
}

// Helper functions for parsing PRD
async function extractTasksFromPRD(prdContent: string): Promise<any[]> {
  const tasks: any[] = [];
  
  // Extract features from PRD content
  const featureRegex = /(?:feature|functionality|requirement):\s*(.+)/gi;
  let match;
  
  while ((match = featureRegex.exec(prdContent)) !== null) {
    const featureName = match[1].trim();
    tasks.push({
      title: `Implement ${featureName}`,
      description: `Implementation of ${featureName} functionality as specified in PRD`,
      category: 'feature',
      priority: 'medium',
      complexity: 3,
      effort: '3-5 days',
      dependencies: []
    });
  }

  // Add default tasks if none found
  if (tasks.length === 0) {
    tasks.push(
      {
        title: 'Project Setup and Architecture',
        description: 'Set up project structure, dependencies, and basic architecture',
        category: 'setup',
        priority: 'high',
        complexity: 2,
        effort: '1-2 days',
        dependencies: []
      },
      {
        title: 'Core Functionality Implementation',
        description: 'Implement core business logic and functionality',
        category: 'feature',
        priority: 'high',
        complexity: 5,
        effort: '1-2 weeks',
        dependencies: ['Project Setup and Architecture']
      },
      {
        title: 'User Interface Development',
        description: 'Create user interface components and interactions',
        category: 'frontend',
        priority: 'medium',
        complexity: 4,
        effort: '1 week',
        dependencies: ['Core Functionality Implementation']
      },
      {
        title: 'Testing and Quality Assurance',
        description: 'Comprehensive testing and quality assurance',
        category: 'testing',
        priority: 'high',
        complexity: 3,
        effort: '3-5 days',
        dependencies: ['User Interface Development']
      }
    );
  }

  return tasks;
}

function organizeTasksIntoEpics(tasks: any[]): any[] {
  const epics: any[] = [];
  const categories = tasks.reduce((acc, task) => {
    if (!acc[task.category]) {
      acc[task.category] = [];
    }
    acc[task.category].push(task);
    return acc;
  }, {} as Record<string, any[]>);

  Object.entries(categories).forEach(([category, categoryTasks]) => {
    epics.push({
      title: `${category.charAt(0).toUpperCase() + category.slice(1)} Epic`,
      description: `Epic containing all ${category} related tasks`,
      category,
      priority: categoryTasks.some(t => t.priority === 'high') ? 'high' : 'medium',
      tasks: categoryTasks
    });
  });

  return epics;
}

function formatEpicDescription(epic: any): string {
  let description = `# ${epic.title}\n\n`;
  description += `${epic.description}\n\n`;
  description += `**Category:** ${epic.category}\n`;
  description += `**Priority:** ${epic.priority}\n`;
  description += `**Tasks:** ${epic.tasks.length}\n\n`;
  description += `## Tasks Overview\n`;
  epic.tasks.forEach((task: any, index: number) => {
    description += `${index + 1}. **${task.title}** (${task.complexity}sp)\n`;
  });
  return description;
}

function formatTaskDescription(task: any, epicNumber: number): string {
  let description = `Part of Epic: #${epicNumber}\n\n`;
  description += `**Description:** ${task.description}\n\n`;
  description += `**Details:**\n`;
  description += `- **Category:** ${task.category}\n`;
  description += `- **Priority:** ${task.priority}\n`;
  description += `- **Complexity:** ${task.complexity} story points\n`;
  description += `- **Estimated Effort:** ${task.effort}\n`;
  
  if (task.dependencies.length > 0) {
    description += `- **Dependencies:** ${task.dependencies.join(', ')}\n`;
  }
  
  description += `\n## Acceptance Criteria\n`;
  description += `- [ ] Implementation meets requirements specified in PRD\n`;
  description += `- [ ] Code is properly tested\n`;
  description += `- [ ] Documentation is updated\n`;
  description += `- [ ] Code review completed\n`;

  return description;
}

// Helper functions for enhancing PRD
function analyzePRDCompleteness(prdContent: string): any {
  const requiredSections = [
    'overview', 'objectives', 'requirements', 'user stories',
    'acceptance criteria', 'timeline', 'risks', 'dependencies'
  ];
  
  const foundSections = requiredSections.filter(section => 
    prdContent.toLowerCase().includes(section)
  );
  
  const completeness = Math.round((foundSections.length / requiredSections.length) * 100);
  
  return {
    completeness,
    strengths: foundSections.map(section => `${section.charAt(0).toUpperCase() + section.slice(1)} section is present`),
    gaps: requiredSections.filter(section => !foundSections.includes(section))
      .map(section => `Missing ${section} section`)
  };
}

function generateMarketAnalysis(prdContent: string): string {
  return `## 🎯 **Market Analysis**\n\n` +
    `### Competitive Landscape\n` +
    `- Research existing solutions in the market\n` +
    `- Identify key differentiators and competitive advantages\n` +
    `- Analyze pricing strategies and business models\n\n` +
    `### Target Market Size\n` +
    `- Define total addressable market (TAM)\n` +
    `- Identify serviceable addressable market (SAM)\n` +
    `- Estimate serviceable obtainable market (SOM)\n\n` +
    `### User Research Insights\n` +
    `- Conduct user interviews and surveys\n` +
    `- Create detailed user personas\n` +
    `- Map user journey and pain points\n\n`;
}

function generateTechnicalAnalysis(prdContent: string): string {
  return `## 🔧 **Technical Analysis**\n\n` +
    `### Architecture Recommendations\n` +
    `- Evaluate microservices vs monolithic architecture\n` +
    `- Consider event-driven architecture for scalability\n` +
    `- Plan for API-first design approach\n\n` +
    `### Technology Stack Evaluation\n` +
    `- Frontend: React/Vue/Angular comparison\n` +
    `- Backend: Node.js/Python/Java/.NET analysis\n` +
    `- Database: SQL vs NoSQL requirements\n` +
    `- Cloud platform: AWS/Azure/GCP evaluation\n\n` +
    `### Scalability Considerations\n` +
    `- Load balancing and auto-scaling strategies\n` +
    `- Caching layers (CDN, Redis, in-memory)\n` +
    `- Database sharding and replication\n` +
    `- Message queues for async processing\n\n`;
}

function generateRiskAnalysis(prdContent: string): string {
  return `## ⚠️ **Risk Analysis**\n\n` +
    `### Technical Risks\n` +
    `- **High:** Performance bottlenecks under load\n` +
    `- **Medium:** Third-party service dependencies\n` +
    `- **Low:** Technology stack compatibility\n\n` +
    `### Business Risks\n` +
    `- **High:** Market timing and competition\n` +
    `- **Medium:** User adoption challenges\n` +
    `- **Low:** Pricing strategy effectiveness\n\n` +
    `### Project Risks\n` +
    `- **High:** Scope creep and timeline delays\n` +
    `- **Medium:** Team capacity and skill gaps\n` +
    `- **Low:** Tool and infrastructure issues\n\n` +
    `### Mitigation Strategies\n` +
    `- Implement phased rollout approach\n` +
    `- Create comprehensive testing strategy\n` +
    `- Establish clear communication protocols\n` +
    `- Plan for contingency scenarios\n\n`;
}

function generateEnhancedMetrics(prdContent: string): string {
  return `## 📊 **Enhanced Success Metrics**\n\n` +
    `### Product Metrics\n` +
    `- Monthly Active Users (MAU) growth\n` +
    `- Daily Active Users (DAU) engagement\n` +
    `- User retention rates (1-day, 7-day, 30-day)\n` +
    `- Feature adoption and usage analytics\n\n` +
    `### Business Metrics\n` +
    `- Customer Acquisition Cost (CAC)\n` +
    `- Customer Lifetime Value (CLV)\n` +
    `- Monthly Recurring Revenue (MRR) growth\n` +
    `- Net Promoter Score (NPS)\n\n` +
    `### Technical Metrics\n` +
    `- System uptime and availability (99.9% SLA)\n` +
    `- Response time (p95 < 2 seconds)\n` +
    `- Error rate (< 0.1% of requests)\n` +
    `- Code coverage (> 80%)\n\n` +
    `### Quality Metrics\n` +
    `- Customer satisfaction scores\n` +
    `- Support ticket volume and resolution time\n` +
    `- Bug report frequency and severity\n` +
    `- User feedback and feature requests\n\n`;
}

function generateRecommendations(analysis: any, enhancementType: string): string {
  let recommendations = `## 💡 **Recommendations**\n\n`;
  
  recommendations += `### Immediate Actions\n`;
  analysis.gaps.forEach((gap: string) => {
    recommendations += `- 🎯 Address ${gap.toLowerCase()}\n`;
  });
  
  recommendations += `\n### Strategic Improvements\n`;
  recommendations += `- 📈 Conduct user research to validate assumptions\n`;
  recommendations += `- 🔍 Perform competitive analysis for positioning\n`;
  recommendations += `- 🎨 Create detailed wireframes and prototypes\n`;
  recommendations += `- 🧪 Plan for A/B testing and experimentation\n`;
  
  recommendations += `\n### Next Steps\n`;
  recommendations += `- 📋 Prioritize requirements based on business value\n`;
  recommendations += `- 👥 Stakeholder review and approval process\n`;
  recommendations += `- 🗓️ Create detailed project timeline and milestones\n`;
  recommendations += `- 🚀 Begin technical architecture planning\n\n`;

  return recommendations;
}

// Helper functions for feature impact analysis
async function analyzeCurrentProjectState(config: GitHubConfig): Promise<any> {
  const [issues, milestones, labels, branches] = await Promise.all([
    config.octokit.rest.issues.listForRepo({
      owner: config.owner,
      repo: config.repo,
      state: 'all',
      per_page: 100
    }),
    config.octokit.rest.issues.listMilestones({
      owner: config.owner,
      repo: config.repo,
      state: 'all',
      per_page: 100
    }),
    config.octokit.rest.issues.listLabelsForRepo({
      owner: config.owner,
      repo: config.repo,
      per_page: 100
    }),
    config.octokit.rest.repos.listBranches({
      owner: config.owner,
      repo: config.repo,
      per_page: 100
    })
  ]);

  return {
    totalIssues: issues.data.length,
    openIssues: issues.data.filter(i => i.state === 'open').length,
    milestones: milestones.data,
    labels: labels.data,
    branches: branches.data.length,
    complexity: calculateProjectComplexity(issues.data, milestones.data)
  };
}

function calculateProjectComplexity(issues: any[], milestones: any[]): number {
  let complexity = 1;
  
  // Base complexity on number of issues
  if (issues.length > 100) complexity += 2;
  else if (issues.length > 50) complexity += 1;
  
  // Add complexity for milestones
  if (milestones.length > 10) complexity += 2;
  else if (milestones.length > 5) complexity += 1;
  
  // Add complexity for label diversity
  const labelTypes = new Set(issues.flatMap(i => i.labels.map((l: any) => l.name)));
  if (labelTypes.size > 20) complexity += 1;
  
  return Math.min(complexity, 10);
}

async function analyzeFeatureImpact(config: GitHubConfig, feature: any, projectState: any): Promise<FeatureImpact> {
  const technical = {
    complexity: calculateFeatureComplexity(feature, projectState),
    effort: estimateEffort(feature, projectState),
    risks: identifyTechnicalRisks(feature, projectState),
    dependencies: identifyDependencies(feature, projectState)
  };

  const business = {
    value: calculateBusinessValue(feature),
    priority: feature.priority,
    stakeholders: identifyStakeholders(feature),
    metrics: generateFeatureMetrics(feature)
  };

  const user = {
    personas: identifyUserPersonas(feature),
    journeys: identifyUserJourneys(feature),
    benefits: identifyUserBenefits(feature)
  };

  return { technical, business, user };
}

function calculateFeatureComplexity(feature: any, projectState: any): number {
  let complexity = 3; // Base complexity
  
  // Add complexity based on description length and keywords
  if (feature.description && feature.description.length > 500) complexity += 1;
  
  // Add complexity based on project state
  complexity += Math.floor(projectState.complexity / 3);
  
  // Add complexity based on priority
  if (feature.priority === 'high') complexity += 1;
  
  return Math.min(complexity, 10);
}

function estimateEffort(feature: any, projectState: any): string {
  const complexity = calculateFeatureComplexity(feature, projectState);
  
  if (complexity <= 3) return '1-2 weeks';
  if (complexity <= 6) return '2-4 weeks';
  if (complexity <= 8) return '1-2 months';
  return '2+ months';
}

function identifyTechnicalRisks(feature: any, projectState: any): string[] {
  const risks = [];
  
  if (projectState.complexity > 7) {
    risks.push('High project complexity may lead to integration challenges');
  }
  
  if (feature.description && feature.description.toLowerCase().includes('integration')) {
    risks.push('Third-party integration complexity and reliability concerns');
  }
  
  if (feature.description && feature.description.toLowerCase().includes('performance')) {
    risks.push('Performance optimization requirements may extend timeline');
  }
  
  return risks;
}

function identifyDependencies(feature: any, projectState: any): string[] {
  const dependencies = [];
  
  if (projectState.openIssues > 10) {
    dependencies.push('Resolution of existing open issues');
  }
  
  dependencies.push('Technical architecture review');
  dependencies.push('UI/UX design approval');
  
  if (feature.priority === 'high') {
    dependencies.push('Resource allocation and team availability');
  }
  
  return dependencies;
}

function calculateBusinessValue(feature: any): number {
  let value = 5; // Base value
  
  if (feature.priority === 'high') value += 3;
  else if (feature.priority === 'medium') value += 1;
  
  if (feature.description && feature.description.toLowerCase().includes('revenue')) value += 2;
  if (feature.description && feature.description.toLowerCase().includes('user')) value += 1;
  
  return Math.min(value, 10);
}

function identifyStakeholders(feature: any): string[] {
  const stakeholders = ['Product Manager', 'Engineering Team'];
  
  if (feature.description && feature.description.toLowerCase().includes('user')) {
    stakeholders.push('User Experience Team');
  }
  
  if (feature.description && feature.description.toLowerCase().includes('business')) {
    stakeholders.push('Business Stakeholders');
  }
  
  stakeholders.push('Quality Assurance Team');
  
  return stakeholders;
}

function generateFeatureMetrics(feature: any): string[] {
  return [
    'Feature adoption rate',
    'User engagement with new feature',
    'Performance impact measurement',
    'User satisfaction feedback',
    'Business value delivered'
  ];
}

function identifyUserPersonas(feature: any): string[] {
  const personas = ['Primary Users'];
  
  if (feature.description && feature.description.toLowerCase().includes('admin')) {
    personas.push('Administrators');
  }
  
  if (feature.description && feature.description.toLowerCase().includes('developer')) {
    personas.push('Developers');
  }
  
  return personas;
}

function identifyUserJourneys(feature: any): string[] {
  return [
    'Feature discovery and onboarding',
    'Regular feature usage workflow',
    'Advanced feature utilization',
    'Support and help-seeking behavior'
  ];
}

function identifyUserBenefits(feature: any): string[] {
  const benefits = ['Improved user experience'];
  
  if (feature.description && feature.description.toLowerCase().includes('efficiency')) {
    benefits.push('Increased productivity and efficiency');
  }
  
  if (feature.description && feature.description.toLowerCase().includes('automation')) {
    benefits.push('Reduced manual effort through automation');
  }
  
  benefits.push('Enhanced feature capabilities');
  
  return benefits;
}

function generateImplementationPlan(featureName: string, description: string, impact: FeatureImpact): any {
  const phases = [
    {
      name: 'Research & Planning',
      duration: '1 week',
      deliverables: [
        'Technical research and feasibility analysis',
        'Detailed feature specification document',
        'UI/UX mockups and user flow design'
      ]
    },
    {
      name: 'Core Development',
      duration: impact.technical.effort,
      deliverables: [
        'Backend API implementation',
        'Frontend component development',
        'Database schema updates'
      ]
    },
    {
      name: 'Integration & Testing',
      duration: '1-2 weeks',
      deliverables: [
        'Integration with existing systems',
        'Comprehensive testing suite',
        'Performance optimization'
      ]
    },
    {
      name: 'Documentation & Launch',
      duration: '3-5 days',
      deliverables: [
        'User documentation and help guides',
        'Developer documentation updates',
        'Feature launch and monitoring'
      ]
    }
  ];

  return { phases };
}

function formatFeatureEpic(name: string, description: string, impact: FeatureImpact, plan: any): string {
  let epic = `# 🎯 Feature Epic: ${name}\n\n`;
  epic += `${description}\n\n`;
  
  epic += `## 📊 Impact Analysis\n\n`;
  epic += `**Technical Complexity:** ${impact.technical.complexity}/10\n`;
  epic += `**Business Value:** ${impact.business.value}/10\n`;
  epic += `**Estimated Effort:** ${impact.technical.effort}\n\n`;
  
  epic += `## 🚀 Implementation Plan\n\n`;
  plan.phases.forEach((phase: any, index: number) => {
    epic += `### Phase ${index + 1}: ${phase.name}\n`;
    epic += `**Duration:** ${phase.duration}\n\n`;
    epic += `**Deliverables:**\n`;
    phase.deliverables.forEach((deliverable: string) => {
      epic += `- ${deliverable}\n`;
    });
    epic += `\n`;
  });
  
  return epic;
}

// Helper function for roadmap generation
function generateRoadmapMarkdown(roadmapData: any, includeDependencies: boolean, focusAreas: string[]): string {
  let markdown = `# 🗺️ ${roadmapData.title}\n\n`;
  
  markdown += `**Generated:** ${new Date(roadmapData.generatedAt).toLocaleDateString()}\n`;
  markdown += `**Repository:** ${roadmapData.repository}\n`;
  markdown += `**Time Horizon:** ${roadmapData.timeHorizon}\n\n`;
  
  markdown += `## 📊 Project Overview\n\n`;
  markdown += `- **Total Milestones:** ${roadmapData.summary.totalMilestones}\n`;
  markdown += `- **Open Milestones:** ${roadmapData.summary.openMilestones}\n`;
  markdown += `- **Total Issues:** ${roadmapData.summary.totalIssues}\n`;
  markdown += `- **Open Issues:** ${roadmapData.summary.openIssues}\n\n`;
  
  markdown += `## 🎯 Milestones\n\n`;
  roadmapData.milestones.forEach((milestone: any) => {
    const progress = milestone.open_issues + milestone.closed_issues > 0 
      ? Math.round((milestone.closed_issues / (milestone.open_issues + milestone.closed_issues)) * 100) 
      : 0;
    
    markdown += `### ${milestone.title}\n`;
    markdown += `- **Progress:** ${progress}% (${milestone.closed_issues}/${milestone.open_issues + milestone.closed_issues} issues)\n`;
    markdown += `- **Due Date:** ${milestone.due_on ? new Date(milestone.due_on).toLocaleDateString() : 'Not set'}\n`;
    markdown += `- **Status:** ${milestone.state}\n`;
    if (milestone.description) {
      markdown += `- **Description:** ${milestone.description}\n`;
    }
    markdown += `\n`;
  });
  
  // Add issue breakdown if requested
  if (focusAreas.length > 0) {
    markdown += `## 📋 Focus Area Breakdown\n\n`;
    focusAreas.forEach(area => {
      const areaIssues = roadmapData.issues.filter((issue: any) => 
        issue.labels.some((label: any) => label.name.toLowerCase().includes(area.toLowerCase()))
      );
      
      if (areaIssues.length > 0) {
        markdown += `### ${area}\n`;
        markdown += `**Issues:** ${areaIssues.length}\n\n`;
        areaIssues.slice(0, 5).forEach((issue: any) => {
          markdown += `- [${issue.title}](${issue.html_url}) (#${issue.number})\n`;
        });
        if (areaIssues.length > 5) {
          markdown += `- ... and ${areaIssues.length - 5} more\n`;
        }
        markdown += `\n`;
      }
    });
  }
  
  return markdown;
}
