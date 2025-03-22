import axios from 'axios';

/**
 * Adapter for custom or third-party AI models
 * Allows for integration with any API endpoint that follows
 * a specified request/response format
 */
class CustomAdapter {
  /**
   * Create Custom adapter
   * @param {Object} options - Custom API specific options
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.CUSTOM_API_KEY;
    this.endpoint = options.endpoint || process.env.CUSTOM_API_ENDPOINT;
    this.headers = options.headers || {};
    this.reviewPath = options.reviewPath || '/review';
    this.summaryPath = options.summaryPath || '/summary';
    this.requestFormat = options.requestFormat || this.defaultRequestFormatter;
    this.responseFormat = options.responseFormat || this.defaultResponseFormatter;
    
    if (!this.endpoint) {
      throw new Error('Custom API endpoint is required. Set CUSTOM_API_ENDPOINT environment variable or provide in config.');
    }
    
    // Add API key to headers if provided
    if (this.apiKey) {
      this.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    // Ensure content-type is set
    if (!this.headers['Content-Type']) {
      this.headers['Content-Type'] = 'application/json';
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
      // Format request data according to custom format
      const requestData = this.requestFormat({
        type: 'review',
        filename,
        diff,
        fileContent
      });
      
      const response = await axios.post(
        `${this.endpoint}${this.reviewPath}`,
        requestData,
        { headers: this.headers }
      );
      
      // Process response according to custom format
      return this.responseFormat({
        type: 'review',
        response: response.data
      });
    } catch (error) {
      console.error('Error calling custom API for review:', error.message);
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
      // Format request data according to custom format
      const requestData = this.requestFormat({
        type: 'summary',
        files,
        config
      });
      
      const response = await axios.post(
        `${this.endpoint}${this.summaryPath}`,
        requestData,
        { headers: this.headers }
      );
      
      // Process response according to custom format
      return this.responseFormat({
        type: 'summary',
        response: response.data
      });
    } catch (error) {
      console.error('Error calling custom API for summary:', error.message);
      return 'Unable to generate review summary due to an error.';
    }
  }

  /**
   * Default request formatter
   * 
   * @param {Object} data - Data to format
   * @returns {Object} Formatted request data
   */
  defaultRequestFormatter(data) {
    if (data.type === 'review') {
      return {
        filename: data.filename,
        diff: data.diff,
        fileContent: data.fileContent
      };
    } else if (data.type === 'summary') {
      return {
        files: data.files.map(f => ({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions
        }))
      };
    }
    return data;
  }

  /**
   * Default response formatter
   * 
   * @param {Object} data - Response data to format
   * @returns {Array|string} Formatted response
   */
  defaultResponseFormatter(data) {
    if (data.type === 'review') {
      // Expect response to have comments array with line and body properties
      if (data.response.comments && Array.isArray(data.response.comments)) {
        return data.response.comments;
      }
      // If response is already an array
      if (Array.isArray(data.response)) {
        return data.response;
      }
      return [];
    } else if (data.type === 'summary') {
      // Expect response to have summary property
      if (data.response.summary) {
        return data.response.summary;
      }
      // If response is already a string
      if (typeof data.response === 'string') {
        return data.response;
      }
      return 'No summary provided';
    }
    return data.response;
  }
}

export default CustomAdapter;
