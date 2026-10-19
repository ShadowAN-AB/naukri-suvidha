import PQueue from 'p-queue';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { eventBus } from '../../infra/events/eventBus.js';
import {
  AI_TASK_STATUS,
  AI_TASK_TYPE,
  EVENTS,
  JOB_STATUS,
  PARSE_STATUS,
} from '../../lib/constants.js';
import { AiTask, FitScore } from './model.js';
import { Resume } from '../resumes/model.js';
import { Student } from '../profiles/model.js';
import { Job } from '../jobs/model.js';
import { Application } from '../applications/model.js';
import { extractProfile } from './extract.js';
import { scoreFit } from './score.js';

/** One event must never be able to queue unbounded work. */
const MAX_FANOUT = 200;

/**
 * The model never runs inside a request.
 *
 * Work is written to aiTasks first, then handed to an in-process queue at a
 * small concurrency. The database row is the durable part: the queue is lost
 * on restart, so anything left queued or stranded mid-run is picked up again
 * on boot. A task that fails its attempts lands in `dead` and is not retried,
 * which keeps a poisonous resume from cycling forever.
 */
class AiWorker {
  constructor() {
    this.queue = new PQueue({ concurrency: env.AI_CONCURRENCY });
    this.started = false;
  }

  get stats() {
    return { pending: this.queue.pending, queued: this.queue.size, concurrency: this.queue.concurrency };
  }

  async start() {
    if (this.started) return;
    this.started = true;

    eventBus.subscribe(EVENTS.RESUME_UPLOADED, ({ resumeId }) =>
      this.enqueue(AI_TASK_TYPE.EXTRACT_RESUME, resumeId),
    );

    // A newly approved job needs scoring against everyone who could apply.
    eventBus.subscribe(EVENTS.JOB_APPROVED, ({ jobId }) => this.scoreJobAgainstStudents(jobId));

    // A changed profile invalidates every score that student already has.
    eventBus.subscribe(EVENTS.RESUME_PROCESSED, ({ studentId }) =>
      this.scoreStudentAgainstJobs(studentId),
    );

    await this.recover();
    logger.info({ concurrency: env.AI_CONCURRENCY }, 'aiWorker started');
  }

  /** Anything the last process was holding when it stopped. */
  async recover() {
    const stranded = await AiTask.updateMany(
      { status: AI_TASK_STATUS.RUNNING },
      { $set: { status: AI_TASK_STATUS.QUEUED } },
    );
    const open = await AiTask.find({ status: AI_TASK_STATUS.QUEUED }).limit(MAX_FANOUT).lean();
    if (stranded.modifiedCount || open.length) {
      logger.info(
        { stranded: stranded.modifiedCount, queued: open.length },
        'aiWorker recovering tasks from a previous run',
      );
    }
    for (const task of open) this.#schedule(String(task._id));
  }

  async enqueue(type, refId, payload = {}) {
    // Do not pile up identical work; one pending task per thing is enough.
    const existing = await AiTask.findOne({
      type,
      refId,
      status: { $in: [AI_TASK_STATUS.QUEUED, AI_TASK_STATUS.RUNNING] },
      ...(payload.jobId ? { 'payload.jobId': payload.jobId } : {}),
    }).lean();
    if (existing) return String(existing._id);

    const task = await AiTask.create({ type, refId, payload });
    this.#schedule(String(task._id));
    return String(task._id);
  }

  #schedule(taskId) {
    this.queue.add(() => this.#run(taskId)).catch((err) => logger.error({ err, taskId }, 'task crashed'));
  }

  async #run(taskId) {
    // Claim atomically so a recovered task cannot be run twice.
    const task = await AiTask.findOneAndUpdate(
      { _id: taskId, status: { $in: [AI_TASK_STATUS.QUEUED, AI_TASK_STATUS.FAILED] } },
      { $set: { status: AI_TASK_STATUS.RUNNING, startedAt: new Date() }, $inc: { attempts: 1 } },
      { new: true },
    );
    if (!task) return;

