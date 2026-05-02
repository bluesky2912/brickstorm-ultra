/* ============================================================
   BRICKSTORM ULTRA — game.js
   All game logic: state, physics, features, rendering, input
   ============================================================

   TABLE OF CONTENTS
   -----------------
   1.  DOM References
   2.  Constants
   3.  Game State Variables
   4.  Stars (background decoration)
   5.  HUD Helpers
   6.  Overlay Helpers
   7.  Brick Generation
   8.  Ball Factory
   9.  Game Init / Reset
   10. Particles (burst + sparks)
   11. Power-Up Drop System
   12. Brick Explosion (chain reaction)
   13. FEATURE: Combo Nuke  (x20 combo)
   14. FEATURE: Rage Mode   (full rage bar)
   15. FEATURE: Gravity Well
   16. FEATURE: Wormholes
   17. FEATURE: Time Rewind (R key)
   18. FEATURE: Gravity Flip (Q key)
   19. Power-Up Activation
   20. Laser Fire
   21. Collision Helpers
   22. Magnetism (magnet power-up)
   23. UPDATE loop
   24. RENDER loop
   25. Main game loop
   26. Input handlers
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
const W         = 540;   // canvas width
const H         = 420;   // canvas height
const MAX_LIVES = 3;
const BALL_R    = 7;     // default ball radius
const PAD_H     = 11;    // paddle height
const BASE_SPD  = 4.8;   // starting ball speed
const MAX_BALLS = 6;     // multiball cap

// Row colours for bricks (cycles by row index)
const BCOLS = ['#ff3d7f','#ff7c2a','#ffcc00','#00ff9d','#00d4ff','#a78bfa','#ff6b6b'];

// Power-up definitions: colour used for drop pill + chip badge
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


/* ============================================================
   3. GAME STATE VARIABLES
   ============================================================ */
let gstate    = 'idle';   // 'idle' | 'play' | 'levelup' | 'over'
let score     = 0;
let best      = 0;
let level     = 1;
let combo     = 0;
let maxCombo  = 0;
let lives     = MAX_LIVES;
let bricksDone = 0;

let paddleX = W / 2;
let paddleW = 94;

// Object arrays
let balls        = [];
let bricks       = [];
let parts        = [];  // particles
let pdrops       = [];  // falling power-up pills
let lasers       = [];
let gravityWells = [];
let wormholes    = [];

// Power-up state flags
let shieldOn  = false;
let fireOn    = false;
let ghostOn   = false;
let magnetOn  = false;
let gravFlipped = false;  // true = paddle at top, gravity reversed

// Rage meter (0–100); fills on every brick break / combo hit
let rageLevel = 0;

// Time rewind buffer (snapshots captured every 4 frames)
let rewindBuffer = [];
let isRewinding  = false;

// Wormhole auto-spawn timer
let wormholeTimer  = 0;
let nextWormholeAt = 0;

// Banner countdown (frames)
let bannerTimer = 0;

// Active power-up timeouts (stored so we can clearTimeout on reset)
let ptimers = {};

// Keyboard state
let keys2 = {};

// Frame counter (used for animations + rewind timing)
let frame = 0;

// Screen-shake magnitude (decays each frame)
let screenShake = 0;


/* ============================================================
   4. STARS — decorative background dots (CSS-animated)
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
   5. HUD HELPERS
   ============================================================ */

/** Rebuild the heart row from scratch based on current `lives`. */
function buildHearts() {
  livesRow.innerHTML = '';
  for (let i = 0; i < MAX_LIVES; i++) {
    const h = document.createElement('span');
    h.className = 'hrt' + (i < lives ? ' on' : '');
    h.textContent = '♥';
    livesRow.appendChild(h);
  }
}

/** Update hearts to match current `lives` with pop animation on gain. */
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

/** Animate a HUD value element with a scale-bump. */
function bumpVal(el, val) {
  el.textContent = val;
  el.classList.remove('bump');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('bump');
}

/** Update the combo display and trigger nuke at x20. */
function setCombo(c) {
  combo = c;
  if (c > maxCombo) maxCombo = c;

  const display = c < 2 ? 1 : c;
  comboDisp.textContent = 'x' + display;

  const col = c >= 10 ? '#ff3d7f' : c >= 5 ? '#ffcc00' : '#00d4ff';
  comboDisp.style.color      = col;
  comboDisp.style.textShadow = `0 0 12px ${col}`;
  comboDisp.style.fontSize   = c >= 10 ? '20px' : c >= 5 ? '17px' : '13px';

  // Fill rage meter on every hit
  if (c > 0) addRage(c >= 10 ? 8 : c >= 5 ? 4 : 1);

  // Nuke fires at exactly x20
  if (c === 20) comboNuke();
}

/** Add to rage meter; trigger Rage Mode when it hits 100. */
function addRage(amt) {
  rageLevel = Math.min(100, rageLevel + amt);
  rageBar.style.width      = rageLevel + '%';
  rageBar.style.background = rageLevel >= 80 ? '#ef4444'
                           : rageLevel >= 50 ? '#f97316'
                                              : '#fbbf24';
  if (rageLevel >= 100) triggerRageMode();
}

