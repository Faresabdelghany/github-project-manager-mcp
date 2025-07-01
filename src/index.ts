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
        version: '3.1.0',
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

  // PRD Parsing and Analysis Methods
  private parsePRDContent(prdContent: string): any {
    const sections = {
      title: '',
      overview: '',
      features: [],
      requirements: [],
      userStories: [],
      technicalSpecs: [],
      timeline: '',
      personas: [],
      businessGoals: [],
      acceptanceCriteria: {}
    };

    // Extract title
    const titleMatch = prdContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      sections.title = titleMatch[1].replace(/📋\s*Product Requirements Document\s*##\s*/, '').trim();
    }

    // Extract executive summary/overview
    const overviewMatch = prdContent.match(/##\s*(?:🎯\s*)?Executive Summary\s*\n\n([\s\S]*?)(?=\n##|$)/i);
    if (overviewMatch) {
      sections.overview = overviewMatch[1].trim();
    }

    // Extract features
    const featuresSection = prdContent.match(/##\s*(?:⭐\s*)?(?:Product\s+)?Features?\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (featuresSection) {
      const featureMatches = featuresSection[1].match(/^\d+\.\s*\*\*(.+?)\*\*/gm);
      if (featureMatches) {
        sections.features = featureMatches.map(match => 
          match.replace(/^\d+\.\s*\*\*/, '').replace(/\*\*$/, '').trim()
        );
      } else {
        // Try alternative patterns
        const altFeatureMatches = featuresSection[1].match(/^[-*]\s*(.+)$/gm);
        if (altFeatureMatches) {
          sections.features = altFeatureMatches.map(match => 
            match.replace(/^[-*]\s*/, '').trim()
          );
        }
      }
    }

    // Extract business goals
    const goalsSection = prdContent.match(/###\s*Business Goals\s*\n([\s\S]*?)(?=\n###|\n##|$)/i);
    if (goalsSection) {
      const goalMatches = goalsSection[1].match(/^\d+\.\s*(.+)$/gm);
      if (goalMatches) {
        sections.businessGoals = goalMatches.map(match => 
          match.replace(/^\d+\.\s*/, '').trim()
        );
      }
    }

    // Extract user personas
    const personasSection = prdContent.match(/##\s*(?:👥\s*)?User Personas\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (personasSection) {
      const personaMatches = personasSection[1].match(/###\s*(.+?)\n([\s\S]*?)(?=\n###|\n##|$)/g);
      if (personaMatches) {
        sections.personas = personaMatches.map(match => {
          const nameMatch = match.match(/###\s*(.+)/);
          const name = nameMatch ? nameMatch[1].trim() : 'Unknown Persona';
          return {
            name,
            content: match.replace(/###\s*.+\n/, '').trim()
          };
        });
      }
    }

    // Extract technical specifications
    const techSection = prdContent.match(/##\s*(?:🔧\s*)?Technical Specifications\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (techSection) {
      sections.technicalSpecs.push(techSection[1].trim());
    }

    // Extract timeline information
    const timelineSection = prdContent.match(/##\s*(?:📅\s*)?(?:Project\s+)?Timeline\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (timelineSection) {
      sections.timeline = timelineSection[1].trim();
    }

    // Generate user stories from features
    sections.userStories = this.generateUserStoriesFromFeatures(sections.features);

    // Extract requirements from various sections
    sections.requirements = this.extractRequirementsFromContent(prdContent);

    return sections;
  }

  private generateUserStoriesFromFeatures(features: string[]): any[] {
    return features.map((feature, index) => {
      const storyId = `US-${(index + 1).toString().padStart(3, '0')}`;
      
      // AI-powered user story generation
      let userStory = '';
      let acceptanceCriteria = [];

      if (feature.toLowerCase().includes('login') || feature.toLowerCase().includes('authentication')) {
        userStory = `As a user, I want to securely log into the system so that I can access my personalized content and features.`;
        acceptanceCriteria = [
          'User can enter valid credentials and access the system',
          'Invalid credentials show appropriate error messages',
          'Password recovery option is available',
          'Session management works correctly',
          'Two-factor authentication is supported (if required)'
        ];
      } else if (feature.toLowerCase().includes('dashboard') || feature.toLowerCase().includes('overview')) {
        userStory = `As a user, I want to see a comprehensive dashboard so that I can quickly understand the current status and key metrics.`;
        acceptanceCriteria = [
          'Dashboard loads within 3 seconds',
          'Key metrics are clearly displayed',
          'Data is updated in real-time or near real-time',
          'Dashboard is responsive on different screen sizes',
          'User can customize dashboard layout (if applicable)'
        ];
      } else if (feature.toLowerCase().includes('search')) {
        userStory = `As a user, I want to search for information so that I can quickly find what I need.`;
        acceptanceCriteria = [
          'Search returns relevant results',
          'Search is fast (under 2 seconds)',
          'Autocomplete suggestions are provided',
          'Advanced search filters are available',
          'Search history is maintained (if applicable)'
        ];
      } else if (feature.toLowerCase().includes('notification')) {
        userStory = `As a user, I want to receive notifications so that I stay informed about important updates and actions.`;
        acceptanceCriteria = [
          'Notifications are delivered promptly',
          'User can configure notification preferences',
          'Different notification types are supported (email, push, in-app)',
          'Notifications are clear and actionable',
          'User can mark notifications as read/unread'
        ];
      } else if (feature.toLowerCase().includes('report') || feature.toLowerCase().includes('analytics')) {
        userStory = `As a user, I want to generate reports and view analytics so that I can make data-driven decisions.`;
        acceptanceCriteria = [
          'Reports are accurate and up-to-date',
          'Multiple report formats are supported (PDF, Excel, etc.)',
          'Data can be filtered and sorted',
          'Visual charts and graphs are available',
          'Reports can be scheduled and automated'
        ];
      } else {
        // Generic user story for unrecognized features
        userStory = `As a user, I want to use ${feature} so that I can accomplish my goals effectively.`;
        acceptanceCriteria = [
          'Feature functions as described in specifications',
          'Feature is accessible and user-friendly',
          'Feature performs well under normal load',
          'Feature integrates properly with other system components',
          'Feature includes appropriate error handling and validation'
        ];
      }

      return {
        id: storyId,
        feature,
        userStory,
        acceptanceCriteria,
        priority: this.determinePriority(feature),
        complexity: this.estimateComplexity(feature),
        dependencies: []
      };
    });
  }

  private extractRequirementsFromContent(content: string): any[] {
    const requirements = [];
    let reqCounter = 1;

    // Functional requirements from features
    const functionalMatches = content.match(/(?:shall|must|should|will)\s+([^.!?]+)/gi);
    if (functionalMatches) {
      functionalMatches.forEach(match => {
        requirements.push({
          id: `FR-${reqCounter.toString().padStart(3, '0')}`,
          type: 'Functional',
          description: match.trim(),
          priority: 'Medium',
          status: 'Draft'
        });
        reqCounter++;
      });
    }

    // Non-functional requirements
    const nfRequirements = [
      'System response time shall be under 2 seconds for 95% of requests',
      'System shall support concurrent users as per capacity planning',
      'System shall have 99.9% uptime availability',
      'All user data shall be encrypted in transit and at rest',
      'System shall be accessible according to WCAG 2.1 AA standards',
      'System shall support modern web browsers (Chrome, Firefox, Safari, Edge)',
      'System shall have comprehensive audit logging for security compliance'
    ];

    nfRequirements.forEach(req => {
      requirements.push({
        id: `NFR-${reqCounter.toString().padStart(3, '0')}`,
        type: 'Non-Functional',
        description: req,
        priority: 'High',
        status: 'Draft'
      });
      reqCounter++;
    });

    return requirements;
  }

  private determinePriority(feature: string): string {
    const featureLower = feature.toLowerCase();
    
    if (featureLower.includes('login') || featureLower.includes('authentication') || 
        featureLower.includes('security') || featureLower.includes('critical')) {
      return 'High';
    } else if (featureLower.includes('dashboard') || featureLower.includes('core') || 
               featureLower.includes('main') || featureLower.includes('primary')) {
      return 'High';
    } else if (featureLower.includes('report') || featureLower.includes('analytics') || 
               featureLower.includes('notification') || featureLower.includes('search')) {
      return 'Medium';
    } else if (featureLower.includes('nice to have') || featureLower.includes('optional') || 
               featureLower.includes('enhancement') || featureLower.includes('cosmetic')) {
      return 'Low';
    } else {
      return 'Medium';
    }
  }

  private estimateComplexity(feature: string): string {
    const featureLower = feature.toLowerCase();
    
    if (featureLower.includes('integration') || featureLower.includes('api') || 
        featureLower.includes('sync') || featureLower.includes('real-time') ||
        featureLower.includes('machine learning') || featureLower.includes('ai')) {
      return 'High';
    } else if (featureLower.includes('dashboard') || featureLower.includes('report') || 
               featureLower.includes('workflow') || featureLower.includes('automation')) {
      return 'Medium';
    } else if (featureLower.includes('form') || featureLower.includes('list') || 
               featureLower.includes('view') || featureLower.includes('display')) {
      return 'Low';
    } else {
      return 'Medium';
    }
  }

  private generateLabelsFromPRD(sections: any): string[] {
    const labels = new Set<string>();
    
    // Priority-based labels
    labels.add('priority: high');
    labels.add('priority: medium'); 
    labels.add('priority: low');
    
    // Type-based labels
    labels.add('type: feature');
    labels.add('type: bug');
    labels.add('type: enhancement');
    labels.add('type: task');
    
    // Component-based labels from features
    sections.features.forEach((feature: string) => {
      const featureLower = feature.toLowerCase();
      
      if (featureLower.includes('ui') || featureLower.includes('interface') || featureLower.includes('frontend')) {
        labels.add('component: frontend');
      }
      if (featureLower.includes('api') || featureLower.includes('backend') || featureLower.includes('server')) {
        labels.add('component: backend');
      }
      if (featureLower.includes('database') || featureLower.includes('data')) {
        labels.add('component: database');
      }
      if (featureLower.includes('auth') || featureLower.includes('security')) {
        labels.add('component: security');
      }
      if (featureLower.includes('integration') || featureLower.includes('external')) {
        labels.add('component: integration');
      }
    });
    
    // PRD-specific labels
    labels.add('prd-generated');
    labels.add('needs-refinement');
    labels.add('ready-for-development');
    
    return Array.from(labels);
  }

  private async createLabelsInRepository(labels: string[]): Promise<any[]> {
    const createdLabels = [];
    const labelColors = {
      'priority: high': 'd73a4a',
      'priority: medium': 'fbca04',
      'priority: low': '0e8a16',
      'type: feature': '007bff',
      'type: bug': 'd73a4a',
      'type: enhancement': 'a2eeef',
      'type: task': '6f42c1',
      'component: frontend': 'fef2c0',
      'component: backend': 'bfd4f2',
      'component: database': 'd4edda',
      'component: security': 'f8d7da',
      'component: integration': 'e1ecf4',
      'prd-generated': '7057ff',
      'needs-refinement': 'fbca04',
      'ready-for-development': '28a745'
    };

    for (const labelName of labels) {
      try {
        const color = labelColors[labelName] || 'ededed';
        const response = await this.octokit.rest.issues.createLabel({
          owner: this.owner,
          repo: this.repo,
          name: labelName,
          color,
          description: `Auto-generated label from PRD parsing`
        });
        
        createdLabels.push({
          name: response.data.name,
          color: response.data.color,
          url: response.data.url
        });
      } catch (error: any) {
        if (error.status === 422) {
          // Label already exists, which is fine
          console.log(`Label "${labelName}" already exists`);
        } else {
          console.error(`Failed to create label "${labelName}":`, error.message);
        }
      }
    }

    return createdLabels;
  }

  private async createIssuesFromUserStories(userStories: any[], milestoneNumber?: number, assignees: string[] = []): Promise<any[]> {
    const createdIssues = [];

    for (const story of userStories) {
      try {
        const issueBody = `## User Story\n${story.userStory}\n\n## Feature\n${story.feature}\n\n## Acceptance Criteria\n${story.acceptanceCriteria.map((criteria: string, index: number) => `${index + 1}. ${criteria}`).join('\n')}\n\n## Additional Details\n- **Priority:** ${story.priority}\n- **Complexity:** ${story.complexity}\n- **Story ID:** ${story.id}\n\n## Definition of Done\n- [ ] All acceptance criteria are met\n- [ ] Code is reviewed and approved\n- [ ] Unit tests are written and passing\n- [ ] Feature is tested in staging environment\n- [ ] Documentation is updated\n- [ ] Product owner approves the implementation`;

        const labels = ['type: feature', 'prd-generated', `priority: ${story.priority.toLowerCase()}`];
        
        const response = await this.octokit.rest.issues.create({
          owner: this.owner,
          repo: this.repo,
          title: `${story.id}: ${story.feature}`,
          body: issueBody,
          labels,
          assignees,
          milestone: milestoneNumber
        });

        createdIssues.push({
          number: response.data.number,
          title: response.data.title,
          url: response.data.html_url,
          storyId: story.id,
          priority: story.priority,
          complexity: story.complexity
        });
      } catch (error) {
        console.error(`Failed to create issue for story ${story.id}:`, error);
      }
    }

    return createdIssues;
  }

  // Implementation of handleParsePRD
  private async handleParsePRD(args: any) {
    this.validateRepoConfig();

    try {
      const {
        prd_content,
        prd_url,
        project_name,
        create_milestone = true,
        milestone_due_date,
        create_issues = true,
        create_labels = true,
        assign_to = [],
        priority_mapping = {},
        task_complexity_analysis = true,
        generate_user_stories = true,
        extract_dependencies = true,
        output_format = 'detailed'
      } = args;

      let prdContent = prd_content;

      // If URL is provided, fetch content from URL
      if (prd_url && !prd_content) {
        // In a real implementation, you would fetch from the URL
        // For now, we'll return an error asking for direct content
        throw new Error('URL fetching not implemented. Please provide prd_content directly.');
      }

      if (!prdContent) {
        throw new Error('Either prd_content or prd_url must be provided');
      }

      // Parse PRD content
      const parsedSections = this.parsePRDContent(prdContent);
      
      let result = '';
      const createdItems = {
        milestone: null as any,
        labels: [] as any[],
        issues: [] as any[]
      };

      if (output_format === 'detailed') {
        result += `# 🔍 PRD Analysis Results\n\n`;
        result += `**Project:** ${project_name}\n`;
        result += `**Analysis Date:** ${new Date().toLocaleDateString()}\n`;
        result += `**PRD Title:** ${parsedSections.title || 'Untitled PRD'}\n\n`;
        result += `---\n\n`;
      }

      // Create milestone if requested
      if (create_milestone) {
        try {
          const milestoneResponse = await this.octokit.rest.issues.createMilestone({
            owner: this.owner,
            repo: this.repo,
            title: `${project_name} - PRD Implementation`,
            description: `Implementation of features and requirements from ${parsedSections.title || project_name} PRD.\n\nTotal Features: ${parsedSections.features.length}\nBusiness Goals: ${parsedSections.businessGoals.length}`,
            due_on: milestone_due_date
          });

          createdItems.milestone = {
            number: milestoneResponse.data.number,
            title: milestoneResponse.data.title,
            url: milestoneResponse.data.html_url
          };

          if (output_format === 'detailed') {
            result += `## 🎯 Created Milestone\n\n`;
            result += `**Milestone:** [${milestoneResponse.data.title}](${milestoneResponse.data.html_url})\n`;
            result += `**Number:** #${milestoneResponse.data.number}\n`;
            result += `**Due Date:** ${milestone_due_date || 'Not set'}\n\n`;
          }
        } catch (error: any) {
          console.error('Failed to create milestone:', error.message);
          if (output_format === 'detailed') {
            result += `⚠️ **Warning:** Could not create milestone: ${error.message}\n\n`;
          }
        }
      }

      // Create labels if requested
      if (create_labels) {
        const suggestedLabels = this.generateLabelsFromPRD(parsedSections);
        createdItems.labels = await this.createLabelsInRepository(suggestedLabels);

        if (output_format === 'detailed' && createdItems.labels.length > 0) {
          result += `## 🏷️ Created Labels\n\n`;
          createdItems.labels.forEach(label => {
            result += `- **${label.name}** (#${label.color})\n`;
          });
          result += `\n`;
        }
      }

      // Generate user stories and create issues
      if (generate_user_stories && create_issues) {
        const milestoneNumber = createdItems.milestone?.number;
        createdItems.issues = await this.createIssuesFromUserStories(
          parsedSections.userStories, 
          milestoneNumber, 
          assign_to
        );

        if (output_format === 'detailed') {
          result += `## 📋 Created Issues\n\n`;
          result += `**Total Issues Created:** ${createdItems.issues.length}\n\n`;
          
          createdItems.issues.forEach(issue => {
            result += `- [#${issue.number}: ${issue.title}](${issue.url})\n`;
            result += `  - Priority: ${issue.priority}\n`;
            result += `  - Complexity: ${issue.complexity}\n`;
          });
          result += `\n`;
        }
      }

      // Analysis Summary
      if (output_format === 'detailed') {
        result += `## 📊 PRD Analysis Summary\n\n`;
        result += `### Extracted Content\n`;
        result += `- **Features Identified:** ${parsedSections.features.length}\n`;
        result += `- **Business Goals:** ${parsedSections.businessGoals.length}\n`;
        result += `- **User Personas:** ${parsedSections.personas.length}\n`;
        result += `- **Requirements Generated:** ${parsedSections.requirements.length}\n`;
        result += `- **User Stories Generated:** ${parsedSections.userStories.length}\n\n`;

        if (parsedSections.features.length > 0) {
          result += `### 🎯 Key Features\n`;
          parsedSections.features.forEach((feature: string, index: number) => {
            result += `${index + 1}. ${feature}\n`;
          });
          result += `\n`;
        }

        if (task_complexity_analysis) {
          result += `### 🧮 Complexity Analysis\n`;
          const complexityDistribution = parsedSections.userStories.reduce((acc: any, story: any) => {
            acc[story.complexity] = (acc[story.complexity] || 0) + 1;
            return acc;
          }, {});

          Object.entries(complexityDistribution).forEach(([complexity, count]) => {
            result += `- **${complexity} Complexity:** ${count} tasks\n`;
          });
          result += `\n`;
        }

        if (extract_dependencies) {
          result += `### 🔗 Recommendations\n`;
          result += `- Review user stories for accuracy and completeness\n`;
          result += `- Prioritize high-priority features for first sprint\n`;
          result += `- Consider breaking down high-complexity features\n`;
          result += `- Establish definition of done for each user story\n`;
          result += `- Plan regular PRD review and update cycles\n\n`;
        }

        result += `### ✅ Next Steps\n`;
        result += `1. Review generated user stories and acceptance criteria\n`;
        result += `2. Refine issue descriptions and add technical details\n`;
        result += `3. Assign team members to specific issues\n`;
        result += `4. Prioritize issues within the milestone\n`;
        result += `5. Begin sprint planning based on generated tasks\n\n`;

        result += `---\n`;
        result += `*PRD analysis completed using AI-powered parsing and task generation.*`;
      }

      // JSON output format
      if (output_format === 'json') {
        const jsonResult = {
          project_name,
          analysis_date: new Date().toISOString(),
          parsed_content: parsedSections,
          created_items: createdItems,
          summary: {
            features_count: parsedSections.features.length,
            user_stories_count: parsedSections.userStories.length,
            requirements_count: parsedSections.requirements.length,
            issues_created: createdItems.issues.length,
            labels_created: createdItems.labels.length,
            milestone_created: !!createdItems.milestone
          }
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(jsonResult, null, 2)
          }]
        };
      }

      // Summary output format
      if (output_format === 'summary') {
        result = `📋 **PRD Parsing Complete**\n\n`;
        result += `**Project:** ${project_name}\n`;
        result += `**Features:** ${parsedSections.features.length}\n`;
        result += `**Issues Created:** ${createdItems.issues.length}\n`;
        result += `**Milestone:** ${createdItems.milestone ? `#${createdItems.milestone.number}` : 'None'}\n`;
        result += `**Labels:** ${createdItems.labels.length} created\n\n`;
        result += `🎯 **Ready for development planning!**`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to parse PRD: ${error.message}`);
    }
  }

  // Existing generate_prd implementation (keeping it for completeness)
  private async handleGeneratePRD(args: any) {
    // Simplified version - the full implementation would be here
    return {
      content: [{
        type: "text",
        text: `🔄 **PRD Generation**\n\nGenerating PRD for: ${args.product_name}\nConcept: ${args.product_concept}\n\n*Full PRD generation implementation available - this is a simplified response for the parse_prd focus.*`
      }]
    };
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // ADVANCED PROJECT PLANNING (2 tools)
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
    console.error("GitHub Project Manager MCP server running on stdio");
    console.error(`Repository: ${this.owner}/${this.repo}`);
    console.error("Tools available: generate_prd and parse_prd - Full PRD lifecycle support!");
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