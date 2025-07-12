// Import all tool functions
import * as Issues from './issues/index.js';
import * as Milestones from './milestones/index.js';
import * as Labels from './labels/index.js';
import * as Analytics from './analytics/index.js';
import * as Webhooks from './webhooks/index.js';
import * as Projects from './projects/index.js';
import * as Planning from './planning/index.js';

// Export all tool categories
export { Issues, Milestones, Labels, Analytics, Webhooks, Projects, Planning };

// Tool registry for easy access
export const toolRegistry = {
  // Project Management (GitHub Projects v2)
  'create_project': Projects.createProject,
  'list_projects': Projects.listProjects,
  'get_project': Projects.getProject,
  'update_project': Projects.updateProject,
  'delete_project': Projects.deleteProject,

  // Project Structure & Views Management (Epic #69)
  'create_project_field': Projects.createProjectField,
  'list_project_fields': Projects.listProjectFields,
  'update_project_field': Projects.updateProjectField,
  'create_project_view': Projects.createProjectView,
  'list_project_views': Projects.listProjectViews,
  'update_project_view': Projects.updateProjectView,

  // Issue Management
  'create_issue': Issues.createIssue,
  'list_issues': Issues.listIssues,
  'get_issue': Issues.getIssue,
  'update_issue': Issues.updateIssue,

  // Milestone Management
  'create_milestone': Milestones.createMilestone,
  'list_milestones': Milestones.listMilestones,
  'get_milestone_metrics': Milestones.getMilestoneMetrics,
  'get_overdue_milestones': Milestones.getOverdueMilestones,
  'get_upcoming_milestones': Milestones.getUpcomingMilestones,

  // Label Management
  'create_label': Labels.createLabel,
  'list_labels': Labels.listLabels,

  // Analytics
  'analyze_task_complexity': Analytics.analyzeTaskComplexity,
  'get_repository_summary': Analytics.getRepositorySummary,

  // Advanced Project Planning & PRD Tools
  'generate_prd': Planning.generatePRD,
  'parse_prd': Planning.parsePRD,
  'enhance_prd': Planning.enhancePRD,
  'add_feature': Planning.addFeature,
  'create_roadmap': Planning.createRoadmap,

  // Webhook Management (Phase 3.1)
  'setup_webhooks': Webhooks.setupWebhooks,
  'list_webhooks': Webhooks.listWebhooks,
  'test_webhook': Webhooks.testWebhook,
  'remove_webhooks': Webhooks.removeWebhooks,
  'get_webhook_deliveries': Webhooks.getWebhookDeliveries,
  'get_webhook_status': Webhooks.getWebhookStatus,

  // Live Updates (Phase 3.1)
  'get_live_project_status': Webhooks.getLiveProjectStatus,
  'get_live_sprint_metrics': Webhooks.getLiveSprintMetrics,
  'subscribe_to_updates': Webhooks.subscribeToUpdates,
  'get_recent_activity': Webhooks.getRecentActivity,
  'get_live_repository_health': Webhooks.getLiveRepositoryHealth,
};

