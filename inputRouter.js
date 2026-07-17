"use strict";

import { Game, gameState, isPaused, resetInputEdgeDetection } from './state.js';
import { getInputKeyState, axisOrZero, resetGamepadState } from './input.js';

/** Menú de UI activo — prioridad sobre PlayerController / MatchEngine. */
export const UI_MENU = {
  NONE: 'none',
  MAIN: 'main',
  FORMAT: 'format',
  PAUSE: 'pause',
};

/** Modo de input del motor — UI_NAVIGATION no depende de matchState ni Game.running. */
export const INPUT_MODE = {
  GAMEPLAY: 'gameplay',
  UI_NAVIGATION: 'ui_navigation',
};

export let inputMode = INPUT_MODE.UI_NAVIGATION;

const MENU_NAV_COOLDOWN_MS = 200;
const PAUSE_TOGGLE_COOLDOWN_MS = 350;
const MENU_STICK_DEAD = 0.35;

const INPUT_LAYER_PRIORITY = {
  [UI_MENU.PAUSE]: 300,
  [UI_MENU.FORMAT]: 200,
  [UI_MENU.MAIN]: 200,
};

const KB_UI_UP = ['ArrowUp', 'KeyW'];
const KB_UI_DOWN = ['ArrowDown', 'KeyS'];
const KB_UI_CONFIRM = ['Enter', 'NumpadEnter'];
const KB_UI_CANCEL = ['Escape', 'Backspace'];

/** Stack de capas de input (top = mayor prioridad). */
const inputListenerStack = [];

let activeMenu = UI_MENU.NONE;
let navCooldown = 0;
let pauseToggleCooldown = 0;
let lastMenuLoopTs = null;

/** true cuando una capa UI consume el input (menús / pausa). */
export let isUIModeActive = false;

const prevUIPad = { up: false, down: false, confirm: false, cancel: false, start: false };

/** Callbacks registrados desde main.js (UI_Controller). */
const handlers = {
  getFirstPad: () => null,
  clearInputBuffer: () => {},
  focusMain: () => {},
  focusFormat: () => {},
  focusPause: () => {},
  onMainConfirm: () => {},
  onFormatConfirm: () => {},
  onFormatCancel: () => {},
  onPauseConfirm: () => {},
  onPauseRequest: () => {},
  getMainFocus: () => 0,
  setMainFocus: () => {},
  getFormatFocus: () => 0,
  setFormatFocus: () => {},
  getPauseFocus: () => 0,
  setPauseFocus: () => {},
  mainOptionCount: 3,
  formatOptionCount: 2,
  pauseOptionCount: 3,
  refreshMainVisual: () => {},
  refreshFormatVisual: () => {},
  refreshPauseVisual: () => {},
};

function layerIdForMenu(menu){
  return `ui:${menu}`;
}

function syncUIModeFlag(){
  isUIModeActive = inputListenerStack.some(l => l.consume) || isPaused || !!Game.paused || inputMode === INPUT_MODE.UI_NAVIGATION;
  Game.uiModeActive = isUIModeActive;
  Game.uiActive = isUIModeActive || activeMenu !== UI_MENU.NONE;
  Game.uiNavigationActive = inputMode === INPUT_MODE.UI_NAVIGATION;
}

export function enableUINavigationMode(){
  inputMode = INPUT_MODE.UI_NAVIGATION;
  syncUIModeFlag();
}

export function disableUINavigationMode(){
  inputMode = INPUT_MODE.GAMEPLAY;
  syncUIModeFlag();
}

function pushInputLayer(menu){
  const id = layerIdForMenu(menu);
  const idx = inputListenerStack.findIndex(l => l.id === id);
  if(idx >= 0) inputListenerStack.splice(idx, 1);
  inputListenerStack.push({
    id,
    menu,
    priority: INPUT_LAYER_PRIORITY[menu] ?? 100,
    consume: true,
  });
  inputListenerStack.sort((a, b) => b.priority - a.priority);
  syncUIModeFlag();
}

function popInputLayer(id, opts = {}){
  const idx = inputListenerStack.findIndex(l => l.id === id);
  if(idx < 0) return;
  inputListenerStack.splice(idx, 1);
  syncUIModeFlag();
  if(!opts.skipFlush) flushInputEvents();
}

export function getTopInputLayer(){
  return inputListenerStack[0] ?? null;
}

export function shouldConsumeGameplayInput(){
  const top = getTopInputLayer();
  return !!(top && top.consume) || isUIModeActive;
}

export function initInputRouter(h){
  Object.assign(handlers, h);
}

