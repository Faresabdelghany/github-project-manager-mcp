#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Read the current file
const filePath = 'C:\\tmp\\github-project-manager-mcp-local\\src\\index.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the missing return statement
content = content.replace(
  /Math\.min\(complexity, 8\); \/\/ Cap at 8 story points/,
  'return Math.min(complexity, 8); // Cap at 8 story points'
);

// Add the comprehensive complexity analysis method after the analyzeIssueComplexity method
const complexityAnalysisMethod = `
  // AI-powered comprehensive complexity analysis method
  private performDetailedComplexityAnalysis(issue: any): any {
    const analysis = {
      overallScore: 0,
      storyPoints: 0,
      effortEstimate: '',
      timelineEstimate: '',
      riskLevel: '',
      complexityCategory: '',
      summary: '',
      confidenceLevel: 0,
      factors: [] as any[],
      technicalAnalysis: {
        domains: [] as string[],
        complexity: 0,
        integrationRequirements: '',
        architectureImpact: ''
      },
      dependencies: [] as string[],
      blockers: [] as any[],
      risks: [] as any[],
      resourceRequirements: {
        skills: [] as string[],
        teamSize: '',
        specializedKnowledge: false,
        externalDependencies: false
      },
      recommendations: [] as any[],
      actionItems: [] as any[]
    };

    // Basic complexity from existing method
    const basicComplexity = this.analyzeIssueComplexity(issue);
    analysis.storyPoints = basicComplexity;

    // Technical domain analysis
    const technicalKeywords = {
      'Frontend': ['ui', 'ux', 'interface', 'react', 'vue', 'angular', 'css', 'html', 'javascript'],
      'Backend': ['api', 'server', 'database', 'sql', 'nosql', 'microservice', 'endpoint'],
      'DevOps': ['deployment', 'docker', 'kubernetes', 'ci/cd', 'pipeline', 'infrastructure'],
      'Security': ['auth', 'security', 'encryption', 'vulnerability', 'https', 'ssl', 'oauth'],
      'Performance': ['optimization', 'performance', 'speed', 'memory', 'cpu', 'scalability'],
      'Testing': ['test', 'unit test', 'integration test', 'e2e', 'qa', 'automation'],
      'Data': ['data', 'analytics', 'etl', 'warehouse', 'pipeline', 'migration']
    };

    const issueText = \`\${issue.title} \${issue.body || ''}\`.toLowerCase();
    
    // Identify technical domains
    Object.entries(technicalKeywords).forEach(([domain, keywords]) => {
      const domainScore = keywords.filter(keyword => issueText.includes(keyword)).length;
      if (domainScore > 0) {
        analysis.technicalAnalysis.domains.push(domain);
      }
    });

    // Complexity factor analysis
    const factors = [];

    // Title complexity factor
    const titleWords = issue.title.split(' ').length;
    if (titleWords > 8) {
      factors.push({
        category: 'Scope Complexity',
        impact: Math.min(Math.floor(titleWords / 5), 5),
        description: 'Task has a complex or broad scope based on title length',
        details: [\`Title contains \${titleWords} words indicating multiple components\`]
      });
    }

    // Description complexity factor
    if (issue.body) {
      const bodyLength = issue.body.length;
      const sentences = issue.body.split(/[.!?]+/).length;
      const codeBlocks = (issue.body.match(/\`\`\`/g) || []).length / 2;
      
      if (bodyLength > 500) {
        factors.push({
          category: 'Requirement Complexity',
          impact: bodyLength > 2000 ? 4 : bodyLength > 1000 ? 3 : 2,
          description: 'Detailed requirements suggest complex implementation',
          details: [
            \`Description length: \${bodyLength} characters\`,
            \`Number of sentences: \${sentences}\`,
            codeBlocks > 0 ? \`Contains \${codeBlocks} code examples\` : ''
          ].filter(Boolean)
        });
      }

      // Technical keyword analysis
      const highComplexityTerms = [
        'architecture', 'refactor', 'migration', 'integration', 'scalability',
        'optimization', 'algorithm', 'protocol', 'framework', 'distributed'
      ];
      
      const complexTermCount = highComplexityTerms.filter(term => 
        issueText.includes(term)
      ).length;

      if (complexTermCount > 0) {
        factors.push({
          category: 'Technical Complexity',
          impact: Math.min(complexTermCount + 1, 5),
          description: 'Contains technically complex concepts',
          details: highComplexityTerms.filter(term => issueText.includes(term))
            .map(term => \`Involves \${term}\`)
        });
      }
    }

    // Label complexity analysis
    const complexityLabels = ['epic', 'large', 'complex', 'research', 'spike', 'breaking-change'];
    const priorityLabels = ['critical', 'high', 'urgent', 'p0', 'p1'];
    
    const hasComplexityLabels = issue.labels.some((label: any) =>
      complexityLabels.some(keyword => label.name.toLowerCase().includes(keyword))
    );

    const hasPriorityLabels = issue.labels.some((label: any) =>
      priorityLabels.some(keyword => label.name.toLowerCase().includes(keyword))
    );

    if (hasComplexityLabels) {
      factors.push({
        category: 'Labeled Complexity',
        impact: 4,
        description: 'Issue is explicitly marked as complex',
        details: issue.labels
          .filter((label: any) => complexityLabels.some(keyword => 
            label.name.toLowerCase().includes(keyword)))
          .map((label: any) => \`Tagged as: \${label.name}\`)
      });
    }

    if (hasPriorityLabels) {
      factors.push({
        category: 'Priority Impact',
        impact: 3,
        description: 'High priority may indicate complexity or urgency',
        details: [\`High priority requires careful implementation\`]
      });
    }

    analysis.factors = factors;

    // Calculate overall score
    const totalImpact = factors.reduce((sum, factor) => sum + factor.impact, 0);
    analysis.overallScore = Math.min(Math.round((totalImpact / factors.length || 1) * 2), 10);
    analysis.technicalAnalysis.complexity = Math.min(analysis.technicalAnalysis.domains.length + 1, 5);

    // Dependencies analysis
    if (issue.body) {
      const issueReferences = issue.body.match(/#\\d+/g) || [];
      analysis.dependencies = issueReferences.map(ref => \`Issue \${ref}\`);
    }

    // Risk assessment
    const risks = [];
    
    if (analysis.overallScore >= 8) {
      risks.push({
        category: 'Implementation Risk',
        severity: 'high',
        description: 'High complexity may lead to implementation challenges',
        impact: 'Schedule delays, potential quality issues',
        mitigation: 'Break down into smaller tasks, conduct spike investigations'
      });
    }

    if (analysis.technicalAnalysis.domains.length > 2) {
      risks.push({
        category: 'Cross-Domain Risk',
        severity: 'medium',
        description: 'Task spans multiple technical domains',
        impact: 'Requires diverse skill sets, potential coordination overhead',
        mitigation: 'Assign team members with complementary skills'
      });
    }

    if (analysis.dependencies.length > 2) {
      risks.push({
        category: 'Dependency Risk',
        severity: 'medium',
        description: 'Multiple dependencies may create blockers',
        impact: 'Potential delays if dependencies are not ready',
        mitigation: 'Prioritize dependency resolution, create parallel work streams'
      });
    }

    analysis.risks = risks;

    // Resource requirements
    analysis.resourceRequirements = {
      skills: analysis.technicalAnalysis.domains.length > 0 ? 
        analysis.technicalAnalysis.domains : ['General Development'],
      teamSize: analysis.overallScore >= 7 ? '2-3 developers' : 
                analysis.overallScore >= 4 ? '1-2 developers' : '1 developer',
      specializedKnowledge: analysis.technicalAnalysis.complexity >= 4,
      externalDependencies: analysis.dependencies.length > 0
    };

    // Effort and timeline estimation
    const baseHours = analysis.storyPoints * 4; // 4 hours per story point
    const riskMultiplier = risks.length > 0 ? 1.5 : 1.2;
    const totalHours = Math.round(baseHours * riskMultiplier);
    
    analysis.effortEstimate = \`\${totalHours} hours (\${Math.round(totalHours / 8)} days)\`;
    analysis.timelineEstimate = totalHours > 40 ? '1-2 weeks' : 
                               totalHours > 16 ? '3-5 days' : '1-2 days';

    // Risk level
    analysis.riskLevel = analysis.overallScore >= 8 ? 'High' :
                        analysis.overallScore >= 5 ? 'Medium' : 'Low';

    // Complexity category
    analysis.complexityCategory = analysis.overallScore >= 8 ? 'High' :
                                 analysis.overallScore >= 5 ? 'Medium' : 'Low';

    // Generate recommendations
    const recommendations = [];

    if (analysis.overallScore >= 7) {
      recommendations.push({
        category: 'Task Breakdown',
        recommendation: 'Break this task into smaller, manageable subtasks',
        reasoning: 'High complexity tasks should be decomposed for better estimation and tracking'
      });
    }

    if (analysis.technicalAnalysis.domains.length > 2) {
      recommendations.push({
        category: 'Team Assignment',
        recommendation: 'Assign team members with complementary skills across domains',
        reasoning: 'Multiple technical domains require diverse expertise'
      });
    }

    if (analysis.dependencies.length > 0) {
      recommendations.push({
        category: 'Dependency Management',
        recommendation: 'Map out and prioritize dependency resolution',
        reasoning: 'Dependencies can become blockers if not properly managed'
      });
    }

    if (risks.some(r => r.severity === 'high')) {
      recommendations.push({
        category: 'Risk Mitigation',
        recommendation: 'Conduct a technical spike or proof of concept first',
        reasoning: 'High-risk tasks benefit from initial investigation to reduce uncertainty'
      });
    }

    analysis.recommendations = recommendations;

    // Action items
    const actionItems = [];

    actionItems.push({
      action: 'Review and validate requirements',
      priority: 'high',
      estimatedTime: '1-2 hours',
      owner: 'Product Owner'
    });

    if (analysis.overallScore >= 5) {
      actionItems.push({
        action: 'Create detailed technical design',
        priority: 'high',
        estimatedTime: '4-8 hours',
        owner: 'Tech Lead'
      });
    }

    if (analysis.dependencies.length > 0) {
      actionItems.push({
        action: 'Resolve dependencies and blockers',
        priority: 'high',
        estimatedTime: 'Variable',
        owner: 'Development Team'
      });
    }

    actionItems.push({
      action: 'Break down into implementation tasks',
      priority: analysis.overallScore >= 6 ? 'high' : 'medium',
      estimatedTime: '2-4 hours',
      owner: 'Developer'
    });

    analysis.actionItems = actionItems;

    // Summary and confidence
    analysis.summary = \`The analysis indicates \${analysis.complexityCategory.toLowerCase()} complexity with \${analysis.storyPoints} story points. \` +
      \`Key complexity drivers include \${factors.map(f => f.category.toLowerCase()).join(', ') || 'standard implementation requirements'}. \` +
      \`\${risks.length > 0 ? \`Main risks involve \${risks.map(r => r.category.toLowerCase()).join(' and ')}.\` : 'Risk level is manageable.'}\`;

    analysis.confidenceLevel = Math.max(60, Math.min(95, 80 + (factors.length * 5) - (risks.length * 10)));

    return analysis;
  }
`;

