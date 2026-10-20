import { EmbeddingProvider, EmbeddingError } from './EmbeddingProvider.js';

/** Local embeddings through Ollama. Free, offline, and fast enough at this size. */
export class OllamaEmbeddings extends EmbeddingProvider {
  constructor({ baseUrl, model, timeoutMs }) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.modelName = model;
    this.timeoutMs = timeoutMs;
  }

  get model() {
    return this.modelName;
  }

  async embed(texts) {
    if (!texts?.length) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        // Truncation is the model's job; an over-long resume is clipped rather
        // than rejected, because a partial vector beats no vector.
        body: JSON.stringify({ model: this.modelName, input: texts, truncate: true }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new EmbeddingError(`Ollama returned ${res.status}: ${body.slice(0, 160)}`, {
          retryable: res.status !== 404,
        });
      }

      const { embeddings } = await res.json();
      if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
        throw new EmbeddingError('Ollama returned the wrong number of vectors');
      }
      // A generation model answers this endpoint with empty vectors rather
      // than an error, which would otherwise be stored as a useless embedding.
      if (embeddings[0]?.length === 0) {
        throw new EmbeddingError(
          `"${this.modelName}" produced empty vectors. It is probably a generation model, not an embedding model.`,
          { retryable: false },
        );
      }
      return embeddings;
    } catch (err) {
      if (err instanceof EmbeddingError) throw err;
      if (err.name === 'AbortError') throw new EmbeddingError(`Embedding timed out after ${this.timeoutMs}ms`);
      throw new EmbeddingError(`Could not reach Ollama at ${this.baseUrl}`, { cause: err });
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    try {
      const [vector] = await this.embed(['health check']);
      return { ok: true, model: this.modelName, dimensions: vector.length };
    } catch (err) {
      return { ok: false, model: this.modelName, detail: err.message };
    }
  }
}
