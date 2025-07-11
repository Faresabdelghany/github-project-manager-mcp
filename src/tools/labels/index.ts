import { GitHubConfig, ToolResponse } from '../../shared/types.js';
import { GitHubUtils } from '../../shared/utils.js';

export async function createLabel(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.createLabel({
      owner: config.owner,
      repo: config.repo,
      name: args.name,
      color: args.color.replace('#', ''),
      description: args.description || ""
    });

    const label = response.data;
    const resultText = `✅ Label created successfully!\n\n` +
      `**Name:** ${label.name}\n` +
      `**Color:** #${label.color}\n` +
      `**Description:** ${label.description || "None"}`;

    return GitHubUtils.createSuccessResponse(resultText);
  } catch (error: any) {
    if (error.status === 422) {
      return GitHubUtils.createErrorResponse(new Error(`Label "${args.name}" already exists`));
    }
    return GitHubUtils.createErrorResponse(new Error(`Failed to create label: ${error.message}`));
  }
}

export async function listLabels(config: GitHubConfig, args: any): Promise<ToolResponse> {
  try {
    GitHubUtils.validateRepoConfig(config);

    const response = await config.octokit.rest.issues.listLabelsForRepo({
      owner: config.owner,
      repo: config.repo,
      per_page: 100
    });

    let result = `🏷️ **Repository Labels** - Found ${response.data.length} labels\n\n`;
    
    if (response.data.length === 0) {
      result += "No labels found.";
    } else {
      response.data.forEach(label => {
        result += `**${label.name}** 🎨 #${label.color}\n`;
        if (label.description) {
          result += `   📝 ${label.description}\n`;
        }
        result += "\n";
      });
    }

    return GitHubUtils.createSuccessResponse(result);
  } catch (error) {
    return GitHubUtils.createErrorResponse(new Error(`Failed to list labels: ${(error as Error).message}`));
  }
}
