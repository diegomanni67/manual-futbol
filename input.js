"use strict";

export { CONTROL_TOUCH_DUR } from './state.js';

import { AERIAL_PHYSICS, AIR_ACTION_MODS, AIR_AERIAL_HITBOX_MAX_XY, AIR_AERIAL_MIN_Z, AIR_BICYCLE_CONTACT_RADIUS, AIR_BICYCLE_MAX_Z, AIR_BICYCLE_MIN_Z, AIR_BUFFER_RADIUS, AIR_CONTACT_RADIUS, AIR_DRAG, AIR_FOOT_HITBOX_R, AIR_FOOT_STRIKE_Z, AIR_FOOT_THRESHOLD_Z, AIR_HEAD_HITBOX_R, AIR_HEADER_JUMP_APPROACH_DIST, AIR_HEADER_JUMP_APEX_MAX, AIR_HEADER_JUMP_APEX_MIN, AIR_HEADER_JUMP_MIN_Z, AIR_HEADER_MAX_Z, AIR_HEADER_MIN_Z, AIR_HEADER_SLOW_SPEED_RATIO, AIR_HEADER_STAND_MAX_Z, AIR_HEADER_STAND_MIN_Z, AIR_LOCK_DURATION, AIR_MANUAL_VOLLEY_SPREAD_MULT, AIR_MANUAL_VOLLEY_SPEED_MULT, AIR_MANUAL_VOLLEY_STAMINA_COST, AIR_MAX_HUMAN_REACH_Z, AIR_PLAYER_HEAD_STAND_Z, AIR_SPAM_SIM_STEP, AIR_STRIKE_TABLE, AIR_VOLLEY_L2_MAX_Z, AIR_VOLLEY_L2_MIN_Z, AIR_VOLLEY_MAX_Z, AIR_VOLLEY_MIN_Z, AUTOPASE_POWER_THRESHOLD, BALL_AERIAL_MIN_Z, BALL_RADIUS, BALL_STATE, Ball, CENTER, CROSS_MARKER_LIFE, DEFAULT_SPRINT_MULT, DIRECTION_PRIORITY, DISTANCE_PRIORITY, DIST_FAKE, DRIBBLE_DIST_R1, DRIBBLE_DIST_R2, EFFORT_CHASE_TEAMMATE_BLOCK, EFFORT_ROLL_SOFT_DURATION, EFFORT_RS_MIN, EFFORT_TOUCH_ANIM_LONG, EFFORT_TOUCH_ANIM_SHORT, EFFORT_TOUCH_BURST_MULT, EFFORT_TOUCH_COOLDOWN, EFFORT_TOUCH_MAX_VELOCITY, FEINT_TOUCH_MAX_VELOCITY, FIELD_L, FIELD_W, FIRST_SHOT_IMPACT_WINDOW, FIRST_SHOT_MAX_Z, FIRST_SHOT_MIN_Z, FIRST_SHOT_POWER_VEL, FORCED_CHASE_RECOVER_DIST, IA_LANDING_JOG_FACTOR, IA_LANDING_WAIT_DIST } from './state.js';

import { GK_DROP_KICK_FORCE, GK_JUMP_MIN_Z, GK_KICK_ANIM_DUR, GK_KICK_RELEASE_T, GK_MANUAL_DIVE_DIST, GK_MANUAL_DIVE_DUR, GK_MANUAL_JUMP_DUR, GK_POSSESS_FREE, GK_THROW_FORCE, GRAVITY, GROUND_FRICTION, Game, GkKickLandingListener, KICK_VELOCITY_MULT, LONGPASS_SWITCH_LOCK_MS, PASS_VELOCITY_MULT, PENDING_ACTION_EXECUTE_RADIUS, PENDING_ACTION_PASS, PENDING_ACTION_SHOT, PrivateChaseEvents, SELF_TOUCH_BURST_MULT, SELF_TOUCH_COLLECT_BLOCK, SELF_TOUCH_PLAYER_BRAKE, SET_PIECE, SHOT_PLACED_SPEED_MULT, SHOT_TRIVELA_SPEED_MULT, SHOT_VELOCITY_MULT, STATE_FIXED, STATE_PLAYING, TACKLE_COOLDOWN, ACTION_BUFFER_GROUND_PASS, ACTION_BUFFER_LOBBED_PASS, activateBallLock, activateIgnorePossession, allPlayers, angDiff, applyBallLateralCurve, applyEffortTouchDefenderFreeze, applyExtendedDribbleTouch, applyKickCurvePhysics, assignBallPossession, awayTeam, ball, canApplyEffortTouch, clamp, clampKickoffTakerManeuverPosition, clearBallLock, clearPlayerPendingAction, clearPlayerSetPieceState, effortRsState, getKickoffFacingAttack, getKickoffFacingOwnGoal, isKickoffManeuverActive, CROSS_KICK_MAX_SPEED, PASS_CROSS_DISTANCE_MULT, PASS_GROUND_MAX_SPEED } from './state.js';

import { clearChasingState, clearEffortSprintState, clearForcedChaseState, clearGkHandsTimer, clearGkPossessionType, clearPassTargetTeam, clearPlayerAIState, clearPlayerLockAssignment, clearSprintChaseState, clearTeammateInterferenceForTechnicalAction, clearThrowInBlockIfOtherPlayer, computeEffortPassPower, computeKickVerticalSpeed, controlledPlayer, controlledPlayer2, detectEffortTouchInput, dist2D, enablePlayableBallAfterGkKick, ensureChasingState, ensurePlayerBallControlForAction, enterSprintChaseState, fakeShotOwnerId, gameState, getBallAirGravity, getBallKickPowerMult, getChaseInterceptTarget, getKickoffTaker, getPlayerById, getPlayerMaxSprintVelocity, getPlayerMoveSpeedBase, getPostTouchRecoverDist, getPressureCursorId, handleManualRestartKickInput, handleThrowInInput, homeTeam, inferGkPossessionSource, interruptForcedChaseForAction, interruptPlayerStateForTechnicalAction, isBallContestedSeekAllowed, isBallFreeForPlayer, isBallLocked, isChaseOwner, isEffortTouchDefenderFrozen, isFakeShotActive, isGkHandsPossession, isGoalKickReadyState, isGoalkeeper, isManualAction, isManualRestartAwaiting, isPlayerAssignmentLocked, isPlayerChasing, isPlayerForcedChasing, isPlayerPerformingSkill, isPlayerSprintChasing, isPlayerSwitchLockedForEffort, isUIModeActive, lockPlayerSwitchForEffort, physicsConfig, prevButtonsByPad, updatePlayerJumpZ, applyBallAirHorizontalDrag } from './state.js';

import { clampPlayerVelocity, setRupturaRunVelocity, getRupturaRunMaxSpeed } from './physics.js';
import {
  getArchetypeAerialPowerMult,
  getArchetypeEffortTouchAnimMult,
  getArchetypeEffortTouchCooldownMult,
  getArchetypeEffortTouchLongDistMult,
  getArchetypeKickSpeedTableMult,
} from './archetypes.js';

import { isPlayerStaggered, isPlayerStunned, isPossessionIgnored, isPostTouchChasing, isKickoffTaker, isKickoffWaiting, isKickoffBallContestable, getGkKickForceMult, isGkKickManualOnly, resolveManualRestartStickDir, isSetPieceAwaitingExecution, isSetPieceShotOnly, isSetPieceTaker, isThrowInTakerBlocked, lerp, lockKickInputs, movePlayer, nearestToBall, norm, cleanupKickoffState, onSetPieceBallReleased, projectPractice, reclaimFeintPossession, resetBallKickFriction, resetGkAutoDistributeTimer, resolveCollisions, resolveInputCurve, resolveShotStyle, resumeChasingAfterAction, setBallStateFree, setBallStateLoose, setControlled, setControlled2, clearCurvePassTracking, setupCurvePassTracking, startForcedChase, syncPlayerDir, syncTechnicallyBusy, tryEnterChasingFromPrivateEvent, userWantsPossessionAction, maintainKickoffPlacement } from './state.js';

import { isControlledByHuman } from './render.js';
import { SECONDARY_PRESS, AI_SECONDARY_PRESSING, AI_RUPTURA, AI_RUPTURA_MANUAL, GK_KICK_CHARGE, MOVING_TO_BALL } from './gameplay_constants.js';
import {
  assignPassTargetFromKick, bestWallPassTarget, isAirDuelContestant, isPassTargetPlayer,
  moveTowardSeekTarget, nearestTeammateInDirection, registerAirSpamPress, releaseWallPass,
  updateHumanMovement, updateWallRun,
  MANUAL_RUN_CURVE_BIAS, MANUAL_RUN_PASSER_IGNORE_DIST, MANUAL_RUN_SHORT_DIST_THRESHOLD,
  MANUAL_RUN_SHORT_GRACE_TIME, MANUAL_RUN_SPEED_MULT, OFFENSIVE_RUN_DIR_WEIGHT,
  OFFENSIVE_RUN_GOAL_WEIGHT, WALLRUN_MAX_DURATION, PARED_STICK_WINDOW,
} from './gameplay.js';

import { startGKDive, tryDefensiveTackleInput, checkBallCapture } from './physics.js';

/* ============================================================
   INPUT: TECLADO + MOUSE + GAMEPAD (mapeo estilo EA FC alternativo)
   ============================================================ */
const Keys = {};
window.addEventListener('keydown', e=>{ Keys[e.code]=true; });
window.addEventListener('keyup', e=>{ Keys[e.code]=false; });

window.addEventListener('gamepadconnected', ()=>{ assignInputSources(); if(typeof _onGamepadConnectUI === 'function') _onGamepadConnectUI(); });
window.addEventListener('gamepaddisconnected', ()=>{ assignInputSources(); });

let _onGamepadConnectUI = null;
export function setGamepadConnectUIHandler(fn){ _onGamepadConnectUI = fn; }

