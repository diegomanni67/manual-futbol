"use strict";

import { GK_AI, GK_ANIM_STATE } from './gameplay_constants.js';
import {
  BALL_RADIUS, BALL_STATE, CENTER, CROSSBAR_Z, GOAL_HALF, GK_INTERCEPTION_RADIUS,
  GK_JUMP_MIN_Z, GK_MAX_REACH_Z, GK_MIN_SHOT_SPEED, GRAVITY, PBOX_D, PBOX_HALFW, ball,
  clamp, dist2D, gameState, getDiveSideAnim, lerp, norm,
} from './state.js';

/** Centro del arco defendido por el arquero. */
function goalMouthCenter(gk){
  return { x: gk.ownGoalX(), y: CENTER.y };
}

function ballSpeed3(b){
  return Math.hypot(b.vx, b.vy, b.vz);
}

function ballHorizSpeed(b){
  return Math.hypot(b.vx, b.vy);
}

/** Punto donde la pelota cruza el plano de la línea de gol (si aplica). */
export function predictGoalMouthCrossing(gk, px, py, pz, vx, vy, vz){
  const goalX = gk.ownGoalX();
  if(Math.abs(vx) < 0.2) return null;
  const t = (goalX - px) / vx;
  if(t <= 0.05 || t > GK_AI.SHOT_HORIZON) return null;

  const iy = py + vy * t;
  const iz = pz + vz * t - 0.5 * GRAVITY * t * t;
  const inMouth = Math.abs(iy - CENTER.y) <= GOAL_HALF + 0.35 &&
    iz >= BALL_RADIUS - 0.05 &&
    iz <= CROSSBAR_Z + 0.25;

  return { y: iy, z: Math.max(BALL_RADIUS, iz), t, inMouth };
}

/**
 * Simula trayectoria y encuentra el punto más cercano al arquero dentro del radio de acción.
 */
export function calculateIntercept(ballVelocity, ballPosition, gk){
  if(!gk || gk.role !== 'GK') return null;

  const vx = ballVelocity?.vx ?? 0;
  const vy = ballVelocity?.vy ?? 0;
  const vz = ballVelocity?.vz ?? 0;
  const px = ballPosition?.x ?? gk.x;
  const py = ballPosition?.y ?? gk.y;
  const pz = ballPosition?.z ?? BALL_RADIUS;

  if(Math.hypot(vx, vy, vz) < 0.35) return null;

  const crossing = predictGoalMouthCrossing(gk, px, py, pz, vx, vy, vz);
  const step = GK_AI.TRAJECTORY_STEP;
  let best = null;

  for(let t = step; t <= GK_AI.SHOT_HORIZON; t += step){
    const ix = px + vx * t;
    const iy = py + vy * t;
    const iz = pz + vz * t - 0.5 * GRAVITY * t * t;
    if(iz < BALL_RADIUS) break;
    if(iz - BALL_RADIUS > GK_MAX_REACH_Z + 0.4) continue;

    const d = Math.hypot(ix - gk.x, iy - gk.y);
    if(!best || d < best.dist){
      best = { t, x: ix, y: iy, z: Math.max(BALL_RADIUS, iz), dist: d };
    }
  }

  const radius = GK_AI.INTERCEPT_RADIUS ?? GK_INTERCEPTION_RADIUS;
  if(!best || best.dist > radius) return null;

  if(crossing?.inMouth){
    best.y = crossing.y;
    best.z = crossing.z;
    best.t = Math.min(best.t, crossing.t);
  }

  const diveSide = getDiveSideAnim(gk, best.y);
  const speed = Math.hypot(vx, vy);
  const response = classifySaveResponse(gk, best, crossing, speed);

  return {
    targetY: best.y,
    predZ: best.z,
    timeToPlane: best.t,
    useCatch: response.save === 'catch',
    saveType: response.save,
    animState: response.animState,
    diveSide,
    saveChance: response.parryChance,
    parryMode: response.parryMode,
    forceCatch: response.forceCatch,
  };
}

