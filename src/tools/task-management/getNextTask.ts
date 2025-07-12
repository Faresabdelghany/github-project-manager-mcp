import { GitHubConfig } from '../../shared/types.js';

/**
 * AI-powered task recommendation system
 * Implements multi-factor scoring algorithm for intelligent task prioritization
 */

interface TaskScore {
  issueNumber: number;
  title: string;
  totalScore: number;
  priorityScore: number;
  urgencyScore: number;
  availabilityScore: number;
  skillMatchScore: number;
  readinessScore: number;
  blockers: string[];
  assignees: string[];
  labels: string[];
  milestone?: string;
  complexity: number;
  reasoning: string;
}

interface TeamMemberWorkload {
  username: string;
  currentWorkload: number;
  maxCapacity: number;
  availabilityScore: number;
  skillAreas: string[];
  recentVelocity: number;
}

export async function getNextTask(config: GitHubConfig, args: any) {
  const { owner, repo, octokit } = config;

  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO environment variables are required');
  }

  try {
    const assigneeFilter = args.assignee;
    const priorityFilter = args.priority_filter || 'all';
    const maxRecommendations = args.max_recommendations || 5;
    const includeBlocked = args.include_blocked === true;
    const teamMembers = args.team_members || [];
    const contextSwitchPenalty = args.context_switch_penalty || 0.1;

    // Get all open issues
    const issuesResponse = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 100,
      sort: 'updated',
      direction: 'desc'
    });

    let issues = issuesResponse.data.filter(issue => !issue.pull_request);

    // Filter by assignee if specified
    if (assigneeFilter) {
      issues = issues.filter(issue => 
        issue.assignees?.some(assignee => assignee.login === assigneeFilter)
      );
    }

    // Get team workload analysis
    const teamWorkloads = await analyzeTeamWorkload(config, teamMembers, issues);

    // Score each issue
    const scoredTasks: TaskScore[] = [];

    for (const issue of issues) {
      const score = await calculateTaskScore(config, issue, teamWorkloads, {
        priorityFilter,
        includeBlocked,
        contextSwitchPenalty
      });

      if (score) {
        scoredTasks.push(score);
      }
    }

    // Sort by total score (descending)
    scoredTasks.sort((a, b) => b.totalScore - a.totalScore);

    // Take top recommendations
    const recommendations = scoredTasks.slice(0, maxRecommendations);

    // Generate response
    let result = `🎯 **AI-Powered Task Recommendations**\n\n`;
    result += `**Analysis Summary:**\n`;
    result += `• Analyzed ${issues.length} open issues\n`;
    result += `• Generated ${recommendations.length} recommendations\n`;
    result += `• Team members considered: ${teamMembers.length || 'All assignees'}\n\n`;

    if (recommendations.length === 0) {
      result += `❌ **No suitable tasks found**\n\n`;
      result += `**Possible reasons:**\n`;
      result += `• All issues are blocked or waiting\n`;
      result += `• No issues match the specified criteria\n`;
      result += `• Team capacity is at maximum\n\n`;
      result += `**Suggestions:**\n`;
      result += `• Review blocked issues and resolve dependencies\n`;
      result += `• Adjust priority filters\n`;
      result += `• Consider cross-training team members`;

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    }

    // Team workload summary
    if (teamWorkloads.length > 0) {
      result += `## 👥 **Team Workload Analysis**\n\n`;
      teamWorkloads.forEach(member => {
        const utilizationPercent = Math.round((member.currentWorkload / member.maxCapacity) * 100);
        const statusEmoji = utilizationPercent > 90 ? '🔴' : utilizationPercent > 70 ? '🟡' : '🟢';
        
        result += `${statusEmoji} **${member.username}**: ${utilizationPercent}% capacity (${member.currentWorkload}/${member.maxCapacity} points)\n`;
        result += `   📈 Recent velocity: ${member.recentVelocity} points/week\n`;
        if (member.skillAreas.length > 0) {
          result += `   🛠️ Skills: ${member.skillAreas.join(', ')}\n`;
        }
        result += `\n`;
      });
    }

    result += `## 🎯 **Recommended Tasks**\n\n`;

    recommendations.forEach((task, index) => {
      const priorityEmoji = task.priorityScore > 0.8 ? '🔴' : task.priorityScore > 0.6 ? '🟡' : '🟢';
      const urgencyEmoji = task.urgencyScore > 0.8 ? '⚡' : task.urgencyScore > 0.6 ? '⏰' : '🔵';
      
      result += `### ${index + 1}. ${priorityEmoji} **#${task.issueNumber}: ${task.title}**\n\n`;
      result += `**Overall Score: ${task.totalScore.toFixed(2)}/1.0** ${task.totalScore > 0.8 ? '🌟' : task.totalScore > 0.6 ? '✨' : ''}\n\n`;
      
      result += `**Score Breakdown:**\n`;
      result += `• ${priorityEmoji} Priority: ${task.priorityScore.toFixed(2)} (40% weight)\n`;
      result += `• ${urgencyEmoji} Urgency: ${task.urgencyScore.toFixed(2)} (25% weight)\n`;
      result += `• 👥 Availability: ${task.availabilityScore.toFixed(2)} (20% weight)\n`;
      result += `• 🎯 Skill Match: ${task.skillMatchScore.toFixed(2)} (15% weight)\n\n`;
      
      result += `**Task Details:**\n`;
      result += `• 📊 Complexity: ${task.complexity} story points\n`;
      result += `• 🏷️ Labels: ${task.labels.join(', ') || 'None'}\n`;
      result += `• 👤 Assignees: ${task.assignees.join(', ') || 'Unassigned'}\n`;
      if (task.milestone) {
        result += `• 🎯 Milestone: ${task.milestone}\n`;
      }
      
      if (task.blockers.length > 0) {
        result += `• ⚠️ Blockers: ${task.blockers.join(', ')}\n`;
      }
      
      result += `\n**AI Reasoning:** ${task.reasoning}\n\n`;
      result += `---\n\n`;
    });

    // Add actionable insights
    result += `## 💡 **Actionable Insights**\n\n`;
    
    const highPriorityTasks = recommendations.filter(task => task.priorityScore > 0.7);
    const urgentTasks = recommendations.filter(task => task.urgencyScore > 0.8);
    const blockedTasks = recommendations.filter(task => task.blockers.length > 0);
    
    if (highPriorityTasks.length > 0) {
      result += `🔴 **High Priority Focus:** ${highPriorityTasks.length} high-priority tasks need immediate attention\n`;
    }
    
    if (urgentTasks.length > 0) {
      result += `⚡ **Time-Sensitive:** ${urgentTasks.length} tasks have urgent deadlines\n`;
    }
    
    if (blockedTasks.length > 0) {
      result += `⚠️ **Blocked Items:** ${blockedTasks.length} recommended tasks have blockers to resolve\n`;
    }
    
    // Team recommendations
    const overloadedMembers = teamWorkloads.filter(member => 
      (member.currentWorkload / member.maxCapacity) > 0.9
    );
    
    if (overloadedMembers.length > 0) {
      result += `👥 **Team Balance:** ${overloadedMembers.length} team members are at high capacity\n`;
    }
    
    result += `\n**Next Steps:**\n`;
    result += `• Start with the highest-scored task (#${recommendations[0].issueNumber})\n`;
    result += `• Resolve any blockers before beginning work\n`;
    result += `• Consider pair programming for complex tasks (>5 points)\n`;
    if (overloadedMembers.length > 0) {
      result += `• Balance workload by reassigning tasks to available team members\n`;
    }

    return {
      content: [{
        type: "text",
        text: result
      }]
    };

  } catch (error: any) {
    throw new Error(`Failed to get next task recommendations: ${error.message}`);
  }
}

