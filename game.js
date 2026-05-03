/* ============================================================
   BRICKSTORM ULTRA — game.js  (ENHANCED EDITION)
   New features:
   - 🔊 Web Audio API synthesized sounds (no files needed)
   - 👾 Boss bricks with HP bar (every 5 levels)
   - ⏱  Bullet time on near-miss
   - ✨ Streak flash + multiplier display
   - 🎱 Ball skin selector (fire/plasma/ghost)
   - 🧩 Brick patterns (wave, diamond, checkerboard, spiral)
   - 🎯 Auto-aim trajectory preview
   - 📅 Daily challenge mode (same seed daily)
   ============================================================ */


/* ============================================================
   1. DOM REFERENCES
   ============================================================ */
const canvas     = document.getElementById('c');
const ctx        = canvas.getContext('2d');
const hvScore    = document.getElementById('hv-score');
const hvBest     = document.getElementById('hv-best');
const hvLevel    = document.getElementById('hv-level');
const comboDisp  = document.getElementById('combo-disp');
const livesRow   = document.getElementById('lives-row');
const overlay    = document.getElementById('overlay');
const ot         = document.getElementById('ot');
const os         = document.getElementById('os');
const ostats     = document.getElementById('ostats');
const obtn       = document.getElementById('obtn');
const bbar       = document.getElementById('bbar');
const cwrap      = document.getElementById('cwrap');
const eventBanner = document.getElementById('event-banner');
const rageBar    = document.getElementById('rage-bar');


/* ============================================================
   2. CONSTANTS
   ============================================================ */
const W         = 540;
const H         = 420;
const MAX_LIVES = 3;
const BALL_R    = 7;
const PAD_H     = 11;
const BASE_SPD  = 4.8;
const MAX_BALLS = 6;

const BCOLS = ['#ff3d7f','#ff7c2a','#ffcc00','#00ff9d','#00d4ff','#a78bfa','#ff6b6b'];

const PU = {
  wide:    { color: '#60a5fa', label: 'WIDE PAD'     },
  multi:   { color: '#ff3d7f', label: 'MULTIBALL'    },
  slow:    { color: '#00ff9d', label: 'SLOW MO'      },
  laser:   { color: '#ffcc00', label: 'LASER x5'     },
  shield:  { color: '#a78bfa', label: 'SHIELD'       },
  life:    { color: '#ff6b6b', label: '+1 LIFE'      },
  fire:    { color: '#ff7c2a', label: 'FIREBALL'     },
  gravity: { color: '#c084fc', label: 'GRAVITY WELL' },
  ghost:   { color: '#94a3b8', label: 'GHOST BALL'   },
  magnet:  { color: '#f472b6', label: 'BRICK MAGNET' },
  rewind:  { color: '#fb923c', label: 'TIME REWIND'  },
};
const PU_KEYS = Object.keys(PU);

// Ball skins
const BALL_SKINS = {
  plasma:  { trail: '#00d4ff', body: '#e8f4ff', glow: '#00d4ff', fire: false },
  fire:    { trail: '#ff7c2a', body: '#ffcc00', glow: '#ff3d00', fire: true  },
  ghost:   { trail: '#94a3b8', body: '#cbd5e1', glow: '#94a3b8', fire: false },
  neon:    { trail: '#00ff9d', body: '#ffffff', glow: '#00ff9d', fire: false },
  dark:    { trail: '#a78bfa', body: '#4c1d95', glow: '#a78bfa', fire: false },
};
let activeSkin = 'plasma';


/* ============================================================
   3. GAME STATE VARIABLES
   ============================================================ */
let gstate    = 'idle';
let score     = 0;
let best      = 0;
let level     = 1;
let combo     = 0;
let maxCombo  = 0;
let lives     = MAX_LIVES;
let bricksDone = 0;

let paddleX = W / 2;
let paddleW = 94;

let balls        = [];
let bricks       = [];
let parts        = [];
let pdrops       = [];
let lasers       = [];
let gravityWells = [];
let wormholes    = [];

let shieldOn  = false;
let fireOn    = false;
let ghostOn   = false;
let magnetOn  = false;
let gravFlipped = false;

let rageLevel = 0;

let rewindBuffer = [];
let isRewinding  = false;

let wormholeTimer  = 0;
let nextWormholeAt = 0;

let bannerTimer = 0;

let ptimers = {};

let keys2 = {};

let frame = 0;

let screenShake = 0;

// NEW: Bullet time state
let bulletTime = false;
let bulletTimeFrames = 0;
let nearMissCooldown = 0;

// NEW: Boss brick
let bossActive = false;
let bossBrick  = null;

// NEW: Trajectory preview
let showTrajectory = true;

// NEW: Daily challenge
let dailyMode = false;
let dailySeed = 0;

// NEW: Streak flash
let streakFlashTimer = 0;
let streakFlashColor = '#ffcc00';

// NEW: Skin select state (used on start screen)
let skinSelectActive = false;

// NEW: Total bricks broken this session (for achievements)
let sessionBricks = 0;

// NEW: Consecutive paddle hits without missing (for near-miss detection)
let paddleStreakHits = 0;


/* ============================================================
   4. STARS
   ============================================================ */
(function spawnStars() {
  const se = document.getElementById('stars');
  for (let i = 0; i < 120; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.cssText =
      `left:${Math.random()*100}%;` +
      `top:${Math.random()*100}%;` +
      `width:${Math.random()*2+0.4}px;` +
      `height:${Math.random()*2+0.4}px;` +
      `--d:${(Math.random()*4+2).toFixed(1)}s;` +
      `animation-delay:${(Math.random()*4).toFixed(1)}s`;
    se.appendChild(s);
  }
})();


/* ============================================================
   5. WEB AUDIO ENGINE (synthesized — no files needed)
   ============================================================ */
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

/**
 * Play a synthesized sound.
 * @param {string} type - 'brickHit'|'brickBreak'|'paddleHit'|'powerUp'|'wallHit'|
 *                        'laserFire'|'combo'|'nuke'|'rage'|'loseLife'|'levelUp'|
 *                        'bossHit'|'bulletTime'|'wormhole'|'rewind'
 */
function playSound(type) {
  try {
    ensureAudio();
    const ac = audioCtx;
    const now = ac.currentTime;

    switch (type) {

      case 'brickHit': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'square';
        o.frequency.setValueAtTime(220 + Math.random() * 160, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.08);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        o.start(now); o.stop(now + 0.08);
        break;
      }

      case 'brickBreak': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        const dist = ac.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) curve[i] = (i < 128 ? i - 128 : i - 128) / 128;
        dist.curve = curve;
        o.connect(dist); dist.connect(g); g.connect(ac.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, now);
        o.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        g.gain.setValueAtTime(0.14, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        o.start(now); o.stop(now + 0.15);
        break;
      }

      case 'paddleHit': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(440, now);
        o.frequency.exponentialRampToValueAtTime(660, now + 0.06);
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        o.start(now); o.stop(now + 0.1);
        break;
      }

      case 'wallHit': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'triangle';
        o.frequency.setValueAtTime(180, now);
        g.gain.setValueAtTime(0.06, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        o.start(now); o.stop(now + 0.07);
        break;
      }

      case 'powerUp': {
        const freqs = [523, 659, 784, 1047];
        freqs.forEach((f, i) => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.connect(g); g.connect(ac.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + i * 0.07);
          g.gain.setValueAtTime(0, now + i * 0.07);
          g.gain.linearRampToValueAtTime(0.1, now + i * 0.07 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.12);
          o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.12);
        });
        break;
      }

      case 'laserFire': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900, now);
        o.frequency.exponentialRampToValueAtTime(200, now + 0.12);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.start(now); o.stop(now + 0.12);
        break;
      }

      case 'combo': {
        const pitch = Math.min(2000, 300 + combo * 60);
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(pitch, now);
        o.frequency.exponentialRampToValueAtTime(pitch * 1.5, now + 0.08);
        g.gain.setValueAtTime(0.09, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.start(now); o.stop(now + 0.12);
        break;
      }

      case 'nuke': {
        // Big explosion sound
        const buf = ac.createBuffer(1, ac.sampleRate * 0.8, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }
        const src = ac.createBufferSource();
        const g   = ac.createGain();
        const lp  = ac.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 800;
        src.buffer = buf;
        src.connect(lp); lp.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        src.start(now);
        break;
      }

      case 'rage': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(60, now);
        o.frequency.linearRampToValueAtTime(200, now + 0.3);
        o.frequency.linearRampToValueAtTime(40, now + 0.6);
        g.gain.setValueAtTime(0.2, now);
        g.gain.linearRampToValueAtTime(0, now + 0.7);
        o.start(now); o.stop(now + 0.7);
        break;
      }

      case 'loseLife': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(440, now);
        o.frequency.linearRampToValueAtTime(110, now + 0.5);
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        o.start(now); o.stop(now + 0.5);
        break;
      }

      case 'levelUp': {
        const seq = [523, 659, 784, 1047, 1319];
        seq.forEach((f, i) => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.connect(g); g.connect(ac.destination);
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0, now + i * 0.08);
          g.gain.linearRampToValueAtTime(0.14, now + i * 0.08 + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.18);
          o.start(now + i * 0.08); o.stop(now + i * 0.08 + 0.18);
        });
        break;
      }

      case 'bossHit': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'square';
        o.frequency.setValueAtTime(80, now);
        o.frequency.exponentialRampToValueAtTime(40, now + 0.2);
        g.gain.setValueAtTime(0.2, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.start(now); o.stop(now + 0.2);
        break;
      }

      case 'bulletTime': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(800, now);
        o.frequency.exponentialRampToValueAtTime(200, now + 0.4);
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        o.start(now); o.stop(now + 0.4);
        break;
      }

      case 'wormhole': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sine';
        o.frequency.setValueAtTime(200, now);
        o.frequency.linearRampToValueAtTime(1400, now + 0.3);
        o.frequency.linearRampToValueAtTime(300, now + 0.6);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        o.start(now); o.stop(now + 0.65);
        break;
      }

      case 'rewind': {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(100, now);
        o.frequency.linearRampToValueAtTime(800, now + 0.15);
        o.frequency.linearRampToValueAtTime(100, now + 0.3);
        g.gain.setValueAtTime(0.1, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        o.start(now); o.stop(now + 0.35);
        break;
      }
    }
  } catch(e) { /* silent — audio may not be available */ }
}


