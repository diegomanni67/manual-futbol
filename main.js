"use strict";

import {
  GLOBAL_TIME_SCALE, Game, gameState, isPaused,
  ball, CAM, PCAM, FIELD_L, lastTs, lastDt, practicePlayer,
  clamp, lerp,
  resetMatchForStart, setupPractice, resetPractice, updateClock, endMatch, bindBallBeforeRender,
  setLastTs, setLastDt, setGameState, setIsPaused,
  setControlled, setControlled2, nearestToBall,
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
  document.getElementById('scoreboard').style.display = 'flex';
  document.getElementById('practiceHud').style.display = 'none';
  document.getElementById('practiceLabel').style.display = 'none';
  Game.padsLocked = true;
  resetMatchForStart();
  if (typeof nearestToBall === 'function') setControlled(nearestToBall('home'));
  if (Game.twoPlayerMode && typeof nearestToBall === 'function') setControlled2(nearestToBall('away'));
  Game.running = true;
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
    startKickoffManeuver: input.startKickoffManeuver,
    updatePendingKick: input.updatePendingKick,
    hideGoalOverlay: physics.hideGoalOverlay,
    resetGoalZoneTracking: physics.resetGoalZoneTracking,
    movePlayer: physics.movePlayer,
    applyTackleCarryInertia: physics.applyTackleCarryInertia,
    defendingTeamForGoalLine: physics.defendingTeamForGoalLine,
    getGoalAreaFrictionMult: physics.getGoalAreaFrictionMult,
    getGoalNetFrictionMult: physics.getGoalNetFrictionMult,
    getGoalNetSide: physics.getGoalNetSide,
    GOAL_FRAMES: physics.GOAL_FRAMES,
    getOutZoneFrictionMult: physics.getOutZoneFrictionMult,
    isBallInsideGoalVolume: physics.isBallInsideGoalVolume,
    onBallOut: physics.onBallOut,
    updateGoalNetTriggerPhysics: physics.updateGoalNetTriggerPhysics,
    resolveCollisions: gameplay.resolveCollisions,
    canCpuReceivePass: gameplay.canCpuReceivePass,
    canCpuSeekLooseBall: gameplay.canCpuSeekLooseBall,
    clearInterceptionSeek: gameplay.clearInterceptionSeek,
    clearPassTargetIfPlayer: gameplay.clearPassTargetIfPlayer,
    clearPassTargetTeam: gameplay.clearPassTargetTeam,
    enforceCpuNoCarrierChase: gameplay.enforceCpuNoCarrierChase,
    getPassTargetId: gameplay.getPassTargetId,
    getPlayerById: gameplay.getPlayerById,
    isCpuPlayer: gameplay.isCpuPlayer,
    isHumanTeam: gameplay.isHumanTeam,
    nearestToBall: gameplay.nearestToBall,
    resetNearestPlayerSelection: gameplay.resetNearestPlayerSelection,
    showBanner: gameplay.showBanner,
    predictBallLanding: input.predictBallLanding,
    findPassReceiverByIntent: input.findPassReceiverByIntent,
    getAerialPositionTarget: input.getAerialPositionTarget,
    isBallAerialLoose: input.isBallAerialLoose,
    clearChargingShotState: input.clearChargingShotState,
    clearPendingAction: input.clearPendingAction,
    completeFakeShot: input.completeFakeShot,
    notifyManualRunPossessionChange: input.notifyManualRunPossessionChange,
    triggerGoalkeeperKick: input.triggerGoalkeeperKick,
    resolveSelfTouchDirection: input.resolveSelfTouchDirection,
    tryExecuteBufferedActionOnPossession: input.tryExecuteBufferedActionOnPossession,
    readRightStick: input.readRightStick,
    anyKey: input.anyKey,
    anyKeyPrev: input.anyKeyPrev,
    isControlledByHuman: renderMod.isControlledByHuman,
  });

  initAppChrome();
  updateMainMenuSelectionVisual();
  requestAnimationFrame(startScreenPadLoop);
  requestAnimationFrame(tick);
}

boot();