/** Clasifica la intervención: blocaje vs despeje según potencia, ángulo y altura. */
export function classifySaveResponse(gk, intercept, crossing, speed){
  const iy = crossing?.y ?? intercept.y;
  const iz = crossing?.z ?? intercept.z;
  const distFromCenter = Math.abs(iy - CENTER.y);
  const goalFrac = distFromCenter / Math.max(GOAL_HALF, 0.01);
  const isCentral = goalFrac < GK_AI.BODY_CENTER_FRAC + 0.12;
  const isWide = goalFrac > GK_AI.WIDE_SHOT_FRAC;
  const isLow = iz <= GK_JUMP_MIN_Z + 0.35;
  const isGround = iz <= BALL_RADIUS + 0.55;
  const isHigh = iz >= GK_AI.HIGH_SHOT_Z;
  const diveSide = getDiveSideAnim(gk, iy);

  // Tiro débil/medio centrado y bajo → blocaje
  if(speed < GK_AI.WEAK_SHOT_SPEED && isCentral && isLow){
    return {
      save: 'catch',
      animState: GK_ANIM_STATE.CATCH,
      parryChance: 0.94,
      parryMode: null,
      forceCatch: true,
    };
  }
  if(speed < GK_AI.HARD_SHOT_SPEED && isCentral && !isHigh && isLow){
    return {
      save: 'catch',
      animState: GK_ANIM_STATE.CATCH,
      parryChance: 0.82,
      parryMode: null,
      forceCatch: false,
    };
  }

  // Tiro rasante lateral → estirada baja
  if(isGround || (isLow && !isCentral)){
    return {
      save: 'dive',
      animState: GK_ANIM_STATE.LOW_DIVE,
      parryChance: isWide ? GK_AI.CORNER_DIVE_SUCCESS : 0.48,
      parryMode: isWide ? 'corner' : 'wide',
      forceCatch: false,
    };
  }

  // Tiro alto → salto o despeje
  if(isHigh){
    return {
      save: 'dive',
      animState: GK_ANIM_STATE.JUMP,
      parryChance: speed >= GK_AI.HARD_SHOT_SPEED ? 0.30 : 0.42,
      parryMode: 'corner',
      forceCatch: false,
    };
  }

  // Potente o muy angulado → despeje al córner/lateral
  if(speed >= GK_AI.HARD_SHOT_SPEED || isWide){
    return {
      save: 'dive',
      animState: diveSide,
      parryChance: GK_AI.CORNER_DIVE_SUCCESS,
      parryMode: 'corner',
      forceCatch: false,
    };
  }

  return {
    save: 'dive',
    animState: diveSide,
    parryChance: GK_AI.FIXED_SAVE_CHANCE,
    parryMode: 'wide',
    forceCatch: false,
  };
}

/**
 * Posicionamiento inteligente: triángulo arco-centro ↔ pelota + sesgo hacia cruce en el arco.
 */
export function computeTrianglePosition(gk, b){
  const gc = goalMouthCenter(gk);
  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();

  let aimX = b.x;
  let aimY = b.y;

  const crossing = predictGoalMouthCrossing(gk, b.x, b.y, b.z, b.vx, b.vy, b.vz);
  if(crossing?.inMouth && isShotMovingTowardGoal(b, gk)){
    aimX = goalX + dir * 0.15;
    aimY = crossing.y;
  }

  const toX = aimX - gc.x;
  const toY = aimY - gc.y;
  const dist = Math.hypot(toX, toY) || 0.001;
  const ux = toX / dist;
  const uy = toY / dist;

  const closeDist = GK_AI.CLOSE_DIST;
  const advanceT = clamp(1 - dist / closeDist, 0, 1);
  const advance = lerp(GK_AI.MIN_ADVANCE, GK_AI.MAX_ADVANCE, advanceT * advanceT);

  let targetX = gc.x + ux * advance;
  let targetY = gc.y + uy * advance;

  const boxMinX = dir > 0 ? gc.x + dir * 0.8 : gc.x + dir * PBOX_D;
  const boxMaxX = dir > 0 ? gc.x + dir * PBOX_D : gc.x + dir * 0.8;
  targetX = clamp(targetX, Math.min(boxMinX, boxMaxX), Math.max(boxMinX, boxMaxX));
  targetY = clamp(targetY, CENTER.y - GOAL_HALF - 1.0, CENTER.y + GOAL_HALF + 1.0);

  return { x: targetX, y: targetY };
}

