// Use dynamic import for Octokit
import { Octokit } from '@octokit/rest';

/**
 * Review a GitHub pull request using an AI model
 * 
 * @param {Object} options - Review options
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.prNumber - Pull request number
 * @param {Object} options.modelAdapter - AI model adapter instance
 * @param {Object} options.config - Configuration options
 * @returns {Promise<void>}
 */
async function reviewPullRequest({ owner, repo, prNumber, modelAdapter, config }) {
  try {
    // Initialize Octokit with GitHub token
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    console.log(`Reviewing PR #${prNumber} in ${owner}/${repo}`);
    
    // Get pull request data
    const { data: pullRequest } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get pull request files
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    console.log(`Reviewing ${files.length} files`);
    
    const skippedFiles = [];
    let reviewedFiles = 0;
    
    // Process each file
    for (const file of files) {
      try {
        await reviewFile({ 
          octokit, 
          owner, 
          repo, 
          prNumber, 
          file, 
          modelAdapter, 
          config 
        });
        reviewedFiles++;
      } catch (error) {
        if (error.message === 'File too large to review') {
          skippedFiles.push({
            filename: file.filename,
            reason: 'Too many changes (>1000 lines)'
          });
          console.log(`Skipped ${file.filename}: ${error.message}`);
        } else {
          console.error(`Error reviewing ${file.filename}:`, error);
        }
      }
    }

    // Create a summary comment if there are skipped files
    if (skippedFiles.length > 0) {
      const summaryBody = `## AI Code Review Summary
      
**Files reviewed:** ${reviewedFiles}
**Files skipped:** ${skippedFiles.length}

${skippedFiles.length > 0 ? `
### Skipped Files
The following files were too large for AI review (>1000 lines of changes):
${skippedFiles.map(f => `- \`${f.filename}\`: ${f.reason}`).join('\n')}
` : ''}`;

      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: summaryBody,
      });
      
      console.log('Posted review summary comment');
    }

    // Add a summary comment if configured
    if (config.addSummaryComment) {
      await addSummaryComment({
        octokit,
        owner,
        repo,
        prNumber,
        modelAdapter,
        config,
        files: files.filter(file => !skippedFiles.find(skipped => skipped.filename === file.filename))
      });
    }
  } catch (error) {
    console.error('Error reviewing pull request:', error);
    throw error;
  }
}

/**
 * Review a single file in the pull request
 */
async function reviewFile({ octokit, owner, repo, prNumber, file, modelAdapter, config }) {
  try {
    console.log(`Reviewing file: ${file.filename}`);
    
    // Skip deleted or binary files
    if (file.status === 'removed' || file.binary) {
      console.log(`Skipping ${file.filename}: file is removed or binary`);
      return;
    }
    
    // Get the diff for this file
    const diff = await getDiff(octokit, owner, repo, prNumber, file.filename);
    if (!diff || diff.trim() === '') {
      console.log(`Skipping ${file.filename}: no diff available`);
      return;
    }
    
    // Check if the file is too large (>1000 lines of changes)
    const diffLines = diff.split('\n').length;
    if (diffLines > 1000) {
      throw new Error('File too large to review');
    }
    
    // Parse diff to find valid line numbers that can be commented on
    const validCommentLines = extractValidCommentLines(diff);
    if (validCommentLines.length === 0) {
      console.log(`No valid comment lines found in diff for ${file.filename}`);
      return;
    }
    
    // Get existing comments for this file
    const existingComments = await getExistingComments({
      octokit,
      owner,
      repo,
      prNumber,
      path: file.filename
    });
    
    console.log(`Found ${existingComments.length} existing comments for ${file.filename}`);
    
    // Get full file content if needed for context
    let fileContent = null;
    if (file.status !== 'removed') {
      try {
        fileContent = await getFileContent(octokit, owner, repo, file.sha);
      } catch (error) {
        console.log(`Warning: Could not get full content for ${file.filename}`);
      }
    }
    
    // Ask AI model to review the file
    console.log(`Reviewing file: ${file.filename}`);
    const reviewComments = await modelAdapter.reviewCode({
      filename: file.filename,
      diff,
      fileContent
    });
    
    // Filter out invalid comments and ensure they're on valid lines from the diff
    // and aren't duplicates of existing comments
    const validComments = reviewComments.filter(comment => {
      // Check if the line number is valid for commenting
      const isValidLine = validCommentLines.includes(comment.line);
      if (!isValidLine) {
        console.log(`Ignoring comment for invalid line ${comment.line} in ${file.filename}`);
        return false;
      }
      
      // Check if this is a duplicate of an existing comment
      const isDuplicate = isDuplicateComment(comment, existingComments);
      return !isDuplicate;
    });
    
    if (validComments.length > 0) {
      // Format comments
      const formattedComments = validComments.map(comment => ({
        path: file.filename,
        body: formatComment(comment.body, config),
        line: comment.line,
        side: 'RIGHT'
      }));
      
      // Create review with batch comments
      await createBatchReviewComments({
        octokit,
        owner,
        repo,
        prNumber,
        comments: formattedComments
      });
    } else {
      console.log(`No valid review comments for ${file.filename}`);
    }
  } catch (error) {
    console.error(`Error reviewing file ${file.filename}:`, error);
    // Continue with other files even if one fails
  }
}

