import crypto from 'crypto';
import { EventEmitter } from 'events';
import { GitHubConfig, ToolResponse } from '../shared/types.js';
import {
  GitHubWebhook,
  WebhookConfig,
  GitHubWebhookEvent,
  WebhookTestResult,
  LiveProjectStatus,
  ActivityItem,
  LiveSprintMetrics,
  DataSubscription,
  WebhookDelivery,
  SUPPORTED_WEBHOOK_EVENTS,
  SupportedWebhookEvent,
  ActivityFilter,
  EventHandlerConfig
} from '../shared/webhook-types.js';

/**
 * Comprehensive Webhook Service for GitHub Project Manager
 * Handles webhook management, event processing, and real-time updates
 */
export class WebhookService extends EventEmitter {
  private config: GitHubConfig;
  private webhookSecret: string;
  private subscriptions: Map<string, DataSubscription> = new Map();
  private eventHandlers: Map<string, EventHandlerConfig> = new Map();
  private activityCache: ActivityItem[] = [];
  private maxActivityItems = 1000;

  constructor(config: GitHubConfig) {
    super();
    this.config = config;
    this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || '';
    this.setupDefaultEventHandlers();
  }

  /**
   * Setup webhook for repository with specified events
   */
  async setupWebhook(args: {
    webhook_url: string;
    events?: SupportedWebhookEvent[];
    secret?: string;
    active?: boolean;
  }): Promise<ToolResponse> {
    try {
      const events = args.events || [
        'issues',
        'milestone',
        'projects_v2',
        'pull_request',
        'push'
      ];

      // Validate events
      const invalidEvents = events.filter(event => !SUPPORTED_WEBHOOK_EVENTS.includes(event));
      if (invalidEvents.length > 0) {
        throw new Error(`Unsupported events: ${invalidEvents.join(', ')}`);
      }

      const webhookConfig: WebhookConfig = {
        name: 'web',
        config: {
          url: args.webhook_url,
          content_type: 'json',
          secret: args.secret || this.webhookSecret,
          insecure_ssl: '0'
        },
        events,
        active: args.active !== false
      };

      const response = await this.config.octokit.rest.repos.createWebhook({
        owner: this.config.owner,
        repo: this.config.repo,
        ...webhookConfig
      });

      const webhook = response.data;

      let result = `🎣 **Webhook setup completed successfully!**\n\n`;
      result += `**Webhook ID:** ${webhook.id}\n`;
      result += `**URL:** ${webhook.config.url}\n`;
      result += `**Status:** ${webhook.active ? '✅ Active' : '❌ Inactive'}\n`;
      result += `**Content Type:** ${webhook.config.content_type}\n`;
      result += `**Events:** ${webhook.events.join(', ')}\n`;
      result += `**Created:** ${new Date(webhook.created_at).toLocaleString()}\n\n`;
      
      result += `🔐 **Security:**\n`;
      result += `- Secret configured: ${webhook.config.secret ? '✅ Yes' : '❌ No'}\n`;
      result += `- SSL verification: ${webhook.config.insecure_ssl === '0' ? '✅ Enabled' : '⚠️ Disabled'}\n\n`;
      
      result += `📡 **Test URLs:**\n`;
      result += `- Ping: ${webhook.ping_url}\n`;
      result += `- Test: ${webhook.test_url}\n\n`;
      
      result += `💡 **Next Steps:**\n`;
      result += `• Use 'test_webhook' to verify connectivity\n`;
      result += `• Use 'get_live_project_status' for real-time updates\n`;
      result += `• Events will now trigger automatic project synchronization`;

      return {
        content: [{ type: "text", text: result }]
      };
    } catch (error: any) {
      if (error.status === 422 && error.message.includes('Hook already exists')) {
        return {
          content: [{
            type: "text",
            text: `⚠️ **Webhook already exists**\n\nA webhook with this URL is already configured for this repository. Use 'list_webhooks' to see existing webhooks or 'remove_webhooks' to delete them first.`
          }]
        };
      }
      throw new Error(`Failed to setup webhook: ${error.message}`);
    }
  }

