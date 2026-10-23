import { FALLBACK_SCORE_CAP } from '@naukri-suvidha/shared';

/**
 * What happens when the model is unavailable, too slow, or returns nonsense.
 *
 * These are deliberately dumb: regexes and set arithmetic, no inference. They
 * exist so the portal keeps working during a demo when Ollama is stopped, and
 * so a student is never shown an empty screen because a queue backed up.
 *
 * Everything produced here is capped at FALLBACK_SCORE_CAP and flagged, so a
 * fallback score can never outrank one the model actually reasoned about.
 */

/** Skills we can recognise in free text without a model. */
const SKILL_VOCABULARY = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift',
  'Kotlin', 'React', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask',
  'Spring Boot', 'Tailwind', 'HTML', 'CSS', 'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis',
  'Kafka', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Linux', 'Git', 'REST APIs', 'GraphQL',
  'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Machine Learning', 'Deep Learning',
  'AutoCAD', 'SolidWorks', 'MATLAB', 'Figma', 'Excel', 'Power BI', 'Tableau', 'Selenium', 'Jenkins',
];

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?\b\d{10}\b/;

/** Word-boundary match so "Go" does not match "Google" or "going". */
function mentions(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, 'i').test(text);
}

export function extractProfileFallback(text) {
  const source = String(text ?? '');
  return {
    name: undefined,
    email: source.match(EMAIL)?.[0],
    phone: source.match(PHONE)?.[0]?.replace(/[\s-]/g, '').slice(-10),
    skills: SKILL_VOCABULARY.filter((skill) => mentions(source, skill)),
    education: [],
    experience: [],
    projects: [],
    certifications: [],
  };
}

const norm = (s) => String(s).trim().toLowerCase();

/**
 * Overlap between what the job asks for and what the student lists, nudged by
 * how far clear of the CGPA bar they are. No judgement, just counting.
 */
export function scoreFitFallback(student, job) {
  const required = (job.skillsRequired ?? []).map(norm);
  const held = new Set((student.skills ?? []).map(norm));

  const matched = required.filter((skill) => held.has(skill));
  const skills = required.length === 0 ? 60 : Math.round((matched.length / required.length) * 100);

  // Headroom above the minimum CGPA, as a proportion of what is left of the scale.
  const minCgpa = job.minCgpa ?? 0;
  const headroom = Math.max(0, (Number(student.cgpa) - minCgpa) / Math.max(0.1, 10 - minCgpa));
  const education = Math.round(Math.min(1, headroom) * 100);

  // Nothing here can see work history, so this is a flat, honest "unknown".
  const experience = 50;

  const raw = Math.round(skills * 0.55 + education * 0.3 + experience * 0.15);
  const score = Math.min(FALLBACK_SCORE_CAP, raw);

  // Report the job's own spelling, not the normalised form used for matching.
  const missing = (job.skillsRequired ?? []).filter((skill) => !held.has(norm(skill)));
  const reasoning =
    `Computed without the model. ${matched.length} of ${required.length || 0} listed skills matched` +
    (missing.length ? ` (missing: ${missing.slice(0, 5).join(', ')})` : '') +
    `, and the CGPA of ${student.cgpa} is against a minimum of ${minCgpa}. ` +
    `Capped at ${FALLBACK_SCORE_CAP} because no model reasoned about this.`;

  return { score, breakdown: { skills, experience, education }, reasoning };
}
