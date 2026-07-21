"use strict";

/**
 * Escenas especiales de penal y tiro libre lejano (≥35 m):
 * cámara detrás del pateador, puntería/potencia, arquero en 7 direcciones,
 * barrera configurable y reanudación reglamentaria.
 */

import {
  BALL_RADIUS, BALL_STATE, CAM, CENTER, CROSSBAR_Z, FIELD_L, FIELD_W, GOAL_HALF,
  Game, GRAVITY, PBOX_D, SET_PIECE, SetPieceManager, allPlayers, awayTeam, ball, clamp,
  dist2D, getPlayerById, homeTeam, lerp, norm, onSetPieceBallReleased,
  applyKickCurvePhysics, practiceGK, practicePlayer, resetSetPieceManager,
  resolveInputCurve, resolveShotStyle, setBallStateLoose, setupFreeKick, setupPenalty, showBanner,
  SHOT_PLACED_SPEED_MULT, SHOT_TRIVELA_SPEED_MULT, syncPlayerDir,
} from './state.js';
import { enterDeadBallState, goalKickPositionForGoalLine, startGKDive } from './physics.js';
import { getPenaltySpot } from './foulSystem.js';

/** Distancia mínima (m) al arco rival para escena de tiro libre. */
export const FREE_KICK_SCENE_MIN_DIST = 35;

const PENALTY_POWER_MS = 900;
const FK_POWER_MS = 450; // misma escala que saques estándar

/** Preferencia de barrera: 3 | 4 | 5 */
export let freeKickWallSize = 4;

export function cycleFreeKickWallSize(){
  freeKickWallSize = freeKickWallSize >= 5 ? 3 : freeKickWallSize + 1;
  return freeKickWallSize;
}

export function setFreeKickWallSize(n){
  freeKickWallSize = clamp(Math.round(n), 3, 5);
  return freeKickWallSize;
}

export function isSetPieceSceneActive(){
  return !!(Game.setPieceScene && Game.setPieceScene.active);
}

export function isPenaltyScene(){
  return Game.setPieceScene?.mode === 'penalty';
}

export function isFreeKickScene(){
  return Game.setPieceScene?.mode === 'free_kick';
}

/** Distancia del spot al arco rival. */
export function freeKickDistanceToGoal(spot, attackingTeam){
  const goalX = attackingTeam === 'home' ? FIELD_L : 0;
  return Math.hypot(goalX - spot.x, CENTER.y - spot.y);
}

export function shouldUseFreeKickScene(db){
  if(!db || db.type !== SET_PIECE.FREE_KICK) return false;
  return freeKickDistanceToGoal({ x: db.x, y: db.y }, db.team) >= FREE_KICK_SCENE_MIN_DIST;
}

function goalLineXForAttack(attackingTeam){
  return attackingTeam === 'home' ? FIELD_L : 0;
}

function attackDirTowardGoal(attackingTeam){
  return attackingTeam === 'home' ? 1 : -1;
}

/** 7 direcciones de salto del arquero. */
export const PENALTY_GK_DIRS = [
  { id: 'center', y: 0, z: 1.1 },
  { id: 'left_low', y: -1, z: 0.35 },
  { id: 'left_mid', y: -1, z: 1.15 },
  { id: 'left_high', y: -1, z: 1.95 },
  { id: 'right_low', y: 1, z: 0.35 },
  { id: 'right_mid', y: 1, z: 1.15 },
  { id: 'right_high', y: 1, z: 1.95 },
];

function pickGkDiveDir(){
  return PENALTY_GK_DIRS[Math.floor(Math.random() * PENALTY_GK_DIRS.length)];
}

function heightBandFromPower(power){
  if(power <= 0.15) return 'low';
  if(power <= 0.50) return 'mid';
  if(power <= 0.89) return 'high';
  return 'over';
}

function targetZFromPower(power){
  const band = heightBandFromPower(power);
  if(band === 'low') return 0.28;
  if(band === 'mid') return 1.15;
  if(band === 'high') return 2.05;
  return CROSSBAR_Z + 0.55; // fuera por encima
}

function isPerfectPostAim(aimYFrac){
  // aimYFrac: -1 (poste cerca) … +1 (poste lejos) relativo al semi-ancho
  const edge = Math.abs(aimYFrac);
  return edge >= 0.88 && edge <= 1.02;
}

