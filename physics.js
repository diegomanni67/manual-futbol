"use strict";

import { AGILITY_NO_BALL, AGILITY_WITH_BALL, BACK_NET_FRICTION_MULT, BALL_KNEE_HEIGHT_Z, BALL_RADIUS, BALL_STATE, BALL_STUCK_SPEED, BALL_STUCK_UNSTICK_T, CENTER, CROSSBAR_Z, DEAD_BALL_RESTART_DELAY, FIELD_L, FIELD_W, FORCED_CHASE_SPEED_MULT, GK_CATCH_CHANCE, GK_DIVE_MAX_DUR, GK_DIVE_MIN_DUR, GK_JUMP_MIN_Z, GK_SAVE_RADIUS, GOAL_AREA_FRICTION_MULT, GOAL_AREA_Y_PAD, GOAL_DEPTH, GOAL_HALF, GOAL_LINE_EXIT_MARGIN, GOAL_LINE_LEFT, GOAL_LINE_RIGHT, GOAL_LINE_SENSOR_EPS, GOAL_MIN_TRIGGER_SPEED, GOAL_NET_FALL_VZ, GOAL_NET_FRICTION_MULT, GOAL_NET_GRAVITY, GOAL_NET_SLIDE_DURATION, GOAL_NET_SLIDE_FRICTION, GOAL_POST_BOUNCE, GOAL_POST_HALF_THICK, GOAL_POST_SCORE_PHYSICS_T, GOAL_TOWARD_MIN_VX, GOAL_ZONE_DEPTH, GRAVITY, Game } from './state.js';

import { MOVE_DECEL_FACTOR, MOVE_LOW_SPEED_SNAP, MOVE_SHARP_TURN_BLEED, MOVE_TURN_RATE_MAX, MOVE_TURN_RATE_MIN, OUT_ZONE_DEPTH, OUT_ZONE_FRICTION_MULT, OUT_ZONE_STOP_SPEED, PLAYER_BODY_RADIUS, SET_PIECE, SLIDE_ACTIVE_END, SLIDE_ACTIVE_START, SLIDE_DISTANCE, SLIDE_DURATION, SLIDE_FOUL_CHANCE, SLIDE_HITBOX_HALF_LEN, SLIDE_HITBOX_HALF_W, SLIDE_HITBOX_PEAK_SCALE, SLIDE_LEG_REACH, SLIDE_RECEPTION_BLOCK_RADIUS, SLIDE_RECOVERY_HIT, SLIDE_RECOVERY_MISS, SLIDE_TACKLE_CARRY_SPEED, STAND_RECOVERY, STAND_TACKLE_CARRY_SPEED, STAND_TACKLE_DURATION, STAND_TACKLE_LUNGE, TACKLE_BOX_SCALE, TACKLE_CHAIN_AFTER, TACKLE_COOLDOWN, TACKLE_LOOK_RADIUS, TACKLE_RADIUS, TOUCH_ANIM_DUR, TOUCH_COOLDOWN_MAX, TOUCH_COOLDOWN_MIN, TOUCH_DISTANCE, TURN_TOUCH_ANGLE, TURN_TOUCH_DUR, TURN_TOUCH_SPEED_FACTOR, allPlayers } from './state.js';

import { angDiff, awayTeam, ball, bindBallToOwner, clamp, canTakeBallFromOwner, clearAirSpamUiState, clearAllChasingStates, clearBallLock, clearChasingState, clearEffortChaseLock, clearForcedChaseState, clearPlayerAIState, clearPlayerPendingAction, clearSprintChaseState, clampKickoffDefenderPosition, cornerFlagPosition, dist2D, finalizeBallFrame, finishExtendedDribbleAnim, gameState, getDefendingGoalkeeperForFrame, getPlayerMaxSprintVelocity, getPlayerMoveSpeedBase, getPostTouchRecoverDist, getSetPieceBallPosition, goalAreaCornerPosition, grantTacklePossession, homeTeam, inferGkPossessionSource, initGkPossessionType, isBallSetPieceFrozen, isCelebrationMode, isChaseOwner, isCpuBlockedFromTeammateLooseBall, isFakeShotLooseChase, isFakeShotRecoveryChase, isGkFeetPossession, isGkHandsImmune, isGkHandsPossession, isGoalkeeper, isHumanTeam, isKickoffDefendingTeam, isKickoffTaker, isKickoffWaiting, isPaused, isPlayerChasing, isPlayerSprintChasing, isPlayerStaggered, isPlayerStunned, isPossessionIgnored, isPostTouchChasing, isScoredGoalSequenceActive, isTeammateBlockedFromEffortChase, isThrowInBallState, lerp, positionKickoffTaker, setGameState, setIsCelebrationMode, setIsPaused, applyEffortExitVelocityBlend, assignBallPossession, recoverFakeShotPossession, syncHumanTeamControlOnPossession } from './state.js';

import { nearestToBall, norm, placeKickoff, positionSetPieceTaker, practiceGoal, practicePlayer, setBallStateInPossession, setBallStateLoose, setControlled, setControlled2, setSetPieceMode, setupGoalKick, setupThrowIn, shouldApplyScoredGoalNetPhysics, showBanner, syncPlayerDir, updateBallPosition, getKickoffTaker, teleportKickoffTakerHard } from './state.js';

import { getPadAt, padButtons, remapMoveForCamera, snapshotKeys, syncStickDir, PREP_SPEED_FACTOR } from './input.js';

import { celebrationInputForTeam, updateCelebAnim, resolveBallGoalkeeperCollisions, CELEB_TYPES } from './gameplay.js';

/* ============================================================
   FISICA / MOVIMIENTO DE JUGADORES (peso tipo eFootball: acelera y frena gradual)
   ============================================================ */
// Actualiza p.vx / p.vy con inercia de giro (rotacion limitada del vector de velocidad) y
// aceleracion/desaceleracion gradual. La pelota NO se toca aqui: sigue anclada al pie via
// updateBallPosition (usa p.facing/p.dir, no el vector de velocidad directamente).
function updateMovement(p, dt, moveDir, moveMag, wantMove, maxSpeed, sprint, mass){
  const prevVX = p.vx, prevVY = p.vy;
  const fakeShotRecovery = isFakeShotRecoveryChase(p);
  const looseTouchSprint = isFakeShotLooseChase(p);
  const effortSprint = looseTouchSprint || !!(p.isEffortSprinting && ball.owner === p);
  const dribbling = !effortSprint && ball.owner === p && (!isGoalkeeper(p) || isGkFeetPossession(p));
  const agility = dribbling ? AGILITY_WITH_BALL : AGILITY_NO_BALL;
  const stunned = isPlayerStunned(p);

  if(stunned){
    p.vx = lerp(p.vx, 0, clamp(dt * 2.8, 0, 1));
    p.vy = lerp(p.vy, 0, clamp(dt * 2.8, 0, 1));
    return {prevVX, prevVY};
  }

  if(p.selfTouchBrakeT > 0 && !effortSprint){
    p.selfTouchBrakeT = Math.max(0, p.selfTouchBrakeT - dt);
    p.vx = lerp(p.vx, 0, clamp(dt * 22, 0, 1));
    p.vy = lerp(p.vy, 0, clamp(dt * 22, 0, 1));
    return {prevVX, prevVY};
  }

  if(wantMove){
    const targetSpeed = moveMag*maxSpeed;
    const targetAngle = Math.atan2(moveDir.y/moveMag, moveDir.x/moveMag);

    let curSpeed = Math.hypot(p.vx, p.vy);
    // casi parado: el rumbo puede alinearse al stick de inmediato (arranque desde 0)
    let curAngle = curSpeed < 0.08 ? targetAngle : Math.atan2(p.vy, p.vx);

    const speedRatio = clamp(curSpeed/Math.max(maxSpeed, 0.1), 0, 1);
    const turnDelta = stunned ? 0 : Math.abs(angDiff(targetAngle, curAngle));

    // tasa de giro base: cuanto mas rapido vas, menos grados/s (curva en vez de pivot)
    let turnRate = lerp(MOVE_TURN_RATE_MAX, MOVE_TURN_RATE_MIN, Math.pow(speedRatio, 0.78));
    turnRate /= clamp(mass, 0.82, 1.3);
    // AGILITY_* escala la respuesta al stick: sin pelota gira mucho mas rapido; con pelota conserva inercia
    if(!stunned) turnRate *= 0.3 + agility*2.7;
    // Sprint con balón: prioridad de inercia — giros muy limitados, sin frenar al girar
    if(effortSprint){
      turnRate = MOVE_TURN_RATE_MIN * 0.42;
    }

    // rotar el vector de velocidad hacia el rumbo pedido (lerp angular); stun congela el giro
    const turnT = stunned ? 0 : clamp(dt*turnRate, 0, 1);
    const newAngle = curAngle + angDiff(targetAngle, curAngle)*turnT;
    let newSpeed = curSpeed;

    // giros bruscos: desaceleracion proporcional a (1 - agility); sin pelota casi no frena al girar
    if(!stunned && !effortSprint && curSpeed > MOVE_LOW_SPEED_SNAP && turnDelta > 0.5){
      const sharpness = clamp((turnDelta-0.5)/(Math.PI-0.5), 0, 1);
      const bleedBase = MOVE_SHARP_TURN_BLEED*(dribbling ? 0.75 : 0.28);
      const bleed = bleedBase*Math.pow(sharpness, 0.62)*speedRatio*(1.08 - agility*0.65);
      newSpeed = curSpeed*(1 - bleed*clamp(dt*6.5, 0, 1));
    }

    // aceleracion / desaceleracion gradual (lerp sobre magnitud; agility acelera la respuesta sin pelota)
    const accel = (p.accel*(sprint?1.15:1.0))/mass;
    const decel = accel*MOVE_DECEL_FACTOR;
    const accelBoost = effortSprint ? 2.4 : (0.55 + agility*0.9);
    const accelT = 1-Math.pow(0.001, dt*accel/10*accelBoost);
    const decelT = effortSprint ? accelT : 1-Math.pow(0.001, dt*decel/10*(0.7 + agility*0.5));
    newSpeed = targetSpeed > newSpeed
      ? lerp(newSpeed, targetSpeed, accelT)
      : lerp(newSpeed, targetSpeed, decelT);

    p.vx = Math.cos(newAngle)*newSpeed;
    p.vy = Math.sin(newAngle)*newSpeed;
  } else if(!effortSprint) {
    // sin input: frenado gradual (inercia al soltar el stick)
    const brakeRate = clamp(0.0007*mass, 0.0004, 0.0016);
    p.vx = lerp(p.vx, 0, 1-Math.pow(brakeRate, dt*10));
    p.vy = lerp(p.vy, 0, 1-Math.pow(brakeRate, dt*10));
  }

  return {prevVX, prevVY};
}

