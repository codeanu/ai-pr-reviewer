# Multi-Repository Deployment Guide

This guide explains how to efficiently deploy AI-Approver across multiple repositories using GitHub's reusable workflows feature.

## Centralized Approach (For 30+ Repositories)

### Step 1: Set Up Organization Secrets

Instead of configuring secrets in each repository, set up [organization secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-an-organization):

1. Go to your organization's settings
2. Navigate to Secrets and variables > Actions
3. Create a new organization secret named `OPENAI_API_KEY`
4. Set appropriate repository access policies

### Step 2: Create a Minimal Workflow File in Each Repository

Add a simple workflow file in each repository (`.github/workflows/ai-review.yml`):

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    uses: GrexIt/ai-code-reviewer/.github/workflows/reusable-ai-reviewer.yml@main
    with:
      # Optional: customize parameters for this specific repository
      max_lines_per_file: 1000
      skip_generated_files: true
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

This minimal file is all you need in each repository. It calls the centralized workflow from your AI-Approver repository.

### Step 3: Bulk Deployment Options

#### Option A: GitHub CLI

Use GitHub CLI to automate the creation of workflow files across repositories:

```bash
#!/bin/bash
# Script to deploy AI-Approver workflow to multiple repositories

REPOS=(
  "org/repo1"
  "org/repo2"
  # Add all repositories here
)

for repo in "${REPOS[@]}"; do
  echo "Deploying to $repo..."
  
  # Create branch
  gh repo clone "$repo" temp_repo
  cd temp_repo
  git checkout -b add-ai-code-reviewer
  
  # Ensure directory exists
  mkdir -p .github/workflows
  
  # Create workflow file
  cat > .github/workflows/ai-review.yml << 'EOF'
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    uses: GrexIt/ai-code-reviewer/.github/workflows/reusable-ai-reviewer.yml@main
    with:
      max_lines_per_file: 1000
      skip_generated_files: true
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
EOF
  
  # Commit and push
  git add .github/workflows/ai-review.yml
  git commit -m "Add AI Code Reviewer workflow"
  git push origin add-ai-code-reviewer
  
  # Create PR
  gh pr create --title "Add AI Code Review" --body "Integrates AI Code Reviewer for automated code reviews on PRs"
  
  # Clean up
  cd ..
  rm -rf temp_repo
  
  echo "Deployment to $repo completed"
done
```

#### Option B: GitHub API with Repository Templates

For new repositories, create a [repository template](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository) with the AI-Approver workflow pre-configured.

## Maintenance Strategy

With this centralized approach:

1. **Updates are centralized** - When you improve the AI-Approver, all repositories automatically get the updates when they reference the latest version
2. **Configuration is standardized** - All repositories use the same base configuration
3. **Repository-specific customization** is still possible through workflow inputs
4. **No code duplication** - Each repository only needs a small reference file

## Advanced Configuration

### Environment-Specific Settings

You can configure the reusable workflow to handle different environments:

```yaml
jobs:
  ai-review:
    uses: GrexIt/ai-code-reviewer/.github/workflows/reusable-ai-reviewer.yml@main
    with:
      max_lines_per_file: ${{ github.ref == 'refs/heads/production' && 2000 || 1000 }}
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Version Pinning

For stability, you can pin to specific versions of the reusable workflow:

```yaml
jobs:
  ai-review:
    uses: GrexIt/ai-code-reviewer/.github/workflows/reusable-ai-reviewer.yml@v1.0.0
    # ...
```