export function beginPenaltyScene(db, taker){
  const attackingTeam = db.team;
  const goalX = goalLineXForAttack(attackingTeam);
  const dir = attackDirTowardGoal(attackingTeam);
  const defTeam = attackingTeam === 'home' ? 'away' : 'home';
  const gk = (defTeam === 'home' ? homeTeam : awayTeam).find(p => p.role === 'GK');

  Game.setPieceScene = {
    active: true,
    mode: 'penalty',
    team: attackingTeam,
    takerId: taker.id,
    gkId: gk?.id ?? null,
    phase: 'aim', // aim | flight | done
    power: 0,
    charging: false,
    chargeStart: 0,
    aimY: 0, // -1..1 lateral dentro del arco
    curve: 0,
    perfectPost: false,
    unstoppable: false,
    gkDive: null,
    outcome: null, // 'goal' | 'saved' | 'miss' | 'play_on'
    camDist: 11.5,
    camHeightBias: 0,
    goalX,
    dir,
  };

  // Congelar resto de jugadores fuera del área
  for(const p of allPlayers){
    if(p.id === taker.id || p.id === gk?.id) continue;
    p.canMove = false;
    p.vx = 0;
    p.vy = 0;
  }

  if(gk){
    gk.x = goalX - dir * 0.9;
    gk.y = CENTER.y;
    gk.vx = 0;
    gk.vy = 0;
    gk.diveAnim = null;
    gk.gkShotReaction = null;
    gk.facing = dir > 0 ? Math.PI : 0;
    syncPlayerDir(gk);
  }

  showBanner('PENAL — apuntá y cargá potencia', 2200);
}

export function beginFreeKickScene(db, taker){
  const attackingTeam = db.team;
  const goalX = goalLineXForAttack(attackingTeam);
  const dir = attackDirTowardGoal(attackingTeam);
  const dist = freeKickDistanceToGoal({ x: db.x, y: db.y }, attackingTeam);
  const practiceFk = Game.practiceMode === 'free_kick';
  const wallN = practiceFk ? 5 : freeKickWallSize;
  if(practiceFk) setFreeKickWallSize(5);

  Game.setPieceScene = {
    active: true,
    mode: 'free_kick',
    team: attackingTeam,
    takerId: taker.id,
    gkId: null,
    phase: 'aim',
    power: 0,
    charging: false,
    chargeStart: 0,
    aimY: 0,
    curve: 0,
    perfectPost: false,
    unstoppable: false,
    gkDive: null,
    outcome: null,
    camDist: clamp(14 + (dist - 35) * 0.12, 14, 22),
    camHeightBias: 0.04,
    goalX,
    dir,
    wallSize: wallN,
    lockWall: practiceFk,
    spot: { x: db.x, y: db.y },
  };

  placeFreeKickWall(attackingTeam, { x: db.x, y: db.y }, wallN);
  if(practiceFk){
    showBanner('TIRO LIBRE — barrera: 5', 2400);
  } else {
    showBanner(`TIRO LIBRE — barrera: ${wallN} (ciclo con L1)`, 2400);
  }
}

function placeFreeKickWall(attackingTeam, spot, count){
  const defTeam = attackingTeam === 'home' ? 'away' : 'home';
  const goalX = goalLineXForAttack(attackingTeam);
  const toGoal = norm({ x: goalX - spot.x, y: CENTER.y - spot.y });
  const wallDist = 9.15;
  const wallCx = spot.x + toGoal.x * wallDist;
  const wallCy = spot.y + toGoal.y * wallDist;
  const perp = { x: -toGoal.y, y: toGoal.x };

  const defenders = allPlayers
    .filter(p => p && p.team === defTeam && p.role !== 'GK')
    .sort((a, b) => dist2D(a, spot) - dist2D(b, spot))
    .slice(0, count);

  const spacing = 0.85;
  const mid = (defenders.length - 1) / 2;
  defenders.forEach((p, i) => {
    const lat = (i - mid) * spacing;
    p.x = clamp(wallCx + perp.x * lat, 0.5, FIELD_L - 0.5);
    p.y = clamp(wallCy + perp.y * lat, 0.5, FIELD_W - 0.5);
    p.vx = 0;
    p.vy = 0;
    p.canMove = false;
    p.facing = Math.atan2(-toGoal.y, -toGoal.x);
    syncPlayerDir(p);
    p.aiMode = 'set_piece';
    p.inSetPieceZone = true;
  });

  // Resto de rivales fuera del radio
  for(const p of allPlayers){
    if(p.team !== defTeam || p.role === 'GK') continue;
    if(defenders.includes(p)) continue;
    const d = dist2D(p, spot);
    if(d < 9.15){
      const ang = Math.atan2(p.y - spot.y, p.x - spot.x);
      p.x = spot.x + Math.cos(ang) * 9.3;
      p.y = spot.y + Math.sin(ang) * 9.3;
      p.vx = 0;
      p.vy = 0;
    }
  }
}