function isShotMovingTowardGoal(b, gk){
  const goalX = gk.ownGoalX();
  const toward = gk.team === 'away' ? b.vx < -0.35 : b.vx > 0.35;
  if(!toward) return false;
  const sp = ballHorizSpeed(b);
  if(sp < GK_MIN_SHOT_SPEED * 0.55) return false;
  const t = (goalX - b.x) / b.vx;
  return t > 0 && t < GK_AI.SHOT_HORIZON;
}

function isActiveShotEvent(b){
  if(b.owner) return false;
  if(b.state !== BALL_STATE.FREE && b.state !== BALL_STATE.LOOSE_BALL) return false;
  return b.lastKickType === 'shot' || ballHorizSpeed(b) >= GK_MIN_SHOT_SPEED * 0.85;
}

/** Detecta situación 1v1: delantero con balón, sin defensores cercanos, dentro del área. */
export function detectOneVsOne(gk, allPlayers){
  if(!gk || gk.diveAnim || gk.gkKickAnim) return null;

  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();
  let best = null;
  let bestThreat = Infinity;

  for(const p of allPlayers){
    if(!p || p.team === gk.team || p.role === 'GK') continue;
    if(ball.owner !== p) continue;

    const distToGoal = Math.abs(p.x - goalX);
    if(distToGoal > GK_AI.ONE_V_ONE_BOX_DIST) continue;
    if(Math.abs(p.y - CENTER.y) > PBOX_HALFW + 1.5) continue;

    let blocked = false;
    for(const mate of allPlayers){
      if(mate === p || mate.team !== gk.team || mate.role === 'GK') continue;
      if(dist2D(mate, p) < GK_AI.ONE_V_ONE_CLEAR_RADIUS){
        blocked = true;
        break;
      }
    }
    if(blocked) continue;

    const threat = distToGoal + dist2D(gk, p) * 0.35;
    if(threat < bestThreat){
      bestThreat = threat;
      best = p;
    }
  }

  return best;
}

function planOneVsOne(gk, striker){
  const gc = goalMouthCenter(gk);
  const dir = gk.attackDir();
  const distStriker = dist2D(gk, striker);
  const distGoal = Math.abs(striker.x - gk.ownGoalX());

  if(distStriker <= GK_AI.ONE_V_ONE_SMOTHER_DIST && distGoal < GK_AI.ONE_V_ONE_BOX_DIST * 0.85){
    const toStriker = norm({ x: striker.x - gk.x, y: striker.y - gk.y });
    return {
      save: 'smother',
      targetX: striker.x - dir * 0.4,
      targetY: striker.y,
      predZ: BALL_RADIUS + 0.08,
      timeToPlane: clamp(distStriker / 6.5, GK_AI.REACTION_DELAY, 0.42),
      animState: GK_ANIM_STATE.SMOTHER,
      forceCatch: true,
      parryChance: 1,
      strikerId: striker.id,
    };
  }

  const rushX = clamp(
    gc.x + dir * GK_AI.ONE_V_ONE_RUSH_ADVANCE,
    gc.x + dir * 1.2,
    gc.x + dir * (PBOX_D - 1.5),
  );
  const rushY = lerp(gk.y, striker.y, 0.55);

  return {
    move: { x: rushX, y: clamp(rushY, CENTER.y - PBOX_HALFW + 1, CENTER.y + PBOX_HALFW - 1) },
    sprint: true,
    facing: Math.atan2(striker.y - gk.y, striker.x - gk.x),
    rush: true,
  };
}

