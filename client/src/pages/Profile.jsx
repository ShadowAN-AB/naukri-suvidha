import { useState } from 'react';
import { studentProfileUpdateSchema, companyProfileUpdateSchema, fieldErrors, BRANCHES } from '@nexus/shared';

import { useMyProfile, useUpdateProfile } from '../api/profiles.js';
import Field from '../components/Field.jsx';

export default function Profile() {
  const { data, isPending } = useMyProfile();
  const update = useUpdateProfile();
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState(null);

  if (isPending) return <p className="text-sm text-muted">Loading…</p>;

  const { kind, profile } = data;
  if (kind === 'admin') {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
        <p className="mt-1 text-muted">Placement office accounts have no profile to edit.</p>
      </>
    );
  }

  const isStudent = kind === 'student';
  const schema = isStudent ? studentProfileUpdateSchema : companyProfileUpdateSchema;

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);

    const form = new FormData(e.currentTarget);
    const raw = Object.fromEntries(form);
    if (isStudent) {
      raw.skills = String(form.get('skills') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});

    try {
      await update.mutateAsync(parsed.data);
      setSaved(true);
    } catch (err) {
      setErrors(err.details ?? {});
      setFormError(err.message);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
      <p className="mt-1 text-muted">
        {isStudent
          ? 'Your CGPA, backlogs and branch decide which jobs you are eligible for.'
          : 'This is what students see next to your postings.'}
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-8 max-w-xl space-y-5">
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
        {saved && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">Saved.</p>
        )}

        {isStudent ? (
          <>
            <Field label="Full name" name="name" defaultValue={profile.name} error={errors.name} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Phone" name="phone" defaultValue={profile.phone ?? ''} error={errors.phone} />
              <Field label="Roll number" name="rollNo" defaultValue={profile.rollNo} disabled hint="Set by the placement office." />
            </div>
            <div className="grid gap-5 sm:grid-cols-4">
              <Field label="Branch" name="branch" as="select" defaultValue={profile.branch} error={errors.branch}>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Field>
              <Field label="Batch" name="batchYear" type="number" defaultValue={profile.batchYear} error={errors.batchYear} />
              <Field label="CGPA" name="cgpa" type="number" step="0.01" min="0" max="10" defaultValue={profile.cgpa} error={errors.cgpa} />
              <Field label="Backlogs" name="backlogs" type="number" min="0" defaultValue={profile.backlogs} error={errors.backlogs} />
            </div>
            <Field
              label="Skills"
              name="skills"
              defaultValue={(profile.skills ?? []).join(', ')}
              hint="Separate with commas. Phase 5 fills this in from your résumé automatically."
              error={errors.skills}
            />
          </>
        ) : (
          <>
            <Field label="Company name" name="name" defaultValue={profile.name} error={errors.name} />
            <Field label="Website" name="website" type="url" defaultValue={profile.website ?? ''} error={errors.website} />
            <Field label="Industry" name="industry" defaultValue={profile.industry ?? ''} error={errors.industry} />
            <div>
              <label htmlFor="field-description" className="block text-sm font-medium">About</label>
              <textarea
                id="field-description"
                name="description"
                rows={4}
                defaultValue={profile.description ?? ''}
                className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={update.isPending}
          className="rounded-lg bg-accent-solid px-4 py-2 text-sm font-medium text-on-solid transition hover:opacity-90 disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </>
  );
}
