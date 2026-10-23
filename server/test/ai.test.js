import { describe, expect, it } from 'vitest';
import { FALLBACK_SCORE_CAP, parsedProfileSchema, fitScoreSchema } from '@naukri-suvidha/shared';

import { extractProfileFallback, scoreFitFallback } from '../src/modules/ai/fallback.js';
import { extractProfile } from '../src/modules/ai/extract.js';
import { scoreFit } from '../src/modules/ai/score.js';
import { sniffFileType } from '../src/lib/fileType.js';
import { parseJSON } from '../src/infra/llm/ollama.js';
import { api } from './helpers.js';

const CV = `Aarav Kaur
aarav.kaur@naukrisuvidha.test | 9876543210
Skills: AutoCAD, Git, Python, SQL
Worked on a bridge load simulator.`;

describe('the deterministic fallback', () => {
  it('finds contact details and known skills without a model', () => {
    const profile = extractProfileFallback(CV);
    expect(profile.email).toBe('aarav.kaur@naukrisuvidha.test');
    expect(profile.phone).toBe('9876543210');
    expect(profile.skills).toEqual(expect.arrayContaining(['AutoCAD', 'Git', 'Python', 'SQL']));
  });

  it('matches on word boundaries, so "Go" is not found inside "Google"', () => {
    expect(extractProfileFallback('We used Google Cloud heavily').skills).not.toContain('Go');
  });

  it('produces something the profile schema accepts', () => {
    expect(parsedProfileSchema.safeParse(extractProfileFallback(CV)).success).toBe(true);
  });

  it('never exceeds the cap, however good the match', () => {
    const perfect = scoreFitFallback(
      { cgpa: 10, backlogs: 0, skills: ['javascript'] },
      { skillsRequired: ['JavaScript'], minCgpa: 0 },
    );
    expect(perfect.score).toBeLessThanOrEqual(FALLBACK_SCORE_CAP);
  });

  it('scores a good match above a poor one', () => {
    const student = { cgpa: 9, backlogs: 0, skills: ['react', 'node.js'] };
    const good = scoreFitFallback(student, { skillsRequired: ['React', 'Node.js'], minCgpa: 6 });
    const poor = scoreFitFallback(student, { skillsRequired: ['Rust', 'Kafka'], minCgpa: 6 });
    expect(good.score).toBeGreaterThan(poor.score);
  });

  it('names the missing skills in the job’s own spelling', () => {
    const { reasoning } = scoreFitFallback(
      { cgpa: 8, backlogs: 0, skills: [] },
      { skillsRequired: ['Kubernetes'], minCgpa: 6 },
    );
    expect(reasoning).toContain('Kubernetes');
  });

  it('is deterministic', () => {
    const args = [{ cgpa: 8, backlogs: 0, skills: ['git'] }, { skillsRequired: ['Git'], minCgpa: 6 }];
    expect(scoreFitFallback(...args)).toEqual(scoreFitFallback(...args));
  });

  it('produces something the score schema accepts', () => {
    const result = scoreFitFallback(
      { cgpa: 8, backlogs: 0, skills: ['git'] },
      { skillsRequired: ['Git'], minCgpa: 6 },
    );
    expect(fitScoreSchema.safeParse(result).success).toBe(true);
  });
});

/**
 * The suite points the provider at a dead port, so these exercise what happens
 * when the model is unreachable - which is the demo-day scenario.
 */
describe('with no model reachable', () => {
  it('still returns a usable profile, flagged as a fallback', async () => {
    const { profile, fallback, model } = await extractProfile(CV);
    expect(fallback).toBe(true);
    expect(model).toBe('fallback');
    expect(profile.skills.length).toBeGreaterThan(0);
  });

  it('still returns a capped, flagged score', async () => {
    const result = await scoreFit(
      { branch: 'CSE', batchYear: 2027, cgpa: 8, backlogs: 0, skills: ['Git'] },
      { title: 'Engineer', skillsRequired: ['Git'], description: 'A role.' },
    );
    expect(result.fallback).toBe(true);
    expect(result.score).toBeLessThanOrEqual(FALLBACK_SCORE_CAP);
    expect(result.reasoning.length).toBeGreaterThan(10);
  });

  it('reports itself degraded, and says what that means', async () => {
    const res = await api().get('/api/ai/health').expect(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.degradedBehaviour).toContain('70');
  });
});

describe('model output parsing', () => {
  it('reads plain JSON', () => {
    expect(parseJSON('{"a":1}', 'test')).toEqual({ a: 1 });
  });
  it('reads JSON inside a markdown fence', () => {
    expect(parseJSON('```json\n{"a":2}\n```', 'test')).toEqual({ a: 2 });
  });
  it('reads JSON surrounded by prose', () => {
    expect(parseJSON('Sure! {"a":3} hope that helps', 'test')).toEqual({ a: 3 });
  });
  it('throws on something that is not JSON at all', () => {
    expect(() => parseJSON('I cannot help with that', 'test')).toThrow();
  });
});

describe('upload sniffing', () => {
  it('accepts a real PDF header', () => {
    expect(sniffFileType(Buffer.from('%PDF-1.7\nrest'))?.kind).toBe('pdf');
  });

  it('rejects a text file named .pdf', () => {
    expect(sniffFileType(Buffer.from('this is plainly not a pdf'))).toBeNull();
  });

  /** Every zip starts PK\x03\x04 - a .docx is the one containing word/. */
  it('rejects a plain zip that is not a Word document', () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('images/cat.png')]);
    expect(sniffFileType(zip)).toBeNull();
  });

  it('accepts a zip that does contain a word/ entry', () => {
    const docx = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('[Content_Types].xml word/document.xml'),
    ]);
    expect(sniffFileType(docx)?.kind).toBe('docx');
  });
});
