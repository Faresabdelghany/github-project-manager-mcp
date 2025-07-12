import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface ListProjectFieldsArgs {
  project_number?: number;
  project_id?: string;
  include_system_fields?: boolean;
  field_type_filter?: 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'ITERATION';
}

/**
 * List all custom fields in a GitHub Project v2
 * Uses GraphQL query projectV2.fields
 */
export async function listProjectFields(config: GitHubConfig, args: ListProjectFieldsArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    let projectId = args.project_id;
    let projectTitle = '';

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
      projectTitle = project.title;
    }

    if (!projectId) {
      throw new Error('Either project_number or project_id must be provided');
    }

    // Get all fields for the project
    const fieldsQuery = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            title
            fields(first: 100) {
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
                ... on ProjectV2FieldCommon {
                  id
                  name
                  dataType
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      }
    `;

    const result = await graphqlWithAuth(fieldsQuery, { projectId });
    
    if (!result.node) {
      throw new Error('Project not found or access denied');
    }

    const project = result.node;
    let fields = project.fields.nodes || [];

    // System fields that are always present
    const systemFields = [
      { name: 'Title', dataType: 'TEXT', isSystem: true },
      { name: 'Assignees', dataType: 'ASSIGNEES', isSystem: true },
      { name: 'Status', dataType: 'SINGLE_SELECT', isSystem: true },
      { name: 'Labels', dataType: 'LABELS', isSystem: true },
      { name: 'Linked pull requests', dataType: 'LINKED_PULL_REQUESTS', isSystem: true },
      { name: 'Reviewers', dataType: 'REVIEWERS', isSystem: true },
      { name: 'Repository', dataType: 'REPOSITORY', isSystem: true },
      { name: 'Milestone', dataType: 'MILESTONE', isSystem: true }
    ];

    // Filter by type if specified
    if (args.field_type_filter) {
      fields = fields.filter((field: any) => field.dataType === args.field_type_filter);
    }

    // Include system fields if requested
    if (args.include_system_fields) {
      if (args.field_type_filter) {
        const filteredSystemFields = systemFields.filter(field => field.dataType === args.field_type_filter);
        fields = [...filteredSystemFields, ...fields];
      } else {
        fields = [...systemFields, ...fields];
      }
    }

    let response = `🏗️ **Project Fields** - ${projectTitle || 'Project'}\n\n`;
    response += `**Total Fields:** ${fields.length}\n`;
    
    if (args.field_type_filter) {
      response += `**Filtered by:** ${args.field_type_filter}\n`;
    }
    
    if (args.include_system_fields) {
      response += `**Includes:** System fields\n`;
    }
    
    response += `\n`;

    if (fields.length === 0) {
      response += "No fields found matching the criteria.";
    } else {
      // Group fields by type for better organization
      const fieldsByType: { [key: string]: any[] } = {};
      
      fields.forEach((field: any) => {
        const type = field.dataType || 'UNKNOWN';
        if (!fieldsByType[type]) {
          fieldsByType[type] = [];
        }
        fieldsByType[type].push(field);
      });

      // Display fields grouped by type
      Object.entries(fieldsByType).forEach(([type, typeFields]) => {
        response += `### ${type} Fields (${typeFields.length})\n\n`;
        
        typeFields.forEach((field: any) => {
          const isSystem = field.isSystem || false;
          const systemIndicator = isSystem ? ' 🔧' : '';
          
          response += `**${field.name}**${systemIndicator}\n`;
          
          if (!isSystem) {
            response += `   🆔 ID: ${field.id}\n`;
            response += `   📅 Created: ${new Date(field.createdAt).toLocaleDateString()}\n`;
            
            if (field.updatedAt !== field.createdAt) {
              response += `   🔄 Updated: ${new Date(field.updatedAt).toLocaleDateString()}\n`;
            }
          }

          // Add type-specific information
          if (field.dataType === 'SINGLE_SELECT' && field.options) {
            response += `   🎯 Options: ${field.options.map((opt: any) => opt.name).join(', ')}\n`;
          }

          if (field.dataType === 'ITERATION' && field.configuration) {
            const activeIterations = field.configuration.iterations.length;
            const completedIterations = field.configuration.completedIterations.length;
            response += `   🔄 Iterations: ${activeIterations} active, ${completedIterations} completed\n`;
          }

          response += `\n`;
        });
      });

      // Add field type statistics
      response += `\n## 📊 **Field Statistics**\n\n`;
      Object.entries(fieldsByType).forEach(([type, typeFields]) => {
        const customFields = typeFields.filter((f: any) => !f.isSystem);
        const systemFields = typeFields.filter((f: any) => f.isSystem);
        
        response += `- **${type}:** ${typeFields.length} total`;
        if (args.include_system_fields && systemFields.length > 0) {
          response += ` (${customFields.length} custom, ${systemFields.length} system)`;
        }
        response += `\n`;
      });
    }

    response += `\n💡 **Next Steps:**\n`;
    response += `• Use 'create_project_field' to add new custom fields\n`;
    response += `• Use 'update_project_field' to modify field settings\n`;
    response += `• Configure field values in project views and items\n`;
    response += `• Use field filtering in project queries and views`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to access project fields. Ensure your GitHub token has "project" scope.');
    }
    throw new Error(`Failed to list project fields: ${error.message}`);
  }
}
