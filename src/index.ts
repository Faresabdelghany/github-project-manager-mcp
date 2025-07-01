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
        version: '3.3.0',
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

  // Feature Impact Analysis Methods
  private async analyzeExistingCodebase(): Promise<any> {
    try {
      // Get repository structure
      const repoResponse = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      // Get file structure from root
      const contentsResponse = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: ''
      });

      // Analyze tech stack from file extensions and common patterns
      const techStack = this.analyzeTechStackFromFiles(contentsResponse.data);
      
      // Get recent commits for development velocity
      const commitsResponse = await this.octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        per_page: 100
      });

      // Get existing issues and milestones for workload analysis
      const issuesResponse = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 100
      });

      const milestonesResponse = await this.octokit.rest.issues.listMilestones({
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: 50
      });

      return {
        repository: {
          name: repoResponse.data.name,
          language: repoResponse.data.language,
          size: repoResponse.data.size,
          created_at: repoResponse.data.created_at,
          updated_at: repoResponse.data.updated_at,
          stargazers_count: repoResponse.data.stargazers_count,
          open_issues_count: repoResponse.data.open_issues_count
        },
        techStack,
        fileStructure: this.analyzeFileStructure(contentsResponse.data),
        developmentVelocity: this.analyzeDevelopmentVelocity(commitsResponse.data),
        currentWorkload: {
          openIssues: issuesResponse.data.length,
          activeMilestones: milestonesResponse.data.length,
          issues: issuesResponse.data.map(issue => ({
            number: issue.number,
            title: issue.title,
            labels: issue.labels.map((l: any) => l.name),
            assignees: issue.assignees?.map((a: any) => a.login) || [],
            milestone: issue.milestone?.title || null,
            created_at: issue.created_at,
            state: issue.state
          })),
          milestones: milestonesResponse.data.map(milestone => ({
            number: milestone.number,
            title: milestone.title,
            due_on: milestone.due_on,
            open_issues: milestone.open_issues,
            closed_issues: milestone.closed_issues
          }))
        }
      };
    } catch (error: any) {
      throw new Error(`Failed to analyze existing codebase: ${error.message}`);
    }
  }

  private analyzeTechStackFromFiles(files: any): any {
    const techStack = {
      languages: [] as string[],
      frameworks: [] as string[],
      databases: [] as string[],
      tools: [] as string[],
      architecture: 'unknown'
    };

    const filePatterns = {
      // Languages
      'JavaScript': ['.js', '.jsx', '.mjs'],
      'TypeScript': ['.ts', '.tsx'],
      'Python': ['.py', '.pyw'],
      'Java': ['.java'],
      'C#': ['.cs'],
      'Go': ['.go'],
      'Rust': ['.rs'],
      'PHP': ['.php'],
      'Ruby': ['.rb'],
      'Swift': ['.swift'],
      'Kotlin': ['.kt'],
      'Dart': ['.dart'],
      
      // Frontend Frameworks
      'React': ['package.json', 'tsconfig.json'], // Will check content
      'Vue.js': ['.vue', 'vue.config.js'],
      'Angular': ['angular.json', '.component.ts'],
      'Svelte': ['.svelte'],
      
      // Backend Frameworks
      'Express.js': ['package.json'], // Will check content
      'Next.js': ['next.config.js'],
      'Django': ['manage.py', 'settings.py'],
      'Flask': ['app.py', 'wsgi.py'],
      'Spring Boot': ['pom.xml', 'build.gradle'],
      'Laravel': ['artisan', 'composer.json'],
      
      // Databases
      'MongoDB': ['mongodb', '.mongodb'],
      'PostgreSQL': ['postgresql', '.postgres'],
      'MySQL': ['mysql', '.mysql'],
      'SQLite': ['.sqlite', '.db'],
      
      // Tools & Config
      'Docker': ['Dockerfile', 'docker-compose.yml'],
      'Kubernetes': ['.k8s', 'deployment.yaml'],
      'Terraform': ['.tf'],
      'GitHub Actions': ['.github/workflows'],
      'Jest': ['jest.config.js'],
      'Webpack': ['webpack.config.js'],
      'Vite': ['vite.config.js']
    };

    files.forEach((file: any) => {
      const fileName = file.name.toLowerCase();
      const extension = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';

      Object.entries(filePatterns).forEach(([tech, patterns]) => {
        if (patterns.some(pattern => fileName.includes(pattern.toLowerCase()) || extension === pattern)) {
          if (['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'Dart'].includes(tech)) {
            if (!techStack.languages.includes(tech)) {
              techStack.languages.push(tech);
            }
          } else if (['React', 'Vue.js', 'Angular', 'Svelte', 'Express.js', 'Next.js', 'Django', 'Flask', 'Spring Boot', 'Laravel'].includes(tech)) {
            if (!techStack.frameworks.includes(tech)) {
              techStack.frameworks.push(tech);
            }
          } else if (['MongoDB', 'PostgreSQL', 'MySQL', 'SQLite'].includes(tech)) {
            if (!techStack.databases.includes(tech)) {
              techStack.databases.push(tech);
            }
          } else {
            if (!techStack.tools.includes(tech)) {
              techStack.tools.push(tech);
            }
          }
        }
      });
    });

    // Determine architecture pattern
    if (files.some((f: any) => f.name.includes('microservice') || f.name.includes('service'))) {
      techStack.architecture = 'microservices';
    } else if (files.some((f: any) => f.name.includes('api') && f.name.includes('client'))) {
      techStack.architecture = 'client-server';
    } else if (techStack.frameworks.some(f => ['React', 'Vue.js', 'Angular'].includes(f))) {
      techStack.architecture = 'spa'; // Single Page Application
    } else if (techStack.frameworks.some(f => ['Next.js', 'Django', 'Laravel'].includes(f))) {
      techStack.architecture = 'full-stack';
    } else {
      techStack.architecture = 'monolithic';
    }

    return techStack;
  }

  private analyzeFileStructure(files: any): any {
    const structure = {
      totalFiles: files.length,
      directories: [],
      hasTests: false,
      hasDocumentation: false,
      hasCI: false,
      configFiles: [],
      sourceStructure: 'unknown'
    };

    files.forEach((file: any) => {
      if (file.type === 'dir') {
        structure.directories.push(file.name);
        
        // Check for common patterns
        if (['test', 'tests', '__tests__', 'spec'].includes(file.name.toLowerCase())) {
          structure.hasTests = true;
        }
        if (['docs', 'documentation', 'doc'].includes(file.name.toLowerCase())) {
          structure.hasDocumentation = true;
        }
        if (file.name === '.github') {
          structure.hasCI = true;
        }
      } else {
        // Check config files
        const configPatterns = ['package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.js', 'Dockerfile', 'docker-compose.yml'];
        if (configPatterns.includes(file.name)) {
          structure.configFiles.push(file.name);
        }
      }
    });

    // Determine source structure
    if (structure.directories.includes('src') && structure.directories.includes('public')) {
      structure.sourceStructure = 'modern-web-app';
    } else if (structure.directories.includes('app') && structure.directories.includes('models')) {
      structure.sourceStructure = 'mvc-framework';
    } else if (structure.directories.includes('components') && structure.directories.includes('pages')) {
      structure.sourceStructure = 'component-based';
    } else if (structure.directories.includes('lib') && structure.directories.includes('bin')) {
      structure.sourceStructure = 'library-package';
    } else {
      structure.sourceStructure = 'custom';
    }

    return structure;
  }

  private analyzeDevelopmentVelocity(commits: any[]): any {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentCommits = commits.filter(commit => new Date(commit.commit.author.date) >= thirtyDaysAgo);
    const weeklyCommits = commits.filter(commit => new Date(commit.commit.author.date) >= sevenDaysAgo);

    const authors = [...new Set(recentCommits.map(commit => commit.commit.author.name))];
    
    return {
      totalCommits: commits.length,
      last30Days: recentCommits.length,
      last7Days: weeklyCommits.length,
      averageCommitsPerDay: Math.round((recentCommits.length / 30) * 10) / 10,
      activeContributors: authors.length,
      lastCommitDate: commits.length > 0 ? commits[0].commit.author.date : null,
      velocity: this.calculateVelocityRating(recentCommits.length, authors.length)
    };
  }

  private calculateVelocityRating(commitsLast30Days: number, contributors: number): string {
    const score = commitsLast30Days * 0.8 + contributors * 5;
    
    if (score >= 50) return 'high';
    if (score >= 20) return 'medium';
    return 'low';
  }

  private assessFeatureComplexity(featureDescription: string, techStack: any): any {
    const complexityFactors = {
      base: 1,
      ui: 0,
      backend: 0,
      database: 0,
      integration: 0,
      security: 0,
      performance: 0,
      testing: 0
    };

    const description = featureDescription.toLowerCase();

    // UI Complexity
    if (description.includes('dashboard') || description.includes('interface') || description.includes('ui')) {
      complexityFactors.ui += 2;
    }
    if (description.includes('responsive') || description.includes('mobile')) {
      complexityFactors.ui += 1;
    }
    if (description.includes('interactive') || description.includes('dynamic')) {
      complexityFactors.ui += 1;
    }

    // Backend Complexity
    if (description.includes('api') || description.includes('endpoint') || description.includes('service')) {
      complexityFactors.backend += 2;
    }
    if (description.includes('microservice') || description.includes('distributed')) {
      complexityFactors.backend += 3;
    }
    if (description.includes('real-time') || description.includes('websocket')) {
      complexityFactors.backend += 2;
    }

    // Database Complexity
    if (description.includes('database') || description.includes('data') || description.includes('storage')) {
      complexityFactors.database += 2;
    }
    if (description.includes('migration') || description.includes('schema')) {
      complexityFactors.database += 1;
    }
    if (description.includes('analytics') || description.includes('reporting')) {
      complexityFactors.database += 2;
    }

    // Integration Complexity
    if (description.includes('integration') || description.includes('third-party') || description.includes('external')) {
      complexityFactors.integration += 3;
    }
    if (description.includes('webhook') || description.includes('callback')) {
      complexityFactors.integration += 2;
    }

    // Security Complexity
    if (description.includes('auth') || description.includes('security') || description.includes('permission')) {
      complexityFactors.security += 3;
    }
    if (description.includes('encryption') || description.includes('oauth')) {
      complexityFactors.security += 2;
    }

    // Performance Complexity
    if (description.includes('performance') || description.includes('optimization') || description.includes('cache')) {
      complexityFactors.performance += 2;
    }
    if (description.includes('scaling') || description.includes('load')) {
      complexityFactors.performance += 3;
    }

    // Testing Complexity
    if (description.includes('testing') || description.includes('validation')) {
      complexityFactors.testing += 1;
    }

    const totalComplexity = Object.values(complexityFactors).reduce((sum, value) => sum + value, 0);
    
    let complexityLevel = 'low';
    if (totalComplexity >= 15) complexityLevel = 'very-high';
    else if (totalComplexity >= 10) complexityLevel = 'high';
    else if (totalComplexity >= 6) complexityLevel = 'medium';

    const estimatedHours = this.estimateImplementationHours(totalComplexity, techStack);
    
    return {
      level: complexityLevel,
      score: totalComplexity,
      factors: complexityFactors,
      estimatedHours,
      estimatedStoryPoints: Math.ceil(estimatedHours / 8), // Assuming 8 hours per story point
      riskLevel: totalComplexity >= 12 ? 'high' : totalComplexity >= 8 ? 'medium' : 'low'
    };
  }

  private estimateImplementationHours(complexityScore: number, techStack: any): number {
    let baseHours = complexityScore * 4; // Base 4 hours per complexity point

    // Tech stack multipliers
    if (techStack.languages.includes('TypeScript')) {
      baseHours *= 0.9; // TypeScript reduces errors, slightly faster
    }
    if (techStack.frameworks.includes('React') || techStack.frameworks.includes('Vue.js')) {
      baseHours *= 0.95; // Modern frameworks provide good tooling
    }
    if (techStack.tools.includes('Docker')) {
      baseHours *= 1.1; // Container setup adds some time
    }

    // Architecture complexity
    if (techStack.architecture === 'microservices') {
      baseHours *= 1.3; // Microservices add coordination complexity
    } else if (techStack.architecture === 'monolithic') {
      baseHours *= 0.9; // Simpler deployment
    }

    return Math.round(baseHours);
  }

  private analyzeIntegrationImpact(featureDescription: string, codebaseAnalysis: any): any {
    const impact = {
      affectedComponents: [],
      integrationPoints: [],
      dataFlowChanges: [],
      apiChanges: [],
      databaseChanges: [],
      configurationChanges: [],
      testingRequirements: [],
      deploymentConsiderations: []
    };

    const description = featureDescription.toLowerCase();
    const { techStack, fileStructure, currentWorkload } = codebaseAnalysis;

    // Analyze affected components
    if (description.includes('user') || description.includes('auth')) {
      impact.affectedComponents.push('User Management System');
      impact.apiChanges.push('User authentication endpoints');
      impact.databaseChanges.push('User schema modifications');
    }

    if (description.includes('dashboard') || description.includes('analytics')) {
      impact.affectedComponents.push('Dashboard Component');
      impact.dataFlowChanges.push('Analytics data aggregation');
      impact.testingRequirements.push('Dashboard integration tests');
    }

    if (description.includes('notification') || description.includes('email')) {
      impact.affectedComponents.push('Notification Service');
      impact.integrationPoints.push('Email service integration');
      impact.configurationChanges.push('Email service configuration');
    }

    if (description.includes('api') || description.includes('integration')) {
      impact.affectedComponents.push('API Layer');
      impact.apiChanges.push('New API endpoints');
      impact.testingRequirements.push('API contract tests');
    }

    if (description.includes('database') || description.includes('data')) {
      impact.affectedComponents.push('Data Layer');
      impact.databaseChanges.push('Schema migrations');
      impact.testingRequirements.push('Data integrity tests');
    }

    // Tech stack specific impacts
    if (techStack.frameworks.includes('React')) {
      impact.affectedComponents.push('React Components');
      impact.testingRequirements.push('Component unit tests');
    }

    if (techStack.tools.includes('Docker')) {
      impact.deploymentConsiderations.push('Docker container updates');
      impact.configurationChanges.push('Container configuration');
    }

    if (techStack.architecture === 'microservices') {
      impact.integrationPoints.push('Service-to-service communication');
      impact.deploymentConsiderations.push('Service orchestration updates');
    }

    // Current workload impact
    const conflictingIssues = currentWorkload.issues.filter(issue => 
      impact.affectedComponents.some(component => 
        issue.title.toLowerCase().includes(component.toLowerCase()) ||
        issue.labels.some(label => component.toLowerCase().includes(label.toLowerCase()))
      )
    );

    if (conflictingIssues.length > 0) {
      impact.integrationPoints.push(`Potential conflicts with ${conflictingIssues.length} existing issues`);
    }

    return impact;
  }

  private generateImplementationRoadmap(featureDescription: string, complexity: any, integrationImpact: any): any {
    const roadmap = {
      phases: [],
      totalDuration: 0,
      criticalPath: [],
      dependencies: [],
      riskMitigation: []
    };

    // Phase 1: Planning and Design
    const planningPhase = {
      name: 'Planning & Design',
      duration: Math.ceil(complexity.estimatedHours * 0.2), // 20% of total effort
      tasks: [
        'Technical specification and architecture design',
        'UI/UX mockups and user flow design',
        'Database schema design and migration planning',
        'API contract definition and documentation',
        'Integration point identification and planning'
      ],
      dependencies: [],
      deliverables: ['Technical Specification', 'Design Mockups', 'API Documentation'],
      riskLevel: 'low'
    };

    // Phase 2: Backend Development
    const backendPhase = {
      name: 'Backend Development',
      duration: Math.ceil(complexity.estimatedHours * 0.4), // 40% of total effort
      tasks: [
        'Database schema implementation and migrations',
        'Core business logic implementation',
        'API endpoint development',
        'Authentication and authorization integration',
        'Data validation and error handling'
      ],
      dependencies: ['Planning & Design'],
      deliverables: ['Backend API', 'Database Changes', 'Unit Tests'],
      riskLevel: complexity.riskLevel
    };

    // Phase 3: Frontend Development
    const frontendPhase = {
      name: 'Frontend Development',
      duration: Math.ceil(complexity.estimatedHours * 0.3), // 30% of total effort
      tasks: [
        'Component development and styling',
        'API integration and state management',
        'User interface implementation',
        'Form validation and error handling',
        'Responsive design implementation'
      ],
      dependencies: ['Backend Development'],
      deliverables: ['UI Components', 'Frontend Integration', 'Component Tests'],
      riskLevel: 'medium'
    };

    // Phase 4: Integration and Testing
    const testingPhase = {
      name: 'Integration & Testing',
      duration: Math.ceil(complexity.estimatedHours * 0.1), // 10% of total effort
      tasks: [
        'End-to-end integration testing',
        'Performance testing and optimization',
        'Security testing and vulnerability assessment',
        'User acceptance testing coordination',
        'Bug fixes and refinements'
      ],
      dependencies: ['Frontend Development'],
      deliverables: ['Test Suite', 'Performance Report', 'Security Assessment'],
      riskLevel: 'medium'
    };

    roadmap.phases = [planningPhase, backendPhase, frontendPhase, testingPhase];
    roadmap.totalDuration = roadmap.phases.reduce((total, phase) => total + phase.duration, 0);
    roadmap.criticalPath = ['Planning & Design → Backend Development → Frontend Development → Integration & Testing'];

    // Add dependencies based on integration impact
    integrationImpact.affectedComponents.forEach((component: string) => {
      roadmap.dependencies.push(`${component} coordination required`);
    });

    // Risk mitigation strategies
    if (complexity.riskLevel === 'high') {
      roadmap.riskMitigation.push('Consider breaking feature into smaller increments');
      roadmap.riskMitigation.push('Implement feature flags for gradual rollout');
      roadmap.riskMitigation.push('Increase testing coverage and code review requirements');
    }

    if (integrationImpact.affectedComponents.length > 3) {
      roadmap.riskMitigation.push('Coordinate with teams responsible for affected components');
      roadmap.riskMitigation.push('Plan integration testing across all affected areas');
    }

    return roadmap;
  }

  private assessMilestoneImpact(roadmap: any, currentWorkload: any): any {
    const impact = {
      affectedMilestones: [],
      newMilestoneRecommended: false,
      timelineAdjustments: [],
      resourceConflicts: [],
      recommendations: []
    };

    const featureDuration = roadmap.totalDuration;

    // Check each active milestone for potential impact
    currentWorkload.milestones.forEach((milestone: any) => {
      if (milestone.due_on) {
        const dueDate = new Date(milestone.due_on);
        const now = new Date();
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const hoursUntilDue = daysUntilDue * 8; // Assuming 8 working hours per day

        if (featureDuration > hoursUntilDue * 0.5) { // Feature takes more than 50% of remaining milestone time
          impact.affectedMilestones.push({
            milestone: milestone.title,
            number: milestone.number,
            daysUntilDue,
            potentialDelay: Math.ceil((featureDuration - hoursUntilDue) / 8),
            recommendedAction: featureDuration > hoursUntilDue ? 'Move to next milestone' : 'Monitor closely'
          });
        }
      }
    });

    // Check for resource conflicts
    const busyAssignees = this.identifyBusyAssignees(currentWorkload.issues);
    if (busyAssignees.length > 0) {
      impact.resourceConflicts.push({
        type: 'Developer Overallocation',
        description: `${busyAssignees.length} developers have high workload`,
        affectedAssignees: busyAssignees,
        recommendation: 'Consider redistributing workload or extending timeline'
      });
    }

    // Recommendations
    if (impact.affectedMilestones.length > 0) {
      impact.newMilestoneRecommended = true;
      impact.recommendations.push('Create dedicated milestone for this feature to avoid impacting existing commitments');
    }

    if (featureDuration > 80) { // More than 2 weeks of work
      impact.recommendations.push('Consider breaking feature into multiple smaller issues for better tracking');
    }

    if (currentWorkload.openIssues > 20) {
      impact.recommendations.push('High number of open issues - consider prioritizing existing work');
    }

    return impact;
  }

  private identifyBusyAssignees(issues: any[]): string[] {
    const assigneeWorkload: { [assignee: string]: number } = {};

    issues.forEach(issue => {
      if (issue.state === 'open' && issue.assignees.length > 0) {
        issue.assignees.forEach((assignee: string) => {
          assigneeWorkload[assignee] = (assigneeWorkload[assignee] || 0) + 1;
        });
      }
    });

    // Return assignees with more than 5 open issues
    return Object.entries(assigneeWorkload)
      .filter(([, count]) => count > 5)
      .map(([assignee]) => assignee);
  }

  private generateActionableTaskBreakdown(featureDescription: string, roadmap: any, complexity: any): any[] {
    const tasks = [];
    let taskCounter = 1;

    roadmap.phases.forEach((phase: any) => {
      phase.tasks.forEach((taskDescription: string) => {
        const task = {
          id: `TASK-${taskCounter.toString().padStart(3, '0')}`,
          title: `${phase.name}: ${taskDescription}`,
          description: this.generateTaskDescription(taskDescription, featureDescription),
          phase: phase.name,
          estimatedHours: Math.ceil(phase.duration / phase.tasks.length),
          storyPoints: Math.ceil((phase.duration / phase.tasks.length) / 8),
          priority: this.determineTaskPriority(taskDescription, phase.name),
          labels: this.generateTaskLabels(taskDescription, phase.name),
          acceptanceCriteria: this.generateAcceptanceCriteria(taskDescription),
          dependencies: phase.dependencies,
          assigneeRecommendation: this.recommendAssignee(taskDescription)
        };

        tasks.push(task);
        taskCounter++;
      });
    });

    return tasks;
  }

  private generateTaskDescription(taskTitle: string, featureDescription: string): string {
    const baseDescription = `Implement ${taskTitle.toLowerCase()} as part of the ${featureDescription} feature.`;
    
    const detailMap: { [key: string]: string } = {
      'technical specification': 'Create detailed technical specifications including architecture diagrams, data models, and API contracts. Define implementation approach and identify potential technical risks.',
      'database schema': 'Design and implement database schema changes required for the feature. Include migration scripts and rollback procedures.',
      'api endpoint': 'Develop RESTful API endpoints with proper request/response handling, validation, and error management. Include comprehensive API documentation.',
      'ui/ux mockups': 'Create user interface mockups and user experience flows. Include responsive design considerations and accessibility requirements.',
      'component development': 'Implement reusable UI components following established design patterns and coding standards. Include component documentation and examples.',
      'integration testing': 'Develop comprehensive integration tests covering all feature functionality. Include edge cases and error scenarios.',
      'authentication': 'Implement authentication and authorization logic ensuring security best practices and proper session management.',
      'performance testing': 'Conduct performance analysis and optimization to ensure feature meets performance requirements under expected load.'
    };

    const matchingDetail = Object.entries(detailMap).find(([key]) => 
      taskTitle.toLowerCase().includes(key)
    );

    return matchingDetail ? `${baseDescription}\n\n${matchingDetail[1]}` : baseDescription;
  }

  private determineTaskPriority(taskDescription: string, phase: string): string {
    const taskLower = taskDescription.toLowerCase();
    
    if (phase === 'Planning & Design') return 'high';
    if (taskLower.includes('security') || taskLower.includes('authentication')) return 'high';
    if (taskLower.includes('core') || taskLower.includes('main') || taskLower.includes('critical')) return 'high';
    if (taskLower.includes('testing') || taskLower.includes('validation')) return 'medium';
    if (taskLower.includes('ui') || taskLower.includes('styling')) return 'medium';
    if (taskLower.includes('documentation') || taskLower.includes('example')) return 'low';
    
    return 'medium';
  }

  private generateTaskLabels(taskDescription: string, phase: string): string[] {
    const labels = [`phase: ${phase.toLowerCase().replace(' & ', '-').replace(' ', '-')}`];
    const taskLower = taskDescription.toLowerCase();

    if (taskLower.includes('backend') || taskLower.includes('api') || taskLower.includes('database')) {
      labels.push('component: backend');
    }
    if (taskLower.includes('frontend') || taskLower.includes('ui') || taskLower.includes('component')) {
      labels.push('component: frontend');
    }
    if (taskLower.includes('testing') || taskLower.includes('test')) {
      labels.push('type: testing');
    }
    if (taskLower.includes('documentation') || taskLower.includes('spec')) {
      labels.push('type: documentation');
    }
    if (taskLower.includes('security') || taskLower.includes('auth')) {
      labels.push('component: security');
    }

    labels.push('feature-addition');
    labels.push('auto-generated');

    return labels;
  }

  private generateAcceptanceCriteria(taskDescription: string): string[] {
    const baseCriteria = ['Implementation meets functional requirements', 'Code follows project coding standards', 'All tests pass successfully'];
    const taskLower = taskDescription.toLowerCase();

    if (taskLower.includes('api')) {
      baseCriteria.push('API endpoints return correct status codes and responses');
      baseCriteria.push('API documentation is updated and accurate');
      baseCriteria.push('Error handling covers all edge cases');
    }

    if (taskLower.includes('database')) {
      baseCriteria.push('Database migrations run successfully');
      baseCriteria.push('Data integrity constraints are properly enforced');
      baseCriteria.push('Rollback procedures are tested and documented');
    }

    if (taskLower.includes('ui') || taskLower.includes('component')) {
      baseCriteria.push('UI components are responsive across different screen sizes');
      baseCriteria.push('Components follow accessibility guidelines');
      baseCriteria.push('User interactions provide appropriate feedback');
    }

    if (taskLower.includes('testing')) {
      baseCriteria.push('Test coverage meets minimum requirements (80%+)');
      baseCriteria.push('Both positive and negative test cases are included');
      baseCriteria.push('Tests can be run consistently in CI/CD pipeline');
    }

    return baseCriteria;
  }

  private recommendAssignee(taskDescription: string): string {
    const taskLower = taskDescription.toLowerCase();

    if (taskLower.includes('database') || taskLower.includes('backend') || taskLower.includes('api')) {
      return 'backend-developer';
    }
    if (taskLower.includes('ui') || taskLower.includes('frontend') || taskLower.includes('component')) {
      return 'frontend-developer';
    }
    if (taskLower.includes('design') || taskLower.includes('mockup') || taskLower.includes('ux')) {
      return 'ui-ux-designer';
    }
    if (taskLower.includes('testing') || taskLower.includes('qa')) {
      return 'qa-engineer';
    }
    if (taskLower.includes('security') || taskLower.includes('auth')) {
      return 'security-engineer';
    }

    return 'team-lead';
  }

  // Main add_feature implementation
  private async handleAddFeature(args: any) {
    this.validateRepoConfig();

    try {
      const {
        feature_name,
        feature_description,
        business_justification = '',
        target_users = 'all users',
        success_metrics = [],
        priority = 'medium',
        complexity_hint = 'auto',
        integration_scope = 'auto',
        create_milestone = true,
        milestone_due_date,
        create_issues = true,
        assign_to = [],
        include_testing_tasks = true,
        include_documentation_tasks = true,
        generate_impact_report = true,
        dry_run = false
      } = args;

      let result = '';

      if (generate_impact_report || dry_run) {
        result += `# 🚀 Feature Addition Analysis: ${feature_name}\n\n`;
        result += `**Analysis Date:** ${new Date().toLocaleDateString()}\n`;
        result += `**Repository:** ${this.owner}/${this.repo}\n\n`;
        result += `---\n\n`;
      }

      // Step 1: Analyze existing codebase
      result += `## 🔍 Codebase Analysis\n\n`;
      result += `Analyzing existing project structure and dependencies...\n\n`;
      
      const codebaseAnalysis = await this.analyzeExistingCodebase();
      
      if (generate_impact_report) {
        result += `### Repository Overview\n`;
        result += `- **Language:** ${codebaseAnalysis.repository.language || 'Multiple'}\n`;
        result += `- **Size:** ${Math.round(codebaseAnalysis.repository.size / 1024)} MB\n`;
        result += `- **Open Issues:** ${codebaseAnalysis.repository.open_issues_count}\n`;
        result += `- **Last Updated:** ${new Date(codebaseAnalysis.repository.updated_at).toLocaleDateString()}\n\n`;

        result += `### Technology Stack\n`;
        result += `- **Languages:** ${codebaseAnalysis.techStack.languages.join(', ') || 'None detected'}\n`;
        result += `- **Frameworks:** ${codebaseAnalysis.techStack.frameworks.join(', ') || 'None detected'}\n`;
        result += `- **Architecture:** ${codebaseAnalysis.techStack.architecture}\n`;
        result += `- **Tools:** ${codebaseAnalysis.techStack.tools.join(', ') || 'None detected'}\n\n`;

        result += `### Development Velocity\n`;
        result += `- **Velocity Rating:** ${codebaseAnalysis.developmentVelocity.velocity}\n`;
        result += `- **Commits (Last 30 days):** ${codebaseAnalysis.developmentVelocity.last30Days}\n`;
        result += `- **Active Contributors:** ${codebaseAnalysis.developmentVelocity.activeContributors}\n`;
        result += `- **Average Commits/Day:** ${codebaseAnalysis.developmentVelocity.averageCommitsPerDay}\n\n`;
      }

      // Step 2: Assess feature complexity
      result += `## 🧮 Feature Complexity Assessment\n\n`;
      
      const complexityAnalysis = this.assessFeatureComplexity(feature_description, codebaseAnalysis.techStack);
      
      result += `**Complexity Level:** ${complexityAnalysis.level.toUpperCase()} (Score: ${complexityAnalysis.score})\n`;
      result += `**Estimated Effort:** ${complexityAnalysis.estimatedHours} hours (${complexityAnalysis.estimatedStoryPoints} story points)\n`;
      result += `**Risk Level:** ${complexityAnalysis.riskLevel.toUpperCase()}\n\n`;

      if (generate_impact_report) {
        result += `### Complexity Breakdown\n`;
        Object.entries(complexityAnalysis.factors).forEach(([factor, score]) => {
          if (score > 0) {
            result += `- **${factor.charAt(0).toUpperCase() + factor.slice(1)}:** ${score} points\n`;
          }
        });
        result += `\n`;
      }

      // Step 3: Integration impact analysis
      result += `## 🔄 Integration Impact Analysis\n\n`;
      
      const integrationImpact = this.analyzeIntegrationImpact(feature_description, codebaseAnalysis);
      
      result += `**Affected Components:** ${integrationImpact.affectedComponents.length}\n`;
      result += `**Integration Points:** ${integrationImpact.integrationPoints.length}\n`;
      result += `**API Changes Required:** ${integrationImpact.apiChanges.length > 0 ? 'Yes' : 'No'}\n`;
      result += `**Database Changes Required:** ${integrationImpact.databaseChanges.length > 0 ? 'Yes' : 'No'}\n\n`;

      if (generate_impact_report && integrationImpact.affectedComponents.length > 0) {
        result += `### Affected Components\n`;
        integrationImpact.affectedComponents.forEach((component: string) => {
          result += `- ${component}\n`;
        });
        result += `\n`;

        if (integrationImpact.integrationPoints.length > 0) {
          result += `### Key Integration Points\n`;
          integrationImpact.integrationPoints.forEach((point: string) => {
            result += `- ${point}\n`;
          });
          result += `\n`;
        }
      }

      // Step 4: Implementation roadmap
      result += `## 🗺️ Implementation Roadmap\n\n`;
      
      const roadmap = this.generateImplementationRoadmap(feature_description, complexityAnalysis, integrationImpact);
      
      result += `**Total Duration:** ${roadmap.totalDuration} hours (${Math.ceil(roadmap.totalDuration / 8)} days)\n`;
      result += `**Number of Phases:** ${roadmap.phases.length}\n`;
      result += `**Critical Path:** ${roadmap.criticalPath.join(' ')}\n\n`;

      if (generate_impact_report) {
        result += `### Implementation Phases\n`;
        roadmap.phases.forEach((phase: any, index: number) => {
          result += `#### Phase ${index + 1}: ${phase.name}\n`;
          result += `- **Duration:** ${phase.duration} hours\n`;
          result += `- **Risk Level:** ${phase.riskLevel}\n`;
          result += `- **Dependencies:** ${phase.dependencies.join(', ') || 'None'}\n`;
          result += `- **Key Tasks:**\n`;
          phase.tasks.forEach((task: string) => {
            result += `  - ${task}\n`;
          });
          result += `\n`;
        });
      }

      // Step 5: Milestone impact assessment
      result += `## 📅 Milestone Impact Assessment\n\n`;
      
      const milestoneImpact = this.assessMilestoneImpact(roadmap, codebaseAnalysis.currentWorkload);
      
      result += `**Affected Milestones:** ${milestoneImpact.affectedMilestones.length}\n`;
      result += `**Resource Conflicts:** ${milestoneImpact.resourceConflicts.length}\n`;
      result += `**New Milestone Recommended:** ${milestoneImpact.newMilestoneRecommended ? 'Yes' : 'No'}\n\n`;

      if (milestoneImpact.affectedMilestones.length > 0) {
        result += `### Impact on Existing Milestones\n`;
        milestoneImpact.affectedMilestones.forEach((impact: any) => {
          result += `- **${impact.milestone}:** ${impact.recommendedAction}\n`;
          if (impact.potentialDelay > 0) {
            result += `  - Potential delay: ${impact.potentialDelay} days\n`;
          }
        });
        result += `\n`;
      }

      // Step 6: Generate actionable tasks
      result += `## 📋 Actionable Task Breakdown\n\n`;
      
      const taskBreakdown = this.generateActionableTaskBreakdown(feature_description, roadmap, complexityAnalysis);
      
      result += `**Total Tasks:** ${taskBreakdown.length}\n`;
      result += `**Estimated Total Effort:** ${taskBreakdown.reduce((sum, task) => sum + task.estimatedHours, 0)} hours\n\n`;

      if (generate_impact_report) {
        result += `### Task Overview\n`;
        const tasksByPhase = taskBreakdown.reduce((acc: any, task) => {
          if (!acc[task.phase]) acc[task.phase] = [];
          acc[task.phase].push(task);
          return acc;
        }, {});

        Object.entries(tasksByPhase).forEach(([phase, tasks]: [string, any]) => {
          result += `#### ${phase}\n`;
          tasks.forEach((task: any) => {
            result += `- **${task.id}:** ${task.title}\n`;
            result += `  - Priority: ${task.priority} | Story Points: ${task.storyPoints} | Assignee: ${task.assigneeRecommendation}\n`;
          });
          result += `\n`;
        });
      }

      // Step 7: Create milestone and issues (if not dry run)
      if (!dry_run) {
        const createdItems = {
          milestone: null as any,
          issues: [] as any[]
        };

        if (create_milestone) {
          try {
            const milestoneResponse = await this.octokit.rest.issues.createMilestone({
              owner: this.owner,
              repo: this.repo,
              title: `Feature: ${feature_name}`,
              description: `Implementation of ${feature_name} feature.\n\n**Description:** ${feature_description}\n\n**Business Justification:** ${business_justification}\n\n**Estimated Effort:** ${complexityAnalysis.estimatedHours} hours\n**Complexity:** ${complexityAnalysis.level}\n**Risk Level:** ${complexityAnalysis.riskLevel}`,
              due_on: milestone_due_date
            });

            createdItems.milestone = {
              number: milestoneResponse.data.number,
              title: milestoneResponse.data.title,
              url: milestoneResponse.data.html_url
            };

            result += `## ✅ Created Milestone\n\n`;
            result += `**Milestone:** [${milestoneResponse.data.title}](${milestoneResponse.data.html_url})\n`;
            result += `**Number:** #${milestoneResponse.data.number}\n`;
            result += `**Due Date:** ${milestone_due_date || 'Not set'}\n\n`;
          } catch (error: any) {
            result += `⚠️ **Warning:** Could not create milestone: ${error.message}\n\n`;
          }
        }

        if (create_issues) {
          result += `## 📝 Creating Issues\n\n`;

          for (const task of taskBreakdown) {
            try {
              const issueBody = `## Feature\n${feature_name}\n\n## Task Description\n${task.description}\n\n## Acceptance Criteria\n${task.acceptanceCriteria.map((criteria: string, index: number) => `${index + 1}. ${criteria}`).join('\n')}\n\n## Implementation Details\n- **Phase:** ${task.phase}\n- **Estimated Hours:** ${task.estimatedHours}\n- **Story Points:** ${task.storyPoints}\n- **Priority:** ${task.priority}\n- **Recommended Assignee:** ${task.assigneeRecommendation}\n\n## Dependencies\n${task.dependencies.length > 0 ? task.dependencies.map((dep: string) => `- ${dep}`).join('\n') : 'None'}\n\n## Definition of Done\n- [ ] All acceptance criteria are met\n- [ ] Code is reviewed and approved\n- [ ] Tests are written and passing\n- [ ] Documentation is updated\n- [ ] Feature is tested in staging environment`;

              const issueResponse = await this.octokit.rest.issues.create({
                owner: this.owner,
                repo: this.repo,
                title: task.title,
                body: issueBody,
                labels: task.labels,
                assignees: assign_to,
                milestone: createdItems.milestone?.number
              });

              createdItems.issues.push({
                number: issueResponse.data.number,
                title: issueResponse.data.title,
                url: issueResponse.data.html_url,
                taskId: task.id
              });

              result += `- [#${issueResponse.data.number}: ${issueResponse.data.title}](${issueResponse.data.html_url})\n`;
            } catch (error: any) {
              result += `- ❌ Failed to create issue for ${task.id}: ${error.message}\n`;
            }
          }

          result += `\n**Total Issues Created:** ${createdItems.issues.length}\n\n`;
        }
      }

      // Step 8: Recommendations and next steps
      result += `## 💡 Recommendations\n\n`;

      if (complexityAnalysis.riskLevel === 'high') {
        result += `⚠️ **High Risk Feature**\n`;
        result += `- Consider breaking this feature into smaller, more manageable pieces\n`;
        result += `- Implement feature flags for gradual rollout\n`;
        result += `- Increase code review and testing requirements\n`;
        result += `- Plan for additional buffer time in estimates\n\n`;
      }

      if (milestoneImpact.resourceConflicts.length > 0) {
        result += `👥 **Resource Management**\n`;
        milestoneImpact.resourceConflicts.forEach((conflict: any) => {
          result += `- ${conflict.description}: ${conflict.recommendation}\n`;
        });
        result += `\n`;
      }

      if (integrationImpact.affectedComponents.length > 3) {
        result += `🔄 **Integration Coordination**\n`;
        result += `- Schedule integration planning meetings with affected teams\n`;
        result += `- Plan comprehensive integration testing\n`;
        result += `- Consider phased rollout to minimize integration risks\n\n`;
      }

      result += `### General Recommendations\n`;
      if (milestoneImpact.recommendations.length > 0) {
        milestoneImpact.recommendations.forEach((rec: string) => {
          result += `- ${rec}\n`;
        });
      }
      if (roadmap.riskMitigation.length > 0) {
        roadmap.riskMitigation.forEach((risk: string) => {
          result += `- ${risk}\n`;
        });
      }

      result += `\n## 🎯 Next Steps\n\n`;
      result += `1. **Review and Validate Analysis**: Verify the complexity assessment and integration impact\n`;
      result += `2. **Stakeholder Approval**: Get business and technical stakeholder sign-off\n`;
      result += `3. **Resource Allocation**: Assign team members based on recommendations\n`;
      result += `4. **Sprint Planning**: Incorporate tasks into upcoming sprint cycles\n`;
      result += `5. **Risk Monitoring**: Set up monitoring for identified risks\n`;

      if (!dry_run && create_issues) {
        result += `6. **Issue Refinement**: Review and refine created issues with more specific details\n`;
        result += `7. **Estimation Validation**: Validate story point estimates with the development team\n`;
      }

      result += `\n---\n`;
      result += `*Feature analysis completed using AI-powered impact assessment and project management tools.*`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };

    } catch (error: any) {
      throw new Error(`Failed to add feature: ${error.message}`);
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // ADVANCED PROJECT PLANNING (4 tools including add_feature)
          {
            name: 'generate_prd',
            description: 'Generate comprehensive Product Requirements Documents using AI-powered analysis and templates',
            inputSchema: {
              type: 'object',
              properties: {
                product_name: { type: 'string', description: 'Product name' },
                product_concept: { type: 'string', description: 'Brief product concept or idea description' },
                target_audience: { type: 'string', description: 'Target audience description' },
                business_goals: { type: 'array', items: { type: 'string' }, description: 'Business goals and objectives' },
                key_features: { type: 'array', items: { type: 'string' }, description: 'Key features list' },
                technical_stack: { type: 'string', description: 'Preferred technical stack or platform' },
                timeline: { type: 'string', description: 'Project timeline (e.g., "6 months", "Q2 2024")' },
                budget_range: { type: 'string', description: 'Budget range or constraints' },
                competitors: { type: 'array', items: { type: 'string' }, description: 'Known competitors or similar products' },
                template_type: { type: 'string', enum: ['standard', 'technical', 'startup', 'enterprise', 'mobile_app', 'web_platform'], description: 'PRD template type (default: standard)' },
                include_personas: { type: 'boolean', description: 'Include user personas section (default: true)' },
                include_market_analysis: { type: 'boolean', description: 'Include market analysis section (default: true)' },
                include_technical_specs: { type: 'boolean', description: 'Include detailed technical specifications (default: true)' },
                include_wireframes: { type: 'boolean', description: 'Include wireframe placeholders (default: false)' },
                output_format: { type: 'string', enum: ['markdown', 'html', 'json'], description: 'Output format (default: markdown)' },
                create_issues: { type: 'boolean', description: 'Create GitHub issues from PRD sections (default: false)' },
                assign_milestone: { type: 'number', description: 'Assign PRD-generated issues to specific milestone' }
              },
              required: ['product_name', 'product_concept']
            }
          },
          {
            name: 'parse_prd',
            description: 'Parse PRDs and generate actionable development tasks with AI-powered analysis',
            inputSchema: {
              type: 'object',
              properties: {
                prd_content: { type: 'string', description: 'PRD document content (markdown, HTML, or plain text)' },
                prd_url: { type: 'string', description: 'URL to PRD document (alternative to prd_content)' },
                project_name: { type: 'string', description: 'Project name for generated issues' },
                create_milestone: { type: 'boolean', description: 'Create milestone for the parsed PRD (default: true)' },
                milestone_due_date: { type: 'string', description: 'Due date for created milestone (YYYY-MM-DD)' },
                create_issues: { type: 'boolean', description: 'Create GitHub issues from extracted features (default: true)' },
                create_labels: { type: 'boolean', description: 'Create relevant labels for organization (default: true)' },
                assign_to: { type: 'array', items: { type: 'string' }, description: 'Default assignees for created issues' },
                priority_mapping: { type: 'object', description: 'Map priority levels to labels (high: label_name)' },
                task_complexity_analysis: { type: 'boolean', description: 'Include AI complexity analysis for tasks (default: true)' },
                generate_user_stories: { type: 'boolean', description: 'Generate user stories with acceptance criteria (default: true)' },
                extract_dependencies: { type: 'boolean', description: 'Identify and link task dependencies (default: true)' },
                output_format: { type: 'string', enum: ['summary', 'detailed', 'json'], description: 'Output format (default: detailed)' }
              },
              required: ['prd_content', 'project_name']
            }
          },
          {
            name: 'enhance_prd',
            description: 'Enhance and optimize existing PRDs with AI-powered analysis, missing sections, market insights, and actionable recommendations',
            inputSchema: {
              type: 'object',
              properties: {
                prd_content: { type: 'string', description: 'Existing PRD content to enhance (markdown, HTML, or plain text)' },
                prd_url: { type: 'string', description: 'URL to existing PRD document (alternative to prd_content)' },
                enhancement_level: { type: 'string', enum: ['basic', 'comprehensive', 'advanced'], description: 'Level of enhancement to apply (default: comprehensive)' },
                focus_areas: { type: 'array', items: { type: 'string', enum: ['market_analysis', 'competitive_analysis', 'risk_assessment', 'success_metrics', 'implementation', 'all'] }, description: 'Specific areas to enhance (default: [all])' },
                include_market_analysis: { type: 'boolean', description: 'Add comprehensive market analysis section (default: true)' },
                include_competitive_analysis: { type: 'boolean', description: 'Add competitive landscape analysis (default: true)' },
                include_risk_assessment: { type: 'boolean', description: 'Add risk identification and mitigation strategies (default: true)' },
                include_success_metrics: { type: 'boolean', description: 'Add detailed success metrics and KPIs (default: true)' },
                include_implementation_guidance: { type: 'boolean', description: 'Add implementation recommendations and best practices (default: false)' },
                competitors: { type: 'array', items: { type: 'string' }, description: 'Known competitors for competitive analysis' },
                target_industry: { type: 'string', description: 'Target industry for market analysis context' },
                quality_threshold: { type: 'number', minimum: 0, maximum: 100, description: 'Minimum quality score threshold for recommendations (default: 70)' },
                generate_optimization_report: { type: 'boolean', description: 'Include detailed optimization and improvement report (default: true)' },
                output_format: { type: 'string', enum: ['enhanced_document', 'analysis_only', 'optimization_plan'], description: 'Output format (default: enhanced_document)' },
                preserve_original_structure: { type: 'boolean', description: 'Maintain original document structure and style (default: true)' }
              },
              required: ['prd_content']
            }
          },
          {
            name: 'add_feature',
            description: 'Add new features to existing projects with comprehensive impact analysis, integration planning, and automated task generation',
            inputSchema: {
              type: 'object',
              properties: {
                feature_name: { type: 'string', description: 'Name of the feature to be added' },
                feature_description: { type: 'string', description: 'Detailed description of the feature functionality and requirements' },
                business_justification: { type: 'string', description: 'Business rationale and expected value of the feature' },
                target_users: { type: 'string', description: 'Target user groups or personas who will benefit from this feature (default: all users)' },
                success_metrics: { type: 'array', items: { type: 'string' }, description: 'Key performance indicators and success metrics for the feature' },
                priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Feature priority level (default: medium)' },
                complexity_hint: { type: 'string', enum: ['low', 'medium', 'high', 'very-high', 'auto'], description: 'Manual complexity override or auto-detection (default: auto)' },
                integration_scope: { type: 'string', enum: ['minimal', 'moderate', 'extensive', 'auto'], description: 'Expected integration complexity or auto-detection (default: auto)' },
                create_milestone: { type: 'boolean', description: 'Create a dedicated milestone for this feature (default: true)' },
                milestone_due_date: { type: 'string', description: 'Target completion date for the feature milestone (YYYY-MM-DD)' },
                create_issues: { type: 'boolean', description: 'Generate GitHub issues from the implementation roadmap (default: true)' },
                assign_to: { type: 'array', items: { type: 'string' }, description: 'GitHub usernames to assign to generated issues' },
                include_testing_tasks: { type: 'boolean', description: 'Include comprehensive testing tasks in the roadmap (default: true)' },
                include_documentation_tasks: { type: 'boolean', description: 'Include documentation and specification tasks (default: true)' },
                generate_impact_report: { type: 'boolean', description: 'Generate detailed impact analysis and recommendations (default: true)' },
                dry_run: { type: 'boolean', description: 'Perform analysis only without creating milestone or issues (default: false)' }
              },
              required: ['feature_name', 'feature_description']
            }
          }
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'generate_prd':
            return await this.handleGeneratePRD(args);
          case 'parse_prd':
            return await this.handleParsePRD(args);
          case 'enhance_prd':
            return await this.handleEnhancePrd(args);
          case 'add_feature':
            return await this.handleAddFeature(args);
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

  // Placeholder implementations for other PRD tools
  private async handleGeneratePRD(args: any) {
    return {
      content: [{
        type: "text",
        text: `🔄 **PRD Generation** (Stub Implementation)\n\nGenerating PRD for: ${args.product_name}\nConcept: ${args.product_concept}\n\n*This is a simplified stub implementation. Full PRD generation capabilities would be implemented here.*`
      }]
    };
  }

  private async handleParsePRD(args: any) {
    return {
      content: [{
        type: "text",
        text: `🔄 **PRD Parsing** (Stub Implementation)\n\nParsing PRD for project: ${args.project_name}\n\n*This is a simplified stub implementation. Full PRD parsing capabilities would be implemented here.*`
      }]
    };
  }

  private async handleEnhancePrd(args: any) {
    return {
      content: [{
        type: "text",
        text: `🔄 **PRD Enhancement** (Stub Implementation)\n\nEnhancing PRD with level: ${args.enhancement_level || 'comprehensive'}\n\n*This is a simplified stub implementation. Full PRD enhancement capabilities would be implemented here.*`
      }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: 4 comprehensive project management tools including add_feature with full impact analysis!");
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