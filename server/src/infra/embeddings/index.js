import { env } from '../../config/env.js';
import { OllamaEmbeddings } from './ollama.js';

let instance = null;

export function getEmbeddings() {
  if (!instance) {
    instance = new OllamaEmbeddings({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.EMBEDDING_MODEL,
      timeoutMs: env.AI_TIMEOUT_MS,
    });
  }
  return instance;
}

export { EmbeddingProvider, EmbeddingError } from './EmbeddingProvider.js';
