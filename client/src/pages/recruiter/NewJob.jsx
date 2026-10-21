import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { jobCreateSchema, fieldErrors, BRANCHES } from '@nexus/shared';

import { useCreateJob } from '../../api/jobs.js';
import Field from '../../components/Field.jsx';
import PageHeader from '../../components/PageHeader.jsx';

export default function NewJob() {
  const navigate = useNavigate();
  const createJob = useCreateJob();
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const raw = {
      ...Object.fromEntries(form),
      // Checkboxes and the comma-separated skills field need shaping before
      // they match the schema the server validates against.
      allowedBranches: form.getAll('allowedBranches'),
      skillsRequired: String(form.get('skillsRequired') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    const parsed = jobCreateSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});

    try {
      await createJob.mutateAsync(parsed.data);
      navigate('/jobs', { replace: true });
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
    }
  };

  return (
    <>
      <Link to="/jobs" className="text-sm text-muted hover:text-ink">
        ← Your postings
      </Link>
      <PageHeader
        title="Post a job"
        description="The placement office reviews every posting. Students see it only after approval."
      />

      <form onSubmit={onSubmit} noValidate className="mt-8 max-w-2xl space-y-5">
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}

        <Field label="Job title" name="title" error={errors.title} required />

        <div>
          <label htmlFor="field-description" className="block text-sm font-medium">
            Description
          </label>
          <textarea
            id="field-description"
            name="description"
            rows={6}
            required
            aria-invalid={!!errors.description}
            className={`mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/30 ${
              errors.description ? 'border-danger' : 'border-line focus:border-accent'
            }`}
          />
          {errors.description && <p className="mt-1 text-xs text-danger">{errors.description}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Location" name="location" placeholder="Bengaluru, or Remote" error={errors.location} />
          <Field label="CTC (LPA)" name="ctcLpa" type="number" step="0.1" min="0" error={errors.ctcLpa} required />
        </div>

        <Field
          label="Skills"
          name="skillsRequired"
          placeholder="React, Node.js, SQL"
          hint="Separate with commas."
          error={errors.skillsRequired}
        />

        <fieldset className="rounded-xl border border-line bg-card p-4">
          <legend className="px-1 text-sm font-medium">Eligibility</legend>
          <p className="text-xs text-muted">
            These rules decide who can see and apply to this job. Changing them after approval
            sends the posting back for review.
          </p>

          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <Field label="Minimum CGPA" name="minCgpa" type="number" step="0.1" min="0" max="10" defaultValue="0" error={errors.minCgpa} />
            <Field label="Max backlogs" name="maxBacklogs" type="number" min="0" defaultValue="0" error={errors.maxBacklogs} />
            <Field label="Apply by" name="deadline" type="date" error={errors.deadline} required />
          </div>

          <div className="mt-4">
            <span className="block text-sm font-medium">Branches</span>
            <p className="text-xs text-muted">Leave all unchecked to open it to every branch.</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {BRANCHES.map((b) => (
                <label key={b} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="allowedBranches" value={b} className="size-4 rounded border-line" />
                  {b}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={createJob.isPending}
          className="rounded-lg bg-accent-solid px-4 py-2 text-sm font-medium text-on-solid transition hover:opacity-90 disabled:opacity-50"
        >
          {createJob.isPending ? 'Submitting…' : 'Submit for approval'}
        </button>
      </form>
    </>
  );
}
