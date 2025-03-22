#!/usr/bin/env node

import { config } from 'dotenv';
import { Command } from 'commander';
import { reviewPullRequest, deleteUserComments } from './github/pullRequest.js';
import { getModelAdapter } from './models/modelFactory.js';
import { loadConfig } from './utils/config.js';

// Initialize dotenv
config();

const program = new Command();

program
  .name('ai-approver')
  .description('AI-based code review comments for GitHub pull requests')
  .version('1.0.0');

program
  .command('review')
  .description('Review a specific pull request')
  .requiredOption('-r, --repo <repository>', 'GitHub repository in format owner/repo')
  .requiredOption('-p, --pr <number>', 'Pull request number')
  .option('-m, --model <name>', 'AI model to use for review', 'openai')
  .option('-c, --config <path>', 'Path to config file', './config/default.js')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const [owner, repo] = options.repo.split('/');
      const prNumber = parseInt(options.pr, 10);
      const modelAdapter = getModelAdapter(options.model, config);
      
      await reviewPullRequest({ owner, repo, prNumber, modelAdapter, config });
      console.log('Review completed successfully.');
    } catch (error) {
      console.error('Error during review:', error.message);
      process.exit(1);
    }
  });

program
  .command('ci')
  .description('Run as part of CI workflow')
  .option('-m, --model <name>', 'AI model to use for review', 'openai')
  .option('-c, --config <path>', 'Path to config file', './config/default.js')
  .action(async (options) => {
    try {
      // Load environment variables expected from CI
      const owner = process.env.GITHUB_REPOSITORY_OWNER;
      const repo = process.env.GITHUB_REPOSITORY.split('/')[1];
      const prNumber = parseInt(process.env.PR_NUMBER, 10);
      
      if (!owner || !repo || isNaN(prNumber)) {
        throw new Error('Missing required CI environment variables');
      }
      
      const config = loadConfig(options.config);
      const modelAdapter = getModelAdapter(options.model, config);
      
      await reviewPullRequest({ owner, repo, prNumber, modelAdapter, config });
      console.log('CI review completed successfully.');
    } catch (error) {
      console.error('Error during CI review:', error.message);
      process.exit(1);
    }
  });

program
  .command('delete_comments')
  .description('Delete all comments from a specific user on a pull request')
  .requiredOption('-u, --user <username>', 'GitHub username whose comments should be deleted')
  .requiredOption('-r, --repo <repository>', 'GitHub repository in format owner/repo')
  .requiredOption('-p, --pr <number>', 'Pull request number')
  .action(async (options) => {
    try {
      const [owner, repo] = options.repo.split('/');
      const prNumber = parseInt(options.pr, 10);
      
      await deleteUserComments({ 
        owner, 
        repo, 
        prNumber, 
        username: options.user 
      });
      
      console.log('Comment deletion completed successfully.');
    } catch (error) {
      console.error('Error during comment deletion:', error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