/* ============================================================
   5b. HUD HELPERS
   ============================================================ */
function buildHearts() {
  livesRow.innerHTML = '';
  for (let i = 0; i < MAX_LIVES; i++) {
    const h = document.createElement('span');
    h.className = 'hrt' + (i < lives ? ' on' : '');
    h.textContent = '♥';
    livesRow.appendChild(h);
  }
}

function refreshHearts() {
  livesRow.querySelectorAll('.hrt').forEach((h, i) => {
    const on = i < lives;
    if (on && !h.classList.contains('on')) {
      h.classList.add('on', 'pop');
      setTimeout(() => h.classList.remove('pop'), 400);
    } else if (!on) {
      h.classList.remove('on');
    }
  });
}

function bumpVal(el, val) {
  el.textContent = val;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function setCombo(c) {
  combo = c;
  if (c > maxCombo) maxCombo = c;
  const display = c < 2 ? 1 : c;
  comboDisp.textContent = 'x' + display;
  const col = c >= 10 ? '#ff3d7f' : c >= 5 ? '#ffcc00' : '#00d4ff';
  comboDisp.style.color      = col;
  comboDisp.style.textShadow = `0 0 12px ${col}`;
  comboDisp.style.fontSize   = c >= 10 ? '20px' : c >= 5 ? '17px' : '13px';

  if (c > 0) {
    addRage(c >= 10 ? 8 : c >= 5 ? 4 : 1);
    playSound('combo');
  }
  if (c === 20) comboNuke();

  // Streak flash at milestones
  if (c === 5 || c === 10 || c === 15 || c === 20) {
    streakFlashTimer = 20;
    streakFlashColor = c >= 15 ? '#ff3d7f' : c >= 10 ? '#ff7c2a' : '#ffcc00';
    floatScore(W / 2, H / 2, c >= 10 ? '🔥 STREAK x' + c + '!' : 'STREAK x' + c, streakFlashColor);
  }
}

function addRage(amt) {
  rageLevel = Math.min(100, rageLevel + amt);
  rageBar.style.width      = rageLevel + '%';
  rageBar.style.background = rageLevel >= 80 ? '#ef4444'
                           : rageLevel >= 50 ? '#f97316'
                                              : '#fbbf24';
  if (rageLevel >= 100) triggerRageMode();
}

function floatScore(x, y, val, col) {
  const el = document.createElement('div');
  el.className    = 'fpop';
  el.textContent  = typeof val === 'number' ? (val > 0 ? '+' : '') + val : val;
  el.style.color  = col || 'var(--accent3)';
  el.style.left   = (x / W * 100) + '%';
  el.style.top    = (y / H * 100) + '%';
  cwrap.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function addChip(id, cls, lbl) {
  removeChip(id);
  const el = document.createElement('div');
  el.className  = 'chip ' + cls;
  el.id         = 'ch-' + id;
  el.textContent = lbl;
  bbar.appendChild(el);
}

function removeChip(id) {
  const e = document.getElementById('ch-' + id);
  if (e) e.remove();
}

function showBanner(txt, col) {
  eventBanner.textContent  = txt;
  eventBanner.style.color  = col || '#fff';
  eventBanner.style.textShadow = `0 0 20px ${col || '#fff'}`;
  eventBanner.classList.add('show');
  bannerTimer = 180;
}


/* ============================================================
   6. OVERLAY HELPERS
   ============================================================ */
function showOv(title, sub, btn, stats, col) {
  ot.textContent  = title;
  ot.style.color  = col || 'var(--accent)';
  os.innerHTML    = sub;
  obtn.textContent = btn;
  obtn.style.display = btn ? 'block' : 'none';
  if (stats) {
    ostats.style.display = 'flex';
    ostats.innerHTML = stats
      .map(s => `<div class="ostat"><div class="osl">${s.l}</div><div class="osv">${s.v}</div></div>`)
      .join('');
  } else {
    ostats.style.display = 'none';
  }
  overlay.classList.remove('hide');
  overlay.classList.add('show');
}

function hideOv() {
  overlay.classList.remove('show');
  overlay.classList.add('hide');
}


/* ============================================================
   7. BRICK GENERATION  (now with patterns!)
   ============================================================ */

/**
 * Seeded random for daily challenges
 */
function seededRand(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Pick a brick layout pattern based on level.
 * Returns a 2D boolean grid [row][col] — true = place a brick.
 */
function makeBrickPattern(rows, cols, lvl, rng) {
  const r = rng || Math.random.bind(Math);
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(true));
  const pat = (lvl - 1) % 6;

  if (pat === 0) return grid; // full grid

  if (pat === 1) {
    // Checkerboard
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++)
        grid[row][col] = (row + col) % 2 === 0;
    return grid;
  }

  if (pat === 2) {
    // Diamond / hollow diamond
    const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const d = Math.abs(col - cx) / (cols / 2) + Math.abs(row - cy) / (rows / 2);
        grid[row][col] = d <= 1.0;
      }
    return grid;
  }

  if (pat === 3) {
    // Wave: sine-based rows
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const wave = Math.sin((col / cols) * Math.PI * 2 + row * 0.8);
        grid[row][col] = wave > -0.3;
      }
    return grid;
  }

  if (pat === 4) {
    // V shape / funnel
    const cx = (cols - 1) / 2;
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const edge = Math.round((row / rows) * (cols / 2));
        grid[row][col] = col >= edge && col < cols - edge;
      }
    return grid;
  }

  if (pat === 5) {
    // Outer border + inner cross
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const border = row === 0 || row === rows - 1 || col === 0 || col === cols - 1;
        const cross  = row === Math.floor(rows / 2) || col === Math.floor(cols / 2);
        grid[row][col] = border || cross;
      }
    return grid;
  }

  return grid;
}

function makeBricks() {
  bricks    = [];
  bossActive = false;
  bossBrick  = null;

  // Every 5 levels: BOSS level (single high-HP boss + support bricks)
  if (level % 5 === 0) {
    makeBossLevel();
    return;
  }

  const COLS  = 10;
  const ROWS  = Math.min(3 + Math.floor(level / 2), 9);
  const BW = 42, BH = 15, PX = 5, PY = 5;
  const totalW = COLS * (BW + PX) - PX;
  const sx = (W - totalW) / 2;
  const sy = 42;

  const rng = dailyMode ? seededRand(dailySeed + level * 997) : null;
  const rand = rng || (() => Math.random());

  const pattern = makeBrickPattern(ROWS, COLS, level, rand);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!pattern[r][c]) continue;

      const ind      = level >= 7 && r < 1 && rand() < 0.15;
      const hp       = ind ? 999
                     : level >= 4 && r < 2 ? 3
                     : level >= 2 && r === 0 ? 2
                     : 1;
      const expl     = !ind && level >= 5 && rand() < 0.08;
      const mirror   = !ind && level >= 3 && rand() < 0.07;
      const magnetic = !ind && level >= 4 && rand() < 0.06;
      const teleport = !ind && level >= 6 && rand() < 0.05;

      bricks.push({
        x: sx + c * (BW + PX),
        y: sy + r * (BH + PY),
        w: BW, h: BH,
        hp, maxHp: hp,
        color: BCOLS[r % BCOLS.length],
        alive: true,
        shakeT: 0,
        sh: rand() * Math.PI * 2,
        pulse: rand() * Math.PI * 2,
        expl, ind, mirror, magnetic, teleport,
        isBoss: false,
      });
    }
  }
}

