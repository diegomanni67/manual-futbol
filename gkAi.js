"use strict";

import { GK_AI, GK_ANIM_STATE, getGkAiConfig } from './gameplay_constants.js';
import {
  BALL_RADIUS, BALL_STATE, CENTER, CROSSBAR_Z, GOAL_HALF, GK_DIVE_MIN_DUR, GK_DIVE_MAX_DUR,
  GK_JUMP_MIN_Z, GK_MAX_REACH_Z, GK_MIN_SHOT_SPEED, GRAVITY,
  PBOX_D, PBOX_HALFW, SBOX_D, SBOX_HALFW, Game, ball, clamp, dist2D, gameState, getDiveSideAnim, getGkInterceptRadius, getGkSaveRadius, isGkGrabBlockedForSetPiece,
  isPlayerSprintChasing, lerp, norm,
  createBallSimState, advanceBallSimState, INTERCEPT_SIM_STEP,
} from './state.js';

function gkCfg(){
  return getGkAiConfig(Game.matchFormat);
}

function horizon(){
  return gkCfg().shotHorizon ?? 4.2;
}

function estimateDiveLeadTime(timeToPlane){
  const cfg = gkCfg();
  const diveDur = clamp((timeToPlane ?? 0.32) * 0.88, GK_DIVE_MIN_DUR, GK_DIVE_MAX_DUR);
  return diveDur + cfg.reactionDelay * 0.42;
}

/** Centro del arco defendido por el arquero. */
function goalMouthCenter(gk){
  return { x: gk.ownGoalX(), y: CENTER.y };
}

function ballHorizSpeed(b){
  return Math.hypot(b.vx, b.vy);
}

function ballHasLateralCurve(b){
  return Math.abs(b?.curveFactor || 0) > 0.35
    || b?.shotStyle === 'placed'
    || b?.shotStyle === 'trivela';
}

/** Fuente de predicción con curva (R1 colocado / L1+R1 trivela) y tracking de spin. */
function resolveBallPredictSource(px, py, pz, vx, vy, vz, hint){
  const liveNear = !!(ball && Math.hypot((ball.x - px) || 0, (ball.y - py) || 0) < 0.35);
  const pick = (key, fallback = null) => {
    const hv = hint ? hint[key] : undefined;
    if(hv !== undefined && hv !== null) return hv;
    if(liveNear && ball) return ball[key];
    return fallback;
  };
  return {
    x: px,
    y: py,
    z: pz ?? BALL_RADIUS,
    vx: vx ?? 0,
    vy: vy ?? 0,
    vz: vz ?? 0,
    curveFactor: pick('curveFactor', 0) || 0,
    shotStyle: pick('shotStyle', null),
    initialSpeed: pick('initialSpeed', Math.hypot(vx || 0, vy || 0) || 1) || 1,
    curveMaxSpeed: pick('curveMaxSpeed'),
    curveLineOrigin: pick('curveLineOrigin', null),
    curveLineDir: pick('curveLineDir', null),
    curvePassTarget: pick('curvePassTarget', null),
    curveMaxDrift: pick('curveMaxDrift', 0) || 0,
    highKick: !!pick('highKick', false),
    highKickType: pick('highKickType', null),
    lastKickType: pick('lastKickType', 'shot') || 'shot',
    groundFrictionMult: pick('groundFrictionMult', 1) || 1,
    ballDamping: pick('ballDamping'),
  };
}

function predictSourceFromBall(b){
  return resolveBallPredictSource(b.x, b.y, b.z, b.vx, b.vy, b.vz, b);
}

/** Simula si un tiro con curva aún puede cruzar el plano de gol. */
function curvedShotApproachesGoal(b, gk){
  const goalX = gk.ownGoalX();
  const sim = createBallSimState(predictSourceFromBall(b));
  let t = 0;
  let prevX = sim.x;
  const yLimit = GOAL_HALF + GK_AI.GOAL_THREAT_Y_MARGIN + 2.2;
  while(t < horizon()){
    if(!advanceBallSimState(sim, INTERCEPT_SIM_STEP)) break;
    t += INTERCEPT_SIM_STEP;
    const crossed = gk.team === 'home'
      ? (prevX > goalX && sim.x <= goalX)
      : (prevX < goalX && sim.x >= goalX);
    if(crossed) return Math.abs(sim.y - CENTER.y) <= yLimit;
    if(gk.team === 'home' && sim.x > prevX && sim.x > goalX + 1.5) break;
    if(gk.team === 'away' && sim.x < prevX && sim.x < goalX - 1.5) break;
    prevX = sim.x;
  }
  return false;
}

/** ¿La pelota se mueve hacia el arco que defiende este arquero? */
function isShotMovingTowardGoal(b, gk){
  const goalX = gk.ownGoalX();
  const vx = b.vx;
  const isRegisteredShot = b.lastKickType === 'shot';
  const curved = ballHasLateralCurve(b);
  const vxMin = isRegisteredShot ? 0.05 : (curved ? 0.08 : 0.2);
  const sp = ballHorizSpeed(b);
  if(sp < GK_MIN_SHOT_SPEED * 0.35 && !isRegisteredShot) return false;

  if(Math.abs(vx) >= vxMin){
    const toward = gk.team === 'home' ? vx < -vxMin : vx > vxMin;
    if(toward){
      const t = (goalX - b.x) / vx;
      if(t > 0.01 && t < horizon()) return true;
    }
  }

  // Tiros con rosca/trivela: no confiar solo en vx rectilíneo.
  if(curved || isRegisteredShot) return curvedShotApproachesGoal(b, gk);
  return false;
}

/**
 * Punto donde la pelota cruza el plano de la línea de gol.
 * Usa simulación con efecto lateral (no asume trayectoria recta).
 */