export function updateSetPieceSceneCamera(){
  const sc = Game.setPieceScene;
  if(!sc?.active) return false;
  const taker = getPlayerById(sc.takerId);
  if(!taker) return false;

  const behind = sc.camDist;
  const midX = lerp(taker.x, sc.goalX, 0.22);
  const camX = taker.x - sc.dir * behind;
  CAM.x = lerp(CAM.x, clamp(camX, 4, FIELD_L - 4), 0.22);
  CAM.camYoff = lerp(CAM.camYoff, taker.y - FIELD_W * (0.48 + (sc.camHeightBias || 0)), 0.18);
  const zoomTarget = (CAM.fixedZoom || 58) * (sc.mode === 'penalty' ? 1.18 : 0.95);
  CAM.zoom = lerp(CAM.zoom, zoomTarget, 0.12);
  return true;
}

export function updateSetPieceSceneInput(input){
  const sc = Game.setPieceScene;
  if(!sc?.active || sc.phase !== 'aim') return false;
  if(SetPieceManager.executed) return true;

  // Ciclar tamaño de barrera con L1 (R1 queda libre para disparo colocado)
  if(sc.mode === 'free_kick' && !sc.lockWall && input.heldL1 && !sc._l1Held){
    const n = cycleFreeKickWallSize();
    sc.wallSize = n;
    placeFreeKickWall(sc.team, sc.spot || { x: ball.x, y: ball.y }, n);
    showBanner(`Barrera: ${n} jugadores`, 1200);
  }
  sc._l1Held = !!input.heldL1;

  // Modificadores de efecto: R1 colocado · L2 trivela
  sc.curve = resolveInputCurve(input);

  // Puntería lateral con stick
  const stickY = input.move?.y ?? 0;
  sc.aimY = clamp(sc.aimY + stickY * 0.045, -1, 1);

  const maxMs = sc.mode === 'penalty' ? PENALTY_POWER_MS : FK_POWER_MS;
  const shotHeld = input.heldShot || (sc.mode === 'free_kick' && (input.heldPass || input.heldCross || input.heldThrough));
  const shotReleased = input.releasedShot
    || (sc.mode === 'free_kick' && (input.releasedPass || input.releasedCross || input.releasedThrough));

  if(shotHeld && !sc.charging){
    sc.charging = true;
    sc.chargeStart = performance.now();
    sc.power = 0.08;
    SetPieceManager.isCharging = true;
    SetPieceManager.chargeType = 'shot';
    SetPieceManager.chargeStart = sc.chargeStart;
  }

  if(sc.charging){
    const elapsed = performance.now() - sc.chargeStart;
    sc.power = clamp(elapsed / maxMs, 0.08, 1);
    SetPieceManager.powerBar = sc.power;
  }

  if(sc.charging && shotReleased){
    executeSetPieceSceneShot(sc.power);
    return true;
  }

  return true;
}

