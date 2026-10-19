import { useEffect, useRef } from 'react';

/**
 * A field of iron filings that line up along the field of a bar magnet.
 * The cursor carries the magnet; click to drop more and watch the field lines merge.
 *
 * From 21st.dev, converted from TypeScript to plain JSX for this project. It has
 * no dependencies beyond React, and draws to a canvas rather than the DOM.
 *
 * Props:
 *   spacing      gap between filings in CSS pixels; smaller is denser and heavier to draw
 *   length       length of each filing in CSS pixels
 *   strength     field strength multiplier
 *   color        filing colour; defaults to the element's own text colour
 *   interactive  the cursor acts as a magnet and clicks drop extra magnets
 *   maxMagnets   most magnets a click can drop before the oldest is removed
 */
export function IronFilings({
  spacing = 14,
  length = 9,
  strength = 1,
  color,
  interactive = true,
  maxMagnets = 4,
  className = '',
  children,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    // Filing state lives in flat typed arrays so thousands of filings stay cheap.
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let angle = new Float32Array(0);
    let count = 0;

    const cursor = { x: 0, y: 0, angle: 0, strength: 1 };
    const target = { x: 0, y: 0 };
    let hovering = false;
    let lastMove = { x: 0, y: 0 };
    const dropped = [];
    let visible = true;
    let raf = 0;
    let t = 0;

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      count = cols * rows;
      px = new Float32Array(count);
      py = new Float32Array(count);
      angle = new Float32Array(count);
      let i = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // A little jitter keeps the grid from reading as a grid.
          px[i] = c * spacing + (Math.random() - 0.5) * spacing * 0.6;
          py[i] = r * spacing + (Math.random() - 0.5) * spacing * 0.6;
          angle[i] = Math.random() * Math.PI;
          i++;
        }
      }
      if (!hovering) {
        cursor.x = target.x = width * 0.5;
        cursor.y = target.y = height * 0.5;
      }
    };

    // Field of a 2D dipole: B = (3(m.r)r - m) / r^3, softened near the core.
    const field = (x, y, out) => {
      let bx = 0;
      let by = 0;
      const add = (m) => {
        const dx = x - m.x;
        const dy = y - m.y;
        const soft = spacing * 2.2;
        const r2 = dx * dx + dy * dy + soft * soft;
        const r = Math.sqrt(r2);
        const ux = dx / r;
        const uy = dy / r;
        const mx = Math.cos(m.angle) * m.strength;
        const my = Math.sin(m.angle) * m.strength;
        const dot = mx * ux + my * uy;
        const k = 1 / (r2 * r);
        bx += (3 * dot * ux - mx) * k;
        by += (3 * dot * uy - my) * k;
      };
      add(cursor);
      for (const m of dropped) add(m);
      out.bx = bx;
      out.by = by;
    };

    const out = { bx: 0, by: 0 };
    const draw = () => {
      t += 1;
      if (!hovering) {
        // Idle: the magnet drifts on a slow figure-eight so the field never sits still.
        target.x = width * (0.5 + 0.28 * Math.sin(t * 0.004));
        target.y = height * (0.5 + 0.18 * Math.sin(t * 0.008));
      }
      const follow = reduceMotion ? 1 : 0.18;
      const vx = target.x - cursor.x;
      const vy = target.y - cursor.y;
      cursor.x += vx * follow;
      cursor.y += vy * follow;
      // The magnet turns to face where it is heading, like a compass dragged across a table.
      if (Math.abs(vx) + Math.abs(vy) > 0.6) {
        const heading = Math.atan2(vy, vx);
        let d = heading - cursor.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        cursor.angle += d * (reduceMotion ? 1 : 0.08);
      }

      const ink = color || getComputedStyle(canvas).color || '#888';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = ink;
      ctx.lineCap = 'round';

      // Bucket by brightness so we only change globalAlpha a handful of times per frame.
      const buckets = 6;
      const paths = Array.from({ length: buckets }, () => new Path2D());
      // Field strength falls off as 1/r^3, so read it on a log scale relative to the canvas size.
      const r0 = Math.max(120, Math.min(width, height) * 0.35);
      const scale = strength * r0 * r0 * r0;
      for (let i = 0; i < count; i++) {
        field(px[i], py[i], out);
        const mag = Math.hypot(out.bx, out.by) * scale;
        const level = Math.max(0, Math.min(1, 0.4 + 0.2 * Math.log10(mag + 1e-6)));
        const want = Math.atan2(out.by, out.bx);
        // Filings have no head or tail, so turn the short way round modulo pi.
        let d = want - angle[i];
        d = d - Math.PI * Math.round(d / Math.PI);
        const stiffness = reduceMotion ? 1 : 0.03 + level * level * 0.35;
        angle[i] += d * stiffness;

        const len = length * (0.55 + 0.6 * level);
        const cx = Math.cos(angle[i]) * len * 0.5;
        const cy = Math.sin(angle[i]) * len * 0.5;
        const b = Math.min(buckets - 1, Math.floor(level * buckets));
        paths[b].moveTo(px[i] - cx, py[i] - cy);
        paths[b].lineTo(px[i] + cx, py[i] + cy);
      }
      for (let b = 0; b < buckets; b++) {
        ctx.globalAlpha = 0.12 + Math.pow(b / (buckets - 1), 1.6) * 0.88;
        ctx.lineWidth = 1.1 + b * 0.16;
        ctx.stroke(paths[b]);
      }
      ctx.globalAlpha = 1;

      if (visible && !document.hidden) raf = requestAnimationFrame(draw);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (visible && !document.hidden) raf = requestAnimationFrame(draw);
    };

    const local = (e) => {
      const rect = wrap.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e) => {
      const p = local(e);
      if (!hovering) {
        hovering = true;
        cursor.x = p.x;
        cursor.y = p.y;
      }
      target.x = p.x;
      target.y = p.y;
      lastMove = p;
    };
    const onLeave = () => {
      hovering = false;
    };
    const onDown = (e) => {
      const p = local(e);
      dropped.push({ x: p.x, y: p.y, angle: cursor.angle, strength: 0.9 });
      if (dropped.length > maxMagnets) dropped.shift();
      lastMove = p;
    };
    const onKey = (e) => {
      if (e.key === 'Escape') dropped.length = 0;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dropped.push({
          x: lastMove.x || width / 2,
          y: lastMove.y || height / 2,
          angle: cursor.angle,
          strength: 0.9,
        });
        if (dropped.length > maxMagnets) dropped.shift();
      }
    };

    layout();
    const ro = new ResizeObserver(() => layout());
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    io.observe(wrap);
    const onVisibility = () => start();
    document.addEventListener('visibilitychange', onVisibility);
    if (interactive) {
      wrap.addEventListener('pointermove', onMove);
      wrap.addEventListener('pointerleave', onLeave);
      wrap.addEventListener('pointerdown', onDown);
      wrap.addEventListener('keydown', onKey);
    }
    start();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerleave', onLeave);
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('keydown', onKey);
    };
  }, [spacing, length, strength, color, interactive, maxMagnets]);

  return (
    <div
      ref={wrapRef}
      className={`relative isolate overflow-hidden ${interactive ? 'cursor-crosshair touch-none' : ''} ${className}`}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        interactive
          ? 'Magnetic field. Move to steer the magnet, click or press Enter to drop one, Escape to clear.'
          : undefined
      }
    >
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 -z-10" />
      {children}
    </div>
  );
}

export default IronFilings;