    try {
      if (task.type === AI_TASK_TYPE.EXTRACT_RESUME) await this.#extract(task);
      else if (task.type === AI_TASK_TYPE.SCORE_FIT) await this.#score(task);
      else throw new Error(`Unknown task type ${task.type}`);

      task.status = AI_TASK_STATUS.DONE;
      task.finishedAt = new Date();
      task.lastError = undefined;
      await task.save();
    } catch (err) {
      const exhausted = task.attempts >= env.AI_TASK_MAX_ATTEMPTS;
      task.status = exhausted ? AI_TASK_STATUS.DEAD : AI_TASK_STATUS.FAILED;
      task.lastError = String(err.message).slice(0, 500);
      task.finishedAt = new Date();
      await task.save();

      logger[exhausted ? 'error' : 'warn'](
        { taskId, type: task.type, attempts: task.attempts, err: err.message },
        exhausted ? 'ai task dead' : 'ai task failed, will retry',
      );
      if (!exhausted) setTimeout(() => this.#schedule(taskId), 2000 * task.attempts).unref();
    }
  }

  async #extract(task) {
    const resume = await Resume.findById(task.refId).select('+extractedText');
    if (!resume) throw new Error('Resume no longer exists');
    if (!resume.extractedText) throw new Error('Resume has no extracted text to read');

    const { profile, model, fallback, note } = await extractProfile(resume.extractedText);

    resume.parsedProfile = profile;
    resume.parseStatus = fallback ? PARSE_STATUS.MANUAL : PARSE_STATUS.DONE;
    resume.parsedByModel = model;
    resume.parsedAt = new Date();
    resume.parseError = note;
    await resume.save();

    // The student's own skill list is what eligibility and the fallback use,
    // so fill in anything the resume knew that the profile did not.
    if (profile.skills?.length) {
      const student = await Student.findById(resume.studentId);
      if (student) {
        const merged = new Set([...(student.skills ?? []), ...profile.skills]);
        student.skills = [...merged].slice(0, 40);
        await student.save();
      }
    }

    eventBus.publish(EVENTS.RESUME_PROCESSED, {
      resumeId: String(resume._id),
      studentId: String(resume.studentId),
      fallback,
    });
  }

  async #score(task) {
    const [student, job] = await Promise.all([
      Student.findById(task.refId).lean(),
      Job.findById(task.payload?.jobId).lean(),
    ]);
    if (!student) throw new Error('Student no longer exists');
    if (!job) throw new Error('Job no longer exists');

    // Give the model the parsed profile, not just the self-reported skills.
    const resume = student.currentResumeId
      ? await Resume.findById(student.currentResumeId).lean()
      : null;

    const result = await scoreFit({ ...student, parsedProfile: resume?.parsedProfile }, job);

    // Keep any existing application in step, so the recruiter's sorted list
    // and the cached score never disagree.
    await Application.updateOne(
      { studentId: student._id, jobId: job._id },
      { $set: { fitScore: result.score } },
    );

    await FitScore.findOneAndUpdate(
      { studentId: student._id, jobId: job._id },
      {
        $set: {
          score: result.score,
          breakdown: result.breakdown,
          reasoning: result.reasoning,
          model: result.model,
          fallback: result.fallback,
          computedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /** Every student with a resume, scored against one newly approved job. */
  async scoreJobAgainstStudents(jobId) {
    const job = await Job.findById(jobId).lean();
    if (!job || job.status !== JOB_STATUS.APPROVED) return;

    const students = await Student.find({ currentResumeId: { $ne: null } })
      .select('_id')
      .limit(MAX_FANOUT)
      .lean();

    for (const s of students) {
      await this.enqueue(AI_TASK_TYPE.SCORE_FIT, s._id, { jobId: String(job._id) });
    }
    logger.info({ jobId, students: students.length }, 'queued scoring for a newly approved job');
  }

  /** One student, scored against every job that is currently open. */
  async scoreStudentAgainstJobs(studentId) {
    const jobs = await Job.find({ status: JOB_STATUS.APPROVED, deadline: { $gte: new Date() } })
      .select('_id')
      .limit(MAX_FANOUT)
      .lean();

    for (const job of jobs) {
      await this.enqueue(AI_TASK_TYPE.SCORE_FIT, studentId, { jobId: String(job._id) });
    }
    logger.info({ studentId, jobs: jobs.length }, 'queued scoring for a processed resume');
  }
}

export const aiWorker = new AiWorker();
