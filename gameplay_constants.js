"use strict";

import { toGameUnits } from './utils.js';
import { getGoalWorldScale } from './state.js';

/**

 * Constantes compartidas (idénticas en todos los modos).

 * Valores que cambian por modo → MODE_PHYSICS_CONFIG.

 */

export const TARGET_SPRINT_MPS = 6.25;

export const SPRINT_ACCEL_TIME = 0.5;



export const GAMEPLAY_PHYSICS = {

  /** Desaceleración de la pelota en césped (m/s²). */

  FRICTION: 10.4,

  /** Duración máxima del stun tras tacle/barrida (s). */

  TACKLE_STUN_DURATION: 0.3,

  /** @deprecated alias — usar TACKLE_STUN_DURATION */

  STUN_DURATION: 0.3,

  /** Retroceso por impacto de tacle/barrida (m/s). */

  STUN_KNOCKBACK: 0.42,

  /** Aceleración hasta sprint pleno (m/s²). */

  ACCELERATION: TARGET_SPRINT_MPS / SPRINT_ACCEL_TIME,

  /** Velocidad de caminata durante recuperación post-tacle (fracción de maxSpeed base). */

  STUN_WALK_SPEED_FACTOR: 0.38,

  /** Piso mínimo de velocidad durante stun (fracción de caminata). */

  STUN_WALK_MIN_FACTOR: 0.35,

};



/**

 * Física aislada por modo de juego.

 * El motor carga una copia de CONFIG[gameMode] al iniciar partido — sin contaminación cruzada.

 */

export const MODE_PHYSICS_CONFIG = {

  '6vs6': {

    tackleDistance: 2.0,

    ballDrag: 0.98,

    /** Potencias de pase / saques / córner / arco al 50%. */
    powerMultiplier: 0.5,

  },

  '11vs11': {

    tackleDistance: 4.0,

    ballDrag: 0.95,

    powerMultiplier: 1.4,

  },

};



/** Posiciones base de reglas de campo (6vs6, escala 1). */

export const FIELD_RULES_BASE = {

  THROW_IN_LINE_Y: 0.35,

  THROW_IN_CLAMP_X: 0.8,

  CORNER_FLAG_INSET: 0.55,

};



/** IA de desmarque ante pases en profundidad (triángulo). */

export const PASS_AI = {
  /** Radio base de detección = control real (sin imán). */
  DETECT_RADIUS_DEFAULT: 1.0,
  /** En recepción de filtrado propio: mismo radio real (no expandir a 5 m). */
  DETECT_RADIUS_INTERCEPTING: 1.0,
  INTERCEPTING_PASS_LOCK: 1.0,
  DEEP_PASS_MIN_DIST: 20,
  TRAJECTORY_MAX_TIME: 3.5,
};



/** IA de arquero (1vs1 / práctica y partido). */

/** Ventana de InputBuffer / pase de primera — idéntica en 6vs6 y 11vs11. */
export const INPUT_BUFFER = {
  EXECUTE_RADIUS: 1.0,
  AERIAL_RADIUS: 1.2,
  CHARGE_MAX_MS: 900,
};

/** Estados de animación del arquero. */
export const GK_ANIM_STATE = {
  IDLE: 'idle',
  DIVE_LEFT: 'DIVE_LEFT',
  DIVE_RIGHT: 'DIVE_RIGHT',
  LOW_DIVE: 'LOW_DIVE',
  CATCH: 'CATCH',
  JUMP: 'jump',
  SMOTHER: 'SMOTHER',
};

/** Estado IA: presión secundaria activada con R1 (sin tacle). */
export const AI_SECONDARY_PRESSING = 'AI_SECONDARY_PRESSING';

/** Estado IA: desmarque automático — velocidad de crucero constante hacia runTarget. */
export const AI_RUPTURA = 'RUPTURA';

/** Estado IA: desmarque manual inteligente — ignora IA pasiva hasta recibir pelota o fin de carrera. */
export const AI_RUPTURA_MANUAL = 'RUPTURA_MANUAL';

/** Tope de velocidad en desmarques automáticos de CPU (50% del sprint sin pelota). */
export const CPU_DESMARQUE_SPEED_MULT = 0.5;