/** Parábola de tiro libre: supera la barrera (~2 m) y cae hacia el arco. */
function applyFreeKickTrajectory(ballRef, dir, speed, power, targetY, goalX){
  const wallDist = 9.15;
  const g = GRAVITY;
  const flightDist = Math.hypot(goalX - ballRef.x, targetY - ballRef.y) || 1;
  const tFlight = clamp(flightDist / speed, 0.38, 1.55);

  // Desde potencia media: forzar clearance sobre la barrera y caída posterior.
  const loftPower = power >= 0.28;
  const zAtWall = loftPower
    ? clamp(1.95 + (power - 0.28) * 1.35, 1.95, 2.85)
    : clamp(0.55 + power * 1.4, 0.45, 1.55);

  const tWall = clamp(wallDist / speed, 0.12, 0.85);
  let vz = (zAtWall - ballRef.z) / tWall + 0.5 * g * tWall;

  // Objetivo de llegada: por debajo del travesaño, con caída natural.
  const targetZ = loftPower
    ? clamp(0.85 + power * 0.95, 0.9, CROSSBAR_Z - 0.15)
    : clamp(0.35 + power * 1.6, 0.3, 1.7);
  const vzGoal = (targetZ - ballRef.z) / tFlight + 0.5 * g * tFlight;
  // Mezcla: prioriza clear de barrera, suaviza hacia altura de llegada.
  ballRef.vz = loftPower ? lerp(vzGoal, vz, 0.72) : vzGoal;

  if(loftPower){
    ballRef.highKick = true;
    ballRef.highKickType = 'shot';
  }
}

function executeSetPieceSceneShot(power){
  const sc = Game.setPieceScene;
  if(!sc || sc.phase !== 'aim') return;
  const taker = getPlayerById(sc.takerId);
  if(!taker) return;

  sc.charging = false;
  SetPieceManager.isCharging = false;
  SetPieceManager.executed = true;
  sc.phase = 'flight';
  sc.power = power;

  const aimYFrac = sc.aimY;
  const targetY = CENTER.y + aimYFrac * (GOAL_HALF - 0.12);
  const targetZ = sc.mode === 'penalty'
    ? targetZFromPower(power)
    : clamp(0.4 + power * 2.1, 0.35, CROSSBAR_Z + 0.4);

  sc.perfectPost = sc.mode === 'penalty' && isPerfectPostAim(aimYFrac) && heightBandFromPower(power) !== 'over';
  sc.unstoppable = !!sc.perfectPost;
  ball.perfectPostShot = sc.unstoppable;
  ball.setPieceSceneShot = true;
  ball.setPieceSceneMode = sc.mode;

  const goalX = sc.goalX;
  const dir = norm({ x: goalX - taker.x, y: targetY - taker.y });
  taker.facing = Math.atan2(dir.y, dir.x);
  syncPlayerDir(taker);

  const over = sc.mode === 'penalty' && heightBandFromPower(power) === 'over';
  let speed = sc.mode === 'penalty'
    ? (22 + power * 14)
    : (17 + power * 17);

  const curve = sc.curve ?? 0;
  const style = resolveShotStyle(curve);
  if(style === 'placed') speed *= SHOT_PLACED_SPEED_MULT;
  else if(style === 'trivela') speed *= SHOT_TRIVELA_SPEED_MULT;

  setBallStateLoose(true);
  ball.owner = null;
  ball.lastTouchTeam = taker.team;
  ball.lastTouchedBy = taker.id;
  ball.lastKicker = taker;
  ball.lastKickType = 'shot';
  ball.x = taker.x + dir.x * 0.85;
  ball.y = taker.y + dir.y * 0.85;
  ball.z = 0.32;

  const flightDist = Math.hypot(goalX - ball.x, targetY - ball.y) || 1;
  const tFlight = clamp(flightDist / speed, 0.35, 1.4);
  ball.vx = dir.x * speed;
  ball.vy = dir.y * speed;

  if(sc.mode === 'free_kick'){
    applyFreeKickTrajectory(ball, dir, speed, power, targetY, goalX);
  } else {
    const g = GRAVITY;
    ball.vz = (targetZ - ball.z) / tFlight + 0.5 * g * tFlight;
    if(over) ball.vz = Math.max(ball.vz, 8.5);
  }

  // Efecto R1 (colocado) / L2 (trivela)
  const curvePhys = applyKickCurvePhysics(taker, 'shot', dir, curve);
  ball.curveFactor = curvePhys.curveFactor || 0;
  ball.groundFrictionMult = curvePhys.groundFrictionMult ?? 1;
  ball.initialSpeed = speed;
  if(curve){
    ball.curveMaxSpeed = speed;
  }

  onSetPieceBallReleased();
  exitSceneCameraSoon();

  if(sc.mode === 'penalty'){
    const gk = getPlayerById(sc.gkId);
    if(gk && !sc.unstoppable){
      const dive = pickGkDiveDir();
      sc.gkDive = dive;
      const diveY = CENTER.y + dive.y * (GOAL_HALF * 0.72);
      startGKDive(gk, diveY, 0.38, dive.z, {
        saveMode: 'dive',
        animState: dive.y < 0 ? 'DIVE_LEFT' : dive.y > 0 ? 'DIVE_RIGHT' : 'jump',
        jumpHeight: dive.z > 1.5 ? 0.7 : dive.z < 0.6 ? 0.1 : 0.35,
        reachChance: 0.55,
        parryChance: 0.42,
      });
    }
  }

  for(const p of allPlayers){
    if(p.aiMode === 'set_piece') p.aiMode = 'normal';
    p.canMove = true;
  }
}

