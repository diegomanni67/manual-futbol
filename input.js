"use strict";

export { CONTROL_TOUCH_DUR } from './state.js';

import { AERIAL_PHYSICS, AIR_ACTION_MODS, AIR_AERIAL_MIN_Z, AIR_BICYCLE_CONTACT_RADIUS, AIR_BICYCLE_MIN_Z, AIR_BUFFER_RADIUS, AIR_CONTACT_RADIUS, AIR_DRAG, AIR_HEADER_MAX_Z, AIR_HEADER_MIN_Z, AIR_LOCK_DURATION, AIR_STRIKE_TABLE, AIR_VOLLEY_L2_MAX_Z, AIR_VOLLEY_L2_MIN_Z, AIR_VOLLEY_MAX_Z, AIR_VOLLEY_MIN_Z, AUTOPASE_POWER_THRESHOLD, BALL_AERIAL_MIN_Z, BALL_RADIUS, BALL_STATE, Ball, CENTER, CROSS_MARKER_LIFE, DIRECTION_PRIORITY, DISTANCE_PRIORITY, DIST_FAKE, DRIBBLE_DIST_R1, DRIBBLE_DIST_R2, EFFORT_CHASE_TEAMMATE_BLOCK, EFFORT_ROLL_SOFT_DURATION, EFFORT_RS_MIN, EFFORT_TOUCH_ANIM_LONG, EFFORT_TOUCH_ANIM_SHORT, EFFORT_TOUCH_BURST_MULT, EFFORT_TOUCH_COOLDOWN, EFFORT_TOUCH_MAX_VELOCITY, FEINT_TOUCH_MAX_VELOCITY, FIELD_L, FIELD_W, FORCED_CHASE_RECOVER_DIST } from './state.js';

import { GK_DROP_KICK_FORCE, GK_JUMP_MIN_Z, GK_KICK_ANIM_DUR, GK_KICK_RELEASE_T, GK_MANUAL_DIVE_DIST, GK_MANUAL_DIVE_DUR, GK_MANUAL_JUMP_DUR, GK_POSSESS_FREE, GK_THROW_FORCE, GRAVITY, GROUND_FRICTION, Game, GkKickLandingListener, KICK_VELOCITY_MULT, LONGPASS_SWITCH_LOCK_MS, PASS_VELOCITY_MULT, PENDING_ACTION_EXECUTE_RADIUS, PENDING_ACTION_TIMEOUT_MS, PrivateChaseEvents, SELF_TOUCH_BURST_MULT, SELF_TOUCH_COLLECT_BLOCK, SELF_TOUCH_PLAYER_BRAKE, SET_PIECE, SHOT_PLACED_SPEED_MULT, SHOT_TRIVELA_SPEED_MULT, SHOT_VELOCITY_MULT, TACKLE_COOLDOWN, activateBallLock, activateIgnorePossession, allPlayers, applyBallLateralCurve, applyEffortTouchDefenderFreeze, applyExtendedDribbleTouch, applyKickCurvePhysics, assignBallPossession, awayTeam, ball, canApplyEffortTouch, clamp, clearBallLock } from './state.js';

import { clearChasingState, clearEffortSprintState, clearForcedChaseState, clearGkHandsTimer, clearGkPossessionType, clearPassTargetTeam, clearPlayerAIState, clearPlayerLockAssignment, clearTeammateInterferenceForTechnicalAction, clearThrowInBlockIfOtherPlayer, computeEffortPassPower, controlledPlayer, controlledPlayer2, detectEffortTouchInput, dist2D, enablePlayableBallAfterGkKick, ensureChasingState, ensurePlayerBallControlForAction, enterSprintChaseState, fakeShotOwnerId, gameState, getPlayerById, getPlayerMaxSprintVelocity, getPlayerMoveSpeedBase, getPostTouchRecoverDist, handleSetPiecePowerInput, homeTeam, inferGkPossessionSource, interruptForcedChaseForAction, interruptPlayerStateForTechnicalAction, isBallContestedSeekAllowed, isBallFreeForPlayer, isBallLocked, isChaseOwner, isFakeShotActive, isGkHandsPossession, isGoalKickReadyState, isGoalkeeper, isManualAction, isPaused, isPlayerAssignmentLocked, isPlayerChasing, isPlayerForcedChasing, isPlayerSprintChasing, prevButtonsByPad } from './state.js';

import { isPlayerStaggered, isPlayerStunned, isPossessionIgnored, isPostTouchChasing, isSetPieceAwaitingExecution, isSetPieceShotOnly, isSetPieceTaker, isThrowInTakerBlocked, lerp, movePlayer, nearestToBall, norm, onSetPieceBallReleased, projectPractice, reclaimFeintPossession, resolveCollisions, resolveInputCurve, resolveShotStyle, resumeChasingAfterAction, setBallStateFree, setBallStateLoose, setControlled, setControlled2, setupCurvePassTracking, startForcedChase, syncPlayerDir, syncTechnicallyBusy, tryEnterChasingFromPrivateEvent, userWantsPossessionAction } from './state.js';

import {
  assignPassTargetFromKick, bestWallPassTarget, isAirDuelContestant, isPassTargetPlayer,
  moveTowardSeekTarget, nearestTeammateInDirection, registerAirSpamPress, releaseWallPass,
  updateHumanMovement, updateWallRun,
  MANUAL_RUN_CURVE_BIAS, MANUAL_RUN_PASSER_IGNORE_DIST, MANUAL_RUN_SHORT_DIST_THRESHOLD,
  MANUAL_RUN_SHORT_GRACE_TIME, MANUAL_RUN_SPEED_MULT, OFFENSIVE_RUN_DIR_WEIGHT,
  OFFENSIVE_RUN_GOAL_WEIGHT, WALLRUN_MAX_DURATION,
} from './gameplay.js';

import { startGKDive, tryDefensiveTackleInput, checkBallCapture } from './physics.js';

/* ============================================================
   INPUT: TECLADO + MOUSE + GAMEPAD (mapeo estilo EA FC alternativo)
   ============================================================ */
const Keys = {};
window.addEventListener('keydown', e=>{ Keys[e.code]=true; });
window.addEventListener('keyup', e=>{ Keys[e.code]=false; });

window.addEventListener('gamepadconnected', ()=>{ assignInputSources(); });
window.addEventListener('gamepaddisconnected', ()=>{ assignInputSources(); });

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
const RS_SELECT_HOLD = 1200;  // ms que se mantiene la seleccion manual antes de que el sistema retome
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
  return p.maxSpeedBase * MANUAL_RUN_SPEED_MULT;
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

const POINTING_FOR_PASS_MAX_S = 2.0;

function startPointingForPass(p){
  if(!p || !p.isMakingManualRun) return;
  p.isPointingForPass = true;
  p.pointingForPassT = 0;
}

function stopPointingForPass(p){
  if(!p) return;
  p.isPointingForPass = false;
  p.pointingForPassT = 0;
}

function updatePointingForPass(p, dt){
  if(!p?.isPointingForPass) return;
  p.pointingForPassT += dt;
  if(p.pointingForPassT >= POINTING_FOR_PASS_MAX_S) stopPointingForPass(p);
}