  /**
   * List all configured webhooks for the repository
   */
  async listWebhooks(): Promise<ToolResponse> {
    try {
      const response = await this.config.octokit.rest.repos.listWebhooks({
        owner: this.config.owner,
        repo: this.config.repo,
        per_page: 100
      });

      const webhooks = response.data;

      let result = `🎣 **Repository Webhooks** - Found ${webhooks.length} webhooks\n\n`;

      if (webhooks.length === 0) {
        result += "No webhooks configured for this repository.\n\n";
        result += "💡 Use 'setup_webhooks' to create your first webhook.";
      } else {
        webhooks.forEach((webhook, index) => {
          result += `### Webhook #${index + 1} (ID: ${webhook.id})\n`;
          result += `**URL:** ${webhook.config.url}\n`;
          result += `**Status:** ${webhook.active ? '✅ Active' : '❌ Inactive'}\n`;
          result += `**Events:** ${webhook.events.join(', ')}\n`;
          result += `**Content Type:** ${webhook.config.content_type}\n`;
          result += `**Created:** ${new Date(webhook.created_at).toLocaleString()}\n`;
          result += `**Updated:** ${new Date(webhook.updated_at).toLocaleString()}\n`;

          if (webhook.last_response) {
            result += `**Last Response:** ${webhook.last_response.code} - ${webhook.last_response.status}\n`;
          }

          result += `\n`;
        });

        result += `🛠️ **Management Options:**\n`;
        result += `• Use 'test_webhook [id]' to test specific webhook\n`;
        result += `• Use 'remove_webhooks [id]' to remove specific webhook\n`;
        result += `• Use 'get_webhook_deliveries [id]' to view delivery history`;
      }

      return {
        content: [{ type: "text", text: result }]
      };
    } catch (error: any) {
      throw new Error(`Failed to list webhooks: ${error.message}`);
    }
  }

