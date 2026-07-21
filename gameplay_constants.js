"use strict";

import { toGameUnits } from './utils.js';

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

    powerMultiplier: 1.0,

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

  DETECT_RADIUS_DEFAULT: 1.5,

  DETECT_RADIUS_INTERCEPTING: 5.0,

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
  /** Retardo humano antes de lanzarse (s). */
  REACTION_DELAY: 0.18,
  /** Probabilidad base de blocaje en tiros medios. */
  FIXED_SAVE_CHANCE: 0.72,
  /** Tiros débiles: casi siempre blocaje. */
  WEAK_SHOT_SPEED: 7.5,
  /** Por debajo = tiro contenible; por encima = despeje preferente. */
  HARD_SHOT_SPEED: 13.5,
  /** Ángulo extremo (fracción del ancho del arco) → despeje. */
  WIDE_SHOT_FRAC: 0.62,
  /** Altura complicada (m) → salto o despeje. */
  HIGH_SHOT_Z: 1.65,
  CORNER_DIVE_SUCCESS: 0.32,
  BODY_CENTER_FRAC: 0.35,
  CORNER_FRAC: 0.55,
  /** Avance mínimo/máximo desde la línea de gol (m reales → unidades motor). */
  MIN_ADVANCE: 1.0,
  MAX_ADVANCE: 5.8,
  /** Distancia pelota-arco para achicar al máximo. */
  CLOSE_DIST: 18,
  /** Horizonte de predicción de trayectoria (s). */
  SHOT_HORIZON: 2.6,
  INTERCEPT_RADIUS: 1.35,
  TRAJECTORY_STEP: 0.035,
  /** Velocidad máxima de desplazamiento en posicionamiento (unidades/s). */
  POSITION_MAX_SPEED: 5.2,
  /** Distancia al objetivo para activar sprint de posicionamiento. */
  POSITION_SPRINT_DIST: 2.2,
  /** 1v1: distancia máxima del delantero al arco para salir. */
  ONE_V_ONE_BOX_DIST: 14,
  /** 1v1: distancia para lanzarse a los pies (smother). */
  ONE_V_ONE_SMOTHER_DIST: 2.8,
  /** 1v1: ningún defensor aliado a esta distancia del delantero. */
  ONE_V_ONE_CLEAR_RADIUS: 6.5,
  /** Avance extra en salida 1v1. */
  ONE_V_ONE_RUSH_ADVANCE: 7.5,
};


