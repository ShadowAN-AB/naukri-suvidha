/**
 * Seeds a demo placement cycle: 3 admins, 6 companies, 40 students, 12 jobs.
 *
 *   npm run seed            add seed data, refusing if the database is not empty
 *   npm run seed -- --fresh wipe the seeded collections first
 *
 * The data is deterministic: the same run produces the same roll numbers,
 * CGPAs and job assignments every time, so a demo script written on Monday
 * still works on Friday.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { env } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import * as models from '../src/models.js';
const { User, Student, Company, Job } = models;
import { JOB_STATUS, PLACEMENT_STATUS, ROLES } from '../src/lib/constants.js';

/** Every seeded account shares this password. Development data only. */
const SEED_PASSWORD = 'Passw0rd!seed';

/** Deterministic PRNG so repeated seeds are identical. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261019);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);
const between = (lo, hi, dp = 0) => Number((lo + rand() * (hi - lo)).toFixed(dp));

const FIRST = ['Aarav','Diya','Rohan','Ishita','Kabir','Ananya','Vihaan','Meera','Arjun','Saanvi',
  'Reyansh','Aditi','Kiaan','Navya','Dhruv','Riya','Advait','Tara','Yash','Nisha',
  'Om','Pari','Krish','Anvi','Laksh','Sara','Veer','Myra','Atharv','Kavya',
  'Shaurya','Ira','Neil','Zoya','Ayaan','Trisha','Rudra','Avni','Kian','Mahi'];
const LAST = ['Sharma','Verma','Patel','Reddy','Nair','Iyer','Singh','Gupta','Mehta','Joshi',
  'Rao','Chopra','Bose','Khan','Das','Pillai','Kaur','Shetty','Mishra','Ghosh'];
const BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL'];
const SKILLS = ['JavaScript','React','Node.js','Python','Java','C++','SQL','MongoDB','Docker',
  'AWS','Git','TypeScript','Django','Spring Boot','Kubernetes','TensorFlow','Pandas',
  'REST APIs','GraphQL','Linux','Figma','Tailwind','Redis','Kafka'];

const COMPANIES = [
  { name: 'Northwind Analytics', industry: 'Data & Analytics', website: 'https://northwind.example.com' },
  { name: 'Vertex Systems',      industry: 'Enterprise Software', website: 'https://vertex.example.com' },
  { name: 'Lumen Health',        industry: 'Health Tech', website: 'https://lumenhealth.example.com' },
  { name: 'Ironbark Robotics',   industry: 'Robotics & Automation', website: 'https://ironbark.example.com' },
  { name: 'Solvent Cloud',    industry: 'Cloud Infrastructure', website: 'https://solvent.example.com' },
  { name: 'Marigold Fintech',    industry: 'Financial Services', website: 'https://marigold.example.com' },
];

const JOB_TEMPLATES = [
  { title: 'Software Engineer, Backend',  skills: ['Node.js','MongoDB','REST APIs','Docker'], ctc: 12, branches: ['CSE','IT'] },
  { title: 'Frontend Engineer',           skills: ['React','TypeScript','Tailwind','Git'],    ctc: 11, branches: ['CSE','IT'] },
  { title: 'Data Analyst',                skills: ['Python','SQL','Pandas'],                  ctc: 9,  branches: ['CSE','IT','ECE'] },
  { title: 'Machine Learning Engineer',   skills: ['Python','TensorFlow','Pandas','AWS'],     ctc: 16, branches: ['CSE','IT'] },
  { title: 'Platform Engineer',           skills: ['Kubernetes','Docker','Linux','AWS'],      ctc: 14, branches: ['CSE','IT','ECE'] },
  { title: 'Embedded Systems Engineer',   skills: ['C++','Linux','Git'],                      ctc: 8,  branches: ['ECE','EEE'] },
  { title: 'Full Stack Developer',        skills: ['React','Node.js','SQL','Git'],            ctc: 10, branches: ['CSE','IT'] },
  { title: 'QA Automation Engineer',      skills: ['JavaScript','Git','REST APIs'],           ctc: 7,  branches: ['CSE','IT','ECE'] },
  { title: 'Cloud Support Engineer',      skills: ['AWS','Linux','SQL'],                      ctc: 7.5,branches: [] },
  { title: 'Java Backend Engineer',       skills: ['Java','Spring Boot','SQL','Kafka'],       ctc: 13, branches: ['CSE','IT'] },
  { title: 'Product Engineer (Intern)',   skills: ['React','Node.js','Git'],                  ctc: 6,  branches: [] },
  { title: 'Mechanical Design Engineer',  skills: ['Git'],                                    ctc: 6.5,branches: ['MECH','CIVIL'] },
];

/** Only these are generated. */
const SEEDED_MODELS = [User, Student, Company, Job];

/**
 * --fresh clears everything, not just what it generates. Wiping users but
 * leaving applications and resumes behind would leave rows pointing at
 * students who no longer exist, which looks like corruption the first time
 * you hit it.
 */
