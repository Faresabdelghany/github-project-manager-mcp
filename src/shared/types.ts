import { Octokit } from '@octokit/rest';

export interface GitHubConfig {
  owner: string;
  repo: string;
  octokit: Octokit;
  graphqlWithAuth: any;
}

export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export interface SprintMetadata {
  type: 'sprint';
  sprintNumber: number;
  goals: string[];
  duration: number;
  startDate: string;
  endDate: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueAnalysis {
  complexity: number;
  priority: number;
  readiness: {
    ready: boolean;
    score: number;
    blockers: string[];
  };
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: string;
  labels: Array<{ name: string; color: string; description?: string }>;
  assignees?: Array<{ login: string }>;
  milestone?: { number: number; title: string };
  created_at: string;
  updated_at: string;
  html_url: string;
  comments: number;
  user?: { login: string };
}

export interface GitHubMilestone {
  number: number;
  title: string;
  description?: string;
  state: string;
  open_issues: number;
  closed_issues: number;
  due_on?: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubLabel {
  name: string;
  color: string;
  description?: string;
}