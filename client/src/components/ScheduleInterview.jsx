import { useState } from 'react';
import { interviewScheduleSchema, fieldErrors, INTERVIEW_MODES } from '@naukri-suvidha/shared';

import { useScheduleInterview } from '../api/interviews.js';
import Field from './Field.jsx';
import Button from './ui/Button.jsx';

const MODE_LABEL = { online: 'Online', onsite: 'On site', phone: 'Phone' };

/** Inline form on an applicant card. Shown only once they are shortlisted. */
export default function ScheduleInterview({ applicationId, onDone }) {
  const schedule = useScheduleInterview();
  const [mode, setMode] = useState('online');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    const raw = { ...Object.fromEntries(new FormData(e.currentTarget)), applicationId, mode };
    const parsed = interviewScheduleSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});

    try {
      await schedule.mutateAsync({ ...parsed.data, scheduledAt: parsed.data.scheduledAt.toISOString() });
      onDone?.();
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3 rounded-lg border border-line bg-subtle p-4">
      <p className="text-sm font-medium">Schedule an interview</p>

      {formError && (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {INTERVIEW_MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              mode === m ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-card text-muted hover:text-ink'
            }`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Date and time" name="scheduledAt" type="datetime-local" error={errors.scheduledAt} required />
        <Field label="Minutes" name="durationMinutes" type="number" min="5" max="480" defaultValue={30} error={errors.durationMinutes} />
      </div>

      {mode === 'online' && (
        <div className="mt-3">
          <Field label="Meeting link" name="meetingLink" type="url" placeholder="https://" error={errors.meetingLink} required />
        </div>
      )}
      {mode === 'onsite' && (
        <div className="mt-3">
          <Field label="Location" name="location" error={errors.location} required />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="primary" size="sm"
          type="submit"
          disabled={schedule.isPending}>
          {schedule.isPending ? 'Scheduling…' : 'Schedule'}
        </Button>
        <button type="button" onClick={onDone} className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm hover:bg-subtle">
          Cancel
        </button>
      </div>
    </form>
  );
}
