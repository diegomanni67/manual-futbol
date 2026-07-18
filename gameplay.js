"use strict";

import { updateHumanControl, readInput, snapshotKeys, remapMoveForCamera, handleRightStickSwitch, isUIModeActive } from './state.js';
import {
  assignInputSources, updateFakeShotState, isBallAerialLoose,
  KB_P1_SOLO, KB_P1_SHARED, KB_P2, updateSelfTouchCollectBlock,
  canAerialContact, cancelManualRunIfBallOwner, chargePowerFromElapsed,
  clearChargingShotState, clearPendingAction, completeFakeShot,
  estimateKickTarget, executeKick, findPassReceiverByIntent,
  handleAerialContact, nearestTeammateToPoint, notifyManualRunPossessionChange,
  predictBallLanding, PREP_MIN_MS, startManualRun, syncManualRunWithPossession,
  triggerGoalkeeperKick, updateAirLock, updateAirStrikeAnim, updateChasing,
  updateDragBack, updateFeint, updateForcedChase, updateGkKickAnim,
  updatePendingKick, updateKickoffManeuver, checkActionExecution, updateActionBufferPhysics,
  applyParedStickInput, applyManualRunStickInput, computeParedCurvedDir, shouldIgnoreManualRunPartner, getPlayerRunningSpeed, getForwardRunDirection,
  finishManualRun,
} from './input.js';
import { isControlledByHuman } from './render.js';

import { updateMovement, movePlayer, movePlayerRuptura, clampPlayerVelocity, enforceAllPlayerSpeedCaps, isPlayerInRupturaRun, getRupturaRunMaxSpeed, setRupturaRunVelocity, ballInTackleBox, applyTackleCarryInertia, tackleAnimProgress, canChainTackle, isBallAboveKnee, hasRivalPossession, isLooseBallForDefense, isWithinSlideReceptionZone, canUseStandingTackle, canUseSlideTackle, startTackle, tryDefensiveTackleInput, resolveStandTackle, computeSlideHitbox, ballIntersectsSlideHitbox, randomDirInCone, slideTackle, resolveTackleImpact, updateSlidePosition, checkSlideFoul, updateTackleAnim, startGKDive, startGKCatchSave, updateGKDive, buildBoundaryWalls, resetGoalZoneTracking, clearGoalNetTriggerState, buildGoalFrame, isBallPastGoalLine, isBallInGoalMouth, isBallInsideGoalVolume, getGoalNetSide, getGoalNetFrictionMult, isInsideGoalTrigger, isBallTouchingNetMesh, updateGoalNetTriggerPhysics, isBallNearGoalArea, getOutZoneFrictionMult, getGoalAreaFrictionMult, getGoalBackLineX, getGoalExitMarginX, registerGoalOnLineCross, ballCrossedGoalLinePlane, ballPassedGoalZone, isBallInGoalZone, isValidGoalTrigger, markGoalZonePassed, onGoalZoneTriggerEnter, tryRegisterGoal, checkGoalLinePosition, checkBallStuck, updateGoalZoneTriggers, dampGoalStructureBounce, isInsideGoalCavity, resolveGoalSolid, resolveGoalLateralNets, resolveBackNet, resolveGoalFrameCollisions, resolveGoalStructureCollisions } from './physics.js';

import { planGoalkeeperAI, resetPracticeGoalkeeperAI } from './gkAi.js';

import {
  clearInterceptPassState, getPassDetectRadius, isDeepInterceptPassLocked,
  isInterceptingPass, registerThroughPass, tickInterceptPassStates,
  positionCornerAttackers, positionCornerDefenders, aiSuggestThrowInTargets, maintainCornerAttackPositions,
} from './passingManager.js';

import { SECONDARY_PRESS, AI_SECONDARY_PRESSING, AI_RUPTURA, AI_RUPTURA_MANUAL, MOVING_TO_BALL } from './gameplay_constants.js';

import { forcePossessionLoss, isBallInValidGoalBox, onGoal, isBallOutsideFieldLines, isBallInOutZone, resolveBoundaryWallAbsorb, resolveBoundaryWallCollisions, defendingTeamForGoalLine, attackingTeamForGoalLine, cornerPositionForGoalLineExit, goalKickPositionForGoalLine, enterDeadBallState, computeOutZoneSetPiece, onBallOut, updateWaitingForRetrieval, checkFieldLimits, checkGoalsAndBounds, resumeFromDeadBall, updateDeadBallRestart, resetPracticeOutOfPlay, updateGoalRoll, scoreGoal, showGoalOverlay, hideGoalOverlay, isGoalOverlayVisible, resolveCelebrationScorer, idleAllPlayersExceptScorer, pickCelebrationFestejo, triggerScorerCelebrationAnim, celebrationResumePressed, triggerGoalCelebrationState, beginCelebrationRun, finishCelebrationRun, updateCelebrationRunCpuMovement, updateCelebrationRunControl, updateCelebrationRun, runCelebrationRunSim, restartAfterGoal } from './physics.js';

import { AERIAL_PHYSICS, AIR_AERIAL_MIN_Z, AIR_BICYCLE_MAX_Z, AIR_BICYCLE_MIN_Z, AIR_CONTACT_RADIUS, AIR_DRAG, AIR_DUEL_MANUAL_L2_LOSE_PENALTY, AIR_DUEL_RADIUS, AIR_HEADER_MAX_Z, AIR_HEADER_MIN_Z, AIR_HEADER_RIVAL_NEAR_DIST, AIR_HEADER_RIVAL_PROX_PENALTY, AIR_HEADER_STAND_MIN_Z, AIR_MANUAL_RIVAL_NEAR_DIST, AIR_MANUAL_RIVAL_PROX_PENALTY, AIR_MAX_HUMAN_REACH_Z, AIR_SPAM_SIM_STEP, AIR_SPAM_WINDOW_MS, AIR_VOLLEY_L2_MAX_Z, AIR_VOLLEY_L2_MIN_Z, AIR_VOLLEY_MAX_Z, AIR_VOLLEY_MIN_Z, AUTOPASE_POWER_THRESHOLD, BALL_AERIAL_MIN_Z, BALL_KNEE_HEIGHT_Z, BALL_RADIUS, BALL_STATE, CAM, CENTER, CTRL_RADIUS, DRIBBLE_STEAL_RADIUS, FIELD_L, FIELD_W, GK_BALL_BOUNCE, GK_BALL_HITBOX_RADIUS, GK_CATCH_CHANCE, GK_DIVE_SPEED, GK_INTERCEPTION_RADIUS, GK_MAX_REACH_Z, GK_MIN_SHOT_SPEED, GK_SAVE_RADIUS, GLOBAL_TIME_SCALE, GOAL_HALF, GOAL_LINE_LEFT, GOAL_LINE_RIGHT, GRAVITY, physicsConfig } from './state.js';

import { Game, IA_BALL_MOVING_MIN, IA_LANDING_JOG_FACTOR, IA_LANDING_TIMING_MARGIN, IA_LANDING_WAIT_DIST, IA_SEEKING_RADIUS, IA_SEEKING_SLOW_DIST, INTERCEPTION_REACT_MAX, INTERCEPTION_REACT_MIN, LONGPASS_SWITCH_LOCK_MS, MAN_MARK_ACTIVATE_DIST, MAN_MARK_MIN_DIST, NEAREST_PLAYER_UPDATE_INTERVAL, PBOX_D, PBOX_HALFW, PENDING_ACTION_EXECUTE_RADIUS, PrivateChaseEvents, SBOX_D, SBOX_HALFW, SET_PIECE, SET_PIECE_FORCE_MULT, SET_PIECE_POWER_MAX_MS, SET_PIECE_TIMER_DURATION, SET_PIECE_UNSTICK_DIST, STAGGERED_DURATION, STUMBLE_DURATION, STUN_IMPACT_DURATION, TACKLE_COOLDOWN, THROW_IN_ANIM_RELEASE, THROW_IN_ANIM_WINDUP, THROW_IN_APPROACH_DIST, THROW_IN_FORCE, THROW_IN_HAND_Z, THROW_IN_LINE_Y, ZONE_MARK_RADIUS, allPlayers, applyBallLateralCurve, applyStaggered, applyStun, assignBallPossession, awayTeam, updateGlobalReinstatementCooldown } from './state.js';

import { ball, canvas, clamp, clearAirSpamUiState, clearBallLock, clearChasingState, clearEffortChaseLock, clearEffortSprintState, clearForcedChaseState, clearGkPossessionType, clearPlayerAIState, dist2D, fakeShotOwnerId, finalizeBallFrame, gameState, getBallAirGravity, getBallLogicalOwner, getChaseInterceptTarget, getDefaultDribbleDistance, getEffortChaseOwner, getPlayerMoveSpeedBase, homeTeam, inferGkPossessionSource, initGkPossessionType, interruptForcedChaseForAction, isBallContestedRival, isBallContestedSeekAllowed, isBallDead, isBallLocked, isBallSetPieceFrozen, isBallWaitingForRetrieval, isChaseOwner, isEffortTouchDefenderFrozen, isExtendedDribbleActive, isFakeShotActive, isGkBallCollidable, isGkFeetPossession, isGkGrabBlockedForSetPiece, isGkHandsImmune, isGkHandsPossession, isGkKickInProgress, isGoalKickReadyState, isGoalkeeper, isPlayerPerformingSkill, isPlayerSprintChasing, setAirSpamWindowUiActive, applyBallAirHorizontalDrag } from './state.js';

import { isManualAction, isManualMode, isPlayerChasing, isPlayerForcedChasing, isPlayerStaggered, isPlayerStunned, isPossessionIgnored, isPostTouchChasing, isTacklePossessionPending, isTeammateBlockedFromEffortChase, isThrowInPossessionBlocked, isThrowInTakerBlocked, lerp, norm, playerInControlRange, playerInStrictControlRange, practiceGK, projScale, recoverFakeShotPossession, resetDribbleDistance, resolveInputCurve, setBallStateInPossession, setBallStateLoose, setControlled, setControlled2, startForcedChase, syncPlayerDir, updateBallContested, updateEffortTouchDefenderFreeze, updateGkHandsTimer, updateGkPossessionTransitions, updateIgnorePossession, userWantsPossessionAction, isCpuBlockedFromTeammateLooseBall, getTeammateSupportTarget, getTacticalBlockSlot, syncHumanTeamControlOnPossession, canTakeBallFromOwner, isEffortTouchPendingReclaim, clearSprintChaseState, applyKickoffOccupationTarget, updateKickoffOccupationTimer, isKickoffBallContestable, getDiveSideAnim, lookAtFacing, purgeCpuMovementForHuman } from './state.js';

import {
  SetPieceManager,
  KickoffManager,
  STATE_KICKOFF,
  applyThrowInImpulse, autoExecuteSetPiece, bindThrowInBall, clearActiveSetPieceTaker,
  clearPlayerSetPieceState, cornerFlagPosition, defaultSetPieceAimDir, enterPlayingAfterAutoRestart,
  enforceRestartPositionRestrictions, executeAutoKickoff, executeAutoRestart, executeGoalKickRelease,
  executeSetPieceRelease, getSetPieceBallPosition,
  goalAreaCornerPosition, handleSetPiecePowerInput, handleSetPieceTimeout, handleThrowInInput,
  isKickoffActive, isKickoffTaker, isKickoffWaiting, isOnBallContactBlocked, isSetPieceAwaitingExecution, isSetPieceShotOnly, isSetPieceTaker,
  getKickoffTaker, notifyRestartBallTouchedByOther,
  maintainGoalKickPlacement, maintainKickoffPlacement,
  onSetPieceBallReleased, performAutoSetPieceKick, placeGoalKickBall, positionSetPieceTaker,
  refreshSetPieceBlockDribbling, resetGoalkeeperForGoalKick, resetKickoffManager, resetSetPieceCharge,
  resetSetPieceManager,
  restartSetPieceForTeam, setSetPieceMode, setupGoalKick, setupThrowIn, startSetPieceCharge,
  throwInFacingForSide, throwInLinePosition, transferPossessionToOpponent, triggerGoalkeeperSetPieceKick,
  tryEnterThrowInPosition, unproject, updateKickoffManager, updateSetPieceManager, updateSetPieceRelease,
  updateThrowInAnim,
  updateThrowInSystem,
} from './state.js';

/* ============================================================
   "LA PARED" (uno-dos): L1 + pase (X) — estilo EA FC.
   Al soltar, el pasador arranca hacia el arco rival (curva suave). Durante 2 s el stick
   derecho puede redirigir la carrera una sola vez. El cursor salta al receptor del pase.
   ============================================================ */
const WALLRUN_MAX_DURATION = 3.5; // seg TOPE de seguridad (por si nunca llega a la altura del area, ej. corriendo de costado)
const WALLRUN_BOX_DEPTH = 16.5;   // metros: profundidad reglamentaria del area rival, medida desde el fondo
const WALLRUN_MIN_MATE_DIST = 22; // no busca companeros mas lejos que esto: es un pase CORTO
const MANUAL_RUN_SPEED_MULT = 0.92;       // ligeramente por encima del trote (0.72), muy por debajo del sprint (1.42)
const MANUAL_RUN_CURVE_BIAS = 0.05;       // atraccion lateral hacia el espacio libre (curva suave)
const OFFENSIVE_RUN_GOAL_WEIGHT = 0.7;    // sesgo ofensivo: hacia el arco rival
const OFFENSIVE_RUN_DIR_WEIGHT = 0.3;     // sesgo ofensivo: continuidad de la direccion actual
const MANUAL_RUN_SHORT_DIST_THRESHOLD = 2.0; // pasador-receptor muy cerca: deadzone de stick
const MANUAL_RUN_SHORT_GRACE_TIME = 0.15;  // 150ms / ~10 frames a 60fps sin lectura de stick
const MANUAL_RUN_PASSER_IGNORE_DIST = 3.0; // hasta alejarse 3m, ignorar al pasador en recalculo
const MANUAL_RUN_VEL_LERP = 0.1;           // inercia al arrancar el desmarque
const PARED_STICK_WINDOW = 2.0;            // seg — ventana para redirigir la carrera con stick derecho
const PARED_STICK_DEADZONE = 0.3;          // deadzone del stick derecho durante la pared
function bestWallPassTarget(p){
  const mates = (p.team==='home'?homeTeam:awayTeam).filter(m=>m.id!==p.id);
  let best=null, bestScore=-Infinity;
  for(const m of mates){
    const d = dist2D(p,m);
    if(d>WALLRUN_MIN_MATE_DIST) continue;
    const forwardProgress = (m.x-p.x)*p.attackDir();
    let openness=999;
    for(const opp of allPlayers){ if(opp.team===p.team) continue; openness=Math.min(openness,dist2D(opp,m)); }
    const score = forwardProgress*0.6 + openness*1.4 - d*0.2;
    if(score>bestScore){ bestScore=score; best=m; }
  }
  return best;
}
// cursor instantaneo de L1+X cuando no se arma "la pared" (no hay compañero cerca): usa la misma
// logica de intencion por angulo del stick que los pases normales (findPassReceiverByIntent).
function nearestTeammateInDirection(p, dir){
  return findPassReceiverByIntent(p, dir, p.id);
}
// se llama al SOLTAR el pase (X) cuando se venia cargando como 'wallpass' (X sostenido junto con L1).
function releaseWallPass(p, team, aimDir, curve, padIndex){
  if(!p.charging || ball.owner!==p){ p.charging=null; return; }
  const elapsed = performance.now()-p.chargeStart;
  const power = clamp(chargePowerFromElapsed(elapsed), 0.14, 1);
  p.charging = null;
  const dir = norm(aimDir);
  const remainingMs = PREP_MIN_MS - elapsed;
  if(remainingMs > 0){
    p.pendingKick = { type:'pass', aimDir: dir, power, curve, remaining: remainingMs/1000, wallPass:true, padIndex: padIndex ?? null };
    return;
  }
  executeKick(p, 'pass', dir, power, curve);
  const mate = nearestTeammateInDirection(p, dir) || bestWallPassTarget(p);
  if(mate){
    startManualRun(p, dir, mate, { isPared: true, padIndex: padIndex ?? null });
    if(team==='home'){ setControlled(mate); }
    else { setControlled2(mate); }
  }
}


