#!/usr/bin/env node

// Test GitHub Project Manager - Project Management Tools
import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';

// Import the project tools
import { createProject } from './build/tools/projects/create_project.js';
import { listProjects } from './build/tools/projects/list_projects.js';
import { updateProject } from './build/tools/projects/update_project.js';
import { deleteProject } from './build/tools/projects/delete_project.js';

// Setup GitHub configuration
const config = {
  owner: process.env.GITHUB_OWNER || 'Faresabdelghany',
  repo: process.env.GITHUB_REPO || 'course-management-system',
  octokit: new Octokit({ auth: process.env.GITHUB_TOKEN }),
  graphqlWithAuth: graphql.defaults({
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  })
};

async function testProjectManagement() {
  console.log('🚀 Testing GitHub Project Management Tools');
  console.log('==========================================');
  
  try {
    // Test 1: List existing projects
    console.log('\n1. Testing list_projects...');
    const listResult = await listProjects(config, {});
    console.log('✅ List projects successful');
    console.log('Response:', listResult.content[0].text.substring(0, 200) + '...');
    
    // Test 2: Create a new test project
    console.log('\n2. Testing create_project...');
    const createResult = await createProject(config, {
      title: 'Test Project - ' + Date.now(),
      description: 'A test project created by the MCP server'
    });
    console.log('✅ Create project successful');
    console.log('Response:', createResult.content[0].text.substring(0, 200) + '...');
    
    // Extract project number from response
    const match = createResult.content[0].text.match(/\*\*Number:\*\* #(\d+)/);
    const projectNumber = match ? parseInt(match[1]) : null;
    
    if (projectNumber) {
      // Test 3: Update the project
      console.log('\n3. Testing update_project...');
      const updateResult = await updateProject(config, {
        project_number: projectNumber,
        description: 'Updated description for test project'
      });
      console.log('✅ Update project successful');
      console.log('Response:', updateResult.content[0].text.substring(0, 200) + '...');
      
      // Test 4: Delete the project (with safety checks)
      console.log('\n4. Testing delete_project (without force)...');
      const deleteResult1 = await deleteProject(config, {
        project_number: projectNumber,
        confirm: true
      });
      console.log('✅ Delete project safety check successful');
      console.log('Response:', deleteResult1.content[0].text.substring(0, 200) + '...');
      
      // Test 5: Force delete the project
      console.log('\n5. Testing delete_project (with force)...');
      const deleteResult2 = await deleteProject(config, {
        project_number: projectNumber,
        confirm: true,
        force: true
      });
      console.log('✅ Force delete project successful');
      console.log('Response:', deleteResult2.content[0].text.substring(0, 200) + '...');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

// Check if GitHub token is set
if (!process.env.GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN environment variable not set');
  process.exit(1);
}

testProjectManagement().catch(console.error);