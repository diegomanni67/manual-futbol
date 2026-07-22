"use strict";

import {
  UI_MENU, initInputRouter, setUIMenu, routeInput, tickMenuScreenLoop,
  resetMenuScreenLoopClock, flushInputEvents, getActiveUIMenu,
  enableUINavigationMode, syncMenuGamepadBaseline,
} from './inputRouter.js';

// Variable global de Socket.io
let socket = null;

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

const CAM_PAN_LERP = 0.11;
const CAM_CELEB_PAN_LERP = 0.14;
const PCAM_PAN_LERP = 0.09;

const MAIN_MENU_OPTION_COUNT = 2;
const PAUSE_MENU_OPTION_COUNT = 3;
const FORMAT_MENU_OPTION_COUNT = 2;

let currentMenuOption = 0;
let menuFocusIndex = 0;
let formatMenuOption = 0;

const mode1pBtn = document.getElementById('mode1pBtn');
const mode2pBtn = document.getElementById('mode2pBtn');
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

function syncPausedState(v) { window.setIsPaused?.(v); if(window.Game) window.Game.paused = v; }
function showPauseMenu() { pauseOverlayEl.style.display = 'flex'; }
function hidePauseMenu() { pauseOverlayEl.style.display = 'none'; }

let _runGameplaySim = null;
let _renderFn = null;
let _bindBallBeforeRender = null;
let _assignInputSources = null;
let _updateCelebration = null;
let _refreshPlayerSelectionHud = null;

function selectMode(twoP) {
  if (window.Game) {
    window.Game.twoPlayerMode = twoP;
    window.Game.padsLocked = false;
  }
  if (mode1pBtn) mode1pBtn.classList.toggle('active', !twoP);
  if (mode2pBtn) mode2pBtn.classList.toggle('active', twoP);
  if (startgridSolo) startgridSolo.style.display = twoP ? 'none' : 'flex';
  if (startgridDuo) startgridDuo.style.display = twoP ? 'flex' : 'none';
  if (typeof _assignInputSources === 'function') _assignInputSources();
}

function updateMainMenuSelectionVisual() {
  if (mode1pBtn) mode1pBtn.classList.toggle('selected', currentMenuOption === 0);
  if (mode2pBtn) mode2pBtn.classList.toggle('selected', currentMenuOption === 1);
  if (currentMenuOption === 0) selectMode(false);
  else if (currentMenuOption === 1) selectMode(true);
}

function updatePauseMenuSelectionVisual() {
  pauseOptionEls.forEach((btn, i) => {
    if (btn) {
      const focused = i === menuFocusIndex;
      btn.classList.toggle('selected', focused);
      btn.classList.toggle('active', focused);
    }
  });
}

function updateFormatMenuSelectionVisual() {
  formatOptionEls.forEach((btn, i) => {
    if (btn) {
      const focused = i === formatMenuOption;
      btn.classList.toggle('selected', focused);
      btn.classList.toggle('active', focused);
    }
  });
}

function isPadStandard(pad) { return !!pad && pad.mapping === 'standard'; }

function getFirstMenuGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  if (window.Game?.p1PadIndex != null && pads[window.Game.p1PadIndex]) return pads[window.Game.p1PadIndex];
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
  if (startScreenEl) startScreenEl.style.display = 'none';
  if (formatScreenEl) formatScreenEl.style.display = 'none';
  const scoreboard = document.getElementById('scoreboard');
  if (scoreboard) scoreboard.style.display = 'flex';
  const practiceHud = document.getElementById('practiceHud');
  if (practiceHud) practiceHud.style.display = 'none';
  const practiceLabel = document.getElementById('practiceLabel');
  if (practiceLabel) practiceLabel.style.display = 'none';
  
  setUIMenu(UI_MENU.NONE);
  resetMenuScreenLoopClock();
  if (window.Game) window.Game.padsLocked = true;
  window.resetMatchForStart?.();
  if (typeof window.nearestToBall === 'function') window.setControlled?.(window.nearestToBall('home'));
  if (window.Game?.twoPlayerMode && typeof window.nearestToBall === 'function') window.setControlled2?.(window.nearestToBall('away'));
  if (window.Game) window.Game.running = true;
  flushInputEvents();
  if (typeof _assignInputSources === 'function') _assignInputSources();
}