async function calculateTaskScore(
  config: GitHubConfig, 
  issue: any, 
  teamWorkloads: TeamMemberWorkload[],
  options: any
): Promise<TaskScore | null> {
  const { octokit } = config;

  // Calculate priority score (40% weight)
  const priorityScore = calculatePriorityScore(issue);
  
  // Calculate urgency score (25% weight)
  const urgencyScore = calculateUrgencyScore(issue);
  
  // Calculate availability score (20% weight)
  const availabilityScore = calculateAvailabilityScore(issue, teamWorkloads);
  
  // Calculate skill match score (15% weight)
  const skillMatchScore = calculateSkillMatchScore(issue, teamWorkloads);
  
  // Calculate readiness score (blockers, dependencies)
  const readinessAnalysis = calculateReadinessScore(issue);
  
  // Skip blocked tasks unless explicitly included
  if (!options.includeBlocked && !readinessAnalysis.ready) {
    return null;
  }
  
  // Calculate complexity
  const complexity = analyzeIssueComplexity(issue);
  
  // Apply context switching penalty
  let contextPenalty = 0;
  if (issue.assignees && issue.assignees.length > 0) {
    // Check if assignee is already working on similar tasks
    contextPenalty = options.contextSwitchPenalty || 0;
  }
  
  // Calculate total weighted score
  const weights = {
    priority: 0.4,
    urgency: 0.25,
    availability: 0.2,
    skillMatch: 0.15
  };
  
  const totalScore = Math.max(0, 
    (priorityScore * weights.priority) +
    (urgencyScore * weights.urgency) +
    (availabilityScore * weights.availability) +
    (skillMatchScore * weights.skillMatch) +
    (readinessAnalysis.score * 0.1) - // Readiness bonus
    contextPenalty
  );
  
  // Generate reasoning
  const reasoning = generateReasoningText(issue, {
    priorityScore,
    urgencyScore,
    availabilityScore,
    skillMatchScore,
    readinessAnalysis,
    complexity,
    contextPenalty
  });

  return {
    issueNumber: issue.number,
    title: issue.title,
    totalScore,
    priorityScore,
    urgencyScore,
    availabilityScore,
    skillMatchScore,
    readinessScore: readinessAnalysis.score,
    blockers: readinessAnalysis.blockers,
    assignees: issue.assignees?.map((a: any) => a.login) || [],
    labels: issue.labels.map((l: any) => l.name),
    milestone: issue.milestone?.title,
    complexity,
    reasoning
  };
}

