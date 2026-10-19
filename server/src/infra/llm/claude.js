import Anthropic from '@anthropic-ai/sdk';

import { LLMProvider, LLMError } from './LLMProvider.js';
import { parseJSON } from './ollama.js';

/**
 * Production provider. Same interface as Ollama, so moving between them is one
 * environment variable and nothing above this file changes.
 */
export class ClaudeProvider extends LLMProvider {
  constructor(config) {
    super();
    if (!config.apiKey) {
      throw new LLMError('ANTHROPIC_API_KEY is not set, but LLM_PROVIDER=claude', {
        retryable: false,
      });
    }
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      // The SDK takes milliseconds and retries 429s and 5xx on its own.
      timeout: config.timeoutMs,
      maxRetries: 2,
    });
  }

  async generateJSON({ prompt, system, maxTokens = 2048, timeoutMs }) {
    let response;
    try {
      response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: maxTokens,
          ...(system ? { system } : {}),
          messages: [{ role: 'user', content: prompt }],
        },
        { timeout: timeoutMs ?? this.timeoutMs },
      );
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new LLMError('Claude is rate limiting; the task will be retried', { cause: err });
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new LLMError('ANTHROPIC_API_KEY was rejected', { cause: err, retryable: false });
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new LLMError(`Claude rejected the request: ${err.message}`, {
          cause: err,
          retryable: false,
        });
      }
      throw new LLMError(`Claude request failed: ${err.message}`, { cause: err });
    }

    // A safety decline is a real outcome, not an exception, so it has to be
    // checked before reading the content.
    if (response.stop_reason === 'refusal') {
      throw new LLMError('Claude declined to answer this request', { retryable: false });
    }
    if (response.stop_reason === 'max_tokens') {
      throw new LLMError('Claude hit the token limit before finishing its JSON');
    }

    const raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return { data: parseJSON(raw, 'Claude'), model: response.model ?? this.model, raw };
  }

  async health() {
    try {
      // One cheap real call is the only honest check that the key works.
      const res = await this.client.messages.create(
        { model: this.model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with: ok' }] },
        { timeout: 10_000 },
      );
      return { ok: true, model: res.model ?? this.model, detail: 'reachable' };
    } catch (err) {
      return { ok: false, model: this.model, detail: err.message };
    }
  }
}
