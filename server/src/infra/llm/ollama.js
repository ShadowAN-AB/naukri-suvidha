import { LLMProvider, LLMError } from './LLMProvider.js';

/**
 * Development provider: a model running locally through Ollama. Free, offline,
 * and slower than the hosted one, which is the right trade while building.
 */
export class OllamaProvider extends LLMProvider {
  constructor(config) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
  }

  async generateJSON({ prompt, system, maxTokens = 2048, timeoutMs }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.timeoutMs);

    let res;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          // Ollama's JSON mode constrains decoding to valid JSON. It does not
          // constrain the shape, which is why the caller still validates.
          format: 'json',
          options: { temperature: 0, num_predict: maxTokens },
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt },
          ],
        }),
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new LLMError(`Ollama timed out after ${timeoutMs ?? this.timeoutMs}ms`, { cause: err });
      }
      throw new LLMError(`Could not reach Ollama at ${this.baseUrl}`, { cause: err });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LLMError(`Ollama returned ${res.status}: ${body.slice(0, 200)}`, {
        // A missing model is a configuration problem; retrying will not fix it.
        retryable: res.status !== 404,
      });
    }

    const payload = await res.json();
    const raw = payload?.message?.content ?? '';
    return { data: parseJSON(raw, 'Ollama'), model: this.model, raw };
  }

  async health() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, model: this.model, detail: `Ollama returned ${res.status}` };

      const { models = [] } = await res.json();
      const names = models.map((m) => m.name);
      const present = names.includes(this.model) || names.includes(`${this.model}:latest`);

      return {
        ok: present,
        model: this.model,
        detail: present
          ? `${names.length} model${names.length === 1 ? '' : 's'} available`
          : `"${this.model}" is not pulled. Available: ${names.join(', ') || 'none'}`,
      };
    } catch (err) {
      return { ok: false, model: this.model, detail: `Ollama is not reachable at ${this.baseUrl}` };
    }
  }
}

/**
 * Models wrap JSON in prose or fences even when told not to, so pull out the
 * outermost object rather than trusting the whole string.
 */
export function parseJSON(raw, who) {
  const text = String(raw ?? '').trim();
  if (!text) throw new LLMError(`${who} returned nothing`);

  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  const braced = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (braced.length > 1) candidates.push(braced);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the next shape */
    }
  }
  throw new LLMError(`${who} did not return JSON: ${text.slice(0, 160)}`);
}
