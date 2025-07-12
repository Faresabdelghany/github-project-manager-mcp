import { GitHubConfig, ToolResponse } from '../../shared/types.js';
import { validateRepoConfig, handleToolError, createSuccessResponse } from '../../utils/helpers.js';

/**
 * Requirements Traceability Matrix Interface
 */
interface Requirement {
  id: string;
  type: 'issue' | 'milestone' | 'pull_request' | 'label' | 'epic';
  source: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'closed' | 'active';
  labels: string[];
  assignees: string[];
  milestone?: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  number?: number;
  category: string;
  businessValue: string;
  technicalComplexity: string;
  traceabilityLevel: 'strategic' | 'detailed' | 'implementation' | 'categorical';
  dependencies: number[];
  linkedItems: any[];
}

interface TraceabilityMapping {
  id: string;
  from: string;
  to: string;
  type: 'implements' | 'depends_on' | 'traces_to' | 'contributes_to' | 'tested_by';
  direction: 'forward' | 'backward' | 'bidirectional';
  strength: 'weak' | 'medium' | 'strong';
  description: string;
}

interface TraceabilityMatrix {
  title: string;
  metadata: {
    generatedAt: string;
    repository: string;
    traceabilityDirection: string;
    complianceLevel: string;
    sourceTypes: string[];
  };
  summary: {
    totalRequirements: number;
    mappedRequirements: number;
    coveragePercentage: number;
    totalIssues: number;
    totalMilestones: number;
    totalPullRequests: number;
  };
  requirements: Requirement[];
  traceabilityMappings: TraceabilityMapping[];
  coverageAnalysis?: any;
  impactAnalysis?: any;
  dependencyGraph?: any;
}

/**
 * Create comprehensive requirements traceability matrix
 */
export async function createTraceabilityMatrix(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    validateRepoConfig(config);

    const {
      title = 'Requirements Traceability Matrix',
      source_types = ['issues', 'milestones', 'pull_requests'],
      traceability_direction = 'bidirectional',
      include_coverage_analysis = true,
      include_impact_analysis = true,
      include_dependency_graph = true,
      filter_labels = [],
      filter_milestones = [],
      filter_status = 'all',
      output_format = 'markdown',
      create_issue = false,
      compliance_level = 'standard'
    } = args;

    // Fetch data from GitHub
    const data = await fetchGitHubData(config, filter_status);

    // Extract requirements from different sources
    const requirements = await extractRequirements(data, source_types, filter_labels, filter_milestones);

    // Create traceability mappings
    const mappings = createMappings(requirements, traceability_direction);

    // Generate analysis
    const coverageAnalysis = include_coverage_analysis ? generateCoverageAnalysis(requirements, mappings) : null;
    const impactAnalysis = include_impact_analysis ? generateImpactAnalysis(requirements, mappings) : null;
    const dependencyGraph = include_dependency_graph ? generateDependencyGraph(requirements, mappings) : null;

    // Create matrix data structure
    const matrixData: TraceabilityMatrix = {
      title,
      metadata: {
        generatedAt: new Date().toISOString(),
        repository: `${config.owner}/${config.repo}`,
        traceabilityDirection: traceability_direction,
        complianceLevel: compliance_level,
        sourceTypes: source_types
      },
      summary: {
        totalRequirements: requirements.length,
        mappedRequirements: mappings.length,
        coveragePercentage: calculateCoveragePercentage(requirements, mappings),
        totalIssues: data.issues.length,
        totalMilestones: data.milestones.length,
        totalPullRequests: data.pullRequests.length
      },
      requirements,
      traceabilityMappings: mappings,
      coverageAnalysis,
      impactAnalysis,
      dependencyGraph
    };

    // Format output
    let result = '';
    switch (output_format) {
      case 'json':
        result = JSON.stringify(matrixData, null, 2);
        break;
      case 'html':
        result = generateHTMLMatrix(matrixData);
        break;
      case 'csv':
        result = generateCSVMatrix(matrixData);
        break;
      default:
        result = generateMarkdownMatrix(matrixData, compliance_level);
    }

    // Create GitHub issue if requested
    if (create_issue) {
      await createMatrixIssue(config, title, result, output_format, compliance_level);
      result += `\n\n✅ **Traceability Matrix Issue Created Successfully!**`;
    }

    return createSuccessResponse(result);
  } catch (error) {
    return handleToolError(error, 'create_traceability_matrix');
  }
}

