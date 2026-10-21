import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

/**
 * One button rather than a light/dark/system menu: the default already follows
 * the system, so the only thing left to offer is disagreeing with it.
 */
export default function ThemeToggle({ className = '' }) {
  const { resolved, toggle } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className={`inline-grid size-9 place-items-center rounded-lg border border-line text-muted transition-colors duration-150 hover:bg-subtle hover:text-ink ${className}`}
    >
      <Icon size={16} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
