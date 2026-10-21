import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'nexus-theme';

const ThemeContext = createContext(null);

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Puts the class on <html> and reports back which theme that resolved to. */
function applyPreference(preference) {
  const dark = preference === 'dark' || (preference === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
  return dark ? 'dark' : 'light';
}

/**
 * Three states, not two: 'system' is the default and keeps following the OS,
 * and picking light or dark pins it. A pinned choice is the only thing worth
 * storing, so 'system' clears the key rather than writing itself down.
 *
 * Reads and writes are wrapped because Safari's private mode throws on
 * localStorage, and a theme toggle is not worth a white screen.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  });

  // index.html has already set the class, so start from what it decided
  // rather than guessing and repainting.
  const [resolved, setResolved] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  useEffect(() => {
    setResolved(applyPreference(preference));
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* Private mode. The theme still applies for this session. */
    }
  }, [preference]);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyPreference('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved]);

  const value = useMemo(
    () => ({ preference, resolved, setTheme: setPreference, toggle }),
    [preference, resolved, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
