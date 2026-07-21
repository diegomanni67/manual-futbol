"use strict";

import { FOUL_RULES } from './gameplay_constants.js';
import {
  BALL_RADIUS, CENTER, FIELD_L, FIELD_W, Game, PBOX_D, PBOX_HALFW, SET_PIECE,
  TACKLE_RADIUS, allPlayers, ball, clamp, dist2D, gameState, norm,
} from './state.js';

/** Punto reglamentario del penal (11 m). */
export function getPenaltySpot(attackingGoalSide){
  const goalX = attackingGoalSide === 'left' ? 0 : FIELD_L;
  const dir = attackingGoalSide === 'left' ? 1 : -1;
  return { x: goalX + dir * (PBOX_D * 0.78), y: CENTER.y };
}

/** ¿El punto está en el área grande que defiende `team`? */
export function isInTeamPenaltyBox(bx, by, team){
  const goalX = team === 'home' ? 0 : FIELD_L;
  const dir = team === 'home' ? 1 : -1;
  const depth = (bx - goalX) * dir;
  if(depth < -0.05 || depth > PBOX_D + 0.05) return false;
  return Math.abs(by - CENTER.y) <= PBOX_HALFW + 0.05;
}

function victimForward(victim){
  const spd = Math.hypot(victim.vx ?? 0, victim.vy ?? 0);
  if(spd > 0.45) return norm({ x: victim.vx, y: victim.vy });
  return { x: Math.cos(victim.facing ?? 0), y: Math.sin(victim.facing ?? 0) };
}

/** Entrada por detrás respecto al movimiento/orientación de la víctima. */
export function isTackleFromBehind(tackler, victim){
  const toVictim = norm({ x: victim.x - tackler.x, y: victim.y - tackler.y });
  const fwd = victimForward(victim);
  return toVictim.x * fwd.x + toVictim.y * fwd.y > FOUL_RULES.FROM_BEHIND_DOT;
}

/** Jugada manifiesta de gol: portador cerca del arco con camino razonable. */
export function isClearGoalOpportunity(victim){
  if(!victim || ball.owner !== victim) return false;
  const goalX = victim.oppGoalX();
  const distToGoal = Math.abs(victim.x - goalX);
  if(distToGoal > FOUL_RULES.DOGSO_MAX_DIST) return false;

  const toGoal = norm({ x: goalX - victim.x, y: CENTER.y - victim.y });
  const fwd = victimForward(victim);
  if(fwd.x * toGoal.x + fwd.y * toGoal.y < FOUL_RULES.DOGSO_FORWARD_DOT) return false;

  let blockers = 0;
  for(const p of allPlayers){
    if(!p || p.team === victim.team || p === victim || p.role === 'GK') continue;
    if(dist2D(p, victim) > FOUL_RULES.DOGSO_BLOCK_RADIUS) continue;
    if(Math.abs(p.x - goalX) < distToGoal - 0.5) blockers++;
  }
  return blockers <= FOUL_RULES.DOGSO_MAX_BLOCKERS;
}

/**
 * Evalúa si un contacto defensivo es infracción.
 * Barrida/tacle estrictamente por detrás → falta automática (aunque gane el balón).
 * Otros quites limpios de frente → no falta.
 * @returns {{ x, y, reason } | null}
 */
export function evaluateContactFoul(tackler, victim, tackleAnim){
  if(!tackler || !victim || victim.team === tackler.team) return null;
  if(victim.role === 'GK') return null;

  const slide = tackleAnim?.type === 'slide';
  const stand = tackleAnim?.type === 'stand';
  const isTackle = slide || stand;
  const playedBall = !!(tackleAnim?.ballTouched || tackleAnim?.success);
  const fromBehind = isTackleFromBehind(tackler, victim);
  const dogso = isClearGoalOpportunity(victim);
  const spot = {
    x: (tackler.x + victim.x) * 0.5,
    y: (tackler.y + victim.y) * 0.5,
  };

  // Regla obligatoria: entrada por detrás = falta (tiro libre / penal).
  if(isTackle && fromBehind){
    return { ...spot, reason: dogso ? 'dogso' : 'from_behind' };
  }

  // Quites limpios de frente: si se tocó/ganó el balón, no hay falta.
  if(slide && playedBall) return null;

  const noBall = slide && !playedBall;
  const speed = Math.hypot(tackler.vx ?? 0, tackler.vy ?? 0);
  const violent = slide && noBall && speed >= FOUL_RULES.VIOLENT_SPEED
    && dist2D(tackler, ball) > TACKLE_RADIUS * 1.05;

  let reason = null;
  if(noBall) reason = 'no_ball';
  else if(violent) reason = 'violent';
  else if(stand && ball.owner === victim
    && dist2D(tackler, ball) > TACKLE_RADIUS * FOUL_RULES.STAND_NO_BALL_MULT){
    reason = 'illegal_charge';
  }

  if(!reason) return null;
  return { ...spot, reason };
}

/** Tipo de reinicio según ubicación y equipo infractor. */
export function resolveFoulRestart(foulTeam, fx, fy){
  const awardedTeam = foulTeam === 'home' ? 'away' : 'home';
  const inOwnBox = isInTeamPenaltyBox(fx, fy, foulTeam);
  const type = inOwnBox ? SET_PIECE.PENALTY : SET_PIECE.FREE_KICK;
  const side = awardedTeam === 'home' ? 'right' : 'left';
  return { type, team: awardedTeam, side, inOwnBox };
}

export function clampFoulSpot(fx, fy){
  return {
    x: clamp(fx, 1.2, FIELD_L - 1.2),
    y: clamp(fy, 1.2, FIELD_W - 1.2),
  };
}

export function foulBannerLabel(reason, isPenalty){
  if(isPenalty) return '¡PENAL!';
  const labels = {
    dogso: '¡FALTA! — jugada de gol',
    from_behind: '¡FALTA! — por detrás',
    no_ball: '¡FALTA! — sin tocar el balón',
    violent: '¡FALTA! — entrada violenta',
    illegal_charge: '¡FALTA! — carga ilegal',
  };
  return labels[reason] || '¡FALTA!';
}

export function canAwardFoul(){
  if(gameState === 'practice') return false;
  if(Game.deadBall || Game.isDeadBall || Game.outOfPlay) return false;
  if(Game.goalRoll || Game.isGoal || Game.isGoalScored) return false;
  if(Game.setPieceMode && !Game.isBallInPlay) return false;
  return true;
}