export function predictGoalMouthCrossing(gk, px, py, pz, vx, vy, vz, hint = null){
  const src = resolveBallPredictSource(px, py, pz, vx, vy, vz, hint);
  const curved = ballHasLateralCurve(src);
  const goalX = gk.ownGoalX();
  const sim = createBallSimState(src);
  const maxT = horizon();
  const step = Math.min(INTERCEPT_SIM_STEP, GK_AI.TRAJECTORY_STEP || INTERCEPT_SIM_STEP);
  let t = 0;
  let prevX = sim.x;
  let prevY = sim.y;
  let prevZ = sim.z;

  // Fallback rectilíneo solo si no hay curva y vx es usable.
  if(!curved && Math.abs(src.vx) >= 0.15){
    const tLin = (goalX - src.x) / src.vx;
    if(tLin > 0.02 && tLin <= maxT){
      const iy = src.y + src.vy * tLin;
      const iz = src.z + src.vz * tLin - 0.5 * GRAVITY * tLin * tLin;
      const inMouth = Math.abs(iy - CENTER.y) <= GOAL_HALF + 0.35 &&
        iz >= BALL_RADIUS - 0.05 &&
        iz <= CROSSBAR_Z + 0.25;
      return { y: iy, z: Math.max(BALL_RADIUS, iz), t: tLin, inMouth, curved: false };
    }
  }

  while(t < maxT){
    if(!advanceBallSimState(sim, step)) break;
    t += step;
    const crossed = gk.team === 'home'
      ? (prevX > goalX && sim.x <= goalX)
      : (prevX < goalX && sim.x >= goalX);
    const nearPlane = Math.abs(sim.x - goalX) <= 0.18;
    if(crossed || nearPlane){
      const span = Math.abs(prevX - sim.x) || 1e-6;
      const u = clamp((prevX - goalX) / span, 0, 1);
      const iy = prevY + (sim.y - prevY) * u;
      const iz = prevZ + (sim.z - prevZ) * u;
      const inMouth = Math.abs(iy - CENTER.y) <= GOAL_HALF + (curved ? 0.55 : 0.35) &&
        iz >= BALL_RADIUS - 0.05 &&
        iz <= CROSSBAR_Z + 0.25;
      return { y: iy, z: Math.max(BALL_RADIUS, iz), t, inMouth, curved };
    }
    if(gk.team === 'home' && sim.x > prevX && sim.x > goalX + 2) break;
    if(gk.team === 'away' && sim.x < prevX && sim.x < goalX - 2) break;
    prevX = sim.x;
    prevY = sim.y;
    prevZ = sim.z;
  }
  return null;
}

/** Evalúa amenaza de tiro al arco — basado en cruce en la línea de gol, no en proximidad actual al GK. */
export function evaluateIncomingShot(gk, b){
  if(!gk || b.owner) return null;
  if(b.state !== BALL_STATE.FREE && b.state !== BALL_STATE.LOOSE_BALL) return null;
  if(!isShotMovingTowardGoal(b, gk)) return null;

  const crossing = predictGoalMouthCrossing(gk, b.x, b.y, b.z, b.vx, b.vy, b.vz, b);
  if(!crossing) return null;

  const yMargin = GOAL_HALF + GK_AI.GOAL_THREAT_Y_MARGIN + (crossing.curved ? 0.45 : 0);
  if(Math.abs(crossing.y - CENTER.y) > yMargin) return null;
  if(crossing.z > (gkCfg().maxReachZ ?? GK_MAX_REACH_Z) + 0.55) return null;

  const speed = ballHorizSpeed(b);
  const interceptPt = { y: crossing.y, z: crossing.z, t: crossing.t };
  const response = classifySaveResponse(gk, interceptPt, crossing, speed, crossing.t);
  const diveSide = getDiveSideAnim(gk, crossing.y);

  return {
    targetY: crossing.y,
    predZ: crossing.z,
    timeToPlane: crossing.t,
    curved: !!crossing.curved,
    useCatch: response.save === 'catch',
    saveType: response.save,
    animState: response.animState,
    diveSide,
    saveChance: response.parryChance,
    reachChance: response.reachChance,
    parryMode: response.parryMode,
    forceCatch: response.forceCatch,
    jumpHeight: response.jumpHeight,
  };
}

/**
 * Intercepción cercana (pelota ya cerca del arquero) — complemento para contacto a corta distancia.
 * Simula curva + gravedad para no asumir rectas.
 */
export function calculateIntercept(ballVelocity, ballPosition, gk){
  if(!gk || gk.role !== 'GK') return null;

  const vx = ballVelocity?.vx ?? 0;
  const vy = ballVelocity?.vy ?? 0;
  const vz = ballVelocity?.vz ?? 0;
  const px = ballPosition?.x ?? gk.x;
  const py = ballPosition?.y ?? gk.y;
  const pz = ballPosition?.z ?? BALL_RADIUS;

  if(Math.hypot(vx, vy, vz) < 0.3) return null;

  const hint = {
    curveFactor: ballVelocity?.curveFactor ?? ballPosition?.curveFactor,
    shotStyle: ballVelocity?.shotStyle ?? ballPosition?.shotStyle,
    initialSpeed: ballVelocity?.initialSpeed ?? ballPosition?.initialSpeed,
    curveMaxSpeed: ballVelocity?.curveMaxSpeed ?? ballPosition?.curveMaxSpeed,
    curveLineOrigin: ballVelocity?.curveLineOrigin ?? ballPosition?.curveLineOrigin,
    curveLineDir: ballVelocity?.curveLineDir ?? ballPosition?.curveLineDir,
    curvePassTarget: ballVelocity?.curvePassTarget ?? ballPosition?.curvePassTarget,
    curveMaxDrift: ballVelocity?.curveMaxDrift ?? ballPosition?.curveMaxDrift,
    highKick: ballVelocity?.highKick ?? ballPosition?.highKick,
    highKickType: ballVelocity?.highKickType ?? ballPosition?.highKickType,
    lastKickType: ballVelocity?.lastKickType ?? ballPosition?.lastKickType ?? 'shot',
    groundFrictionMult: ballVelocity?.groundFrictionMult ?? ballPosition?.groundFrictionMult,
    ballDamping: ballVelocity?.ballDamping ?? ballPosition?.ballDamping,
  };
  const src = resolveBallPredictSource(px, py, pz, vx, vy, vz, hint);

  // Prioridad: evaluación por línea de gol (con curva)
  const fakeBall = {
    ...src,
    owner: null,
    state: BALL_STATE.FREE,
  };
  const threat = evaluateIncomingShot(gk, fakeBall);
  if(threat) return threat;

  const curved = ballHasLateralCurve(src);
  const sim = createBallSimState(src);
  const step = Math.min(INTERCEPT_SIM_STEP, GK_AI.TRAJECTORY_STEP || INTERCEPT_SIM_STEP);
  let best = null;
  let t = 0;

  while(t < horizon()){
    if(!advanceBallSimState(sim, step)) break;
    t += step;
    const iz = Math.max(BALL_RADIUS, sim.z);
    if(iz - BALL_RADIUS > GK_MAX_REACH_Z + (curved ? 0.55 : 0.45)) continue;

    const d = Math.hypot(sim.x - gk.x, sim.y - gk.y);
    if(!best || d < best.dist){
      best = { t, x: sim.x, y: sim.y, z: iz, dist: d };
    }
  }

  const radius = (gkCfg().interceptRadius ?? getGkInterceptRadius()) * (curved ? 1.12 : 1);
  if(!best || best.dist > radius) return null;

  const speed = Math.hypot(vx, vy);
  const response = classifySaveResponse(gk, best, null, speed, best.t);

  return {
    targetY: best.y,
    predZ: best.z,
    timeToPlane: best.t,
    curved,
    useCatch: response.save === 'catch',
    saveType: response.save,
    animState: response.animState,
    diveSide: getDiveSideAnim(gk, best.y),
    saveChance: response.parryChance,
    reachChance: response.reachChance,
    parryMode: response.parryMode,
    forceCatch: response.forceCatch,
    jumpHeight: response.jumpHeight,
  };
}

