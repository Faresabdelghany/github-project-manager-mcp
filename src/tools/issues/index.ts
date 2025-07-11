import { GitHubConfig, ToolResponse } from '../../shared/types.js';
import { GitHubUtils } from '../../shared/utils.js';

export async function createIssue(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.create({
      owner: config.owner,
      repo: config.repo,
      title: args.title,
      body: args.body,
      labels: args.labels,
      assignees: args.assignees,
      milestone: args.milestone
    });

    const issue = response.data;
    const resultText = `✅ **Issue created successfully!**\n\n` +
      `**Title:** ${issue.title}\n` +
      `**Number:** #${issue.number}\n` +
      `**State:** ${issue.state}\n` +
      `**Labels:** ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n` +
      `**Assignees:** ${(issue.assignees || []).map((a: any) => a.login).join(', ') || 'None'}\n` +
      `**URL:** ${issue.html_url}`;

    return GitHubUtils.createSuccessResponse(resultText);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to create issue: ${(error as Error).message}`));
  }
}

export async function listIssues(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.listForRepo({
      owner: config.owner,
      repo: config.repo,
      state: args.state || 'open',
      labels: args.labels,
      assignee: args.assignee,
      milestone: args.milestone,
      per_page: 50
    });

    let result = `📋 **Repository Issues** - Found ${response.data.length} issues\n\n`;
    
    if (response.data.length === 0) {
      result += "No issues found matching the criteria.";
    } else {
      response.data.forEach(issue => {
        result += `**${issue.title}** (#${issue.number})\n`;
        result += `   🏷️ Labels: ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n`;
        result += `   👤 Assignees: ${(issue.assignees || []).map((a: any) => a.login).join(', ') || 'None'}\n`;
        result += `   📅 Created: ${new Date(issue.created_at).toLocaleDateString()}\n`;
        result += `   🔗 ${issue.html_url}\n\n`;
      });
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to list issues: ${(error as Error).message}`));
  }
}

export async function getIssue(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.get({
      owner: config.owner,
      repo: config.repo,
      issue_number: args.issue_number
    });

    const issue = response.data;
    let result = `📝 **Issue Details: ${issue.title}**\n\n`;
    result += `**Number:** #${issue.number}\n`;
    result += `**State:** ${issue.state}\n`;
    result += `**Author:** ${issue.user?.login}\n`;
    result += `**Created:** ${new Date(issue.created_at).toLocaleDateString()}\n`;
    result += `**Updated:** ${new Date(issue.updated_at).toLocaleDateString()}\n`;
    result += `**Labels:** ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n`;
    result += `**Assignees:** ${(issue.assignees || []).map((a: any) => a.login).join(', ') || 'None'}\n`;
    result += `**Milestone:** ${issue.milestone?.title || 'None'}\n`;
    result += `**Comments:** ${issue.comments}\n`;
    result += `**URL:** ${issue.html_url}\n\n`;
    
    if (issue.body) {
      result += `**Description:**\n${issue.body.length > 200 ? issue.body.substring(0, 200) + '...' : issue.body}`;
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to get issue: ${(error as Error).message}`));
  }
}

export async function updateIssue(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const updateData: any = {
      owner: config.owner,
      repo: config.repo,
      issue_number: args.issue_number
    };

    if (args.title) updateData.title = args.title;
    if (args.body) updateData.body = args.body;
    if (args.state) updateData.state = args.state;
    if (args.labels) updateData.labels = args.labels;
    if (args.assignees) updateData.assignees = args.assignees;
    if (args.milestone) updateData.milestone = args.milestone;

    const response = await config.octokit.rest.issues.update(updateData);

    const issue = response.data;
    const resultText = `✅ **Issue updated successfully!**\n\n` +
      `**Title:** ${issue.title}\n` +
      `**Number:** #${issue.number}\n` +
      `**State:** ${issue.state}\n` +
      `**Labels:** ${issue.labels.map((l: any) => l.name).join(', ') || 'None'}\n` +
      `**Assignees:** ${(issue.assignees || []).map((a: any) => a.login).join(', ') || 'None'}\n` +
      `**URL:** ${issue.html_url}`;

    return GitHubUtils.createSuccessResponse(resultText);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to update issue: ${(error as Error).message}`));
  }
}
