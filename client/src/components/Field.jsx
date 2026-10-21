import { inputClasses } from './ui/field.js';

/** One labelled input with its error message, used by both auth forms. */
export default function Field({ label, name, error, hint, as = 'input', children, ...props }) {
  const id = `field-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const className = `mt-1 ${inputClasses(Boolean(error))}`;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>

      {as === 'select' ? (
        <select id={id} name={name} aria-invalid={!!error} aria-describedby={describedBy} className={className} {...props}>
          {children}
        </select>
      ) : (
        <input id={id} name={name} aria-invalid={!!error} aria-describedby={describedBy} className={className} {...props} />
      )}

      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
