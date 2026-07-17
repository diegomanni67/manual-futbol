"use strict";

import { PASS_AI } from './gameplay_constants.js';
import { allPlayers, ball, clamp, dist2D, simulateBallTrajectory, CENTER, FIELD_L, FIELD_W, GOAL_HALF, PBOX_D } from './state.js';

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

function getCornerAttackSlots(attackingTeam, defendingGoalSide){
  const dir = attackingTeam === 'home' ? 1 : -1;
  const goalX = defendingGoalSide === 'left' ? 0 : FIELD_L;
  const penSpotX = goalX + dir * (PBOX_D * 0.72);
  const boxFrontX = goalX + dir * (PBOX_D + 2.8);
  const reboundX = goalX + dir * (PBOX_D * 0.38);

  return [
    { role: 'penalty', x: penSpotX, y: CENTER.y },
    { role: 'near_post', x: penSpotX, y: CENTER.y - GOAL_HALF * 0.55 },
    { role: 'far_post', x: penSpotX, y: CENTER.y + GOAL_HALF * 0.55 },
    { role: 'box_front', x: boxFrontX, y: CENTER.y },
    { role: 'rebound', x: reboundX, y: CENTER.y + dir * 2.2 },
  ];
}

/** Ubica 5 atacantes en el área en un corner. */
export function positionCornerAttackers(attackingTeam, defendingGoalSide){
  const slots = getCornerAttackSlots(attackingTeam, defendingGoalSide);
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
    p.targetPosition = { x: p.x, y: p.y };
    p.aiMode = 'set_piece';
  });
  return attackers;
}

/** AI_SuggestTarget: compañeros se desmarcan hacia adelante en el lateral. */
export function aiSuggestThrowInTargets(throwingTeam){
  const dir = throwingTeam === 'home' ? 1 : -1;
  const oppGoalX = throwingTeam === 'home' ? FIELD_L : 0;
  const mates = allPlayers.filter(p => p.team === throwingTeam && p.role !== 'GK' && !p.isThrowingIn);
  const lanes = [-8, -4, 0, 4, 8];
  let assigned = 0;
  for(const p of mates){
    if(assigned >= 5) break;
    const laneY = CENTER.y + (lanes[assigned] || 0);
    const runX = oppGoalX - dir * (10 + assigned * 2.5);
    p.throwInRunTarget = {
      x: clamp(runX, 4, FIELD_L - 4),
      y: clamp(laneY, 4, FIELD_W - 4),
    };
    p.targetPosition = { ...p.throwInRunTarget };
    p.iaSeeking = true;
    p.aiMode = 'throw_in_run';
    p.manualCancelActive = false;
    p.runTarget = { ...p.throwInRunTarget };
    p.runTimer = 2.5;
    assigned++;
  }
}
