// Import all tool functions
import * as Issues from './issues/index.js';
import * as Milestones from './milestones/index.js';
import * as Labels from './labels/index.js';
import * as Analytics from './analytics/index.js';

// Export all tool categories
export { Issues, Milestones, Labels, Analytics };

// Tool registry for easy access
export const toolRegistry = {
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
};

// Tool definitions for MCP server registration
export const toolDefinitions = [
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
  }
];
