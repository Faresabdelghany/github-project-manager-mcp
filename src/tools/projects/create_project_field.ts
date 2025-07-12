import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface CreateProjectFieldArgs {
  project_number?: number;
  project_id?: string;
  name: string;
  data_type: 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'ITERATION';
  description?: string;
  options?: string[]; // For SINGLE_SELECT fields
  default_value?: string;
  required?: boolean;
}

/**
 * Create custom fields for GitHub Projects v2
 * Uses GraphQL mutation createProjectV2Field
 */
export async function createProjectField(config: GitHubConfig, args: CreateProjectFieldArgs): Promise<ToolResponse> {
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

    // Validate field type and options
    if (args.data_type === 'SINGLE_SELECT' && (!args.options || args.options.length === 0)) {
      throw new Error('SINGLE_SELECT fields require options to be provided');
    }

    // Create the field using GraphQL mutation
    const createFieldMutation = `
      mutation($input: CreateProjectV2FieldInput!) {
        createProjectV2Field(input: $input) {
          projectV2Field {
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
                nameHTML
              }
              createdAt
              updatedAt
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
                completedIterations {
                  id
                  title
                  duration
                  startDate
                }
              }
              createdAt
              updatedAt
            }
          }
        }
      }
    `;

    const input: any = {
      projectId,
      name: args.name,
      dataType: args.data_type
    };

    // Add options for SINGLE_SELECT fields
    if (args.data_type === 'SINGLE_SELECT' && args.options) {
      input.singleSelectOptions = args.options.map(option => ({ name: option }));
    }

    const result = await graphqlWithAuth(createFieldMutation, { input });
    const field = result.createProjectV2Field.projectV2Field;

    let response = `✅ **Project field created successfully!**\n\n`;
    response += `**Name:** ${field.name}\n`;
    response += `**ID:** ${field.id}\n`;
    response += `**Type:** ${field.dataType}\n`;
    response += `**Created:** ${new Date(field.createdAt).toLocaleDateString()}\n`;

    // Add field-specific information
    if (field.dataType === 'SINGLE_SELECT' && field.options) {
      response += `**Options:** ${field.options.map((opt: any) => opt.name).join(', ')}\n`;
    }

    if (field.dataType === 'ITERATION' && field.configuration) {
      const totalIterations = field.configuration.iterations.length + field.configuration.completedIterations.length;
      response += `**Iterations:** ${totalIterations} configured\n`;
    }

    response += `\n💡 **Next Steps:**\n`;
    response += `• Use 'list_project_fields' to see all project fields\n`;
    response += `• Use 'update_project_field' to modify field settings\n`;
    response += `• Use field in project views and item configurations\n`;
    response += `• Set field values on project items using the project interface`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to create project fields. Ensure your GitHub token has "project" scope.');
    }
    if (error.message?.includes('already exists')) {
      throw new Error(`Field with name "${args.name}" already exists in this project.`);
    }
    if (error.message?.includes('Field limit exceeded')) {
      throw new Error('Project has reached the maximum number of custom fields (50 per project).');
    }
    throw new Error(`Failed to create project field: ${error.message}`);
  }
}
