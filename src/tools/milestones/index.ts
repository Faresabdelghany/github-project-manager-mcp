import { GitHubConfig, ToolResponse } from '../../shared/types.js';
import { GitHubUtils } from '../../shared/utils.js';

export async function createMilestone(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);
    
    const response = await config.octokit.rest.issues.createMilestone({
      owner: config.owner,
      repo: config.repo,
      title: args.title,
      description: args.description,
      due_on: GitHubUtils.formatDateForGitHub(args.due_on),
      state: args.state || 'open'
    });

    const milestone = response.data;
    const resultText = `✅ **Milestone created successfully!**\n\n` +
      `**Title:** ${milestone.title}\n` +
      `**Number:** ${milestone.number}\n` +
      `**Description:** ${milestone.description || 'None'}\n` +
      `**Due Date:** ${milestone.due_on || 'Not set'}\n` +
      `**State:** ${milestone.state}\n` +
      `**URL:** ${milestone.html_url}`;

    return GitHubUtils.createSuccessResponse(resultText);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to create milestone: ${(error as Error).message}`));
  }
}

export async function listMilestones(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.listMilestones({
      owner: config.owner,
      repo: config.repo,
      state: args.state || 'open',
      per_page: 100
    });

    let result = `🎯 **Repository Milestones** - Found ${response.data.length} milestones\n\n`;
    
    if (response.data.length === 0) {
      result += "No milestones found.";
    } else {
      response.data.forEach(milestone => {
        const progress = milestone.closed_issues + milestone.open_issues > 0 
          ? Math.round((milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100)
          : 0;
        
        result += `**${milestone.title}** (#${milestone.number})\n`;
        result += `   📅 Due: ${milestone.due_on ? new Date(milestone.due_on).toLocaleDateString() : 'Not set'}\n`;
        result += `   📊 Progress: ${progress}% (${milestone.closed_issues}/${milestone.closed_issues + milestone.open_issues} issues completed)\n`;
        result += `   🔗 ${milestone.html_url}\n\n`;
      });
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to list milestones: ${(error as Error).message}`));
  }
}

export async function getMilestoneMetrics(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.getMilestone({
      owner: config.owner,
      repo: config.repo,
      milestone_number: args.milestone_number
    });

    const milestone = response.data;
    const totalIssues = milestone.open_issues + milestone.closed_issues;
    const progress = totalIssues > 0 ? Math.round((milestone.closed_issues / totalIssues) * 100) : 0;
    const daysRemaining = milestone.due_on ? Math.ceil((new Date(milestone.due_on).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    let result = `📊 **Milestone Metrics: ${milestone.title}**\n\n`;
    result += `**Progress:** ${progress}% completed\n`;
    result += `**Issues:** ${milestone.closed_issues} closed, ${milestone.open_issues} open (${totalIssues} total)\n`;
    
    if (milestone.due_on) {
      result += `**Due Date:** ${new Date(milestone.due_on).toLocaleDateString()}\n`;
      if (daysRemaining !== null) {
        if (daysRemaining > 0) {
          result += `**Days Remaining:** ${daysRemaining}\n`;
        } else if (daysRemaining === 0) {
          result += `**Status:** ⚠️ Due today!\n`;
        } else {
          result += `**Status:** ❌ Overdue by ${Math.abs(daysRemaining)} days\n`;
        }
      }
    }
    
    result += `**URL:** ${milestone.html_url}`;

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to get milestone metrics: ${(error as Error).message}`));
  }
}

export async function getOverdueMilestones(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.listMilestones({
      owner: config.owner,
      repo: config.repo,
      state: 'open',
      per_page: 100
    });

    const today = new Date();
    const overdueMilestones = response.data.filter(milestone => 
      milestone.due_on && new Date(milestone.due_on) < today
    );

    let result = `⚠️ **Overdue Milestones** - Found ${overdueMilestones.length} overdue milestones\n\n`;
    
    if (overdueMilestones.length === 0) {
      result += "🎉 No overdue milestones! All on track.";
    } else {
      overdueMilestones.forEach(milestone => {
        const daysOverdue = Math.ceil((today.getTime() - new Date(milestone.due_on!).getTime()) / (1000 * 60 * 60 * 24));
        const progress = milestone.closed_issues + milestone.open_issues > 0 
          ? Math.round((milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100)
          : 0;
        
        result += `**${milestone.title}** (#${milestone.number})\n`;
        result += `   ❌ Overdue by: ${daysOverdue} days\n`;
        result += `   📊 Progress: ${progress}%\n`;
        result += `   📅 Was due: ${new Date(milestone.due_on!).toLocaleDateString()}\n\n`;
      });
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to get overdue milestones: ${(error as Error).message}`));
  }
}

export async function getUpcomingMilestones(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.listMilestones({
      owner: config.owner,
      repo: config.repo,
      state: 'open',
      sort: 'due_on',
      direction: 'asc',
      per_page: 100
    });

    const today = new Date();
    const futureDate = new Date(today.getTime() + (args.days * 24 * 60 * 60 * 1000));
    
    const upcomingMilestones = response.data.filter(milestone => 
      milestone.due_on && 
      new Date(milestone.due_on) >= today && 
      new Date(milestone.due_on) <= futureDate
    );

    let result = `📅 **Upcoming Milestones** (next ${args.days} days) - Found ${upcomingMilestones.length} milestones\n\n`;
    
    if (upcomingMilestones.length === 0) {
      result += `No milestones due in the next ${args.days} days.`;
    } else {
      upcomingMilestones.forEach(milestone => {
        const daysUntilDue = Math.ceil((new Date(milestone.due_on!).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const progress = milestone.closed_issues + milestone.open_issues > 0 
          ? Math.round((milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100)
          : 0;
        
        result += `**${milestone.title}** (#${milestone.number})\n`;
        result += `   📅 Due in: ${daysUntilDue} days (${new Date(milestone.due_on!).toLocaleDateString()})\n`;
        result += `   📊 Progress: ${progress}%\n`;
        result += `   🔗 ${milestone.html_url}\n\n`;
      });
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to get upcoming milestones: ${(error as Error).message}`));
  }
}
