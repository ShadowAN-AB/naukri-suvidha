import { LLMProvider } from './LLMProvider.js';

/**
 * Development provider: llama3.1:8b running locally, free and offline.
 * Implemented in Phase 5.
 */
export class OllamaProvider extends LLMProvider {
  constructor(config) {
    super();
    this.config = config;
  }

  async generateJSON(_opts) {
    throw new Error('OllamaProvider.generateJSON lands in Phase 5');
  }

  async health() {
    throw new Error('OllamaProvider.health lands in Phase 5');
  }
}
