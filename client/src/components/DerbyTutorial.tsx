import React, { useEffect, useState } from 'react';

interface DerbyTutorialProps {
  roomId: string;
  onEndTutorial: () => void;
}

interface DemoHorse {
  id: number;
  name: string;
  lane: number;
  progress: number;
  speed: number;
  momentum: 'normal' | 'boosted' | 'fatigued';
}

function getTutorialLanePath(idx: number): string {
  const radii = [95, 120, 145, 170];
  const R = radii[idx] ?? (95 + idx * 25);
  const cx1 = 230;
  const cx2 = 550;
  const cy = 215;
  const startX = 390;
  const startY = cy + R;
  return `M ${startX} ${startY} L ${cx2} ${startY} A ${R} ${R} 0 0 0 ${cx2} ${cy - R} L ${cx1} ${cy - R} A ${R} ${R} 0 0 0 ${cx1} ${startY} Z`;
}

export const DerbyTutorial: React.FC<DerbyTutorialProps> = ({ onEndTutorial }) => {
  const TOTAL_DURATION_SECONDS = 12;
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_DURATION_SECONDS);
  const [progressPercent, setProgressPercent] = useState(0);

  const [horses, setHorses] = useState<DemoHorse[]>([
    { id: 1, name: 'Cheval 1', lane: 0, progress: 20, speed: 0.9, momentum: 'normal' },
    { id: 2, name: 'Cheval 2', lane: 1, progress: 105, speed: 1.15, momentum: 'boosted' },
    { id: 3, name: 'Cheval 3', lane: 2, progress: 190, speed: 0.85, momentum: 'normal' },
    { id: 4, name: 'Cheval 4', lane: 3, progress: 280, speed: 0.75, momentum: 'fatigued' },
  ]);

  useEffect(() => {
    const startTime = Date.now();
    const durationMs = TOTAL_DURATION_SECONDS * 1000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      const pct = Math.min(100, (elapsed / durationMs) * 100);

      setSecondsLeft(remaining);
      setProgressPercent(pct);

      if (elapsed >= durationMs) {
        clearInterval(timer);
        onEndTutorial();
      }
    }, 100);

    return () => clearInterval(timer);
  }, [onEndTutorial]);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let momentumSwitchCounter = 0;

    const animate = (currentTime: number) => {
      const dt = Math.min(100, currentTime - lastTime);
      lastTime = currentTime;

      momentumSwitchCounter += dt;
      let shouldSwitchMomentum = false;
      if (momentumSwitchCounter > 2400) {
        momentumSwitchCounter = 0;
        shouldSwitchMomentum = true;
      }

      setHorses(prev =>
        prev.map(h => {
          let currentMomentum = h.momentum;
          let currentSpeed = h.speed;

          if (shouldSwitchMomentum && Math.random() < 0.4) {
            const roll = Math.random();
            if (roll < 0.35) {
              currentMomentum = 'boosted';
              currentSpeed = 1.25;
            } else if (roll < 0.65) {
              currentMomentum = 'fatigued';
              currentSpeed = 0.65;
            } else {
              currentMomentum = 'normal';
              currentSpeed = 0.95;
            }
          }

          const newProgress = (h.progress + currentSpeed * (dt / 32)) % 360;
          return { ...h, progress: newProgress, speed: currentSpeed, momentum: currentMomentum };
        })
      );

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const sortedHorses = [...horses].sort((a, b) => b.progress - a.progress);

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: 24,
        maxWidth: 1100,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="badge">DIDACTICIEL</span>
          <div>
            <h2 style={{ fontSize: 22, margin: 0 }}>Le Derby Hippique</h2>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              Course de chevaux · Piste ovale & Momentum live
            </div>
          </div>
        </div>

        <button onClick={onEndTutorial} className="btn btn-primary">
          Passer / Lancer la course →
        </button>
      </div>

      {/* Piste ovale neutre */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 780,
          height: 300,
          overflow: 'hidden',
          background: '#fafafa',
          border: '1px solid var(--border-default)',
        }}
      >
        <svg viewBox="0 0 780 430" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
          <defs>
            <pattern id="tutCheckered" width="10" height="10" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="#ffffff" />
              <rect x="5" width="5" height="5" fill="#222222" />
              <rect y="5" width="5" height="5" fill="#222222" />
              <rect x="5" y="5" width="5" height="5" fill="#ffffff" />
            </pattern>
          </defs>

          <path
            d="M 390 400 L 550 400 A 185 185 0 0 0 550 30 L 230 30 A 185 185 0 0 0 230 400 Z"
            fill="#f0f0f0"
            stroke="#999999"
            strokeWidth="2"
          />

          <path
            d="M 390 295 L 550 295 A 80 80 0 0 0 550 135 L 230 135 A 80 80 0 0 0 230 295 Z"
            fill="#ffffff"
            stroke="#999999"
            strokeWidth="2"
          />

          <path
            d="M 390 322.5 L 550 322.5 A 107.5 107.5 0 0 0 550 107.5 L 230 107.5 A 107.5 107.5 0 0 0 230 322.5 Z"
            fill="none"
            stroke="#cccccc"
            strokeWidth="1"
            strokeDasharray="6 6"
          />
          <path
            d="M 390 347.5 L 550 347.5 A 132.5 132.5 0 0 0 550 82.5 L 230 82.5 A 132.5 132.5 0 0 0 230 347.5 Z"
            fill="none"
            stroke="#cccccc"
            strokeWidth="1"
            strokeDasharray="6 6"
          />
          <path
            d="M 390 372.5 L 550 372.5 A 157.5 157.5 0 0 0 550 57.5 L 230 57.5 A 157.5 157.5 0 0 0 230 372.5 Z"
            fill="none"
            stroke="#cccccc"
            strokeWidth="1"
            strokeDasharray="6 6"
          />

          <rect x="386" y="295" width="8" height="105" fill="url(#tutCheckered)" stroke="#111111" strokeWidth="1" />
        </svg>

        {/* HUD Central */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 240,
            background: '#ffffff',
            border: '1px solid var(--border-strong)',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>SIMULATION DU DERBY</span>
            <span className="badge" style={{ fontSize: 9, padding: '1px 5px' }}>DIRECT</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sortedHorses.map((h, i) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ fontWeight: 600 }}>#{i + 1} {h.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {h.momentum === 'boosted' ? 'BOOST' : h.momentum === 'fatigued' ? 'FATIGUE' : 'GALOP'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 4 Chevaux animés */}
        {horses.map((horse) => {
          const lanePath = getTutorialLanePath(horse.lane);
          const percentDistance = (horse.progress / 360) * 100;
          const isBoosted = horse.momentum === 'boosted';
          const isFatigued = horse.momentum === 'fatigued';

          return (
            <div
              key={horse.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                offsetPath: `path('${lanePath}')`,
                WebkitOffsetPath: `path('${lanePath}')`,
                offsetDistance: `${percentDistance}%`,
                WebkitOffsetDistance: `${percentDistance}%`,
                offsetRotate: '0deg',
                WebkitOffsetRotate: '0deg',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 20 + horse.lane,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              } as React.CSSProperties}
            >
              {(isBoosted || isFatigued) && (
                <span
                  style={{
                    background: isBoosted ? '#111111' : '#e5e5e5',
                    color: isBoosted ? '#ffffff' : '#111111',
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '1px 4px',
                    marginBottom: 2,
                  }}
                >
                  {isBoosted ? 'BOOST' : 'FATIGUE'}
                </span>
              )}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#111111',
                  color: '#ffffff',
                  border: '2px solid #ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {horse.id}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3 Règles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%' }}>
        <div className="card-surface" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 13 }}>1. Misez sur mobile</strong>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Choisissez l'un des <strong>4 chevaux</strong> sur votre téléphone et placez votre mise avant le départ.
          </p>
        </div>
        <div className="card-surface" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 13 }}>2. Le Momentum</strong>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Les chevaux alternent entre accélérations (Boost) et coups de fatigue jusqu'à la ligne d'arrivée.
          </p>
        </div>
        <div className="card-surface" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong style={{ fontSize: 13 }}>3. Victoire ou gorgées</strong>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Le cheval gagnant fait <strong>tripler la mise (×3.00)</strong>. Les perdants boivent leur mise en gorgées.
          </p>
        </div>
      </div>

      {/* Barre de compte à rebours */}
      <div className="card-surface" style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
            <span className="spinner" />
            <span>Préparez-vous à placer vos paris sur vos smartphones...</span>
          </div>
          <strong>Lancement automatique dans {secondsLeft}s</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progressPercent}%`, transition: 'width 0.1s linear' }} />
        </div>
      </div>
    </div>
  );
};