// Add the method after the analyzeIssueComplexity method
content = content.replace(
  /private calculateIssuePriority\(issue: any\): number \{/,
  complexityAnalysisMethod + '\n\n  private calculateIssuePriority(issue: any): number {'
);

// Replace the stub implementation of handleAnalyzeTaskComplexity
const newHandleMethod = `  private async handleAnalyzeTaskComplexity(args: any) {
    this.validateRepoConfig();

    try {
      const issueNumber = args.issue_number;
      
      // Get the issue details
      const issueResponse = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      const issue = issueResponse.data;

      // Comprehensive complexity analysis
      const complexityAnalysis = this.performDetailedComplexityAnalysis(issue);
      
      // Generate detailed report
      let result = \`🧠 **AI-Powered Task Complexity Analysis**\\n\\n\`;
      result += \`**Issue:** #\${issue.number} - \${issue.title}\\n\`;
      result += \`**State:** \${issue.state}\\n\`;
      result += \`**Created:** \${new Date(issue.created_at).toLocaleDateString()}\\n\`;
      result += \`**Last Updated:** \${new Date(issue.updated_at).toLocaleDateString()}\\n\\n\`;

      result += \`---\\n\\n\`;

      // Overall Complexity Score
      result += \`## 📊 **Overall Complexity Score: \${complexityAnalysis.overallScore}/10**\\n\\n\`;
      result += \`**Story Points Estimate:** \${complexityAnalysis.storyPoints}\\n\`;
      result += \`**Effort Estimate:** \${complexityAnalysis.effortEstimate}\\n\`;
      result += \`**Timeline Estimate:** \${complexityAnalysis.timelineEstimate}\\n\`;
      result += \`**Risk Level:** \${complexityAnalysis.riskLevel}\\n\\n\`;

      // Complexity Breakdown
      result += \`## 🔍 **Complexity Factor Breakdown**\\n\\n\`;
      if (complexityAnalysis.factors.length > 0) {
        complexityAnalysis.factors.forEach(factor => {
          const emoji = factor.impact >= 3 ? '🔴' : factor.impact >= 2 ? '🟡' : '🟢';
          result += \`\${emoji} **\${factor.category}** (Impact: \${factor.impact}/5)\\n\`;
          result += \`   📝 \${factor.description}\\n\`;
          if (factor.details.length > 0) {
            factor.details.forEach(detail => {
              result += \`   • \${detail}\\n\`;
            });
          }
          result += \`\\n\`;
        });
      } else {
        result += \`🟢 **Standard Complexity** - No major complexity factors identified\\n\\n\`;
      }

      // Technical Analysis
      result += \`## 🔧 **Technical Analysis**\\n\\n\`;
      result += \`**Programming Domains:** \${complexityAnalysis.technicalAnalysis.domains.join(', ') || 'General'}\\n\`;
      result += \`**Technical Complexity:** \${complexityAnalysis.technicalAnalysis.complexity}/5\\n\`;
      result += \`**Multi-Domain Task:** \${complexityAnalysis.technicalAnalysis.domains.length > 1 ? 'Yes' : 'No'}\\n\\n\`;

      // Dependencies & Blockers
      if (complexityAnalysis.dependencies.length > 0 || complexityAnalysis.blockers.length > 0) {
        result += \`## 🔗 **Dependencies & Blockers**\\n\\n\`;
        
        if (complexityAnalysis.dependencies.length > 0) {
          result += \`**Dependencies:**\\n\`;
          complexityAnalysis.dependencies.forEach(dep => {
            result += \`• \${dep}\\n\`;
          });
          result += \`\\n\`;
        } else {
          result += \`✅ **No Dependencies** - Task appears to be self-contained\\n\\n\`;
        }
      }

      // Risk Assessment
      result += \`## ⚠️ **Risk Assessment**\\n\\n\`;
      if (complexityAnalysis.risks.length > 0) {
        complexityAnalysis.risks.forEach(risk => {
          const riskEmoji = risk.severity === 'high' ? '🔴' : risk.severity === 'medium' ? '🟡' : '🟢';
          result += \`\${riskEmoji} **\${risk.category}** (\${risk.severity})\\n\`;
          result += \`   📄 \${risk.description}\\n\`;
          result += \`   🎯 Impact: \${risk.impact}\\n\`;
          result += \`   💡 Mitigation: \${risk.mitigation}\\n\\n\`;
        });
      } else {
        result += \`🟢 **Low Risk** - No significant risks identified\\n\\n\`;
      }

      // Resource Requirements
      result += \`## 👥 **Resource Requirements**\\n\\n\`;
      result += \`**Required Skills:** \${complexityAnalysis.resourceRequirements.skills.join(', ')}\\n\`;
      result += \`**Team Size:** \${complexityAnalysis.resourceRequirements.teamSize}\\n\`;
      result += \`**Specialized Knowledge:** \${complexityAnalysis.resourceRequirements.specializedKnowledge ? 'Required' : 'Not Required'}\\n\`;
      result += \`**External Dependencies:** \${complexityAnalysis.resourceRequirements.externalDependencies ? 'Yes' : 'No'}\\n\\n\`;

      // Recommendations
      result += \`## 💡 **AI Recommendations**\\n\\n\`;
      if (complexityAnalysis.recommendations.length > 0) {
        complexityAnalysis.recommendations.forEach((rec, index) => {
          result += \`\${index + 1}. **\${rec.category}:** \${rec.recommendation}\\n\`;
          if (rec.reasoning) {
            result += \`   📋 Reasoning: \${rec.reasoning}\\n\`;
          }
          result += \`\\n\`;
        });
      } else {
        result += \`✅ **Standard Approach** - Task can be implemented using standard development practices\\n\\n\`;
      }

      // Action Items
      result += \`## ✅ **Suggested Action Items**\\n\\n\`;
      complexityAnalysis.actionItems.forEach((item, index) => {
        const priorityEmoji = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
        result += \`\${index + 1}. \${priorityEmoji} **\${item.action}**\\n\`;
        result += \`   📊 Priority: \${item.priority}\\n\`;
        result += \`   ⏱️ Estimated Time: \${item.estimatedTime}\\n\`;
        result += \`   👤 Owner: \${item.owner}\\n\\n\`;
      });

      // Conclusion
      result += \`---\\n\\n\`;
      result += \`## 📋 **Analysis Summary**\\n\\n\`;
      result += \`This task has been analyzed as **\${complexityAnalysis.complexityCategory}** complexity. \`;
      result += \`\${complexityAnalysis.summary}\\n\\n\`;
      result += \`**Confidence Level:** \${complexityAnalysis.confidenceLevel}%\\n\`;
      result += \`**Analysis Generated:** \${new Date().toLocaleString()}\\n\`;
      result += \`**Issue URL:** \${issue.html_url}\`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (error: any) {
      throw new Error(\`Failed to analyze task complexity: \${error.message}\`);
    }
  }`;

// Replace the stub implementation
content = content.replace(
  /private async handleAnalyzeTaskComplexity\(args: any\) \{\s*return \{ content: \[\{ type: "text", text: "Analyze task complexity functionality - to be implemented" \}\] \};\s*\}/,
  newHandleMethod
);

// Write the updated content back
fs.writeFileSync(filePath, content);
console.log('✅ Successfully implemented analyze_task_complexity tool!');
console.log('📝 Added comprehensive complexity analysis method');
console.log('🔧 Fixed missing return statement in analyzeIssueComplexity');
console.log('🎯 Replaced stub implementation with full functionality');
