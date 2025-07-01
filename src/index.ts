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
        version: '3.0.0',
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

  // PRD Generation Templates and AI-powered content
  private generatePersonas(targetAudience: string, productConcept: string): any[] {
    const personas = [];
    
    // AI-powered persona generation based on target audience
    if (targetAudience.toLowerCase().includes('business') || targetAudience.toLowerCase().includes('enterprise')) {
      personas.push({
        name: "Business Manager",
        age: "35-45",
        background: "Mid-level manager responsible for team productivity and process optimization",
        goals: ["Improve team efficiency", "Streamline workflows", "Reduce operational costs"],
        painPoints: ["Complex tool adoption", "Integration challenges", "Training overhead"],
        usage: "Daily during work hours, primarily desktop/web"
      });
    }
    
    if (targetAudience.toLowerCase().includes('developer') || targetAudience.toLowerCase().includes('technical')) {
      personas.push({
        name: "Software Developer",
        age: "25-40",
        background: "Full-stack developer working in agile teams",
        goals: ["Write quality code", "Ship features quickly", "Collaborate effectively"],
        painPoints: ["Tool fragmentation", "Context switching", "Manual processes"],
        usage: "Throughout development cycle, prefers keyboard shortcuts and automation"
      });
    }
    
    if (targetAudience.toLowerCase().includes('student') || targetAudience.toLowerCase().includes('education')) {
      personas.push({
        name: "Student/Learner",
        age: "18-25",
        background: "University student or early career professional",
        goals: ["Learn new skills", "Complete assignments", "Prepare for career"],
        painPoints: ["Information overload", "Limited budget", "Time constraints"],
        usage: "Mobile-first, flexible schedule, heavy social sharing"
      });
    }
    
    // Default persona if no specific audience detected
    if (personas.length === 0) {
      personas.push({
        name: "Primary User",
        age: "25-45",
        background: `Target user interested in ${productConcept}`,
        goals: ["Achieve primary objectives", "Efficient task completion", "Positive user experience"],
        painPoints: ["Current solution limitations", "Complexity", "Cost concerns"],
        usage: "Regular usage across devices"
      });
    }
    
    return personas;
  }

  private generateMarketAnalysis(productConcept: string, competitors: string[]): any {
    const analysis = {
      marketSize: this.estimateMarketSize(productConcept),
      trends: this.identifyMarketTrends(productConcept),
      competitiveAnalysis: this.analyzeCompetitors(competitors, productConcept),
      opportunities: this.identifyOpportunities(productConcept),
      threats: this.identifyThreats(productConcept)
    };
    
    return analysis;
  }

  private estimateMarketSize(productConcept: string): string {
    // AI-powered market size estimation based on product concept
    const concept = productConcept.toLowerCase();
    
    if (concept.includes('mobile app') || concept.includes('mobile')) {
      return "Mobile app market: $935+ billion globally, growing at 13.4% CAGR";
    } else if (concept.includes('saas') || concept.includes('software')) {
      return "SaaS market: $195+ billion globally, growing at 18% CAGR";
    } else if (concept.includes('e-commerce') || concept.includes('marketplace')) {
      return "E-commerce market: $5.2+ trillion globally, growing at 14.7% CAGR";
    } else if (concept.includes('fintech') || concept.includes('finance')) {
      return "Fintech market: $340+ billion globally, growing at 23.41% CAGR";
    } else if (concept.includes('education') || concept.includes('learning')) {
      return "EdTech market: $254+ billion globally, growing at 16.3% CAGR";
    } else {
      return "Target market size to be determined through detailed market research";
    }
  }

  private identifyMarketTrends(productConcept: string): string[] {
    const concept = productConcept.toLowerCase();
    const trends = [];
    
    // AI-powered trend identification
    if (concept.includes('ai') || concept.includes('machine learning')) {
      trends.push("Growing adoption of AI/ML in business processes");
      trends.push("Increased demand for AI-powered automation");
    }
    
    if (concept.includes('mobile') || concept.includes('app')) {
      trends.push("Mobile-first approach becoming standard");
      trends.push("Progressive Web Apps (PWA) gaining popularity");
    }
    
    if (concept.includes('remote') || concept.includes('collaboration')) {
      trends.push("Remote work driving collaboration tool demand");
      trends.push("Focus on asynchronous communication");
    }
    
    if (concept.includes('sustainability') || concept.includes('green')) {
      trends.push("Increasing focus on sustainable technology");
      trends.push("ESG considerations in product decisions");
    }
    
    // Universal trends
    trends.push("User privacy and data security prioritization");
    trends.push("Subscription-based business models growth");
    trends.push("API-first and integration-focused solutions");
    
    return trends;
  }

  private analyzeCompetitors(competitors: string[], productConcept: string): any[] {
    return competitors.map(competitor => ({
      name: competitor,
      strengths: this.generateCompetitorStrengths(competitor, productConcept),
      weaknesses: this.generateCompetitorWeaknesses(competitor, productConcept),
      marketPosition: "Established player",
      differentiationOpportunity: this.generateDifferentiation(competitor, productConcept)
    }));
  }

  private generateCompetitorStrengths(competitor: string, productConcept: string): string[] {
    return [
      "Established market presence",
      "Strong brand recognition",
      "Existing customer base",
      "Proven business model"
    ];
  }

  private generateCompetitorWeaknesses(competitor: string, productConcept: string): string[] {
    return [
      "Legacy system constraints",
      "Slower innovation cycles",
      "Higher pricing tiers",
      "Complex user experience"
    ];
  }

  private generateDifferentiation(competitor: string, productConcept: string): string {
    return `Focus on improved UX, modern technology stack, and specialized features for target audience`;
  }

  private identifyOpportunities(productConcept: string): string[] {
    const concept = productConcept.toLowerCase();
    const opportunities = [];
    
    if (concept.includes('mobile')) {
      opportunities.push("Mobile-first user experience gap in market");
    }
    
    if (concept.includes('ai') || concept.includes('automation')) {
      opportunities.push("AI-powered features for competitive advantage");
    }
    
    opportunities.push("Underserved niche market segments");
    opportunities.push("Integration with emerging platforms");
    opportunities.push("API monetization opportunities");
    
    return opportunities;
  }

  private identifyThreats(productConcept: string): string[] {
    return [
      "Established competitors with significant resources",
      "Changing regulatory landscape",
      "Technology disruption and platform changes",
      "Economic downturn affecting target market",
      "Customer acquisition cost increases"
    ];
  }

  private generateTechnicalArchitecture(technicalStack: string, keyFeatures: string[]): any {
    const architecture = {
      frontend: this.selectFrontendTech(technicalStack),
      backend: this.selectBackendTech(technicalStack),
      database: this.selectDatabase(technicalStack, keyFeatures),
      infrastructure: this.selectInfrastructure(technicalStack),
      integrations: this.identifyIntegrations(keyFeatures),
      security: this.defineSecurityRequirements(keyFeatures),
      scalability: this.defineScalabilityRequirements(keyFeatures)
    };
    
    return architecture;
  }

  private selectFrontendTech(stack: string): any {
    const stackLower = stack.toLowerCase();
    
    if (stackLower.includes('react')) {
      return {
        framework: "React 18+",
        stateManagement: "Redux Toolkit / Zustand",
        styling: "Tailwind CSS / styled-components",
        bundler: "Vite / Webpack"
      };
    } else if (stackLower.includes('vue')) {
      return {
        framework: "Vue.js 3+",
        stateManagement: "Pinia / Vuex",
        styling: "Tailwind CSS / Vue-specific CSS frameworks",
        bundler: "Vite"
      };
    } else if (stackLower.includes('angular')) {
      return {
        framework: "Angular 15+",
        stateManagement: "NgRx",
        styling: "Angular Material / Tailwind CSS",
        bundler: "Angular CLI / Webpack"
      };
    } else if (stackLower.includes('mobile') || stackLower.includes('react native')) {
      return {
        framework: "React Native / Flutter",
        stateManagement: "Redux / Bloc (Flutter)",
        navigation: "React Navigation / Navigator (Flutter)",
        uiLibrary: "NativeBase / Material Design"
      };
    } else {
      return {
        framework: "Modern JavaScript framework (React/Vue/Angular)",
        stateManagement: "Appropriate state management solution",
        styling: "Component-based styling system",
        bundler: "Modern build tooling"
      };
    }
  }

  private selectBackendTech(stack: string): any {
    const stackLower = stack.toLowerCase();
    
    if (stackLower.includes('node') || stackLower.includes('javascript')) {
      return {
        runtime: "Node.js 18+",
        framework: "Express.js / Fastify / NestJS",
        language: "TypeScript",
        apiStyle: "RESTful APIs / GraphQL"
      };
    } else if (stackLower.includes('python')) {
      return {
        runtime: "Python 3.9+",
        framework: "FastAPI / Django / Flask",
        language: "Python",
        apiStyle: "RESTful APIs / GraphQL"
      };
    } else if (stackLower.includes('java')) {
      return {
        runtime: "Java 17+",
        framework: "Spring Boot / Quarkus",
        language: "Java / Kotlin",
        apiStyle: "RESTful APIs / GraphQL"
      };
    } else if (stackLower.includes('go') || stackLower.includes('golang')) {
      return {
        runtime: "Go 1.19+",
        framework: "Gin / Echo / Fiber",
        language: "Go",
        apiStyle: "RESTful APIs / gRPC"
      };
    } else {
      return {
        runtime: "Modern server runtime",
        framework: "Appropriate web framework",
        language: "Type-safe language preferred",
        apiStyle: "RESTful APIs with OpenAPI documentation"
      };
    }
  }

  private selectDatabase(stack: string, features: string[]): any {
    const stackLower = stack.toLowerCase();
    const featuresStr = features.join(' ').toLowerCase();
    
    let primary = "PostgreSQL";
    let secondary = [];
    
    if (featuresStr.includes('real-time') || featuresStr.includes('chat') || featuresStr.includes('messaging')) {
      secondary.push("Redis (real-time features)");
    }
    
    if (featuresStr.includes('analytics') || featuresStr.includes('reporting')) {
      secondary.push("ClickHouse / BigQuery (analytics)");
    }
    
    if (featuresStr.includes('search') || featuresStr.includes('full-text')) {
      secondary.push("Elasticsearch (search)");
    }
    
    if (stackLower.includes('nosql') || featuresStr.includes('document') || featuresStr.includes('flexible schema')) {
      primary = "MongoDB";
    }
    
    return {
      primary,
      secondary,
      caching: "Redis",
      backup: "Automated daily backups with point-in-time recovery"
    };
  }

  private selectInfrastructure(stack: string): any {
    const stackLower = stack.toLowerCase();
    
    if (stackLower.includes('aws')) {
      return {
        cloud: "Amazon Web Services (AWS)",
        compute: "ECS / Lambda / EC2",
        storage: "S3",
        cdn: "CloudFront",
        monitoring: "CloudWatch"
      };
    } else if (stackLower.includes('azure')) {
      return {
        cloud: "Microsoft Azure",
        compute: "Container Instances / Functions / VMs",
        storage: "Blob Storage",
        cdn: "Azure CDN",
        monitoring: "Azure Monitor"
      };
    } else if (stackLower.includes('gcp') || stackLower.includes('google')) {
      return {
        cloud: "Google Cloud Platform",
        compute: "Cloud Run / Functions / Compute Engine",
        storage: "Cloud Storage",
        cdn: "Cloud CDN",
        monitoring: "Cloud Monitoring"
      };
    } else {
      return {
        cloud: "Cloud provider (AWS/Azure/GCP)",
        compute: "Containerized microservices",
        storage: "Object storage service",
        cdn: "Global CDN",
        monitoring: "Comprehensive monitoring and alerting"
      };
    }
  }

  private identifyIntegrations(features: string[]): string[] {
    const integrations = [];
    const featuresStr = features.join(' ').toLowerCase();
    
    if (featuresStr.includes('payment') || featuresStr.includes('billing')) {
      integrations.push("Payment gateway (Stripe/PayPal)");
    }
    
    if (featuresStr.includes('email') || featuresStr.includes('notification')) {
      integrations.push("Email service (SendGrid/AWS SES)");
    }
    
    if (featuresStr.includes('authentication') || featuresStr.includes('login')) {
      integrations.push("Authentication provider (Auth0/Firebase Auth)");
    }
    
    if (featuresStr.includes('analytics') || featuresStr.includes('tracking')) {
      integrations.push("Analytics platform (Google Analytics/Mixpanel)");
    }
    
    if (featuresStr.includes('social') || featuresStr.includes('sharing')) {
      integrations.push("Social media APIs");
    }
    
    integrations.push("Monitoring and error tracking (Sentry/DataDog)");
    
    return integrations;
  }

  private defineSecurityRequirements(features: string[]): string[] {
    const requirements = [
      "HTTPS encryption for all communications",
      "JWT-based authentication with refresh tokens",
      "Role-based access control (RBAC)",
      "Input validation and sanitization",
      "SQL injection and XSS protection",
      "Rate limiting and DDoS protection",
      "Regular security audits and dependency updates",
      "GDPR/CCPA compliance for data protection"
    ];
    
    const featuresStr = features.join(' ').toLowerCase();
    
    if (featuresStr.includes('payment') || featuresStr.includes('financial')) {
      requirements.push("PCI DSS compliance");
      requirements.push("Two-factor authentication (2FA)");
    }
    
    if (featuresStr.includes('healthcare') || featuresStr.includes('medical')) {
      requirements.push("HIPAA compliance");
    }
    
    return requirements;
  }

  private defineScalabilityRequirements(features: string[]): any {
    return {
      horizontalScaling: "Auto-scaling container orchestration",
      loadBalancing: "Application load balancer with health checks",
      databaseScaling: "Read replicas and connection pooling",
      caching: "Multi-layer caching strategy (CDN, application, database)",
      performance: "Sub-200ms API response times for 95th percentile",
      availability: "99.9% uptime SLA with multi-region deployment"
    };
  }

  private generateProjectTimeline(timeline: string, keyFeatures: string[]): any {
    const phases = [];
    const totalWeeks = this.parseTimelineToWeeks(timeline);
    
    // Phase 1: Planning & Design (15% of timeline)
    const planningWeeks = Math.max(2, Math.ceil(totalWeeks * 0.15));
    phases.push({
      phase: "Planning & Design",
      duration: `${planningWeeks} weeks`,
      deliverables: [
        "Technical architecture design",
        "UI/UX mockups and prototypes",
        "Database schema design",
        "API specification",
        "Development environment setup"
      ]
    });
    
    // Phase 2: Core Development (60% of timeline)
    const developmentWeeks = Math.ceil(totalWeeks * 0.60);
    const featuresPerSprint = Math.max(1, Math.ceil(keyFeatures.length / Math.ceil(developmentWeeks / 2)));
    
    phases.push({
      phase: "Core Development",
      duration: `${developmentWeeks} weeks`,
      deliverables: [
        "Backend API implementation",
        "Frontend application development",
        "Database implementation",
        "Core feature development",
        "Unit and integration testing"
      ],
      sprints: this.generateSprintBreakdown(keyFeatures, developmentWeeks, featuresPerSprint)
    });
    
    // Phase 3: Testing & QA (15% of timeline)
    const testingWeeks = Math.max(1, Math.ceil(totalWeeks * 0.15));
    phases.push({
      phase: "Testing & QA",
      duration: `${testingWeeks} weeks`,
      deliverables: [
        "End-to-end testing",
        "Performance testing",
        "Security testing",
        "User acceptance testing",
        "Bug fixes and optimizations"
      ]
    });
    
    // Phase 4: Deployment & Launch (10% of timeline)
    const deploymentWeeks = Math.max(1, Math.ceil(totalWeeks * 0.10));
    phases.push({
      phase: "Deployment & Launch",
      duration: `${deploymentWeeks} weeks`,
      deliverables: [
        "Production environment setup",
        "CI/CD pipeline configuration",
        "Monitoring and alerting setup",
        "Documentation completion",
        "Production launch"
      ]
    });
    
    return {
      totalDuration: timeline,
      phases,
      milestones: this.generateMilestones(phases)
    };
  }

  private parseTimelineToWeeks(timeline: string): number {
    const timelineLower = timeline.toLowerCase();
    
    if (timelineLower.includes('week')) {
      const match = timelineLower.match(/(\d+)\s*week/);
      return match ? parseInt(match[1]) : 12;
    } else if (timelineLower.includes('month')) {
      const match = timelineLower.match(/(\d+)\s*month/);
      return match ? parseInt(match[1]) * 4 : 12;
    } else if (timelineLower.includes('quarter') || timelineLower.includes('q')) {
      const match = timelineLower.match(/(\d+)\s*(?:quarter|q)/);
      return match ? parseInt(match[1]) * 12 : 12;
    } else {
      // Default to 3 months if unclear
      return 12;
    }
  }

  private generateSprintBreakdown(features: string[], totalWeeks: number, featuresPerSprint: number): any[] {
    const sprints = [];
    const sprintDuration = 2; // 2-week sprints
    const totalSprints = Math.ceil(totalWeeks / sprintDuration);
    
    for (let i = 0; i < totalSprints; i++) {
      const sprintFeatures = features.slice(i * featuresPerSprint, (i + 1) * featuresPerSprint);
      if (sprintFeatures.length > 0) {
        sprints.push({
          sprint: i + 1,
          duration: `${sprintDuration} weeks`,
          features: sprintFeatures,
          goal: `Implement ${sprintFeatures.join(', ')}`
        });
      }
    }
    
    return sprints;
  }

  private generateMilestones(phases: any[]): any[] {
    return phases.map((phase, index) => ({
      milestone: `M${index + 1}`,
      name: `${phase.phase} Complete`,
      description: `Completion of ${phase.phase.toLowerCase()} with all deliverables`,
      criteria: phase.deliverables
    }));
  }

  private async handleGeneratePRD(args: any) {
    this.validateRepoConfig();

    try {
      // Extract parameters with defaults
      const productName = args.product_name;
      const productConcept = args.product_concept;
      const targetAudience = args.target_audience || "General users";
      const businessGoals = args.business_goals || [];
      const keyFeatures = args.key_features || [];
      const technicalStack = args.technical_stack || "Modern web stack";
      const timeline = args.timeline || "6 months";
      const budgetRange = args.budget_range || "To be determined";
      const competitors = args.competitors || [];
      const templateType = args.template_type || "standard";
      
      const includePersonas = args.include_personas !== false;
      const includeMarketAnalysis = args.include_market_analysis !== false;
      const includeTechnicalSpecs = args.include_technical_specs !== false;
      const includeWireframes = args.include_wireframes === true;
      const outputFormat = args.output_format || "markdown";
      const createIssues = args.create_issues === true;
      const assignMilestone = args.assign_milestone;

      // Generate AI-powered content
      const personas = includePersonas ? this.generatePersonas(targetAudience, productConcept) : [];
      const marketAnalysis = includeMarketAnalysis ? this.generateMarketAnalysis(productConcept, competitors) : null;
      const technicalArchitecture = includeTechnicalSpecs ? this.generateTechnicalArchitecture(technicalStack, keyFeatures) : null;
      const projectTimeline = this.generateProjectTimeline(timeline, keyFeatures);

      let prdContent = '';

      if (outputFormat === 'markdown') {
        prdContent = this.generateMarkdownPRD({
          productName,
          productConcept,
          targetAudience,
          businessGoals,
          keyFeatures,
          technicalStack,
          timeline,
          budgetRange,
          competitors,
          personas,
          marketAnalysis,
          technicalArchitecture,
          projectTimeline,
          includeWireframes,
          templateType
        });
      } else if (outputFormat === 'json') {
        prdContent = JSON.stringify({
          productName,
          productConcept,
          targetAudience,
          businessGoals,
          keyFeatures,
          technicalStack,
          timeline,
          budgetRange,
          competitors,
          personas,
          marketAnalysis,
          technicalArchitecture,
          projectTimeline,
          generatedAt: new Date().toISOString(),
          template: templateType
        }, null, 2);
      } else if (outputFormat === 'html') {
        prdContent = this.generateHTMLPRD({
          productName,
          productConcept,
          targetAudience,
          businessGoals,
          keyFeatures,
          technicalStack,
          timeline,
          budgetRange,
          competitors,
          personas,
          marketAnalysis,
          technicalArchitecture,
          projectTimeline,
          includeWireframes,
          templateType
        });
      }

      // Create GitHub issues if requested
      const createdIssues = [];
      if (createIssues && keyFeatures.length > 0) {
        for (const feature of keyFeatures) {
          try {
            const issueResponse = await this.octokit.rest.issues.create({
              owner: this.owner,
              repo: this.repo,
              title: `Feature: ${feature}`,
              body: `## Feature Description\n${feature}\n\n## PRD Reference\nGenerated from PRD: ${productName}\n\n## Acceptance Criteria\n- [ ] Feature specification complete\n- [ ] Implementation complete\n- [ ] Testing complete\n- [ ] Documentation updated`,
              labels: ['feature', 'prd-generated'],
              milestone: assignMilestone
            });
            
            createdIssues.push({
              number: issueResponse.data.number,
              title: issueResponse.data.title,
              url: issueResponse.data.html_url
            });
          } catch (error) {
            console.error(`Failed to create issue for feature: ${feature}`, error);
          }
        }
      }

      let result = prdContent;
      
      if (createIssues && createdIssues.length > 0) {
        result += `\n\n## 🎯 Generated GitHub Issues\n\n`;
        result += `The following issues were created based on the PRD:\n\n`;
        createdIssues.forEach(issue => {
          result += `- [#${issue.number}: ${issue.title}](${issue.url})\n`;
        });
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(`Failed to generate PRD: ${error.message}`);
    }
  }

  private generateMarkdownPRD(data: any): string {
    const {
      productName,
      productConcept,
      targetAudience,
      businessGoals,
      keyFeatures,
      technicalStack,
      timeline,
      budgetRange,
      competitors,
      personas,
      marketAnalysis,
      technicalArchitecture,
      projectTimeline,
      includeWireframes,
      templateType
    } = data;

    let content = `# 📋 Product Requirements Document\n## ${productName}\n\n`;
    
    // Document metadata
    content += `**Document Version:** 1.0  \n`;
    content += `**Created:** ${new Date().toLocaleDateString()}  \n`;
    content += `**Template:** ${templateType}  \n`;
    content += `**Status:** Draft\n\n`;
    
    content += `---\n\n`;

    // Executive Summary
    content += `## 🎯 Executive Summary\n\n`;
    content += `${productConcept}\n\n`;
    content += `**Target Timeline:** ${timeline}  \n`;
    content += `**Budget Range:** ${budgetRange}  \n`;
    content += `**Target Audience:** ${targetAudience}\n\n`;

    // Product Overview
    content += `## 📖 Product Overview\n\n`;
    content += `### Vision Statement\n`;
    content += `${productName} aims to ${productConcept.toLowerCase()}.\n\n`;
    
    if (businessGoals.length > 0) {
      content += `### Business Goals\n`;
      businessGoals.forEach((goal: string, index: number) => {
        content += `${index + 1}. ${goal}\n`;
      });
      content += `\n`;
    }

    // Market Analysis
    if (marketAnalysis) {
      content += `## 📊 Market Analysis\n\n`;
      content += `### Market Size & Opportunity\n`;
      content += `${marketAnalysis.marketSize}\n\n`;
      
      if (marketAnalysis.trends.length > 0) {
        content += `### Market Trends\n`;
        marketAnalysis.trends.forEach((trend: string) => {
          content += `- ${trend}\n`;
        });
        content += `\n`;
      }
      
      if (marketAnalysis.opportunities.length > 0) {
        content += `### Key Opportunities\n`;
        marketAnalysis.opportunities.forEach((opportunity: string) => {
          content += `- ${opportunity}\n`;
        });
        content += `\n`;
      }
      
      if (marketAnalysis.threats.length > 0) {
        content += `### Potential Threats\n`;
        marketAnalysis.threats.forEach((threat: string) => {
          content += `- ${threat}\n`;
        });
        content += `\n`;
      }
    }

    // Competitive Analysis
    if (competitors.length > 0) {
      content += `## 🏆 Competitive Analysis\n\n`;
      
      if (marketAnalysis && marketAnalysis.competitiveAnalysis.length > 0) {
        marketAnalysis.competitiveAnalysis.forEach((comp: any) => {
          content += `### ${comp.name}\n`;
          content += `**Strengths:**\n`;
          comp.strengths.forEach((strength: string) => {
            content += `- ${strength}\n`;
          });
          content += `\n**Weaknesses:**\n`;
          comp.weaknesses.forEach((weakness: string) => {
            content += `- ${weakness}\n`;
          });
          content += `\n**Differentiation Opportunity:** ${comp.differentiationOpportunity}\n\n`;
        });
      } else {
        competitors.forEach((competitor: string) => {
          content += `- ${competitor}\n`;
        });
        content += `\n`;
      }
    }

    // User Personas
    if (personas.length > 0) {
      content += `## 👥 User Personas\n\n`;
      personas.forEach((persona: any, index: number) => {
        content += `### ${persona.name}\n`;
        content += `**Age:** ${persona.age}  \n`;
        content += `**Background:** ${persona.background}\n\n`;
        content += `**Goals:**\n`;
        persona.goals.forEach((goal: string) => {
          content += `- ${goal}\n`;
        });
        content += `\n**Pain Points:**\n`;
        persona.painPoints.forEach((pain: string) => {
          content += `- ${pain}\n`;
        });
        content += `\n**Usage Patterns:** ${persona.usage}\n\n`;
      });
    }

    // Product Features
    if (keyFeatures.length > 0) {
      content += `## ⭐ Product Features\n\n`;
      content += `### Core Features\n`;
      keyFeatures.forEach((feature: string, index: number) => {
        content += `${index + 1}. **${feature}**\n`;
        content += `   - Description: [Detailed description needed]\n`;
        content += `   - Priority: [High/Medium/Low]\n`;
        content += `   - User Story: [As a user, I want...]\n`;
        content += `   - Acceptance Criteria: [Specific criteria needed]\n\n`;
      });
    }

    // Technical Specifications
    if (technicalArchitecture) {
      content += `## 🔧 Technical Specifications\n\n`;
      
      content += `### Technology Stack\n`;
      content += `**Frontend:** ${JSON.stringify(technicalArchitecture.frontend, null, 2)}\n\n`;
      content += `**Backend:** ${JSON.stringify(technicalArchitecture.backend, null, 2)}\n\n`;
      content += `**Database:** ${JSON.stringify(technicalArchitecture.database, null, 2)}\n\n`;
      content += `**Infrastructure:** ${JSON.stringify(technicalArchitecture.infrastructure, null, 2)}\n\n`;
      
      if (technicalArchitecture.integrations.length > 0) {
        content += `### Third-party Integrations\n`;
        technicalArchitecture.integrations.forEach((integration: string) => {
          content += `- ${integration}\n`;
        });
        content += `\n`;
      }
      
      content += `### Security Requirements\n`;
      technicalArchitecture.security.forEach((requirement: string) => {
        content += `- ${requirement}\n`;
      });
      content += `\n`;
      
      content += `### Scalability & Performance\n`;
      content += `**Horizontal Scaling:** ${technicalArchitecture.scalability.horizontalScaling}\n`;
      content += `**Load Balancing:** ${technicalArchitecture.scalability.loadBalancing}\n`;
      content += `**Database Scaling:** ${technicalArchitecture.scalability.databaseScaling}\n`;
      content += `**Caching Strategy:** ${technicalArchitecture.scalability.caching}\n`;
      content += `**Performance Target:** ${technicalArchitecture.scalability.performance}\n`;
      content += `**Availability Target:** ${technicalArchitecture.scalability.availability}\n\n`;
    }

    // Wireframes placeholder
    if (includeWireframes) {
      content += `## 🎨 Wireframes & Mockups\n\n`;
      content += `### Key Screens\n`;
      content += `*[Wireframes to be added during design phase]*\n\n`;
      keyFeatures.forEach((feature: string) => {
        content += `#### ${feature} Screen\n`;
        content += `- Layout: [Description needed]\n`;
        content += `- Components: [List UI components]\n`;
        content += `- User Flow: [Describe user interaction]\n\n`;
      });
    }

    // Project Timeline
    if (projectTimeline) {
      content += `## 📅 Project Timeline\n\n`;
      content += `**Total Duration:** ${projectTimeline.totalDuration}\n\n`;
      
      projectTimeline.phases.forEach((phase: any) => {
        content += `### ${phase.phase} (${phase.duration})\n`;
        content += `**Deliverables:**\n`;
        phase.deliverables.forEach((deliverable: string) => {
          content += `- ${deliverable}\n`;
        });
        
        if (phase.sprints) {
          content += `\n**Sprint Breakdown:**\n`;
          phase.sprints.forEach((sprint: any) => {
            content += `- **Sprint ${sprint.sprint}** (${sprint.duration}): ${sprint.goal}\n`;
          });
        }
        content += `\n`;
      });
      
      content += `### Milestones\n`;
      projectTimeline.milestones.forEach((milestone: any) => {
        content += `**${milestone.milestone} - ${milestone.name}**\n`;
        content += `${milestone.description}\n`;
        content += `Criteria:\n`;
        milestone.criteria.forEach((criterion: string) => {
          content += `- ${criterion}\n`;
        });
        content += `\n`;
      });
    }

    // Success Metrics
    content += `## 📈 Success Metrics\n\n`;
    content += `### Key Performance Indicators (KPIs)\n`;
    content += `- User adoption rate: [Target percentage]\n`;
    content += `- User engagement: [Daily/monthly active users]\n`;
    content += `- Performance metrics: [Response time, uptime]\n`;
    content += `- Business metrics: [Revenue, conversion rate]\n`;
    content += `- Customer satisfaction: [NPS score, user feedback]\n\n`;

    // Risk Assessment
    content += `## ⚠️ Risk Assessment\n\n`;
    content += `### Technical Risks\n`;
    content += `- Technology adoption challenges\n`;
    content += `- Scalability concerns\n`;
    content += `- Integration complexity\n\n`;
    
    content += `### Business Risks\n`;
    content += `- Market competition\n`;
    content += `- Budget constraints\n`;
    content += `- Timeline pressures\n\n`;
    
    content += `### Mitigation Strategies\n`;
    content += `- Regular stakeholder reviews\n`;
    content += `- Iterative development approach\n`;
    content += `- Continuous user feedback collection\n\n`;

    // Appendices
    content += `## 📎 Appendices\n\n`;
    content += `### Appendix A: Technical Architecture Diagram\n`;
    content += `*[Architecture diagram to be created]*\n\n`;
    
    content += `### Appendix B: User Journey Maps\n`;
    content += `*[User journey maps to be created]*\n\n`;
    
    content += `### Appendix C: API Specifications\n`;
    content += `*[API documentation to be created]*\n\n`;

    // Document approval
    content += `## ✅ Document Approval\n\n`;
    content += `| Role | Name | Signature | Date |\n`;
    content += `|------|------|-----------|------|\n`;
    content += `| Product Manager | [Name] | [Signature] | [Date] |\n`;
    content += `| Engineering Lead | [Name] | [Signature] | [Date] |\n`;
    content += `| Design Lead | [Name] | [Signature] | [Date] |\n`;
    content += `| Stakeholder | [Name] | [Signature] | [Date] |\n\n`;

    content += `---\n`;
    content += `*This PRD was generated using AI-powered analysis. Please review and customize as needed.*`;

    return content;
  }

  private generateHTMLPRD(data: any): string {
    // Convert markdown to HTML structure
    const markdown = this.generateMarkdownPRD(data);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PRD: ${data.productName}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1, h2, h3 { color: #333; }
        h1 { border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
        h2 { border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; }
        code { background-color: #f5f5f5; padding: 2px 5px; border-radius: 3px; }
        pre { background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
${markdown.replace(/\n/g, '<br>').replace(/#{1,6}\s+(.+)/g, (match, title) => {
  const level = match.match(/#/g)?.length || 1;
  return `<h${level}>${title}</h${level}>`;
})}
</body>
</html>`;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // ADVANCED PROJECT PLANNING (5 tools) - INCLUDING generate_prd!
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
    console.error("Tools available: generate_prd tool implemented!");
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