/** Show a floating score popup above the canvas. */
function floatScore(x, y, val, col) {
  const el = document.createElement('div');
  el.className    = 'fpop';
  el.textContent  = (val > 0 ? '+' : '') + val;
  el.style.color  = col || 'var(--accent3)';
  el.style.left   = (x / W * 100) + '%';
  el.style.top    = (y / H * 100) + '%';
  cwrap.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/** Add a power-up chip badge to the bar (removes old one with same id first). */
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

/** Show the mid-game event banner (e.g. "WORMHOLE OPENED"). */
function showBanner(txt, col) {
  eventBanner.textContent  = txt;
  eventBanner.style.color  = col || '#fff';
  eventBanner.style.textShadow = `0 0 20px ${col || '#fff'}`;
  eventBanner.classList.add('show');
  bannerTimer = 180; // frames visible
}


/* ============================================================
   6. OVERLAY HELPERS (Start screen / Level Up / Game Over)
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
   7. BRICK GENERATION
   ============================================================ */

/**
 * Build a fresh grid of bricks for the current level.
 * Special brick types unlock progressively:
 *   level 3+  → mirror bricks (reflect ball at random angle)
 *   level 4+  → magnetic bricks (pull ball) + 3-HP bricks
 *   level 5+  → explosive bricks (chain reaction)
 *   level 6+  → teleport bricks (warp ball)
 *   level 7+  → indestructible bricks
 */
function makeBricks() {
  bricks = [];
  const COLS  = 10;
  const ROWS  = Math.min(3 + Math.floor(level / 2), 9);
  const BW = 42, BH = 15, PX = 5, PY = 5;
  const totalW = COLS * (BW + PX) - PX;
  const sx = (W - totalW) / 2;
  const sy = 42;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ind      = level >= 7 && r < 1 && Math.random() < 0.15;
      const hp       = ind ? 999
                     : level >= 4 && r < 2 ? 3
                     : level >= 2 && r === 0 ? 2
                     : 1;
      const expl     = !ind && level >= 5 && Math.random() < 0.08;
      const mirror   = !ind && level >= 3 && Math.random() < 0.07;
      const magnetic = !ind && level >= 4 && Math.random() < 0.06;
      const teleport = !ind && level >= 6 && Math.random() < 0.05;

      bricks.push({
        x: sx + c * (BW + PX),
        y: sy + r * (BH + PY),
        w: BW, h: BH,
        hp, maxHp: hp,
        color: BCOLS[r % BCOLS.length],
        alive: true,
        shakeT: 0,       // frames of shake remaining
        sh: Math.random() * Math.PI * 2,   // shimmer phase
        pulse: Math.random() * Math.PI * 2,
        expl, ind, mirror, magnetic, teleport,
      });
    }
  }
}


/* ============================================================
   8. BALL FACTORY
   ============================================================ */

/**
 * Create a ball object.
 * @param {number} x       - starting x (defaults to paddle centre)
 * @param {number} y       - starting y (defaults to just above paddle)
 * @param {number} angle   - launch angle in radians (random if null)
 * @param {number} spd     - speed (defaults to level-scaled speed)
 */
function mkBall(x, y, angle, spd) {
  spd   = spd   || (BASE_SPD + (level - 1) * 0.28);
  angle = angle != null ? angle : -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
  return {
    x: x || paddleX,
    y: y || H - PAD_H - BALL_R - 2,
    dx: Math.cos(angle) * spd,
    dy: Math.sin(angle) * spd,
    held: true,   // true = stuck to paddle until player launches
    trail: [],    // recent positions for motion-blur effect
    fire: fireOn,
    ghost: false,
    size: BALL_R,
  };
}


/* ============================================================
   9. GAME INIT / RESET
   ============================================================ */

function initGame() {
  // Scores & progression
  score      = 0;
  lives      = MAX_LIVES;
  level      = 1;
  combo      = 0;
  maxCombo   = 0;
  bricksDone = 0;

  // Paddle
  paddleX = W / 2;
  paddleW = 94;

  // Clear all object arrays
  balls        = [mkBall()];
  bricks       = [];
  parts        = [];
  pdrops       = [];
  lasers       = [];
  gravityWells = [];
  wormholes    = [];

  // Clear power-up flags
  shieldOn    = false;
  fireOn      = false;
  ghostOn     = false;
  magnetOn    = false;
  gravFlipped = false;

  // Reset rage meter
  rageLevel = 0;
  rageBar.style.width = '0%';

  // Reset rewind buffer
  rewindBuffer = [];
  isRewinding  = false;

  // Reset screen shake
  screenShake = 0;

  // Reset wormhole timer (first wormhole appears after ~15 seconds)
  wormholeTimer  = 0;
  nextWormholeAt = 900 + Math.random() * 600;

  // Clear all active power-up timeouts
  Object.values(ptimers).forEach(clearTimeout);
  ptimers = {};

  // Reset HUD
  bbar.innerHTML    = '<span class="blab">POWER-UPS</span>';
  hvScore.textContent = '0';
  hvLevel.textContent = '1';
  setCombo(0);
  buildHearts();
  makeBricks();
}

/** Cancel all power-up timeouts (called on level clear). */
function clearTimers() {
  Object.values(ptimers).forEach(clearTimeout);
  ptimers = {};
}


/* ============================================================
   10. PARTICLES
   ============================================================ */

/**
 * Explode a burst of circular/square particles.
 * @param {boolean} big - larger, slower particles for big explosions
 */
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
      sq: big && Math.random() < 0.3, // some are squares for variety
    });
  }
}

/** Short line sparks (used on wall/paddle hits). */
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
      spark: true, // rendered as a short line, not a circle
    });
  }
}


/* ============================================================
   11. POWER-UP DROP SYSTEM
   ============================================================ */

