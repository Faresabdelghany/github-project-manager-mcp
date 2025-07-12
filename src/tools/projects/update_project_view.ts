import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface UpdateProjectViewArgs {
  project_number?: number;
  project_id?: string;
  view_id?: string;
  view_name?: string;
  new_name?: string;
  description?: string;
  filter?: string; // GitHub search syntax filter
  clear_filter?: boolean; // Remove existing filter
  sort_field?: string; // Field name to sort by
  sort_direction?: 'ASC' | 'DESC';
  clear_sort?: boolean; // Remove existing sort
  group_by_field?: string; // Field name to group by
  clear_grouping?: boolean; // Remove existing grouping
  visible_fields?: string[]; // List of field names to show
  layout?: 'BOARD_LAYOUT' | 'TABLE_LAYOUT' | 'ROADMAP_LAYOUT';
  visibility?: 'PUBLIC' | 'PRIVATE';
}

/**
 * Update GitHub Project v2 view configurations and layouts
 * Uses GraphQL mutation updateProjectV2View
 */
export async function updateProjectView(config: GitHubConfig, args: UpdateProjectViewArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    let projectId = args.project_id;
    let viewId = args.view_id;

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

    // If view_name is provided instead of view_id, find the view ID
    if (!viewId && args.view_name && projectId) {
      const viewsQuery = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              views(first: 100) {
                nodes {
                  id
                  name
                  layout
                }
              }
            }
          }
        }
      `;

      const viewsResult = await graphqlWithAuth(viewsQuery, { projectId });
      const views = viewsResult.node?.views?.nodes || [];
      const view = views.find((v: any) => v.name === args.view_name);
      
      if (!view) {
        throw new Error(`View "${args.view_name}" not found in project`);
      }
      
      viewId = view.id;
    }

    if (!viewId) {
      throw new Error('Either view_id or view_name (with project context) must be provided');
    }

    // Get current view details first
    const currentViewQuery = `
      query($viewId: ID!) {
        node(id: $viewId) {
          ... on ProjectV2View {
            id
            name
            layout
            filter
            sortBy {
              field {
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
              direction
            }
            groupBy {
              field {
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
            visibleFields {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
              }
            }
          }
        }
      }
    `;

    const currentViewResult = await graphqlWithAuth(currentViewQuery, { viewId });
    const currentView = currentViewResult.node;
    
    if (!currentView) {
      throw new Error('View not found or access denied');
    }

    // Get project fields for validation
    let validFields: string[] = ['Title', 'Status', 'Assignees', 'Labels', 'Repository', 'Milestone'];
    let fieldIdMap: { [name: string]: string } = {};
    
    if (projectId) {
      try {
        const fieldsQuery = `
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

        const fieldsResult = await graphqlWithAuth(fieldsQuery, { projectId });
        const customFields = fieldsResult.node?.fields?.nodes || [];
        
        customFields.forEach((field: any) => {
          validFields.push(field.name);
          fieldIdMap[field.name] = field.id;
        });
      } catch (error) {
        console.warn('Could not fetch custom fields, using default field list');
      }
    }

    let updateOperations: string[] = [];
    const updateInput: any = { viewId };

    // Update view name if provided
    if (args.new_name && args.new_name !== currentView.name) {
      updateInput.name = args.new_name;
      updateOperations.push(`Updated name from "${currentView.name}" to "${args.new_name}"`);
    }

    // Update layout if provided
    if (args.layout && args.layout !== currentView.layout) {
      updateInput.layout = args.layout;
      updateOperations.push(`Changed layout from ${currentView.layout} to ${args.layout}`);
    }

    // Update filter
    if (args.filter !== undefined) {
      updateInput.filter = args.filter;
      updateOperations.push(`Updated filter to: "${args.filter}"`);
    } else if (args.clear_filter) {
      updateInput.filter = null;
      updateOperations.push('Cleared filter');
    }

    // Update sorting
    if (args.clear_sort) {
      updateInput.sortBy = [];
      updateOperations.push('Cleared sorting');
    } else if (args.sort_field) {
      if (!validFields.includes(args.sort_field)) {
        throw new Error(`Sort field "${args.sort_field}" not found. Available fields: ${validFields.join(', ')}`);
      }

      const fieldId = fieldIdMap[args.sort_field];
      if (fieldId) {
        updateInput.sortBy = [{
          fieldId,
          direction: args.sort_direction || 'ASC'
        }];
        updateOperations.push(`Updated sort to: ${args.sort_field} (${args.sort_direction || 'ASC'})`);
      }
    }

    // Update grouping
    if (args.clear_grouping) {
      updateInput.groupBy = [];
      updateOperations.push('Cleared grouping');
    } else if (args.group_by_field) {
      if (!validFields.includes(args.group_by_field)) {
        throw new Error(`Group by field "${args.group_by_field}" not found. Available fields: ${validFields.join(', ')}`);
      }

      const fieldId = fieldIdMap[args.group_by_field];
      if (fieldId) {
        updateInput.groupBy = [{
          fieldId
        }];
        updateOperations.push(`Updated grouping to: ${args.group_by_field}`);
      }
    }

    // Update visible fields
    if (args.visible_fields && args.visible_fields.length > 0) {
      const invalidFields = args.visible_fields.filter(field => !validFields.includes(field));
      if (invalidFields.length > 0) {
        throw new Error(`Invalid fields: ${invalidFields.join(', ')}. Available fields: ${validFields.join(', ')}`);
      }

      const visibleFieldIds = args.visible_fields
        .map(fieldName => fieldIdMap[fieldName])
        .filter(id => id); // Filter out undefined IDs

      if (visibleFieldIds.length > 0) {
        updateInput.visibleFields = visibleFieldIds;
        updateOperations.push(`Updated visible fields: ${args.visible_fields.join(', ')}`);
      }
    }

    if (updateOperations.length === 0) {
      return {
        content: [{
          type: "text",
          text: `ℹ️ **No updates made to view "${currentView.name}"**\n\n**Reason:** No valid update parameters provided.\n\n**Available updates:**\n• new_name - Change view name\n• layout - Change view layout (BOARD_LAYOUT, TABLE_LAYOUT, ROADMAP_LAYOUT)\n• filter - Set search filter\n• clear_filter - Remove existing filter\n• sort_field & sort_direction - Set sorting\n• clear_sort - Remove sorting\n• group_by_field - Set grouping\n• clear_grouping - Remove grouping\n• visible_fields - Configure visible fields`
        }]
      };
    }

    // Execute the update
    const updateViewMutation = `
      mutation($input: UpdateProjectV2ViewInput!) {
        updateProjectV2View(input: $input) {
          projectV2View {
            id
            name
            layout
            filter
            updatedAt
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

    const result = await graphqlWithAuth(updateViewMutation, { input: updateInput });
    const updatedView = result.updateProjectV2View.projectV2View;

    let response = `✅ **Project view updated successfully!**\n\n`;
    response += `**View:** ${updatedView.name}\n`;
    response += `**ID:** ${viewId}\n`;
    response += `**Layout:** ${updatedView.layout.replace('_LAYOUT', '').toLowerCase()}\n`;
    response += `**Updated:** ${new Date(updatedView.updatedAt).toLocaleDateString()}\n\n`;

    response += `**Changes made:**\n`;
    updateOperations.forEach((operation, index) => {
      response += `   ${index + 1}. ${operation}\n`;
    });

    // Show current view configuration
    response += `\n**Current Configuration:**\n`;
    
    if (updatedView.filter) {
      response += `• **Filter:** \`${updatedView.filter}\`\n`;
    }

    if (updatedView.sortBy && updatedView.sortBy.length > 0) {
      const sorts = updatedView.sortBy.map((sort: any) => 
        `${sort.field.name} (${sort.direction})`
      ).join(', ');
      response += `• **Sort:** ${sorts}\n`;
    }

    if (updatedView.groupBy && updatedView.groupBy.length > 0) {
      const groups = updatedView.groupBy.map((group: any) => group.field.name).join(', ');
      response += `• **Group by:** ${groups}\n`;
    }

    if (updatedView.visibleFields && updatedView.visibleFields.length > 0) {
      const fieldNames = updatedView.visibleFields.map((field: any) => field.name).join(', ');
      response += `• **Visible fields:** ${fieldNames}\n`;
    }

    // Add layout-specific tips
    const layout = updatedView.layout;
    if (layout === 'BOARD_LAYOUT') {
      response += `\n**💡 Board View Tips:**\n`;
      response += `• Group by Status or custom select fields for best results\n`;
      response += `• Use filters to focus on specific work streams\n`;
      response += `• Configure swimlanes for better organization\n`;
    } else if (layout === 'TABLE_LAYOUT') {
      response += `\n**💡 Table View Tips:**\n`;
      response += `• Show relevant fields for spreadsheet-style editing\n`;
      response += `• Use sorting for data analysis\n`;
      response += `• Enable bulk editing for efficiency\n`;
    } else if (layout === 'ROADMAP_LAYOUT') {
      response += `\n**💡 Roadmap View Tips:**\n`;
      response += `• Set date fields for timeline visualization\n`;
      response += `• Group by milestones or iterations\n`;
      response += `• Use filters to show specific time periods\n`;
    }

    response += `\n**Next Steps:**\n`;
    response += `• Use 'list_project_views' to see all project views\n`;
    response += `• Further customize the view in the GitHub project interface\n`;
    response += `• Share this view with team members\n`;
    response += `• Set up automation based on view criteria`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to update project views. Ensure your GitHub token has "project" scope.');
    }
    if (error.message?.includes('View is system')) {
      throw new Error('Cannot modify system views. Create a custom view instead.');
    }
    if (error.message?.includes('already exists')) {
      throw new Error('A view with that name already exists in this project.');
    }
    throw new Error(`Failed to update project view: ${error.message}`);
  }
}