/**
 * Fetch all required data from GitHub
 */
async function fetchGitHubData(config: GitHubConfig, filterStatus: string) {
  const [issuesResponse, milestonesResponse, pullRequestsResponse, labelsResponse] = await Promise.all([
    config.octokit.rest.issues.listForRepo({
      owner: config.owner,
      repo: config.repo,
      state: filterStatus as 'open' | 'closed' | 'all',
      per_page: 100
    }),
    config.octokit.rest.issues.listMilestones({
      owner: config.owner,
      repo: config.repo,
      state: 'all',
      per_page: 100
    }),
    config.octokit.rest.pulls.list({
      owner: config.owner,
      repo: config.repo,
      state: 'all',
      per_page: 100
    }),
    config.octokit.rest.issues.listLabelsForRepo({
      owner: config.owner,
      repo: config.repo,
      per_page: 100
    })
  ]);

  return {
    issues: issuesResponse.data.filter(issue => !issue.pull_request),
    milestones: milestonesResponse.data,
    pullRequests: pullRequestsResponse.data,
    labels: labelsResponse.data
  };
}

/**
 * Extract requirements from different GitHub sources
 */
async function extractRequirements(
  data: any, 
  sourceTypes: string[], 
  filterLabels: string[], 
  filterMilestones: string[]
): Promise<Requirement[]> {
  const requirements: Requirement[] = [];

  // Extract from issues
  if (sourceTypes.includes('issues')) {
    for (const issue of data.issues) {
      // Apply label filter
      if (filterLabels.length > 0 && !issue.labels.some((label: any) => filterLabels.includes(label.name))) {
        continue;
      }

      // Apply milestone filter
      if (filterMilestones.length > 0 && (!issue.milestone || !filterMilestones.includes(issue.milestone.title))) {
        continue;
      }

      requirements.push({
        id: `REQ-ISSUE-${issue.number}`,
        type: 'issue',
        source: 'GitHub Issues',
        title: issue.title,
        description: issue.body || '',
        priority: extractPriority(issue),
        status: issue.state as 'open' | 'closed',
        labels: issue.labels.map((l: any) => l.name),
        assignees: issue.assignees?.map((a: any) => a.login) || [],
        milestone: issue.milestone?.title,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        url: issue.html_url,
        number: issue.number,
        category: categorizeIssue(issue),
        businessValue: assessBusinessValue(issue),
        technicalComplexity: assessComplexity(issue),
        traceabilityLevel: 'detailed',
        dependencies: extractDependencies(issue.body),
        linkedItems: []
      });
    }
  }

  // Extract from milestones
  if (sourceTypes.includes('milestones')) {
    for (const milestone of data.milestones) {
      requirements.push({
        id: `REQ-MILESTONE-${milestone.number}`,
        type: 'milestone',
        source: 'GitHub Milestones',
        title: milestone.title,
        description: milestone.description || '',
        priority: 'high',
        status: milestone.state as 'open' | 'closed',
        labels: [],
        assignees: [],
        milestone: undefined,
        createdAt: milestone.created_at,
        updatedAt: milestone.updated_at,
        url: milestone.html_url,
        number: milestone.number,
        category: 'strategic',
        businessValue: 'high',
        technicalComplexity: 'variable',
        traceabilityLevel: 'strategic',
        dependencies: [],
        linkedItems: []
      });
    }
  }

  // Extract from pull requests
  if (sourceTypes.includes('pull_requests')) {
    for (const pr of data.pullRequests) {
      requirements.push({
        id: `REQ-PR-${pr.number}`,
        type: 'pull_request',
        source: 'GitHub Pull Requests',
        title: `Implementation: ${pr.title}`,
        description: pr.body || '',
        priority: 'medium',
        status: pr.state === 'open' ? 'open' : 'closed',
        labels: pr.labels?.map((l: any) => l.name) || [],
        assignees: [pr.user?.login].filter(Boolean),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        url: pr.html_url,
        number: pr.number,
        category: 'implementation',
        businessValue: 'implementation',
        technicalComplexity: calculatePRComplexity(pr),
        traceabilityLevel: 'implementation',
        dependencies: extractLinkedIssues(pr.body),
        linkedItems: []
      });
    }
  }

  return requirements;
}

/**
 * Create traceability mappings between requirements
 */
