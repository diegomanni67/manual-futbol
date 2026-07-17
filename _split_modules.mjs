import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, 'futbol-manual.html'), 'utf8');
const m = html.match(/<script>\s*\(function\(\)\{\s*"use strict";\s*([\s\S]*?)\}\)\(\);\s*<\/script>/);
if (!m) throw new Error('Script block not found');
const lines = m[1].split('\n');
const BASE = 182;

function slice(start, end) {
  return lines.slice(start - BASE, end - BASE + 1).join('\n');
}

function dedupeTopLevelFunctions(code) {
  const out = code.split('\n');
  const blocks = [];
  const re = /^function ([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
  for (let i = 0; i < out.length; i++) {
    if (out[i].startsWith(' ') || out[i].startsWith('\t')) continue;
    const mm = out[i].match(re);
    if (!mm) continue;
    let depth = 0, started = false, j = i;
    for (; j < out.length; j++) {
      for (const ch of out[j]) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') depth--;
      }
      if (started && depth <= 0) { j++; break; }
    }
    blocks.push({ name: mm[1], start: i, end: j });
    i = j - 1;
  }
  const last = new Map();
  for (const b of blocks) last.set(b.name, b);
  const drop = new Set();
  for (const b of blocks) {
    if (last.get(b.name) !== b) {
      for (let k = b.start; k < b.end; k++) drop.add(k);
    }
  }
  return out.filter((_, i) => !drop.has(i)).join('\n');
}

function toStateModule(code) {
  const deduped = dedupeTopLevelFunctions(code);
  const out = [];
  for (const line of deduped.split('\n')) {
    if (/^(const |let |function |class )/.test(line)) out.push('export ' + line);
    else out.push(line);
  }
  return out.join('\n');
}

// ── chunks from original HTML ──────────────────────────────────────────────
const stateBody = toStateModule(
  slice(182, 3961) + '\n\n' + slice(12200, 12241) + '\n\n' + slice(12398, 12425)
);

const inputBody = slice(3963, 4674) + '\n\n' + slice(4676, 5721) + '\n\n' + slice(6409, 6873) + '\n\n' + slice(8849, 9012);
const physicsBody = slice(5789, 6408) + '\n\n' + slice(9013, 10291);
const gameplayBody = slice(2544, 3280) + '\n\n' + slice(5722, 5788) + '\n\n' + slice(6874, 7973) + '\n\n' + slice(8417, 8848) + '\n\n' + slice(10292, 10419) + '\n\n' + slice(12242, 12397);
const renderBody = slice(10420, 12091) + '\n\n' + slice(12426, 12634);

// ── bridge re-exports (assigned by main.js at boot) ───────────────────────
const CROSS_PHYSICS = [
  'hideGoalOverlay', 'resetGoalZoneTracking', 'movePlayer', 'applyTackleCarryInertia',
  'defendingTeamForGoalLine', 'getGoalAreaFrictionMult', 'getGoalNetFrictionMult', 'getGoalNetSide',
  'getOutZoneFrictionMult', 'isBallInsideGoalVolume', 'onBallOut', 'updateGoalNetTriggerPhysics',
];
const CROSS_GAMEPLAY = [
  'resolveCollisions', 'canCpuReceivePass', 'canCpuSeekLooseBall', 'clearInterceptionSeek',
  'clearPassTargetIfPlayer', 'clearPassTargetTeam', 'enforceCpuNoCarrierChase', 'getPassTargetId',
  'getPlayerById', 'isCpuPlayer', 'isHumanTeam', 'nearestToBall', 'resetNearestPlayerSelection', 'showBanner',
];

const bridge = `
// Puente de funciones asignadas por main.js al arrancar (evita imports circulares)
export let runGameplaySim = null;
export let renderFn = null;
export let updateHumanControl = null;
export let resetActionBuffer = null;
export let InputManager = null;
export let readInput = null;
export let snapshotKeys = null;
export let assignInputSources = null;
export let remapMoveForCamera = null;
export let handleRightStickSwitch = null;
export let executeFakeShot = null;
export let isStandardPad = null;
export let effortTouch = null;
export let executeKick = null;
export let updatePendingKick = null;
export let prevButtonsByPad = {};
export let isFakeShotActive = false;
export let fakeShotOwnerId = null;
export let lastTs = null;
export let lastDt = 0.016;
${[...CROSS_PHYSICS, ...CROSS_GAMEPLAY].map(n => `export let ${n} = null;`).join('\n')}

export function setLastTs(v) { lastTs = v; }
export function setLastDt(v) { lastDt = v; }
export function setGameState(v) { gameState = v; }
export function setIsPaused(v) { isPaused = v; }
export function setIsCelebrationMode(v) { isCelebrationMode = v; }

export function wireBridge(deps) {
  if (!deps) return;
  if (deps.runGameplaySim !== undefined) runGameplaySim = deps.runGameplaySim;
  if (deps.renderFn !== undefined) renderFn = deps.renderFn;
  if (deps.assignInputSources !== undefined) assignInputSources = deps.assignInputSources;
  if (deps.snapshotKeys !== undefined) snapshotKeys = deps.snapshotKeys;
  if (deps.updateHumanControl !== undefined) updateHumanControl = deps.updateHumanControl;
  if (deps.resetActionBuffer !== undefined) resetActionBuffer = deps.resetActionBuffer;
  if (deps.InputManager !== undefined) InputManager = deps.InputManager;
  if (deps.readInput !== undefined) readInput = deps.readInput;
  if (deps.remapMoveForCamera !== undefined) remapMoveForCamera = deps.remapMoveForCamera;
  if (deps.handleRightStickSwitch !== undefined) handleRightStickSwitch = deps.handleRightStickSwitch;
  if (deps.executeFakeShot !== undefined) executeFakeShot = deps.executeFakeShot;
  if (deps.isStandardPad !== undefined) isStandardPad = deps.isStandardPad;
  if (deps.effortTouch !== undefined) effortTouch = deps.effortTouch;
  if (deps.executeKick !== undefined) executeKick = deps.executeKick;
  if (deps.updatePendingKick !== undefined) updatePendingKick = deps.updatePendingKick;
${[...CROSS_PHYSICS, ...CROSS_GAMEPLAY].map(n => `  if (deps.${n} !== undefined) ${n} = deps.${n};`).join('\n')}
}

export function resetInputEdgeDetection() {
  if (typeof snapshotKeys === 'function') snapshotKeys();
  for (const k in prevButtonsByPad) delete prevButtonsByPad[k];
}
`;

fs.writeFileSync(path.join(ROOT, 'state.js'), '"use strict";\n\n' + stateBody + '\n' + bridge + '\n');

// ── helper: add imports from state.js + exports ────────────────────────────
const JS_KW = new Set(['true','false','null','undefined','break','case','catch','continue','default','delete','do','else','export','finally','for','function','if','import','in','instanceof','new','return','switch','throw','try','typeof','var','void','while','with','class','const','let','super','this','yield','await','async','static','extends','from','as','of']);
const GLOBALS = new Set(['Math','performance','document','window','navigator','console','Object','Array','String','Number','Boolean','Date','JSON','Promise','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','Error','Map','Set','Intl','parseInt','parseFloat','self','globalThis']);

function stripTrailingComment(line) {
  return line.replace(/\/\/.*$/, '');
}

function parseConstDeclNames(decl) {
  const names = [];
  for (const part of decl.split(',')) {
    const nm = part.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (nm) names.push(nm[1]);
  }
  return names;
}

function collectExports(code) {
  const names = new Set();
  for (const line of code.split('\n')) {
    const stripped = stripTrailingComment(line);
    let mm;
    if ((mm = stripped.match(/^export const\s+(.+?);?\s*$/))) {
      parseConstDeclNames(mm[1]).forEach(n => names.add(n));
      continue;
    }
    if ((mm = stripped.match(/^export (?:let|function|class) ([A-Za-z_][A-Za-z0-9_]*)/))) names.add(mm[1]);
  }
  return names;
}

function collectDefined(code) {
  const names = new Set();
  for (const line of code.split('\n')) {
    const stripped = stripTrailingComment(line.trim());
    let mm;
    if ((mm = stripped.match(/^(?:export )?const\s+(.+?);?\s*$/))) {
      parseConstDeclNames(mm[1]).forEach(n => names.add(n));
      continue;
    }
    if ((mm = stripped.match(/^(?:export )?(?:let|function|class) ([A-Za-z_][A-Za-z0-9_]*)/))) names.add(mm[1]);
  }
  return names;
}

function collectUsed(code) {
  const ids = new Set();
  const re = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
  let m2;
  while ((m2 = re.exec(code))) ids.add(m2[1]);
  return ids;
}

const stateExports = collectExports(fs.readFileSync(path.join(ROOT, 'state.js'), 'utf8'));
const BRIDGE = new Set(['runGameplaySim','renderFn','updateHumanControl','resetActionBuffer','InputManager','readInput','snapshotKeys','assignInputSources','remapMoveForCamera','handleRightStickSwitch','executeFakeShot','isStandardPad','effortTouch','executeKick','updatePendingKick']);

function buildModule(body, extraImports = [], { excludeFromState = BRIDGE } = {}) {
  body = dedupeTopLevelFunctions(body);
  const defined = collectDefined(body);
  const needed = [...new Set([...collectUsed(body)].filter(n =>
    (stateExports.has(n) || BRIDGE.has(n)) &&
    !excludeFromState.has(n) &&
    !defined.has(n) &&
    !JS_KW.has(n) && !GLOBALS.has(n) &&
    (n.length >= 3 || /^[A-Z_][A-Z0-9_]*$/.test(n))
  ))].sort();
  const imports = [];
  for (let i = 0; i < needed.length; i += 40) {
    imports.push(`import { ${needed.slice(i, i + 40).join(', ')} } from './state.js';`);
  }
  const fns = [];
  for (const line of body.split('\n')) {
    const mm = line.match(/^function ([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (mm) fns.push(mm[1]);
  }
  for (const line of body.split('\n')) {
    const mm = line.match(/^const (InputManager|SetPieceManager|Keys|KB_P1_SOLO|KB_P1_SHARED|KB_P2|fieldBoundary|stadiumBounds|OutZone|BoundaryWalls|GOAL_FRAMES)\s*=/);
    if (mm) fns.push(mm[1]);
  }
  const exp = fns.length ? `\nexport { ${[...new Set(fns)].join(', ')} };\n` : '';
  return ['"use strict";', ...extraImports, ...imports, body + exp].filter(Boolean).join('\n\n') + '\n';
}

function fixCrossModuleAssignments(code) {
  return code
    .replace(/\bgameState\s*=\s*'match'/g, "setGameState('match')")
    .replace(/\bgameState\s*=\s*'celebration_run'/g, "setGameState('celebration_run')")
    .replace(/\bisPaused\s*=\s*false/g, 'setIsPaused(false)')
    .replace(/\bisCelebrationMode\s*=\s*true/g, 'setIsCelebrationMode(true)')
    .replace(/\bisCelebrationMode\s*=\s*false/g, 'setIsCelebrationMode(false)');
}

const physicsBodyFixed = fixCrossModuleAssignments(physicsBody);
const physicsBodyDeduped = dedupeTopLevelFunctions(physicsBodyFixed);
const physicsSyms = [...new Set([...physicsBodyDeduped.matchAll(/^function ([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)].map(m => m[1]))];
const physicsImports = [];
for (let i = 0; i < physicsSyms.length; i += 60) {
  physicsImports.push(`import { ${physicsSyms.slice(i, i + 60).join(', ')} } from './physics.js';`);
}

fs.writeFileSync(path.join(ROOT, 'input.js'), buildModule(inputBody));
fs.writeFileSync(path.join(ROOT, 'physics.js'), buildModule(physicsBodyFixed));
fs.writeFileSync(path.join(ROOT, 'gameplay.js'), buildModule(gameplayBody, [
  "import { updateHumanControl, readInput, snapshotKeys, remapMoveForCamera, handleRightStickSwitch } from './state.js';",
  "import { assignInputSources, updateFakeShotState, isBallAerialLoose, KB_P1_SOLO, KB_P1_SHARED, KB_P2, updateSelfTouchCollectBlock } from './input.js';",
  "import { isControlledByHuman } from './render.js';",
  ...physicsImports,
], { excludeFromState: new Set([...BRIDGE, ...CROSS_PHYSICS, ...CROSS_GAMEPLAY]) }));
fs.writeFileSync(path.join(ROOT, 'render.js'), buildModule(renderBody));

// ── main.js: entry point delgado ───────────────────────────────────────────
const mainJs = `"use strict";

import {
  GLOBAL_TIME_SCALE, Game, gameState, isPaused,
  ball, CAM, PCAM, FIELD_L, lastTs, lastDt, practicePlayer,
  clamp, lerp,
  resetMatchForStart, setupPractice, resetPractice, updateClock, endMatch, bindBallBeforeRender,
  setLastTs, setLastDt, setGameState, setIsPaused,
} from './state.js';

const CAM_PAN_LERP = 0.055;
const CAM_CELEB_PAN_LERP = 0.14;
const PCAM_PAN_LERP = 0.09;

// ── Menú / pausa (sin export anidados) ────────────────────────────────────
const MENU_NAV_COOLDOWN_MS = 200;
const PAUSE_TOGGLE_COOLDOWN_MS = 350;
const PAUSE_MENU_STICK_DEAD = 0.5;
const MAIN_MENU_OPTION_COUNT = 3;
const PAUSE_MENU_OPTION_COUNT = 3;

let currentMenuOption = 0;
let menuFocusIndex = 0;
let menuNavCooldown = 0;
let pauseNavCooldown = 0;
let pauseToggleCooldown = 0;
let prevMenuGamepad = { up:false, down:false, confirm:false };
let prevPauseGamepad = { up:false, down:false, confirm:false, cancel:false, start:false };
let lastMenuLoopTs = null;

const mode1pBtn = document.getElementById('mode1pBtn');
const mode2pBtn = document.getElementById('mode2pBtn');
const practiceBtn = document.getElementById('practiceBtn');
const startgridSolo = document.getElementById('startgridSolo');
const startgridDuo = document.getElementById('startgridDuo');
const swapPadBtn = document.getElementById('swapPadBtn');
const pauseOverlayEl = document.getElementById('pauseOverlay');
const pauseContinueBtn = document.getElementById('pauseContinueBtn');
const pauseRestartBtn = document.getElementById('pauseRestartBtn');
const pauseMenuBtn = document.getElementById('pauseMenuBtn');
const pauseOptionEls = [pauseContinueBtn, pauseRestartBtn, pauseMenuBtn];
const startScreenEl = document.getElementById('startScreen');

function syncPausedState(v) { setIsPaused(v); Game.paused = v; }
function showPauseMenu() { pauseOverlayEl.style.display = 'flex'; }
function hidePauseMenu() { pauseOverlayEl.style.display = 'none'; }

// Referencias asignadas en boot() — evita imports circulares
let _runGameplaySim = null;
let _renderFn = null;
let _bindBallBeforeRender = null;
let _assignInputSources = null;
let _updateCelebration = null;

function selectMode(twoP) {
  Game.twoPlayerMode = twoP;
  Game.padsLocked = false;
  mode1pBtn.classList.toggle('active', !twoP);
  mode2pBtn.classList.toggle('active', twoP);
  startgridSolo.style.display = twoP ? 'none' : 'flex';
  startgridDuo.style.display = twoP ? 'flex' : 'none';
  if (typeof _assignInputSources === 'function') _assignInputSources();
}

function updateMainMenuSelectionVisual() {
  mode1pBtn.classList.toggle('selected', currentMenuOption === 0);
  mode2pBtn.classList.toggle('selected', currentMenuOption === 1);
  practiceBtn.classList.toggle('selected', currentMenuOption === 2);
  if (currentMenuOption === 0) selectMode(false);
  else if (currentMenuOption === 1) selectMode(true);
}

function updatePauseMenuSelectionVisual() {
  pauseOptionEls.forEach((btn, i) => {
    const focused = i === menuFocusIndex;
    btn.classList.toggle('selected', focused);
    btn.classList.toggle('active', focused);
  });
}

function isPadStandard(pad) { return !!pad && pad.mapping === 'standard'; }

function getFirstStandardGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    if (isPadStandard(pads[i])) return pads[i];
  }
  return null;
}

function readGamepadMenuEdges(pad, prev) {
  const stickY = pad.axes[1] || 0;
  const up = !!(pad.buttons[12] && pad.buttons[12].pressed) || stickY < -PAUSE_MENU_STICK_DEAD;
  const down = !!(pad.buttons[13] && pad.buttons[13].pressed) || stickY > PAUSE_MENU_STICK_DEAD;
  const confirm = !!(pad.buttons[0] && pad.buttons[0].pressed);
  const cancel = !!(pad.buttons[1] && pad.buttons[1].pressed);
  const start = !!(pad.buttons[9] && pad.buttons[9].pressed);
  const edges = { up: up && !prev.up, down: down && !prev.down, confirm: confirm && !prev.confirm, cancel: cancel && !prev.cancel, start: start && !prev.start };
  prev.up = up; prev.down = down; prev.confirm = confirm; prev.cancel = cancel; prev.start = start;
  return edges;
}

function stepMenuOption(idx, dir, count) { return (idx + dir + count) % count; }

function startMatchFromMenu() {
  document.getElementById('startScreen').style.display = 'none';
  Game.padsLocked = true;
  Game.running = true;
  resetMatchForStart();
  if (typeof _assignInputSources === 'function') _assignInputSources();
}

function startPracticeFromMenu() {
  document.getElementById('startScreen').style.display = 'none';
  setupPractice();
}

function returnToMainMenu() {
  Game.running = false;
  setGameState('menu');
  document.getElementById('startScreen').style.display = '';
  document.getElementById('practiceLabel').style.display = 'none';
  document.getElementById('practiceHud').style.display = 'none';
  document.getElementById('scoreboard').style.display = '';
}

function pauseGame() { syncPausedState(true); showPauseMenu(); menuFocusIndex = 0; updatePauseMenuSelectionVisual(); }
function resumeFromPause() { syncPausedState(false); hidePauseMenu(); }

function executePauseMenuOption(index) {
  if (index === 0) resumeFromPause();
  else if (index === 1) { hidePauseMenu(); syncPausedState(false); resetMatchForStart(); startMatchFromMenu(); }
  else returnToMainMenu();
}

function executeMainMenuOption(index) {
  if (index === 0) { selectMode(false); startMatchFromMenu(); }
  else if (index === 1) { selectMode(true); startMatchFromMenu(); }
  else startPracticeFromMenu();
}

function handleMenuNavigation(pad, rawDt) {
  menuNavCooldown = Math.max(0, menuNavCooldown - rawDt * 1000);
  const edges = readGamepadMenuEdges(pad, prevMenuGamepad);
  if (menuNavCooldown <= 0) {
    if (edges.up) { currentMenuOption = stepMenuOption(currentMenuOption, -1, MAIN_MENU_OPTION_COUNT); menuNavCooldown = MENU_NAV_COOLDOWN_MS; updateMainMenuSelectionVisual(); }
    else if (edges.down) { currentMenuOption = stepMenuOption(currentMenuOption, 1, MAIN_MENU_OPTION_COUNT); menuNavCooldown = MENU_NAV_COOLDOWN_MS; updateMainMenuSelectionVisual(); }
  }
  if (edges.confirm) executeMainMenuOption(currentMenuOption);
}

function processMainMenuGamepad(ts) {
  if (lastMenuLoopTs === null) lastMenuLoopTs = ts;
  const rawDt = Math.min((ts - lastMenuLoopTs) / 1000, 0.033);
  lastMenuLoopTs = ts;
  const pad = getFirstStandardGamepad();
  if (pad) handleMenuNavigation(pad, rawDt);
}

function updatePauseGamepad(rawDt) {
  if (!Game.running || gameState === 'menu' || Game.matchEnded || Game.celebration || gameState === 'celebration_run') return;
  pauseToggleCooldown = Math.max(0, pauseToggleCooldown - rawDt * 1000);
  const pad = getFirstStandardGamepad();
  if (!pad) return;
  if (isPaused) { handleMenuNavigation(pad, rawDt); return; }
  const edges = readGamepadMenuEdges(pad, prevPauseGamepad);
  if (edges.start && pauseToggleCooldown <= 0) { pauseGame(); pauseToggleCooldown = PAUSE_TOGGLE_COOLDOWN_MS; }
}

function startScreenPadLoop(ts) {
  if (startScreenEl.style.display !== 'none') {
    if (typeof _assignInputSources === 'function') _assignInputSources();
    processMainMenuGamepad(ts || performance.now());
    requestAnimationFrame(startScreenPadLoop);
  } else {
    lastMenuLoopTs = null;
  }
}

function initAppChrome() {
  mode1pBtn.addEventListener('click', () => { currentMenuOption = 0; selectMode(false); updateMainMenuSelectionVisual(); });
  mode2pBtn.addEventListener('click', () => { currentMenuOption = 1; selectMode(true); updateMainMenuSelectionVisual(); });
  swapPadBtn.addEventListener('click', () => { Game.padSwap = !Game.padSwap; if (typeof _assignInputSources === 'function') _assignInputSources(); });
  document.getElementById('startBtn').addEventListener('click', () => executeMainMenuOption(Game.twoPlayerMode ? 1 : 0));
  document.getElementById('practiceBtn').addEventListener('click', () => { currentMenuOption = 2; updateMainMenuSelectionVisual(); startPracticeFromMenu(); });
  pauseContinueBtn.addEventListener('click', () => executePauseMenuOption(0));
  pauseRestartBtn.addEventListener('click', () => executePauseMenuOption(1));
  pauseMenuBtn.addEventListener('click', () => executePauseMenuOption(2));
  pauseOptionEls.forEach((btn, i) => {
    btn.addEventListener('mouseenter', () => { menuFocusIndex = i; updatePauseMenuSelectionVisual(); });
  });
  document.getElementById('practiceResetBtn').addEventListener('click', () => { if (gameState === 'practice') resetPractice(); });
  document.getElementById('practiceMenuBtn').addEventListener('click', () => returnToMainMenu());
}

// ── Loop principal ────────────────────────────────────────────────────────
function isEffortBallCameraLocked() { return false; }

function getEffortCameraFocusPlayer() {
  if (ball.lastAction !== 'effort' && ball.lastAction !== 'feint') return null;
  const owner = ball.owner;
  if (!owner || owner.effortTouchCooldown <= 0 && owner.dribbleExtendT <= 0) return null;
  return owner;
}

function updateCelebrationCamera() {
  const scorer = Game.celebration?.scorer;
  if (!scorer) return;
  CAM.x = lerp(CAM.x, clamp(scorer.x, 10, FIELD_L - 10), CAM_CELEB_PAN_LERP);
}

function tick(ts) {
  requestAnimationFrame(tick);
  if (!Game.running) { setLastTs(null); return; }
  if (lastTs === null) setLastTs(ts);
  let rawDt = (ts - lastTs) / 1000;
  setLastTs(ts);
  rawDt = Math.min(rawDt, 0.033);
  const dt = rawDt * GLOBAL_TIME_SCALE;
  setLastDt(dt);

  updatePauseGamepad(rawDt);

  if (Game.celebration && typeof _updateCelebration === 'function') _updateCelebration(dt);

  if (!isPaused && !Game.paused) {
    if (gameState === 'practice' || gameState === 'celebration_run') {
      if (typeof _runGameplaySim === 'function') _runGameplaySim(dt, rawDt);
    } else if (!Game.matchEnded) {
      Game.time -= rawDt;
      if (Game.time < 0) Game.time = 0;
      updateClock();
      if (Game.time <= 0) endMatch();
      else if (typeof _runGameplaySim === 'function') _runGameplaySim(dt, rawDt);
    }
  }

  if (gameState === 'practice') {
    PCAM.x = lerp(PCAM.x, practicePlayer.x - PCAM.behind, PCAM_PAN_LERP);
    PCAM.laneY = lerp(PCAM.laneY, practicePlayer.y, PCAM_PAN_LERP);
  } else if (gameState === 'celebration_run' && Game.celebrationRun?.scorer) {
    const scorer = Game.celebrationRun.scorer;
    CAM.x = lerp(CAM.x, clamp(scorer.x, 10, FIELD_L - 10), CAM_CELEB_PAN_LERP);
  } else if (Game.celebration) {
    updateCelebrationCamera();
  } else {
    const effortFocus = getEffortCameraFocusPlayer();
    let targetCamX;
    if (effortFocus) targetCamX = clamp(effortFocus.x, 10, FIELD_L - 10);
    else if (!isEffortBallCameraLocked()) targetCamX = clamp(ball.x + ball.vx * 0.35, 10, FIELD_L - 10);
    else targetCamX = CAM.x;
    CAM.x = lerp(CAM.x, targetCamX, CAM_PAN_LERP);
  }

  if (typeof _bindBallBeforeRender === 'function') _bindBallBeforeRender();
  if (typeof _renderFn === 'function') _renderFn();
}

async function boot() {
  const state = await import('./state.js');
  const input = await import('./input.js');
  const physics = await import('./physics.js');
  const gameplay = await import('./gameplay.js');
  const renderMod = await import('./render.js');

  _runGameplaySim = gameplay.runGameplaySim;
  _renderFn = renderMod.render;
  _bindBallBeforeRender = bindBallBeforeRender;
  _assignInputSources = input.assignInputSources;
  _updateCelebration = gameplay.updateCelebration ?? null;

  state.wireBridge({
    runGameplaySim: gameplay.runGameplaySim,
    renderFn: renderMod.render,
    assignInputSources: input.assignInputSources,
    snapshotKeys: input.snapshotKeys,
    updateHumanControl: input.updateHumanControl,
    resetActionBuffer: input.resetActionBuffer,
    InputManager: input.InputManager,
    readInput: input.readInput,
    remapMoveForCamera: input.remapMoveForCamera,
    handleRightStickSwitch: input.handleRightStickSwitch,
    executeFakeShot: input.executeFakeShot,
    isStandardPad: input.isStandardPad,
    effortTouch: input.effortTouch,
    executeKick: input.executeKick,
    updatePendingKick: input.updatePendingKick,
${CROSS_PHYSICS.map(n => `    ${n}: physics.${n},`).join('\n')}
${CROSS_GAMEPLAY.map(n => `    ${n}: gameplay.${n},`).join('\n')}
  });

  initAppChrome();
  updateMainMenuSelectionVisual();
  requestAnimationFrame(startScreenPadLoop);
  requestAnimationFrame(tick);
}

boot();
`;

fs.writeFileSync(path.join(ROOT, 'main.js'), mainJs);

// index.html
const indexHtml = html
  .replace(/<title>[^<]*<\/title>/, '<title>Manual Fútbol — Modular</title>')
  .replace(/<script>[\s\S]*?<\/script>/, '<script type="module" src="main.js"></script>');
fs.writeFileSync(path.join(ROOT, 'index.html'), indexHtml);

console.log('Generated: state.js, main.js (entry), input.js, physics.js, gameplay.js, render.js, index.html');
