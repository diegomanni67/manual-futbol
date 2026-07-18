"use strict";

import {
  GLOBAL_TIME_SCALE, Game, gameState, isPaused,
  ball, CAM, PCAM, FIELD_L, lastTs, lastDt, practicePlayer,
  clamp, lerp, updateCameraZoom,
  resetMatchForStart, setupPractice, resetPractice, updateClock, endMatch, bindBallBeforeRender,
  setLastTs, setLastDt, setGameState, setIsPaused, setGameMode,
  setControlled, setControlled2, nearestToBall,
} from './state.js';

import {
  UI_MENU, initInputRouter, setUIMenu, routeInput, tickMenuScreenLoop,
  resetMenuScreenLoopClock, flushInputEvents, getActiveUIMenu,
  enableUINavigationMode, syncMenuGamepadBaseline,
} from './inputRouter.js';

/** Fallbacks en window por si algún módulo de input aún no enlazó state.js. */
function initInputEngineFallbacks(){
  if(typeof window === 'undefined') return;
  if(typeof window.isPlayerAssignmentLocked !== 'function'){
    window.isPlayerAssignmentLocked = (p) => !!(p && p.lockPlayerAssignment);
  }
  if(typeof window.isPlayerSwitchLockedForEffort !== 'function'){
    window.isPlayerSwitchLockedForEffort = () => false;
  }
}
initInputEngineFallbacks();

const CAM_PAN_LERP = 0.055;
const CAM_CELEB_PAN_LERP = 0.14;
const PCAM_PAN_LERP = 0.09;

const MAIN_MENU_OPTION_COUNT = 3;
const PAUSE_MENU_OPTION_COUNT = 3;
const FORMAT_MENU_OPTION_COUNT = 2;

let currentMenuOption = 0;
let menuFocusIndex = 0;
let formatMenuOption = 0;

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
const formatScreenEl = document.getElementById('formatScreen');
const format6Btn = document.getElementById('format6Btn');
const format11Btn = document.getElementById('format11Btn');
const formatBackBtn = document.getElementById('formatBackBtn');
const formatOptionEls = [format6Btn, format11Btn];

function syncPausedState(v) { setIsPaused(v); Game.paused = v; }
function showPauseMenu() { pauseOverlayEl.style.display = 'flex'; }
function hidePauseMenu() { pauseOverlayEl.style.display = 'none'; }

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

function updateFormatMenuSelectionVisual() {
  formatOptionEls.forEach((btn, i) => {
    btn.classList.toggle('selected', i === formatMenuOption);
    btn.classList.toggle('active', i === formatMenuOption);
  });
}

function isPadStandard(pad) { return !!pad && pad.mapping === 'standard'; }

function getFirstMenuGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  if (Game.p1PadIndex != null && pads[Game.p1PadIndex]) return pads[Game.p1PadIndex];
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) return pads[i];
  }
  return null;
}

function getFirstStandardGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    if (isPadStandard(pads[i])) return pads[i];
  }
  return getFirstMenuGamepad();
}

function startMatchFromMenu() {
  document.getElementById('startScreen').style.display = 'none';
  if (formatScreenEl) formatScreenEl.style.display = 'none';
  document.getElementById('scoreboard').style.display = 'flex';
  document.getElementById('practiceHud').style.display = 'none';
  document.getElementById('practiceLabel').style.display = 'none';
  setUIMenu(UI_MENU.NONE);
  resetMenuScreenLoopClock();
  Game.padsLocked = true;
  resetMatchForStart();
  if (typeof nearestToBall === 'function') setControlled(nearestToBall('home'));
  if (Game.twoPlayerMode && typeof nearestToBall === 'function') setControlled2(nearestToBall('away'));
  Game.running = true;
  flushInputEvents();
  if (typeof _assignInputSources === 'function') _assignInputSources();
}

function showFormatScreen() {
  document.getElementById('startScreen').style.display = 'none';
  formatScreenEl.style.display = 'flex';
  formatMenuOption = 0;
  updateFormatMenuSelectionVisual();
  setUIMenu(UI_MENU.FORMAT);
}

function hideFormatScreen() {
  formatScreenEl.style.display = 'none';
  document.getElementById('startScreen').style.display = '';
  setUIMenu(UI_MENU.MAIN);
}

function startMatchWithFormat(modeId) {
  setGameMode(modeId);
  startMatchFromMenu();
}

