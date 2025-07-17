import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface CreateProjectArgs {
  title: string;
  description?: string;
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
    // First, determine if we're dealing with a user or organization
    const ownerQuery = `
      query($login: String!) {
        user(login: $login) {
          id
          login
          __typename
        }
        organization(login: $login) {
          id
          login
          __typename
        }
      }
    `;

    const ownerResult = await graphqlWithAuth(ownerQuery, { login: owner });
    
    let ownerId;
    let ownerType;
    
    if (ownerResult.user && !ownerResult.organization) {
      ownerId = ownerResult.user.id;
      ownerType = 'User';
      console.error(`✅ Detected personal account: ${ownerResult.user.login}`);
    } else if (ownerResult.organization && !ownerResult.user) {
      ownerId = ownerResult.organization.id;
      ownerType = 'Organization';
      console.error(`✅ Detected organization: ${ownerResult.organization.login}`);
    } else if (ownerResult.user && ownerResult.organization) {
      // Handle case where both exist (shouldn't happen normally)
      ownerId = ownerResult.user.id;
      ownerType = 'User';
      console.error(`⚠️ Both user and organization found, using user: ${ownerResult.user.login}`);
    } else {
      throw new Error(`Could not find user or organization with login: ${owner}. Please check the GITHUB_OWNER environment variable.`);
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
            public
            closed
            createdAt
            updatedAt
            owner {
              ... on User {
                login
                id
                __typename
              }
              ... on Organization {
                login
                id
                __typename
              }
            }
          }
        }
      }
    `;

    const input = {
      ownerId,
      title: args.title,
      ...(args.description && { shortDescription: args.description })
    };

    console.error(`🚀 Creating project for ${ownerType}: ${owner} with input:`, JSON.stringify(input, null, 2));
    
    if (ownerType === 'User') {
      console.error(`📝 Note: Personal accounts can create projects. If you encounter permission issues, ensure your GitHub token has the "project" scope.`);
    }

    const result = await graphqlWithAuth(createProjectMutation, { input });
    const project = result.createProjectV2.projectV2;

    let response = `🚀 **Project created successfully!**\n\n`;
    response += `**Title:** ${project.title}\n`;
    response += `**Number:** #${project.number}\n`;
    response += `**ID:** ${project.id}\n`;
    response += `**Owner Type:** ${ownerType}\n`;
    response += `**Owner:** ${project.owner.login}\n`;
    response += `**Description:** ${project.shortDescription || 'None'}\n`;
    response += `**Visibility:** ${project.public ? 'Public' : 'Private'}\n`;
    response += `**Status:** ${project.closed ? 'Closed' : 'Open'}\n`;
    response += `**Created:** ${new Date(project.createdAt).toLocaleDateString()}\n`;
    response += `**URL:** ${project.url}\n\n`;
    
    response += `💡 **Next Steps:**\n`;
    response += `• Use 'add_project_item' to add issues or pull requests\n`;
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
    console.error(`❌ Create project failed:`, error);
    
    if (error.message?.includes('Must have admin access') || error.message?.includes('Must be an organization')) {
      throw new Error(`Permission denied. For personal accounts, ensure your GitHub token has the "project" scope. For organizations, you need admin access.`);
    }
    if (error.message?.includes('insufficient permission') || error.message?.includes('admin access')) {
      throw new Error('Insufficient permissions to create projects. Please ensure your GitHub token has the "project" scope. Run: gh auth login --scopes "project"');
    }
    if (error.message?.includes('already exists')) {
      throw new Error(`Project with title "${args.title}" already exists. Choose a different title.`);
    }
    if (error.message?.includes('Could not resolve to an Organization')) {
      throw new Error(`GitHub account "${owner}" was not found. Please verify the GITHUB_OWNER environment variable is set correctly.`);
    }
    if (error.message?.includes('Bad credentials') || error.message?.includes('401')) {
      throw new Error('Authentication failed. Please check your GitHub token and run: gh auth login --scopes "project"');
    }
    throw new Error(`Failed to create project: ${error.message}`);
  }
}