/**
 * Randomly decide whether to drop a power-up pill from a hit brick.
 * Drop chance increases slightly with level.
 */
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
    bob: Math.random() * Math.PI * 2, // wobble phase
  });
}


/* ============================================================
   12. BRICK EXPLOSION (with chain reaction for explosive bricks)
   ============================================================ */

/**
 * Destroy a brick, award score, emit particles, and try a power-up drop.
 * Explosive bricks trigger neighbours after a short delay.
 * @param {boolean} chain - true = this was triggered by another explosion
 */
function explodeBrick(b, chain) {
  if (!b.alive) return;
  b.alive = false;
  bricksDone++;

  const pts = (10 + combo * 2) * level * (chain ? 2 : 1);
  score += pts;
  bumpVal(hvScore, score.toLocaleString());

  burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 20, true);
  sparks(b.x + b.w / 2, b.y + b.h / 2, '#ffcc00', 8);
  tryDrop(b.x + b.w / 2, b.y + b.h / 2);
  addRage(2);

  // Explosive brick: chain-destroy nearby bricks
  if (b.expl) {
    burst(b.x + b.w / 2, b.y + b.h / 2, '#ff7c2a', 25, true);
    screenShake = 12;
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
   13. FEATURE: COMBO NUKE  (triggers at x20 combo)
   ============================================================ */

/**
 * Destroys all bricks within a large radius from the centre of the
 * play field in a staggered chain, with a massive particle burst.
 * Resets the rage bar as a bonus.
 */
function comboNuke() {
  showBanner('⚡ COMBO NUKE ⚡', '#ff3d7f');
  screenShake = 20;

  const cx = W / 2;
  const cy = H * 0.3;

  burst(cx, cy, '#ff3d7f', 80, true);
  burst(cx, cy, '#ffcc00', 40, true);

  for (const b of bricks) {
    if (!b.alive || b.ind) continue;
    const dist = Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy);
    if (dist < 180) {
      setTimeout(() => {
        if (b.alive) {
          burst(b.x + b.w / 2, b.y + b.h / 2, b.color, 12, false);
          explodeBrick(b, true);
        }
      }, dist * 2); // delay proportional to distance for wave effect
    }
  }

  rageLevel = 0;
  rageBar.style.width = '0%';
}


/* ============================================================
   14. FEATURE: RAGE MODE  (triggers when rage bar hits 100)
   ============================================================ */

/**
 * All balls become fireballs, grow larger, and speed up for 6 seconds.
 * Screen tints red during Rage Mode.
 */
