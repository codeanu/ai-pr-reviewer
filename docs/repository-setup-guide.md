# Target Repository Setup Guide

Follow these steps to properly set up AI Code Reviewer in your repositories:

## 1. Add the Workflow File

Create this file in each repository: `.github/workflows/ai-review.yml`

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
        with:
          fetch-depth: 0
          
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Checkout AI Code Reviewer
        uses: actions/checkout@v3
        with:
          repository: GrexIt/ai-code-reviewer
          path: ai-code-reviewer
          token: ${{ secrets.GH_PAT }}
          
      - name: Install dependencies
        run: |
          cd ai-code-reviewer
          npm install
          
      - name: Run AI Code Review
        env:
          GITHUB_TOKEN: ${{ github.token }}
          # OpenAI API (if using OpenAI)
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          # Azure OpenAI API (if using Azure)
          AZURE_OPENAI_API_KEY: ${{ secrets.AZURE_OPENAI_API_KEY }}
          AZURE_OPENAI_ENDPOINT: "https://hiver-ai-code-review-3.openai.azure.com/"
          AZURE_OPENAI_API_VERSION: "2024-10-21"
          AZURE_OPENAI_DEPLOYMENT: "gpt-4o-mini"
          # General configuration
          MAX_LINES_PER_FILE: 1000
          SKIP_GENERATED_FILES: true
        run: cd ai-code-reviewer && node src/index.js ci --model azure --repo ${{ github.repository }} --pr ${{ github.event.pull_request.number }}
```

## 2. Add Required Secrets

At the organization level (preferred) or in each repository:

1. Go to Settings > Secrets and variables > Actions
2. Create the following secrets:
   - `GH_PAT`: Your GitHub Personal Access Token with repository access
   - Either:
     - `OPENAI_API_KEY`: Your OpenAI API key (if using OpenAI)
     - `AZURE_OPENAI_API_KEY`: Your Azure OpenAI API key (if using Azure)

## 3. Choose Your AI Model Provider

The workflow supports two model providers. Choose one by changing the `--model` parameter in the run command:

### OpenAI (Standard)
```yaml
run: cd ai-code-reviewer && node src/index.js ci --model openai --repo ${{ github.repository }} --pr ${{ github.event.pull_request.number }}
```

### Azure OpenAI
```yaml
run: cd ai-code-reviewer && node src/index.js ci --model azure --repo ${{ github.repository }} --pr ${{ github.event.pull_request.number }}
```

If using Azure OpenAI, make sure these environment variables are correctly configured:
```yaml
AZURE_OPENAI_API_KEY: ${{ secrets.AZURE_OPENAI_API_KEY }}
AZURE_OPENAI_ENDPOINT: "https://hiver-ai-code-review-3.openai.azure.com/"
AZURE_OPENAI_API_VERSION: "2024-10-21"
AZURE_OPENAI_DEPLOYMENT: "gpt-4o-mini"
```

You can customize these values for your specific Azure OpenAI deployment.

## 4. Testing the Setup

After deploying to a repository:

1. Create a test pull request
2. Verify that the GitHub Action runs correctly 
3. Check that comments are being posted to the PR

## Troubleshooting

### Common Issues:

1. **Missing Secrets**: Ensure `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` is properly set up
2. **Permission Errors**: Check workflow permissions in repository settings
3. **Error Running AI Tool**: Make sure the target repository is accessible from the GitHub Action
4. **No Comments Generated**: Check that your diff files are within the line limit specified

## Best Practices

1. **Organization Secrets**: Use organization-level secrets when possible to avoid duplication
2. **Customizing Review Rules**: Adjust environment variables for specific repositories
3. **Version Pinning**: Consider pinning to a specific version of the AI reviewer for stability