function startPracticeFromMenu() {
  document.getElementById('startScreen').style.display = 'none';
  setUIMenu(UI_MENU.NONE);
  resetMenuScreenLoopClock();
  flushInputEvents();
  setupPractice();
}

function returnToMainMenu() {
  Game.running = false;
  setGameState('menu');
  syncPausedState(false);
  hidePauseMenu();
  document.getElementById('startScreen').style.display = '';
  if (formatScreenEl) formatScreenEl.style.display = 'none';
  document.getElementById('practiceLabel').style.display = 'none';
  document.getElementById('practiceHud').style.display = 'none';
  document.getElementById('scoreboard').style.display = '';
  setUIMenu(UI_MENU.MAIN);
}

function pauseGame() {
  syncPausedState(true);
  showPauseMenu();
  menuFocusIndex = 0;
  updatePauseMenuSelectionVisual();
  setUIMenu(UI_MENU.PAUSE);
}

function resumeFromPause() {
  hidePauseMenu();
  syncPausedState(false);
  setUIMenu(UI_MENU.NONE);
  flushInputEvents();
}

function executePauseMenuOption(index) {
  if (index === 0) resumeFromPause();
  else if (index === 1) { hidePauseMenu(); syncPausedState(false); setUIMenu(UI_MENU.NONE); flushInputEvents(); setGameMode(Game.matchFormat || '6vs6'); startMatchFromMenu(); }
  else returnToMainMenu();
}

function executeMainMenuOption(index) {
  if (index === 0) { selectMode(false); setGameMode('6vs6'); startMatchFromMenu(); }
  else if (index === 1) { selectMode(true); showFormatScreen(); }
  else startPracticeFromMenu();
}

function executeFormatMenuOption(index) {
  startMatchWithFormat(index === 0 ? '6vs6' : '11vs11');
}

function tickMenuInput(ts) {
  const formatVisible = formatScreenEl && formatScreenEl.style.display !== 'none';
  const mainVisible = startScreenEl.style.display !== 'none';
  if (!mainVisible && !formatVisible) {
    resetMenuScreenLoopClock();
    return;
  }
  if (typeof _assignInputSources === 'function') _assignInputSources();
  if (formatVisible && getActiveUIMenu() !== UI_MENU.FORMAT) setUIMenu(UI_MENU.FORMAT);
  else if (mainVisible && getActiveUIMenu() !== UI_MENU.MAIN) setUIMenu(UI_MENU.MAIN);
  tickMenuScreenLoop(ts);
}

