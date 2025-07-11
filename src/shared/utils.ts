import { GitHubConfig, ToolResponse, GitHubIssue, SprintMetadata } from './types.js';

export class GitHubUtils {
  static validateRepoConfig(config: GitHubConfig): void {
    if (!config.owner || !config.repo) {
      throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
    }
  }

  static formatDateForGitHub(dateString?: string): string | undefined {
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

  static createSprintDescription(metadata: SprintMetadata): string {
    const sprintData = {
      ...metadata,
      updatedAt: new Date().toISOString()
    };

    return `<!-- SPRINT_METADATA:${JSON.stringify(sprintData)} -->\n\n${metadata.description || ''}`;
  }

  static parseSprintDescription(description: string): SprintMetadata | null {
    if (!description) return null;
    
    const match = description.match(/<!-- SPRINT_METADATA:(.*?) -->/);
    if (!match) return null;

    try {
      return JSON.parse(match[1]);
    } catch (error) {
      return null;
    }
  }

  static analyzeIssueComplexity(issue: GitHubIssue): number {
    let complexity = 1;
    
    // Analyze title complexity
    const titleWords = issue.title.split(' ').length;
    if (titleWords > 10) complexity += 1;
    
    // Analyze body complexity
    if (issue.body) {
      const bodyLength = issue.body.length;
      if (bodyLength > 1000) complexity += 2;
      else if (bodyLength > 500) complexity += 1;
      
      // Check for technical keywords
      const technicalKeywords = ['API', 'database', 'migration', 'refactor', 'architecture', 'integration', 'security'];
      const techCount = technicalKeywords.filter(keyword => 
        issue.body!.toLowerCase().includes(keyword.toLowerCase())
      ).length;
      complexity += Math.min(techCount, 3);
    }
    
    // Analyze labels for complexity indicators
    const complexityLabels = issue.labels.filter(label => 
      ['epic', 'large', 'complex', 'research', 'spike'].some(keyword => 
        label.name.toLowerCase().includes(keyword)
      )
    );
    complexity += complexityLabels.length;
    
    // Check for dependencies or linked issues
    if (issue.body && issue.body.includes('#')) {
      complexity += 1;
    }
    
    return Math.min(complexity, 8); // Cap at 8 story points
  }

  static calculateIssuePriority(issue: GitHubIssue): number {
    let priority = 1;
    
    // Priority labels
    const priorityMap = {
      'critical': 5,
      'high': 4,
      'medium': 3,
      'low': 2,
      'lowest': 1
    };
    
    for (const label of issue.labels) {
      const labelName = label.name.toLowerCase();
      for (const [key, value] of Object.entries(priorityMap)) {
        if (labelName.includes(key)) {
          priority = Math.max(priority, value);
        }
      }
    }
    
    // Bug priority boost
    const isBug = issue.labels.some(label => 
      label.name.toLowerCase().includes('bug')
    );
    if (isBug) priority += 1;
    
    // Recent activity boost
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUpdate < 7) priority += 0.5;
    
    return Math.min(priority, 5);
  }

  static createSuccessResponse(text: string): ToolResponse {
    return {
      content: [{
        type: "text",
        text
      }]
    };
  }

  static createErrorResponse(error: Error): ToolResponse {
    return {
      content: [{
        type: "text",
        text: `❌ Error: ${error.message}`
      }]
    };
  }
}
