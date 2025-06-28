# GitHub Project Manager MCP - Complete Edition

A comprehensive GitHub-integrated project management MCP server for Claude Desktop with **46 professional-grade tools** for complete project lifecycle management.

## 🎯 Complete Feature Set

### 🚀 **Project Management (5 tools)**
- `create_project` - Create new GitHub projects
- `list_projects` - List existing GitHub projects  
- `get_project` - Get details of a specific project
- `update_project` - Update project information
- `delete_project` - Delete projects

### 🎯 **Milestone Management (7 tools)**
- `create_milestone` - Create project milestones
- `list_milestones` - List milestones with filtering options
- `update_milestone` - Update milestone details
- `delete_milestone` - Delete milestones
- `get_milestone_metrics` - Get progress metrics for milestones
- `get_overdue_milestones` - Find overdue milestones
- `get_upcoming_milestones` - Get upcoming milestones within timeframes

### 🐛 **Issue Management (4 tools)**
- `create_issue` - Create new GitHub issues
- `list_issues` - List issues with filtering and sorting
- `get_issue` - Get detailed issue information
- `update_issue` - Update existing issues

### 🏃‍♂️ **Sprint Management (8 tools)**
- `create_sprint` - Create development sprints
- `list_sprints` - List all sprints
- `get_current_sprint` - Get the active sprint
- `update_sprint` - Update sprint details
- `add_issues_to_sprint` - Add issues to existing sprints
- `remove_issues_from_sprint` - Remove issues from sprints
- `get_sprint_metrics` - Get sprint progress metrics
- `plan_sprint` - Plan new sprints with selected issues

### 📋 **Advanced Project Planning (5 tools)**
- `create_roadmap` - Create comprehensive project roadmaps
- `generate_prd` - Generate Product Requirements Documents
- `parse_prd` - Parse PRDs and generate actionable development tasks
- `enhance_prd` - Enhance existing PRDs
- `add_feature` - Add new features to existing projects with impact analysis

### 🎲 **Task Management (3 tools)**
- `get_next_task` - Get AI recommendations for next tasks to work on
- `analyze_task_complexity` - Perform detailed task complexity analysis
- `expand_task` - Break down complex tasks into manageable subtasks

### 🔧 **Project Structure (6 tools)**
- `create_project_field` - Create custom fields for projects
- `list_project_fields` - List all project fields
- `update_project_field` - Update custom fields
- `create_project_view` - Create project views (board, table, timeline, roadmap)
- `list_project_views` - List all project views
- `update_project_view` - Update project views

### 📦 **Project Items (5 tools)**
- `add_project_item` - Add items to projects
- `remove_project_item` - Remove items from projects
- `list_project_items` - List all project items
- `set_field_value` - Set field values for project items
- `get_field_value` - Get field values for project items

### 🏷️ **Labels (2 tools)**
- `create_label` - Create new GitHub labels
- `list_labels` - List all available labels

### 🔗 **Requirements Traceability (1 tool)**
- `create_traceability_matrix` - Create comprehensive traceability matrices

## 🚀 Installation & Setup

### 1. Clone and Build
```bash
git clone https://github.com/Faresabdelghany/github-project-manager-mcp.git
cd github-project-manager-mcp
npm install
npm run build
```

### 2. GitHub Token Setup
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with these scopes:
   - `repo` (Full control of private repositories)
   - `write:org` (Write organization data)
   - `read:org` (Read organization data)
   - `project` (Full control of projects)

### 3. Claude Desktop Configuration

Add this to your Claude Desktop MCP configuration file:

