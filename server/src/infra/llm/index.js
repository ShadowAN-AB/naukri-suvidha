import { env } from '../../config/env.js';
import { OllamaProvider } from './ollama.js';
import { ClaudeProvider } from './claude.js';

let instance = null;

export function getLLM() {
  if (!instance) {
    instance =
      env.LLM_PROVIDER === 'claude'
        ? new ClaudeProvider({
            apiKey: env.ANTHROPIC_API_KEY,
            model: env.ANTHROPIC_MODEL,
            timeoutMs: env.AI_TIMEOUT_MS,
          })
        : new OllamaProvider({
            baseUrl: env.OLLAMA_BASE_URL,
            model: env.OLLAMA_MODEL,
            timeoutMs: env.AI_TIMEOUT_MS,
          });
  }
  return instance;
}

export { LLMProvider, LLMError } from './LLMProvider.js';
