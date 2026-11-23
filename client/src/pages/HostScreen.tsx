import React, { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import {
  Room,
  Player,
  PlayerRoundResult,
  Card,
} from '../types';
import {
  Users,
  Copy,
  Check,
  ChevronRight,
  Crown,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Hourglass,
  Flame,
  Sparkles,
} from 'lucide-react';
import { AviatorCanvas } from '../components/AviatorCanvas';
import { RouletteWheelCanvas } from '../components/RouletteWheelCanvas';
import { DerbyTutorial } from '../components/DerbyTutorial';

// ── Helpers ──────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#e5e5e5', '#dcdcdc', '#d4d4d4', '#ececec',
  '#e0e0e0', '#d8d8d8', '#e8e8e8', '#cfcfcf',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.charAt(0).toUpperCase();
}

function calculateHandScore(hand?: Card[]): number {
  if (!hand || hand.length === 0) return 0;
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.value === 'A') {
      aces += 1;
      total += 11;
    } else if (['K', 'Q', 'J', '10'].includes(card.value)) {
      total += 10;
    } else {
      total += parseInt(card.value, 10) || 0;
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

// ── Sub-components ───────────────────────────────────────────

interface AvatarProps { name: string; size?: number }
const Avatar: React.FC<AvatarProps> = ({ name, size = 32 }) => (
  <div
    className="avatar"
    style={{
      width: size, height: size, fontSize: size * 0.44,
      background: avatarColor(name), borderRadius: 'var(--r-sm)',
    }}
  >
    {initials(name)}
  </div>
);

interface ProgressBarProps { value: number; max: number; color?: 'green' | 'gold' }
const ProgressBar: React.FC<ProgressBarProps> = ({ value, max, color = 'green' }) => (
  <div className="progress-track">
    <div
      className={`progress-fill${color === 'gold' ? ' progress-fill-gold' : ''}`}
      style={{ width: max > 0 ? `${(value / max) * 100}%` : '0%' }}
    />
  </div>
);

// Hippodrome Ovale : trajectoire SVG fermée pour les 4 couloirs
function getDerbyLanePath(idx: number): string {
  const radii = [95, 120, 145, 170];
  const R = radii[idx] ?? (95 + idx * 25);
  const cx1 = 230;
  const cx2 = 550;
  const cy = 215;
  const startX = 390;
  const startY = cy + R;
  return `M ${startX} ${startY} L ${cx2} ${startY} A ${R} ${R} 0 0 0 ${cx2} ${cy - R} L ${cx1} ${cy - R} A ${R} ${R} 0 0 0 ${cx1} ${startY} Z`;
}

interface PlayingCardProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  hidden?: boolean;
}