function initAppChrome() {
  mode1pBtn.addEventListener('click', () => { currentMenuOption = 0; selectMode(false); updateMainMenuSelectionVisual(); });
  mode2pBtn.addEventListener('click', () => { currentMenuOption = 1; selectMode(true); updateMainMenuSelectionVisual(); });
  swapPadBtn.addEventListener('click', () => { Game.padSwap = !Game.padSwap; if (typeof _assignInputSources === 'function') _assignInputSources(); });
  document.getElementById('startBtn').addEventListener('click', () => executeMainMenuOption(Game.twoPlayerMode ? 1 : 0));
  format6Btn.addEventListener('click', () => { formatMenuOption = 0; updateFormatMenuSelectionVisual(); startMatchWithFormat('6vs6'); });
  format11Btn.addEventListener('click', () => { formatMenuOption = 1; updateFormatMenuSelectionVisual(); startMatchWithFormat('11vs11'); });
  formatBackBtn.addEventListener('click', () => hideFormatScreen());
  formatOptionEls.forEach((btn, i) => {
    btn.addEventListener('mouseenter', () => { formatMenuOption = i; updateFormatMenuSelectionVisual(); });
  });
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

  tickMenuInput(ts);

  if (Game.running) {
    if (lastTs === null) setLastTs(ts);
    let rawDt = (ts - lastTs) / 1000;
    setLastTs(ts);
    rawDt = Math.min(rawDt, 0.033);
    const dt = rawDt * GLOBAL_TIME_SCALE;
    setLastDt(dt);

    routeInput(rawDt);

    if (Game.celebration && typeof _updateCelebration === 'function') _updateCelebration(dt);

    if (!isPaused && !Game.paused) {
      try {
        if (gameState === 'practice' || gameState === 'celebration_run') {
          if (typeof _runGameplaySim === 'function') _runGameplaySim(dt, rawDt);
        } else if (!Game.matchEnded) {
          Game.time -= rawDt;
          if (Game.time < 0) Game.time = 0;
          updateClock();
          if (Game.time <= 0) endMatch();
          else if (typeof _runGameplaySim === 'function') _runGameplaySim(dt, rawDt);
        }
      } catch (err) {
        console.error('[tick] Error en simulación de gameplay:', err);
        if (typeof _bindBallBeforeRender === 'function') _bindBallBeforeRender();
        if (typeof _renderFn === 'function') _renderFn();
      }
    }
  } else {
    setLastTs(null);
    // UI_Controller tiene prioridad aunque el partido no esté corriendo (menú / formato).
    if (getActiveUIMenu() !== UI_MENU.NONE) routeInput(0.016);
  }

  if (Game.running) {
    if (gameState === 'practice') {
      PCAM.x = lerp(PCAM.x, practicePlayer.x - PCAM.behind, PCAM_PAN_LERP);
      PCAM.laneY = lerp(PCAM.laneY, practicePlayer.y, PCAM_PAN_LERP);
    } else if (gameState === 'celebration_run' && Game.celebrationRun?.scorer) {
      const scorer = Game.celebrationRun.scorer;
      CAM.x = lerp(CAM.x, clamp(scorer.x, 10, FIELD_L - 10), CAM_CELEB_PAN_LERP);
    } else if (Game.celebration) {
      updateCelebrationCamera();
    } else {
      updateCameraZoom();
      const effortFocus = getEffortCameraFocusPlayer();
      let targetCamX;
      if (effortFocus) targetCamX = clamp(effortFocus.x, 10, FIELD_L - 10);
      else if (!isEffortBallCameraLocked()) targetCamX = clamp(ball.x + ball.vx * 0.35, 10, FIELD_L - 10);
      else targetCamX = CAM.x;
      CAM.x = lerp(CAM.x, targetCamX, CAM_PAN_LERP);
    }
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

  if(typeof window !== 'undefined'){
    window.isPlayerAssignmentLocked = state.isPlayerAssignmentLocked;
    window.isPlayerSwitchLockedForEffort = state.isPlayerSwitchLockedForEffort;
  }

  initInputRouter({
    getFirstPad: () => input.getFirstNavigationGamepad(),
    clearInputBuffer: () => input.clearInputBuffer(),
    focusMain: () => { document.getElementById('startBtn')?.focus?.(); },
    focusFormat: () => { format6Btn?.focus?.(); },
    focusPause: () => { pauseContinueBtn?.focus?.(); },
    onMainConfirm: executeMainMenuOption,
    onFormatConfirm: executeFormatMenuOption,
    onFormatCancel: hideFormatScreen,
    onPauseConfirm: executePauseMenuOption,
    onPauseRequest: pauseGame,
    getMainFocus: () => currentMenuOption,
    setMainFocus: (i) => { currentMenuOption = i; if (i === 0) selectMode(false); else if (i === 1) selectMode(true); },
    getFormatFocus: () => formatMenuOption,
    setFormatFocus: (i) => { formatMenuOption = i; },
    getPauseFocus: () => menuFocusIndex,
    setPauseFocus: (i) => { menuFocusIndex = i; },
    mainOptionCount: MAIN_MENU_OPTION_COUNT,
    formatOptionCount: FORMAT_MENU_OPTION_COUNT,
    pauseOptionCount: PAUSE_MENU_OPTION_COUNT,
    refreshMainVisual: updateMainMenuSelectionVisual,
    refreshFormatVisual: updateFormatMenuSelectionVisual,
    refreshPauseVisual: updatePauseMenuSelectionVisual,
  });

  input.setGamepadConnectUIHandler(() => {
    enableUINavigationMode();
    input.resetGamepadState();
    syncMenuGamepadBaseline(input.getFirstNavigationGamepad());
  });

  setUIMenu(UI_MENU.MAIN);

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
    checkActionExecution: input.checkActionExecution,
    rebuildFieldGeometry: physics.rebuildFieldGeometry,
    readRightStick: input.readRightStick,
    anyKey: input.anyKey,
    anyKeyPrev: input.anyKeyPrev,
    isControlledByHuman: renderMod.isControlledByHuman,
  });

  initAppChrome();
  updateMainMenuSelectionVisual();
  if (typeof _bindBallBeforeRender === 'function') _bindBallBeforeRender();
  if (typeof _renderFn === 'function') _renderFn();
  requestAnimationFrame(tick);
}

boot();