const ALL_MODELS = Object.values(models);

async function makeUser(email, role, passwordHash) {
  return User.create({ email, role, passwordHash });
}

async function main() {
  const fresh = process.argv.includes('--fresh');
  await connectDb();

  // Make sure unique indexes exist before inserting, or duplicates slip in.
  await Promise.all(SEEDED_MODELS.map((M) => M.syncIndexes()));

  const existing = await User.estimatedDocumentCount();
  if (existing > 0 && !fresh) {
    console.error(
      `Refusing to seed: ${existing} users already exist.\n` +
      `Run "npm run seed -- --fresh" to wipe the seeded collections first.`,
    );
    await disconnectDb();
    process.exit(1);
  }
  if (fresh) {
    await Promise.all(ALL_MODELS.map((M) => M.deleteMany({})));
    console.log(`wiped all ${ALL_MODELS.length} collections`);
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, env.BCRYPT_ROUNDS);

  // ---- admins ----
  const admins = [];
  for (const slug of ['tpo', 'registrar', 'dean']) {
    const u = await makeUser(`${slug}@naukrisuvidha.edu`, ROLES.ADMIN, passwordHash);
    admins.push(u);
  }

  // ---- companies ----
  const companies = [];
  for (const [i, c] of COMPANIES.entries()) {
    const u = await makeUser(`recruiter${i + 1}@${c.name.toLowerCase().replace(/[^a-z]/g, '')}.example.com`, ROLES.RECRUITER, passwordHash);
    const company = await Company.create({
      userId: u._id,
      name: c.name,
      website: c.website,
      industry: c.industry,
      description: `${c.name} hires from campus every year for ${c.industry.toLowerCase()} roles.`,
      verified: i < 5, // one unverified company, so the admin view has something to do
    });
    companies.push(company);
  }

  // ---- students ----
  const students = [];
  for (let i = 0; i < 40; i++) {
    const first = FIRST[i % FIRST.length];
    const last = pick(LAST);
    const branch = pick(BRANCHES);
    const batchYear = pick([2026, 2027]);
    const rollNo = `${batchYear}${branch}${String(i + 1).padStart(3, '0')}`;
    const u = await makeUser(`${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@naukrisuvidha.edu`, ROLES.STUDENT, passwordHash);
    const s = await Student.create({
      userId: u._id,
      name: `${first} ${last}`,
      phone: `9${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`,
      rollNo,
      branch,
      batchYear,
      cgpa: between(5.5, 9.8, 2),
      backlogs: rand() < 0.75 ? 0 : Math.floor(between(1, 3)),
      skills: pickN(SKILLS, Math.floor(between(3, 8))),
      placementStatus: PLACEMENT_STATUS.UNPLACED,
    });
    students.push(s);
  }

  // ---- jobs ----
  // 8 approved and open, 3 pending (the admin queue), 1 closed.
  const jobs = [];
  const now = Date.now();
  for (const [i, t] of JOB_TEMPLATES.entries()) {
    let status = JOB_STATUS.APPROVED;
    if (i >= 8 && i < 11) status = JOB_STATUS.PENDING;
    if (i === 11) status = JOB_STATUS.CLOSED;

    const company = companies[i % companies.length];
    const approved = status === JOB_STATUS.APPROVED || status === JOB_STATUS.CLOSED;

    jobs.push(
      await Job.create({
        companyId: company._id,
        title: t.title,
        description:
          `${company.name} is hiring a ${t.title}. You will work with ${t.skills.slice(0, 3).join(', ')} ` +
          `alongside a small team. Final-year students from the listed branches may apply.`,
        location: pick(['Bengaluru', 'Hyderabad', 'Pune', 'Remote', 'Gurugram']),
        skillsRequired: t.skills,
        minCgpa: Number(between(6, 7.5, 1)),
        maxBacklogs: rand() < 0.6 ? 0 : 1,
        allowedBranches: t.branches,
        ctcLpa: t.ctc,
        deadline: new Date(now + Math.floor(between(10, 60)) * 86400000),
        status,
        ...(approved ? { approvedBy: admins[0]._id, approvedAt: new Date() } : {}),
      }),
    );
  }

  const counts = {
    admins: admins.length,
    companies: companies.length,
    students: students.length,
    jobs: jobs.length,
    jobsApproved: jobs.filter((j) => j.status === JOB_STATUS.APPROVED).length,
    jobsPending: jobs.filter((j) => j.status === JOB_STATUS.PENDING).length,
  };

  console.log('\nseeded:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log('\nsign in with any seeded email; the shared password is SEED_PASSWORD in scripts/seed.js');
  console.log(`  admin      ${admins[0].email}`);
  console.log(`  recruiter  ${(await User.findById(companies[0].userId)).email}`);
  console.log(`  student    ${(await User.findById(students[0].userId)).email}\n`);

  await disconnectDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('seed failed:', err.message);
  if (err.code === 11000) console.error('duplicate key:', JSON.stringify(err.keyValue));
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
