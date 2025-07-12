import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface GetFieldValueArgs {
  project_id?: string;
  project_number?: number;
  item_id?: string;
  issue_number?: number;
  pr_number?: number;
  field_name?: string;
  field_id?: string;
  all_fields?: boolean;
  bulk_items?: Array<{
    item_id?: string;
    issue_number?: number;
    pr_number?: number;
  }>;
  include_field_history?: boolean;
  format?: 'detailed' | 'simple' | 'json';
}

/**
 * Get custom field values for GitHub Projects v2 items
 * Uses GraphQL query with field value resolution
 */
export async function getFieldValue(config: GitHubConfig, args: GetFieldValueArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

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
              number
            }
          }
          organization(login: $owner) {
            projectV2(number: $number) {
              id
              title
              number
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

    // Get project fields and items
    const projectDataQuery = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
            number
            fields(first: 50) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2IterationField {
                  id
                  name
                  dataType
                  configuration {
                    iterations {
                      id
                      title
                      startDate
                      duration
                    }
                  }
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
              }
            }
            items(first: 100) {
              nodes {
                id
                type
                createdAt
                updatedAt
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
                    title
                  }
                }
                fieldValues(first: 50) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      createdAt
                      updatedAt
                      creator {
                        login
                      }
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      number
                      createdAt
                      updatedAt
                      creator {
                        login
                      }
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      date
                      createdAt
                      updatedAt
                      creator {
                        login
                      }
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      color
                      createdAt
                      updatedAt
                      creator {
                        login
                      }
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
                      createdAt
                      updatedAt
                      creator {
                        login
                      }
                      field {
                        ... on ProjectV2FieldCommon {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const projectData = await graphqlWithAuth(projectDataQuery, { projectId });
    const project = projectData.node;
    
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    const projectFields = project.fields?.nodes || [];
    const projectItems = project.items?.nodes || [];

    // Helper function to resolve field by name or ID
    const resolveField = (fieldName?: string, fieldId?: string): any | null => {
      if (fieldId) {
        return projectFields.find((f: any) => f.id === fieldId);
      }
      
      if (fieldName) {
        return projectFields.find((f: any) => f.name.toLowerCase() === fieldName.toLowerCase());
      }
      
      return null;
    };

    // Helper function to find item by issue/PR number
    const findItem = (issueNumber?: number, prNumber?: number): any | null => {
      return projectItems.find((item: any) => {
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
    };

    // Helper function to format field value
    const formatFieldValue = (fieldValue: any, field: any): any => {
      const baseInfo = {
        fieldName: field?.name || 'Unknown Field',
        fieldType: field?.dataType || 'Unknown',
        value: null,
        displayValue: null,
        updatedAt: fieldValue.updatedAt,
        updatedBy: fieldValue.creator?.login
      };

      if (fieldValue.text !== undefined) {
        baseInfo.value = fieldValue.text;
        baseInfo.displayValue = fieldValue.text;
      } else if (fieldValue.number !== undefined) {
        baseInfo.value = fieldValue.number;
        baseInfo.displayValue = fieldValue.number.toString();
      } else if (fieldValue.date !== undefined) {
        baseInfo.value = fieldValue.date;
        baseInfo.displayValue = new Date(fieldValue.date).toLocaleDateString();
      } else if (fieldValue.name !== undefined) {
        baseInfo.value = fieldValue.name;
        baseInfo.displayValue = `${fieldValue.name}${fieldValue.color ? ` (${fieldValue.color})` : ''}`;
      } else if (fieldValue.title !== undefined) {
        baseInfo.value = fieldValue.title;
        baseInfo.displayValue = `${fieldValue.title} (${fieldValue.startDate} - ${fieldValue.duration} days)`;
      }

      return baseInfo;
    };

    const results: any[] = [];
    const format = args.format || 'detailed';

    // Handle bulk items
    if (args.bulk_items && args.bulk_items.length > 0) {
      for (const bulkItem of args.bulk_items) {
        let item = null;

        if (bulkItem.item_id) {
          item = projectItems.find((i: any) => i.id === bulkItem.item_id);
        } else {
          item = findItem(bulkItem.issue_number, bulkItem.pr_number);
        }

        if (!item) {
          results.push({
            success: false,
            error: `Item not found in project (issue: ${bulkItem.issue_number}, PR: ${bulkItem.pr_number})`,
            original: bulkItem
          });
          continue;
        }

        const itemFieldValues = item.fieldValues?.nodes || [];
        const formattedValues = itemFieldValues.map((fv: any) => formatFieldValue(fv, fv.field));

        results.push({
          success: true,
          itemId: item.id,
          itemType: item.type,
          itemContent: item.content,
          fieldValues: formattedValues,
          totalFields: formattedValues.length,
          original: bulkItem
        });
      }
    } else {
      // Handle single item
      let item = null;

      if (args.item_id) {
        item = projectItems.find((i: any) => i.id === args.item_id);
      } else {
        item = findItem(args.issue_number, args.pr_number);
      }

      if (!item) {
        throw new Error(`Item not found in project (issue: ${args.issue_number}, PR: ${args.pr_number})`);
      }

      const itemFieldValues = item.fieldValues?.nodes || [];

      if (args.all_fields) {
        // Return all field values
        const formattedValues = itemFieldValues.map((fv: any) => formatFieldValue(fv, fv.field));
        
        results.push({
          success: true,
          itemId: item.id,
          itemType: item.type,
          itemContent: item.content,
          fieldValues: formattedValues,
          totalFields: formattedValues.length
        });
      } else {
        // Return specific field value
        const targetField = resolveField(args.field_name, args.field_id);
        if (!targetField) {
          throw new Error(`Field not found: ${args.field_name || args.field_id}`);
        }

        const fieldValue = itemFieldValues.find((fv: any) => fv.field?.id === targetField.id);
        
        if (!fieldValue) {
          results.push({
            success: true,
            itemId: item.id,
            itemType: item.type,
            itemContent: item.content,
            fieldName: targetField.name,
            fieldType: targetField.dataType,
            value: null,
            message: 'Field has no value set'
          });
        } else {
          const formattedValue = formatFieldValue(fieldValue, targetField);
          results.push({
            success: true,
            itemId: item.id,
            itemType: item.type,
            itemContent: item.content,
            ...formattedValue
          });
        }
      }
    }

    // Format response based on format preference
    if (format === 'json') {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            projectId,
            projectTitle: project.title,
            projectNumber: project.number,
            results
          }, null, 2)
        }]
      };
    } else if (format === 'simple') {
      let response = `📊 **Field Values** - ${project.title}\n\n`;
      
      results.forEach((result, index) => {
        if (result.success) {
          if (result.fieldValues) {
            // Multiple fields
            response += `${index + 1}. **Item:** ${result.itemContent?.title || result.itemContent?.number || 'Draft'}\n`;
            result.fieldValues.forEach((fv: any) => {
              response += `   • ${fv.fieldName}: ${fv.displayValue || 'No value'}\n`;
            });
          } else {
            // Single field
            response += `${index + 1}. **${result.fieldName}:** ${result.displayValue || result.value || 'No value'}\n`;
          }
        } else {
          response += `${index + 1}. **Error:** ${result.error}\n`;
        }
      });
      
      return {
        content: [{
          type: "text",
          text: response
        }]
      };
    } else {
      // Detailed format (default)
      let response = `📊 **Project Field Values** - ${project.title} (#${project.number})\n\n`;
      response += `**Project ID:** ${projectId}\n`;
      response += `**Available Fields:** ${projectFields.length}\n`;
      response += `**Query Results:** ${results.length}\n\n`;

      if (results.length === 0) {
        response += "No field values found matching the criteria.\n\n";
        response += `💡 **Available actions:**\n`;
        response += `• Use 'set_field_value' to set field values\n`;
        response += `• Use 'list_project_items' to see all project items`;
      } else {
        response += `## Field Value Results\n\n`;
        
        results.forEach((result, index) => {
          if (result.success) {
            response += `### ${index + 1}. `;
            
            // Item identification
            if (result.itemContent?.number) {
              const type = result.itemType === 'ISSUE' ? 'Issue' : result.itemType === 'PULL_REQUEST' ? 'Pull Request' : 'Item';
              response += `**${type} #${result.itemContent.number}: ${result.itemContent.title}**\n`;
              response += `   🔗 ${result.itemContent.url}\n`;
            } else if (result.itemContent?.title) {
              response += `**Draft: ${result.itemContent.title}**\n`;
            } else {
              response += `**Item ID: ${result.itemId}**\n`;
            }
            
            response += `   🆔 Item ID: ${result.itemId}\n`;
            
            if (result.fieldValues) {
              // Multiple fields
              response += `   📊 **Field Values (${result.totalFields}):**\n`;
              
              if (result.fieldValues.length === 0) {
                response += `      No field values set\n`;
              } else {
                result.fieldValues.forEach((fv: any) => {
                  response += `      • **${fv.fieldName}** (${fv.fieldType}): ${fv.displayValue || fv.value || 'No value'}\n`;
                  
                  if (args.include_field_history && fv.updatedAt && fv.updatedBy) {
                    response += `        📅 Updated: ${new Date(fv.updatedAt).toLocaleDateString()} by ${fv.updatedBy}\n`;
                  }
                });
              }
            } else {
              // Single field
              response += `   📝 **Field:** ${result.fieldName} (${result.fieldType})\n`;
              response += `   💎 **Value:** ${result.displayValue || result.value || 'No value'}\n`;
              
              if (result.message) {
                response += `   ℹ️ **Note:** ${result.message}\n`;
              }
              
              if (args.include_field_history && result.updatedAt && result.updatedBy) {
                response += `   📅 **Last Updated:** ${new Date(result.updatedAt).toLocaleDateString()} by ${result.updatedBy}\n`;
              }
            }
            
            response += `\n`;
          } else {
            response += `### ${index + 1}. ❌ **Error**\n`;
            response += `   Error: ${result.error}\n`;
            if (result.original) {
              response += `   Original: ${JSON.stringify(result.original)}\n`;
            }
            response += `\n`;
          }
        });

        // Show available fields information
        if (projectFields.length > 0) {
          response += `## Available Project Fields\n\n`;
          projectFields.forEach((field: any) => {
            response += `• **${field.name}** (${field.dataType})`;
            
            if (field.options && field.options.length > 0) {
              const options = field.options.map((opt: any) => opt.name).join(', ');
              response += ` - Options: ${options}`;
            }
            
            if (field.configuration?.iterations && field.configuration.iterations.length > 0) {
              const iterations = field.configuration.iterations.map((iter: any) => iter.title).join(', ');
              response += ` - Iterations: ${iterations}`;
            }
            
            response += `\n`;
          });
        }

        response += `\n🛠️ **Available Actions:**\n`;
        response += `• Use 'set_field_value' to update field values\n`;
        response += `• Use 'list_project_items' to see all items with field values\n`;
        response += `• Use format: 'json' for machine-readable output`;
      }

      return {
        content: [{
          type: "text",
          text: response
        }]
      };
    }
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to get project field values. Ensure your GitHub token has "project" scope and read access to the project.');
    }
    if (error.message?.includes('not found')) {
      throw new Error(`Project, item, or field not found: ${error.message}`);
    }
    throw new Error(`Failed to get field value: ${error.message}`);
  }
}