/**
 * Create a review with batch comments
 */
async function createBatchReviewComments({ octokit, owner, repo, prNumber, comments }) {
  try {
    if (comments.length === 0) return;
    
    // Get the latest commit SHA
    const { data: pullRequest } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });
    
    // Create a review with all comments for this file
    const { data: review } = await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: pullRequest.head.sha,
      body: "AI-generated review comments",
      event: "COMMENT",
      comments: comments
    });
    
    console.log(`Created review with ${comments.length} comments`);
    return review;
  } catch (error) {
    console.error('Error creating batch review comments:', error);
    throw error;
  }
}

/**
 * Add a summary comment to the pull request
 */
async function addSummaryComment({ octokit, owner, repo, prNumber, modelAdapter, config, files }) {
  try {
    // Generate summary using the AI model
    const summary = await modelAdapter.generateSummary({
      files,
      config,
    });

    // Post the summary as a PR comment
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: formatSummaryComment(summary, config),
    });
    
    console.log('Added summary comment');
  } catch (error) {
    console.error('Error adding summary comment:', error);
  }
}

/**
 * Get content of a file at a specific SHA
 */
async function getFileContent(octokit, owner, repo, sha) {
  try {
    const { data } = await octokit.git.getBlob({
      owner,
      repo,
      file_sha: sha,
    });
    
    // Decode base64 content
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch (error) {
    console.error('Error fetching file content:', error);
    return '';
  }
}

/**
 * Filter files based on configuration
 */
function filterFilesToReview(files, config) {
  if (!config.fileFilters || config.fileFilters.length === 0) {
    return files;
  }
  
  return files.filter(file => {
    // Include files that match include patterns
    const shouldInclude = config.fileFilters.include.some(pattern => 
      new RegExp(pattern).test(file.filename)
    );
    
    // Exclude files that match exclude patterns
    const shouldExclude = config.fileFilters.exclude.some(pattern => 
      new RegExp(pattern).test(file.filename)
    );
    
    return shouldInclude && !shouldExclude;
  });
}

/**
 * Format comment with prefix if configured
 */
function formatComment(comment, config) {
  if (config.commentPrefix) {
    return `${config.commentPrefix} ${comment}`;
  }
  return comment;
}

/**
 * Format summary comment with header and footer
 */
function formatSummaryComment(summary, config) {
  let formattedSummary = '## AI Code Review Summary\n\n';
  
  if (config.summaryHeader) {
    formattedSummary += `${config.summaryHeader}\n\n`;
  }
  
  formattedSummary += summary;
  
  if (config.summaryFooter) {
    formattedSummary += `\n\n${config.summaryFooter}`;
  }
  
  return formattedSummary;
}

/**
 * Get the diff for a file
 */
async function getDiff(octokit, owner, repo, prNumber, filename) {
  try {
    // First, try to get the diff data using the files API
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber
    });
    
    // Find the file we're looking for
    const file = files.find(f => f.filename === filename);
    
    if (file && file.patch) {
      return file.patch;
    }
    
    // If we couldn't get the patch from the files API, try the raw diff
    console.log(`Falling back to raw diff for ${filename}`);
    const { data: diffData } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: 'diff'
      }
    });
    
    // Try to extract the specific file diff from the full PR diff
    // This is more complex as we need to parse the unified diff format
    const diffLines = diffData.split('\n');
    let inTargetFile = false;
    let targetFileDiff = [];
    
    for (let i = 0; i < diffLines.length; i++) {
      const line = diffLines[i];
      
      // Check for diff file headers
      if (line.startsWith('diff --git')) {
        // If we find a new diff header and we were in our target file, we're done
        if (inTargetFile) {
          break;
        }
        
        // Check if this is the start of our target file
        if (line.includes(`a/${filename}`) && line.includes(`b/${filename}`)) {
          inTargetFile = true;
        }
      }
      
      // If we're in the target file section, collect the lines
      if (inTargetFile) {
        targetFileDiff.push(line);
      }
    }
    
    return targetFileDiff.join('\n');
  } catch (error) {
    console.error('Error fetching diff:', error);
    return '';
  }
}

