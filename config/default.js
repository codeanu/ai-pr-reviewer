/**
 * Default configuration for AI-Approver
 * 
 * This file can be copied and customized for your specific needs.
 * Use the --config flag to specify a custom configuration file.
 */
const config = {
  // GitHub PR review settings
  commentPrefix: '🤖',
  addSummaryComment: true,
  summaryHeader: 'Here\'s an AI-powered analysis of the changes:',
  summaryFooter: '_Note: This is an automated review. Please consider the suggestions carefully._',
  
  // File filtering
  fileFilters: {
    include: ['.*'], // Include all files by default
    exclude: [
      // Commonly excluded files
      '.*\\.md$',
      '.*\\.lock$',
      'package-lock\\.json$',
      'yarn\\.lock$',
      '\\.gitignore$',
      '\\.env.*'
    ]
  },
  
  // Model configurations
  models: {
    // OpenAI configuration
    openai: {
      model: 'gpt-4',          // Model to use
      temperature: 0.3,         // Lower for more deterministic outputs
      maxTokens: 1000,          // Maximum length of response
      // apiKey is fetched from OPENAI_API_KEY env var by default
    },
    
    // Azure OpenAI configuration
    azure: {
      deploymentName: 'gpt-4',  // Azure deployment name
      temperature: 0.3,
      maxTokens: 1000,
      // apiKey is fetched from AZURE_OPENAI_API_KEY env var by default
      // endpoint is fetched from AZURE_OPENAI_ENDPOINT env var by default
    },
    
    // Anthropic configuration
    anthropic: {
      model: 'claude-3-opus-20240229',
      temperature: 0.3,
      maxTokens: 1000,
      // apiKey is fetched from ANTHROPIC_API_KEY env var by default
    },
    
    // Custom model configuration
    custom: {
      endpoint: 'http://localhost:3000/api',  // Your API endpoint
      reviewPath: '/review',                 // Path for code review requests
      summaryPath: '/summary',               // Path for summary requests
      // Customize request/response format as needed
      headers: {
        // Add any custom headers here
        'Content-Type': 'application/json',
        // 'Custom-Header': 'value'
      }
    }
  }
};

export default config;
