# AI-Reviewer

AI-based code review comments for GitHub pull request diffs.

## Features

- Automatically analyze code in pull request diffs
- Generate insightful, context-aware code review comments
- Support for multiple AI models:
  - OpenAI (GPT-4, etc.)
  - Azure OpenAI
  - Anthropic Claude
  - Custom/third-party AI models
- Easy integration with GitHub CI workflows
- Customizable configuration

## Installation

```bash
# Install globally
npm install -g ai-approver

# Or install locally
npm install ai-approver --save-dev
```

## Usage

### Command Line

```bash
# Review a specific pull request
ai-approver review --repo owner/repo --pr 123 --model openai

# Run as part of CI workflow (uses environment variables)
ai-approver ci --model openai
```

### Environment Variables

The following environment variables are used:

- `GITHUB_TOKEN`: GitHub API token with PR read/write access
- `OPENAI_API_KEY`: OpenAI API key
- `AZURE_OPENAI_API_KEY`: Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI endpoint URL
- `ANTHROPIC_API_KEY`: Anthropic API key
- `CUSTOM_API_KEY`: Custom API key (optional)
- `CUSTOM_API_ENDPOINT`: Custom API endpoint

### Configuration

You can customize the behavior by creating a custom configuration file:

```bash
ai-approver review --repo owner/repo --pr 123 --config ./my-config.js
```

See `config/default.js` for the full configuration options.

## GitHub Actions Integration

You can easily integrate AI-Approver into your GitHub Actions workflow. Here's how:

1. Create a `.github/workflows/ai-approver.yml` file in your repository:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]
    
jobs:
  review:
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
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run AI Code Review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: node src/index.js
```

2. Add the required secrets to your GitHub repository:
   - `GITHUB_TOKEN` is automatically provided by GitHub Actions
   - `OPENAI_API_KEY` should be added in your repository settings under Secrets and Variables > Actions

3. Customize the workflow as needed:
   - Adjust the Node.js version if required
   - Modify the environment variables for different AI models
   - Add any additional configuration parameters

The workflow will run automatically whenever a pull request is opened or updated, analyzing the changed files and providing AI-generated code reviews directly as PR comments.

## Environment Configuration

For different environments (development, testing, production), you can customize the configuration using:

```javascript
// config/custom-environment-variables.js
export default {
  github: {
    token: "GITHUB_TOKEN"
  },
  openai: {
    apiKey: "OPENAI_API_KEY"
  }
};
```

This allows for flexible deployment across different environments while maintaining security best practices.

## Development

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-approver.git
cd ai-approver

# Install dependencies
npm install

# Run locally
node src/index.js review --repo owner/repo --pr 123
```

## License

ISC
