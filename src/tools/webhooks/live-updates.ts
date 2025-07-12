import { GitHubConfig, ToolResponse } from '../../shared/types.js';
import { WebhookService } from '../../services/webhook-service.js';
import { ActivityFilter } from '../../shared/webhook-types.js';

/**
 * Get real-time project status (never cached, always fresh data)
 */
export async function getLiveProjectStatus(config: GitHubConfig, args: {
  include_activity?: boolean;
  activity_timeframe?: '1h' | '6h' | '24h' | '7d';
}): Promise<ToolResponse> {
  const webhookService = new WebhookService(config);
  return await webhookService.getLiveProjectStatus();
}

/**
 * Get live sprint metrics and progress
 */
export async function getLiveSprintMetrics(config: GitHubConfig, args: {
  sprint_number?: number;
  milestone_number?: number;
  include_burndown?: boolean;
  include_velocity?: boolean;
  include_team_metrics?: boolean;
}): Promise<ToolResponse> {
  try {
    // Get current sprints (milestones that represent sprints)
    const milestonesResponse = await config.octokit.rest.issues.listMilestones({
      owner: config.owner,
      repo: config.repo,
      state: 'open',
      per_page: 100
    });

    const milestones = milestonesResponse.data;
    
    // Find sprint milestones (those with sprint metadata)
    const sprintMilestones = milestones.filter(milestone => {
      const description = milestone.description || '';
      return description.includes('SPRINT_METADATA') || 
             milestone.title.toLowerCase().includes('sprint');
    });

    if (sprintMilestones.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📊 **Live Sprint Metrics**\n\n❌ **No active sprints found**\n\nNo sprint milestones are currently active in this repository.\n\n💡 **To create a sprint:**\n• Use 'create_sprint' to set up a new sprint\n• Or create a milestone with "Sprint" in the title`
        }]
      };
    }

    // Determine which sprint to analyze
    let targetMilestone = sprintMilestones[0];
    
    if (args.sprint_number || args.milestone_number) {
      const targetNumber = args.milestone_number || args.sprint_number;
      const found = sprintMilestones.find(m => m.number === targetNumber);
      if (!found) {
        return {
          content: [{
            type: "text",
            text: `❌ **Sprint not found**\n\nNo sprint found with ${args.sprint_number ? 'sprint number' : 'milestone number'} ${targetNumber}.`
          }]
        };
      }
      targetMilestone = found;
    }

    // Get issues for this sprint
    const issuesResponse = await config.octokit.rest.issues.listForRepo({
      owner: config.owner,
      repo: config.repo,
      milestone: targetMilestone.number.toString(),
      state: 'all',
      per_page: 100
    });

    const sprintIssues = issuesResponse.data.filter(issue => !issue.pull_request);
    
    // Calculate sprint metrics
    const totalIssues = sprintIssues.length;
    const completedIssues = sprintIssues.filter(issue => issue.state === 'closed').length;
    const inProgressIssues = sprintIssues.filter(issue => 
      issue.state === 'open' && 
      issue.assignees && 
      issue.assignees.length > 0
    ).length;
    const notStartedIssues = totalIssues - completedIssues - inProgressIssues;
    const completionPercentage = totalIssues > 0 ? Math.round((completedIssues / totalIssues) * 100) : 0;

    // Parse sprint metadata if available
    let sprintMetadata = null;
    try {
      const description = targetMilestone.description || '';
      const metadataMatch = description.match(/<!-- SPRINT_METADATA:(.*?) -->/);
      if (metadataMatch) {
        sprintMetadata = JSON.parse(metadataMatch[1]);
      }
    } catch (error) {
      // Sprint metadata parsing failed, continue without it
    }

    // Determine sprint status
    const now = new Date();
    const dueDate = targetMilestone.due_on ? new Date(targetMilestone.due_on) : null;
    let sprintStatus = 'active';
    
    if (sprintMetadata) {
      const startDate = new Date(sprintMetadata.startDate);
      const endDate = new Date(sprintMetadata.endDate);
      
      if (now < startDate) {
        sprintStatus = 'planned';
      } else if (now > endDate) {
        sprintStatus = targetMilestone.state === 'closed' ? 'completed' : 'overdue';
      }
    } else if (targetMilestone.state === 'closed') {
      sprintStatus = 'completed';
    } else if (dueDate && now > dueDate) {
      sprintStatus = 'overdue';
    }

    // Calculate story points (basic implementation)
    const calculateStoryPoints = (issue: any): number => {
      // Look for story point labels (e.g., "sp:3", "3 points", etc.)
      for (const label of issue.labels) {
        const match = label.name.match(/(?:sp:|points?:?)\s*(\d+)/i) || 
                     label.name.match(/^(\d+)\s*(?:sp|points?)$/i);
        if (match) {
          return parseInt(match[1]);
        }
      }
      
      // Basic complexity estimation based on title/body length
      const titleLength = issue.title.length;
      const bodyLength = issue.body ? issue.body.length : 0;
      
      if (titleLength > 100 || bodyLength > 1000) return 5;
      if (titleLength > 50 || bodyLength > 500) return 3;
      if (titleLength > 20 || bodyLength > 100) return 2;
      return 1;
    };

    const totalStoryPoints = sprintIssues.reduce((sum, issue) => sum + calculateStoryPoints(issue), 0);
    const completedStoryPoints = sprintIssues
      .filter(issue => issue.state === 'closed')
      .reduce((sum, issue) => sum + calculateStoryPoints(issue), 0);
    const remainingStoryPoints = totalStoryPoints - completedStoryPoints;

    // Calculate team metrics
    const teamMembers = new Set<string>();
    const workloadDistribution: { [key: string]: { assigned: number; completed: number; storyPoints: number } } = {};

    sprintIssues.forEach(issue => {
      if (issue.assignees) {
        issue.assignees.forEach(assignee => {
          const login = assignee.login;
          teamMembers.add(login);
          
          if (!workloadDistribution[login]) {
            workloadDistribution[login] = { assigned: 0, completed: 0, storyPoints: 0 };
          }
          
          workloadDistribution[login].assigned++;
          workloadDistribution[login].storyPoints += calculateStoryPoints(issue);
          
          if (issue.state === 'closed') {
            workloadDistribution[login].completed++;
          }
        });
      }
    });

    // Calculate velocity metrics
    const sprintDuration = sprintMetadata ? sprintMetadata.duration : 14;
    const sprintStartDate = sprintMetadata ? new Date(sprintMetadata.startDate) : new Date(targetMilestone.created_at);
    const daysSinceStart = Math.max(1, Math.floor((now.getTime() - sprintStartDate.getTime()) / (1000 * 60 * 60 * 24)));
    const dailyCompletionRate = completedStoryPoints / daysSinceStart;
    const projectedDaysToComplete = remainingStoryPoints > 0 ? Math.ceil(remainingStoryPoints / Math.max(dailyCompletionRate, 0.1)) : 0;
    const projectedCompletionDate = new Date(now.getTime() + (projectedDaysToComplete * 24 * 60 * 60 * 1000));

    let result = `📊 **Live Sprint Metrics** (${new Date().toLocaleString()})\n\n`;
    
    result += `🏃‍♂️ **Sprint:** ${targetMilestone.title}\n`;
    result += `**Milestone:** #${targetMilestone.number}\n`;
    result += `**Status:** `;
    
    switch (sprintStatus) {
      case 'planned':
        result += `📅 Planned`;
        break;
      case 'active':
        result += `⚡ Active`;
        break;
      case 'completed':
        result += `✅ Completed`;
        break;
      case 'overdue':
        result += `⚠️ Overdue`;
        break;
    }
    result += `\n`;

    if (sprintMetadata) {
      result += `**Duration:** ${sprintMetadata.duration} days (${sprintMetadata.startDate} → ${sprintMetadata.endDate})\n`;
      if (sprintMetadata.goals && sprintMetadata.goals.length > 0) {
        result += `**Goals:** ${sprintMetadata.goals.join(', ')}\n`;
      }
    } else if (targetMilestone.due_on) {
      result += `**Due Date:** ${new Date(targetMilestone.due_on).toLocaleDateString()}\n`;
    }
    result += `\n`;

    result += `📈 **Progress:**\n`;
    result += `• **Issues:** ${completedIssues}/${totalIssues} completed (${completionPercentage}%)\n`;
    result += `• **In Progress:** ${inProgressIssues} issues\n`;
    result += `• **Not Started:** ${notStartedIssues} issues\n`;
    result += `• **Story Points:** ${completedStoryPoints}/${totalStoryPoints} completed\n`;
    result += `\n`;

    if (args.include_velocity !== false) {
      result += `🚀 **Velocity Metrics:**\n`;
      result += `• **Daily Completion Rate:** ${dailyCompletionRate.toFixed(1)} story points/day\n`;
      result += `• **Remaining Work:** ${remainingStoryPoints} story points\n`;
      
      if (remainingStoryPoints > 0) {
        result += `• **Projected Completion:** ${projectedCompletionDate.toLocaleDateString()} (${projectedDaysToComplete} days)\n`;
        
        if (dueDate) {
          const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (projectedDaysToComplete > daysUntilDue) {
            result += `• **Risk:** ⚠️ Projected to finish ${projectedDaysToComplete - daysUntilDue} days late\n`;
          } else {
            result += `• **Risk:** ✅ On track to finish on time\n`;
          }
        }
      } else {
        result += `• **Status:** ✅ All work completed!\n`;
      }
      result += `\n`;
    }

    if (args.include_team_metrics !== false && teamMembers.size > 0) {
      result += `👥 **Team Metrics:**\n`;
      result += `• **Team Size:** ${teamMembers.size} members\n`;
      result += `• **Active Contributors:** ${Object.keys(workloadDistribution).length}\n\n`;
      
      result += `**Workload Distribution:**\n`;
      Object.entries(workloadDistribution)
        .sort(([, a], [, b]) => b.storyPoints - a.storyPoints)
        .forEach(([assignee, metrics]) => {
          const completionRate = metrics.assigned > 0 ? Math.round((metrics.completed / metrics.assigned) * 100) : 0;
          result += `• **${assignee}:** ${metrics.completed}/${metrics.assigned} issues (${completionRate}%), ${metrics.storyPoints} sp\n`;
        });
      result += `\n`;
    }

    // Sprint health indicators
    result += `🏥 **Sprint Health:**\n`;
    
    if (completionPercentage >= 80) {
      result += `• **Progress:** ✅ Excellent (${completionPercentage}%)\n`;
    } else if (completionPercentage >= 60) {
      result += `• **Progress:** 🟡 Good (${completionPercentage}%)\n`;
    } else if (completionPercentage >= 40) {
      result += `• **Progress:** 🟠 Behind (${completionPercentage}%)\n`;
    } else {
      result += `• **Progress:** 🔴 Significantly behind (${completionPercentage}%)\n`;
    }

    const unassignedIssues = sprintIssues.filter(issue => 
      issue.state === 'open' && (!issue.assignees || issue.assignees.length === 0)
    ).length;
    
    if (unassignedIssues > 0) {
      result += `• **Assignment:** ⚠️ ${unassignedIssues} unassigned issues\n`;
    } else {
      result += `• **Assignment:** ✅ All issues assigned\n`;
    }

    if (sprintStatus === 'overdue') {
      result += `• **Timeline:** 🔴 Sprint is overdue\n`;
    } else if (dailyCompletionRate > 0 && projectedDaysToComplete > 0) {
      const sprintEndDate = sprintMetadata ? new Date(sprintMetadata.endDate) : dueDate;
      if (sprintEndDate && projectedCompletionDate > sprintEndDate) {
        result += `• **Timeline:** 🟠 At risk of missing deadline\n`;
      } else {
        result += `• **Timeline:** ✅ On track\n`;
      }
    }

    result += `\n💡 **Live Updates:** This data is fetched in real-time and reflects the current state of the sprint.`;

    return {
      content: [{ type: "text", text: result }]
    };
  } catch (error: any) {
    throw new Error(`Failed to get live sprint metrics: ${error.message}`);
  }
}

/**
 * Subscribe to real-time updates for specific events
 */
export async function subscribeToUpdates(config: GitHubConfig, args: {
  subscription_id: string;
  events: string[];
  callback?: string;
}): Promise<ToolResponse> {
  const webhookService = new WebhookService(config);
  return webhookService.subscribeToUpdates(args);
}

/**
 * Get recent activity feed with filtering
 */
export async function getRecentActivity(config: GitHubConfig, args: {
  timeframe?: '1h' | '6h' | '24h' | '7d' | '30d';
  event_types?: string[];
  actors?: string[];
  include_pull_requests?: boolean;
  include_issues?: boolean;
  include_milestones?: boolean;
  include_projects?: boolean;
  limit?: number;
}): Promise<ToolResponse> {
  try {
    const webhookService = new WebhookService(config);
    
    const filter: ActivityFilter = {
      timeframe: args.timeframe || '24h',
      event_types: args.event_types,
      actors: args.actors,
      include_pull_requests: args.include_pull_requests,
      include_issues: args.include_issues,
      include_milestones: args.include_milestones,
      include_projects: args.include_projects
    };

    const activities = await webhookService.getRecentActivity(filter);
    const limit = Math.min(args.limit || 50, 100);
    const limitedActivities = activities.slice(0, limit);

    let result = `🕐 **Recent Activity** (Last ${args.timeframe || '24h'})\n\n`;
    result += `**Repository:** ${config.owner}/${config.repo}\n`;
    result += `**Generated:** ${new Date().toLocaleString()}\n`;
    result += `**Activities Found:** ${limitedActivities.length}${activities.length > limit ? ` (showing first ${limit})` : ''}\n\n`;

    if (limitedActivities.length === 0) {
      result += `📭 **No recent activity**\n\n`;
      result += `No activity found in the specified timeframe.\n\n`;
      result += `💡 **Suggestions:**\n`;
      result += `• Try a longer timeframe (e.g., '7d' or '30d')\n`;
      result += `• Check if the repository has recent commits or issues\n`;
      result += `• Ensure webhook events are being captured`;
    } else {
      // Group activities by type
      const activityGroups: { [key: string]: any[] } = {};
      limitedActivities.forEach(activity => {
        const type = activity.type;
        if (!activityGroups[type]) {
          activityGroups[type] = [];
        }
        activityGroups[type].push(activity);
      });

      // Summary by type
      result += `📊 **Activity Summary:**\n`;
      Object.entries(activityGroups).forEach(([type, items]) => {
        const emoji = getActivityEmoji(type);
        result += `• ${emoji} **${type.replace('_', ' ')}:** ${items.length} activities\n`;
      });
      result += `\n`;

      // Detailed activity list
      result += `📋 **Activity Details:**\n\n`;
      limitedActivities.forEach((activity, index) => {
        const timeAgo = getTimeAgo(new Date(activity.timestamp));
        const emoji = getActivityEmoji(activity.type);
        
        result += `**${index + 1}.** ${emoji} **${activity.action}** [${activity.title}](${activity.url})\n`;
        result += `   👤 ${activity.actor} • 🕐 ${timeAgo}\n`;
        
        if (activity.metadata) {
          if (activity.metadata.labels && activity.metadata.labels.length > 0) {
            result += `   🏷️ ${activity.metadata.labels.join(', ')}\n`;
          }
          if (activity.metadata.state) {
            result += `   📊 ${activity.metadata.state}\n`;
          }
        }
        result += `\n`;
      });

      // Activity patterns
      if (limitedActivities.length >= 5) {
        const actorCounts: { [key: string]: number } = {};
        limitedActivities.forEach(activity => {
          actorCounts[activity.actor] = (actorCounts[activity.actor] || 0) + 1;
        });

        const topActors = Object.entries(actorCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5);

        result += `👥 **Most Active Contributors:**\n`;
        topActors.forEach(([actor, count], index) => {
          result += `${index + 1}. **${actor}** (${count} activities)\n`;
        });
      }
    }

    result += `\n🔄 **Real-time Updates:** Use 'subscribe_to_updates' to get notified of new activities as they happen.`;

    return {
      content: [{ type: "text", text: result }]
    };
  } catch (error: any) {
    throw new Error(`Failed to get recent activity: ${error.message}`);
  }
}

/**
 * Get live repository health and status indicators
 */
export async function getLiveRepositoryHealth(config: GitHubConfig, args: {}): Promise<ToolResponse> {
  try {
    const timestamp = new Date().toISOString();

    // Fetch comprehensive repository data
    const [
      repoResponse,
      issuesResponse,
      prsResponse,
      milestonesResponse,
      branchesResponse,
      releasesResponse
    ] = await Promise.all([
      config.octokit.rest.repos.get({
        owner: config.owner,
        repo: config.repo
      }),
      config.octokit.rest.issues.listForRepo({
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
      config.octokit.rest.issues.listMilestones({
        owner: config.owner,
        repo: config.repo,
        state: 'all',
        per_page: 100
      }),
      config.octokit.rest.repos.listBranches({
        owner: config.owner,
        repo: config.repo,
        per_page: 100
      }),
      config.octokit.rest.repos.listReleases({
        owner: config.owner,
        repo: config.repo,
        per_page: 10
      })
    ]);

    const repo = repoResponse.data;
    const allIssues = issuesResponse.data;
    const issues = allIssues.filter(issue => !issue.pull_request);
    const pullRequests = prsResponse.data;
    const milestones = milestonesResponse.data;
    const branches = branchesResponse.data;
    const releases = releasesResponse.data;

    // Calculate health metrics
    const openIssues = issues.filter(i => i.state === 'open');
    const staleBoundary = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
    const staleIssues = openIssues.filter(i => new Date(i.updated_at) < staleBoundary);
    
    const openPRs = pullRequests.filter(pr => pr.state === 'open');
    const stalePRs = openPRs.filter(pr => new Date(pr.updated_at) < staleBoundary);
    
    const overdueMilestones = milestones.filter(m => 
      m.state === 'open' && m.due_on && new Date(m.due_on) < new Date()
    );

    // Repository activity score (0-100)
    const lastUpdate = new Date(repo.updated_at);
    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    const activityScore = Math.max(0, Math.min(100, 100 - (daysSinceUpdate * 2)));

    // Issue management score
    const totalIssues = issues.length;
    const issueManagementScore = totalIssues > 0 
      ? Math.max(0, 100 - ((staleIssues.length / totalIssues) * 100))
      : 100;

    // Overall health score
    const healthScore = Math.round((activityScore + issueManagementScore) / 2);

    let result = `🏥 **Live Repository Health** (${new Date(timestamp).toLocaleString()})\n\n`;
    
    result += `📊 **Overall Health Score: ${healthScore}/100**\n`;
    if (healthScore >= 80) {
      result += `✅ **Excellent** - Repository is well-maintained\n`;
    } else if (healthScore >= 60) {
      result += `🟡 **Good** - Repository is actively maintained\n`;
    } else if (healthScore >= 40) {
      result += `🟠 **Fair** - Some maintenance issues detected\n`;
    } else {
      result += `🔴 **Poor** - Repository needs attention\n`;
    }
    result += `\n`;

    result += `🏗️ **Repository Overview:**\n`;
    result += `• **Name:** ${repo.full_name}\n`;
    result += `• **Language:** ${repo.language || 'Not specified'}\n`;
    result += `• **Stars:** ⭐ ${repo.stargazers_count}\n`;
    result += `• **Forks:** 🍴 ${repo.forks_count}\n`;
    result += `• **Watchers:** 👀 ${repo.watchers_count}\n`;
    result += `• **Size:** ${(repo.size / 1024).toFixed(1)} MB\n`;
    result += `• **Last Updated:** ${new Date(repo.updated_at).toLocaleDateString()}\n`;
    result += `\n`;

    result += `🐛 **Issues Health:**\n`;
    result += `• **Total Issues:** ${totalIssues}\n`;
    result += `• **Open Issues:** ${openIssues.length}\n`;
    result += `• **Stale Issues:** ${staleIssues.length} (>30 days old)\n`;
    if (staleIssues.length > 0) {
      result += `• **Stale Ratio:** ${Math.round((staleIssues.length / openIssues.length) * 100)}% of open issues\n`;
    }
    result += `• **Issue Management Score:** ${Math.round(issueManagementScore)}/100\n`;
    result += `\n`;

    result += `🔀 **Pull Requests:**\n`;
    result += `• **Total PRs:** ${pullRequests.length}\n`;
    result += `• **Open PRs:** ${openPRs.length}\n`;
    result += `• **Stale PRs:** ${stalePRs.length} (>30 days old)\n`;
    if (pullRequests.length > 0) {
      const mergedPRs = pullRequests.filter(pr => pr.merged_at).length;
      result += `• **Merge Rate:** ${Math.round((mergedPRs / pullRequests.length) * 100)}%\n`;
    }
    result += `\n`;

    result += `🎯 **Milestones:**\n`;
    result += `• **Total Milestones:** ${milestones.length}\n`;
    result += `• **Open Milestones:** ${milestones.filter(m => m.state === 'open').length}\n`;
    result += `• **Overdue Milestones:** ${overdueMilestones.length}\n`;
    if (milestones.length > 0) {
      const completedMilestones = milestones.filter(m => m.state === 'closed').length;
      result += `• **Completion Rate:** ${Math.round((completedMilestones / milestones.length) * 100)}%\n`;
    }
    result += `\n`;

    result += `🌿 **Branches & Releases:**\n`;
    result += `• **Branches:** ${branches.length}\n`;
    result += `• **Default Branch:** ${repo.default_branch}\n`;
    result += `• **Releases:** ${releases.length}\n`;
    if (releases.length > 0) {
      const latestRelease = releases[0];
      result += `• **Latest Release:** ${latestRelease.tag_name} (${new Date(latestRelease.published_at).toLocaleDateString()})\n`;
    }
    result += `\n`;

    result += `⚠️ **Health Alerts:**\n`;
    
    const alerts = [];
    if (staleIssues.length > 5) {
      alerts.push(`🔴 ${staleIssues.length} stale issues need attention`);
    }
    if (stalePRs.length > 3) {
      alerts.push(`🔴 ${stalePRs.length} stale pull requests need review`);
    }
    if (overdueMilestones.length > 0) {
      alerts.push(`🔴 ${overdueMilestones.length} overdue milestones`);
    }
    if (daysSinceUpdate > 7) {
      alerts.push(`🟡 Repository hasn't been updated in ${Math.round(daysSinceUpdate)} days`);
    }
    if (openIssues.length > 50) {
      alerts.push(`🟡 High number of open issues (${openIssues.length})`);
    }
    
    if (alerts.length === 0) {
      result += `✅ No critical issues detected\n`;
    } else {
      alerts.forEach(alert => {
        result += `• ${alert}\n`;
      });
    }

    result += `\n💡 **Recommendations:**\n`;
    if (staleIssues.length > 0) {
      result += `• Review and update stale issues\n`;
    }
    if (stalePRs.length > 0) {
      result += `• Review pending pull requests\n`;
    }
    if (overdueMilestones.length > 0) {
      result += `• Update overdue milestone dates or close completed milestones\n`;
    }
    if (openIssues.length === 0 && openPRs.length === 0) {
      result += `• Great work! Repository is well-maintained\n`;
    }

    return {
      content: [{ type: "text", text: result }]
    };
  } catch (error: any) {
    throw new Error(`Failed to get live repository health: ${error.message}`);
  }
}

// Helper functions
function getActivityEmoji(type: string): string {
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

function getTimeAgo(date: Date): string {
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