// Captura por proximidad: misma regla para todos; dueño logico (possessedBy / feintDetach) ignora distancia.
export function checkBallCapture(p, opts = {}){
  if(!p || ball.owner === p) return false;
  if(ball.owner !== null) return false;
  if(ball.state !== BALL_STATE.FREE && ball.state !== BALL_STATE.LOOSE_BALL) return false;
  if(ball.z >= 1.15) return false;

  const forceEnd = !!opts.forceEnd;
  const isLogicalOwner = ball.possessedBy === p.id ||
    isChaseOwner(p) ||
    !!(ball.feintDetach && ball.feintDetach.ownerId === p.id);
  const instantLogicalReclaim = isLogicalOwner &&
    (forceEnd || !p.effortTouchAnim);

  if(!forceEnd && !isLogicalOwner){
    if(p.releaseCooldown > 0) return false;
  }
  if(isPlayerStunned(p) || isPlayerStaggered(p)) return false;
  if(isCpuBlockedFromTeammateLooseBall(p) || isTeammateBlockedFromEffortChase(p)) return false;
  if(!instantLogicalReclaim && dist2D(p, ball) >= getPostTouchRecoverDist(p)) return false;
  if(isPossessionIgnored() && !forceEnd && !instantLogicalReclaim) return false;

  if(forceEnd && isLogicalOwner){
    p.canCollectBall = true;
    p.canCollectBlockT = 0;
    p.releaseCooldown = 0;
    ball.ignorePossessionT = 0;
  }

  if(ball.feintDetach && ball.feintDetach.ownerId === p.id){
    return recoverFakeShotPossession(p);
  }

  if(!p.canCollectBall) return false;
  if(p.releaseCooldown > 0) return false;

  const possessSource = isGoalkeeper(p) ? inferGkPossessionSource(p) : null;
  p.tackleCooldown = TACKLE_COOLDOWN * 0.75;
  p.touchCooldown = 0.12;
  p.charging = null;
  if(p.takePossession(possessSource)){
    clearSprintChaseState(p);
    syncHumanTeamControlOnPossession(p);
    if(isPostTouchChasing(p)) clearChasingState(p);
    return true;
  }
  return false;
}

function movePlayer(p, dt, moveDir, sprint, jockey, opts){
  opts = opts || {};
  if(p.isThrowingIn || p.throwInAnim){
    p.vx = 0;
    p.vy = 0;
    return;
  }
  if(!p.canMove || p.isStuck){
    p.vx = 0;
    p.vy = 0;
    return;
  }
  const manualChase = !!opts.manualChase;
  const forcedChase = !!opts.forcedChase;
  const sprintChase = !!opts.sprintChase || isPlayerSprintChasing(p);
  // lock aereo: sin desplazamiento mientras dura la animacion de contacto
  if(p.airLock && p.airLock.t < p.airLock.dur){
    p.vx = 0;
    p.vy = 0;
    return;
  }

  if(isPlayerStaggered(p)){
    p.vx = lerp(p.vx, 0, clamp(dt * 3.2, 0, 1));
    p.vy = lerp(p.vy, 0, clamp(dt * 3.2, 0, 1));
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = clamp(p.x, 0.3, FIELD_L - 0.3);
    p.y = clamp(p.y, 0.3, FIELD_W - 0.3);
    return;
  }

  const moveMag0 = Math.hypot(moveDir.x, moveDir.y);
  let moveMag = moveMag0;
  let wantMove = moveMag > 0.05;
  const fakeShotRecovery = isFakeShotRecoveryChase(p);
  const looseTouchSprint = isFakeShotLooseChase(p);
  const effortSprint = looseTouchSprint || !!(p.isEffortSprinting && ball.owner === p);
  const chasing = isPlayerChasing(p) || sprintChase;
  p.sprinting = (sprint || effortSprint) && wantMove; // usado por updateBallPosition (trote vs sprint)

  // Convergencia post-fake shot: punto fijo solo para feintDetach.
  let activeMoveDir = moveDir;
  const chaseLockTarget = fakeShotRecovery && p.effortChaseTarget;
  if(chaseLockTarget){
    const dx = p.effortChaseTarget.x - p.x, dy = p.effortChaseTarget.y - p.y;
    const td = Math.hypot(dx, dy);
    if(td > 0.05){
      activeMoveDir = {x: dx / td, y: dy / td};
      moveMag = 1;
      wantMove = true;
    }
  } else if(effortSprint && !wantMove){
    const dx = ball.x - p.x, dy = ball.y - p.y;
    const td = Math.hypot(dx, dy);
    if(td > 0.05){
      activeMoveDir = {x: dx/td, y: dy/td};
      moveMag = 1;
      wantMove = true;
    }
  }

  // --- DETECCION DE GIRO CON PELOTA ---
  // si el jugador conduce y el rumbo pedido (moveDir) difiere mucho de hacia donde esta orientado
  // ahora (p.facing), no lo dejamos arrancar a correr directo hacia alla: primero se dispara un
  // toque de acomodo breve (p.turnTouch). Mientras esa transicion esta activa no se vuelve a
  // evaluar (no tiene sentido "reabrir" el giro a mitad de un toque que ya esta en curso).
  if(ball.owner===p && !isGkHandsPossession(p) && wantMove && !p.turnTouch && !chasing && !effortSprint && !p.stumble && !p.charging && !p.pendingKick && !p.blockDribbling){
    const moveAng = Math.atan2(activeMoveDir.y, activeMoveDir.x);
    const turnAmount = Math.abs(angDiff(moveAng, p.facing));
    if(turnAmount > TURN_TOUCH_ANGLE){
      const dirX = activeMoveDir.x/moveMag, dirY = activeMoveDir.y/moveMag;
      const legLead = Math.sin(p.animPhase) >= 0 ? 1 : -1;
      p.turnTouch = {t:0, dur:TURN_TOUCH_DUR, dir:{x:dirX, y:dirY}};
      // reutiliza el mismo sistema de animacion de puntapie que el toque normal de conduccion (ver
      // mas abajo y drawNormalPose), pero apuntando hacia el nuevo rumbo en vez del rumbo actual
      p.touchAnim = {t:0, dur:TURN_TOUCH_DUR, leg:legLead};
      p.touchCooldown = Math.max(p.touchCooldown||0, TURN_TOUCH_DUR); // no de otro toque de carrera encima
    }
  }

  let maxSpeed = getPlayerMoveSpeedBase(p) * (sprint?1.42:1.0) * (jockey?0.55:1.0);
  if(sprintChase){
    maxSpeed = getPlayerMaxSprintVelocity(p);
  } else if(forcedChase) maxSpeed = getPlayerMoveSpeedBase(p) * FORCED_CHASE_SPEED_MULT;
  if(fakeShotRecovery) maxSpeed = p.maxVelocity || p.maxSprintVelocity || getPlayerMaxSprintVelocity(p);
  else if(!sprintChase && effortSprint) maxSpeed = p.maxSprintVelocity || getPlayerMaxSprintVelocity(p);
  else if(ball.owner===p && !forcedChase && !sprintChase) maxSpeed *= 0.91;
  if(isGkHandsPossession(p)) maxSpeed *= 0.68;
  if(p.stumble) maxSpeed *= 0.3; // tropezando tras perder un duelo: se mueve mucho mas lento un instante
  // PREPARANDO_ACCION con pelota en pie: cargando o windup post-suelta — no aplica en sprint_chase
  if((p.charging || p.pendingKick) && !isPlayerSprintChasing(p)) maxSpeed *= PREP_SPEED_FACTOR;
  // ESTADO DE TRANSICION (toque de acomodo del giro): velocidad de desplazamiento casi nula durante
  // los ~100ms del toque — recien cuando p.turnTouch se apaga (ver bloque de abajo) se vuelve a
  // permitir que vx/vy suban hacia la velocidad de carrera normal.
  if(p.turnTouch) maxSpeed *= TURN_TOUCH_SPEED_FACTOR;

  const mass = p.weightFactor || 1;
  const sprintActive = sprint || effortSprint;
  const {prevVX, prevVY} = updateMovement(p, dt, activeMoveDir, moveMag, wantMove, maxSpeed, sprintActive, mass);

  if(p.effortExitBlendT > 0){
    applyEffortExitVelocityBlend(p, dt, activeMoveDir, moveMag, maxSpeed);
  }

  // --- INCLINACION DEL CUERPO (para la animacion, ver drawNormalPose): se calcula a partir de la
  // aceleracion real de este frame proyectada sobre la orientacion del jugador (adelante/atras y
  // hacia los costados), mas una inclinacion de base al correr rapido sostenido (como un sprinter
  // que carga el cuerpo hacia adelante). Todo suavizado con lerp para que no salte de golpe.
  const dvx = (p.vx-prevVX)/Math.max(dt,0.0001), dvy = (p.vy-prevVY)/Math.max(dt,0.0001);
  const fX = Math.cos(p.facing), fY = Math.sin(p.facing);
  const rX = -fY, rY = fX; // perpendicular (derecha del jugador)
  const fwdAccel = dvx*fX + dvy*fY;
  const sideAccel = dvx*rX + dvy*rY;
  const speedAfter = Math.hypot(p.vx, p.vy);
  const targetLeanFwd = clamp(fwdAccel*0.009, -0.3, 0.16) + clamp(speedAfter/Math.max(maxSpeed,0.1),0,1)*0.15;
  const targetLeanSide = clamp(sideAccel*0.016, -0.36, 0.36);
  p.leanFwd = lerp(p.leanFwd||0, targetLeanFwd, clamp(dt*7,0,1));
  p.leanSide = lerp(p.leanSide||0, targetLeanSide, clamp(dt*7,0,1));

  // orientacion inteligente: 5 reglas en orden de prioridad (la primera que aplica gana).
  // 0) toque de acomodo del giro (turnTouch): mientras dura la transicion de 100ms, el cuerpo gira
  //    rapido hacia el NUEVO rumbo (no hacia la velocidad actual, que esta casi frenada) — pisa
  //    inclusive al jockey, porque una vez que el giro se disparo ya no tiene sentido revertirlo.
  // 1) jockey (L2): SIEMPRE mira hacia quien tiene la pelota (o la pelota suelta), sin importar
  //    hacia donde te muevas — permite defender de costado/hacia atras sin perder la marca, como
  //    el "contain" de EA FC. Es un comando manual explicito, pisa cualquier otra regla (salvo 0).
  // 2) conduccion (dribbling): si el jugador tiene la pelota y corre con ella, mira hacia donde se
  //    mueve (su vector de velocidad) y no hacia la pelota, para que la animacion de carrera tenga
  //    sentido (parece que corre "hacia adelante" con la pelota pegada al pie).
  // 3) sprint / retroceso defensivo: corriendo a maxima velocidad (tracking back hacia el propio
  //    campo, o persiguiendo una marca lejos de la pelota) mira hacia donde corre, no hacia la
  //    pelota, para que la animacion de sprint tenga sentido fisico.
  // 4) por defecto (atento a la jugada): quieto, trotando despacio o posicionandose — orienta el
  //    cuerpo mirando directamente hacia la pelota (de frente/espalda/perfil segun de donde venga).
  const speed = speedAfter;
  const dribbling = ball.owner===p && speed>0.5 && !isGkHandsPossession(p) && !p.blockDribbling;
  const stunned = isPlayerStunned(p);
  if(p.turnTouch){
    const targetFacing = Math.atan2(p.turnTouch.dir.y, p.turnTouch.dir.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*14,0,1);
  } else if(forcedChase && wantMove && !stunned){
    const targetFacing = Math.atan2(moveDir.y, moveDir.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*10,0,1);
  } else if(forcedChase && wantMove && !stunned){
    const targetFacing = Math.atan2(moveDir.y, moveDir.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*10,0,1);
  } else if(manualChase && wantMove && !stunned){
    const targetFacing = Math.atan2(moveDir.y, moveDir.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*8,0,1);
  } else if(jockey && !p.stumble && !stunned){
    const target = ball.owner || ball;
    const targetFacing = Math.atan2(target.y-p.y, target.x-p.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*9,0,1);
  } else if(effortSprint && wantMove && !stunned){
    const targetFacing = Math.atan2(activeMoveDir.y, activeMoveDir.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*5,0,1);
  } else if(dribbling && !stunned){
    const targetFacing = Math.atan2(p.vy, p.vx);
    // un poco mas lento que antes (dt*8 -> dt*6): que el cuerpo tarde en terminar de girar
    // acompaña el frenado fisico de mas arriba, en vez de que la orientacion "salte" antes de
    // tiempo y disimule el peso del cambio de direccion
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*6,0,1);
  } else if((sprint || effortSprint) && wantMove && speed>1.5 && !stunned){
    const targetFacing = Math.atan2(moveDir.y, moveDir.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*8,0,1);
  } else if(!stunned){
    const targetFacing = Math.atan2(ball.y-p.y, ball.x-p.x);
    p.facing += angDiff(targetFacing, p.facing) * clamp(dt*6,0,1);
  }
  syncPlayerDir(p);
  p.x += p.vx*dt; p.y += p.vy*dt;
  p.x = clamp(p.x, 0.3, FIELD_L-0.3);
  p.y = clamp(p.y, 0.3, FIELD_W-0.3);
  if(isKickoffDefendingTeam(p.team)) clampKickoffDefenderPosition(p);
  if(isKickoffTaker(p) && !p.kickoffAnim){
    teleportKickoffTakerHard(p);
  }
  // SINCRONIZAR EL PASO CON EL AVANCE REAL: el ciclo de piernas ahora avanza segun la distancia
  // que el jugador REALMENTE recorrio este frame (speedAfter*dt / largo-de-zancada), no solo
  // porque paso el tiempo. Antes habia un ritmo minimo aunque el jugador estuviera parado, lo que
  // hacia que las piernas se siguieran moviendo sin que el cuerpo avanzara — el clasico efecto de
  // "patinar" sobre el cesped. Ahora, si no hay desplazamiento real, el ciclo queda congelado.
  const strideLen = clamp(1.55*clamp(1.15-(mass-1)*0.4, 0.8, 1.25), 1.15, 1.95); // distancia (unidades) de una zancada completa
  p.animPhase += (speed*dt/strideLen) * Math.PI*2;
  // AMORTIGUACION DE REPOSO: cuando el jugador esta quieto (o casi), el ciclo de piernas ya no
  // avanza (arriba), pero para que no quede "congelado" a mitad de zancada, la AMPLITUD del vaiven
  // se desvanece suave hacia 0 (ver drawNormalPose, usa p.legIdleBlend) — el jugador termina
  // asentado con los pies casi juntos en vez de trabado en una pose rara.
  p.legIdleBlend = lerp(p.legIdleBlend||0, speed>0.25 ? 1 : 0, clamp(dt*5,0,1));
  if(p.tackleCooldown>0) p.tackleCooldown -= dt;

  // --- DRIBBLING A TOQUES ---
  // si este jugador tiene la pelota, se esta moviendo, y la pelota quedo muy cerca del pie,
  // le da un pequeño toque hacia adelante (en la direccion en la que corre) y arranca un
  // cooldown para que no la toque de nuevo hasta dentro de un instante. Eso hace que la
  // pelota se adelante un poquito y el jugador tenga que correr tras ella para el proximo
  // toque, en vez de llevarla pegada al pie.
  if(p.touchCooldown>0) p.touchCooldown -= dt;
  if(p.effortTouchCooldown>0) p.effortTouchCooldown -= dt;
  // animacion de toque en curso: avanza su reloj interno; se apaga sola al terminar
  if(p.touchAnim){
    p.touchAnim.t += dt;
    if(p.touchAnim.t >= p.touchAnim.dur){
      p.touchAnim = null;
      if(ball.lastAction === 'feint' && ball.owner === p) finishExtendedDribbleAnim(p);
    }
  }
  if(p.effortTouchAnim){
    p.effortTouchAnim.t += dt;
    if(p.effortTouchAnim.t >= p.effortTouchAnim.dur){
      p.effortTouchAnim = null;
      if(ball.owner === p) finishExtendedDribbleAnim(p);
    }
  }

  // --- ACOMODO DE PELOTA DURANTE EL GIRO (turnTouch) ---
  // la posicion final de la pelota la fija bindBallToOwner() al cerrar el frame.
  if(p.turnTouch){
    p.turnTouch.t += dt;
    if(p.turnTouch.t >= p.turnTouch.dur) p.turnTouch = null;
  }

  if(ball.owner===p && ball.state === BALL_STATE.IN_POSSESSION && wantMove && !p.turnTouch && !chasing && !effortSprint && !isGkHandsPossession(p) && !p.blockDribbling){
    const touchDist = dist2D(p, ball);
    if(touchDist < TOUCH_DISTANCE && p.touchCooldown<=0){
      p.touchCooldown = TOUCH_COOLDOWN_MIN + Math.random()*(TOUCH_COOLDOWN_MAX-TOUCH_COOLDOWN_MIN);
      const legLead = Math.sin(p.animPhase) >= 0 ? 1 : -1;
      p.touchAnim = {t:0, dur:TOUCH_ANIM_DUR, leg:legLead};
    }
  }

  p.moveInputDir = wantMove
    ? {x: activeMoveDir.x * moveMag, y: activeMoveDir.y * moveMag}
    : {x: 0, y: 0};

  checkBallCapture(p);
}