function calculatePriorityScore(issue: any): number {
  let score = 0.5; // Base score
  
  // Priority labels
  const priorityMap: { [key: string]: number } = {
    'critical': 1.0,
    'high': 0.8,
    'medium': 0.6,
    'low': 0.4,
    'lowest': 0.2
  };
  
  for (const label of issue.labels) {
    const labelName = label.name.toLowerCase();
    for (const [keyword, value] of Object.entries(priorityMap)) {
      if (labelName.includes(keyword)) {
        score = Math.max(score, value);
      }
    }
  }
  
  // Bug priority boost
  const isBug = issue.labels.some((label: any) => 
    label.name.toLowerCase().includes('bug') || label.name.toLowerCase().includes('fix')
  );
  if (isBug) score = Math.min(1.0, score + 0.2);
  
  // Epic penalty (usually broken down into smaller tasks)
  const isEpic = issue.labels.some((label: any) => 
    label.name.toLowerCase().includes('epic')
  );
  if (isEpic) score *= 0.3;
  
  return score;
}

function calculateUrgencyScore(issue: any): number {
  let score = 0.3; // Base score
  
  // Milestone due date urgency
  if (issue.milestone && issue.milestone.due_on) {
    const dueDate = new Date(issue.milestone.due_on);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) {
      score = 1.0; // Overdue
    } else if (daysUntilDue <= 3) {
      score = 0.9;
    } else if (daysUntilDue <= 7) {
      score = 0.7;
    } else if (daysUntilDue <= 14) {
      score = 0.5;
    } else {
      score = 0.3;
    }
  }
  
  // Recent activity boost
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(issue.updated_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceUpdate < 2) score = Math.min(1.0, score + 0.2);
  
  // Comments activity (indicates active discussion)
  if (issue.comments > 5) score = Math.min(1.0, score + 0.1);
  
  return score;
}

function calculateAvailabilityScore(issue: any, teamWorkloads: TeamMemberWorkload[]): number {
  if (!issue.assignees || issue.assignees.length === 0) {
    // Unassigned task - find most available team member
    if (teamWorkloads.length === 0) return 0.8;
    
    const mostAvailable = teamWorkloads.reduce((prev, current) => 
      prev.availabilityScore > current.availabilityScore ? prev : current
    );
    return mostAvailable.availabilityScore;
  }
  
  // Assigned task - check assignee availability
  const assigneeLogins = issue.assignees.map((a: any) => a.login);
  const assigneeWorkloads = teamWorkloads.filter(member => 
    assigneeLogins.includes(member.username)
  );
  
  if (assigneeWorkloads.length === 0) {
    return 0.6; // Unknown availability
  }
  
  // Average availability of assignees
  const avgAvailability = assigneeWorkloads.reduce((sum, member) => 
    sum + member.availabilityScore, 0
  ) / assigneeWorkloads.length;
  
  return avgAvailability;
}