/** Y en la línea de gol que biseca el ángulo balón–palo–palo (centra cobertura). */
export function computeOptimalGkLineY(gk, bx, by){
  const gx = gk.ownGoalX();
  const dx = Math.max(Math.abs(bx - gx), 1.0);
  const dy = by - CENTER.y;
  const halfW = GOAL_HALF;
  // Mantenerse cerca del centro de los tres palos; no barrer laterales del área.
  const shrink = halfW / (halfW + dx * 1.65);
  const maxShift = halfW * 0.36;
  return CENTER.y + clamp(dy * shrink, -maxShift, maxShift);
}

/** Posición ideal del arquero para cubrir el arco según bisectriz balón–portería. */
export function computeIdealGkPosition(gk, ballX, ballY, timeToPlane){
  const cfg = gkCfg();
  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();
  const flight = timeToPlane ?? 0.65;
  const h = horizon();
  const advanceT = clamp(1 - flight / h, 0, 1);
  let advance = lerp(cfg.minAdvance, cfg.maxAdvance, advanceT * advanceT);
  const bx = ballX ?? ball.x;
  const by = ballY ?? ball.y;
  const latFrac = clamp(Math.abs(by - CENTER.y) / Math.max(PBOX_HALFW, 0.01), 0, 1);
  if(latFrac > 0.4){
    advance = Math.min(advance, lerp(cfg.maxAdvance * 0.55, cfg.minAdvance + 0.9, (latFrac - 0.4) / 0.6));
  }
  return {
    x: goalX + dir * advance,
    y: computeOptimalGkLineY(gk, bx, by),
  };
}

/** Animación de atajada según altura real del cruce — sin saltos absurdos en tiros rasos/lejanos. */
function classifySaveAnimation(gk, targetY, predZ, timeToPlane){
  const cfg = gkCfg();
  const flight = timeToPlane ?? 0.65;
  const z = predZ ?? BALL_RADIUS;
  const diveSide = getDiveSideAnim(gk, targetY);
  const isLongShot = flight >= cfg.mediumShotTime;

  let effZ = z;
  if(isLongShot && z < GK_AI.HIGH_SHOT_Z){
    effZ = Math.min(z, 1.05);
  }

  const isGround = effZ <= BALL_RADIUS + 0.5;
  const isLow = effZ <= 1.05;
  const isMid = effZ <= 1.42;
  const isTrueHigh = z >= GK_AI.HIGH_SHOT_Z && (!isLongShot || z >= 1.95);

  if(isGround || isLow){
    return { animState: GK_ANIM_STATE.LOW_DIVE, jumpHeight: 0.1, useCatch: isGround && !isLongShot };
  }
  if(isMid){
    return { animState: diveSide, jumpHeight: 0.18, useCatch: false };
  }
  if(isTrueHigh){
    return { animState: GK_ANIM_STATE.JUMP, jumpHeight: clamp(z - 0.85, 0.3, 0.95), useCatch: false };
  }
  return { animState: diveSide, jumpHeight: 0.22, useCatch: false };
}

/**
 * Fórmula de atajada — combina posicionamiento, distancia, colocación y potencia.
 * Devuelve reachChance (llegar a tocar) y parryChance (blocar limpio vs despejar).
 */
export function evaluateSaveAttempt(gk, targetY, targetZ, speed, timeToPlane){
  const cfg = gkCfg();
  const ideal = computeIdealGkPosition(gk, ball.x, ball.y, timeToPlane);
  const posError = dist2D(gk, ideal);
  const posErrorNorm = posError / Math.max(GOAL_HALF * cfg.positionErrorScale, 0.01);

  const lateralNeed = Math.abs(gk.y - targetY);
  const lateralReach = GOAL_HALF * cfg.lateralReachFrac;
  const placement = clamp(Math.abs(targetY - CENTER.y) / Math.max(GOAL_HALF, 0.01), 0, 1);
  const power = clamp(
    (speed - cfg.weakShotSpeed) / Math.max(cfg.hardShotSpeed - cfg.weakShotSpeed, 0.01),
    0, 1,
  );
  const flight = timeToPlane ?? 0.65;
  const distanceNorm = clamp(flight / cfg.farShotTime, 0, 1);

  const diveTimeNeeded = lateralNeed / Math.max(cfg.diveSpeed, 0.01);
  const timeMargin = flight - cfg.reactionDelay - diveTimeNeeded;
  const lateralMargin = lateralReach - lateralNeed;

  let reachScore = cfg.reachBase;
  reachScore += clamp(lateralMargin / Math.max(lateralReach, 0.01), -0.55, 0.42) * 0.48;
  reachScore -= clamp(posErrorNorm, 0, 1.25) * 0.40;
  reachScore -= placement * placement * 0.42;
  reachScore -= power * 0.36;
  reachScore += distanceNorm * 0.11;
  if(flight < cfg.closeShotTime) reachScore -= 0.18 + power * 0.14;
  reachScore += clamp(timeMargin, -0.55, 0.38) * 0.42;

  const maxZ = cfg.maxReachZ ?? GK_MAX_REACH_Z;
  const heightMargin = maxZ - targetZ;
  if(heightMargin < 0) reachScore -= 0.58;
  else if(heightMargin < 0.35) reachScore -= 0.14;

  const reachChance = clamp(reachScore, 0.04, 0.90);

  let holdScore = reachScore;
  holdScore *= (1 - power * 0.90);
  holdScore *= (1 - placement * 0.78);
  if(targetZ > GK_JUMP_MIN_Z + 0.35) holdScore *= 0.42;
  if(posErrorNorm > 0.55) holdScore *= 0.72;
  const parryChance = clamp(holdScore, 0.05, 0.75);

  const isCentral = placement < GK_AI.BODY_CENTER_FRAC + 0.1;
  const isLow = targetZ <= GK_JUMP_MIN_Z + 0.35;
  const isGround = targetZ <= BALL_RADIUS + 0.55;
  const isHigh = targetZ >= GK_AI.HIGH_SHOT_Z;
  const diveSide = getDiveSideAnim(gk, targetY);

  let parryMode = 'wide';
  if(power >= 0.72 || placement > GK_AI.WIDE_SHOT_FRAC) parryMode = 'long_rebound';
  else if(placement > GK_AI.CORNER_FRAC) parryMode = 'corner';

  const forceCatch = power < 0.18 && isCentral && isLow && reachChance > 0.62 && posErrorNorm < 0.35;
  const animPick = classifySaveAnimation(gk, targetY, targetZ, timeToPlane);

  if(power < 0.22 && isCentral && isLow && reachChance > 0.55 && animPick.useCatch){
    return {
      save: 'catch',
      animState: GK_ANIM_STATE.CATCH,
      parryChance,
      reachChance,
      parryMode,
      forceCatch,
      jumpHeight: 0.12,
      reachScore,
      placement,
      power,
      posErrorNorm,
    };
  }
  if(isGround || isLow){
    return {
      save: 'dive',
      animState: GK_ANIM_STATE.LOW_DIVE,
      parryChance,
      reachChance,
      parryMode,
      forceCatch: false,
      jumpHeight: animPick.jumpHeight,
      reachScore,
      placement,
      power,
      posErrorNorm,
    };
  }
  if(isTrueHigh(animPick)){
    return {
      save: 'dive',
      animState: animPick.animState,
      parryChance,
      reachChance: reachChance * 0.94,
      parryMode,
      forceCatch: false,
      jumpHeight: animPick.jumpHeight,
      reachScore,
      placement,
      power,
      posErrorNorm,
    };
  }
  return {
    save: 'dive',
    animState: animPick.animState,
    parryChance,
    reachChance,
    parryMode,
    forceCatch: false,
    jumpHeight: animPick.jumpHeight,
    reachScore,
    placement,
    power,
    posErrorNorm,
  };
}