/* ============================================================
   ENTRADA DE PIE (parada) Y BARRIDA (deslizamiento) — con animacion
   Tacle/barrida: impacto otorga posesion con retardo · stun 800ms · staggered 1000ms
   ============================================================ */
// TackleBox frontal (1.5x tamano del jugador): comprueba si la pelota cae dentro del area
// orientada hacia dirX/dirY. reach = profundidad maxima (TACKLE_RADIUS).
function ballInTackleBox(p, dirX, dirY, reach){
  const bodySize = PLAYER_BODY_RADIUS*2*TACKLE_BOX_SCALE;
  const depth = Math.max(reach, bodySize*0.5);
  const halfW = depth*0.72;
  const dx = ball.x - p.x, dy = ball.y - p.y;
  const fwd = dx*dirX + dy*dirY;
  const lat = Math.abs(-dy*dirX + dx*dirY);
  return fwd >= -PLAYER_BODY_RADIUS*0.4 && fwd <= depth && lat <= halfW;
}

function applyTackleCarryInertia(p, a){
  const speed = a.type === 'slide' ? SLIDE_TACKLE_CARRY_SPEED : STAND_TACKLE_CARRY_SPEED;
  a.carryVx = a.dirX * speed;
  a.carryVy = a.dirY * speed;
  p.vx = a.carryVx;
  p.vy = a.carryVy;
}

function tackleAnimProgress(p){
  const a = p.tackleAnim;
  if(!a || a.dur <= 0) return 0;
  return clamp(a.t / a.dur, 0, 1);
}

function canChainTackle(p){
  return !!(p.tackleAnim && tackleAnimProgress(p) >= TACKLE_CHAIN_AFTER);
}

function isBallAboveKnee(){
  return ball.z > BALL_KNEE_HEIGHT_Z;
}

function hasRivalPossession(p){
  return !!(ball.owner && ball.owner.team !== p.team);
}

function isLooseBallForDefense(){
  return ball.owner === null;
}

function isWithinSlideReceptionZone(p){
  return dist2D(p, ball) <= SLIDE_RECEPTION_BLOCK_RADIUS;
}

function canUseStandingTackle(p){
  if(ball.owner === p || p.role === 'GK') return false;
  if(isBallAboveKnee()) return false;
  return hasRivalPossession(p);
}

function canUseSlideTackle(p){
  if(ball.owner === p || p.role === 'GK') return false;
  if(isBallAboveKnee()) return false;
  if(hasRivalPossession(p)) return true;
  if(isLooseBallForDefense()) return !isWithinSlideReceptionZone(p);
  return false;
}