/* ============================================================
   DUELOS AÉREOS — spam-battle (400ms antes del contacto)
   ============================================================ */
function isValidAerialHeight(z){
  if(z <= AIR_AERIAL_MIN_Z || z > AIR_MAX_HUMAN_REACH_Z) return false;
  if(z >= AIR_HEADER_STAND_MIN_Z && z <= AIR_MAX_HUMAN_REACH_Z) return true;
  if(z > AIR_VOLLEY_L2_MIN_Z && z <= AIR_VOLLEY_L2_MAX_Z) return true;
  if(z >= AIR_BICYCLE_MIN_Z && z <= AIR_BICYCLE_MAX_Z) return true;
  return false;
}

function isAirDuelContestant(p){
  const duel = Game.airDuel;
  return !!(duel && duel.active && !duel.resolved && duel.contestants.includes(p.id));
}

function isAirDuelSpamWindowOpen(duel){
  if(!duel || duel.resolved) return false;
  const timeToImpact = duel.impactT - duel.t;
  return timeToImpact <= AIR_SPAM_WINDOW_MS / 1000 && timeToImpact > -0.02;
}

function syncAirSpamWindowUiFlag(){
  const duel = Game.airDuel;
  setAirSpamWindowUiActive(!!(duel && duel.active && !duel.resolved && isAirDuelSpamWindowOpen(duel)));
}

function getAirDuelContenders(){
  if(!isBallAerialLoose()) return [];
  const near = allPlayers.filter(p =>
    p.role !== 'GK' &&
    p.releaseCooldown <= 0 &&
    !p.tackleAnim && !p.airStrikeAnim && !p.diveAnim &&
    dist2D(p, ball) < AIR_DUEL_RADIUS &&
    (!isManualMode || !isCpuPlayer(p) || canCpuReceivePass(p))
  );
  const teams = new Set(near.map(pl => pl.team));
  if(teams.size < 2) return [];
  return near;
}

function predictAerialImpactForDuel(contestants){
  const refX = contestants.reduce((s, pl) => s + pl.x, 0) / contestants.length;
  const refY = contestants.reduce((s, pl) => s + pl.y, 0) / contestants.length;
  const g = getBallAirGravity(ball);
  let x = ball.x, y = ball.y, z = ball.z;
  let vx = ball.vx, vy = ball.vy, vz = ball.vz;
  const cf = ball.curveFactor || 0;
  const initSpd = Math.hypot(vx, vy) || ball.initialSpeed || 1;
  let t = 0;
  const dragSim = {highKick: ball.highKick, highKickType: ball.highKickType, vx, vy};
  while(t <= 2.5){
    const d = Math.hypot(x - refX, y - refY);
    if(d < AIR_CONTACT_RADIUS && isValidAerialHeight(z)){
      return {t, x, y, z};
    }
    if(z > BALL_RADIUS){
      dragSim.vx = vx;
      dragSim.vy = vy;
      applyBallAirHorizontalDrag(dragSim, AIR_SPAM_SIM_STEP);
      vx = dragSim.vx;
      vy = dragSim.vy;
    }
    const sim = {
      vx, vy, z, x, y,
      curveFactor: cf,
      initialSpeed: initSpd,
      curveMaxSpeed: ball.curveMaxSpeed || initSpd,
      curveLineOrigin: ball.curveLineOrigin,
      curveLineDir: ball.curveLineDir,
      curvePassTarget: ball.curvePassTarget,
      curveMaxDrift: ball.curveMaxDrift,
    };
    applyBallLateralCurve(sim, AIR_SPAM_SIM_STEP);
    vx = sim.vx; vy = sim.vy; x = sim.x; y = sim.y;
    vz -= g * AIR_SPAM_SIM_STEP;
    x += vx * AIR_SPAM_SIM_STEP;
    y += vy * AIR_SPAM_SIM_STEP;
    z += vz * AIR_SPAM_SIM_STEP;
    t += AIR_SPAM_SIM_STEP;
    if(z <= BALL_RADIUS) break;
  }
  const dNow = Math.hypot(ball.x - refX, ball.y - refY);
  const spd = Math.hypot(ball.vx, ball.vy) || 1;
  return {t: clamp(dNow / spd, 0.08, 0.28), x: ball.x, y: ball.y, z: ball.z};
}

function aerialSpamButtonFromInput(input){
  if(input.pressShot) return 'shot';
  if(input.pressPass || input.pressThrough) return 'pass';
  if(input.pressCross) return 'cross';
  return null;
}

function registerAirSpamPress(p, input, curveOverride){
  const duel = Game.airDuel;
  if(!duel || duel.resolved || !isAirDuelSpamWindowOpen(duel)) return;
  if(!duel.contestants.includes(p.id)) return;
  const btn = aerialSpamButtonFromInput(input);
  if(!btn) return;
  const curve = curveOverride !== undefined ? curveOverride : resolveInputCurve(input);
  const entry = duel.spamCounts[p.id] || {count: 0, actionButton: btn, curve: 0, manualL2: false};
  entry.count++;
  entry.actionButton = btn;
  entry.curve = curve;
  entry.manualL2 = !!(input.heldL2 && btn === 'shot');
  duel.spamCounts[p.id] = entry;
}

function nearestRivalDistance(p, contestants){
  let minD = Infinity;
  for(const other of contestants){
    if(other.team === p.team) continue;
    minD = Math.min(minD, dist2D(p, other));
  }
  return minD;
}

// Spam efectivo: cabezazo estable vs L2+remate arriesgado (penalizacion base + proximidad rival).
function getAerialDuelEffectiveSpam(p, entry, contestants){
  let count = entry ? entry.count : 0;
  if(count <= 0) return 0;

  const manualL2 = !!(entry && entry.manualL2);
  const rivalDist = nearestRivalDistance(p, contestants);

  if(manualL2){
    count *= (1 - AIR_DUEL_MANUAL_L2_LOSE_PENALTY);
    if(rivalDist < AIR_MANUAL_RIVAL_NEAR_DIST){
      const t = (AIR_MANUAL_RIVAL_NEAR_DIST - rivalDist) / AIR_MANUAL_RIVAL_NEAR_DIST;
      count *= Math.max(0.25, 1 - t * AIR_MANUAL_RIVAL_PROX_PENALTY);
    }
  } else if(rivalDist < AIR_HEADER_RIVAL_NEAR_DIST){
    const t = (AIR_HEADER_RIVAL_NEAR_DIST - rivalDist) / AIR_HEADER_RIVAL_NEAR_DIST;
    count *= Math.max(0.55, 1 - t * AIR_HEADER_RIVAL_PROX_PENALTY);
  }
  return count;
}

function pickSpamDuelWinner(duel, contestants){
  let best = null, bestCount = -1;
  for(const p of contestants){
    const entry = duel.spamCounts[p.id];
    const count = getAerialDuelEffectiveSpam(p, entry, contestants);
    if(count > bestCount){
      bestCount = count;
      best = p;
    } else if(count === bestCount && best && dist2D(p, ball) < dist2D(best, ball)){
      best = p;
    }
  }
  if(!best && contestants.length){
    best = contestants.reduce((a, b) => dist2D(a, ball) < dist2D(b, ball) ? a : b);
  }
  return best;
}

function finalizeAirSpamDuel(){
  const duel = Game.airDuel;
  if(!duel || duel.resolved) return;
  duel.resolved = true;
  const contestants = duel.contestants
    .map(id => allPlayers.find(pl => pl.id === id))
    .filter(Boolean);
  const winner = pickSpamDuelWinner(duel, contestants);

  for(const pl of contestants){
    if(!winner || pl.id !== winner.id){
      clearPendingAction(pl);
      pl.stumble = {t: 0, dur: STUMBLE_DURATION};
    }
  }

  if(winner){
    const entry = duel.spamCounts[winner.id];
    const btn = entry ? entry.actionButton : 'shot';
    const curve = entry ? entry.curve : 0;
    const manualL2 = !!(entry && entry.manualL2);
    if(canAerialContact(winner) || dist2D(winner, ball) < PENDING_ACTION_EXECUTE_RADIUS){
      handleAerialContact(winner, ball, btn, 1.0, curve, manualL2);
    }
  }

  clearAirSpamUiState();
}

function updateAirSpamDuelAI(p, dt){
  if(isManualMode && isCpuPlayer(p)) return;
  const duel = Game.airDuel;
  if(!duel || duel.resolved || !duel.contestants.includes(p.id)) return;
  if(!isAirDuelSpamWindowOpen(duel) || isControlledByHuman(p)) return;
  const rate = p.role === 'FWD' ? 13 : (p.role === 'MID' ? 9 : 6);
  if(Math.random() >= rate * dt) return;
  const roll = Math.random();
  const input = roll < 0.55 ? {pressShot: true} : (roll < 0.85 ? {pressPass: true} : {pressCross: true});
  // IA prefiere cabezazo (sin L2): accion estable en duelos aereos
  registerAirSpamPress(p, input, 0);
}

function updateAirSpamDuelSystem(dt){
  const contenders = getAirDuelContenders();

  if(!Game.airDuel){
    if(contenders.length >= 2){
      const impact = predictAerialImpactForDuel(contenders);
      const impactT = Math.max(impact.t, 0.05);
      Game.airDuel = {
        active: true,
        t: 0,
        impactT,
        impactPoint: impact,
        contestants: contenders.map(pl => pl.id),
        spamCounts: {},
        resolved: false,
        spamStart: Math.max(0, impactT - AIR_SPAM_WINDOW_MS / 1000),
      };
    }
    syncAirSpamWindowUiFlag();
    return;
  }

  const duel = Game.airDuel;
  if(duel.resolved) return;

  duel.t += dt;

  if(!isBallAerialLoose() || getAirDuelContenders().length < 2){
    clearAirSpamUiState();
    return;
  }

  duel.readyToResolve = duel.t >= duel.impactT;
  syncAirSpamWindowUiFlag();
}

function resolveAirSpamDuelIfReady(){
  const duel = Game.airDuel;
  if(!duel || duel.resolved) return;
  if(duel.readyToResolve) finalizeAirSpamDuel();
}

function executeGoalkeeperAIPlan(gk, plan){
  if(!plan) return;
  if(plan.save === 'catch'){
    startGKCatchSave(gk, plan.targetY, plan.timeToPlane, plan.predZ, {
      parryChance: plan.parryChance ?? GK_CATCH_CHANCE,
      animState: plan.animState || 'CATCH',
    });
    ball.lastKickType = null;
    return;
  }
  if(plan.save === 'dive'){
    startGKDive(gk, plan.targetY, plan.timeToPlane, plan.predZ, {
      saveMode: 'dive',
      animState: plan.animState,
      parryChance: plan.parryChance ?? GK_CATCH_CHANCE,
    });
    ball.lastKickType = null;
    return;
  }
  if(!plan.move) return;
  const dx = plan.move.x - gk.x;
  const dy = plan.move.y - gk.y;
  const d = Math.hypot(dx, dy);
  const md = d > 0.05 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
  movePlayer(gk, plan.dt ?? 0, md, plan.sprint && d > 2.5, false);
  if(plan.facing != null) gk.facing = plan.facing;
}

function runGoalkeeperAI(gk, dt){
  const plan = planGoalkeeperAI(gk, dt);
  if(plan?.move) plan.dt = dt;
  executeGoalkeeperAIPlan(gk, plan);

  if(ball.owner === gk && isGkFeetPossession(gk)){
    const goalX = gk.ownGoalX();
    const dir = gk.attackDir();
    const targetX = clamp(goalX + dir * 7.5, goalX + dir * 2.5, goalX + dir * 12);
    const targetY = clamp(gk.y, CENTER.y - PBOX_HALFW + 1.2, CENTER.y + PBOX_HALFW - 1.2);
    const mdx = targetX - gk.x;
    const mdy = targetY - gk.y;
    const mdLen = Math.hypot(mdx, mdy);
    const md = mdLen > 0.05 ? { x: mdx / mdLen, y: mdy / mdLen } : { x: 0, y: 0 };
    movePlayer(gk, dt, md, false, false);
  }
}

function getPlayerCollisionMass(p){
  if(isGkFeetPossession(p)) return 1.0;
  return p.weightFactor || 1;
}

function gkReachRadius(gk){
  return gk.diveAnim ? GK_SAVE_RADIUS : GK_INTERCEPTION_RADIUS;
}

/** TRIGGER de atajada: detecta contacto y resuelve animación, sin bloqueo físico en el aire. */
function onGkBallTriggerEnter(gk, b){
  if(b.owner || b.isReadyToKick || b.state === BALL_STATE.PLACED) return false;
  if(b.z - BALL_RADIUS > GK_MAX_REACH_Z) return false;
  if(dist2D(gk, b) >= GK_SAVE_RADIUS) return false;

  b.highKick = false;
  b.highKickType = null;
  const dive = gk.diveAnim;
  const catches = dive?.forceCatch || Math.random() < (dive?.parryChance ?? GK_CATCH_CHANCE);
  if(catches){
    setBallStateInPossession(gk, 'save');
  } else {
    setBallStateLoose(true);
    b.lastTouchedBy = gk.id;
    b.lastTouchTeam = gk.team;
    const dir = gk.attackDir();
    const away = norm({x: dir, y: (Math.random()-0.5)*1.6});
    b.vx = away.x*7 + Math.random()*1.5;
    b.vy = away.y*6;
    b.vz = 1.6 + Math.random()*1.4;
  }
  b.lastTouchTeam = gk.team;
  if(dive){
    dive.resolved = true;
    dive.success = true;
  }
  gk.tackleCooldown = TACKLE_COOLDOWN * 0.5;
  return true;
}

function deflectBallOffGoalkeeper(gk, b){
  const dx = b.x - gk.x, dy = b.y - gk.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const nx = dx / d, ny = dy / d;
  const minD = GK_BALL_HITBOX_RADIUS + BALL_RADIUS;
  if(d < minD){
    b.x = gk.x + nx * minD;
    b.y = gk.y + ny * minD;
  }
  const vDotN = b.vx * nx + b.vy * ny;
  if(vDotN < 0){
    b.vx -= (1 + GK_BALL_BOUNCE) * vDotN * nx;
    b.vy -= (1 + GK_BALL_BOUNCE) * vDotN * ny;
  } else {
    b.vx += nx * 2.2;
    b.vy += ny * 2.2;
  }
  if(b.z > BALL_RADIUS){
    b.vz = Math.abs(b.vz) * 0.35 + 0.6;
  } else {
    b.vz = 1.2 + Math.random() * 0.8;
  }
  b.highKick = false;
  b.highKickType = null;
  b.lastTouchedBy = gk.id;
  b.lastTouchTeam = gk.team;
}