function isTrueHigh(animPick){
  return animPick.animState === GK_ANIM_STATE.JUMP;
}

/** Resuelve contacto físico: ¿el arquero llegó con mérito al balón? */
export function resolveGkSaveContact(gk, ballY, ballDist, dive){
  if(!dive) return true;
  const cfg = gkCfg();
  const targetY = dive.targetY ?? gk.y;
  const yErr = Math.abs(ballY - targetY);
  const lateralReach = GOAL_HALF * cfg.lateralReachFrac;
  const reachRadius = dive.reachRadius ?? lateralReach * 0.55;

  const lateralQ = clamp(1 - yErr / Math.max(lateralReach * 0.92, 0.01), 0, 1);
  const distQ = clamp(1 - ballDist / Math.max(reachRadius, 0.01), 0, 1);
  const contactQ = lateralQ * distQ;
  const needQ = 1 - (dive.reachChance ?? cfg.reachBase);
  const variance = (Math.random() - 0.5) * cfg.reachVariance * 2;
  return contactQ + variance >= needQ * 0.88;
}

/** Perfil de intervención — delega a evaluateSaveAttempt. */
function computeShotSaveProfile(gk, iy, iz, speed, timeToPlane){
  return evaluateSaveAttempt(gk, iy, iz, speed, timeToPlane);
}

/** Clasifica la intervención: blocaje vs despeje según potencia, ángulo y altura. */
export function classifySaveResponse(gk, intercept, crossing, speed, timeToPlane){
  const iy = crossing?.y ?? intercept.y;
  const iz = crossing?.z ?? intercept.z;
  return computeShotSaveProfile(gk, iy, iz, speed, timeToPlane ?? intercept.t);
}

/**
 * Posicionamiento: triángulo arco ↔ pelota; ante tiro, cubrir el palo según cruce previsto.
 * En ataques laterales mantiene cobertura central sobre postes/línea de meta (sin salir a tierra de nadie).
 */
export function computeTrianglePosition(gk, b){
  const cfg = gkCfg();
  const gc = goalMouthCenter(gk);
  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();

  const crossing = predictGoalMouthCrossing(gk, b.x, b.y, b.z, b.vx, b.vy, b.vz, b);
  if(crossing && isShotMovingTowardGoal(b, gk)){
    const h = horizon();
    const flight = crossing.t;
    let advance;
    if(flight >= cfg.farShotTime){
      advance = lerp(cfg.minAdvance + 0.5, cfg.maxAdvance * 0.72, clamp(1 - flight / h, 0, 1));
    } else if(flight >= (cfg.mediumShotTime ?? 0.75)){
      advance = lerp(cfg.maxAdvance * 0.55, cfg.maxAdvance * 0.85, 1 - (flight - cfg.mediumShotTime) / (cfg.farShotTime - cfg.mediumShotTime + 0.01));
    } else if(flight < 0.55){
      advance = lerp(cfg.maxAdvance, cfg.minAdvance + 0.4, flight / 0.55);
    } else {
      advance = lerp(cfg.minAdvance + 0.6, cfg.maxAdvance * 0.65, clamp(1 - flight / h, 0, 1));
    }
    // Con curva: cubrir el palo del cruce previsto, no solo la bisectriz del balón actual.
    const lineY = crossing.curved
      ? lerp(computeOptimalGkLineY(gk, b.x, b.y), crossing.y, 0.55)
      : computeOptimalGkLineY(gk, b.x, b.y);
    const latFrac = clamp(Math.abs((crossing.y ?? b.y) - CENTER.y) / Math.max(GOAL_HALF, 0.01), 0, 1);
    const advanceCap = lerp(cfg.maxAdvance * 0.85, cfg.minAdvance + 0.85, latFrac * latFrac);
    // Ante cruce lateral: cubrir el palo sin abandonar el arco (Y acotada a ~60% del ancho).
    const coverY = lerp(lineY, CENTER.y, 0.18 + latFrac * 0.32);
    return {
      x: goalX + dir * clamp(Math.min(advance, advanceCap), cfg.minAdvance, cfg.maxAdvance),
      y: clamp(coverY, CENTER.y - GOAL_HALF * 0.58, CENTER.y + GOAL_HALF * 0.58),
    };
  }

  let aimX = b.x;
  let aimY = b.y;

  const toX = aimX - gc.x;
  const toY = aimY - gc.y;
  const dist = Math.hypot(toX, toY) || 0.001;
  const ux = toX / dist;

  const closeDist = cfg.closeDist;
  const advanceT = clamp(1 - dist / closeDist, 0, 1);
  let advance = lerp(cfg.minAdvance, cfg.maxAdvance, advanceT * advanceT);

  // Ataques por el costado del área: no abandonar el arco ni avanzar en exceso.
  const latFrac = clamp(Math.abs(aimY - CENTER.y) / Math.max(PBOX_HALFW, 0.01), 0, 1);
  const wideAttack = latFrac > 0.42;
  if(wideAttack){
    const holdBack = lerp(1, 0.38, clamp((latFrac - 0.42) / 0.58, 0, 1));
    advance = Math.min(advance, lerp(cfg.minAdvance + 0.85, cfg.maxAdvance * 0.48, holdBack));
  }

  let targetX = gc.x + ux * advance;
  let targetY = computeOptimalGkLineY(gk, aimX, aimY);

  // Ante balón muy lateral, priorizar línea de meta y ángulo de cierre (poco avance en X).
  if(wideAttack){
    const depthCap = lerp(cfg.maxAdvance * 0.48, cfg.minAdvance + 0.55, clamp((latFrac - 0.42) / 0.58, 0, 1));
    targetX = goalX + dir * clamp((targetX - goalX) * dir, cfg.minAdvance, depthCap);
    targetY = lerp(targetY, CENTER.y, 0.38 + latFrac * 0.35);
  }

  const boxMinX = dir > 0 ? gc.x + dir * 0.55 : gc.x + dir * Math.min(PBOX_D * 0.48, cfg.maxAdvance * 0.72);
  const boxMaxX = dir > 0 ? gc.x + dir * Math.min(PBOX_D * 0.48, cfg.maxAdvance * 0.72) : gc.x + dir * 0.55;
  targetX = clamp(targetX, Math.min(boxMinX, boxMaxX), Math.max(boxMinX, boxMaxX));
  targetY = clamp(targetY, CENTER.y - GOAL_HALF * 0.55, CENTER.y + GOAL_HALF * 0.55);

  return { x: targetX, y: targetY };
}

