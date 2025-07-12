import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface AddProjectItemArgs {
  project_id?: string;
  project_number?: number;
  content_id?: string;
  content_type?: 'issue' | 'pull_request' | 'draft';
  issue_number?: number;
  pr_number?: number;
  draft_title?: string;
  draft_body?: string;
  bulk_items?: Array<{
    content_id?: string;
    issue_number?: number;
    pr_number?: number;
    type?: 'issue' | 'pull_request';
  }>;
}

/**
 * Add issues, pull requests, or draft items to GitHub Projects v2
 * Uses GraphQL mutations addProjectV2ItemById and addProjectV2DraftIssue
 */
export async function addProjectItem(config: GitHubConfig, args: AddProjectItemArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner, repo, octokit } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    let projectId = args.project_id;

    // If project_number is provided, get the project ID
    if (!projectId && args.project_number) {
      const projectQuery = `
        query($owner: String!, $number: Int!) {
          user(login: $owner) {
            projectV2(number: $number) {
              id
              title
            }
          }
          organization(login: $owner) {
            projectV2(number: $number) {
              id
              title
            }
          }
        }
      `;

      const projectResult = await graphqlWithAuth(projectQuery, {
        owner,
        number: args.project_number
      });

      const project = projectResult.user?.projectV2 || projectResult.organization?.projectV2;
      if (!project) {
        throw new Error(`Project #${args.project_number} not found`);
      }
      
      projectId = project.id;
    }

    if (!projectId) {
      throw new Error('Either project_id or project_number must be provided');
    }

    const results: any[] = [];
    let totalAdded = 0;

    // Handle bulk items
    if (args.bulk_items && args.bulk_items.length > 0) {
      for (const item of args.bulk_items) {
        try {
          let contentId = item.content_id;

          // Get content ID from issue/PR number if needed
          if (!contentId && item.issue_number) {
            const issueData = await octokit.rest.issues.get({
              owner,
              repo,
              issue_number: item.issue_number
            });
            contentId = issueData.data.node_id;
          } else if (!contentId && item.pr_number) {
            const prData = await octokit.rest.pulls.get({
              owner,
              repo,
              pull_number: item.pr_number
            });
            contentId = prData.data.node_id;
          }

          if (contentId) {
            const addItemMutation = `
              mutation($projectId: ID!, $contentId: ID!) {
                addProjectV2ItemById(input: {
                  projectId: $projectId
                  contentId: $contentId
                }) {
                  item {
                    id
                    type
                    content {
                      ... on Issue {
                        number
                        title
                        url
                      }
                      ... on PullRequest {
                        number
                        title
                        url
                      }
                    }
                  }
                }
              }
            `;

            const result = await graphqlWithAuth(addItemMutation, {
              projectId,
              contentId
            });

            if (result.addProjectV2ItemById?.item) {
              results.push({
                success: true,
                item: result.addProjectV2ItemById.item,
                original: item
              });
              totalAdded++;
            }
          }
        } catch (error: any) {
          results.push({
            success: false,
            error: error.message,
            original: item
          });
        }
      }
    } else {
      // Handle single item
      let contentId = args.content_id;

      // Create draft item
      if (args.content_type === 'draft' && args.draft_title) {
        const draftMutation = `
          mutation($projectId: ID!, $title: String!, $body: String) {
            addProjectV2DraftIssue(input: {
              projectId: $projectId
              title: $title
              body: $body
            }) {
              projectItem {
                id
                type
                content {
                  ... on DraftIssue {
                    id
                    title
                    body
                  }
                }
              }
            }
          }
        `;

        const result = await graphqlWithAuth(draftMutation, {
          projectId,
          title: args.draft_title,
          body: args.draft_body || ""
        });

        if (result.addProjectV2DraftIssue?.projectItem) {
          results.push({
            success: true,
            item: result.addProjectV2DraftIssue.projectItem,
            type: 'draft'
          });
          totalAdded++;
        }
      } else {
        // Get content ID from issue/PR number if needed
        if (!contentId && args.issue_number && repo) {
          const issueData = await octokit.rest.issues.get({
            owner,
            repo,
            issue_number: args.issue_number
          });
          contentId = issueData.data.node_id;
        } else if (!contentId && args.pr_number && repo) {
          const prData = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: args.pr_number
          });
          contentId = prData.data.node_id;
        }

        if (!contentId) {
          throw new Error('content_id, issue_number, or pr_number must be provided for non-draft items');
        }

        const addItemMutation = `
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {
              projectId: $projectId
              contentId: $contentId
            }) {
              item {
                id
                type
                content {
                  ... on Issue {
                    number
                    title
                    url
                    state
                    labels(first: 10) {
                      nodes {
                        name
                        color
                      }
                    }
                    assignees(first: 5) {
                      nodes {
                        login
                      }
                    }
                  }
                  ... on PullRequest {
                    number
                    title
                    url
                    state
                    isDraft
                    labels(first: 10) {
                      nodes {
                        name
                        color
                      }
                    }
                    assignees(first: 5) {
                      nodes {
                        login
                      }
                    }
                  }
                  ... on DraftIssue {
                    id
                    title
                    body
                  }
                }
              }
            }
          }
        `;

        const result = await graphqlWithAuth(addItemMutation, {
          projectId,
          contentId
        });

        if (result.addProjectV2ItemById?.item) {
          results.push({
            success: true,
            item: result.addProjectV2ItemById.item
          });
          totalAdded++;
        }
      }
    }

    // Format response
    let response = `📦 **Project Item(s) Added Successfully!**\n\n`;
    response += `**Total Added:** ${totalAdded} item(s)\n`;
    response += `**Project ID:** ${projectId}\n\n`;

    if (results.length > 0) {
      response += `## Added Items\n\n`;
      
      results.forEach((result, index) => {
        if (result.success && result.item) {
          const item = result.item;
          const content = item.content;
          
          response += `### ${index + 1}. `;
          
          if (content) {
            if (content.number) {
              // Issue or PR
              const type = item.type === 'ISSUE' ? 'Issue' : item.type === 'PULL_REQUEST' ? 'Pull Request' : 'Item';
              response += `**${type} #${content.number}: ${content.title}**\n`;
              response += `   🔗 ${content.url}\n`;
              
              if (content.state) {
                const stateEmoji = content.state === 'OPEN' ? '🟢' : content.state === 'CLOSED' ? '🔴' : '🟡';
                response += `   ${stateEmoji} Status: ${content.state}\n`;
              }
              
              if (content.labels?.nodes && content.labels.nodes.length > 0) {
                const labels = content.labels.nodes.map((label: any) => label.name).join(', ');
                response += `   🏷️ Labels: ${labels}\n`;
              }
              
              if (content.assignees?.nodes && content.assignees.nodes.length > 0) {
                const assignees = content.assignees.nodes.map((assignee: any) => assignee.login).join(', ');
                response += `   👤 Assignees: ${assignees}\n`;
              }
            } else if (content.title) {
              // Draft item
              response += `**Draft: ${content.title}**\n`;
              if (content.body) {
                const shortBody = content.body.length > 100 ? content.body.substring(0, 100) + '...' : content.body;
                response += `   📝 ${shortBody}\n`;
              }
            }
          }
          
          response += `   🆔 Item ID: ${item.id}\n\n`;
        } else if (!result.success) {
          response += `### ${index + 1}. ❌ **Failed to add item**\n`;
          response += `   Error: ${result.error}\n`;
          if (result.original) {
            response += `   Original: ${JSON.stringify(result.original)}\n`;
          }
          response += `\n`;
        }
      });
    }

    if (totalAdded > 0) {
      response += `🎯 **Next Steps:**\n`;
      response += `• Use 'set_field_value' to set custom field values\n`;
      response += `• Use 'list_project_items' to view all project items\n`;
      response += `• Use 'get_project' to see the updated project`;
    }

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to add items to project. Ensure your GitHub token has "project" scope and write access to the project.');
    }
    if (error.message?.includes('not found')) {
      throw new Error(`Project or content not found: ${error.message}`);
    }
    throw new Error(`Failed to add project item: ${error.message}`);
  }
}