function createMappings(requirements: Requirement[], direction: string): TraceabilityMapping[] {
  const mappings: TraceabilityMapping[] = [];

  // Forward traceability: Requirements → Implementation
  if (direction === 'forward' || direction === 'bidirectional') {
    for (const req of requirements) {
      if (req.type === 'issue' && req.milestone) {
        const milestoneReq = requirements.find(r => r.type === 'milestone' && r.title === req.milestone);
        if (milestoneReq) {
          mappings.push({
            id: `MAP-${req.id}-${milestoneReq.id}`,
            from: req.id,
            to: milestoneReq.id,
            type: 'contributes_to',
            direction: 'forward',
            strength: 'strong',
            description: `Issue ${req.number} contributes to milestone ${milestoneReq.title}`
          });
        }
      }

      // Link issues to implementing PRs
      if (req.type === 'issue') {
        const implementingPRs = requirements.filter(r => 
          r.type === 'pull_request' && r.dependencies.includes(req.number || 0)
        );
        
        for (const pr of implementingPRs) {
          mappings.push({
            id: `MAP-${req.id}-${pr.id}`,
            from: req.id,
            to: pr.id,
            type: 'implemented_by',
            direction: 'forward',
            strength: 'strong',
            description: `Issue ${req.number} implemented by PR ${pr.number}`
          });
        }
      }
    }
  }

  // Backward traceability: Implementation → Requirements
  if (direction === 'backward' || direction === 'bidirectional') {
    for (const req of requirements) {
      if (req.type === 'pull_request' && req.dependencies.length > 0) {
        for (const depNumber of req.dependencies) {
          const depReq = requirements.find(r => r.number === depNumber);
          if (depReq) {
            mappings.push({
              id: `MAP-${req.id}-${depReq.id}`,
              from: req.id,
              to: depReq.id,
              type: 'traces_to',
              direction: 'backward',
              strength: 'strong',
              description: `PR ${req.number} traces back to ${depReq.type} ${depReq.number}`
            });
          }
        }
      }
    }
  }

  // Dependency mappings
  for (const req of requirements) {
    for (const depNumber of req.dependencies) {
      const depReq = requirements.find(r => r.number === depNumber);
      if (depReq) {
        mappings.push({
          id: `MAP-DEP-${req.id}-${depReq.id}`,
          from: req.id,
          to: depReq.id,
          type: 'depends_on',
          direction: 'bidirectional',
          strength: 'medium',
          description: `${req.title} depends on ${depReq.title}`
        });
      }
    }
  }

  return mappings;
}

/**
 * Generate coverage analysis
 */
function generateCoverageAnalysis(requirements: Requirement[], mappings: TraceabilityMapping[]) {
  const mappedRequirements = new Set();
  mappings.forEach(mapping => {
    mappedRequirements.add(mapping.from);
    mappedRequirements.add(mapping.to);
  });

  const totalRequirements = requirements.filter(r => r.type === 'issue' || r.type === 'milestone').length;
  const actualMapped = requirements.filter(r => mappedRequirements.has(r.id)).length;
  const coveragePercentage = totalRequirements > 0 ? Math.round((actualMapped / totalRequirements) * 100) : 0;

  const gaps = requirements.filter(r => 
    (r.type === 'issue' || r.type === 'milestone') && !mappedRequirements.has(r.id)
  );

  const orphans = requirements.filter(r => 
    r.type === 'pull_request' && !mappedRequirements.has(r.id)
  );

  return {
    coveragePercentage,
    totalRequirements,
    mappedRequirements: actualMapped,
    gaps: gaps.length,
    orphans: orphans.length,
    gapDetails: gaps.map(g => ({ id: g.id, title: g.title, type: g.type })),
    orphanDetails: orphans.map(o => ({ id: o.id, title: o.title, type: o.type })),
    recommendations: generateCoverageRecommendations(coveragePercentage, gaps.length, orphans.length)
  };
}

/**
 * Generate impact analysis
 */
