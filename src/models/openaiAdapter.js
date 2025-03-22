import { OpenAI } from 'openai';
import { reviewSystemPrompt } from '../utils/config.js';

/**
 * Adapter for OpenAI models
 */
class OpenAIAdapter {
  /**
   * Create OpenAI adapter
   * @param {Object} options - OpenAI specific options
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.maxTokens = options.maxTokens || 1000;
    this.temperature = options.temperature || 0.3;
    
    // Determine if we're using a project API key
    this.isProjectKey = this.apiKey?.startsWith('sk-proj-');
    
    // Select appropriate model based on options or defaults
    // Project keys may have different model access, use what's specified in options if available
    this.model = options.model || (this.isProjectKey ? 'gpt-4o' : 'gpt-4o');
    
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide in config.');
    }
    
    // Initialize the OpenAI client
    this.client = new OpenAI({
      apiKey: this.apiKey
    });
    
    console.log(`Using OpenAI API with ${this.isProjectKey ? 'project' : 'standard'} key and model: ${this.model}`);
  }

  /**
   * Create a prompt for code review
   * @param {Object} options - Options for the review
   * @returns {Array} - Array of message objects for the OpenAI API
   */
  createReviewPrompt(options) {
    const { filename, diff, fileContent } = options;

    const fileExtension = filename.split('.').pop().toLowerCase();
    
    const systemPrompt = reviewSystemPrompt;

    const userPrompt = `
Review the following code changes:

File: ${filename}

Diff:
\`\`\`diff
${diff}
\`\`\`

${fileContent ? `Full file content:\n\`\`\`\n${fileContent}\n\`\`\`` : ''}

Return your review comments as JSON with a "comments" array containing objects with "line", "body", and "severity" fields.
`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Review code and generate suggestions
   * 
   * @param {Object} options - Review options
   * @param {string} options.filename - Name of the file to review
   * @param {string} options.diff - Diff content of the file
   * @param {string} options.fileContent - Full content of the file (optional)
   * @returns {Promise<Array>} - Array of review comments
   */
  async reviewCode({ filename, diff, fileContent }) {
    try {
      // Skip files with more than 1000 lines of changes
      const diffLines = diff.split('\n').length;
      if (diffLines > 1000) {
        console.log(`Skipping ${filename}: Too large (${diffLines} lines)`);
        return [];
      }
      
      const prompt = this.createReviewPrompt({ filename, diff, fileContent });
      
      console.log(`Reviewing file: ${filename}`);
      
      // Use the OpenAI client to create a chat completion
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: prompt,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: 'json_object' }
      });
      
      // Parse the JSON response
      const responseContent = response.choices[0].message.content;
      console.log('Raw AI response:', responseContent);
      
      let reviewComments = [];
      
      try {
        const parsedResponse = JSON.parse(responseContent);
        console.log('Parsed response type:', typeof parsedResponse);
        console.log('Parsed response structure:', Object.keys(parsedResponse));
        
        // The AI might return the comments directly or in a 'comments' field
        if (Array.isArray(parsedResponse)) {
          console.log('Response is an array with length:', parsedResponse.length);
          reviewComments = parsedResponse;
        } else if (parsedResponse.comments && Array.isArray(parsedResponse.comments)) {
          console.log('Using comments field with length:', parsedResponse.comments.length);
          reviewComments = parsedResponse.comments;
        } else if (typeof parsedResponse === 'object') {
          // Try to extract comments from other fields
          for (const key in parsedResponse) {
            if (Array.isArray(parsedResponse[key])) {
              console.log(`Found array in field ${key} with length:`, parsedResponse[key].length);
              if (parsedResponse[key].length > 0 && 
                  parsedResponse[key][0].line && 
                  parsedResponse[key][0].body) {
                reviewComments = parsedResponse[key];
                break;
              }
            }
          }
          
          if (reviewComments.length === 0) {
            console.log('No valid comments found in AI response structure:', JSON.stringify(parsedResponse));
          }
        } else {
          console.log('No valid comments found in AI response');
        }
        
        // Filter out comments that don't have the required fields
        const validComments = reviewComments.filter(comment => {
          const isValid = comment.line && 
                      comment.body && 
                      typeof comment.line === 'number';
          if (!isValid) {
            console.log('Filtering out invalid comment:', JSON.stringify(comment));
          }
          return isValid;
        });
        
        if (validComments.length !== reviewComments.length) {
          console.log(`Filtered out ${reviewComments.length - validComments.length} invalid comments`);
        }
        reviewComments = validComments;
        
        // If the AI included a severity field, we can sort by it
        reviewComments.sort((a, b) => {
          const severityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
          const aSeverity = a.severity ? severityOrder[a.severity.toLowerCase()] || 3 : 3;
          const bSeverity = b.severity ? severityOrder[b.severity.toLowerCase()] || 3 : 3;
          return aSeverity - bSeverity;
        });
        
        console.log(`Found ${reviewComments.length} review comments for ${filename}`);
        return reviewComments;
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        console.log('Raw response:', responseContent);
        return [];
      }
    } catch (error) {
      console.error(`Error reviewing ${filename}:`, error);
      return [];
    }
  }

  /**
   * Extract comments from text if JSON parsing fails
   * 
   * @param {string} text - Response text to extract comments from
   * @returns {Array} Array of comment objects
   */
  extractCommentsFromText(text) {
    const comments = [];
    // Try to find line number and comment pairs
    const lineRegex = /line\s*:?\s*(\d+)/i;
    const lines = text.split('\n');
    
    let currentLine = null;
    let currentComment = '';
    
    for (const line of lines) {
      const lineMatch = line.match(lineRegex);
      
      if (lineMatch) {
        // If we already have a comment, save it
        if (currentLine !== null && currentComment.trim() !== '') {
          comments.push({
            line: parseInt(currentLine, 10),
            body: currentComment.trim()
          });
        }
        
        // Start a new comment
        currentLine = lineMatch[1];
        currentComment = line.replace(lineRegex, '').trim();
      } else if (currentLine !== null) {
        // Add to existing comment
        currentComment += ' ' + line.trim();
      }
    }
    
    // Add the last comment if there is one
    if (currentLine !== null && currentComment.trim() !== '') {
      comments.push({
        line: parseInt(currentLine, 10),
        body: currentComment.trim()
      });
    }
    
    return comments;
  }

  /**
   * Generate a summary of the PR review
   * 
   * @param {Object} options - Summary options
   * @param {Array} options.files - Files in the PR
   * @param {Object} options.config - Configuration options
   * @returns {Promise<string>} Summary text
   */
  async generateSummary({ files, config }) {
    try {
      const filesSummary = files.map(f => `${f.filename} (${f.additions} additions, ${f.deletions} deletions)`).join('\n');
      
      const prompt = `
You are an expert code reviewer. Generate a concise summary of your review for a pull request with the following files:

${filesSummary}

The summary should:
1. Be clear, professional, and constructive
2. Highlight the main types of changes in the PR
3. Mention any patterns in the issues found
4. Provide overall recommendations

Keep the summary concise yet informative.
`;

      console.log('Generating PR summary');
      
      // Use the OpenAI client to create a chat completion
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.maxTokens,
        temperature: this.temperature
      });

      return completion.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating summary:', error.message);
      if (error.response) {
        console.error('Status:', error.status);
        console.error('Error details:', JSON.stringify(error.response, null, 2));
      }
      return 'Unable to generate review summary due to an error.';
    }
  }
}

export default OpenAIAdapter;
