// Map environment variables to configuration
export default {
  github: {
    token: "GITHUB_TOKEN",
    repository: "GITHUB_REPOSITORY",
    prNumber: "PR_NUMBER"
  },
  openai: {
    apiKey: "OPENAI_API_KEY",
    model: "OPENAI_MODEL"
  },
  azure: {
    apiKey: "AZURE_OPENAI_API_KEY",
    endpoint: "AZURE_OPENAI_ENDPOINT",
    deploymentName: "AZURE_OPENAI_DEPLOYMENT"
  },
  anthropic: {
    apiKey: "ANTHROPIC_API_KEY",
    model: "ANTHROPIC_MODEL"
  },
  app: {
    maxLinesPerFile: "MAX_LINES_PER_FILE",
    maxCommentLength: "MAX_COMMENT_LENGTH",
    debug: "DEBUG_MODE"
  }
};
