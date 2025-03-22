/**
 * Configuration utilities
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file directory for resolving relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Common system prompt template for code reviews
 * Can be used across different model adapters
 */
const reviewSystemPrompt = `
You are an expert code reviewer. Your task is to identify ONLY concrete, actual issues with the code.

COMMENT STRUCTURE - MAXIMUM 50 WORDS PER COMMENT:
1. One sentence issue description
2. One sentence specific fix

DO provide comments ONLY for DEFINITE issues that WILL cause problems:
- Actual bugs that WILL occur (not hypothetical edge cases)
- Real security vulnerabilities with specific exploit paths
- Concrete performance bottlenecks
- Functionality that WILL break under normal use

DO NOT comment on:
- Hypothetical issues ("if X happens, then Y might...")
- "Best practice" suggestions without actual impact
- Reminders to check other parts of the codebase
- Missing comments or documentation
- Style issues
- Potential future maintenance concerns

BEFORE SUBMITTING ANY COMMENT, verify:
1. Is this a REAL issue that EXISTS now?
2. Can I point to SPECIFIC code that IS broken?
3. Is my comment UNDER 50 WORDS?

Examples of GOOD, CONCISE comments:
- "Memory leak in eventListener at line 45. Use removeEventListener in component unmount." (GOOD)
- "Database query missing parameterization. Use prepared statements to prevent SQL injection." (GOOD)

Examples of BAD comments to AVOID:
- "The query selector might fail if DOM structure changes. Add error handling." (TOO HYPOTHETICAL)
- "Consider adding validation for the input parameters." (TOO VAGUE)
- "Ensure all references are updated after the rename." (NOT SPECIFIC ENOUGH)

Format each comment with:
- "line": (number) - Exact line containing the issue
- "body": (string) - Brief issue + fix (UNDER 50 WORDS)
- "severity": (string) - "high", "medium", or "low"

Return an empty comments array if no CONCRETE issues exist.
`;

/**
 * Default configuration
 */
const defaultConfig = {
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
  
  // Model configurations (default settings)
  models: {
    openai: {
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1000
    },
    azure: {
      deploymentName: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1000
    },
    anthropic: {
      model: 'claude-3-opus-20240229',
      temperature: 0.3, 
      maxTokens: 1000
    },
    custom: {
      // Custom model settings would go here
      endpoint: 'http://localhost:3000/api', 
      reviewPath: '/review',
      summaryPath: '/summary'
    }
  }
};

/**
 * Load configuration from a file
 * 
 * @param {string} configPath - Path to config file
 * @returns {Object} Configuration object
 */
function loadConfig(configPath) {
  try {
    // If config path is a relative path, resolve it from process.cwd()
    const resolvedPath = path.isAbsolute(configPath) 
      ? configPath 
      : path.resolve(process.cwd(), configPath);
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`Config file not found at ${resolvedPath}, using default config`);
      return { ...defaultConfig };
    }
    
    // Determine how to load config based on file extension
    const ext = path.extname(resolvedPath).toLowerCase();
    let userConfig;
    
    if (ext === '.js') {
      // If .js file, import it (using dynamic import for ES modules)
      return import(resolvedPath)
        .then(module => {
          const userConfig = module.default;
          // Merge with default config
          return mergeConfigs(defaultConfig, userConfig);
        })
        .catch(error => {
          console.error(`Error importing config from ${configPath}:`, error.message);
          return { ...defaultConfig };
        });
    } else if (ext === '.json') {
      // If .json file, parse it
      const fileContent = fs.readFileSync(resolvedPath, 'utf8');
      userConfig = JSON.parse(fileContent);
      // Merge with default config
      return mergeConfigs(defaultConfig, userConfig);
    } else {
      console.warn(`Unsupported config file format: ${ext}, using default config`);
      return { ...defaultConfig };
    }
  } catch (error) {
    console.error(`Error loading config from ${configPath}:`, error.message);
    return { ...defaultConfig };
  }
}

/**
 * Deep merge two configuration objects
 * 
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged configuration
 */
function mergeConfigs(target, source) {
  const merged = { ...target };
  
  // Iterate through source properties
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (
        source[key] !== null && 
        typeof source[key] === 'object' && 
        !Array.isArray(source[key])
      ) {
        // If property is an object, recurse
        merged[key] = mergeConfigs(target[key] || {}, source[key]);
      } else {
        // Otherwise, simply assign
        merged[key] = source[key];
      }
    }
  }
  
  return merged;
}

export {
  loadConfig,
  defaultConfig,
  reviewSystemPrompt
};