/**
 * Extract valid line numbers for comments from a diff
 */
function extractValidCommentLines(diff) {
  if (!diff) return [];
  
  const lines = diff.split('\n');
  const validLines = [];
  let currentLine = null;
  
  for (const line of lines) {
    // Hunk headers look like @@ -43,6 +51,8 @@
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLine = parseInt(match[1], 10);
      }
      continue;
    }
    
    if (currentLine !== null) {
      // Added or unchanged lines can be commented on
      if (line.startsWith('+') || line.startsWith(' ')) {
        validLines.push(currentLine);
        currentLine++;
      } 
      // Removed lines don't increment the current line number in the new file
      else if (line.startsWith('-')) {
        // Don't increment the line number
      }
    }
  }
  
  return validLines;
}

/**
 * Check if a new comment is similar to an existing comment
 * 
 * @param {Object} newComment - The new comment to check
 * @param {Array<Object>} existingComments - List of existing comments
 * @param {number} lineProximity - How close the lines should be to consider as duplicates
 * @returns {boolean} - True if the comment is a duplicate
 */
function isDuplicateComment(newComment, existingComments, lineProximity = 5) {
  // Extract key entities and concepts from the new comment
  const newCommentKeywords = extractKeywordsFromComment(newComment.body);
  
  // Extract the comment template by replacing specific identifiers
  const newCommentTemplate = extractCommentTemplate(newComment.body);
  
  for (const existingComment of existingComments) {
    // Skip if comments are too far apart in the file
    const lineDiff = Math.abs(existingComment.line - newComment.line);
    if (lineDiff > lineProximity) continue;
    
    // Extract the existing comment template
    const existingCommentTemplate = extractCommentTemplate(existingComment.body);
    
    // First check: Do the templates match? (fastest check)
    if (existingCommentTemplate === newCommentTemplate) {
      console.log(`Skipping duplicate comment on line ${newComment.line} (template match with comment on line ${existingComment.line})`);
      console.log(`Existing: "${existingComment.body}"`);
      console.log(`New: "${newComment.body}"`);
      return true;
    }
    
    // Extract keywords from existing comment
    const existingCommentKeywords = extractKeywordsFromComment(existingComment.body);
    
    // Second check: Calculate keyword overlap
    const keywordOverlap = calculateKeywordOverlap(newCommentKeywords, existingCommentKeywords);
    
    // Third check: Calculate text similarity
    const textSimilarity = stringSimilarity(newComment.body, existingComment.body);
    
    // Final check: Template similarity for cases like variables
    const templateSimilarity = stringSimilarity(newCommentTemplate, existingCommentTemplate);
    
    // Log all metrics for debugging
    if (keywordOverlap > 0.3 || textSimilarity > 0.5 || templateSimilarity > 0.8) {
      console.log(`Similarity metrics for comment on line ${newComment.line} vs ${existingComment.line}:`);
      console.log(`- Keyword overlap: ${keywordOverlap.toFixed(2)}`);
      console.log(`- Text similarity: ${textSimilarity.toFixed(2)}`);
      console.log(`- Template similarity: ${templateSimilarity.toFixed(2)}`);
    }
    
    // Use all methods for better accuracy - adjusted thresholds
    if (keywordOverlap > 0.5 || textSimilarity > 0.6 || templateSimilarity > 0.85) {
      console.log(`Skipping duplicate comment on line ${newComment.line} (similar to existing comment on line ${existingComment.line})`);
      console.log(`Existing: "${existingComment.body}"`);
      console.log(`New: "${newComment.body}"`);
      return true;
    }
  }
  return false;
}

/**
 * Extract a template from a comment by replacing specific identifiers with placeholders
 * This helps detect comments that are identical except for variable names
 * 
 * @param {string} comment - Comment text
 * @returns {string} - Templated version of the comment
 */