function tryGoalkeeperInterception(gk, b){
  if(b.owner === gk) return true;
  if(b.owner) return false;
  if(b.isReadyToKick || b.state === BALL_STATE.PLACED) return false;
  if(isGkGrabBlockedForSetPiece(gk)) return false;
  if(!isGkBallCollidable(gk)) return false;
  if(isGkKickInProgress(gk)) return false;
  if(b.z - BALL_RADIUS > GK_MAX_REACH_Z) return false;

  const horizDist = dist2D(gk, b);
  if(horizDist >= GK_INTERCEPTION_RADIUS) return false;

  const ballSpeed = Math.hypot(b.vx, b.vy, b.vz);
  const isShot = b.lastKickType === 'shot' || ballSpeed > GK_MIN_SHOT_SPEED * 0.7;
  if(!gk.diveAnim && (isShot || horizDist <= GK_BALL_HITBOX_RADIUS + BALL_RADIUS + 0.15)){
    const diveSide = getDiveSideAnim(gk, b.y);
    const useCatch = b.z <= GK_JUMP_MIN_Z + 0.5 && horizDist < 0.9;
    if(useCatch){
      startGKCatchSave(gk, b.y, 0.28, b.z, { parryChance: GK_CATCH_CHANCE, animState: 'CATCH' });
    } else {
      startGKDive(gk, b.y, 0.32, Math.max(b.z, 0.4), {
        animState: diveSide,
        parryChance: GK_CATCH_CHANCE,
      });
    }
  }

  const bodyContact = horizDist <= GK_BALL_HITBOX_RADIUS + BALL_RADIUS;
  if(bodyContact || Math.random() < GK_CATCH_CHANCE){
    b.highKick = false;
    b.highKickType = null;
    if(setBallStateInPossession(gk, 'save')){
      ball.lastTouchTeam = gk.team;
      gk.tackleCooldown = TACKLE_COOLDOWN * 0.5;
      return true;
    }
  }

  return false;
}

function resolveGoalkeeperBallContact(gk, b){
  if(b.isReadyToKick || b.state === BALL_STATE.PLACED) return;
  if(isGkGrabBlockedForSetPiece(gk)) return;
  if(b.owner === gk) return;
  if(b.owner && b.owner.team === gk.team && b.owner.role !== 'GK') return;

  // Estirada/salto: solo TRIGGER (updateGKDive → onGkBallTriggerEnter), sin colisión sólida.
  if(gk.diveAnim) return;

  const horizDist = dist2D(gk, b);
  const hitDist = GK_BALL_HITBOX_RADIUS + BALL_RADIUS;
  const ballAirborne = b.z - BALL_RADIUS > BALL_KNEE_HEIGHT_Z;

  if(!ballAirborne && horizDist <= GK_INTERCEPTION_RADIUS){
    tryGoalkeeperInterception(gk, b);
    return;
  }

  // Hitbox corporal pequeña solo con pelota baja — no bloquea tiros en el aire.
  if(!ballAirborne && horizDist < hitDist && b.z - BALL_RADIUS <= GK_MAX_REACH_Z){
    deflectBallOffGoalkeeper(gk, b);
  }
}