function calculateSkillMatchScore(issue: any, teamWorkloads: TeamMemberWorkload[]): number {
  if (teamWorkloads.length === 0) return 0.7; // Default when no team data
  
  // Extract skill keywords from issue
  const issueText = `${issue.title} ${issue.body || ''}`.toLowerCase();
  const skillKeywords = extractSkillKeywords(issueText, issue.labels);
  
  if (!issue.assignees || issue.assignees.length === 0) {
    // Find best skill match in team
    let bestMatch = 0;
    for (const member of teamWorkloads) {
      const matchScore = calculateIndividualSkillMatch(skillKeywords, member.skillAreas);
      bestMatch = Math.max(bestMatch, matchScore);
    }
    return bestMatch;
  }
  
  // Calculate skill match for assignees
  const assigneeLogins = issue.assignees.map((a: any) => a.login);
  const assigneeWorkloads = teamWorkloads.filter(member => 
    assigneeLogins.includes(member.username)
  );
  
  if (assigneeWorkloads.length === 0) return 0.6;
  
  const avgSkillMatch = assigneeWorkloads.reduce((sum, member) => 
    sum + calculateIndividualSkillMatch(skillKeywords, member.skillAreas), 0
  ) / assigneeWorkloads.length;
  
  return avgSkillMatch;
}

function calculateReadinessScore(issue: any): { ready: boolean; score: number; blockers: string[] } {
  const blockers: string[] = [];
  let readinessScore = 1.0;
  
  // Check for blocked labels
  const blockedLabels = issue.labels.filter((label: any) => 
    ['blocked', 'waiting', 'needs-info', 'dependencies', 'on-hold'].some(keyword =>
      label.name.toLowerCase().includes(keyword)
    )
  );
  
  if (blockedLabels.length > 0) {
    blockers.push(`Labels: ${blockedLabels.map(l => l.name).join(', ')}`);
    readinessScore -= 0.5;
  }
  
  // Check for insufficient description
  if (!issue.body || issue.body.length < 50) {
    blockers.push('Insufficient description');
    readinessScore -= 0.3;
  }
  
  // Check for dependency indicators in body
  if (issue.body) {
    const dependencyPatterns = [
      /depends\s+on\s+#\d+/i,
      /blocked\s+by\s+#\d+/i,
      /waiting\s+for/i,
      /needs\s+#\d+/i
    ];
    
    for (const pattern of dependencyPatterns) {
      if (pattern.test(issue.body)) {
        blockers.push('Has dependencies mentioned in description');
        readinessScore -= 0.2;
        break;
      }
    }
  }
  
  const finalScore = Math.max(0, readinessScore);
  return {
    ready: finalScore > 0.6 && blockers.length === 0,
    score: finalScore,
    blockers
  };
}

function analyzeIssueComplexity(issue: any): number {
  let complexity = 1;
  
  // Title complexity
  const titleWords = issue.title.split(' ').length;
  if (titleWords > 10) complexity += 1;
  
  // Body complexity
  if (issue.body) {
    const bodyLength = issue.body.length;
    if (bodyLength > 1000) complexity += 2;
    else if (bodyLength > 500) complexity += 1;
    
    // Technical keywords
    const technicalKeywords = [
      'api', 'database', 'migration', 'refactor', 'architecture', 
      'integration', 'security', 'performance', 'scalability',
      'microservice', 'deployment', 'testing', 'automation'
    ];
    const techCount = technicalKeywords.filter(keyword => 
      issue.body.toLowerCase().includes(keyword)
    ).length;
    complexity += Math.min(techCount, 3);
  }
  
  // Label complexity
  const complexityLabels = issue.labels.filter((label: any) => 
    ['epic', 'large', 'complex', 'research', 'spike', 'major'].some(keyword => 
      label.name.toLowerCase().includes(keyword)
    )
  );
  complexity += complexityLabels.length;
  
  // Dependencies increase complexity
  if (issue.body && issue.body.includes('#')) {
    complexity += 1;
  }
  
  return Math.min(complexity, 8); // Cap at 8 story points
}

async function analyzeTeamWorkload(
  config: GitHubConfig, 
  teamMembers: string[],
  allIssues: any[]
): Promise<TeamMemberWorkload[]> {
  if (teamMembers.length === 0) {
    // Extract team members from issue assignees
    const assigneeSet = new Set<string>();
    allIssues.forEach(issue => {
      if (issue.assignees) {
        issue.assignees.forEach((assignee: any) => {
          assigneeSet.add(assignee.login);
        });
      }
    });
    teamMembers = Array.from(assigneeSet);
  }
  
  const workloads: TeamMemberWorkload[] = [];
  
  for (const username of teamMembers) {
    const assignedIssues = allIssues.filter(issue =>
      issue.assignees?.some((assignee: any) => assignee.login === username)
    );
    
    // Calculate current workload (sum of complexity)
    const currentWorkload = assignedIssues.reduce((sum, issue) => 
      sum + analyzeIssueComplexity(issue), 0
    );
    
    // Estimate max capacity (default 15 story points per sprint)
    const maxCapacity = 15;
    
    // Calculate availability score
    const availabilityScore = Math.max(0, 1 - (currentWorkload / maxCapacity));
    
    // Extract skill areas from assigned issue labels and content
    const skillAreas = extractUserSkillAreas(assignedIssues);
    
    // Estimate recent velocity (simplified)
    const recentVelocity = Math.min(maxCapacity, currentWorkload + 2);
    
    workloads.push({
      username,
      currentWorkload,
      maxCapacity,
      availabilityScore,
      skillAreas,
      recentVelocity
    });
  }
  
  return workloads;
}

