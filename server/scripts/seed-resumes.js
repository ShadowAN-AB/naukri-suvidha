/**
 * Gives ten seeded students a resume each, so semantic search has a corpus
 * worth searching.
 *
 *   npm run seed:resumes
 *
 * The ten are deliberately spread across specialities - distributed systems,
 * frontend, ML, devops, mobile, data engineering, security, embedded, full
 * stack, civil - because a corpus where everyone looks alike cannot show
 * whether retrieval works.
 *
 * Development data only. The resume text and the structured profile are
 * written directly; only the embedding runs through the real pipeline, which
 * is the part this seeds for. Uploading through the API would re-run LLM
 * extraction on all ten and take several minutes.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { connectDb, disconnectDb } from '../src/config/db.js';
import { getStorage } from '../src/infra/storage/index.js';
import { getEmbeddings } from '../src/infra/embeddings/index.js';
import { Resume } from '../src/modules/resumes/model.js';
import { Student } from '../src/modules/profiles/model.js';
import { PARSE_STATUS } from '../src/lib/constants.js';

const run = promisify(execFile);

const PEOPLE = [
  {
    speciality: 'distributed systems', branches: ['CSE', 'IT'],
    skills: ['Java', 'Kafka', 'Spring Boot', 'PostgreSQL', 'Docker', 'gRPC'],
    experience: [{ role: 'Backend Intern', company: 'Marigold Fintech', durationMonths: 3,
      summary: 'Built an event-driven order pipeline on Kafka handling 40k messages a minute. Added idempotent consumers and a dead-letter queue.' }],
    projects: [{ name: 'Ledger Replay', summary: 'An append-only transaction log with exactly-once replay semantics.', tech: ['Java', 'Kafka'] }],
  },
  {
    speciality: 'frontend', branches: ['CSE', 'IT'],
    skills: ['React', 'TypeScript', 'Tailwind', 'Figma', 'Vite', 'Accessibility'],
    experience: [{ role: 'Frontend Intern', company: 'Vertex Systems', durationMonths: 4,
      summary: 'Rebuilt a design system of 40 components and took the Lighthouse accessibility score from 68 to 97.' }],
    projects: [{ name: 'Campus Mess Tracker', summary: 'A React app used by 400 students to pre-book meals.', tech: ['React'] }],
  },
  {
    speciality: 'machine learning', branches: ['CSE', 'IT'],
    skills: ['Python', 'PyTorch', 'Pandas', 'scikit-learn', 'NLP', 'Hugging Face'],
    experience: [{ role: 'ML Intern', company: 'Lumen Health', durationMonths: 5,
      summary: 'Fine-tuned a transformer for clinical note classification, reaching 0.91 macro F1 on a held-out set.' }],
    projects: [{ name: 'Lecture Summariser', summary: 'Transcribes and summarises recorded lectures.', tech: ['Python', 'Whisper'] }],
  },
  {
    speciality: 'devops', branches: ['CSE', 'IT'],
    skills: ['Kubernetes', 'Terraform', 'AWS', 'Linux', 'GitHub Actions', 'Prometheus'],
    experience: [{ role: 'Platform Intern', company: 'Solvent Cloud', durationMonths: 6,
      summary: 'Migrated 12 services to Kubernetes and cut deploy time from 25 minutes to 4 with a reusable CI pipeline.' }],
    projects: [{ name: 'Self-healing Cluster', summary: 'Autoscaling and liveness probes on a bare-metal k3s cluster.', tech: ['Kubernetes'] }],
  },
  {
    speciality: 'mobile', branches: ['CSE', 'IT'],
    skills: ['Flutter', 'Dart', 'Kotlin', 'Firebase', 'REST APIs'],
    experience: [{ role: 'Mobile Intern', company: 'Northwind Analytics', durationMonths: 3,
      summary: 'Shipped an offline-first Flutter app with background sync and conflict resolution.' }],
    projects: [{ name: 'Attendance Scanner', summary: 'QR attendance with offline queueing.', tech: ['Flutter'] }],
  },
  {
    speciality: 'data engineering', branches: ['CSE', 'IT', 'ECE'],
    skills: ['Spark', 'Airflow', 'SQL', 'Python', 'dbt', 'Snowflake'],
    experience: [{ role: 'Data Intern', company: 'Northwind Analytics', durationMonths: 4,
      summary: 'Built nightly ETL moving 200GB into a warehouse, with Airflow DAGs and data quality checks.' }],
    projects: [{ name: 'Streaming Dedup', summary: 'Deduplicates a high-volume event stream before it lands in the warehouse.', tech: ['Spark', 'Kafka'] }],
  },
  {
    speciality: 'security', branches: ['CSE', 'IT', 'ECE'],
    skills: ['Burp Suite', 'OWASP', 'Python', 'Linux', 'Wireshark', 'Cryptography'],
    experience: [{ role: 'Security Intern', company: 'Marigold Fintech', durationMonths: 3,
      summary: 'Ran authenticated penetration tests and reported two authorisation bypasses in a payments API.' }],
    projects: [{ name: 'CTF Toolkit', summary: 'Scripts for web exploitation challenges.', tech: ['Python'] }],
  },
  {
    speciality: 'embedded', branches: ['ECE', 'EEE'],
    skills: ['C', 'C++', 'FreeRTOS', 'STM32', 'CAN bus', 'Oscilloscope'],
    experience: [{ role: 'Firmware Intern', company: 'Ironbark Robotics', durationMonths: 5,
      summary: 'Wrote motor control firmware on STM32 under FreeRTOS, with CAN telemetry at 1kHz.' }],
    projects: [{ name: 'Line Follower', summary: 'PID-controlled robot, 2nd place in a national contest.', tech: ['C'] }],
  },
  {
    speciality: 'full stack', branches: ['CSE', 'IT'],
    skills: ['React', 'Node.js', 'MongoDB', 'Express', 'JavaScript', 'Git'],
    experience: [{ role: 'Software Intern', company: 'Vertex Systems', durationMonths: 3,
      summary: 'Built internal dashboards end to end and added compound indexes that cut a report query from 4s to 300ms.' }],
    projects: [{ name: 'Placement Portal', summary: 'A MERN app for campus hiring.', tech: ['React', 'Node.js'] }],
  },
  {
    speciality: 'civil', branches: ['CIVIL', 'MECH'],
    skills: ['AutoCAD', 'STAAD Pro', 'Revit', 'Surveying', 'Project Planning'],
    experience: [{ role: 'Site Intern', company: 'Ironbark Robotics', durationMonths: 2,
      summary: 'Assisted structural surveys and prepared load calculations for a commercial build.' }],
    projects: [{ name: 'Bridge Load Simulator', summary: 'Models live load distribution across a span.', tech: ['Python'] }],
  },
];

function resumeText(student, person) {
  return `${student.name.toUpperCase()}
${student.rollNo} | ${student.branch} | Batch ${student.batchYear} | CGPA ${student.cgpa}

SKILLS
${person.skills.join(', ')}

EXPERIENCE
${person.experience.map((e) => `${e.role}, ${e.company} (${e.durationMonths} months)\n${e.summary}`).join('\n\n')}

PROJECTS
${person.projects.map((p) => `${p.name} - ${p.summary}`).join('\n')}
`;
}

async function main() {
  await connectDb();

  // Match each speciality to a student from a branch it plausibly comes from.
  // A civil engineering student with Kafka experience makes the demo look
  // like test data, because it is.
  const pool = await Student.find({ currentResumeId: null }).lean();
  const taken = new Set();
  const pairs = [];

  for (const person of PEOPLE) {
    const match =
      pool.find((s) => !taken.has(String(s._id)) && person.branches.includes(s.branch)) ??
      pool.find((s) => !taken.has(String(s._id)));
    if (!match) break;
    taken.add(String(match._id));
    pairs.push({ student: match, person });
  }

  if (pairs.length < PEOPLE.length) {
    console.log(`Only ${pairs.length} suitable students available; seeding those.`);
  }

  const storage = getStorage();
  const embeddings = getEmbeddings();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'naukri-suvidha-resumes-'));

  const texts = [];
  const created = [];

  for (const { student, person } of pairs) {
    const text = resumeText(student, person);

    // A real PDF, so the "View" button in the interface actually opens one.
    const txtPath = path.join(tmp, `${student.rollNo}.txt`);
    const pdfPath = path.join(tmp, `${student.rollNo}.pdf`);
    await fs.writeFile(txtPath, text);
    try {
      const { stdout } = await run('/bin/sh', ['-c', `cupsfilter -i text/plain "${txtPath}" 2>/dev/null`], {
        encoding: 'buffer',
        maxBuffer: 20 * 1024 * 1024,
      });
      await fs.writeFile(pdfPath, stdout);
    } catch {
      await fs.writeFile(pdfPath, Buffer.from(`%PDF-1.4\n${text}`));
    }

    const buffer = await fs.readFile(pdfPath);
    const { storageKey, sizeBytes } = await storage.put(buffer, {
      originalName: `${student.name.toLowerCase().replace(/\s+/g, '-')}-cv.pdf`,
      mimeType: 'application/pdf',
      prefix: 'resumes',
    });

    const resume = await Resume.create({
      studentId: student._id,
      version: 1,
      storageKey,
      originalName: `${student.name.toLowerCase().replace(/\s+/g, '-')}-cv.pdf`,
      mimeType: 'application/pdf',
      sizeBytes,
      extractedText: text,
      parseStatus: PARSE_STATUS.DONE,
      parsedByModel: 'seeded',
      parsedAt: new Date(),
      parsedProfile: {
        name: student.name,
        skills: person.skills,
        experience: person.experience,
        projects: person.projects,
        education: [{ degree: `B.Tech ${student.branch}`, year: student.batchYear }],
        certifications: [],
      },
    });

    await Student.updateOne(
      { _id: student._id },
      { $set: { currentResumeId: resume._id, skills: person.skills } },
    );

    texts.push(
      [person.skills.join(', '), ...person.experience.map((e) => `${e.role} at ${e.company}. ${e.summary}`),
        ...person.projects.map((p) => `${p.name}. ${p.summary} ${p.tech.join(' ')}`)].join('\n'),
    );
    created.push({ resume, student, person });
  }

  // One batch call rather than ten round trips.
  console.log(`embedding ${texts.length} resumes with ${embeddings.model}...`);
  const vectors = await embeddings.embed(texts);

  for (const [i, { resume }] of created.entries()) {
    await Resume.updateOne(
      { _id: resume._id },
      { $set: { embedding: vectors[i], embeddingModel: embeddings.model, embeddedAt: new Date() } },
    );
  }

  console.log('');
  for (const { student, person } of created) {
    console.log(`  ${student.rollNo.padEnd(14)} ${student.name.padEnd(16)} ${person.speciality}`);
  }
  console.log(`\n${created.length} resumes seeded and embedded (${vectors[0].length} dimensions).`);

  await fs.rm(tmp, { recursive: true, force: true });
  await disconnectDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