/** Disparo automático al agotar el timer de la escena. */
export function autoFireSetPieceScene(){
  const sc = Game.setPieceScene;
  if(!sc?.active || sc.phase !== 'aim' || SetPieceManager.executed) return false;
  sc.aimY = (Math.random() - 0.5) * 1.6;
  const power = sc.mode === 'penalty'
    ? 0.55 + Math.random() * 0.3
    : 0.45 + Math.random() * 0.4;
  executeSetPieceSceneShot(power);
  return true;
}

function exitSceneCameraSoon(){
  const sc = Game.setPieceScene;
  if(!sc) return;
  sc.camReturnT = 0.55; // espera breve y vuelve a cámara de partido
}

/** Tick de escena: retorno de cámara y resolución de outcome. */
export function updateSetPieceScene(dt){
  const sc = Game.setPieceScene;
  if(!sc?.active) return;

  if(sc.camReturnT != null){
    sc.camReturnT -= dt;
    if(sc.camReturnT <= 0){
      sc.camReturnT = null;
      sc.cameraReleased = true; // permite cámara normal
    }
  }

  if(sc.phase === 'flight'){
    // Si ya hay gol/bola muerta, cerrar escena
    if(Game.isGoal || Game.goalRoll){
      sc.outcome = 'goal';
      endSetPieceScene();
      return;
    }
    if(Game.deadBall){
      // saque de arco / córner ya decidido por física
      sc.outcome = sc.outcome || 'miss';
      endSetPieceScene();
      return;
    }
    // Pelota lenta en juego → continuar fluido
    const slow = Math.hypot(ball.vx, ball.vy) < 1.2 && ball.z <= BALL_RADIUS + 0.05;
    if(slow && Game.isBallInPlay && !ball.owner){
      // espera un toque o timeout
      sc.playOnT = (sc.playOnT || 0) + dt;
      if(sc.playOnT > 2.5){
        sc.outcome = 'play_on';
        endSetPieceScene();
      }
    }
    if(ball.owner && ball.owner.id !== sc.takerId){
      sc.outcome = 'play_on';
      endSetPieceScene();
    }
  }
}

/**
 * Tras un penal sin gol: forzar saque de arco del equipo que defendía.
 * Llamar desde onBallOut / post-parada si setPieceSceneMode === penalty.
 */
export function resolvePenaltyMissRestart(){
  const mode = ball.setPieceSceneMode;
  if(mode !== 'penalty') return false;
  const attacking = Game.setPieceScene?.team || ball.lastTouchTeam;
  if(!attacking) return false;
  const defending = attacking === 'home' ? 'away' : 'home';
  const side = defending === 'home' ? 'left' : 'right';
  const pos = goalKickPositionForGoalLine(side);
  enterDeadBallState({
    type: SET_PIECE.GOAL_KICK,
    team: defending,
    side,
    x: pos.x,
    y: pos.y,
    fromY: pos.y,
    banner: 'Saque de arco',
  });
  ball.setPieceSceneMode = null;
  ball.setPieceSceneShot = false;
  ball.perfectPostShot = false;
  endSetPieceScene();
  return true;
}

export function endSetPieceScene(){
  if(Game.setPieceScene){
    Game.setPieceScene.active = false;
    Game.setPieceScene.phase = 'done';
  }
  // Restaurar cámara base
  if(CAM.fixedZoom != null) CAM.zoom = CAM.fixedZoom;
  for(const p of allPlayers){
    p.canMove = true;
    if(p.aiMode === 'set_piece') p.aiMode = 'normal';
  }
}

