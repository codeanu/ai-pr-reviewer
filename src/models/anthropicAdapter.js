import axios from 'axios';
import { reviewSystemPrompt } from '../utils/config.js';

/**
 * Adapter for Anthropic Claude models
 */
class AnthropicAdapter {
  /**
   * Create Anthropic adapter
   * @param {Object} options - Anthropic specific options
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = options.model || 'claude-3-opus-20240229';
    this.baseURL = options.baseURL || 'https://api.anthropic.com/v1';
    this.maxTokens = options.maxTokens || 1000;
    this.temperature = options.temperature || 0.3;
    
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or provide in config.');
    }
  }

  /**
   * Review code and generate suggestions
   * 
   * @param {Object} options - Review options
   * @param {string} options.filename - File name
   * @param {string} options.diff - Diff content
   * @param {string} options.fileContent - Complete file content (if available)
   * @returns {Promise<Array>} Array of comment objects with line and body properties
   */
  async reviewCode({ filename, diff, fileContent }) {
    try {
      const fileExtension = filename.split('.').pop();
      
      // Using the common system prompt from config.js
      const userPrompt = `
Review the following code changes:

File: ${filename}

Diff:
\`\`\`
${diff}
\`\`\`

${fileContent ? `Full file content:\n\`\`\`\n${fileContent}\n\`\`\`` : ''}

Return your review comments as JSON with a "comments" array containing objects with "line", "body", and "severity" fields.
`;

      const response = await axios.post(
        `${this.baseURL}/messages`,
        {
          model: this.model,
          messages: [
            { role: 'system', content: reviewSystemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      const content = response.data.content[0].text;
      let comments;
      
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                         content.match(/\[([\s\S]*?)\]/) ||
                         content.match(/\{([\s\S]*?)\}/);
                         
        const jsonContent = jsonMatch ? jsonMatch[0] : content;
        const parsedResponse = JSON.parse(jsonContent);
        comments = Array.isArray(parsedResponse) ? parsedResponse : parsedResponse.comments || [];
      } catch (parseError) {
        console.error('Error parsing Anthropic response:', parseError);
        // Attempt to extract comments if JSON parsing fails
        comments = this.extractCommentsFromText(content);
      }
      
      return comments;
    } catch (error) {
      console.error('Error calling Anthropic API:', error.message);
      return [];
    }
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

      const response = await axios.post(
        `${this.baseURL}/messages`,
        {
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: this.maxTokens,
          temperature: this.temperature
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      return response.data.content[0].text.trim();
    } catch (error) {
      console.error('Error generating summary:', error.message);
      return 'Unable to generate review summary due to an error.';
    }
  }

  /**
   * Extract comments from text if JSON parsing fails
   * 
   * @param {string} text - Response text
   * @returns {Array} Array of comment objects
   */
  extractCommentsFromText(text) {
    const comments = [];
    const lineRegex = /line[:\s]+(\d+)[:\s]+(.*)/gi;
    let match;
    
    while ((match = lineRegex.exec(text)) !== null) {
      comments.push({
        line: parseInt(match[1], 10),
        body: match[2].trim()
      });
    }
    
    return comments;
  }
}

export default AnthropicAdapter;