function isActiveShotEvent(b){
  if(b.owner) return false;
  if(b.state !== BALL_STATE.FREE && b.state !== BALL_STATE.LOOSE_BALL) return false;
  return b.lastKickType === 'shot' || ballHorizSpeed(b) >= GK_MIN_SHOT_SPEED * 0.55;
}

function isGkLooseBallClaimable(b){
  if(!b || b.owner) return false;
  if(b.isReadyToKick || b.state === BALL_STATE.PLACED) return false;
  if(b.state === BALL_STATE.DEAD_BALL || b.state === BALL_STATE.WAITING_FOR_RETRIEVAL) return false;
  if(b.state === BALL_STATE.GOAL_CELEBRATION || b.state === BALL_STATE.OUT_OF_BOUNDS) return false;
  if(b.z - BALL_RADIUS > GK_MAX_REACH_Z + 0.15) return false;
  return b.state === BALL_STATE.FREE || b.state === BALL_STATE.LOOSE_BALL || b.state === BALL_STATE.IN_AIR;
}

/** ¿La pelota está dentro del área grande que defiende este arquero? */
export function isBallInGkPenaltyBox(gk, bx, by){
  if(!gk) return false;
  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();
  const depth = (bx - goalX) * dir;
  if(depth < -0.35 || depth > PBOX_D + 0.55) return false;
  return Math.abs(by - CENTER.y) <= PBOX_HALFW + 0.55;
}

