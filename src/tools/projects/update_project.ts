import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface UpdateProjectArgs {
  project_number?: number;
  project_id?: string;
  title?: string;
  description?: string;
  readme?: string;
  visibility?: 'PRIVATE' | 'PUBLIC';
  public?: boolean;
  closed?: boolean;
}

/**
 * Update GitHub Project v2 information
 * Uses GraphQL mutation updateProjectV2
 */
export async function updateProject(config: GitHubConfig, args: UpdateProjectArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  if (!args.project_number && !args.project_id) {
    throw new Error('Either project_number or project_id is required');
  }

  // Check if at least one field to update is provided
  const fieldsToUpdate = ['title', 'description', 'readme', 'visibility', 'public', 'closed'];
  const hasUpdates = fieldsToUpdate.some(field => args[field as keyof UpdateProjectArgs] !== undefined);
  
  if (!hasUpdates) {
    throw new Error('At least one field must be provided to update (title, description, readme, visibility, public, closed)');
  }

  try {
    let projectId = args.project_id;

    // If project_number provided, get the project ID first
    if (!projectId && args.project_number) {
      const getIdQuery = `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              id
            }
          }
          organization(login: $login) {
            projectV2(number: $number) {
              id
            }
          }
        }
      `;

      const idResult = await graphqlWithAuth(getIdQuery, {
        login: owner,
        number: args.project_number
      });

      projectId = idResult.user?.projectV2?.id || idResult.organization?.projectV2?.id;
      
      if (!projectId) {
        throw new Error(`Project #${args.project_number} not found`);
      }
    }

    // Prepare the update input
    const input: any = {
      projectId
    };

    if (args.title !== undefined) input.title = args.title;
    if (args.description !== undefined) input.shortDescription = args.description;
    if (args.readme !== undefined) input.readme = args.readme;
    if (args.public !== undefined) input.public = args.public;
    if (args.closed !== undefined) input.closed = args.closed;

    // Update the project using GraphQL mutation
    const updateProjectMutation = `
      mutation($input: UpdateProjectV2Input!) {
        updateProjectV2(input: $input) {
          projectV2 {
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
          }
        }
      }
    `;

    const result = await graphqlWithAuth(updateProjectMutation, { input });
    const project = result.updateProjectV2.projectV2;

    const status = project.closed ? '🔒 Closed' : '🟢 Open';
    const visibility = project.public ? '🌐 Public' : '🔒 Private';

    let response = `✅ **Project updated successfully!**\n\n`;
    response += `**Title:** ${project.title}\n`;
    response += `**Number:** #${project.number}\n`;
    response += `**ID:** ${project.id}\n`;
    response += `**Status:** ${status}\n`;
    response += `**Visibility:** ${visibility}\n`;
    response += `**Owner:** ${project.owner.login}\n`;
    response += `**Updated:** ${new Date(project.updatedAt).toLocaleDateString()}\n`;
    response += `**URL:** ${project.url}\n\n`;

    if (project.shortDescription) {
      response += `**Description:** ${project.shortDescription}\n\n`;
    }

    if (project.readme) {
      response += `**README:** ${project.readme.length > 100 ? project.readme.substring(0, 100) + '...' : project.readme}\n\n`;
    }

    // Show what was updated
    response += `🔄 **Changes Made:**\n`;
    if (args.title !== undefined) {
      response += `• Title updated to: "${project.title}"\n`;
    }
    if (args.description !== undefined) {
      response += `• Description updated\n`;
    }
    if (args.readme !== undefined) {
      response += `• README updated\n`;
    }
    if (args.public !== undefined) {
      response += `• Visibility changed to: ${project.public ? 'Public' : 'Private'}\n`;
    }
    if (args.closed !== undefined) {
      response += `• Status changed to: ${project.closed ? 'Closed' : 'Open'}\n`;
    }

    response += `\n💡 **Next Steps:**\n`;
    response += `• Use 'get_project' to view complete updated details\n`;
    response += `• Use 'add_item_to_project' to manage project items\n`;
    response += `• Visit the project URL to configure fields and views`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to update project. Ensure your GitHub token has "project" scope and you have admin access to this project.');
    }
    if (error.message?.includes('Could not resolve')) {
      throw new Error(`Project not found: ${args.project_number || args.project_id}. Check the project number/ID and your access permissions.`);
    }
    if (error.message?.includes('title already exists')) {
      throw new Error(`A project with the title "${args.title}" already exists. Choose a different title.`);
    }
    throw new Error(`Failed to update project: ${error.message}`);
  }
}