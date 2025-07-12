import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface ListProjectItemsArgs {
  project_id?: string;
  project_number?: number;
  item_type?: 'issue' | 'pull_request' | 'draft' | 'all';
  state?: 'open' | 'closed' | 'all';
  search_title?: string;
  assignee?: string;
  labels?: string[];
  sort_by?: 'created' | 'updated' | 'title' | 'number';
  order?: 'asc' | 'desc';
  first?: number;
  include_field_values?: boolean;
  detailed_view?: boolean;
}

/**
 * List all items in a GitHub Projects v2 with advanced filtering
 * Uses GraphQL query projectV2.items
 */
export async function listProjectItems(config: GitHubConfig, args: ListProjectItemsArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    let projectId = args.project_id;
    let projectInfo: any = null;

    // If project_number is provided, get the project ID
    if (!projectId && args.project_number) {
      const projectQuery = `
        query($owner: String!, $number: Int!) {
          user(login: $owner) {
            projectV2(number: $number) {
              id
              title
              number
              url
            }
          }
          organization(login: $owner) {
            projectV2(number: $number) {
              id
              title
              number
              url
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
      projectInfo = project;
    }

    if (!projectId) {
      throw new Error('Either project_id or project_number must be provided');
    }

    const first = args.first || 100;
    const includeFields = args.include_field_values !== false;
    const detailedView = args.detailed_view === true;

    // Build comprehensive query
    const listItemsQuery = `
      query($projectId: ID!, $first: Int!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
            number
            url
            items(first: $first) {
              totalCount
              nodes {
                id
                type
                createdAt
                updatedAt
                content {
                  ... on Issue {
                    id
                    number
                    title
                    body
                    url
                    state
                    createdAt
                    updatedAt
                    author {
                      login
                    }
                    labels(first: 20) {
                      nodes {
                        name
                        color
                        description
                      }
                    }
                    assignees(first: 10) {
                      nodes {
                        login
                        name
                      }
                    }
                    milestone {
                      title
                      number
                    }
                    comments {
                      totalCount
                    }
                  }
                  ... on PullRequest {
                    id
                    number
                    title
                    body
                    url
                    state
                    isDraft
                    createdAt
                    updatedAt
                    author {
                      login
                    }
                    labels(first: 20) {
                      nodes {
                        name
                        color
                        description
                      }
                    }
                    assignees(first: 10) {
                      nodes {
                        login
                        name
                      }
                    }
                    milestone {
                      title
                      number
                    }
                    reviews {
                      totalCount
                    }
                    mergeable
                    merged
                    mergedAt
                  }
                  ... on DraftIssue {
                    id
                    title
                    body
                    createdAt
                    updatedAt
                    creator {
                      login
                    }
                  }
                }
                ${includeFields ? `
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldIterationValue {
                      title
                      startDate
                      duration
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                  }
                }
                ` : ''}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    const result = await graphqlWithAuth(listItemsQuery, {
      projectId,
      first
    });

    const project = result.node;
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    let items = project.items?.nodes || [];
    const totalCount = project.items?.totalCount || 0;

    // Apply filters
    if (args.item_type && args.item_type !== 'all') {
      const typeFilter = args.item_type.toUpperCase();
      items = items.filter((item: any) => item.type === typeFilter);
    }

    if (args.state && args.state !== 'all') {
      items = items.filter((item: any) => {
        if (!item.content?.state) return false;
        return args.state === 'open' ? 
          ['OPEN', 'DRAFT'].includes(item.content.state) : 
          item.content.state === 'CLOSED';
      });
    }

    if (args.search_title) {
      const searchTerm = args.search_title.toLowerCase();
      items = items.filter((item: any) => 
        item.content?.title?.toLowerCase().includes(searchTerm)
      );
    }

    if (args.assignee) {
      items = items.filter((item: any) => 
        item.content?.assignees?.nodes?.some((assignee: any) => 
          assignee.login === args.assignee
        )
      );
    }

    if (args.labels && args.labels.length > 0) {
      items = items.filter((item: any) => {
        if (!item.content?.labels?.nodes) return false;
        const itemLabels = item.content.labels.nodes.map((label: any) => label.name);
        return args.labels!.some(label => itemLabels.includes(label));
      });
    }

    // Apply sorting
    if (args.sort_by) {
      items.sort((a: any, b: any) => {
        let aVal, bVal;
        
        switch (args.sort_by) {
          case 'created':
            aVal = new Date(a.content?.createdAt || a.createdAt).getTime();
            bVal = new Date(b.content?.createdAt || b.createdAt).getTime();
            break;
          case 'updated':
            aVal = new Date(a.content?.updatedAt || a.updatedAt).getTime();
            bVal = new Date(b.content?.updatedAt || b.updatedAt).getTime();
            break;
          case 'title':
            aVal = (a.content?.title || '').toLowerCase();
            bVal = (b.content?.title || '').toLowerCase();
            break;
          case 'number':
            aVal = a.content?.number || 0;
            bVal = b.content?.number || 0;
            break;
          default:
            return 0;
        }
        
        if (args.order === 'desc') {
          return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        } else {
          return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        }
      });
    }

    // Format response
    let response = `📋 **Project Items** - ${project.title} (#${project.number})\n\n`;
    response += `**Project URL:** ${project.url}\n`;
    response += `**Total Items:** ${totalCount}\n`;
    response += `**Filtered Items:** ${items.length}\n`;
    
    if (args.item_type && args.item_type !== 'all') {
      response += `**Type Filter:** ${args.item_type}\n`;
    }
    if (args.state && args.state !== 'all') {
      response += `**State Filter:** ${args.state}\n`;
    }
    if (args.search_title) {
      response += `**Search:** "${args.search_title}"\n`;
    }
    
    response += `\n`;

    if (items.length === 0) {
      response += "No items found matching the criteria.\n\n";
      response += `💡 **Add items to this project:**\n`;
      response += `• Use 'add_project_item' to add issues or PRs\n`;
      response += `• Create draft items directly in the project`;
    } else {
      // Group items by type for better organization
      const groupedItems: { [type: string]: any[] } = {};
      items.forEach((item: any) => {
        const type = item.type;
        if (!groupedItems[type]) {
          groupedItems[type] = [];
        }
        groupedItems[type].push(item);
      });

      Object.entries(groupedItems).forEach(([type, typeItems]) => {
        const typeName = type === 'ISSUE' ? 'Issues' : 
                        type === 'PULL_REQUEST' ? 'Pull Requests' : 
                        type === 'DRAFT_ISSUE' ? 'Draft Issues' : type;
        
        response += `## ${typeName} (${typeItems.length})\n\n`;
        
        typeItems.forEach((item: any, index: number) => {
          const content = item.content;
          
          response += `### ${index + 1}. `;
          
          if (content) {
            if (content.number) {
              // Issue or PR
              const typeEmoji = type === 'ISSUE' ? '🐛' : type === 'PULL_REQUEST' ? '🔀' : '📝';
              const stateEmoji = content.state === 'OPEN' ? '🟢' : 
                               content.state === 'CLOSED' ? '🔴' : 
                               content.state === 'MERGED' ? '🟣' : '🟡';
              
              response += `${typeEmoji} **#${content.number}: ${content.title}**\n`;
              response += `   ${stateEmoji} ${content.state}`;
              
              if (content.isDraft) {
                response += ` (Draft)`;
              }
              if (content.merged) {
                response += ` (Merged ${new Date(content.mergedAt).toLocaleDateString()})`;
              }
              response += `\n`;
              
              response += `   🔗 ${content.url}\n`;
              response += `   👤 Author: ${content.author?.login}\n`;
              response += `   📅 Created: ${new Date(content.createdAt).toLocaleDateString()}\n`;
              
              if (content.assignees?.nodes && content.assignees.nodes.length > 0) {
                const assignees = content.assignees.nodes.map((a: any) => a.login).join(', ');
                response += `   👥 Assignees: ${assignees}\n`;
              }
              
              if (content.labels?.nodes && content.labels.nodes.length > 0) {
                const labels = content.labels.nodes.map((l: any) => l.name).join(', ');
                response += `   🏷️ Labels: ${labels}\n`;
              }
              
              if (content.milestone) {
                response += `   🎯 Milestone: ${content.milestone.title}\n`;
              }
              
              if (type === 'ISSUE' && content.comments?.totalCount > 0) {
                response += `   💬 Comments: ${content.comments.totalCount}\n`;
              }
              
              if (type === 'PULL_REQUEST') {
                if (content.reviews?.totalCount > 0) {
                  response += `   👀 Reviews: ${content.reviews.totalCount}\n`;
                }
                if (content.mergeable !== null) {
                  response += `   🔀 Mergeable: ${content.mergeable ? 'Yes' : 'No'}\n`;
                }
              }
              
              if (detailedView && content.body) {
                const shortBody = content.body.length > 200 ? content.body.substring(0, 200) + '...' : content.body;
                response += `   📝 Description: ${shortBody}\n`;
              }
            } else {
              // Draft item
              response += `📝 **Draft: ${content.title}**\n`;
              response += `   👤 Creator: ${content.creator?.login}\n`;
              response += `   📅 Created: ${new Date(content.createdAt).toLocaleDateString()}\n`;
              
              if (detailedView && content.body) {
                const shortBody = content.body.length > 200 ? content.body.substring(0, 200) + '...' : content.body;
                response += `   📝 Description: ${shortBody}\n`;
              }
            }
          }
          
          // Show custom field values if requested
          if (includeFields && item.fieldValues?.nodes && item.fieldValues.nodes.length > 0) {
            response += `   📊 **Custom Fields:**\n`;
            item.fieldValues.nodes.forEach((fieldValue: any) => {
              if (fieldValue.field?.name) {
                let value = fieldValue.text || fieldValue.number || fieldValue.name || fieldValue.date;
                if (fieldValue.title) {
                  // Iteration field
                  value = `${fieldValue.title} (${fieldValue.startDate} - ${fieldValue.duration} days)`;
                }
                response += `      • ${fieldValue.field.name}: ${value}\n`;
              }
            });
          }
          
          response += `   🆔 Item ID: ${item.id}\n\n`;
        });
      });

      // Show pagination info if applicable
      if (project.items?.pageInfo?.hasNextPage) {
        response += `📄 **Pagination:** Showing first ${first} items. More items available.\n\n`;
      }

      response += `🛠️ **Available Actions:**\n`;
      response += `• Use 'set_field_value' to update custom fields\n`;
      response += `• Use 'remove_project_item' to remove items\n`;
      response += `• Use 'get_field_value' to get specific field values\n`;
      response += `• Use filters to narrow down results`;
    }

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to list project items. Ensure your GitHub token has "project" scope and read access to the project.');
    }
    if (error.message?.includes('not found')) {
      throw new Error(`Project not found: ${error.message}`);
    }
    throw new Error(`Failed to list project items: ${error.message}`);
  }
}