function triggerRageMode() {
  if (gstate !== 'play') return;
  showBanner('🔥 RAGE MODE 🔥', '#ef4444');
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
   15. FEATURE: GRAVITY WELL
   ============================================================ */

/**
 * Spawn a gravity well that bends nearby ball trajectories.
 * @param {number}  x      - centre x (random if null)
 * @param {number}  y      - centre y (random if null)
 * @param {boolean} flips  - if true, acts as a repulsor instead
 */
function spawnGravityWell(x, y, flips) {
  const life = 400; // frames
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
   16. FEATURE: WORMHOLES
   ============================================================ */

/**
 * Spawn a wormhole pair (portal A and portal B).
 * The ball teleports from one mouth to the other, preserving direction.
 * Each mouth has its own cooldown to prevent instant re-entry (ping-pong fix).
 * Portals are guaranteed to be at least 120px apart.
 */
function spawnWormhole() {
  // Clean up any fully expired wormholes first
  wormholes = wormholes.filter(w => w.life > 0);

  // Only one active wormhole pair at a time
  if (wormholes.length >= 1) return;

  const life   = 700; // frames (~11 seconds at 60fps)
  const margin = 70;

  // Pick two positions that are far enough apart
  let ax, ay, bx, by, tries = 0;
  do {
    ax = margin + Math.random() * (W - margin * 2);
    ay = 100    + Math.random() * (H * 0.45);
    bx = margin + Math.random() * (W - margin * 2);
    by = 100    + Math.random() * (H * 0.45);
    tries++;
  } while (Math.hypot(bx - ax, by - ay) < 120 && tries < 20);

  wormholes.push({
    ax, ay,       // portal A position
    bx, by,       // portal B position
    r: 24,        // portal radius
    life,
    maxLife: life,
    cooldownA: 0, // frames until portal A can teleport again
    cooldownB: 0, // frames until portal B can teleport again
    spin: 0,      // rotation angle for render
  });

  showBanner('🌀 WORMHOLE OPENED', '#00d4ff');
}


/* ============================================================
   17. FEATURE: TIME REWIND  (R key or rewind power-up)
   ============================================================ */

/**
 * Save a lightweight snapshot of all game objects every 4 frames.
 * Capped at 120 snapshots (~8 seconds of history).
 */
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

/**
 * Replay the last 60 snapshots (1 second) in reverse at 60fps,
 * creating a visible rewind effect. Orange border flashes during rewind.
 */
function doRewind() {
  if (rewindBuffer.length < 5) return;
  isRewinding = true;
  addChip('rewind', 'rewind', 'REWINDING');
  showBanner('⏪ TIME REWIND ⏪', '#fb923c');

  let rewindFrames = 0;
  const rewindInterval = setInterval(() => {
    if (rewindBuffer.length === 0 || rewindFrames > 60) {
      clearInterval(rewindInterval);
      isRewinding = false;
      removeChip('rewind');
      return;
    }
    const snap = rewindBuffer.pop();
    balls  = snap.balls.map(b  => ({ ...b,  trail: [...b.trail] }));
    bricks = snap.bricks.map(b => ({ ...b }));
    parts  = snap.parts.map(p  => ({ ...p }));
    paddleX = snap.paddleX;

    // Orange spark rain during rewind for visual feedback
    for (let i = 0; i < 3; i++) {
      sparks(Math.random() * W, Math.random() * H, '#fb923c', 2);
    }
    rewindFrames++;
  }, 16);
}


/* ============================================================
   18. FEATURE: GRAVITY FLIP  (Q key)
   ============================================================ */

/**
 * Toggle gravity direction. When flipped:
 *  - Paddle moves to the top of the canvas
 *  - Balls' Y velocity is inverted
 *  - Power-up pills fall upward
 */
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

/**
 * Apply the effect of a caught power-up.
 * @param {string} t - power-up type key (e.g. 'wide', 'laser')
 */
function activate(t) {

  if (t === 'wide') {
    paddleW = Math.min(160, paddleW + 38);
    addChip('wide', 'wide', 'WIDE PAD');
    clearTimeout(ptimers.wide);
    ptimers.wide = setTimeout(() => {
      paddleW = Math.max(94, paddleW - 38);
      removeChip('wide');
    }, 9000);
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

  if (t === 'rewind') {
    doRewind();
  }
}


/* ============================================================
   20. LASER FIRE
   ============================================================ */

/** Fire two laser bolts from the edges of the paddle. */
function fireLaser() {
  lasers.push({ x: paddleX - 7, y: H - PAD_H - 2, dy: -15, alive: true, w: 3, h: 14 });
  lasers.push({ x: paddleX + 4, y: H - PAD_H - 2, dy: -15, alive: true, w: 3, h: 14 });
  sparks(paddleX, H - PAD_H, '#ffcc00', 5);
}


/* ============================================================
   21. COLLISION HELPERS
   ============================================================ */

/** Returns true if a circle overlaps a rectangle. */
function circRect(bx, by, br, rx, ry, rw, rh) {
  const cx = Math.max(rx, Math.min(bx, rx + rw));
  const cy = Math.max(ry, Math.min(by, ry + rh));
  return (bx - cx) ** 2 + (by - cy) ** 2 < br * br;
}

/** Returns which side of a rect the circle centre is closest to. */
function hitSide(bx, by, rx, ry, rw, rh) {
  const oL = bx - rx,       oR = (rx + rw) - bx;
  const oT = by - ry,       oB = (ry + rh) - by;
  return Math.min(oL, oR) < Math.min(oT, oB)
    ? (oL < oR ? 'left' : 'right')
    : (oT < oB ? 'top'  : 'bottom');
}


/* ============================================================
   22. MAGNETISM (magnet power-up)
   ============================================================ */

/**
 * When the magnet power-up is active, gently pull all in-flight balls
 * toward any nearby alive brick (range: 120px).
 */
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
   23. UPDATE LOOP
   ============================================================ */

function update() {
  if (gstate !== 'play' || isRewinding) return;
  frame++;

  // --- Banner countdown ---
  if (bannerTimer > 0) {
    bannerTimer--;
    if (bannerTimer === 0) eventBanner.classList.remove('show');
  }

  // --- Wormhole auto-spawn ---
  wormholeTimer++;
  if (wormholeTimer >= nextWormholeAt) {
    spawnWormhole();
    wormholeTimer  = 0;
    nextWormholeAt = 1200 + Math.random() * 800;
  }

  // --- Age gravity wells and wormholes ---
  gravityWells = gravityWells.filter(g => { g.life--; return g.life > 0; });
  wormholes    = wormholes.filter(w => {
    w.life--;
    w.spin     += 0.04;
    w.cooldownA = Math.max(0, w.cooldownA - 1);
    w.cooldownB = Math.max(0, w.cooldownB - 1);
    return w.life > 0;
  });

  // --- Capture rewind snapshot every 4 frames ---
  if (frame % 4 === 0) captureSnapshot();

  // --- Decay screen shake ---
  if (screenShake > 0) screenShake -= 0.8;

  // --- Keyboard paddle movement ---
  const PSPD = 7;
  if (keys2['ArrowLeft']  || keys2['a'] || keys2['A'])
    paddleX = Math.max(paddleW / 2, paddleX - PSPD);
  if (keys2['ArrowRight'] || keys2['d'] || keys2['D'])
    paddleX = Math.min(W - paddleW / 2, paddleX + PSPD);
  paddleX = Math.max(paddleW / 2, Math.min(W - paddleW / 2, paddleX));

  // --- Lasers ---
  for (const l of lasers) {
    if (!l.alive) continue;
    l.y += l.dy;
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
          if (br.hp <= 0) {
            explodeBrick(br, false);
            floatScore(br.x + br.w / 2, br.y, (10 + combo * 2) * level, '#ffcc00');
          }
        }
        break;
      }
    }
  }
  lasers = lasers.filter(l => l.alive);

  // --- Magnet pulls balls toward nearby bricks ---
  applyMagnetism();

  // ================================================================
  // BALL LOOP
  // ================================================================
  const toRemove = [];

  for (let bi = 0; bi < balls.length; bi++) {
    const ball  = balls[bi];
    const ballR = ball.size || BALL_R;

    // Held ball: stick to paddle
    if (ball.held) {
      ball.x = paddleX;
      ball.y = gravFlipped ? (PAD_H + ballR + 1) : (H - PAD_H - ballR - 1);
      continue;
    }

    // Record trail position before moving
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 12) ball.trail.shift();

    // Move
    ball.x += ball.dx;
    ball.y += ball.dy;

    // --- Gravity wells bend trajectory ---
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

    // --- Wormhole teleportation ---
    for (const wh of wormholes) {
      const da = Math.hypot(ball.x - wh.ax, ball.y - wh.ay);
      const db = Math.hypot(ball.x - wh.bx, ball.y - wh.by);

      if (da < wh.r && wh.cooldownA === 0) {
        // Enter A → exit B (offset exit point to avoid instant re-entry)
        const exitAngle = Math.atan2(ball.dy, ball.dx);
        ball.x = wh.bx + Math.cos(exitAngle) * (wh.r + ballR + 4);
        ball.y = wh.by + Math.sin(exitAngle) * (wh.r + ballR + 4);
        burst(wh.ax, wh.ay, '#00d4ff', 15, false);
        burst(wh.bx, wh.by, '#a78bfa', 15, false);
        wh.cooldownA = 90;
        wh.cooldownB = 90;
        screenShake  = 5;
        score += 500;
        bumpVal(hvScore, score.toLocaleString());
        floatScore(wh.bx, wh.by, 500, '#00d4ff');
        break;

      } else if (db < wh.r && wh.cooldownB === 0) {
        // Enter B → exit A
        const exitAngle = Math.atan2(ball.dy, ball.dx);
        ball.x = wh.ax + Math.cos(exitAngle) * (wh.r + ballR + 4);
        ball.y = wh.ay + Math.sin(exitAngle) * (wh.r + ballR + 4);
        burst(wh.bx, wh.by, '#00d4ff', 15, false);
        burst(wh.ax, wh.ay, '#a78bfa', 15, false);
        wh.cooldownA = 90;
        wh.cooldownB = 90;
        screenShake  = 5;
        score += 500;
        bumpVal(hvScore, score.toLocaleString());
        floatScore(wh.ax, wh.ay, 500, '#00d4ff');
        break;
      }
    }

    // --- Speed cap (prevent runaway acceleration) ---
    const spd    = Math.hypot(ball.dx, ball.dy);
    const maxSpd = BASE_SPD + (level - 1) * 0.28 + 5;
    if (spd > maxSpd) { ball.dx = ball.dx / spd * maxSpd; ball.dy = ball.dy / spd * maxSpd; }
    if (spd < 2)      { ball.dx = ball.dx / spd * 2;      ball.dy = ball.dy / spd * 2; }

    // --- Wall bounces ---
    if (ball.x - ballR < 0) {
      ball.x  = ballR;
      ball.dx = Math.abs(ball.dx);
      sparks(ball.x, ball.y, '#00d4ff', 3);
    } else if (ball.x + ballR > W) {
      ball.x  = W - ballR;
      ball.dx = -Math.abs(ball.dx);
      sparks(ball.x, ball.y, '#00d4ff', 3);
    }
    if (ball.y - ballR < 0) {
      ball.y  = ballR;
      ball.dy = Math.abs(ball.dy);
      sparks(ball.x, ball.y, '#00d4ff', 3);
    }

    // --- Paddle collision ---
    const padX = paddleX - paddleW / 2;

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
        sparks(ball.x, padY, ball.fire ? '#ff7c2a' : '#e8f4ff', 5);
        setCombo(combo + 1);
      }
    } else {
      // Flipped gravity: paddle at top
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
        sparks(ball.x, PAD_H, ball.fire ? '#ff7c2a' : '#e8f4ff', 5);
        setCombo(combo + 1);
      }
    }

    // --- Ball lost (fell off the bottom in normal, top in flipped) ---
    const ballLost = gravFlipped
      ? (ball.y + ballR < -30)
      : (ball.y - ballR > H + 30);

    if (ballLost) {
      // Extra balls just disappear
      if (balls.length > 1) { toRemove.push(bi); continue; }

      // Last ball: check shield first
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
        // Respawn ball on paddle
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

      // MIRROR BRICK — random angle deflection
      if (br.mirror) {
        const angle2 = Math.random() * Math.PI * 2;
        const spd2   = Math.hypot(ball.dx, ball.dy);
        ball.dx = Math.cos(angle2) * spd2;
        ball.dy = Math.sin(angle2) * spd2;
        sparks(ball.x, ball.y, '#f0abfc', 8);
        burst(br.x + br.w / 2, br.y + br.h / 2, '#f0abfc', 8, false);
        br.hp--; br.shakeT = 8;
        if (br.hp <= 0) explodeBrick(br, false);
        break; // stop checking bricks this frame
      }

      // TELEPORT BRICK — warp ball to random position
      if (br.teleport) {
        ball.x = Math.random() * (W - 100) + 50;
        ball.y = Math.random() * (H * 0.4) + 50;
        burst(ball.x, ball.y, '#fbbf24', 15, false);
        sparks(br.x + br.w / 2, br.y + br.h / 2, '#fbbf24', 10);
        br.hp--; br.shakeT = 6;
        if (br.hp <= 0) explodeBrick(br, false);
        showBanner('🌀 TELEPORTED!', '#fbbf24');
        screenShake = 4;
        break;
      }

      // INDESTRUCTIBLE BRICK — bounce only, no damage
      if (br.ind) {
        const s = hitSide(ball.x, ball.y, br.x, br.y, br.w, br.h);
        if (s === 'left' || s === 'right') {
          ball.dx = -ball.dx;
          ball.x += ball.dx > 0 ? 2 : -2;
        } else {
          ball.dy = -ball.dy;
          ball.y += ball.dy > 0 ? 2 : -2;
        }
        sparks(ball.x, ball.y, '#a78bfa', 4);
        break;
      }

      // GHOST BALL — passes through bricks, still damages them
      if (ball.ghost) {
        if (!br.ind) {
          br.hp--; br.shakeT = 6;
          sparks(ball.x, ball.y, br.color, 5);
          if (br.hp <= 0) {
            const pts = (10 + combo * 2) * level;
            score += pts;
            bricksDone++;
            bumpVal(hvScore, score.toLocaleString());
            floatScore(br.x + br.w / 2, br.y, pts);
            explodeBrick(br, false);
          }
        }
        continue; // NO direction change — ball passes through ALL bricks
      }

      // NORMAL BRICK HIT
      br.hp    -= ball.fire ? br.maxHp : 1;
      br.shakeT = 6;
      sparks(ball.x, ball.y, br.color, 5);

      if (br.hp <= 0) {
        // explodeBrick handles the score internally
        explodeBrick(br, false);
        floatScore(br.x + br.w / 2, br.y, (10 + combo * 2) * level);
      } else {
        tryDrop(br.x + br.w / 2, br.y + br.h / 2);
      }

      // Bounce (fireball passes through without bouncing)
      if (!ball.fire) {
        const s = hitSide(ball.x, ball.y, br.x, br.y, br.w, br.h);
        if (s === 'left' || s === 'right') {
          ball.dx = -ball.dx;
          ball.x += ball.dx > 0 ? 2 : -2;
        } else {
          ball.dy = -ball.dy;
          ball.y += ball.dy > 0 ? 2 : -2;
        }
      }
      break;
    }
  } // end ball loop

  // Remove extra balls that fell off
  for (let i = toRemove.length - 1; i >= 0; i--) balls.splice(toRemove[i], 1);

  // ================================================================
  // POWER-UP DROPS
  // ================================================================
  const catchY  = gravFlipped ? 0 : H - PAD_H;
  const catchX1 = paddleX - paddleW / 2;
  const catchX2 = paddleX + paddleW / 2;

  for (const p of pdrops) {
    if (!p.alive) continue;
    p.y  += gravFlipped ? -p.dy : p.dy;
    p.bob += 0.08;

    // Caught by paddle?
    if (Math.abs(p.y - catchY) < p.h &&
        p.x + p.w / 2 >= catchX1 &&
        p.x - p.w / 2 <= catchX2) {
      p.alive = false;
      burst(p.x, p.y, p.color, 16, true);
      activate(p.t);
    }
    if (p.y > H + 30 || p.y < -30) p.alive = false;
  }
  pdrops = pdrops.filter(p => p.alive);

  // ================================================================
  // PARTICLES
  // ================================================================
  for (const p of parts) {
    p.x += p.dx;
    p.y += p.dy;
    if (!p.spark) p.dy += 0.08; // gravity on circle particles
    p.life -= p.decay;
  }
  parts = parts.filter(p => p.life > 0);

  // Brick animation timers
  for (const br of bricks) {
    if (br.shakeT > 0) br.shakeT--;
    if (br.alive) { br.sh += 0.025; br.pulse += 0.05; }
  }

  // Keep best score live
  if (score > best) { best = score; hvBest.textContent = best.toLocaleString(); }

  // ================================================================
  // LEVEL CLEAR
  // ================================================================
  if (bricks.every(b => !b.alive || b.ind) && gstate === 'play') {
    level++;
    hvLevel.textContent = level;
    setCombo(0);
    gstate = 'levelup';
    clearTimers();

    // Reset all active effects for next level
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

    // Auto-spawn a wormhole bonus from level 3 onward
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

  // Screen shake: random offset each frame while shaking
  if (screenShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * screenShake,
      (Math.random() - 0.5) * screenShake
    );
  }

  // Clear canvas
  ctx.clearRect(-10, -10, W + 20, H + 20);
  ctx.fillStyle = '#04050d';
  ctx.fillRect(-10, -10, W + 20, H + 20);

  // CRT scanlines
  ctx.save();
  ctx.globalAlpha = 0.012;
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();

  // Rage mode red tint
  if (rageLevel >= 80) {
    ctx.save();
    ctx.globalAlpha = (rageLevel - 80) / 200;
    ctx.fillStyle   = '#ef4444';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // --- Gravity wells ---
  for (const gw of gravityWells) {
    const alpha = gw.life / gw.maxLife;
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.08);

    // Gradient halo
    ctx.save();
    ctx.globalAlpha = alpha * 0.3 * pulse;
    const grad = ctx.createRadialGradient(gw.x, gw.y, 0, gw.x, gw.y, gw.r * 2);
    grad.addColorStop(0, gw.color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(gw.x, gw.y, gw.r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rotating dashed rings
    for (let ri = 0; ri < 3; ri++) {
      const ringAngle = frame * 0.02 * (ri % 2 === 0 ? 1 : -1);
      ctx.save();
      ctx.globalAlpha = alpha * (0.6 - ri * 0.15);
      ctx.setLineDash([4, 6 + ri * 3]);
      ctx.strokeStyle = gw.color;
      ctx.lineWidth   = 1.5;
      ctx.translate(gw.x, gw.y);
      ctx.rotate(ringAngle);
      ctx.beginPath();
      ctx.arc(0, 0, gw.r * (0.5 + ri * 0.25), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Label
    ctx.save();
    ctx.globalAlpha  = alpha * 0.8;
    ctx.fillStyle    = gw.color;
    ctx.font         = 'bold 8px Orbitron,monospace';
    ctx.textAlign    = 'center';
    ctx.fillText(gw.flips ? 'REPULSOR' : 'GRAVITY', gw.x, gw.y + 4);
    ctx.restore();
  }

  // --- Wormholes ---
  for (const wh of wormholes) {
    // Fade in at start, fade out at end
    const age   = wh.maxLife - wh.life;
    const alpha = Math.min(1, age < 60 ? age / 60 : wh.life < 60 ? wh.life / 60 : 1);
    const pulse = 0.7 + 0.3 * Math.sin(frame * 0.1);

    for (const [wx, wy] of [[wh.ax, wh.ay], [wh.bx, wh.by]]) {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(wh.spin);

      // Concentric rings
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.globalAlpha = alpha * (0.8 - i * 0.15) * pulse;
        ctx.strokeStyle = i % 2 === 0 ? '#00d4ff' : '#a78bfa';
        ctx.lineWidth   = 1.5 - i * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, wh.r * (1 - i * 0.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Glowing core
      ctx.globalAlpha = alpha * 0.9;
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, wh.r * 0.5);
      g2.addColorStop(0, '#a78bfa');
      g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(0, 0, wh.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Dashed link line between the two mouths
    ctx.save();
    ctx.globalAlpha = alpha * 0.15;
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 8]);
    ctx.beginPath();
    ctx.moveTo(wh.ax, wh.ay);
    ctx.lineTo(wh.bx, wh.by);
    ctx.stroke();
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
    ctx.roundRect(br.x + ox, br.y, br.w, br.h, 3);

    if (br.mirror) {
      ctx.fillStyle   = 'rgba(240,171,252,0.1)';
      ctx.strokeStyle = '#f0abfc';
      ctx.lineWidth   = 1.5;
      ctx.fill(); ctx.stroke();
      // Diagonal shine animation
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(br.pulse);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      ctx.moveTo(br.x + ox + 4,        br.y + 4);
      ctx.lineTo(br.x + ox + br.w - 4, br.y + br.h - 4);
      ctx.stroke();
      ctx.restore();

    } else if (br.teleport) {
      ctx.fillStyle   = 'rgba(251,191,36,0.08)';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth   = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.globalAlpha   = 0.6 + 0.4 * Math.sin(br.pulse);
      ctx.fillStyle     = '#fbbf24';
      ctx.font          = 'bold 8px monospace';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillText('⬡', br.x + ox + br.w / 2, br.y + br.h / 2);
      ctx.restore();

    } else if (br.magnetic) {
      ctx.fillStyle   = 'rgba(244,114,182,0.08)';
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth   = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.globalAlpha  = 0.6 + 0.4 * Math.sin(br.pulse * 1.5);
      ctx.fillStyle    = '#f472b6';
      ctx.font         = 'bold 8px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◈', br.x + ox + br.w / 2, br.y + br.h / 2);
      ctx.restore();

    } else if (br.ind) {
      ctx.fillStyle   = 'rgba(167,139,250,0.08)';
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth   = 1.5;
      ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#c4b5fd';
      ctx.lineWidth   = 0.5;
      ctx.setLineDash([3, 4]);
      ctx.strokeRect(br.x + ox + 3, br.y + 3, br.w - 6, br.h - 6);
      ctx.setLineDash([]);

    } else {
      // Normal / explosive brick
      ctx.fillStyle   = br.color + '1e';
      ctx.strokeStyle = br.color;
      ctx.lineWidth   = 1;
      ctx.fill(); ctx.stroke();

      if (br.expl) {
        ctx.globalAlpha  = 0.5 + 0.5 * Math.sin(br.sh);
        ctx.fillStyle    = '#ff7c2a';
        ctx.font         = 'bold 9px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', br.x + ox + br.w / 2, br.y + br.h / 2);
      }

      // Crack visual on damaged multi-HP bricks
      if (br.maxHp > 1 && br.hp < br.maxHp) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth   = 0.8;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(br.x + ox + br.w * 0.3, br.y + 2);
        ctx.lineTo(br.x + ox + br.w * 0.5, br.y + br.h * 0.55);
        ctx.lineTo(br.x + ox + br.w * 0.7, br.y + br.h - 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Magnet pull lines (visible when magnet is active) ---
  if (magnetOn) {
    for (const ball of balls) {
      if (ball.held) continue;
      for (const br of bricks) {
        if (!br.alive || br.ind) continue;
        const dx   = (br.x + br.w / 2) - ball.x;
        const dy   = (br.y + br.h / 2) - ball.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 120) {
          ctx.save();
          ctx.globalAlpha = 0.08 * (1 - dist / 120);
          ctx.strokeStyle = '#f472b6';
          ctx.lineWidth   = 0.5;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(ball.x, ball.y);
          ctx.lineTo(br.x + br.w / 2, br.y + br.h / 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // --- Lasers ---
  for (const l of lasers) {
    ctx.save();
    ctx.globalAlpha  = 0.9;
    ctx.fillStyle    = '#ffcc00';
    ctx.shadowColor  = '#ffcc00';
    ctx.shadowBlur   = 10;
    ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.restore();
  }

  // --- Particles ---
  for (const p of parts) {
    ctx.save();
    ctx.globalAlpha = p.life * 0.85;
    if (p.spark) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.dx * 0.5, p.y + p.dy * 0.5);
      ctx.stroke();
    } else if (p.sq) {
      const s = Math.max(1, p.r * p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.r * p.life), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Power-up drops ---
  for (const p of pdrops) {
    if (!p.alive) continue;
    const bob = Math.sin(p.bob) * 2;
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 10;
    ctx.beginPath();
    ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2 + bob, p.w, p.h, 9);
    ctx.fillStyle   = p.color + '22';
    ctx.strokeStyle = p.color;
    ctx.lineWidth   = 1;
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur   = 0;
    ctx.fillStyle    = p.color;
    ctx.font         = 'bold 8px "Orbitron",monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.label, p.x, p.y + bob);
    ctx.restore();
  }

  // --- Balls (trail + body) ---
  for (const ball of balls) {
    const ballR = ball.size || BALL_R;

    // Motion-blur trail
    if (!ball.held) {
      for (let i = 0; i < ball.trail.length; i++) {
        const t    = ball.trail[i];
        const frac = i / ball.trail.length;
        ctx.save();
        ctx.globalAlpha = frac * (ball.ghost ? 0.15 : 0.4);
        ctx.beginPath();
        ctx.arc(t.x, t.y, ballR * frac * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = ball.ghost ? '#94a3b8' : ball.fire ? '#ff7c2a' : '#00d4ff';
        ctx.fill();
        ctx.restore();
      }
    }

    // Ball body
    const bc = ball.ghost ? '#94a3b8' : ball.fire ? '#ff7c2a' : '#00d4ff';
    ctx.save();
    ctx.shadowColor  = bc;
    ctx.shadowBlur   = ball.fire ? 18 : 12;
    ctx.globalAlpha  = ball.ghost ? 0.45 : 1;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
    ctx.fillStyle = ball.ghost ? '#cbd5e1' : ball.fire ? '#ffcc00' : '#e8f4ff';
    ctx.fill();
    ctx.restore();

    // Specular highlight
    if (!ball.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(ball.x - 1.5, ball.y - 1.5, ballR * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
    }
  }

  // --- Paddle ---
  const padRenderY = gravFlipped ? 0 : (H - PAD_H);
  const padRenderX = paddleX - paddleW / 2;
  const padCol     = gravFlipped ? '#00ff9d' : '#00d4ff';

  ctx.save();
  ctx.shadowColor = padCol;
  ctx.shadowBlur  = 16;
  ctx.beginPath();
  ctx.roundRect(padRenderX, padRenderY, paddleW, PAD_H, 5);
  ctx.fillStyle   = gravFlipped ? 'rgba(0,255,157,0.1)' : 'rgba(0,212,255,0.1)';
  ctx.fill();
  ctx.strokeStyle = padCol;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  // Centre highlight stripe
  ctx.globalAlpha = 0.35;
  ctx.shadowBlur  = 0;
  ctx.beginPath();
  ctx.roundRect(padRenderX + paddleW / 2 - 18, padRenderY + 2, 36, 3, 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  // --- Shield arc ---
  if (shieldOn) {
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.18 * Math.sin(frame * 0.1);
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(paddleX, H - PAD_H, paddleW * 0.68, Math.PI, 0);
    ctx.stroke();
    ctx.restore();
  }

  // --- Launch direction indicator ---
  const heldBall = balls.find(b => b.held);
  if (heldBall) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(frame * 0.09);
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(paddleX, gravFlipped ? PAD_H + 8  : H - PAD_H - 8);
    ctx.lineTo(paddleX, gravFlipped ? PAD_H + 30 : H - PAD_H - 30);
    ctx.stroke();
    ctx.restore();
  }

  // --- Rewind orange border flash ---
  if (isRewinding) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle   = '#fb923c';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth   = 3;
    ctx.strokeRect(0, 0, W, H);
    ctx.restore();
  }

  ctx.restore(); // end screen-shake transform
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

/** Release any held ball (launch). */
function launch() {
  if (gstate === 'play') balls.forEach(b => { if (b.held) b.held = false; });
}

// Mouse move → paddle follows cursor
canvas.addEventListener('mousemove', e => {
  const r  = canvas.getBoundingClientRect();
  const sx = W / r.width;
  paddleX  = Math.max(paddleW / 2, Math.min(W - paddleW / 2, (e.clientX - r.left) * sx));
});

// Touch move → paddle follows finger
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
  if (e.key === ' ')              { e.preventDefault(); launch(); }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (gstate === 'play') doRewind(); }
  if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); if (gstate === 'play') flipGravity(); }
  if (e.key === 'g' || e.key === 'G') { e.preventDefault(); if (gstate === 'play') spawnGravityWell(null, null, false); }
});

document.addEventListener('keyup', e => { keys2[e.key] = false; });

// Start / restart button on the overlay
obtn.addEventListener('click', e => {
  e.stopPropagation();
  hideOv();
  if (gstate === 'over' || gstate === 'idle') initGame();
  gstate = 'play';
});


/* ============================================================
   BOOT
   ============================================================ */
initGame();
gstate = 'idle';
showOv(
  'BRICKSTORM ULTRA',
  'Move with mouse · Space to launch<br>' +
  'R = Rewind Time · Q = Flip Gravity<br>' +
  'Wormholes · Mirror Bricks · Combo Nuke · Rage Mode!<br><br>' +
  '<span style="color:var(--accent2);font-size:11px">Reach x20 combo → NUKE · Fill rage bar → RAGE MODE</span>',
  'LAUNCH',
  null,
  'var(--accent)'
);
loop();