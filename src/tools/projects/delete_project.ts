import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface DeleteProjectArgs {
  project_number?: number;
  project_id?: string;
  confirm?: boolean;
  force?: boolean;
}

/**
 * Delete GitHub Project v2 safely
 * Uses GraphQL mutation deleteProjectV2
 */
export async function deleteProject(config: GitHubConfig, args: DeleteProjectArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  if (!args.project_number && !args.project_id) {
    throw new Error('Either project_number or project_id is required');
  }

  if (!args.confirm && !args.force) {
    throw new Error('Deletion requires confirmation. Set confirm: true to proceed with deletion.');
  }

  try {
    let projectId = args.project_id;
    let projectInfo: any = null;

    // If project_number provided, get the project ID and info first
    if (!projectId && args.project_number) {
      const getProjectQuery = `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              id
              title
              shortDescription
              items {
                totalCount
              }
              closed
            }
          }
          organization(login: $login) {
            projectV2(number: $number) {
              id
              title
              shortDescription
              items {
                totalCount
              }
              closed
            }
          }
        }
      `;

      const projectResult = await graphqlWithAuth(getProjectQuery, {
        login: owner,
        number: args.project_number
      });

      projectInfo = projectResult.user?.projectV2 || projectResult.organization?.projectV2;
      projectId = projectInfo?.id;
      
      if (!projectId) {
        throw new Error(`Project #${args.project_number} not found`);
      }
    } else if (projectId) {
      // Get project info by ID for safety checks
      const getProjectByIdQuery = `
        query($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectV2 {
              id
              number
              title
              shortDescription
              items {
                totalCount
              }
              closed
            }
          }
        }
      `;

      const projectResult = await graphqlWithAuth(getProjectByIdQuery, { projectId });
      projectInfo = projectResult.node;
      
      if (!projectInfo) {
        throw new Error(`Project with ID ${projectId} not found`);
      }
    }

    // Safety checks before deletion
    if (!args.force) {
      // Check if project has items
      if (projectInfo.items?.totalCount > 0) {
        let warningResponse = `⚠️ **WARNING: Project contains items!**\n\n`;
        warningResponse += `**Project:** ${projectInfo.title} (#${projectInfo.number || 'N/A'})\n`;
        warningResponse += `**Items:** ${projectInfo.items.totalCount} issues/pull requests\n`;
        warningResponse += `**Status:** ${projectInfo.closed ? 'Closed' : 'Open'}\n\n`;
        warningResponse += `🚨 **This project contains ${projectInfo.items.totalCount} items. Deleting will remove all project data.**\n\n`;
        warningResponse += `**To proceed safely:**\n`;
        warningResponse += `1. Consider archiving instead of deleting (use update_project with closed: true)\n`;
        warningResponse += `2. Export project data if needed\n`;
        warningResponse += `3. Remove items first if you want to preserve them\n`;
        warningResponse += `4. Use force: true to bypass this warning\n\n`;
        warningResponse += `**To force deletion anyway:**\n`;
        warningResponse += `Call delete_project with force: true to bypass item count check.`;

        return {
          content: [{
            type: "text",
            text: warningResponse
          }]
        };
      }

      // Check if project is still open
      if (!projectInfo.closed) {
        let warningResponse = `⚠️ **WARNING: Project is still open!**\n\n`;
        warningResponse += `**Project:** ${projectInfo.title} (#${projectInfo.number || 'N/A'})\n`;
        warningResponse += `**Status:** Open project\n\n`;
        warningResponse += `💡 **Recommendation:** Consider closing the project first using:\n`;
        warningResponse += `update_project with closed: true\n\n`;
        warningResponse += `**To force deletion anyway:**\n`;
        warningResponse += `Call delete_project with force: true to bypass this warning.`;

        return {
          content: [{
            type: "text",
            text: warningResponse
          }]
        };
      }
    }

    // Proceed with deletion
    const deleteProjectMutation = `
      mutation($input: DeleteProjectV2Input!) {
        deleteProjectV2(input: $input) {
          projectV2 {
            id
            number
            title
          }
        }
      }
    `;

    const deleteResult = await graphqlWithAuth(deleteProjectMutation, {
      input: { projectId }
    });

    const deletedProject = deleteResult.deleteProjectV2.projectV2;

    let response = `🗑️ **Project deleted successfully!**\n\n`;
    response += `**Deleted Project:** ${deletedProject.title}\n`;
    response += `**Number:** #${deletedProject.number || 'N/A'}\n`;
    response += `**ID:** ${deletedProject.id}\n`;
    response += `**Deletion Time:** ${new Date().toLocaleString()}\n\n`;

    if (projectInfo.items?.totalCount > 0) {
      response += `⚠️ **Data Loss:** ${projectInfo.items.totalCount} project items were permanently removed.\n\n`;
    }

    response += `✅ **Deletion Complete:**\n`;
    response += `• Project and all associated data have been permanently removed\n`;
    response += `• Project items (issues/PRs) remain in their repositories but are no longer associated with this project\n`;
    response += `• Custom fields, views, and project configuration have been deleted\n\n`;

    response += `💡 **Next Steps:**\n`;
    response += `• Use 'list_projects' to view remaining projects\n`;
    response += `• Use 'create_project' to create a new project\n`;
    response += `• Check repository issues/PRs if you need to track the former project items`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to delete project. Ensure your GitHub token has "project" scope and you have admin access to this project.');
    }
    if (error.message?.includes('Could not resolve')) {
      throw new Error(`Project not found: ${args.project_number || args.project_id}. Check the project number/ID and your access permissions.`);
    }
    if (error.message?.includes('Project cannot be deleted')) {
      throw new Error('Project cannot be deleted. It may be linked to other resources or you may not have the required permissions.');
    }
    throw new Error(`Failed to delete project: ${error.message}`);
  }
}