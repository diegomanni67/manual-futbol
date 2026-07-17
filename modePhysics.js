"use strict";

import { MODE_PHYSICS_CONFIG } from './gameplay_constants.js';

/** Config activa del modo en curso (copia aislada; no compartir referencia). */
let activeModeId = '6vs6';
let activeConfig = { ...MODE_PHYSICS_CONFIG['6vs6'] };

/** Carga la física del modo indicado. Llamar al inicio de partido / setGameMode. */
export function loadModePhysics(gameMode){
  const mode = MODE_PHYSICS_CONFIG[gameMode] ? gameMode : '6vs6';
  activeModeId = mode;
  activeConfig = { ...MODE_PHYSICS_CONFIG[mode] };
  return activeConfig;
}

export function getActiveModeId(){
  return activeModeId;
}

export function getActiveModePhysics(){
  return activeConfig;
}

export function getModeTackleDistance(){
  return activeConfig.tackleDistance;
}

export function getModeBallDrag(){
  return activeConfig.ballDrag;
}

export function getModePowerMultiplier(){
  return activeConfig.powerMultiplier;
}

/** Escala de fricción de rodadura vs referencia 6vs6 (solo magnitud inicial / césped). */
export function getModeBallDragFrictionScale(){
  const base = MODE_PHYSICS_CONFIG['6vs6'].ballDrag;
  const current = activeConfig.ballDrag;
  return (1 - current) / (1 - base);
}

/** Escala de fricción usando ballDamping por pelota (restablecido al patear). */
export function getBallDragFrictionScaleForBall(b){
  if(b?.ballDamping == null) return getModeBallDragFrictionScale();
  const base = MODE_PHYSICS_CONFIG['6vs6'].ballDrag;
  return (1 - b.ballDamping) / (1 - base);
}

loadModePhysics('6vs6');
