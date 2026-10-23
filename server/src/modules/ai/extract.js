import { parsedProfileSchema } from '@naukri-suvidha/shared';

import { logger } from '../../config/logger.js';
import { getLLM } from '../../infra/llm/index.js';
import { env } from '../../config/env.js';
import { extractProfileFallback } from './fallback.js';

const SYSTEM = `You read campus placement resumes and return structured JSON.

Rules:
- Return a single JSON object and nothing else. No prose, no markdown fences.
- Copy facts from the resume. Never invent a name, email, employer or date.
- Omit a field entirely if the resume does not state it. Do not guess.
- "skills" is a flat list of individual technologies or tools.
- "durationMonths" is a whole number of months.`;

const SHAPE = `{
  "name": string,
  "email": string,
  "phone": string,
  "skills": string[],
  "education": [{ "degree": string, "institution": string, "year": number, "score": string }],
  "experience": [{ "role": string, "company": string, "durationMonths": number, "summary": string }],
  "projects": [{ "name": string, "summary": string, "tech": string[] }],
  "certifications": string[]
}`;

/** Resumes are short; this keeps a pathological upload from filling a context window. */
const MAX_CHARS = 18_000;

function buildPrompt(text) {
  return `Extract this resume into JSON matching exactly this shape:\n${SHAPE}\n\nRESUME:\n"""\n${text.slice(0, MAX_CHARS)}\n"""`;
}

/**
 * Turns resume text into a structured profile.
 *
 * The model gets two chances: the first answer, and if that fails validation,
 * one repair attempt that is shown its own output and what was wrong with it.
 * A second failure falls back to regexes rather than failing the student's
 * upload, and the result says which path produced it.
 *
 * @returns {Promise<{ profile: object, model: string, fallback: boolean, note?: string }>}
 */
export async function extractProfile(text, { timeoutMs = env.AI_TIMEOUT_MS } = {}) {
  const llm = getLLM();
  const prompt = buildPrompt(text);

  let firstRaw = null;
  let firstIssues = null;

  for (const attempt of [1, 2]) {
    try {
      const { data, model, raw } =
        attempt === 1
          ? await llm.generateJSON({ prompt, system: SYSTEM, maxTokens: 2048, timeoutMs })
          : await llm.generateJSON({
              prompt: `${prompt}\n\nYour previous answer was rejected:\n${firstRaw?.slice(0, 1500)}\n\nIt failed validation:\n${firstIssues}\n\nReturn corrected JSON only.`,
              system: SYSTEM,
              maxTokens: 2048,
              timeoutMs,
            });

      const parsed = parsedProfileSchema.safeParse(data);
      if (parsed.success) {
        return { profile: parsed.data, model, fallback: false };
      }

      firstRaw = raw;
      firstIssues = parsed.error.issues
        .map((i) => `- ${i.path.join('.') || 'root'}: ${i.message}`)
        .join('\n');
      logger.warn({ attempt, issues: firstIssues }, 'extracted profile failed validation');
    } catch (err) {
      logger.warn({ attempt, err: err.message }, 'resume extraction call failed');
      // A provider that says retrying will not help is taken at its word.
      if (err.retryable === false) break;
      firstIssues = err.message;
    }
  }

  const profile = parsedProfileSchema.parse(extractProfileFallback(text));
  return {
    profile,
    model: 'fallback',
    fallback: true,
    note: 'The model could not produce a valid profile, so this was read with pattern matching. Skills only.',
  };
}