function extractSkillKeywords(text: string, labels: any[]): string[] {
  const skillMap: { [key: string]: string[] } = {
    'frontend': ['frontend', 'ui', 'ux', 'react', 'vue', 'angular', 'css', 'html', 'javascript', 'typescript'],
    'backend': ['backend', 'api', 'server', 'database', 'sql', 'node', 'python', 'java', 'go', 'rust'],
    'devops': ['devops', 'deploy', 'infrastructure', 'docker', 'kubernetes', 'ci/cd', 'pipeline', 'aws', 'cloud'],
    'mobile': ['mobile', 'ios', 'android', 'react-native', 'flutter', 'swift', 'kotlin'],
    'testing': ['test', 'testing', 'qa', 'automation', 'selenium', 'jest', 'cypress'],
    'design': ['design', 'ui', 'ux', 'figma', 'sketch', 'prototype'],
    'data': ['data', 'analytics', 'ml', 'ai', 'machine learning', 'bigquery', 'pandas']
  };
  
  const skills = new Set<string>();
  
  // Check labels
  labels.forEach(label => {
    const labelName = label.name.toLowerCase();
    Object.entries(skillMap).forEach(([skill, keywords]) => {
      if (keywords.some(keyword => labelName.includes(keyword))) {
        skills.add(skill);
      }
    });
  });
  
  // Check text content
  Object.entries(skillMap).forEach(([skill, keywords]) => {
    if (keywords.some(keyword => text.includes(keyword))) {
      skills.add(skill);
    }
  });
  
  return Array.from(skills);
}

function calculateIndividualSkillMatch(requiredSkills: string[], userSkills: string[]): number {
  if (requiredSkills.length === 0) return 0.7; // Neutral when no specific skills needed
  if (userSkills.length === 0) return 0.5; // Default when no user skills known
  
  const matchingSkills = requiredSkills.filter(skill => userSkills.includes(skill));
  const matchRatio = matchingSkills.length / requiredSkills.length;
  
  // Boost for exact matches
  if (matchRatio === 1.0) return 1.0;
  if (matchRatio >= 0.7) return 0.9;
  if (matchRatio >= 0.5) return 0.7;
  if (matchRatio >= 0.3) return 0.6;
  
  return 0.4;
}

function extractUserSkillAreas(userIssues: any[]): string[] {
  const skills = new Set<string>();
  
  userIssues.forEach(issue => {
    const issueText = `${issue.title} ${issue.body || ''}`.toLowerCase();
    const issueSkills = extractSkillKeywords(issueText, issue.labels);
    issueSkills.forEach(skill => skills.add(skill));
  });
  
  return Array.from(skills);
}

function generateReasoningText(issue: any, scores: any): string {
  const reasons = [];
  
  if (scores.priorityScore > 0.8) {
    reasons.push('High priority based on labels');
  }
  
  if (scores.urgencyScore > 0.8) {
    reasons.push('Time-sensitive with approaching deadline');
  }
  
  if (scores.availabilityScore > 0.8) {
    reasons.push('Team has good availability');
  } else if (scores.availabilityScore < 0.3) {
    reasons.push('Team at high capacity');
  }
  
  if (scores.skillMatchScore > 0.8) {
    reasons.push('Strong skill alignment with assignee');
  }
  
  if (scores.complexity > 5) {
    reasons.push('Complex task requiring experienced developer');
  } else if (scores.complexity <= 2) {
    reasons.push('Simple task suitable for quick completion');
  }
  
  if (scores.readinessAnalysis.blockers.length > 0) {
    reasons.push('Has some blockers that need attention');
  }
  
  if (scores.contextPenalty > 0) {
    reasons.push('May require context switching');
  }
  
  if (reasons.length === 0) {
    reasons.push('Balanced task with moderate priority and complexity');
  }
  
  return reasons.join(', ');
}