function makeBossLevel() {
  bossActive = true;
  const bossHp = 20 + level * 4;
  const bossW  = 160, bossH = 30;

  bossBrick = {
    x: (W - bossW) / 2,
    y: 50,
    w: bossW, h: bossH,
    hp: bossHp, maxHp: bossHp,
    color: '#ff3d7f',
    alive: true,
    shakeT: 0,
    sh: 0, pulse: 0,
    expl: false, ind: false, mirror: false, magnetic: false, teleport: false,
    isBoss: true,
    phase: 0,       // 0=normal 1=enraged (below 50% HP)
    moveDir: 1,
    moveSpd: 1.5 + level * 0.2,
  };
  bricks.push(bossBrick);

  // Support bricks around the boss
  const BW = 38, BH = 14, PX = 5;
  const cols = 8;
  const totalW = cols * (BW + PX) - PX;
  const sx = (W - totalW) / 2;

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && (c === 0 || c === cols - 1)) continue; // gaps
      bricks.push({
        x: sx + c * (BW + PX),
        y: 95 + r * (BH + PY),
        w: BW, h: BH,
        hp: 2, maxHp: 2,
        color: BCOLS[(r + 2) % BCOLS.length],
        alive: true,
        shakeT: 0, sh: Math.random() * Math.PI * 2, pulse: Math.random() * Math.PI * 2,
        expl: r === 1 && Math.random() < 0.3,
        ind: false, mirror: r === 2 && Math.random() < 0.2,
        magnetic: false, teleport: false, isBoss: false,
      });
    }
  }

  const PY = 5;
  showBanner(`⚠ BOSS LEVEL ${level} ⚠`, '#ff3d7f');
  playSound('rage');
}


/* ============================================================
   8. BALL FACTORY
   ============================================================ */
function mkBall(x, y, angle, spd) {
  spd   = spd   || (BASE_SPD + (level - 1) * 0.28);
  angle = angle != null ? angle : -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
  const skin = BALL_SKINS[activeSkin];
  return {
    x: x || paddleX,
    y: y || H - PAD_H - BALL_R - 2,
    dx: Math.cos(angle) * spd,
    dy: Math.sin(angle) * spd,
    held: true,
    trail: [],
    fire: skin.fire || fireOn,
    ghost: activeSkin === 'ghost',
    size: BALL_R,
    skin: activeSkin,
  };
}


/* ============================================================
   9. GAME INIT / RESET
   ============================================================ */
function initGame() {
  score      = 0;
  lives      = MAX_LIVES;
  level      = 1;
  combo      = 0;
  maxCombo   = 0;
  bricksDone = 0;
  sessionBricks = 0;

  paddleX = W / 2;
  paddleW = 94;

  balls        = [mkBall()];
  bricks       = [];
  parts        = [];
  pdrops       = [];
  lasers       = [];
  gravityWells = [];
  wormholes    = [];

  shieldOn    = false;
  fireOn      = false;
  ghostOn     = false;
  magnetOn    = false;
  gravFlipped = false;

  rageLevel = 0;
  rageBar.style.width = '0%';

  rewindBuffer = [];
  isRewinding  = false;

  screenShake = 0;

  bulletTime = false;
  bulletTimeFrames = 0;
  nearMissCooldown = 0;
  paddleStreakHits = 0;

  bossActive = false;
  bossBrick  = null;

  wormholeTimer  = 0;
  nextWormholeAt = 900 + Math.random() * 600;

  Object.values(ptimers).forEach(clearTimeout);
  ptimers = {};

  bbar.innerHTML    = '<span class="blab">POWER-UPS</span>';
  hvScore.textContent = '0';
  hvLevel.textContent = '1';
  setCombo(0);
  buildHearts();

  if (dailyMode) {
    const now = new Date();
    dailySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  }

  makeBricks();
}

function clearTimers() {
  Object.values(ptimers).forEach(clearTimeout);
  ptimers = {};
}


/* ============================================================
   10. PARTICLES
   ============================================================ */
function burst(x, y, color, n, big) {
  for (let i = 0; i < n; i++) {
    const a   = Math.random() * Math.PI * 2;
    const spd = big ? 2 + Math.random() * 6 : 1 + Math.random() * 3;
    parts.push({
      x, y,
      dx: Math.cos(a) * spd,
      dy: Math.sin(a) * spd,
      r: big ? 2.5 + Math.random() * 3 : 1.5 + Math.random() * 2,
      color,
      life: 1,
      decay: (big ? 0.018 : 0.035) + Math.random() * 0.02,
      sq: big && Math.random() < 0.3,
    });
  }
}

function sparks(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    parts.push({
      x, y,
      dx: Math.cos(a) * (1 + Math.random() * 4),
      dy: Math.sin(a) * (1 + Math.random() * 4),
      r: 1,
      color,
      life: 1,
      decay: 0.07 + Math.random() * 0.05,
      spark: true,
    });
  }
}


/* ============================================================
   11. POWER-UP DROP SYSTEM
   ============================================================ */
function tryDrop(x, y) {
  if (Math.random() > 0.28 + Math.min(level * 0.02, 0.12)) return;
  const t = PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)];
  pdrops.push({
    x, y,
    dy: 1.8,
    t,
    color: PU[t].color,
    label: PU[t].label,
    w: 54, h: 19,
    alive: true,
    bob: Math.random() * Math.PI * 2,
  });
}


/* ============================================================
   12. BRICK EXPLOSION
   ============================================================ */
function explodeBrick(b, chain) {
  if (!b.alive) return;
  b.alive = false;
  bricksDone++;
  sessionBricks++;

  const pts = (10 + combo * 2) * level * (chain ? 2 : 1) * (b.isBoss ? 5 : 1);
  score += pts;
  bumpVal(hvScore, score.toLocaleString());

  burst(b.x + b.w / 2, b.y + b.h / 2, b.color, b.isBoss ? 50 : 20, true);
  sparks(b.x + b.w / 2, b.y + b.h / 2, '#ffcc00', b.isBoss ? 20 : 8);
  tryDrop(b.x + b.w / 2, b.y + b.h / 2);
  addRage(b.isBoss ? 10 : 2);

  if (b.isBoss) {
    playSound('nuke');
    screenShake = 25;
    showBanner('👾 BOSS DESTROYED!', '#ff3d7f');
    // Drop lots of power-ups
    for (let i = 0; i < 5; i++) {
      setTimeout(() => tryDrop(b.x + b.w / 2 + (Math.random() - 0.5) * b.w, b.y + b.h / 2), i * 100);
    }
  }

  if (b.expl) {
    burst(b.x + b.w / 2, b.y + b.h / 2, '#ff7c2a', 25, true);
    screenShake = Math.max(screenShake, 12);
    playSound('nuke');
    for (const nb of bricks) {
      if (!nb.alive || nb.ind) continue;
      const dx2 = (nb.x + nb.w / 2) - (b.x + b.w / 2);
      const dy2 = (nb.y + nb.h / 2) - (b.y + b.h / 2);
      if (Math.hypot(dx2, dy2) < 72) {
        setTimeout(() => explodeBrick(nb, true), 80 + Math.random() * 100);
      }
    }
  }
}


/* ============================================================
   13. COMBO NUKE
   ============================================================ */
function comboNuke() {
  showBanner('⚡ COMBO NUKE ⚡', '#ff3d7f');
  screenShake = 20;
  playSound('nuke');

  const cx = W / 2, cy = H * 0.3;
  burst(cx, cy, '#ff3d7f', 80, true);
  burst(cx, cy, '#ffcc00', 40, true);

  for (const b of bricks) {
    if (!b.alive || b.ind) continue;
    const dist = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
    if (dist < 180) {
      setTimeout(() => {
        if (b.alive) { burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 12, false); explodeBrick(b, true); }
      }, dist * 2);
    }
  }

  rageLevel = 0;
  rageBar.style.width = '0%';
}


/* ============================================================
   14. RAGE MODE
   ============================================================ */
function triggerRageMode() {
  if (gstate !== 'play') return;
  showBanner('🔥 RAGE MODE 🔥', '#ef4444');
  playSound('rage');
  rageLevel = 0;
  rageBar.style.width = '0%';

  const prevFire = fireOn;
  fireOn = true;

  balls.forEach(b => {
    b.fire = true;
    b.size = BALL_R * 1.4;
    const spd = Math.hypot(b.dx, b.dy);
    b.dx = b.dx / spd * (spd * 1.3);
    b.dy = b.dy / spd * (spd * 1.3);
  });

  screenShake = 8;
  addChip('rage', 'rage', 'RAGE MODE');
  clearTimeout(ptimers.rage);
  ptimers.rage = setTimeout(() => {
    if (!fireOn || prevFire === false) {
      fireOn = false;
      balls.forEach(b => { b.fire = false; b.size = BALL_R; });
    }
    removeChip('rage');
  }, 6000);
}


/* ============================================================
   15. GRAVITY WELL
   ============================================================ */
function spawnGravityWell(x, y, flips) {
  const life = 400;
  gravityWells.push({
    x:        x || Math.random() * (W - 100) + 50,
    y:        y || (Math.random() * (H * 0.55) + 30),
    r:        50,
    strength: flips ? -0.6 : 0.5,
    life,
    maxLife:  life,
    color:    flips ? '#00ff9d' : '#c084fc',
    flips:    !!flips,
  });
  if (!flips) addChip('gravity', 'gravity', 'GRAVITY WELL');
}