function extractCommentTemplate(comment) {
  // Create a copy to work with
  let template = comment;
  
  // Replace identifiers in specific patterns
  
  // Case 1: Common variable/method naming patterns (camelCase, snake_case, UPPER_CASE)
  template = template.replace(/\b[a-zA-Z][a-zA-Z0-9_]*\b/g, (match) => {
    // Don't replace common words, only code identifiers
    if (isCommonWord(match)) return match;
    
    // Keep keywords like 'function', 'await', etc.
    if (isCodeKeyword(match)) return match;
    
    // Check if this looks like a variable/function name
    if (/^[a-z][a-zA-Z0-9_]*$/.test(match)) return '{var}'; // camelCase variable
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(match)) return '{Class}'; // ClassName
    if (/^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(match)) return '{snake_var}'; // snake_case
    if (/^[A-Z][A-Z0-9_]*$/.test(match)) return '{CONST}'; // CONSTANT
    
    return match; // Leave as is if no pattern matches
  });
  
  // Case 2: Handle specific patterns in error messages like "json.loads on X"
  template = template.replace(/(json\.loads on )([A-Z][A-Z0-9_]*)/, '$1{ENV_VAR}');
  
  // Case 3: Method calls - replace method names in method calls
  template = template.replace(/(\.\s*)([a-zA-Z][a-zA-Z0-9_]*)(\s*\()/g, '$1{method}$3');
  
  return template;
}

/**
 * Check if a word is a common English word (not likely a code identifier)
 * 
 * @param {string} word - Word to check
 * @returns {boolean} - True if it's a common word
 */
function isCommonWord(word) {
  const commonWords = [
    'the', 'if', 'on', 'in', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
    'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'may',
    'will', 'can', 'must', 'should', 'could', 'would', 'might', 'every', 'some', 'other',
    'such', 'only', 'then', 'than', 'when', 'been', 'this', 'that', 'these', 'those',
    'their', 'has', 'have', 'had', 'not', 'and', 'but', 'or', 'as', 'what', 'all'
  ];
  
  return commonWords.includes(word.toLowerCase());
}

/**
 * Check if a word is a programming language keyword
 * 
 * @param {string} word - Word to check
 * @returns {boolean} - True if it's a programming keyword
 */
function isCodeKeyword(word) {
  const keywords = [
    'function', 'return', 'if', 'else', 'for', 'while', 'break', 'continue',
    'class', 'interface', 'extends', 'implements', 'import', 'export',
    'try', 'catch', 'finally', 'throw', 'async', 'await', 'new', 'this',
    'const', 'let', 'var', 'void', 'null', 'undefined', 'true', 'false',
    'public', 'private', 'protected', 'static', 'final', 'abstract',
    'default', 'delete', 'instanceof', 'typeof', 'yield', 'get', 'set',
    'in', 'of', 'switch', 'case', 'super', 'with'
  ];
  
  return keywords.includes(word.toLowerCase());
}

/**
 * Extract important keywords and code references from a comment
 * 
 * @param {string} commentText - Comment text to analyze
 * @returns {Array<string>} - Array of extracted keywords
 */
function extractKeywordsFromComment(commentText) {
  // Normalize comment text
  const normalizedText = commentText.toLowerCase();
  
  // Split into words, removing punctuation
  const words = normalizedText.split(/\W+/).filter(w => w.length > 2);
  
  // Find code elements (often in backticks or with special characters)
  const codeElements = (commentText.match(/`[^`]+`|\b[a-zA-Z0-9_]+\(\)|\b[A-Z][a-zA-Z0-9_]+|[a-z][a-zA-Z0-9_]+\.[a-z][a-zA-Z0-9_]+/g) || [])
    .map(s => s.replace(/`/g, '').toLowerCase());
  
  // Find technical terms and common programming concepts
  const technicalTerms = words.filter(word => 
    isCodeRelatedTerm(word)
  );
  
  // Combine and deduplicate
  return [...new Set([...codeElements, ...technicalTerms])];
}

/**
 * Check if a word is likely to be a code-related technical term
 * 
 * @param {string} word - Word to check
 * @returns {boolean} - True if the word is likely a technical term
 */
function isCodeRelatedTerm(word) {
  const codeRelatedTerms = [
    'async', 'await', 'sync', 'function', 'method', 'class', 'object',
    'variable', 'const', 'let', 'var', 'import', 'export', 'return',
    'parameter', 'argument', 'callback', 'promise', 'error', 'exception',
    'null', 'undefined', 'boolean', 'string', 'number', 'array', 'json',
    'memory', 'leak', 'performance', 'security', 'vulnerability', 'injection',
    'validation', 'sanitize', 'request', 'response', 'api', 'database',
    'query', 'sql', 'http', 'token', 'authentication', 'authorization',
    'upload', 'download', 'file', 'stream', 'buffer', 'parse', 'serialize'
  ];
  
  return codeRelatedTerms.includes(word) || 
         word.includes('error') || 
         word.includes('bug') ||
         word.includes('fix') ||
         word.includes('issue');
}

