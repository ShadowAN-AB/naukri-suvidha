import { useRef, useState } from 'react';
import { useMyResumes, useUploadResume } from '../../api/resumes.js';
import ProtectedFileLink from '../../components/ProtectedFileLink.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { formatDate } from '../../lib/format.js';
import PageHeader from '../../components/PageHeader.jsx';
import Button from '../../components/ui/Button.jsx';

const MAX_MB = 5;

export default function Resume() {
  const { data, isPending } = useMyResumes();
  const upload = useUploadResume();
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);

  const items = data?.items ?? [];
  const currentId = data?.currentResumeId;

  const send = async (file) => {
    setError(null);
    if (!file) return;
    // A cheap check so an obviously wrong file never leaves the browser. The
    // server checks the bytes regardless.
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError('Upload a PDF or a Word document.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_MB} MB.`);
      return;
    }
    try {
      await upload.mutateAsync(file);
    } catch (err) {
      setError(err.details?.file ?? err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Your résumé"
        description="Upload once. The newest version is the one sent with every application you make."
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          send(e.dataTransfer.files?.[0]);
        }}
        className={`mt-6 rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragging ? 'border-accent bg-accent-soft/50' : 'border-line bg-card'
        }`}
      >
        <p className="text-sm font-medium">Drag a file here, or</p>
        <Button variant="primary" size="md" className="mt-3"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}>
          {upload.isPending ? 'Uploading…' : 'Choose a file'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(e) => {
            send(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="mt-3 text-xs text-muted">PDF or DOCX, up to {MAX_MB} MB.</p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {upload.data?.warning && (
        <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Uploaded, but no text could be read from it: {upload.data.warning} You can still
          apply, though the ranking in phase 5 will have nothing to work from.
        </p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">Versions</h2>

      <div className="mt-3 space-y-3">
        {!isPending && items.length === 0 && (
          <EmptyState title="Nothing uploaded yet">
            You need a résumé on file before you can apply to anything.
          </EmptyState>
        )}

        {items.map((r) => (
          <div key={r._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-card p-4">
            <span className="font-medium">v{r.version}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{r.originalName}</span>

            {String(r._id) === String(currentId) && (
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-success-line">
                In use
              </span>
            )}
            {r.parseStatus === 'failed' && (
              <span
                title={r.parseError ?? ''}
                className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-warning-line"
              >
                No text found
              </span>
            )}

            <span className="text-sm text-muted">{Math.round(r.sizeBytes / 1024)} kB</span>
            <span className="text-sm text-muted">{formatDate(r.createdAt)}</span>
            <ProtectedFileLink path={`/resumes/${r._id}/file`}>View</ProtectedFileLink>
          </div>
        ))}
      </div>
    </>
  );
}