/* ============================================================
   16. WORMHOLES
   ============================================================ */
function spawnWormhole() {
  wormholes = wormholes.filter(w => w.life > 0);
  if (wormholes.length >= 1) return;

  const life   = 700;
  const margin = 70;
  let ax, ay, bx, by, tries = 0;
  do {
    ax = margin + Math.random() * (W - margin * 2);
    ay = 100    + Math.random() * (H * 0.45);
    bx = margin + Math.random() * (W - margin * 2);
    by = 100    + Math.random() * (H * 0.45);
    tries++;
  } while (Math.hypot(bx - ax, by - ay) < 120 && tries < 20);

  wormholes.push({
    ax, ay, bx, by,
    r: 24,
    life, maxLife: life,
    cooldownA: 0, cooldownB: 0,
    spin: 0,
  });

  playSound('wormhole');
  showBanner('🌀 WORMHOLE OPENED', '#00d4ff');
}


/* ============================================================
   17. TIME REWIND
   ============================================================ */
function captureSnapshot() {
  if (isRewinding) return;
  rewindBuffer.push({
    balls:  balls.map(b  => ({ ...b,  trail: [...b.trail] })),
    bricks: bricks.map(b => ({ ...b })),
    parts:  parts.slice(-30).map(p => ({ ...p })),
    paddleX,
    score,
    lives,
    combo,
  });
  if (rewindBuffer.length > 120) rewindBuffer.shift();
}

function doRewind() {
  if (rewindBuffer.length < 5) return;
  isRewinding = true;
  addChip('rewind', 'rewind', 'REWINDING');
  showBanner('⏪ TIME REWIND ⏪', '#fb923c');
  playSound('rewind');

  let rewindFrames = 0;
  const rewindInterval = setInterval(() => {
    if (rewindBuffer.length === 0 || rewindFrames > 60) {
      clearInterval(rewindInterval);
      isRewinding = false;
      removeChip('rewind');
      return;
    }
    const snap = rewindBuffer.pop();
    balls   = snap.balls.map(b  => ({ ...b,  trail: [...b.trail] }));
    bricks  = snap.bricks.map(b => ({ ...b }));
    parts   = snap.parts.map(p  => ({ ...p }));
    paddleX = snap.paddleX;

    for (let i = 0; i < 3; i++) sparks(Math.random() * W, Math.random() * H, '#fb923c', 2);
    rewindFrames++;
  }, 16);
}


/* ============================================================
   18. GRAVITY FLIP
   ============================================================ */
function flipGravity() {
  gravFlipped = !gravFlipped;
  showBanner(
    gravFlipped ? '⬆ GRAVITY FLIPPED ⬆' : '⬇ GRAVITY RESTORED ⬇',
    gravFlipped ? '#00ff9d' : '#00d4ff'
  );
  balls.forEach(b => { b.dy = -b.dy * 0.8; });
  screenShake = 6;
}


/* ============================================================
   19. POWER-UP ACTIVATION
   ============================================================ */
function activate(t) {
  playSound('powerUp');

  if (t === 'wide') {
    paddleW = Math.min(160, paddleW + 38);
    addChip('wide', 'wide', 'WIDE PAD');
    clearTimeout(ptimers.wide);
    ptimers.wide = setTimeout(() => { paddleW = Math.max(94, paddleW - 38); removeChip('wide'); }, 9000);
  }

  if (t === 'multi') {
    const src = balls[0] || { x: paddleX, y: H - PAD_H - BALL_R - 10, dx: 3, dy: -3 };
    for (let i = 0; i < 2 && balls.length < MAX_BALLS; i++) {
      const b = mkBall(src.x, src.y, Math.random() * Math.PI * 2,
                       Math.max(3, Math.hypot(src.dx || 3, src.dy || 3)));
      b.held = false;
      balls.push(b);
    }
    addChip('multi', 'multi', 'MULTIBALL');
    clearTimeout(ptimers.multi);
    ptimers.multi = setTimeout(() => removeChip('multi'), 3000);
  }

  if (t === 'slow') {
    balls.forEach(b => {
      const s = Math.hypot(b.dx, b.dy);
      const f = Math.max(2, s * 0.55) / s;
      b.dx *= f; b.dy *= f;
    });
    addChip('slow', 'slow', 'SLOW MO');
    clearTimeout(ptimers.slow);
    ptimers.slow = setTimeout(() => {
      const tgt = BASE_SPD + (level - 1) * 0.28;
      balls.forEach(b => {
        const s = Math.hypot(b.dx, b.dy);
        if (s > 0.1) { b.dx = b.dx / s * tgt; b.dy = b.dy / s * tgt; }
      });
      removeChip('slow');
    }, 7000);
  }

  if (t === 'laser') {
    addChip('laser', 'laser', 'LASER x5');
    let shots = 5;
    const shoot = () => {
      if (shots <= 0 || gstate !== 'play') { removeChip('laser'); return; }
      fireLaser();
      shots--;
      ptimers.lrep = setTimeout(shoot, 550);
    };
    setTimeout(shoot, 150);
  }

  if (t === 'shield') {
    shieldOn = true;
    addChip('shield', 'shield', 'SHIELD');
    clearTimeout(ptimers.shield);
    ptimers.shield = setTimeout(() => { shieldOn = false; removeChip('shield'); }, 12000);
  }

  if (t === 'life') {
    if (lives < MAX_LIVES) { lives++; refreshHearts(); }
    burst(paddleX, H - PAD_H, '#ff6b6b', 20, true);
    addChip('life', 'life', '+1 LIFE');
    clearTimeout(ptimers.life);
    ptimers.life = setTimeout(() => removeChip('life'), 2000);
  }

  if (t === 'fire') {
    fireOn = true;
    balls.forEach(b => b.fire = true);
    addChip('fire', 'fire', 'FIREBALL');
    clearTimeout(ptimers.fire);
    ptimers.fire = setTimeout(() => {
      fireOn = false;
      balls.forEach(b => { b.fire = false; });
      removeChip('fire');
    }, 8000);
  }

  if (t === 'gravity') {
    spawnGravityWell();
    clearTimeout(ptimers.gravity);
    ptimers.gravity = setTimeout(() => removeChip('gravity'), 7000);
  }

  if (t === 'ghost') {
    ghostOn = true;
    balls.forEach(b => b.ghost = true);
    addChip('ghost', 'ghost', 'GHOST BALL');
    showBanner('👻 GHOST MODE', '#94a3b8');
    clearTimeout(ptimers.ghost);
    ptimers.ghost = setTimeout(() => {
      ghostOn = false;
      balls.forEach(b => b.ghost = false);
      removeChip('ghost');
    }, 6000);
  }

  if (t === 'magnet') {
    magnetOn = true;
    addChip('magnet', 'magnet', 'BRICK MAGNET');
    showBanner('🧲 MAGNET ACTIVE', '#f472b6');
    clearTimeout(ptimers.magnet);
    ptimers.magnet = setTimeout(() => { magnetOn = false; removeChip('magnet'); }, 8000);
  }

  if (t === 'rewind') doRewind();
}


/* ============================================================
   20. LASER FIRE
   ============================================================ */
function fireLaser() {
  lasers.push({ x: paddleX - 7, y: H - PAD_H - 2, dy: -15, alive: true, w: 3, h: 14 });
  lasers.push({ x: paddleX + 4, y: H - PAD_H - 2, dy: -15, alive: true, w: 3, h: 14 });
  sparks(paddleX, H - PAD_H, '#ffcc00', 5);
  playSound('laserFire');
}


/* ============================================================
   21. COLLISION HELPERS
   ============================================================ */
function circRect(bx, by, br, rx, ry, rw, rh) {
  const cx = Math.max(rx, Math.min(bx, rx + rw));
  const cy = Math.max(ry, Math.min(by, ry + rh));
  return (bx - cx) ** 2 + (by - cy) ** 2 < br * br;
}

function hitSide(bx, by, rx, ry, rw, rh) {
  const oL = bx - rx,       oR = (rx + rw) - bx;
  const oT = by - ry,       oB = (ry + rh) - by;
  return Math.min(oL, oR) < Math.min(oT, oB)
    ? (oL < oR ? 'left' : 'right')
    : (oT < oB ? 'top'  : 'bottom');
}


/* ============================================================
   22. MAGNETISM
   ============================================================ */
function applyMagnetism() {
  if (!magnetOn) return;
  for (const b of bricks) {
    if (!b.alive || b.ind) continue;
    for (const ball of balls) {
      if (ball.held) continue;
      const dx   = (b.x + b.w / 2) - ball.x;
      const dy   = (b.y + b.h / 2) - ball.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 120 && dist > 0) {
        const force = 0.08 * (1 - dist / 120);
        ball.dx += dx / dist * force;
        ball.dy += dy / dist * force;
      }
    }
  }
}


