/** The raised surface. `as` so a list of them can still be <article>s. */
export default function Card({ as: As = 'div', padding = 'p-5', className = '', children, ...props }) {
  return (
    <As className={`rounded-xl border border-line bg-card ${padding} ${className}`} {...props}>
      {children}
    </As>
  );
}
