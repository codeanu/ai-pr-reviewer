/**
 * Factory to create AI model adapters
 */

import OpenAIAdapter from './openaiAdapter.js';
import AzureOpenAIAdapter from './azureOpenAIAdapter.js';
import AnthropicAdapter from './anthropicAdapter.js';
import CustomAdapter from './customAdapter.js';

/**
 * Get the appropriate AI model adapter based on configuration
 * 
 * @param {string} modelName - Name of the model to use
 * @param {Object} config - Configuration options
 * @returns {Object} Model adapter instance
 */
function getModelAdapter(modelName, config) {
  switch (modelName.toLowerCase()) {
    case 'openai':
      return new OpenAIAdapter(config.models?.openai || {});
    
    case 'azure':
    case 'azureopenai':
      return new AzureOpenAIAdapter(config.models?.azure || {});
    
    case 'anthropic':
      return new AnthropicAdapter(config.models?.anthropic || {});
    
    case 'custom':
      return new CustomAdapter(config.models?.custom || {});
    
    default:
      if (config.models?.[modelName]) {
        // Dynamic model support if configuration exists
        const modulePath = `./${modelName}Adapter.js`;
        return import(modulePath)
          .then(module => {
            const DynamicAdapter = module.default;
            return new DynamicAdapter(config.models[modelName]);
          })
          .catch(err => {
            console.error(`Failed to load adapter for model ${modelName}:`, err);
            // Default to OpenAI if model not found
            console.warn(`Model "${modelName}" not recognized, defaulting to OpenAI`);
            return new OpenAIAdapter(config.models?.openai || {});
          });
      }
      
      // Default to OpenAI if model not recognized
      console.warn(`Model "${modelName}" not recognized, defaulting to OpenAI`);
      return new OpenAIAdapter(config.models?.openai || {});
  }
}

export {
  getModelAdapter,
};
