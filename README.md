# brickstorm-ultra
🎮 Controls
InputActionMouse / TouchMove paddle← → or A / DMove paddle (keyboard)Space / Click / TapLaunch ballRTime RewindQFlip GravityGSpawn Gravity WellTToggle Trajectory Preview

✨ Features
Core Gameplay

Classic breakout with physics-tuned ball bouncing — angle depends on where you hit the paddle
Speed scales with level, capped to stay fair
3 lives with heart HUD; shield power-up acts as a one-time safety net
Combo system — consecutive paddle hits build multiplier, combo resets on ball loss

🔊 Synthesized Audio
All sounds are generated at runtime using the Web Audio API — no sound files needed. Every action has its own distinct sound: brick hits, breaks, paddle bounces, laser fire, power-up collection, the descending "lose a life" tone, boss roar, and level-up fanfare.
👾 Boss Bricks (Levels 5, 10, 15…)
Every 5th level is a boss fight. The boss is a wide moving brick with a visible HP bar. At 50% HP it enrages — speed increases, color shifts to orange. Killing the boss drops 5 power-ups and awards massive points.
🧩 Brick Patterns
Layouts rotate each level instead of always being a full grid:
PatternDescriptionFull GridClassic rowsCheckerboardAlternating gapsDiamondBricks form a diamond shapeWaveSine-wave gaps through rowsV-FunnelBricks narrow toward bottomBorder + CrossOuter ring with center cross
⚡ Bullet Time
When the ball is about to miss the paddle, the game automatically slows to 35% speed for ~1.5 seconds. Green tint + border flash. Cooldown prevents spam.
🎯 Trajectory Preview
A dashed line shows the ball's predicted path and marks which brick it'll hit first. Toggle with T.
🎱 Ball Skins
Pick your skin before launching:
SkinEffectPLASMADefault blue — balancedFIREStarts in permanent fireball modeGHOSTPermanently passes through bricksNEONGreen trailDARKPurple glow
Power-Ups
Power-UpEffectDurationWIDE PADPaddle grows wider9sMULTIBALLSpawns 2 extra ballsPermanentSLOW MOSlows all balls7sLASER x5Fires 5 laser boltsUntil shots usedSHIELDOne free ball saveUntil used+1 LIFERestores a heartInstantFIREBALLBall destroys bricks in one hit, no bounce8sGRAVITY WELLBends ball trajectory400 framesGHOST BALLBall passes through bricks6sBRICK MAGNETPulls ball toward bricks8sTIME REWINDRewinds ~1 second of gameplayInstant
Special Brick Types
BrickUnlocksBehaviorMulti-HPLevel 2+Takes 2–3 hits; shows crack damageMirrorLevel 3+Deflects ball at random angleExplosiveLevel 5+Chain-destroys nearby bricksMagneticLevel 4+Pulls the ball toward itTeleportLevel 6+Warps ball to a random positionIndestructibleLevel 7+Cannot be destroyed, only bounces
Rage Mode
Hit enough bricks to fill the rage bar. At 100% all balls become fireballs, grow larger, and speed up for 6 seconds. Screen tints red.
Combo Nuke
Build a x20 combo to trigger a nuke: destroys all bricks within a large radius from center in a staggered chain with a massive particle burst.
Wormholes
Auto-spawn every ~20 seconds. Two portal mouths appear — ball entering one exits the other. Awards 500 points per teleport. Cooldown prevents ping-pong loops.
Gravity Flip (Q)
Moves the paddle to the top of the screen and reverses all ball trajectories and power-up drop directions.
Time Rewind (R)
Snapshots game state every 4 frames (capped at 120 frames / ~8 seconds). Replays the last ~60 frames in reverse with an orange visual effect.
Streak Flash
At x5, x10, x15, x20 combos — screen flashes with a milestone color and a large floating label appears. Near-miss (ball barely saved) = instant +100 bonus points.

📁 File Structure
brickstorm-ultra/
├── index.html   — HTML shell, HUD, canvas, overlay
├── style.css    — All visual styling, animations, chips
├── game.js      — All game logic, physics, rendering, audio
└── README.md    — This file
No external assets. Fonts loaded from Google Fonts (Orbitron + Rajdhani). Works fully offline if you substitute with local fonts.

🛠 Technical Notes

Canvas: 540×420 logical pixels, CSS-scaled to full container width
Game loop: requestAnimationFrame — no fixed timestep, runs at display refresh rate
Audio: Web Audio API with synthesized oscillators and buffer sources — no audio files
Bullet time: achieved by multiplying all positional deltas by a speedMul scalar (0.35 in slow mode)
Rewind: lightweight object snapshots stored in a ring buffer, replayed in reverse at 60fps
Brick patterns: pure math — sine waves, Manhattan distance, grid rules — no assets
Boss bricks: same collision system as regular bricks, extended with phase state and horizontal movement
Daily challenge seed: year * 10000 + month * 100 + day — same layout for everyone on the same calendar day


🧩 Adding Your Own Content
New power-up: add a key to the PU object, handle it in activate(), add a .chip CSS class.
New brick type: add a flag in makeBricks(), handle it in the brick collision block inside the ball loop, add a render branch in render().
New sound: add a case to the playSound() switch — use OscillatorNode, GainNode, and BiquadFilterNode from the Web Audio API.
New brick pattern: add a case to makeBrickPattern() returning a 2D boolean grid.

🌐 Browser Compatibility
BrowserStatusChrome 90+✅ Full supportFirefox 88+✅ Full supportSafari 15+✅ Full supportEdge 90+✅ Full supportMobile (iOS/Android)✅ Touch controls work
Requires: Canvas API, Web Audio API, roundRect (Chrome 99+ / Safari 15.4+). For older Safari, roundRect gracefully falls back silently — bricks render as squares.

📜 License
MIT — do whatever you want with it.
