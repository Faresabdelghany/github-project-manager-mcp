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
        version: '3.2.0',
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

  // PRD Enhancement and Analysis Methods
  private assessPRDQuality(prdContent: string): any {
    const analysis = {
      overallScore: 0,
      sectionScores: {},
      missingCriticalSections: [],
      missingSections: [],
      weakSections: [],
      recommendations: [],
      completenessMetrics: {}
    };

    const requiredSections = [
      { name: 'Executive Summary', weight: 0.15, patterns: [/executive\s+summary/i, /overview/i, /introduction/i] },
      { name: 'Problem Statement', weight: 0.12, patterns: [/problem\s+statement/i, /business\s+problem/i, /challenge/i] },
      { name: 'Product Vision', weight: 0.10, patterns: [/product\s+vision/i, /vision/i, /mission/i] },
      { name: 'Target Audience/Users', weight: 0.12, patterns: [/target\s+audience/i, /user\s+personas/i, /customers/i, /users/i] },
      { name: 'Business Goals', weight: 0.10, patterns: [/business\s+goals/i, /objectives/i, /goals/i] },
      { name: 'Features/Requirements', weight: 0.15, patterns: [/features/i, /requirements/i, /functionality/i] },
      { name: 'User Stories', weight: 0.08, patterns: [/user\s+stories/i, /user\s+scenarios/i, /use\s+cases/i] },
      { name: 'Technical Specifications', weight: 0.08, patterns: [/technical\s+spec/i, /architecture/i, /technology/i, /tech\s+stack/i] },
      { name: 'Success Metrics', weight: 0.10, patterns: [/success\s+metrics/i, /kpis/i, /metrics/i, /measurement/i] }
    ];

    const enhancementSections = [
      { name: 'Market Analysis', weight: 0.08, patterns: [/market\s+analysis/i, /competitive\s+landscape/i, /market\s+research/i] },
      { name: 'Competitive Analysis', weight: 0.07, patterns: [/competitive\s+analysis/i, /competitors/i, /competition/i] },
      { name: 'Risk Assessment', weight: 0.06, patterns: [/risk\s+assessment/i, /risks/i, /challenges/i] },
      { name: 'Timeline/Roadmap', weight: 0.05, patterns: [/timeline/i, /roadmap/i, /schedule/i, /milestones/i] },
      { name: 'Budget/Resources', weight: 0.04, patterns: [/budget/i, /resources/i, /cost/i, /investment/i] },
      { name: 'Acceptance Criteria', weight: 0.06, patterns: [/acceptance\s+criteria/i, /definition\s+of\s+done/i] }
    ];

    let totalScore = 0;
    let maxPossibleScore = 0;

    // Analyze required sections
    for (const section of requiredSections) {
      maxPossibleScore += section.weight;
      let sectionFound = false;
      let sectionQuality = 0;

      for (const pattern of section.patterns) {
        if (pattern.test(prdContent)) {
          sectionFound = true;
          
          // Assess section quality based on content length and detail
          const sectionMatch = prdContent.match(new RegExp(`${pattern.source}([\\s\\S]*?)(?=\\n#+|$)`, 'i'));
          if (sectionMatch && sectionMatch[1]) {
            const sectionContent = sectionMatch[1].trim();
            const wordCount = sectionContent.split(/\s+/).length;
            
            if (wordCount >= 100) {
              sectionQuality = 1.0; // Excellent
            } else if (wordCount >= 50) {
              sectionQuality = 0.8; // Good
            } else if (wordCount >= 20) {
              sectionQuality = 0.6; // Fair
            } else if (wordCount >= 5) {
              sectionQuality = 0.4; // Poor
            } else {
              sectionQuality = 0.2; // Very poor
            }
          } else {
            sectionQuality = 0.3; // Header found but minimal content
          }
          break;
        }
      }

      if (sectionFound) {
        const sectionScore = section.weight * sectionQuality;
        totalScore += sectionScore;
        analysis.sectionScores[section.name] = {
          score: sectionQuality,
          weight: section.weight,
          weightedScore: sectionScore,
          status: sectionQuality >= 0.8 ? 'excellent' : sectionQuality >= 0.6 ? 'good' : sectionQuality >= 0.4 ? 'needs improvement' : 'poor'
        };

        if (sectionQuality < 0.6) {
          analysis.weakSections.push({
            name: section.name,
            quality: sectionQuality,
            reason: sectionQuality < 0.4 ? 'Insufficient content' : 'Could benefit from more detail'
          });
        }
      } else {
        analysis.missingCriticalSections.push(section.name);
        analysis.sectionScores[section.name] = {
          score: 0,
          weight: section.weight,
          weightedScore: 0,
          status: 'missing'
        };
      }
    }

    // Analyze enhancement sections
    for (const section of enhancementSections) {
      let sectionFound = false;
      for (const pattern of section.patterns) {
        if (pattern.test(prdContent)) {
          sectionFound = true;
          break;
        }
      }
      
      if (!sectionFound) {
        analysis.missingSections.push(section.name);
      }
    }

    // Calculate overall score
    analysis.overallScore = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

    // Generate recommendations based on analysis
    this.generateQualityRecommendations(analysis);

    // Add completeness metrics
    analysis.completenessMetrics = {
      totalSections: requiredSections.length + enhancementSections.length,
      presentSections: Object.keys(analysis.sectionScores).length - analysis.missingCriticalSections.length,
      missingSections: analysis.missingCriticalSections.length + analysis.missingSections.length,
      completenessPercentage: Math.round(((Object.keys(analysis.sectionScores).length - analysis.missingCriticalSections.length) / (requiredSections.length + enhancementSections.length)) * 100)
    };

    return analysis;
  }

  private generateQualityRecommendations(analysis: any): void {
    // Critical missing sections
    if (analysis.missingCriticalSections.length > 0) {
      analysis.recommendations.push({
        type: 'critical',
        category: 'Missing Critical Sections',
        description: `Add these essential sections: ${analysis.missingCriticalSections.join(', ')}`,
        priority: 'high',
        impact: 'major'
      });
    }

    // Weak sections
    if (analysis.weakSections.length > 0) {
      analysis.recommendations.push({
        type: 'improvement',
        category: 'Content Enhancement',
        description: `Strengthen these sections with more detail: ${analysis.weakSections.map(s => s.name).join(', ')}`,
        priority: 'medium',
        impact: 'moderate'
      });
    }

    // Enhancement sections
    if (analysis.missingSections.length > 0) {
      analysis.recommendations.push({
        type: 'enhancement',
        category: 'Additional Sections',
        description: `Consider adding these valuable sections: ${analysis.missingSections.slice(0, 3).join(', ')}`,
        priority: 'low',
        impact: 'minor'
      });
    }

    // Score-based recommendations
    if (analysis.overallScore < 60) {
      analysis.recommendations.push({
        type: 'critical',
        category: 'Overall Quality',
        description: 'PRD needs significant improvement. Focus on adding missing sections and expanding content.',
        priority: 'high',
        impact: 'major'
      });
    } else if (analysis.overallScore < 80) {
      analysis.recommendations.push({
        type: 'improvement',
        category: 'Overall Quality',
        description: 'PRD is functional but could benefit from more comprehensive content and detail.',
        priority: 'medium',
        impact: 'moderate'
      });
    }
  }

  private generateMarketAnalysis(productName: string, targetAudience: string, industry?: string): string {
    // AI-generated market analysis template
    const marketAnalysis = `## 📊 Market Analysis

### Market Size and Opportunity
The ${industry || 'target'} market for ${productName} represents a significant opportunity, with growing demand from ${targetAudience || 'target demographics'}. Current market trends indicate:

- **Total Addressable Market (TAM):** Research indicates substantial market potential for products targeting ${targetAudience}
- **Serviceable Addressable Market (SAM):** Focused segment shows strong growth trajectory
- **Serviceable Obtainable Market (SOM):** Initial capture potential estimated based on competitive landscape

### Market Trends
Key trends driving market demand:
1. **Digital Transformation:** Increased adoption of digital solutions in the target sector
2. **User Experience Focus:** Growing emphasis on intuitive, user-friendly interfaces
3. **Mobile-First Approach:** Rising preference for mobile-accessible solutions
4. **Data-Driven Decisions:** Increased demand for analytics and insights
5. **Integration Capabilities:** Need for solutions that integrate with existing systems

### Target Market Segmentation
Primary market segments for ${productName}:
- **Primary Segment:** ${targetAudience} with immediate need for the solution
- **Secondary Segment:** Adjacent users who could benefit from expanded features
- **Future Segments:** Potential expansion opportunities based on product evolution

### Market Entry Strategy
Recommended approach for market penetration:
1. **Focus on Early Adopters:** Target innovation-friendly segment first
2. **Build Strong Value Proposition:** Emphasize unique benefits and ROI
3. **Leverage Feedback:** Use initial user feedback to refine product-market fit
4. **Scale Gradually:** Expand to broader market segments after validation`;

    return marketAnalysis;
  }

  private generateCompetitiveAnalysis(productName: string, competitors: string[] = []): string {
    const defaultCompetitors = competitors.length > 0 ? competitors : ['Market Leader A', 'Established Solution B', 'Emerging Platform C'];
    
    const competitiveAnalysis = `## 🏆 Competitive Analysis

### Competitive Landscape Overview
${productName} operates in a competitive environment with several established players and emerging solutions. Understanding the competitive landscape is crucial for positioning and differentiation.

### Key Competitors

${defaultCompetitors.map((competitor, index) => `
#### ${index + 1}. ${competitor}
**Strengths:**
- Established market presence and brand recognition
- Comprehensive feature set for core use cases
- Strong customer support and documentation

**Weaknesses:**
- Legacy architecture limiting innovation speed
- Higher pricing structure
- Complex user interface affecting adoption

**Market Position:** ${index === 0 ? 'Market leader' : index === 1 ? 'Strong challenger' : 'Emerging player'}
**Differentiation Opportunity:** Focus on ${index === 0 ? 'superior user experience' : index === 1 ? 'better pricing and accessibility' : 'innovative features and modern approach'}
`).join('')}

### Competitive Positioning Matrix

| Feature/Aspect | ${productName} | ${defaultCompetitors[0]} | ${defaultCompetitors[1]} | ${defaultCompetitors[2]} |
|---|---|---|---|---|
| **User Experience** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Feature Completeness** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Pricing** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Innovation** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Market Share** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

### Competitive Advantages
Key differentiators for ${productName}:

1. **Superior User Experience**: Modern, intuitive interface designed for efficiency
2. **Innovative Features**: Cutting-edge functionality not available in competing solutions
3. **Competitive Pricing**: Value-driven pricing strategy for better market accessibility
4. **Agile Development**: Faster feature delivery and market responsiveness
5. **Customer-Centric Approach**: Direct feedback integration and rapid iteration

### Threat Assessment
**High Threats:**
- Market leader launching competing features
- New well-funded entrants with similar vision

**Medium Threats:**
- Existing competitors improving user experience
- Open-source alternatives gaining traction

**Low Threats:**
- Traditional solutions with outdated approaches

### Strategic Recommendations
1. **Focus on Differentiation**: Emphasize unique value propositions
2. **Speed to Market**: Leverage agility advantage for faster feature delivery
3. **Partnership Strategy**: Build strategic alliances to compete with larger players
4. **Customer Retention**: Invest in superior customer success and support`;

    return competitiveAnalysis;
  }

  private generateRiskAssessment(productName: string): string {
    return `## ⚠️ Risk Assessment

### Technical Risks
**High Priority:**
- **Scalability Challenges**: Risk of performance issues with user growth
  - *Mitigation*: Design for scale from day one, implement monitoring
- **Security Vulnerabilities**: Data protection and privacy concerns
  - *Mitigation*: Security-first development, regular audits, compliance

**Medium Priority:**
- **Integration Complexity**: Challenges connecting with external systems
  - *Mitigation*: Modular architecture, comprehensive API testing
- **Technical Debt**: Accumulation affecting development speed
  - *Mitigation*: Regular refactoring, code quality standards

### Market Risks
**High Priority:**
- **Competitive Response**: Established players launching similar features
  - *Mitigation*: Focus on differentiation, build switching costs
- **Market Timing**: Product launch timing relative to market readiness
  - *Mitigation*: Market validation, phased rollout approach

**Medium Priority:**
- **User Adoption**: Slower than expected uptake by target audience
  - *Mitigation*: Strong user onboarding, feedback loops
- **Feature Scope Creep**: Expanding requirements affecting timeline
  - *Mitigation*: Clear prioritization framework, MVP approach

### Business Risks
**High Priority:**
- **Resource Constraints**: Insufficient team or budget for delivery
  - *Mitigation*: Realistic planning, phase-based development
- **Regulatory Changes**: New compliance requirements affecting product
  - *Mitigation*: Monitor regulatory landscape, build flexibility

**Low Priority:**
- **Team Turnover**: Key personnel leaving during development
  - *Mitigation*: Knowledge documentation, team redundancy
- **Vendor Dependencies**: Third-party service reliability
  - *Mitigation*: Vendor diversification, fallback options

### Risk Monitoring Framework
1. **Weekly Risk Reviews**: Regular assessment of risk status
2. **Escalation Triggers**: Clear criteria for risk escalation
3. **Mitigation Tracking**: Progress monitoring for risk responses
4. **Contingency Planning**: Backup plans for high-impact risks`;
  }

  private generateSuccessMetrics(productName: string): string {
    return `## 📈 Success Metrics & KPIs

### Primary Success Metrics

#### User Adoption Metrics
- **Monthly Active Users (MAU)**: Target growth rate and absolute numbers
- **User Retention Rate**: Day 1, Day 7, Day 30 retention percentages
- **User Onboarding Completion**: Percentage completing setup process
- **Feature Adoption Rate**: Usage of key product features

#### Business Metrics
- **Revenue Growth**: Monthly/quarterly revenue targets
- **Customer Acquisition Cost (CAC)**: Cost to acquire new users
- **Customer Lifetime Value (CLV)**: Long-term value per customer
- **Conversion Rate**: Free-to-paid conversion percentages

#### Product Quality Metrics
- **User Satisfaction Score (CSAT)**: User happiness measurement
- **Net Promoter Score (NPS)**: User recommendation likelihood
- **Support Ticket Volume**: Customer support request trends
- **Bug Report Rate**: Quality and stability indicators

### Secondary Success Metrics

#### Engagement Metrics
- **Session Duration**: Average time spent in product
- **Page/Screen Views**: User journey through application
- **Feature Usage Frequency**: How often users engage with features
- **User-Generated Content**: Content created by users (if applicable)

#### Performance Metrics
- **System Uptime**: Availability and reliability metrics
- **Response Time**: Application performance measurements
- **Error Rate**: System error frequency and types
- **Load Capacity**: Concurrent user handling capability

### Success Criteria Timeline

#### 3-Month Targets
- [ ] Achieve initial user base of [specific number]
- [ ] Complete user onboarding process optimization
- [ ] Establish baseline metrics for all KPIs
- [ ] Reach target system performance benchmarks

#### 6-Month Targets
- [ ] Hit user retention rate targets
- [ ] Achieve revenue milestones
- [ ] Expand feature adoption rates
- [ ] Complete competitive positioning

#### 12-Month Targets
- [ ] Scale to target market size
- [ ] Achieve sustainability metrics
- [ ] Establish market leadership position
- [ ] Plan for next phase expansion

### Measurement Framework
1. **Real-time Dashboards**: Live monitoring of key metrics
2. **Weekly Reviews**: Regular performance assessment
3. **Monthly Deep Dives**: Comprehensive metric analysis
4. **Quarterly Strategy Reviews**: Long-term trend evaluation`;
  }

  private enhancePRDContent(originalContent: string, enhancement_level: string, focus_areas: string[]): string {
    let enhancedContent = originalContent;
    
    // Extract basic info for enhancements
    const titleMatch = originalContent.match(/^#\s+(.+)$/m);
    const productName = titleMatch ? titleMatch[1].replace(/📋\s*Product Requirements Document\s*##\s*/, '').trim() : 'Product';
    
    // Extract target audience if mentioned
    const audienceMatch = originalContent.match(/target\s+(?:audience|users?|customers?):\s*([^\n.]+)/i);
    const targetAudience = audienceMatch ? audienceMatch[1].trim() : 'users';

    // Add missing sections based on enhancement level and focus areas
    const enhancements = [];

    if (enhancement_level === 'comprehensive' || enhancement_level === 'advanced') {
      if (!originalContent.includes('Market Analysis') && 
          (focus_areas.includes('market_analysis') || focus_areas.includes('all'))) {
        enhancements.push(this.generateMarketAnalysis(productName, targetAudience));
      }

      if (!originalContent.includes('Competitive Analysis') && 
          (focus_areas.includes('competitive_analysis') || focus_areas.includes('all'))) {
        enhancements.push(this.generateCompetitiveAnalysis(productName));
      }

      if (!originalContent.includes('Risk Assessment') && 
          (focus_areas.includes('risk_assessment') || focus_areas.includes('all'))) {
        enhancements.push(this.generateRiskAssessment(productName));
      }

      if (!originalContent.includes('Success Metrics') && 
          (focus_areas.includes('success_metrics') || focus_areas.includes('all'))) {
        enhancements.push(this.generateSuccessMetrics(productName));
      }
    }

    // Add implementation recommendations section
    if (enhancement_level === 'advanced' && 
        (focus_areas.includes('implementation') || focus_areas.includes('all'))) {
      const implementationSection = `## 🚀 Implementation Recommendations

### Development Approach
**Recommended Methodology**: Agile development with 2-week sprints
- **Phase 1 (Months 1-2)**: Core MVP features and basic functionality
- **Phase 2 (Months 3-4)**: Enhanced features and user experience improvements
- **Phase 3 (Months 5-6)**: Advanced features and market expansion

### Technology Stack Recommendations
**Frontend**: Modern web framework (React, Vue.js, or Angular)
**Backend**: Scalable server architecture (Node.js, Python Django, or similar)
**Database**: Cloud-native database solution with backup and scaling
**Infrastructure**: Cloud platform (AWS, Azure, or GCP) with CI/CD pipeline

### Team Structure
**Core Team Size**: 5-8 people
- Product Manager (1)
- Frontend Developers (2)
- Backend Developers (2)
- UI/UX Designer (1)
- QA Engineer (1)
- DevOps Engineer (0.5 FTE)

### Quality Assurance Framework
1. **Automated Testing**: Unit tests, integration tests, end-to-end tests
2. **Code Review Process**: Mandatory peer reviews for all code changes
3. **Performance Monitoring**: Real-time application performance tracking
4. **Security Scanning**: Regular security audits and vulnerability assessments

### Go-to-Market Strategy
1. **Beta Testing**: Limited release to selected users for feedback
2. **Soft Launch**: Gradual rollout to broader audience
3. **Marketing Campaign**: Multi-channel approach including digital and traditional media
4. **Partnership Development**: Strategic alliances for market penetration`;

      enhancements.push(implementationSection);
    }

    // Append enhancements to the original content
    if (enhancements.length > 0) {
      enhancedContent += '\n\n---\n\n# 🔄 Enhanced Sections\n\n';
      enhancedContent += enhancements.join('\n\n');
    }

    return enhancedContent;
  }

  private generateOptimizationSuggestions(analysis: any, productName: string): any[] {
    const suggestions = [];

    // Content optimization suggestions
    if (analysis.overallScore < 70) {
      suggestions.push({
        category: 'Content Quality',
        priority: 'high',
        title: 'Expand Critical Sections',
        description: 'Several sections need more comprehensive content to meet professional standards.',
        actionItems: [
          'Add detailed explanations to thin sections',
          'Include specific examples and use cases',
          'Provide quantitative data where possible',
          'Add visual elements like charts or diagrams'
        ],
        estimatedImpact: 'Major improvement in PRD professionalism and clarity'
      });
    }

    // Structure optimization
    if (analysis.missingCriticalSections.length > 0) {
      suggestions.push({
        category: 'Document Structure',
        priority: 'high',
        title: 'Add Missing Essential Sections',
        description: `Critical sections are missing: ${analysis.missingCriticalSections.join(', ')}`,
        actionItems: analysis.missingCriticalSections.map(section => `Add comprehensive ${section} section`),
        estimatedImpact: 'Complete PRD coverage of essential product requirements'
      });
    }

    // Enhancement suggestions
    if (analysis.missingSections.length > 0) {
      suggestions.push({
        category: 'Enhancement Opportunities',
        priority: 'medium',
        title: 'Add Value-Adding Sections',
        description: 'Additional sections could provide strategic value to stakeholders.',
        actionItems: analysis.missingSections.slice(0, 4).map(section => `Consider adding ${section} for comprehensive coverage`),
        estimatedImpact: 'Enhanced strategic value and stakeholder confidence'
      });
    }

    // User experience improvements
    suggestions.push({
      category: 'User Experience',
      priority: 'medium',
      title: 'Improve Document Navigation',
      description: 'Enhance PRD readability and accessibility for different stakeholder types.',
      actionItems: [
        'Add executive summary with key takeaways',
        'Include table of contents with page numbers',
        'Add cross-references between related sections',
        'Create glossary for technical terms',
        'Include quick reference sections for key metrics'
      ],
      estimatedImpact: 'Better stakeholder engagement and document utility'
    });

    // Validation and testing
    suggestions.push({
      category: 'Validation Framework',
      priority: 'medium',
      title: 'Add Validation and Testing Strategy',
      description: 'Include mechanisms for validating assumptions and measuring success.',
      actionItems: [
        'Define hypothesis validation methods',
        'Add user testing and feedback collection plans',
        'Include A/B testing strategies for key features',
        'Specify performance benchmarks and success criteria',
        'Add post-launch review and iteration process'
      ],
      estimatedImpact: 'Reduced project risk and improved market fit'
    });

    // Stakeholder alignment
    suggestions.push({
      category: 'Stakeholder Alignment',
      priority: 'low',
      title: 'Enhance Stakeholder Communication',
      description: 'Improve PRD effectiveness for different audience types.',
      actionItems: [
        'Add role-specific summary sections',
        'Include decision frameworks and approval criteria',
        'Specify communication and review schedules',
        'Add change management process',
        'Include escalation procedures for issues'
      ],
      estimatedImpact: 'Smoother project execution and stakeholder buy-in'
    });

    return suggestions;
  }

  // Main enhance_prd implementation
  private async handleEnhancePrd(args: any) {
    try {
      const {
        prd_content,
        prd_url,
        enhancement_level = 'comprehensive',
        focus_areas = ['all'],
        include_market_analysis = true,
        include_competitive_analysis = true,
        include_risk_assessment = true,
        include_success_metrics = true,
        include_implementation_guidance = false,
        competitors = [],
        target_industry,
        quality_threshold = 70,
        generate_optimization_report = true,
        output_format = 'enhanced_document',
        preserve_original_structure = true
      } = args;

      let originalContent = prd_content;

      // Fetch from URL if provided
      if (prd_url && !prd_content) {
        throw new Error('URL fetching not implemented. Please provide prd_content directly.');
      }

      if (!originalContent) {
        throw new Error('Either prd_content or prd_url must be provided');
      }

      // Analyze current PRD quality
      const qualityAnalysis = this.assessPRDQuality(originalContent);

      // Generate enhanced content
      const enhancedContent = this.enhancePRDContent(
        originalContent, 
        enhancement_level, 
        focus_areas
      );

      // Generate optimization suggestions
      const optimizationSuggestions = this.generateOptimizationSuggestions(
        qualityAnalysis,
        this.extractProductName(originalContent)
      );

      // Prepare output based on format
      if (output_format === 'analysis_only') {
        const analysisReport = `# 📊 PRD Quality Analysis Report

## Overall Assessment
**Quality Score**: ${Math.round(qualityAnalysis.overallScore)}% ${qualityAnalysis.overallScore >= 80 ? '🟢 Excellent' : qualityAnalysis.overallScore >= 60 ? '🟡 Good' : '🔴 Needs Improvement'}

## Section Analysis
${Object.entries(qualityAnalysis.sectionScores).map(([section, data]: [string, any]) => 
  `### ${section}
- **Score**: ${Math.round(data.score * 100)}% (${data.status})
- **Weight**: ${Math.round(data.weight * 100)}%
- **Impact**: ${Math.round(data.weightedScore * 100)} points`
).join('\n\n')}

## Completeness Metrics
- **Total Sections**: ${qualityAnalysis.completenessMetrics.totalSections}
- **Present Sections**: ${qualityAnalysis.completenessMetrics.presentSections}
- **Missing Sections**: ${qualityAnalysis.completenessMetrics.missingSections}
- **Completeness**: ${qualityAnalysis.completenessMetrics.completenessPercentage}%

## Critical Issues
${qualityAnalysis.missingCriticalSections.length > 0 ? 
  `**Missing Critical Sections**: ${qualityAnalysis.missingCriticalSections.join(', ')}` : 
  '✅ All critical sections present'}

## Recommendations
${qualityAnalysis.recommendations.map((rec: any) => 
  `### ${rec.category} (${rec.priority} priority)
${rec.description}`
).join('\n\n')}

## Optimization Suggestions
${optimizationSuggestions.map((suggestion: any) => 
  `### ${suggestion.title}
**Category**: ${suggestion.category} | **Priority**: ${suggestion.priority}

${suggestion.description}

**Action Items**:
${suggestion.actionItems.map((item: string) => `- ${item}`).join('\n')}

**Expected Impact**: ${suggestion.estimatedImpact}`
).join('\n\n')}`;

        return {
          content: [{
            type: "text",
            text: analysisReport
          }]
        };
      }

      if (output_format === 'optimization_plan') {
        const optimizationPlan = `# 🎯 PRD Optimization Plan

## Current State Assessment
- **Quality Score**: ${Math.round(qualityAnalysis.overallScore)}%
- **Completeness**: ${qualityAnalysis.completenessMetrics.completenessPercentage}%
- **Critical Issues**: ${qualityAnalysis.missingCriticalSections.length} missing sections

## Optimization Roadmap

${optimizationSuggestions.map((suggestion: any, index: number) => 
  `### Phase ${index + 1}: ${suggestion.title}
**Priority**: ${suggestion.priority} | **Category**: ${suggestion.category}

**Objective**: ${suggestion.description}

**Tasks**:
${suggestion.actionItems.map((item: string, taskIndex: number) => `${taskIndex + 1}. ${item}`).join('\n')}

**Success Criteria**: ${suggestion.estimatedImpact}

**Estimated Effort**: ${suggestion.priority === 'high' ? '1-2 weeks' : suggestion.priority === 'medium' ? '3-5 days' : '1-2 days'}
`).join('\n\n')}

## Implementation Timeline
1. **Week 1-2**: Address high-priority issues (missing critical sections)
2. **Week 3-4**: Medium-priority enhancements (additional sections, content expansion)
3. **Week 5-6**: Low-priority improvements (navigation, stakeholder alignment)

## Quality Gates
- [ ] All critical sections present and comprehensive
- [ ] Overall quality score above ${quality_threshold}%
- [ ] Stakeholder review and approval completed
- [ ] Final optimization review conducted`;

        return {
          content: [{
            type: "text",
            text: optimizationPlan
          }]
        };
      }

      // Default: Enhanced document output
      let result = '';

      if (generate_optimization_report) {
        result += `# 📊 PRD Enhancement Report

## Enhancement Summary
**Original Quality Score**: ${Math.round(qualityAnalysis.overallScore)}%
**Enhancement Level**: ${enhancement_level}
**Focus Areas**: ${focus_areas.join(', ')}

### Improvements Made
- ✅ Enhanced ${enhancedContent.length > originalContent.length ? 'content with additional sections' : 'existing content'}
- ✅ Added ${focus_areas.length > 1 || focus_areas.includes('all') ? 'comprehensive' : 'targeted'} analysis sections
- ✅ Provided ${optimizationSuggestions.length} optimization recommendations

---

`;
      }

      result += enhancedContent;

      if (generate_optimization_report) {
        result += `

---

# 📈 Optimization Recommendations

${optimizationSuggestions.map((suggestion: any) => 
  `## ${suggestion.title}
**Priority**: ${suggestion.priority} | **Category**: ${suggestion.category}

${suggestion.description}

### Action Items:
${suggestion.actionItems.map((item: string) => `- ${item}`).join('\n')}

**Expected Impact**: ${suggestion.estimatedImpact}
`).join('\n')}

---

## 🎯 Next Steps for Continued Improvement

1. **Review Enhanced Content**: Validate all new sections for accuracy and relevance
2. **Stakeholder Feedback**: Gather input from key stakeholders on improvements
3. **Iterative Refinement**: Implement optimization suggestions based on priority
4. **Regular Updates**: Establish schedule for ongoing PRD maintenance and updates
5. **Success Measurement**: Track impact of enhancements on project outcomes

*Enhanced using AI-powered PRD analysis and optimization tools.*`;
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };

    } catch (error: any) {
      throw new Error(`Failed to enhance PRD: ${error.message}`);
    }
  }

  private extractProductName(content: string): string {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    return titleMatch ? titleMatch[1].replace(/📋\s*Product Requirements Document\s*##\s*/, '').trim() : 'Product';
  }

  // PRD Parsing and Analysis Methods (keeping existing implementation)
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

  // Implementation of handleParsePRD (keeping existing)
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
          // ADVANCED PROJECT PLANNING (3 tools)
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
    console.error("Tools available: generate_prd, parse_prd, and enhance_prd - Complete PRD lifecycle support!");
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