"use strict";

import { Game, gameState, isPaused, resetInputEdgeDetection } from './state.js';
import { getInputKeyState } from './input.js';

/** Menú de UI activo — prioridad sobre PlayerController / MatchEngine. */
export const UI_MENU = {
  NONE: 'none',
  MAIN: 'main',
  FORMAT: 'format',
  PAUSE: 'pause',
};

const MENU_NAV_COOLDOWN_MS = 200;
const PAUSE_TOGGLE_COOLDOWN_MS = 350;
const PAUSE_MENU_STICK_DEAD = 0.5;

const KB_UI_UP = ['ArrowUp', 'KeyW'];
const KB_UI_DOWN = ['ArrowDown', 'KeyS'];
const KB_UI_CONFIRM = ['Enter', 'NumpadEnter'];
const KB_UI_CANCEL = ['Escape', 'Backspace'];

let activeMenu = UI_MENU.NONE;
let navCooldown = 0;
let pauseToggleCooldown = 0;
let lastMenuLoopTs = null;

const prevUIPad = { up: false, down: false, confirm: false, cancel: false, start: false };

/** Callbacks registrados desde main.js (UI_Controller). */
const handlers = {
  getFirstPad: () => null,
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

export function initInputRouter(h){
  Object.assign(handlers, h);
}

export function isUIActive(){
  return activeMenu !== UI_MENU.NONE;
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

/** Limpia bordes de teclado/gamepad para evitar eventos fantasma al abrir/cerrar UI. */
export function flushInputEvents(){
  resetInputEdgeDetection();
  flushUIPadState();
  navCooldown = MENU_NAV_COOLDOWN_MS;
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
  activeMenu = menu;
  Game.uiActive = menu !== UI_MENU.NONE;
  flushInputEvents();
  if(menu !== UI_MENU.NONE) focusForMenu(menu);
}

export function readMenuPadEdges(pad){
  if(!pad) return { up: false, down: false, confirm: false, cancel: false, start: false };
  const stickY = pad.axes[1] || 0;
  const up = !!(pad.buttons[12] && pad.buttons[12].pressed) || stickY < -PAUSE_MENU_STICK_DEAD;
  const down = !!(pad.buttons[13] && pad.buttons[13].pressed) || stickY > PAUSE_MENU_STICK_DEAD;
  const confirm = !!(pad.buttons[0] && pad.buttons[0].pressed);
  const cancel = !!(pad.buttons[1] && pad.buttons[1].pressed);
  const start = !!(pad.buttons[9] && pad.buttons[9].pressed);
  const edges = {
    up: up && !prevUIPad.up,
    down: down && !prevUIPad.down,
    confirm: confirm && !prevUIPad.confirm,
    cancel: cancel && !prevUIPad.cancel,
    start: start && !prevUIPad.start,
  };
  prevUIPad.up = up;
  prevUIPad.down = down;
  prevUIPad.confirm = confirm;
  prevUIPad.cancel = cancel;
  prevUIPad.start = start;
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

function navigateList(edges, getFocus, setFocus, count, refresh){
  if(navCooldown > 0) return;
  if(edges.up){
    setFocus(stepOption(getFocus(), -1, count));
    navCooldown = MENU_NAV_COOLDOWN_MS;
    refresh();
  } else if(edges.down){
    setFocus(stepOption(getFocus(), 1, count));
    navCooldown = MENU_NAV_COOLDOWN_MS;
    refresh();
  }
}

function routeToUI(rawDt){
  navCooldown = Math.max(0, navCooldown - rawDt * 1000);
  const pad = handlers.getFirstPad();
  const padEdges = readMenuPadEdges(pad);
  const kbEdges = readKeyboardMenuEdges();
  const edges = mergeEdges(padEdges, kbEdges);

  if(activeMenu === UI_MENU.MAIN){
    navigateList(edges, handlers.getMainFocus, handlers.setMainFocus, handlers.mainOptionCount, handlers.refreshMainVisual);
    if(edges.confirm) handlers.onMainConfirm(handlers.getMainFocus());
  } else if(activeMenu === UI_MENU.FORMAT){
    navigateList(edges, handlers.getFormatFocus, handlers.setFormatFocus, handlers.formatOptionCount, handlers.refreshFormatVisual);
    if(edges.confirm) handlers.onFormatConfirm(handlers.getFormatFocus());
    if(edges.cancel) handlers.onFormatCancel();
  } else if(activeMenu === UI_MENU.PAUSE){
    navigateList(edges, handlers.getPauseFocus, handlers.setPauseFocus, handlers.pauseOptionCount, handlers.refreshPauseVisual);
    if(edges.confirm) handlers.onPauseConfirm(handlers.getPauseFocus());
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
 * Enruta input según estado global:
 * UI activa → UI_Controller; si no → gameplay (toggle pausa en partido).
 */
export function routeInput(rawDt){
  if(isUIActive() || isPaused || Game.paused){
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
