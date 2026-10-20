/**
 * Turns text into a vector. Mirrors LLMProvider deliberately: same shape,
 * same swap-by-environment-variable story, so there is one pattern to learn
 * rather than two.
 *
 * Anthropic does not serve an embeddings endpoint, so the production
 * implementation is a third party (Voyage, Cohere, OpenAI) rather than the
 * same vendor as the generation model. That is a real asymmetry with
 * LLMProvider and is why this is a separate interface and not a method on it.
 */
export class EmbeddingProvider {
  /** @param {string[]} _texts @returns {Promise<number[][]>} one vector per input, in order */
  async embed(_texts) {
    throw new Error('EmbeddingProvider.embed is not implemented');
  }

  /** Vectors from different models are not comparable, so this is recorded with them. */
  get model() {
    throw new Error('EmbeddingProvider.model is not implemented');
  }

  async health() {
    throw new Error('EmbeddingProvider.health is not implemented');
  }
}

export class EmbeddingError extends Error {
  constructor(message, { cause, retryable = true } = {}) {
    super(message);
    this.name = 'EmbeddingError';
    this.cause = cause;
    this.retryable = retryable;
  }
}