/** Prioridad absoluta: persecucion de la pelota (acciones de pase/tiro son secundarias). */
export const MOVING_TO_BALL = 'moving_to_ball';

/** Presión secundaria (R1): contención a 1 m del poseedor — sin tacle, solo cierre de líneas. */
export const SECONDARY_PRESS = {
  /** Distancia de seguridad en unidades motor (1 m real; 1 unidad = 0.5 m). */
  defensiveDistance: toGameUnits(1.0),
  /** Banda de histéresis ±0.5 m para evitar oscilación al mantener la contención. */
  CONTAIN_BAND: toGameUnits(1.0),
  ACTIVATE_DIST: 18,
  MAX_HELPERS: 1,
};

/** Jockey mejorado: retroceso automático si el rival acelera hacia el marcador. */
export const JOCKEY_PHYSICS = {
  SPRINT_RETREAT_SPEED: 4.6,
  RIVAL_SPRINT_THRESHOLD: 4.8,
  RIVAL_ACCEL_THRESHOLD: 3.2,
  STANCE_SPEED_MULT: 0.55,
  CONTAIN_MIN: 1.2,
  CONTAIN_IDEAL: 1.8,
  CONTAIN_MAX: 2.6,
  /** Radio corto de quite automático en jockey (contacto directo). */
  STEAL_RADIUS: 1.02,
  /** Cono frontal mínimo (coseno): ~68° hacia delante del defensor. */
  STEAL_FRONT_DOT: 0.38,
  /** Velocidad mínima del rival acercándose al marcador. */
  STEAL_RIVAL_CLOSING_MIN: 0.35,
  /** Distancia cuerpo a cuerpo = colisión para activar el quite. */
  STEAL_COLLISION_DIST: 0.64,
};

/** Tacle: magnetismo y recuperación. */
export const TACKLE_PHYSICS = {
  MAGNET_MULT: 1.35,
  MAGNET_PULL: 0.48,
  STAND_ACTIVE_START: 0.18,
  STAND_ACTIVE_END: 0.92,
};

/** Regla de los 3 segundos: auto-saque si el arquero no distribuye (manos o saque de arco). */
export const GK_AUTO_DISTRIBUTE = {
  TIME_SEC: 3.0,
  TIME_MS: 3000,
  URGENT_SEC: 1.0,
  /** Compañeros candidatos para saque corto (9 m reales). */
  NEAR_TEAMMATE_MAX: toGameUnits(18),
  /** Separación mínima rival-receptor para considerarlo desmarcado (3 m reales). */
  OPENNESS_MIN: toGameUnits(6),
};

/** Saque de arquero con barra manual (mano / pie). */
export const GK_KICK_CHARGE = {
  MAX_MS: 900,
  FORCE_MULT_11VS11: 1.4,
};

/** Recuperación post-tacle (RECOVERY_STATE). */
export const RECOVERY_STATE = {
  TACKLE_DURATION: 0.2,
};

export const GK_AI = {
  /** Constantes compartidas — parámetros por modo en GK_MODE_PRESETS / getGkAiConfig(). */
  GOAL_THREAT_Y_MARGIN: 1.6,
  TRAJECTORY_STEP: 0.03,
  HIGH_SHOT_Z: 1.65,
  BODY_CENTER_FRAC: 0.35,
  WIDE_SHOT_FRAC: 0.58,
  CORNER_FRAC: 0.72,
  POSITION_SPRINT_DIST: 2.2,
  /** Fallbacks si el preset no define valor propio. */
  ONE_V_ONE_BOX_DIST: 18,
  ONE_V_ONE_SMOTHER_DIST: 3.2,
  ONE_V_ONE_CLEAR_RADIUS: 6.5,
  ONE_V_ONE_RUSH_ADVANCE: 9.0,
};

/**
 * Parámetros de arquero por formato — escala de cobertura y movimiento proporcional al arco.
 * 6v6: arco más chico, reposition más ágil, cobertura lateral ajustada al ancho reducido.
 * 11v11: arco ampliado (worldScale 1.6), más tiempo de reacción y menor fracción de cobertura.
 */