/* ============================================================
   22b. BULLET TIME (auto near-miss)
   ============================================================ */
function checkBulletTime() {
  if (bulletTime || nearMissCooldown > 0) return;
  for (const ball of balls) {
    if (ball.held) continue;
    const padY  = gravFlipped ? PAD_H : H - PAD_H;
    const distY = Math.abs(ball.y - padY);
    const padX  = paddleX - paddleW / 2;
    const inX   = ball.x > padX - 30 && ball.x < padX + paddleW + 30;
    // Near miss = ball close to paddle edge AND moving toward it
    const movingToPad = gravFlipped ? ball.dy < 0 : ball.dy > 0;
    if (distY < 35 && distY > 14 && inX && movingToPad) {
      triggerBulletTime();
      return;
    }
  }
}

function triggerBulletTime() {
  bulletTime = true;
  bulletTimeFrames = 90; // ~1.5 seconds at normal speed
  playSound('bulletTime');
  showBanner('⚡ BULLET TIME ⚡', '#00ff9d');
  addChip('bullet', 'slow', 'BULLET TIME');
  nearMissCooldown = 300;
}


/* ============================================================
   22c. TRAJECTORY PREVIEW
   ============================================================ */
function getTrajectoryPoints(ball) {
  const pts = [];
  let x = ball.x, y = ball.y;
  let dx = ball.dx, dy = ball.dy;
  const ballR = ball.size || BALL_R;
  const steps = 60;

  for (let i = 0; i < steps; i++) {
    x += dx;
    y += dy;

    if (x - ballR < 0)   { x = ballR;     dx = Math.abs(dx); }
    if (x + ballR > W)   { x = W - ballR; dx = -Math.abs(dx); }
    if (y - ballR < 0)   { y = ballR;     dy = Math.abs(dy); break; }
    if (y + ballR > H)   break;

    pts.push({ x, y });

    // Stop at first brick hit
    for (const br of bricks) {
      if (!br.alive || br.ind) continue;
      if (circRect(x, y, ballR, br.x, br.y, br.w, br.h)) {
        return { pts, hit: { x: br.x + br.w/2, y: br.y + br.h/2 } };
      }
    }
  }
  return { pts, hit: null };
}


/* ============================================================
   23. UPDATE LOOP
   ============================================================ */