function generateImpactAnalysis(requirements: Requirement[], mappings: TraceabilityMapping[]) {
  const impactMap: { [key: string]: { incoming: number; outgoing: number; totalWeight: number } } = {};

  mappings.forEach(mapping => {
    if (!impactMap[mapping.from]) {
      impactMap[mapping.from] = { incoming: 0, outgoing: 0, totalWeight: 0 };
    }
    if (!impactMap[mapping.to]) {
      impactMap[mapping.to] = { incoming: 0, outgoing: 0, totalWeight: 0 };
    }

    const weight = mapping.strength === 'strong' ? 3 : mapping.strength === 'medium' ? 2 : 1;
    impactMap[mapping.from].outgoing += 1;
    impactMap[mapping.from].totalWeight += weight;
    impactMap[mapping.to].incoming += 1;
    impactMap[mapping.to].totalWeight += weight;
  });

  const highImpact = Object.entries(impactMap)
    .filter(([_, impact]) => impact.totalWeight > 5)
    .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
    .slice(0, 10);

  const criticalPath = Object.entries(impactMap)
    .filter(([_, impact]) => impact.outgoing > 2)
    .sort((a, b) => b[1].outgoing - a[1].outgoing)
    .slice(0, 5);

  return {
    highImpactRequirements: highImpact,
    criticalPathRequirements: criticalPath,
    totalConnections: mappings.length,
    averageConnections: mappings.length / Object.keys(impactMap).length,
    riskAssessment: {
      highRisk: highImpact.length,
      mediumRisk: criticalPath.length,
      lowRisk: Object.keys(impactMap).length - highImpact.length - criticalPath.length
    }
  };
}

/**
 * Generate dependency graph structure
 */
function generateDependencyGraph(requirements: Requirement[], mappings: TraceabilityMapping[]) {
  const nodes = new Set();
  const edges: any[] = [];

  mappings.forEach(mapping => {
    nodes.add(mapping.from);
    nodes.add(mapping.to);
    edges.push({
      from: mapping.from,
      to: mapping.to,
      type: mapping.type,
      strength: mapping.strength
    });
  });

  return {
    nodes: Array.from(nodes),
    edges,
    statistics: {
      totalNodes: nodes.size,
      totalEdges: edges.length,
      density: edges.length / (nodes.size * (nodes.size - 1) || 1)
    }
  };
}

/**
 * Generate markdown output
 */
