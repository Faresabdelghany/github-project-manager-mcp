# GitHub Project Manager MCP

A functional GitHub-integrated project management MCP server for Claude Desktop. This server provides real GitHub API integration for managing issues, labels, milestones, and more.

## Features

### 🎯 **Currently Implemented & Working**
- **Create Issues** - Create new GitHub issues with labels and assignees
- **List Issues** - View and filter repository issues
- **Create Labels** - Add new labels to repositories
- **List Labels** - View all repository labels
- **Create Milestones** - Create project milestones with due dates
- **List Milestones** - View milestone progress and status

### 🚧 **Planned Features**
- Advanced project management tools
- Sprint planning and management
- PRD generation and parsing
- Requirements traceability matrices
- Advanced analytics and reporting

## Installation & Setup

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

### 3. Claude Desktop Configuration

Add this to your Claude Desktop MCP configuration file:

**Location**: 
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

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

**Important**: Replace the following:
- `/path/to/github-project-manager-mcp/build/index.js` with the actual path to your built server
- `your-github-personal-access-token` with your GitHub token
- `your-github-username` with your GitHub username
- `your-repository-name` with the repository you want to manage

### 4. Restart Claude Desktop

After saving the configuration, restart Claude Desktop to load the MCP server.

## Usage Examples

Once configured, you can use these commands in Claude Desktop:

### Create an Issue
```
Create a new issue titled "Setup Database Schema" with the description "Design and implement PostgreSQL database schema for the course management system" and add labels "type: feature" and "priority: high"
```

### List Issues
```
Show me all open issues in the repository
```

### Create Labels
```
Create a new label called "priority: critical" with red color (#d73a49) for critical issues
```

### Create a Milestone
```
Create a milestone titled "Phase 1: Foundation" with description "Core infrastructure and backend setup" due on 2025-09-30
```

## Available Tools

### Issues
- `create_issue` - Create new issues with title, body, labels, and assignees
- `list_issues` - List issues with filtering by state, labels, and assignee

### Labels  
- `create_label` - Create new labels with custom colors and descriptions
- `list_labels` - View all repository labels

### Milestones
- `create_milestone` - Create milestones with due dates and descriptions
- `list_milestones` - View milestone progress and status

## Troubleshooting

### Common Issues

1. **"GITHUB_TOKEN environment variable is required"**
   - Make sure you've added the GitHub token to your Claude Desktop config
   - Verify the token has the correct permissions

2. **"GITHUB_OWNER and GITHUB_REPO environment variables must be set"**
   - Add both GITHUB_OWNER and GITHUB_REPO to your environment variables
   - Make sure the repository exists and you have access to it

3. **"Failed to create issue: Bad credentials"**
   - Check that your GitHub token is valid and not expired
   - Verify the token has `repo` scope permissions

4. **Server not starting**
   - Run `npm run build` to compile TypeScript
   - Check that all dependencies are installed with `npm install`
   - Verify the path in Claude Desktop config is correct

### Testing the Server

You can test the server manually:

```bash
# Set environment variables
export GITHUB_TOKEN="your-token"
export GITHUB_OWNER="your-username"  
export GITHUB_REPO="your-repo"

# Run the server
npm start
```

## Development

### Building
```bash
npm run build
```

### Development Mode (auto-rebuild)
```bash
npm run dev
```

### Project Structure
```
github-project-manager-mcp/
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled JavaScript output
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Build and test locally
5. Submit a pull request

## Architecture

This MCP server is built with:
- **TypeScript** for type safety and better development experience
- **@modelcontextprotocol/sdk** for MCP protocol implementation
- **@octokit/rest** for GitHub API integration
- **Node.js** runtime environment

## License

MIT License - see LICENSE file for details.

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify your GitHub token and permissions
3. Make sure Claude Desktop is properly configured
4. Check the server logs for error messages

For additional help, please open an issue in this repository.