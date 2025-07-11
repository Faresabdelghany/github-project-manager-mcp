import { GitHubConfig, ToolResponse, GitHubIssue } from '../../shared/types.js';
import { GitHubUtils } from '../../shared/utils.js';

export async function analyzeTaskComplexity(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.get({
      owner: config.owner,
      repo: config.repo,
      issue_number: args.issue_number
    });

    const issue = response.data as GitHubIssue;
    const complexity = GitHubUtils.analyzeIssueComplexity(issue);
    const priority = GitHubUtils.calculateIssuePriority(issue);

    let result = `🧠 **AI-Powered Task Complexity Analysis**\n\n`;
    result += `**Issue:** #${issue.number} - ${issue.title}\n\n`;
    result += `📊 **Complexity Score:** ${complexity}/8 story points\n`;
    result += `🎯 **Priority Level:** ${priority}/5\n\n`;

    // Complexity breakdown
    result += `**Complexity Analysis:**\n`;
    if (issue.title.split(' ').length > 10) {
      result += `• 📝 Complex title (${issue.title.split(' ').length} words)\n`;
    }
    
    if (issue.body) {
      if (issue.body.length > 1000) {
        result += `• 📄 Extensive description (${issue.body.length} characters)\n`;
      }
      
      const technicalKeywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security'];
      const foundKeywords = technicalKeywords.filter(keyword => 
        issue.body!.toLowerCase().includes(keyword.toLowerCase())
      );
      if (foundKeywords.length > 0) {
        result += `• 🔧 Technical keywords found: ${foundKeywords.join(', ')}\n`;
      }
      
      if (issue.body.includes('#')) {
        result += `• 🔗 Contains issue references (potential dependencies)\n`;
      }
    }

    const complexityLabels = issue.labels.filter(label => 
      ['epic', 'large', 'complex', 'research', 'spike'].some(keyword => 
        label.name.toLowerCase().includes(keyword)
      )
    );
    if (complexityLabels.length > 0) {
      result += `• 🏷️ Complexity labels: ${complexityLabels.map(l => l.name).join(', ')}\n`;
    }

    result += `\n**Priority Factors:**\n`;
    const priorityLabels = issue.labels.filter(label => 
      ['critical', 'high', 'medium', 'low'].some(keyword => 
        label.name.toLowerCase().includes(keyword)
      )
    );
    if (priorityLabels.length > 0) {
      result += `• 🚨 Priority labels: ${priorityLabels.map(l => l.name).join(', ')}\n`;
    }

    const isBug = issue.labels.some(label => 
      label.name.toLowerCase().includes('bug')
    );
    if (isBug) {
      result += `• 🐛 Bug fix (priority boost applied)\n`;
    }

    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUpdate < 7) {
      result += `• ⚡ Recently updated (${daysSinceUpdate} days ago)\n`;
    }

    result += `\n**Recommendations:**\n`;
    if (complexity >= 6) {
      result += `• ⚠️ High complexity - consider breaking into smaller tasks\n`;
    }
    if (priority >= 4) {
      result += `• 🔥 High priority - should be addressed soon\n`;
    }
    if (!issue.assignees || issue.assignees.length === 0) {
      result += `• 👤 No assignee - should be assigned to a team member\n`;
    }
    if (complexity >= 4 && (!issue.assignees || issue.assignees.length === 0)) {
      result += `• 🎯 Complex unassigned issue - needs experienced developer\n`;
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to analyze task complexity: ${(error as Error).message}`));
  }
}

export async function getRepositorySummary(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    // Get repository info
    const repoResponse = await config.octokit.rest.repos.get({
      owner: config.owner,
      repo: config.repo
    });

    // Get issues
    const issuesResponse = await config.octokit.rest.issues.listForRepo({
      owner: config.owner,
      repo: config.repo,
      state: 'all',
      per_page: 100
    });

    // Get milestones
    const milestonesResponse = await config.octokit.rest.issues.listMilestones({
      owner: config.owner,
      repo: config.repo,
      state: 'all',
      per_page: 100
    });

    // Get labels
    const labelsResponse = await config.octokit.rest.issues.listLabelsForRepo({
      owner: config.owner,
      repo: config.repo,
      per_page: 100
    });

    const repo = repoResponse.data;
    const allIssues = issuesResponse.data.filter(issue => !issue.pull_request);
    const milestones = milestonesResponse.data;
    const labels = labelsResponse.data;

    // Calculate metrics
    const openIssues = allIssues.filter(issue => issue.state === 'open');
    const closedIssues = allIssues.filter(issue => issue.state === 'closed');
    const bugIssues = allIssues.filter(issue => 
      issue.labels.some((label: any) => label.name.toLowerCase().includes('bug'))
    );
    const featureIssues = allIssues.filter(issue => 
      issue.labels.some((label: any) => 
        label.name.toLowerCase().includes('feature') || 
        label.name.toLowerCase().includes('enhancement')
      )
    );

    // Recent activity (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentIssues = allIssues.filter(issue => 
      new Date(issue.updated_at) >= weekAgo
    );

    // Overdue milestones
    const today = new Date();
    const overdueMilestones = milestones.filter(milestone => 
      milestone.state === 'open' && 
      milestone.due_on && 
      new Date(milestone.due_on) < today
    );

    // Calculate health score
    let healthScore = 100;
    
    // Penalty for high ratio of open issues
    const openRatio = allIssues.length > 0 ? (openIssues.length / allIssues.length) : 0;
    if (openRatio > 0.8) healthScore -= 30;
    else if (openRatio > 0.6) healthScore -= 20;
    else if (openRatio > 0.4) healthScore -= 10;

    // Penalty for overdue milestones
    if (overdueMilestones.length > 0) healthScore -= (overdueMilestones.length * 15);

    // Penalty for old open issues (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oldIssues = openIssues.filter(issue => 
      new Date(issue.created_at) < thirtyDaysAgo
    );
    if (oldIssues.length > 5) healthScore -= 20;

    // Bonus for recent activity
    if (recentIssues.length > 5) healthScore += 10;

    healthScore = Math.max(0, Math.min(100, healthScore));

    let result = `📈 **Repository Summary: ${repo.full_name}**\n\n`;
    
    result += `**Repository Overview:**\n`;
    result += `• 📅 Created: ${new Date(repo.created_at).toLocaleDateString()}\n`;
    result += `• 💻 Language: ${repo.language || 'Not specified'}\n`;
    result += `• ⭐ Stars: ${repo.stargazers_count}\n`;
    result += `• 🍴 Forks: ${repo.forks_count}\n`;
    result += `• 👀 Watchers: ${repo.watchers_count}\n\n`;

    result += `**Issues Analysis:**\n`;
    result += `• 📊 Total Issues: ${allIssues.length}\n`;
    result += `• 🟢 Open: ${openIssues.length} (${Math.round((openIssues.length / allIssues.length) * 100) || 0}%)\n`;
    result += `• ✅ Closed: ${closedIssues.length} (${Math.round((closedIssues.length / allIssues.length) * 100) || 0}%)\n`;
    result += `• 🐛 Bugs: ${bugIssues.length}\n`;
    result += `• ✨ Features: ${featureIssues.length}\n\n`;

    result += `**Milestones:**\n`;
    result += `• 🎯 Total: ${milestones.length}\n`;
    result += `• 🟢 Open: ${milestones.filter(m => m.state === 'open').length}\n`;
    result += `• ✅ Completed: ${milestones.filter(m => m.state === 'closed').length}\n`;
    if (overdueMilestones.length > 0) {
      result += `• ⚠️ Overdue: ${overdueMilestones.length}\n`;
    }
    result += `\n`;

    result += `**Labels & Organization:**\n`;
    result += `• 🏷️ Total Labels: ${labels.length}\n\n`;

    result += `**Activity Trends:**\n`;
    result += `• ⚡ Active Issues (7 days): ${recentIssues.length}\n`;
    
    const mostUsedLabels = labels
      .map(label => ({
        name: label.name,
        count: allIssues.filter(issue => 
          issue.labels.some((l: any) => l.name === label.name)
        ).length
      }))
      .filter(label => label.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    if (mostUsedLabels.length > 0) {
      result += `• 🏆 Most Used Labels: ${mostUsedLabels.map(l => `${l.name} (${l.count})`).join(', ')}\n`;
    }
    result += `\n`;

    // Health score
    let healthEmoji = '💚';
    let healthStatus = 'Excellent';
    if (healthScore < 70) {
      healthEmoji = '🟡';
      healthStatus = 'Good';
    }
    if (healthScore < 50) {
      healthEmoji = '🟠';
      healthStatus = 'Needs Attention';
    }
    if (healthScore < 30) {
      healthEmoji = '🔴';
      healthStatus = 'Critical';
    }

    result += `**Repository Health:** ${healthEmoji} ${healthScore}/100 (${healthStatus})\n\n`;

    result += `**Recommendations:**\n`;
    if (overdueMilestones.length > 0) {
      result += `• ⚠️ Address ${overdueMilestones.length} overdue milestone(s)\n`;
    }
    if (openRatio > 0.6) {
      result += `• 📝 High number of open issues - consider triage and prioritization\n`;
    }
    if (oldIssues.length > 5) {
      result += `• 🕰️ ${oldIssues.length} issues are older than 30 days - review and update\n`;
    }
    if (recentIssues.length === 0) {
      result += `• 📈 No recent activity - consider project status review\n`;
    }
    if (milestones.length === 0) {
      result += `• 🎯 No milestones defined - consider adding project milestones\n`;
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to get repository summary: ${(error as Error).message}`));
  }
}
