import { Link } from 'react-router-dom';
import { IronFilings } from '../components/ui/IronFilings.jsx';

/**
 * The signed-out front door.
 *
 * The field is the argument: loose filings with no direction, until something
 * with a pull arranges them. That is what the portal does to a thousand
 * unsorted applications, so the decoration is at least saying something.
 *
 * The wrapper carries text-muted because the canvas reads its own computed
 * colour for the filings; the content sets text-ink back for the copy.
 */
export default function Landing() {
  return (
    <IronFilings
      spacing={16}
      length={10}
      /* Track globally so the magnet keeps following over the buttons, which
         sit above the field and would otherwise swallow the pointer. */
      pointerSource="window"
      className="flex min-h-dvh w-full items-center justify-center bg-surface text-muted"
    >
      <div className="pointer-events-none relative select-none px-6 text-center text-ink">
        <div
          aria-hidden
          className="absolute inset-[-30%] -z-10 bg-[radial-gradient(closest-side,var(--color-surface)_45%,transparent)]"
        />

        <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-muted">
          Nexus · campus placement
        </p>

        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
          The right role
          <br />
          <span className="italic">pulls.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-md text-sm text-muted sm:text-base">
          Upload your résumé once. Every job you see is ranked by how well you actually fit
          it, with the reasoning attached.
        </p>

        <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/login"
            className="rounded-lg bg-accent-solid px-5 py-2.5 text-sm font-medium text-on-solid transition hover:opacity-90"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-lg border border-line bg-card/80 px-5 py-2.5 text-sm font-medium text-ink backdrop-blur transition hover:bg-card"
          >
            Create an account
          </Link>
        </div>

        {/* Pointer-only instruction: there is no cursor to move on a touchscreen. */}
        <p className="mt-6 hidden text-xs text-muted sm:block">
          Move your cursor to carry the magnet. Click to drop one.
        </p>
      </div>
    </IronFilings>
  );
}