export function isUIActive(){
  return isUIModeActive || activeMenu !== UI_MENU.NONE;
}

export function getActiveUIMenu(){
  return activeMenu;
}

function stepOption(idx, dir, count){
  return (idx + dir + count) % count;
}

function flushUIPadState(){
  prevUIPad.up = false;
  prevUIPad.down = false;
  prevUIPad.confirm = false;
  prevUIPad.cancel = false;
  prevUIPad.start = false;
}

/** Limpia bordes de teclado/gamepad y buffers de acción al abrir/cerrar UI. */
export function flushInputEvents(){
  resetInputEdgeDetection();
  resetGamepadState();
  syncMenuGamepadBaseline(handlers.getFirstPad());
  if(typeof handlers.clearInputBuffer === 'function') handlers.clearInputBuffer();
  navCooldown = 0;
  pauseToggleCooldown = PAUSE_TOGGLE_COOLDOWN_MS;
}

function focusForMenu(menu){
  if(menu === UI_MENU.MAIN) handlers.focusMain();
  else if(menu === UI_MENU.FORMAT) handlers.focusFormat();
  else if(menu === UI_MENU.PAUSE) handlers.focusPause();
  if(document.pointerLockElement){
    document.exitPointerLock?.();
  }
}

export function setUIMenu(menu){
  if(activeMenu === menu) return;
  if(activeMenu !== UI_MENU.NONE){
    popInputLayer(layerIdForMenu(activeMenu), { skipFlush: true });
  }
  activeMenu = menu;
  if(menu !== UI_MENU.NONE){
    enableUINavigationMode();
    pushInputLayer(menu);
    focusForMenu(menu);
  } else {
    disableUINavigationMode();
    syncUIModeFlag();
  }
  flushInputEvents();
}

function padBtnDown(pad, idx){
  const b = pad?.buttons?.[idx];
  return !!(b && (b.pressed || b.value > 0.5));
}

/** Niveles actuales de D-pad, stick izquierdo (eje Y) y hat axes. */
export function readMenuNavLevels(pad){
  if(!pad) return { up:false, down:false, confirm:false, cancel:false, start:false };
  const stickY = axisOrZero(pad.axes[1] || 0);
  const hatY = pad.axes[7] ?? pad.axes[9] ?? 0;
  const hatUp = hatY < -0.5;
  const hatDown = hatY > 0.5;
  const up = padBtnDown(pad, 12) || stickY < -MENU_STICK_DEAD || hatUp;
  const down = padBtnDown(pad, 13) || stickY > MENU_STICK_DEAD || hatDown;
  return {
    up,
    down,
    confirm: padBtnDown(pad, 0),
    cancel: padBtnDown(pad, 1),
    start: padBtnDown(pad, 9),
  };
}

/** Sincroniza prevUIPad con el estado real del mando (sin disparar bordes fantasma). */
export function syncMenuGamepadBaseline(pad){
  const levels = readMenuNavLevels(pad);
  prevUIPad.up = levels.up;
  prevUIPad.down = levels.down;
  prevUIPad.confirm = levels.confirm;
  prevUIPad.cancel = levels.cancel;
  prevUIPad.start = levels.start;
}

export function readMenuPadEdges(pad){
  if(!pad) return { up:false, down:false, confirm:false, cancel:false, start:false };
  const levels = readMenuNavLevels(pad);
  const edges = {
    up: levels.up && !prevUIPad.up,
    down: levels.down && !prevUIPad.down,
    confirm: levels.confirm && !prevUIPad.confirm,
    cancel: levels.cancel && !prevUIPad.cancel,
    start: levels.start && !prevUIPad.start,
  };
  prevUIPad.up = levels.up;
  prevUIPad.down = levels.down;
  prevUIPad.confirm = levels.confirm;
  prevUIPad.cancel = levels.cancel;
  prevUIPad.start = levels.start;
  return edges;
}

function readKeyboardMenuEdges(){
  const { keys, prev } = getInputKeyState();
  const keyEdge = (codes) => codes.some(c => keys[c] && !prev[c]);
  return {
    up: keyEdge(KB_UI_UP),
    down: keyEdge(KB_UI_DOWN),
    confirm: keyEdge(KB_UI_CONFIRM),
    cancel: keyEdge(KB_UI_CANCEL),
    start: false,
  };
}

function mergeEdges(a, b){
  return {
    up: a.up || b.up,
    down: a.down || b.down,
    confirm: a.confirm || b.confirm,
    cancel: a.cancel || b.cancel,
    start: a.start || b.start,
  };
}

