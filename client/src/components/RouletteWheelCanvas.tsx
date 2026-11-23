import React, { useEffect, useRef, useState } from 'react';

export const ROULETTE_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export function getNumberColor(num: number): 'green' | 'red' | 'black' {
  if (num === 0) return 'green';
  return RED_NUMBERS.includes(num) ? 'red' : 'black';
}

// Version wireframe neutre : nuances de gris distinctes pour zéro, rouge et noir
export function getNumberColorHex(num: number): string {
  const c = getNumberColor(num);
  if (c === 'green') return '#e5e5e5';
  if (c === 'red') return '#777777';
  return '#222222';
}

// ── Web Audio Synthesizer (optionnel, bruits de bille) ────────
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playBallClickSound(volume = 0.2) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const pitch = 900 + Math.random() * 300;
    osc.frequency.setValueAtTime(pitch, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.025);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch {
    // ignore
  }
}

function playWinChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + i * 0.09 + 0.35);
    });
  } catch {
    // ignore
  }
}

interface RouletteWheelCanvasProps {
  isSpinning: boolean;
  targetNumber?: number | null;
  size?: number;
  durationMs?: number;
  onSpinEnd?: (winningNumber: number) => void;
}

export const RouletteWheelCanvas: React.FC<RouletteWheelCanvasProps> = ({
  isSpinning,
  targetNumber = null,
  size = 460,
  durationMs = 6800,
  onSpinEnd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const wheelAngleRef = useRef<number>(0);
  const ballAngleRef = useRef<number>(0);
  const ballRadiusRef = useRef<number>(0.83);
  const spinStartTimeRef = useRef<number | null>(null);
  const lastClickAngleRef = useRef<number>(0);
  const hasTriggeredEndRef = useRef<boolean>(false);

  const spinParamsRef = useRef<{
    startWheelAngle: number;
    totalWheelRotations: number;
    startBallAngle: number;
    totalBallRotations: number;
    targetPocketAngle: number;
  } | null>(null);

  const [displayResult, setDisplayResult] = useState<number | null>(null);

  useEffect(() => {
    if (isSpinning) {
      hasTriggeredEndRef.current = false;
      setDisplayResult(null);
      const chosenTarget = targetNumber ?? 0;
      const targetIndex = ROULETTE_NUMBERS.indexOf(chosenTarget);
      const stepAngle = (2 * Math.PI) / 37;
      const pocketCenterAngle = targetIndex * stepAngle + stepAngle / 2;

      const startWheel = wheelAngleRef.current;
      const wheelTurns = 3 + Math.random() * 1.5;
      const endWheelAngle = startWheel + wheelTurns * 2 * Math.PI;
      const desiredEndBallAngle = endWheelAngle + pocketCenterAngle;

      const startBall = ballAngleRef.current;
      const ballTurns = 12 + Math.random() * 2;
      const totalBallRotations = -(ballTurns * 2 * Math.PI + ((startBall - desiredEndBallAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));

      spinParamsRef.current = {
        startWheelAngle: startWheel,
        totalWheelRotations: wheelTurns * 2 * Math.PI,
        startBallAngle: startBall,
        totalBallRotations,
        targetPocketAngle: pocketCenterAngle,
      };

      spinStartTimeRef.current = performance.now();
    } else {
      spinParamsRef.current = null;
      spinStartTimeRef.current = null;
    }
  }, [isSpinning, targetNumber]);

  useEffect(() => {
    let animationFrameId: number;

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = size;
      const height = size;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const R = (Math.min(width, height) / 2) - 8;

      if (isSpinning && spinStartTimeRef.current && spinParamsRef.current) {
        const elapsed = time - spinStartTimeRef.current;
        const progress = Math.min(1, Math.max(0, elapsed / durationMs));

        const wheelEase = 1 - Math.pow(1 - progress, 2.5);
        wheelAngleRef.current = spinParamsRef.current.startWheelAngle + spinParamsRef.current.totalWheelRotations * wheelEase;

        const ballEase = 1 - Math.pow(1 - progress, 3.2);
        ballAngleRef.current = spinParamsRef.current.startBallAngle + spinParamsRef.current.totalBallRotations * ballEase;

        if (progress < 0.50) {
          ballRadiusRef.current = 0.83;
        } else if (progress < 0.78) {
          const dropP = (progress - 0.50) / 0.28;
          ballRadiusRef.current = 0.83 - (0.83 - 0.63) * (dropP * dropP);
        } else {
          const bounceP = (progress - 0.78) / 0.22;
          const bounceDamp = Math.cos(bounceP * Math.PI * 5) * (1 - bounceP) * 0.035;
          ballRadiusRef.current = 0.63 + bounceDamp;
        }

        const currentAngleDiff = Math.abs(ballAngleRef.current - lastClickAngleRef.current);
        const threshold = progress > 0.65 ? 0.25 : 0.45;
        if (currentAngleDiff > threshold) {
          lastClickAngleRef.current = ballAngleRef.current;
          const vol = Math.max(0.04, 0.25 * (1 - progress));
          playBallClickSound(vol);
        }

        if (progress >= 1 && !hasTriggeredEndRef.current) {
          hasTriggeredEndRef.current = true;
          const finalNum = targetNumber ?? 0;
          setDisplayResult(finalNum);
          playWinChime();
          if (onSpinEnd) onSpinEnd(finalNum);
        }
      } else {
        wheelAngleRef.current += 0.003;
        const stepAngle = (2 * Math.PI) / 37;
        if (targetNumber !== null && targetNumber !== undefined) {
          const targetIndex = ROULETTE_NUMBERS.indexOf(targetNumber);
          ballAngleRef.current = wheelAngleRef.current + targetIndex * stepAngle + stepAngle / 2;
        } else {
          ballAngleRef.current = wheelAngleRef.current + stepAngle / 2;
        }
        ballRadiusRef.current = 0.63;
      }

      // ── DESSIN WIREFRAME NEUTRE DE LA ROUE ──
      // Contour extérieur
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = '#f5f5f5';
      ctx.fill();
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Piste de la bille
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.90, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Cases numérotées
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(wheelAngleRef.current);

      const pocketInnerR = R * 0.50;
      const pocketOuterR = R * 0.76;
      const stepAngle = (2 * Math.PI) / 37;

      for (let i = 0; i < 37; i++) {
        const num = ROULETTE_NUMBERS[i];
        const startA = i * stepAngle;
        const endA = (i + 1) * stepAngle;
        const color = getNumberColor(num);

        ctx.beginPath();
        ctx.arc(0, 0, pocketOuterR, startA, endA);
        ctx.arc(0, 0, pocketInnerR, endA, startA, true);
        ctx.closePath();

        if (color === 'green') {
          ctx.fillStyle = '#e5e5e5';
        } else if (color === 'red') {
          ctx.fillStyle = '#888888';
        } else {
          ctx.fillStyle = '#222222';
        }
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(Math.cos(startA) * pocketInnerR, Math.sin(startA) * pocketInnerR);
        ctx.lineTo(Math.cos(startA) * pocketOuterR, Math.sin(startA) * pocketOuterR);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        const midA = startA + stepAngle / 2;
        const textR = (pocketInnerR + pocketOuterR) / 2;
        const tx = Math.cos(midA) * textR;
        const ty = Math.sin(midA) * textR;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(midA + Math.PI / 2);
        ctx.fillStyle = color === 'green' ? '#111111' : '#ffffff';
        ctx.font = `700 ${Math.round(R * 0.052)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(num.toString(), 0, 0);
        ctx.restore();

        if (displayResult === num) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, pocketOuterR + 1, startA, endA);
          ctx.arc(0, 0, pocketInnerR - 1, endA, startA, true);
          ctx.closePath();
          ctx.strokeStyle = '#111111';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Centre neutre
      ctx.beginPath();
      ctx.arc(0, 0, pocketInnerR, 0, Math.PI * 2);
      ctx.fillStyle = '#f9f9f9';
      ctx.fill();
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 4 rayons géométriques
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * pocketInnerR * 0.7, Math.sin(a) * pocketInnerR * 0.7);
        ctx.strokeStyle = '#bbbbbb';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(0, 0, pocketInnerR * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = '#333333';
      ctx.fill();

      ctx.restore();

      // La bille
      const bx = cx + Math.cos(ballAngleRef.current) * (R * ballRadiusRef.current);
      const by = cy + Math.sin(ballAngleRef.current) * (R * ballRadiusRef.current);
      const ballSize = Math.max(6, Math.round(R * 0.038));

      ctx.beginPath();
      ctx.arc(bx, by, ballSize, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSpinning, targetNumber, size, durationMs, onSpinEnd, displayResult]);

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          display: 'block',
          borderRadius: '50%',
        }}
      />
      {displayResult !== null && (
        <div
          className="badge"
          style={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111111',
            color: '#ffffff',
            border: '1px solid #111111',
            padding: '6px 14px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 15,
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
        >
          {displayResult === 0
            ? '0 VERT'
            : `${displayResult} ${getNumberColor(displayResult) === 'red' ? 'ROUGE' : 'NOIR'}`}
        </div>
      )}
    </div>
  );
};