function showFormatScreen() {
  if (startScreenEl) startScreenEl.style.display = 'none';
  if (formatScreenEl) formatScreenEl.style.display = 'flex';
  formatMenuOption = 0;
  updateFormatMenuSelectionVisual();
  setUIMenu(UI_MENU.FORMAT);
}

function hideFormatScreen() {
  if (formatScreenEl) formatScreenEl.style.display = 'none';
  if (startScreenEl) startScreenEl.style.display = '';
  setUIMenu(UI_MENU.MAIN);
}

function startMatchWithFormat(modeId) {
  window.setGameMode?.(modeId);
  startMatchFromMenu();
}

function returnToMainMenu() {
  if (window.Game) window.Game.running = false;
  window.setGameState?.('menu');
  syncPausedState(false);
  hidePauseMenu();
  if (startScreenEl) startScreenEl.style.display = '';
  if (formatScreenEl) formatScreenEl.style.display = 'none';
  const practiceLabel = document.getElementById('practiceLabel');
  if (practiceLabel) practiceLabel.style.display = 'none';
  const practiceHud = document.getElementById('practiceHud');
  if (practiceHud) practiceHud.style.display = 'none';
  const scoreboard = document.getElementById('scoreboard');
  if (scoreboard) scoreboard.style.display = '';
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
  else if (index === 1) { hidePauseMenu(); syncPausedState(false); setUIMenu(UI_MENU.NONE); flushInputEvents(); window.setGameMode?.(window.Game?.matchFormat || '6vs6'); startMatchFromMenu(); }
  else returnToMainMenu();
}

function executeMainMenuOption(index) {
  if (index === 0) { selectMode(false); showFormatScreen(); }
  else if (index === 1) { selectMode(true); showFormatScreen(); }
}

function executeFormatMenuOption(index) {
  startMatchWithFormat(index === 0 ? '6vs6' : '11vs11');
}

function tickMenuInput(ts) {
  const formatVisible = formatScreenEl && formatScreenEl.style.display !== 'none';
  const mainVisible = startScreenEl && startScreenEl.style.display !== 'none';
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
  if (mode1pBtn) mode1pBtn.addEventListener('click', () => { currentMenuOption = 0; selectMode(false); updateMainMenuSelectionVisual(); });
  if (mode2pBtn) mode2pBtn.addEventListener('click', () => { currentMenuOption = 1; selectMode(true); updateMainMenuSelectionVisual(); });
  if (swapPadBtn) swapPadBtn.addEventListener('click', () => { if (window.Game) window.Game.padSwap = !window.Game.padSwap; if (typeof _assignInputSources === 'function') _assignInputSources(); });
  
  const startBtn = document.getElementById('startBtn');
  if (startBtn) startBtn.addEventListener('click', () => executeMainMenuOption(window.Game?.twoPlayerMode ? 1 : 0));
  
  if (format6Btn) format6Btn.addEventListener('click', () => { formatMenuOption = 0; updateFormatMenuSelectionVisual(); startMatchWithFormat('6vs6'); });
  if (format11Btn) format11Btn.addEventListener('click', () => { formatMenuOption = 1; updateFormatMenuSelectionVisual(); startMatchWithFormat('11vs11'); });
  if (formatBackBtn) formatBackBtn.addEventListener('click', () => hideFormatScreen());
  
  formatOptionEls.forEach((btn, i) => {
    if (btn) btn.addEventListener('mouseenter', () => { formatMenuOption = i; updateFormatMenuSelectionVisual(); });
  });

  if (pauseContinueBtn) pauseContinueBtn.addEventListener('click', () => executePauseMenuOption(0));
  if (pauseRestartBtn) pauseRestartBtn.addEventListener('click', () => executePauseMenuOption(1));
  if (pauseMenuBtn) pauseMenuBtn.addEventListener('click', () => executePauseMenuOption(2));
  
  pauseOptionEls.forEach((btn, i) => {
    if (btn) btn.addEventListener('mouseenter', () => { menuFocusIndex = i; updatePauseMenuSelectionVisual(); });
  });

  document.getElementById('practiceResetBtn')?.addEventListener('click', () => {
    if (window.gameState !== 'practice') return;
    window.resetPractice?.();
  });
  document.getElementById('practiceMenuBtn')?.addEventListener('click', () => returnToMainMenu());
}