export function clearSetPieceSceneFlags(){
  ball.setPieceSceneShot = false;
  ball.setPieceSceneMode = null;
  ball.perfectPostShot = false;
  Game.setPieceScene = null;
}

/** ¿La cámara de partido debe ceder a la escena? */
export function shouldOverrideMatchCamera(){
  const sc = Game.setPieceScene;
  return !!(sc?.active && !sc.cameraReleased);
}

/** Evitar que el arquero desvíe un tiro al palo imparable. */
export function isUnstoppableSetPieceShot(){
  return !!ball.perfectPostShot;
}

/** Arena: ¿modo remates libres longitudinales? */
export function isPracticeOpenPlay(){
  return Game.practiceMode !== 'penalty' && Game.practiceMode !== 'free_kick';
}

export function isPracticeSetPieceMode(){
  return Game.practiceMode === 'penalty' || Game.practiceMode === 'free_kick';
}

function parkPracticeBench(keepIds){
  const keep = new Set(keepIds);
  for(const pl of allPlayers){
    if(!pl || keep.has(pl.id)) continue;
    pl.x = -60;
    pl.y = -60;
    pl.vx = 0;
    pl.vy = 0;
    pl.tackleAnim = null;
    pl.diveAnim = null;
    pl.canMove = false;
    pl.aiMode = 'parked';
  }
}

function syncPracticeSetPieceCam(taker, goalX, dir){
  if(!taker) return;
  CAM.x = clamp(taker.x - dir * 12, 4, FIELD_L - 4);
  CAM.camYoff = taker.y - FIELD_W * 0.5;
  if(CAM.fixedZoom != null) CAM.zoom = CAM.fixedZoom * (Game.practiceMode === 'penalty' ? 1.12 : 0.95);
}

/** Reinicia / entra a práctica de penales (mismas mecánicas de partido). */
export function startPracticePenalty(){
  clearSetPieceSceneFlags();
  endSetPieceScene();
  Game.practiceMode = 'penalty';
  const pp = practicePlayer;
  const gk = practiceGK;
  if(!pp || !gk) return;

  parkPracticeBench([pp.id, gk.id]);
  gk.canMove = true;
  pp.canMove = true;
  resetSetPieceManager();

  const spot = getPenaltySpot('right');
  const db = {
    type: SET_PIECE.PENALTY,
    team: 'home',
    side: 'right',
    x: spot.x,
    y: spot.y,
  };
  setupPenalty(db);
  beginPenaltyScene(db, pp);
  syncPracticeSetPieceCam(pp, FIELD_L, 1);
}

/** Reinicia / entra a práctica de tiros libres con barrera fija de 5. */
export function startPracticeFreeKick(){
  clearSetPieceSceneFlags();
  endSetPieceScene();
  Game.practiceMode = 'free_kick';
  setFreeKickWallSize(5);

  const pp = practicePlayer;
  const gk = practiceGK;
  if(!pp || !gk) return;

  const wall = awayTeam.filter(p => p && p.role !== 'GK').slice(0, 5);
  parkPracticeBench([pp.id, gk.id, ...wall.map(p => p.id)]);
  wall.forEach((p, i) => {
    p.x = FIELD_L - 28;
    p.y = CENTER.y + (i - 2) * 1.2;
    p.vx = 0;
    p.vy = 0;
    p.canMove = false;
  });
  gk.canMove = true;
  pp.canMove = true;
  resetSetPieceManager();

  const spot = { x: FIELD_L - 38, y: CENTER.y };
  const db = {
    type: SET_PIECE.FREE_KICK,
    team: 'home',
    side: 'right',
    x: spot.x,
    y: spot.y,
  };
  setupFreeKick(db);
  beginFreeKickScene(db, pp);
  syncPracticeSetPieceCam(pp, FIELD_L, 1);
}

export function restartActivePracticeSetPiece(){
  if(Game.practiceMode === 'penalty') startPracticePenalty();
  else if(Game.practiceMode === 'free_kick') startPracticeFreeKick();
}

/** Jugadores a dibujar en Arena (incluye barrera en tiros libres). */
export function getPracticeRenderPlayers(){
  if(isPracticeOpenPlay()){
    return [practicePlayer, practiceGK].filter(Boolean);
  }
  return allPlayers.filter(p => p && p.x > -40);
}
