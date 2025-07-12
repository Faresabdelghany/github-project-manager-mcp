import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface CreateProjectViewArgs {
  project_number?: number;
  project_id?: string;
  name: string;
  layout: 'BOARD_LAYOUT' | 'TABLE_LAYOUT' | 'ROADMAP_LAYOUT';
  description?: string;
  filter?: string; // GitHub search syntax filter
  sort_field?: string; // Field name to sort by
  sort_direction?: 'ASC' | 'DESC';
  group_by_field?: string; // Field name to group by (for board layout)
  visibility?: 'PUBLIC' | 'PRIVATE';
}

/**
 * Create project views for GitHub Projects v2 (board, table, timeline, roadmap)
 * Uses GraphQL mutation createProjectV2View
 */
export async function createProjectView(config: GitHubConfig, args: CreateProjectViewArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    let projectId = args.project_id;

    // If project_number is provided instead of project_id, get the project ID
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

      const projectResult = await graphqlWithAuth(projectQuery, { owner, number: args.project_number });
      const project = projectResult.user?.projectV2 || projectResult.organization?.projectV2;
      
      if (!project) {
        throw new Error(`Project #${args.project_number} not found`);
      }
      
      projectId = project.id;
    }

    if (!projectId) {
      throw new Error('Either project_number or project_id must be provided');
    }

    // Validate layout-specific requirements
    if (args.layout === 'BOARD_LAYOUT' && !args.group_by_field) {
      // For board layout, we typically want to group by Status if no group_by_field is specified
      args.group_by_field = 'Status';
    }

    // Get project fields to validate sort and group fields
    let validFields: string[] = ['Title', 'Status', 'Assignees', 'Labels', 'Repository', 'Milestone'];
    
    try {
      const fieldsQuery = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              fields(first: 100) {
                nodes {
                  ... on ProjectV2Field {
                    name
                  }
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                  ... on ProjectV2IterationField {
                    name
                  }
                }
              }
            }
          }
        }
      `;

      const fieldsResult = await graphqlWithAuth(fieldsQuery, { projectId });
      const customFields = fieldsResult.node?.fields?.nodes?.map((field: any) => field.name) || [];
      validFields = [...validFields, ...customFields];
    } catch (error) {
      // Continue with default fields if we can't fetch custom fields
      console.warn('Could not fetch custom fields, using default field list');
    }

    // Validate sort_field if provided
    if (args.sort_field && !validFields.includes(args.sort_field)) {
      throw new Error(`Sort field "${args.sort_field}" not found. Available fields: ${validFields.join(', ')}`);
    }

    // Validate group_by_field if provided
    if (args.group_by_field && !validFields.includes(args.group_by_field)) {
      throw new Error(`Group by field "${args.group_by_field}" not found. Available fields: ${validFields.join(', ')}`);
    }

    // Create the view using GraphQL mutation
    const createViewMutation = `
      mutation($input: CreateProjectV2ViewInput!) {
        createProjectV2View(input: $input) {
          projectV2View {
            id
            name
            layout
            createdAt
            updatedAt
            filter
            sortBy {
              field {
                ... on ProjectV2Field {
                  name
                }
                ... on ProjectV2SingleSelectField {
                  name
                }
                ... on ProjectV2IterationField {
                  name
                }
              }
              direction
            }
            groupBy {
              field {
                ... on ProjectV2Field {
                  name
                }
                ... on ProjectV2SingleSelectField {
                  name
                }
                ... on ProjectV2IterationField {
                  name
                }
              }
            }
            visibleFields {
              ... on ProjectV2Field {
                name
              }
              ... on ProjectV2SingleSelectField {
                name
              }
              ... on ProjectV2IterationField {
                name
              }
            }
          }
        }
      }
    `;

    const input: any = {
      projectId,
      name: args.name,
      layout: args.layout
    };

    // Add optional configuration
    if (args.filter) {
      input.filter = args.filter;
    }

    if (args.visibility) {
      input.visibility = args.visibility;
    }

    const result = await graphqlWithAuth(createViewMutation, { input });
    const view = result.createProjectV2View.projectV2View;

    // Configure sorting if specified
    if (args.sort_field) {
      const updateSortMutation = `
        mutation($input: UpdateProjectV2ViewInput!) {
          updateProjectV2View(input: $input) {
            projectV2View {
              id
              sortBy {
                field {
                  ... on ProjectV2Field {
                    name
                  }
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
                direction
              }
            }
          }
        }
      `;

      // Find the field ID for sorting
      const sortFieldQuery = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              fields(first: 100) {
                nodes {
                  ... on ProjectV2Field {
                    id
                    name
                  }
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                  }
                  ... on ProjectV2IterationField {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      `;

      const sortFieldResult = await graphqlWithAuth(sortFieldQuery, { projectId });
      const fields = sortFieldResult.node?.fields?.nodes || [];
      const sortField = fields.find((field: any) => field.name === args.sort_field);

      if (sortField) {
        const sortInput = {
          viewId: view.id,
          sortBy: [{
            fieldId: sortField.id,
            direction: args.sort_direction || 'ASC'
          }]
        };

        await graphqlWithAuth(updateSortMutation, { input: sortInput });
      }
    }

    // Configure grouping for board layout
    if (args.layout === 'BOARD_LAYOUT' && args.group_by_field) {
      const updateGroupMutation = `
        mutation($input: UpdateProjectV2ViewInput!) {
          updateProjectV2View(input: $input) {
            projectV2View {
              id
              groupBy {
                field {
                  ... on ProjectV2Field {
                    name
                  }
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
              }
            }
          }
        }
      `;

      const groupFieldQuery = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              fields(first: 100) {
                nodes {
                  ... on ProjectV2Field {
                    id
                    name
                  }
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                  }
                  ... on ProjectV2IterationField {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      `;

      const groupFieldResult = await graphqlWithAuth(groupFieldQuery, { projectId });
      const fields = groupFieldResult.node?.fields?.nodes || [];
      const groupField = fields.find((field: any) => field.name === args.group_by_field);

      if (groupField) {
        const groupInput = {
          viewId: view.id,
          groupBy: [{
            fieldId: groupField.id
          }]
        };

        await graphqlWithAuth(updateGroupMutation, { input: groupInput });
      }
    }

    let response = `🎨 **Project view created successfully!**\n\n`;
    response += `**Name:** ${view.name}\n`;
    response += `**ID:** ${view.id}\n`;
    response += `**Layout:** ${view.layout.replace('_LAYOUT', '').toLowerCase()}\n`;
    response += `**Created:** ${new Date(view.createdAt).toLocaleDateString()}\n`;

    if (view.filter) {
      response += `**Filter:** ${view.filter}\n`;
    }

    if (view.sortBy && view.sortBy.length > 0) {
      const sortInfo = view.sortBy[0];
      response += `**Sorted by:** ${sortInfo.field.name} (${sortInfo.direction})\n`;
    }

    if (view.groupBy && view.groupBy.length > 0) {
      const groupInfo = view.groupBy[0];
      response += `**Grouped by:** ${groupInfo.field.name}\n`;
    }

    // Add layout-specific information
    if (args.layout === 'BOARD_LAYOUT') {
      response += `\n**Board View Features:**\n`;
      response += `• Kanban-style columns based on ${args.group_by_field || 'Status'}\n`;
      response += `• Drag-and-drop card management\n`;
      response += `• Visual workflow tracking\n`;
    } else if (args.layout === 'TABLE_LAYOUT') {
      response += `\n**Table View Features:**\n`;
      response += `• Spreadsheet-style data view\n`;
      response += `• Sortable columns\n`;
      response += `• Bulk editing capabilities\n`;
    } else if (args.layout === 'ROADMAP_LAYOUT') {
      response += `\n**Roadmap View Features:**\n`;
      response += `• Timeline visualization\n`;
      response += `• Date-based planning\n`;
      response += `• Milestone tracking\n`;
    }

    response += `\n💡 **Next Steps:**\n`;
    response += `• Use 'list_project_views' to see all project views\n`;
    response += `• Use 'update_project_view' to modify view settings\n`;
    response += `• Configure visible fields in the project interface\n`;
    response += `• Set up filters and automation rules\n`;
    response += `• Share view with team members`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to create project views. Ensure your GitHub token has "project" scope.');
    }
    if (error.message?.includes('View limit exceeded')) {
      throw new Error('Project has reached the maximum number of views (50 per project).');
    }
    if (error.message?.includes('already exists')) {
      throw new Error(`View with name "${args.name}" already exists in this project.`);
    }
    throw new Error(`Failed to create project view: ${error.message}`);
  }
}