**Configuration File Location:**
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "github-project-manager": {
      "command": "node",
      "args": ["/path/to/github-project-manager-mcp/build/index.js"],
      "env": {
        "GITHUB_TOKEN": "your-github-personal-access-token",
        "GITHUB_OWNER": "your-github-username",
        "GITHUB_REPO": "your-repository-name"
      }
    }
  }
}
```

**Replace:**
- `/path/to/github-project-manager-mcp/build/index.js` with actual path
- `your-github-personal-access-token` with your GitHub token
- `your-github-username` with your GitHub username
- `your-repository-name` with target repository

### 4. Restart Claude Desktop
After saving the configuration, restart Claude Desktop to load the MCP server.

## 💡 Usage Examples

### Project Management
```
Create a new project called "Course Management System" with description "Comprehensive LMS platform"
List all open projects in the repository
```

### Issue & Sprint Management
```
Create an issue titled "Setup Database Schema" with labels "type: feature, priority: high" and assign to john-doe
Create a sprint titled "Sprint 1: Foundation" from 2025-07-01 to 2025-07-14 with goals "Setup infrastructure, Database design"
Add issues #1, #2, #3 to sprint sprint-1234567890
```

### Milestone Management
```
Create a milestone "Phase 1: Backend" due on 2025-09-30 with description "Core backend functionality"
Show me all overdue milestones
Get metrics for milestone #1
```

### Advanced Planning
```
Generate a PRD for "Mobile Learning App" with features "User authentication, Course catalog, Video streaming"
Parse this PRD and create actionable development tasks
Analyze the complexity of "Implement real-time video streaming with WebRTC"
```

### Task Management
```
What should be my next task with priority "high"?
Break down the task "Implement user authentication system" into subtasks
```

### Requirements Traceability
```
Create a traceability matrix linking requirements to features and implementation tasks
```

## 🛠 Available Tool Categories

### Core GitHub Integration
- **Full GitHub API Integration** with Octokit
- **Real-time Data** from GitHub repositories
- **Comprehensive Error Handling** and validation

### Advanced Features
- **Sprint Management** with in-memory tracking
- **Task Complexity Analysis** with AI-powered insights
- **PRD Generation** and enhancement capabilities
- **Requirements Traceability** matrices
- **Project Roadmap** creation and management

### Smart Recommendations
- **Next Task Suggestions** based on priority and assignment
- **Complexity Analysis** with risk assessment
- **Task Breakdown** into manageable subtasks
- **Sprint Planning** with issue allocation

## 🔧 Technical Implementation

### Architecture
- **TypeScript** for type safety and better development experience
- **@modelcontextprotocol/sdk** for MCP protocol implementation
- **@octokit/rest** for comprehensive GitHub API integration
- **In-memory Storage** for sprint and complexity data
- **Real-time GitHub Data** for all operations

### GitHub API Integration
- **Projects API** for project management
- **Issues API** for issue lifecycle management
- **Milestones API** for milestone tracking
- **Labels API** for repository organization
- **Full CRUD Operations** on all supported entities

### Data Management
- **Sprint Tracking** with persistent in-memory storage
- **Task Complexity** analysis and caching
- **Progress Metrics** calculation and reporting
- **Traceability Matrix** generation and analysis

## 🎯 Professional Use Cases

### Software Development Teams
- Complete project lifecycle management
- Sprint planning and tracking
- Issue management and prioritization
- Progress reporting and analytics

### Product Managers
- PRD generation and management
- Feature planning and analysis
- Requirements traceability
- Roadmap creation and tracking

### Project Managers
- Milestone management and tracking
- Resource allocation and planning
- Progress monitoring and reporting
- Risk assessment and mitigation

### Development Teams
- Task complexity analysis
- Sprint planning and execution
- Code review workflow management
- Technical debt tracking

## 🚀 Getting Started

1. **Install and configure** the MCP server
2. **Set up GitHub token** with proper permissions
3. **Configure repository** in environment variables
4. **Start using tools** in Claude Desktop
5. **Begin with basic operations** (create issues, milestones)
6. **Progress to advanced features** (sprints, PRDs, traceability)

## 🔒 Security & Permissions

### Required GitHub Scopes
- `repo` - Full repository access
- `project` - Project management
- `read:org` / `write:org` - Organization access

### Data Security
- **No data storage** outside GitHub and memory
- **Secure token handling** via environment variables
- **API rate limiting** compliance
- **Error handling** without data exposure

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support & Troubleshooting

### Common Issues
1. **Token Permissions**: Ensure GitHub token has all required scopes
2. **Repository Access**: Verify GITHUB_OWNER and GITHUB_REPO are correct
3. **Environment Variables**: Check all env vars are properly set
4. **Network Issues**: Verify GitHub API connectivity

### Getting Help
- Check the troubleshooting section above
- Review GitHub token permissions
- Verify Claude Desktop configuration
- Check server logs for detailed error messages

---

**⭐ Built for Professional Project Management** - This MCP server provides enterprise-grade project management capabilities directly within Claude Desktop, combining the power of GitHub's ecosystem with intelligent AI-powered insights and recommendations.