export const GK_MODE_PRESETS = {
  '6vs6': {
    reachBase: 0.54,
    reactionDelay: 0.17,
    saveRadiusMult: 0.88,
    interceptRadiusMult: 0.86,
    lateralReachFrac: 0.44,
    diveSpeed: 13.6,
    positionMaxSpeed: 7.1,
    positionErrorScale: 0.52,
    weakShotSpeed: 7.5,
    mediumShotSpeed: 10.2,
    hardShotSpeed: 13.2,
    closeShotTime: 0.28,
    farShotTime: 1.15,
    mediumShotTime: 0.72,
    shotHorizon: 4.2,
    minAdvance: 0.9,
    maxAdvance: 4.8,
    closeDist: 13,
    interceptRadius: 2.0,
    maxReachZ: 2.55,
    reachVariance: 0.06,
    oneVsOneBoxDist: 19,
    oneVsOneSmotherDist: 3.9,
    oneVsOneRushAdvance: 10.5,
    smotherReachBase: 0.64,
    smotherRadiusMult: 1.18,
    /** Salida al dueño del área — velocidad y alcance de captura. */
    boxClaimSpeedMult: 1.48,
    boxClaimReachMult: 2.15,
    boxRivalThreatDist: 3.0,
    boxClaimUrgencyMult: 1.28,
    proactiveClaimDuration: 3.6,
    sixYardClaimReachMult: 2.55,
    boxPounceDist: 3.35,
    boxPounceUrgentDist: 2.05,
    boxPounceRivalMargin: 1.05,
  },
  '11vs11': {
    reachBase: 0.53,
    reactionDelay: 0.19,
    saveRadiusMult: 0.94,
    interceptRadiusMult: 1.0,
    lateralReachFrac: 0.41,
    diveSpeed: 17.8,
    positionMaxSpeed: 9.8,
    positionErrorScale: 0.58,
    weakShotSpeed: 8.0,
    mediumShotSpeed: 12.0,
    hardShotSpeed: 16.2,
    closeShotTime: 0.30,
    farShotTime: 1.48,
    mediumShotTime: 0.88,
    shotHorizon: 5.8,
    minAdvance: 1.35,
    maxAdvance: 7.6,
    closeDist: 19,
    interceptRadius: 3.05,
    maxReachZ: 2.55,
    reachVariance: 0.05,
    oneVsOneBoxDist: 28,
    oneVsOneSmotherDist: 5.2,
    oneVsOneRushAdvance: 14.5,
    smotherReachBase: 0.62,
    smotherRadiusMult: 1.16,
    boxClaimSpeedMult: 1.46,
    boxClaimReachMult: 2.35,
    boxRivalThreatDist: 3.8,
    boxClaimUrgencyMult: 1.26,
    proactiveClaimDuration: 3.5,
    sixYardClaimReachMult: 2.75,
    boxPounceDist: 4.25,
    boxPounceUrgentDist: 2.45,
    boxPounceRivalMargin: 1.1,
  },
};

/** Ajuste fino si el arco activo difiere del reference 11v11 (1.6×). */
function scaleGkPreset(base){
  const g = getGoalWorldScale();
  if(g <= 1.001) return base;
  const ref = 1.6;
  const ratio = g / ref;
  if(Math.abs(ratio - 1) < 0.02) return base;
  const kMove = Math.pow(ratio, 0.86);
  const kReach = Math.pow(ratio, 0.84);
  const kDist = Math.pow(ratio, 0.82);
  return {
    ...base,
    diveSpeed: base.diveSpeed * kMove,
    positionMaxSpeed: base.positionMaxSpeed * kMove,
    interceptRadius: base.interceptRadius * kReach,
    minAdvance: base.minAdvance * kDist,
    maxAdvance: base.maxAdvance * kDist,
    closeDist: base.closeDist * kDist,
    oneVsOneBoxDist: base.oneVsOneBoxDist * kDist,
    oneVsOneSmotherDist: base.oneVsOneSmotherDist * kReach,
    oneVsOneRushAdvance: base.oneVsOneRushAdvance * kDist,
    boxPounceDist: (base.boxPounceDist ?? 3.65) * kReach,
    boxPounceUrgentDist: (base.boxPounceUrgentDist ?? 2.2) * kReach,
  };
}

export function getGkAiConfig(matchFormat){
  const base = GK_MODE_PRESETS[matchFormat === '11vs11' ? '11vs11' : '6vs6'];
  return matchFormat === '11vs11' ? scaleGkPreset(base) : base;
}


