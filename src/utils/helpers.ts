import { ValidationConfig } from '../types/index.js';

/**
 * Validates that the repository configuration is set up correctly
 */
export function validateRepoConfig(config: ValidationConfig): void {
  if (!config.owner || !config.repo) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
  }
}

/**
 * Standardized error handling for tools
 */
export function handleToolError(error: any, toolName: string): never {
  if (error.message) {
    throw new Error(`Failed to execute ${toolName}: ${error.message}`);
  }
  throw new Error(`Failed to execute ${toolName}: ${String(error)}`);
}

/**
 * Creates a success response in the standard format
 */
export function createSuccessResponse(text: string) {
  return {
    content: [{
      type: "text" as const,
      text
    }]
  };
}

/**
 * Formats a date for GitHub API consumption
 */
export function formatDateForGitHub(dateString?: string): string | undefined {
  if (!dateString) return undefined;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return date.toISOString();
  } catch (error) {
    console.error('Date formatting error:', error);
    return undefined;
  }
}

/**
 * Safely gets array of label names from GitHub labels
 */
export function getLabelNames(labels: any[]): string {
  return labels.map((l: any) => l.name).join(', ') || 'None';
}

/**
 * Safely gets array of assignee usernames from GitHub assignees
 */
export function getAssigneeNames(assignees: any[]): string {
  return assignees?.map((a: any) => a.login).join(', ') || 'None';
}