function navigateList(pad, kbEdges, getFocus, setFocus, count, refresh){
  if(navCooldown > 0) return;
  const levels = readMenuNavLevels(pad);
  const up = levels.up || kbEdges.up;
  const down = levels.down || kbEdges.down;
  if(up && !down){
    setFocus(stepOption(getFocus(), -1, count));
    navCooldown = MENU_NAV_COOLDOWN_MS;
    refresh();
  } else if(down && !up){
    setFocus(stepOption(getFocus(), 1, count));
    navCooldown = MENU_NAV_COOLDOWN_MS;
    refresh();
  }
}

function handleMenuConfirm(menu, pad, edges, onConfirm){
  if(!edges.confirm) return;
  syncMenuGamepadBaseline(pad);
  onConfirm();
  flushInputEvents();
}

function resolveActiveMenu(){
  return getTopInputLayer()?.menu ?? activeMenu;
}

/** UI_Controller: capa superior del stack — consume input (no propaga a gameplay). */
function routeToUI(rawDt){
  navCooldown = Math.max(0, navCooldown - rawDt * 1000);
  const pad = handlers.getFirstPad();
  const padEdges = readMenuPadEdges(pad);
  const kbEdges = readKeyboardMenuEdges();
  const edges = mergeEdges(padEdges, kbEdges);
  const menu = resolveActiveMenu();

  if(menu === UI_MENU.MAIN){
    navigateList(pad, kbEdges, handlers.getMainFocus, handlers.setMainFocus, handlers.mainOptionCount, handlers.refreshMainVisual);
    handleMenuConfirm(menu, pad, edges, () => handlers.onMainConfirm(handlers.getMainFocus()));
  } else if(menu === UI_MENU.FORMAT){
    navigateList(pad, kbEdges, handlers.getFormatFocus, handlers.setFormatFocus, handlers.formatOptionCount, handlers.refreshFormatVisual);
    handleMenuConfirm(menu, pad, edges, () => handlers.onFormatConfirm(handlers.getFormatFocus()));
    if(edges.cancel) handlers.onFormatCancel();
  } else if(menu === UI_MENU.PAUSE){
    navigateList(pad, kbEdges, handlers.getPauseFocus, handlers.setPauseFocus, handlers.pauseOptionCount, handlers.refreshPauseVisual);
    handleMenuConfirm(menu, pad, edges, () => handlers.onPauseConfirm(handlers.getPauseFocus()));
    if(edges.cancel) handlers.onPauseConfirm(0);
    if(edges.start){
      flushInputEvents();
      handlers.onPauseConfirm(0);
    }
  }
}

function routeGameplayPauseToggle(rawDt){
  if(!Game.running || gameState === 'menu' || Game.matchEnded || Game.celebration || gameState === 'celebration_run') return;
  pauseToggleCooldown = Math.max(0, pauseToggleCooldown - rawDt * 1000);
  const pad = handlers.getFirstPad();
  const padEdges = readMenuPadEdges(pad);
  const kbEdges = readKeyboardMenuEdges();
  const edges = mergeEdges(padEdges, kbEdges);
  if(edges.start && pauseToggleCooldown <= 0){
    handlers.onPauseRequest();
    pauseToggleCooldown = PAUSE_TOGGLE_COOLDOWN_MS;
  }
}

/**
 * Enruta input según el stack de capas:
 * UI activa → UI_Controller (hijack, sin propagación a PlayerController / matchState).
 */
export function routeInput(rawDt){
  const menuOpen = activeMenu !== UI_MENU.NONE;
  const uiBlocksGameplay = shouldConsumeGameplayInput() || menuOpen;

  if(uiBlocksGameplay){
    if(activeMenu === UI_MENU.NONE && (isPaused || Game.paused)){
      setUIMenu(UI_MENU.PAUSE);
    }
    routeToUI(rawDt);
    return 'ui';
  }

  routeGameplayPauseToggle(rawDt);
  return 'game';
}

/** Loop RAF cuando pantallas de menú previas al partido están visibles. */
export function tickMenuScreenLoop(ts){
  if(activeMenu !== UI_MENU.MAIN && activeMenu !== UI_MENU.FORMAT) return false;
  if(lastMenuLoopTs === null) lastMenuLoopTs = ts || performance.now();
  const rawDt = Math.min(((ts || performance.now()) - lastMenuLoopTs) / 1000, 0.033);
  lastMenuLoopTs = ts || performance.now();
  routeToUI(rawDt);
  return true;
}

export function resetMenuScreenLoopClock(){
  lastMenuLoopTs = null;
}