function getEffortCameraFocusPlayer() {
  if (window.ball?.lastAction !== 'effort' && window.ball?.lastAction !== 'feint') return null;
  const owner = window.ball?.owner;
  if (!owner || (owner.effortTouchCooldown <= 0 && owner.dribbleExtendT <= 0)) return null;
  return owner;
}

function updateCelebrationCamera() {
  const scorer = window.Game?.celebration?.scorer;
  if (!scorer || !window.CAM || !window.FIELD_L) return;
  window.CAM.x = window.lerp?.(window.CAM.x, window.clamp?.(scorer.x, 10, window.FIELD_L - 10), CAM_CELEB_PAN_LERP);
}

function tick(ts) {
  requestAnimationFrame(tick);

  tickMenuInput(ts);

  if (window.Game?.running) {
    if (window.lastTs === null) window.setLastTs?.(ts);
    let rawDt = (ts - (window.lastTs || ts)) / 1000;
    window.setLastTs?.(ts);
    rawDt = Math.min(rawDt, 0.033);
    const dt = rawDt * (window.GLOBAL_TIME_SCALE || 1);
    window.setLastDt?.(dt);

    routeInput(rawDt);

    if (window.Game?.celebration && typeof _updateCelebration === 'function') _updateCelebration(dt);

    if (!window.isPaused && !window.Game?.paused) {
      try {
        if (window.gameState === 'practice' || window.gameState === 'celebration_run') {
          if (typeof _runGameplaySim === 'function') _runGameplaySim(dt, rawDt);
        } else if (!window.Game?.matchEnded) {
          window.Game.time -= rawDt;
          if (window.Game.time < 0) window.Game.time = 0;
          window.updateClock?.();
          if (window.Game.time <= 0) window.endMatch?.();
          else if (typeof _runGameplaySim === 'function') _runGameplaySim(dt, rawDt);
        }
      } catch (err) {
        console.error('[tick] Error en simulación de gameplay:', err);
        if (typeof _bindBallBeforeRender === 'function') _bindBallBeforeRender();
        if (typeof _renderFn === 'function') _renderFn();
      }
    }
  } else {
    window.setLastTs?.(null);
    if (getActiveUIMenu() !== UI_MENU.NONE) routeInput(0.016);
  }

  if (window.Game?.running && window.CAM && window.FIELD_L) {
    if (window.gameState === 'practice') {
      window.updateMatchCameraFollow?.();
    } else if (window.gameState === 'celebration_run' && window.Game?.celebrationRun?.scorer) {
      const scorer = window.Game.celebrationRun.scorer;
      window.CAM.x = window.lerp?.(window.CAM.x, window.clamp?.(scorer.x, 10, window.FIELD_L - 10), CAM_CELEB_PAN_LERP);
    } else if (window.Game?.celebration) {
      updateCelebrationCamera();
    } else {
      window.updateMatchCameraFollow?.();
      const effortFocus = getEffortCameraFocusPlayer();
      if(effortFocus){
        const marginX = window.FIELD_L * 0.10;
        window.CAM.x = window.lerp?.(window.CAM.x, window.clamp?.(effortFocus.x, marginX, window.FIELD_L - marginX), CAM_PAN_LERP);
      }
    }
  }

  if(window.Game?.running && typeof _refreshPlayerSelectionHud === 'function'){
    _refreshPlayerSelectionHud({
      gameState: window.gameState,
      twoPlayerMode: window.Game?.twoPlayerMode,
      controlledHome: window.controlledPlayer?.(),
      controlledAway: window.controlledPlayer2?.(),
      visible: window.gameState !== 'practice',
    });
  }

  if (typeof _bindBallBeforeRender === 'function') _bindBallBeforeRender();
  if (typeof _renderFn === 'function') _renderFn();
}