function update() {
  if (gstate !== 'play' || isRewinding) return;
  frame++;

  // Bullet time slows everything
  const speedMul = bulletTime ? 0.35 : 1.0;
  if (bulletTime) {
    bulletTimeFrames--;
    if (bulletTimeFrames <= 0) {
      bulletTime = false;
      removeChip('bullet');
    }
  }
  if (nearMissCooldown > 0) nearMissCooldown--;

  // Banner countdown
  if (bannerTimer > 0) {
    bannerTimer--;
    if (bannerTimer === 0) eventBanner.classList.remove('show');
  }

  // Streak flash countdown
  if (streakFlashTimer > 0) streakFlashTimer--;

  // Wormhole auto-spawn
  wormholeTimer++;
  if (wormholeTimer >= nextWormholeAt) {
    spawnWormhole();
    wormholeTimer  = 0;
    nextWormholeAt = 1200 + Math.random() * 800;
  }

  gravityWells = gravityWells.filter(g => { g.life--; return g.life > 0; });
  wormholes    = wormholes.filter(w => {
    w.life--;
    w.spin     += 0.04 * speedMul;
    w.cooldownA = Math.max(0, w.cooldownA - 1);
    w.cooldownB = Math.max(0, w.cooldownB - 1);
    return w.life > 0;
  });

  if (frame % 4 === 0) captureSnapshot();

  if (screenShake > 0) screenShake -= 0.8;

  // Boss brick movement
  if (bossActive && bossBrick && bossBrick.alive) {
    bossBrick.x += bossBrick.moveDir * bossBrick.moveSpd * speedMul;
    if (bossBrick.x < 20 || bossBrick.x + bossBrick.w > W - 20) {
      bossBrick.moveDir *= -1;
    }
    // Boss enrage at 50% HP
    if (bossBrick.hp < bossBrick.maxHp * 0.5 && bossBrick.phase === 0) {
      bossBrick.phase = 1;
      bossBrick.moveSpd *= 1.8;
      bossBrick.color = '#ff7c2a';
      showBanner('⚠ BOSS ENRAGED ⚠', '#ff7c2a');
      playSound('rage');
    }
  }

  // Keyboard paddle
  const PSPD = 7;
  if (keys2['ArrowLeft']  || keys2['a'] || keys2['A'])
    paddleX = Math.max(paddleW / 2, paddleX - PSPD);
  if (keys2['ArrowRight'] || keys2['d'] || keys2['D'])
    paddleX = Math.min(W - paddleW / 2, paddleX + PSPD);
  paddleX = Math.max(paddleW / 2, Math.min(W - paddleW / 2, paddleX));

  // Lasers
  for (const l of lasers) {
    if (!l.alive) continue;
    l.y += l.dy * speedMul;
    if (l.y + l.h < 0 || l.y > H) { l.alive = false; continue; }
    for (const br of bricks) {
      if (!br.alive) continue;
      if (l.x < br.x + br.w && l.x + l.w > br.x &&
          l.y < br.y + br.h && l.y + l.h > br.y) {
        l.alive = false;
        if (!br.ind) {
          br.hp--;
          br.shakeT = 4;
          sparks(l.x, br.y + br.h / 2, '#ffcc00', 5);
          playSound('brickHit');
          if (br.hp <= 0) {
            explodeBrick(br, false);
            playSound('brickBreak');
            floatScore(br.x + br.w / 2, br.y, (10 + combo * 2) * level, '#ffcc00');
          }
        }
        break;
      }
    }
  }
  lasers = lasers.filter(l => l.alive);

  applyMagnetism();
  checkBulletTime();

  // ================================================================
  // BALL LOOP
  // ================================================================
  const toRemove = [];

  for (let bi = 0; bi < balls.length; bi++) {
    const ball  = balls[bi];
    const ballR = ball.size || BALL_R;

    if (ball.held) {
      ball.x = paddleX;
      ball.y = gravFlipped ? (PAD_H + ballR + 1) : (H - PAD_H - ballR - 1);
      continue;
    }

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 12) ball.trail.shift();

    ball.x += ball.dx * speedMul;
    ball.y += ball.dy * speedMul;

    // Gravity wells
    for (const gw of gravityWells) {
      const dx   = gw.x - ball.x;
      const dy   = gw.y - ball.y;
      const dist = Math.hypot(dx, dy);
      if (dist < gw.r * 2 && dist > 1) {
        const force = gw.strength * (1 - dist / (gw.r * 2));
        ball.dx += dx / dist * force;
        ball.dy += dy / dist * force;
      }
    }

    // Wormhole teleportation
    for (const wh of wormholes) {
      const da = Math.hypot(ball.x - wh.ax, ball.y - wh.ay);
      const db = Math.hypot(ball.x - wh.bx, ball.y - wh.by);

      if (da < wh.r && wh.cooldownA === 0) {
        const exitAngle = Math.atan2(ball.dy, ball.dx);
        ball.x = wh.bx + Math.cos(exitAngle) * (wh.r + ballR + 4);
        ball.y = wh.by + Math.sin(exitAngle) * (wh.r + ballR + 4);
        burst(wh.ax, wh.ay, '#00d4ff', 15, false);
        burst(wh.bx, wh.by, '#a78bfa', 15, false);
        wh.cooldownA = 90; wh.cooldownB = 90;
        screenShake = 5;
        score += 500;
        bumpVal(hvScore, score.toLocaleString());
        floatScore(wh.bx, wh.by, 500, '#00d4ff');
        playSound('wormhole');
        break;
      } else if (db < wh.r && wh.cooldownB === 0) {
        const exitAngle = Math.atan2(ball.dy, ball.dx);
        ball.x = wh.ax + Math.cos(exitAngle) * (wh.r + ballR + 4);
        ball.y = wh.ay + Math.sin(exitAngle) * (wh.r + ballR + 4);
        burst(wh.bx, wh.by, '#00d4ff', 15, false);
        burst(wh.ax, wh.ay, '#a78bfa', 15, false);
        wh.cooldownA = 90; wh.cooldownB = 90;
        screenShake = 5;
        score += 500;
        bumpVal(hvScore, score.toLocaleString());
        floatScore(wh.ax, wh.ay, 500, '#00d4ff');
        playSound('wormhole');
        break;
      }
    }

    // Speed cap
    const spd    = Math.hypot(ball.dx, ball.dy);
    const maxSpd = BASE_SPD + (level - 1) * 0.28 + 5;
    if (spd > maxSpd) { ball.dx = ball.dx / spd * maxSpd; ball.dy = ball.dy / spd * maxSpd; }
    if (spd < 2)      { ball.dx = ball.dx / spd * 2;      ball.dy = ball.dy / spd * 2; }

    // Wall bounces
    if (ball.x - ballR < 0) {
      ball.x  = ballR; ball.dx = Math.abs(ball.dx);
      sparks(ball.x, ball.y, '#00d4ff', 3);
      playSound('wallHit');
    } else if (ball.x + ballR > W) {
      ball.x  = W - ballR; ball.dx = -Math.abs(ball.dx);
      sparks(ball.x, ball.y, '#00d4ff', 3);
      playSound('wallHit');
    }
    if (ball.y - ballR < 0) {
      ball.y  = ballR; ball.dy = Math.abs(ball.dy);
      sparks(ball.x, ball.y, '#00d4ff', 3);
      playSound('wallHit');
    }

    // Paddle collision
    const padX = paddleX - paddleW / 2;
    const skin = BALL_SKINS[ball.skin] || BALL_SKINS.plasma;

    if (!gravFlipped) {
      const padY = H - PAD_H;
      if (ball.dy > 0 &&
          ball.y + ballR >= padY &&
          ball.y - ballR <= padY + PAD_H &&
          ball.x >= padX - ballR &&
          ball.x <= padX + paddleW + ballR) {
        const hitPos  = (ball.x - paddleX) / (paddleW / 2);
        const angle   = hitPos * (Math.PI / 3.2);
        const newSpd  = Math.min(maxSpd, spd * 1.015);
        ball.dx = Math.sin(angle) * newSpd;
        ball.dy = -Math.abs(Math.cos(angle) * newSpd);
        ball.y  = padY - ballR - 1;
        sparks(ball.x, padY, skin.glow, 5);
        setCombo(combo + 1);
        playSound('paddleHit');
        paddleStreakHits++;
        // Near miss badge
        if (ball.y + ballR > padY - 6) {
          floatScore(ball.x, padY - 20, 'NEAR MISS! +100', '#00ff9d');
          score += 100;
          bumpVal(hvScore, score.toLocaleString());
        }
      }
    } else {
      if (ball.dy < 0 &&
          ball.y - ballR <= PAD_H &&
          ball.y + ballR >= 0 &&
          ball.x >= padX - ballR &&
          ball.x <= padX + paddleW + ballR) {
        const hitPos = (ball.x - paddleX) / (paddleW / 2);
        const angle  = hitPos * (Math.PI / 3.2);
        const newSpd = Math.min(maxSpd, spd * 1.015);
        ball.dx = Math.sin(angle) * newSpd;
        ball.dy = Math.abs(Math.cos(angle) * newSpd);
        ball.y  = PAD_H + ballR + 1;
        sparks(ball.x, PAD_H, skin.glow, 5);
        setCombo(combo + 1);
        playSound('paddleHit');
      }
    }

    // Ball lost
    const ballLost = gravFlipped ? (ball.y + ballR < -30) : (ball.y - ballR > H + 30);

    if (ballLost) {
      if (balls.length > 1) { toRemove.push(bi); continue; }

      if (shieldOn) {
        ball.y  = gravFlipped ? (PAD_H + ballR + 2) : (H - PAD_H - ballR - 2);
        ball.dy = gravFlipped ? Math.abs(ball.dy) : -Math.abs(ball.dy);
        shieldOn = false;
        removeChip('shield');
        burst(ball.x, gravFlipped ? 20 : H - 20, '#a78bfa', 20, true);
      } else {
        lives--;
        refreshHearts();
        setCombo(0);
        paddleStreakHits = 0;
        playSound('loseLife');

        if (lives <= 0) {
          gstate = 'over';
          if (score > best) { best = score; hvBest.textContent = best.toLocaleString(); }
          showOv('GAME OVER', '', 'PLAY AGAIN', [
            { l: 'Score',      v: score.toLocaleString() },
            { l: 'Level',      v: level },
            { l: 'Best Combo', v: 'x' + maxCombo },
            { l: 'Bricks',     v: bricksDone },
          ], 'var(--accent2)');
          return;
        }

        ball.x    = paddleX;
        ball.y    = gravFlipped ? (PAD_H + ballR + 2) : (H - PAD_H - ballR - 2);
        ball.held  = true;
        ball.trail = [];
      }
      continue;
    }

    // ================================================================
    // BRICK COLLISIONS
    // ================================================================
    for (const br of bricks) {
      if (!br.alive) continue;
      if (!circRect(ball.x, ball.y, ballR, br.x, br.y, br.w, br.h)) continue;

      if (br.mirror) {
        const angle2 = Math.random() * Math.PI * 2;
        const spd2   = Math.hypot(ball.dx, ball.dy);
        ball.dx = Math.cos(angle2) * spd2;
        ball.dy = Math.sin(angle2) * spd2;
        sparks(ball.x, ball.y, '#f0abfc', 8);
        burst(br.x + br.w / 2, br.y + br.h / 2, '#f0abfc', 8, false);
        br.hp--; br.shakeT = 8;
        playSound('brickHit');
        if (br.hp <= 0) { explodeBrick(br, false); playSound('brickBreak'); }
        break;
      }

      if (br.teleport) {
        ball.x = Math.random() * (W - 100) + 50;
        ball.y = Math.random() * (H * 0.4) + 50;
        burst(ball.x, ball.y, '#fbbf24', 15, false);
        sparks(br.x + br.w / 2, br.y + br.h / 2, '#fbbf24', 10);
        br.hp--; br.shakeT = 6;
        if (br.hp <= 0) { explodeBrick(br, false); playSound('brickBreak'); }
        showBanner('🌀 TELEPORTED!', '#fbbf24');
        screenShake = 4;
        playSound('wormhole');
        break;
      }

      if (br.ind) {
        const s = hitSide(ball.x, ball.y, br.x, br.y, br.w, br.h);
        if (s === 'left' || s === 'right') { ball.dx = -ball.dx; ball.x += ball.dx > 0 ? 2 : -2; }
        else { ball.dy = -ball.dy; ball.y += ball.dy > 0 ? 2 : -2; }
        sparks(ball.x, ball.y, '#a78bfa', 4);
        playSound('brickHit');
        break;
      }

      if (ball.ghost) {
        if (!br.ind) {
          br.hp--; br.shakeT = 6;
          sparks(ball.x, ball.y, br.color, 5);
          playSound('brickHit');
          if (br.hp <= 0) {
            const pts = (10 + combo * 2) * level;
            score += pts; bricksDone++; sessionBricks++;
            bumpVal(hvScore, score.toLocaleString());
            floatScore(br.x + br.w / 2, br.y, pts);
            explodeBrick(br, false);
            playSound('brickBreak');
          }
        }
        continue;
      }

      // Boss brick special hit
      if (br.isBoss) {
        br.hp -= ball.fire ? br.maxHp : 1;
        br.shakeT = 8;
        sparks(ball.x, ball.y, br.color, 8);
        playSound('bossHit');
        screenShake = Math.max(screenShake, 6);
        floatScore(br.x + br.w / 2, br.y, (50 + combo * 5) * level, '#ff3d7f');
        score += (50 + combo * 5) * level;
        bumpVal(hvScore, score.toLocaleString());

        if (br.hp <= 0) {
          explodeBrick(br, false);
          playSound('nuke');
        } else {
          // Bounce off boss
          const s = hitSide(ball.x, ball.y, br.x, br.y, br.w, br.h);
          if (s === 'left' || s === 'right') { ball.dx = -ball.dx; ball.x += ball.dx > 0 ? 3 : -3; }
          else { ball.dy = -ball.dy; ball.y += ball.dy > 0 ? 3 : -3; }
        }
        break;
      }

      // Normal brick
      br.hp    -= ball.fire ? br.maxHp : 1;
      br.shakeT = 6;
      sparks(ball.x, ball.y, br.color, 5);
      playSound('brickHit');

      if (br.hp <= 0) {
        explodeBrick(br, false);
        playSound('brickBreak');
        floatScore(br.x + br.w / 2, br.y, (10 + combo * 2) * level);
      } else {
        tryDrop(br.x + br.w / 2, br.y + br.h / 2);
      }

      if (!ball.fire) {
        const s = hitSide(ball.x, ball.y, br.x, br.y, br.w, br.h);
        if (s === 'left' || s === 'right') { ball.dx = -ball.dx; ball.x += ball.dx > 0 ? 2 : -2; }
        else { ball.dy = -ball.dy; ball.y += ball.dy > 0 ? 2 : -2; }
      }
      break;
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) balls.splice(toRemove[i], 1);

  // Power-up drops
  const catchY  = gravFlipped ? 0 : H - PAD_H;
  const catchX1 = paddleX - paddleW / 2;
  const catchX2 = paddleX + paddleW / 2;

  for (const p of pdrops) {
    if (!p.alive) continue;
    p.y  += (gravFlipped ? -p.dy : p.dy) * speedMul;
    p.bob += 0.08;
    if (Math.abs(p.y - catchY) < p.h && p.x + p.w / 2 >= catchX1 && p.x - p.w / 2 <= catchX2) {
      p.alive = false;
      burst(p.x, p.y, p.color, 16, true);
      activate(p.t);
    }
    if (p.y > H + 30 || p.y < -30) p.alive = false;
  }
  pdrops = pdrops.filter(p => p.alive);

  // Particles
  for (const p of parts) {
    p.x += p.dx * speedMul;
    p.y += p.dy * speedMul;
    if (!p.spark) p.dy += 0.08;
    p.life -= p.decay;
  }
  parts = parts.filter(p => p.life > 0);

  for (const br of bricks) {
    if (br.shakeT > 0) br.shakeT--;
    if (br.alive) { br.sh += 0.025; br.pulse += 0.05; }
  }

  if (score > best) { best = score; hvBest.textContent = best.toLocaleString(); }

  // Level clear
  if (bricks.every(b => !b.alive || b.ind) && gstate === 'play') {
    level++;
    hvLevel.textContent = level;
    setCombo(0);
    gstate = 'levelup';
    clearTimers();
    playSound('levelUp');

    bbar.innerHTML = '<span class="blab">POWER-UPS</span>';
    balls        = [mkBall()];
    pdrops       = [];
    lasers       = [];
    shieldOn     = false;
    fireOn       = false;
    ghostOn      = false;
    magnetOn     = false;
    gravityWells = [];
    wormholes    = [];
    gravFlipped  = false;

    makeBricks();

    if (level >= 3) setTimeout(() => { if (gstate === 'play') spawnWormhole(); }, 2000);

    showOv('LEVEL ' + level, 'Get ready…', '', null, 'var(--accent)');
    obtn.style.display = 'none';
    setTimeout(() => { hideOv(); gstate = 'play'; }, 1800);
  }
}


