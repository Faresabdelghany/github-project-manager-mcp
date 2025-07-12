import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface SetFieldValueArgs {
  project_id?: string;
  project_number?: number;
  item_id?: string;
  issue_number?: number;
  pr_number?: number;
  field_name?: string;
  field_id?: string;
  value: any;
  field_type?: 'text' | 'number' | 'date' | 'single_select' | 'iteration';
  bulk_updates?: Array<{
    item_id?: string;
    issue_number?: number;
    pr_number?: number;
    field_updates: Array<{
      field_name?: string;
      field_id?: string;
      value: any;
      field_type?: string;
    }>;
  }>;
  validate_before_update?: boolean;
}

/**
 * Set custom field values for GitHub Projects v2 items
 * Uses GraphQL mutation updateProjectV2ItemFieldValue
 */
export async function setFieldValue(config: GitHubConfig, args: SetFieldValueArgs): Promise<ToolResponse> {
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

    // Get project fields to resolve field names to IDs
    const projectFieldsQuery = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            id
            title
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
                content {
                  ... on Issue {
                    number
                    title
                  }
                  ... on PullRequest {
                    number
                    title
                  }
                  ... on DraftIssue {
                    title
                  }
                }
              }
            }
          }
        }
      }
    `;

    const projectData = await graphqlWithAuth(projectFieldsQuery, { projectId });
    const project = projectData.node;
    
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    const projectFields = project.fields?.nodes || [];
    const projectItems = project.items?.nodes || [];

    // Helper function to resolve field ID from name
    const resolveFieldId = (fieldName?: string, fieldId?: string): { id: string; field: any } | null => {
      if (fieldId) {
        const field = projectFields.find((f: any) => f.id === fieldId);
        return field ? { id: fieldId, field } : null;
      }
      
      if (fieldName) {
        const field = projectFields.find((f: any) => f.name.toLowerCase() === fieldName.toLowerCase());
        return field ? { id: field.id, field } : null;
      }
      
      return null;
    };

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

    // Helper function to prepare field value based on type
    const prepareFieldValue = (value: any, field: any): any => {
      const dataType = field.dataType;
      
      switch (dataType) {
        case 'TEXT':
          return { text: String(value) };
        
        case 'NUMBER':
          const numValue = Number(value);
          if (isNaN(numValue)) {
            throw new Error(`Invalid number value: ${value}`);
          }
          return { number: numValue };
        
        case 'DATE':
          let dateValue: string;
          if (value instanceof Date) {
            dateValue = value.toISOString().split('T')[0];
          } else if (typeof value === 'string') {
            // Validate date format (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              throw new Error(`Invalid date format: ${value}. Use YYYY-MM-DD format.`);
            }
            dateValue = value;
          } else {
            throw new Error(`Invalid date value: ${value}`);
          }
          return { date: dateValue };
        
        case 'SINGLE_SELECT':
          // Find option by name
          const option = field.options?.find((opt: any) => 
            opt.name.toLowerCase() === String(value).toLowerCase()
          );
          if (!option) {
            const availableOptions = field.options?.map((opt: any) => opt.name).join(', ') || 'none';
            throw new Error(`Invalid option: ${value}. Available options: ${availableOptions}`);
          }
          return { singleSelectOptionId: option.id };
        
        case 'ITERATION':
          // Find iteration by title or ID
          const iteration = field.configuration?.iterations?.find((iter: any) => 
            iter.title.toLowerCase() === String(value).toLowerCase() || iter.id === value
          );
          if (!iteration) {
            const availableIterations = field.configuration?.iterations?.map((iter: any) => iter.title).join(', ') || 'none';
            throw new Error(`Invalid iteration: ${value}. Available iterations: ${availableIterations}`);
          }
          return { iterationId: iteration.id };
        
        default:
          throw new Error(`Unsupported field type: ${dataType}`);
      }
    };

    const results: any[] = [];
    let totalUpdated = 0;

    // Handle bulk updates
    if (args.bulk_updates && args.bulk_updates.length > 0) {
      for (const bulkItem of args.bulk_updates) {
        let itemId = bulkItem.item_id;

        // Find item ID by issue/PR number if not provided
        if (!itemId) {
          itemId = findItemId(bulkItem.issue_number, bulkItem.pr_number);
        }

        if (!itemId) {
          results.push({
            success: false,
            error: `Item not found in project (issue: ${bulkItem.issue_number}, PR: ${bulkItem.pr_number})`,
            original: bulkItem
          });
          continue;
        }

        const itemResults: any[] = [];
        
        for (const fieldUpdate of bulkItem.field_updates) {
          try {
            const fieldInfo = resolveFieldId(fieldUpdate.field_name, fieldUpdate.field_id);
            if (!fieldInfo) {
              itemResults.push({
                success: false,
                error: `Field not found: ${fieldUpdate.field_name || fieldUpdate.field_id}`,
                fieldUpdate
              });
              continue;
            }

            const fieldValue = prepareFieldValue(fieldUpdate.value, fieldInfo.field);

            const updateMutation = `
              mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
                updateProjectV2ItemFieldValue(input: {
                  projectId: $projectId
                  itemId: $itemId
                  fieldId: $fieldId
                  value: $value
                }) {
                  projectV2Item {
                    id
                  }
                }
              }
            `;

            const updateResult = await graphqlWithAuth(updateMutation, {
              projectId,
              itemId,
              fieldId: fieldInfo.id,
              value: fieldValue
            });

            if (updateResult.updateProjectV2ItemFieldValue?.projectV2Item) {
              itemResults.push({
                success: true,
                fieldName: fieldInfo.field.name,
                fieldId: fieldInfo.id,
                value: fieldUpdate.value,
                fieldUpdate
              });
              totalUpdated++;
            }
          } catch (error: any) {
            itemResults.push({
              success: false,
              error: error.message,
              fieldUpdate
            });
          }
        }

        results.push({
          itemId,
          itemUpdates: itemResults,
          original: bulkItem
        });
      }
    } else {
      // Handle single item update
      let itemId = args.item_id;

      // Find item ID by issue/PR number if not provided
      if (!itemId) {
        itemId = findItemId(args.issue_number, args.pr_number);
      }

      if (!itemId) {
        throw new Error(`Item not found in project (issue: ${args.issue_number}, PR: ${args.pr_number})`);
      }

      const fieldInfo = resolveFieldId(args.field_name, args.field_id);
      if (!fieldInfo) {
        throw new Error(`Field not found: ${args.field_name || args.field_id}`);
      }

      // Validate before update if requested
      if (args.validate_before_update) {
        const availableOptions = fieldInfo.field.options?.map((opt: any) => opt.name) || [];
        const availableIterations = fieldInfo.field.configuration?.iterations?.map((iter: any) => iter.title) || [];
        
        let response = `🔍 **Field Validation Report**\n\n`;
        response += `**Field Name:** ${fieldInfo.field.name}\n`;
        response += `**Field Type:** ${fieldInfo.field.dataType}\n`;
        response += `**Proposed Value:** ${args.value}\n\n`;
        
        if (availableOptions.length > 0) {
          response += `**Available Options:** ${availableOptions.join(', ')}\n`;
        }
        
        if (availableIterations.length > 0) {
          response += `**Available Iterations:** ${availableIterations.join(', ')}\n`;
        }
        
        response += `\n💡 Set validate_before_update to false to proceed with the update.`;
        
        return {
          content: [{
            type: "text",
            text: response
          }]
        };
      }

      const fieldValue = prepareFieldValue(args.value, fieldInfo.field);

      const updateMutation = `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: $value
          }) {
            projectV2Item {
              id
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
            }
          }
        }
      `;

      const updateResult = await graphqlWithAuth(updateMutation, {
        projectId,
        itemId,
        fieldId: fieldInfo.id,
        value: fieldValue
      });

      if (updateResult.updateProjectV2ItemFieldValue?.projectV2Item) {
        results.push({
          success: true,
          itemId,
          fieldName: fieldInfo.field.name,
          fieldId: fieldInfo.id,
          value: args.value,
          updatedItem: updateResult.updateProjectV2ItemFieldValue.projectV2Item
        });
        totalUpdated++;
      }
    }

    // Format response
    let response = `📊 **Field Value(s) Updated Successfully!**\n\n`;
    response += `**Total Updates:** ${totalUpdated}\n`;
    response += `**Project ID:** ${projectId}\n\n`;

    if (results.length > 0) {
      response += `## Update Results\n\n`;
      
      results.forEach((result, index) => {
        if (result.success && !result.itemUpdates) {
          // Single item update
          response += `### ${index + 1}. ✅ **Field Updated**\n`;
          response += `   📝 Field: ${result.fieldName}\n`;
          response += `   💎 Value: ${result.value}\n`;
          response += `   🆔 Item ID: ${result.itemId}\n`;
          
          // Show updated field values if available
          if (result.updatedItem?.fieldValues?.nodes) {
            response += `   📊 **All Field Values:**\n`;
            result.updatedItem.fieldValues.nodes.forEach((fieldValue: any) => {
              if (fieldValue.field?.name) {
                let value = fieldValue.text || fieldValue.number || fieldValue.name || fieldValue.date;
                if (fieldValue.title) {
                  value = `${fieldValue.title} (${fieldValue.startDate} - ${fieldValue.duration} days)`;
                }
                response += `      • ${fieldValue.field.name}: ${value}\n`;
              }
            });
          }
          
          response += `\n`;
        } else if (result.itemUpdates) {
          // Bulk item updates
          const successCount = result.itemUpdates.filter((u: any) => u.success).length;
          response += `### ${index + 1}. **Item Updates** (${successCount}/${result.itemUpdates.length} successful)\n`;
          response += `   🆔 Item ID: ${result.itemId}\n`;
          
          result.itemUpdates.forEach((update: any, updateIndex: number) => {
            if (update.success) {
              response += `   ${updateIndex + 1}. ✅ ${update.fieldName}: ${update.value}\n`;
            } else {
              response += `   ${updateIndex + 1}. ❌ ${update.fieldUpdate.field_name || update.fieldUpdate.field_id}: ${update.error}\n`;
            }
          });
          
          response += `\n`;
        } else if (!result.success) {
          response += `### ${index + 1}. ❌ **Failed Update**\n`;
          response += `   Error: ${result.error}\n`;
          if (result.original) {
            response += `   Original: ${JSON.stringify(result.original)}\n`;
          }
          response += `\n`;
        }
      });
    }

    if (totalUpdated > 0) {
      response += `🎯 **Next Steps:**\n`;
      response += `• Use 'get_field_value' to verify the updates\n`;
      response += `• Use 'list_project_items' with include_field_values to see all field values\n`;
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
      throw new Error('Insufficient permissions to update project field values. Ensure your GitHub token has "project" scope and write access to the project.');
    }
    if (error.message?.includes('not found')) {
      throw new Error(`Project, item, or field not found: ${error.message}`);
    }
    throw new Error(`Failed to set field value: ${error.message}`);
  }
}