const PlayingCard: React.FC<PlayingCardProps> = ({ card, size = 'md', hidden = false }) => {
  if (hidden) {
    return (
      <div className={`playing-card card-back ${size === 'lg' ? 'playing-card-lg' : size === 'sm' ? 'playing-card-sm' : ''}`} />
    );
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  const colorClass = isRed ? 'playing-card-red' : 'playing-card-black';
  const sizeClass = size === 'lg' ? 'playing-card-lg' : size === 'sm' ? 'playing-card-sm' : '';

  return (
    <div className={`playing-card ${colorClass} ${sizeClass}`}>
      <div style={{ fontSize: size === 'lg' ? 24 : size === 'sm' ? 14 : 18, lineHeight: 1, fontWeight: 900 }}>{card.value}</div>
      <div style={{ fontSize: size === 'lg' ? 44 : size === 'sm' ? 22 : 32, textAlign: 'center', lineHeight: 1 }}>{card.suit}</div>
      <div style={{ fontSize: size === 'lg' ? 24 : size === 'sm' ? 14 : 18, textAlign: 'right', lineHeight: 1, fontWeight: 900 }}>{card.value}</div>
    </div>
  );
};


// ── Main Component ───────────────────────────────────────────
export const HostScreen: React.FC = () => {
  const [room, setRoom] = useState<Room | null>(null);
  const [copied, setCopied] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const prevStateRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [phaseSeconds, setPhaseSeconds] = useState(0);

  // Live fluctuating Crash multiplier
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.00);
  const [, setTrend] = useState<'up' | 'down' | 'same'>('same');

  // Phase timer
  useEffect(() => {
    const id = setInterval(() => setPhaseSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setPhaseSeconds(0);
    if (room?.state === 'playing_crash' || room?.state === 'crash_flying') {
      setCurrentMultiplier(1.00);
      setTrend('same');
    }
  }, [room?.state, room?.crashRound]);

  // Règles d'explication du didacticiel pour chaque mini-jeu
  const GAME_TUTORIAL_INFO: Record<string, { title: string; subtitle: string; summary: string }> = {
    roulette: {
      title: 'La Roulette Royale',
      subtitle: 'Rouge (x2) · Noir (x2) · Zéro (x14)',
      summary: 'Misez sur votre couleur favorite. La bille tourne : ceux qui ont bon doublent leurs jetons, les perdants boivent leur mise en gorgées !',
    },
    crash: {
      title: "L'Avion (Crash)",
      subtitle: "Le multiplicateur monte... Jusqu'au crash fatal !",
      summary: "Embarquez dans le vol et regardez la cote grimper en temps réel. Sautez en parachute pour sécuriser vos gains avant l'explosion !",
    },
    blackjack: {
      title: 'Le Blackjack 21',
      subtitle: 'Tirez ou restez · Battez la banque sans dépasser 21',
      summary: 'Rapprochez-vous de 21 le plus possible. Si vous battez le croupier sans dépasser, vous remportez le double de votre mise !',
    },
    mines: {
      title: 'Les Mines',
      subtitle: 'Déterrez des gemmes · Évitez les 7 bombes',
      summary: "Grille commune de 36 cases. Chaque diamant trouvé augmente le multiplicateur. Encaissez à tout moment ou risquez l'explosion !",
    },
    derby: {
      title: 'Le Derby Hippique',
      subtitle: "4 chevaux sur l'hippodrome",
      summary: 'Choisissez votre cheval champion. Suivez la course sur le grand écran : le premier à franchir la ligne fait gagner ses parieurs !',
    },
  };

  const createdRef = useRef(false);
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    // The shared socket often connects before this component mounts.
    setIsConnected(socket.connected);

    const requestRoom = () => {
      if (roomIdRef.current) {
        socket.emit('watch_room', { roomId: roomIdRef.current });
      } else {
        socket.emit('create_room');
      }
    };

    socket.on('connect', () => {
      setIsConnected(true);
      requestRoom();
    });
    socket.on('disconnect', () => setIsConnected(false));

    // The room no longer exists on the server (grace expired or restart):
    // start over with a fresh room instead of showing a dead code.
    socket.on('room_not_found', () => {
      roomIdRef.current = null;
      socket.emit('create_room');
    });

    // Request room on mount if socket is already connected
    if (!createdRef.current) {
      createdRef.current = true;
      if (socket.connected) {
        requestRoom();
      }
    }

    socket.on('room_created', ({ room }: { room: Room }) => {
      roomIdRef.current = room.id;
      prevStateRef.current = 'lobby';
      setRoom(room);
    });

    const handleCrashUpdate = (data: {
      multiplier: number;
      prevMultiplier?: number;
      trend?: 'up' | 'down' | 'same';
    }) => {
      setCurrentMultiplier(data.multiplier);
      if (data.trend) setTrend(data.trend);
    };

    socket.on('crash_update', handleCrashUpdate);

    socket.on('room_updated', ({ room: updatedRoom }: { room: Room }) => {
      if (updatedRoom?.id) {
        roomIdRef.current = updatedRoom.id;
      }

      prevStateRef.current = updatedRoom.state;
      setRoom(updatedRoom);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_not_found');
      socket.off('room_created');
      socket.off('crash_update', handleCrashUpdate);
      socket.off('room_updated');
    };
  }, []);

  const handleCopy = () => {
    if (room?.id) {
      navigator.clipboard.writeText(room.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = () => {
    // Ferme la table courante immédiatement et en ouvre une neuve,
    // sans que watch_room ne ré-adopte l'ancienne.
    if (roomIdRef.current) {
      socket.emit('close_room', { roomId: roomIdRef.current });
    }
    roomIdRef.current = null;
    socket.disconnect();
    setRoom(null);
    socket.connect();
    socket.emit('create_room');
  };

  const totalPlayers = room?.players.length ?? 0;
  const votedCount = room?.votes ? Object.keys(room.votes).length : 0;
  const betCount = room?.bets ? Object.keys(room.bets).length : 0;
  const crashBetCount = room?.crashBets ? Object.keys(room.crashBets).length : 0;
  const blackjackBetCount = room?.blackjackBets ? Object.keys(room.blackjackBets).length : 0;
  const minesBetCount = room?.minesBets ? Object.keys(room.minesBets).length : 0;
  const derbyBetCount = room?.derbyBets ? Object.keys(room.derbyBets).length : 0;
  const activeBettors = room?.players.filter(p => p.balance > 0).length ?? 0;
  const leaderPlayer = room?.players.find(p => p.id === room.leaderId);

  const winners = room?.currentResult?.results.filter(r => r.won) ?? [];
  const losers = room?.currentResult?.results.filter(r => !r.won && r.betAmount > 0) ?? [];

  const dealerScore = calculateHandScore(room?.dealerHand);

  // Mines Turn
  const currentTurnPlayer = room?.players.find(p => p.id === room.currentTurnPlayerId);

  // Final Distribution stats
  const finalSubmittedCount = room?.players.filter(p => p.hasSubmittedFinalDistribution).length ?? 0;

  // Drinking phase stats
  const totalSipsToDrink = room?.players.reduce((acc, p) => acc + (p.sipsToDrink || 0), 0) ?? 0;
  const drankPlayersCount = room?.players.filter(p => p.hasDrank).length ?? 0;
  const allPlayersDrank = totalPlayers > 0 && drankPlayersCount === totalPlayers;

  const stateLabel: Record<string, string> = {
    lobby: 'SALON D\'ATTENTE',
    voting: `VOTE MANCHE ${room?.currentRound || 1}`,
    showing_tutorial: 'DIDACTICIEL DU JEU 🎬',
    playing_roulette: 'PRISE DES MISES',
    roulette_spinning: 'TIRAGE ROULETTE',
    roulette_result: 'RÉSULTATS ROULETTE',
    playing_crash: `L'AVION ✈️ · EMBARQUEMENT (${room?.crashRound || 1}/3)`,
    crash_flying: `L'AVION DÉCOLLE ✈️ (${room?.crashRound || 1}/3)`,
    crash_result: `CRASH 💥 (${room?.crashRound || 1}/3)`,
    playing_blackjack: 'BLACKJACK (MISES)',
    blackjack_playing: 'BLACKJACK EN COURS ♠',
    blackjack_dealer_turn: 'TOUR DU CROUPIER 🎩',
    blackjack_result: 'RÉSULTATS BLACKJACK',
    playing_mines: 'LES MINES (MISES)',
    mines_playing: 'LES MINES 💣 (EN JEU)',
    mines_result: 'RÉSULTATS DES MINES',
    playing_derby: 'LE DERBY 🐎 (PARIS)',
    derby_racing: 'LA COURSE EST LANCÉE ! 🏇',
    derby_result: 'ARRIVÉE DU DERBY 🏆',
    distribution: 'DISTRIBUTION',
    drinking_phase: 'L\'ADDITION ! 🍻',
    final_tax: '💸 LA TAXE FINALE !',
    final_distribution: 'DISTRIBUTION FINALE 🍻',
    final_drinking: '🏆 LE GRAND BILAN',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent' }}>

      {/* ── TOP HEADER ── */}
      <header style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        
        padding: '0 28px',
        height: 68,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexShrink: 0,
        position: 'relative',
        zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="deco-logo" aria-hidden="true">
            <span style={{ fontSize: 17 }}>♠</span>
          </div>
          <span style={{  fontWeight: 900, fontSize: 21, color: 'var(--text-primary)',  letterSpacing: '0.08em' }}>
            CASINO À BOIRE
          </span>
          {room?.state && (
            <>
              <ChevronRight size={16} color="currentColor" />
              <span className="badge badge-surface" style={{ fontSize: 12, padding: '4px 10px', fontWeight: 800 }}>
                {stateLabel[room.state] ?? room.state.toUpperCase()}
              </span>
            </>
          )}
        </div>

        {room && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label-xs" style={{ fontSize: 12, fontWeight: 800 }}>MANCHE {room.currentRound || 1}</span>
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              padding: '5px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              
            }}>
              <span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '0.24em', color: 'var(--text-primary)',  }}>
                {room.id}
              </span>
              <button
                onClick={handleCopy}
                style={{ background: 'var(--bg-surface)', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)', display: 'flex' }}
              >
                {copied ? <Check size={16} color="currentColor" /> : <Copy size={16} />}
              </button>
            </div>
            <span className="label-xs" style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700 }}>
              {phaseSeconds}s
            </span>
            <button
              onClick={handleLeave}
              style={{
                marginLeft: 12,
                padding: '6px 12px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                
              }}
            >
              Quitter
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {leaderPlayer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Crown size={13} color="currentColor" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{leaderPlayer.name}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot" style={{ background: 'var(--bg-surface)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
              {isConnected ? 'EN LIGNE' : 'DÉCONNECTÉ'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Users size={13} color="currentColor" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{totalPlayers}</span>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LOBBY                                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        {(!room || room.state === 'lobby') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
            
            {/* ── BANDEAU HAUT TV : CODE DE CONNEXION GÉANT ET TRÈS VISIBLE ── */}
            <div
              className="card animate-in"
              style={{
                padding: '30px 40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 24,
                
                
                
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 620 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="badge badge-gold" style={{ fontSize: 11, letterSpacing: '0.2em' }}>
                    📱 REJOINDRE LA TABLE
                  </span>
                  {!isConnected && (
                    <span className="badge badge-red" style={{ fontSize: 12 }}>
                      ⚠️ CONNEXION AU SERVEUR...
                    </span>
                  )}
                </div>
                <h1
                  className="deco-title"
                  style={{
                    
                    fontSize: 'clamp(26px, 3.2vw, 42px)',
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  Rejoignez la partie avec le code :
                </h1>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                  Ouvrez l'application sur smartphone et saisissez ce code pour entrer dans la salle.
                </p>
              </div>

              {/* Bloc Code Géant TV */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  className="room-code"
                  style={{
                    padding: '18px 44px',
                    minWidth: 260,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {room?.id ? (
                    <span
                      className="room-code-text"
                      style={{
                        fontSize: 'clamp(52px, 5.5vw, 76px)',
                        letterSpacing: '0.22em',
                        textIndent: '0.22em',
                      }}
                    >
                      {room.id}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span
                        className="room-code-text"
                        style={{
                          fontSize: 'clamp(36px, 4vw, 48px)',
                          letterSpacing: '0.15em',
                          opacity: 0.6,
                          
                        }}
                      >
                        ....
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 700 }}>
                        {isConnected ? 'Génération du code...' : 'Connexion au serveur...'}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={handleCopy}
                    className="btn btn-secondary"
                    style={{
                      height: 52,
                      padding: '0 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 'var(--r-sm)',
                    }}
                    title="Copier le code"
                  >
                    {copied ? <Check size={18} color="currentColor" /> : <Copy size={18} />}
                    <span>{copied ? 'Copié !' : 'Copier'}</span>
                  </button>

                  <button
                    onClick={() => setShowIntro(true)}
                    className="btn btn-primary"
                    style={{
                      height: 52,
                      padding: '0 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    ▶︎ Comment jouer ?
                  </button>
                </div>
              </div>
            </div>

            {/* ── CONTENU DU LOBBY : JOUEURS ET RÈGLES ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, flex: 1, alignItems: 'start' }}>
              
              {/* Colonne Gauche : Joueurs + 3 Étapes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Carte Joueurs à table */}
                <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Users size={18} color="currentColor" />
                      <span style={{  fontWeight: 800, fontSize: 17, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)', }}>Joueurs à table</span>
                    </div>
                    <span className="badge badge-green" style={{ fontSize: 13, padding: '4px 12px' }}>
                      {totalPlayers} / {room?.settings?.maxPlayers || 8} joueur{totalPlayers > 1 ? 's' : ''}
                    </span>
                  </div>

                  {totalPlayers === 0 ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 8 }}>
                      <span style={{ fontSize: 48, }} className="animate-bounce">🍻</span>
                      <p style={{  fontWeight: 700, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)',  textAlign: 'center', margin: 0 }}>
                        La table est ouverte !
                      </p>
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 360, lineHeight: 1.5 }}>
                        Sortez les téléphones et entrez le code <strong style={{ color: 'var(--text-primary)',  fontWeight: 900, letterSpacing: '0.15em', fontSize: 18 }}>{room?.id || '....'}</strong> pour vous asseoir.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {room!.players.map((player: Player) => {
                        const isLeader = room!.leaderId === player.id;
                        return (
                          <div key={player.id} className="player-row animate-in" style={{ gap: 10, padding: '10px 14px' }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <Avatar name={player.name} size={36} />
                              {isLeader && (
                                <div style={{
                                  position: 'absolute', top: -6, right: -6,
                                  background: 'var(--bg-surface)', borderRadius: 'var(--r-sm)',
                                  border: '1px solid var(--border-default)', 
                                  width: 16, height: 16, display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <Crown size={10} color="currentColor" />
                                </div>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>💰 {player.balance} jetons</div>
                            </div>
                            {isLeader && <span className="badge badge-gold">CHEF</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="divider" />
                  
                  {/* Instructions 3 étapes + Chef de Groupe */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {[
                        ['1', 'Ouvrez le site sur smartphone'],
                        ['2', 'Entrez le code et un pseudo'],
                        ['3', 'Le premier devient Chef de Table'],
                      ].map(([num, txt]) => (
                        <div key={num} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{
                             fontWeight: 900, fontSize: 12,
                            width: 22, height: 22, flexShrink: 0,
                            background: 'var(--bg-surface)', color: 'var(--text-primary)',
                            border: '1px solid var(--border-default)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            
                            
                          }}>{num}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>{txt}</span>
                        </div>
                      ))}
                    </div>

                    {leaderPlayer && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Crown size={16} color="currentColor" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{leaderPlayer.name}</strong> configure et lance la partie.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Colonne Droite : Règles de la Table */}
              <div className="card animate-in" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{  fontWeight: 800, fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)', }}>
                    ⚙️ Règles de la Table
                  </div>
                  <span className="badge badge-gold">En direct</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: 'var(--r-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Solde de départ</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {room?.settings?.startingBalance ?? 20} 💰
                    </span>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: 'var(--r-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Manches Min / Max</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {room?.settings?.minRounds ?? 3} / {room?.settings?.maxRounds ?? 10} 🏁
                    </span>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: 'var(--r-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bombes aux Mines</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {room?.settings?.minesBombCount ?? 7} 💣
                    </span>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: 'var(--r-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Multiplicateur Gorgées</span>
                    <span className="badge badge-red" style={{ fontSize: 12, fontWeight: 700 }}>
                      ×{room?.settings?.sipMultiplier ?? 1} 🍺
                    </span>
                  </div>

                  <div style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: 'var(--r-sm)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>JEUX ACTIVÉS</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(room?.settings?.enabledGames || ['mines', 'blackjack', 'crash', 'roulette', 'derby']).map((game) => (
                        <span key={game} className="badge badge-surface" style={{ fontSize: 10, padding: '3px 7px' }}>
                          {game === 'mines' && '💣 Mines'}
                          {game === 'blackjack' && '♠ Blackjack'}
                          {game === 'crash' && '✈️ L\'Avion'}
                          {game === 'roulette' && '🎡 Roulette'}
                          {game === 'derby' && '🐎 Derby'}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* VOTING                                                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'voting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="stat-box">
                <span className="stat-value text-green">{votedCount}</span>
                <span className="stat-label">Votes reçus</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-primary">{totalPlayers}</span>
                <span className="stat-label">Joueurs total</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-gold">{room.currentRound || 1}</span>
                <span className="stat-label">Manche en cours</span>
              </div>
            </div>

            <div className="card" style={{ padding: 24, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div className="deco-eyebrow" style={{ marginBottom: 6 }}>PHASE DE VOTE · MANCHE {room.currentRound || 1}</div>
                  <h2 className="deco-title" style={{ fontSize: 26 }}>Choisissez le prochain jeu</h2>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="badge badge-gold animate-pulse" style={{ fontSize: 13, padding: '6px 12px' }}>
                    ⏱ {Math.max(0, 10 - phaseSeconds)}s
                  </span>
                  <div>
                    <span style={{  fontSize: 30, fontWeight: 900, color: 'var(--text-primary)' }}>{votedCount}</span>
                    <span style={{  fontSize: 16, color: 'var(--text-secondary)' }}>/{totalPlayers}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <ProgressBar value={votedCount} max={totalPlayers} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {room.players.map(player => {
                  const hasVoted = room.votes && room.votes[player.id] !== undefined;
                  return (
                    <div key={player.id} className="player-row" style={{
                      
                    }}>
                      <Avatar name={player.name} size={28} />
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player.name}
                      </div>
                      <span className={`dot dot-${hasVoted ? 'green' : 'muted'}`} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SHOWING TUTORIAL (VIDÉO DU DIDACTICIEL DU MINI-JEU)      */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'showing_tutorial' && (() => {
          const gameKey = (room.pendingGame || 'roulette') as string;
          if (gameKey === 'derby') {
            return (
              <DerbyTutorial
                roomId={room.id}
                onEndTutorial={() => socket.emit('end_tutorial', { roomId: room.id })}
              />
            );
          }

          const info = GAME_TUTORIAL_INFO[gameKey] || GAME_TUTORIAL_INFO.roulette;

          return (
            <div className="card animate-in" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 20,
              padding: '26px 34px',
              maxWidth: 1100,
              margin: '0 auto',
              width: '100%',
              
              
              
              borderRadius: 'var(--r-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="badge badge-gold" style={{ fontSize: 12, padding: '6px 14px', letterSpacing: '0.16em' }}>
                    🎬 DIDACTICIEL
                  </span>
                  <div>
                    <h2 className="deco-title" style={{ fontSize: 28, margin: 0 }}>
                      {info.title}
                    </h2>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {info.subtitle}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => socket.emit('end_tutorial', { roomId: room.id })}
                  className="btn btn-primary"
                  style={{
                    padding: '12px 24px',
                    fontSize: 13,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>Passer / Lancer le jeu ▸</span>
                </button>
              </div>

              <div className="card-surface" style={{ width: '100%', padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Zone média / didacticiel (à personnaliser)
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>
                  {info.summary}
                </p>
              </div>

              <div className="card-surface" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '14px 20px',
              }}>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: '75%', lineHeight: 1.4 }}>
                  <strong>Règles :</strong> {info.summary}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 700 }}>
                  <span>Cliquez sur « Passer / Lancer le jeu » pour démarrer</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING ROULETTE (Phase de mise & Tapis de Casino)      */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'playing_roulette' && (() => {
          const redBettors = room.players.filter(p => (p.currentBet?.color || room.bets?.[p.id]?.color) === 'red');
          const blackBettors = room.players.filter(p => (p.currentBet?.color || room.bets?.[p.id]?.color) === 'black');
          const greenBettors = room.players.filter(p => (p.currentBet?.color || room.bets?.[p.id]?.color) === 'green');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              {/* Header stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div className="stat-box">
                  <span className="stat-value text-green">{betCount} / {activeBettors}</span>
                  <span className="stat-label">Mises enregistrées</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value text-primary">{activeBettors}</span>
                  <span className="stat-label">Joueurs à la table</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value text-primary">{phaseSeconds}s</span>
                  <span className="stat-label">Temps de mise</span>
                </div>
              </div>

              {/* Main Casino Layout: Roulette Wheel + Green Felt Table */}
              <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: 20, flex: 1, alignItems: 'stretch' }}>
                {/* Left: Authentic 3D European Wheel */}
                <div className="card" style={{
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  
                }}>
                  <div className="deco-eyebrow" style={{ marginBottom: 16, fontSize: 10 }}>
                    CYLINDRE EUROPÉEN · 37 NUMÉROS
                  </div>
                  <RouletteWheelCanvas isSpinning={false} size={380} targetNumber={room.currentResult?.winningNumber ?? 0} />
                  <div style={{ marginTop: 18,  fontSize: 14, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    Faites vos jeux sur vos smartphones...
                  </div>
                </div>

                {/* Right: Casino Green Felt Table (Tapis de mise) */}
                <div className="card felt-emerald" style={{
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div className="deco-eyebrow" style={{ fontSize: 10, color: 'var(--text-primary)' }}>TAPIS DES MISES</div>
                      <h2 className="deco-title" style={{ fontSize: 30, margin: '4px 0 0' }}>FAITES VOS JEUX</h2>
                    </div>
                    {/* Host quick launch button */}
                    <button
                      onClick={() => socket.emit('start_roulette_spin', { roomId: room.id })}
                      className="btn btn-primary animate-green-pulse"
                      style={{ padding: '10px 18px', fontSize: 12 }}
                    >
                      Lancer le tirage 🎡
                    </button>
                  </div>

                  {/* The 3 Felt Betting Zones */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                    {/* GREEN (ZERO) */}
                    <div style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      
                      borderRadius: 'var(--r-sm)',
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{  fontWeight: 800, color: 'var(--text-primary)', fontSize: 16, letterSpacing: '0.12em', }}>
                          🟢 0 (ZÉRO)
                        </span>
                        <span className="badge badge-gold" style={{  fontWeight: 800, fontSize: 12 }}>
                          Cote ×36.00
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 36, alignItems: 'center' }}>
                        {greenBettors.length === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontStyle: 'italic', letterSpacing: '0.04em' }}>Aucune mise sur le Zéro</span>
                        ) : greenBettors.map(p => (
                          <div key={p.id} className="bet-token" style={{ }}>
                            <Avatar name={p.name} size={20} />
                            <span>{p.name}</span>
                            <span className="bet-token-amount">
                              {p.currentBet?.amount || room.bets?.[p.id]?.amount} 💰
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* RED & BLACK SIDE BY SIDE */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1 }}>
                      {/* RED FELT */}
                      <div className="velvet-crimson" style={{
                        
                        borderRadius: 'var(--r-sm)',
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{  fontWeight: 800, color: 'var(--text-primary)', fontSize: 16, letterSpacing: '0.12em', }}>
                            🔴 ROUGE
                          </span>
                          <span className="badge badge-gold" style={{  fontWeight: 800, fontSize: 12, }}>
                            Cote ×2.00
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 40, alignItems: 'center' }}>
                          {redBettors.length === 0 ? (
                            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontStyle: 'italic', letterSpacing: '0.04em' }}>En attente de mises...</span>
                          ) : redBettors.map(p => (
                            <div key={p.id} className="bet-token" style={{ }}>
                              <Avatar name={p.name} size={20} />
                              <span>{p.name}</span>
                              <span className="bet-token-amount">
                                {p.currentBet?.amount || room.bets?.[p.id]?.amount} 💰
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* BLACK FELT */}
                      <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        
                        borderRadius: 'var(--r-sm)',
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{  fontWeight: 800, color: 'var(--text-primary)', fontSize: 16, letterSpacing: '0.12em', }}>
                            ⚫ NOIR
                          </span>
                          <span className="badge badge-gold" style={{  fontWeight: 800, fontSize: 12 }}>
                            Cote ×2.00
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 40, alignItems: 'center' }}>
                          {blackBettors.length === 0 ? (
                            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontStyle: 'italic', letterSpacing: '0.04em' }}>En attente de mises...</span>
                          ) : blackBettors.map(p => (
                            <div key={p.id} className="bet-token">
                              <Avatar name={p.name} size={20} />
                              <span>{p.name}</span>
                              <span className="bet-token-amount">
                                {p.currentBet?.amount || room.bets?.[p.id]?.amount} 💰
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar footer */}
                  <div>
                    <ProgressBar value={betCount} max={activeBettors} />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ROULETTE SPINNING (Tirage en Direct Grand Spectacle)    */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'roulette_spinning' && (() => {
          const targetNum = room.currentResult?.winningNumber ?? Math.floor(Math.random() * 37);

          return (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              padding: 24,
            }}>
              {/* Marquee Banner */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--r-sm)',
                padding: '16px 44px',
                
                textAlign: 'center',
              }}>
                <div className="deco-eyebrow" style={{ fontSize: 10 }}>
                  CASINO ROYALE · TIRAGE EN DIRECT
                </div>
                <h1 className="deco-title" style={{
                  fontSize: 38,
                  margin: '6px 0 0',
                  letterSpacing: '0.1em',
                }}>
                  🎡 RIEN NE VA PLUS !
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>
                  La bille tourne à pleine vitesse dans la gorge du cylindre...
                </p>
              </div>

              {/* Realistic 3D Wheel in Full Spin Mode */}
              <div className="animate-in" style={{
                padding: 24,
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                
                border: '1px solid var(--border-default)',
              }}>
                <RouletteWheelCanvas
                  isSpinning={true}
                  targetNumber={targetNum}
                  size={460}
                  durationMs={6800}
                />
              </div>

              {/* Live Bettors ticker bar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: 700,
              }}>
                {room.players.map(p => {
                  const bet = p.currentBet || room.bets?.[p.id];
                  if (!bet) return null;
                  const colorBadge = bet.color === 'red' ? 'ROUGE' : bet.color === 'black' ? 'NOIR' : 'ZÉRO';

                  return (
                    <div key={p.id} style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--r-sm)',
                      padding: '6px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      color: 'var(--text-primary)',
                      
                    }}>
                      <Avatar name={p.name} size={22} />
                      <span>{p.name}</span>
                      <span style={{ opacity: 0.75 }}>•</span>
                      <span>{colorBadge} ({bet.amount} 💰)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* ROULETTE RESULT (Résultats et Distribution)             */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'roulette_result' && room.currentResult && (() => {
          const wc = room.currentResult.winningColor;
          const wn = room.currentResult.winningNumber;
          const winColorStyle = wc === 'red'
            ? { emoji: '●', label: 'ROUGE' }
            : wc === 'black'
            ? { emoji: '●', label: 'NOIR' }
            : { emoji: '●', label: 'ZÉRO' };

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              {/* Grand Banner Reveal */}
              <div className="tv-banner-massive" style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                
                gap: 20,
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
                  <div className="deco-medallion" style={{
                    width: 104, height: 104,
                    background: 'var(--bg-surface)',
                    fontSize: 48,
                  }}>
                    {wn}
                  </div>
                  <div>
                    <div className="deco-eyebrow" style={{ color: 'var(--text-primary)', fontSize: 11 }}>
                      RÉSULTAT OFFICIEL DU TIRAGE
                    </div>
                    <h1 className="tv-title-giant" style={{ color: 'var(--text-primary)', margin: '4px 0 0' }}>
                      {winColorStyle.emoji} NUMÉRO {wn} {winColorStyle.label} !
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '6px 0 0' }}>
                      {winners.length > 0 ? `Félicitations aux ${winners.length} vainqueur(s) ! 🎉` : 'La banque rafle la mise... Les verres se remplissent ! 🍻'}
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-gold" style={{
                    
                    fontSize: 20,
                    fontWeight: 900,
                    padding: '12px 22px',
                    
                  }}>
                    {wc === 'green' ? 'Cote ×36' : 'Cote ×2'}
                  </span>
                </div>
              </div>

              {/* Side-by-side Wheel & Winners/Losers tables */}
              <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr 1fr', gap: 20, flex: 1 }}>
                {/* Left: The settled wheel */}
                <div className="card" style={{
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  
                }}>
                  <div className="deco-eyebrow" style={{ marginBottom: 14, fontSize: 10 }}>ROUE ARRÊTÉE</div>
                  <RouletteWheelCanvas isSpinning={false} size={320} targetNumber={wn} />
                </div>

                {/* Center: Winners */}
                <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <TrendingUp size={22} color="currentColor" />
                    <span style={{  fontWeight: 800, fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Gagnants</span>
                    <span className="badge badge-green" style={{ fontSize: 14 }}>{winners.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>
                    {winners.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 15, padding: '28px 0' }}>
                        Aucun gagnant sur ce tirage ! 💀
                      </div>
                    ) : winners.map((r: PlayerRoundResult) => (
                      <div key={r.playerId} className="result-win" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 'var(--r-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={r.playerName} size={34} />
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>{r.playerName}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mise : {r.betAmount} 💰</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{  fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>+{r.netGain} 💰</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Losers (Sips to drink) */}
                <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <TrendingDown size={22} color="currentColor" />
                    <span style={{  fontWeight: 800, fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Perdants — Gorgées</span>
                    <span className="badge badge-red" style={{ fontSize: 14 }}>{losers.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>
                    {losers.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-primary)', fontSize: 15, padding: '28px 0', fontWeight: 800 }}>
                        Incroyable ! Tout le monde a gagné ! 🍻
                      </div>
                    ) : losers.map((r: PlayerRoundResult) => (
                      <div key={r.playerId} className="result-lose" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 'var(--r-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={r.playerName} size={34} />
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>{r.playerName}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mise perdue : {r.betAmount} 💰</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{  fontSize: 20, fontWeight: 900, color: 'var(--text-primary)' }}>+{r.betAmount} 🍺</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING CRASH (Mises)                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'playing_crash' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="stat-box">
                <span className="stat-value text-green">{crashBetCount}</span>
                <span className="stat-label">Investissements</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-primary">{activeBettors}</span>
                <span className="stat-label">Joueurs actifs</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-gold">Session {room.crashRound || 1}/3</span>
                <span className="stat-label">Manche Crash</span>
              </div>
            </div>

            <div className="card" style={{ padding: 24, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div className="deco-eyebrow" style={{ marginBottom: 6 }}>L'AVION ✈️ · PRENEZ VOS BILLETS</div>
                  <h2 className="deco-title" style={{ fontSize: 24 }}>Investissements en cours 📈 (Manche {room.crashRound || 1}/3)</h2>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <ProgressBar value={crashBetCount} max={activeBettors} color="gold" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {room.players.map(player => {
                  const bet = room.crashBets ? room.crashBets[player.id] : undefined;
                  const hasBet = bet !== undefined && bet.amount > 0;
                  return (
                    <div key={player.id} className={hasBet ? 'result-win' : 'player-row'}
                      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={player.name} size={26} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>💰 {player.balance}</div>
                          </div>
                        </div>
                        {hasBet
                          ? <span className="badge badge-green">Validé</span>
                          : <span className="badge badge-surface">En attente</span>}
                      </div>
                      {hasBet && (
                        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '4px 8px', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Capital</span>
                          <span style={{  color: 'var(--text-primary)' }}>📈 {bet!.amount} jetons</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {room?.state === 'crash_flying' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
            <div className="card" style={{
              padding: 20,
              position: 'relative',
              overflow: 'hidden',
              
              
              
            }}>
              <AviatorCanvas multiplier={currentMultiplier} crashed={false} height={460} />
              <div style={{ position: 'absolute', top: 32, left: 38, pointerEvents: 'none' }}>
                <div className="deco-eyebrow" style={{ marginBottom: 8, fontSize: 12 }}>
                  RADAR VOL {room.crashRound || 1}/3 · ENCAISSEZ AVANT LE CRASH !
                </div>
                <div className="tv-multiplier-huge">
                  {currentMultiplier.toFixed(2)}x
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {room.players.filter(p => room.crashBets && room.crashBets[p.id]).map(player => {
                const sold = player.cashOutMultiplier !== null && player.cashOutMultiplier !== undefined;
                return (
                  <div key={player.id} className={sold ? 'result-win' : 'player-row'} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={player.name} size={34} />
                      <span style={{ fontWeight: 800, fontSize: 16 }}>{player.name}</span>
                    </div>
                    {sold
                      ? <span className="badge badge-green" style={{  fontSize: 14, padding: '6px 12px', fontWeight: 800 }}>🪂 {player.cashOutMultiplier!.toFixed(2)}x</span>
                      : <span className="badge badge-gold animate-pulse" style={{ fontSize: 13, padding: '6px 12px', fontWeight: 800 }}>✈️ En vol</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {room?.state === 'crash_result' && room.currentCrashResult && (() => {
          const crashWinners = room.currentCrashResult.results.filter(r => r.won);
          const crashLosers = room.currentCrashResult.results.filter(r => !r.won && r.betAmount > 0);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
              <div className="card animate-in tv-banner-massive" style={{
                
                
                
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div className="deco-eyebrow" style={{ color: 'var(--text-primary)', fontSize: 12 }}>RADAR VOL {room.crashRound || 1}/3</div>
                  <h1 className="tv-title-giant" style={{ margin: '6px 0 0', color: 'var(--text-primary)' }}>
                    💥 CRASH à <span style={{ color: 'var(--text-primary)', }}>{room.currentCrashResult.crashPoint.toFixed(2)}x</span> !
                  </h1>
                </div>
                <span style={{ fontSize: 68, }}>🛩️</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1 }}>
                <div className="card" style={{ padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <TrendingUp size={22} color="currentColor" />
                    <span style={{  fontWeight: 800, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ont sauté à temps 🪂</span>
                    <span className="badge badge-green" style={{ fontSize: 14 }}>{crashWinners.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {crashWinners.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px 0', fontSize: 15 }}>
                        Personne n'a sauté à temps ! 💀
                      </div>
                    ) : crashWinners.map(r => (
                      <div key={r.playerId} className="result-win" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={r.playerName} size={32} />
                          <span style={{ fontSize: 16, fontWeight: 800 }}>{r.playerName}</span>
                        </div>
                        <div style={{  fontSize: 17, fontWeight: 900, color: 'var(--text-primary)' }}>
                          {r.cashOutMultiplier?.toFixed(2)}x · {r.netGain >= 0 ? '+' : ''}{r.netGain} 💰
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <TrendingDown size={22} color="currentColor" />
                    <span style={{  fontWeight: 800, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Crashés — Gorgées</span>
                    <span className="badge badge-red" style={{ fontSize: 14 }}>{crashLosers.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {crashLosers.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '24px 0', fontSize: 15 }}>
                        Aucun joueur n'est crashé !
                      </div>
                    ) : crashLosers.map(r => (
                      <div key={r.playerId} className="result-lose" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={r.playerName} size={32} />
                          <span style={{ fontSize: 16, fontWeight: 800 }}>{r.playerName} 💥</span>
                        </div>
                        <div style={{  fontSize: 17, fontWeight: 900, color: 'var(--text-primary)' }}>+{r.sipsToDrink} 🍺</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING BLACKJACK (Mises)                               */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'playing_blackjack' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="stat-box">
                <span className="stat-value text-green">{blackjackBetCount}</span>
                <span className="stat-label">Mises validées</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-primary">{activeBettors}</span>
                <span className="stat-label">Joueurs actifs</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-primary">{phaseSeconds}s</span>
                <span className="stat-label">Durée phase</span>
              </div>
            </div>

            <div className="card" style={{ padding: 20, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div className="label-xs" style={{ marginBottom: 4 }}>BLACKJACK DU CASINO</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700 }}>Prise des Mises Blackjack ♠</h2>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <ProgressBar value={blackjackBetCount} max={activeBettors} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {room.players.map(player => {
                  const bet = room.blackjackBets ? room.blackjackBets[player.id] : undefined;
                  const hasBet = bet !== undefined && bet > 0;
                  return (
                    <div key={player.id} className={hasBet ? 'result-win' : 'player-row'}
                      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={player.name} size={26} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>💰 {player.balance}</div>
                          </div>
                        </div>
                        {hasBet
                          ? <span className="badge badge-green">Misé</span>
                          : <span className="badge badge-surface">En attente</span>}
                      </div>
                      {hasBet && (
                        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--r-sm)', padding: '4px 8px', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Mise</span>
                          <span style={{ color: 'var(--text-primary)' }}>♠ {bet} jetons</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* BLACKJACK TABLE                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        {(room?.state === 'blackjack_playing' || room?.state === 'blackjack_dealer_turn' || room?.state === 'blackjack_result') && (
          <div className="blackjack-table" style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Dealer Header */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              padding: '20px 32px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              
              flexWrap: 'wrap',
              gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
                  
                }}>
                  🎩
                </div>
                <div>
                  <div className="label-xs" style={{ color: 'var(--text-primary)', letterSpacing: '0.15em', fontSize: 12 }}>LA BANQUE DU CASINO</div>
                  <div style={{ fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)', fontWeight: 900, color: 'var(--text-primary)' }}>
                    CROUPIER
                  </div>
                </div>
                <div style={{
                  marginLeft: 16,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  padding: '8px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 800 }}>SCORE</span>
                  <span style={{
                    fontSize: 'clamp(2rem, 3.2vw, 2.8rem)',
                    fontWeight: 900,
                    color: 'var(--text-primary)',
                    
                    lineHeight: 1,
                  }}>
                    {dealerScore > 21 ? `${dealerScore} (BUST 💥)` : dealerScore}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                {room.dealerHand?.map((c, i) => <PlayingCard key={i} card={c} size="lg" />)}
              </div>
            </div>

            {/* Players Hands Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
              {room.players.map(p => {
                const pScore = calculateHandScore(p.hand);
                const bjResult = room.currentBlackjackResult?.results.find(r => r.playerId === p.id);
                const isBust = pScore > 21;
                const isBlackjack = pScore === 21 && p.hand?.length === 2;

                return (
                  <div
                    key={p.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--r-sm)',
                      padding: '18px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={p.name} size={36} />
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 'clamp(1.15rem, 1.4vw, 1.4rem)', color: 'var(--text-primary)' }}>{p.name}</div>
                          {room.blackjackBets?.[p.id] && (
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 700 }}>
                              Mise: {room.blackjackBets[p.id]} 💰
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--r-sm)',
                        padding: '6px 14px',
                        fontWeight: 900,
                        fontSize: '1.3rem',
                        color: 'var(--text-primary)',
                        
                        lineHeight: 1,
                      }}>
                        {isBust ? `${pScore} 💥` : isBlackjack ? '21 ⚡' : `${pScore} pts`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '6px 0', minHeight: 140, alignItems: 'center' }}>
                      {p.hand?.map((c, i) => <PlayingCard key={i} card={c} size="lg" />)}
                    </div>

                    {room.state === 'blackjack_result' && bjResult ? (
                      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
                        {bjResult.status === 'won' ? (
                          <span className="badge badge-green" style={{ fontSize: 15, padding: '8px 16px', width: '100%', justifyContent: 'center', fontWeight: 800 }}>
                            🎉 GAGNÉ (+{bjResult.netGain} 💰)
                          </span>
                        ) : bjResult.status === 'push' ? (
                          <span className="badge badge-gold" style={{ fontSize: 15, padding: '8px 16px', width: '100%', justifyContent: 'center', fontWeight: 800 }}>
                            🤝 ÉGALITÉ (0 💰)
                          </span>
                        ) : (
                          <span className="badge badge-red" style={{ fontSize: 15, padding: '8px 16px', width: '100%', justifyContent: 'center', fontWeight: 800 }}>
                            💀 PERDU ({bjResult.sipsToDrink} 🍺)
                          </span>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
                        {p.blackjackStatus === 'busted' ? (
                          <span className="badge badge-red" style={{ fontSize: 14, padding: '6px 14px', fontWeight: 800 }}>💥 BUST (&gt; 21)</span>
                        ) : p.blackjackStatus === 'stood' ? (
                          <span className="badge badge-surface" style={{ fontSize: 14, padding: '6px 14px', fontWeight: 800 }}>✋ RESTE</span>
                        ) : (
                          <span className="badge badge-gold animate-pulse" style={{ fontSize: 14, padding: '6px 14px', fontWeight: 800 }}>🎮 EN JEU...</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING MINES (Mises)                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'playing_mines' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="stat-box">
                <span className="stat-value text-green">{minesBetCount}</span>
                <span className="stat-label">Mises validées</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-primary">{activeBettors}</span>
                <span className="stat-label">Joueurs actifs</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-primary">{phaseSeconds}s</span>
                <span className="stat-label">Durée phase</span>
              </div>
            </div>

            <div className="card" style={{ padding: 20, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div className="label-xs" style={{ marginBottom: 4 }}>LES MINES (GRILLE COMMUNE 6x6)</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700 }}>Prise des Mises 💣</h2>
                </div>
                <span className="badge badge-red">{room.settings?.minesBombCount ?? 7} Bombes</span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <ProgressBar value={minesBetCount} max={activeBettors} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {room.players.map(player => {
                  const bet = room.minesBets ? room.minesBets[player.id] : undefined;
                  const hasBet = bet !== undefined && bet > 0;
                  return (
                    <div key={player.id} className={hasBet ? 'result-win' : 'player-row'}
                      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={player.name} size={26} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>💰 {player.balance}</div>
                          </div>
                        </div>
                        {hasBet
                          ? <span className="badge badge-green">Misé</span>
                          : <span className="badge badge-surface">En attente</span>}
                      </div>
                      {hasBet && (
                        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--r-sm)', padding: '4px 8px', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Mise</span>
                          <span style={{ color: 'var(--text-primary)' }}>💎 {bet} jetons</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LES MINES (6x6 En Jeu)                                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'mines_playing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1, alignItems: 'center' }}>
            <div className="card tv-banner-massive" style={{
              width: '100%',
              
              
              textAlign: 'center',
            }}>
              <div className="label-xs" style={{ color: 'var(--text-primary)', letterSpacing: '0.15em', fontSize: 13, marginBottom: 6 }}>
                GRILLE COMMUNE 6×6 · TOUR EN DIRECT
              </div>
              <h1 className="tv-title-giant" style={{ margin: 0, color: 'var(--text-primary)' }}>
                C'est au tour de <span style={{ color: 'var(--text-primary)', }}>{currentTurnPlayer?.name ?? '...'}</span> !
              </h1>
            </div>

            <div className="card" style={{ padding: 28, width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div className="mines-board" style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
                <div className="mines-grid-container">
                  {Array.from({ length: 36 }).map((_, index) => {
                    const isRevealed = (room.revealedCells || []).includes(index);
                    const isBomb = isRevealed && Boolean(room.minesGrid && room.minesGrid.includes(index));
                    const isSafe = isRevealed && !isBomb;

                    return (
                      <div key={index} className={`mines-cell ${isSafe ? 'mines-cell-safe' : isBomb ? 'mines-cell-bomb' : ''}`}>
                        {isBomb ? '💣' : isSafe ? '💎' : <span className="mines-cell-dot" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* PLAYING DERBY (Mises)                                   */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'playing_derby' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div className="stat-box">
                <span className="stat-value text-green">{derbyBetCount}</span>
                <span className="stat-label">Paris validés</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-primary">{activeBettors}</span>
                <span className="stat-label">Joueurs actifs</span>
              </div>
              <div className="stat-box">
                <span className="stat-value text-gold">Cote ×3.00</span>
                <span className="stat-label">Gain Vainqueur</span>
              </div>
            </div>

            <div className="card" style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="label-xs" style={{ marginBottom: 4 }}>LE DERBY · HIPPODROME DU CASINO</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700 }}>Prise des Paris sur les Chevaux 🐎</h2>
                </div>
                <button
                  onClick={() => socket.emit('start_derby_race', { roomId: room.id })}
                  className="btn btn-primary animate-green-pulse"
                  style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700 }}
                >
                  Lancer la course 🏇
                </button>
              </div>

              <div>
                <ProgressBar value={derbyBetCount} max={activeBettors} color="gold" />
              </div>

              {/* 4 Starting Stalls */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {(room.derbyHorses || [
                  { id: 1, name: 'Éclair Rouge', color: '#333333', emoji: '#1' },
                  { id: 2, name: 'Tornade Bleue', color: '#555555', emoji: '#2' },
                  { id: 3, name: 'Galop Vert', color: '#777777', emoji: '#3' },
                  { id: 4, name: 'Pégase Jaune', color: '#999999', emoji: '#4' },
                ]).map((horse) => (
                  <div key={horse.id} style={{
                    background: 'var(--bg-surface)',
                    borderLeft: '1px solid var(--border-default)',
                    borderRadius: 'var(--r-sm)',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>STALLE #{horse.id}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {horse.emoji} {horse.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Players Status Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {room.players.map(player => {
                  const bet = player.derbyBet || (room.derbyBets ? room.derbyBets[player.id] : undefined);
                  const hasBet = bet !== undefined && bet.amount > 0;
                  const chosenHorse = hasBet ? (room.derbyHorses || []).find(h => h.id === bet.horseId) : null;

                  return (
                    <div key={player.id} className={hasBet ? 'result-win' : 'player-row'}
                      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={player.name} size={26} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{player.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>💰 {player.balance}</div>
                          </div>
                        </div>
                        {hasBet
                          ? <span className="badge badge-green">Parié</span>
                          : <span className="badge badge-surface">En attente</span>}
                      </div>
                      {hasBet && chosenHorse && (
                        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--r-sm)', padding: '4px 8px', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-primary)' }}>{chosenHorse.emoji} {chosenHorse.name}</span>
                          <span style={{ color: 'var(--text-primary)' }}>{bet.amount} 💰</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* DERBY RACING (Hippodrome Ovale SVG & Motion Path)        */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'derby_racing' && (() => {
          const horses = room.derbyHorses || [];
          const leader = [...horses].sort((a, b) => b.progress - a.progress)[0];

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, alignItems: 'center' }}>
              {/* Header avec statut de la course */}
              <div className="card animate-in" style={{
                width: '100%',
                padding: '14px 24px',
                
                
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                
              }}>
                <div>
                  <div className="label-xs" style={{ color: 'var(--text-primary)', letterSpacing: '0.12em' }}>
                    HIPPODROME OVALE DU CASINO · 1 TOUR UNIQUE (360°)
                  </div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, margin: '2px 0 0', color: 'var(--text-primary)' }}>
                    🏇 LA COURSE DU DERBY EST LANCÉE ! 🏁
                  </h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="badge badge-gold animate-pulse" style={{ fontSize: 13, padding: '6px 14px' }}>
                    DIRECT LIVE 🏁
                  </span>
                  {leader && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      En tête : {leader.emoji} {leader.name} ({Math.min(100, Math.round((leader.progress / 360) * 100))}%)
                    </div>
                  )}
                </div>
              </div>

              {/* Grand Conteneur de la Piste Ovale (SVG + Chevaux CSS Motion Path) */}
              <div style={{
                position: 'relative',
                width: 780,
                height: 430,
                borderRadius: 'var(--r-sm)',
                overflow: 'hidden',
                background: 'var(--bg-surface)',
                
                border: '1px solid var(--border-default)',
                margin: '6px 0',
              }}>
                {/* SVG de la Piste Ovale (Wireframe neutre) */}
                <svg
                  viewBox="0 0 780 430"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                >
                  <defs>
                    <pattern id="checkeredFinish" width="10" height="10" patternUnits="userSpaceOnUse">
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

                  <rect
                    x="386"
                    y="295"
                    width="8"
                    height="105"
                    fill="url(#checkeredFinish)"
                    stroke="#111111"
                    strokeWidth="1"
                  />
                  <text x="390" y="286" textAnchor="middle" fill="#111111" fontSize="10" fontWeight="700">
                    LIGNE D'ARRIVÉE
                  </text>
                </svg>

                {/* HUD Classement & Tours exactement au centre de l'ovale (pelouse dégagée) */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 280,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  padding: '8px 12px',
                  
                  zIndex: 10,
                  
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  pointerEvents: 'none',
                }}>
                  {/* Header: Tour actuel & badge Live */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border-default)',
                    paddingBottom: 4,
                    marginBottom: 2,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13 }}>🏁</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                        {leader ? (
                          leader.progress >= 260 ? '⚡ DERNIÈRE LIGNE DROITE ! ⚡' : leader.progress >= 160 ? 'MI-COURSE' : 'DÉPART LANCÉ'
                        ) : 'DÉPART'}
                      </span>
                    </div>
                    <span className="badge badge-gold" style={{ fontSize: 9, padding: '1px 6px' }}>
                      DIRECT LIVE
                    </span>
                  </div>

                  {/* Les 4 chevaux triés en direct */}
                  {[...horses].sort((a, b) => b.progress - a.progress).map((h, rank) => {
                    const isFirst = rank === 0;
                    const medals = ['🥇', '🥈', '🥉', '4e'];
                    const isBoosted = h.momentum === 'boosted';
                    const isFatigued = h.momentum === 'fatigued';

                    return (
                      <div key={h.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-surface)',
                        borderLeft: isFirst ? '3px solid #111111' : '1px solid var(--border-default)',
                        borderRadius: 'var(--r-sm)',
                        padding: '3px 8px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11 }}>{medals[rank]}</span>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            {h.name.split(' ')[0]}
                            {isBoosted && <span title="Sprint Boosté !">🔥</span>}
                            {isFatigued && <span title="Essoufflé !">💨</span>}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {h.isTocard && (
                            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                              Tocard
                            </span>
                          )}
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                          }}>
                            {Math.min(100, Math.round((h.progress / 360) * 100))}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Les 4 Chevaux animés via CSS Motion Path (offset-path) */}
                {horses.map((horse, idx) => {
                  const lanePath = getDerbyLanePath(idx);
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
                        transition: 'offset-distance 100ms linear, -webkit-offset-distance 100ms linear',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 20 + idx,
                        pointerEvents: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      } as any}
                    >
                      {/* Pastille Nom/ID bien visible */}
                      <div style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--r-sm)',
                        padding: '1px 6px',
                        whiteSpace: 'nowrap',
                        marginBottom: 2,
                        
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}>
                        <span>#{horse.id} {horse.name.split(' ')[0]}</span>
                        {isBoosted && <span style={{ fontSize: 11 }}>🔥</span>}
                        {isFatigued && <span style={{ fontSize: 11 }}>💨</span>}
                      </div>

                      {/* Icône de cheval avec pastille de couleur */}
                      <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: 'var(--bg-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        
                        border: '1px solid var(--border-default)',
                        transform: isBoosted ? 'scale(1.15)' : isFatigued ? 'scale(0.92)' : 'scale(1)',
                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      }}>
                        🐎
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Barre de récapitulatif sous la piste */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, width: '100%', maxWidth: 780 }}>
                {[...horses].sort((a, b) => b.progress - a.progress).map((h, rank) => (
                  <div key={h.id} style={{
                    background: 'var(--bg-surface)',
                    borderLeft: '1px solid var(--border-default)',
                    borderRadius: 'var(--r-sm)',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>#{rank + 1} {h.name}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {h.momentum === 'boosted' ? '🔥 En Sprint' : h.momentum === 'fatigued' ? '💨 Fatigue' : 'En course'}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {Math.min(100, Math.round((h.progress / 360) * 100))}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* DERBY RESULT                                            */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'derby_result' && room.currentDerbyResult && (() => {
          const winner = room.currentDerbyResult.winningHorse;
          const winnersList = room.currentDerbyResult.results.filter(r => r.won);
          const losersList = room.currentDerbyResult.results.filter(r => !r.won && r.betAmount > 0);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
              {/* Winner Banner */}
              <div className="card animate-in tv-banner-massive" style={{
                
                
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                
                gap: 20,
                flexWrap: 'wrap',
              }}>
                <div>
                  <div className="label-xs" style={{ color: 'var(--text-primary)', letterSpacing: '0.15em', fontSize: 13 }}>VAINQUEUR DU DERBY</div>
                  <h1 className="tv-title-giant" style={{ color: 'var(--text-primary)', margin: '4px 0 0' }}>
                    🏆 {winner.name} ({winner.emoji}) A GAGNÉ !
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginTop: 6 }}>
                    Cote gagnante ×3.00 · Félicitations aux parieurs !
                  </p>
                </div>

                <span className="badge" style={{   fontSize: 18, fontWeight: 900, padding: '12px 24px', borderRadius: 'var(--r-sm)' }}>
                  1ÈRE PLACE 🥇
                </span>
              </div>

              {/* Winners & Losers Columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flex: 1 }}>
                <div className="card" style={{ padding: 22 }}>
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🟢 Parieurs Gagnants</span>
                    <span className="badge badge-green" style={{ fontSize: 14 }}>{winnersList.length}</span>
                  </div>
                  {winnersList.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: 15, textAlign: 'center', padding: '28px 0' }}>
                      Aucun joueur n'a misé sur {winner.name} !
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {winnersList.map(r => (
                        <div key={r.playerId} className="result-win" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 'var(--r-sm)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={r.playerName} size={34} />
                            <span style={{ fontWeight: 800, fontSize: 16 }}>{r.playerName}</span>
                          </div>
                          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>+{r.netGain} 💰</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card" style={{ padding: 22 }}>
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🔴 Parieurs Perdants</span>
                    <span className="badge badge-red" style={{ fontSize: 14 }}>{losersList.length}</span>
                  </div>
                  {losersList.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: 15, textAlign: 'center', padding: '28px 0' }}>
                      Aucun perdant pour cette course !
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {losersList.map(r => (
                        <div key={r.playerId} className="result-lose" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 'var(--r-sm)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={r.playerName} size={34} />
                            <span style={{ fontWeight: 800, fontSize: 16 }}>{r.playerName}</span>
                          </div>
                          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>+{r.sipsToDrink} 🍺</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LE GRAND FINAL : 1. LA TAXE (final_tax)                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'final_tax' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div className="card animate-in" style={{
              padding: '24px',
              
              
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              
            }}>
              <div>
                <div className="label-xs" style={{ color: 'var(--text-primary)', letterSpacing: '0.1em' }}>LE GRAND FINAL</div>
                <h1 style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                  💸 LA TAXE FINALE ! 💥
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
                  Le Fisc du Casino prélève entre 10% et 40% sur votre solde. Ces gorgées sont pour vous !
                </p>
              </div>

              <span className="badge badge-red" style={{ fontSize: 14, padding: '8px 18px' }}>
                <Flame size={16} /> Taxe Aléatoire 10-40%
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, flex: 1 }}>
              {room.players.map((player: Player) => (
                <div key={player.id} className="card result-lose" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={player.name} size={36} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{player.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Solde final : {player.balance} 💰</div>
                      </div>
                    </div>
                    <span className="badge badge-red" style={{ fontSize: 13, fontWeight: 700 }}>
                      -{player.taxRate || 0}%
                    </span>
                  </div>

                  <div className="divider" />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: 'var(--r-sm)' }}>
                      <div className="label-xs" style={{ color: 'var(--text-primary)' }}>Taxe (À boire)</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {player.personalTaxSips || 0} 🍺
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: 'var(--r-sm)' }}>
                      <div className="label-xs" style={{ color: 'var(--text-primary)' }}>À distribuer</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {player.distributableBalance || 0} 💰
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Crown size={16} color="currentColor" />
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                {leaderPlayer
                  ? `${leaderPlayer.name} (Chef) peut lancer la distribution finale sur son smartphone.`
                  : 'En attente du Chef de Groupe...'}
              </span>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LE GRAND FINAL : 2. DISTRIBUTION FINALE                 */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'final_distribution' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div className="card animate-in" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="label-xs" style={{ color: 'var(--text-primary)' }}>LE GRAND FINAL</div>
                <h2 style={{ fontSize: 26, fontWeight: 700 }}>Distribution Finale des Gorgées 🍻</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                  Chaque joueur répartit l'intégralité de son solde distribuable aux autres joueurs.
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-gold" style={{ fontSize: 14, padding: '8px 16px' }}>
                  {finalSubmittedCount} / {totalPlayers} validé{finalSubmittedCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div className="card" style={{ padding: 20, flex: 1 }}>
              <div style={{ marginBottom: 16 }}>
                <ProgressBar value={finalSubmittedCount} max={totalPlayers} color="gold" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {room.players.map(player => {
                  const isDone = player.hasSubmittedFinalDistribution;
                  return (
                    <div key={player.id} className={isDone ? 'result-win' : 'player-row'} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={player.name} size={32} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{player.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Solde distribuable : {player.distributableBalance || 0} 💰
                          </div>
                        </div>
                      </div>

                      {isDone ? (
                        <span className="badge badge-green"><Check size={12} /> Validé</span>
                      ) : (
                        <span className="badge badge-gold animate-pulse">En cours...</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LE GRAND FINAL : 3. BILAN ULTIME (final_drinking)       */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'final_drinking' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <div className="card animate-in" style={{
              padding: '28px 24px',
              
              
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              
            }}>
              <div>
                <div className="label-xs" style={{ color: 'var(--text-primary)', letterSpacing: '0.1em' }}>LE GRAND BILAN</div>
                <h1 style={{ fontSize: 38, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
                  🏆 L'ADDITION ULTIME ! 🍻
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
                  Fin de la partie ! Voici le cumul ultime de toutes les gorgées de la soirée.
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-green" style={{ fontSize: 14, padding: '8px 18px' }}>
                  <Sparkles size={16} /> Total : {totalSipsToDrink} 🍺
                </span>
              </div>
            </div>

            <div className="card" style={{ padding: 20, flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {room.players.map((player: Player) => {
                  const sips = player.sipsToDrink || 0;
                  const hasFinished = player.hasDrank;

                  return (
                    <div
                      key={player.id}
                      className={hasFinished ? 'result-win' : 'result-lose'}
                      style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={player.name} size={38} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{player.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Taxe: {player.personalTaxSips || 0} 🍺 · Reçu: {Math.max(0, sips - (player.personalTaxSips || 0))} 🍺
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 18 }}>
                          {sips} 🍺
                        </div>
                        {hasFinished ? (
                          <span className="badge badge-green"><CheckCircle2 size={12} /> A bu</span>
                        ) : (
                          <span className="badge badge-red animate-pulse"><Hourglass size={12} /> En train de boire</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Crown size={16} color="currentColor" />
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                {allPlayersDrank
                  ? `${leaderPlayer?.name ?? 'Le Chef'} peut maintenant réinitialiser la table et retourner au Lobby !`
                  : `En attente que tous les joueurs aient bu (${drankPlayersCount}/${totalPlayers})...`}
              </span>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* DRINKING PHASE (Standard)                               */}
        {/* ═══════════════════════════════════════════════════════ */}
        {room?.state === 'drinking_phase' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div className="stat-box" style={{ padding: '16px 20px' }}>
                <span className="stat-value text-green" style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)' }}>{drankPlayersCount} / {totalPlayers}</span>
                <span className="stat-label" style={{ fontSize: 13 }}>Ont fini de boire</span>
              </div>
              <div className="stat-box" style={{ padding: '16px 20px' }}>
                <span className="stat-value text-gold" style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)' }}>{totalSipsToDrink} 🍺</span>
                <span className="stat-label" style={{ fontSize: 13 }}>Total gorgées</span>
              </div>
              <div className="stat-box" style={{ padding: '16px 20px' }}>
                <span className="stat-value text-primary" style={{ fontSize: 'clamp(2rem, 3.5vw, 3rem)' }}>Manche {room.currentRound || 1}</span>
                <span className="stat-label" style={{ fontSize: 13 }}>Tour actuel</span>
              </div>
            </div>

            <div className="card" style={{ padding: 24, flex: 1 }}>
              <h2 className="tv-title-giant" style={{ marginBottom: 20, color: 'var(--text-primary)' }}>L'Addition ! 🍻</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {room.players.map((player: Player) => (
                  <div key={player.id} className={player.hasDrank ? 'result-win' : 'result-lose'} style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--r-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Avatar name={player.name} size={42} />
                      <div style={{ fontWeight: 800, fontSize: 'clamp(1.2rem, 1.5vw, 1.5rem)', color: 'var(--text-primary)' }}>{player.name}</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ fontWeight: 900, fontSize: 'clamp(1.8rem, 2.5vw, 2.4rem)', color: 'var(--text-primary)' }}>
                        {player.sipsToDrink || 0} 🍺
                      </div>
                      {player.hasDrank ? (
                        <span className="badge badge-green" style={{ fontSize: 14, padding: '5px 12px', fontWeight: 800 }}>A bu</span>
                      ) : (
                        <span className="badge badge-red" style={{ fontSize: 14, padding: '5px 12px', fontWeight: 800 }}>En train de boire</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {showIntro && (
        <div
          onClick={() => setShowIntro(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 32,
          }}
        >
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 'min(640px, 100%)', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Comment jouer ?</h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
              1. Rejoignez la salle sur smartphone avec le code affiché à l'écran.<br />
              2. Votez pour le prochain mini-jeu, puis placez vos mises en jetons.<br />
              3. Les gagnants distribuent leurs gains en gorgées ; les perdants boivent leur mise.
            </p>
            <button onClick={() => setShowIntro(false)} className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