// Tool definitions for MCP server registration
export const toolDefinitions = [
  // PROJECT MANAGEMENT (GitHub Projects v2)
  {
    name: 'create_project',
    description: 'Create a new GitHub Project v2',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Project title' },
        description: { type: 'string', description: 'Project description' },
        visibility: { type: 'string', enum: ['PRIVATE', 'PUBLIC'], description: 'Project visibility' },
        template: { type: 'string', description: 'Project template (optional)' }
      },
      required: ['title']
    }
  },
  {
    name: 'list_projects',
    description: 'List existing GitHub Projects v2',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Project status filter' },
        first: { type: 'number', description: 'Number of projects to fetch (max 100, default 20)' },
        orderBy: { type: 'string', enum: ['CREATED_AT', 'UPDATED_AT', 'NAME'], description: 'Sort field (default: UPDATED_AT)' },
        direction: { type: 'string', enum: ['ASC', 'DESC'], description: 'Sort direction (default: DESC)' }
      },
      required: []
    }
  },
  {
    name: 'get_project',
    description: 'Get detailed GitHub Project v2 information',
    inputSchema: {
      type: 'object',
      properties: {
        project_number: { type: 'number', description: 'Project number' },
        project_id: { type: 'string', description: 'Project ID (alternative to project_number)' },
        include_fields: { type: 'boolean', description: 'Include custom fields (default: true)' },
        include_views: { type: 'boolean', description: 'Include project views (default: true)' },
        include_items: { type: 'boolean', description: 'Include project items (default: true)' }
      },
      required: []
    }
  },
  {
    name: 'update_project',
    description: 'Update GitHub Project v2 information',
    inputSchema: {
      type: 'object',
      properties: {
        project_number: { type: 'number', description: 'Project number' },
        project_id: { type: 'string', description: 'Project ID (alternative to project_number)' },
        title: { type: 'string', description: 'New project title' },
        description: { type: 'string', description: 'New project description' },
        readme: { type: 'string', description: 'Project README content' },
        visibility: { type: 'string', enum: ['PRIVATE', 'PUBLIC'], description: 'Project visibility' },
        public: { type: 'boolean', description: 'Whether project is public' },
        closed: { type: 'boolean', description: 'Whether project is closed' }
      },
      required: []
    }
  },
  {
    name: 'delete_project',
    description: 'Delete GitHub Project v2 safely',
    inputSchema: {
      type: 'object',
      properties: {
        project_number: { type: 'number', description: 'Project number' },
        project_id: { type: 'string', description: 'Project ID (alternative to project_number)' },
        confirm: { type: 'boolean', description: 'Confirmation required for deletion' },
        force: { type: 'boolean', description: 'Force deletion bypassing safety checks' }
      },
      required: []
    }
  },

  // ADVANCED PROJECT PLANNING & PRD TOOLS
  {
    name: 'generate_prd',
    description: 'Generate comprehensive Product Requirements Documents with templates and best practices',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PRD title' },
        description: { type: 'string', description: 'Product overview and description' },
        features: { type: 'array', items: { type: 'string' }, description: 'List of key features to include' },
        target_audience: { type: 'array', items: { type: 'string' }, description: 'Target user personas (default: developers, end-users)' },
        objectives: { type: 'array', items: { type: 'string' }, description: 'Business objectives and goals' },
        complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Product complexity level (default: medium)' },
        timeline: { type: 'string', description: 'Expected timeline (default: 3-6 months)' },
        format: { type: 'string', enum: ['markdown', 'json'], description: 'Output format (default: markdown)' },
        create_issue: { type: 'boolean', description: 'Create GitHub issue with PRD (default: false)' }
      },
      required: ['title']
    }
  },
  {
    name: 'parse_prd',
    description: 'Parse existing PRD content and generate actionable development tasks and epics',
    inputSchema: {
      type: 'object',
      properties: {
        prd_content: { type: 'string', description: 'PRD content text to parse' },
        issue_number: { type: 'number', description: 'GitHub issue number containing PRD (alternative to prd_content)' },
        create_tasks: { type: 'boolean', description: 'Create GitHub issues for extracted tasks (default: true)' },
        task_format: { type: 'string', enum: ['github_issues', 'markdown'], description: 'Output format for tasks (default: github_issues)' },
        sprint_assignment: { type: 'boolean', description: 'Assign tasks to current sprint (default: false)' }
      },
      required: []
    }
  },
  {
    name: 'enhance_prd',
    description: 'Enhance existing PRD with market analysis, technical recommendations, and risk assessment',
    inputSchema: {
      type: 'object',
      properties: {
        issue_number: { type: 'number', description: 'GitHub issue number containing PRD' },
        prd_content: { type: 'string', description: 'PRD content text (alternative to issue_number)' },
        enhancement_type: { type: 'string', enum: ['comprehensive', 'technical', 'business', 'market'], description: 'Type of enhancement (default: comprehensive)' },
        include_market_analysis: { type: 'boolean', description: 'Include competitive and market analysis (default: true)' },
        include_technical_analysis: { type: 'boolean', description: 'Include architecture and tech stack recommendations (default: true)' },
        include_risk_analysis: { type: 'boolean', description: 'Include comprehensive risk assessment (default: true)' },
        include_metrics: { type: 'boolean', description: 'Include detailed success metrics and KPIs (default: true)' },
        update_issue: { type: 'boolean', description: 'Update the original GitHub issue with enhancements (default: false)' }
      },
      required: []
    }
  },
  {
    name: 'add_feature',
    description: 'Add new feature to existing project with comprehensive impact analysis and implementation planning',
    inputSchema: {
      type: 'object',
      properties: {
        feature_name: { type: 'string', description: 'Name of the new feature' },
        feature_description: { type: 'string', description: 'Detailed description of the feature' },
        target_milestone: { type: 'number', description: 'Target milestone for the feature' },
        impact_scope: { type: 'string', enum: ['minimal', 'moderate', 'full'], description: 'Scope of impact analysis (default: full)' },
        create_issues: { type: 'boolean', description: 'Create GitHub issues for implementation tasks (default: true)' },
        assign_team: { type: 'array', items: { type: 'string' }, description: 'Team members to assign to the feature' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Feature priority level (default: medium)' },
        estimate_effort: { type: 'boolean', description: 'Include effort estimation and timeline (default: true)' }
      },
      required: ['feature_name']
    }
  },
  {
    name: 'create_roadmap',
    description: 'Create comprehensive project roadmaps with timeline visualization and milestone mapping',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Roadmap title' },
        time_horizon: { type: 'string', enum: ['monthly', 'quarterly', 'yearly'], description: 'Timeline granularity (default: quarterly)' },
        include_completed: { type: 'boolean', description: 'Include completed milestones and issues (default: false)' },
        include_dependencies: { type: 'boolean', description: 'Show issue dependencies and critical path (default: true)' },
        focus_areas: { type: 'array', items: { type: 'string' }, description: 'Specific areas to focus on in roadmap' },
        format: { type: 'string', enum: ['markdown', 'json'], description: 'Output format (default: markdown)' }
      },
      required: ['title']
    }
  },

  // ISSUE MANAGEMENT
  {
    name: 'create_issue',
    description: 'Create a new GitHub issue',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue description' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Issue assignees' },
        milestone: { type: 'number', description: 'Milestone number' }
      },
      required: ['title']
    }
  },
  {
    name: 'list_issues',
    description: 'List issues with filtering and sorting',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state' },
        labels: { type: 'string', description: 'Comma-separated list of labels' },
        assignee: { type: 'string', description: 'Filter by assignee' },
        milestone: { type: 'string', description: 'Filter by milestone' }
      },
      required: []
    }
  },
  {
    name: 'get_issue',
    description: 'Get detailed issue information',
    inputSchema: {
      type: 'object',
      properties: {
        issue_number: { type: 'number', description: 'Issue number' }
      },
      required: ['issue_number']
    }
  },
  {
    name: 'update_issue',
    description: 'Update existing issues',
    inputSchema: {
      type: 'object',
      properties: {
        issue_number: { type: 'number', description: 'Issue number' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue description' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'Issue state' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Issue assignees' },
        milestone: { type: 'number', description: 'Milestone number' }
      },
      required: ['issue_number']
    }
  },

  // MILESTONE MANAGEMENT
  {
    name: 'create_milestone',
    description: 'Create a project milestone',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Milestone title' },
        description: { type: 'string', description: 'Milestone description' },
        due_on: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'Milestone state' }
      },
      required: ['title']
    }
  },
  {
    name: 'list_milestones',
    description: 'List milestones with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Milestone state filter' }
      },
      required: []
    }
  },
  {
    name: 'get_milestone_metrics',
    description: 'Get progress metrics for milestones',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_number: { type: 'number', description: 'Milestone number' }
      },
      required: ['milestone_number']
    }
  },
  {
    name: 'get_overdue_milestones',
    description: 'Find overdue milestones',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_upcoming_milestones',
    description: 'Get upcoming milestones within timeframes',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look ahead' }
      },
      required: ['days']
    }
  },

  // LABEL MANAGEMENT
  {
    name: 'create_label',
    description: 'Create a new GitHub label',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Label name' },
        color: { type: 'string', description: 'Label color (hex without #)' },
        description: { type: 'string', description: 'Label description' }
      },
      required: ['name', 'color']
    }
  },
  {
    name: 'list_labels',
    description: 'List all available labels',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  // ANALYTICS
  {
    name: 'analyze_task_complexity',
    description: 'Perform detailed task complexity analysis',
    inputSchema: {
      type: 'object',
      properties: {
        issue_number: { type: 'number', description: 'Issue number to analyze' }
      },
      required: ['issue_number']
    }
  },
  {
    name: 'get_repository_summary',
    description: 'Get comprehensive repository summary with metrics',
    inputSchema: {
      type: 'object',
      properties: {
        include_trends: { type: 'boolean', description: 'Include trend analysis (default: true)' }
      },
      required: []
    }
  },

  // WEBHOOK MANAGEMENT (Phase 3.1)
  {
    name: 'setup_webhooks',
    description: 'Setup GitHub webhooks for real-time updates',
    inputSchema: {
      type: 'object',
      properties: {
        webhook_url: { type: 'string', description: 'Webhook endpoint URL (e.g., https://your-server.com/github-webhook)' },
        events: { 
          type: 'array', 
          items: { 
            type: 'string',
            enum: ['issues', 'milestone', 'projects_v2', 'pull_request', 'push', 'release', 'repository', 'star', 'watch']
          }, 
          description: 'GitHub events to subscribe to (default: issues, milestone, projects_v2, pull_request, push)' 
        },
        secret: { type: 'string', description: 'Webhook secret for signature validation (optional)' },
        active: { type: 'boolean', description: 'Whether webhook should be active (default: true)' }
      },
      required: ['webhook_url']
    }
  },
  {
    name: 'list_webhooks',
    description: 'List all configured webhooks for the repository',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'test_webhook',
    description: 'Test webhook connectivity and functionality',
    inputSchema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'number', description: 'Specific webhook ID to test (optional, tests first webhook if not provided)' }
      },
      required: []
    }
  },
  {
    name: 'remove_webhooks',
    description: 'Remove webhook(s) from repository',
    inputSchema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'number', description: 'Specific webhook ID to remove (optional, removes all if not provided)' },
        confirm: { type: 'boolean', description: 'Confirmation required for deletion (must be true)' }
      },
      required: ['confirm']
    }
  },
  {
    name: 'get_webhook_deliveries',
    description: 'Get webhook delivery history and status',
    inputSchema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'number', description: 'Webhook ID to get deliveries for' },
        per_page: { type: 'number', description: 'Number of deliveries to fetch (max 100, default 30)' }
      },
      required: ['webhook_id']
    }
  },
  {
    name: 'get_webhook_status',
    description: 'Get webhook configuration and health status',
    inputSchema: {
      type: 'object',
      properties: {
        webhook_id: { type: 'number', description: 'Specific webhook ID to check (optional, checks all if not provided)' }
      },
      required: []
    }
  },

  // LIVE UPDATES (Phase 3.1)
  {
    name: 'get_live_project_status',
    description: 'Get real-time project status (never cached, always fresh data)',
    inputSchema: {
      type: 'object',
      properties: {
        include_activity: { type: 'boolean', description: 'Include recent activity in response (default: true)' },
        activity_timeframe: { type: 'string', enum: ['1h', '6h', '24h', '7d'], description: 'Timeframe for recent activity (default: 24h)' }
      },
      required: []
    }
  },
  {
    name: 'get_live_sprint_metrics',
    description: 'Get live sprint metrics and progress with real-time data',
    inputSchema: {
      type: 'object',
      properties: {
        sprint_number: { type: 'number', description: 'Specific sprint number to analyze' },
        milestone_number: { type: 'number', description: 'Milestone number representing the sprint (alternative to sprint_number)' },
        include_burndown: { type: 'boolean', description: 'Include burndown chart data (default: true)' },
        include_velocity: { type: 'boolean', description: 'Include velocity and throughput metrics (default: true)' },
        include_team_metrics: { type: 'boolean', description: 'Include team performance metrics (default: true)' }
      },
      required: []
    }
  },
  {
    name: 'subscribe_to_updates',
    description: 'Subscribe to real-time updates for specific events',
    inputSchema: {
      type: 'object',
      properties: {
        subscription_id: { type: 'string', description: 'Unique subscription identifier' },
        events: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Event types to subscribe to (e.g., issue_opened, milestone_created)' 
        },
        callback: { type: 'string', description: 'Callback URL or identifier (optional)' }
      },
      required: ['subscription_id', 'events']
    }
  },
  {
    name: 'get_recent_activity',
    description: 'Get recent activity feed with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        timeframe: { type: 'string', enum: ['1h', '6h', '24h', '7d', '30d'], description: 'Activity timeframe (default: 24h)' },
        event_types: { type: 'array', items: { type: 'string' }, description: 'Filter by event types' },
        actors: { type: 'array', items: { type: 'string' }, description: 'Filter by specific users' },
        include_pull_requests: { type: 'boolean', description: 'Include pull request activities (default: true)' },
        include_issues: { type: 'boolean', description: 'Include issue activities (default: true)' },
        include_milestones: { type: 'boolean', description: 'Include milestone activities (default: true)' },
        include_projects: { type: 'boolean', description: 'Include project activities (default: true)' },
        limit: { type: 'number', description: 'Maximum number of activities to return (max 100, default 50)' }
      },
      required: []
    }
  },
  {
    name: 'get_live_repository_health',
    description: 'Get comprehensive live repository health metrics and indicators',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];