// IMPORTANTE: la deteccion de mandos NUNCA debe filtrar por pad.id (nombre/fabricante).
// Xbox, PlayStation, genericos, o lo que reporte Parsec: todos entran aca por igual.
// Lo unico que importa es la posicion en el array que devuelve el navegador (indice)
// y que el mando use el mapeo estandar de HTML5 (mismo orden de botones/ejes en todos).
function isStandardPad(pad){
  return !!pad && pad.mapping === 'standard';
}
function connectedGamepadIndices(){
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const idx = [];
  for(let i=0;i<pads.length;i++){ if(isStandardPad(pads[i])) idx.push(i); }
  return idx;
}
// indices de mandos detectados por el navegador pero con mapeo NO estandar (no se usan para
// mover, porque sus ejes/botones podrian no coincidir con axes[0]/axes[1]/buttons[0..7]) —
// se usa solo para avisar en el panel de la pantalla de inicio.
function nonStandardGamepadIndices(){
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const idx = [];
  for(let i=0;i<pads.length;i++){ if(pads[i] && !isStandardPad(pads[i])) idx.push(i); }
  return idx;
}
// decide que joystick (si hay) le corresponde a cada jugador, y que esquema de teclado usa cada uno
// cuando comparten el mismo teclado (2 jugadores sin joysticks, o con uno solo).
// Antes de arrancar el partido (padsLocked=false) esto se recalcula libremente cada frame para
// que el panel de la pantalla de inicio muestre el estado en vivo. Una vez arrancado el partido en
// modo 2P (padsLocked=true) la asignacion queda fija — solo se libera si ese mando puntual se desconecta —
// para que dos mandos nunca "se crucen" de equipo a mitad de partido.
function assignInputSources(){
  const idx = connectedGamepadIndices();
  if(Game.padsLocked){
    if(Game.p1PadIndex!==null && idx.indexOf(Game.p1PadIndex)===-1) Game.p1PadIndex = null;
    if(Game.p2PadIndex!==null && idx.indexOf(Game.p2PadIndex)===-1) Game.p2PadIndex = null;
    // si un jugador se quedo sin mando (se desconecto) y aparece uno libre, se lo reasigna sin tocar al otro
    if(Game.p1PadIndex===null){
      const free = idx.find(i=> i!==Game.p2PadIndex);
      if(free!==undefined) Game.p1PadIndex = free;
    }
    if(Game.twoPlayerMode && Game.p2PadIndex===null){
      const free = idx.find(i=> i!==Game.p1PadIndex);
      if(free!==undefined) Game.p2PadIndex = free;
    }
  } else {
    const ordered = Game.padSwap ? [idx[1], idx[0]] : [idx[0], idx[1]];
    Game.p1PadIndex = ordered[0]!==undefined ? ordered[0] : null;
    Game.p2PadIndex = (Game.twoPlayerMode && ordered[1]!==undefined) ? ordered[1] : null;
  }
  updatePadStatus();
  refreshPadPanel(idx);
}
function updatePadStatus(){
  const el = document.getElementById('padStatus');
  if(!el) return;
  if(!Game.twoPlayerMode){
    el.textContent = Game.p1PadIndex!==null ? '🎮 Mando conectado' : 'Teclado';
  } else {
    const p1 = Game.p1PadIndex!==null ? '🎮 Jug.1' : 'Teclado Jug.1';
    const p2 = Game.p2PadIndex!==null ? '🎮 Jug.2' : 'Teclado Jug.2';
    el.textContent = p1 + '  ·  ' + p2;
  }
}
// panel en vivo de la pantalla de inicio: muestra que mandos detecta el navegador AHORA MISMO,
// asi el jugador puede confirmar antes de arrancar que ambos joysticks fueron reconocidos
// (el navegador solo "ve" un mando despues de que se le apreta algun boton o se mueve el stick al menos una vez)
function refreshPadPanel(idx){
  const wrap = document.getElementById('padPanelWrap');
  const panel = document.getElementById('padPanel');
  if(!wrap || !panel) return;
  if(!Game.twoPlayerMode){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const nonStd = nonStandardGamepadIndices();
  if(idx.length===0 && nonStd.length===0){
    panel.innerHTML = '<span class="miss">⚠️ No se detectó ningún joystick todavía.</span><br>Presioná cualquier botón (o movés un stick) en cada mando para activarlo — el navegador recién los "ve" después de esa primera pulsación.';
    return;
  }
  let html = '';
  idx.forEach(gi=>{
    const name = (pads[gi] && pads[gi].id) ? pads[gi].id : ('Mando '+gi);
    const shortName = name.length>42 ? name.slice(0,42)+'…' : name;
    const isP1 = gi===Game.p1PadIndex, isP2 = gi===Game.p2PadIndex;
    const tag = isP1 ? '<span class="p1tag">→ Jugador 1</span>' : (isP2 ? '<span class="p2tag">→ Jugador 2</span>' : '<span class="miss">(sin asignar)</span>');
    html += `🎮 #${gi} ${shortName} ${tag}<br>`;
  });
  // mandos detectados por el navegador pero SIN mapeo estandar: no se usan para mover
  // (sus ejes/botones podrian no coincidir con axes[0]/[1] y buttons[0..7]), se avisa por que.
  nonStd.forEach(gi=>{
    const name = (pads[gi] && pads[gi].id) ? pads[gi].id : ('Mando '+gi);
    const shortName = name.length>42 ? name.slice(0,42)+'…' : name;
    html += `<span class="miss">⚠️ #${gi} ${shortName}: detectado pero sin mapeo estándar (mapping="${(pads[gi]&&pads[gi].mapping)||'ninguno'}") — no se puede usar para mover hasta que el navegador lo reconozca con mapeo estándar. Probá mover el stick y tocar varios botones apenas se conecte.</span><br>`;
  });
  if(idx.length===1 && nonStd.length===0){
    html += '<span class="miss">Falta un segundo mando: el Jugador 2 va a jugar con teclado.</span>';
  }
  panel.innerHTML = html;
}
function getPadAt(index){
  if(index===null || index===undefined) return null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return pads[index] || null;
}

/** Primer mando util para navegación de menú (estándar preferido). */
function getFirstNavigationGamepad(){
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  if(Game.p1PadIndex != null){
    const p1 = pads[Game.p1PadIndex];
    if(p1) return p1;
  }
  for(let i=0;i<pads.length;i++){
    if(isStandardPad(pads[i])) return pads[i];
  }
  for(let i=0;i<pads.length;i++){
    if(pads[i]) return pads[i];
  }
  return null;
}

function padButtonDown(btn){
  return !!(btn && (btn.pressed || btn.value > 0.5));
}
const DEAD = 0.22;
function axisOrZero(v){ return Math.abs(v)<DEAD? 0 : v; }

// --- esquemas de teclado ---
// Jugador 1 en solitario (vs CPU): WASD o flechas, indistintamente, para comodidad.
const KB_P1_SOLO = {
  up:['KeyW','ArrowUp'], down:['KeyS','ArrowDown'], left:['KeyA','ArrowLeft'], right:['KeyD','ArrowRight'],
  sprint:['ShiftLeft','ShiftRight'], pass:['KeyJ'], shot:['KeyK'], through:['KeyL'], cross:['KeyI'],
  switch:['KeyQ'], tackle:['Space'], slide:['ControlLeft','ControlRight'],
  curveLeft:['KeyO'], curveRight:['KeyP'] // equivalentes de R1 (rosca izq., "colocado") y L2 (rosca der., "3 dedos")
};
// Jugador 1 compartiendo el mismo teclado con el jugador 2: solo WASD (las flechas quedan para el jugador 2)
const KB_P1_SHARED = {
  up:['KeyW'], down:['KeyS'], left:['KeyA'], right:['KeyD'],
  sprint:['ShiftLeft'], pass:['KeyJ'], shot:['KeyK'], through:['KeyL'], cross:['KeyI'],
  switch:['KeyQ'], tackle:['Space'], slide:['ControlLeft'],
  curveLeft:['KeyO'], curveRight:['KeyP']
};
// Jugador 2 en teclado: flechas + teclas cercanas del lado derecho
const KB_P2 = {
  up:['ArrowUp'], down:['ArrowDown'], left:['ArrowLeft'], right:['ArrowRight'],
  sprint:['ShiftRight'], pass:['Period'], shot:['Slash'], through:['Comma'], cross:['Quote'],
  switch:['Semicolon'], tackle:['Enter'], slide:['ControlRight'],
  curveLeft:['BracketLeft'], curveRight:['BracketRight']
};
function anyKey(codes){ for(const c of codes){ if(Keys[c]) return true; } return false; }
function anyKeyPrev(codes){ for(const c of codes){ if(prevKeys[c]) return true; } return false; }

// --- cambio de jugador con flick del stick derecho (estilo eFootball / EA FC) ---
const RS_DEAD = 0.35;         // zona muerta del stick derecho (mas alta: en reposo no debe disparar nada)
const RS_FLICK_MIN = 0.72;    // magnitud minima para que cuente como "flick"
const RS_FLICK_LOCKOUT = 0.35;// seg de bloqueo tras un flick, para no reseleccionar en cada frame
const MANUAL_RUN_RS_LOCK = 0.3; // magnitud minima del stick derecho para bloquear direccion de desmarque
const MANUAL_RUN_LISTEN_T = 0.5; // seg de ventana para elegir direccion con stick derecho (desmarque remoto)
const REMOTE_RUN_MIN_STICK = 0.35;  // magnitud minima del stick izquierdo al pulsar L1
const REMOTE_RUN_ALIGN_MIN = 0.2;   // alineacion minima (dot product) companero vs stick
const REMOTE_RUN_MAX_DIST = 35;     // distancia maxima para mandar a correr a un companero
const L1_TAP_MAX_MS = 220;          // tap corto de L1 (sin mantener) para ordenar desmarque
const SMART_RUN_STICK_WINDOW = 2.0; // ventana de stick derecho tras activar desmarque inteligente
const RS_SELECT_HOLD = 1200;  // ms que se mantiene la seleccion manual antes de que el sistema retome
const l1TapState = { home: null, away: null };
const rsState = {
  home: {prevMag:0, lockout:0},
  away: {prevMag:0, lockout:0},
};

function readRightStick(padIndex){
  const pad = getPadAt(padIndex);
  if(!pad) return null;
  const rxRaw = pad.axes[2]||0, ryRaw = pad.axes[3]||0;
  const rx = Math.abs(rxRaw)<RS_DEAD? 0 : rxRaw;
  const ry = Math.abs(ryRaw)<RS_DEAD? 0 : ryRaw;
  const mag = Math.hypot(rx, ry);
  if(mag < EFFORT_RS_MIN) return null;
  return {x: rx/mag, y: -ry/mag, mag};
}

function getActiveWallRunner(team){
  const list = team==='home'?homeTeam:awayTeam;
  for(const m of list){ if(m.isMakingManualRun && m.wallRun && m.wallRun.active) return m; }
  return null;
}

function getActiveSmartManualRunner(team){
  const list = team==='home'?homeTeam:awayTeam;
  for(const m of list){
    if(m.isMakingManualRun && m.wallRun?.active && m.wallRun.isSmartRun) return m;
  }
  return null;
}

/** Carrera de pared (L1+pase), no desmarque inteligente L1. */
function getActiveParedRunner(team){
  const list = team==='home'?homeTeam:awayTeam;
  for(const m of list){
    if(m.isMakingManualRun && m.wallRun?.active && m.wallRun.isParedActive && !m.wallRun.isSmartRun) return m;
  }
  return null;
}

function calculateForwardVector(p){
  if(p.dir && Math.hypot(p.dir.x, p.dir.y) > 0.01) return norm(p.dir);
  return norm({x: p.attackDir(), y: 0});
}

function findTeammateForRemoteRun(carrier, stickDir){
  const mag = Math.hypot(stickDir.x, stickDir.y);
  if(mag < REMOTE_RUN_MIN_STICK) return null;
  const dir = {x: stickDir.x/mag, y: stickDir.y/mag};
  const mates = (carrier.team==='home'?homeTeam:awayTeam).filter(m=>m.id!==carrier.id);
  let best = null, bestScore = -Infinity;
  for(const m of mates){
    const dx = m.x - carrier.x, dy = m.y - carrier.y;
    const d = Math.hypot(dx, dy);
    if(d < 0.5 || d > REMOTE_RUN_MAX_DIST) continue;
    const align = (dx/d)*dir.x + (dy/d)*dir.y;
    if(align < REMOTE_RUN_ALIGN_MIN) continue;
    const score = align*2.5 - Math.min(d, 40)/40;
    if(score > bestScore){ bestScore = score; best = m; }
  }
  return best;
}

function getPlayerRunningSpeed(p){
  return getPlayerMaxSprintVelocity(p);
}

function normalizeRunVector(v, p){
  const len = Math.hypot(v.x, v.y);
  if(len > 0) return {x: v.x / len, y: v.y / len};
  if(!p) return {x: 1, y: 0};
  const fb = calculateForwardVector(p);
  return {x: fb.x, y: fb.y};
}

function getForwardRunDirection(p){
  const gdx = p.oppGoalX() - p.x;
  const gdy = CENTER.y - p.y;
  const gd = Math.hypot(gdx, gdy);
  return gd > 0.01 ? {x: gdx / gd, y: gdy / gd} : {x: p.attackDir(), y: 0};
}

function getManualRunPartner(p){
  if(!p.wallRun || p.wallRun.partnerId == null) return null;
  return allPlayers.find(pl => pl.id === p.wallRun.partnerId) || null;
}

function getDistToManualRunPartner(p){
  const partner = getManualRunPartner(p);
  if(!partner) return Infinity;
  return dist2D(p, partner);
}

function shouldIgnoreManualRunPartner(p){
  return getDistToManualRunPartner(p) < MANUAL_RUN_PASSER_IGNORE_DIST;
}

function isManualRunInShortGrace(p){
  return !!(p.wallRun && p.wallRun.graceT > 0);
}

function canApplyManualRunStick(p){
  return !isManualRunInShortGrace(p);
}

function setManualRunTargetFromVector(p, vector){
  if(!p || !vector) return;
  const dir = normalizeRunVector(vector, p);
  p.lockedRunVector = { x: dir.x, y: dir.y };
  p.hasRunDirectionLocked = true;
  p.targetPosition = {
    x: p.x + dir.x * 14,
    y: p.y + dir.y * 14,
  };
  if(p.wallRun){
    p.wallRun.dir = dir;
    p.wallRun.canChangeDirection = false;
    p.wallRun.stickLocked = true;
  }
}

function lockManualRunDirection(p, vector){
  setManualRunTargetFromVector(p, vector);
}

function tickManualRunGrace(p, dt){
  if(!p.wallRun || p.wallRun.graceT <= 0) return;
  p.wallRun.graceT = Math.max(0, p.wallRun.graceT - dt);
  if(p.wallRun.graceT <= 0 && p.wallRun.shortStart){
    p.hasRunDirectionLocked = false;
    p.lockedRunVector = null;
    p.targetPosition = null;
  }
}

function getParedGoalTarget(p){
  return {
    x: p.oppGoalX(),
    y: clamp(CENTER.y + (p.slot.y - CENTER.y) * 0.35, 5, FIELD_W - 5),
  };
}

function computeParedCurvedDir(p, target, ignorePartner){
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  let runVector = dist > 0.08
    ? { x: dx / dist, y: dy / dist }
    : getForwardRunDirection(p);
  const openSpace = findManualRunOpenSpace(p, ignorePartner);
  if(openSpace){
    runVector = {
      x: runVector.x + (openSpace.x - p.x) * MANUAL_RUN_CURVE_BIAS,
      y: runVector.y + (openSpace.y - p.y) * MANUAL_RUN_CURVE_BIAS,
    };
  }
  return normalizeRunVector(runVector, p);
}

function applyManualRunStickInput(p, dt, padIndex){
  const wr = p.wallRun;
  if(!wr?.canChangeDirection || wr.stickWindowT <= 0) return;

  const idx = padIndex ?? p.manualRunPadIndex ?? (p.team === 'home' ? Game.p1PadIndex : Game.p2PadIndex);
  const rs = readRightStickForManualRun(idx);
  if(!rs) return;

  const stickDir = normalizeRunVector({ x: rs.x, y: rs.y }, p);
  setManualRunTargetFromVector(p, stickDir);
  setRupturaRunVelocity(p, stickDir, getRupturaRunMaxSpeed(p));
  clampPlayerVelocity(p, getRupturaRunMaxSpeed(p), getRupturaRunMaxSpeed(p));
}

function applyParedStickInput(p, dt, padIndex){
  applyManualRunStickInput(p, dt, padIndex);
}

function beginManualRunCore(p, opts){
  const partner = opts.partner || null;
  const isPared = !!opts.isPared;
  const isSmartRun = !!opts.isSmartRun;
  const steerableRun = isPared || isSmartRun;
  const dist = partner ? dist2D(p, partner) : Infinity;
  const shortStart = !steerableRun && dist < MANUAL_RUN_SHORT_DIST_THRESHOLD;

  let goalTarget = null;
  let fwd;
  if(isSmartRun){
    goalTarget = getParedGoalTarget(p);
    fwd = getForwardRunDirection(p);
  } else if(isPared){
    goalTarget = getParedGoalTarget(p);
    fwd = computeParedCurvedDir(p, goalTarget, false);
  } else if(shortStart){
    fwd = getForwardRunDirection(p);
  } else {
    fwd = opts.initialDir ? norm(opts.initialDir) : getOffensiveRunDirection(p);
  }

  p.wallRun = {
    active: true,
    dir: fwd,
    timer: WALLRUN_MAX_DURATION,
    partnerId: partner ? partner.id : null,
    shortStart,
    graceT: shortStart ? MANUAL_RUN_SHORT_GRACE_TIME : 0,
    isParedActive: isPared,
    isSmartRun,
    canChangeDirection: steerableRun,
    stickWindowT: steerableRun ? SMART_RUN_STICK_WINDOW : 0,
    targetPosition: goalTarget,
    stickLocked: false,
  };
  p.isMakingManualRun = true;
  if(isSmartRun){
    p.aiMode = AI_RUPTURA_MANUAL;
    p.hasRunDirectionLocked = false;
    p.lockedRunVector = null;
    p.defaultForwardVector = fwd;
    p.directionListenTimer = 0;
  } else if(isPared){
    p.hasRunDirectionLocked = false;
    p.lockedRunVector = null;
    p.defaultForwardVector = fwd;
    p.directionListenTimer = 0;
  } else if(shortStart){
    lockManualRunDirection(p, getForwardRunDirection(p));
  } else {
    p.hasRunDirectionLocked = false;
    p.lockedRunVector = null;
  }
  if(!steerableRun){
    p.defaultForwardVector = shortStart ? null : fwd;
    p.directionListenTimer = shortStart ? 0 : (opts.useListenTimer ? MANUAL_RUN_LISTEN_T : 0);
  }
  p.manualRunPadIndex = opts.padIndex != null ? opts.padIndex : null;
  setRupturaRunVelocity(p, fwd, getRupturaRunMaxSpeed(p));
  syncTechnicallyBusy(p);
}

function getOffensiveRunDirection(p){
  const gdx = p.oppGoalX() - p.x;
  const gdy = CENTER.y - p.y;
  const gd = Math.hypot(gdx, gdy);
  const toGoal = gd > 0.01 ? {x: gdx / gd, y: gdy / gd} : {x: p.attackDir(), y: 0};
  const currentDir = calculateForwardVector(p);
  return normalizeRunVector({
    x: OFFENSIVE_RUN_GOAL_WEIGHT * toGoal.x + OFFENSIVE_RUN_DIR_WEIGHT * currentDir.x,
    y: OFFENSIVE_RUN_GOAL_WEIGHT * toGoal.y + OFFENSIVE_RUN_DIR_WEIGHT * currentDir.y,
  }, p);
}

function findManualRunOpenSpace(p, ignorePartner){
  const dir = p.attackDir();
  const forwardDist = 12;
  const lateralOptions = [-11, -6, -2, 2, 6, 11];
  let carrier = null;
  if(!ignorePartner){
    carrier = ball.owner && ball.owner.team === p.team ? ball.owner : null;
    const partner = getManualRunPartner(p);
    if(partner && shouldIgnoreManualRunPartner(p) && carrier && carrier.id === partner.id){
      carrier = null;
    }
  }
  let best = null, bestScore = -Infinity;
  for(const lat of lateralOptions){
    const cx = clamp(p.x + dir * forwardDist, 6, FIELD_L - 6);
    const cy = clamp(CENTER.y + lat * 0.8 + (p.slot.y - CENTER.y) * 0.35, 5, FIELD_W - 5);
    const c = {x: cx, y: cy};
    let openness = 999;
    for(const opp of allPlayers){
      if(opp.team === p.team) continue;
      openness = Math.min(openness, dist2D(opp, c));
    }
    const progress = (c.x - p.x) * dir;
    const distFromCarrier = carrier ? dist2D(c, carrier) : 999;
    const score = openness * 1.6 + Math.max(0, progress) * 0.5 - Math.max(0, 6 - distFromCarrier) * 0.9;
    if(score > bestScore){ bestScore = score; best = c; }
  }
  return best;
}

function computeManualRunCurvedVector(p){
  if(isManualRunInShortGrace(p) || shouldIgnoreManualRunPartner(p)){
    return getForwardRunDirection(p);
  }
  let runVector = getManualRunDirection(p);
  const openSpace = findManualRunOpenSpace(p, shouldIgnoreManualRunPartner(p));
  if(openSpace){
    runVector = {
      x: runVector.x + (openSpace.x - p.x) * MANUAL_RUN_CURVE_BIAS,
      y: runVector.y + (openSpace.y - p.y) * MANUAL_RUN_CURVE_BIAS,
    };
  }
  return normalizeRunVector(runVector, p);
}

function startRemoteManualRun(p, padIndex, carrier){
  beginManualRunCore(p, { partner: carrier, padIndex, isSmartRun: true });
}

/** Re-activación L1: nueva ventana de 2 s y rumbo reseteado hacia el arco rival. */
function reactivateSmartManualRun(mate, padIndex, carrier){
  const wr = mate?.wallRun;
  if(!mate?.isMakingManualRun || !wr?.active || !wr.isSmartRun) return false;

  const fwd = getForwardRunDirection(mate);
  wr.canChangeDirection = true;
  wr.stickWindowT = SMART_RUN_STICK_WINDOW;
  wr.stickLocked = false;
  wr.dir = fwd;
  wr.targetPosition = getParedGoalTarget(mate);
  wr.timer = WALLRUN_MAX_DURATION;
  if(carrier) wr.partnerId = carrier.id;

  mate.hasRunDirectionLocked = false;
  mate.lockedRunVector = null;
  mate.targetPosition = null;
  mate.manualRunPadIndex = padIndex != null ? padIndex : mate.manualRunPadIndex;
  mate.aiMode = AI_RUPTURA_MANUAL;
  setRupturaRunVelocity(mate, fwd, getRupturaRunMaxSpeed(mate));
  syncTechnicallyBusy(mate);
  return true;
}

function tryTriggerSmartManualRun(carrier, stickDir, padIndex){
  if(!carrier || !ball.owner || ball.owner.team !== carrier.team) return false;
  if(getActiveParedRunner(carrier.team)) return false;

  const mate = findTeammateForRemoteRun(carrier, stickDir);
  if(!mate || mate.id === carrier.id) return false;
  if(mate.isMakingManualRun && mate.wallRun?.active && !mate.wallRun.isSmartRun) return false;

  if(reactivateSmartManualRun(mate, padIndex, ball.owner)) return true;

  startRemoteManualRun(mate, padIndex, ball.owner);
  return true;
}

function tryTriggerRemoteManualRun(carrier, stickDir, padIndex){
  return tryTriggerSmartManualRun(carrier, stickDir, padIndex);
}

function finishManualRun(p){
  if(!p) return;
  if(p.aiMode === AI_RUPTURA_MANUAL) p.aiMode = 'normal';
  if(p.aiMode === AI_RUPTURA) p.aiMode = 'normal';
  resetManualRunState(p);
}

function startManualRun(p, initialDir, partner, opts = {}){
  beginManualRunCore(p, { initialDir, partner, useListenTimer: false, isPared: !!opts.isPared, padIndex: opts.padIndex ?? null });
}

function resetManualRunState(p){
  if(!p) return;
  if(p.aiMode === AI_RUPTURA_MANUAL) p.aiMode = 'normal';
  if(p.aiMode === AI_RUPTURA) p.aiMode = 'normal';
  p.isMakingManualRun = false;
  p.hasRunDirectionLocked = false;
  p.lockedRunVector = null;
  p.targetPosition = null;
  p.defaultForwardVector = null;
  p.directionListenTimer = 0;
  p.manualRunPadIndex = null;
  if(p.wallRun) p.wallRun.active = false;
  p.wallRun = null;
  syncTechnicallyBusy(p);
}

function cancelManualRunForPlayer(p, stopMotion){
  if(!p || !p.isMakingManualRun) return false;
  resetManualRunState(p);
  if(stopMotion !== false){
    p.vx = 0;
    p.vy = 0;
  }
  return true;
}

function cancelManualRunIfBallOwner(p){
  if(ball.owner === p) return cancelManualRunForPlayer(p, true);
  return false;
}

function cancelManualRunsForTeam(team){
  const squad = team==='home'?homeTeam:awayTeam;
  for(const pl of squad) cancelManualRunForPlayer(pl, true);
}

function notifyManualRunPossessionChange(newOwner, prevOwner){
  if(!newOwner) return;
  cancelManualRunForPlayer(newOwner, true);
  const prevTeam = prevOwner ? prevOwner.team :
    (ball.lastTouchTeam && ball.lastTouchTeam !== newOwner.team ? ball.lastTouchTeam : null);
  if(prevTeam && prevTeam !== newOwner.team) cancelManualRunsForTeam(prevTeam);
}

function syncManualRunWithPossession(){
  const owner = ball.owner;
  if(!owner) return;
  cancelManualRunForPlayer(owner, true);
  cancelManualRunsForTeam(owner.team === 'home' ? 'away' : 'home');
}

function readRightStickForManualRun(padIndex){
  const pad = getPadAt(padIndex);
  if(!pad) return null;
  const rxRaw = pad.axes[2]||0, ryRaw = pad.axes[3]||0;
  const mag = Math.hypot(rxRaw, ryRaw);
  if(mag <= MANUAL_RUN_RS_LOCK) return null;
  return {x: rxRaw/mag, y: -ryRaw/mag, mag};
}

function captureManualRunDirection(p, padIndex){
  if(p.hasRunDirectionLocked || !canApplyManualRunStick(p)) return;
  const rs = readRightStickForManualRun(padIndex);
  if(!rs) return;
  lockManualRunDirection(p, normalizeRunVector({x: rs.x, y: rs.y}, p));
}

function resolveManualRunDirection(p, dt, padIndex){
  if(p.hasRunDirectionLocked) return true;
  if(!canApplyManualRunStick(p)) return true;

  if(p.directionListenTimer > 0){
    p.directionListenTimer = Math.max(0, p.directionListenTimer - dt);
    const rs = readRightStickForManualRun(padIndex);
    if(rs && canApplyManualRunStick(p)){
      lockManualRunDirection(p, normalizeRunVector({x: rs.x, y: rs.y}, p));
      p.directionListenTimer = 0;
      return true;
    }
    if(p.directionListenTimer <= 0){
      lockManualRunDirection(p, getOffensiveRunDirection(p));
      return true;
    }
    return false;
  }

  captureManualRunDirection(p, padIndex);
  return true;
}

function getManualRunDirection(p){
  if(p.hasRunDirectionLocked && p.lockedRunVector) return {x: p.lockedRunVector.x, y: p.lockedRunVector.y};
  if(p.wallRun && p.wallRun.dir) return {x: p.wallRun.dir.x, y: p.wallRun.dir.y};
  return getOffensiveRunDirection(p);
}

function isEffortRightStickIntent(team, padIndex){
  const p = team === 'home' ? controlledPlayer() : controlledPlayer2();
  if(!p || !canApplyEffortTouch(p)) return false;
  const pad = getPadAt(padIndex);
  if(!pad) return false;
  const rxRaw = pad.axes[2]||0, ryRaw = pad.axes[3]||0;
  const rx = Math.abs(rxRaw)<RS_DEAD? 0 : rxRaw;
  const ry = Math.abs(ryRaw)<RS_DEAD? 0 : ryRaw;
  const mag = Math.hypot(rx, ry);
  const stKey = 'e'+p.id;
  if(!effortRsState[stKey]) effortRsState[stKey] = {prevMag:0};
  const effortSt = effortRsState[stKey];
  const rsFlick = mag >= EFFORT_RS_MIN && effortSt.prevMag < EFFORT_RS_MIN;
  const heldR1 = pad.buttons[5] && (pad.buttons[5].pressed || pad.buttons[5].value>0.5);
  return rsFlick && heldR1;
}

function isGameplayInputBlocked(){
  return isUIModeActive();
}

/** Fail-safe: no detiene el tick si el import de state.js falla o la función no está disponible. */
function isEffortSwitchLockedSafe(team){
  try {
    const fn = (typeof isPlayerSwitchLockedForEffort === 'function')
      ? isPlayerSwitchLockedForEffort
      : (typeof window !== 'undefined' && typeof window.isPlayerSwitchLockedForEffort === 'function'
        ? window.isPlayerSwitchLockedForEffort
        : null);
    return fn ? !!fn(team) : false;
  } catch(_e){
    return false;
  }
}

function isAssignmentLockedSafe(p){
  try {
    const fn = (typeof isPlayerAssignmentLocked === 'function')
      ? isPlayerAssignmentLocked
      : (typeof window !== 'undefined' && typeof window.isPlayerAssignmentLocked === 'function'
        ? window.isPlayerAssignmentLocked
        : null);
    return fn ? !!fn(p) : !!(p && p.lockPlayerAssignment);
  } catch(_e){
    return !!(p && p.lockPlayerAssignment);
  }
}

function handleRightStickSwitch(dt, team, padIndex){
  if(isGameplayInputBlocked()) return;
  if(gameState==='practice') return; // en la Arena de Practica hay un solo jugador util: no tiene sentido cambiar de cursor
  if(isEffortSwitchLockedSafe(team)) return;
  const st = rsState[team];
  if(st.lockout>0) st.lockout -= dt;
  const pad = getPadAt(padIndex);
  if(!pad){ st.prevMag = 0; return; }
  const rxRaw = pad.axes[2]||0, ryRaw = pad.axes[3]||0;
  const rx = Math.abs(rxRaw)<RS_DEAD? 0 : rxRaw;
  const ry = Math.abs(ryRaw)<RS_DEAD? 0 : ryRaw;
  const mag = Math.hypot(rx, ry);

  // Pared activa: el stick derecho redirige la carrera en updateWallRun (no cambia de jugador).
  if(getActiveWallRunner(team)){
    st.prevMag = mag;
    return;
  }

  // Effort touch (R1 + flick RS): el input de direccion no debe disparar cambio de jugador.
  if(isEffortRightStickIntent(team, padIndex)){
    st.prevMag = mag;
    st.lockout = RS_FLICK_LOCKOUT;
    return;
  }

  // un "flick" es que el stick pase de reposo a bien estirado de un frame a otro
  if(mag>=RS_FLICK_MIN && st.prevMag<RS_FLICK_MIN && st.lockout<=0){
    const dir = {x: rx/mag, y: -ry/mag}; // mismo criterio de ejes que el stick izquierdo
    const teamOwnsBall = ball.owner && ball.owner.team===team;
    // con la pelota en posesion del equipo, el stick derecho NO cambia de jugador (igual que L1):
    // se reserva para elegir la direccion de la carrera de la pared, sin que se cruce con el cambio manual.
    if(!teamOwnsBall) selectPlayerByFlick(dir, team);
    st.lockout = RS_FLICK_LOCKOUT;
  }
  st.prevMag = mag;
}

function selectPlayerByFlick(dir, team){
  if(isEffortSwitchLockedSafe(team)) return;
  const isHome = team==='home';
  const cur = isHome ? controlledPlayer() : controlledPlayer2();
  if(!cur || isAssignmentLockedSafe(cur)) return;
  const teamList = isHome ? homeTeam : awayTeam;
  let best = null, bestScore = -Infinity;
  for(const m of teamList){
    if(m.id===cur.id) continue;
    const dx = m.x-cur.x, dy = m.y-cur.y;
    const d = Math.hypot(dx,dy);
    if(d < 0.4) continue;
    const align = (dx/d)*dir.x + (dy/d)*dir.y; // -1..1, que tan alineado esta con el flick
    if(align < 0.15) continue; // cono bien abierto: no hace falta apuntar preciso
    const score = align*2.2 - Math.min(d,40)/40; // prioriza direccion, la distancia solo desempata
    if(score > bestScore){ bestScore = score; best = m; }
  }
  if(best){
    if(isHome){ setControlled(best); Game.manualOverrideUntil = performance.now() + RS_SELECT_HOLD; }
    else { setControlled2(best); Game.manualOverrideUntil2 = performance.now() + RS_SELECT_HOLD; }
  }
}

function padButtons(pad, padKey){
  const now = {};
  if(pad){
    pad.buttons.forEach((b,i)=>{ now[i]=b.pressed || b.value>0.5; });
  }
  const prev = prevButtonsByPad[padKey] || {};
  const justPressed = {};
  for(const k in now){ justPressed[k] = now[k] && !prev[k]; }
  prevButtonsByPad[padKey] = now;
  return {now, justPressed, prev};
}

// Super cancel (L2+R2): solo cuenta si ambos gatillos se presionan casi a la vez.
// Si uno ya estaba sostenido (ej. R2 corriendo) y llega el otro, NO es cancel.
const SUPER_CANCEL_SYNC_MS = 50;
const triggerSyncPressState = {};
function detectSyncTriggerPress(key, aJust, bJust){
  if(!triggerSyncPressState[key]) triggerSyncPressState[key] = {a:0, b:0};
  const st = triggerSyncPressState[key];
  const now = performance.now();
  if(aJust) st.a = now;
  if(bJust) st.b = now;
  if(aJust && bJust) return true;
  if(aJust && st.b && (now - st.b) <= SUPER_CANCEL_SYNC_MS) return true;
  if(bJust && st.a && (now - st.a) <= SUPER_CANCEL_SYNC_MS) return true;
  return false;
}

function readInput(padIndex, scheme, padKey){
  if(isGameplayInputBlocked()){
    return {
      move:{x:0,y:0}, sprint:false, jockey:false,
      pressPass:false, pressShot:false, pressThrough:false, pressCross:false,
      pressSwitch:false, pressTackle:false, pressTackleAlt:false, pressSlide:false,
      releasedSwitch:false,
      releasedPass:false, releasedShot:false, releasedThrough:false, releasedCross:false,
      heldPass:false, heldShot:false, heldThrough:false, heldCross:false,
      heldL1:false, heldR1:false, heldL2:false, heldR2:false,
      heldManualCancel:false, pressSuperCancel:false,
    };
  }
  const pad = getPadAt(padIndex);
  let move = {x:0,y:0};
  let sprint = false, jockey=false;
  let pressPass=false, pressShot=false, pressThrough=false, pressCross=false, pressSwitch=false, pressTackle=false, pressTackleAlt=false, pressSlide=false;
  let releasedSwitch=false;
  let releasedPass=false, releasedShot=false, releasedThrough=false, releasedCross=false;
  let heldPass=false, heldShot=false, heldThrough=false, heldCross=false, heldL1=false, heldR1=false, heldL2=false, heldR2=false;
  let pressSuperCancel = false;
  let heldManualCancel = false;

  if(pad){
    const lx = axisOrZero(pad.axes[0]||0), ly = axisOrZero(pad.axes[1]||0);
    move.x = lx; move.y = -ly;
    sprint = (pad.buttons[7] && pad.buttons[7].value>0.15); // R2
    heldL2 = !!(pad.buttons[6] && pad.buttons[6].value > 0.15); // L2: jockey (defensivo) / rosca al disparar
    jockey = false; // se resuelve por jugador en applyDefensiveControlFlags
    heldR2 = sprint;
    heldManualCancel = heldL2 && heldR2; // Full Manual Cancel estilo PES: L2+R2 sostenidos
    const {now, justPressed, prev} = padButtons(pad, padKey);
    pressSuperCancel = detectSyncTriggerPress(padKey+'_triggers', !!justPressed[6], !!justPressed[7]);
    heldPass = !!now[0]; heldShot = !!now[2]; heldThrough = !!now[3]; heldCross = !!now[1];
    pressPass = !!justPressed[0]; pressShot = !!justPressed[2];
    pressThrough = !!justPressed[3]; pressCross = !!justPressed[1];
    releasedPass = !now[0] && !!prev[0]; releasedShot = !now[2] && !!prev[2];
    releasedThrough = !now[3] && !!prev[3]; releasedCross = !now[1] && !!prev[1];
    releasedPass = !now[0] && !!prev[0]; releasedShot = !now[2] && !!prev[2];
    releasedThrough = !now[3] && !!prev[3]; releasedCross = !now[1] && !!prev[1];
    pressSwitch = !!justPressed[4]; // L1
    releasedSwitch = !now[4] && !!prev[4];
    heldL1 = !!now[4]; // L1 sostenido (para el combo de "la pared": L1 + pase)
    heldR1 = !!now[5]; // R1: rosca izq. al patear · presión secundaria CPU (sin tacle)
    // ▢ Cuadrado = entrada de pie · △ Triangulo = entrada si rival tiene balon / tiro si no · ○ = barrida
    pressTackle = !!justPressed[3];
    pressSlide = !!justPressed[1];
  } else {
    if(anyKey(scheme.up)) move.y+=1;
    if(anyKey(scheme.down)) move.y-=1;
    if(anyKey(scheme.left)) move.x-=1;
    if(anyKey(scheme.right)) move.x+=1;
    const m = Math.hypot(move.x,move.y); if(m>1){move.x/=m;move.y/=m;}
    sprint = anyKey(scheme.sprint);
    heldPass = anyKey(scheme.pass); heldShot = anyKey(scheme.shot); heldThrough = anyKey(scheme.through); heldCross = anyKey(scheme.cross);
    pressPass = heldPass && !anyKeyPrev(scheme.pass);
    pressShot = heldShot && !anyKeyPrev(scheme.shot);
    pressThrough = heldThrough && !anyKeyPrev(scheme.through);
    pressCross = heldCross && !anyKeyPrev(scheme.cross);
    releasedPass = !heldPass && anyKeyPrev(scheme.pass);
    releasedShot = !heldShot && anyKeyPrev(scheme.shot);
    releasedThrough = !heldThrough && anyKeyPrev(scheme.through);
    releasedCross = !heldCross && anyKeyPrev(scheme.cross);
    releasedPass = !heldPass && anyKeyPrev(scheme.pass);
    releasedShot = !heldShot && anyKeyPrev(scheme.shot);
    releasedThrough = !heldThrough && anyKeyPrev(scheme.through);
    releasedCross = !heldCross && anyKeyPrev(scheme.cross);
    pressSwitch = anyKey(scheme.switch) && !anyKeyPrev(scheme.switch);
    releasedSwitch = !heldL1 && anyKeyPrev(scheme.switch);
    heldL1 = anyKey(scheme.switch); // en teclado, la tecla de "cambiar jugador" hace de L1 para el combo
    pressTackle = anyKey(scheme.tackle) && !anyKeyPrev(scheme.tackle);
    pressSlide = anyKey(scheme.slide) && !anyKeyPrev(scheme.slide);
    heldR1 = anyKey(scheme.curveLeft);   // equivalente de R1: efecto hacia la izquierda
    heldL2 = anyKey(scheme.curveRight);  // equivalente de L2
    jockey = false;
    heldR2 = sprint; // Shift = R2
    heldManualCancel = heldL2 && heldR2; // teclado: P + Shift = Full Manual Cancel
    const l2JustKb = heldL2 && !anyKeyPrev(scheme.curveRight);
    const sprintJustKb = sprint && !anyKeyPrev(scheme.sprint);
    pressSuperCancel = detectSyncTriggerPress(padKey+'_triggers', l2JustKb, sprintJustKb);
  }
  return {move, sprint, jockey, pressPass, pressShot, pressThrough, pressCross, pressSwitch, pressTackle, pressTackleAlt, pressSlide,
          releasedSwitch,
          releasedPass, releasedShot, releasedThrough, releasedCross,
          heldPass, heldShot, heldThrough, heldCross, heldL1, heldR1, heldL2, heldR2, heldManualCancel, pressSuperCancel};
}
let prevKeys = {};
function snapshotKeys(){ prevKeys = Object.assign({}, Keys); }
function getInputKeyState(){
  return { keys: Keys, prev: prevKeys };
}

// la Arena de Practica usa una camara ROTADA respecto a la de partido (ver projectPractice):
// alli la "profundidad" (adelante/atras, lo que en partido es el eje Y) pasa a ser el eje X, y el
// paneo horizontal en pantalla (lo que en partido es el eje X) pasa a ser el eje Y. El input del
// stick/teclado siempre llega en los mismos ejes de PANTALLA (arriba/abajo, izq/derecha); para que
// "adelante" siga moviendo al jugador hacia el arco (y no de costado) hay que rotar ese vector de
// entrada 90° antes de usarlo como moveDir de mundo. Sin este ajuste, en la Arena de Practica el
// stick queda con los ejes cruzados (adelante mueve de costado, costado mueve adelante/atras).
function handleSmartManualRunInput(p, input, team, padIndex){
  if(!p || !ball.owner || ball.owner.team !== team) return false;
  if(getActiveParedRunner(team)) return false;
  if(p.charging === 'wallpass') return false;

  const move = remapMoveForCamera(input.move);
  const now = performance.now();
  const tapKey = team;

  if(input.pressSwitch){
    l1TapState[tapKey] = {
      t: now,
      move: { x: move.x, y: move.y },
      wallPassIntent: !!input.heldPass,
    };
  }

  if(l1TapState[tapKey]){
    if(input.heldPass || p.charging === 'wallpass'){
      l1TapState[tapKey].wallPassIntent = true;
    }
  }

  if(input.releasedSwitch){
    const st = l1TapState[tapKey];
    l1TapState[tapKey] = null;
    if(!st || st.wallPassIntent) return false;
    const dur = now - st.t;
    if(dur > L1_TAP_MAX_MS) return false;
    return tryTriggerSmartManualRun(p, st.move, padIndex);
  }

  return false;
}

function isStickAimedAtTeammate(p, move){
  if(Math.hypot(move.x, move.y) < REMOTE_RUN_MIN_STICK) return false;
  return !!findTeammateForRemoteRun(p, move);
}

function remapMoveForCamera(move){
  if(gameState!=='practice') return move;
  return {x: move.y, y: move.x};
}

/* ============================================================
   INPUT MANAGER — effort touch y fake shot fuera de IA / decisionTree
   Prioridad absoluta: interrumpe cualquier playerState y delega la validacion
   de posesion dentro de effortTouch() / fakeShot().
   ============================================================ */
const InputManager = {
  process(p, input, padIndex, scheme){
    if(!p) return false;
    if(isFakeShotActive && p.id === fakeShotOwnerId) return true;
    if(this.processEffortTouch(p, input, padIndex, scheme)) return true;
    if(this.processFakeShot(p, input)) return true;
    return false;
  },

  processEffortTouch(p, input, padIndex, scheme){
    const ownAutopassChase = ball.possessedBy === p.id && !ball.owner;
    const chainingOwnEffort = isChaseOwner(p) || ownAutopassChase;
    if(p.effortTouchCooldown > 0 && !chainingOwnEffort) return false;
    const cmd = detectEffortTouchInput(p, input, padIndex, scheme);
    if(!cmd) return false;
    interruptPlayerStateForTechnicalAction(p);
    return effortTouch(p, cmd.dir, cmd.type);
  },

  processFakeShot(p, input){
    if(isFakeShotActive) return false;
    if(!input.pressPass || !canCancelChargeWithFakeShot(p)) return false;
    return executeFakeShot(p, input.move);
  },
};

/* ============================================================
   ACCIONES: pases, tiros, filtrados, centros
   ============================================================ */
const CHARGE_MAX_MS = 450;
// --- PREPARACION DE PASE/TIRO (ex-instantaneo) --------------------------------------------------
// Tiempo minimo entre el PRIMER frame en que se presiona el boton y el momento en que la pelota
// sale de verdad del pie. Si el jugador suelta el boton antes de que pase este tiempo (un toque
// rapido, que antes pegaba "instantaneo"), la carga se congela con la potencia que tenia hasta ese
// momento y el resto del tiempo se completa como un "windup" (PREPARANDO_ACCION fase 2, ver
// updatePendingKick): la pierna queda atras, el jugador se frena, y recien ahi se pega de verdad.
// Si se sostiene el boton mas tiempo que esto (la carga normal de potencia), el pase/tiro sigue
// saliendo apenas se suelta, exactamente como antes.
const PREP_MIN_MS = 300;
// friccion durante TODA la preparacion (cargando la barra o en el windup post-solte): el jugador
// no se frena del todo, pero corre bastante mas lento, como llevando la pierna hacia atras
const PREP_SPEED_FACTOR = 0.55;
// AMAGUE DE TIRO / Fake Shot: balon suelto + persecucion (X cancela carga con chargeBar > 0).
const FEINT_DURATION = 0.5;
const FEINT_ACTION_COOLDOWN = 0.3; // 300ms: bloqueo de remate tras amague tecnico
const FAKE_SHOT_REPOSSESS_COOLDOWN = 0.2; // 200ms: no reposeer la pelota tras soltarla
const FAKE_SHOT_CHASE_LOCK = 0.3;           // 300ms: direccion bloqueada hacia la trayectoria
const FAKE_SHOT_AI_FREEZE = 0.3;            // 300ms: freeze IA defensiva cercana

// DRAGBACK (L1+R1 + stick hacia la espalda del jugador): pisa la pelota y la arrastra un poco hacia
// atras con la suela; a diferencia del amague de tiro no hace falta estar cargando nada, se hace
// corriendo normal con la pelota. Duracion mas larga que el toque del amague porque es un gesto de
// pisada (ida y vuelta de la pierna), no un golpe seco.
const DRAGBACK_DURATION = 0.34;
// impulso de la PELOTA hacia atras (se fija, no se suma, por la misma razon que en el amague): con
// GROUND_FRICTION=12, v=2.4 da un recorrido de ~0.24m, un retroceso corto ("un poco hacia atras"),
// bastante mas corto que el toque del amague de tiro (que busca medio metro largo).
const DRAGBACK_TOUCH_FORCE = 2.4;
// cuanta velocidad conserva el JUGADOR al arrancar el gesto (se frena fuerte, como plantando el pie
// para pisar la pelota en vez de seguir corriendo de largo)
const DRAGBACK_PLAYER_BRAKE = 0.15;
const KICK_POWER_MIN = 0.1;
const KICK_POWER_MAX = 1.0;
function getInitialPower(){
  return 0.15;
}
function normalizeKickPower(power){
  const n = Number(power);
  if(!Number.isFinite(n)) return getInitialPower();
  return clamp(n, KICK_POWER_MIN, KICK_POWER_MAX);
}
// Potencia 0..1 segun cuanto tiempo lleva sostenido el boton (NO se acumula por frame con +=).
function chargePowerFromElapsed(elapsedMs){
  return normalizeKickPower(Math.max(getInitialPower(), elapsedMs / CHARGE_MAX_MS));
}
export function chargeLevel(p){
  if(p.pendingKick) return normalizeKickPower(p.pendingKick.power);
  const buf = p.actionBuffer;
  if(buf?.type && !buf.chargeStart) return normalizeKickPower(buf.power);
  if(buf?.chargeStart > 0){
    return chargePowerFromElapsed(performance.now() - buf.chargeStart);
  }
  if(!p.isChargingShot && !p.charging) return 0;
  if(!p.charging) return 0;
  if(!p.chargeStart) return 0;
  return chargePowerFromElapsed(performance.now() - p.chargeStart);
}
function syncGlobalChargingShot(p){
  Game.isChargingShot = !!(p && p.isChargingShot);
}
function syncGlobalCharging(p){
  const buf = p?.actionBuffer;
  Game.isCharging = !!(buf && buf.chargeStart > 0);
}
function getCurrentPower(p){
  return chargeLevel(p);
}

function executeBufferedGroundKick(p, kickType, power, curve){
  const currentPower = normalizeKickPower(power ?? getCurrentPower(p));
  playGroundActionAtContact(p, kickType, currentPower, curve);
}
function clearChargingShotState(p){
  if(!p) return;
  p.isChargingShot = false;
  p.charging = null;
  p.chargeStart = 0;
  syncGlobalChargingShot(p);
}
function isShotFeintBlocked(p){
  return !!(p && p.feintActionCooldown > 0);
}
function isPassBlockedAfterFakeShot(p){
  return !!(p && p.feintPostPassBlockT > 0);
}
function isFakeShotInputBlocked(p){
  return !!(isFakeShotActive && p && p.id === fakeShotOwnerId);
}
function completeFakeShot(p){
  if(!isFakeShotActive) return;
  isFakeShotActive = false;
  fakeShotOwnerId = null;
  Game.isChargingShot = false;
  if(!p) return;
  p.isFakeShooting = false;
  syncTechnicallyBusy(p);
  p.feintPostPassBlockT = FEINT_ACTION_COOLDOWN;
  p.pendingKick = null;
  p.charging = null;
  p.chargeStart = 0;
  syncGlobalChargingShot(p);
}
function updateFakeShotState(dt){
  if(fakeShotOwnerId){
    const owner = getPlayerById(fakeShotOwnerId);
    if(owner){
      if(owner.feintPostPassBlockT > 0) owner.feintPostPassBlockT -= dt;
      if(owner.fakeShotCooldown > 0){
        owner.fakeShotCooldown = Math.max(0, owner.fakeShotCooldown - dt);
        if(owner.fakeShotCooldown <= 0 && !owner.isStunned && !owner.stun) owner.canCollectBall = true;
      }
      if(owner.fakeShotChaseLockT > 0) owner.fakeShotChaseLockT = Math.max(0, owner.fakeShotChaseLockT - dt);
    }
  }
  if(!isFakeShotActive || !fakeShotOwnerId) return;
  const owner = getPlayerById(fakeShotOwnerId);
  if(!owner){
    isFakeShotActive = false;
    fakeShotOwnerId = null;
    return;
  }
  if(ball.owner === owner && owner.fakeShotCooldown <= 0) completeFakeShot(owner);
}
function canCancelChargeWithFakeShot(p){
  if(!p || ball.owner !== p) return false;
  if(chargeLevel(p) > 0) return true;
  const buf = p.actionBuffer;
  return !!(p.charging || p.pendingKick || p.isChargingShot || (buf && (buf.type || buf.chargeStart > 0)));
}
// Carga / suelta de tiro (Cuadrado). El amague tecnico (fake shot) vive en InputManager.
// La carga de potencia va al actionBuffer; no altera movimiento ni estado del jugador.
function handleShotChargeInput(p, input, aimDir, curve){
  if(isFakeShotInputBlocked(p)) return true;
  if(ball.owner !== p){
    if(p.isChargingShot) clearChargingShotState(p);
    syncGlobalChargingShot(p);
    return false;
  }
  if(isShotFeintBlocked(p)){
    syncGlobalChargingShot(p);
    return false;
  }

  if(input.pressSuperCancel && (p.charging || p.pendingKick || p.actionBuffer?.type || p.actionBuffer?.chargeStart > 0)){
    clearChargingShotState(p);
    cancelAction(p);
    syncGlobalChargingShot(p);
    return true;
  }

  // Boton X (Pase Corto): fake shot consume el input antes que la suelta de Cuadrado
  if(input.pressPass && canCancelChargeWithFakeShot(p)){
    executeFakeShot(p, input.move);
    return true;
  }

  // Ventana de amague: isChargingShot activo mientras Cuadrado esta cargado (solo fake shot)
  const buf = p.actionBuffer;
  if(input.heldShot && buf?.chargeStart > 0 && getBufferKickType(buf) === 'shot'){
    p.isChargingShot = true;
  } else if(input.heldShot && buf?.type === 'shot' && !buf.chargeStart){
    p.isChargingShot = true;
  } else if(!input.heldShot){
    p.isChargingShot = false;
  }

  if(input.releasedShot && p.isChargingShot){
    if(isFakeShotInputBlocked(p) || isShotFeintBlocked(p) || isFakeShotActive){
      clearChargingShotState(p);
      syncGlobalChargingShot(p);
      return true;
    }
    p.isChargingShot = false;
    syncGlobalChargingShot(p);
  }

  syncGlobalChargingShot(p);
  return false;
}
function startCharge(p, type){
  if(isFakeShotInputBlocked(p)) return;
  if(p && isPassBlockedAfterFakeShot(p) && type !== 'shot') return;
  if(isSetPieceShotOnly(p) && type !== 'shot') return;
  if(ball.owner!==p) return;
  if(p.charging || p.pendingKick) return;
  p.charging = type;
  p.chargeStart = performance.now();
}
// Dispara o entra en windup SOLO al soltar el boton; la potencia se fija en ese instante.
function releaseCharge(p, aimDir, curve){
  if(isFakeShotInputBlocked(p)) return;
  if(p && isPassBlockedAfterFakeShot(p) && p.charging && p.charging !== 'shot') return;
  if(!p.charging || ball.owner!==p) { p.charging=null; return; }
  const elapsed = performance.now() - p.chargeStart;
  const power = normalizeKickPower(chargePowerFromElapsed(elapsed));
  let type = p.charging;
  p.charging = null;

  if(Game.setPieceMode && isSetPieceTaker(p)){
    if(Game.setPiece.type === SET_PIECE.GOAL_KICK && isGoalkeeper(p)){
      p.isChargingShot = false;
      syncGlobalChargingShot(p);
      return;
    }
    if(isSetPieceShotOnly(p)) type = 'shot';
  }

  if(isKickoffWaiting() && isKickoffTaker(p)){
    startKickoffManeuver(p, type, power, curve, aimDir);
    return;
  }

  executeKick(p, type, aimDir, power, curve);
}
// Carga al mantener, suelta al soltar — wallpass usa startCharge legacy; el resto va al actionBuffer.
function handleBallOwnerKicks(p, input, team, aimDir, curve, padIndex){
  if(isFakeShotInputBlocked(p)) return;
  if(p.pendingKick) return;
  if(isShotFeintBlocked(p)) return;
  if(isPassBlockedAfterFakeShot(p) && (input.releasedPass || input.releasedThrough || input.releasedCross || (input.heldPass && !p.charging) || (input.heldThrough && !p.charging) || (input.heldCross && !p.charging))) return;

  // Boton X (Pase Corto): intercepcion Fake Shot — aborta carga y se traga el input (no pase corto)
  if(input.pressPass && canCancelChargeWithFakeShot(p)){
    executeFakeShot(p, input.move);
    return;
  }

  // Tiro: carga via actionBuffer (isChargingShot solo para ventana de amague); X ya interceptada arriba
  if(p.isChargingShot) return;

  // La pared (L1+pase): unico caso que sigue usando startCharge/releaseCharge directo
  if(input.releasedPass){
    if(p.charging === 'wallpass') releaseWallPass(p, team, aimDir, curve, padIndex);
  } else if(input.heldPass && !p.charging && input.heldL1){
    startCharge(p, 'wallpass');
  }
}
// cancela cualquier PREPARANDO_ACCION en curso (cargando o en windup) sin pegarle a la pelota;
// el balon se queda pegado al pie y el jugador recupera el control total de carrera de inmediato
function cancelAction(p){
  clearChargingShotState(p);
  clearPendingAction(p);
  p.pendingKick = null;
  if(p?.isMakingManualRun) p.targetPosition = null;
}

// Aborta la carga activa y resetea chargeBar / isCharging (alias usado por Fake Shot con X).
function cancelCurrentAction(p){
  if(!p) return;
  cancelAction(p);
  p.charging = null;
  p.chargeStart = 0;
  p.isChargingShot = false;
  p.pendingKick = null;
  clearPendingAction(p);
  syncGlobalChargingShot(p);
}

function clampSelfTouchVelocity(vx, vy, maxVel = EFFORT_TOUCH_MAX_VELOCITY){
  const sp = Math.hypot(vx, vy);
  if(sp <= maxVel || sp < 0.001) return {vx, vy, speed: sp};
  const s = maxVel / sp;
  return {vx: vx*s, vy: vy*s, speed: maxVel};
}





// Impulso en direccion del stick/input — burst seco, sin mezclar velocidad del jugador.


function calcSelfTouchBurstSpeed(targetDist){
  return targetDist * SELF_TOUCH_BURST_MULT;
}

function activateSelfTouchCollectBlock(p){
  if(!p) return;
  p.canCollectBall = false;
  p.canCollectBlockT = SELF_TOUCH_COLLECT_BLOCK;
  p.releaseCooldown = Math.max(p.releaseCooldown, SELF_TOUCH_COLLECT_BLOCK);
}

function updateSelfTouchCollectBlock(p, dt){
  if(!p || p.canCollectBlockT <= 0) return;
  p.canCollectBlockT -= dt;
  if(p.canCollectBlockT <= 0){
    p.canCollectBlockT = 0;
    if(!p.isStunned && !p.stun) p.canCollectBall = true;
  }
}

function applySelfTouchBrake(p){
  if(!p) return;
  p.selfTouchBrakeT = SELF_TOUCH_PLAYER_BRAKE;
  p.vx = 0;
  p.vy = 0;
}

// Impulso en direccion del stick/input — burst seco, sin mezclar velocidad del jugador.

function applySelfTouchImpulse(p, inputDir, targetDist, source = 'effort'){
  const dir = resolveSelfTouchDirection(inputDir, p);
  applySelfTouchBrake(p);
  activateSelfTouchCollectBlock(p);
  const speed = calcSelfTouchBurstSpeed(targetDist);
  return {dir, ...beginSelfTouchChase(p, dir.x * speed, dir.y * speed, source)};
}

function beginSelfTouchChase(p, vx, vy, source = 'effort'){
  const maxVel = source === 'effort' ? EFFORT_TOUCH_MAX_VELOCITY : FEINT_TOUCH_MAX_VELOCITY;
  const vel = clampSelfTouchVelocity(vx, vy, maxVel);
  if(source === 'effort'){
    activateBallLock(p);
  }
  ball.owner = null;
  ball.state = BALL_STATE.FREE;
  ball.lastTouchedBy = p.id;
  ball.lastTouchTeam = p.team;
  ball.effortDetach = {
    ownerId: p.id,
    team: p.team,
    blockT: EFFORT_CHASE_TEAMMATE_BLOCK,
    source,
  };
  ball.feintDetach = null;
  PrivateChaseEvents.emit(p.id, source);
  // Fuerza pura: impulso directo, sin mezclar velocidad del jugador ni inercia previa de la pelota
  ball.vx = vel.vx;
  ball.vy = vel.vy;
  ball.vz = 0;
  ball.z = BALL_RADIUS;
  ball.initialSpeed = vel.speed;
  ball.curveFactor = 0;
  ball.groundFrictionMult = 1;
  ball.highKick = false;
  ball.highKickType = null;
  ball.effortRollSoftT = source === 'effort' ? EFFORT_ROLL_SOFT_DURATION : 0;
  activateIgnorePossession();
  return vel;
}

// Intercepcion de X durante carga: limpia chargeBar/isCharging y ejecuta el amague tecnico.
function executeFakeShot(p, moveDir){
  if(!p || isFakeShotActive || isShotFeintBlocked(p)) return false;
  if(!canCancelChargeWithFakeShot(p)) return false;
  resetActionBuffer(p);
  interruptPlayerStateForTechnicalAction(p);
  cancelCurrentAction(p);
  return fakeShot(p, moveDir);
}

// Fake shot: libera la pelota a 'free' e inicia persecucion forzada.
function fakeShot(p, moveDir){
  if(!p || isFakeShotActive || !canCancelChargeWithFakeShot(p) || isShotFeintBlocked(p)) return false;

  console.log('Action Triggered:', 'fakeShot');
  isFakeShotActive = true;
  fakeShotOwnerId = p.id;

  clearChargingShotState(p);
  clearPendingAction(p);
  p.pendingKick = null;
  p.charging = null;
  p.chargeStart = 0;
  syncGlobalChargingShot(p);
  clearTeammateInterferenceForTechnicalAction(p);

  ball.owner = null;
  ball.state = BALL_STATE.FREE;
  ball.passOrigin = null;
  clearPassTargetTeam(p.team);

  const kickDir = resolveSelfTouchDirection(moveDir, p);
  p.facing = Math.atan2(kickDir.y, kickDir.x);
  p.lastAim = kickDir;
  syncPlayerDir(p);

  p.isDribbling = false;
  ball.lastAction = 'feint';

  const legLead = Math.sin(p.animPhase) >= 0 ? 1 : -1;
  p.touchAnim = {t:0, dur: FEINT_DURATION * 0.55, leg: legLead};

  applySelfTouchImpulse(p, kickDir, DIST_FAKE, 'feint');
  ball.effortDetach = null;
  ball.feintDetach = {ownerId: p.id, team: p.team};
  p.isFakeShooting = true;
  p.fakeShotCooldown = FAKE_SHOT_REPOSSESS_COOLDOWN;
  p.fakeShotChaseLockT = FAKE_SHOT_CHASE_LOCK;
  p.canCollectBall = false;
  p.effortChaseTarget = {x: ball.x, y: ball.y};
  const maxSp = getPlayerMaxSprintVelocity(p);
  p.maxSprintVelocity = maxSp;
  p.maxVelocity = maxSp;
  syncTechnicallyBusy(p);
  startForcedChase(p, ball);
  p.feint = null;
  p.feintActionCooldown = FEINT_ACTION_COOLDOWN;
  return true;
}

// Persecucion forzada post-toque: input prioritario; pelota ligada al jugador durante R2.
function updateForcedChase(p, dt, input){
  if(isPlayerSprintChasing(p)) return false;
  if(ball.isContested && !isBallContestedSeekAllowed(p)){
    clearForcedChaseState(p, input?.move);
    return false;
  }
  if(!isPostTouchChasing(p)) return false;
  if(isPlayerStunned(p) || isPlayerStaggered(p)){
    clearForcedChaseState(p, input?.move);
    return false;
  }

  if(ball.effortDetach && ball.effortDetach.ownerId !== p.id && ball.state !== BALL_STATE.LOOSE_BALL){
    clearForcedChaseState(p, input?.move);
    return false;
  }

  clearPlayerAIState(p);

  if(ball.state === BALL_STATE.IN_POSSESSION && ball.owner === p){
    clearForcedChaseState(p, input?.move);
    return true;
  }
  if(ball.state !== BALL_STATE.FREE && ball.state !== BALL_STATE.LOOSE_BALL) return false;
  if(ball.owner && ball.owner !== p) return false;

  if(p.lockPlayerAssignment){
    p.lockPlayerAssignmentT -= dt;
    if(p.lockPlayerAssignmentT <= 0) clearPlayerLockAssignment(p);
  }

  const d = dist2D(p, ball);
  if(d < getPostTouchRecoverDist(p) && p.releaseCooldown <= 0 && !isPossessionIgnored()){
    if(checkBallCapture(p)) return true;
  }

  const inp = input || {move:{x:0,y:0}, sprint:true};
  const moveMag = Math.hypot(inp.move?.x || 0, inp.move?.y || 0);
  if(moveMag > 0.05){
    movePlayer(p, dt, inp.move, inp.sprint !== false, false, {forcedChase: true, manualChase: true});
    return true;
  }

  const effortDir = ball.effortDetach && ball.effortDetach.ownerId === p.id && p.effortSprintDir;
  const lockFeint = ball.feintDetach && ball.feintDetach.ownerId === p.id && p.fakeShotChaseLockT > 0 && p.effortChaseTarget;
  const dx = lockFeint ? p.effortChaseTarget.x - p.x : ball.x - p.x;
  const dy = lockFeint ? p.effortChaseTarget.y - p.y : ball.y - p.y;
  const td = Math.hypot(dx, dy);
  let md;
  if(td > 0.01){
    md = {x: dx / td, y: dy / td};
  } else if(effortDir){
    md = p.effortSprintDir;
  } else {
    md = {x: p.dir.x, y: p.dir.y};
  }
  movePlayer(p, dt, md, true, false, {forcedChase: true});
  return true;
}

// Persecucion legacy (chasing): input prioritario; sin IA de intercepcion/orientacion automatica.
function updateChasing(p, dt, input){
  if(ball.isContested && !isBallContestedSeekAllowed(p)){
    clearChasingState(p);
    return false;
  }
  if(isPlayerStunned(p) || isPlayerStaggered(p)){
    clearChasingState(p);
    return false;
  }
  if(isPlayerForcedChasing(p)) return updateForcedChase(p, dt, input);

  if(ball.effortDetach && ball.effortDetach.ownerId !== p.id && ball.state !== BALL_STATE.LOOSE_BALL){
    clearChasingState(p);
    return false;
  }
  if(!ensureChasingState(p) && !tryEnterChasingFromPrivateEvent(p)) return false;
  if(ball.state === BALL_STATE.IN_POSSESSION && ball.owner === p){
    clearChasingState(p);
    return true;
  }
  if(ball.state !== BALL_STATE.FREE) return false;
  if(ball.owner && ball.owner !== p) return false;

  if(isManualAction(p)) clearPlayerAIState(p);

  const d = dist2D(p, ball);
  const recoverDist = getPostTouchRecoverDist(p);
  if(d < recoverDist && p.releaseCooldown <= 0 && !isPossessionIgnored()){
    if(checkBallCapture(p)) return true;
  }

  const manualChase = isManualAction(p);
  const inp = input || {move:{x:0,y:0}, sprint:true, jockey:false};
  const moveMag = Math.hypot(inp.move?.x || 0, inp.move?.y || 0);
  const moveOpts = manualChase ? {manualChase:true} : null;

  // Input prioritario: direccion del usuario; sin input, solo avanzar hacia la pelota (no IA de intercepcion)
  if(moveMag > 0.05){
    movePlayer(p, dt, inp.move, inp.sprint, inp.jockey, moveOpts);
  } else {
    const dx = ball.x - p.x, dy = ball.y - p.y;
    const td = Math.hypot(dx, dy);
    const md = td > 0.01 ? {x: dx/td, y: dy/td} : {x: p.dir.x, y: p.dir.y};
    movePlayer(p, dt, md, true, false, moveOpts);
  }
  return true;
}

// Impulso en direccion del stick/input — burst seco, sin mezclar velocidad del jugador.
function resolveSelfTouchDirection(inputDir, p){
  if(inputDir && Math.hypot(inputDir.x, inputDir.y) > 0.05) return norm(inputDir);
  return {x: Math.cos(p.facing), y: Math.sin(p.facing)};
}

function getEffortTouchTargetDist(p, type){
  const base = type === 'short' ? DRIBBLE_DIST_R1 : DRIBBLE_DIST_R2;
  if(type !== 'long') return base;
  return base * getArchetypeEffortTouchLongDistMult(p);
}

// Effort touch: autopase direccionado + STATE_SPRINT_CHASE (R1 + flick stick derecho).
function triggerEffort(p, power, stickDir, type){
  if(ball.owner !== p || isGkHandsPossession(p)) return false;

  const dir = resolveSelfTouchDirection(stickDir, p);
  const targetDist = getEffortTouchTargetDist(p, type);

  p.facing = Math.atan2(dir.y, dir.x);
  p.lastAim = dir;
  syncPlayerDir(p);

  applyEffortTouchDefenderFreeze(p, targetDist, dir);
  executeKick(p, 'pass', dir, power, 0);
  ball.possessedBy = p.id;
  enterSprintChaseState(p);

  p.isEffortTouching = true;
  syncTechnicallyBusy(p);
  p.effortTouchCooldown = EFFORT_TOUCH_COOLDOWN * getArchetypeEffortTouchCooldownMult(p);
  p.touchCooldown = 0.12;

  const baseAnimDur = type === 'short' ? EFFORT_TOUCH_ANIM_SHORT : EFFORT_TOUCH_ANIM_LONG;
  const animDur = baseAnimDur * getArchetypeEffortTouchAnimMult(p);
  const legLead = Math.sin(p.animPhase) >= 0 ? 1 : -1;
  p.effortTouchAnim = {t:0, dur: animDur, leg:legLead, type: type === 'short' ? 'short' : 'long'};
  p.touchAnim = null;
  lockPlayerSwitchForEffort(p);
  return true;
}

function effortTouch(p, dir, type){
  if(!p || p.effortTouchCooldown > 0 || !canApplyEffortTouch(p)) return false;
  if(ball.owner !== p) return false;

  clearTeammateInterferenceForTechnicalAction(p);
  const stickDir = resolveSelfTouchDirection(dir, p);
  const targetDist = getEffortTouchTargetDist(p, type);
  const power = computeEffortPassPower(p, targetDist);
  return triggerEffort(p, power, stickDir, type);
}

// cuenta regresiva del windup post-solte (fase 2 de PREPARANDO_ACCION): cuando termina, ejecuta
// el pase/tiro real. Si en el medio el jugador perdio la pelota (robo, tackle, etc.) se cancela solo.
function updatePendingKick(p, dt){
  const pk = p.pendingKick;
  if(isFakeShotInputBlocked(p)){ p.pendingKick = null; return; }
  if(ball.owner !== p){ p.pendingKick = null; return; }
  pk.remaining -= dt;
  if(pk.remaining <= 0){
    p.pendingKick = null;
    if(pk.wallPass){
      const dir = pk.aimDir;
      executeKick(p, 'pass', dir, pk.power, pk.curve);
      const mate = nearestTeammateInDirection(p, dir) || bestWallPassTarget(p);
      if(mate){
        const padIdx = pk.padIndex ?? (p.team === 'home' ? Game.p1PadIndex : Game.p2PadIndex);
        startManualRun(p, dir, mate, { isPared: true, padIndex: padIdx });
        if(p.team==='home'){ setControlled(mate); } else { setControlled2(mate); }
      }
    } else {
      executeKick(p, pk.type, pk.aimDir, pk.power, pk.curve);
    }
  }
}
// anima el amague (toque corto) hasta que termina; al completarse re-vincula la pelota al pie.
function updateFeint(p, dt){
  const f = p.feint;
  f.t += dt;
  const damp = Math.pow(0.01, dt);
  p.vx *= damp; p.vy *= damp;
  p.x += p.vx*dt; p.y += p.vy*dt;
  p.x = clamp(p.x, -3, FIELD_L+3);
  p.y = clamp(p.y, -3, FIELD_W+3);
  if(f.t >= f.dur){
    p.feint = null;
    if(ball.feintDetach && ball.feintDetach.ownerId === p.id){
      reclaimFeintPossession(p);
    }
  }
}
// DRAGBACK: pisa la pelota y la arrastra un poco hacia atras con la suela (L1+R1 + stick hacia la
// espalda del jugador). No hace falta soltar el balon ni cargar nada: el jugador sigue siendo dueño
// todo el tiempo, y al terminar la animacion queda libre para arrancar para cualquier lado (no solo
// hacia atras) con el proximo movimiento del stick.
function startDragBack(p, dir){
  p.charging = null;
  p.pendingKick = null;
  p.facing = Math.atan2(dir.y, dir.x);
  p.lastAim = dir;
  p.dragBack = {t:0, dur:DRAGBACK_DURATION, dirX:dir.x, dirY:dir.y};
  p.vx *= DRAGBACK_PLAYER_BRAKE;
  p.vy *= DRAGBACK_PLAYER_BRAKE;
  applyExtendedDribbleTouch(p, dir, DRIBBLE_DIST_R1 * 0.55, 'effort');
}
// anima el dragback (pisada + arrastre) hasta que termina, y libera al jugador con la pelota
function updateDragBack(p, dt){
  const db = p.dragBack;
  db.t += dt;
  // friccion mas fuerte todavia que el amague: el gesto es casi estatico, el jugador queda plantado
  // sobre la pelota en vez de desplazarse
  const damp = Math.pow(0.02, dt);
  p.vx *= damp; p.vy *= damp;
  p.x += p.vx*dt; p.y += p.vy*dt;
  p.x = clamp(p.x, -3, FIELD_L+3);
  p.y = clamp(p.y, -3, FIELD_W+3);
  if(db.t >= db.dur) p.dragBack = null;
}

/* ============================================================
   SAQUE DE CENTRO — maniobra cinematica (posicion inversa + giro / retroceso)
   ============================================================ */
const KICKOFF_SHORT_SPIN_DUR = 0.34;
const KICKOFF_RETREAT_DIST = 2.6;
const KICKOFF_RETREAT_SPEED = 5.5;
const KICKOFF_APPROACH_SPEED = 7.8;
const KICKOFF_INERTIA_BONUS = 0.16;
const KICKOFF_STRIKE_REACH = 1.05;

function kickoffSmoothstep(t){
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function getKickoffKickDirection(p, aimDir){
  const atk = getKickoffFacingAttack(p);
  const base = { x: Math.cos(atk), y: Math.sin(atk) };
  if(Math.hypot(aimDir.x, aimDir.y) > 0.2){
    return norm({ x: base.x * 0.72 + aimDir.x * 0.28, y: base.y * 0.72 + aimDir.y * 0.28 });
  }
  return base;
}

function unlockKickoffTakerForManeuver(p){
  p.canMove = true;
  p.isStuck = false;
  p.blockDribbling = false;
  p.inSetPieceZone = true;
  if(p.state === STATE_FIXED) p.state = 'idle';
}

function isKickoffShortKick(kickType){
  return kickType === 'pass';
}

function startKickoffManeuver(p, kickType, power, curve, aimDir){
  if(!p || !isKickoffWaiting() || !isKickoffTaker(p) || p.kickoffAnim) return false;

  unlockKickoffTakerForManeuver(p);
  p.charging = null;
  p.chargeStart = 0;
  p.pendingKick = null;
  clearChargingShotState(p);

  const ownFacing = getKickoffFacingOwnGoal(p);
  const atkFacing = getKickoffFacingAttack(p);
  const kickDir = getKickoffKickDirection(p, aimDir);
  const shortKick = isKickoffShortKick(kickType);

  if(shortKick){
    p.kickoffAnim = {
      mode: 'short',
      phase: 'spin',
      t: 0,
      spinDur: KICKOFF_SHORT_SPIN_DUR,
      startFacing: ownFacing,
      targetFacing: atkFacing,
      kickType,
      power: clamp(power * 0.52, 0.14, 0.42),
      curve,
      kickDir,
    };
  } else {
    const backDir = { x: -Math.cos(atkFacing), y: 0 };
    p.kickoffAnim = {
      mode: 'long',
      phase: 'retreat',
      t: 0,
      retreatDist: KICKOFF_RETREAT_DIST,
      retreated: 0,
      retreatSpeed: KICKOFF_RETREAT_SPEED,
      approachSpeed: KICKOFF_APPROACH_SPEED,
      startFacing: ownFacing,
      targetFacing: atkFacing,
      backDir,
      kickType,
      power,
      curve,
      kickDir,
      ballX: CENTER.x,
      ballY: CENTER.y,
    };
    ball.x = CENTER.x;
    ball.y = CENTER.y;
    ball.z = BALL_RADIUS;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    ball.owner = null;
    ball.state = BALL_STATE.FREE;
  }
  return true;
}

function finishKickoffManeuverKick(p, a){
  p.facing = a.targetFacing;
  syncPlayerDir(p);
  if(a.mode === 'long'){
    ball.owner = p;
    ball.state = BALL_STATE.IN_POSSESSION;
    ball.x = CENTER.x;
    ball.y = CENTER.y;
    ball.z = BALL_RADIUS;
  }
  const boosted = a.mode === 'long'
    ? clamp(a.power + KICKOFF_INERTIA_BONUS * clamp(a.retreated / a.retreatDist, 0, 1), 0.14, 1)
    : a.power;
  p.kickoffAnim = null;
  executeKick(p, a.kickType, a.kickDir, boosted, a.curve);
}

function updateKickoffManeuver(p, dt){
  const a = p.kickoffAnim;
  if(!a) return false;

  a.t += dt;
  const moveSpd = Math.hypot(p.vx, p.vy);
  if(moveSpd > 0.25) p.animPhase += moveSpd * dt * 2.4;

  if(a.mode === 'short'){
    const prog = kickoffSmoothstep(a.t / a.spinDur);
    p.facing = a.startFacing + angDiff(a.targetFacing, a.startFacing) * prog;
    syncPlayerDir(p);
    p.vx = 0;
    p.vy = 0;

    if(a.t >= a.spinDur){
      finishKickoffManeuverKick(p, a);
    }
    return true;
  }

  if(a.mode === 'long'){
    if(a.phase === 'retreat'){
      const step = a.retreatSpeed * dt;
      p.x += a.backDir.x * step;
      p.y = CENTER.y;
      a.retreated += step;
      p.vx = a.backDir.x * a.retreatSpeed;
      p.vy = 0;

      const rotProg = kickoffSmoothstep(a.retreated / a.retreatDist);
      p.facing = a.startFacing + angDiff(a.targetFacing, a.startFacing) * rotProg;
      syncPlayerDir(p);
      clampKickoffTakerManeuverPosition(p);

      if(a.retreated >= a.retreatDist){
        a.phase = 'approach';
        a.t = 0;
        p.facing = a.targetFacing;
        syncPlayerDir(p);
      }
    } else if(a.phase === 'approach'){
      const dx = a.ballX - p.x;
      const dy = a.ballY - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const toBall = { x: dx / dist, y: dy / dist };
      const speed = a.approachSpeed + (a.retreated / a.retreatDist) * 1.8;
      p.x += toBall.x * speed * dt;
      p.y = CENTER.y;
      p.facing = a.targetFacing;
      p.vx = toBall.x * speed;
      p.vy = 0;
      syncPlayerDir(p);
      clampKickoffTakerManeuverPosition(p);

      if(dist <= KICKOFF_STRIKE_REACH){
        finishKickoffManeuverKick(p, a);
      }
    }
    return true;
  }

  return false;
}

function computeKickVelocityParams(p, type, aimDir, power, curve){
  const dir = norm(aimDir);
  const speedTable = {
    pass:    {min:10,  max: PASS_GROUND_MAX_SPEED * PASS_CROSS_DISTANCE_MULT, vz:2},
    shot:    {min:18, max:60, vz:7},
    through: {min:20, max:54, vz:2},
    cross:   {min:11, max: CROSS_KICK_MAX_SPEED * PASS_CROSS_DISTANCE_MULT, vz:11},
  };
  const cfg = speedTable[type] || speedTable.pass;
  let speedMult = KICK_VELOCITY_MULT;
  if(type === 'shot'){
    speedMult *= SHOT_VELOCITY_MULT;
    const style = resolveShotStyle(curve);
    if(style === 'placed') speedMult *= SHOT_PLACED_SPEED_MULT;
    else if(style === 'trivela') speedMult *= SHOT_TRIVELA_SPEED_MULT;
    speedMult *= getArchetypeKickSpeedTableMult(p, type);
  } else {
    speedMult *= PASS_VELOCITY_MULT;
    speedMult *= getArchetypeKickSpeedTableMult(p, type);
  }
  const spd = lerp(cfg.min, cfg.max, power) * speedMult * getBallKickPowerMult(type);
  const curvePhys = applyKickCurvePhysics(p, type, dir, type === 'shot' ? curve : curve);
  return {dir, spd, cfg, curvePhys, type};
}

// Impulso horizontal con componente vertical minima (pase raso / por abajo).
function applyStandardImpulse(vel, power){
  const {dir, spd, cfg, curvePhys, type} = vel;
  ball.highKick = false;
  ball.highKickType = null;
  ball.vx = dir.x * spd;
  ball.vy = dir.y * spd;
  ball.initialSpeed = Math.hypot(ball.vx, ball.vy);
  ball.vz = computeKickVerticalSpeed(type, cfg, power);
  ball.curveFactor = curvePhys.curveFactor;
  ball.groundFrictionMult = curvePhys.groundFrictionMult;
}

// Impulso con elevacion completa (filtrado, centro, tiro por arriba).
function applyVerticalImpulse(vel, power){
  const {dir, spd, cfg, curvePhys, type} = vel;
  ball.highKick = (type==='shot' || type==='cross');
  ball.highKickType = ball.highKick ? type : null;
  ball.vx = dir.x * spd;
  ball.vy = dir.y * spd;
  ball.initialSpeed = Math.hypot(ball.vx, ball.vy);
  ball.vz = computeKickVerticalSpeed(type, cfg, power);
  ball.curveFactor = curvePhys.curveFactor;
  ball.groundFrictionMult = curvePhys.groundFrictionMult;
}

function executeKickContact(p, type, aimDir, power, curve, impulseFn){
  if(isGoalkeeper(p)) clearGkPossessionType(p);
  clearEffortSprintState(p);
  const dir = norm(aimDir);
  setBallStateLoose(true);
  ball.lastTouchTeam = p.team;
  ball.lastTouchedBy = p.id;
  clearThrowInBlockIfOtherPlayer(p);
  ball.lastKicker = p;
  ball.lastKickType = type;
  ball.passOrigin = (type==='pass') ? {x:p.x, y:p.y} : null;
  ball.x = p.x + dir.x*0.9;
  ball.y = p.y + dir.y*0.9;
  ball.z = 0.35;
  if(impulseFn) impulseFn(computeKickVelocityParams(p, type, dir, power, curve), power);
  resetBallKickFriction(ball, type);
  p.tackleCooldown = 0.25;
  p.releaseCooldown = 0.55;
  p.kickAnim = { t:0, dur: type==='shot' ? 0.22 : 0.17, leg:1, power, type };
  if(type==='cross'){
    const landing = estimateKickTarget();
    Game.crossMarker = {x: landing.x, y: landing.y, t: CROSS_MARKER_LIFE};
  }
  handleKickCursorSwitch(p, power, dir, type);
  assignPassTargetFromKick(p, dir, type, power);
  if(type !== 'shot' || curve) setupCurvePassTracking(p, type, dir, curve, ball.initialSpeed);
  if(Game.setPieceMode) onSetPieceBallReleased();
  if(isKickoffWaiting()) cleanupKickoffState(p);
}

function executeKick(p, type, aimDir, power, curve){
  power = normalizeKickPower(power);
  const impulseFn = type === 'pass' ? applyStandardImpulse : applyVerticalImpulse;
  executeKickContact(p, type, aimDir, power, curve, impulseFn);
  resetActionBuffer(p);
}

function releaseGkBallForKick(p, dir){
  p.possessionType = GK_POSSESS_FREE;
  p.gkBallCollidable = true;
  ball.owner = null;
  ball.state = BALL_STATE.FREE;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.x = p.x + dir.x * 0.35;
  ball.y = p.y + dir.y * 0.35;
  ball.z = BALL_RADIUS;
  ball.ignorePossessionT = 0;
}

function applyGkKickImpulse(p, anim){
  const powerMult = anim.power != null ? lerp(0.55, 1.0, anim.power) : 1;
  const force = (anim.type === 'dropkick' ? GK_DROP_KICK_FORCE : GK_THROW_FORCE) * powerMult * getGkKickForceMult();
  const dir = anim.dir;
  setBallStateFree(true, true);
  ball.lastAction = 'goalkeeper_kick';
  ball.gkKickInAir = true;
  ball.gkKickOwnerId = p.id;
  ball.ignorePossessionT = 0;
  GkKickLandingListener.start(p.id);
  enablePlayableBallAfterGkKick(p.id);
  ball.lastTouchTeam = p.team;
  ball.lastTouchedBy = p.id;
  ball.lastKicker = p;
  ball.passOrigin = null;
  ball.highKick = anim.type === 'dropkick';
  ball.highKickType = anim.type === 'dropkick' ? 'cross' : null;
  ball.x = p.x + dir.x * 0.75;
  ball.y = p.y + dir.y * 0.75;
  ball.z = anim.type === 'dropkick' ? 0.45 : 1.15;
  ball.vx = dir.x * force;
  ball.vy = dir.y * force;
  ball.vz = anim.type === 'dropkick' ? 5.0 : 2.4;
  ball.initialSpeed = force;
  ball.curveFactor = 0;
  ball.groundFrictionMult = 1;
  p.releaseCooldown = 0.45;
  p.tackleCooldown = 0.25;
  p.possessionType = null;
  clearGkPossessionType(p);
  if(Game.setPieceMode) onSetPieceBallReleased();
}

function clearGkKickCharge(p){
  if(!p) return;
  p.gkKickCharge = null;
}

function updateGkKickCharge(p){
  const ch = p?.gkKickCharge;
  if(!ch?.chargeStart) return;
  const elapsed = performance.now() - ch.chargeStart;
  ch.powerBar = clamp(elapsed / GK_KICK_CHARGE.MAX_MS, 0.08, 1);
}

function startGkKickCharge(p, kickType){
  p.gkKickCharge = {
    kickType,
    chargeStart: performance.now(),
    powerBar: 0.08,
    isCharging: true,
  };
}

function handleGoalkeeperKickCharge(p, input, aimDir){
  if(!isGkHandsPossession(p) || p.gkKickAnim || isGoalKickReadyState()) return false;

  if(input.pressPass || input.pressCross || input.pressShot || input.pressThrough){
    resetGkAutoDistributeTimer(p);
  }

  updateGkKickCharge(p);
  const ch = p.gkKickCharge;

  if(ch?.isCharging){
    const releaseThrow = ch.kickType === 'throw' && input.releasedPass;
    const releaseDrop = ch.kickType === 'dropkick' && input.releasedCross;
    if(releaseThrow || releaseDrop){
      const stick = input.move || { x: 0, y: 0 };
      const dir = resolveManualRestartStickDir(stick) ||
        (Math.hypot(aimDir?.x || 0, aimDir?.y || 0) > 0.15 ? norm(aimDir) : null);
      if(!dir){
        clearGkKickCharge(p);
        return true;
      }
      const power = ch.powerBar;
      clearGkKickCharge(p);
      return triggerGoalkeeperKick(p, ch.kickType, dir, power);
    }
    if(ch.kickType === 'throw' && !input.heldPass) clearGkKickCharge(p);
    if(ch.kickType === 'dropkick' && !input.heldCross) clearGkKickCharge(p);
    return true;
  }

  if(input.pressPass && input.heldPass && !input.heldCross){
    startGkKickCharge(p, 'throw');
    return true;
  }
  if(input.pressCross && input.heldCross && !input.heldPass){
    startGkKickCharge(p, 'dropkick');
    return true;
  }
  return false;
}

function triggerGoalkeeperKick(p, kickType, aimDir, power = 0.55){
  if(!p || !isGoalkeeper(p) || p.gkKickAnim) return false;
  if(!isGkHandsPossession(p)) return false;

  clearGkHandsTimer(p);

  const hasDir = Math.hypot(aimDir.x, aimDir.y) > 0.15;
  const dir = hasDir ? norm(aimDir) : {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  if(hasDir){
    p.facing = Math.atan2(dir.y, dir.x);
    p.lastAim = dir;
    syncPlayerDir(p);
  }

  releaseGkBallForKick(p, dir);
  p.gkKickAnim = {
    type: kickType,
    t: 0,
    dur: GK_KICK_ANIM_DUR,
    dir,
    power: clamp(power, 0.08, 1),
    impulseApplied: false,
  };
  p.charging = null;
  p.pendingKick = null;
  return true;
}

function handleGoalkeeperKick(p, input, aimDir){
  if(isGoalKickReadyState()) return false;
  if(!isGkHandsPossession(p) || p.gkKickAnim) return false;
  if(isGkKickManualOnly()) return handleGoalkeeperKickCharge(p, input, aimDir);
  return handleGoalkeeperKickCharge(p, input, aimDir);
}

function updateGkKickAnim(p, dt){
  const anim = p.gkKickAnim;
  if(!anim) return false;
  anim.t += dt;

  const releaseAt = anim.dur * GK_KICK_RELEASE_T;
  if(!anim.impulseApplied && anim.t >= releaseAt){
    anim.impulseApplied = true;
    applyGkKickImpulse(p, anim);
  }

  if(anim.t >= anim.dur){
    p.gkKickAnim = null;
    if(p.possessionType === GK_POSSESS_FREE) p.possessionType = null;
  }
  return true;
}

// estima donde va a "llegar" la pelota (aprox: donde vuelve a tocar el piso, o un punto fijo
// adelante si es un pase raso que practicamente no vuela) usando la velocidad recien asignada
// en executeKick. Es una aproximacion arcade (no descuenta friccion/drag en el camino) pero alcanza
// para saber a que companero saltarle el cursor de inmediato.
// simula, paso a paso, la MISMA fisica de vuelo que usa Ball.update (gravedad+extra, drag+tope de
// velocidad, efecto/rosca) para encontrar donde toca el piso por PRIMERA VEZ. Antes esto proyectaba
// una recta a velocidad constante, lo que en un centro (con harto drag en el aire) quedaba lejos del
// pique real; ahora es exacto, y sirve tanto para el salto de cursor como para la cruz amarilla.
// Simula la fisica de vuelo/rodadura y devuelve el primer punto de pique {x,y,t,aerial}.
function predictBallLanding(b){
  if(!b || b.state === BALL_STATE.IN_POSSESSION) return null;
  if(b.z <= BALL_RADIUS + 0.08 && Math.abs(b.vz) < 0.15){
    return {x: b.x, y: b.y, t: 0, aerial: false};
  }
  const g = getBallAirGravity(b);
  let x=b.x, y=b.y, z=b.z, vx=b.vx, vy=b.vy, vz=b.vz;
  const cf = b.curveFactor||0;
  const initSpd = Math.hypot(vx, vy) || b.initialSpeed || 1;
  const STEP = 0.02;
  let t = 0;
  const startedAerial = z > BALL_AERIAL_MIN_Z;
  const dragSim = {highKick: b.highKick, highKickType: b.highKickType, vx, vy};
  while(t < 4.0){
    if(z > BALL_RADIUS){
      dragSim.vx = vx;
      dragSim.vy = vy;
      applyBallAirHorizontalDrag(dragSim, STEP);
      vx = dragSim.vx;
      vy = dragSim.vy;
    }
    const sim = {
      vx, vy, z, x, y,
      curveFactor: cf,
      initialSpeed: initSpd,
      curveMaxSpeed: b.curveMaxSpeed || initSpd,
      curveLineOrigin: b.curveLineOrigin,
      curveLineDir: b.curveLineDir,
      curvePassTarget: b.curvePassTarget,
      curveMaxDrift: b.curveMaxDrift,
    };
    applyBallLateralCurve(sim, STEP);
    vx = sim.vx; vy = sim.vy; x = sim.x; y = sim.y;
    vz -= g*STEP;
    x += vx*STEP; y += vy*STEP; z += vz*STEP;
    t += STEP;
    if(z <= BALL_RADIUS) break;
  }
  return {x, y, t, aerial: startedAerial || b.z > BALL_AERIAL_MIN_Z};
}

function estimateKickTarget(){
  const land = predictBallLanding(ball);
  return land ? {x: land.x, y: land.y} : {x: ball.x, y: ball.y};
}

// companero (de ese equipo, sin contar al que pateo) mas cercano a un punto del mundo
function nearestTeammateToPoint(team, point, excludeId){
  const mates = (team==='home'?homeTeam:awayTeam).filter(m=>m.id!==excludeId);
  let best=null, bestD=Infinity;
  for(const m of mates){
    const d = dist2D(m, point);
    if(d<bestD){ bestD=d; best=m; }
  }
  return best;
}

// Score de receptor segun intencion del usuario: angulo (stick) primero, distancia como desempate.
function findPassReceiverByIntent(kicker, dir, excludeId){
  const mates = (kicker.team==='home'?homeTeam:awayTeam)
    .filter(m=>m.id!==excludeId && m.role!=='GK');
  if(!mates.length) return null;

  const candidates = [];
  for(const m of mates){
    const dx = m.x - kicker.x, dy = m.y - kicker.y;
    const d = Math.hypot(dx, dy);
    if(d < 0.4) continue;
    const alignment = (dx*dir.x + dy*dir.y) / d;
    if(alignment < 0.08) continue;
    candidates.push({mate:m, alignment:clamp(alignment, 0, 1), dist:d});
  }
  if(!candidates.length) return null;

  const maxDist = Math.max(...candidates.map(c=>c.dist), 1);
  let best=null, bestScore=-Infinity;
  for(const c of candidates){
    const dirScore = c.alignment;
    const distScore = 1 - c.dist/maxDist;
    const score = DIRECTION_PRIORITY*dirScore + DISTANCE_PRIORITY*distScore;
    if(score > bestScore){ bestScore=score; best=c.mate; }
  }
  return best;
}

// se llama al final de executeKick, en el instante exacto del impacto pie-pelota:
//  - Barra BAJA (power < AUTOPASE_POWER_THRESHOLD): es un AUTOPASE. El cursor NO se toca, queda
//    fijo en el jugador actual para que pueda picar en velocidad a buscar la pelota que tiro adelante.
//  - Barra MEDIA/ALTA: es un pase largo o un tiro hacia otro companero. El cursor salta YA MISMO
//    (mismo frame del impacto) al companero mas alineado con la direccion del stick (X/Triangulo/Circulo),
//    y se bloquea el auto-seguimiento normal por un rato corto para que no titile si la pelota pasa
//    cerca de otro jugador en el camino.
function handleKickCursorSwitch(p, power, aimDir, kickType){
  if(power < AUTOPASE_POWER_THRESHOLD) return;
  let mate;
  if(kickType==='pass' || kickType==='through' || kickType==='cross'){
    mate = findPassReceiverByIntent(p, norm(aimDir), p.id);
  } else {
    const target = estimateKickTarget();
    mate = nearestTeammateToPoint(p.team, target, p.id);
  }
  if(!mate) return;
  const now = performance.now();
  if(p.team==='home'){
    setControlled(mate);
    Game.manualOverrideUntil = now + LONGPASS_SWITCH_LOCK_MS;
  } else {
    setControlled2(mate);
    Game.manualOverrideUntil2 = now + LONGPASS_SWITCH_LOCK_MS;
  }
}


/* ============================================================
   BUFFER GLOBAL DE ACCION + ACCIONES AÉREAS (cabezazo, volea, chilena)
   actionBuffer = {type, power}: input solo setea; ejecucion en onBallContact.
   Sin colas, sin timeouts, sin alterar movimiento ni estado del jugador.
   ============================================================ */
function clearChargeMoveLock(p){
  if(!p) return;
  p.chargeMoveLock = null;
}

function clearActionBuffer(p){
  if(!p) return;
  p.actionBuffer = {type: null, kickType: null, power: 0, chargeStart: 0, curve: 0, manualL2: false, timestamp: 0};
  p.isPreparingToShoot = false;
  clearChargeMoveLock(p);
  syncGlobalCharging(p);
}

function getBufferKickType(buf){
  if(!buf) return null;
  if(buf.kickType) return buf.kickType;
  if(buf.type === ACTION_BUFFER_GROUND_PASS) return 'pass';
  if(buf.type === ACTION_BUFFER_LOBBED_PASS) return 'through';
  if(buf.type === 'pass' || buf.type === 'shot' || buf.type === 'through' || buf.type === 'cross') return buf.type;
  return null;
}

function mapButtonToBufferType(btn){
  return btn === 'pass' ? ACTION_BUFFER_GROUND_PASS : ACTION_BUFFER_LOBBED_PASS;
}

function isLobbedActionBuffer(buf){
  if(!buf?.type) return false;
  if(buf.type === ACTION_BUFFER_LOBBED_PASS) return true;
  if(buf.type === ACTION_BUFFER_GROUND_PASS) return false;
  return buf.type !== 'pass';
}

function resetActionBuffer(p){
  clearActionBuffer(p);
}

/** Limpia estado de botones/ejes del gamepad (evita X fantasma al abrir menús). */
function resetGamepadState(){
  snapshotKeys();
  for(const k in prevButtonsByPad) delete prevButtonsByPad[k];
  for(const k in triggerSyncPressState) delete triggerSyncPressState[k];
}

/** Vacía buffers de input al salir de menús/pausa (evita pases/tiros fantasma). */
function clearInputBuffer(){
  resetGamepadState();
  for(const k in effortRsState) delete effortRsState[k];
  for(const team of ['home', 'away']){
    if(rsState[team]){
      rsState[team].prevMag = 0;
      rsState[team].lockout = 0;
    }
  }
  for(const p of allPlayers){
    clearActionBuffer(p);
    clearPendingAction(p);
    clearChargingShotState(p);
    p.charging = null;
    p.pendingKick = null;
    p.isChargingShot = false;
  }
}

function clearPendingAction(p){
  clearActionBuffer(p);
}

function hasPendingAction(p){
  const buf = p?.actionBuffer;
  return !!(buf && (buf.type || buf.chargeStart > 0));
}

function isPendingActionArmed(p){
  const buf = p?.actionBuffer;
  return !!(buf && buf.type && !buf.chargeStart);
}

function hasBufferedAction(p){
  return isPendingActionArmed(p);
}

function isActionBufferCharging(p){
  const buf = p?.actionBuffer;
  return !!(buf && buf.type && buf.chargeStart > 0);
}

function isLooseBallForBufferMove(){
  return isBallAvailableForHunt();
}

function isBallAvailableForHunt(){
  if(ball.owner) return false;
  if(ball.state === BALL_STATE.DEAD_BALL || ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL) return false;
  if(ball.state === BALL_STATE.GOAL_CELEBRATION || ball.state === BALL_STATE.OUT_OF_BOUNDS) return false;
  if(ball.state === BALL_STATE.IN_HAND || ball.state === BALL_STATE.PLACED) return false;
  return ball.state === BALL_STATE.FREE
    || ball.state === BALL_STATE.LOOSE_BALL
    || ball.state === BALL_STATE.IN_AIR
    || isBallAerialLoose();
}

function isBallInPlayMoving(){
  return Math.hypot(ball.vx, ball.vy) > 0.12 || Math.abs(ball.vz || 0) > 0.08;
}

function playerLacksBall(p){
  return ball.owner !== p;
}

function isHardMovementBlocked(p){
  if(!p || !p.canMove || p.isStuck) return true;
  if(p.tackleAnim || p.feint || p.dragBack || p.airStrikeAnim || p.diveAnim || p.gkKickAnim) return true;
  if(p.isThrowingIn || p.throwInAnim) return true;
  if(p.airLock && p.airLock.t < p.airLock.dur) return true;
  return false;
}

function isPlayerStatic(p){
  return Math.hypot(p.vx, p.vy) < 0.08;
}

function isPlayerIdleOrBlocked(p){
  if(!p) return false;
  if(p.state === 'idle' || p.state === 'waiting') return true;
  return isPlayerStatic(p) && p.state !== MOVING_TO_BALL && p.state !== 'chasing';
}

function lockBufferedContactTarget(p){
  if(!p) return null;
  const kickType = getBufferKickType(p.actionBuffer);
  let target = null;
  let contactT = 0;

  if(kickType === 'shot'){
    const contact = predictFirstShotContact(p, ball);
    if(contact){
      const approach = ballApproachDir(p, ball);
      target = {x: contact.x - approach.x * 0.55, y: contact.y - approach.y * 0.55};
      contactT = contact.t;
    }
  }
  if(!target && isBallAerialLoose()){
    const aimDir = getStickDir(p);
    const hint = predictAerialStrikeType(p, ball, getActiveManualL2(p));
    if(hint?.type === 'bicycle'){
      target = {x: ball.x - aimDir.x * 1.35, y: ball.y - aimDir.y * 1.35};
    } else if(hint?.type === 'volley'){
      const approach = ballApproachDir(p, ball);
      target = {x: ball.x - approach.x * 0.65, y: ball.y - approach.y * 0.65};
    } else {
      target = {x: ball.x, y: ball.y};
    }
  }
  if(!target){
    const intercept = getChaseInterceptTarget(p);
    target = {x: intercept.x, y: intercept.y};
  }

  p.chargeMoveLock = {x: target.x, y: target.y, contactT, kickType};
  return p.chargeMoveLock;
}

function isManualBallSeekCancelled(input){
  return !!(input?.heldManualCancel);
}

function shouldMaintainBallHunt(p, input){
  if(!p || !input) return false;
  if(isManualBallSeekCancelled(input)) return false;
  if(isHardMovementBlocked(p)) return false;
  if(!playerLacksBall(p)) return false;
  if(isPlayerForcedChasing(p) || isPlayerSprintChasing(p)) return false;
  if(isPostTouchChasing(p)) return false;
  if(p.isMakingManualRun && p.wallRun?.active) return false;
  if(p.aiMode === AI_RUPTURA || p.aiMode === AI_RUPTURA_MANUAL) return false;
  if(ball.owner && ball.owner.team !== p.team) return false;
  return isBallAvailableForHunt();
}

// Velocity directa hacia ball.x/y — sin targetPosition, intercept ni reposicionamiento tactico.
function moveDirectTowardBall(p, dt, sprint){
  if(isEffortTouchDefenderFrozen(p)) return;
  const dx = ball.x - p.x;
  const dy = ball.y - p.y;
  const d = Math.hypot(dx, dy);
  if(d < 0.01){
    p.vx = 0;
    p.vy = 0;
    return;
  }
  const md = {x: dx / d, y: dy / d};
  movePlayer(p, dt, md, !!sprint, false);
}

function seekBall(p, dt, input){
  if(isControlledByHuman(p)) return false;
  if(isEffortTouchDefenderFrozen(p)) return false;
  const skillOwner = getPlayerById(ball.possessedBy) || getPlayerById(ball.lastTouchedBy);
  if(skillOwner && isPlayerPerformingSkill(skillOwner) && skillOwner.team !== p.team) return false;
  if(!shouldMaintainBallHunt(p, input)) return false;
  if(!isBallAvailableForHunt()) return false;

  markMovingToBallState(p);
  moveDirectTowardBall(p, dt, dist2D(p, ball) > 2.5);
  return true;
}

// Emergencia: si quedo IDLE/quieto con pelota suelta en juego, forzar MOVING_TO_BALL.
function forceResumeMovement(p, dt, input){
  if(isControlledByHuman(p)) return false;
  if(!p || !input || isManualBallSeekCancelled(input)) return false;
  if(isHardMovementBlocked(p)) return false;
  if(!playerLacksBall(p)) return false;
  if(!isBallAvailableForHunt()) return false;
  if(ball.owner && ball.owner.team !== p.team) return false;

  const mustForce = isPlayerIdleOrBlocked(p);
  const ballMoving = isBallInPlayMoving();
  if(!mustForce && !(ballMoving && isPlayerStatic(p))) return false;

  p.state = MOVING_TO_BALL;
  clearPlayerAIState(p);

  markMovingToBallState(p);
  moveDirectTowardBall(p, dt, true);
  return true;
}

function resolveBufferedContactTarget(p, useLiveTarget){
  const kickType = getBufferKickType(p?.actionBuffer);
  if(!useLiveTarget && isActionBufferCharging(p) && p.chargeMoveLock){
    return p.chargeMoveLock;
  }
  if(kickType === 'shot'){
    const contact = predictFirstShotContact(p, ball);
    if(contact){
      const approach = ballApproachDir(p, ball);
      return {
        x: contact.x - approach.x * 0.55,
        y: contact.y - approach.y * 0.55,
        contactT: contact.t,
        kickType,
      };
    }
  }
  if(isBallAerialLoose()){
    const aerial = getAerialPositionTarget(p, ball);
    return {x: aerial.x, y: aerial.y, contactT: 0, kickType};
  }
  const intercept = getChaseInterceptTarget(p);
  return {x: intercept.x, y: intercept.y, contactT: 0, kickType};
}

function applyBufferedTargetMovement(p, dt, target, kickType, opts){
  opts = opts || {};
  if(!target) return;
  const useShotTiming = kickType === 'shot' && !opts.forceSeek && !isActionBufferCharging(p);
  if(useShotTiming){
    moveTowardFirstShotTarget(p, dt, {x: target.x, y: target.y}, target.contactT || 0);
  } else {
    moveTowardSeekTarget(p, dt, {x: target.x, y: target.y}, dist2D(p, ball) > 2.5, {movingToBall: true, forceSeek: true});
  }
}

function markMovingToBallState(p){
  if(!p) return;
  p.state = MOVING_TO_BALL;
  clearPlayerAIState(p);
}

// Altura efectiva de la pelota en el punto de contacto (prediccion corta + ball.z).
function getBallContactHeight(p, ballRef){
  const b = ballRef || ball;
  const z = b.z ?? 0;
  if(!p) return z;
  const d = dist2D(p, b);
  const sp = Math.hypot(b.vx, b.vy);
  if(sp > 0.45 && d < 2.2){
    const t = d / Math.max(sp, 0.5);
    const predZ = z + (b.vz || 0) * t - 0.5 * getBallAirGravity(b) * t * t;
    return Math.max(z, predZ);
  }
  return z;
}

function isBallAboveHumanReach(z){
  return z > AIR_MAX_HUMAN_REACH_Z;
}

function getPlayerHeadWorldZ(p){
  return AIR_PLAYER_HEAD_STAND_Z + (p.z || 0);
}

function getHeadStrikePos(p){
  return { x: p.x, y: p.y, z: getPlayerHeadWorldZ(p) };
}

function getFootStrikePos(p){
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  return {
    x: p.x + fx * 0.35,
    y: p.y + fy * 0.35,
    z: AIR_FOOT_STRIKE_Z + (p.z || 0) * 0.15,
  };
}

function dist3D(ax, ay, az, bx, by, bz){
  return Math.hypot(ax - bx, ay - by, az - bz);
}

function ballIntersectsHeadHitbox(p, ballRef){
  const b = ballRef || ball;
  const h = getHeadStrikePos(p);
  const bz = b.z ?? 0;
  if(Math.hypot(b.x - h.x, b.y - h.y) > AIR_AERIAL_HITBOX_MAX_XY) return false;
  return dist3D(b.x, b.y, bz, h.x, h.y, h.z) <= AIR_HEAD_HITBOX_R + BALL_RADIUS;
}

function ballIntersectsFootHitbox(p, ballRef){
  const b = ballRef || ball;
  const f = getFootStrikePos(p);
  const bz = b.z ?? 0;
  if(Math.hypot(b.x - f.x, b.y - f.y) > AIR_AERIAL_HITBOX_MAX_XY) return false;
  return dist3D(b.x, b.y, bz, f.x, f.y, f.z) <= AIR_FOOT_HITBOX_R + BALL_RADIUS;
}

function ballIntersectsStrikeHitbox(p, ballRef, strikeType){
  if(strikeType === 'header') return ballIntersectsHeadHitbox(p, ballRef);
  return ballIntersectsFootHitbox(p, ballRef);
}

function isPlayerSlowForStandingHeader(p){
  return Math.hypot(p.vx, p.vy) <= getPlayerMoveSpeedBase(p) * AIR_HEADER_SLOW_SPEED_RATIO;
}

function isPlayerBackToAimDir(p){
  const aim = getDirectInputDir(p);
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  return fx * aim.x + fy * aim.y < -0.2;
}

function isHeaderJumpAtStrikePhase(p){
  const a = p.airStrikeAnim;
  if(!a || a.type !== 'header') return true;
  const prog = a.t / Math.max(a.dur, 0.001);
  return prog >= AIR_HEADER_JUMP_APEX_MIN && prog <= AIR_HEADER_JUMP_APEX_MAX;
}

function startHeaderJumpWindup(p, actionButton){
  if(p.airStrikeAnim || p.tackleAnim || p.diveAnim) return;
  const jumpDur = physicsConfig.airTime ?? AIR_STRIKE_TABLE.header.dur;
  const animDur = Math.max(jumpDur, AIR_LOCK_DURATION);
  p.airStrikeAnim = { type: 'header', action: actionButton, t: 0, dur: animDur, windup: true };
}

function updateBufferedHeaderJumpApproach(p){
  if(!isPendingActionArmed(p) || ball.owner) return;
  if(p.airStrikeAnim) return;
  const kickType = getBufferKickType(p.actionBuffer);
  const manualL2 = getEffectiveManualL2(p, kickType);
  const aerialBtn = pendingActionToAerialButton(kickType);
  const contact = resolveAerialStrikeType(p, ball, manualL2, aerialBtn);
  if(!contact || contact.type !== 'header' || !contact.needsJump) return;
  const z = getBallContactHeight(p, ball);
  if(z <= AIR_HEADER_JUMP_MIN_Z || z > AIR_MAX_HUMAN_REACH_Z) return;
  if(dist2D(p, ball) > AIR_HEADER_JUMP_APPROACH_DIST) return;
  startHeaderJumpWindup(p, aerialBtn);
}

function canExecuteAerialBodyContact(p, ballRef, contact){
  if(!contact) return false;
  if(contact.type === 'header'){
    if(contact.needsJump){
      if(!p.airStrikeAnim || p.airStrikeAnim.type !== 'header') return false;
      if(!isHeaderJumpAtStrikePhase(p)) return false;
    }
    return ballIntersectsHeadHitbox(p, ballRef);
  }
  return ballIntersectsFootHitbox(p, ballRef);
}

function isBallInFirstShotHeightRange(p, ballRef){
  const z = getBallContactHeight(p, ballRef);
  return z >= FIRST_SHOT_MIN_Z && z <= FIRST_SHOT_MAX_Z;
}

// Predice el primer instante en que la pelota entra en la ventana de tiro de primera.
function predictFirstShotContact(p, ballRef){
  const b = ballRef || ball;
  if(!b || b.owner) return null;

  const g = getBallAirGravity(b);
  let x = b.x, y = b.y, z = b.z ?? 0;
  let vx = b.vx, vy = b.vy, vz = b.vz ?? 0;
  const cf = b.curveFactor || 0;
  const initSpd = Math.hypot(vx, vy) || b.initialSpeed || 1;
  const STEP = AIR_SPAM_SIM_STEP;
  let t = 0;
  const dragSim = {highKick: b.highKick, highKickType: b.highKickType, vx, vy};

  if(z >= FIRST_SHOT_MIN_Z && z <= FIRST_SHOT_MAX_Z){
    return {x, y, z, t: 0, ballSp: Math.hypot(vx, vy)};
  }

  while(t < 2.5){
    if(z > BALL_RADIUS){
      dragSim.vx = vx;
      dragSim.vy = vy;
      applyBallAirHorizontalDrag(dragSim, STEP);
      vx = dragSim.vx;
      vy = dragSim.vy;
    }
    const sim = {
      vx, vy, z, x, y,
      curveFactor: cf,
      initialSpeed: initSpd,
      curveMaxSpeed: b.curveMaxSpeed || initSpd,
      curveLineOrigin: b.curveLineOrigin,
      curveLineDir: b.curveLineDir,
      curvePassTarget: b.curvePassTarget,
      curveMaxDrift: b.curveMaxDrift,
    };
    applyBallLateralCurve(sim, STEP);
    vx = sim.vx; vy = sim.vy; x = sim.x; y = sim.y;
    vz -= g * STEP;
    x += vx * STEP; y += vy * STEP; z += vz * STEP;
    t += STEP;

    if(z >= FIRST_SHOT_MIN_Z && z <= FIRST_SHOT_MAX_Z){
      return {x, y, z, t, ballSp: Math.hypot(vx, vy)};
    }
    if(z <= BALL_RADIUS && t > 0.04) break;
  }
  return null;
}

function canFirstShotAtBall(p, ballRef){
  return !!predictFirstShotContact(p, ballRef);
}

function moveTowardFirstShotTarget(p, dt, target, contactT){
  if(!target) return;
  p.targetPosition = target;
  const dx = target.x - p.x, dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  let moveMag = d > 0.15 ? 1 : 0;
  let useSprint = d > 2.2;
  const margin = FIRST_SHOT_IMPACT_WINDOW;

  if(contactT > 0.08){
    const trotSpeed = getPlayerMoveSpeedBase(p) * 0.72;
    const timeToArrive = d / Math.max(trotSpeed, 1.8);
    if(d <= IA_LANDING_WAIT_DIST && contactT > margin){
      moveMag = 0;
      useSprint = false;
      const damp = Math.pow(0.12, dt);
      p.vx *= damp; p.vy *= damp;
    } else if(timeToArrive < contactT - margin){
      useSprint = false;
      moveMag *= IA_LANDING_JOG_FACTOR;
      if(d < IA_LANDING_WAIT_DIST * 2.2) moveMag = 0;
    } else if(timeToArrive > contactT + margin){
      useSprint = true;
    }
  }

  const md = moveMag > 0.05 ? {x: dx / d, y: dy / d} : {x: 0, y: 0};
  movePlayer(p, dt, md, useSprint, false, null);
}

// Si el remate de primera no es viable, seguir persiguiendo el pique sin abortar el buffer.
function attemptControlOrMoveForShot(p, dt){
  if(!p) return;
  p.seekAerial = false;
  p.landingTime = 0;
  p.firstShotContactT = 0;

  if(ball.owner === p) return;
  const land = predictBallLanding(ball);
  const target = land ? {x: land.x, y: land.y} : {x: ball.x, y: ball.y};
  moveTowardSeekTarget(p, dt, target, true, {movingToBall: true});
  markMovingToBallState(p);
}

function isBallAirborne(ballRef, p){
  return getBallContactHeight(p, ballRef) > AIR_FOOT_THRESHOLD_Z;
}

function isBallAtPlayerFeet(p){
  return ball.owner === p && ball.state === BALL_STATE.IN_POSSESSION;
}

function isBallLooseForPendingAction(){
  return ball.owner === null;
}

function pressedActionButton(input){
  if(input.pressShot) return 'shot';
  if(input.pressThrough) return 'through';
  if(input.pressCross) return 'cross';
  if(input.pressPass && !input.heldL1) return 'pass';
  return null;
}

function heldActionButton(input){
  if(input.heldShot) return 'shot';
  if(input.heldThrough) return 'through';
  if(input.heldCross) return 'cross';
  if(input.heldPass && !input.heldL1) return 'pass';
  return null;
}

function releasedActionButton(input){
  if(input.releasedShot) return 'shot';
  if(input.releasedThrough) return 'through';
  if(input.releasedCross) return 'cross';
  if(input.releasedPass && !input.heldL1) return 'pass';
  return null;
}

function pendingActionToAerialButton(kickType){
  if(kickType === 'shot') return 'shot';
  if(kickType === 'cross') return 'cross';
  return 'pass';
}

// Frame de contacto con posesion: delega en onBallContact (unica fuente de ejecucion del buffer).
function checkActionExecution(p){
  if(isKickoffWaiting() && !isKickoffBallContestable()) return false;
  if(ball.owner !== p) return false;
  if(!hasBufferedAction(p)) return false;
  if(p.tackleAnim || p.airStrikeAnim || p.diveAnim) return false;
  return onBallContact(p, ball);
}

function getEffectiveManualL2(p, kickType){
  if(kickType !== 'shot') return false;
  const buf = p?.actionBuffer;
  return !!(buf && buf.manualL2);
}

function playGroundActionAtContact(p, kickType, power, curve){
  const exit = getKickExitVector(p);
  const dir = exit.direction;
  if(!ball.owner){
    ball.x = exit.origin.x + dir.x * 0.6;
    ball.y = exit.origin.y + dir.y * 0.6;
    ball.z = 0;
  }
  executeKick(p, kickType, dir, power, curve);
  clearActionBuffer(p);
  clearChasingState(p);
  clearForcedChaseState(p);
  clearSprintChaseState(p);
  p.state = 'idle';
  p.isPreparingToShoot = false;
  if(!isKickoffWaiting()) Game.matchState = STATE_PLAYING;
}

// Contacto de primera: enruta cabezazo / volea (L2) / pie segun altura de la pelota.
function onBallContact(p, ballRef){
  if(!hasBufferedAction(p)) return false;
  if(isKickoffWaiting() && !isKickoffBallContestable()) return false;
  if(p.tackleAnim || p.airStrikeAnim || p.diveAnim) return false;
  if(p.airLock && p.airLock.t < p.airLock.dur) return false;
  if(isAirDuelContestant(p)) return false;

  const buf = p.actionBuffer;
  const kickType = getBufferKickType(buf) || 'pass';
  const power = normalizeKickPower(buf.power > 0 ? buf.power : getCurrentPower(p));
  const curve = buf.curve ?? 0;
  const manualL2 = getEffectiveManualL2(p, kickType);
  const wasChasing = isPlayerChasing(p) || isChaseOwner(p);

  if(isBallAirborne(ballRef, p)){
    const aerialBtn = pendingActionToAerialButton(kickType);
    if(handleAerialContact(p, ballRef, aerialBtn, power, curve, manualL2)){
      if(wasChasing) resumeChasingAfterAction(p);
      return true;
    }
    return false;
  }

  playGroundActionAtContact(p, kickType, power, curve);
  if(wasChasing) resumeChasingAfterAction(p);
  return true;
}

// Loop de fisica: ejecuta solo cuando la pelota intersecta el collider corporal.
function updateActionBufferPhysics(p){
  const buf = p?.actionBuffer;
  if(!buf?.type) return;

  if(ball.owner && ball.owner !== p && ball.owner.team !== p.team){
    clearActionBuffer(p);
    return;
  }

  if(isAirDuelContestant(p)) return;
  if(!isPendingActionArmed(p)) return;

  updateBufferedHeaderJumpApproach(p);

  if(ball.owner) return;

  if(isBallAirborne(ball, p)){
    tryExecuteBufferedAerialStrike(p);
    return;
  }

  const d = dist2D(p, ball);
  if(d < PENDING_ACTION_EXECUTE_RADIUS){
    onBallContact(p, ball);
  }
}

function tryExecuteBufferedAerialStrike(p){
  const kickType = getBufferKickType(p.actionBuffer);
  const manualL2 = getEffectiveManualL2(p, kickType);
  const aerialBtn = pendingActionToAerialButton(kickType);
  const contact = resolveAerialStrikeType(p, ball, manualL2, aerialBtn);
  if(!contact) return false;
  if(!canExecuteAerialBodyContact(p, ball, contact)) return false;
  return onBallContact(p, ball);
}

function tryExecuteBufferedActionOnRelease(p){
  if(!p || !isPendingActionArmed(p)) return false;
  if(ball.owner === p) return false;
  if(ball.owner) return false;

  if(isBallAirborne(ball, p)) return tryExecuteBufferedAerialStrike(p);

  const d = dist2D(p, ball);
  if(d < PENDING_ACTION_EXECUTE_RADIUS) return onBallContact(p, ball);
  return false;
}

function startActionCharge(p, buf, btn, curve, input){
  buf.kickType = btn;
  buf.type = mapButtonToBufferType(btn);
  buf.chargeStart = performance.now();
  buf.power = getInitialPower();
  buf.curve = curve;
  buf.manualL2 = !!(input.heldL2 && btn === 'shot');
  buf.timestamp = performance.now();
  p.isPreparingToShoot = btn === 'shot';
  lockBufferedContactTarget(p);
  syncGlobalCharging(p);
}

function finalizeActionCharge(buf, btn){
  const elapsed = buf.chargeStart > 0 ? performance.now() - buf.chargeStart : 0;
  buf.power = normalizeKickPower(chargePowerFromElapsed(elapsed));
  buf.kickType = btn;
  buf.type = mapButtonToBufferType(btn);
  buf.chargeStart = 0;
  buf.timestamp = performance.now();
}

function tryExecuteOwnedBallKick(p, kickType, curve){
  if(ball.owner !== p || !kickType) return false;
  executeBufferedGroundKick(p, kickType, getCurrentPower(p), curve ?? p.actionBuffer?.curve ?? 0);
  return true;
}

// Input: setea type/power en actionBuffer al pulsar (keydown / gamepadbuttondown).
// Si se mantiene presionado, la potencia sube; al soltar se congela el valor final.
function updateActionBufferInput(p, input){
  if(!p || p.role === 'GK') return;
  if(Game.isInputLocked) return;
  if(isKickoffWaiting()){
    if(isKickoffTaker(p)) return;
    if(!isKickoffBallContestable()) return;
  }
  if(p.isChargingShot || isShotFeintBlocked(p)) return;
  if(p.tackleAnim || p.diveAnim || p.airStrikeAnim) return;

  if(ball.owner && ball.owner.team !== p.team){
    clearActionBuffer(p);
    return;
  }

  if(input.pressSuperCancel && hasPendingAction(p)){
    cancelAction(p);
    return;
  }

  if(input.heldManualCancel){
    clearActionBuffer(p);
    return;
  }

  const buf = p.actionBuffer;
  if(!buf) return;

  const curve = resolveInputCurve(input);
  const btnPressed = pressedActionButton(input);
  const btnHeld = heldActionButton(input);
  const btnReleased = releasedActionButton(input);

  // Accion armada y esperando contacto (tap o post-suelta)
  if(buf.type && buf.chargeStart === 0){
    if(buf.kickType === 'shot') buf.manualL2 = !!input.heldL2;
    return;
  }

  // Carga activa: potencia dinamica mientras se mantiene el boton
  if(buf.type && buf.chargeStart > 0 && btnHeld && getBufferKickType(buf) === btnHeld){
    buf.power = normalizeKickPower(chargePowerFromElapsed(performance.now() - buf.chargeStart));
    buf.curve = curve;
    buf.manualL2 = !!(input.heldL2 && btnHeld === 'shot');
    p.isPreparingToShoot = btnHeld === 'shot';
    syncGlobalCharging(p);
    if(buf.power >= KICK_POWER_MAX - 0.001){
      finalizeActionCharge(buf, btnHeld);
      p.isPreparingToShoot = buf.kickType === 'shot';
      tryExecuteOwnedBallKick(p, btnHeld, curve);
      tryExecuteBufferedActionOnRelease(p);
    }
    return;
  }

  // Soltar: fijar potencia final (nunca descartar por potencia baja)
  if(btnReleased && buf.chargeStart > 0 && getBufferKickType(buf) === btnReleased){
    finalizeActionCharge(buf, btnReleased);
    p.isPreparingToShoot = buf.kickType === 'shot';
    tryExecuteOwnedBallKick(p, btnReleased, curve);
    tryExecuteBufferedActionOnRelease(p);
    syncGlobalCharging(p);
    return;
  }

  // keydown / gamepadbuttondown: inicia carga; si suelta en el mismo frame, ejecuta con potencia minima
  if(btnPressed){
    startActionCharge(p, buf, btnPressed, curve, input);
    if(btnReleased && getBufferKickType(buf) === btnPressed){
      finalizeActionCharge(buf, btnPressed);
      tryExecuteOwnedBallKick(p, btnPressed, curve);
      tryExecuteBufferedActionOnRelease(p);
    }
    return;
  }

  // Respaldo si el motor no reporto press pero el boton esta held
  if(btnHeld && !buf.type){
    startActionCharge(p, buf, btnHeld, curve, input);
    return;
  }

  if(buf.chargeStart > 0 && !btnHeld){
    if(buf.type){
      const kickType = getBufferKickType(buf);
      finalizeActionCharge(buf, kickType);
      p.isPreparingToShoot = buf.kickType === 'shot';
      tryExecuteOwnedBallKick(p, kickType, buf.curve ?? curve);
      tryExecuteBufferedActionOnRelease(p);
    } else {
      clearActionBuffer(p);
    }
    syncGlobalCharging(p);
  }
}

function canAerialContact(p){
  if(isThrowInTakerBlocked(p)) return false;
  const buf = p?.actionBuffer;
  const radius = (buf?.type && !buf.chargeStart) ? PENDING_ACTION_EXECUTE_RADIUS : AIR_CONTACT_RADIUS;
  const loose = !ball.owner && (ball.state === BALL_STATE.FREE || ball.state === BALL_STATE.LOOSE_BALL || ball.state === BALL_STATE.IN_AIR);
  return loose && ball.z > AIR_AERIAL_MIN_Z && dist2D(p, ball) < radius;
}

function isBallAerialLoose(){
  return !ball.owner && ball.z > AIR_AERIAL_MIN_Z;
}

function getPendingManualL2(p){
  const buf = p?.actionBuffer;
  if(getBufferKickType(buf) === 'shot') return !!buf.manualL2;
  return false;
}

// Predice cabezazo / volea / chilena para posicionamiento segun input (L2 = manual arriesgado).
function predictAerialStrikeType(p, ball, manualL2){
  const z = getBallContactHeight(p, ball);
  if(z <= AIR_AERIAL_MIN_Z || isBallAboveHumanReach(z)) return null;
  const useManual = !!manualL2;
  if(useManual){
    if(z > AIR_VOLLEY_L2_MIN_Z && z <= AIR_VOLLEY_L2_MAX_Z) return { type: 'volley' };
    if(z >= AIR_BICYCLE_MIN_Z && z <= AIR_BICYCLE_MAX_Z && isPlayerBackToAimDir(p)) return { type: 'bicycle' };
    return null;
  }
  if(z >= AIR_HEADER_STAND_MIN_Z && z <= AIR_HEADER_STAND_MAX_Z) return { type: 'header' };
  if(z > AIR_HEADER_JUMP_MIN_Z && z <= AIR_MAX_HUMAN_REACH_Z) return { type: 'header' };
  return null;
}

function getActiveManualL2(p){
  if(getPendingManualL2(p)) return true;
  const duel = Game.airDuel;
  if(duel && !duel.resolved && duel.contestants.includes(p.id)){
    const entry = duel.spamCounts[p.id];
    if(entry && entry.manualL2) return true;
  }
  return false;
}

function getAerialPositionTarget(p, ball){
  const buf = p?.actionBuffer;
  const isShot = getBufferKickType(buf) === 'shot';
  const charging = isActionBufferCharging(p);
  const armed = isPendingActionArmed(p);

  if(charging && p.chargeMoveLock){
    return {x: p.chargeMoveLock.x, y: p.chargeMoveLock.y};
  }

  if(isShot && (armed || charging)){
    const contact = predictFirstShotContact(p, ball);
    if(contact){
      const approach = ballApproachDir(p, ball);
      p.firstShotContactT = contact.t;
      return {x: contact.x - approach.x * 0.65, y: contact.y - approach.y * 0.65};
    }
  }
  const aimDir = getStickDir(p);
  const hint = predictAerialStrikeType(p, ball, getActiveManualL2(p));
  if(!hint) return {x: ball.x, y: ball.y};
  if(hint.type === 'bicycle'){
    return {x: ball.x - aimDir.x*1.35, y: ball.y - aimDir.y*1.35};
  }
  if(hint.type === 'volley'){
    const approach = ballApproachDir(p, ball);
    return {x: ball.x - approach.x*0.65, y: ball.y - approach.y*0.65};
  }
  return {x: ball.x, y: ball.y};
}

function updateBufferedApproachMovement(p, dt){
  const buf = p?.actionBuffer;
  if(!buf?.type || ball.owner || !isBallAvailableForHunt()) return false;

  const kickType = getBufferKickType(buf);
  const charging = isActionBufferCharging(p);

  if(charging){
    if(!p.chargeMoveLock) lockBufferedContactTarget(p);
    if(!p.chargeMoveLock) return false;
    applyBufferedTargetMovement(p, dt, p.chargeMoveLock, kickType);
    return true;
  }

  const target = resolveBufferedContactTarget(p, true);
  applyBufferedTargetMovement(p, dt, target, kickType);
  return true;
}

function updateMovingToBallPriority(p, dt, input){
  return seekBall(p, dt, input);
}

function updateAerialStrikeMovement(p, dt){
  updateBufferedApproachMovement(p, dt);
}

// Ley de prioridad: MOVING_TO_BALL > acciones de pase/tiro (secundarias).
function handlePendingActionMovement(p, dt, input){
  return updateMovingToBallPriority(p, dt, input);
}

function syncStickDir(p, moveInput){
  const mx = moveInput?.x || 0;
  const my = moveInput?.y || 0;
  const mag = Math.hypot(mx, my);
  p.leftStickInput = {x: mx, y: my};
  if(mag > 0.05){
    p.stickDir = {x: mx / mag, y: my / mag};
  } else if(!p.stickDir || Math.hypot(p.stickDir.x, p.stickDir.y) < 0.01){
    p.stickDir = {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  }
  p.lastAim = getDirectInputDir(p);
}

function getStickDir(p){
  const s = p.stickDir;
  if(s && Math.hypot(s.x, s.y) > 0.15) return norm(s);
  return {x: Math.cos(p.facing), y: Math.sin(p.facing)};
}

/** Vector de salida puro: solo stick izquierdo en el impacto (sin auto-chase ni IA). */
function getDirectInputDir(p){
  const stick = p.leftStickInput;
  if(stick && Math.hypot(stick.x, stick.y) > 0.15){
    return norm(stick);
  }
  return getStickDir(p);
}

/** Origen = posicion del jugador; direccion = stick normalizado (pase/tiro de primera). */
function getKickExitVector(p){
  return {
    origin: {x: p.x, y: p.y},
    direction: getDirectInputDir(p),
  };
}

/** Calidad de contacto aereo segun posicion/orientacion manual (sin asistencia). */
function computeManualAerialImpactQuality(p, ball){
  const dx = ball.x - p.x, dy = ball.y - p.y;
  const dist = Math.hypot(dx, dy);
  const toBall = dist > 0.01 ? {x: dx / dist, y: dy / dist} : {x: 0, y: 0};
  const facing = {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  const facingBall = facing.x * toBall.x + facing.y * toBall.y;
  const exitDir = getDirectInputDir(p);
  const distOk = dist <= AIR_CONTACT_RADIUS;
  const distFactor = distOk ? clamp(1 - (dist / AIR_CONTACT_RADIUS) * 0.3, 0.45, 1) : 0;
  const orientFactor = clamp((facingBall + 1) * 0.5, 0, 1);
  const quality = distOk ? distFactor * lerp(0.18, 1, orientFactor) : 0;
  return {dist, distOk, quality, exitDir, facingBall};
}

// Vector desde donde "viene" la pelota (trayectoria de aproximacion).
function ballApproachDir(p, ball){
  const sp = Math.hypot(ball.vx, ball.vy);
  const toP = {x: p.x - ball.x, y: p.y - ball.y};
  const toLen = Math.hypot(toP.x, toP.y) || 1;
  const toNorm = {x: toP.x/toLen, y: toP.y/toLen};
  if(sp > 0.4){
    const velN = {x: ball.vx/sp, y: ball.vy/sp};
    const closing = velN.x*toNorm.x + velN.y*toNorm.y;
    if(closing > 0.12) return {x: -velN.x, y: -velN.y};
  }
  return toNorm;
}

// Jerarquia: remate sin L2 = cabezazo (1.70–2.50 m) · L2+remate = volea media / chilena elevada.
function resolveAerialStrikeType(p, ballRef, manualL2, actionButton){
  const z = getBallContactHeight(p, ballRef);
  if(z <= AIR_AERIAL_MIN_Z || isBallAboveHumanReach(z)) return null;

  const d = dist2D(p, ballRef);
  const buf = p?.actionBuffer;
  const radius = (buf?.type && !buf.chargeStart) ? PENDING_ACTION_EXECUTE_RADIUS : AIR_CONTACT_RADIUS;
  if(d >= radius) return null;

  const isShot = actionButton === 'shot';
  const useManual = isShot && !!manualL2;

  if(useManual){
    if(z > AIR_VOLLEY_L2_MIN_Z && z <= AIR_VOLLEY_L2_MAX_Z){
      return { type: 'volley', cfg: AIR_STRIKE_TABLE.volley, manual: true, needsJump: false };
    }
    if(z >= AIR_BICYCLE_MIN_Z && z <= AIR_BICYCLE_MAX_Z && isPlayerBackToAimDir(p)){
      return { type: 'bicycle', cfg: AIR_STRIKE_TABLE.bicycle, manual: true, needsJump: false };
    }
    return null;
  }

  if(z >= AIR_HEADER_STAND_MIN_Z && z <= AIR_HEADER_STAND_MAX_Z){
    if(isShot && !isPlayerSlowForStandingHeader(p)) return null;
    return { type: 'header', cfg: AIR_STRIKE_TABLE.header, manual: false, needsJump: false };
  }

  if(z > AIR_HEADER_JUMP_MIN_Z && z <= AIR_MAX_HUMAN_REACH_Z){
    return { type: 'header', cfg: AIR_STRIKE_TABLE.header, manual: false, needsJump: true };
  }

  return null;
}

// Direccion de salida: stick izquierdo puro en el impacto (sin blend hacia companero/arco).
function resolveAerialDirection(p, ball, actionButton){
  return getDirectInputDir(p);
}

// actionButton: 'shot' (Cuadrado) | 'pass' (X/Triangulo) | 'cross' (Circulo)
function handleAerialContact(p, ball, actionButton, power, curve, manualL2){
  if(p.tackleAnim || p.airStrikeAnim || p.diveAnim) return false;
  if(p.airLock && p.airLock.t < p.airLock.dur) return false;
  if(ball.owner) return false;
  if(!canAerialContact(p)) return false;
  if(actionButton !== 'shot' && actionButton !== 'pass' && actionButton !== 'cross') return false;

  const contact = resolveAerialStrikeType(p, ball, manualL2, actionButton);
  if(!contact) return false;
  if(!canExecuteAerialBodyContact(p, ball, contact)) return false;

  const hitPos = contact.type === 'header' ? getHeadStrikePos(p) : getFootStrikePos(p);
  ball.x = hitPos.x + (ball.x - hitPos.x) * 0.35;
  ball.y = hitPos.y + (ball.y - hitPos.y) * 0.35;
  ball.z = Math.max(ball.z, hitPos.z - BALL_RADIUS * 0.5);

  p.charging = null;
  const pwr = normalizeKickPower(power ?? getCurrentPower(p));

  if(actionButton === 'shot'){
    const impact = computeManualAerialImpactQuality(p, ball);
    if(!impact.distOk || impact.quality <= 0.05) return false;

    const exitDir = impact.exitDir;
    const vel = computeKickVelocityParams(p, 'shot', exitDir, pwr, 0);
    const aerialMult = getArchetypeAerialPowerMult(p);
    const spd = vel.spd * impact.quality * aerialMult;

    setBallStateLoose(true);
    ball.lastTouchTeam = p.team;
    ball.lastTouchedBy = p.id;
    clearThrowInBlockIfOtherPlayer(p);
    ball.lastKicker = p;
    ball.lastKickType = 'shot';
    ball.passOrigin = null;
    ball.highKick = true;
    ball.highKickType = 'shot';
    ball.x = p.x + exitDir.x * 0.85;
    ball.y = p.y + exitDir.y * 0.85;
    ball.z = Math.max(ball.z, contact.type === 'header' ? 0.85 : contact.type === 'bicycle' ? 0.5 : 0.35);
    ball.vx = exitDir.x * spd;
    ball.vy = exitDir.y * spd;
    ball.initialSpeed = Math.hypot(ball.vx, ball.vy);
    ball.vz = computeKickVerticalSpeed('shot', vel.cfg, pwr) * impact.quality * aerialMult;
    ball.curveFactor = 0;
    ball.groundFrictionMult = vel.curvePhys.groundFrictionMult || 1;
    clearCurvePassTracking(ball);
    resetBallKickFriction(ball, 'shot');

    const animType = contact.type === 'volley' ? 'volley' : contact.type;
    const jumpDur = contact.type === 'header' ? (physicsConfig.airTime ?? contact.cfg.dur) : contact.cfg.dur;
    const animDur = Math.max(jumpDur, AIR_LOCK_DURATION);
    if(!p.airStrikeAnim){
      p.airStrikeAnim = {type: animType, action: actionButton, t: 0, dur: animDur};
    }
    p.airLock = {t: 0, dur: AIR_LOCK_DURATION};
    p.tackleCooldown = TACKLE_COOLDOWN * 2.2;
    p.releaseCooldown = 0.5;
    p.facing = Math.atan2(exitDir.y, exitDir.x);
    syncPlayerDir(p);
    p.vx = 0;
    p.vy = 0;
    clearActionBuffer(p);
    return true;
  }

  const mods = AIR_ACTION_MODS[actionButton];
  const aimDir = resolveAerialDirection(p, ball, actionButton);
  const cfg = contact.cfg;
  const manualVolley = contact.manual && contact.type === 'volley';
  let speedMult = mods.speedMult * (manualVolley ? AIR_MANUAL_VOLLEY_SPEED_MULT : 1);
  speedMult *= getArchetypeAerialPowerMult(p);
  const fdir = norm(aimDir);
  const kickType = actionButton === 'cross' ? 'cross' : actionButton === 'shot' ? 'shot' : 'pass';
  const tableMult = getArchetypeKickSpeedTableMult(p, kickType);
  const spd = lerp(cfg.minSpeed, cfg.maxSpeed, pwr) * speedMult * tableMult;
  const aerialMult = getArchetypeAerialPowerMult(p);
  const vz = cfg.vz * mods.vzMult * (0.75 + pwr * 0.35) * aerialMult;

  setBallStateLoose(true);
  ball.lastTouchTeam = p.team;
  ball.lastTouchedBy = p.id;
  clearThrowInBlockIfOtherPlayer(p);
  ball.lastKicker = p;
  ball.passOrigin = actionButton === 'pass' ? {x: p.x, y: p.y} : null;
  ball.highKick = actionButton === 'cross';
  ball.highKickType = actionButton === 'cross' ? 'cross' : null;
  ball.x = p.x + fdir.x * 0.85;
  ball.y = p.y + fdir.y * 0.85;
  ball.z = Math.max(ball.z, contact.type === 'header' ? 0.85 : contact.type === 'bicycle' ? 0.5 : 0.35);
  ball.vx = fdir.x * spd;
  ball.vy = fdir.y * spd;
  ball.initialSpeed = Math.hypot(ball.vx, ball.vy);
  ball.vz = vz;
  const curvePhys = applyKickCurvePhysics(p, kickType, fdir, curve || 0);
  ball.curveFactor = curvePhys.curveFactor;
  ball.groundFrictionMult = curvePhys.groundFrictionMult || 1;
  resetBallKickFriction(ball, kickType);
  setupCurvePassTracking(p, kickType, fdir, curve || 0, ball.initialSpeed);

  const animType = contact.type;
  const jumpDur = contact.type === 'header' ? (physicsConfig.airTime ?? cfg.dur) : cfg.dur;
  const animDur = Math.max(jumpDur, AIR_LOCK_DURATION);
  if(!p.airStrikeAnim){
    p.airStrikeAnim = {type: animType, action: actionButton, t: 0, dur: animDur};
  }
  p.airLock = {t: 0, dur: AIR_LOCK_DURATION};
  p.tackleCooldown = TACKLE_COOLDOWN * 2.2;
  p.releaseCooldown = 0.5;
  p.facing = ang;
  p.vx = 0;
  p.vy = 0;

  if(manualVolley){
    p.staminaTired = clamp((p.staminaTired || 0) + AIR_MANUAL_VOLLEY_STAMINA_COST, 0, 1);
  }

  if((actionButton === 'pass' || actionButton === 'cross') && pwr >= AUTOPASE_POWER_THRESHOLD){
    handleKickCursorSwitch(p, pwr, norm(aimDir), actionButton === 'cross' ? 'cross' : 'pass');
  }
  assignPassTargetFromKick(p, norm(aimDir), actionButton === 'cross' ? 'cross' : 'pass', pwr);
  clearActionBuffer(p);
  return true;
}

function updateAirStrikeAnim(p, dt){
  const a = p.airStrikeAnim;
  if(!a) return;
  a.t += dt;
  updatePlayerJumpZ(p);
  if(a.t >= a.dur){
    p.airStrikeAnim = null;
    p.z = 0;
  }
}

function updateAirLock(p, dt){
  if(!p.airLock) return;
  p.airLock.t += dt;
  if(p.airLock.t >= p.airLock.dur) p.airLock = null;
}


/* ============================================================
   CONTROL DEL JUGADOR HUMANO
   ============================================================ */
// NOTA: el viejo sistema de "no cambiar cursor si la pelota recorrio menos de X metros" (basado en
// ball.passOrigin) quedo reemplazado por handleKickCursorSwitch(), que decide TODO en el instante del
// impacto pie-pelota segun la barra de potencia (ver mas arriba, junto a executeKick). Ya no hace
// falta medir la distancia recorrida por la pelota en vuelo para esto.
function updateHumanControl(dt, input, team, padIndex, scheme){
  try {
    updateHumanControlBody(dt, input, team, padIndex, scheme);
  } catch(err){
    console.error('[updateHumanControl] Error ignorado para no detener el tick:', err);
  }
}

function applyDefensiveControlFlags(p, input){
  if(!p || !input) return;
  const canJockey = p.role !== 'GK' && ball.owner !== p;
  input.jockey = !!(input.heldL2 && canJockey);
}

function activateSecondaryPressForTeam(team, carrier){
  const cursorId = getPressureCursorId(team);
  const best = cursorId ? getPlayerById(cursorId) : null;
  if(!best || isControlledByHuman(best)) return;
  for(const mate of allPlayers){
    if(mate.team === team && mate.secondaryPressActive && mate.id !== best.id){
      mate.secondaryPressActive = false;
      mate.secondaryPressTargetId = null;
      mate.aiMode = 'normal';
    }
  }
  best.secondaryPressActive = true;
  best.secondaryPressTargetId = carrier.id;
  best.aiMode = AI_SECONDARY_PRESSING;
}

function clearSecondaryPressForTeam(team){
  for(const mate of allPlayers){
    if(mate.team !== team || !mate.secondaryPressActive) continue;
    mate.secondaryPressActive = false;
    mate.secondaryPressTargetId = null;
    mate.aiMode = 'normal';
  }
}

function updateHumanControlBody(dt, input, team, padIndex, scheme){
  if(isGameplayInputBlocked()) return;
  if(gameState === 'celebration_run') return;
  input = lockKickInputs(input);

  const isHome = team==='home';
  // al que la tiene, como en cualquier juego de futbol. En DEFENSA el cambio es 100% MANUAL:
  // nunca salta solo a otro jugador — solo cambia con L1 (al mas cercano a la pelota) o con el
  // flick del stick derecho (al jugador mas alineado con esa direccion).
  const now = performance.now();
  const kickoffTaker = isKickoffWaiting() ? getKickoffTaker() : null;
  const kickoffLocksTeam = kickoffTaker && kickoffTaker.team === team;
  const teamOwnsBall = ball.owner && ball.owner.team===team;
  const curHome = controlledPlayer();
  const curAway = controlledPlayer2();
  const lockHome = isAssignmentLockedSafe(curHome);
  const lockAway = isAssignmentLockedSafe(curAway);
  if(!kickoffLocksTeam){
    if(isHome){
      const holdForWallRun = !!getActiveParedRunner('home');
      const carrier = teamOwnsBall ? ball.owner : null;
      if(carrier) handleSmartManualRunInput(carrier, input, team, padIndex);
      if(!holdForWallRun && now > Game.manualOverrideUntil && teamOwnsBall && !isBallLocked() && !lockHome){
        const curCtrl = controlledPlayer();
        if(!curCtrl || curCtrl.id === ball.owner.id){
          setControlled(ball.owner);
        }
      }
      if(input.pressSwitch && !holdForWallRun && !lockHome){
        const move = remapMoveForCamera(input.move);
        const aimAtMate = carrier && isStickAimedAtTeammate(carrier, move);
        if(!aimAtMate){
          Game.manualOverrideUntil = now + RS_SELECT_HOLD;
          setControlled(nearestToBall('home'));
        }
      }
    } else {
      const holdForWallRun2 = !!getActiveParedRunner('away');
      const carrier = teamOwnsBall ? ball.owner : null;
      if(carrier) handleSmartManualRunInput(carrier, input, team, padIndex);
      if(!holdForWallRun2 && now > Game.manualOverrideUntil2 && teamOwnsBall && !isBallLocked() && !lockAway){
        const curCtrl = controlledPlayer2();
        if(!curCtrl || curCtrl.id === ball.owner.id){
          setControlled2(ball.owner);
        }
      }
      if(input.pressSwitch && !holdForWallRun2 && !lockAway){
        const move = remapMoveForCamera(input.move);
        const aimAtMate = carrier && isStickAimedAtTeammate(carrier, move);
        if(!aimAtMate){
          Game.manualOverrideUntil2 = now + RS_SELECT_HOLD;
          setControlled2(nearestToBall('away'));
        }
      }
    }
  }

  const p = isHome ? controlledPlayer() : controlledPlayer2();
  if(!p) return;

  applyDefensiveControlFlags(p, input);

  if(isPlayerStaggered(p)) return;

  if(isKickoffWaiting()){
    const taker = getKickoffTaker();
    if(taker){
      if(taker.team === 'home') setControlled(taker);
      else if(Game.twoPlayerMode) setControlled2(taker);
    }
    maintainKickoffPlacement();

    if(!taker || p.id !== taker.id){
      updateHumanMovement(p, dt, input, team);
      return;
    }

    if(taker.kickoffAnim){
      updateKickoffManeuver(taker, dt);
      return;
    }

    syncStickDir(taker, input.move);
    const aimDir = taker.lastAim;
    const curve = resolveInputCurve(input);

    if(handleShotChargeInput(taker, input, aimDir, curve)) return;
    if(taker.pendingKick) return;
    if(ball.owner === taker){
      handleManualRestartKickInput(taker, input);
    }
    return;
  }

  syncStickDir(p, input.move);

  // --- Pelota parada / saque de centro: potencia + direccion estricta del stick ---
  if(isManualRestartAwaiting(p)){
    handleManualRestartKickInput(p, input);
    updateHumanMovement(p, dt, input, team);
    return;
  }

  // --- Saque lateral: direccion obligatoria del stick en el frame de lanzamiento ---
  if(p.isThrowingIn && ball.state === BALL_STATE.IN_HAND){
    handleThrowInInput(p, input);
    updateHumanMovement(p, dt, input, team);
    return;
  }

  // --- Saque lateral en animacion de lanzamiento ---
  if(p.throwInAnim || ball.state === BALL_STATE.IN_HAND){
    updateHumanMovement(p, dt, input, team);
    return;
  }

  // --- INPUT MANAGER: effort touch / fake shot — prioridad absoluta, fuera de IA ---
  if(InputManager.process(p, input, padIndex, scheme)){
    updateHumanMovement(p, dt, input, team);
    return;
  }

  if(isPlayerStaggered(p)) return;
  if(isPlayerStunned(p)){
    updateHumanMovement(p, dt, input, team);
    return;
  }

  // Interrumpir forced_chase solo si la pelota ya esta bajo control fisico
  if(isPlayerForcedChasing(p) && ball.owner === p && userWantsPossessionAction(input)){
    ensurePlayerBallControlForAction(p);
  }

  // R1 exclusivo: AI_SECONDARY_PRESSING sobre el cursor gris (CPU más cercano al poseedor).
  if(ball.owner && ball.owner.team !== team && p.role !== 'GK'){
    if(input.heldR1) activateSecondaryPressForTeam(team, ball.owner);
    else clearSecondaryPressForTeam(team);
  }

  // Sin tacle mientras jockey (L2) — inputs defensivos mutuamente excluyentes
  if(!input.jockey && tryDefensiveTackleInput(p, input)) return;

  if(p.tackleAnim || p.airStrikeAnim || p.diveAnim || p.feint || p.dragBack || p.gkKickAnim || p.throwInAnim){
    return;
  }
  if(p.airLock && p.airLock.t < p.airLock.dur) return;

  if(p.isMakingManualRun && p.wallRun && p.wallRun.active){
    updateWallRun(p, dt, padIndex);
    return;
  }

  // Fake shot (Cuadrado + X): ventana de amague; no bloquea movimiento
  if(ball.owner === p){
    handleShotChargeInput(p, input, p.lastAim, resolveInputCurve(input));
  } else if(p.isChargingShot){
    clearChargingShotState(p);
    syncGlobalChargingShot(p);
  }

  // Buffer global: input solo setea type/power; sin frenado ni cambio de estado
  updateActionBufferInput(p, input);
  if(Game.airDuel?.active && !Game.airDuel.resolved && isAirDuelContestant(p)){
    registerAirSpamPress(p, input, resolveInputCurve(input));
  }
  updateHumanMovement(p, dt, input, team);

  // --- DRAGBACK (L1+R1 + stick hacia la espalda del jugador)
  const dragCombo = ball.owner===p && input.heldL1 && input.heldR1;
  if(!dragCombo){
    p.dragBackArmed = false;
  } else if(!p.dragBackArmed && !p.charging && !p.pendingKick){
    const hasBackDir = Math.hypot(input.move.x, input.move.y) > 0.35; // hace falta un tiron claro del stick, no un roce
    if(hasBackDir){
      const dir = norm(input.move);
      const facingVec = {x:Math.cos(p.facing), y:Math.sin(p.facing)};
      // que tan apuntado esta el stick hacia la ESPALDA del jugador (1 = derecho para atras, 0 = de costado)
      const backAlign = -(dir.x*facingVec.x + dir.y*facingVec.y);
      if(backAlign > 0.5){
        p.dragBackArmed = true;
        startDragBack(p, dir);
        return;
      }
    }
  }

  // golpe de primera: el buffer aereo (cabezazo/volea/chilena) ya se resolvio arriba

  const owns = ball.owner===p;
  if(owns && isGoalkeeper(p) && isGkHandsPossession(p) && !isGoalKickReadyState()){
    if(handleGoalkeeperKick(p, input, p.lastAim)){
      updateHumanMovement(p, dt, input, team);
      return;
    }
  } else if(owns){
    handleBallOwnerKicks(p, input, team, p.lastAim, resolveInputCurve(input), padIndex);
  } else if(p.role==='GK'){
    p.charging = null;
    if(p.tackleCooldown<=0){
      if(input.pressThrough){
        startGKDive(p, p.y, GK_MANUAL_JUMP_DUR, GK_JUMP_MIN_Z+0.4);
      } else if(input.pressShot){
        const hasDir = Math.hypot(input.move.x, input.move.y) > 0.2;
        const mv = hasDir ? norm(input.move) : {x:0, y:(p.y<CENTER.y? -1:1)};
        startGKDive(p, p.y + mv.y*GK_MANUAL_DIVE_DIST, GK_MANUAL_DIVE_DUR, 0.3);
      }
    }
  }

  // Frame de contacto: ejecucion diferida si quedo algun buffer armado
  if(ball.owner === p) checkActionExecution(p);
}

export { isStandardPad, connectedGamepadIndices, nonStandardGamepadIndices, assignInputSources, updatePadStatus, refreshPadPanel, getPadAt, getFirstNavigationGamepad, resetGamepadState, axisOrZero, anyKey, anyKeyPrev, getInputKeyState, readRightStick, getActiveWallRunner, calculateForwardVector, findTeammateForRemoteRun, getPlayerRunningSpeed, normalizeRunVector, getForwardRunDirection, getManualRunPartner, getDistToManualRunPartner, shouldIgnoreManualRunPartner, isManualRunInShortGrace, canApplyManualRunStick, tickManualRunGrace, beginManualRunCore, getOffensiveRunDirection, findManualRunOpenSpace, computeManualRunCurvedVector, getParedGoalTarget, computeParedCurvedDir, applyParedStickInput, applyManualRunStickInput, startRemoteManualRun, tryTriggerSmartManualRun, reactivateSmartManualRun, tryTriggerRemoteManualRun, startManualRun, resetManualRunState, cancelManualRunForPlayer, cancelManualRunIfBallOwner, cancelManualRunsForTeam, notifyManualRunPossessionChange, syncManualRunWithPossession, readRightStickForManualRun, captureManualRunDirection, resolveManualRunDirection, getManualRunDirection, finishManualRun, getActiveSmartManualRunner, getActiveParedRunner, handleRightStickSwitch, selectPlayerByFlick, padButtons, detectSyncTriggerPress, readInput, snapshotKeys, remapMoveForCamera, chargePowerFromElapsed, getInitialPower, syncGlobalChargingShot, syncGlobalCharging, getCurrentPower, clearChargingShotState, isShotFeintBlocked, isPassBlockedAfterFakeShot, isFakeShotInputBlocked, completeFakeShot, updateFakeShotState, canCancelChargeWithFakeShot, handleShotChargeInput, startCharge, releaseCharge, handleBallOwnerKicks, cancelAction, cancelCurrentAction, clampSelfTouchVelocity, calcSelfTouchBurstSpeed, activateSelfTouchCollectBlock, updateSelfTouchCollectBlock, applySelfTouchBrake, applySelfTouchImpulse, beginSelfTouchChase, executeFakeShot, fakeShot, updateForcedChase, updateChasing, resolveSelfTouchDirection, triggerEffort, effortTouch, updatePendingKick, updateFeint, startDragBack, updateDragBack, executeKick, releaseGkBallForKick, applyGkKickImpulse, triggerGoalkeeperKick, handleGoalkeeperKick, updateGkKickAnim, predictBallLanding, estimateKickTarget, nearestTeammateToPoint, findPassReceiverByIntent, handleKickCursorSwitch, clearActionBuffer, resetActionBuffer, clearInputBuffer, clearPendingAction, hasPendingAction, isPendingActionArmed, hasBufferedAction, isBallAtPlayerFeet, isBallLooseForPendingAction, updateActionBufferInput, checkActionExecution, getBufferKickType, canAerialContact, isBallAerialLoose, isBallAirborne, getBallContactHeight, onBallContact, updateActionBufferPhysics, predictAerialStrikeType, getPendingManualL2, getActiveManualL2, getAerialPositionTarget, updateAerialStrikeMovement, updateMovingToBallPriority, seekBall, forceResumeMovement,   handlePendingActionMovement, syncStickDir, getStickDir, getDirectInputDir, getKickExitVector, ballApproachDir, resolveAerialStrikeType, resolveAerialDirection, handleAerialContact, updateAirStrikeAnim, updateAirLock, updateHumanControl, startKickoffManeuver, updateKickoffManeuver, Keys, KB_P1_SOLO, KB_P1_SHARED, KB_P2, InputManager, PREP_MIN_MS, PREP_SPEED_FACTOR };

