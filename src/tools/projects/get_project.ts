import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface GetProjectArgs {
  project_number?: number;
  project_id?: string;
  include_fields?: boolean;
  include_views?: boolean;
  include_items?: boolean;
}

/**
 * Get detailed GitHub Project v2 information
 * Uses GraphQL query projectV2
 */
export async function getProject(config: GitHubConfig, args: GetProjectArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  if (!args.project_number && !args.project_id) {
    throw new Error('Either project_number or project_id is required');
  }

  try {
    const includeFields = args.include_fields !== false;
    const includeViews = args.include_views !== false;
    const includeItems = args.include_items !== false;

    let project;

    if (args.project_id) {
      // Query by project ID (works for both users and organizations)
      const projectQuery = `
        query($projectId: ID!, $includeFields: Boolean!, $includeViews: Boolean!, $includeItems: Boolean!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              id
              number
              title
              shortDescription
              readme
              url
              public
              closed
              createdAt
              updatedAt
              owner {
                ... on User {
                  login
                  id
                  __typename
                }
                ... on Organization {
                  login
                  id
                  __typename
                }
              }
              fields(first: 20) @include(if: $includeFields) {
                totalCount
                nodes {
                  ... on ProjectV2Field {
                    id
                    name
                    dataType
                    createdAt
                    updatedAt
                  }
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    dataType
                    options {
                      id
                      name
                      color
                    }
                  }
                  ... on ProjectV2IterationField {
                    id
                    name
                    dataType
                    configuration {
                      iterations {
                        id
                        title
                        duration
                        startDate
                      }
                    }
                  }
                }
              }
              views(first: 10) @include(if: $includeViews) {
                totalCount
                nodes {
                  id
                  name
                  layout
                  createdAt
                  updatedAt
                }
              }
              items(first: 20) @include(if: $includeItems) {
                totalCount
                nodes {
                  id
                  type
                  createdAt
                  content {
                    ... on Issue {
                      number
                      title
                      state
                      url
                    }
                    ... on PullRequest {
                      number
                      title
                      state
                      url
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const result = await graphqlWithAuth(projectQuery, {
        projectId: args.project_id,
        includeFields,
        includeViews,
        includeItems
      });

      project = result.node;
      
    } else {
      // Query by project number - need to determine user vs organization first
      const ownerQuery = `
        query($login: String!) {
          user(login: $login) {
            id
            login
            __typename
          }
          organization(login: $login) {
            id
            login
            __typename
          }
        }
      `;

      const ownerResult = await graphqlWithAuth(ownerQuery, { login: owner });
      
      if (ownerResult.user && !ownerResult.organization) {
        // Query user project
        const userProjectQuery = `
          query($login: String!, $number: Int!, $includeFields: Boolean!, $includeViews: Boolean!, $includeItems: Boolean!) {
            user(login: $login) {
              projectV2(number: $number) {
                id
                number
                title
                shortDescription
                readme
                url
                public
                closed
                createdAt
                updatedAt
                owner {
                  ... on User {
                    login
                    id
                    __typename
                  }
                  ... on Organization {
                    login
                    id
                    __typename
                  }
                }
                fields(first: 20) @include(if: $includeFields) {
                  totalCount
                  nodes {
                    ... on ProjectV2Field {
                      id
                      name
                      dataType
                      createdAt
                      updatedAt
                    }
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      dataType
                      options {
                        id
                        name
                        color
                      }
                    }
                    ... on ProjectV2IterationField {
                      id
                      name
                      dataType
                      configuration {
                        iterations {
                          id
                          title
                          duration
                          startDate
                        }
                      }
                    }
                  }
                }
                views(first: 10) @include(if: $includeViews) {
                  totalCount
                  nodes {
                    id
                    name
                    layout
                    createdAt
                    updatedAt
                  }
                }
                items(first: 20) @include(if: $includeItems) {
                  totalCount
                  nodes {
                    id
                    type
                    createdAt
                    content {
                      ... on Issue {
                        number
                        title
                        state
                        url
                      }
                      ... on PullRequest {
                        number
                        title
                        state
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const result = await graphqlWithAuth(userProjectQuery, {
          login: owner,
          number: args.project_number,
          includeFields,
          includeViews,
          includeItems
        });

        project = result.user?.projectV2;
        
      } else if (ownerResult.organization && !ownerResult.user) {
        // Query organization project
        const orgProjectQuery = `
          query($login: String!, $number: Int!, $includeFields: Boolean!, $includeViews: Boolean!, $includeItems: Boolean!) {
            organization(login: $login) {
              projectV2(number: $number) {
                id
                number
                title
                shortDescription
                readme
                url
                public
                closed
                createdAt
                updatedAt
                owner {
                  ... on User {
                    login
                    id
                    __typename
                  }
                  ... on Organization {
                    login
                    id
                    __typename
                  }
                }
                fields(first: 20) @include(if: $includeFields) {
                  totalCount
                  nodes {
                    ... on ProjectV2Field {
                      id
                      name
                      dataType
                      createdAt
                      updatedAt
                    }
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      dataType
                      options {
                        id
                        name
                        color
                      }
                    }
                    ... on ProjectV2IterationField {
                      id
                      name
                      dataType
                      configuration {
                        iterations {
                          id
                          title
                          duration
                          startDate
                        }
                      }
                    }
                  }
                }
                views(first: 10) @include(if: $includeViews) {
                  totalCount
                  nodes {
                    id
                    name
                    layout
                    createdAt
                    updatedAt
                  }
                }
                items(first: 20) @include(if: $includeItems) {
                  totalCount
                  nodes {
                    id
                    type
                    createdAt
                    content {
                      ... on Issue {
                        number
                        title
                        state
                        url
                      }
                      ... on PullRequest {
                        number
                        title
                        state
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const result = await graphqlWithAuth(orgProjectQuery, {
          login: owner,
          number: args.project_number,
          includeFields,
          includeViews,
          includeItems
        });

        project = result.organization?.projectV2;
        
      } else {
        throw new Error(`Could not determine if "${owner}" is a user or organization`);
      }
    }

    if (!project) {
      throw new Error(`Project not found: ${args.project_number || args.project_id}`);
    }

    const status = project.closed ? '🔒 Closed' : '🟢 Open';
    const visibility = project.public ? '🌐 Public' : '🔒 Private';
    const ownerType = project.owner.__typename || 'Unknown';

    let response = `📋 **Project Details: ${project.title}**\n\n`;
    response += `**Number:** #${project.number}\n`;
    response += `**ID:** ${project.id}\n`;
    response += `**Status:** ${status}\n`;
    response += `**Visibility:** ${visibility}\n`;
    response += `**Owner:** ${project.owner.login} (${ownerType})\n`;
    response += `**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n`;
    response += `**Updated:** ${new Date(project.updatedAt).toLocaleDateString()}\n`;
    response += `**URL:** ${project.url}\n\n`;

    if (project.shortDescription) {
      response += `**Description:** ${project.shortDescription}\n\n`;
    }

    if (project.readme) {
      response += `**README:**\n${project.readme.length > 200 ? project.readme.substring(0, 200) + '...' : project.readme}\n\n`;
    }

    // Show fields if included
    if (includeFields && project.fields) {
      response += `## 🏗️ **Custom Fields** (${project.fields.totalCount})\n\n`;
      if (project.fields.nodes?.length > 0) {
        project.fields.nodes.forEach((field: any, index: number) => {
          response += `${index + 1}. **${field.name}** (${field.dataType})\n`;
          
          if (field.options) {
            response += `   Options: ${field.options.map((opt: any) => `${opt.name} (${opt.color})`).join(', ')}\n`;
          }
          
          if (field.configuration?.iterations) {
            response += `   Iterations: ${field.configuration.iterations.length} configured\n`;
          }
        });
        response += `\n`;
      } else {
        response += `No custom fields configured.\n\n`;
      }
    }

    // Show views if included
    if (includeViews && project.views) {
      response += `## 👁️ **Views** (${project.views.totalCount})\n\n`;
      if (project.views.nodes?.length > 0) {
        project.views.nodes.forEach((view: any, index: number) => {
          response += `${index + 1}. **${view.name}** (${view.layout})\n`;
          response += `   Created: ${new Date(view.createdAt).toLocaleDateString()}\n`;
        });
        response += `\n`;
      } else {
        response += `No custom views configured.\n\n`;
      }
    }

    // Show items if included
    if (includeItems && project.items) {
      response += `## 📋 **Items** (${project.items.totalCount})\n\n`;
      if (project.items.nodes?.length > 0) {
        const issues = project.items.nodes.filter((item: any) => item.content?.number && item.type === 'ISSUE');
        const prs = project.items.nodes.filter((item: any) => item.content?.number && item.type === 'PULL_REQUEST');
        
        if (issues.length > 0) {
          response += `**Issues (${issues.length}):**\n`;
          issues.forEach((item: any) => {
            const content = item.content;
            const stateEmoji = content.state === 'OPEN' ? '🟢' : content.state === 'CLOSED' ? '🔴' : '🟣';
            response += `   ${stateEmoji} #${content.number}: ${content.title}\n`;
          });
          response += `\n`;
        }

        if (prs.length > 0) {
          response += `**Pull Requests (${prs.length}):**\n`;
          prs.forEach((item: any) => {
            const content = item.content;
            const stateEmoji = content.state === 'OPEN' ? '🟢' : content.state === 'MERGED' ? '🟣' : '🔴';
            response += `   ${stateEmoji} #${content.number}: ${content.title}\n`;
          });
          response += `\n`;
        }

        if (project.items.totalCount > project.items.nodes.length) {
          response += `📄 Showing first ${project.items.nodes.length} of ${project.items.totalCount} items.\n\n`;
        }
      } else {
        response += `No items in this project.\n\n`;
      }
    }

    response += `🛠️ **Available Actions:**\n`;
    response += `• Use 'update_project' to modify project details\n`;
    response += `• Use 'add_project_item' to add issues or pull requests\n`;
    response += `• Use 'delete_project' to remove this project\n`;
    response += `• Visit the project URL to manage fields, views, and items`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    console.error(`❌ Get project failed:`, error);
    
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to access project details. Ensure your GitHub token has "project" scope and appropriate permissions.');
    }
    if (error.message?.includes('Could not resolve')) {
      throw new Error(`Project not found: ${args.project_number || args.project_id}. Check the project number/ID and your access permissions.`);
    }
    throw new Error(`Failed to get project details: ${error.message}`);
  }
}