/* ============================================================
   24. RENDER LOOP
   ============================================================ */
function render() {
  ctx.save();

  if (screenShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * screenShake,
      (Math.random() - 0.5) * screenShake
    );
  }

  ctx.clearRect(-10, -10, W + 20, H + 20);
  ctx.fillStyle = '#04050d';
  ctx.fillRect(-10, -10, W + 20, H + 20);

  // CRT scanlines
  ctx.save();
  ctx.globalAlpha = 0.012;
  for (let y = 0; y < H; y += 3) { ctx.fillStyle = '#000'; ctx.fillRect(0, y, W, 1); }
  ctx.restore();

  // Rage mode red tint
  if (rageLevel >= 80) {
    ctx.save();
    ctx.globalAlpha = (rageLevel - 80) / 200;
    ctx.fillStyle   = '#ef4444';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Bullet time tint
  if (bulletTime) {
    ctx.save();
    ctx.globalAlpha = 0.06 + 0.04 * Math.sin(frame * 0.3);
    ctx.fillStyle   = '#00ff9d';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Streak flash
  if (streakFlashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = (streakFlashTimer / 20) * 0.15;
    ctx.fillStyle   = streakFlashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // --- Gravity wells ---
  for (const gw of gravityWells) {
    const alpha = gw.life / gw.maxLife;
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.08);
    ctx.save();
    ctx.globalAlpha = alpha * 0.3 * pulse;
    const grad = ctx.createRadialGradient(gw.x, gw.y, 0, gw.x, gw.y, gw.r * 2);
    grad.addColorStop(0, gw.color); grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(gw.x, gw.y, gw.r * 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    for (let ri = 0; ri < 3; ri++) {
      const ringAngle = frame * 0.02 * (ri % 2 === 0 ? 1 : -1);
      ctx.save();
      ctx.globalAlpha = alpha * (0.6 - ri * 0.15);
      ctx.setLineDash([4, 6 + ri * 3]);
      ctx.strokeStyle = gw.color; ctx.lineWidth = 1.5;
      ctx.translate(gw.x, gw.y); ctx.rotate(ringAngle);
      ctx.beginPath(); ctx.arc(0, 0, gw.r * (0.5 + ri * 0.25), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle   = gw.color;
    ctx.font        = 'bold 8px Orbitron,monospace';
    ctx.textAlign   = 'center';
    ctx.fillText(gw.flips ? 'REPULSOR' : 'GRAVITY', gw.x, gw.y + 4);
    ctx.restore();
  }

  // --- Wormholes ---
  for (const wh of wormholes) {
    const age   = wh.maxLife - wh.life;
    const alpha = Math.min(1, age < 60 ? age / 60 : wh.life < 60 ? wh.life / 60 : 1);
    const pulse = 0.7 + 0.3 * Math.sin(frame * 0.1);
    for (const [wx, wy] of [[wh.ax, wh.ay], [wh.bx, wh.by]]) {
      ctx.save();
      ctx.translate(wx, wy); ctx.rotate(wh.spin);
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.globalAlpha = alpha * (0.8 - i * 0.15) * pulse;
        ctx.strokeStyle = i % 2 === 0 ? '#00d4ff' : '#a78bfa';
        ctx.lineWidth   = 1.5 - i * 0.3;
        ctx.beginPath(); ctx.arc(0, 0, wh.r * (1 - i * 0.2), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = alpha * 0.9;
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, wh.r * 0.5);
      g2.addColorStop(0, '#a78bfa'); g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(0, 0, wh.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = alpha * 0.15;
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1; ctx.setLineDash([3, 8]);
    ctx.beginPath(); ctx.moveTo(wh.ax, wh.ay); ctx.lineTo(wh.bx, wh.by); ctx.stroke();
    ctx.restore();
  }

  // --- Boss HP bar ---
  if (bossActive && bossBrick && bossBrick.alive) {
    const bpct = bossBrick.hp / bossBrick.maxHp;
    const bw   = bossBrick.w;
    const bx   = bossBrick.x;
    const by   = bossBrick.y - 12;
    const col  = bpct > 0.5 ? '#ff3d7f' : '#ff7c2a';

    ctx.save();
    // Background
    ctx.globalAlpha = 0.5;
    ctx.fillStyle   = '#000';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 7, 3); ctx.fill();
    // Fill
    ctx.globalAlpha = 1;
    ctx.fillStyle   = col;
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.roundRect(bx, by, bw * bpct, 7, 3); ctx.fill();
    // Label
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 7px Orbitron,monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('BOSS', bx + bw / 2, by - 2);
    ctx.restore();
  }

  // --- Bricks ---
  for (const br of bricks) {
    if (!br.alive) continue;
    const ox    = br.shakeT > 0 ? (Math.random() - 0.5) * 4 : 0;
    const alpha = br.ind ? 0.85 : 0.25 + 0.75 * (br.hp / br.maxHp);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(br.x + ox, br.y, br.w, br.h, br.isBoss ? 6 : 3);

    if (br.isBoss) {
      // Boss: animated gradient fill
      const pulse = 0.6 + 0.4 * Math.sin(frame * 0.1 + br.pulse);
      const grad  = ctx.createLinearGradient(br.x, br.y, br.x + br.w, br.y + br.h);
      grad.addColorStop(0, br.color);
      grad.addColorStop(0.5, '#ff7c2a');
      grad.addColorStop(1, br.color);
      ctx.fillStyle   = grad;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = br.color; ctx.shadowBlur = 12 * pulse;
      ctx.fill(); ctx.stroke();
      // Boss label
      ctx.globalAlpha  = pulse;
      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold 9px Orbitron,monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur   = 0;
      ctx.fillText('BOSS', br.x + ox + br.w / 2, br.y + br.h / 2);

    } else if (br.mirror) {
      ctx.fillStyle = 'rgba(240,171,252,0.1)'; ctx.strokeStyle = '#f0abfc'; ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(br.pulse); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(br.x + ox + 4, br.y + 4); ctx.lineTo(br.x + ox + br.w - 4, br.y + br.h - 4); ctx.stroke();
      ctx.restore();

    } else if (br.teleport) {
      ctx.fillStyle = 'rgba(251,191,36,0.08)'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(br.pulse);
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⬡', br.x + ox + br.w / 2, br.y + br.h / 2); ctx.restore();

    } else if (br.magnetic) {
      ctx.fillStyle = 'rgba(244,114,182,0.08)'; ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(br.pulse * 1.5);
      ctx.fillStyle = '#f472b6'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('◈', br.x + ox + br.w / 2, br.y + br.h / 2); ctx.restore();

    } else if (br.ind) {
      ctx.fillStyle = 'rgba(167,139,250,0.08)'; ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.25; ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 0.5; ctx.setLineDash([3, 4]);
      ctx.strokeRect(br.x + ox + 3, br.y + 3, br.w - 6, br.h - 6); ctx.setLineDash([]);

    } else {
      ctx.fillStyle = br.color + '1e'; ctx.strokeStyle = br.color; ctx.lineWidth = 1;
      ctx.fill(); ctx.stroke();
      if (br.expl) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(br.sh);
        ctx.fillStyle = '#ff7c2a'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✦', br.x + ox + br.w / 2, br.y + br.h / 2);
      }
      if (br.maxHp > 1 && br.hp < br.maxHp) {
        ctx.globalAlpha = 0.4; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8; ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(br.x + ox + br.w * 0.3, br.y + 2);
        ctx.lineTo(br.x + ox + br.w * 0.5, br.y + br.h * 0.55);
        ctx.lineTo(br.x + ox + br.w * 0.7, br.y + br.h - 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Magnet lines ---
  if (magnetOn) {
    for (const ball of balls) {
      if (ball.held) continue;
      for (const br of bricks) {
        if (!br.alive || br.ind) continue;
        const dx = (br.x + br.w / 2) - ball.x, dy = (br.y + br.h / 2) - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 120) {
          ctx.save(); ctx.globalAlpha = 0.08 * (1 - dist / 120); ctx.strokeStyle = '#f472b6';
          ctx.lineWidth = 0.5; ctx.setLineDash([2, 4]);
          ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(br.x + br.w / 2, br.y + br.h / 2); ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // --- Lasers ---
  for (const l of lasers) {
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 10;
    ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.restore();
  }

  // --- Particles ---
  for (const p of parts) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.85;
    if (p.spark) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.dx * 0.5, p.y + p.dy * 0.5); ctx.stroke();
    } else if (p.sq) {
      const s = Math.max(1, p.r * p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, p.r * p.life), 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();
    }
    ctx.restore();
  }

  // --- Power-up drops ---
  for (const p of pdrops) {
    if (!p.alive) continue;
    const bob = Math.sin(p.bob) * 2;
    ctx.save();
    ctx.shadowColor = p.color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2 + bob, p.w, p.h, 9);
    ctx.fillStyle = p.color + '22'; ctx.strokeStyle = p.color; ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = p.color;
    ctx.font = 'bold 8px "Orbitron",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.label, p.x, p.y + bob);
    ctx.restore();
  }

  // --- TRAJECTORY PREVIEW ---
  if (showTrajectory) {
    const heldBall = balls.find(b => b.held);
    const activeBall = balls.find(b => !b.held);
    const previewBall = heldBall || activeBall;

    if (previewBall && !heldBall && activeBall) {
      const { pts, hit } = getTrajectoryPoints(activeBall);
      if (pts.length > 2) {
        ctx.save();
        const skinCol = BALL_SKINS[activeBall.skin]?.glow || '#00d4ff';
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = skinCol;
        ctx.lineWidth   = 0.8;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        if (hit) {
          ctx.globalAlpha = 0.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(hit.x, hit.y, 6, 0, Math.PI * 2);
          ctx.strokeStyle = skinCol;
          ctx.lineWidth   = 1;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // --- Balls ---
  for (const ball of balls) {
    const ballR = ball.size || BALL_R;
    const skin  = BALL_SKINS[ball.skin] || BALL_SKINS.plasma;
    const bc    = ball.ghost ? '#94a3b8' : ball.fire ? '#ff7c2a' : skin.glow;

    if (!ball.held) {
      for (let i = 0; i < ball.trail.length; i++) {
        const t    = ball.trail[i];
        const frac = i / ball.trail.length;
        ctx.save();
        ctx.globalAlpha = frac * (ball.ghost ? 0.15 : 0.4);
        ctx.beginPath(); ctx.arc(t.x, t.y, ballR * frac * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = ball.ghost ? '#94a3b8' : skin.trail;
        ctx.fill(); ctx.restore();
      }
    }

    ctx.save();
    ctx.shadowColor  = bc;
    ctx.shadowBlur   = ball.fire ? 18 : 12;
    ctx.globalAlpha  = ball.ghost ? 0.45 : 1;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
    ctx.fillStyle = ball.ghost ? '#cbd5e1' : skin.body;
    ctx.fill(); ctx.restore();

    if (!ball.ghost) {
      ctx.save(); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(ball.x - 1.5, ball.y - 1.5, ballR * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    }

    // Bullet time ring
    if (bulletTime) {
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(frame * 0.5);
      ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ballR + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // --- Paddle ---
  const padRenderY = gravFlipped ? 0 : (H - PAD_H);
  const padRenderX = paddleX - paddleW / 2;
  const padCol     = gravFlipped ? '#00ff9d' : '#00d4ff';

  ctx.save();
  ctx.shadowColor = padCol; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.roundRect(padRenderX, padRenderY, paddleW, PAD_H, 5);
  ctx.fillStyle   = gravFlipped ? 'rgba(0,255,157,0.1)' : 'rgba(0,212,255,0.1)';
  ctx.fill(); ctx.strokeStyle = padCol; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.globalAlpha = 0.35; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.roundRect(padRenderX + paddleW / 2 - 18, padRenderY + 2, 36, 3, 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();

  // Shield arc
  if (shieldOn) {
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.18 * Math.sin(frame * 0.1);
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 3; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(paddleX, H - PAD_H, paddleW * 0.68, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }

  // Launch indicator (held ball)
  const heldBall = balls.find(b => b.held);
  if (heldBall) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(frame * 0.09);
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(paddleX, gravFlipped ? PAD_H + 8  : H - PAD_H - 8);
    ctx.lineTo(paddleX, gravFlipped ? PAD_H + 30 : H - PAD_H - 30);
    ctx.stroke(); ctx.restore();
  }

  // Rewind orange border
  if (isRewinding) {
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#fb923c'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, W, H);
    ctx.restore();
  }

  // Bullet time border flash
  if (bulletTime) {
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(frame * 0.4);
    ctx.strokeStyle = '#00ff9d'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.restore();
  }

  ctx.restore();
}


/* ============================================================
   25. MAIN GAME LOOP
   ============================================================ */
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}


/* ============================================================
   26. INPUT HANDLERS
   ============================================================ */
function launch() {
  ensureAudio(); // must be called from user gesture
  if (gstate === 'play') balls.forEach(b => { if (b.held) b.held = false; });
}

canvas.addEventListener('mousemove', e => {
  const r  = canvas.getBoundingClientRect();
  const sx = W / r.width;
  paddleX  = Math.max(paddleW / 2, Math.min(W - paddleW / 2, (e.clientX - r.left) * sx));
});

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const r  = canvas.getBoundingClientRect();
  const sx = W / r.width;
  paddleX  = Math.max(paddleW / 2, Math.min(W - paddleW / 2, (e.touches[0].clientX - r.left) * sx));
}, { passive: false });

canvas.addEventListener('click',    launch);
canvas.addEventListener('touchend', e => { e.preventDefault(); launch(); }, { passive: false });

document.addEventListener('keydown', e => {
  keys2[e.key] = true;
  if (e.key === ' ')                  { e.preventDefault(); launch(); }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (gstate === 'play') doRewind(); }
  if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); if (gstate === 'play') flipGravity(); }
  if (e.key === 'g' || e.key === 'G') { e.preventDefault(); if (gstate === 'play') spawnGravityWell(null, null, false); }
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); showTrajectory = !showTrajectory; }
});

document.addEventListener('keyup', e => { keys2[e.key] = false; });

obtn.addEventListener('click', e => {
  e.stopPropagation();
  ensureAudio();
  hideOv();
  if (gstate === 'over' || gstate === 'idle') initGame();
  gstate = 'play';
});


/* ============================================================
   SKIN SELECTOR (injected into overlay on start)
   ============================================================ */
function buildSkinSelector() {
  const existing = document.getElementById('skin-sel');
  if (existing) return;

  const wrap = document.createElement('div');
  wrap.id = 'skin-sel';
  wrap.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:center;margin-top:4px;';

  const label = document.createElement('span');
  label.style.cssText = 'font-family:Orbitron,monospace;font-size:9px;color:rgba(180,210,255,0.45);letter-spacing:.1em;';
  label.textContent = 'BALL:';
  wrap.appendChild(label);

  Object.entries(BALL_SKINS).forEach(([key, skin]) => {
    const btn = document.createElement('button');
    btn.dataset.skin = key;
    btn.style.cssText = `
      padding:4px 10px;border-radius:99px;border:1px solid ${skin.glow}44;
      background:${skin.glow}18;color:${skin.glow};font-family:Orbitron,monospace;
      font-size:8px;letter-spacing:.06em;cursor:pointer;transition:all .2s;
      outline:none;
    `;
    btn.textContent = key.toUpperCase();
    if (key === activeSkin) btn.style.borderColor = skin.glow;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      activeSkin = key;
      wrap.querySelectorAll('button').forEach(b => {
        const s = BALL_SKINS[b.dataset.skin];
        b.style.borderColor = b.dataset.skin === activeSkin ? s.glow : s.glow + '44';
        b.style.background  = b.dataset.skin === activeSkin ? s.glow + '30' : s.glow + '18';
      });
    });
    wrap.appendChild(btn);
  });

  // Insert before the launch button
  overlay.insertBefore(wrap, obtn);
}


/* ============================================================
   BOOT
   ============================================================ */
initGame();
gstate = 'idle';
buildSkinSelector();
showOv(
  'BRICKSTORM ULTRA',
  'Move with mouse · Space to launch<br>' +
  'R = Rewind · Q = Flip Gravity · T = Trajectory<br>' +
  'Wormholes · Boss Bricks · Bullet Time · Patterns!<br><br>' +
  '<span style="color:var(--accent2);font-size:11px">x20 combo → NUKE · Full rage → RAGE MODE · Level 5 → BOSS</span>',
  'LAUNCH',
  null,
  'var(--accent)'
);
loop();
