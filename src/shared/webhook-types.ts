import { GitHubIssue, GitHubMilestone } from './types.js';

// Webhook Event Types
export interface GitHubWebhookEvent {
  action: string;
  repository: {
    name: string;
    full_name: string;
    owner: { login: string };
  };
  sender: {
    login: string;
    type: string;
  };
  issue?: GitHubIssue;
  pull_request?: any;
  milestone?: GitHubMilestone;
  project?: any;
  organization?: any;
}

// Webhook Configuration
export interface WebhookConfig {
  name: string;
  config: {
    url: string;
    secret?: string;
    content_type: 'json' | 'form';
    insecure_ssl?: '0' | '1';
  };
  events: string[];
  active: boolean;
}

// Webhook Response from GitHub API
export interface GitHubWebhook {
  id: number;
  name: string;
  active: boolean;
  events: string[];
  config: {
    url: string;
    content_type: string;
    secret?: string;
    insecure_ssl?: string;
  };
  created_at: string;
  updated_at: string;
  last_response?: {
    code: number;
    status: string;
    message: string;
  };
  ping_url: string;
  test_url: string;
}

// Supported webhook events
export const SUPPORTED_WEBHOOK_EVENTS = [
  // Issue events
  'issues',
  // Milestone events  
  'milestone',
  // Project events
  'projects_v2',
  // Pull request events
  'pull_request',
  // Push events
  'push',
  // Release events
  'release',
  // Repository events
  'repository',
  // Star events
  'star',
  // Watch events
  'watch'
] as const;

export type SupportedWebhookEvent = typeof SUPPORTED_WEBHOOK_EVENTS[number];

// Event processing interface
export interface EventProcessor {
  processEvent(event: GitHubWebhookEvent): Promise<void>;
}

// Live data subscription
export interface DataSubscription {
  id: string;
  events: string[];
  callback: (data: any) => void;
  created_at: Date;
  last_triggered?: Date;
}

// Real-time project status
export interface LiveProjectStatus {
  timestamp: string;
  repository: {
    name: string;
    owner: string;
    url: string;
  };
  metrics: {
    total_issues: number;
    open_issues: number;
    closed_issues: number;
    total_milestones: number;
    open_milestones: number;
    overdue_milestones: number;
    total_pull_requests: number;
    open_pull_requests: number;
  };
  recent_activity: ActivityItem[];
  active_sprints: any[];
  webhook_status: 'active' | 'inactive' | 'error';
}

// Activity feed item
export interface ActivityItem {
  id: string;
  type: 'issue' | 'pull_request' | 'milestone' | 'project' | 'release';
  action: string;
  actor: string;
  title: string;
  url: string;
  timestamp: string;
  metadata?: any;
}

// Webhook test result
export interface WebhookTestResult {
  success: boolean;
  status_code?: number;
  response_time_ms?: number;
  error_message?: string;
  test_payload?: any;
  timestamp: string;
}

// Live sprint metrics
export interface LiveSprintMetrics {
  sprint_number: number;
  sprint_title: string;
  start_date: string;
  end_date: string;
  status: 'planned' | 'active' | 'completed' | 'overdue';
  progress: {
    total_issues: number;
    completed_issues: number;
    in_progress_issues: number;
    not_started_issues: number;
    completion_percentage: number;
  };
  velocity: {
    story_points_completed: number;
    story_points_remaining: number;
    daily_completion_rate: number;
    projected_completion_date: string;
  };
  team_metrics: {
    total_team_members: number;
    active_contributors: number;
    workload_distribution: Array<{
      assignee: string;
      assigned_issues: number;
      completed_issues: number;
      story_points: number;
    }>;
  };
  last_updated: string;
}

// Webhook delivery status
export interface WebhookDelivery {
  id: number;
  guid: string;
  delivered_at: string;
  redelivery: boolean;
  duration: number;
  status: string;
  status_code: number;
  event: string;
  action: string;
  installation_id?: number;
  repository_id: number;
}

// Recent activity filter options
export interface ActivityFilter {
  timeframe?: '1h' | '6h' | '24h' | '7d' | '30d';
  event_types?: string[];
  actors?: string[];
  include_pull_requests?: boolean;
  include_issues?: boolean;
  include_milestones?: boolean;
  include_projects?: boolean;
}

// Event handler configuration
export interface EventHandlerConfig {
  event_type: string;
  actions: string[];
  enabled: boolean;
  handler_function: string;
  filters?: {
    labels?: string[];
    assignees?: string[];
    milestone?: string;
  };
}