function setupOnlineMatchmaking() {
  if (typeof io === 'undefined') return;

  socket = io('http://localhost:3000', { transports: ['websocket', 'polling'] });

  const btnBuscarOnline = document.getElementById('btn-buscar-partido');
  const estadoBusqueda = document.getElementById('estado-busqueda');

  if (btnBuscarOnline) {
    btnBuscarOnline.addEventListener('click', () => {
      socket.emit('find_match');
      btnBuscarOnline.disabled = true;
      btnBuscarOnline.innerText = 'BUSCANDO RIVAL...';
      if (estadoBusqueda) {
        estadoBusqueda.innerText = 'Encolado. Esperando un oponente...';
      }
    });
  }

  socket.on('match_found', (data) => {
    console.log('¡PARTIDO ENCONTRADO!', data);

    // 1. Configuramos las banderas del partido online
    if (window.Game) {
      window.Game.isOnlineMatch = true;
      window.Game.onlineRole = data.role; // 'home' (Local) o 'away' (Visita)
    }
    
    // 2. Activamos el modo Humano vs Humano (2 Players)
    selectMode(true);

    if (estadoBusqueda) {
      estadoBusqueda.innerText = `¡Rival encontrado! Sos ${data.role === 'home' ? 'LOCAL (P1)' : 'VISITA (P2)'} - Iniciando 11vs11...`;
    }

    // 3. Arrancamos directo el partido 11vs11
    setTimeout(() => {
      startMatchWithFormat('11vs11');
    }, 1500);
  });

  socket.on('opponent_update', (data) => {
    // Sincronización de movimientos recibidos del rival
  });

  socket.on('opponent_disconnected', () => {
    alert('El rival se ha desconectado de la partida.');
    window.location.reload();
  });
}

async function boot() {
  const state = await import('./state.js');
  const input = await import('./input.js');
  const physics = await import('./physics.js');
  const gameplay = await import('./gameplay.js');
  const renderMod = await import('./render.js');
  const playerHud = await import('./playerSelectionHud.js');

  playerHud.initPlayerSelectionHud();
  _refreshPlayerSelectionHud = playerHud.refreshPlayerSelectionHud;

  _runGameplaySim = gameplay.runGameplaySim;
  _renderFn = renderMod.render;
  _bindBallBeforeRender = state.bindBallBeforeRender;
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
    onFormatConfirm: (i) => { executeFormatMenuOption(i); },
    onFormatCancel: () => { hideFormatScreen(); },
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
    tryImmediateFirstTouch: input.tryImmediateFirstTouch,
    rebuildFieldGeometry: physics.rebuildFieldGeometry,
    readRightStick: input.readRightStick,
    anyKey: input.anyKey,
    anyKeyPrev: input.anyKeyPrev,
    isControlledByHuman: renderMod.isControlledByHuman,
  });

  initAppChrome();
  setupOnlineMatchmaking();
  updateMainMenuSelectionVisual();
  
  if (typeof _bindBallBeforeRender === 'function') _bindBallBeforeRender();
  if (typeof _renderFn === 'function') _renderFn();
  requestAnimationFrame(tick);
}

boot();