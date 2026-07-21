"use strict";

import { PASS_AI } from './gameplay_constants.js';
import { allPlayers, ball, clamp, dist2D, simulateBallTrajectory, CENTER, FIELD_L, FIELD_W, GOAL_HALF, PBOX_D, PBOX_HALFW, Game } from './state.js';

export const AI_STATE_INTERCEPTING_PASS = 'intercepting_pass';

export function isInterceptingPass(p){
  return !!(p && p.aiState === AI_STATE_INTERCEPTING_PASS && p.interceptPassLockT > 0);
}

export function isDeepInterceptPassLocked(p){
  return isInterceptingPass(p) && p.interceptPassDeep;
}

export function getPassDetectRadius(p){
  if(isInterceptingPass(p)) return PASS_AI.DETECT_RADIUS_INTERCEPTING;
  return p.passDetectRadius ?? PASS_AI.DETECT_RADIUS_DEFAULT;
}

function distPointToSegment(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if(len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distPointToTrajectory(px, py, points){
  let best = Infinity;
  for(let i = 1; i < points.length; i++){
    const a = points[i - 1], b = points[i];
    best = Math.min(best, distPointToSegment(px, py, a.x, a.y, b.x, b.y));
  }
  return best;
}

function clearTeamInterceptPass(team, exceptId = null){
  for(const p of allPlayers){
    if(p.team !== team) continue;
    if(exceptId != null && p.id === exceptId) continue;
    if(p.aiState === AI_STATE_INTERCEPTING_PASS) clearInterceptPassState(p);
  }
}

export function clearInterceptPassState(p){
  if(!p) return;
  p.aiState = null;
  p.interceptPassLockT = 0;
  p.interceptPassDeep = false;
  p.interceptPassTarget = null;
  p.passDetectRadius = PASS_AI.DETECT_RADIUS_DEFAULT;
}

function activateInterceptingPass(p, destination, isDeep){
  clearTeamInterceptPass(p.team, p.id);
  p.aiState = AI_STATE_INTERCEPTING_PASS;
  p.interceptPassDeep = isDeep;
  p.interceptPassLockT = isDeep
    ? PASS_AI.INTERCEPTING_PASS_LOCK
    : PASS_AI.INTERCEPTING_PASS_LOCK * 0.5;
  p.passDetectRadius = PASS_AI.DETECT_RADIUS_INTERCEPTING;
  p.interceptPassTarget = { x: destination.x, y: destination.y };
  p.targetPosition = { x: destination.x, y: destination.y };
  p.iaSeeking = true;
  p.aiMode = 'seeking';
  p.manualCancelActive = false;
  p.landingTime = 0;
  p.seekAerial = false;
}

/** Registra un pase en profundidad: proyecta trayectoria y activa INTERCEPTING_PASS al más cercano. */
export function registerThroughPass(kicker){
  if(!kicker || !ball) return null;

  const traj = simulateBallTrajectory(ball, PASS_AI.TRAJECTORY_MAX_TIME);
  const passDist = dist2D(kicker, traj.destination);
  const isDeep = passDist >= PASS_AI.DEEP_PASS_MIN_DIST;

  let best = null, bestDist = Infinity;
  for(const mate of allPlayers){
    if(mate.team !== kicker.team) continue;
    if(mate.id === kicker.id) continue;
    if(mate.role === 'GK') continue;
    const d = distPointToTrajectory(mate.x, mate.y, traj.points);
    if(d < bestDist){
      bestDist = d;
      best = mate;
    }
  }
  if(!best) return null;

  activateInterceptingPass(best, traj.destination, isDeep);
  return best;
}

export function tickInterceptPassStates(dt){
  for(const p of allPlayers){
    if(p.interceptPassLockT <= 0) continue;
    p.interceptPassLockT -= dt;
    if(p.interceptPassLockT <= 0) clearInterceptPassState(p);
  }
}

/* ============================================================
   PositioningSystem — corners y desmarques en laterales
   ============================================================ */

function getCornerAttackSlots(attackingTeam, defendingGoalSide, cornerY = CENTER.y){
  const dir = attackingTeam === 'home' ? 1 : -1;
  const goalX = defendingGoalSide === 'left' ? 0 : FIELD_L;
  const nearSign = cornerY >= CENTER.y ? -1 : 1;
  const penSpotX = goalX + dir * (PBOX_D * 0.78);
  const sixYardX = goalX + dir * 5.8;
  const edgeBoxX = goalX + dir * (PBOX_D + 1.4);
  const topBoxX = goalX + dir * (PBOX_D * 0.42);

  return [
    { role: 'near_post', x: sixYardX, y: CENTER.y + nearSign * (GOAL_HALF + 2.2) },
    { role: 'penalty', x: penSpotX, y: CENTER.y },
    { role: 'far_post', x: penSpotX, y: CENTER.y - nearSign * PBOX_HALFW * 0.58 },
    { role: 'box_front', x: edgeBoxX, y: CENTER.y + nearSign * 3.2 },
    { role: 'rebound', x: topBoxX, y: CENTER.y - nearSign * 4.5 },
  ];
}

/** Ubica 5 atacantes repartidos en el area rival para cabecear en un corner. */
export function positionCornerAttackers(attackingTeam, defendingGoalSide, cornerY = CENTER.y){
  const slots = getCornerAttackSlots(attackingTeam, defendingGoalSide, cornerY);
  const attackers = allPlayers
    .filter(p => p.team === attackingTeam && p.role !== 'GK')
    .sort((a, b) => {
      const ax = a.targetSlotWorld().x * (attackingTeam === 'home' ? 1 : -1);
      const bx = b.targetSlotWorld().x * (attackingTeam === 'home' ? 1 : -1);
      return bx - ax;
    })
    .slice(0, 5);

  attackers.forEach((p, i) => {
    const slot = slots[i];
    if(!slot) return;
    p.x = clamp(slot.x, 2, FIELD_L - 2);
    p.y = clamp(slot.y, 2, FIELD_W - 2);
    p.vx = 0;
    p.vy = 0;
    p.cornerSlot = slot.role;
    p.cornerBasePosition = { x: p.x, y: p.y };
    p.targetPosition = { x: p.x, y: p.y };
    p.aiMode = 'set_piece';
  });
  return attackers;
}

/** Marca zonal en el area: defensores rivales frente a los atacantes del corner. */
export function positionCornerDefenders(defendingTeam, attackingTeam, defendingGoalSide){
  const goalX = defendingGoalSide === 'left' ? 0 : FIELD_L;
  const dir = defendingGoalSide === 'left' ? 1 : -1;
  const attackers = allPlayers.filter(p => p.team === attackingTeam && p.cornerSlot);
  const defenders = allPlayers
    .filter(p => p.team === defendingTeam && p.role !== 'GK')
    .sort((a, b) => dist2D(a, ball) - dist2D(b, ball))
    .slice(0, Math.max(attackers.length, 4));

  defenders.forEach((p, i) => {
    const mark = attackers[i];
    if(mark){
      p.x = clamp(mark.x + dir * 1.05, 2, FIELD_L - 2);
      p.y = clamp(mark.y + (mark.y >= CENTER.y ? -1.15 : 1.15), 2, FIELD_W - 2);
    } else {
      p.x = clamp(goalX + dir * (PBOX_D * 0.52), 2, FIELD_L - 2);
      p.y = clamp(CENTER.y + (i - 1.5) * 4.8, 2, FIELD_W - 2);
    }
    p.vx = 0;
    p.vy = 0;
    p.targetPosition = { x: p.x, y: p.y };
    p.aiMode = 'set_piece';
  });
  return defenders;
}

/** Micro-movimiento en el area mientras espera el centro desde el corner. */
export function maintainCornerAttackPositions(dt, attackingTeam){
  const t = performance.now() * 0.001;
  for(const p of allPlayers){
    if(p.team !== attackingTeam || !p.cornerSlot || p.aiMode !== 'set_piece') continue;
    const base = p.cornerBasePosition;
    if(!base) continue;
    const phase = p.id * 0.73;
    const jostle = 0.38;
    p.targetPosition = {
      x: clamp(base.x + Math.sin(t * 1.85 + phase) * jostle, 2, FIELD_L - 2),
      y: clamp(base.y + Math.cos(t * 2.15 + phase) * jostle * 0.85, 2, FIELD_W - 2),
    };
  }
}

/** Compañeros que se desmarcan cerca del punto de saque lateral (2–3 jugadores). */
export function aiSuggestThrowInTargets(throwingTeam){
  const ti = Game.throwIn;
  if(!ti?.active) return;

  const throwX = ti.x;
  const throwY = ti.y;
  const inwardY = ti.side === 'top' ? 1 : -1;
  const attackDir = throwingTeam === 'home' ? 1 : -1;

  const mates = allPlayers
    .filter(p => p.team === throwingTeam && p.role !== 'GK' && !p.isThrowingIn)
    .sort((a, b) => dist2D(a, { x: throwX, y: throwY }) - dist2D(b, { x: throwX, y: throwY }));

  const runnerCount = 2 + Math.floor(Math.random() * 2); // 2 o 3

  const runOffsets = [
    { dx: attackDir * 3.2, dy: inwardY * 2.8 },
    { dx: attackDir * 5.0, dy: inwardY * 4.5 },
    { dx: attackDir * 2.0, dy: inwardY * 6.5 },
  ];

  let assigned = 0;
  for(const p of mates){
    if(assigned >= runnerCount) break;
    const off = runOffsets[assigned];
    const target = {
      x: clamp(throwX + off.dx, 4, FIELD_L - 4),
      y: clamp(throwY + off.dy, 4, FIELD_W - 4),
    };
    p.throwInRunTarget = target;
    p.targetPosition = { ...target };
    p.iaSeeking = true;
    p.aiMode = 'throw_in_run';
    p.manualCancelActive = false;
    p.runTarget = { ...target };
    p.runTimer = 3.0;
    assigned++;
  }

  for(let i = assigned; i < mates.length; i++){
    const p = mates[i];
    if(p.aiMode !== 'throw_in_run') continue;
    p.throwInRunTarget = null;
    p.runTarget = null;
    p.targetPosition = null;
    p.iaSeeking = false;
    p.aiMode = 'normal';
    p.runTimer = 0;
  }
}
