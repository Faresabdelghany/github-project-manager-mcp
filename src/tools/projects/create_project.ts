import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface CreateProjectArgs {
  title: string;
  description?: string;
  visibility?: 'PRIVATE' | 'PUBLIC';
  template?: string;
}

/**
 * Create a new GitHub Project v2
 * Uses GraphQL mutation createProjectV2
 */
export async function createProject(config: GitHubConfig, args: CreateProjectArgs): Promise<ToolResponse> {
  const { graphqlWithAuth, owner } = config;

  if (!owner) {
    throw new Error('GITHUB_OWNER environment variable is required for project operations');
  }

  try {
    // First, get the owner ID (user or organization)
    const ownerQuery = `
      query($login: String!) {
        user(login: $login) {
          id
          login
        }
        organization(login: $login) {
          id
          login
        }
      }
    `;

    const ownerResult = await graphqlWithAuth(ownerQuery, { login: owner });
    const ownerId = ownerResult.user?.id || ownerResult.organization?.id;
    
    if (!ownerId) {
      throw new Error(`Unable to find user or organization: ${owner}`);
    }

    // Create the project using GraphQL mutation
    const createProjectMutation = `
      mutation($input: CreateProjectV2Input!) {
        createProjectV2(input: $input) {
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

    const input = {
      ownerId,
      title: args.title,
      ...(args.description && { shortDescription: args.description }),
      ...(args.visibility && { visibility: args.visibility })
    };

    const result = await graphqlWithAuth(createProjectMutation, { input });
    const project = result.createProjectV2.projectV2;

    let response = `🚀 **Project created successfully!**\n\n`;
    response += `**Title:** ${project.title}\n`;
    response += `**Number:** #${project.number}\n`;
    response += `**ID:** ${project.id}\n`;
    response += `**Description:** ${project.shortDescription || 'None'}\n`;
    response += `**Visibility:** ${project.visibility}\n`;
    response += `**Public:** ${project.public ? 'Yes' : 'No'}\n`;
    response += `**Owner:** ${project.owner.login}\n`;
    response += `**Status:** ${project.closed ? 'Closed' : 'Open'}\n`;
    response += `**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n`;
    response += `**URL:** ${project.url}\n\n`;
    
    response += `💡 **Next Steps:**\n`;
    response += `• Use 'add_item_to_project' to add issues or pull requests\n`;
    response += `• Use 'get_project' to view detailed project information\n`;
    response += `• Use 'list_projects' to see all your projects\n`;
    response += `• Visit the project URL to configure fields and views`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to create projects. Ensure your GitHub token has "project" scope and appropriate organization permissions.');
    }
    if (error.message?.includes('already exists')) {
      throw new Error(`Project with title "${args.title}" already exists. Choose a different title.`);
    }
    throw new Error(`Failed to create project: ${error.message}`);
  }
}