function nearestRivalToBallInBox(gk, allPlayers){
  let best = null;
  let bestD = Infinity;
  for(const p of allPlayers){
    if(!p || p.team === gk.team || p.role === 'GK') continue;
    if(!isBallInGkPenaltyBox(gk, p.x, p.y) && dist2D(p, ball) > 4) continue;
    const d = dist2D(p, ball);
    if(d < bestD){
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** ¿La pelota está en el área chica que defiende este arquero? */
export function isBallInGkSixYardBox(gk, bx, by){
  if(!gk) return false;
  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();
  const depth = (bx - goalX) * dir;
  if(depth < -0.25 || depth > SBOX_D + 0.45) return false;
  return Math.abs(by - CENTER.y) <= SBOX_HALFW + 0.45;
}

/** Activa persecución agresiva de balones sueltos en el área (rebotes, desvíos, etc.). */
export function triggerGkProactiveClaim(gk, reason = 'loose'){
  if(!gk) return;
  const cfg = gkCfg();
  gk.gkProactiveClaim = {
    t: cfg.proactiveClaimDuration ?? 3.2,
    reason,
  };
  gk.gkShotReaction = null;
}

export function tickGkProactiveClaim(gk, dt){
  const pc = gk.gkProactiveClaim;
  if(!pc) return;
  pc.t -= dt;
  if(pc.t <= 0) gk.gkProactiveClaim = null;
}

function predictBallGroundPoint(b){
  const z0 = b.z;
  if(z0 <= BALL_RADIUS + 0.12) return { x: b.x, y: b.y };
  const vz = b.vz ?? 0;
  const a = -0.5 * GRAVITY;
  const disc = vz * vz - 4 * a * (z0 - BALL_RADIUS);
  let tLand = 0.25;
  if(disc >= 0){
    const t = (-vz - Math.sqrt(disc)) / (2 * a);
    if(t > 0.02) tLand = Math.min(t, 1.35);
  }
  return { x: b.x + b.vx * tLand, y: b.y + b.vy * tLand };
}

function isGkProactiveLooseBallContext(gk, inSix){
  if(gk.gkProactiveClaim?.t > 0) return true;
  if(ball.lastTouchedBy === gk.id) return true;
  if(inSix) return true;
  return false;
}

/** Zambullida al suelo para atrapar un balón suelto antes que el delantero. */
function evaluateLooseBallPounce(gk, allPlayers, distToBall, proactive){
  const cfg = gkCfg();
  const pounceDist = cfg.boxPounceDist ?? 3.35;
  if(distToBall > pounceDist) return null;

  const lowBall = ball.z <= GK_JUMP_MIN_Z + 0.5;
  const reachableAir = ball.z <= GK_MAX_REACH_Z + 0.12 && distToBall <= pounceDist * 0.82;
  if(!lowBall && !reachableAir) return null;

  const rival = nearestRivalToBallInBox(gk, allPlayers);
  const rivalDist = rival ? dist2D(rival, ball) : Infinity;
  const racingRival = rivalDist < distToBall + (cfg.boxPounceRivalMargin ?? 1.0);
  const urgentDist = cfg.boxPounceUrgentDist ?? 2.05;

  if(distToBall > urgentDist && !racingRival && !proactive) return null;

  const useCatch = lowBall && ball.z <= BALL_RADIUS + 0.42;
  return {
    save: 'pounce',
    targetX: ball.x,
    targetY: ball.y,
    predZ: Math.max(BALL_RADIUS, ball.z),
    timeToPlane: clamp(distToBall / cfg.diveSpeed, GK_DIVE_MIN_DUR, 0.36),
    animState: useCatch ? GK_ANIM_STATE.CATCH : GK_ANIM_STATE.LOW_DIVE,
    useCatch,
    reachChance: racingRival ? 0.78 : 0.68,
    parryChance: useCatch ? 0.62 : 0.48,
    jumpHeight: 0.08,
    forceCatch: racingRival && lowBall,
    danger: racingRival,
  };
}

/**
 * Salida decisiva a balones sueltos/divididos en área chica y grande.
 * Manos si es seguro; zambullida o despeje con pie bajo presión rival.
 */
/** Cancela estirada/reacción estática para priorizar salida a balón suelto. */
export function cancelGkDiveForLooseClaim(gk, reason = 'loose_interrupt'){
  if(!gk) return;
  if(gk.diveAnim || gk.gkShotReaction){
    gk.diveAnim = null;
    gk.gkShotReaction = null;
    gk.gkAnimState = null;
    triggerGkProactiveClaim(gk, reason);
  }
}

export function evaluateLooseBallClaim(gk, allPlayers, opts = {}){
  if(!gk || gk.gkKickAnim) return null;
  if(!opts.ignoreDive && gk.diveAnim) return null;
  if(isGkGrabBlockedForSetPiece(gk)) return null;
  if(!isGkLooseBallClaimable(ball)) return null;
  if(!isBallInGkPenaltyBox(gk, ball.x, ball.y)) return null;

  const cfg = gkCfg();
  const inSix = isBallInGkSixYardBox(gk, ball.x, ball.y);
  const proactive = isGkProactiveLooseBallContext(gk, inSix);
  const distToBall = dist2D(gk, ball);
  const rival = nearestRivalToBallInBox(gk, allPlayers);
  const rivalDist = rival ? dist2D(rival, ball) : Infinity;
  const ballSpeed = Math.hypot(ball.vx, ball.vy);
  const lowBall = ball.z <= GK_JUMP_MIN_Z + 0.35;
  const slowBall = ballSpeed < 5.5;
  const gkJustTouched = ball.lastTouchedBy === gk.id;
  const shotThreat = !gkJustTouched && !proactive
    && ball.lastKickType === 'shot' && ballSpeed > GK_MIN_SHOT_SPEED * 0.45;
  const danger = shotThreat
    || rivalDist < (cfg.boxRivalThreatDist ?? 3.2)
    || (ballSpeed > 10.5 && !gkJustTouched)
    || (ball.isContested && rival && !proactive);

  const pounce = evaluateLooseBallPounce(gk, allPlayers, distToBall, proactive);
  if(pounce) return pounce;

  const groundPt = predictBallGroundPoint(ball);
  let targetX = groundPt.x;
  let targetY = groundPt.y;
  if(ballSpeed > 0.5){
    const urgency = proactive ? 1.18 : 1.0;
    const tMeet = clamp(distToBall / Math.max(cfg.positionMaxSpeed * cfg.boxClaimSpeedMult * urgency, 0.01), 0.04, 0.62);
    targetX = ball.x + ball.vx * tMeet;
    targetY = ball.y + ball.vy * tMeet;
  }
  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();
  targetX = clamp(targetX, goalX + dir * 0.4, goalX + dir * (PBOX_D - 0.35));
  targetY = clamp(targetY, CENTER.y - PBOX_HALFW + 0.4, CENTER.y + PBOX_HALFW - 0.4);

  const useHands = lowBall && (!danger || proactive || gkJustTouched)
    && (slowBall || distToBall < 3.6 || proactive);
  const urgencyMult = (proactive || inSix || rivalDist < distToBall + 1.2)
    ? (cfg.boxClaimUrgencyMult ?? 1.22) : 1.0;

  return {
    claim: true,
    move: { x: targetX, y: targetY },
    sprint: true,
    rush: true,
    moveSpeedCap: cfg.positionMaxSpeed * (cfg.boxClaimSpeedMult ?? 1.4) * urgencyMult,
    facing: Math.atan2(ball.y - gk.y, ball.x - gk.x),
    useHands,
    danger,
    rivalId: rival?.id ?? null,
    proactive,
  };
}

/** @deprecated alias — usar evaluateLooseBallClaim */
export function evaluateBoxClaim(gk, allPlayers){
  return evaluateLooseBallClaim(gk, allPlayers);
}

/** Detecta situación 1v1 / achique: delantero con balón acercándose al arco. */
export function detectOneVsOne(gk, allPlayers){
  if(!gk || gk.diveAnim || gk.gkKickAnim) return null;
  const cfg = gkCfg();
  const boxDist = cfg.oneVsOneBoxDist ?? GK_AI.ONE_V_ONE_BOX_DIST;

  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();
  let best = null;
  let bestThreat = Infinity;

  for(const p of allPlayers){
    if(!p || p.team === gk.team || p.role === 'GK') continue;
    if(ball.owner !== p) continue;

    const distToGoal = Math.abs(p.x - goalX);
    if(distToGoal > boxDist) continue;
    if(Math.abs(p.y - CENTER.y) > PBOX_HALFW + 2.2) continue;

    // Debe estar avanzando hacia el arco (o muy cerca)
    const toGoal = (goalX - p.x) * dir;
    const closing = (p.vx ?? 0) * dir;
    if(toGoal < -1.5 && closing < 0.4 && distToGoal > 8) continue;

    // Solo descartar si hay cobertura densa encima del delantero
    let tightMarkers = 0;
    for(const mate of allPlayers){
      if(mate === p || mate.team !== gk.team || mate.role === 'GK') continue;
      if(dist2D(mate, p) < 2.8) tightMarkers++;
    }
    if(tightMarkers >= 2) continue;

    const threat = distToGoal + dist2D(gk, p) * 0.25;
    if(threat < bestThreat){
      bestThreat = threat;
      best = p;
    }
  }

  return best;
}

/** Evalúa achique / smother: no infalible — amague, gambeta y timing ofensivo reducen éxito. */
export function evaluateSmotherAttempt(gk, striker, distStriker){
  const cfg = gkCfg();
  const smotherDist = cfg.oneVsOneSmotherDist ?? GK_AI.ONE_V_ONE_SMOTHER_DIST;
  const speed = Math.hypot(striker.vx ?? 0, striker.vy ?? 0);
  const toStriker = norm({ x: striker.x - gk.x, y: striker.y - gk.y });
  const vel = speed > 0.15 ? norm({ x: striker.vx, y: striker.vy }) : toStriker;
  const closingDot = vel.x * toStriker.x + vel.y * toStriker.y;
  const lateralDot = Math.abs(vel.x * (-toStriker.y) + vel.y * toStriker.x);

  let beatScore = 0;
  if(striker.feint || striker.dragBack) beatScore += 0.42;
  if(striker.isFakeShooting || ball.feintDetach?.ownerId === striker.id) beatScore += 0.38;
  if(striker.touchAnim && ball.lastAction === 'feint') beatScore += 0.28;
  if(isPlayerSprintChasing(striker) || striker.isEffortSprinting) beatScore += 0.20;
  if(speed > 5.2 && closingDot < -0.2) beatScore += 0.30;
  if(lateralDot > 0.5 && speed > 3.8) beatScore += 0.26;
  if(striker.kickAnim || striker.pendingKick) beatScore += 0.18;
  beatScore = clamp(beatScore, 0, 0.95);

  const distFactor = clamp(1 - distStriker / (smotherDist * 1.25), 0, 1);
  let reachChance = (cfg.smotherReachBase ?? 0.54) + 0.12;
  reachChance *= 0.72 + distFactor * 0.38;
  reachChance -= beatScore * 0.42;
  reachChance = clamp(reachChance, 0.22, 0.88);

  const claimChance = clamp(reachChance * (0.62 - beatScore * 0.22), 0.18, 0.78);

  return {
    shouldAttempt: distStriker <= smotherDist * 1.45,
    reachChance,
    claimChance,
    beatScore,
  };
}

/** ¿El arquero conecta el achique ante el delantero? */
export function resolveGkSmotherContact(gk, striker, dive){
  if(!dive || dive.saveMode !== 'smother') return resolveGkSaveContact(gk, ball.y, dist2D(gk, ball), dive);
  if(!striker) return false;

  const cfg = gkCfg();
  const dist = dist2D(gk, striker);
  const smotherReach = (dive.reachRadius ?? getGkSaveRadius() * cfg.saveRadiusMult) * (cfg.smotherRadiusMult ?? 1.05);
  if(dist >= smotherReach) return false;

  const evalSmother = evaluateSmotherAttempt(gk, striker, dist);
  const variance = (Math.random() - 0.5) * cfg.reachVariance * 2;
  const need = 0.18 + evalSmother.beatScore * 0.32;
  return evalSmother.reachChance + variance >= need;
}

function planOneVsOne(gk, striker){
  const cfg = gkCfg();
  const gc = goalMouthCenter(gk);
  const dir = gk.attackDir();
  const distStriker = dist2D(gk, striker);
  const distGoal = Math.abs(striker.x - gk.ownGoalX());
  const boxDist = cfg.oneVsOneBoxDist ?? GK_AI.ONE_V_ONE_BOX_DIST;
  const smotherDist = cfg.oneVsOneSmotherDist ?? GK_AI.ONE_V_ONE_SMOTHER_DIST;
  const rushAdvance = cfg.oneVsOneRushAdvance ?? GK_AI.ONE_V_ONE_RUSH_ADVANCE;

  const rushFactor = clamp(1 - distGoal / boxDist, 0.45, 1);
  const smotherEval = evaluateSmotherAttempt(gk, striker, distStriker);

  // Achique / zambullida al delantero cuando está cerca
  if(smotherEval.shouldAttempt && distGoal < boxDist){
    return {
      save: 'smother',
      targetX: striker.x - dir * 0.28,
      targetY: striker.y,
      predZ: BALL_RADIUS + 0.08,
      timeToPlane: clamp(distStriker / Math.max(cfg.diveSpeed, 1), GK_DIVE_MIN_DUR, 0.42),
      animState: GK_ANIM_STATE.SMOTHER,
      forceCatch: smotherEval.claimChance >= 0.28 || distStriker < smotherDist * 0.85,
      parryChance: Math.max(smotherEval.claimChance, 0.45),
      reachChance: Math.max(smotherEval.reachChance, 0.55),
      strikerId: striker.id,
    };
  }

  // Salida activa de la línea: achicar ángulo y distancia (sin desnudarse en laterales)
  const meetX = lerp(gk.x, striker.x - dir * 0.55, 0.55 + rushFactor * 0.35);
  const latFrac = clamp(Math.abs(striker.y - CENTER.y) / Math.max(PBOX_HALFW, 0.01), 0, 1);
  const maxRush = Math.min(
    rushAdvance * lerp(1.05, 0.55, latFrac),
    PBOX_D * lerp(0.72, 0.42, latFrac),
  );
  const rushX = clamp(
    lerp(gc.x + dir * 1.15, meetX, rushFactor * (1 - latFrac * 0.35)),
    gc.x + dir * 0.85,
    gc.x + dir * maxRush,
  );
  const rushY = lerp(
    computeOptimalGkLineY(gk, striker.x, striker.y),
    striker.y,
    0.35 + rushFactor * 0.2 * (1 - latFrac * 0.55),
  );

  return {
    move: { x: rushX, y: clamp(rushY, CENTER.y - GOAL_HALF * 0.52, CENTER.y + GOAL_HALF * 0.52) },
    sprint: true,
    facing: Math.atan2(striker.y - gk.y, striker.x - gk.x),
    rush: true,
    moveSpeedCap: cfg.positionMaxSpeed * (1.28 + rushFactor * 0.22),
  };
}

function computeReactionDelay(timeToPlane, immediate = false, curved = false){
  const cfg = gkCfg();
  const lead = estimateDiveLeadTime(timeToPlane);
  // Curva: anticipar el compromiso de vuelo/estirada hacia el punto real.
  const curveLeadBoost = curved ? 0.06 : 0;
  const scheduled = (timeToPlane ?? 0.5) - lead - curveLeadBoost;

  let delay;
  if(immediate){
    delay = clamp(scheduled, 0.03, cfg.reactionDelay + 0.10);
  } else if(timeToPlane <= cfg.closeShotTime){
    delay = clamp(scheduled, 0.03, cfg.reactionDelay * 0.55);
  } else if(timeToPlane <= cfg.farShotTime){
    delay = clamp(scheduled, 0.05, cfg.reactionDelay + 0.14);
  } else {
    delay = clamp(scheduled, 0.08, timeToPlane - GK_DIVE_MIN_DUR - 0.05);
  }
  return curved ? delay * 0.84 : delay;
}

/** Punto de estirada: deriva determinista si está mal posicionado o el tiro es sorprendente. */
function computeDiveTargetY(gk, targetY, timeToPlane, speed, curved = false){
  const cfg = gkCfg();
  const ideal = computeIdealGkPosition(gk, ball.x, ball.y, timeToPlane);
  const posError = dist2D(gk, ideal);
  const posErrorNorm = posError / Math.max(GOAL_HALF * cfg.positionErrorScale, 0.01);
  const power = clamp(
    (speed - cfg.weakShotSpeed) / Math.max(cfg.hardShotSpeed - cfg.weakShotSpeed, 0.01),
    0, 1,
  );
  const placement = Math.abs(targetY - CENTER.y) / Math.max(GOAL_HALF, 0.01);
  // Con efecto: menos recorte al centro — priorizar el y real de la curva.
  const maxUnder = curved ? 0.18 : 0.42;
  const undershoot = clamp(posErrorNorm * 0.55 + power * 0.22 + placement * 0.12, 0, maxUnder);
  const side = targetY >= gk.y ? 1 : -1;
  const adjusted = targetY - side * undershoot * GOAL_HALF;
  return clamp(adjusted, CENTER.y - GOAL_HALF + 0.15, CENTER.y + GOAL_HALF - 0.15);
}

function registerShotReaction(gk, intercept, immediate = false){
  if(gk.diveAnim) return;
  const existing = gk.gkShotReaction;
  if(existing && !immediate && existing.timeToPlane <= intercept.timeToPlane + 0.05) return;

  const cfg = gkCfg();
  const speed = ballHorizSpeed(ball);
  const curved = !!(intercept.curved || ballHasLateralCurve(ball));
  const delay = computeReactionDelay(intercept.timeToPlane, immediate, curved);
  let reach = intercept.reachChance ?? cfg.reachBase;
  if(delay > intercept.timeToPlane * 0.42) reach *= 0.48;
  if(curved) reach = Math.min(0.92, reach * 1.06);

  gk.gkShotReaction = {
    delay,
    targetY: computeDiveTargetY(gk, intercept.targetY, intercept.timeToPlane, speed, curved),
    predZ: intercept.predZ,
    timeToPlane: intercept.timeToPlane,
    curved,
    useCatch: intercept.useCatch,
    saveChance: intercept.saveChance ?? reach * 0.65,
    reachChance: clamp(reach, 0.04, 0.92),
    animState: intercept.animState,
    parryMode: intercept.parryMode,
    forceCatch: intercept.forceCatch,
    jumpHeight: intercept.jumpHeight,
  };
}

function consumeGkShotReaction(gk){
  const react = gk.gkShotReaction;
  if(!react || react.delay > 0) return null;
  gk.gkShotReaction = null;
  if(gk.diveAnim) return null;
  const cfg = gkCfg();

  return {
    targetY: react.targetY,
    predZ: react.predZ,
    timeToPlane: react.timeToPlane,
    useCatch: react.useCatch,
    parryChance: react.saveChance ?? cfg.reachBase * 0.65,
    reachChance: react.reachChance ?? cfg.reachBase,
    animState: react.animState,
    parryMode: react.parryMode,
    forceCatch: react.forceCatch,
    jumpHeight: react.jumpHeight,
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
export function planGoalkeeperAI(gk, dt, allPlayers){
  if(!gk || gk.role !== 'GK') return null;
  if(gk.gkKickAnim) return null;

  tickGkProactiveClaim(gk, dt);

  // Prioridad absoluta: balón suelto/dividido en área anula estirada estática.
  const loosePlan = evaluateLooseBallClaim(gk, allPlayers, { ignoreDive: true });
  if(loosePlan){
    if(gk.diveAnim) cancelGkDiveForLooseClaim(gk, 'loose_interrupt');
    return loosePlan;
  }

  if(gk.diveAnim) return null;

  // 1v1 / achique: prioridad sobre reacción a tiro cuando el delantero conduce.
  if(allPlayers?.length){
    const striker = detectOneVsOne(gk, allPlayers);
    if(striker){
      gk.gkShotReaction = null;
      const onePlan = planOneVsOne(gk, striker);
      if(onePlan) return onePlan;
    }
  }

  tickGkShotReactionDelay(gk, dt);

  const cfg = gkCfg();
  const pendingReact = gk.gkShotReaction;
  if(pendingReact && pendingReact.delay > 0){
    const ideal = computeIdealGkPosition(gk, ball.x, ball.y, pendingReact.timeToPlane);
    return {
      move: ideal,
      sprint: true,
      moveSpeedCap: cfg.positionMaxSpeed * (pendingReact.timeToPlane > cfg.mediumShotTime ? 1.14 : 1.08),
      facing: Math.atan2(ball.y - gk.y, ball.x - gk.x),
    };
  }

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

  const shotImmediate = ball.lastKickType === 'shot';
  const incomingShot = ball.owner ? null : evaluateIncomingShot(gk, ball);
  if(incomingShot){
    registerShotReaction(gk, incomingShot, shotImmediate);
  } else if(isActiveShotEvent(ball) && isShotMovingTowardGoal(ball, gk)){
    const intercept = calculateIntercept(
      {
        vx: ball.vx, vy: ball.vy, vz: ball.vz,
        curveFactor: ball.curveFactor, shotStyle: ball.shotStyle,
        initialSpeed: ball.initialSpeed, curveMaxSpeed: ball.curveMaxSpeed,
        curveLineOrigin: ball.curveLineOrigin, curveLineDir: ball.curveLineDir,
        curvePassTarget: ball.curvePassTarget, curveMaxDrift: ball.curveMaxDrift,
        highKick: ball.highKick, highKickType: ball.highKickType,
        lastKickType: ball.lastKickType, groundFrictionMult: ball.groundFrictionMult,
        ballDamping: ball.ballDamping,
      },
      { x: ball.x, y: ball.y, z: ball.z },
      gk,
    );
    if(intercept) registerShotReaction(gk, intercept, shotImmediate);
  }

  const target = computeTrianglePosition(gk, ball);
  const distToTarget = dist2D(gk, target);
  const shotThreat = incomingShot || (isActiveShotEvent(ball) && isShotMovingTowardGoal(ball, gk));

  const cfgMove = gkCfg();
  return {
    move: target,
    sprint: distToTarget > GK_AI.POSITION_SPRINT_DIST || !!shotThreat,
    moveSpeedCap: shotThreat
      ? cfgMove.positionMaxSpeed * (incomingShot?.timeToPlane > cfgMove.mediumShotTime ? 1.12 : 1.08)
      : cfgMove.positionMaxSpeed,
    facing: Math.atan2(ball.y - gk.y, ball.x - gk.x),
  };
}

/** Alerta a los arqueros rivales en el mismo frame del disparo (trayectoria anticipada). */
export function alertGoalkeepersOnShot(shooter, players){
  if(!shooter || !ball || ball.lastKickType !== 'shot') return;
  const list = players || [];
  for(const gk of list){
    if(!gk || gk.role !== 'GK' || gk.team === shooter.team) continue;
    if(gk.diveAnim || gk.gkKickAnim) continue;
    let threat = evaluateIncomingShot(gk, ball);
    if(!threat){
      threat = calculateIntercept(
        {
          vx: ball.vx, vy: ball.vy, vz: ball.vz,
          curveFactor: ball.curveFactor, shotStyle: ball.shotStyle,
          initialSpeed: ball.initialSpeed, curveMaxSpeed: ball.curveMaxSpeed,
          curveLineOrigin: ball.curveLineOrigin, curveLineDir: ball.curveLineDir,
          curvePassTarget: ball.curvePassTarget, curveMaxDrift: ball.curveMaxDrift,
          highKick: ball.highKick, highKickType: ball.highKickType,
          lastKickType: ball.lastKickType, groundFrictionMult: ball.groundFrictionMult,
          ballDamping: ball.ballDamping,
        },
        { x: ball.x, y: ball.y, z: ball.z },
        gk,
      );
    }
    if(threat) registerShotReaction(gk, threat, true);
  }
}

/** Reinicia estado de IA del arquero de práctica. */
export function resetPracticeGoalkeeperAI(gk){
  if(!gk) return;
  gk.gkShotReaction = null;
  gk.gkProactiveClaim = null;
  gk.diveAnim = null;
}