/**
 * Calculate the overlap between two sets of keywords
 * 
 * @param {Array<string>} keywords1 - First set of keywords
 * @param {Array<string>} keywords2 - Second set of keywords
 * @returns {number} - Overlap score between 0 and 1
 */
function calculateKeywordOverlap(keywords1, keywords2) {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  
  // Count how many keywords from set 1 appear in set 2
  const matchingKeywords = keywords1.filter(kw => keywords2.includes(kw));
  
  // Calculate Jaccard similarity (intersection / union)
  const union = new Set([...keywords1, ...keywords2]).size;
  return matchingKeywords.length / union;
}

/**
 * Calculate string similarity (improved version)
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score between 0 and 1
 */
function stringSimilarity(str1, str2) {
  // Convert to lowercase and remove common punctuation
  const normalize = (str) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").trim();
  
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  // For very different length strings, use word-based comparison
  if (Math.abs(s1.length - s2.length) > 20) {
    return wordBasedSimilarity(s1, s2);
  }
  
  // Use Levenshtein distance for similar length strings
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  // Convert distance to similarity score (1 - normalized distance)
  return maxLength === 0 ? 1 : 1 - (distance / maxLength);
}

/**
 * Calculate similarity based on shared words
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score between 0 and 1
 */
function wordBasedSimilarity(str1, str2) {
  const words1 = str1.split(/\s+/).filter(w => w.length > 2);
  const words2 = str2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Count shared words
  const sharedWords = words1.filter(w => words2.includes(w));
  
  // Calculate Dice coefficient: 2*|intersection| / (|A| + |B|)
  return (2 * sharedWords.length) / (words1.length + words2.length);
}

/**
 * Calculate Levenshtein distance between two strings
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  
  // Create matrix
  const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
  
  // Initialize first column and row
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return dp[m][n];
}

/**
 * Fetch existing comments for a file in a PR
 * 
 * @param {Object} options - Options
 * @param {Object} options.octokit - Octokit instance
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.prNumber - PR number
 * @param {string} options.path - File path
 * @returns {Promise<Array<Object>>} - Array of existing comments with line and body
 */
async function getExistingComments({ octokit, owner, repo, prNumber, path }) {
  // Get all review comments for this PR
  const { data: comments } = await octokit.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
  
  // Filter comments for this specific file and format them
  return comments
    .filter(comment => comment.path === path)
    .map(comment => ({
      id: comment.id,
      line: comment.line || comment.original_line,
      body: comment.body,
      user: comment.user.login
    }));
}

/**
 * Delete all review comments from a specific user on a pull request
 * 
 * @param {Object} options - Options for deleting comments
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.prNumber - Pull request number
 * @param {string} options.username - GitHub username whose comments should be deleted
 * @returns {Promise<void>}
 */
async function deleteUserComments({ owner, repo, prNumber, username }) {
  // Initialize Octokit with GitHub token
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });
  
  try {
    console.log(`Finding comments by ${username} on PR #${prNumber} in ${owner}/${repo}...`);
    
    // Get all review comments on the PR
    const { data: comments } = await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    
    // Filter comments by the specified username
    const userComments = comments.filter(comment => 
      comment.user.login === username
    );
    
    console.log(`Found ${userComments.length} comments by ${username}`);
    
    // Delete each comment
    let deletedCount = 0;
    for (const comment of userComments) {
      try {
        await octokit.pulls.deleteReviewComment({
          owner,
          repo,
          comment_id: comment.id,
        });
        console.log(`Deleted comment #${comment.id}`);
        deletedCount++;
      } catch (error) {
        console.error(`Error deleting comment #${comment.id}:`, error.message);
      }
    }
    
    // Also get and delete all review submissions by the user
    const { data: reviews } = await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });
    
    const userReviews = reviews.filter(review => 
      review.user.login === username
    );
    
    console.log(`Found ${userReviews.length} reviews by ${username}`);
    
    // Delete each review
    let deletedReviews = 0;
    for (const review of userReviews) {
      try {
        await octokit.pulls.deleteReview({
          owner,
          repo,
          pull_number: prNumber,
          review_id: review.id,
        });
        console.log(`Deleted review #${review.id}`);
        deletedReviews++;
      } catch (error) {
        console.error(`Error deleting review #${review.id}:`, error.message);
      }
    }
    
    console.log(`Successfully deleted ${deletedCount} comments and ${deletedReviews} reviews by ${username}`);
  } catch (error) {
    console.error('Error deleting comments:', error);
    throw error;
  }
}

export {
  reviewPullRequest,
  deleteUserComments
};