function generateMarkdownMatrix(matrixData: TraceabilityMatrix, complianceLevel: string): string {
  let markdown = `# 🔗 **${matrixData.title}**\n\n`;
  
  // Metadata section
  markdown += `## 📋 **Matrix Information**\n\n`;
  markdown += `- **Generated**: ${new Date(matrixData.metadata.generatedAt).toLocaleString()}\n`;
  markdown += `- **Repository**: ${matrixData.metadata.repository}\n`;
  markdown += `- **Traceability Direction**: ${matrixData.metadata.traceabilityDirection}\n`;
  markdown += `- **Compliance Level**: ${matrixData.metadata.complianceLevel}\n`;
  markdown += `- **Source Types**: ${matrixData.metadata.sourceTypes.join(', ')}\n\n`;
  
  // Summary section
  markdown += `## 📊 **Summary**\n\n`;
  markdown += `| Metric | Count | Details |\n`;
  markdown += `|--------|-------|----------|\n`;
  markdown += `| Total Requirements | ${matrixData.summary.totalRequirements} | All identified requirements |\n`;
  markdown += `| Mapped Requirements | ${matrixData.summary.mappedRequirements} | Requirements with traceability |\n`;
  markdown += `| Coverage Percentage | ${matrixData.summary.coveragePercentage}% | Traceability coverage |\n`;
  markdown += `| Total Issues | ${matrixData.summary.totalIssues} | GitHub issues analyzed |\n`;
  markdown += `| Total Milestones | ${matrixData.summary.totalMilestones} | Project milestones |\n`;
  markdown += `| Total Pull Requests | ${matrixData.summary.totalPullRequests} | Implementation artifacts |\n\n`;
  
  // Requirements breakdown
  markdown += `## 📑 **Requirements Breakdown**\n\n`;
  const requirementsByType = matrixData.requirements.reduce((acc: any, req) => {
    if (!acc[req.type]) acc[req.type] = [];
    acc[req.type].push(req);
    return acc;
  }, {});
  
  Object.entries(requirementsByType).forEach(([type, reqs]: [string, any]) => {
    markdown += `### ${type.charAt(0).toUpperCase() + type.slice(1)} Requirements (${reqs.length})\n\n`;
    markdown += `| ID | Title | Priority | Status | Business Value |\n`;
    markdown += `|----|-------|----------|--------|-----------------|\n`;
    reqs.slice(0, 10).forEach((req: any) => {
      markdown += `| \`${req.id}\` | [${req.title}](${req.url}) | ${req.priority} | ${req.status} | ${req.businessValue} |\n`;
    });
    if (reqs.length > 10) {
      markdown += `\n*... and ${reqs.length - 10} more ${type} requirements*\n`;
    }
    markdown += `\n`;
  });
  
  // Traceability mappings
  markdown += `## 🔗 **Traceability Mappings**\n\n`;
  markdown += `Found ${matrixData.traceabilityMappings.length} traceability relationships:\n\n`;
  
  const mappingsByType = matrixData.traceabilityMappings.reduce((acc: any, mapping) => {
    if (!acc[mapping.type]) acc[mapping.type] = [];
    acc[mapping.type].push(mapping);
    return acc;
  }, {});
  
  Object.entries(mappingsByType).forEach(([type, mappings]: [string, any]) => {
    markdown += `### ${type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} (${mappings.length})\n\n`;
    mappings.slice(0, 10).forEach((mapping: any) => {
      markdown += `- **${mapping.from}** → **${mapping.to}**\n`;
      markdown += `  - *${mapping.description}*\n`;
      markdown += `  - Strength: ${mapping.strength} | Direction: ${mapping.direction}\n\n`;
    });
    if (mappings.length > 10) {
      markdown += `*... and ${mappings.length - 10} more ${type} relationships*\n\n`;
    }
  });
  
  // Coverage analysis
  if (matrixData.coverageAnalysis) {
    markdown += `## 📈 **Coverage Analysis**\n\n`;
    markdown += `### Overall Coverage: ${matrixData.coverageAnalysis.coveragePercentage}%\n\n`;
    
    if (matrixData.coverageAnalysis.gaps > 0) {
      markdown += `### ⚠️ Coverage Gaps (${matrixData.coverageAnalysis.gaps})\n\n`;
      matrixData.coverageAnalysis.gapDetails.slice(0, 5).forEach((gap: any) => {
        markdown += `- **${gap.title}** (\`${gap.id}\`) - Type: ${gap.type}\n`;
      });
      markdown += `\n`;
    }
    
    if (matrixData.coverageAnalysis.recommendations.length > 0) {
      markdown += `### 💡 Recommendations\n\n`;
      matrixData.coverageAnalysis.recommendations.forEach((rec: string) => {
        markdown += `- ${rec}\n`;
      });
      markdown += `\n`;
    }
  }
  
  // Compliance section for enterprise
  if (complianceLevel === 'enterprise') {
    markdown += `## 🛡️ **Enterprise Compliance**\n\n`;
    markdown += `- ✅ **Bidirectional Traceability**: Requirements traced both forward and backward\n`;
    markdown += `- ✅ **Coverage Analysis**: Comprehensive gap identification\n`;
    markdown += `- ✅ **Impact Assessment**: Change impact analysis\n`;
    markdown += `- ✅ **Audit Trail**: Complete requirement lineage\n`;
    markdown += `- ✅ **Automated Generation**: Consistent matrix creation\n\n`;
  }
  
  // Footer
  markdown += `---\n\n`;
  markdown += `*Generated by GitHub Project Manager MCP - Requirements Traceability Matrix Tool*\n`;
  markdown += `*Matrix ID: \`${matrixData.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}\`*\n`;
  
  return markdown;
}

/**
 * Generate HTML output
 */
