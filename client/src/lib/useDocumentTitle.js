import { useEffect } from 'react';

const SUFFIX = 'Nexus';

/**
 * Every route shared one title, so a browser's history and a row of pinned
 * tabs were twelve identical entries. No cleanup on unmount: the next route
 * sets its own, and resetting in between only flickers.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : `${SUFFIX} — Campus Placement`;
  }, [title]);
}