function startTackle(p, type, aimDir){
  if(isKickoffWaiting()) return false;
  const chaining = canChainTackle(p);
  if(!chaining && p.tackleCooldown > 0) return false;
  if(p.tackleAnim && !chaining) return false;
  if(p.diveAnim || p.airStrikeAnim) return false;
  if(isBallAboveKnee()) return false;
  if(type === 'stand' && !canUseStandingTackle(p)) return false;
  if(type === 'slide' && !canUseSlideTackle(p)) return false;
  if(ball.owner && isGkHandsImmune(ball.owner)) return false;
  if(chaining) p.tackleAnim = null;

  let dir = (aimDir && Math.hypot(aimDir.x, aimDir.y) > 0.05) ? norm(aimDir) : {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  // Prioridad tacle: mirar instantaneamente hacia la pelota si esta dentro del radio
  if(type === 'stand' && dist2D(p, ball) <= TACKLE_LOOK_RADIUS){
    dir = norm({x: ball.x - p.x, y: ball.y - p.y});
  }
  p.tackleAnim = {
    type,
    t: 0,
    dur: type === 'slide' ? SLIDE_DURATION : STAND_TACKLE_DURATION,
    dirX: dir.x, dirY: dir.y,
    startX: p.x, startY: p.y,
    resolved: false, success: false, foul: false,
    carryVx: 0, carryVy: 0
  };
  p.facing = Math.atan2(dir.y, dir.x);
  p.vx = 0; p.vy = 0;
  p.charging = null;
  p.pendingKick = null;
  return true;
}

function tryDefensiveTackleInput(p, input){
  if(p.charging) return false;
  if(isBallAboveKnee()) return false;

  if(input.pressSlide && canUseSlideTackle(p)){
    return startTackle(p, 'slide', p.stickDir);
  }
  if((input.pressTackle || input.pressTackleAlt) && canUseStandingTackle(p)){
    return startTackle(p, 'stand', p.stickDir);
  }
  return false;
}

function resolveStandTackle(p, a){
  if(a.resolved) return;
  if(!ballInTackleBox(p, a.dirX, a.dirY, TACKLE_RADIUS)) return;

  const victim = ball.owner;
  if(victim && isGkHandsImmune(victim)) return;
  if(victim && !canTakeBallFromOwner(p, victim)) return;
  if(dist2D(p, ball) > TACKLE_RADIUS) return;

  a.resolved = true;
  a.success = true;
  grantTacklePossession(p, victim && victim.team !== p.team ? victim : null);
}

// Barrida: despeje con slideHitbox alineado al pie extendido (ver drawSlideTackle / computeSlideHitbox).
function computeSlideHitbox(p, a, prog){
  const active = prog >= SLIDE_ACTIVE_START && prog <= SLIDE_ACTIVE_END;
  const windowSpan = SLIDE_ACTIVE_END - SLIDE_ACTIVE_START;
  const windowT = active ? clamp((prog - SLIDE_ACTIVE_START) / windowSpan, 0, 1) : 0;
  // pierna al maximo en el centro de la ventana activa (sin coincide con la pose visual)
  const extendT = active ? Math.sin(windowT * Math.PI) : 0;
  const legReach = SLIDE_LEG_REACH * (0.62 + 0.38 * extendT);
  const peakScale = active
    ? 1 + extendT * (SLIDE_HITBOX_PEAK_SCALE - 1)
    : 1;
  return {
    active,
    cx: p.x + a.dirX * legReach,
    cy: p.y + a.dirY * legReach,
    dirX: a.dirX,
    dirY: a.dirY,
    halfLen: SLIDE_HITBOX_HALF_LEN * peakScale,
    halfW: SLIDE_HITBOX_HALF_W * peakScale,
  };
}

function ballIntersectsSlideHitbox(hb){
  const dx = ball.x - hb.cx, dy = ball.y - hb.cy;
  const pad = BALL_RADIUS + 0.06;
  // caja orientada alrededor del pie extendido
  const fwd = dx * hb.dirX + dy * hb.dirY;
  const lat = Math.abs(-dy * hb.dirX + dx * hb.dirY);
  if(fwd >= -hb.halfLen * 0.35 - pad && fwd <= hb.halfLen + pad && lat <= hb.halfW + pad) return true;
  // respaldo circular por si la pelota roza el borde del capsule
  return Math.hypot(dx, dy) <= hb.halfLen + hb.halfW * 0.65 + pad;
}

function randomDirInCone(dirX, dirY, coneDeg){
  const half = (coneDeg * Math.PI / 180) * 0.5;
  const base = Math.atan2(dirY, dirX);
  const angle = base + (Math.random() * 2 - 1) * half;
  return {x: Math.cos(angle), y: Math.sin(angle)};
}

function slideTackle(p, a, prog){
  if(a.resolved || a.type !== 'slide') return;

  const hb = computeSlideHitbox(p, a, prog);
  if(!hb.active) return;
  if(!ballIntersectsSlideHitbox(hb)) return;

  const victim = ball.owner;
  if(victim && isGkHandsImmune(victim)) return;
  if(victim && !canTakeBallFromOwner(p, victim)) return;

  a.resolved = true;
  a.success = true;
  grantTacklePossession(p, victim && victim.team !== p.team ? victim : null);
}

function resolveTackleImpact(p, a){
  if(a.type !== 'slide') resolveStandTackle(p, a);
}

function updateSlidePosition(p, a, prog, dt){
  if(a.success && a.carryVx){
    p.x += a.carryVx * dt;
    p.y += a.carryVy * dt;
    p.vx = a.carryVx;
    p.vy = a.carryVy;
  } else {
    const eased = 1 - Math.pow(1 - prog, 2);
    const travelled = SLIDE_DISTANCE * eased;
    p.x = a.startX + a.dirX * travelled;
    p.y = a.startY + a.dirY * travelled;
  }
  p.x = clamp(p.x, 0.3, FIELD_L - 0.3);
  p.y = clamp(p.y, 0.3, FIELD_W - 0.3);
}

function checkSlideFoul(p, a, prog){
  if(a.resolved || a.type !== 'slide') return;
  if(prog < SLIDE_ACTIVE_START || prog > SLIDE_ACTIVE_END) return;
  for(const opp of allPlayers){
    if(opp.team === p.team || opp === p) continue;
    if(dist2D(p, opp) < PLAYER_BODY_RADIUS * 2.2 && Math.random() < SLIDE_FOUL_CHANCE * 0.016){
      a.foul = true;
      a.resolved = true;
      showBanner('¡FALTA!', 1100);
      break;
    }
  }
}

function updateTackleAnim(p, dt){
  const a = p.tackleAnim;
  a.t += dt;
  const prog = clamp(a.t/a.dur, 0, 1);

  if(a.type==='slide'){
    updateSlidePosition(p, a, prog, dt);
    slideTackle(p, a, prog);
    checkSlideFoul(p, a, prog);
  } else {
    if(a.success && a.carryVx){
      p.x += a.carryVx * dt;
      p.y += a.carryVy * dt;
      p.x = clamp(p.x, 0.3, FIELD_L - 0.3);
      p.y = clamp(p.y, 0.3, FIELD_W - 0.3);
      p.vx = a.carryVx;
      p.vy = a.carryVy;
    } else {
      const travelled = STAND_TACKLE_LUNGE * Math.min(1, prog * 1.6);
      p.x = clamp(a.startX + a.dirX * travelled, 0.3, FIELD_L - 0.3);
      p.y = clamp(a.startY + a.dirY * travelled, 0.3, FIELD_W - 0.3);
    }
    if(!a.resolved && prog >= 0.35 && prog <= 0.75){
      resolveTackleImpact(p, a);
    }
  }

  if(prog >= 1){
    if(a.success){
      p.vx = a.carryVx || p.vx;
      p.vy = a.carryVy || p.vy;
    }
    p.tackleAnim = null;
    if(a.type === 'slide') p.tackleCooldown = a.success ? SLIDE_RECOVERY_HIT : SLIDE_RECOVERY_MISS;
    else p.tackleCooldown = STAND_RECOVERY;
  }
}

/* ============================================================
   ESTIRADA DEL ARQUERO — con animacion, no siempre llega
   ============================================================ */
function startGKDive(p, targetY, availableTime, predZ){
  const goalX = p.ownGoalX();
  const dir = p.attackDir();
  const diveType = predZ >= GK_JUMP_MIN_Z ? 'jump' : 'dive';
  p.diveAnim = {
    type: diveType,
    t: 0,
    dur: clamp(availableTime, GK_DIVE_MIN_DUR, GK_DIVE_MAX_DUR),
    startX: p.x, startY: p.y,
    targetX: goalX + dir*0.35,
    targetY: clamp(targetY, CENTER.y-GOAL_HALF-1.2, CENTER.y+GOAL_HALF+1.2),
    jumpHeight: clamp(predZ||0, 0.6, 2.3),
    resolved: false, success: false
  };
  p.facing = Math.atan2(p.diveAnim.targetY-p.y, dir*2.5);
  p.vx = 0; p.vy = 0;
}

function updateGKDive(p, dt){
  const a = p.diveAnim;
  a.t += dt;
  const prog = clamp(a.t/a.dur, 0, 1);
  const eased = 1-Math.pow(1-prog,2); // arranca rapido, como un salto
  p.x = lerp(a.startX, a.targetX, eased);
  p.y = lerp(a.startY, a.targetY, eased);

  if(!a.resolved && prog>0.2 && !ball.owner){
    const d = dist2D(p, ball);
    if(d < GK_SAVE_RADIUS){
      a.resolved = true; a.success = true;
      ball.highKick = false; // atajada del arquero: no es un tiro/centro, fisica normal
      if(Math.random() < GK_CATCH_CHANCE){
        setBallStateInPossession(p, 'save');
      } else {
        setBallStateLoose(true);
        ball.lastTouchedBy = p.id;
        ball.lastTouchTeam = p.team;
        const dir = p.attackDir();
        const away = norm({x: dir, y: (Math.random()-0.5)*1.6});
        ball.vx = away.x*7 + Math.random()*1.5;
        ball.vy = away.y*6;
        ball.vz = 1.6 + Math.random()*1.4;
      }
      ball.lastTouchTeam = p.team;
    }
  }

  if(prog>=1){
    p.diveAnim = null;
    p.tackleCooldown = TACKLE_COOLDOWN * 2.75;
  }
}


/* ============================================================
   GOLES / LIMITES — postes, travesaño, GoalZone (trigger), red, fieldBoundary,
   OutZone (franja entre linea de cal y BoundaryWall) y piso extendido del estadio.
   ============================================================ */
const fieldBoundary = { xMin: 0, yMin: 0, xMax: FIELD_L, yMax: FIELD_W };

const stadiumBounds = {
  xMin: -OUT_ZONE_DEPTH,
  yMin: -OUT_ZONE_DEPTH,
  xMax: FIELD_L + OUT_ZONE_DEPTH,
  yMax: FIELD_W + OUT_ZONE_DEPTH,
};

const OutZone = {
  xMin: stadiumBounds.xMin,
  yMin: stadiumBounds.yMin,
  xMax: stadiumBounds.xMax,
  yMax: stadiumBounds.yMax,
  depth: OUT_ZONE_DEPTH,
};

function buildBoundaryWalls(){
  const sb = stadiumBounds;
  return [
    { solid: true, id: 'BoundaryWall_Top', type: 'boundary', axis: 'y', pos: sb.yMin, inward: 1 },
    { solid: true, id: 'BoundaryWall_Bottom', type: 'boundary', axis: 'y', pos: sb.yMax, inward: -1 },
    { solid: true, id: 'BoundaryWall_Left', type: 'boundary', axis: 'x', pos: sb.xMin, inward: 1 },
    { solid: true, id: 'BoundaryWall_Right', type: 'boundary', axis: 'x', pos: sb.xMax, inward: -1 },
  ];
}
const BoundaryWalls = buildBoundaryWalls();

function resetGoalZoneTracking(){
  Game.goalZoneInside = { left: false, right: false };
  Game.goalZonePassed = { left: false, right: false };
  Game.isGoal = false;
  // isGoalScored NO se resetea aqui: solo en placeKickoff (saque de centro)
  clearBallLock();
  if(ball){
    ball.isGoal = false;
    ball.stuckT = 0;
    clearGoalNetTriggerState(ball);
  }
}

function clearGoalNetTriggerState(b){
  if(!b) return;
  b.isInsideGoalTrigger = false;
  b.isTouchingNet = false;
  b.goalNetGravityActive = false;
  b.goalNetTriggerSide = null;
  b.netTouchT = 0;
  b.gravity = GRAVITY;
}

function buildGoalFrame(goalLineX, inward, scoringTeam){
  const yNear = CENTER.y - GOAL_HALF;
  const yFar = CENTER.y + GOAL_HALF;
  const backX = goalLineX + inward * GOAL_DEPTH;
  const side = inward < 0 ? 'left' : 'right';

  const Poste_Izquierdo = {
    isSolid: true,
    isTrigger: false,
    solid: true,
    id: 'Poste_Izquierdo',
    type: 'post',
    pos: yNear,
    zMax: CROSSBAR_Z,
  };
  const Poste_Derecho = {
    isSolid: true,
    isTrigger: false,
    solid: true,
    id: 'Poste_Derecho',
    type: 'post',
    pos: yFar,
    zMax: CROSSBAR_Z,
  };
  const Travesaño = {
    isSolid: true,
    isTrigger: false,
    solid: true,
    id: 'Travesaño',
    type: 'crossbar',
    z: CROSSBAR_Z,
    yMin: yNear,
    yMax: yFar,
  };
  const GoalZone = {
    isTrigger: true,
    isSolid: false,
    solid: false,
    id: 'GoalZone',
    planeX: goalLineX,
    inward,
    yNear,
    yFar,
    zMin: 0,
    zMax: CROSSBAR_Z,
    depth: GOAL_ZONE_DEPTH,
  };
  const net_mesh = {
    isTrigger: true,
    isSolid: false,
    backNet: {
      isTrigger: true,
      isSolid: false,
      id: 'net_back',
      type: 'backNet',
      planeX: backX,
      inward,
      goalLineX,
      yNear,
      yFar,
      zMax: CROSSBAR_Z,
    },
    sideNear: {
      isTrigger: true,
      isSolid: false,
      id: 'net_side_near',
      type: 'sideNet',
      pos: yNear,
      goalLineX,
      inward,
      zMax: CROSSBAR_Z,
    },
    sideFar: {
      isTrigger: true,
      isSolid: false,
      id: 'net_side_far',
      type: 'sideNet',
      pos: yFar,
      goalLineX,
      inward,
      zMax: CROSSBAR_Z,
    },
  };
  const Red = net_mesh.backNet;

  return {
    side,
    goalLineX,
    inward,
    scoringTeam,
    yNear,
    yFar,
    backX,
    Poste_Izquierdo,
    Poste_Derecho,
    Travesaño,
    GoalZone,
    Red,
    net_mesh,
    structureSolids: [Poste_Izquierdo, Poste_Derecho, Travesaño],
  };
}

export const GOAL_FRAMES = [
  buildGoalFrame(GOAL_LINE_LEFT, -1, 'away'),
  buildGoalFrame(GOAL_LINE_RIGHT, 1, 'home'),
];

function isBallPastGoalLine(b, side){
  const r = BALL_RADIUS;
  if(side === 'left') return b.x + r <= GOAL_LINE_LEFT + GOAL_LINE_SENSOR_EPS;
  if(side === 'right') return b.x - r >= GOAL_LINE_RIGHT - GOAL_LINE_SENSOR_EPS;
  return false;
}

function isBallInGoalMouth(b, sensor){
  const s = sensor || { yNear: CENTER.y - GOAL_HALF, yFar: CENTER.y + GOAL_HALF, zMax: CROSSBAR_Z };
  return b.y >= s.yNear && b.y <= s.yFar && b.z < s.zMax;
}

function isBallInsideGoalVolume(b, side){
  if(!isBallInGoalMouth(b)) return false;
  return isBallPastGoalLine(b, side);
}

function getGoalNetSide(b){
  if(!isBallInGoalMouth(b)) return null;
  if(isBallPastGoalLine(b, 'left')) return 'left';
  if(isBallPastGoalLine(b, 'right')) return 'right';
  return null;
}

function getGoalNetFrictionMult(b){
  if(shouldApplyScoredGoalNetPhysics(b)) return 1;
  if(b.isTouchingNet && b.isInsideGoalTrigger && !b.goalNetGravityActive) return 1;
  if(b.backNetContactT > 0) return BACK_NET_FRICTION_MULT;
  const side = getGoalNetSide(b);
  if(!side) return 1;
  if(!Game.goalZonePassed || !Game.goalZonePassed[side]) return 1;
  return isBallInsideGoalVolume(b, side) ? GOAL_NET_FRICTION_MULT : 1;
}

function isInsideGoalTrigger(b, frame){
  if(!ballPassedGoalZone(b, frame)) return false;
  return isBallInsideGoalVolume(b, frame.side);
}

function isBallTouchingNetMesh(b, frame){
  if(!isInsideGoalTrigger(b, frame)) return false;
  const depth = frame.inward < 0 ? frame.goalLineX - b.x : b.x - frame.goalLineX;
  return depth > BALL_RADIUS * 0.45;
}

function updateGoalNetTriggerPhysics(b, dt){
  let insideAny = false;
  for(const frame of GOAL_FRAMES){
    if(!ballPassedGoalZone(b, frame)) continue;
    const inside = isInsideGoalTrigger(b, frame);
    if(!inside){
      if(b.goalNetTriggerSide === frame.side) clearGoalNetTriggerState(b);
      continue;
    }
    insideAny = true;
    b.isInsideGoalTrigger = true;

    if(b.goalNetTriggerSide !== frame.side){
      const prevSide = b.goalNetTriggerSide;
      b.goalNetTriggerSide = frame.side;
      if(!isScoredGoalSequenceActive() || prevSide !== null){
        b.vx = 0;
        b.vy = 0;
        b.curveFactor = 0;
        if(b.vz > 0) b.vz = 0;
      }
      b.netTouchT = 0;
      b.goalNetGravityActive = isScoredGoalSequenceActive();
      b.isTouchingNet = isBallTouchingNetMesh(b, frame);
      b.gravity = isScoredGoalSequenceActive() ? GOAL_NET_GRAVITY : GRAVITY;
    }

    if(isScoredGoalSequenceActive()){
      b.isTouchingNet = true;
      continue;
    }

    b.isTouchingNet = isBallTouchingNetMesh(b, frame);
    if(!b.isTouchingNet) continue;

    b.netTouchT += dt;
    const slideDrop = Math.pow(GOAL_NET_SLIDE_FRICTION, dt * 60);
    b.vx *= slideDrop;
    b.vy *= slideDrop;

    if(b.netTouchT >= GOAL_NET_SLIDE_DURATION){
      b.goalNetGravityActive = true;
      b.gravity = GOAL_NET_GRAVITY;
      if(b.vz >= GOAL_NET_FALL_VZ * 0.35) b.vz = GOAL_NET_FALL_VZ;
    }
  }
  if(!insideAny) b.isInsideGoalTrigger = false;
}






function isBallNearGoalArea(b){
  const r = BALL_RADIUS;
  for(const frame of GOAL_FRAMES){
    if(b.y < frame.yNear - GOAL_AREA_Y_PAD || b.y > frame.yFar + GOAL_AREA_Y_PAD) continue;
    const depth = frame.inward < 0 ? frame.goalLineX - b.x : b.x - frame.goalLineX;
    if(depth < -0.35 || depth > GOAL_DEPTH + GOAL_LINE_EXIT_MARGIN + 0.8) continue;
    return true;
  }
  return false;
}

function getOutZoneFrictionMult(b){
  if(ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL || Game.outOfPlay) return OUT_ZONE_FRICTION_MULT;
  if(!isBallInOutZone(b)) return 1;
  return OUT_ZONE_FRICTION_MULT;
}

function getGoalAreaFrictionMult(b){
  if(Game.outOfPlay || ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL) return GOAL_AREA_FRICTION_MULT;
  if(!isBallNearGoalArea(b)) return 1;
  if(Game.goalRoll || Game.isGoal) return 1;
  return GOAL_AREA_FRICTION_MULT;
}

function getGoalBackLineX(side){
  if(side === 'left') return GOAL_LINE_LEFT - GOAL_DEPTH;
  return GOAL_LINE_RIGHT + GOAL_DEPTH;
}

function getGoalExitMarginX(side){
  if(side === 'left') return getGoalBackLineX(side) - GOAL_LINE_EXIT_MARGIN;
  return getGoalBackLineX(side) + GOAL_LINE_EXIT_MARGIN;
}





function registerGoalOnLineCross(frame){
  if(Game.isGoalScored) return false;
  if(Game.deadBall || Game.outOfPlay) return false;
  if(isBallSetPieceFrozen()) return false;
  if(gameState === 'celebration_run') return false;

  const goalkeeper = getDefendingGoalkeeperForFrame(frame);
  if(goalkeeper && ball.owner === goalkeeper) return false;

  if(!isBallInGoalMouth(ball, frame.GoalZone)) return false;

  markGoalZonePassed(ball, frame);

  if(ball.owner){
    ball.lastKicker = ball.owner;
    ball.lastTouchTeam = ball.owner.team;
    ball.lastTouchedBy = ball.owner.id;
  }

  Game.isGoalScored = true;
  Game.isGoal = true;
  ball.isGoal = true;
  ball.stuckT = 0;

  forcePossessionLoss();
  ball.owner = null;
  if(ball.state === BALL_STATE.IN_POSSESSION || ball.state === BALL_STATE.IN_AIR){
    ball.state = BALL_STATE.LOOSE_BALL;
  } else if(ball.state === BALL_STATE.GOAL_CELEBRATION || ball.state === BALL_STATE.DEAD_BALL){
    ball.state = BALL_STATE.FREE;
  }

  if(gameState === 'practice') practiceGoal();
  else scoreGoal(frame.scoringTeam);

  return true;
}

function ballCrossedGoalLinePlane(prevBX, b, frame){
  const zone = frame.GoalZone;
  const r = BALL_RADIUS;
  const line = zone.planeX;
  if(b.y < zone.yNear + r || b.y > zone.yFar - r) return false;
  if(b.z - r > zone.zMax || b.z + r < zone.zMin) return false;
  if(zone.inward < 0){
    return prevBX - r > line && b.x - r <= line + GOAL_LINE_SENSOR_EPS;
  }
  return prevBX + r < line && b.x + r >= line - GOAL_LINE_SENSOR_EPS;
}

function ballPassedGoalZone(b, frame){
  return !!(Game.goalZonePassed && Game.goalZonePassed[frame.side]);
}

function isBallInGoalZone(b, zone){
  const r = BALL_RADIUS;
  if(b.y < zone.yNear + r || b.y > zone.yFar - r) return false;
  if(b.z - r > zone.zMax || b.z + r < zone.zMin) return false;
  const depth = zone.depth || GOAL_ZONE_DEPTH;
  const line = zone.planeX;
  // Sensor delgado sobre la linea blanca: solo hacia adentro del arco, nunca antes de cruzar la meta
  if(zone.inward < 0){
    const xMin = line - depth;
    const xMax = line + GOAL_LINE_SENSOR_EPS;
    return b.x + r >= xMin && b.x - r <= xMax;
  }
  const xMin = line - GOAL_LINE_SENSOR_EPS;
  const xMax = line + depth;
  return b.x + r >= xMin && b.x - r <= xMax;
}

function isValidGoalTrigger(b, frame){
  const speed = b.speed();
  if(speed < GOAL_MIN_TRIGGER_SPEED) return false;
  if(frame.inward < 0) return b.vx <= -GOAL_TOWARD_MIN_VX;
  return b.vx >= GOAL_TOWARD_MIN_VX;
}

function markGoalZonePassed(b, frame){
  if(isValidGoalTrigger(b, frame) || isBallInValidGoalBox(b, frame) || isBallInsideGoalVolume(b, frame.side)){
    Game.goalZonePassed[frame.side] = true;
  }
}

function onGoalZoneTriggerEnter(b, frame){
  markGoalZonePassed(b, frame);
  tryRegisterGoal(frame);
}

function tryRegisterGoal(frame){
  if(Game.isGoal || Game.isGoalScored || Game.goalRoll || gameState === 'celebration_run') return false;
  const goalkeeper = getDefendingGoalkeeperForFrame(frame);
  if(goalkeeper && ball.owner === goalkeeper) return false;
  if(onGoal(frame)){
    ball.isGoal = true;
    Game.isGoal = true;
    Game.isGoalScored = true;
    return true;
  }
  return false;
}

function checkGoalLinePosition(prevBX){
  if(Game.goalRoll || Game.deadBall || Game.outOfPlay || Game.isGoal || Game.isGoalScored) return;
  if(isBallSetPieceFrozen()) return;

  for(const frame of GOAL_FRAMES){
    if(!isBallInValidGoalBox(ball, frame)) continue;
    const crossed = ballCrossedGoalLinePlane(prevBX, ball, frame);
    const insideVolume = isBallInsideGoalVolume(ball, frame.side);
    if(!crossed && !insideVolume) continue;
    markGoalZonePassed(ball, frame);
    if(tryRegisterGoal(frame)) return;
  }
}

function checkBallStuck(dt){
  if(Game.goalRoll || Game.isGoal || Game.isGoalScored || Game.deadBall || Game.outOfPlay) return;
  if(isBallSetPieceFrozen()) return;

  const side = getGoalNetSide(ball);
  const inNetOrMouth = side !== null || isBallNearGoalArea(ball);
  const slow = ball.speed() < BALL_STUCK_SPEED;

  if(inNetOrMouth && slow){
    ball.stuckT += dt;
  } else {
    ball.stuckT = 0;
  }

  if(ball.stuckT < BALL_STUCK_UNSTICK_T) return;
  ball.stuckT = 0;

  for(const frame of GOAL_FRAMES){
    if(!isBallInValidGoalBox(ball, frame)) continue;
    markGoalZonePassed(ball, frame);
    if(tryRegisterGoal(frame)) return;
  }

  const rescueSide = side || (ball.x < FIELD_L / 2 ? 'left' : 'right');
  forcePossessionLoss();
  const pos = goalKickPositionForGoalLine(rescueSide);
  ball.x = pos.x;
  ball.y = pos.y;
  ball.z = BALL_RADIUS;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.state = BALL_STATE.FREE;
  resetGoalZoneTracking();
}

function updateGoalZoneTriggers(prevBX){
  if(Game.goalRoll || Game.outOfPlay || Game.isGoalScored || Game.isGoal) return;
  if(ball.state === BALL_STATE.DEAD_BALL || ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL || ball.state === BALL_STATE.GOAL_CELEBRATION) return;

  for(const frame of GOAL_FRAMES){
    const zone = frame.GoalZone;
    const inside = isBallInGoalZone(ball, zone);
    const wasInside = Game.goalZoneInside[frame.side];
    const crossed = ballCrossedGoalLinePlane(prevBX, ball, frame);

    if(crossed || (inside && !wasInside)){
      onGoalZoneTriggerEnter(ball, frame);
    }

    Game.goalZoneInside[frame.side] = inside;
  }
}

function dampGoalStructureBounce(b){
  const ret = GOAL_POST_BOUNCE;
  b.vx *= ret; b.vy *= ret; b.vz *= ret;
  if(b.curveFactor) b.curveFactor *= ret;
}

function isInsideGoalCavity(b, goalLineX, inward){
  const r = BALL_RADIUS;
  if(inward < 0) return b.x + r <= goalLineX + GOAL_LINE_SENSOR_EPS;
  return b.x - r >= goalLineX - GOAL_LINE_SENSOR_EPS;
}

function resolveGoalSolid(b, frame, solid){
  if(solid.isSolid === false) return;
  if(b.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  const r = BALL_RADIUS;
  const line = frame.goalLineX;
  const ht = GOAL_POST_HALF_THICK;

  if(solid.type === 'post'){
    if(b.z > solid.zMax + r) return;
    const postY = solid.pos;
    const dx = b.x - line;
    const dy = b.y - postY;
    const horizDist = Math.hypot(dx, dy);
    const collideDist = r + ht;
    if(horizDist >= collideDist) return;

    if(horizDist > 0.001){
      const nx = dx / horizDist;
      const ny = dy / horizDist;
      b.x = line + nx * collideDist;
      b.y = postY + ny * collideDist;
      const vDot = b.vx * nx + b.vy * ny;
      if(vDot < 0){
        b.vx -= vDot * nx * 2;
        b.vy -= vDot * ny * 2;
      }
    } else if(solid.id === 'Poste_Izquierdo'){
      b.y = postY + collideDist;
      if(b.vy < 0) b.vy = -b.vy;
    } else {
      b.y = postY - collideDist;
      if(b.vy > 0) b.vy = -b.vy;
    }
    dampGoalStructureBounce(b);
    return;
  }

  if(solid.type === 'crossbar'){
    if(b.y < solid.yMin - r - ht || b.y > solid.yMax + r + ht) return;
    if(Math.abs(b.x - line) > r + ht) return;
    if(b.z > solid.z - r){
      b.z = solid.z - r;
      if(b.vz > 0) b.vz = -b.vz;
      dampGoalStructureBounce(b);
    }
  }
}

function resolveGoalLateralNets(b, frame){
  if(b.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(!ballPassedGoalZone(b, frame)) return;
  const r = BALL_RADIUS;
  const { yNear, yFar } = frame;
  if(b.z > CROSSBAR_Z + r) return;
  if(b.y < yNear + r){ b.y = yNear + r; if(b.vy < 0) b.vy *= 0.18; }
  if(b.y > yFar - r){ b.y = yFar - r; if(b.vy > 0) b.vy *= 0.18; }
}

function resolveBackNet(b, frame){
  if(b.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(!ballPassedGoalZone(b, frame)) return;
  const net = frame.Red;
  if(!isBallInGoalMouth(b, net)) return;
  if(!isInsideGoalCavity(b, net.goalLineX, net.inward)) return;

  const r = BALL_RADIUS;
  const line = net.planeX;
  let hit = false;
  if(net.inward < 0 && b.x - r <= line + GOAL_LINE_SENSOR_EPS){
    b.x = line + r;
    hit = true;
    if(b.vx < 0) b.vx *= 0.04;
  } else if(net.inward > 0 && b.x + r >= line - GOAL_LINE_SENSOR_EPS){
    b.x = line - r;
    hit = true;
    if(b.vx > 0) b.vx *= 0.04;
  }
  if(hit){
    b.vy *= 0.12;
    b.vz *= 0.12;
    if(b.curveFactor) b.curveFactor *= 0.12;
    b.backNetContactT = 0.35;
  }
}


function resolveGoalFrameCollisions(b, frame){
  for(const solid of frame.structureSolids){
    resolveGoalSolid(b, frame, solid);
  }
}

function resolveGoalStructureCollisions(b){
  if(b.state === BALL_STATE.IN_POSSESSION) return;
  if(b.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  for(let pass = 0; pass < 2; pass++){
    for(const frame of GOAL_FRAMES) resolveGoalFrameCollisions(b, frame);
  }
}

function forcePossessionLoss(){
  clearEffortChaseLock(true);
  clearBallLock();
  if(ball.owner){
    clearChasingState(ball.owner);
    clearPlayerAIState(ball.owner);
  }
  ball.owner = null;
  clearAllChasingStates();
  for(const p of allPlayers){
    p.charging = null;
    p.chargeStart = 0;
    p.pendingKick = null;
    clearPlayerPendingAction(p);
    p.isChargingShot = false;
  }
}

// BoundingBox estricto del gol: entre postes y por debajo del travesaño (ball.z < CROSSBAR_Z).
function isBallInValidGoalBox(b, frame){
  const r = BALL_RADIUS;
  const { yNear, yFar } = frame;
  if(b.y - r < yNear || b.y + r > yFar) return false;
  if(b.z - r >= CROSSBAR_Z) return false;
  if(b.z + r < 0) return false;
  if(!isBallPastGoalLine(b, frame.side)) return false;
  return true;
}

function onGoal(frame){
  if(Game.goalRoll || Game.deadBall || Game.isGoal || Game.isGoalScored || isKickoffWaiting()) return false;
  if(!isBallInValidGoalBox(ball, frame)) return false;

  const goalkeeper = getDefendingGoalkeeperForFrame(frame);
  if(goalkeeper && ball.owner === goalkeeper) return false;

  const line = frame.goalLineX;
  const pastLine = frame.inward < 0
    ? ball.x + BALL_RADIUS <= line + GOAL_LINE_SENSOR_EPS
    : ball.x - BALL_RADIUS >= line - GOAL_LINE_SENSOR_EPS;
  if(!pastLine) return false;

  if(ball.owner){
    ball.lastKicker = ball.owner;
    ball.lastTouchTeam = ball.owner.team;
    ball.lastTouchedBy = ball.owner.id;
  }

  ball.owner = null;
  ball.state = BALL_STATE.GOAL_CELEBRATION;
  ball.stuckT = 0;
  forcePossessionLoss();
  ball.owner = null;
  ball.state = BALL_STATE.GOAL_CELEBRATION;

  if(gameState === 'practice') practiceGoal();
  else scoreGoal(frame.scoringTeam);
  return true;
}

function isBallOutsideFieldLines(b){
  const fb = fieldBoundary;
  return b.x < fb.xMin || b.x > fb.xMax || b.y < fb.yMin || b.y > fb.yMax;
}

function isBallInOutZone(b){
  return isBallOutsideFieldLines(b);
}

function resolveBoundaryWallAbsorb(b){
  const r = BALL_RADIUS;
  for(const wall of BoundaryWalls){
    let hit = false;
    if(wall.axis === 'y'){
      if(wall.inward > 0 && b.y - r < wall.pos){
        b.y = wall.pos + r;
        hit = true;
      } else if(wall.inward <= 0 && b.y + r > wall.pos){
        b.y = wall.pos - r;
        hit = true;
      }
    } else if(wall.inward > 0 && b.x - r < wall.pos){
      b.x = wall.pos + r;
      hit = true;
    } else if(wall.inward <= 0 && b.x + r > wall.pos){
      b.x = wall.pos - r;
      hit = true;
    }
    if(hit){
      b.vx = 0;
      b.vy = 0;
      if(b.curveFactor) b.curveFactor = 0;
    }
  }
}

function resolveBoundaryWallCollisions(b){
  if(b.state === BALL_STATE.IN_POSSESSION) return;
  if(b.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(b.state === BALL_STATE.WAITING_FOR_RETRIEVAL || isBallOutsideFieldLines(b)){
    resolveBoundaryWallAbsorb(b);
  }
}

function defendingTeamForGoalLine(side){
  return side === 'left' ? 'home' : 'away';
}

function attackingTeamForGoalLine(side){
  return side === 'left' ? 'away' : 'home';
}

function cornerPositionForGoalLineExit(side){
  return cornerFlagPosition(side, ball.y);
}

function goalKickPositionForGoalLine(side){
  return goalAreaCornerPosition(side, ball.y);
}

function enterDeadBallState(info){
  clearAirSpamUiState();
  ball.vx = 0; ball.vy = 0; ball.vz = 0;
  ball.curveFactor = 0;
  ball.highKick = false;
  ball.highKickType = null;
  ball.passOrigin = null;
  clearEffortChaseLock(true);
  ball.owner = null;
  ball.state = BALL_STATE.DEAD_BALL;
  ball.x = info.x;
  ball.y = info.y;
  ball.z = BALL_RADIUS;

  clearAllChasingStates();
  for(const p of allPlayers){
    clearPlayerAIState(p);
    clearPlayerPendingAction(p);
    p.pendingKick = null;
    p.charging = null;
    p.isChargingShot = false;
  }

  Game.deadBall = {...info, t: 0};
  Game.outOfPlay = null;
  Game.isDeadBall = true;
  setSetPieceMode(false);
  resetGoalZoneTracking();

  const labels = {
    [SET_PIECE.GOAL_KICK]: 'Saque de arco',
    [SET_PIECE.CORNER]: 'Corner',
    [SET_PIECE.THROW_IN]: 'Saque lateral',
  };
  showBanner(labels[info.type] || 'Pelota detenida', 1800);
}

function computeOutZoneSetPiece(){
  const fb = fieldBoundary;
  const outLeft = ball.x < fb.xMin && !isBallInGoalMouth(ball);
  const outRight = ball.x > fb.xMax && !isBallInGoalMouth(ball);
  const outTop = ball.y < fb.yMin;
  const outBottom = ball.y > fb.yMax;

  if(outLeft || outRight){
    const side = outLeft ? 'left' : 'right';
    const lastTouch = ball.lastTouchTeam || defendingTeamForGoalLine(side);
    const defender = defendingTeamForGoalLine(side);
    const attacker = attackingTeamForGoalLine(side);
    const isCorner = lastTouch === defender;
    if(isCorner){
      const pos = cornerPositionForGoalLineExit(side);
      return {type: SET_PIECE.CORNER, team: attacker, side, x: pos.x, y: pos.y};
    }
    const pos = goalKickPositionForGoalLine(side);
    return {type: SET_PIECE.GOAL_KICK, team: defender, side, x: pos.x, y: pos.y};
  }

  if(outTop || outBottom){
    const lastTouch = ball.lastTouchTeam || 'home';
    const takingTeam = lastTouch === 'home' ? 'away' : 'home';
    const side = outTop ? 'top' : 'bottom';
    return {
      type: SET_PIECE.THROW_IN,
      team: takingTeam,
      side,
      x: clamp(ball.x, 0.8, FIELD_L - 0.8),
      y: side === 'top' ? 0.18 : FIELD_W - 0.18,
    };
  }
  return null;
}

function onBallOut(){
  if(Game.outOfPlay) return;
  clearAirSpamUiState();
  forcePossessionLoss();
  clearEffortChaseLock(true);
  ball.owner = null;
  ball.state = BALL_STATE.WAITING_FOR_RETRIEVAL;

  clearAllChasingStates();
  for(const p of allPlayers){
    clearPlayerAIState(p);
    clearPlayerPendingAction(p);
    p.pendingKick = null;
    p.charging = null;
    p.isChargingShot = false;
  }

  if(gameState === 'practice'){
    Game.isDeadBall = true;
    Game.outOfPlay = {practice: true, ballStopped: false};
    Game.deadBall = {practice: true, t: 0};
    showBanner('Pelota fuera', 1200);
    return;
  }

  const info = computeOutZoneSetPiece();
  if(!info) return;

  Game.isDeadBall = true;
  Game.outOfPlay = {...info, ballStopped: false, fromY: ball.y};
  Game.deadBall = {...info, t: 0, fromY: ball.y};
  Game.outOfPlay = null;
  Game.isDeadBall = true;
  resetGoalZoneTracking();

  const labels = {
    [SET_PIECE.GOAL_KICK]: 'Saque de arco',
    [SET_PIECE.CORNER]: 'Corner',
    [SET_PIECE.THROW_IN]: 'Saque lateral',
  };
  showBanner(labels[info.type] || 'Pelota fuera', 1800);
}

function updateWaitingForRetrieval(dt){
  if(ball.state !== BALL_STATE.WAITING_FOR_RETRIEVAL || !Game.outOfPlay) return;
  const sp = Math.hypot(ball.vx, ball.vy);
  const stopped = sp < OUT_ZONE_STOP_SPEED && ball.z <= BALL_RADIUS + 0.06;
  if(!stopped) return;
  ball.vx = 0;
  ball.vy = 0;
  ball.curveFactor = 0;
  Game.outOfPlay.ballStopped = true;
}

function checkFieldLimits(){
  if(Game.goalRoll || Game.outOfPlay) return;
  if(isThrowInBallState() || Game.throwIn?.active) return;
  if(ball.state === BALL_STATE.DEAD_BALL || ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL || ball.state === BALL_STATE.GOAL_CELEBRATION) return;

  if(!isBallOutsideFieldLines(ball)) return;

  const fb = fieldBoundary;
  const outLeft = ball.x < fb.xMin;
  const outRight = ball.x > fb.xMax;
  if((outLeft || outRight) && isBallInGoalMouth(ball)) return;

  onBallOut();
}

function checkGoalsAndBounds(prevBX, prevBY, dt){
  updateGoalZoneTriggers(prevBX);
  checkGoalLinePosition(prevBX);
  checkBallStuck(dt || 0);
  checkFieldLimits();
}

function resumeFromDeadBall(){
  const db = Game.deadBall;
  if(!db) return;

  if(db.practice){
    Game.deadBall = null;
    Game.outOfPlay = null;
    Game.isDeadBall = false;
    resetPracticeOutOfPlay();
    return;
  }

  if(db.type === SET_PIECE.THROW_IN){
    setupThrowIn(db);
    return;
  }

  if(db.type === SET_PIECE.GOAL_KICK){
    setupGoalKick(db);
    return;
  }

  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;

  const ballPos = getSetPieceBallPosition(db);
  ball.x = ballPos.x;
  ball.y = ballPos.y;
  ball.z = BALL_RADIUS;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.owner = null;
  ball.state = BALL_STATE.FREE;

  const squad = db.team === 'home' ? homeTeam : awayTeam;
  let taker;
  if(db.type === SET_PIECE.GOAL_KICK){
    taker = squad.find(p => p.role === 'GK') ||
      squad.reduce((a, b)=> dist2D(a, ballPos) < dist2D(b, ballPos) ? a : b);
  } else {
    taker = squad.reduce((a, b)=> dist2D(a, ballPos) < dist2D(b, ballPos) ? a : b);
  }
  positionSetPieceTaker(taker, db, ballPos);
  const gkGoalKick = db.type === SET_PIECE.GOAL_KICK && isGoalkeeper(taker);
  const possessSrc = gkGoalKick ? null : (db.type === SET_PIECE.GOAL_KICK ? 'pass' : null);
  if(!setBallStateInPossession(taker, possessSrc)){
    ball.owner = taker;
    ball.state = BALL_STATE.IN_POSSESSION;
    if(isGoalkeeper(taker)) initGkPossessionType(taker, possessSrc);
    clearChasingState(taker);
  }
  ball.lastTouchTeam = db.team;
  if(db.team === 'home') setControlled(taker);
  else setControlled2(taker);
  setSetPieceMode(true, {type: db.type, team: db.team, side: db.side, takerId: taker.id, x: ballPos.x, fromY: db.fromY});
}

function updateDeadBallRestart(dt){
  const db = Game.deadBall;
  if(!db) return;
  db.t += dt;
  if(db.t >= DEAD_BALL_RESTART_DELAY) resumeFromDeadBall();
}

function resetPracticeOutOfPlay(){
  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;
  ball.reset(practicePlayer.x - 1.3, practicePlayer.y);
  setBallStateInPossession(practicePlayer);
  ball.lastTouchTeam = 'home';
  clearAllChasingStates();
}

function updateGoalRoll(dt){
  const gr = Game.goalRoll;
  if(!gr) return;
  gr.t += dt;
  if(gr.t < GOAL_POST_SCORE_PHYSICS_T) return;

  if(!gr.bannerShown && gr.bannerText && gr.ownGoal && !isGoalOverlayVisible()){
    gr.bannerShown = true;
    showBanner(gr.bannerText, gr.bannerMs || 1300);
  }

  Game.goalRoll = null;

  if(gr.practice){
    ball.vx = 0; ball.vy = 0; ball.vz = 0;
    ball.curveFactor = 0;
    ball.owner = null;
    ball.state = BALL_STATE.FREE;
    clearGoalNetTriggerState(ball);
    resetGoalZoneTracking();
    Game.isGoalScored = false;
    ball.reset(practicePlayer.x - 1.3, practicePlayer.y);
    setBallStateInPossession(practicePlayer);
    ball.lastTouchTeam = 'home';
    return;
  }

  if(gr.ownGoal){
    setGameState('match');
    Game.celebrationRun = null;
    setTimeout(()=> finishCelebrationRun(gr.team), 900);
    return;
  }
}

function scoreGoal(team){
  if(Game.goalRoll) return;
  Game.score[team]++;
  document.getElementById('scoreHome').textContent = Game.score.home;
  document.getElementById('scoreAway').textContent = Game.score.away;

  const kicker = ball.lastKicker;
  const touchTeam = ball.lastTouchTeam;
  const ownGoal = kicker ? kicker.team !== team : (touchTeam ? touchTeam !== team : true);

  Game.goalRoll = {
    team,
    kicker,
    ownGoal,
    t: 0,
    practice: false,
    bannerText: ownGoal ? '¡GOOOOL EN CONTRA!' : '¡GOOOOL!',
    bannerMs: ownGoal ? 1800 : 1300,
    bannerShown: false,
  };
  clearAllChasingStates();
  showGoalOverlay(ownGoal ? '¡GOOOOL EN CONTRA!' : '¡GOOOOL!');
  if(!ownGoal) triggerGoalCelebrationState(kicker, team);
}

const CELEBRATION_MODE_MS = 5000;

function showGoalOverlay(text){
  hideGoalOverlay._active = true;
  const el = document.getElementById('goal-message');
  if(!el) return;
  el.textContent = text || '¡GOOOOL!';
  el.style.display = 'block';
  el.classList.add('show');
}

function hideGoalOverlay(){
  hideGoalOverlay._active = false;
  const el = document.getElementById('goal-message');
  if(!el) return;
  el.style.display = 'none';
  el.classList.remove('show');
}

function isGoalOverlayVisible(){
  return !!hideGoalOverlay._active;
}

function resolveCelebrationScorer(scorer, scoringTeam){
  if(scorer) return scorer;
  const squad = scoringTeam === 'home' ? homeTeam : awayTeam;
  const fieldPlayers = squad.filter(p => p.role !== 'GK');
  if(!fieldPlayers.length) return squad[0] || null;
  return fieldPlayers.reduce((a, b)=> dist2D(a, ball) < dist2D(b, ball) ? a : b);
}

function idleAllPlayersExceptScorer(scorer){
  if(!scorer) return;
  for(const p of allPlayers){
    if(p === scorer) continue;
    p.vx = 0;
    p.vy = 0;
    p.state = 'idle';
    p.charging = null;
    p.pendingKick = null;
    clearPlayerPendingAction(p);
    p.isChargingShot = false;
    p.tackleAnim = null;
    p.diveAnim = null;
    p.airStrikeAnim = null;
    p.wallRun = null;
    p.feint = null;
    p.dragBack = null;
    p.gkKickAnim = null;
  }
}

function pickCelebrationFestejo(input){
  if(input.pressPass) return 'siuu';
  if(input.pressCross) return 'topo';
  if(input.pressShot) return 'robot';
  if(input.pressThrough) return 'mbappe';
  return null;
}

function triggerScorerCelebrationAnim(scorer, type){
  if(!scorer || !isCelebrationMode) return;
  hideGoalOverlay();
  scorer.tackleAnim = null;
  scorer.diveAnim = null;
  scorer.airStrikeAnim = null;
  scorer.wallRun = null;
  scorer.isMakingManualRun = false;
  scorer.celebAnim = {type, t:0, realT:0};
  scorer.vx = 0;
  scorer.vy = 0;
}

function celebrationResumePressed(team){
  if(!isHumanTeam(team)) return false;
  const padIndex = team === 'home' ? Game.p1PadIndex : Game.p2PadIndex;
  const padKey = team === 'home' ? 'p1' : 'p2';
  const pad = getPadAt(padIndex);
  if(!pad) return false;
  const {justPressed} = padButtons(pad, padKey);
  return !!justPressed[9];
}

function triggerGoalCelebrationState(scorer, scoringTeam){
  setIsCelebrationMode(true);
  beginCelebrationRun(scorer, scoringTeam);
}

function beginCelebrationRun(scorer, scoringTeam){
  const goalScorer = resolveCelebrationScorer(scorer, scoringTeam);
  if(!goalScorer) return;
  setGameState('celebration_run');
  setIsPaused(false);
  Game.paused = false;
  goalScorer.celebAnim = null;
  Game.celebrationRun = {
    scorer: goalScorer,
    scoringTeam,
    timerMs: 0,
  };
  idleAllPlayersExceptScorer(goalScorer);
  if(goalScorer.team === 'home') setControlled(goalScorer);
  else setControlled2(goalScorer);
}

function finishCelebrationRun(scoringTeam){
  setIsCelebrationMode(false);
  hideGoalOverlay();
  setGameState('match');
  Game.celebrationRun = null;
  Game.celebration = null;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.owner = null;
  ball.state = BALL_STATE.FREE;
  clearGoalNetTriggerState(ball);
  resetGoalZoneTracking();
  Game.isGoal = false;
  ball.isGoal = false;
  restartAfterGoal(scoringTeam);
}

function updateCelebrationRunCpuMovement(dt){
  const cr = Game.celebrationRun;
  if(!cr || !isCelebrationMode) return;
  const p = cr.scorer;
  if(!p || p.celebAnim) return;
  const md = {x: p.attackDir(), y: (Math.random() - 0.5) * 0.35};
  movePlayer(p, dt, md, true, false);
}

function updateCelebrationRunControl(dt, input, team){
  const cr = Game.celebrationRun;
  if(!cr || !isCelebrationMode || cr.scorer.team !== team) return;
  const p = cr.scorer;
  if(p.celebAnim) return;
  syncStickDir(p, input.move);
  movePlayer(p, dt, input.move, input.sprint, false);
}

function updateCelebrationRun(rawDt, dt){
  const cr = Game.celebrationRun;
  if(!cr || gameState !== 'celebration_run' || !isCelebrationMode) return;

  idleAllPlayersExceptScorer(cr.scorer);
  cr.timerMs += rawDt * 1000;

  if(isHumanTeam(cr.scoringTeam)){
    const input = celebrationInputForTeam(cr.scoringTeam);
    snapshotKeys();
    const festejo = pickCelebrationFestejo(input);
    if(festejo) triggerScorerCelebrationAnim(cr.scorer, festejo);
    if(celebrationResumePressed(cr.scoringTeam)){
      finishCelebrationRun(cr.scoringTeam);
      return;
    }
  } else if(cr.timerMs > 1200 && !cr.scorer.celebAnim){
    const auto = CELEB_TYPES[Math.floor(Math.random() * CELEB_TYPES.length)];
    triggerScorerCelebrationAnim(cr.scorer, auto);
  }

  if(cr.timerMs >= CELEBRATION_MODE_MS){
    finishCelebrationRun(cr.scoringTeam);
  }
}

function runCelebrationRunSim(dt, rawDt){
  const prevBallX = ball.x;
  const prevBallY = ball.y;

  updateCelebrationRun(rawDt, dt);
  if(gameState !== 'celebration_run') return;

  const cr = Game.celebrationRun;
  if(cr?.scorer?.celebAnim){
    updateCelebAnim(cr.scorer, dt);
  } else if(cr && isCelebrationMode){
    if(isHumanTeam(cr.scoringTeam)){
      const input = celebrationInputForTeam(cr.scoringTeam);
      input.move = remapMoveForCamera(input.move);
      if(cr.scoringTeam === 'home'){
        updateCelebrationRunControl(dt, input, 'home');
      } else {
        updateCelebrationRunControl(dt, input, 'away');
      }
    } else {
      updateCelebrationRunCpuMovement(dt);
    }
  }

  idleAllPlayersExceptScorer(cr?.scorer);

  ball.update(dt, allPlayers);
  resolveGoalStructureCollisions(ball);
  resolveBallGoalkeeperCollisions(ball);
  resolveBoundaryWallCollisions(ball);
  if(Game.goalRoll) updateGoalRoll(dt);
  checkGoalsAndBounds(prevBallX, prevBallY, dt);
  snapshotKeys();
  finalizeBallFrame();
}

function restartAfterGoal(scoringTeam){
  if(Game.matchEnded) return; // si el tiempo se cumplio mientras tanto, no se reinicia mas
  const kickingTeam = scoringTeam === 'home' ? 'away' : 'home';
  placeKickoff(kickingTeam);
  // el cursor vuelve al sacador de centro del equipo que reinicia
  Game.manualOverrideUntil = 0;
  Game.manualOverrideUntil2 = 0;
  const taker = getKickoffTaker();
  if(kickingTeam === 'home'){
    setControlled(taker || nearestToBall('home'));
  } else {
    setControlled(nearestToBall('home'));
    if(Game.twoPlayerMode) setControlled2(taker || nearestToBall('away'));
  }
  setIsPaused(false);
  Game.paused = false;
}

export { updateMovement, movePlayer, ballInTackleBox, applyTackleCarryInertia, tackleAnimProgress, canChainTackle, isBallAboveKnee, hasRivalPossession, isLooseBallForDefense, isWithinSlideReceptionZone, canUseStandingTackle, canUseSlideTackle, startTackle, tryDefensiveTackleInput, resolveStandTackle, computeSlideHitbox, ballIntersectsSlideHitbox, randomDirInCone, slideTackle, resolveTackleImpact, updateSlidePosition, checkSlideFoul, updateTackleAnim, startGKDive, updateGKDive, buildBoundaryWalls, resetGoalZoneTracking, clearGoalNetTriggerState, buildGoalFrame, isBallPastGoalLine, isBallInGoalMouth, isBallInsideGoalVolume, getGoalNetSide, getGoalNetFrictionMult, isInsideGoalTrigger, isBallTouchingNetMesh, updateGoalNetTriggerPhysics, isBallNearGoalArea, getOutZoneFrictionMult, getGoalAreaFrictionMult, getGoalBackLineX, getGoalExitMarginX, registerGoalOnLineCross, ballCrossedGoalLinePlane, ballPassedGoalZone, isBallInGoalZone, isValidGoalTrigger, markGoalZonePassed, onGoalZoneTriggerEnter, tryRegisterGoal, checkGoalLinePosition, checkBallStuck, updateGoalZoneTriggers, dampGoalStructureBounce, isInsideGoalCavity, resolveGoalSolid, resolveGoalLateralNets, resolveBackNet, resolveGoalFrameCollisions, resolveGoalStructureCollisions, forcePossessionLoss, isBallInValidGoalBox, onGoal, isBallOutsideFieldLines, isBallInOutZone, resolveBoundaryWallAbsorb, resolveBoundaryWallCollisions, defendingTeamForGoalLine, attackingTeamForGoalLine, cornerPositionForGoalLineExit, goalKickPositionForGoalLine, enterDeadBallState, computeOutZoneSetPiece, onBallOut, updateWaitingForRetrieval, checkFieldLimits, checkGoalsAndBounds, resumeFromDeadBall, updateDeadBallRestart, resetPracticeOutOfPlay, updateGoalRoll, scoreGoal, showGoalOverlay, hideGoalOverlay, isGoalOverlayVisible, resolveCelebrationScorer, idleAllPlayersExceptScorer, pickCelebrationFestejo, triggerScorerCelebrationAnim, celebrationResumePressed, triggerGoalCelebrationState, beginCelebrationRun, finishCelebrationRun, updateCelebrationRunCpuMovement, updateCelebrationRunControl, updateCelebrationRun, runCelebrationRunSim, restartAfterGoal, fieldBoundary, stadiumBounds, OutZone, BoundaryWalls };

