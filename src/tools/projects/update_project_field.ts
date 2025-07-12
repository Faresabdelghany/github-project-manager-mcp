import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface UpdateProjectFieldArgs {
  project_number?: number;
  project_id?: string;
  field_id?: string;
  field_name?: string;
  new_name?: string;
  description?: string;
  options?: string[]; // For SINGLE_SELECT fields
  add_options?: string[]; // Add new options to SINGLE_SELECT
  remove_options?: string[]; // Remove options from SINGLE_SELECT
  archive?: boolean; // Archive the field (soft delete)
}

/**
 * Update GitHub Project v2 field configurations and options
 * Uses GraphQL mutation updateProjectV2Field
 */
export async function updateProjectField(config: GitHubConfig, args: UpdateProjectFieldArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    let projectId = args.project_id;
    let fieldId = args.field_id;

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

    // If field_name is provided instead of field_id, find the field ID
    if (!fieldId && args.field_name && projectId) {
      const fieldsQuery = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              fields(first: 100) {
                nodes {
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
        }
      `;

      const fieldsResult = await graphqlWithAuth(fieldsQuery, { projectId });
      const fields = fieldsResult.node?.fields?.nodes || [];
      const field = fields.find((f: any) => f.name === args.field_name);
      
      if (!field) {
        throw new Error(`Field "${args.field_name}" not found in project`);
      }
      
      fieldId = field.id;
    }

    if (!fieldId) {
      throw new Error('Either field_id or field_name (with project context) must be provided');
    }

    // Get current field details first
    const currentFieldQuery = `
      query($fieldId: ID!) {
        node(id: $fieldId) {
          ... on ProjectV2Field {
            id
            name
            dataType
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            dataType
            options {
              id
              name
            }
          }
          ... on ProjectV2IterationField {
            id
            name
            dataType
          }
        }
      }
    `;

    const currentFieldResult = await graphqlWithAuth(currentFieldQuery, { fieldId });
    const currentField = currentFieldResult.node;
    
    if (!currentField) {
      throw new Error('Field not found or access denied');
    }

    let updateOperations: string[] = [];
    let updatedValues: any = {};

    // Update field name if provided
    if (args.new_name && args.new_name !== currentField.name) {
      const updateNameMutation = `
        mutation($input: UpdateProjectV2FieldInput!) {
          updateProjectV2Field(input: $input) {
            projectV2Field {
              ... on ProjectV2Field {
                id
                name
                dataType
                updatedAt
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                updatedAt
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
                updatedAt
              }
            }
          }
        }
      `;

      const nameInput = {
        fieldId,
        name: args.new_name
      };

      const nameResult = await graphqlWithAuth(updateNameMutation, { input: nameInput });
      updateOperations.push(`Updated name from "${currentField.name}" to "${args.new_name}"`);
      updatedValues.name = args.new_name;
    }

    // Handle SINGLE_SELECT field options updates
    if (currentField.dataType === 'SINGLE_SELECT') {
      // Replace all options if options array is provided
      if (args.options && args.options.length > 0) {
        const updateOptionsMutation = `
          mutation($input: UpdateProjectV2FieldInput!) {
            updateProjectV2Field(input: $input) {
              projectV2Field {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                  updatedAt
                }
              }
            }
          }
        `;

        const optionsInput = {
          fieldId,
          singleSelectOptions: args.options.map(option => ({ name: option }))
        };

        const optionsResult = await graphqlWithAuth(updateOptionsMutation, { input: optionsInput });
        updateOperations.push(`Updated options to: ${args.options.join(', ')}`);
        updatedValues.options = args.options;
      }

      // Add new options
      if (args.add_options && args.add_options.length > 0) {
        const currentOptions = currentField.options?.map((opt: any) => opt.name) || [];
        const newOptions = [...currentOptions, ...args.add_options];
        
        const addOptionsMutation = `
          mutation($input: UpdateProjectV2FieldInput!) {
            updateProjectV2Field(input: $input) {
              projectV2Field {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                  updatedAt
                }
              }
            }
          }
        `;

        const addInput = {
          fieldId,
          singleSelectOptions: newOptions.map(option => ({ name: option }))
        };

        await graphqlWithAuth(addOptionsMutation, { input: addInput });
        updateOperations.push(`Added options: ${args.add_options.join(', ')}`);
      }

      // Remove options (by updating with filtered list)
      if (args.remove_options && args.remove_options.length > 0) {
        const currentOptions = currentField.options?.map((opt: any) => opt.name) || [];
        const filteredOptions = currentOptions.filter(option => !args.remove_options!.includes(option));
        
        if (filteredOptions.length === 0) {
          throw new Error('Cannot remove all options from a SINGLE_SELECT field');
        }

        const removeOptionsMutation = `
          mutation($input: UpdateProjectV2FieldInput!) {
            updateProjectV2Field(input: $input) {
              projectV2Field {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                  updatedAt
                }
              }
            }
          }
        `;

        const removeInput = {
          fieldId,
          singleSelectOptions: filteredOptions.map(option => ({ name: option }))
        };

        await graphqlWithAuth(removeOptionsMutation, { input: removeInput });
        updateOperations.push(`Removed options: ${args.remove_options.join(', ')}`);
      }
    }

    // Archive field if requested (this actually deletes the field)
    if (args.archive) {
      const deleteFieldMutation = `
        mutation($input: DeleteProjectV2FieldInput!) {
          deleteProjectV2Field(input: $input) {
            projectV2Field {
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      `;

      const deleteInput = { fieldId };
      await graphqlWithAuth(deleteFieldMutation, { input: deleteInput });
      updateOperations.push('Field archived (deleted)');
      
      return {
        content: [{
          type: "text",
          text: `⚠️ **Field archived successfully!**\n\n**Field:** ${currentField.name}\n**ID:** ${fieldId}\n**Status:** Archived (deleted)\n\n**Note:** This field has been permanently removed from the project and all its data has been lost.`
        }]
      };
    }

    if (updateOperations.length === 0) {
      return {
        content: [{
          type: "text",
          text: `ℹ️ **No updates made to field "${currentField.name}"**\n\n**Reason:** No valid update parameters provided.\n\n**Available updates:**\n• new_name - Change field name\n• options - Replace all options (SINGLE_SELECT only)\n• add_options - Add new options (SINGLE_SELECT only)\n• remove_options - Remove options (SINGLE_SELECT only)\n• archive - Archive the field (permanent deletion)`
        }]
      };
    }

    // Get updated field details
    const updatedFieldResult = await graphqlWithAuth(currentFieldQuery, { fieldId });
    const updatedField = updatedFieldResult.node;

    let response = `✅ **Project field updated successfully!**\n\n`;
    response += `**Field:** ${updatedField.name}\n`;
    response += `**ID:** ${fieldId}\n`;
    response += `**Type:** ${updatedField.dataType}\n`;
    response += `**Updated:** ${new Date().toLocaleDateString()}\n\n`;

    response += `**Changes made:**\n`;
    updateOperations.forEach((operation, index) => {
      response += `   ${index + 1}. ${operation}\n`;
    });

    // Show current field state for SINGLE_SELECT
    if (updatedField.dataType === 'SINGLE_SELECT' && updatedField.options) {
      response += `\n**Current Options:** ${updatedField.options.map((opt: any) => opt.name).join(', ')}\n`;
    }

    response += `\n💡 **Next Steps:**\n`;
    response += `• Use 'list_project_fields' to see all project fields\n`;
    response += `• Configure field values in project items\n`;
    response += `• Update project views to include this field\n`;
    response += `• Set up field-based filters and sorting`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to update project fields. Ensure your GitHub token has "project" scope.');
    }
    if (error.message?.includes('Field is in use')) {
      throw new Error('Cannot archive field that is currently in use. Remove field values from all items first.');
    }
    if (error.message?.includes('already exists')) {
      throw new Error('A field with that name already exists in this project.');
    }
    throw new Error(`Failed to update project field: ${error.message}`);
  }
}
