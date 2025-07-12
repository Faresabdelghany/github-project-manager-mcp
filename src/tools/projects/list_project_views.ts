import { GitHubConfig, ToolResponse } from '../../shared/types.js';

interface ListProjectViewsArgs {
  project_number?: number;
  project_id?: string;
  layout_filter?: 'BOARD_LAYOUT' | 'TABLE_LAYOUT' | 'ROADMAP_LAYOUT';
  include_system_views?: boolean;
  detailed?: boolean;
}

/**
 * List all views in a GitHub Project v2
 * Uses GraphQL query projectV2.views
 */
export async function listProjectViews(config: GitHubConfig, args: ListProjectViewsArgs): Promise<ToolResponse> {
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

    // Get all views for the project
    const viewsQuery = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            title
            views(first: 100) {
              nodes {
                id
                name
                layout
                createdAt
                updatedAt
                filter
                sortBy {
                  field {
                    ... on ProjectV2Field {
                      name
                      dataType
                    }
                    ... on ProjectV2SingleSelectField {
                      name
                      dataType
                    }
                    ... on ProjectV2IterationField {
                      name
                      dataType
                    }
                  }
                  direction
                }
                groupBy {
                  field {
                    ... on ProjectV2Field {
                      name
                      dataType
                    }
                    ... on ProjectV2SingleSelectField {
                      name
                      dataType
                    }
                    ... on ProjectV2IterationField {
                      name
                      dataType
                    }
                  }
                }
                visibleFields {
                  ... on ProjectV2Field {
                    name
                    dataType
                  }
                  ... on ProjectV2SingleSelectField {
                    name
                    dataType
                  }
                  ... on ProjectV2IterationField {
                    name
                    dataType
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await graphqlWithAuth(viewsQuery, { projectId });
    
    if (!result.node) {
      throw new Error('Project not found or access denied');
    }

    const project = result.node;
    let views = project.views.nodes || [];

    // Add system views information if requested
    const systemViews = [
      { 
        name: 'All items', 
        layout: 'TABLE_LAYOUT', 
        isSystem: true,
        description: 'Default table view showing all project items'
      }
    ];

    // Filter by layout if specified
    if (args.layout_filter) {
      views = views.filter((view: any) => view.layout === args.layout_filter);
      
      if (args.include_system_views) {
        const filteredSystemViews = systemViews.filter(view => view.layout === args.layout_filter);
        views = [...filteredSystemViews, ...views];
      }
    } else if (args.include_system_views) {
      views = [...systemViews, ...views];
    }

    let response = `👁️ **Project Views** - ${projectTitle || 'Project'}\n\n`;
    response += `**Total Views:** ${views.length}\n`;
    
    if (args.layout_filter) {
      response += `**Filtered by:** ${args.layout_filter.replace('_LAYOUT', '').toLowerCase()} layout\n`;
    }
    
    if (args.include_system_views) {
      response += `**Includes:** System views\n`;
    }
    
    response += `\n`;

    if (views.length === 0) {
      response += "No views found matching the criteria.";
      response += `\n\n💡 **Tip:** Use 'create_project_view' to create new views for better project organization.`;
    } else {
      // Group views by layout for better organization
      const viewsByLayout: { [key: string]: any[] } = {};
      
      views.forEach((view: any) => {
        const layout = view.layout || 'UNKNOWN';
        if (!viewsByLayout[layout]) {
          viewsByLayout[layout] = [];
        }
        viewsByLayout[layout].push(view);
      });

      // Display views grouped by layout
      Object.entries(viewsByLayout).forEach(([layout, layoutViews]) => {
        const layoutName = layout.replace('_LAYOUT', '').toLowerCase();
        const layoutEmoji = layout === 'BOARD_LAYOUT' ? '📋' : layout === 'TABLE_LAYOUT' ? '📊' : layout === 'ROADMAP_LAYOUT' ? '🗺️' : '📄';
        
        response += `## ${layoutEmoji} ${layoutName.charAt(0).toUpperCase() + layoutName.slice(1)} Views (${layoutViews.length})\n\n`;
        
        layoutViews.forEach((view: any) => {
          const isSystem = view.isSystem || false;
          const systemIndicator = isSystem ? ' 🔧' : '';
          
          response += `### **${view.name}**${systemIndicator}\n`;
          
          if (!isSystem) {
            response += `**ID:** ${view.id}\n`;
            response += `**Created:** ${new Date(view.createdAt).toLocaleDateString()}\n`;
            
            if (view.updatedAt !== view.createdAt) {
              response += `**Updated:** ${new Date(view.updatedAt).toLocaleDateString()}\n`;
            }
          } else if (view.description) {
            response += `**Description:** ${view.description}\n`;
          }

          // Add view configuration details if detailed view is requested
          if (args.detailed || !isSystem) {
            if (view.filter) {
              response += `**Filter:** \`${view.filter}\`\n`;
            }

            if (view.sortBy && view.sortBy.length > 0) {
              const sorts = view.sortBy.map((sort: any) => 
                `${sort.field.name} (${sort.direction})`
              ).join(', ');
              response += `**Sort:** ${sorts}\n`;
            }

            if (view.groupBy && view.groupBy.length > 0) {
              const groups = view.groupBy.map((group: any) => group.field.name).join(', ');
              response += `**Group by:** ${groups}\n`;
            }

            if (view.visibleFields && view.visibleFields.length > 0) {
              const fieldCount = view.visibleFields.length;
              response += `**Visible fields:** ${fieldCount} fields configured\n`;
              
              if (args.detailed) {
                const fieldNames = view.visibleFields.map((field: any) => field.name).join(', ');
                response += `**Fields:** ${fieldNames}\n`;
              }
            }

            // Add layout-specific features
            if (layout === 'BOARD_LAYOUT') {
              response += `**Features:** Kanban board, drag-and-drop, column grouping\n`;
            } else if (layout === 'TABLE_LAYOUT') {
              response += `**Features:** Spreadsheet view, bulk editing, sortable columns\n`;
            } else if (layout === 'ROADMAP_LAYOUT') {
              response += `**Features:** Timeline view, date planning, milestone tracking\n`;
            }
          }

          response += `\n`;
        });
      });

      // Add view statistics
      response += `## 📊 **View Statistics**\n\n`;
      Object.entries(viewsByLayout).forEach(([layout, layoutViews]) => {
        const layoutName = layout.replace('_LAYOUT', '').toLowerCase();
        const customViews = layoutViews.filter((v: any) => !v.isSystem);
        const systemViews = layoutViews.filter((v: any) => v.isSystem);
        
        response += `- **${layoutName.charAt(0).toUpperCase() + layoutName.slice(1)}:** ${layoutViews.length} total`;
        if (args.include_system_views && systemViews.length > 0) {
          response += ` (${customViews.length} custom, ${systemViews.length} system)`;
        }
        response += `\n`;
      });

      // Add insights and recommendations
      response += `\n## 💡 **Insights & Recommendations**\n\n`;
      
      const totalCustomViews = views.filter((v: any) => !v.isSystem).length;
      const boardViews = viewsByLayout['BOARD_LAYOUT']?.length || 0;
      const tableViews = viewsByLayout['TABLE_LAYOUT']?.length || 0;
      const roadmapViews = viewsByLayout['ROADMAP_LAYOUT']?.length || 0;

      if (totalCustomViews === 0) {
        response += `- 🚀 **Getting started:** Create your first custom view to organize work better\n`;
      } else if (totalCustomViews < 3) {
        response += `- 📈 **Optimization:** Consider creating specialized views for different workflows\n`;
      }

      if (boardViews === 0) {
        response += `- 📋 **Board view:** Great for kanban workflows and visual task tracking\n`;
      }

      if (roadmapViews === 0) {
        response += `- 🗺️ **Roadmap view:** Perfect for timeline planning and milestone tracking\n`;
      }

      const viewsWithFilters = views.filter((v: any) => v.filter && !v.isSystem).length;
      if (viewsWithFilters === 0 && totalCustomViews > 0) {
        response += `- 🔍 **Filtering:** Add filters to views for focused work sessions\n`;
      }
    }

    response += `\n## 🛠️ **Next Steps**\n\n`;
    response += `• Use 'create_project_view' to add new views for specific workflows\n`;
    response += `• Use 'update_project_view' to modify existing view configurations\n`;
    response += `• Configure field visibility and ordering in the project interface\n`;
    response += `• Set up automation rules based on view changes\n`;
    response += `• Share specific views with team members for focused collaboration`;

    return {
      content: [{
        type: "text",
        text: response
      }]
    };
  } catch (error: any) {
    if (error.message?.includes('insufficient permission')) {
      throw new Error('Insufficient permissions to access project views. Ensure your GitHub token has "project" scope.');
    }
    throw new Error(`Failed to list project views: ${error.message}`);
  }
}
