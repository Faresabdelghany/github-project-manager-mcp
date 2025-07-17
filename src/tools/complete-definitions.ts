// Complete tool definitions for all 50+ tools in the GitHub Project Manager MCP
export const completeToolDefinitions = [
  // PROJECT MANAGEMENT (GitHub Projects v2)
  {
    name: 'create_project',
    description: 'Create a new GitHub Project v2',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Project title' },
        description: { type: 'string', description: 'Project description' },
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

  // PROJECT ITEMS MANAGEMENT
  {
    name: 'add_project_item',
    description: 'Add items to projects',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        content_id: { type: 'string', description: 'Issue or PR content ID' }
      },
      required: ['project_id', 'content_id']
    }
  },
  {
    name: 'remove_project_item',
    description: 'Remove items from projects',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        item_id: { type: 'string', description: 'Item ID to remove' }
      },
      required: ['project_id', 'item_id']
    }
  },
  {
    name: 'list_project_items',
    description: 'List all project items',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'set_field_value',
    description: 'Set field values for project items',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        item_id: { type: 'string', description: 'Item ID' },
        field_id: { type: 'string', description: 'Field ID' },
        value: { description: 'Field value' }
      },
      required: ['project_id', 'item_id', 'field_id', 'value']
    }
  },
  {
    name: 'get_field_value',
    description: 'Get field values for project items',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        item_id: { type: 'string', description: 'Item ID' },
        field_id: { type: 'string', description: 'Field ID' }
      },
      required: ['project_id', 'item_id', 'field_id']
    }
  },

  // PROJECT STRUCTURE & VIEWS
  {
    name: 'create_project_field',
    description: 'Create custom fields for projects',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'Field name' },
        data_type: { type: 'string', enum: ['TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'ITERATION'], description: 'Field data type' },
        options: { type: 'array', items: { type: 'string' }, description: 'Options for select fields' }
      },
      required: ['project_id', 'name', 'data_type']
    }
  },
  {
    name: 'list_project_fields',
    description: 'List all project fields',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'update_project_field',
    description: 'Update custom fields',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        field_id: { type: 'string', description: 'Field ID' },
        name: { type: 'string', description: 'New field name' }
      },
      required: ['project_id', 'field_id']
    }
  },
  {
    name: 'create_project_view',
    description: 'Create project views (board, table, timeline, roadmap)',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        name: { type: 'string', description: 'View name' },
        layout: { type: 'string', enum: ['BOARD_LAYOUT', 'TABLE_LAYOUT', 'ROADMAP_LAYOUT'], description: 'View layout type' }
      },
      required: ['project_id', 'name', 'layout']
    }
  },
  {
    name: 'list_project_views',
    description: 'List all project views',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'update_project_view',
    description: 'Update project views',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Project ID' },
        view_id: { type: 'string', description: 'View ID' },
        name: { type: 'string', description: 'New view name' }
      },
      required: ['project_id', 'view_id']
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
    description: 'Create project milestones',
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
    name: 'update_milestone',
    description: 'Update milestone details',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_number: { type: 'number', description: 'Milestone number' },
        title: { type: 'string', description: 'Milestone title' },
        description: { type: 'string', description: 'Milestone description' },
        due_on: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        state: { type: 'string', enum: ['open', 'closed'], description: 'Milestone state' }
      },
      required: ['milestone_number']
    }
  },
  {
    name: 'delete_milestone',
    description: 'Delete milestones',
    inputSchema: {
      type: 'object',
      properties: {
        milestone_number: { type: 'number', description: 'Milestone number' }
      },
      required: ['milestone_number']
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

  // LABELS
  {
    name: 'create_label',
    description: 'Create new GitHub labels',
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
    description: 'Get comprehensive repository analytics and metrics',
    inputSchema: {
      type: 'object',
      properties: {
        include_issues: { type: 'boolean', description: 'Include issue statistics' },
        include_milestones: { type: 'boolean', description: 'Include milestone progress' },
        include_projects: { type: 'boolean', description: 'Include project summaries' }
      },
      required: []
    }
  },

  // TASK MANAGEMENT (AI-Powered)
  {
    name: 'get_next_task',
    description: 'Get AI recommendations for next tasks to work on',
    inputSchema: {
      type: 'object',
      properties: {
        assignee: { type: 'string', description: 'Filter by assignee' },
        priority: { type: 'string', enum: ['high', 'medium', 'low', 'all'], description: 'Minimum priority level' },
        complexity: { type: 'string', enum: ['low', 'medium', 'high', 'all'], description: 'Maximum complexity level' }
      },
      required: []
    }
  },
  {
    name: 'expand_task',
    description: 'Break down complex tasks into manageable subtasks',
    inputSchema: {
      type: 'object',
      properties: {
        issue_number: { type: 'number', description: 'Issue number to expand' },
        detail_level: { type: 'string', enum: ['basic', 'detailed', 'comprehensive'], description: 'Level of detail for breakdown' }
      },
      required: ['issue_number']
    }
  },

  // ADVANCED PROJECT PLANNING
  {
    name: 'generate_prd',
    description: 'Generate Product Requirements Documents',
    inputSchema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'Product name' },
        description: { type: 'string', description: 'Product description' },
        features: { type: 'array', items: { type: 'string' }, description: 'Key features' },
        target_audience: { type: 'string', description: 'Target audience' }
      },
      required: ['product_name', 'description']
    }
  },
  {
    name: 'parse_prd',
    description: 'Parse PRDs and generate actionable development tasks',
    inputSchema: {
      type: 'object',
      properties: {
        prd_content: { type: 'string', description: 'PRD content to parse' },
        create_issues: { type: 'boolean', description: 'Create GitHub issues from parsed tasks' }
      },
      required: ['prd_content']
    }
  },
  {
    name: 'enhance_prd',
    description: 'Enhance existing PRDs with additional details and structure',
    inputSchema: {
      type: 'object',
      properties: {
        existing_prd: { type: 'string', description: 'Existing PRD content' },
        enhancement_areas: { type: 'array', items: { type: 'string' }, description: 'Areas to enhance' }
      },
      required: ['existing_prd']
    }
  },
  {
    name: 'add_feature',
    description: 'Add new features to existing projects with impact analysis',
    inputSchema: {
      type: 'object',
      properties: {
        feature_name: { type: 'string', description: 'Feature name' },
        feature_description: { type: 'string', description: 'Feature description' },
        project_context: { type: 'string', description: 'Existing project context' },
        analyze_impact: { type: 'boolean', description: 'Perform impact analysis' }
      },
      required: ['feature_name', 'feature_description']
    }
  },
  {
    name: 'create_roadmap',
    description: 'Create comprehensive project roadmaps',
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
  }
];