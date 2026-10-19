import { LLMProvider } from './LLMProvider.js';

/**
 * Production provider. Implemented in Phase 5 behind the same interface as
 * Ollama, so production and development differ only by LLM_PROVIDER.
 */
export class ClaudeProvider extends LLMProvider {
  constructor(config) {
    super();
    this.config = config;
  }

  async generateJSON(_opts) {
    throw new Error('ClaudeProvider.generateJSON lands in Phase 5');
  }

  async health() {
    throw new Error('ClaudeProvider.health lands in Phase 5');
  }
}