function resolveBallGoalkeeperCollisions(b){
  if(b.isReadyToKick || b.state === BALL_STATE.PLACED) return;
  if(b.state === BALL_STATE.IN_POSSESSION) return;
  if(b.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return;
  // waiting_for_retrieval: fisica activa con friccion en OutZone
  if(b.backNetContactT > 0) b.backNetContactT = Math.max(0, b.backNetContactT - dt);
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(isBallSetPieceFrozen()) return;

  for(const p of allPlayers){
    if(!isGkBallCollidable(p)) continue;
    resolveGoalkeeperBallContact(p, b);
  }
}

// separacion suave entre jugadores para que no se apilen
function checkDribbleStealCollisions(){
  const owner = ball.owner;
  if(!owner || ball.state !== BALL_STATE.IN_POSSESSION) return;
  if(isGkHandsPossession(owner)) return;
  if(!isExtendedDribbleActive(owner)) return;

  for(const rival of allPlayers){
    if(rival.team === owner.team) continue;
    if(isPlayerStunned(rival) || isPlayerStaggered(rival)) continue;
    if(rival.tackleCooldown > 0) continue;
    if(rival.secondaryPressActive) continue;
    if(isEffortTouchDefenderFrozen(rival)) continue;
    // Robo solo por colision de patrulla: nunca por seekBall hacia el portador
    if(rival.interceptionSeek || rival.iaSeeking || rival.isAttackingBall) continue;
    if(rival.aiMode === 'seeking') continue;
    if(dist2D(rival, ball) >= DRIBBLE_STEAL_RADIUS) continue;

    owner.isStunned = true;
    applyStun(owner, STUN_IMPACT_DURATION);
    applyStaggered(owner, STAGGERED_DURATION);
    resetDribbleDistance(owner);
    clearEffortSprintState(owner);
    owner.currentDribbleDistance = getDefaultDribbleDistance(owner);
    clearForcedChaseState(owner);
    clearChasingState(owner);
    clearEffortChaseLock(true);
    clearBallLock();
    ball.lastAction = null;
    rival.tackleCooldown = TACKLE_COOLDOWN * 0.75;
    ball.owner = rival;
    ball.state = BALL_STATE.IN_POSSESSION;
    notifyManualRunPossessionChange(rival, owner);
    ball.lastTouchTeam = rival.team;
    ball.lastTouchedBy = rival.id;
    clearGkPossessionType(owner);
    if(isGoalkeeper(rival)) initGkPossessionType(rival, null);
    else clearGkPossessionType(rival);
    const defDist = getDefaultDribbleDistance(rival);
    rival.currentDribbleDistance = defDist;
    rival.targetDribbleDistance = defDist;
    rival.dribbleKickDir = null;
    rival.dribbleExtendT = 0;
    clearChasingState(rival);
    clearInterceptionSeek(rival);
    rival.isAttackingBall = false;
    if(isFakeShotActive && owner.id === fakeShotOwnerId) completeFakeShot(owner);
    break;
  }
}

function resolveCollisions(){
  for(let i=0;i<allPlayers.length;i++){
    for(let j=i+1;j<allPlayers.length;j++){
      const a=allPlayers[i], b=allPlayers[j];
      // Inmunidad en manos: solo bloquea empujon entre rivales, NO la colision pelota-arquero
      if((isGkHandsImmune(a) && b.team !== a.team) || (isGkHandsImmune(b) && a.team !== b.team)) continue;
      const dx=b.x-a.x, dy=b.y-a.y;
      const d=Math.hypot(dx,dy);
      const minD=0.62;
      if(d<minD && d>0.0001){
        const nx=dx/d, ny=dy/d;
        const overlap = minD-d;
        const massA = getPlayerCollisionMass(a), massB = getPlayerCollisionMass(b);
        const totalMass = massA+massB;
        const aShare = massB/totalMass, bShare = massA/totalMass;
        a.x -= nx*overlap*aShare; a.y -= ny*overlap*aShare;
        b.x += nx*overlap*bShare; b.y += ny*overlap*bShare;
        // ademas del reacomodo de posicion, si venian corriendo uno contra el otro se suma un
        // pequeno empujon de velocidad (para que el choque se sienta, no solo "no atravesar")
        const closingSpeed = -((b.vx-a.vx)*nx + (b.vy-a.vy)*ny);
        if(closingSpeed>0.5){
          const impulse = clamp(closingSpeed*0.22, 0, 1.3);
          a.vx -= nx*impulse*aShare*1.6; a.vy -= ny*impulse*aShare*1.6;
          b.vx += nx*impulse*bShare*1.6; b.vy += ny*impulse*bShare*1.6;
          clampPlayerVelocity(a);
          clampPlayerVelocity(b);
        }
      }
    }
  }
  checkDribbleStealCollisions();
  if(ball.feintDetach && ball.owner === null){
    const owner = allPlayers.find(pl => pl.id === ball.feintDetach.ownerId) || null;
    if(owner) recoverFakeShotPossession(owner);
  }
}

/* ============================================================
   INTERCEPCION EQUILIBRADA — pelota suelta, sin robo automatico de conduccion
   ============================================================ */
function checkInterceptionEligibility(){
  if(ball.owner !== null) return false;
  // 'free' es la condicion base; 'loose_ball' cubre pases/rebotes (executeKick usa loose_ball)
  if(ball.state !== BALL_STATE.FREE && ball.state !== BALL_STATE.LOOSE_BALL) return false;
  if(isBallDead() || Game.outOfPlay) return false;
  if(isPossessionIgnored()) return false;
  if(Game.setPieceMode && !Game.isBallInPlay) return false;
  if(isKickoffWaiting() && !isKickoffBallContestable()) return false;
  return true;
}

function clearInterceptionSeek(p){
  if(!p) return;
  p.interceptionSeek = false;
}

// La IA no puede perseguir al portador rival — solo marcar pasivamente o volver a formacion.
function isCpuChasingCarrier(rival, carrier){
  if(!rival || !carrier || !isCpuPlayer(rival)) return false;
  if(ball.owner !== carrier || rival.team === carrier.team) return false;
  return !!(rival.interceptionSeek || rival.isAttackingBall || rival.iaSeeking ||
    rival.aiMode === 'seeking' || rival.state === 'chasing');
}

function enforceCpuNoCarrierChase(rival, carrier){
  if(!rival) return false;
  if(isDeepInterceptPassLocked(rival)) return false;
  rival.aiMode = 'positioning';
  rival.isAttackingBall = false;
  clearInterceptionSeek(rival);
  rival.iaSeeking = false;
  rival.targetPosition = null;
  rival.landingTime = 0;
  rival.seekAerial = false;
  clearChasingState(rival);
  clearForcedChaseState(rival);
  clearPlayerAIState(rival);
  return true;
}

function resetCpuAttackingBallOnHumanPossession(){
  const carrier = ball.owner;
  if(!carrier || ball.state !== BALL_STATE.IN_POSSESSION) return;
  if(!isControlledByHuman(carrier)) return;
  for(const p of allPlayers){
    if(p.team === carrier.team || !isCpuPlayer(p)) continue;
    p.isAttackingBall = false;
    if(isCpuChasingCarrier(p, carrier)) enforceCpuNoCarrierChase(p, carrier);
  }
}

function shouldCpuMarkCarrier(p, carrier){
  if(!p || !carrier || p.team === carrier.team) return false;
  if(!isZoneMarkingPlayer(p)) return false;
  return dist2D(p, carrier) < MAN_MARK_ACTIVATE_DIST;
}

function isZoneMarkingPlayer(p){
  if(!p || p.role === 'GK') return false;
  if(p.role === 'DEF') return true;
  return p.posRole === 'CDM' || p.posRole === 'CM' || p.posRole === 'CAM';
}

function getTeamSquad(team){
  return team === 'home' ? homeTeam : awayTeam;
}

function getDefensiveLineX(team){
  const defs = getTeamSquad(team).filter(pl => pl.role === 'DEF');
  if(!defs.length) return null;
  const avgSlot = defs.reduce((sum, pl) => sum + getTacticalBlockSlot(pl).x, 0) / defs.length;
  const carrier = ball.owner;
  if(carrier && carrier.team !== team){
    return clamp(lerp(avgSlot, carrier.x, 0.18), 5, FIELD_L - 5);
  }
  return avgSlot;
}

function maintainDefensiveLine(target, p, lineX){
  if(p.role !== 'DEF' || lineX == null) return target;
  return {
    x: lerp(target.x, lineX, 0.62),
    y: target.y,
  };
}

function getZoneGapCoverTarget(p, anchor){
  const rivals = allPlayers.filter(opp => opp.team !== p.team);
  let best = anchor;
  let bestScore = -Infinity;
  const samples = [
    {x:0, y:0}, {x:0.55, y:0.45}, {x:0.55, y:-0.45},
    {x:-0.35, y:0.65}, {x:-0.35, y:-0.65}, {x:0.25, y:0.85},
    {x:0.25, y:-0.85}, {x:-0.5, y:0},
  ];
  for(const s of samples){
    const cx = clamp(anchor.x + s.x * ZONE_MARK_RADIUS, 5, FIELD_L - 5);
    const cy = clamp(anchor.y + s.y * ZONE_MARK_RADIUS, 5, FIELD_W - 5);
    let openness = 999;
    for(const opp of rivals){
      openness = Math.min(openness, dist2D(opp, {x:cx, y:cy}));
    }
    const anchorBlend = 1 - dist2D(anchor, {x:cx, y:cy}) / (ZONE_MARK_RADIUS * 1.2);
    const score = openness * 1.4 + anchorBlend * 2.5;
    if(score > bestScore){
      bestScore = score;
      best = {x: cx, y: cy};
    }
  }
  return maintainDefensiveLine(best, p, getDefensiveLineX(p.team));
}

function getZoneInterceptTarget(p, rival, anchor){
  const goalX = p.ownGoalX();
  const gdx = goalX - rival.x;
  const gdy = anchor.y - rival.y;
  const gd = Math.hypot(gdx, gdy) || 1;
  const nx = gdx / gd;
  const ny = gdy / gd;
  let tx = rival.x + nx * MAN_MARK_MIN_DIST;
  let ty = rival.y + ny * MAN_MARK_MIN_DIST;
  const distToRival = dist2D(p, rival);
  if(distToRival < MAN_MARK_MIN_DIST){
    const awayD = Math.max(distToRival, 0.01);
    tx = rival.x + ((p.x - rival.x) / awayD) * MAN_MARK_MIN_DIST;
    ty = rival.y + ((p.y - rival.y) / awayD) * MAN_MARK_MIN_DIST;
  }
  const target = {
    x: clamp(lerp(tx, anchor.x, 0.22), 5, FIELD_L - 5),
    y: clamp(lerp(ty, anchor.y, 0.28), 5, FIELD_W - 5),
  };
  return maintainDefensiveLine(target, p, getDefensiveLineX(p.team));
}

function findClosestZoneMarkerToRival(rival, team){
  let best = null;
  let bestDist = Infinity;
  for(const mate of getTeamSquad(team)){
    if(!isZoneMarkingPlayer(mate)) continue;
    const anchor = mate.targetSlotWorld();
    if(dist2D(rival, anchor) > ZONE_MARK_RADIUS) continue;
    const d = dist2D(mate, rival);
    if(d < bestDist){
      bestDist = d;
      best = mate;
    }
  }
  return best;
}

function getZoneMarkingTarget(p, carrier){
  const anchor = p.targetSlotWorld();
  if(!isZoneMarkingPlayer(p)) return anchor;
  const rivals = allPlayers.filter(opp => opp.team === p.team ? false : dist2D(opp, anchor) <= ZONE_MARK_RADIUS);
  if(!rivals.length){
    return getZoneGapCoverTarget(p, anchor);
  }
  const priorityRival = rivals.reduce((a, b) => {
    const scoreA = (carrier === a ? 3 : 0) + (ZONE_MARK_RADIUS - dist2D(a, anchor)) * 0.1;
    const scoreB = (carrier === b ? 3 : 0) + (ZONE_MARK_RADIUS - dist2D(b, anchor)) * 0.1;
    return scoreA >= scoreB ? a : b;
  });
  const marker = findClosestZoneMarkerToRival(priorityRival, p.team);
  if(marker === p){
    return getZoneInterceptTarget(p, priorityRival, anchor);
  }
  return getZoneGapCoverTarget(p, anchor);
}

// Marcaje pasivo: mantiene MAN_MARK_MIN_DIST del portador, retrocede si el rival avanza.
function getManMarkingTarget(p, carrier){
  return getZoneInterceptTarget(p, carrier, p.targetSlotWorld());
}

function updateCpuManMarking(p, dt, carrier){
  enforceCpuNoCarrierChase(p, carrier);
  moveToward(p, dt, getManMarkingTarget(p, carrier), false);
}

function canCpuSeekLooseBall(p){
  if(!p || isControlledByHuman(p)) return false;
  if(ball.owner) return false; // prohibido si hay portador (rival o propio)
  if(isEffortTouchDefenderFrozen(p)) return false;
  if(!isTeamNearestSeeker(p)) return false;
  if(!checkInterceptionEligibility()) return false;
  if(p.interceptionReactT > 0) return false;
  if(isTeammateBlockedFromEffortChase(p)) return false;
  if(isCpuBlockedFromTeammateLooseBall(p)) return false;
  if(isPlayerStunned(p) || isPlayerStaggered(p)) return false;
  if(isThrowInTakerBlocked(p)) return false;
  return true;
}

function updateInterceptionReactions(dt){
  const eligible = checkInterceptionEligibility();
  if(!eligible){
    Game.wasInterceptionEligible = false;
    for(const p of allPlayers){
      p.interceptionReactT = 0;
      clearInterceptionSeek(p);
    }
    return;
  }
  if(!Game.wasInterceptionEligible){
    Game.wasInterceptionEligible = true;
    for(const p of allPlayers){
      if(isControlledByHuman(p)) continue;
      p.interceptionReactT = INTERCEPTION_REACT_MIN +
        Math.random() * (INTERCEPTION_REACT_MAX - INTERCEPTION_REACT_MIN);
    }
  }
  for(const p of allPlayers){
    if(p.interceptionReactT > 0) p.interceptionReactT = Math.max(0, p.interceptionReactT - dt);
  }
}

function updateInterceptionSeek(p, dt){
  if(isInterceptingPass(p)) return false;
  if(ball.owner) {
    if(p.interceptionSeek) clearInterceptionSeek(p);
    p.isAttackingBall = false;
    return false;
  }
  if(!canCpuSeekLooseBall(p)){
    if(p.interceptionSeek) clearInterceptionSeek(p);
    p.isAttackingBall = false;
    return false;
  }
  p.isAttackingBall = true;
  p.interceptionSeek = true;
  clearPlayerAIState(p);
  p.iaSeeking = false;
  p.state = 'idle';
  const target = getChaseInterceptTarget(p);
  const dx = target.x - p.x, dy = target.y - p.y;
  const td = Math.hypot(dx, dy);
  const md = td > 0.01 ? {x: dx / td, y: dy / td} : {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  movePlayer(p, dt, md, true, false, {forcedChase: true});
  return true;
}

/* ============================================================
   POSESION / DUELOS
   ============================================================ */
function updatePossession(dt){
  if(isBallSetPieceFrozen()) return;
  if(ball.isReadyToKick || ball.state === BALL_STATE.PLACED) return;
  if(isThrowInPossessionBlocked()) return;
  if(Game.setPieceMode && !Game.isBallInPlay) return;
  if(isKickoffWaiting() && !isKickoffBallContestable()) return;
  if(Game.deadBall || Game.isDeadBall || Game.outOfPlay) return;
  if(isTacklePossessionPending()) return;
  if(isEffortTouchPendingReclaim()) return;
  resetCpuAttackingBallOnHumanPossession();
  if(ball.state === BALL_STATE.IN_POSSESSION){
    const owner = ball.owner;
    if(!owner || (!playerInStrictControlRange(owner) && !owner.isEffortSprinting && ball.lastAction !== 'effort' && ball.lastAction !== 'feint')){
      setBallStateLoose(false);
      return;
    }
    clearPassTargetTeam(owner.team);
    if(isGkHandsImmune(owner)) return;
    if(ball.isContested) return;
    // Regla de oro: la IA nunca roba la pelota de los pies — solo compite en pelota suelta
    return;
  }

  if(ball.z < 1.15){
    if(isBallLocked()) return;

    let best=null, bestD=CTRL_RADIUS;
    for(const p of allPlayers){
      if(isOnBallContactBlocked(p)) continue;
      if(isEffortTouchDefenderFrozen(p)) continue;
      if(ball.effortDetach && ball.effortDetach.ownerId === p.id) continue;
      if(ball.feintDetach && ball.feintDetach.ownerId === p.id) continue;
      if(ball.isContested && !isBallContestedSeekAllowed(p)) continue;
      if(isManualMode && isCpuPlayer(p) && !canCpuSeekLooseBall(p) && !canCpuReceivePass(p)) continue;
      if(isTeammateBlockedFromEffortChase(p)) continue;
      if(isCpuBlockedFromTeammateLooseBall(p)) continue;
      if(isThrowInTakerBlocked(p)) continue;
      if(isPlayerStaggered(p) || isPlayerStunned(p)) continue;
      if(p.releaseCooldown>0) continue;
      if(ballIsMoving() && !hasActivePossessionState(p)) continue;
      const d = dist2D(p, ball);
      const capR = isInterceptingPass(p) ? getPassDetectRadius(p) : CTRL_RADIUS;
      if(d < capR && d < bestD){ bestD = d; best = p; }
    }
    if(best && (isInterceptingPass(best) || playerInControlRange(best)) && checkInterceptionEligibility() && !isPossessionIgnored()){
      const possessSource = isGoalkeeper(best) ? inferGkPossessionSource(best) : null;
      clearPassTargetTeam(best.team === 'home' ? 'away' : 'home');
      best.tackleCooldown = TACKLE_COOLDOWN * 0.75;
      best.touchCooldown = 0.12;
      best.charging = null;
      if(assignBallPossession(best, possessSource)){
        ball.lastTouchTeam = best.team;
        notifyRestartBallTouchedByOther(best);
        clearInterceptionSeek(best);
        clearInterceptPassState(best);
        syncHumanTeamControlOnPossession(best);
      }
    }
  }
}

/* ============================================================
   IA DE RECEPCION — IA_SEEKING + Full Manual Cancel (estilo PES)
   ============================================================ */
function getPassTargetId(team){
  return team==='home' ? Game.passTargetHome : Game.passTargetAway;
}

function isPassTargetPlayer(p, team){
  return getPassTargetId(team) === p.id;
}

function setPassTarget(team, player){
  if(team==='home') Game.passTargetHome = player ? player.id : null;
  else Game.passTargetAway = player ? player.id : null;
  if(!player) return;
  if((isPlayerChasing(player) || isChaseOwner(player)) && !isPlayerSprintChasing(player)) return;
  player.iaSeeking = true;
  player.manualCancelActive = false;
  applyReceptionSeekTarget(player, true);
}

function applyReceptionSeekTarget(p, forPassTarget){
  if(isTeammateBlockedFromEffortChase(p)) return;
  if(isPlayerForcedChasing(p)) return;
  if(p.state === 'chasing' && isManualAction(p)) return;
  if((isPlayerChasing(p) || isChaseOwner(p)) && !isPlayerSprintChasing(p)) return;
  const seek = getReceptionSeekTarget(forPassTarget, p);
  p.targetPosition = {x: seek.x, y: seek.y};
  p.landingTime = seek.tLand;
  p.seekAerial = seek.aerial;
}

function getReceptionSeekTarget(forPassTarget, p){
  if(p && isInterceptingPass(p) && p.interceptPassTarget){
    return { x: p.interceptPassTarget.x, y: p.interceptPassTarget.y, tLand: 0, aerial: false };
  }
  if(forPassTarget && !ball.owner && ball.z > BALL_AERIAL_MIN_Z){
    const land = predictBallLanding(ball);
    if(land){
      return {x: land.x, y: land.y, tLand: land.t, aerial: true};
    }
  }
  return {x: ball.x, y: ball.y, tLand: 0, aerial: false};
}

function updateBallLandingPoint(){
  if(ball.owner || ball.z <= BALL_AERIAL_MIN_Z){
    Game.landingPoint = null;
    return;
  }
  const land = predictBallLanding(ball);
  if(land && land.aerial && land.t > 0.02){
    Game.landingPoint = {x: land.x, y: land.y, t: land.t};
  } else {
    Game.landingPoint = null;
  }
}

function clearPassTargetIfPlayer(p){
  if(Game.passTargetHome === p.id) Game.passTargetHome = null;
  if(Game.passTargetAway === p.id) Game.passTargetAway = null;
}

function clearPassTargetTeam(team){
  const id = getPassTargetId(team);
  if(team==='home') Game.passTargetHome = null;
  else Game.passTargetAway = null;
  if(!id) return;
  const pl = allPlayers.find(p=>p.id===id);
  if(pl && !isPlayerChasing(pl) && !isChaseOwner(pl)){
    pl.iaSeeking = false;
    pl.targetPosition = null;
    pl.landingTime = 0;
    pl.seekAerial = false;
    pl.manualCancelActive = false;
  }
}

function assignPassTargetFromKick(kicker, aimDir, kickType, power){
  if(kickType !== 'pass' && kickType !== 'through' && kickType !== 'cross') return;
  if(power < AUTOPASE_POWER_THRESHOLD){
    setPassTarget(kicker.team, kicker);
    return;
  }
  if(kickType === 'through'){
    const receiver = registerThroughPass(kicker);
    if(receiver) setPassTarget(kicker.team, receiver);
    return;
  }
  let receiver = null;
  if(kickType === 'cross'){
    receiver = nearestTeammateToPoint(kicker.team, estimateKickTarget(), kicker.id);
  } else {
    receiver = findPassReceiverByIntent(kicker, norm(aimDir), kicker.id);
  }
  if(receiver) setPassTarget(kicker.team, receiver);
}

function ballIsMoving(){
  return Math.hypot(ball.vx, ball.vy) > IA_BALL_MOVING_MIN || ball.z > 0.12;
}

function isLooseMovingBall(){
  return (ball.state === BALL_STATE.FREE || ball.state === BALL_STATE.LOOSE_BALL) && ballIsMoving();
}

function isBallLooseState(){
  if(ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL) return false;
  return ball.state === BALL_STATE.FREE || ball.state === BALL_STATE.LOOSE_BALL;
}

function isCpuPlayer(p){
  return !!(p && !isControlledByHuman(p));
}

function getPlayerById(id){
  return allPlayers.find(pl => pl.id === id) || null;
}

function wasLastTouchByHuman(){
  const t = ball.lastTouchedBy ? getPlayerById(ball.lastTouchedBy) : null;
  return !!(t && isControlledByHuman(t));
}

function canCpuReceivePass(p){
  if(!isManualMode || !isCpuPlayer(p)) return true;
  return isPassTargetPlayer(p, p.team) && wasLastTouchByHuman();
}

// Posicion defensiva con marcaje zonal: cubrir huecos en zona de 15m o interceptar al rival mas cercano.
function getPassiveDefensiveTarget(p){
  const carrier = ball.owner;
  if(carrier && carrier.team !== p.team){
    if(isZoneMarkingPlayer(p)){
      return getZoneMarkingTarget(p, carrier);
    }
    const base = getTacticalBlockSlot(p);
    const goalX = p.ownGoalX();
    const blockX = clamp(lerp(carrier.x, goalX, 0.38), 5, FIELD_L - 5);
    const blockY = lerp(base.y, carrier.y, 0.4);
    return {x: blockX, y: clamp(blockY, 5, FIELD_W - 5)};
  }
  if(isZoneMarkingPlayer(p)){
    return getZoneGapCoverTarget(p, getTacticalBlockSlot(p));
  }
  return getTacticalBlockSlot(p);
}

function getPassivePassLaneTarget(p){
  const base = getPassiveDefensiveTarget(p);
  const carrier = ball.owner;
  if(!carrier || carrier.team === p.team) return base;
  return {x: base.x, y: clamp(lerp(base.y, carrier.y, 0.22), 5, FIELD_W - 5)};
}

function updateCpuPassiveGoalkeeper(p, dt){
  const goalX = p.ownGoalX();
  const dir = p.attackDir();
  const targetX = goalX + dir * 3.4;
  const targetY = clamp(ball.y, CENTER.y - GOAL_HALF - 1.4, CENTER.y + GOAL_HALF + 1.4);
  const dx = targetX - p.x, dy = targetY - p.y;
  const d = Math.hypot(dx, dy);
  const md = d > 0.05 ? {x: dx / d, y: dy / d} : {x: 0, y: 0};
  movePlayer(p, dt, md, false, false);
}

// CPU pasiva: formacion, marcaje y cierre de lineas — nunca persigue al portador rival.
function updateCPU(p, dt){
  if(p.isMakingManualRun && p.wallRun?.active) return;
  if(p.aiMode === AI_RUPTURA_MANUAL) return;
  if(runSecondaryPressAI(p, dt)) return;

  if(isEffortTouchDefenderFrozen(p)){
    p.vx = 0;
    p.vy = 0;
    return;
  }

  if(isSetPieceAwaitingExecution(p) && !isControlledByHuman(p)){
    if(Game.setPiece?.type === SET_PIECE.GOAL_KICK && Game.matchFormat === '11vs11'){
      p.vx = 0;
      p.vy = 0;
      if(isHumanTeam(p.team)) return;
      if(p.decisionTimer <= 0){
        p.decisionTimer = 0.6;
        SetPieceManager.executed = true;
        const keys = ['short', 'medium', 'long'];
        const forceKey = keys[Math.floor(Math.random() * keys.length)];
        executeGoalKickRelease(p, forceKey, 0.45 + Math.random() * 0.45, defaultSetPieceAimDir(p));
      }
      return;
    }
    p.vx = 0;
    p.vy = 0;
    if(p.decisionTimer <= 0){
      p.decisionTimer = 0.35;
      autoExecuteSetPiece(p);
    }
    return;
  }

  if(isPlayerStunned(p) || isPlayerStaggered(p)) return;

  if(p.aiMode === 'throw_in_run' && (p.throwInRunTarget || p.runTarget)){
    moveDesmarqueToward(p, dt, p.throwInRunTarget || p.runTarget);
    return;
  }

  const carrier = ball.owner;
  const humanCarrier = carrier && carrier.team !== p.team && isControlledByHuman(carrier);

  // Prohibicion absoluta: la IA no persigue al jugador con la pelota
  if(humanCarrier){
    if(isCpuChasingCarrier(p, carrier)) enforceCpuNoCarrierChase(p, carrier);
    if(shouldCpuMarkCarrier(p, carrier)){
      updateCpuManMarking(p, dt, carrier);
      return;
    }
    updateCpuPositioning(p, dt);
    return;
  }

  // Receptor designado de un pase humano: excepcion al filtro nearest
  if(canCpuReceivePass(p) && isPassTargetPlayer(p, p.team) && isLooseMovingBall()){
    if(isInterceptingPass(p)){
      p.aiMode = 'seeking';
      moveTowardSeekTarget(p, dt, p.interceptPassTarget, true);
      return;
    }
    p.aiMode = 'seeking';
    clearInterceptionSeek(p);
    clearChasingState(p);
    clearForcedChaseState(p);
    clearPlayerAIState(p);
    const seek = getReceptionSeekTarget(true, p);
    moveToward(p, dt, {x: seek.x, y: seek.y}, false);
    return;
  }

  if(isTeamNearestSeeker(p)){
    p.aiMode = 'seeking';
    if(seekBall(p, dt)) return;
  }

  updateCpuPositioning(p, dt);
}

// ¿puede este jugador tomar posesion de una pelota suelta en movimiento?
function hasActivePossessionState(p){
  if(isBallWaitingForRetrieval() || Game.outOfPlay) return false;
  if(ball.isContested && !isBallContestedSeekAllowed(p)) return false;
  if(isPlayerStaggered(p) || isPlayerStunned(p)) return false;
  if(isTeammateBlockedFromEffortChase(p)) return false;
  if(isManualMode && isCpuPlayer(p)){
    if(canCpuSeekLooseBall(p)) return true;
    if(canCpuReceivePass(p)) return true;
    if(dist2D(p, ball) < CTRL_RADIUS * 1.35) return true;
    return !ballIsMoving();
  }
  if(!ballIsMoving()) return true;
  if(isChaseOwner(p)) return true;
  if(isPlayerForcedChasing(p)) return true;
  if(isInterceptingPass(p)) return true;
  if(isPlayerChasing(p)) return !ball.effortDetach || p.id === ball.effortDetach.ownerId;
  if(isControlledByHuman(p)) return true;
  if(p.iaSeeking) return true;
  if(p.wallRun && p.wallRun.active) return true;
  if(p.isMakingManualRun) return true;
  if(!ball.owner && isTeamNearestSeeker(p)){
    if(ball.state === BALL_STATE.FREE && ball.effortDetach) return false;
    return true;
  }
  return false;
}

// Activa/desactiva IA_SEEKING. chasing manual es inmutable: solo lo interrumpe in_possession o accion del usuario.
function refreshIASeekingState(p){
  if(isManualMode && isCpuPlayer(p)){
    if(canCpuReceivePass(p) && isLooseMovingBall()){
      p.iaSeeking = true;
      applyReceptionSeekTarget(p, true);
      return true;
    }
    if(!isTeamNearestSeeker(p)){
      p.iaSeeking = false;
      p.targetPosition = null;
      p.landingTime = 0;
      p.seekAerial = false;
    }
    return false;
  }
  if(isBallWaitingForRetrieval() || Game.outOfPlay){
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    return false;
  }
  if(ball.isContested && !isBallContestedSeekAllowed(p)){
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    return false;
  }
  if(isPlayerStunned(p) || isPlayerStaggered(p)){
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    return false;
  }
  if(isTeammateBlockedFromEffortChase(p)){
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    return false;
  }
  if(p.feint) return false;
  if(isPlayerForcedChasing(p)){
    clearPlayerAIState(p);
    return true;
  }
  if(isInterceptingPass(p)){
    p.iaSeeking = true;
    applyReceptionSeekTarget(p, true);
    return true;
  }
  if(p.state === 'chasing' && isManualAction(p)){
    clearPlayerAIState(p);
    return true;
  }
  if(isPlayerChasing(p) || isChaseOwner(p) || isPlayerSprintChasing(p)){
    if(isPlayerSprintChasing(p)){
      p.iaSeeking = true;
      applyReceptionSeekTarget(p, true);
      return true;
    }
    clearPlayerAIState(p);
    return true;
  }
  if(ball.owner && ball.owner.team !== p.team){
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    p.manualCancelActive = false;
    clearPassTargetIfPlayer(p);
    return false;
  }
  if(ball.owner === p){
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    p.manualCancelActive = false;
    clearPassTargetIfPlayer(p);
    return false;
  }

  const passTarget = isPassTargetPlayer(p, p.team);
  const looseMoving = isLooseMovingBall();
  const inRange = dist2D(p, ball) < IA_SEEKING_RADIUS;

  // targetPlayer: IA_SEEKING persiste mientras la pelota siga suelta en movimiento
  if(passTarget && looseMoving){
    p.iaSeeking = true;
    applyReceptionSeekTarget(p, true);
    return true;
  }

  if(looseMoving && inRange && ball.state !== BALL_STATE.FREE){
    if(!passTarget && !isTeamNearestSeeker(p)){
      p.iaSeeking = false;
      p.targetPosition = null;
      p.landingTime = 0;
      p.seekAerial = false;
      return false;
    }
    p.iaSeeking = true;
    applyReceptionSeekTarget(p, false);
    return true;
  }

  if(p.iaSeeking && (!looseMoving || (!passTarget && !inRange))){
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    if(passTarget && !looseMoving) clearPassTargetIfPlayer(p);
  }
  return p.iaSeeking;
}

// Mueve al jugador hacia targetPosition con velocidad normal (via movePlayer), sin teletransporte.
// Si la recepcion es aerea, ajusta el ritmo para llegar al landingPoint cuando pique la pelota.
function cpuStopInPlace(p){
  p.vx = 0;
  p.vy = 0;
  p.sprinting = false;
  p.accelRampDist = 0;
}

function moveTowardSeekTarget(p, dt, target, sprint, opts){
  opts = opts || {};
  const sprintChase = opts.sprintChase || isPlayerSprintChasing(p);
  const movingToBall = !!opts.movingToBall;
  const forceSeek = !!opts.forceSeek;
  if(isPlayerForcedChasing(p) && !forceSeek) return;
  if(isEffortTouchDefenderFrozen(p)) return;
  const skillOwner = getBallLogicalOwner();
  if(skillOwner && isPlayerPerformingSkill(skillOwner) && skillOwner.team !== p.team) return;
  if(p.state === 'chasing' && isManualAction(p) && !movingToBall && !forceSeek) return;
  if(!target) target = {x: ball.x, y: ball.y};
  p.targetPosition = target;
  const dx = target.x - p.x, dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  let moveMag = d > 0.15 ? 1 : 0;
  let useSprint = (sprint || sprintChase) && d > 2.2;
  if(physicsConfig.useUniformSpeed && d > 2.2) useSprint = true;

  if(p.seekAerial && p.landingTime > 0.15){
    const trotSpeed = getPlayerMoveSpeedBase(p) * 0.72;
    const timeToArrive = d / Math.max(trotSpeed, 1.8);
    const tLand = p.landingTime;

    if(d <= IA_LANDING_WAIT_DIST && tLand > IA_LANDING_TIMING_MARGIN){
      moveMag = 0;
      useSprint = false;
      const damp = Math.pow(0.12, dt);
      p.vx *= damp; p.vy *= damp;
    } else if(timeToArrive < tLand - IA_LANDING_TIMING_MARGIN){
      useSprint = false;
      moveMag *= IA_LANDING_JOG_FACTOR;
      if(d < IA_LANDING_WAIT_DIST * 2.2) moveMag = 0;
    } else if(timeToArrive > tLand + IA_LANDING_TIMING_MARGIN){
      useSprint = true;
    }
  } else if(d < IA_SEEKING_SLOW_DIST && !sprintChase && !physicsConfig.useUniformSpeed){
    p.iaSeekingBrake = true;
  }

  if(moveMag <= 0.05){
    if(isCpuPlayer(p)) cpuStopInPlace(p);
    else {
      const damp = Math.pow(0.12, dt);
      p.vx *= damp;
      p.vy *= damp;
    }
    p.iaSeekingBrake = false;
    return;
  }

  const md = {x: dx/d, y: dy/d};
  movePlayer(p, dt, md, useSprint || sprintChase, false, sprintChase ? {sprintChase: true} : null);
  p.iaSeekingBrake = false;
}

// IA de recepcion / posicionamiento asistido (nunca durante chasing post-esfuerzo tecnico).
function updatePlayerAI(p, dt, input, team){
  if(isControlledByHuman(p)) return false;
  if(isPlayerForcedChasing(p)) return false;
  if(isTeammateBlockedFromEffortChase(p)) return false;
  if(p.state === 'chasing' && isManualAction(p)) return false;

  if(isInterceptingPass(p)){
    p.iaSeeking = true;
    applyReceptionSeekTarget(p, true);
    moveTowardSeekTarget(p, dt, p.interceptPassTarget, true);
    return true;
  }

  if(isPlayerSprintChasing(p)){
    const moveMag = Math.hypot(input.move?.x || 0, input.move?.y || 0);
    if(moveMag > 0.05 && !input.heldManualCancel){
      movePlayer(p, dt, input.move, true, false, {sprintChase: true});
    } else {
      applyReceptionSeekTarget(p, true);
      moveTowardSeekTarget(p, dt, p.targetPosition, true, {sprintChase: true});
    }
    return true;
  }

  const passTarget = isPassTargetPlayer(p, team);
  const looseMoving = isLooseMovingBall();
  const manualCancel = input.heldManualCancel;

  if(manualCancel){
    clearPlayerAIState(p);
    movePlayer(p, dt, input.move, false, false);
    return true;
  }

  const assistedReception = passTarget && looseMoving && !manualCancel;
  if(assistedReception){
    p.iaSeeking = true;
    applyReceptionSeekTarget(p, true);
    moveTowardSeekTarget(p, dt, p.targetPosition, true);
    return true;
  }

  if(refreshIASeekingState(p) && p.iaSeeking){
    moveTowardSeekTarget(p, dt, p.targetPosition, dist2D(p, ball) > 3);
    return true;
  }
  return false;
}

// Control de movimiento humano: stick prioritario; pelota suelta cerca → avance directo.
function updateHumanMovement(p, dt, input, team){
  purgeCpuMovementForHuman(p);
  if(input){
    const canJockey = p.role !== 'GK' && ball.owner !== p;
    input.jockey = !!(input.heldL2 && canJockey);
  }
  cancelManualRunIfBallOwner(p);

  if(p.isStuck && !p.inSetPieceZone && !isSetPieceAwaitingExecution(p)){
    p.isStuck = false;
    p.canMove = true;
  }

  if(p.isStuck || p.isThrowingIn || p.throwInAnim){
    p.vx = 0;
    p.vy = 0;
    const moveMag = Math.hypot(input.move.x, input.move.y);
    if(moveMag > 0.15){
      const dir = norm(input.move);
      p.facing = Math.atan2(dir.y, dir.x);
      p.lastAim = dir;
      syncPlayerDir(p);
    }
    return;
  }
  if(p.feint) return;
  if(isPlayerStunned(p) || isPlayerStaggered(p)) return;

  p.manualCancelActive = input.heldManualCancel;

  const moveMag = Math.hypot(input.move?.x || 0, input.move?.y || 0);
  const stickActive = moveMag > 0.05;

  if(stickActive || input.heldManualCancel){
    movePlayer(p, dt, input.move, input.sprint, input.jockey);
    return;
  }

  const ballLoose = isBallLooseState() && !ball.owner;
  const movementBlocked = !p.canMove || p.isStuck || p.tackleAnim || p.airStrikeAnim ||
    p.diveAnim || p.gkKickAnim || p.isThrowingIn || p.throwInAnim ||
    (p.airLock && p.airLock.t < p.airLock.dur);
  if(ballLoose && !movementBlocked && ball.owner !== p){
    const ballDist = dist2D(p, ball);
    if(ballDist < 15){
      p.state = MOVING_TO_BALL;
      clearPlayerAIState(p);
      moveDirectTowardBall(p, dt, ballDist > 2.5);
      return;
    }
  }

  movePlayer(p, dt, input.move, input.sprint, input.jockey);
}


/* ============================================================
   IA — jugadores no controlados por el humano
   ============================================================ */
function findNearestPlayer(team){
  const list = team === 'home' ? homeTeam : awayTeam;
  let best = null;
  let bestDist = Infinity;
  for(const p of list){
    if(isControlledByHuman(p)) continue;
    if(p.role === 'GK') continue;
    const d = dist2D(p, ball);
    if(d < bestDist){
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function getCachedNearestSeekerId(team){
  return team === 'home' ? Game.nearestSeekerHome : Game.nearestSeekerAway;
}

function getCachedNearestSeeker(team){
  const id = getCachedNearestSeekerId(team);
  return id ? getPlayerById(id) : null;
}

function updateNearestPlayerSelection(dt){
  const configs = [
    {team: 'home', timerKey: 'nearestSeekerTimerHome', idKey: 'nearestSeekerHome'},
    {team: 'away', timerKey: 'nearestSeekerTimerAway', idKey: 'nearestSeekerAway'},
  ];
  for(const cfg of configs){
    Game[cfg.timerKey] -= dt;
    if(Game[cfg.timerKey] > 0) continue;
    Game[cfg.timerKey] = NEAREST_PLAYER_UPDATE_INTERVAL;
    const nearest = findNearestPlayer(cfg.team);
    Game[cfg.idKey] = nearest ? nearest.id : null;
  }
}

function resetNearestPlayerSelection(){
  Game.nearestSeekerHome = null;
  Game.nearestSeekerAway = null;
  Game.nearestSeekerTimerHome = 0;
  Game.nearestSeekerTimerAway = 0;
}

function isTeamNearestSeeker(p){
  if(!p || isControlledByHuman(p)) return false;
  return getCachedNearestSeekerId(p.team) === p.id;
}

function seekBall(p, dt){
  if(isControlledByHuman(p)) return false;
  if(isEffortTouchDefenderFrozen(p)) return false;

  const logicalOwner = getBallLogicalOwner();
  if(logicalOwner && isPlayerPerformingSkill(logicalOwner) && logicalOwner.team !== p.team){
    return false;
  }
  if(logicalOwner && logicalOwner.team === p.team && logicalOwner.id !== p.id){
    p.isAttackingBall = false;
    clearInterceptionSeek(p);
    if(isControlledByHuman(logicalOwner)){
      moveDesmarqueToward(p, dt, resolveAttackSupportTarget(p, logicalOwner));
    } else {
      updateCpuPositioning(p, dt);
    }
    return false;
  }

  const carrier = ball.owner;
  if(carrier && carrier.team === p.team){
    p.isAttackingBall = false;
    clearInterceptionSeek(p);
    if(isControlledByHuman(carrier)){
      moveDesmarqueToward(p, dt, resolveAttackSupportTarget(p, carrier));
    } else {
      updateCpuPositioning(p, dt);
    }
    return false;
  }
  // La IA tiene prohibido perseguir a un jugador que tiene la pelota
  if(carrier && carrier.team !== p.team){
    enforceCpuNoCarrierChase(p, carrier);
    if(isControlledByHuman(carrier) && shouldCpuMarkCarrier(p, carrier)){
      updateCpuManMarking(p, dt, carrier);
    } else {
      updateCpuPositioning(p, dt);
    }
    return false;
  }

  if(updateInterceptionSeek(p, dt)) return true;
  if(isDeepInterceptPassLocked(p)){
    moveTowardSeekTarget(p, dt, p.interceptPassTarget, true);
    return true;
  }
  if(refreshIASeekingState(p)){
    moveTowardSeekTarget(p, dt, p.targetPosition, dist2D(p, ball) > 3);
    return true;
  }
  const loose = isBallLooseState() && !ball.owner;
  if(loose){
    p.isAttackingBall = true;
    moveDirectTowardBall(p, dt, dist2D(p, ball) > 2.5);
    return true;
  }
  p.isAttackingBall = false;
  return false;
}

function moveDirectTowardBall(p, dt, sprint){
  if(isEffortTouchDefenderFrozen(p)) return;
  const skillOwner = getBallLogicalOwner();
  if(skillOwner && isPlayerPerformingSkill(skillOwner) && skillOwner.team !== p.team) return;
  const dx = ball.x - p.x;
  const dy = ball.y - p.y;
  const d = Math.hypot(dx, dy);
  if(d < 0.01){
    p.vx = 0;
    p.vy = 0;
    return;
  }
  movePlayer(p, dt, {x: dx / d, y: dy / d}, !!sprint, false);
}

const WING_FLANK_THRESHOLD = FIELD_W * 0.27;
const FLANK_SUPPORT_COUNT = 3;

function isWingCarrier(carrier){
  if(!carrier) return false;
  return Math.abs(carrier.y - CENTER.y) > WING_FLANK_THRESHOLD
    || carrier.y < 11
    || carrier.y > FIELD_W - 11;
}

function getFlankSupportCandidates(carrier){
  if(!isWingCarrier(carrier)) return [];
  const flankSign = Math.sign(carrier.y - CENTER.y) || 1;
  return allPlayers
    .filter(p => p.team === carrier.team && p !== carrier && p.role !== 'GK')
    .filter(p => Math.sign(p.y - CENTER.y) === flankSign || Math.abs(p.slot.y - CENTER.y) > FIELD_W * 0.22)
    .sort((a, b) => {
      const da = Math.abs(a.y - carrier.y) + Math.abs(a.x - carrier.x) * 0.28;
      const db = Math.abs(b.y - carrier.y) + Math.abs(b.x - carrier.x) * 0.28;
      if(Math.abs(da - db) > 0.45) return da - db;
      return a.id - b.id;
    })
    .slice(0, FLANK_SUPPORT_COUNT);
}

function getFlankSupportTarget(p, carrier, index){
  const dir = p.attackDir();
  const flankSign = Math.sign(carrier.y - CENTER.y) || 1;
  const offsets = [
    { along: -4.5, wide: flankSign * 2.8 },
    { along: 6.5, wide: flankSign * 4.2 },
    { along: 1.2, wide: flankSign * 7.5 },
  ];
  const off = offsets[index] ?? offsets[0];
  let tx = carrier.x + dir * off.along;
  let ty = carrier.y + off.wide;
  const dx = tx - carrier.x;
  const dy = ty - carrier.y;
  const d = Math.hypot(dx, dy);
  const minD = 4.8;
  const maxD = 13;
  if(d > 0.01 && d < minD){
    tx = carrier.x + (dx / d) * minD;
    ty = carrier.y + (dy / d) * minD;
  } else if(d > maxD){
    tx = carrier.x + (dx / d) * maxD;
    ty = carrier.y + (dy / d) * maxD;
  }
  return {
    x: clamp(tx, 4, FIELD_L - 4),
    y: clamp(ty, 4, FIELD_W - 4),
  };
}

function resolveAttackSupportTarget(p, carrier){
  const flankCandidates = getFlankSupportCandidates(carrier);
  const flankIdx = flankCandidates.indexOf(p);
  if(flankIdx >= 0) return getFlankSupportTarget(p, carrier, flankIdx);
  return getTeammateSupportTarget(p, carrier);
}

function updateCpuPositioning(p, dt){
  if(isControlledByHuman(p)) return;
  if(p.aiMode === 'set_piece' && p.cornerSlot) return;

  const loose = isBallLooseState() && !ball.owner;
  if(loose && dist2D(p, ball) < 10){
    p.aiMode = 'seeking';
    p.isAttackingBall = true;
    clearPlayerAIState(p);
    moveDirectTowardBall(p, dt, dist2D(p, ball) > 2.5);
    return;
  }

  p.aiMode = 'positioning';
  p.isAttackingBall = false;
  clearInterceptionSeek(p);
  clearPlayerAIState(p);

  if(isPlayerStunned(p) || isPlayerStaggered(p)) return;

  if(p.role === 'GK'){
    updateCpuPassiveGoalkeeper(p, dt);
    return;
  }

  const teamHasBall = ball.owner && ball.owner.team === p.team;
  const oppHasBall = ball.owner && ball.owner.team !== p.team;

  if(teamHasBall){
    const carrier = ball.owner;
    if(carrier && carrier !== p){
      let support = resolveAttackSupportTarget(p, carrier);
      if(p.posRole === 'ST' && carrier.posRole === 'CAM'){
        if(!p.runTarget || p.runTimer <= 0){
          p.runTimer = 0.7 + Math.random() * 0.8;
          p.runTarget = findWideRunTarget(p, carrier);
        }
        p.runTimer -= dt;
        if(p.runTarget){
          support = applyKickoffOccupationTarget(p, p.runTarget);
          moveDesmarqueToward(p, dt, support);
          return;
        }
      } else if((p.posRole === 'CM' || p.posRole === 'CAM') && p !== carrier){
        if(!p.runTarget || p.runTimer <= 0){
          p.runTimer = 0.65 + Math.random() * 0.75;
          p.runTarget = findBetweenLinesRunTarget(p, carrier);
        }
        p.runTimer -= dt;
        if(p.runTarget && Math.random() < 0.55){
          support = applyKickoffOccupationTarget(p, p.runTarget);
          moveDesmarqueToward(p, dt, support);
          return;
        }
      }
      support = applyKickoffOccupationTarget(p, support);
      moveDesmarqueToward(p, dt, support);
      return;
    }
    moveToward(p, dt, applyKickoffOccupationTarget(p, getTacticalBlockSlot(p)), false);
    return;
  }
  if(oppHasBall){
    const carrier = ball.owner;
    if(isControlledByHuman(carrier) && shouldCpuMarkCarrier(p, carrier)){
      updateCpuManMarking(p, dt, carrier);
      return;
    }
    if(p.role === 'DEF' || isZoneMarkingPlayer(p)){
      moveToward(p, dt, getPassiveDefensiveTarget(p), false);
    } else if(p.role === 'MID'){
      moveToward(p, dt, getPassivePassLaneTarget(p), false);
    } else {
      moveToward(p, dt, getTacticalBlockSlot(p), false);
    }
    return;
  }
  if(p.role === 'DEF' || isZoneMarkingPlayer(p)){
    moveToward(p, dt, getPassiveDefensiveTarget(p), false);
  } else if(p.role === 'MID'){
    moveToward(p, dt, getPassivePassLaneTarget(p), false);
  } else {
    moveToward(p, dt, getTacticalBlockSlot(p), false);
  }
}

// Compatibilidad: incluye a todos (humano incluido) — solo para cambio manual de cursor.
function nearestToBall(team){
  const list = team==='home'?homeTeam:awayTeam;
  return list.reduce((a,b)=> dist2D(a,ball)<dist2D(b,ball)? a:b );
}

function aiDecide(p, dt){
  if(p.isMakingManualRun && p.wallRun?.active) return;
  if(p.aiMode === AI_RUPTURA_MANUAL) return;
  if(isEffortTouchDefenderFrozen(p)){
    p.vx = 0;
    p.vy = 0;
    return;
  }

  // Zona de exclusion: la CPU rival se congela; no puede buscar la pelota
  if(ball.isContested && isBallContestedRival(p)){
    p.aiMode = 'idle';
    p.state = 'idle';
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    p.vx = 0;
    p.vy = 0;
    return;
  }

  if(isManualMode && isCpuPlayer(p)){
    updateCPU(p, dt);
    return;
  }

  if(p.aiMode === 'idle') p.aiMode = 'normal';
  if(isPlayerStunned(p)){
    const dx = ball.x - p.x, dy = ball.y - p.y;
    const d = Math.hypot(dx, dy);
    const md = d > 0.2 ? {x: dx / d, y: dy / d} : {x: 0, y: 0};
    movePlayer(p, dt, md, false, false);
    return;
  }
  if(isPlayerStaggered(p)) return;
  if(isPlayerForcedChasing(p)) return;
  if(p.state === 'chasing' && isManualAction(p)) return;

  if(isDeepInterceptPassLocked(p)){
    moveTowardSeekTarget(p, dt, p.interceptPassTarget, true);
    return;
  }

  if(p.aiMode === 'throw_in_run' && p.throwInRunTarget){
    moveDesmarqueToward(p, dt, p.throwInRunTarget);
    return;
  }

  if(p.aiMode === 'set_piece' && p.targetPosition){
    if(Game.setPiece?.type === SET_PIECE.CORNER){
      moveToward(p, dt, p.targetPosition, false);
      return;
    }
    p.vx = 0;
    p.vy = 0;
    return;
  }

  if(runSecondaryPressAI(p, dt)) return;

  if(isSetPieceAwaitingExecution(p) && !isControlledByHuman(p)){
    if(Game.setPiece?.type === SET_PIECE.GOAL_KICK && Game.matchFormat === '11vs11'){
      p.vx = 0;
      p.vy = 0;
      if(isHumanTeam(p.team)) return;
      if(p.decisionTimer <= 0){
        p.decisionTimer = 0.6;
        SetPieceManager.executed = true;
        const keys = ['short', 'medium', 'long'];
        const forceKey = keys[Math.floor(Math.random() * keys.length)];
        executeGoalKickRelease(p, forceKey, 0.45 + Math.random() * 0.45, defaultSetPieceAimDir(p));
      }
      return;
    }
    p.vx = 0;
    p.vy = 0;
    if(p.decisionTimer <= 0){
      p.decisionTimer = 0.35;
      autoExecuteSetPiece(p);
    }
    return;
  }

  if(updateInterceptionSeek(p, dt)) return;

  p.decisionTimer -= dt;
  const teamHasBall = ball.owner && ball.owner.team===p.team;
  const oppHasBall = ball.owner && ball.owner.team!==p.team;
  const isSeeker = isTeamNearestSeeker(p);

  // arquero — triángulo + reacción a tiros (1vs1 / partido)
  if(p.role==='GK'){
    runGoalkeeperAI(p, dt);
    return;
  }

  // IA_SEEKING: recepcion gradual (nunca pisa chasing manual del autor del effort touch)
  if(isPlayerForcedChasing(p)) return;
  if(isPlayerChasing(p) || isChaseOwner(p)){
    if(isManualAction(p)) return;
    if(isTeammateBlockedFromEffortChase(p)){
      clearChasingState(p);
    } else {
      updateChasing(p, dt);
      return;
    }
  }
  if(isTeammateBlockedFromEffortChase(p)){
    const hold = p.targetPosition || p.targetSlotWorld();
    moveToward(p, dt, hold, false);
    return;
  }
  if(refreshIASeekingState(p)){
    moveTowardSeekTarget(p, dt, p.targetPosition, dist2D(p, ball) > 3);
    return;
  }

  // IA_SEEKING: recepcion gradual (nunca pisa chasing manual del autor del effort touch)
  if(isPlayerForcedChasing(p)) return;
  if(isPlayerChasing(p) || isChaseOwner(p)){
    if(isManualAction(p)) return;
    if(isTeammateBlockedFromEffortChase(p)){
      clearChasingState(p);
    } else {
      updateChasing(p, dt);
      return;
    }
  }
  if(isTeammateBlockedFromEffortChase(p)){
    const hold = p.targetPosition || p.targetSlotWorld();
    moveToward(p, dt, hold, false);
    return;
  }
  if(refreshIASeekingState(p)){
    moveTowardSeekTarget(p, dt, p.targetPosition, dist2D(p, ball) > 3);
    return;
  }

  if(teamHasBall && ball.owner===p){
    // decide con el balon
    if(p.decisionTimer>0) { steerCarrier(p, dt); return; }
    p.decisionTimer = 0.35+Math.random()*0.25;
    const goalX = p.oppGoalX();
    const distGoal = Math.abs(goalX-p.x);
    const angleOk = Math.abs(p.y-CENTER.y) < 14;
    if(distGoal < 20 && angleOk && Math.random()<0.7){
      const target = {x:goalX, y: CENTER.y + (Math.random()-0.5)*GOAL_HALF*1.2};
      executeKick(p,'shot', norm({x:target.x-p.x,y:target.y-p.y}), clamp(0.55+ (20-distGoal)/20*0.4,0.5,0.95));
      return;
    }
    // buscar compañero mejor posicionado (mas adelantado y con espacio)
    const mates = (p.team==='home'?homeTeam:awayTeam).filter(m=>m.id!==p.id);
    let best=null, bestScore=-Infinity;
    for(const m of mates){
      const forwardProgress = (m.x-p.x)*p.attackDir();
      let openness = 999;
      for(const opp of allPlayers){
        if(opp.team===p.team) continue;
        openness = Math.min(openness, dist2D(opp,m));
      }
      const score = forwardProgress*1.1 + openness*2 - dist2D(p,m)*0.15;
      if(score>bestScore){ bestScore=score; best=m; }
    }
    if(best && bestScore>2 && Math.random()<0.75){
      const passType = (Math.abs(best.x-p.x) > 22 || Math.random()<0.25) ? 'through' : 'pass';
      executeKick(p, passType, norm({x:best.x-p.x,y:best.y-p.y}), 0.55+Math.random()*0.3);
    } else {
      steerCarrier(p, dt);
    }
    return;
  }

  if(teamHasBall && ball.owner && ball.owner.team===p.team){
    const carrier = ball.owner;
    if(p.posRole === 'ST' && carrier.posRole === 'CAM'){
      if(!p.runTarget || p.runTimer<=0){
        p.runTimer = 0.75 + Math.random()*0.85;
        p.runTarget = findWideRunTarget(p, carrier);
      }
      p.runTimer -= dt;
      if(p.runTarget){
        moveDesmarqueToward(p, dt, applyKickoffOccupationTarget(p, p.runTarget));
        return;
      }
    } else if((p.posRole === 'CM' || (p.posRole === 'CAM' && p !== carrier)) && p !== carrier){
      if(!p.runTarget || p.runTimer<=0){
        p.runTimer = 0.65 + Math.random()*0.8;
        p.runTarget = findBetweenLinesRunTarget(p, carrier);
      }
      p.runTimer -= dt;
      if(p.runTarget && Math.random() < 0.6){
        moveDesmarqueToward(p, dt, applyKickoffOccupationTarget(p, p.runTarget));
        return;
      }
    } else if(p.role==='FWD' || (p.role==='MID' && p.slot.x>40 && Math.random()<0.015)){
      if(!p.runTarget || p.runTimer<=0){
        p.runTimer = 0.8 + Math.random()*0.9;
        p.runTarget = findRunTarget(p, carrier);
      }
      p.runTimer -= dt;
      if(p.runTarget){
        moveDesmarqueToward(p, dt, applyKickoffOccupationTarget(p, p.runTarget));
        return;
      }
    } else {
      p.runTarget = null;
      if(p.aiMode === AI_RUPTURA) p.aiMode = 'normal';
    }
    moveDesmarqueToward(p, dt, applyKickoffOccupationTarget(p, resolveAttackSupportTarget(p, carrier)));
    return;
  }
  p.runTarget = null;
  if(p.aiMode === AI_RUPTURA) p.aiMode = 'normal';

  if(oppHasBall){
    const carrier = ball.owner;
    p.isAttackingBall = false;
    clearInterceptionSeek(p);
    if(isDeepInterceptPassLocked(p)){
      moveTowardSeekTarget(p, dt, p.interceptPassTarget, true);
      return;
    }
    if(isManualMode && isControlledByHuman(carrier) && shouldCpuMarkCarrier(p, carrier)){
      p.aiMode = 'positioning';
      updateCpuManMarking(p, dt, carrier);
    } else if(isManualMode){
      p.aiMode = 'positioning';
      moveToward(p, dt, getPassiveDefensiveTarget(p), false);
    } else if(isSeeker){
      p.aiMode = 'seeking';
      moveToward(p, dt, ball, true);
    } else {
      p.aiMode = 'positioning';
      moveToward(p, dt, getPassiveDefensiveTarget(p), false);
    }
    return;
  }

  // pelota suelta, sin dueño — solo el CPU mas cercano persigue (con retardo de intercepcion)
  if(isTeammateBlockedFromEffortChase(p)){
    p.aiMode = 'positioning';
    const hold = p.runTarget || p.targetPosition || p.targetSlotWorld();
    moveToward(p, dt, hold, false);
    return;
  }
  if(isSeeker){
    p.aiMode = 'seeking';
    if(seekBall(p, dt)) return;
  } else {
    p.aiMode = 'positioning';
    moveToward(p, dt, p.targetSlotWorld(), false);
    return;
  }
}

// busca un punto de desmarque: espacio libre por delante del jugador, priorizando avanzar
// hacia el arco rival y alejarse de rivales cercanos, sin amontonarse con el portador de la pelota
function findRunTarget(p, carrier){
  const dir = p.attackDir();
  const forwardDist = 10 + Math.random()*7; // sprint de 10 a 17 metros
  const lateralOptions = [-11,-6,-2,2,6,11];
  let best=null, bestScore=-Infinity;
  for(const lat of lateralOptions){
    const cx = clamp(p.x + dir*forwardDist, 6, FIELD_L-6);
    const cy = clamp(CENTER.y + lat*0.8 + (p.slot.y-CENTER.y)*0.35, 5, FIELD_W-5);
    const c = {x:cx, y:cy};
    let openness = 999;
    for(const opp of allPlayers){
      if(opp.team===p.team) continue;
      openness = Math.min(openness, dist2D(opp,c));
    }
    const progress = (c.x-p.x)*dir;
    const distFromCarrier = dist2D(c, carrier);
    const score = openness*1.6 + Math.max(0,progress)*0.5 - Math.max(0, 6-distFromCarrier)*0.9;
    if(score>bestScore){ bestScore=score; best=c; }
  }
  return best;
}

// Desmarque diagonal hacia banda cuando el CAM tiene la pelota (estira centrales rivales)
function findWideRunTarget(p, carrier){
  const dir = p.attackDir();
  const wideSign = p.slot.y <= CENTER.y ? -1 : 1;
  const forwardDist = 11 + Math.random() * 7;
  const lateralDist = 7 + Math.random() * 6;
  const options = [
    {fx: 1.0, ly: 1.0},
    {fx: 0.85, ly: 1.25},
    {fx: 0.7, ly: 0.75},
  ];
  let best = null;
  let bestScore = -Infinity;
  for(const opt of options){
    const cx = clamp(p.x + dir * forwardDist * opt.fx, 6, FIELD_L - 6);
    const cy = clamp(p.y + wideSign * lateralDist * opt.ly, 5, FIELD_W - 5);
    let openness = 999;
    for(const opp of allPlayers){
      if(opp.team === p.team) continue;
      openness = Math.min(openness, dist2D(opp, {x: cx, y: cy}));
    }
    const progress = (cx - p.x) * dir;
    const distFromCarrier = dist2D({x: cx, y: cy}, carrier);
    const score = openness * 1.8 + progress * 0.55 - Math.max(0, 5 - distFromCarrier) * 0.7;
    if(score > bestScore){
      bestScore = score;
      best = {x: cx, y: cy};
    }
  }
  return best;
}

// Desdoblamiento entre lineas: mediocampistas atacan el hueco entre defensa y medios rivales
function findBetweenLinesRunTarget(p, carrier){
  const dir = p.attackDir();
  const forwardDist = 8 + Math.random() * 6;
  const lateralShift = (Math.random() - 0.5) * 8;
  let best = null;
  let bestScore = -Infinity;
  for(let i = 0; i < 5; i++){
    const cx = clamp(p.x + dir * (forwardDist + i * 1.6), 6, FIELD_L - 6);
    const cy = clamp(p.slot.y + lateralShift + (Math.random() - 0.5) * 5, 5, FIELD_W - 5);
    let openness = 999;
    for(const opp of allPlayers){
      if(opp.team === p.team) continue;
      openness = Math.min(openness, dist2D(opp, {x: cx, y: cy}));
    }
    const progress = (cx - p.x) * dir;
    const lanePenalty = Math.abs(cy - carrier.y) < 2.5 ? 2.5 : 0;
    const score = openness * 1.5 + progress * 0.65 - lanePenalty;
    if(score > bestScore){
      bestScore = score;
      best = {x: cx, y: cy};
    }
  }
  return best;
}
function steerCarrier(p, dt){
  // conduce la pelota hacia el arco rival, evitando salirse de la cancha
  const goalX = p.oppGoalX();
  const target = {x: p.x + (goalX-p.x>0?1:-1)*6, y: CENTER.y + (p.y-CENTER.y)*0.6};
  moveToward(p, dt, target, true);
}
function cpuMoveUsesSprint(p, target, sprintHint){
  const dx = target.x - p.x, dy = target.y - p.y;
  const d = Math.hypot(dx, dy);
  if(d <= 2.2) return false;
  if(physicsConfig.useUniformSpeed) return true;
  return !!sprintHint;
}

/** Desmarque sin pelota: sprint maximo permitido, nunca por encima del tope del rol. */
function moveDesmarqueToward(p, dt, target){
  if(isControlledByHuman(p)) return;
  const adjusted = applyKickoffOccupationTarget(p, target);
  const dx = adjusted.x - p.x, dy = adjusted.y - p.y;
  const d = Math.hypot(dx, dy);
  if(d <= 0.15){
    const damp = Math.pow(0.12, dt);
    p.vx *= damp;
    p.vy *= damp;
    return;
  }
  const md = { x: dx / d, y: dy / d };
  if(p.aiMode !== AI_RUPTURA_MANUAL && p.aiMode !== 'throw_in_run') p.aiMode = AI_RUPTURA;
  movePlayerRuptura(p, dt, md, getRupturaRunMaxSpeed(p));
}

function moveToward(p, dt, target, sprint){
  if(isControlledByHuman(p)) return;
  const adjusted = applyKickoffOccupationTarget(p, target);
  const dx=adjusted.x-p.x, dy=adjusted.y-p.y;
  const d=Math.hypot(dx,dy);
  if(d <= 0.15){
    cpuStopInPlace(p);
    return;
  }
  const md = {x:dx/d,y:dy/d};
  if(p.runTarget && d > 0.15){
    if(p.aiMode !== AI_RUPTURA_MANUAL) p.aiMode = AI_RUPTURA;
    movePlayerRuptura(p, dt, md, getRupturaRunMaxSpeed(p));
    return;
  }
  const useSprint = cpuMoveUsesSprint(p, adjusted, sprint);
  movePlayer(p, dt, md, useSprint, false);
}

// Desmarque manual L1: hacia arco rival; stick derecho redirige una vez por activación (2 s).
function updateWallRun(p, dt, padIndex){
  const wr = p.wallRun;
  if(!wr?.active) return;

  wr.timer -= dt;
  const boxLineX = p.attackDir()===1 ? (FIELD_L - WALLRUN_BOX_DEPTH) : WALLRUN_BOX_DEPTH;
  const reachedBoxHeight = p.attackDir()===1 ? (p.x >= boxLineX) : (p.x <= boxLineX);
  const lostToOpponent = ball.lastTouchTeam && ball.lastTouchTeam !== p.team;
  if(ball.owner===p || wr.timer<=0 || reachedBoxHeight || lostToOpponent){
    finishManualRun(p);
    return;
  }

  if(wr.isSmartRun){
    if(wr.canChangeDirection && wr.stickWindowT > 0){
      wr.stickWindowT = Math.max(0, wr.stickWindowT - dt);
      applyManualRunStickInput(p, dt, padIndex);
      if(wr.stickWindowT <= 0){
        wr.canChangeDirection = false;
        if(!wr.stickLocked){
          wr.dir = getForwardRunDirection(p);
          wr.stickLocked = true;
        }
      }
    }
    if(!wr.stickLocked){
      wr.dir = getForwardRunDirection(p);
    }
  } else if(wr.isParedActive){
    if(wr.canChangeDirection && wr.stickWindowT > 0){
      wr.stickWindowT = Math.max(0, wr.stickWindowT - dt);
      applyManualRunStickInput(p, dt, padIndex);
      if(wr.stickWindowT <= 0) wr.canChangeDirection = false;
    }
    if(!wr.stickLocked && wr.targetPosition){
      wr.dir = computeParedCurvedDir(p, wr.targetPosition, shouldIgnoreManualRunPartner(p));
    }
  }

  movePlayerRuptura(p, dt, wr.dir, getRupturaRunMaxSpeed(p));
  p.facing = Math.atan2(wr.dir.y, wr.dir.x);
  syncPlayerDir(p);
  p.lastAim = wr.dir;
}


/* ============================================================
   FESTEJOS ICONICOS — tras un gol "en juego" (no en contra), la camara clava un primer plano sobre
   el autor del gol y, durante los primeros segundos, se puede elegir uno de 4 festejos con el mismo
   boton que ya usan pase/tiro/filtrado/centro (✕ ▢ △ ○ / J K L I en teclado). Si no se elige a
   tiempo (o si convirtio la CPU en modo 1 jugador), se juega un festejo por defecto.
   ============================================================ */
const CELEB_CHOOSE_WINDOW = 3.0;  // segundos para elegir festejo con el joystick/teclado
const CELEB_PLAY_DURATION = 3.0;  // segundos que dura la animacion del festejo elegido
const CELEBRATION_RUN_TIMEOUT_MS = 5000; // ms de carrera libre antes del kickoff automatico
const CELEBRATION_POSE_EXTRA_MS = 2000;  // ms extra tras elegir festejo con boton
const CELEB_TYPES = ['siuu','topo','mbappe','robot'];

function isHumanTeam(team){
  // en 1 jugador el LOCAL siempre es humano y la VISITA es CPU; en 2 jugadores ambos son humanos
  return team==='home' || Game.twoPlayerMode;
}
function celebrationInputForTeam(team){
  if(team==='home'){
    const p1SharesKeyboard = Game.twoPlayerMode && Game.p1PadIndex===null && Game.p2PadIndex===null;
    const scheme = p1SharesKeyboard ? KB_P1_SHARED : KB_P1_SOLO;
    return readInput(Game.p1PadIndex, scheme, 'p1');
  }
  return readInput(Game.p2PadIndex, KB_P2, 'p2');
}

function startCelebration(scorer, team){
  // limpia cualquier animacion en curso (p.ej. si el gol se convirtio de cabeza/volea/chilena, el
  // airStrikeAnim todavia puede estar activo) para que no "pise" la pose del festejo
  scorer.tackleAnim = null;
  scorer.diveAnim = null;
  scorer.airStrikeAnim = null;
  scorer.wallRun = null;
  scorer.isMakingManualRun = false;
  scorer.hasRunDirectionLocked = false;
  scorer.lockedRunVector = null;
  scorer.defaultForwardVector = null;
  scorer.directionListenTimer = 0;
  scorer.manualRunPadIndex = null;
  scorer.charging = null;
  scorer.vx = 0; scorer.vy = 0;
  Game.celebration = {scorer, team, phase:'choose', t:0, chosen:null};
}

// mapeo boton -> festejo: reutiliza los mismos flags que ya calcula readInput() para pase/tiro/
// filtrado/centro (✕=pase, ▢=tiro, △=filtrado, ○=centro), tanto en joystick como en teclado
function beginCelebAnim(c, type){
  c.chosen = type;
  c.phase = 'playing';
  c.t = 0;
  c.scorer.celebAnim = {type, t:0, realT:0};
  c.scorer.vx = 0; c.scorer.vy = 0;
}
function finishCelebration(c){
  const team = c.team;
  c.scorer.celebAnim = null;
  Game.celebration = null;
  restartAfterGoal(team);
}

function updateCelebration(dt){
  const c = Game.celebration;
  if(!c) return;
  c.t += dt;

  if(c.phase==='choose'){
    if(isHumanTeam(c.team)){
      const input = celebrationInputForTeam(c.team);
      snapshotKeys();
      let pick = null;
      if(input.pressPass) pick='siuu';         // BOTON X / ✕ (o J en teclado)
      else if(input.pressShot) pick='topo';     // BOTON CUADRADO / ▢ (o K en teclado)
      else if(input.pressThrough) pick='mbappe';// BOTON TRIANGULO / △ (o L en teclado)
      else if(input.pressCross) pick='robot';   // BOTON CIRCULO / ○ (o I en teclado)
      if(pick){ beginCelebAnim(c, pick); return; }
    }
    if(c.t >= CELEB_CHOOSE_WINDOW){
      // no eligio a tiempo (o convirtio la CPU): festejo por defecto
      const auto = isHumanTeam(c.team) ? 'siuu' : CELEB_TYPES[Math.floor(Math.random()*CELEB_TYPES.length)];
      beginCelebAnim(c, auto);
    }
    return;
  }

  // phase === 'playing'
  updateCelebAnim(c.scorer, dt);
  if(c.t >= CELEB_PLAY_DURATION) finishCelebration(c);
}

function updateCelebAnim(p, dt){
  const a = p.celebAnim;
  if(!a) return;
  a.realT += dt; // tiempo REAL (no afectado por la camara lenta), usado solo para disparar el slow-mo
  let animDt = dt;
  if(a.type==='siuu' && a.realT>=0.9 && a.realT<1.9){
    animDt = dt*0.5; // Slow Motion al 50% de velocidad por 1 segundo real, justo en el impacto
  }
  const prevT = a.t;
  a.t += animDt;

  // en el instante justo en que aterriza y abre los brazos (t cruza 0.9), cartel "Siuuuuuu!"
  if(a.type==='siuu' && prevT<0.9 && a.t>=0.9){
    showBanner('Siuuuuuu!', 2200);
  }

  const RUN_DUR = 0.5; // fase comun a los 4 festejos: corren unos metros hacia la mitad de la cancha
  if(a.t < RUN_DUR){
    const towardMid = Math.sign(CENTER.x - p.x) || -p.attackDir();
    p.x = clamp(p.x + towardMid*6.0*animDt, 1, FIELD_L-1);
  } else if(a.type==='robot'){
    // posicion lateral en angulos rectos y rigidos cada 150ms (sin transiciones fluidas),
    // arranca recien despues de la corrida (t2 = tiempo desde que freno)
    const t2 = a.t - RUN_DUR, prevT2 = Math.max(0, prevT - RUN_DUR);
    const stepIndex = Math.floor(t2*1000/150);
    const prevStepIndex = Math.floor(prevT2*1000/150);
    if(stepIndex!==prevStepIndex){
      p.y = clamp(p.y + (stepIndex%2===0? 0.5 : -0.5), 1, FIELD_W-1);
    }
  }
}
function showBanner(text, ms){
  if(hideGoalOverlay._active) return; // no pisar el cartel de GOOOL durante festejo
  const el = document.getElementById('banner');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(()=>el.classList.remove('show'), ms);
}


function updateRecoveryStates(dt){
  for(const p of allPlayers){
    if(!p.recoveryState) continue;
    p.recoveryState.t += dt;
    if(p.recoveryState.t >= p.recoveryState.dur) p.recoveryState = null;
  }
}

function updateSetPiecePositioning(dt){
  const sp = Game.setPiece;
  if(sp?.type === SET_PIECE.CORNER && !Game.isBallInPlay && !SetPieceManager.executed && !Game.cornerPositioned){
    positionCornerAttackers(sp.team, sp.side, sp.y ?? ball.y);
    positionCornerDefenders(sp.team === 'home' ? 'away' : 'home', sp.team, sp.side);
    Game.cornerPositioned = true;
  }
  if(sp?.type === SET_PIECE.CORNER && !Game.isBallInPlay && !SetPieceManager.executed){
    maintainCornerAttackPositions(dt, sp.team);
  }
  if(!sp || sp.type !== SET_PIECE.CORNER) Game.cornerPositioned = false;

  if(Game.throwIn?.suggestRuns){
    aiSuggestThrowInTargets(Game.throwIn.team);
    Game.throwIn.suggestRuns = false;
    Game.throwIn.lastSuggestT = performance.now();
  } else if(Game.throwIn?.active){
    const now = performance.now();
    if(!Game.throwIn.lastSuggestT || now - Game.throwIn.lastSuggestT > 900){
      aiSuggestThrowInTargets(Game.throwIn.team);
      Game.throwIn.lastSuggestT = now;
    }
  }
}

function clearTeamSecondaryPress(team, exceptId = null){
  for(const p of allPlayers){
    if(p.team !== team) continue;
    if(exceptId != null && p.id === exceptId) continue;
    p.secondaryPressActive = false;
    p.secondaryPressTargetId = null;
    if(p.aiMode === AI_SECONDARY_PRESSING) p.aiMode = 'normal';
  }
}

function findClosestFieldCpuToTarget(team, target){
  let best = null, bestD = Infinity;
  for(const p of allPlayers){
    if(p.team !== team || p.role === 'GK') continue;
    if(isControlledByHuman(p)) continue;
    const d = dist2D(p, target);
    if(d < bestD){
      bestD = d;
      best = p;
    }
  }
  return best;
}

function updatePressureCursorSelection(){
  Game.pressureCursorHome = null;
  Game.pressureCursorAway = null;
  const owner = ball.owner;
  if(!owner || owner.role === 'GK') return;
  if(owner.team === 'home'){
    const cpu = findClosestFieldCpuToTarget('away', owner);
    if(cpu) Game.pressureCursorAway = cpu.id;
  } else {
    const cpu = findClosestFieldCpuToTarget('home', owner);
    if(cpu) Game.pressureCursorHome = cpu.id;
  }
}

function runSecondaryPressAI(p, dt){
  if(!p.secondaryPressActive) return false;
  const carrier = allPlayers.find(pl => pl.id === p.secondaryPressTargetId) || ball.owner;
  if(!carrier || carrier.team === p.team){
    p.secondaryPressActive = false;
    p.secondaryPressTargetId = null;
    p.aiMode = 'normal';
    p.jockeyState = false;
    p.jockeyRetreat = false;
    return false;
  }

  p.aiMode = AI_SECONDARY_PRESSING;
  const defensiveDistance = SECONDARY_PRESS.defensiveDistance;
  const band = SECONDARY_PRESS.CONTAIN_BAND;
  const d = dist2D(p, carrier);
  const dx = carrier.x - p.x;
  const dy = carrier.y - p.y;
  const toCarrier = d > 0.08
    ? { x: dx / d, y: dy / d }
    : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
  const awayFromCarrier = { x: -toCarrier.x, y: -toCarrier.y };

  p.jockeyRetreat = false;

  if(d > defensiveDistance + band){
    // Rival se aleja: acercarse hasta restaurar los 6 m de contención.
    p.jockeyState = false;
    movePlayer(p, dt, toCarrier, d > defensiveDistance + 8, false);
  } else if(d < defensiveDistance - band){
    // Rival se acerca: retroceder para no romper la zona de contención.
    p.jockeyState = true;
    p.jockeyRetreat = true;
    movePlayer(p, dt, awayFromCarrier, false, false);
  } else {
    // Dentro de la banda: mantener distancia y postura defensiva sin contacto.
    p.jockeyState = true;
    const closing = carrier.vx * toCarrier.x + carrier.vy * toCarrier.y;
    if(closing > 0.6 && d < defensiveDistance){
      p.jockeyRetreat = true;
      movePlayer(p, dt, awayFromCarrier, false, false);
    } else {
      p.vx = lerp(p.vx, 0, clamp(dt * 5, 0, 1));
      p.vy = lerp(p.vy, 0, clamp(dt * 5, 0, 1));
    }
  }

  p.facing = lookAtFacing(p.x, p.y, carrier.x, carrier.y);
  syncPlayerDir(p);
  return true;
}

function runGameplaySim(dt, rawDt){
  rawDt = rawDt != null ? rawDt : dt / GLOBAL_TIME_SCALE;
  assignInputSources();
  updateIgnorePossession(dt);
  updateFakeShotState(dt);
  updateThrowInSystem(dt);
  updateSetPieceManager(dt);
  updateSetPiecePositioning(dt);
  updatePressureCursorSelection();
  updateKickoffManager(dt);
  updateKickoffOccupationTimer(dt);
  const koTaker = getKickoffTaker();
  if(koTaker && koTaker.kickoffAnim) updateKickoffManeuver(koTaker, dt);
  updateInterceptionReactions(dt);
  updateEffortTouchDefenderFreeze(dt);
  updateSetPieceRelease();
  updateBallContested(dt);
  updateIgnorePossession(dt);
  updateBallContested(dt);

  if(Game.deadBall && ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL){
    const prevBallX = ball.x;
    const prevBallY = ball.y;
    ball.update(dt, allPlayers);
    resolveBoundaryWallCollisions(ball);
    updateWaitingForRetrieval(dt);
    updateDeadBallRestart(dt);
    checkGoalsAndBounds(prevBallX, prevBallY, dt);
    snapshotKeys();
    finalizeBallFrame();
    return;
  }

  if(Game.deadBall && ball.state === BALL_STATE.DEAD_BALL){
    updateDeadBallRestart(dt);
    snapshotKeys();
    finalizeBallFrame();
    return;
  }

  if(gameState === 'celebration_run'){
    runCelebrationRunSim(dt, rawDt);
    return;
  }

  if(Game.goalRoll){
    const prevBallX = ball.x;
    const prevBallY = ball.y;
    ball.update(dt, allPlayers);
    resolveGoalStructureCollisions(ball);
    resolveBallGoalkeeperCollisions(ball);
    resolveBoundaryWallCollisions(ball);
    updateGoalRoll(dt);
    checkGoalsAndBounds(prevBallX, prevBallY, dt);
    snapshotKeys();
    finalizeBallFrame();
    return;
  }

  updateAirSpamDuelSystem(dt);
  updateGlobalReinstatementCooldown(dt);
  updateRecoveryStates(dt);
  if(!isUIModeActive()){
    const p1SharesKeyboard = Game.twoPlayerMode && Game.p1PadIndex===null && Game.p2PadIndex===null;
    const p1Scheme = p1SharesKeyboard ? KB_P1_SHARED : KB_P1_SOLO;
    const input1 = readInput(Game.p1PadIndex, p1Scheme, 'p1');
    input1.move = remapMoveForCamera(input1.move);
    handleRightStickSwitch(dt, 'home', Game.p1PadIndex);
    updateHumanControl(dt, input1, 'home', Game.p1PadIndex, p1Scheme);

    if(Game.twoPlayerMode){
      const input2 = readInput(Game.p2PadIndex, KB_P2, 'p2');
      input2.move = remapMoveForCamera(input2.move);
      handleRightStickSwitch(dt, 'away', Game.p2PadIndex);
      updateHumanControl(dt, input2, 'away', Game.p2PadIndex, KB_P2);
    }
  } else {
    snapshotKeys();
  }

  updateNearestPlayerSelection(dt);

  for(const p of allPlayers){
    if(p.releaseCooldown>0) p.releaseCooldown -= dt;
    tickInterceptPassStates(dt);
    updateSelfTouchCollectBlock(p, dt);
    if(p.feintActionCooldown>0) p.feintActionCooldown -= dt;
    updateSelfTouchCollectBlock(p, dt);
    if(p.feintActionCooldown>0) p.feintActionCooldown -= dt;
    if(p.kickAnim){ p.kickAnim.t += dt; if(p.kickAnim.t >= p.kickAnim.dur) p.kickAnim = null; }
    if(p.gkKickAnim){ updateGkKickAnim(p, dt); }
    if(p.stumble){ p.stumble.t += dt; if(p.stumble.t>=p.stumble.dur) p.stumble=null; }
    if(p.stun){
      p.stun.t += dt;
      if(p.stun.t>=p.stun.dur){
        p.stun = null;
        p.isStunned = false;
        if(!p.effortTouchAnim && !(p.touchAnim && ball.lastAction === 'feint' && isChaseOwner(p)) && p.canCollectBlockT <= 0){
          p.canCollectBall = true;
        }
      }
    }
    if(p.stun){
      p.stun.t += dt;
      if(p.stun.t>=p.stun.dur){
        p.stun = null;
        p.isStunned = false;
        if(!p.effortTouchAnim && !(p.touchAnim && ball.lastAction === 'feint' && isChaseOwner(p)) && p.canCollectBlockT <= 0){
          p.canCollectBall = true;
        }
      }
    }
    if(p.staggered){
      p.staggered.t += dt;
      if(p.staggered.t >= p.staggered.dur){
        p.staggered = null;
        if(p.state === 'staggered') p.state = 'idle';
      }
    }
    if(ball.isContested && ball.contestedVictimId === p.id){
      p.vx = 0;
      p.vy = 0;
    }
    updateAirLock(p, dt);
    if(p.tackleAnim){ updateTackleAnim(p, dt); continue; }
    if(p.gkKickAnim){ updateGkKickAnim(p, dt); continue; }
    if(p.isThrowingIn || p.throwInAnim) continue;
    if(p.diveAnim){ updateGKDive(p, dt); continue; }
    if(p.airStrikeAnim){ updateAirStrikeAnim(p, dt); continue; }
    if(p.feint){ updateFeint(p, dt); continue; }
    if(p.dragBack){ updateDragBack(p, dt); continue; }
    if(p.pendingKick){ updatePendingKick(p, dt); }
    if(p.isMakingManualRun && p.wallRun && p.wallRun.active){
      const padIdx = p.manualRunPadIndex ?? (p.team === 'home' ? Game.p1PadIndex : Game.p2PadIndex);
      updateWallRun(p, dt, padIdx);
      continue;
    }
    if(isKickoffTaker(p)) continue;
    if(p.id===Game.controlledId) continue;
    if(Game.twoPlayerMode && p.id===Game.controlledId2) continue;
    if(gameState==='practice' && p!==practiceGK) continue;
    updateAirSpamDuelAI(p, dt);
    aiDecide(p, dt);
  }
  enforceRestartPositionRestrictions();
  resolveCollisions();
  for(const p of allPlayers){
    if(!isPlayerInRupturaRun(p)) continue;
    const cap = getRupturaRunMaxSpeed(p);
    let dir = p.wallRun?.dir || p.lockedRunVector || null;
    if(!dir && p.runTarget){
      const dx = p.runTarget.x - p.x, dy = p.runTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if(d > 0.15) dir = { x: dx / d, y: dy / d };
    }
    if(!dir && p.throwInRunTarget){
      const dx = p.throwInRunTarget.x - p.x, dy = p.throwInRunTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if(d > 0.15) dir = { x: dx / d, y: dy / d };
    }
    if(dir) setRupturaRunVelocity(p, dir, cap);
  }
  enforceAllPlayerSpeedCaps();
  maintainKickoffPlacement();
  syncManualRunWithPossession();
  const prevBallX = ball.x;
  const prevBallY = ball.y;
  ball.update(dt, allPlayers);
  resolveGoalStructureCollisions(ball);
  resolveBallGoalkeeperCollisions(ball);
  resolveBoundaryWallCollisions(ball);
  finalizeBallFrame();
  for(const p of allPlayers){
    updateActionBufferPhysics(p);
  }
  updateBallLandingPoint();
  updatePossession(dt);
  syncManualRunWithPossession();
  // Frame de contacto: ejecutar accion bufferada al instante tras ganar posesion
  for(const p of allPlayers){
    if(isControlledByHuman(p)) checkActionExecution(p);
  }
  updateGkPossessionTransitions(dt);
  updateGkHandsTimer(dt);
  finalizeBallFrame();
  checkGoalsAndBounds(prevBallX, prevBallY, dt);
  updateWaitingForRetrieval(dt);
  resolveAirSpamDuelIfReady();
  if(Game.crossMarker){
    Game.crossMarker.t -= dt;
    if(Game.crossMarker.t<=0 || ball.owner || ball.lastKickType !== 'cross'){
      Game.crossMarker = null;
    }
  }
  snapshotKeys();
  finalizeBallFrame();
}
export { throwInFacingForSide, bindThrowInBall, setupThrowIn, tryEnterThrowInPosition, applyThrowInImpulse, updateThrowInAnim, handleThrowInInput, updateThrowInSystem, resetSetPieceCharge, resetSetPieceManager, goalAreaCornerPosition, cornerFlagPosition, throwInLinePosition, defaultSetPieceAimDir, isSetPieceAwaitingExecution, startSetPieceCharge, positionSetPieceTaker, getSetPieceBallPosition, resetGoalkeeperForGoalKick, placeGoalKickBall, maintainGoalKickPlacement, setupGoalKick, executeGoalKickRelease, executeSetPieceRelease, performAutoSetPieceKick, autoExecuteSetPiece, enterPlayingAfterAutoRestart, executeAutoRestart, transferPossessionToOpponent, handleSetPieceTimeout, clearActiveSetPieceTaker, restartSetPieceForTeam, handleSetPiecePowerInput, updateSetPieceManager, clearPlayerSetPieceState, setSetPieceMode, onSetPieceBallReleased, isSetPieceTaker, isSetPieceShotOnly, refreshSetPieceBlockDribbling, updateSetPieceRelease, triggerGoalkeeperSetPieceKick, unproject, bestWallPassTarget, nearestTeammateInDirection, releaseWallPass, isValidAerialHeight, isAirDuelContestant, isAirDuelSpamWindowOpen, getAirDuelContenders, predictAerialImpactForDuel, aerialSpamButtonFromInput, registerAirSpamPress, nearestRivalDistance, getAerialDuelEffectiveSpam, pickSpamDuelWinner, finalizeAirSpamDuel, updateAirSpamDuelAI, updateAirSpamDuelSystem, resolveAirSpamDuelIfReady, getPlayerCollisionMass, gkReachRadius, onGkBallTriggerEnter, deflectBallOffGoalkeeper, tryGoalkeeperInterception, resolveGoalkeeperBallContact, resolveBallGoalkeeperCollisions, checkDribbleStealCollisions, resolveCollisions, checkInterceptionEligibility, clearInterceptionSeek, isCpuChasingCarrier, enforceCpuNoCarrierChase, resetCpuAttackingBallOnHumanPossession, shouldCpuMarkCarrier, getManMarkingTarget, updateCpuManMarking, canCpuSeekLooseBall, updateInterceptionReactions, updateInterceptionSeek, updatePossession, getPassTargetId, isPassTargetPlayer, setPassTarget, applyReceptionSeekTarget, getReceptionSeekTarget, updateBallLandingPoint, clearPassTargetIfPlayer, clearPassTargetTeam, assignPassTargetFromKick, ballIsMoving, isLooseMovingBall, isBallLooseState, isCpuPlayer, getPlayerById, wasLastTouchByHuman, canCpuReceivePass, getPassiveDefensiveTarget, getPassivePassLaneTarget, updateCpuPassiveGoalkeeper, updateCPU, hasActivePossessionState, refreshIASeekingState, moveTowardSeekTarget, updatePlayerAI, updateHumanMovement, findNearestPlayer, getCachedNearestSeekerId, getCachedNearestSeeker, updateNearestPlayerSelection, resetNearestPlayerSelection, isTeamNearestSeeker, seekBall, updateCpuPositioning, nearestToBall, aiDecide, findRunTarget, steerCarrier, moveToward, updateWallRun, isHumanTeam, celebrationInputForTeam, startCelebration, beginCelebAnim, finishCelebration, updateCelebration, updateCelebAnim, showBanner, runGameplaySim, SetPieceManager, WALLRUN_MAX_DURATION, MANUAL_RUN_SPEED_MULT, MANUAL_RUN_CURVE_BIAS, OFFENSIVE_RUN_GOAL_WEIGHT, OFFENSIVE_RUN_DIR_WEIGHT, MANUAL_RUN_SHORT_DIST_THRESHOLD, MANUAL_RUN_SHORT_GRACE_TIME, MANUAL_RUN_PASSER_IGNORE_DIST, PARED_STICK_WINDOW, CELEB_TYPES };