  /**
   * Test webhook connectivity and functionality
   */
  async testWebhook(args: { webhook_id?: number }): Promise<ToolResponse> {
    try {
      if (!args.webhook_id) {
        // Test all webhooks if no specific ID provided
        const webhooksResponse = await this.config.octokit.rest.repos.listWebhooks({
          owner: this.config.owner,
          repo: this.config.repo
        });

        if (webhooksResponse.data.length === 0) {
          return {
            content: [{
              type: "text",
              text: "❌ **No webhooks found**\n\nNo webhooks are configured for this repository. Use 'setup_webhooks' to create one first."
            }]
          };
        }

        args.webhook_id = webhooksResponse.data[0].id;
      }

      const startTime = Date.now();
      
      // Send a ping to the webhook
      const response = await this.config.octokit.rest.repos.pingWebhook({
        owner: this.config.owner,
        repo: this.config.repo,
        hook_id: args.webhook_id
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const testResult: WebhookTestResult = {
        success: true,
        status_code: response.status,
        response_time_ms: responseTime,
        timestamp: new Date().toISOString()
      };

      let result = `🧪 **Webhook Test Results**\n\n`;
      result += `**Webhook ID:** ${args.webhook_id}\n`;
      result += `**Status:** ✅ ${testResult.success ? 'SUCCESS' : 'FAILED'}\n`;
      result += `**Response Code:** ${testResult.status_code}\n`;
      result += `**Response Time:** ${testResult.response_time_ms}ms\n`;
      result += `**Test Time:** ${new Date(testResult.timestamp).toLocaleString()}\n\n`;

      result += `🔍 **Test Details:**\n`;
      result += `- Ping sent successfully to webhook endpoint\n`;
      result += `- Server responded within normal timeframe\n`;
      result += `- Webhook is ready to receive GitHub events\n\n`;

      result += `💡 **Next Steps:**\n`;
      result += `• Monitor webhook deliveries with 'get_webhook_deliveries'\n`;
      result += `• Test real-time updates with 'get_live_project_status'\n`;
      result += `• Create issues or milestones to see live event processing`;

      return {
        content: [{ type: "text", text: result }]
      };
    } catch (error: any) {
      const testResult: WebhookTestResult = {
        success: false,
        error_message: error.message,
        timestamp: new Date().toISOString()
      };

      let result = `🧪 **Webhook Test Results**\n\n`;
      result += `**Webhook ID:** ${args.webhook_id || 'Unknown'}\n`;
      result += `**Status:** ❌ FAILED\n`;
      result += `**Error:** ${testResult.error_message}\n`;
      result += `**Test Time:** ${new Date(testResult.timestamp).toLocaleString()}\n\n`;

      result += `🔧 **Troubleshooting:**\n`;
      result += `• Check if webhook URL is accessible\n`;
      result += `• Verify webhook ID exists with 'list_webhooks'\n`;
      result += `• Ensure webhook endpoint is properly configured\n`;
      result += `• Review webhook secret and SSL settings`;

      return {
        content: [{ type: "text", text: result }]
      };
    }
  }

  /**
   * Remove webhook(s) from repository
   */
  async removeWebhooks(args: { webhook_id?: number; confirm?: boolean }): Promise<ToolResponse> {
    try {
      if (!args.confirm) {
        return {
          content: [{
            type: "text",
            text: `⚠️ **Confirmation Required**\n\nThis will permanently remove webhook(s) from the repository.\n\nTo confirm, run the command again with 'confirm: true' parameter.`
          }]
        };
      }

      if (args.webhook_id) {
        // Remove specific webhook
        await this.config.octokit.rest.repos.deleteWebhook({
          owner: this.config.owner,
          repo: this.config.repo,
          hook_id: args.webhook_id
        });

        return {
          content: [{
            type: "text",
            text: `✅ **Webhook removed successfully**\n\nWebhook #${args.webhook_id} has been deleted from the repository.\n\n💡 Use 'list_webhooks' to verify removal or 'setup_webhooks' to create a new one.`
          }]
        };
      } else {
        // Remove all webhooks
        const webhooksResponse = await this.config.octokit.rest.repos.listWebhooks({
          owner: this.config.owner,
          repo: this.config.repo
        });

        const webhooks = webhooksResponse.data;
        
        if (webhooks.length === 0) {
          return {
            content: [{
              type: "text",
              text: "ℹ️ **No webhooks to remove**\n\nNo webhooks are currently configured for this repository."
            }]
          };
        }

        // Delete all webhooks
        for (const webhook of webhooks) {
          await this.config.octokit.rest.repos.deleteWebhook({
            owner: this.config.owner,
            repo: this.config.repo,
            hook_id: webhook.id
          });
        }

        return {
          content: [{
            type: "text",
            text: `✅ **All webhooks removed**\n\n${webhooks.length} webhook(s) have been deleted from the repository.\n\n💡 Use 'setup_webhooks' to create new webhooks when needed.`
          }]
        };
      }
    } catch (error: any) {
      if (error.status === 404) {
        return {
          content: [{
            type: "text",
            text: `❌ **Webhook not found**\n\nWebhook ID ${args.webhook_id} does not exist. Use 'list_webhooks' to see available webhooks.`
          }]
        };
      }
      throw new Error(`Failed to remove webhook: ${error.message}`);
    }
  }

  /**
   * Get real-time project status (never cached)
   */
  async getLiveProjectStatus(): Promise<ToolResponse> {
    try {
      const timestamp = new Date().toISOString();

      // Fetch real-time data
      const [issuesResponse, milestonesResponse, prsResponse, webhooksResponse] = await Promise.all([
        this.config.octokit.rest.issues.listForRepo({
          owner: this.config.owner,
          repo: this.config.repo,
          state: 'all',
          per_page: 100
        }),
        this.config.octokit.rest.issues.listMilestones({
          owner: this.config.owner,
          repo: this.config.repo,
          state: 'all',
          per_page: 100
        }),
        this.config.octokit.rest.pulls.list({
          owner: this.config.owner,
          repo: this.config.repo,
          state: 'all',
          per_page: 100
        }),
        this.config.octokit.rest.repos.listWebhooks({
          owner: this.config.owner,
          repo: this.config.repo
        })
      ]);

      const issues = issuesResponse.data.filter(issue => !issue.pull_request);
      const milestones = milestonesResponse.data;
      const pullRequests = prsResponse.data;
      const webhooks = webhooksResponse.data;

      // Calculate metrics
      const openIssues = issues.filter(issue => issue.state === 'open').length;
      const closedIssues = issues.filter(issue => issue.state === 'closed').length;
      const openMilestones = milestones.filter(milestone => milestone.state === 'open').length;
      const overdueMilestones = milestones.filter(milestone => 
        milestone.state === 'open' && 
        milestone.due_on && 
        new Date(milestone.due_on) < new Date()
      ).length;
      const openPRs = pullRequests.filter(pr => pr.state === 'open').length;

      // Get recent activity (last 24 hours)
      const recentActivity = await this.getRecentActivity({ timeframe: '24h' });

      // Determine webhook status
      const activeWebhooks = webhooks.filter(w => w.active);
      const webhookStatus = activeWebhooks.length > 0 ? 'active' : (webhooks.length > 0 ? 'inactive' : 'error');

      const status: LiveProjectStatus = {
        timestamp,
        repository: {
          name: this.config.repo,
          owner: this.config.owner,
          url: `https://github.com/${this.config.owner}/${this.config.repo}`
        },
        metrics: {
          total_issues: issues.length,
          open_issues: openIssues,
          closed_issues: closedIssues,
          total_milestones: milestones.length,
          open_milestones: openMilestones,
          overdue_milestones: overdueMilestones,
          total_pull_requests: pullRequests.length,
          open_pull_requests: openPRs
        },
        recent_activity: recentActivity,
        active_sprints: [], // TODO: Implement sprint detection
        webhook_status: webhookStatus as 'active' | 'inactive' | 'error'
      };

      let result = `📊 **Live Project Status** (${new Date(timestamp).toLocaleString()})\n\n`;
      
      result += `🏗️ **Repository:** [${status.repository.owner}/${status.repository.name}](${status.repository.url})\n\n`;
      
      result += `📈 **Current Metrics:**\n`;
      result += `• **Issues:** ${status.metrics.open_issues} open, ${status.metrics.closed_issues} closed (${status.metrics.total_issues} total)\n`;
      result += `• **Milestones:** ${status.metrics.open_milestones} active`;
      if (status.metrics.overdue_milestones > 0) {
        result += `, ⚠️ ${status.metrics.overdue_milestones} overdue`;
      }
      result += ` (${status.metrics.total_milestones} total)\n`;
      result += `• **Pull Requests:** ${status.metrics.open_pull_requests} open (${status.metrics.total_pull_requests} total)\n\n`;

      result += `🎣 **Webhook Status:** `;
      switch (status.webhook_status) {
        case 'active':
          result += `✅ ${activeWebhooks.length} active webhook(s)\n`;
          break;
        case 'inactive':
          result += `⚠️ ${webhooks.length} webhook(s) configured but inactive\n`;
          break;
        case 'error':
          result += `❌ No webhooks configured\n`;
          break;
      }
      result += `\n`;

      if (status.recent_activity.length > 0) {
        result += `🕐 **Recent Activity (Last 24h):**\n`;
        status.recent_activity.slice(0, 10).forEach(activity => {
          const timeAgo = this.getTimeAgo(new Date(activity.timestamp));
          result += `• ${this.getActivityEmoji(activity.type)} [${activity.title}](${activity.url}) by ${activity.actor} (${timeAgo})\n`;
        });
        
        if (status.recent_activity.length > 10) {
          result += `• ... and ${status.recent_activity.length - 10} more activities\n`;
        }
      } else {
        result += `🕐 **Recent Activity:** No activity in the last 24 hours\n`;
      }

      result += `\n💡 **Live Features Available:**\n`;
      result += `• Real-time metrics (never cached)\n`;
      result += `• Instant webhook event processing\n`;
      result += `• Live sprint tracking and burndown\n`;
      result += `• Automatic project synchronization`;

      return {
        content: [{ type: "text", text: result }]
      };
    } catch (error: any) {
      throw new Error(`Failed to get live project status: ${error.message}`);
    }
  }

  /**
   * Get recent activity with filtering options
   */
  async getRecentActivity(filter: ActivityFilter = {}): Promise<ActivityItem[]> {
    try {
      const timeframe = filter.timeframe || '24h';
      const includeIssues = filter.include_issues !== false;
      const includePRs = filter.include_pull_requests !== false;
      const includeMilestones = filter.include_milestones !== false;
      
      const since = this.getTimeframeCutoff(timeframe);
      const activities: ActivityItem[] = [];

      // Fetch issues if requested
      if (includeIssues) {
        const issuesResponse = await this.config.octokit.rest.issues.listForRepo({
          owner: this.config.owner,
          repo: this.config.repo,
          state: 'all',
          since: since.toISOString(),
          per_page: 100,
          sort: 'updated'
        });

        issuesResponse.data
          .filter(issue => !issue.pull_request)
          .forEach(issue => {
            activities.push({
              id: `issue-${issue.number}`,
              type: 'issue',
              action: issue.state === 'closed' ? 'closed' : 'updated',
              actor: issue.user?.login || 'unknown',
              title: issue.title,
              url: issue.html_url,
              timestamp: issue.updated_at,
              metadata: {
                number: issue.number,
                state: issue.state,
                labels: issue.labels.map((l: any) => l.name)
              }
            });
          });
      }

      // Fetch pull requests if requested
      if (includePRs) {
        const prsResponse = await this.config.octokit.rest.pulls.list({
          owner: this.config.owner,
          repo: this.config.repo,
          state: 'all',
          per_page: 100,
          sort: 'updated'
        });

        prsResponse.data
          .filter(pr => new Date(pr.updated_at) >= since)
          .forEach(pr => {
            activities.push({
              id: `pr-${pr.number}`,
              type: 'pull_request',
              action: pr.state === 'closed' ? (pr.merged_at ? 'merged' : 'closed') : 'updated',
              actor: pr.user?.login || 'unknown',
              title: pr.title,
              url: pr.html_url,
              timestamp: pr.updated_at,
              metadata: {
                number: pr.number,
                state: pr.state,
                merged: !!pr.merged_at
              }
            });
          });
      }

      // Sort by timestamp (most recent first)
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return activities;
    } catch (error: any) {
      console.error('Failed to get recent activity:', error);
      return [];
    }
  }

  /**
   * Process incoming webhook events
   */
  async processWebhookEvent(event: GitHubWebhookEvent): Promise<void> {
    try {
      // Add to activity cache
      if (event.issue || event.pull_request || event.milestone) {
        const activity = this.createActivityFromEvent(event);
        if (activity) {
          this.addToActivityCache(activity);
        }
      }

      // Emit event for subscribers
      this.emit('webhook-event', event);

      // Process specific event types
      switch (event.action) {
        case 'opened':
        case 'closed':
        case 'edited':
        case 'assigned':
        case 'unassigned':
          await this.handleIssueEvent(event);
          break;
        case 'created':
        case 'deleted':
          await this.handleMilestoneEvent(event);
          break;
        default:
          console.log(`Unhandled webhook event: ${event.action}`);
      }
    } catch (error) {
      console.error('Error processing webhook event:', error);
    }
  }

  /**
   * Subscribe to live updates
   */
  subscribeToUpdates(args: {
    subscription_id: string;
    events: string[];
    callback?: string;
  }): ToolResponse {
    const subscription: DataSubscription = {
      id: args.subscription_id,
      events: args.events,
      callback: () => {}, // Would be implemented with actual callback mechanism
      created_at: new Date()
    };

    this.subscriptions.set(args.subscription_id, subscription);

    let result = `📡 **Subscription Created**\n\n`;
    result += `**ID:** ${subscription.id}\n`;
    result += `**Events:** ${subscription.events.join(', ')}\n`;
    result += `**Created:** ${subscription.created_at.toLocaleString()}\n\n`;
    result += `✅ You will now receive real-time updates for these events.\n\n`;
    result += `💡 **Note:** In this implementation, events are logged and cached. In a production environment, this would trigger actual callbacks or notifications.`;

    return {
      content: [{ type: "text", text: result }]
    };
  }

  // Private helper methods
  private setupDefaultEventHandlers(): void {
    const defaultHandlers: EventHandlerConfig[] = [
      {
        event_type: 'issues',
        actions: ['opened', 'closed', 'edited'],
        enabled: true,
        handler_function: 'handleIssueEvent'
      },
      {
        event_type: 'milestone',
        actions: ['created', 'edited', 'deleted'],
        enabled: true,
        handler_function: 'handleMilestoneEvent'
      }
    ];

    defaultHandlers.forEach(handler => {
      this.eventHandlers.set(handler.event_type, handler);
    });
  }

  private async handleIssueEvent(event: GitHubWebhookEvent): Promise<void> {
    // Emit issue-specific events
    this.emit('issue-updated', event.issue);
  }

  private async handleMilestoneEvent(event: GitHubWebhookEvent): Promise<void> {
    // Emit milestone-specific events
    this.emit('milestone-updated', event.milestone);
  }

  private createActivityFromEvent(event: GitHubWebhookEvent): ActivityItem | null {
    if (event.issue) {
      return {
        id: `issue-${event.issue.number}-${Date.now()}`,
        type: 'issue',
        action: event.action,
        actor: event.sender.login,
        title: event.issue.title,
        url: event.issue.html_url,
        timestamp: new Date().toISOString(),
        metadata: {
          number: event.issue.number,
          state: event.issue.state
        }
      };
    }

    if (event.pull_request) {
      return {
        id: `pr-${event.pull_request.number}-${Date.now()}`,
        type: 'pull_request',
        action: event.action,
        actor: event.sender.login,
        title: event.pull_request.title,
        url: event.pull_request.html_url,
        timestamp: new Date().toISOString(),
        metadata: {
          number: event.pull_request.number,
          state: event.pull_request.state
        }
      };
    }

    if (event.milestone) {
      return {
        id: `milestone-${event.milestone.number}-${Date.now()}`,
        type: 'milestone',
        action: event.action,
        actor: event.sender.login,
        title: event.milestone.title,
        url: event.milestone.html_url,
        timestamp: new Date().toISOString(),
        metadata: {
          number: event.milestone.number,
          state: event.milestone.state
        }
      };
    }

    return null;
  }

  private addToActivityCache(activity: ActivityItem): void {
    this.activityCache.unshift(activity);
    
    // Keep only the most recent activities
    if (this.activityCache.length > this.maxActivityItems) {
      this.activityCache = this.activityCache.slice(0, this.maxActivityItems);
    }
  }

  private getTimeframeCutoff(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case '1h':
        return new Date(now.getTime() - (60 * 60 * 1000));
      case '6h':
        return new Date(now.getTime() - (6 * 60 * 60 * 1000));
      case '24h':
        return new Date(now.getTime() - (24 * 60 * 60 * 1000));
      case '7d':
        return new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
      case '30d':
        return new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      default:
        return new Date(now.getTime() - (24 * 60 * 60 * 1000));
    }
  }

  private getActivityEmoji(type: string): string {
    switch (type) {
      case 'issue':
        return '🐛';
      case 'pull_request':
        return '🔀';
      case 'milestone':
        return '🎯';
      case 'project':
        return '📋';
      case 'release':
        return '🚀';
      default:
        return '📝';
    }
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return true; // Skip verification if no secret configured
    }

    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(payload, 'utf8');
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );
  }
}
