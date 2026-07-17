"use strict";

import { GK_AI, GK_ANIM_STATE } from './gameplay_constants.js';
import {
  BALL_RADIUS, BALL_STATE, CENTER, GOAL_HALF, GK_INTERCEPTION_RADIUS, GK_JUMP_MIN_Z,
  GK_MAX_REACH_Z, GK_MIN_SHOT_SPEED, GRAVITY, PBOX_D, PBOX_HALFW, ball, clamp, dist2D,
  gameState, getDiveSideAnim, lerp,
} from './state.js';

/** Centro del arco defendido por el arquero. */
function goalMouthCenter(gk){
  return { x: gk.ownGoalX(), y: CENTER.y };
}

/**
 * Calcula si la trayectoria pasa cerca del arquero (radio 1.2 m).
 * Retorna punto de intercepción, tiempo y tipo de atajada, o null.
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

  const step = GK_AI.TRAJECTORY_STEP;
  let best = null;

  for(let t = step; t <= GK_AI.SHOT_HORIZON; t += step){
    const ix = px + vx * t;
    const iy = py + vy * t;
    const iz = pz + vz * t - 0.5 * GRAVITY * t * t;
    if(iz < BALL_RADIUS) break;
    if(iz - BALL_RADIUS > GK_MAX_REACH_Z + 0.35) continue;

    const d = Math.hypot(ix - gk.x, iy - gk.y);
    if(!best || d < best.dist){
      best = { t, x: ix, y: iy, z: Math.max(BALL_RADIUS, iz), dist: d };
    }
  }

  const radius = GK_AI.INTERCEPT_RADIUS ?? GK_INTERCEPTION_RADIUS;
  if(!best || best.dist > radius) return null;

  const useBlock = best.z <= GK_JUMP_MIN_Z + 0.45 ||
    Math.abs(best.y - gk.y) <= 0.85;
  const diveSide = getDiveSideAnim(gk, best.y);

  return {
    targetY: best.y,
    predZ: best.z,
    timeToPlane: best.t,
    useCatch: useBlock,
    saveType: useBlock ? 'catch' : 'dive',
    animState: useBlock ? GK_ANIM_STATE.CATCH : diveSide,
    diveSide,
    saveChance: GK_AI.FIXED_SAVE_CHANCE,
  };
}

/**
 * Posicionamiento en triángulo: sobre la línea arco-centro ↔ pelota.
 */
export function computeTrianglePosition(gk, b){
  const gc = goalMouthCenter(gk);
  const toX = b.x - gc.x;
  const toY = b.y - gc.y;
  const dist = Math.hypot(toX, toY) || 0.001;
  const ux = toX / dist;
  const uy = toY / dist;

  const closeDist = GK_AI.CLOSE_DIST;
  const advanceT = clamp(1 - dist / closeDist, 0, 1);
  const advance = lerp(GK_AI.MIN_ADVANCE, GK_AI.MAX_ADVANCE, advanceT * advanceT);

  let targetX = gc.x + ux * advance;
  let targetY = gc.y + uy * advance;

  const dir = gk.attackDir();
  const boxMinX = dir > 0 ? gc.x + dir * 1.0 : gc.x + dir * PBOX_D;
  const boxMaxX = dir > 0 ? gc.x + dir * PBOX_D : gc.x + dir * 1.0;
  targetX = clamp(targetX, Math.min(boxMinX, boxMaxX), Math.max(boxMinX, boxMaxX));
  targetY = clamp(targetY, CENTER.y - GOAL_HALF - 1.2, CENTER.y + GOAL_HALF + 1.2);

  return { x: targetX, y: targetY };
}

function isShotMovingTowardGoal(b, gk){
  const goalX = gk.ownGoalX();
  const toward = gk.team === 'away' ? b.vx < -0.4 : b.vx > 0.4;
  if(!toward) return false;
  const sp = Math.hypot(b.vx, b.vy);
  if(sp < GK_MIN_SHOT_SPEED * 0.65) return false;
  const t = (goalX - b.x) / b.vx;
  return t > 0 && t < GK_AI.SHOT_HORIZON;
}

function isActiveShotEvent(b){
  if(b.owner) return false;
  if(b.state !== BALL_STATE.FREE && b.state !== BALL_STATE.LOOSE_BALL) return false;
  return b.lastKickType === 'shot';
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
 */
export function planGoalkeeperAI(gk, dt){
  if(!gk || gk.role !== 'GK') return null;
  if(gk.diveAnim || gk.gkKickAnim) return null;

  tickGkShotReactionDelay(gk, dt);

  const readySave = consumeGkShotReaction(gk);
  if(readySave){
    const animState = readySave.animState ||
      (readySave.useCatch ? GK_ANIM_STATE.CATCH : GK_ANIM_STATE.DIVE_LEFT);
    return { save: readySave.useCatch ? 'catch' : 'dive', animState, ...readySave };
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
    sprint: true,
    facing: Math.atan2(ball.y - gk.y, ball.x - gk.x),
  };
}

/** Reinicia estado de IA del arquero de práctica. */
export function resetPracticeGoalkeeperAI(gk){
  if(!gk) return;
  gk.gkShotReaction = null;
  gk.diveAnim = null;
}
