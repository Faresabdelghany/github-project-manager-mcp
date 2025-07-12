import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface RemoveProjectItemArgs {
  project_id?: string;
  project_number?: number;
  item_id?: string;
  issue_number?: number;
  pr_number?: number;
  bulk_items?: Array<{
    item_id?: string;
    issue_number?: number;
    pr_number?: number;
  }>;
  removal_reason?: string;
  archive_instead?: boolean;
  confirm?: boolean;
}

/**
 * Remove items from GitHub Projects v2 safely
 * Uses GraphQL mutation deleteProjectV2Item
 */
export async function removeProjectItem(config: GitHubConfig, args: RemoveProjectItemArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner, repo, octokit } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  if (!args.confirm) {
    throw new Error('Confirmation required. Set confirm: true to proceed with item removal.');
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
    let totalRemoved = 0;

    // Get project items first to find items by issue/PR number
    const getProjectItemsQuery = `
      query($projectId: ID!, $first: Int!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
            items(first: $first) {
              nodes {
                id
                type
                content {
                  ... on Issue {
                    id
                    number
                    title
                    url
                  }
                  ... on PullRequest {
                    id
                    number
                    title
                    url
                  }
                  ... on DraftIssue {
                    id
                    title
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Get all project items to match issue/PR numbers to item IDs
    const projectItemsResult = await graphqlWithAuth(getProjectItemsQuery, {
      projectId,
      first: 100 // Adjust if needed
    });

    const projectItems = projectItemsResult.node?.items?.nodes || [];

    // Helper function to find item ID by issue/PR number
    const findItemId = (issueNumber?: number, prNumber?: number): string | null => {
      const item = projectItems.find((item: any) => {
        if (item.content?.number) {
          if (issueNumber && item.type === 'ISSUE' && item.content.number === issueNumber) {
            return true;
          }
          if (prNumber && item.type === 'PULL_REQUEST' && item.content.number === prNumber) {
            return true;
          }
        }
        return false;
      });
      return item?.id || null;
    };

    // Handle bulk items
    if (args.bulk_items && args.bulk_items.length > 0) {
      for (const item of args.bulk_items) {
        try {
          let itemId = item.item_id;

          // Find item ID by issue/PR number if not provided
          if (!itemId) {
            itemId = findItemId(item.issue_number, item.pr_number);
          }

          if (!itemId) {
            results.push({
              success: false,
              error: `Item not found in project (issue: ${item.issue_number}, PR: ${item.pr_number})`,
              original: item
            });
            continue;
          }

          // Get item details before deletion
          const itemDetailsQuery = `
            query($itemId: ID!) {
              node(id: $itemId) {
                ... on ProjectV2Item {
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
                    ... on DraftIssue {
                      id
                      title
                    }
                  }
                }
              }
            }
          `;

          const itemDetails = await graphqlWithAuth(itemDetailsQuery, { itemId });
          const itemInfo = itemDetails.node;

          if (args.archive_instead) {
            // Note: GitHub Projects v2 doesn't have a direct "archive" mutation
            // This would typically involve setting a custom field to "Archived" status
            results.push({
              success: false,
              error: "Archive functionality not yet implemented. Use deletion instead.",
              original: item,
              itemInfo
            });
          } else {
            // Delete the item
            const deleteItemMutation = `
              mutation($projectId: ID!, $itemId: ID!) {
                deleteProjectV2Item(input: {
                  projectId: $projectId
                  itemId: $itemId
                }) {
                  deletedItemId
                }
              }
            `;

            const deleteResult = await graphqlWithAuth(deleteItemMutation, {
              projectId,
              itemId
            });

            if (deleteResult.deleteProjectV2Item?.deletedItemId) {
              results.push({
                success: true,
                deletedItemId: deleteResult.deleteProjectV2Item.deletedItemId,
                itemInfo,
                original: item
              });
              totalRemoved++;

              // Add comment if removal reason provided and it's an issue/PR
              if (args.removal_reason && itemInfo?.content?.number && repo) {
                try {
                  const commentBody = `🗂️ **Removed from Project**\n\nThis ${itemInfo.type === 'ISSUE' ? 'issue' : 'pull request'} was removed from the project.\n\n**Reason:** ${args.removal_reason}`;
                  
                  if (itemInfo.type === 'ISSUE') {
                    await octokit.rest.issues.createComment({
                      owner,
                      repo,
                      issue_number: itemInfo.content.number,
                      body: commentBody
                    });
                  } else if (itemInfo.type === 'PULL_REQUEST') {
                    await octokit.rest.pulls.createReview({
                      owner,
                      repo,
                      pull_number: itemInfo.content.number,
                      body: commentBody,
                      event: 'COMMENT'
                    });
                  }
                } catch (commentError) {
                  // Comment creation failure shouldn't fail the main operation
                  console.error('Failed to add removal comment:', commentError);
                }
              }
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
      let itemId = args.item_id;

      // Find item ID by issue/PR number if not provided
      if (!itemId) {
        itemId = findItemId(args.issue_number, args.pr_number);
      }

      if (!itemId) {
        throw new Error(`Item not found in project (issue: ${args.issue_number}, PR: ${args.pr_number})`);
      }

      // Get item details before deletion
      const itemDetailsQuery = `
        query($itemId: ID!) {
          node(id: $itemId) {
            ... on ProjectV2Item {
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
                }
                ... on PullRequest {
                  number
                  title
                  url
                  state
                  isDraft
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

      const itemDetails = await graphqlWithAuth(itemDetailsQuery, { itemId });
      const itemInfo = itemDetails.node;

      if (args.archive_instead) {
        // Note: Archive functionality would need custom field management
        throw new Error("Archive functionality not yet implemented. Use deletion instead.");
      } else {
        // Delete the item
        const deleteItemMutation = `
          mutation($projectId: ID!, $itemId: ID!) {
            deleteProjectV2Item(input: {
              projectId: $projectId
              itemId: $itemId
            }) {
              deletedItemId
            }
          }
        `;

        const deleteResult = await graphqlWithAuth(deleteItemMutation, {
          projectId,
          itemId
        });

        if (deleteResult.deleteProjectV2Item?.deletedItemId) {
          results.push({
            success: true,
            deletedItemId: deleteResult.deleteProjectV2Item.deletedItemId,
            itemInfo
          });
          totalRemoved++;

          // Add comment if removal reason provided and it's an issue/PR
          if (args.removal_reason && itemInfo?.content?.number && repo) {
            try {
              const commentBody = `🗂️ **Removed from Project**\n\nThis ${itemInfo.type === 'ISSUE' ? 'issue' : 'pull request'} was removed from the project.\n\n**Reason:** ${args.removal_reason}`;
              
              if (itemInfo.type === 'ISSUE') {
                await octokit.rest.issues.createComment({
                  owner,
                  repo,
                  issue_number: itemInfo.content.number,
                  body: commentBody
                });
              } else if (itemInfo.type === 'PULL_REQUEST') {
                await octokit.rest.pulls.createReview({
                  owner,
                  repo,
                  pull_number: itemInfo.content.number,
                  body: commentBody,
                  event: 'COMMENT'
                });
              }
            } catch (commentError) {
              // Comment creation failure shouldn't fail the main operation
              console.error('Failed to add removal comment:', commentError);
            }
          }
        }
      }
    }

    // Format response
    let response = `🗑️ **Project Item(s) Removed Successfully!**\n\n`;
    response += `**Total Removed:** ${totalRemoved} item(s)\n`;
    response += `**Project ID:** ${projectId}\n`;
    
    if (args.removal_reason) {
      response += `**Removal Reason:** ${args.removal_reason}\n`;
    }
    
    response += `\n`;

    if (results.length > 0) {
      response += `## Removal Results\n\n`;
      
      results.forEach((result, index) => {
        if (result.success) {
          const itemInfo = result.itemInfo;
          
          response += `### ${index + 1}. ✅ **Successfully Removed**\n`;
          
          if (itemInfo?.content) {
            if (itemInfo.content.number) {
              // Issue or PR
              const type = itemInfo.type === 'ISSUE' ? 'Issue' : itemInfo.type === 'PULL_REQUEST' ? 'Pull Request' : 'Item';
              response += `   ${type} #${itemInfo.content.number}: ${itemInfo.content.title}\n`;
              response += `   🔗 ${itemInfo.content.url}\n`;
              
              if (itemInfo.content.state) {
                const stateEmoji = itemInfo.content.state === 'OPEN' ? '🟢' : itemInfo.content.state === 'CLOSED' ? '🔴' : '🟡';
                response += `   ${stateEmoji} Status: ${itemInfo.content.state}\n`;
              }
            } else if (itemInfo.content.title) {
              // Draft item
              response += `   Draft: ${itemInfo.content.title}\n`;
            }
          }
          
          response += `   🆔 Deleted Item ID: ${result.deletedItemId}\n\n`;
        } else {
          response += `### ${index + 1}. ❌ **Failed to Remove**\n`;
          response += `   Error: ${result.error}\n`;
          if (result.original) {
            response += `   Original: ${JSON.stringify(result.original)}\n`;
          }
          response += `\n`;
        }
      });
    }

    if (totalRemoved > 0) {
      response += `💡 **Note:** Items have been permanently removed from the project but remain in the repository.\n\n`;
      response += `🎯 **Next Steps:**\n`;
      response += `• Use 'list_project_items' to verify removal\n`;
      response += `• Use 'add_project_item' to add items back if needed\n`;
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
      throw new Error('Insufficient permissions to remove items from project. Ensure your GitHub token has "project" scope and write access to the project.');
    }
    if (error.message?.includes('not found')) {
      throw new Error(`Project or item not found: ${error.message}`);
    }
    throw new Error(`Failed to remove project item: ${error.message}`);
  }
}