function generateHTMLMatrix(matrixData: TraceabilityMatrix): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${matrixData.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: #007bff; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: #e9ecef; padding: 15px; border-radius: 5px; text-align: center; }
        .metric h3 { margin: 0; color: #007bff; font-size: 2em; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { border: 1px solid #dee2e6; padding: 8px; text-align: left; }
        .table th { background-color: #f8f9fa; font-weight: bold; }
        .priority-high { background-color: #f8d7da; }
        .priority-medium { background-color: #fff3cd; }
        .priority-low { background-color: #d1ecf1; }
        .mapping { margin: 10px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #28a745; border-radius: 4px; }
        .coverage-analysis { background: #e7f3ff; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .gap { color: #dc3545; font-weight: bold; }
        .success { color: #28a745; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔗 ${matrixData.title}</h1>
            <p><strong>Repository:</strong> ${matrixData.metadata.repository}</p>
            <p><strong>Generated:</strong> ${new Date(matrixData.metadata.generatedAt).toLocaleString()}</p>
            <p><strong>Compliance Level:</strong> ${matrixData.metadata.complianceLevel}</p>
        </div>

        <div class="summary">
            <div class="metric">
                <h3>${matrixData.summary.totalRequirements}</h3>
                <p>Total Requirements</p>
            </div>
            <div class="metric">
                <h3>${matrixData.summary.coveragePercentage}%</h3>
                <p>Coverage</p>
            </div>
            <div class="metric">
                <h3>${matrixData.summary.mappedRequirements}</h3>
                <p>Mapped Requirements</p>
            </div>
            <div class="metric">
                <h3>${matrixData.traceabilityMappings.length}</h3>
                <p>Traceability Links</p>
            </div>
        </div>

        <h2>📋 Requirements Overview</h2>
        <table class="table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Business Value</th>
                </tr>
            </thead>
            <tbody>
                ${matrixData.requirements.slice(0, 20).map(req => `
                    <tr class="priority-${req.priority}">
                        <td><code>${req.id}</code></td>
                        <td><a href="${req.url}" target="_blank">${req.title}</a></td>
                        <td>${req.type}</td>
                        <td>${req.priority}</td>
                        <td>${req.status}</td>
                        <td>${req.businessValue}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <h2>🔗 Traceability Mappings</h2>
        ${matrixData.traceabilityMappings.slice(0, 15).map(mapping => `
            <div class="mapping">
                <strong>${mapping.type.replace(/_/g, ' ').toUpperCase()}:</strong>
                ${mapping.from} → ${mapping.to}<br>
                <em>${mapping.description}</em><br>
                <small>Strength: ${mapping.strength} | Direction: ${mapping.direction}</small>
            </div>
        `).join('')}

        ${matrixData.coverageAnalysis ? `
        <div class="coverage-analysis">
            <h2>📈 Coverage Analysis</h2>
            <p class="${matrixData.coverageAnalysis.coveragePercentage >= 80 ? 'success' : 'gap'}">
                Coverage: ${matrixData.coverageAnalysis.coveragePercentage}%
            </p>
            <p>Gaps: ${matrixData.coverageAnalysis.gaps} | Orphans: ${matrixData.coverageAnalysis.orphans}</p>
        </div>
        ` : ''}

        <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d;">
            <p>Generated by GitHub Project Manager MCP - Requirements Traceability Matrix Tool</p>
        </footer>
    </div>
</body>
</html>
  `;
}

/**
 * Generate CSV output
 */
function generateCSVMatrix(matrixData: TraceabilityMatrix): string {
  let csv = 'ID,Title,Type,Priority,Status,Business Value,Technical Complexity,URL\n';
  
  matrixData.requirements.forEach(req => {
    const row = [
      req.id,
      `"${req.title.replace(/"/g, '""')}"`,
      req.type,
      req.priority,
      req.status,
      req.businessValue,
      req.technicalComplexity,
      req.url
    ].join(',');
    csv += row + '\n';
  });
  
  csv += '\n\nTraceability Mappings\n';
  csv += 'From,To,Type,Direction,Strength,Description\n';
  
  matrixData.traceabilityMappings.forEach(mapping => {
    const row = [
      mapping.from,
      mapping.to,
      mapping.type,
      mapping.direction,
      mapping.strength,
      `"${mapping.description.replace(/"/g, '""')}"`
    ].join(',');
    csv += row + '\n';
  });
  
  return csv;
}

/**
 * Create GitHub issue with traceability matrix
 */
async function createMatrixIssue(
  config: GitHubConfig, 
  title: string, 
  content: string, 
  format: string, 
  complianceLevel: string
) {
  const issueBody = format === 'markdown' ? content : `\`\`\`${format}\n${content}\n\`\`\``;
  
  await config.octokit.rest.issues.create({
    owner: config.owner,
    repo: config.repo,
    title: `🔗 Traceability Matrix: ${title}`,
    body: issueBody,
    labels: [
      'traceability',
      'compliance',
      'documentation',
      `level:${complianceLevel}`,
      'auto-generated'
    ]
  });
}

// Helper functions
function calculateCoveragePercentage(requirements: Requirement[], mappings: TraceabilityMapping[]): number {
  const mappedIds = new Set();
  mappings.forEach(m => {
    mappedIds.add(m.from);
    mappedIds.add(m.to);
  });
  
  const mappableReqs = requirements.filter(r => r.type === 'issue' || r.type === 'milestone');
  const mappedCount = mappableReqs.filter(r => mappedIds.has(r.id)).length;
  
  return mappableReqs.length > 0 ? Math.round((mappedCount / mappableReqs.length) * 100) : 0;
}

function extractPriority(issue: any): 'low' | 'medium' | 'high' | 'critical' {
  const priorityLabels = issue.labels.filter((label: any) => 
    ['high', 'medium', 'low', 'critical', 'urgent'].some(p => 
      label.name.toLowerCase().includes(p)
    )
  );
  
  if (priorityLabels.length > 0) {
    const label = priorityLabels[0].name.toLowerCase();
    if (label.includes('critical') || label.includes('urgent')) return 'critical';
    if (label.includes('high')) return 'high';
    if (label.includes('medium')) return 'medium';
    if (label.includes('low')) return 'low';
  }
  
  return 'medium';
}

function categorizeIssue(issue: any): string {
  const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
  const labels = issue.labels.map((l: any) => l.name.toLowerCase()).join(' ');
  const fullText = `${text} ${labels}`;
  
  if (fullText.includes('bug') || fullText.includes('fix')) return 'bug';
  if (fullText.includes('feature') || fullText.includes('enhancement')) return 'feature';
  if (fullText.includes('documentation') || fullText.includes('docs')) return 'documentation';
  if (fullText.includes('test') || fullText.includes('qa')) return 'testing';
  if (fullText.includes('security')) return 'security';
  if (fullText.includes('performance')) return 'performance';
  
  return 'general';
}

function assessBusinessValue(issue: any): string {
  const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
  const labels = issue.labels.map((l: any) => l.name.toLowerCase()).join(' ');
  const fullText = `${text} ${labels}`;
  
  if (fullText.includes('revenue') || fullText.includes('business critical') || fullText.includes('customer')) return 'high';
  if (fullText.includes('efficiency') || fullText.includes('user experience')) return 'medium';
  if (fullText.includes('internal') || fullText.includes('maintenance')) return 'low';
  
  return 'medium';
}

function assessComplexity(issue: any): string {
  const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
  const labels = issue.labels.map((l: any) => l.name.toLowerCase()).join(' ');
  const fullText = `${text} ${labels}`;
  
  if (fullText.includes('architecture') || fullText.includes('migration') || fullText.includes('complex')) return 'high';
  if (fullText.includes('api') || fullText.includes('database') || fullText.includes('integration')) return 'medium';
  if (fullText.includes('ui') || fullText.includes('styling') || fullText.includes('simple')) return 'low';
  
  return 'medium';
}

function extractDependencies(body: string): number[] {
  if (!body) return [];
  
  const dependencies: number[] = [];
  const patterns = [
    /depends on #(\d+)/gi,
    /blocked by #(\d+)/gi,
    /requires #(\d+)/gi,
    /needs #(\d+)/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      dependencies.push(parseInt(match[1]));
    }
  });
  
  return [...new Set(dependencies)];
}

function extractLinkedIssues(body: string): number[] {
  if (!body) return [];
  
  const linkedIssues: number[] = [];
  const patterns = [
    /closes #(\d+)/gi,
    /fixes #(\d+)/gi,
    /resolves #(\d+)/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      linkedIssues.push(parseInt(match[1]));
    }
  });
  
  return [...new Set(linkedIssues)];
}

function calculatePRComplexity(pr: any): string {
  const changedFiles = pr.changed_files || 0;
  const additions = pr.additions || 0;
  const deletions = pr.deletions || 0;
  const totalChanges = additions + deletions;
  
  if (changedFiles > 20 || totalChanges > 1000) return 'high';
  if (changedFiles > 10 || totalChanges > 500) return 'medium';
  return 'low';
}

function generateCoverageRecommendations(coveragePercentage: number, gaps: number, orphans: number): string[] {
  const recommendations: string[] = [];
  
  if (coveragePercentage < 70) {
    recommendations.push('⚠️ Coverage below 70% - Focus on mapping unmapped requirements');
  }
  
  if (gaps > 0) {
    recommendations.push(`📋 ${gaps} requirements need implementation or traceability links`);
  }
  
  if (orphans > 0) {
    recommendations.push(`🔍 ${orphans} implementations need requirement linkage`);
  }
  
  if (coveragePercentage > 90) {
    recommendations.push('✅ Excellent traceability coverage - Focus on maintaining quality');
  }
  
  recommendations.push('🔄 Schedule regular traceability matrix updates');
  recommendations.push('📊 Consider implementing automated traceability checks in CI/CD');
  
  return recommendations;
}
