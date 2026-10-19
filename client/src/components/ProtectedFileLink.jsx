import { useState } from 'react';
import { fetchBlobUrl } from '../lib/api.js';

/**
 * Opens a file that sits behind the API's bearer auth.
 *
 * A normal link cannot send the Authorization header, so this fetches the
 * bytes and opens them as a blob URL instead. The URL is revoked shortly
 * after, which is long enough for the new tab to have loaded it.
 */
export default function ProtectedFileLink({ path, children, className = '' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await fetchBlobUrl(path);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={
          className ||
          'rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50'
        }
      >
        {busy ? 'Opening…' : children}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}