function lockManualRunDirection(p, vector){
  if(!p || !vector) return;
  const firstLock = !p.hasRunDirectionLocked;
  p.lockedRunVector = vector;
  p.hasRunDirectionLocked = true;
  if(firstLock) startPointingForPass(p);
}

function normalizeAngleDiff(a){
  while(a > Math.PI) a -= Math.PI * 2;
  while(a < -Math.PI) a += Math.PI * 2;
  return a;
}

function computePassPointHeadYaw(p){
  let tx, ty;
  const carrier = ball.owner && ball.owner.team === p.team && ball.owner !== p ? ball.owner : null;
  if(carrier){
    tx = carrier.x - p.x;
    ty = carrier.y - p.y;
  } else {
    tx = p.oppGoalX() - p.x;
    ty = CENTER.y - p.y;
  }
  const lookWorld = Math.atan2(ty, tx);
  return clamp(normalizeAngleDiff(lookWorld - p.facing) * 0.62, -0.72, 0.72);
}

function applyPassPointArmOverlay(p, armA, armB){
  if(!p.isPointingForPass || !p.lockedRunVector) return {armA, armB, headYaw: 0, pointLeft: false};
  const runWorld = Math.atan2(p.lockedRunVector.y, p.lockedRunVector.x);
  const rel = normalizeAngleDiff(runWorld - p.facing);
  const pointShoulder = clamp(-rel * 0.95, -1.15, 1.15);
  const pointArm = {shoulder: pointShoulder, elbow: 0.12};
  const headYaw = computePassPointHeadYaw(p);
  if(rel <= 0) return {armA: pointArm, armB, headYaw, pointLeft: true};
  return {armA, armB: pointArm, headYaw, pointLeft: false};
}

function tickManualRunGrace(p, dt){
  if(!p.wallRun || p.wallRun.graceT <= 0) return;
  p.wallRun.graceT = Math.max(0, p.wallRun.graceT - dt);
  if(p.wallRun.graceT <= 0 && p.wallRun.shortStart){
    stopPointingForPass(p);
    p.hasRunDirectionLocked = false;
    p.lockedRunVector = null;
  }
}

function beginManualRunCore(p, opts){
  const partner = opts.partner || null;
  const dist = partner ? dist2D(p, partner) : Infinity;
  const shortStart = dist < MANUAL_RUN_SHORT_DIST_THRESHOLD;
  const fwd = shortStart
    ? getForwardRunDirection(p)
    : (opts.initialDir ? norm(opts.initialDir) : getOffensiveRunDirection(p));

  p.wallRun = {
    active: true,
    dir: fwd,
    timer: WALLRUN_MAX_DURATION,
    partnerId: partner ? partner.id : null,
    shortStart,
    graceT: shortStart ? MANUAL_RUN_SHORT_GRACE_TIME : 0,
  };
  p.isMakingManualRun = true;
  if(shortStart){
    lockManualRunDirection(p, getForwardRunDirection(p));
  } else {
    p.hasRunDirectionLocked = false;
    p.lockedRunVector = null;
  }
  p.defaultForwardVector = shortStart ? null : fwd;
  p.directionListenTimer = shortStart ? 0 : (opts.useListenTimer ? MANUAL_RUN_LISTEN_T : 0);
  p.manualRunPadIndex = opts.padIndex != null ? opts.padIndex : null;
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
  beginManualRunCore(p, {partner: carrier, padIndex, useListenTimer: true});
}

function tryTriggerRemoteManualRun(carrier, stickDir, padIndex){
  if(!carrier || getActiveWallRunner(carrier.team)) return false;
  const mate = findTeammateForRemoteRun(carrier, stickDir);
  if(!mate) return false;
  startRemoteManualRun(mate, padIndex, carrier);
  return true;
}

function startManualRun(p, initialDir, partner){
  beginManualRunCore(p, {initialDir, partner, useListenTimer: false});
}