function registerShotReaction(gk, intercept){
  if(gk.diveAnim || gk.gkShotReaction) return;
  gk.gkShotReaction = {
    delay: GK_AI.REACTION_DELAY,
    targetY: intercept.targetY,
    predZ: intercept.predZ,
    timeToPlane: intercept.timeToPlane,
    useCatch: intercept.useCatch,
    saveChance: intercept.saveChance ?? GK_AI.FIXED_SAVE_CHANCE,
    animState: intercept.animState,
    parryMode: intercept.parryMode,
    forceCatch: intercept.forceCatch,
  };
}

function consumeGkShotReaction(gk){
  const react = gk.gkShotReaction;
  if(!react || react.delay > 0) return null;
  gk.gkShotReaction = null;
  if(gk.diveAnim || gk.tackleCooldown > 0) return null;

  return {
    targetY: react.targetY,
    predZ: react.predZ,
    timeToPlane: react.timeToPlane,
    useCatch: react.useCatch,
    parryChance: react.saveChance ?? GK_AI.FIXED_SAVE_CHANCE,
    animState: react.animState,
    parryMode: react.parryMode,
    forceCatch: react.forceCatch,
  };
}

function tickGkShotReactionDelay(gk, dt){
  const react = gk.gkShotReaction;
  if(!react) return false;
  react.delay -= dt;
  return true;
}

/**
 * Planifica IA de arquero (sin side-effects de animación).
 * @param {object} gk
 * @param {number} dt
 * @param {object[]} [allPlayers]
 */
export function planGoalkeeperAI(gk, dt, allPlayers){
  if(!gk || gk.role !== 'GK') return null;
  if(gk.diveAnim || gk.gkKickAnim) return null;

  tickGkShotReactionDelay(gk, dt);

  const readySave = consumeGkShotReaction(gk);
  if(readySave){
    const animState = readySave.animState ||
      (readySave.useCatch ? GK_ANIM_STATE.CATCH : GK_ANIM_STATE.DIVE_LEFT);
    return {
      save: readySave.useCatch ? 'catch' : 'dive',
      animState,
      ...readySave,
    };
  }

  // Prioridad: salida 1v1
  if(allPlayers?.length){
    const striker = detectOneVsOne(gk, allPlayers);
    if(striker){
      const onePlan = planOneVsOne(gk, striker);
      if(onePlan?.save === 'smother') return onePlan;
      if(onePlan?.move) return onePlan;
    }
  }

  if(isActiveShotEvent(ball) && isShotMovingTowardGoal(ball, gk)){
    const intercept = calculateIntercept(
      { vx: ball.vx, vy: ball.vy, vz: ball.vz },
      { x: ball.x, y: ball.y, z: ball.z },
      gk,
    );
    if(intercept) registerShotReaction(gk, intercept);
  }

  const target = computeTrianglePosition(gk, ball);
  const distToTarget = dist2D(gk, target);

  if(!ball.owner && gameState === 'practice'){
    const inBox = Math.abs(ball.x - gk.ownGoalX()) < PBOX_D &&
      Math.abs(ball.y - CENTER.y) < PBOX_HALFW;
    if(inBox && dist2D(gk, ball) < 8){
      target.x = ball.x;
      target.y = ball.y;
    }
  }

  return {
    move: target,
    sprint: distToTarget > GK_AI.POSITION_SPRINT_DIST,
    moveSpeedCap: GK_AI.POSITION_MAX_SPEED,
    facing: Math.atan2(ball.y - gk.y, ball.x - gk.x),
  };
}

/** Reinicia estado de IA del arquero de práctica. */
export function resetPracticeGoalkeeperAI(gk){
  if(!gk) return;
  gk.gkShotReaction = null;
  gk.diveAnim = null;
}
