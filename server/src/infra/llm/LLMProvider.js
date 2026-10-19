/**
 * The only way the application talks to a language model.
 *
 * There is exactly one method that matters, and it returns parsed JSON rather
 * than prose: everything the model is asked for in this project is structured
 * data validated against a Zod schema by the caller. Swapping Ollama for Claude
 * is an env variable, not a refactor.
 */
export class LLMProvider {
  /**
   * @param {{ prompt: string, system?: string, maxTokens?: number, timeoutMs?: number }} _opts
   * @returns {Promise<{ data: unknown, model: string, raw: string }>}
   */
  async generateJSON(_opts) {
    throw new Error('LLMProvider.generateJSON is not implemented');
  }

  /** @returns {Promise<{ ok: boolean, model: string, detail?: string }>} */
  async health() {
    throw new Error('LLMProvider.health is not implemented');
  }
}

/** Thrown when the model is unreachable, too slow, or returns unusable output. */
export class LLMError extends Error {
  constructor(message, { cause, retryable = true } = {}) {
    super(message);
    this.name = 'LLMError';
    this.cause = cause;
    this.retryable = retryable;
  }
}
