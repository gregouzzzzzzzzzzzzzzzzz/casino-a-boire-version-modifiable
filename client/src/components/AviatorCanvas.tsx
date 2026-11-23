import React, { useEffect, useRef } from 'react';

interface AviatorCanvasProps {
  multiplier: number;
  crashed: boolean;
  height?: number;
}

/**
 * Courbe de vol (version wireframe neutre) : trace le multiplicateur en temps réel
 * sur fond blanc avec grille grise. Toute la logique d'interpolation 60 fps est intacte.
 */
export const AviatorCanvas: React.FC<AviatorCanvasProps> = ({ multiplier, crashed, height = 360 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(1);
  const smoothRef = useRef(1);
  const historyRef = useRef<number[]>([1]);
  const crashedRef = useRef(false);
  const crashFrameRef = useRef(0);
  const rafRef = useRef(0);

  if (multiplier < targetRef.current - 0.001 && !crashed) {
    historyRef.current = [1];
    smoothRef.current = 1;
    crashedRef.current = false;
    crashFrameRef.current = 0;
  }
  targetRef.current = multiplier;
  crashedRef.current = crashed;

  useEffect(() => {
    historyRef.current.push(multiplier);
    if (historyRef.current.length > 400) historyRef.current.shift();
  }, [multiplier]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      smoothRef.current += (targetRef.current - smoothRef.current) * (reduceMotion ? 1 : 0.18);
      if (crashedRef.current) crashFrameRef.current += 1;

      const pad = { top: 24, right: 56, bottom: 24, left: 14 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const history = historyRef.current;
      const maxMult = Math.max(2, smoothRef.current * 1.15);
      const yFor = (m: number) => pad.top + plotH - ((m - 1) / (maxMult - 1)) * plotH;
      const xFor = (i: number) => pad.left + (i / Math.max(24, history.length - 1)) * plotW;

      // Fond blanc neutre
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Grille verticale neutre
      ctx.strokeStyle = '#ececec';
      ctx.lineWidth = 1;
      for (let v = 0; v <= 6; v++) {
        const vx = pad.left + (v / 6) * plotW;
        ctx.beginPath();
        ctx.moveTo(vx, pad.top);
        ctx.lineTo(vx, h - pad.bottom);
        ctx.stroke();
      }

      // Lignes horizontales + graduations
      ctx.strokeStyle = '#e2e2e2';
      ctx.fillStyle = '#555555';
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.lineWidth = 1;
      const step = maxMult <= 3 ? 0.5 : maxMult <= 8 ? 1 : 2;
      for (let m = 1; m <= maxMult; m += step) {
        const y = yFor(m);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right + 6, y);
        ctx.stroke();
        ctx.fillText(`${m.toFixed(step < 1 ? 1 : 0)}x`, w - pad.right + 12, y + 4);
      }

      // Axes principaux
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top);
      ctx.lineTo(pad.left, h - pad.bottom);
      ctx.lineTo(w - pad.right + 6, h - pad.bottom);
      ctx.stroke();

      // Courbe du multiplicateur
      const pts = history.slice(0, -1).concat(smoothRef.current);
      const lastX = xFor(pts.length - 1);
      const lastY = yFor(pts[pts.length - 1]);

      ctx.beginPath();
      ctx.moveTo(xFor(0), yFor(1));
      pts.forEach((m, i) => ctx.lineTo(xFor(i), yFor(m)));
      ctx.strokeStyle = crashedRef.current ? '#777777' : '#111111';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (crashedRef.current) ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Zone sous la courbe
      ctx.lineTo(lastX, yFor(1));
      ctx.lineTo(xFor(0), yFor(1));
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fill();

      // Marqueur de position (point ou croix si crash)
      ctx.save();
      if (crashedRef.current) {
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(lastX - 8, lastY - 8);
        ctx.lineTo(lastX + 8, lastY + 8);
        ctx.moveTo(lastX + 8, lastY - 8);
        ctx.lineTo(lastX - 8, lastY + 8);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', border: '1px solid var(--border-default)' }}
      aria-label="Courbe de vol du multiplicateur"
    />
  );
};
