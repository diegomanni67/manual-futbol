"use strict";

import {
  BALL_RADIUS, BALL_STATE, CENTER, FIELD_L, FIELD_W, Game, SET_PIECE,
  allPlayers, ball, clamp, dist2D,
} from './state.js';

/** Margen de tolerancia (m) antes de cobrar fuera de juego. */
const OFFSIDE_EPS = 0.35;
/** Retraso mínimo entre cobros (s). */
const OFFSIDE_COOLDOWN = 1.2;

let lastOffsideT = 0;

/** Segundo último defensor (línea de offside). Incluye al arquero como último. */
export function getOffsideLineX(defendingTeam){
  const defenders = allPlayers.filter(p => p && p.team === defendingTeam);
  if(!defenders.length) return CENTER.x;

  const goalX = defendingTeam === 'home' ? 0 : FIELD_L;
  const dir = defendingTeam === 'home' ? 1 : -1;

  const sorted = defenders
    .map(p => ({ p, depth: (p.x - goalX) * dir }))
    .sort((a, b) => a.depth - b.depth);

  const second = sorted[1] || sorted[0];
  return second.p.x;
}

/** ¿El atacante está adelantado respecto a la línea y al balón? */
export function isPlayerInOffsidePosition(attacker, defendingTeam, ballX = ball.x){
  if(!attacker || attacker.team === defendingTeam) return false;
  if(attacker.role === 'GK') return false;

  const attackDir = defendingTeam === 'home' ? -1 : 1;
  const halfway = CENTER.x;
  if(attackDir > 0 && attacker.x <= halfway + OFFSIDE_EPS) return false;
  if(attackDir < 0 && attacker.x >= halfway - OFFSIDE_EPS) return false;

  const lineX = getOffsideLineX(defendingTeam);
  const aheadOfBall = attackDir > 0
    ? attacker.x > ballX + OFFSIDE_EPS
    : attacker.x < ballX - OFFSIDE_EPS;
  const aheadOfLine = attackDir > 0
    ? attacker.x > lineX + OFFSIDE_EPS
    : attacker.x < lineX - OFFSIDE_EPS;

  return aheadOfBall && aheadOfLine;
}

function involvedInPlay(receiver, passer, dir){
  if(!receiver || receiver === passer) return false;
  if(receiver.team !== passer.team) return false;
  const toRecv = { x: receiver.x - passer.x, y: receiver.y - passer.y };
  const dist = Math.hypot(toRecv.x, toRecv.y) || 0.001;
  const nd = { x: toRecv.x / dist, y: toRecv.y / dist };
  const align = nd.x * dir.x + nd.y * dir.y;
  if(align < 0.35) return false;
  if(dist > 38) return false;
  return true;
}

/**
 * Evalúa offside en el instante del pase.
 * @returns {{ type, team, side, x, y, fromY, foulReason, banner, indirect } | null}
 */
export function evaluatePassOffside(passer, aimDir, kickType){
  if(!passer || passer.role === 'GK') return null;
  if(kickType === 'shot') return null;
  if(Game.deadBall || (Game.setPieceMode && !Game.isBallInPlay)) return null;
  if(Game.isGoal || Game.goalRoll) return null;
  if(performance.now() / 1000 - lastOffsideT < OFFSIDE_COOLDOWN) return null;

  const defendingTeam = passer.team === 'home' ? 'away' : 'home';
  const raw = aimDir && Math.hypot(aimDir.x, aimDir.y) > 0.05
    ? aimDir
    : { x: Math.cos(passer.facing), y: Math.sin(passer.facing) };
  const len = Math.hypot(raw.x, raw.y) || 1;
  const nd = { x: raw.x / len, y: raw.y / len };

  let flagged = null;
  let bestAlign = -1;
  for(const p of allPlayers){
    if(!involvedInPlay(p, passer, nd)) continue;
    if(!isPlayerInOffsidePosition(p, defendingTeam, passer.x)) continue;
    const toP = { x: p.x - passer.x, y: p.y - passer.y };
    const d = Math.hypot(toP.x, toP.y) || 1;
    const align = (toP.x / d) * nd.x + (toP.y / d) * nd.y;
    if(align > bestAlign){
      bestAlign = align;
      flagged = p;
    }
  }
  if(!flagged) return null;

  lastOffsideT = performance.now() / 1000;
  const restartTeam = defendingTeam;
  const side = restartTeam === 'home' ? 'right' : 'left';
  const x = clamp(flagged.x, 2, FIELD_L - 2);
  const y = clamp(flagged.y, 2, FIELD_W - 2);

  ball.owner = null;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.x = x;
  ball.y = y;
  ball.z = BALL_RADIUS;
  ball.curveFactor = 0;
  ball.state = BALL_STATE.DEAD_BALL;

  return {
    type: SET_PIECE.FREE_KICK,
    team: restartTeam,
    side,
    x,
    y,
    fromY: y,
    foulReason: 'offside',
    banner: '¡FUERA DE JUEGO!',
    indirect: true,
  };
}

/** Ajusta un target de desmarque para no quedar en offside. */
export function clampRunTargetOnside(attacker, target){
  if(!attacker || !target) return target;
  const defendingTeam = attacker.team === 'home' ? 'away' : 'home';
  const attackDir = attacker.attackDir();
  const lineX = getOffsideLineX(defendingTeam);
  const ballX = ball.owner ? ball.owner.x : ball.x;
  const limitX = attackDir > 0
    ? Math.min(lineX, ballX) - 0.55
    : Math.max(lineX, ballX) + 0.55;

  let x = target.x;
  if(attackDir > 0 && x > limitX) x = limitX;
  if(attackDir < 0 && x < limitX) x = limitX;

  if(isPlayerInOffsidePosition(attacker, defendingTeam)){
    x = attackDir > 0
      ? Math.min(attacker.x - 1.2, limitX)
      : Math.max(attacker.x + 1.2, limitX);
  }

  return {
    x: clamp(x, 4, FIELD_L - 4),
    y: clamp(target.y, 4, FIELD_W - 4),
  };
}

/**
 * Línea defensiva cohesiva: no regalar metros innecesarios hacia el propio arco.
 */
export function getDefensiveLineHoldTarget(p, baseTarget){
  if(!p || !baseTarget) return baseTarget;
  const lineRoles = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB']);
  if(!lineRoles.has(p.posRole)) return baseTarget;

  const mates = allPlayers.filter(o =>
    o && o.team === p.team && o !== p && o.role !== 'GK' && lineRoles.has(o.posRole)
  );
  if(!mates.length) return baseTarget;

  const avgX = mates.reduce((s, m) => s + m.x, p.x) / (mates.length + 1);
  const ownGoal = p.ownGoalX();
  const dir = p.attackDir();
  const carrier = ball.owner;
  const pressured = carrier && carrier.team !== p.team && dist2D(p, carrier) < 8;
  if(pressured) return baseTarget;

  const maxDrop = 2.8;
  let holdX = avgX;
  if(dir > 0){
    holdX = Math.max(baseTarget.x, avgX - maxDrop);
    holdX = Math.max(holdX, ownGoal + 8);
  } else {
    holdX = Math.min(baseTarget.x, avgX + maxDrop);
    holdX = Math.min(holdX, ownGoal - 8);
  }

  if(carrier && carrier.team !== p.team && isPlayerInOffsidePosition(carrier, p.team)){
    holdX = avgX;
  }

  return {
    x: clamp(holdX, 4, FIELD_L - 4),
    y: clamp(baseTarget.y, 4, FIELD_W - 4),
  };
}
