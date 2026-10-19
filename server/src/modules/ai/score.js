import { fitScoreSchema, FALLBACK_SCORE_CAP } from '@nexus/shared';

import { logger } from '../../config/logger.js';
import { getLLM } from '../../infra/llm/index.js';
import { env } from '../../config/env.js';
import { scoreFitFallback } from './fallback.js';

const SYSTEM = `You score how well a student fits a campus placement role.

Rules:
- Return a single JSON object and nothing else. No prose, no markdown fences.
- "score" is 0-100 overall. The breakdown values are each 0-100.
- Judge on evidence in the profile. Absence of evidence lowers a score; it is not a reason to invent one.
- "reasoning" is two or three sentences a student could act on, naming specific skills.
- Eligibility has already been checked elsewhere. Do not comment on CGPA cutoffs or branch rules.`;

const SHAPE = `{
  "score": number,
  "breakdown": { "skills": number, "experience": number, "education": number },
  "reasoning": string
}`;

function buildPrompt(student, job) {
  const profile = student.parsedProfile ?? {};
  return `Score this student against this job. Return JSON matching exactly:
${SHAPE}

JOB
Title: ${job.title}
Skills wanted: ${(job.skillsRequired ?? []).join(', ') || 'not specified'}
Description: ${String(job.description ?? '').slice(0, 1500)}

STUDENT
Branch: ${student.branch} · Batch: ${student.batchYear} · CGPA: ${student.cgpa}
Listed skills: ${(student.skills ?? []).join(', ') || 'none listed'}
Experience: ${
    (profile.experience ?? [])
      .map((e) => `${e.role ?? 'role'} at ${e.company ?? 'a company'} (${e.durationMonths ?? '?'} months)`)
      .join('; ') || 'none listed'
  }
Projects: ${
    (profile.projects ?? []).map((p) => `${p.name ?? 'project'}: ${p.summary ?? ''}`).join('; ') ||
    'none listed'
  }`;
}

/**
 * Scores one student against one job.
 *
 * Same two-attempt contract as extraction. On failure it falls back to skill
 * overlap, which is capped at ${FALLBACK_SCORE_CAP} and flagged, so a guess can never
 * outrank a judgement.
 *
 * @returns {Promise<{ score: number, breakdown: object, reasoning: string, model: string, fallback: boolean }>}
 */
export async function scoreFit(student, job, { timeoutMs = env.AI_TIMEOUT_MS } = {}) {
  const llm = getLLM();
  const prompt = buildPrompt(student, job);

  let lastRaw = null;
  let lastIssues = null;

  for (const attempt of [1, 2]) {
    try {
      const { data, model, raw } =
        attempt === 1
          ? await llm.generateJSON({ prompt, system: SYSTEM, maxTokens: 700, timeoutMs })
          : await llm.generateJSON({
              prompt: `${prompt}\n\nYour previous answer was rejected:\n${lastRaw?.slice(0, 800)}\n\nIt failed validation:\n${lastIssues}\n\nReturn corrected JSON only.`,
              system: SYSTEM,
              maxTokens: 700,
              timeoutMs,
            });

      const parsed = fitScoreSchema.safeParse(data);
      if (parsed.success) {
        return { ...parsed.data, score: Math.round(parsed.data.score), model, fallback: false };
      }

      lastRaw = raw;
      lastIssues = parsed.error.issues
        .map((i) => `- ${i.path.join('.') || 'root'}: ${i.message}`)
        .join('\n');
      logger.warn({ attempt, issues: lastIssues }, 'fit score failed validation');
    } catch (err) {
      logger.warn({ attempt, err: err.message }, 'fit scoring call failed');
      if (err.retryable === false) break;
      lastIssues = err.message;
    }
  }

  return { ...scoreFitFallback(student, job), model: 'fallback', fallback: true };
}