function resetManualRunState(p){
  if(!p) return;
  stopPointingForPass(p);
  p.isMakingManualRun = false;
  p.hasRunDirectionLocked = false;
  p.lockedRunVector = null;
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

function handleRightStickSwitch(dt, team, padIndex){
  if(gameState==='practice') return; // en la Arena de Practica hay un solo jugador util: no tiene sentido cambiar de cursor
  const st = rsState[team];
  if(st.lockout>0) st.lockout -= dt;
  const pad = getPadAt(padIndex);
  if(!pad){ st.prevMag = 0; return; }
  const rxRaw = pad.axes[2]||0, ryRaw = pad.axes[3]||0;
  const rx = Math.abs(rxRaw)<RS_DEAD? 0 : rxRaw;
  const ry = Math.abs(ryRaw)<RS_DEAD? 0 : ryRaw;
  const mag = Math.hypot(rx, ry);

  // Desmarque manual (L1+X): la direccion se captura una sola vez en updateWallRun.
  // No interceptar el stick derecho mientras corre, para que quede libre al Effort Touch.
  if(getActiveWallRunner(team)){
    st.prevMag = mag;
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
  const isHome = team==='home';
  const cur = isHome ? controlledPlayer() : controlledPlayer2();
  if(!cur || isPlayerAssignmentLocked(cur)) return;
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
  if(isPaused || Game.paused){
    return {
      move:{x:0,y:0}, sprint:false, jockey:false,
      pressPass:false, pressShot:false, pressThrough:false, pressCross:false,
      pressSwitch:false, pressTackle:false, pressTackleAlt:false, pressSlide:false,
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
  let releasedPass=false, releasedShot=false, releasedThrough=false, releasedCross=false;
  let heldPass=false, heldShot=false, heldThrough=false, heldCross=false, heldL1=false, heldR1=false, heldL2=false, heldR2=false;
  let pressSuperCancel = false;
  let heldManualCancel = false;

  if(pad){
    const lx = axisOrZero(pad.axes[0]||0), ly = axisOrZero(pad.axes[1]||0);
    move.x = lx; move.y = -ly;
    sprint = (pad.buttons[7] && pad.buttons[7].value>0.15); // R2
    jockey = (pad.buttons[6] && pad.buttons[6].value>0.15); // L2
    heldL2 = jockey;
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
    heldL1 = !!now[4]; // L1 sostenido (para el combo de "la pared": L1 + pase)
    heldR1 = !!now[5]; // R1 sostenido: efecto hacia la izquierda al patear ("colocado")
    // ▢ Cuadrado = entrada de pie (sin pelota) · ○ Circulo = barrida (sin pelota) · R1 = entrada (alternativo)
    // separado en dos flags: pressTackle (boton dedicado, R1) vs pressTackleAlt (▢, que tambien sirve
    // para tiro/volea con pelota) para poder frenar el tacle accidental cuando en realidad se estaba
    // intentando un tiro de primera/volea que no llego a conectar por poco (ver mas abajo)
    pressTackle = !!justPressed[5];
    pressTackleAlt = !!justPressed[2];
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
    heldL1 = anyKey(scheme.switch); // en teclado, la tecla de "cambiar jugador" hace de L1 para el combo
    pressTackle = anyKey(scheme.tackle) && !anyKeyPrev(scheme.tackle);
    pressSlide = anyKey(scheme.slide) && !anyKeyPrev(scheme.slide);
    heldR1 = anyKey(scheme.curveLeft);   // equivalente de R1: efecto hacia la izquierda
    heldL2 = anyKey(scheme.curveRight);  // equivalente de L2: efecto hacia la derecha
    heldR2 = sprint; // Shift = R2
    heldManualCancel = heldL2 && heldR2; // teclado: P + Shift = Full Manual Cancel
    const l2JustKb = heldL2 && !anyKeyPrev(scheme.curveRight);
    const sprintJustKb = sprint && !anyKeyPrev(scheme.sprint);
    pressSuperCancel = detectSyncTriggerPress(padKey+'_triggers', l2JustKb, sprintJustKb);
  }
  return {move, sprint, jockey, pressPass, pressShot, pressThrough, pressCross, pressSwitch, pressTackle, pressTackleAlt, pressSlide,
          releasedPass, releasedShot, releasedThrough, releasedCross,
          heldPass, heldShot, heldThrough, heldCross, heldL1, heldR1, heldL2, heldR2, heldManualCancel, pressSuperCancel};
}
let prevKeys = {};
function snapshotKeys(){ prevKeys = Object.assign({}, Keys); }

// la Arena de Practica usa una camara ROTADA respecto a la de partido (ver projectPractice):
// alli la "profundidad" (adelante/atras, lo que en partido es el eje Y) pasa a ser el eje X, y el
// paneo horizontal en pantalla (lo que en partido es el eje X) pasa a ser el eje Y. El input del
// stick/teclado siempre llega en los mismos ejes de PANTALLA (arriba/abajo, izq/derecha); para que
// "adelante" siga moviendo al jugador hacia el arco (y no de costado) hay que rotar ese vector de
// entrada 90° antes de usarlo como moveDir de mundo. Sin este ajuste, en la Arena de Practica el
// stick queda con los ejes cruzados (adelante mueve de costado, costado mueve adelante/atras).
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
// Potencia 0..1 segun cuanto tiempo lleva sostenido el boton (NO se acumula por frame con +=).
function chargePowerFromElapsed(elapsedMs){
  return clamp(elapsedMs / CHARGE_MAX_MS, 0, 1);
}
export function chargeLevel(p){
  if(p.pendingKick) return p.pendingKick.power;
  if(p.pendingAction){
    if(p.isPowerLocked) return p.pendingAction.power;
    if(p.pendingAction.chargeStart) return chargePowerFromElapsed(performance.now() - p.pendingAction.chargeStart);
    return p.pendingAction.power;
  }
  if(!p.isChargingShot && !p.charging) return 0;
  if(!p.charging) return 0;
  if(!p.chargeStart) return 0;
  return chargePowerFromElapsed(performance.now() - p.chargeStart);
}
function syncGlobalChargingShot(p){
  Game.isChargingShot = !!(p && p.isChargingShot);
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
  return !!(p.charging || p.pendingKick || p.isChargingShot || p.pendingAction);
}
// Carga / suelta de tiro (Cuadrado). El amague tecnico (fake shot) vive en InputManager.
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

  if(input.pressSuperCancel && (p.charging || p.pendingKick)){
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

  if(input.heldShot){
    if(!p.isChargingShot && !p.charging && !p.pendingKick){
      p.isChargingShot = true;
      startCharge(p, 'shot');
    } else if(!p.isChargingShot && p.charging === 'shot'){
      p.isChargingShot = true;
    }
  }

  if(input.releasedShot && (p.isChargingShot || p.charging === 'shot')){
    if(isFakeShotInputBlocked(p) || isShotFeintBlocked(p) || isFakeShotActive){
      clearChargingShotState(p);
      syncGlobalChargingShot(p);
      return true;
    }
    releaseCharge(p, aimDir, curve);
    p.isChargingShot = false;
    syncGlobalChargingShot(p);
    return false;
  }

  syncGlobalChargingShot(p);
  return false;
}
function startCharge(p, type){
  if(isFakeShotInputBlocked(p)) return;
  if(p && isPassBlockedAfterFakeShot(p) && type !== 'shot') return;
  if(isSetPieceShotOnly(p) && type !== 'shot') return;
  if(ball.owner!==p) return;
  interruptForcedChaseForAction(p);
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
  const power = clamp(chargePowerFromElapsed(elapsed), 0.14, 1);
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

  const remainingMs = PREP_MIN_MS - elapsed;
  if(remainingMs > 0){
    p.pendingKick = { type, aimDir: norm(aimDir), power, curve, remaining: remainingMs/1000 };
  } else {
    executeKick(p, type, aimDir, power, curve);
  }
}
// Carga al mantener, suelta al soltar — un solo tipo de accion a la vez; el golpe nunca sale en el frame de press.
function handleBallOwnerKicks(p, input, team, aimDir, curve){
  if(isFakeShotInputBlocked(p)) return;
  if(p.pendingKick) return;
  if(isShotFeintBlocked(p)) return;
  if(isPassBlockedAfterFakeShot(p) && (input.releasedPass || input.releasedThrough || input.releasedCross || (input.heldPass && !p.charging) || (input.heldThrough && !p.charging) || (input.heldCross && !p.charging))) return;

  // Boton X (Pase Corto): intercepcion Fake Shot — aborta carga y se traga el input (no pase corto)
  if(input.pressPass && canCancelChargeWithFakeShot(p)){
    executeFakeShot(p, input.move);
    return;
  }

  // Tiro: carga via handleShotChargeInput (isChargingShot); X ya interceptada arriba
  if(p.isChargingShot) return;

  if(input.releasedPass){
    if(p.charging === 'wallpass') releaseWallPass(p, team, aimDir, curve);
    else if(p.charging === 'pass') releaseCharge(p, aimDir, curve);
  } else if(input.heldPass && !p.charging){
    startCharge(p, input.heldL1 ? 'wallpass' : 'pass');
  }

  if(input.releasedThrough && p.charging === 'through'){
    releaseCharge(p, aimDir, curve);
  } else if(input.heldThrough && !p.charging){
    startCharge(p, 'through');
  }

  if(input.releasedCross && p.charging === 'cross'){
    releaseCharge(p, aimDir, curve);
  } else if(input.heldCross && !p.charging){
    startCharge(p, 'cross');
  }
}
// cancela cualquier PREPARANDO_ACCION en curso (cargando o en windup) sin pegarle a la pelota;
// el balon se queda pegado al pie y el jugador recupera el control total de carrera de inmediato
function cancelAction(p){
  clearChargingShotState(p);
  clearPendingAction(p);
  p.pendingKick = null;
  if(p?.isPointingForPass) stopPointingForPass(p);
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
  if(!p.pendingAction && d < getPostTouchRecoverDist(p) && p.releaseCooldown <= 0 && !isPossessionIgnored()){
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
  if(!p.pendingAction && d < recoverDist && p.releaseCooldown <= 0 && !isPossessionIgnored()){
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

// Effort touch unificado: autopase direccionado + STATE_SPRINT_CHASE (R1 corto / R2 largo).
function triggerEffort(p, power, stickDir, type){
  if(ball.owner !== p || isGkHandsPossession(p)) return false;

  const dir = resolveSelfTouchDirection(stickDir, p);
  const targetDist = type === 'short' ? DRIBBLE_DIST_R1 : DRIBBLE_DIST_R2;

  p.facing = Math.atan2(dir.y, dir.x);
  p.lastAim = dir;
  syncPlayerDir(p);

  applyEffortTouchDefenderFreeze(p, targetDist, dir);
  executeKick(p, 'pass', dir, power, 0);
  ball.possessedBy = p.id;
  enterSprintChaseState(p);

  p.isEffortTouching = true;
  syncTechnicallyBusy(p);
  p.effortTouchCooldown = EFFORT_TOUCH_COOLDOWN;
  p.touchCooldown = 0.12;

  const animDur = type === 'short' ? EFFORT_TOUCH_ANIM_SHORT : EFFORT_TOUCH_ANIM_LONG;
  const legLead = Math.sin(p.animPhase) >= 0 ? 1 : -1;
  p.effortTouchAnim = {t:0, dur: animDur, leg:legLead, type: type === 'short' ? 'short' : 'long'};
  p.touchAnim = null;
  return true;
}

function effortTouch(p, dir, type){
  if(!p || p.effortTouchCooldown > 0 || !canApplyEffortTouch(p)) return false;
  if(ball.owner !== p) return false;

  clearTeammateInterferenceForTechnicalAction(p);
  const stickDir = resolveSelfTouchDirection(dir, p);
  const targetDist = type === 'short' ? DRIBBLE_DIST_R1 : DRIBBLE_DIST_R2;
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
        startManualRun(p, dir, mate);
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
function executeKick(p, type, aimDir, power, curve){
  if(isGoalkeeper(p)) clearGkPossessionType(p);
  clearEffortSprintState(p);
  p.isPowerLocked = false;
  p.pendingAction = null;
  p.isPreparingToShoot = false;
  const dir = norm(aimDir);
  setBallStateLoose(true);
  ball.lastTouchTeam = p.team;
  ball.lastTouchedBy = p.id;
  clearThrowInBlockIfOtherPlayer(p);
  ball.lastKicker = p;
  // solo un PASE limpio arranca el seguimiento de "pase corto" (para no robar el cursor de inmediato);
  // tiros/centros/filtrados no lo necesitan, se limpia para no arrastrar datos de un pase anterior
  ball.passOrigin = (type==='pass') ? {x:p.x, y:p.y} : null;
  ball.highKick = (type==='shot' || type==='cross'); // fisica aerea extra solo para tiros y centros
  ball.highKickType = ball.highKick ? type : null;
  const speedTable = {
    pass:    {min:10,  max:42, vz:2},
    shot:    {min:18, max:60, vz:7},
    through: {min:20, max:54, vz:2},
    cross:   {min:11, max:40, vz:11},
  };
  const cfg = speedTable[type];
  const shotStyle = type==='shot' ? resolveShotStyle(curve) : null;
  let speedMult = KICK_VELOCITY_MULT;
  if(type === 'shot'){
    speedMult *= SHOT_VELOCITY_MULT;
    if(shotStyle==='placed') speedMult *= SHOT_PLACED_SPEED_MULT;
    else if(shotStyle==='trivela') speedMult *= SHOT_TRIVELA_SPEED_MULT;
  } else {
    speedMult *= PASS_VELOCITY_MULT; // pass, through, cross
  }
  const spd = lerp(cfg.min, cfg.max, power) * speedMult;
  const curvePhys = applyKickCurvePhysics(p, type, dir, curve);
  ball.curveFactor = curvePhys.curveFactor;
  ball.groundFrictionMult = curvePhys.groundFrictionMult;
  ball.x = p.x + dir.x*0.9; ball.y = p.y + dir.y*0.9; ball.z = 0.35;
  ball.vx = dir.x*spd; ball.vy = dir.y*spd;
  ball.initialSpeed = Math.hypot(ball.vx, ball.vy);
  ball.vz = (cfg.vz * power) * 1.8 + (type === 'shot' ? 1.2 : 0.8);
  p.tackleCooldown = 0.25;
  p.releaseCooldown = 0.55; // evita que el mismo jugador recupere la pelota al instante

  // EL LATIGAZO: se dispara en el MISMO frame en que la pelota recibe el impulso real (arriba),
  // asi el impacto visual (pantorrilla+pie extendiendose en punta) queda 100% sincronizado con el
  // instante en que la pelota efectivamente sale disparada, no con un frame arbitrario despues.
  // 'leg:1' es siempre la pierna que quedo cargada hacia atras durante el windup (ver drawSkeletalPlayer,
  // misma convencion que ya usaba prepping/legSwing para la pierna A). Los tiros son mas explosivos
  // (mas recorrido, mas inclinacion de torso) que pases/centros/filtrados, que igual se benefician
  // del latigazo pero mas contenido.
  p.kickAnim = { t:0, dur: type==='shot' ? 0.22 : 0.17, leg:1, power, type };

  // --- cruz amarilla que marca donde va a picar el centro (boton circulo/○) ---
  if(type==='cross'){
    const landing = estimateKickTarget();
    Game.crossMarker = {x: landing.x, y: landing.y, t: CROSS_MARKER_LIFE};
  }

  // --- CAMBIO DE CURSOR EN EL MOMENTO EXACTO DEL IMPACTO, segun la barra de potencia ---
  handleKickCursorSwitch(p, power, dir, type);
  assignPassTargetFromKick(p, dir, type, power);
  setupCurvePassTracking(p, type, dir, curve, ball.initialSpeed);
  if(Game.setPieceMode) onSetPieceBallReleased();
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
  const force = (anim.type === 'dropkick' ? GK_DROP_KICK_FORCE : GK_THROW_FORCE) * powerMult;
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

function triggerGoalkeeperKick(p, kickType, aimDir){
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
  p.gkKickAnim = {type: kickType, t: 0, dur: GK_KICK_ANIM_DUR, dir, impulseApplied: false};
  p.charging = null;
  p.pendingKick = null;
  return true;
}

function handleGoalkeeperKick(p, input, aimDir){
  if(isGoalKickReadyState()) return false;
  if(!isGkHandsPossession(p) || p.gkKickAnim) return false;

  let kickType = null;
  if(input.pressCross) kickType = 'dropkick';
  else if(input.pressPass) kickType = 'throw';
  else return false;

  return triggerGoalkeeperKick(p, kickType, aimDir);
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
  const aero = b.highKick ? AERIAL_PHYSICS[b.highKickType] : null;
  const g = GRAVITY + (aero ? aero.extraGravity : 0);
  let x=b.x, y=b.y, z=b.z, vx=b.vx, vy=b.vy, vz=b.vz;
  const cf = b.curveFactor||0;
  const initSpd = Math.hypot(vx, vy) || b.initialSpeed || 1;
  const STEP = 0.02;
  let t = 0;
  const startedAerial = z > BALL_AERIAL_MIN_Z;
  while(t < 4.0){
    if(aero && z > BALL_RADIUS){
      const dragCoef = AIR_DRAG + aero.extraDrag;
      const drag = 1/(1+dragCoef*STEP);
      vx *= drag; vy *= drag;
      const airSp = Math.hypot(vx, vy);
      if(airSp > aero.maxSpeed){ const s=aero.maxSpeed/airSp; vx*=s; vy*=s; }
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
   BUFFER UNIVERSAL DE ACCION + ACCIONES AÉREAS (cabezazo, volea, chilena)
   ============================================================ */
function resetActionBuffer(p){
  if(!p) return;
  p.pendingAction = null;
  p.isPreparingToShoot = false;
  p.isPowerLocked = false;
}

function clearPendingAction(p){
  resetActionBuffer(p);
}

function hasPendingAction(p){
  return !!p.pendingAction;
}

function isBallAtPlayerFeet(p){
  return ball.owner === p && ball.state === BALL_STATE.IN_POSSESSION;
}

function isBallLooseForPendingAction(){
  return ball.owner === null;
}

function canBufferPendingAction(p){
  if(!p || p.role === 'GK') return false;
  if(isBallAtPlayerFeet(p)) return false;
  if(ball.owner && ball.owner.team !== p.team) return false;
  if(dist2D(p, ball) < AIR_BUFFER_RADIUS) return true;
  if(isPlayerChasing(p) || isChaseOwner(p) || isPlayerSprintChasing(p)) return true;
  if(p.iaSeeking) return true;
  if(isPassTargetPlayer(p, p.team)) return true;
  return false;
}

function canChargePendingAction(p){
  return canBufferPendingAction(p);
}

function lockPendingActionBuffer(p, power){
  if(!p || !p.pendingAction) return;
  p.pendingAction.power = clamp(power, 0.14, 1);
  p.pendingAction.timestamp = performance.now();
  p.isPowerLocked = true;
}

function startPendingActionCharge(p, btn, input){
  const curve = resolveInputCurve(input);
  const now = performance.now();
  const manualL2 = !!(input.heldL2 && btn.kickType === 'shot');
  p.pendingAction = {
    type: btn.type,
    kickType: btn.kickType,
    power: 0,
    timestamp: now,
    chargeStart: now,
    curve,
    manualL2,
  };
  p.isPreparingToShoot = btn.kickType === 'shot';
}

function armPendingFirstTimeAction(p, btn, input){
  if(p.isPowerLocked) return false;
  startPendingActionCharge(p, btn, input);
  return true;
}

function heldPendingActionButton(input){
  if(input.heldShot) return {type:'shoot', kickType:'shot'};
  if(input.heldThrough) return {type:'pass', kickType:'through'};
  if(input.heldCross) return {type:'pass', kickType:'cross'};
  if(input.heldPass) return {type:'pass', kickType:'pass'};
  return null;
}

function releasedPendingActionButton(input){
  if(input.releasedShot) return {type:'shoot', kickType:'shot'};
  if(input.releasedThrough) return {type:'pass', kickType:'through'};
  if(input.releasedCross) return {type:'pass', kickType:'cross'};
  if(input.releasedPass) return {type:'pass', kickType:'pass'};
  return null;
}

// Pelota suelta: botones ofensivos entran al buffer (nunca ejecutan al instante sin la pelota).
function tryLooseBallOffensiveInput(p, input){
  if(!canBufferPendingAction(p)) return false;
  if(p.isPowerLocked) return false;
  if(p.charging || p.isChargingShot || p.tackleAnim || p.diveAnim || p.airStrikeAnim) return false;

  if(input.pressTackle){
    return armPendingFirstTimeAction(p, {type:'pass', kickType:'pass'}, input);
  }
  if(input.pressTackleAlt || input.pressShot){
    return armPendingFirstTimeAction(p, {type:'shoot', kickType:'shot'}, input);
  }
  if(input.pressPass){
    return armPendingFirstTimeAction(p, {type:'pass', kickType:'pass'}, input);
  }
  if(input.pressThrough){
    return armPendingFirstTimeAction(p, {type:'pass', kickType:'through'}, input);
  }
  if(input.pressCross){
    return armPendingFirstTimeAction(p, {type:'pass', kickType:'cross'}, input);
  }
  return false;
}

function pendingActionToAerialButton(kickType){
  if(kickType === 'shot') return 'shot';
  if(kickType === 'cross') return 'cross';
  return 'pass';
}

// Carga mientras se mantiene el boton; al soltar congela potencia (single charge lock).
function updatePendingActionInput(p, input){
  if(isBallAtPlayerFeet(p)) return;
  if(p.isChargingShot || isShotFeintBlocked(p)) return;

  if(ball.owner && ball.owner.team !== p.team){
    resetActionBuffer(p);
    return;
  }

  if(input.heldManualCancel){
    resetActionBuffer(p);
    return;
  }

  const curve = resolveInputCurve(input);
  const btnHeld = heldPendingActionButton(input);
  const btnReleased = releasedPendingActionButton(input);

  if(btnReleased && canBufferPendingAction(p) && !p.isPowerLocked){
    const btn = btnReleased;
    const manualL2 = !!(input.heldL2 && btn.kickType === 'shot');
    if(!p.pendingAction || p.pendingAction.kickType !== btn.kickType){
      startPendingActionCharge(p, btn, input);
    } else {
      p.pendingAction.curve = curve;
      p.pendingAction.manualL2 = manualL2;
    }
    const power = chargePowerFromElapsed(performance.now() - p.pendingAction.chargeStart);
    lockPendingActionBuffer(p, power);
    return;
  }

  if(btnHeld && canBufferPendingAction(p) && !p.isPowerLocked){
    const now = performance.now();
    const manualL2 = !!(input.heldL2 && btnHeld.kickType === 'shot');
    if(!p.pendingAction || p.pendingAction.kickType !== btnHeld.kickType){
      startPendingActionCharge(p, btnHeld, input);
    } else {
      p.pendingAction.curve = curve;
      p.pendingAction.manualL2 = manualL2;
    }
    p.pendingAction.power = chargePowerFromElapsed(now - p.pendingAction.chargeStart);
    p.pendingAction.timestamp = now;
    p.isPreparingToShoot = btnHeld.kickType === 'shot';
    if(p.pendingAction.power >= 1) lockPendingActionBuffer(p, 1);
  }
}

function executeBufferedPendingAction(p){
  const pa = p.pendingAction;
  if(!pa) return false;
  const wasChasing = isPlayerChasing(p) || isChaseOwner(p);
  const power = clamp(pa.power > 0 ? pa.power : 0.72, 0.14, 1);
  const curve = pa.curve || 0;
  const kickType = pa.kickType;
  resetActionBuffer(p);

  if(ball.z > AIR_AERIAL_MIN_Z){
    const aerialBtn = pendingActionToAerialButton(kickType);
    const manualL2 = !!(pa.manualL2 && kickType === 'shot');
    if(handleAerialContact(p, ball, aerialBtn, power, curve, manualL2)){
      if(wasChasing) resumeChasingAfterAction(p);
      return true;
    }
    return false;
  }

  const dir = norm(getStickDir(p));
  if(!ball.owner){
    ball.x = p.x + dir.x * 0.6;
    ball.y = p.y + dir.y * 0.6;
    ball.z = 0;
  }
  executeKick(p, kickType, dir, power, curve);
  if(wasChasing) resumeChasingAfterAction(p);
  return true;
}

function tryExecuteBufferedActionOnPossession(p){
  if(!p.pendingAction || !p.isPowerLocked) return false;
  return executeBufferedPendingAction(p);
}

function executePendingActionAtContact(p){
  return executeBufferedPendingAction(p);
}

// Loop de fisica: ejecuta al contacto o limpia por timeout / robo rival.
function updatePendingActionPhysics(p, dt){
  if(!p.pendingAction) return;

  if(ball.owner && ball.owner !== p && ball.owner.team !== p.team){
    resetActionBuffer(p);
    return;
  }

  if(isAirDuelContestant(p)) return;

  if(!p.isPowerLocked) return;

  const d = dist2D(p, ball);
  if(d < PENDING_ACTION_EXECUTE_RADIUS && !ball.owner){
    executePendingActionAtContact(p);
    return;
  }

  const elapsed = performance.now() - p.pendingAction.timestamp;
  if(elapsed > PENDING_ACTION_TIMEOUT_MS){
    resetActionBuffer(p);
  }
}

function canAerialContact(p){
  if(isThrowInTakerBlocked(p)) return false;
  const radius = p.pendingAction ? PENDING_ACTION_EXECUTE_RADIUS : AIR_CONTACT_RADIUS;
  const loose = !ball.owner && (ball.state === BALL_STATE.FREE || ball.state === BALL_STATE.LOOSE_BALL || ball.state === BALL_STATE.IN_AIR);
  return loose && ball.z > AIR_AERIAL_MIN_Z && dist2D(p, ball) < radius;
}

function isBallAerialLoose(){
  return !ball.owner && ball.z > AIR_AERIAL_MIN_Z;
}

// Predice cabezazo / volea / chilena para posicionamiento segun input (L2 = manual arriesgado).
function predictAerialStrikeType(p, ball, manualL2){
  if(ball.z <= AIR_AERIAL_MIN_Z) return null;
  const z = ball.z;
  const useManual = !!manualL2;
  if(useManual){
    if(z > AIR_BICYCLE_MIN_Z) return {type:'bicycle'};
    if(z > AIR_VOLLEY_L2_MIN_Z && z <= AIR_VOLLEY_L2_MAX_Z) return {type:'volley'};
    if(z > AIR_VOLLEY_MIN_Z && z <= AIR_VOLLEY_L2_MIN_Z) return {type:'volley'};
    return null;
  }
  if(z >= AIR_HEADER_MIN_Z && z <= AIR_HEADER_MAX_Z) return {type:'header'};
  if(z > AIR_VOLLEY_MIN_Z && z < AIR_VOLLEY_MAX_Z) return {type:'volley'};
  if(z > AIR_BICYCLE_MIN_Z) return {type:'bicycle'};
  return null;
}

function getPendingManualL2(p){
  return !!(p.pendingAction && p.pendingAction.kickType === 'shot' && p.pendingAction.manualL2);
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

function updateAerialStrikeMovement(p, dt){
  if(isManualAction(p)) return;
  const target = getAerialPositionTarget(p, ball);
  moveTowardSeekTarget(p, dt, target, dist2D(p, ball) > 3.5);
}

// Posicionamiento aereo durante buffer (solo fuera de chasing manual; chasing unifica movimiento abajo).
function handlePendingActionMovement(p, dt, input){
  if(isPlayerForcedChasing(p)) return false;
  if(isManualAction(p) && isBallFreeForPlayer(p)) return false;
  if(ensureChasingState(p) && isBallFreeForPlayer(p)) return false;
  if(isAirDuelContestant(p)){
    updateAerialStrikeMovement(p, dt);
    return true;
  }
  if(p.pendingAction && isBallAerialLoose()){
    updateAerialStrikeMovement(p, dt);
    return true;
  }
  return false;
}

function syncStickDir(p, moveInput){
  if(moveInput && Math.hypot(moveInput.x, moveInput.y) > 0.05){
    p.stickDir = norm(moveInput);
  } else if(!p.stickDir || Math.hypot(p.stickDir.x, p.stickDir.y) < 0.01){
    p.stickDir = {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  }
  p.lastAim = p.stickDir;
}

function getStickDir(p){
  const s = p.stickDir;
  if(s && Math.hypot(s.x, s.y) > 0.15) return norm(s);
  return {x: Math.cos(p.facing), y: Math.sin(p.facing)};
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

// Jerarquia: remate sin L2 en altura de cabeza = cabezazo obligatorio.
// L2+remate: z>2 chilena · 1<z<=2 volea. Pase/centro siguen la altura natural.
function resolveAerialStrikeType(p, ball, manualL2, actionButton){
  if(ball.z <= AIR_AERIAL_MIN_Z) return null;
  const d = dist2D(p, ball);
  const radius = p.pendingAction ? PENDING_ACTION_EXECUTE_RADIUS : AIR_CONTACT_RADIUS;
  if(d >= radius) return null;

  const z = ball.z;
  const isShot = actionButton === 'shot';
  const useManual = isShot && !!manualL2;

  if(useManual){
    if(z > AIR_BICYCLE_MIN_Z){
      if(d < AIR_BICYCLE_CONTACT_RADIUS) return {type:'bicycle', cfg: AIR_STRIKE_TABLE.bicycle, manual:true};
      return null;
    }
    if(z > AIR_VOLLEY_L2_MIN_Z && z <= AIR_VOLLEY_L2_MAX_Z){
      return {type:'volley', cfg: AIR_STRIKE_TABLE.volley, manual:true};
    }
    if(z > AIR_VOLLEY_MIN_Z && z <= AIR_VOLLEY_L2_MIN_Z){
      return {type:'volley', cfg: AIR_STRIKE_TABLE.volley, manual:true};
    }
    return null;
  }

  // Remate sin L2 en altura de cabeza: cabezazo forzado (accion segura por defecto).
  if(isShot && z >= AIR_HEADER_MIN_Z && z <= AIR_HEADER_MAX_Z){
    return {type:'header', cfg: AIR_STRIKE_TABLE.header, manual:false};
  }
  if(z >= AIR_HEADER_MIN_Z && z <= AIR_HEADER_MAX_Z){
    return {type:'header', cfg: AIR_STRIKE_TABLE.header, manual:false};
  }
  if(z > AIR_VOLLEY_MIN_Z && z < AIR_VOLLEY_MAX_Z){
    return {type:'volley', cfg: AIR_STRIKE_TABLE.volley, manual:false};
  }
  if(z > AIR_BICYCLE_MIN_Z && d < AIR_BICYCLE_CONTACT_RADIUS){
    return {type:'bicycle', cfg: AIR_STRIKE_TABLE.bicycle, manual:false};
  }
  return null;
}

// Direccion de salida: stick manual; en pase se inclina al companero mas cercano al destino.
function resolveAerialDirection(p, ball, actionButton){
  const stick = getStickDir(p);
  if(actionButton === 'pass'){
    const mate = findPassReceiverByIntent(p, stick, p.id);
    if(mate){
      const toMate = norm({x: mate.x - p.x, y: mate.y - p.y});
      return norm({x: stick.x*0.35 + toMate.x*0.65, y: stick.y*0.35 + toMate.y*0.65});
    }
  }
  return stick;
}

// actionButton: 'shot' (Cuadrado) | 'pass' (X/Triangulo) | 'cross' (Circulo)
// manualL2: true si el usuario mantuvo L2 al cargar remate (volea/chilena arriesgada)
function handleAerialContact(p, ball, actionButton, power, curve, manualL2){
  if(p.tackleAnim || p.airStrikeAnim || p.diveAnim) return false;
  if(p.airLock && p.airLock.t < p.airLock.dur) return false;
  if(ball.owner) return false;
  if(!canAerialContact(p)) return false;
  if(actionButton !== 'shot' && actionButton !== 'pass' && actionButton !== 'cross') return false;

  const mods = AIR_ACTION_MODS[actionButton];
  const aimDir = resolveAerialDirection(p, ball, actionButton);
  const contact = resolveAerialStrikeType(p, ball, manualL2, actionButton);
  if(!contact) return false;

  p.charging = null;
  clearPendingAction(p);

  const cfg = contact.cfg;
  const pwr = clamp(power ?? 0.72, mods.powerMin, mods.powerMax);
  const ang = Math.atan2(aimDir.y, aimDir.x) + (Math.random()-0.5)*cfg.spread*mods.spreadMult;
  const fdir = {x: Math.cos(ang), y: Math.sin(ang)};
  const spd = lerp(cfg.minSpeed, cfg.maxSpeed, pwr) * mods.speedMult;
  const vz = cfg.vz * mods.vzMult * (0.75 + pwr*0.35);

  setBallStateLoose(true);
  ball.lastTouchTeam = p.team;
  ball.lastTouchedBy = p.id;
  clearThrowInBlockIfOtherPlayer(p);
  ball.lastKicker = p;
  ball.passOrigin = actionButton === 'pass' ? {x: p.x, y: p.y} : null;
  ball.highKick = actionButton === 'cross';
  ball.highKickType = actionButton === 'cross' ? 'cross' : null;
  ball.x = p.x + fdir.x*0.85;
  ball.y = p.y + fdir.y*0.85;
  ball.z = Math.max(ball.z, contact.type==='header' ? 0.85 : contact.type==='bicycle' ? 0.5 : 0.35);
  ball.vx = fdir.x*spd;
  ball.vy = fdir.y*spd;
  ball.initialSpeed = Math.hypot(ball.vx, ball.vy);
  ball.vz = vz;
  const kickType = actionButton === 'cross' ? 'cross' : actionButton === 'shot' ? 'shot' : 'pass';
  const curvePhys = applyKickCurvePhysics(p, kickType, fdir, curve||0);
  ball.curveFactor = curvePhys.curveFactor;
  ball.groundFrictionMult = curvePhys.groundFrictionMult || 1;
  setupCurvePassTracking(p, kickType, fdir, curve || 0, ball.initialSpeed);

  const animDur = Math.max(cfg.dur, AIR_LOCK_DURATION);
  p.airStrikeAnim = {type: contact.type, action: actionButton, t:0, dur: animDur};
  p.airLock = {t:0, dur: AIR_LOCK_DURATION};
  p.tackleCooldown = TACKLE_COOLDOWN * 2.2;
  p.releaseCooldown = 0.5;
  p.facing = ang;
  p.vx = 0;
  p.vy = 0;

  if((actionButton==='pass' || actionButton==='cross') && pwr >= AUTOPASE_POWER_THRESHOLD){
    handleKickCursorSwitch(p, pwr, norm(aimDir), actionButton==='cross' ? 'cross' : 'pass');
  }
  assignPassTargetFromKick(p, norm(aimDir), actionButton==='cross' ? 'cross' : 'pass', pwr);
  return true;
}

function updateAirStrikeAnim(p, dt){
  const a = p.airStrikeAnim;
  if(!a) return;
  a.t += dt;
  if(a.t >= a.dur) p.airStrikeAnim = null;
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
  if(gameState === 'celebration_run') return;

  const isHome = team==='home';
  // al que la tiene, como en cualquier juego de futbol. En DEFENSA el cambio es 100% MANUAL:
  // nunca salta solo a otro jugador — solo cambia con L1 (al mas cercano a la pelota) o con el
  // flick del stick derecho (al jugador mas alineado con esa direccion).
  const now = performance.now();
  const teamOwnsBall = ball.owner && ball.owner.team===team;
  const curHome = controlledPlayer();
  const curAway = controlledPlayer2();
  const lockHome = isPlayerAssignmentLocked(curHome);
  const lockAway = isPlayerAssignmentLocked(curAway);
  if(isHome){
    const holdForWallRun = !!getActiveWallRunner('home');
    if(!holdForWallRun && now > Game.manualOverrideUntil && teamOwnsBall && !isBallLocked() && !lockHome){
      setControlled(ball.owner);
    }
    if(input.pressSwitch && !holdForWallRun && !lockHome){
      // L1: cambia manualmente al jugador mas cercano a la pelota
      Game.manualOverrideUntil = now+250; // evita que el auto-seguimiento del poseedor lo pise en el mismo instante
      setControlled(nearestToBall('home'));
    }
  } else {
    const holdForWallRun2 = !!getActiveWallRunner('away');
    if(!holdForWallRun2 && now > Game.manualOverrideUntil2 && teamOwnsBall && !isBallLocked() && !lockAway){
      setControlled2(ball.owner);
    }
    if(input.pressSwitch && !holdForWallRun2 && !lockAway){
      Game.manualOverrideUntil2 = now+250;
      setControlled2(nearestToBall('away'));
    }
  }

  const p = isHome ? controlledPlayer() : controlledPlayer2();
  if(!p) return;

  if(isPlayerStunned(p) || isPlayerStaggered(p)) return;

  syncStickDir(p, input.move);

  // --- Pelota parada: barra de carga (X / Triangulo / Circulo) + bloqueo de movimiento ---
  if(isSetPieceAwaitingExecution(p)){
    handleSetPiecePowerInput(p, input, p.lastAim);
    updateHumanMovement(p, dt, input, team);
    return;
  }

  // --- Saque lateral en animacion de lanzamiento ---
  if(p.isThrowingIn || p.throwInAnim || ball.state === BALL_STATE.IN_HAND){
    updateHumanMovement(p, dt, input, team);
    return;
  }

  // --- INPUT MANAGER: effort touch / fake shot — prioridad absoluta, fuera de IA ---
  if(InputManager.process(p, input, padIndex, scheme)){
    updateHumanMovement(p, dt, input, team);
    return;
  }

  if(isPlayerStunned(p) || isPlayerStaggered(p)) return;

  // Interrumpir forced_chase si el usuario intenta tiro/pase/centro
  if(isPlayerForcedChasing(p) && userWantsPossessionAction(input)){
    ensurePlayerBallControlForAction(p);
  }

  // Prioridad defensiva: tacle/barrida antes que caminar/trotar; permite encadenar al final de la animacion
  if(tryDefensiveTackleInput(p, input)) return;

  // Pelota suelta: tiro/pase de primera o accion aerea (nunca tacle de pie)
  tryLooseBallOffensiveInput(p, input);

  if(p.tackleAnim || p.airStrikeAnim || p.diveAnim || p.feint || p.dragBack || p.gkKickAnim || p.throwInAnim){
    // mientras dura la entrada/barrida/golpe aereo/estirada del arquero, el recorte del amague
    // de tiro, o la pisada+arrastre del dragback (todas animadas en el loop principal) no hay
    // control manual
    return;
  }
  if(p.airLock && p.airLock.t < p.airLock.dur) return;

  // --- "la pared": el companero que corre lo maneja la IA (ver updateWallRun en el loop principal);
  // aca ya no hace falta nada porque el jugador controlado ahora es el que RECIBE la pelota, no el
  // que corre. (fallback defensivo: si por algun motivo el jugador controlado tuviera una carrera
  // activa, se lo deja correr solo en vez de tomar el input manual)
  if(p.isMakingManualRun && p.wallRun && p.wallRun.active){
    updateWallRun(p, dt);
    return;
  }

  // --- CARGA DE TIRO (Cuadrado); fake shot cancelado via InputManager arriba ---
  if(ball.owner === p){
    if(handleShotChargeInput(p, input, p.lastAim, resolveInputCurve(input))) return;
  } else if(p.isChargingShot){
    clearChargingShotState(p);
    syncGlobalChargingShot(p);
  }

  // --- BUFFER UNIVERSAL + duelos aereos ---
  updatePendingActionInput(p, input);
  if(Game.airDuel?.active && !Game.airDuel.resolved && isAirDuelContestant(p)){
    registerAirSpamPress(p, input, resolveInputCurve(input));
  }
  if(handlePendingActionMovement(p, dt, input)) return;

  updateHumanMovement(p, dt, input, team);

  // --- DRAGBACK (L1+R1 + stick hacia la espalda del jugador): pisa la pelota y la arrastra un poco
  // hacia atras con la suela. Es un skill de CONDUCCION (la pelota nunca se suelta), asi que se
  // resuelve aca arriba, antes de las ramas de tiro/pase/centro de mas abajo, y solo corriendo
  // normal con la pelota — no interrumpe una carga real de tiro/pase que ya este en curso.
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

  // Windup post-soltar de tiro: bloquea acciones nuevas hasta que se resuelva (ver updatePendingKick)
  if(p.pendingKick){
    return;
  }

  const owns = ball.owner===p;
  if(owns && isGoalkeeper(p) && isGkHandsPossession(p) && !isGoalKickReadyState()){
    if(handleGoalkeeperKick(p, input, p.lastAim)) return;
  } else if(owns){
    handleBallOwnerKicks(p, input, team, p.lastAim, resolveInputCurve(input));
  } else if(p.role==='GK'){
    // arquero sin la pelota: △ (through) = salta para las que van por arriba ·
    // ▢ (shot) + direccion del stick = se tira para ese lado
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
}

export { isStandardPad, connectedGamepadIndices, nonStandardGamepadIndices, assignInputSources, updatePadStatus, refreshPadPanel, getPadAt, axisOrZero, anyKey, anyKeyPrev, readRightStick, getActiveWallRunner, calculateForwardVector, findTeammateForRemoteRun, getPlayerRunningSpeed, normalizeRunVector, getForwardRunDirection, getManualRunPartner, getDistToManualRunPartner, shouldIgnoreManualRunPartner, isManualRunInShortGrace, canApplyManualRunStick, startPointingForPass, stopPointingForPass, updatePointingForPass, lockManualRunDirection, normalizeAngleDiff, computePassPointHeadYaw, applyPassPointArmOverlay, tickManualRunGrace, beginManualRunCore, getOffensiveRunDirection, findManualRunOpenSpace, computeManualRunCurvedVector, startRemoteManualRun, tryTriggerRemoteManualRun, startManualRun, resetManualRunState, cancelManualRunForPlayer, cancelManualRunIfBallOwner, cancelManualRunsForTeam, notifyManualRunPossessionChange, syncManualRunWithPossession, readRightStickForManualRun, captureManualRunDirection, resolveManualRunDirection, getManualRunDirection, handleRightStickSwitch, selectPlayerByFlick, padButtons, detectSyncTriggerPress, readInput, snapshotKeys, remapMoveForCamera, chargePowerFromElapsed, syncGlobalChargingShot, clearChargingShotState, isShotFeintBlocked, isPassBlockedAfterFakeShot, isFakeShotInputBlocked, completeFakeShot, updateFakeShotState, canCancelChargeWithFakeShot, handleShotChargeInput, startCharge, releaseCharge, handleBallOwnerKicks, cancelAction, cancelCurrentAction, clampSelfTouchVelocity, calcSelfTouchBurstSpeed, activateSelfTouchCollectBlock, updateSelfTouchCollectBlock, applySelfTouchBrake, applySelfTouchImpulse, beginSelfTouchChase, executeFakeShot, fakeShot, updateForcedChase, updateChasing, resolveSelfTouchDirection, triggerEffort, effortTouch, updatePendingKick, updateFeint, startDragBack, updateDragBack, executeKick, releaseGkBallForKick, applyGkKickImpulse, triggerGoalkeeperKick, handleGoalkeeperKick, updateGkKickAnim, predictBallLanding, estimateKickTarget, nearestTeammateToPoint, findPassReceiverByIntent, handleKickCursorSwitch, resetActionBuffer, clearPendingAction, hasPendingAction, isBallAtPlayerFeet, isBallLooseForPendingAction, canBufferPendingAction, canChargePendingAction, lockPendingActionBuffer, startPendingActionCharge, armPendingFirstTimeAction, heldPendingActionButton, releasedPendingActionButton, tryLooseBallOffensiveInput, pendingActionToAerialButton, updatePendingActionInput, executeBufferedPendingAction, tryExecuteBufferedActionOnPossession, executePendingActionAtContact, updatePendingActionPhysics, canAerialContact, isBallAerialLoose, predictAerialStrikeType, getPendingManualL2, getActiveManualL2, getAerialPositionTarget, updateAerialStrikeMovement, handlePendingActionMovement, syncStickDir, getStickDir, ballApproachDir, resolveAerialStrikeType, resolveAerialDirection, handleAerialContact, updateAirStrikeAnim, updateAirLock, updateHumanControl, Keys, KB_P1_SOLO, KB_P1_SHARED, KB_P2, InputManager, PREP_MIN_MS, PREP_SPEED_FACTOR };

