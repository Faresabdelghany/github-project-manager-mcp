import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface ListProjectsArgs {
  status?: 'open' | 'closed' | 'all';
  first?: number;
  orderBy?: 'CREATED_AT' | 'UPDATED_AT' | 'NAME';
  direction?: 'ASC' | 'DESC';
}

/**
 * List existing GitHub Projects v2
 * Uses GraphQL query projectsV2
 */
export async function listProjects(config: GitHubConfig, args: ListProjectsArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    const first = args.first || 20;
    const orderBy = args.orderBy || 'UPDATED_AT';
    const direction = args.direction || 'DESC';

    // Query projects for the owner (user or organization)
    const projectsQuery = `
      query($login: String!, $first: Int!, $orderBy: ProjectV2OrderField!, $direction: OrderDirection!) {
        user(login: $login) {
          projectsV2(first: $first, orderBy: {field: $orderBy, direction: $direction}) {
            totalCount
            nodes {
              id
              number
              title
              shortDescription
              readme
              url
              visibility
              public
              closed
              createdAt
              updatedAt
              owner {
                ... on User {
                  login
                  id
                }
                ... on Organization {
                  login
                  id
                }
              }
              items {
                totalCount
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        organization(login: $login) {
          projectsV2(first: $first, orderBy: {field: $orderBy, direction: $direction}) {
            totalCount
            nodes {
              id
              number
              title
              shortDescription
              readme
              url
              visibility
              public
              closed
              createdAt
              updatedAt
              owner {
                ... on User {
                  login
                  id
                }
                ... on Organization {
                  login
                  id
                }
              }
              items {
                totalCount
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const result = await graphqlWithAuth(projectsQuery, {
      login: owner,
      first,
      orderBy,
      direction
    });

    const projectsData = result.user?.projectsV2 || result.organization?.projectsV2;
    
    if (!projectsData) {
      throw new Error(`Unable to find user or organization: ${owner}`);
    }

    let projects = projectsData.nodes || [];

    // Apply status filter
    if (args.status && args.status !== 'all') {
      const isClosed = args.status === 'closed';
      projects = projects.filter((project: any) => project.closed === isClosed);
    }

    let response = `📋 **GitHub Projects v2** - Found ${projects.length} projects\n\n`;
    response += `**Owner:** ${owner}\n`;
    response += `**Total Projects:** ${projectsData.totalCount}\n`;
    response += `**Filter:** ${args.status || 'all'} projects\n`;
    response += `**Order:** ${orderBy} ${direction}\n\n`;

    if (projects.length === 0) {
      response += "No projects found matching the criteria.\n\n";
      response += `💡 **Create your first project:**\n`;
      response += `• Use 'create_project' to create a new project\n`;
      response += `• Visit GitHub.com to create projects through the web interface`;
    } else {
      response += `## Projects List\n\n`;
      
      projects.forEach((project: any, index: number) => {
        const status = project.closed ? '🔒 Closed' : '🟢 Open';
        const visibility = project.public ? '🌐 Public' : '🔒 Private';
        const itemCount = project.items?.totalCount || 0;
        
        response += `### ${index + 1}. **${project.title}** (#${project.number})\n`;
        response += `   ${status} | ${visibility} | ${itemCount} items\n`;
        
        if (project.shortDescription) {
          response += `   📝 ${project.shortDescription}\n`;
        }
        
        response += `   📅 Updated: ${new Date(project.updatedAt).toLocaleDateString()}\n`;
        response += `   🔗 ${project.url}\n\n`;
      });

      // Show pagination info if applicable
      if (projectsData.pageInfo?.hasNextPage) {
        response += `📄 **Pagination:** Showing first ${first} projects. More projects available.\n\n`;
      }

      response += `🛠️ **Available Actions:**\n`;
      response += `• Use 'get_project' with project number to see details\n`;
      response += `• Use 'update_project' to modify project settings\n`;
      response += `• Use 'add_item_to_project' to add issues/PRs\n`;
      response += `• Use 'delete_project' to remove projects`;
    }

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to list projects. Ensure your GitHub token has "project" scope and appropriate organization permissions.');
    }
    throw new Error(`Failed to list projects: ${error.message}`);
  }
}