#!/usr/bin/env node

import { Octokit } from '@octokit/rest';

const token = process.env.GITHUB_TOKEN || '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';
const owner = 'Faresabdelghany';
const repo = 'github-project-manager-mcp';

const octokit = new Octokit({ auth: token });

const issues = [
  {
    title: "Phase 2.1: Implement GitHub Projects v2 GraphQL Integration",
    body: `## 🎯 **Objective**
Add complete GitHub Projects v2 support using GraphQL API to enable real project management capabilities.

## 📋 **Current State**
- Only GitHub Issues API (REST) is implemented
- No project management capabilities beyond milestones
- Missing modern project features (boards, views, custom fields)

## 🚀 **Implementation Requirements**

### **Core GraphQL Operations**
- [ ] Create Projects v2
- [ ] List user/org projects
- [ ] Get project details with items
- [ ] Update project properties
- [ ] Delete projects
- [ ] Add issues/PRs to projects
- [ ] Remove items from projects

### **Custom Fields Management**
- [ ] Create custom fields (text, number, date, single select)
- [ ] List project fields
- [ ] Update field values for items
- [ ] Get field values from items

### **Project Views**
- [ ] Create project views (board, table, timeline)
- [ ] List project views
- [ ] Update view configurations
- [ ] Get view data with filtering

## 💻 **Technical Implementation**

### **GraphQL Queries/Mutations Needed**
\`\`\`graphql
# Core project operations
mutation CreateProjectV2($input: CreateProjectV2Input!) {
  createProjectV2(input: $input) {
    projectV2 { id title url }
  }
}

query GetProjectV2($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      id title url items(first: 50) {
        nodes { id content { ... on Issue { number title } } }
      }
    }
  }
}

# Custom fields
mutation CreateProjectV2Field($input: CreateProjectV2FieldInput!) {
  createProjectV2Field(input: $input) {
    projectV2Field { id name }
  }
}
\`\`\`

### **New MCP Tools to Add**
1. \`create_project_v2\` - Create new Projects v2
2. \`list_projects_v2\` - List user/org projects
3. \`get_project_v2\` - Get project details
4. \`add_item_to_project\` - Add issues/PRs to projects
5. \`create_project_field\` - Create custom fields
6. \`set_field_value\` - Update field values
7. \`create_project_view\` - Create project views

## ✅ **Acceptance Criteria**
- [ ] All 7 new tools implemented with proper error handling
- [ ] GraphQL client properly configured and authenticated
- [ ] Comprehensive test coverage for all operations
- [ ] Full integration with existing issue/milestone tools
- [ ] Documentation updated with new capabilities
- [ ] Example workflows provided

## 🎯 **Definition of Done**
- [ ] Can create and manage Projects v2 from Claude Desktop
- [ ] Issues can be added to projects with custom field values
- [ ] Project views (board, table) can be created and managed
- [ ] Error handling covers GraphQL-specific errors
- [ ] Performance is optimized (< 2s response times)

## 📊 **Story Points: 8**
**Complexity:** High (GraphQL integration, new API patterns)
**Effort:** 2-3 days implementation + testing`,
    labels: ["enhancement", "phase-2", "high-priority", "graphql", "projects-v2"]
  },
  
  {
    title: "Phase 2.2: Implement Persistent Sprint Management System",
    body: `## 🎯 **Objective**
Implement a complete sprint management system with persistent data storage and comprehensive tracking capabilities.

## 📋 **Current State**
- No sprint management functionality
- Milestones used as basic project tracking only
- No sprint planning, velocity tracking, or burndown charts
- No persistent storage for sprint data

## 🚀 **Implementation Requirements**

### **Sprint Management Core**
- [ ] Create sprints with goals, duration, team assignment
- [ ] List sprints with filtering (active, completed, planned)
- [ ] Get current active sprint details
- [ ] Update sprint information and status
- [ ] Close sprints with completion metrics

### **Sprint Planning**
- [ ] Add/remove issues from sprints
- [ ] Sprint capacity planning with story points
- [ ] Team workload distribution
- [ ] Sprint backlog management
- [ ] Automatic sprint suggestions based on velocity

### **Sprint Analytics**
- [ ] Sprint burndown charts (story points over time)
- [ ] Velocity tracking across sprints
- [ ] Sprint completion metrics
- [ ] Team performance analytics
- [ ] Predictive sprint planning

## 💻 **Technical Implementation**

### **Data Storage Strategy**
\`\`\`typescript
interface SprintData {
  id: string;
  number: number;
  title: string;
  goals: string[];
  startDate: Date;
  endDate: Date;
  status: 'planned' | 'active' | 'completed';
  teamMembers: string[];
  issues: number[];
  capacity: number;
  completed: number;
  createdAt: Date;
  updatedAt: Date;
}

// Storage options:
// 1. GitHub repository files (JSON)
// 2. GitHub Gists for persistence
// 3. Local file storage with sync
\`\`\`

### **New MCP Tools to Add**
1. \`create_sprint\` - Create new sprint with goals and team
2. \`list_sprints\` - List sprints with filtering options
3. \`get_current_sprint\` - Get active sprint details
4. \`update_sprint\` - Update sprint properties
5. \`add_issues_to_sprint\` - Add issues to sprint backlog
6. \`remove_issues_from_sprint\` - Remove issues from sprint
7. \`get_sprint_metrics\` - Get sprint analytics and burndown
8. \`plan_sprint\` - AI-powered sprint planning suggestions
9. \`close_sprint\` - Complete sprint with metrics calculation

## ✅ **Acceptance Criteria**
- [ ] Complete sprint lifecycle management
- [ ] Persistent data storage working reliably
- [ ] Sprint analytics and reporting functional
- [ ] Integration with existing issue management
- [ ] AI-powered sprint planning assistance
- [ ] Performance optimized for large backlogs

## 🎯 **Definition of Done**
- [ ] Can create and manage complete sprint lifecycle
- [ ] Sprint data persists between sessions
- [ ] Burndown charts and velocity tracking work
- [ ] Sprint planning suggestions are accurate
- [ ] All sprint tools integrated with existing functionality

## 📊 **Story Points: 13**
**Complexity:** Very High (Data persistence, analytics, AI features)
**Effort:** 4-5 days implementation + testing`,
    labels: ["enhancement", "phase-2", "high-priority", "sprint-management", "analytics"]
  },

  {
    title: "Phase 2.3: Add MCP Resources for Data Exposure",
    body: `## 🎯 **Objective**
Implement MCP Resources to expose GitHub project data as readable resources that can be referenced by other tools and AI systems.

## 📋 **Current State**
- No MCP Resources implemented
- Data only accessible through tools
- No way to expose project overviews, dashboards, or reports as resources

## 🚀 **Implementation Requirements**

### **Core Resources**
- [ ] Repository overview resource
- [ ] Project dashboard resource
- [ ] Sprint status resource
- [ ] Issue analytics resource
- [ ] Team performance resource

### **Dynamic Resources with Templates**
- [ ] Project-specific overviews: \`github://projects/{projectId}\`
- [ ] Sprint details: \`github://sprints/{sprintId}\`
- [ ] Milestone progress: \`github://milestones/{milestoneId}\`
- [ ] Team dashboards: \`github://teams/{teamName}\`

## 💻 **Technical Implementation**

### **Resource Implementation Examples**
\`\`\`typescript
// Project overview resource
server.resource(
  "project-overview",
  new ResourceTemplate("github://projects/{projectId}", { list: undefined }),
  async (uri, { projectId }) => ({
    contents: [{
      uri: uri.href,
      text: await this.generateProjectOverview(projectId),
      mimeType: 'text/markdown'
    }]
  })
);

// Sprint dashboard resource
server.resource(
  "sprint-dashboard",
  new ResourceTemplate("github://sprints/{sprintId}/dashboard", { list: undefined }),
  async (uri, { sprintId }) => ({
    contents: [{
      uri: uri.href,
      text: await this.generateSprintDashboard(sprintId),
      mimeType: 'application/json'
    }]
  })
);
\`\`\`

### **Resource Types to Implement**
1. **Repository Summary** - \`github://repo/summary\`
2. **Project Overviews** - \`github://projects/{id}\`
3. **Sprint Dashboards** - \`github://sprints/{id}/dashboard\`
4. **Issue Analytics** - \`github://analytics/issues\`
5. **Team Performance** - \`github://teams/{name}/metrics\`
6. **Milestone Progress** - \`github://milestones/{id}/progress\`

## ✅ **Acceptance Criteria**
- [ ] All 6 resource types implemented and functional
- [ ] Resources return properly formatted data (JSON/Markdown)
- [ ] Dynamic resources work with parameter substitution
- [ ] Resource listing functionality works
- [ ] Resources integrate with existing tools data
- [ ] Performance is optimized for resource access

## 🎯 **Definition of Done**
- [ ] Resources accessible from Claude Desktop
- [ ] Data formats are consistent and useful
- [ ] Resource templates work with dynamic parameters
- [ ] Integration with all existing functionality
- [ ] Documentation includes resource usage examples

## 📊 **Story Points: 5**
**Complexity:** Medium (Resource implementation, data formatting)
**Effort:** 2-3 days implementation + testing`,
    labels: ["enhancement", "phase-2", "medium-priority", "resources", "data-exposure"]
  },

  {
    title: "Phase 2.4: Add MCP Prompts for Common Workflows",
    body: `## 🎯 **Objective**
Implement MCP Prompts to provide templates for common project management workflows and AI-assisted planning.

## 📋 **Current State**
- No MCP Prompts implemented
- No workflow templates for common tasks
- No AI-assisted project management guidance

## 🚀 **Implementation Requirements**

### **Sprint Planning Prompts**
- [ ] Sprint planning with capacity estimation
- [ ] Sprint retrospective analysis
- [ ] Sprint goal setting and validation
- [ ] Backlog prioritization assistance

### **Issue Management Prompts**
- [ ] Issue triage and labeling
- [ ] Task breakdown and estimation
- [ ] Bug report analysis
- [ ] Feature specification writing

### **Project Planning Prompts**
- [ ] Project roadmap creation
- [ ] Milestone planning and scheduling
- [ ] Risk assessment and mitigation
- [ ] Team capacity planning

## 💻 **Technical Implementation**

### **Prompt Implementation Examples**
\`\`\`typescript
// Sprint planning prompt
server.prompt(
  "sprint-planning",
  {
    sprintGoals: z.array(z.string()).describe('Sprint goals and objectives'),
    teamMembers: z.array(z.string()).describe('Team member GitHub usernames'),
    duration: z.number().optional().describe('Sprint duration in days')
  },
  ({ sprintGoals, teamMembers, duration = 14 }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: \`Plan a \${duration}-day sprint for team: \${teamMembers.join(', ')}
        
Sprint Goals:
\${sprintGoals.map(goal => \`• \${goal}\`).join('\\n')}

Please help analyze available issues, estimate capacity, and suggest issue allocation.\`
      }
    }]
  })
);

// Issue triage prompt
server.prompt(
  "triage-issue",
  {
    issueTitle: z.string().describe('Issue title'),
    issueBody: z.string().describe('Issue description'),
    currentLabels: z.array(z.string()).optional().describe('Current labels')
  },
  ({ issueTitle, issueBody, currentLabels = [] }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: \`Help triage this GitHub issue:

**Title:** \${issueTitle}
**Description:** \${issueBody}
**Current Labels:** \${currentLabels.join(', ') || 'None'}

Please suggest:
1. Appropriate labels
2. Priority level
3. Complexity estimate
4. Required information if incomplete\`
      }
    }]
  })
);
\`\`\`

### **Prompts to Implement**
1. **sprint-planning** - Complete sprint planning assistance
2. **triage-issue** - Issue triage and labeling
3. **estimate-complexity** - Task complexity estimation
4. **create-roadmap** - Project roadmap planning
5. **retrospective** - Sprint retrospective analysis
6. **risk-assessment** - Project risk evaluation
7. **capacity-planning** - Team capacity estimation
8. **milestone-planning** - Milestone creation and scheduling

## ✅ **Acceptance Criteria**
- [ ] All 8 prompts implemented with proper schemas
- [ ] Prompts provide valuable AI-assisted guidance
- [ ] Integration with existing project data
- [ ] Prompts work with dynamic project context
- [ ] Documentation includes prompt usage examples
- [ ] Prompts generate actionable recommendations

## 🎯 **Definition of Done**
- [ ] Prompts accessible from Claude Desktop
- [ ] AI guidance is relevant and actionable
- [ ] Prompts integrate with project data context
- [ ] Templates cover common workflow scenarios
- [ ] Documentation includes best practices

## 📊 **Story Points: 3**
**Complexity:** Low-Medium (Prompt templates, content creation)
**Effort:** 1-2 days implementation + testing`,
    labels: ["enhancement", "phase-2", "medium-priority", "prompts", "ai-assistance"]
  }
];

console.log('🚀 Creating Phase 2 Implementation Issues...');
console.log('==========================================');

for (const issue of issues) {
  try {
    const response = await octokit.rest.issues.create({
      owner,
      repo,
      title: issue.title,
      body: issue.body,
      labels: issue.labels
    });
    
    console.log(`✅ Created issue #${response.data.number}: ${issue.title}`);
  } catch (error) {
    console.error(`❌ Failed to create issue "${issue.title}":`, error.message);
  }
}

console.log('\n🎉 Phase 2 issues creation completed!');
console.log('📋 Next: Run the Phase 3 issues script');
