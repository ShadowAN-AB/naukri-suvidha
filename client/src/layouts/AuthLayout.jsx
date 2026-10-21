import { IronFilings } from '../components/ui/IronFilings.jsx';

/**
 * The shell behind the signed-out forms.
 *
 * The magnet still follows the cursor - that is the whole appeal - but
 * interactive is off, because that flag also brings cursor-crosshair over the
 * inputs, a tab stop ahead of the first field, a magnet dropped on every click
 * including a click into a text box, and touch-none, which would leave the
 * register form too tall for a phone with no way to scroll it.
 *
 * Tracking is on the window rather than the component's own box: the field is
 * behind the card, so pointer events over the form never reach it.
 *
 * Because the field is fixed behind the page rather than wrapping it, the form
 * scrolls normally however long it gets. The card above it is translucent so
 * the field reads through without the inputs losing contrast.
 */
export default function AuthLayout({ children, maxWidth = 'max-w-md' }) {
  return (
    <>
      <div aria-hidden className="fixed inset-0 -z-10">
        <IronFilings
          interactive={false}
          followPointer
          pointerSource="window"
          spacing={18}
          length={9}
          className="h-full w-full bg-surface text-muted"
        />
      </div>

      <div className="flex min-h-dvh items-center justify-center px-6 py-12 text-ink">
        <div className={`w-full ${maxWidth}`}>
          <div className="rounded-2xl border border-line bg-card/80 p-6 shadow-sm backdrop-blur-md sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
