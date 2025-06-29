#!/usr/bin/env node

import fs from 'fs';

// Read the current file
const filePath = 'C:\\tmp\\github-project-manager-mcp-local\\src\\index.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Add graphqlWithAuth property after the octokit property
content = content.replace(
  'private octokit: Octokit;\n  private owner: string;',
  'private octokit: Octokit;\n  private graphqlWithAuth: any;\n  private owner: string;'
);

// Add GraphQL initialization after Octokit initialization  
content = content.replace(
  'this.octokit = new Octokit({ auth: token });\n    this.owner = process.env.GITHUB_OWNER || \'\';\n    this.repo = process.env.GITHUB_REPO || \'\';',
  `this.octokit = new Octokit({ auth: token });
    
    // Initialize GraphQL client with authentication
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: \`token \${token}\`,
      },
    });
    
    this.owner = process.env.GITHUB_OWNER || '';
    this.repo = process.env.GITHUB_REPO || '';`
);

// Write the updated content back
fs.writeFileSync(filePath, content);
console.log('✅ Successfully added GraphQL client setup to index.ts');
