"use strict";

import {
  applyArchetypePhysicsStats,
  applyArchetypeToPlayer,
  getArchetypePassCurveMult,
  getArchetypeShotSpecialCurveMult,
} from './archetypes.js';
import { ensurePlayerAppearance } from './playerAppearance.js';
import {
  getBallDragFrictionScaleForBall, getModeBallDrag, getModeBallDragFrictionScale,
  getModePowerMultiplier, loadModePhysics,
} from './modePhysics.js';
import { assignPlayerDisplayName } from './playerSelectionHud.js';
import {
  AI_RUPTURA,
  AI_RUPTURA_MANUAL,
  FIELD_RULES_BASE,
  GAMEPLAY_PHYSICS,
  GK_AUTO_DISTRIBUTE,
  MOVING_TO_BALL,
  PASS_AI,
} from './gameplay_constants.js';

// GOAL_FRAMES vive en physics.js; se enlaza en boot via wireBridge (import estatico desde
// physics.js crea dependencia circular state↔physics y rompe FIELD_L al inicializar).
export let GOAL_FRAMES = [];

/* ============================================================
   TEMPO BASE DEL MOTOR (GAME ENGINE)
   ============================================================
   GLOBAL_TIME_SCALE es el unico numero que define el ritmo de TODA la simulacion: velocidad de
   jugadores, de la pelota, y de cualquier rotacion/animacion fisica (patadas, tropiezos, barridas,
   estiradas, etc.). No es un "multiplicador de velocidad maxima" aplicado planta por planta —
   escala directamente el delta-time (dt) que se le pasa a cada sistema de fisica del tick(), asi
   que ninguna velocidad, ninguna rotacion y ninguna animacion se puede quedar afuera ni desincronizarse:
   todo lo que ya consume `dt` (que es literalmente todo el gameplay, ver tick()) queda pesado y
   pausado por igual, en la misma proporcion.
   Por que escalar dt en vez de cada velocidad suelta: (a) es imposible pasar por alto un sistema —
   cualquier fisica nueva que se agregue a futuro y use dt hereda el tempo automaticamente, sin tener
   que acordarse de multiplicarla; y (b) mantiene la fisica frame-rate-independent — a 30fps o a
   144fps la pelota tarda exactamente lo mismo (en segundos reales) en cruzar la cancha, solo cambia
   cuantos pasos intermedios se calculan. Bajar GLOBAL_TIME_SCALE no la vuelve "mas lenta por fps
   bajos" (eso seria un bug), la vuelve mas lenta EN TERMINOS DE TIEMPO REAL, de forma constante.
   0.7 = el partido entero corre al 70% del tempo original: mas pesado, mas pausado, sin trabarse.
   El reloj del partido (Game.time, lo que se ve arriba de la cancha) queda deliberadamente afuera
   de este escalado — ver tick(): usa el tiempo real de frame (rawDt), no el dt escalado — para que
   los minutos de partido sigan significando minutos reales y no se alarguen si mas adelante se
   destemplea este numero.
   ============================================================ */
export let GLOBAL_TIME_SCALE = 0.7;
export let isManualMode = true; // true: CPU solo marca / cierra lineas; false: IA competitiva completa

/** Activa IA pasiva (6v6) o competitiva completa (11v11 vs CPU / compañeros). */
export function setIsManualMode(v){
  isManualMode = !!v;
}

/* ============================================================
   CONFIG / CONSTANTES DE CANCHA
   Referencia 6vs6 = cancha reglamentaria; 11vs11 escala worldScale (1.6x) en setGameMode().
   ============================================================ */
import { WORLD_SCALE, toGameUnits, toMeters } from './utils.js';
export { WORLD_SCALE, toGameUnits, toMeters };

/** Sprint reglamentario: 50 m / 8 s = 6.25 m/s reales → 12.5 u/s en motor. */
export const TARGET_SPRINT_MPS = 6.25;
export const TARGET_SPRINT_GAME_SPEED = toGameUnits(TARGET_SPRINT_MPS);
export const SPRINT_ACCEL_TIME = 0.5;           // s hasta velocidad plena (arranque de sprint)
export const LEGACY_SPRINT_GAME_UNITS = 15.4;   // u/s previas — referencia de calibración anim
/** Factor de playback de zancada sprint (12.5 / 15.4). */
export const SPRINT_ANIM_PLAYBACK_MULT = TARGET_SPRINT_GAME_SPEED / LEGACY_SPRINT_GAME_UNITS;

export const BASE_FIELD_L = 105, BASE_FIELD_W = 68;
export const BASE_GOAL_HALF = 3.66, BASE_GOAL_DEPTH = 2.2;
export const BASE_PBOX_D = 16.5, BASE_PBOX_HALFW = 20.15;
export const BASE_SBOX_D = 5.5, BASE_SBOX_HALFW = 9.16;
export const BASE_CCIRCLE_R = 9.15;
export const BASE_PENALTY_SPOT_DIST = 11;
export const BASE_PENALTY_ARC_R = 9.15;
export const BASE_CORNER_ARC_R = 1.0;
export const BASE_OUT_ZONE_DEPTH = 5;
export const BASE_STADIUM_FLOOR_PAD = 4;
export const BASE_GOAL_AREA_Y_PAD = 2.8;
export const BASE_KICKOFF_HALF_MARGIN = 1.5;
export const BASE_KICKOFF_CIRCLE_MARGIN = 0.35;

export let FIELD_L = BASE_FIELD_L, FIELD_W = BASE_FIELD_W;
export let GOAL_HALF = BASE_GOAL_HALF, GOAL_DEPTH = BASE_GOAL_DEPTH;
export const CROSSBAR_Z = 2.44;
export const GOAL_POST_BOUNCE = 0.52;         // restitución base poste/travesaño (con microvariación en impacto)
export const GOAL_NET_FRICTION_MULT = 5;      // friccion extra dentro de la red (simula impacto con la malla)
export const GOAL_NET_GRAVITY = 15.0;         // gravedad artificial post-gol dentro del trigger del arco
export const GOAL_NET_SLIDE_FRICTION = 0.5;   // friccion multiplicativa mientras isTouchingNet (fase desliz)
export const GOAL_NET_SLIDE_DURATION = 0.2;   // seg de desliz en la red antes de activar la caida
export const GOAL_NET_FALL_VZ = -1.4;         // vz inicial al forzar caida tras el desliz (eje vertical = z)
export const GOAL_POST_SCORE_PHYSICS_T = 2.0; // seg de fisica continua post-gol antes de festejo/reinicio
export const GOAL_NET_ABSORB_MULT = 0.15;     // amortiguacion horizontal por frame en red (post-gol)
export const GOAL_NET_GROUND_RESTITUTION = 0.15; // micro-rebote al piso dentro del arco
export const GOAL_NET_GROUND_FRICTION = 16.0;    // frenado rapido en cesped dentro de la red (<1s)
export const GOAL_ROLL_MAX_T = GOAL_POST_SCORE_PHYSICS_T; // alias: fisica post-gol antes del festejo/reinicio
export const GOAL_ROLL_STOP_SPEED = 0.08;     // m/s: pelota "enganchada" en la red
// arco dibujado con las proporciones reales (igual que arco_ok.html): sin escalado ni flare en la
// base. Solo queda la config de la red (que se mantiene de la version anterior, la "linda").
export const GOAL_NET_DEPTH_SHRINK = 0.85;// la red se angosta y el techo cae levemente hacia el fondo, para
                                    // dar volumen sin depender de una proyeccion en pantalla (que se
                                    // deformaba); el fondo de la red sigue siendo una proyeccion real
export const GOAL_NET_ROWS = 6, GOAL_NET_COLS = 7; // densidad de la grilla de la red trasera
export const BACK_NET_FRICTION_MULT = 18;     // friccion extrema al tocar BackNetSensor
export const GOAL_LINE_SENSOR_EPS = 0.004;    // tolerancia del plano de linea de meta (x=0 / x=FIELD_L)
export const GOAL_ZONE_DEPTH = 0.1;           // profundidad minima del GoalZone (solo sobre la linea blanca)
export const GOAL_MIN_TRIGGER_SPEED = 2.0;    // m/s minimo para marcar goalZonePassed en tiros rapidos (no bloquea el gol)
export const GOAL_TOWARD_MIN_VX = 0.45;       // componente horizontal minima hacia el arco (solo goalZonePassed)
export const BALL_STUCK_SPEED = 0.12;         // m/s: pelota casi detenida dentro del arco/red
export const BALL_STUCK_UNSTICK_T = 0.5;      // segundos antes de forzar gol o saque de arco
export const GOAL_LINE_EXIT_MARGIN = 2.0;     // m past la linea de fondo del arco antes de dead_ball (saque de arco)
export const GOAL_EXIT_ROLL_STOP_SPEED = 0.06;// m/s: pelota detenida tras salir por linea de meta
export const GOAL_AREA_FRICTION_MULT = 0.78;  // friccion reducida cerca del arco (evita clavarse en la linea)
export let GOAL_AREA_Y_PAD = BASE_GOAL_AREA_Y_PAD; // extension lateral del area de meta para rodadura natural
/** Radio FIFA de poste/travesaño (diámetro ≈ 12 cm). */
export const GOAL_POST_RADIUS = 0.06;
/** @deprecated alias de GOAL_POST_RADIUS */
export const GOAL_POST_HALF_THICK = GOAL_POST_RADIUS;
export const GOAL_LINE_LEFT = 0;              // coordenada x de la linea de meta blanca (arco izquierdo)
export let GOAL_LINE_RIGHT = BASE_FIELD_L;    // coordenada x de la linea de meta blanca (arco derecho)
export const debugMode = false;               // true = limites/sensores en rojo (solo depuracion)
export const DEBUG_BOUNDARIES = debugMode;
export let OUT_ZONE_DEPTH = BASE_OUT_ZONE_DEPTH; // m entre linea de cal y BoundaryWall
export const BOUNDARY_WALL_BOUNCE = 0.52;     // retencion de velocidad al rebotar en pared perimetral
export const OUT_ZONE_STOP_SPEED = 0.06;      // m/s: pelota detenida en OutZone antes del reposicionamiento
export const OUT_ZONE_FRICTION_MULT = 1.18;   // friccion extra en OutZone para que la pelota se detenga antes
export let STADIUM_FLOOR_PAD = BASE_STADIUM_FLOOR_PAD; // m de piso extendido mas alla de las BoundaryWalls
export let PBOX_D = BASE_PBOX_D, PBOX_HALFW = BASE_PBOX_HALFW;
export let SBOX_D = BASE_SBOX_D, SBOX_HALFW = BASE_SBOX_HALFW;
export let CENTER = {x: BASE_FIELD_L / 2, y: BASE_FIELD_W / 2};
export let CCIRCLE_R = BASE_CCIRCLE_R;
export let PENALTY_SPOT_DIST = BASE_PENALTY_SPOT_DIST;
export let PENALTY_ARC_R = BASE_PENALTY_ARC_R;
export let CORNER_ARC_R = BASE_CORNER_ARC_R;
export let KICKOFF_HALF_MARGIN = BASE_KICKOFF_HALF_MARGIN;
export let KICKOFF_CIRCLE_MARGIN = BASE_KICKOFF_CIRCLE_MARGIN;

export function applyMatchWorldScale(scale, viewExtentMult = 1, goalScale = null){
  const s = Math.max(1, scale || 1);
  const g = goalScale != null ? goalScale : s;
  Game.worldScale = s;
  Game.goalWorldScale = g;
  FIELD_L = BASE_FIELD_L * s;
  FIELD_W = BASE_FIELD_W * s;
  GOAL_HALF = BASE_GOAL_HALF * g;
  GOAL_DEPTH = BASE_GOAL_DEPTH * g;
  GOAL_LINE_RIGHT = FIELD_L;
  GOAL_AREA_Y_PAD = BASE_GOAL_AREA_Y_PAD * g;
  OUT_ZONE_DEPTH = BASE_OUT_ZONE_DEPTH * s;
  STADIUM_FLOOR_PAD = BASE_STADIUM_FLOOR_PAD * s * Math.max(1, viewExtentMult);
  PBOX_D = BASE_PBOX_D * s;
  PBOX_HALFW = BASE_PBOX_HALFW * s;
  SBOX_D = BASE_SBOX_D * s;
  SBOX_HALFW = BASE_SBOX_HALFW * s;
  CCIRCLE_R = BASE_CCIRCLE_R * s;
  PENALTY_SPOT_DIST = BASE_PENALTY_SPOT_DIST * s;
  PENALTY_ARC_R = BASE_PENALTY_ARC_R * s;
  CORNER_ARC_R = BASE_CORNER_ARC_R * s;
  CENTER = {x: FIELD_L / 2, y: FIELD_W / 2};
  KICKOFF_HALF_MARGIN = BASE_KICKOFF_HALF_MARGIN * s;
  KICKOFF_CIRCLE_MARGIN = BASE_KICKOFF_CIRCLE_MARGIN * s;
  THROW_IN_LINE_Y = BASE_THROW_IN_LINE_Y * s;
  THROW_IN_CLAMP_X = BASE_THROW_IN_CLAMP_X * s;
  CORNER_FLAG_INSET = BASE_CORNER_FLAG_INSET * s;
}

export const CAM_MATCH_DEFAULTS = { zoom: 58, near: 24, horizonFrac: 0.28 };

/** Seguimiento dinámico de cámara (estilo broadcast tradicional). */
export const CAM_FOLLOW = {
  panLerp: 0.11,
  zoomLerp: 0.09,
  leadX: 0.48,
  leadY: 0.32,
  focusYFrac: 0.42,
  yOffMinFrac: -0.45,
  yOffMaxFrac: 0.08,
  marginXFrac: 0.10,
};

/** Zoom dinámico exclusivo 11vs11: pelota lejos (Y alto) → más zoom; cerca (Y bajo) → baseZoom. */
export const CAM_11VS11_DYNAMIC = {
  maxZoomFactor: 12,
  smoothingFactor: 0.05,
};

export function applyMatchCamera(preset){
  const zm = preset?.camZoomMult ?? 1;
  const nm = preset?.camNearMult ?? 1;
  const hs = preset?.horizonShift ?? 0;
  CAM.fixedZoom = CAM_MATCH_DEFAULTS.zoom * zm;
  CAM.baseZoom = CAM.fixedZoom;
  CAM.maxZoomFactor = preset?.camMaxZoomFactor ?? CAM_11VS11_DYNAMIC.maxZoomFactor;
  CAM.zoomSmoothing = preset?.camZoomSmoothing ?? CAM_11VS11_DYNAMIC.smoothingFactor;
  CAM.zoom = CAM.fixedZoom;
  CAM.near = CAM_MATCH_DEFAULTS.near * nm;
  CAM.horizonFrac = clamp(CAM_MATCH_DEFAULTS.horizonFrac + hs, 0.18, 0.38);
  CAM.x = CENTER.x;
  CAM.camYoff = -FIELD_W * 0.42;
}

/**
 * CameraController — zoom cercano con seguimiento suave hacia la pelota.
 */
export function updateCameraZoom(){
  const base = CAM.fixedZoom ?? CAM_MATCH_DEFAULTS.zoom;
  CAM.zoom = lerp(CAM.zoom, base, CAM_FOLLOW.zoomLerp);
}

/** Pan X/Y hacia la pelota con predicción de velocidad (cámara tradicional de fútbol). */
export function updateMatchCameraFollow(){
  if(gameState === 'practice') return;

  const leadX = ball.x + ball.vx * CAM_FOLLOW.leadX;
  const leadY = ball.y + ball.vy * CAM_FOLLOW.leadY;
  const marginX = FIELD_L * CAM_FOLLOW.marginXFrac;

  const targetX = clamp(leadX, marginX, FIELD_L - marginX);
  CAM.x = lerp(CAM.x, targetX, CAM_FOLLOW.panLerp);

  const targetYoff = leadY - FIELD_W * CAM_FOLLOW.focusYFrac;
  const yMin = FIELD_W * CAM_FOLLOW.yOffMinFrac;
  const yMax = FIELD_W * CAM_FOLLOW.yOffMaxFrac;
  CAM.camYoff = lerp(CAM.camYoff, clamp(targetYoff, yMin, yMax), CAM_FOLLOW.panLerp);

  updateCameraZoom();
}

/** Velocidad visual de zancada — sincronizada con traslacion real (m/s → u/s). */
export function getAnimVisualSpeed(p){
  const speed = Math.hypot(p.vx, p.vy);
  if(speed <= 0.25) return 0;
  const wantsMove = p.moveInputDir && Math.hypot(p.moveInputDir.x, p.moveInputDir.y) > 0.05;
  if(wantsMove && physicsConfig.animStrideSpeed != null) return toGameUnits(physicsConfig.animStrideSpeed);
  return speed;
}

export let rebuildFieldGeometry = () => {};

export const GRAVITY = 18.0;         // m/s^2 aplicada a Z de la pelota
export const BALL_RADIUS = 0.11;     // radio real de una pelota de futbol (~22cm de diametro)
export const BALL_FRICTION = GAMEPLAY_PHYSICS.FRICTION;
export const GROUND_FRICTION = BALL_FRICTION; // alias legacy

export const TACKLE_STUN_DURATION = 0.3;
export const KICK_VELOCITY_MULT = 1.5; // multiplicador base de salida en pases y tiros
export const PASS_VELOCITY_MULT = 0.7;  // pases (X, Triangulo, Circulo, filtrado): -30% velocidad inicial
export const SHOT_VELOCITY_MULT = 0.64; // tiros: -20% adicional sobre 0.8 previo (= 0.8*0.8) — más tiempo de reacción
/** Pases largos (filtrado/centro): -20% velocidad horizontal; vz compensa para conservar distancia/arco. */
export const LONG_PASS_SPEED_MULT = 0.80;
export const LONG_PASS_VZ_COMPENSATE = 1.25;
/** Compensación de vz en tiros al bajar velocidad (misma parábola / recorrido). */
export const SHOT_VZ_COMPENSATE = 1.25;
// --- perfiles de tiro (Cuadrado + modificadores) ---
export const SHOT_PLACED_SPEED_MULT = 0.8;    // R1 colocado: -20% velocidad base
export const SHOT_TRIVELA_SPEED_MULT = 0.9;   // L1+R1 trivela: velocidad media
export const SHOT_NORMAL_FRICTION_MULT = 0.68; // tiro comun: desliza mas (trayectoria recta y larga)
export const SHOT_TRIVELA_FRICTION_MULT = 0.88;
// Efecto direccional fijo (R1=colocado izq., L1+R1=trivela der. del vector de velocidad)
export const CURVE_ACCEL_PASS = 10.5;         // pases (X, Triangulo, Circulo, pared) — base
export const CURVE_ACCEL_SHOT = 12.5;         // tiros (Cuadrado) — base
export const CURVE_LAT_FRICTION_MULT = 0.85;  // -15% intensidad lateral
export const CURVE_ACCEL_PASS_R1 = CURVE_ACCEL_PASS * CURVE_LAT_FRICTION_MULT * 0.92; // colocado
export const CURVE_ACCEL_PASS_L2 = CURVE_ACCEL_PASS * CURVE_LAT_FRICTION_MULT;         // trivela (L1+R1)
export const CURVE_ACCEL_SHOT_R1 = CURVE_ACCEL_SHOT * CURVE_LAT_FRICTION_MULT * 0.92;
export const CURVE_ACCEL_SHOT_L2 = CURVE_ACCEL_SHOT * CURVE_LAT_FRICTION_MULT;
export const PASS_CROSS_DISTANCE_MULT = 1.5; // +50% distancia máxima: pase raso (X) y centro (○)
export const PASS_GROUND_MAX_SPEED = 42;
export const CROSS_KICK_MAX_SPEED = 40;
export const PASS_MAX_SPEED = PASS_GROUND_MAX_SPEED * PASS_VELOCITY_MULT * KICK_VELOCITY_MULT * PASS_CROSS_DISTANCE_MULT;
export const CURVE_DRIFT_CAP_RATIO = 0.30;    // desviacion lateral maxima = 30% de la distancia del pase
export const CURVE_ARRIVAL_LINEAR_DIST = 2.0; // ultimos metros: rectifica hacia el receptor
export const CURVE_ARRIVAL_LERP = 0.5;
export const SHOT_CURVE_GROUND_MIN_SPEED = 0.22; // umbral bajo para que la rosca se note en pases cortos
export const CURVE_CUT_MIN_SPEED = 0.5;       // bajo esto: curveFactor = 0 (sin "rulo" final)
export const CURVE_LOW_SPEED_FRICTION = 2.0;  // umbral (m/s) para friccion dinamica extra en rodadura
export const CURVE_LOW_SPEED_FRICTION_BOOST = 1.28; // +friccion cuando va lento, se agarra al cesped antes
// DRIBBLING A TOQUES: la pelota ya no queda pegada al jugador. Cuando esta muy cerca y el jugador
// se mueve, recibe un pequeño empujon hacia adelante (en la direccion en la que corre el jugador) y
// luego queda libre unos instantes (cooldown), obligando a correr tras ella para el proximo toque.
export const TOUCH_DISTANCE = 1.2;      // distancia (unidades) por debajo de la cual se puede dar el toque
export const TOUCH_COOLDOWN_MIN = 0.20; // segundos minimos entre toques
export const TOUCH_COOLDOWN_MAX = 0.34; // segundos maximos entre toques
export const TOUCH_FORCE_MIN = 0.9;     // impulso minimo (trotando/caminando con la pelota)
export const TOUCH_FORCE_MAX = 2.2;     // impulso maximo (a maxima velocidad/sprint)
export const BALL_IDLE_FORWARD_OFFSET = 0.38; // offset adelante (idle) al anclar la pelota al pie
export const BALL_FORWARD_OFFSET = 0.52;        // offset adelante (en movimiento) al anclar la pelota al pie
export const BALL_FOOT_SIDE_OFFSET = 0;         // sin desplazamiento lateral: siempre adelante del jugador
export const BALL_LEASH_MAX = 1.6;      // (legacy) ya no usado con bind estricto; se mantiene por compatibilidad
export const TOUCH_ANIM_DUR = 0.22;     // duracion (seg) de la animacion de puntapie del toque
export const CONTROL_TOUCH_DUR = 0.3;   // toque de control al ganar posesion (alineado con PREP_MIN_MS de input.js)

  // --- Conduccion extendida (FakeShot): offset con lerp; effort touch suelta la pelota ---
export const DRIBBLE_DIST_R1 = toGameUnits(2.0);           // R1 + stick der.: toque corto / progresion (m reales)
export const DRIBBLE_DIST_R2 = toGameUnits(4.0);           // legacy: distancia larga (ya no se usa en effort touch)
export const DRIBBLE_DIST_FAKE = toGameUnits(2.0);         // FakeShot (X cancela carga): offset hacia adelante
export const DRIBBLE_DIST_LERP = 0.2;         // suavizado al cambiar de distancia
export const EFFORT_AI_FREEZE_DURATION = 0.45; // 450ms: desorientacion defensiva durante effort touch
export const EFFORT_SPRINT_NORMAL_OFFSET = 0.3; // offset de conduccion normal tras convergencia
export const EFFORT_OFFSET_DRAG_LERP = 0.06;  // freno suave: la pelota se arrastra hacia el jugador
export const EFFORT_DETACHED_BALL_LERP = 0.22; // suavizado del offset pelota-jugador durante R2 (sin teletransporte)
export const EFFORT_EXIT_VEL_BLEND = 0.18;     // segundos de blend de velocidad al salir del esfuerzo/finta
export const DRIBBLE_FAKE_DURATION = 0.5;     // 500ms de offset de amague
export const DRIBBLE_STEAL_RADIUS = 0.4;      // radio de robo sobre la posicion del balon
export const DRIBBLE_CONTROL_SLACK = 0.25;    // tolerancia extra de control en conduccion extendida
export const MAN_MARK_MIN_DIST = 1.5;         // distancia minima de marcaje pasivo al portador rival
export const MAN_MARK_ACTIVATE_DIST = 14;     // radio maximo para activar marcaje pasivo (DEF/MID)
export const ZONE_MARK_RADIUS = 15;           // radio de zona de influencia para marcaje zonal
export const KICKOFF_OCCUPATION_DURATION = 3; // seg: CM + CAM deben quedar detras de la pelota post-saque
export const TEAMMATE_SUPPORT_MIN_DIST = 3.4; // distancia minima de apoyo cuando un companero tiene la pelota

// --- Distancias legacy (referencia; ya no sueltan la pelota a 'free') ---
export const DIST_R1 = DRIBBLE_DIST_R1;
export const DIST_R2 = DRIBBLE_DIST_R2;
export const DIST_FAKE = DRIBBLE_DIST_FAKE;
export const SELF_TOUCH_COLLECT_BLOCK = 0.5;  // 500ms: prohibido reposeer la pelota tras self-touch
export const SELF_TOUCH_BURST_MULT = 25.0;    // impulso inicial seco = targetDist * mult
export const SELF_TOUCH_PLAYER_BRAKE = 0.14; // freno momentaneo del jugador al soltar el toque

// --- EFFORT TOUCH (R1 + flick stick der.): persecucion de balon suelto (Loose Ball Chase) ---
export const GRASS_FRICTION = 0.98;             // legacy alias — ver getModeBallDrag() en modePhysics.js
export const EFFORT_TOUCH_COOLDOWN = 0.5;       // 500ms entre toques (largo o corto) / ventana minima sin owner
export const EFFORT_CHASE_TEAMMATE_BLOCK = 0.5; // 500ms: compañeros no pueden interceptar tras effort touch
export const EFFORT_BALL_LOCK_DURATION = 0.5;   // 500ms: lock global de posesion (isBallLocked)
export const EFFORT_TOUCH_BURST_MULT = 20.0;    // fuerza base del impulso = targetDist * mult
export const EFFORT_TOUCH_MAX_VELOCITY = toGameUnits(15.0);  // clamp: 15 m/s reales → unidades motor
export const FEINT_TOUCH_MAX_VELOCITY = toGameUnits(52.0);   // clamp fake shot (m/s reales)
export const EFFORT_ROLL_SOFT_DURATION = 0.2;   // 200ms: friccion acelerada al soltar (post-toque)
export const EFFORT_ROLL_SOFT_FRICTION_MULT = 2.0; // x2 friccion durante EFFORT_ROLL_SOFT_DURATION
export const CHASE_POSSESS_DIST = toGameUnits(0.5);          // distancia estricta para cerrar el ciclo de persecucion (chasing legacy)
export const PROXIMITY_POSSESS_DIST = toGameUnits(0.4);      // fail-safe no-intrusivo: toma de posesion por proximidad (pelota suelta)
export const GHOST_BALL_DIST = toGameUnits(0.2);             // pelota "fantasma": muy cerca pero sin owner registrado
export const GHOST_BALL_TIMEOUT = 0.5;          // 500ms pegada al jugador = fallo de colision fisica
export const FORCED_CHASE_RECOVER_DIST = toGameUnits(0.8);   // distancia estricta para salir de forced_chase y recuperar posesion
export const FORCED_CHASE_SPEED_MULT = 1.10;    // sprint forzado al 110% de la velocidad base del jugador
export const FORCED_CHASE_LOCK_DURATION = 1.0;  // lockPlayerAssignment: 1s o hasta contacto con la pelota
export const INTERCEPT_SIM_STEP = 0.04;         // paso de simulacion para prediccion de intercepcion (s)
export const INTERCEPT_MAX_TIME = 3.5;          // horizonte maximo de prediccion (s)
export const INTERCEPT_TIME_TOLERANCE = 0.10;   // margen jugador-llega-antes-que-pelota (s)
export const EFFORT_RS_MIN = 0.45;              // magnitud minima del stick derecho para disparar
export const EFFORT_DOUBLE_TAP_WINDOW_MS = 1000; // legacy (effort touch usa un solo flick)
export const EFFORT_TOUCH_ANIM_LONG = 0.28;     // animacion mas larga / postura marcada (toque largo)
export const EFFORT_TOUCH_ANIM_SHORT = 0.20;    // animacion rapida y sutil (toque corto)
export const IGNORE_POSSESSION_T = 0.2;         // 200ms: nadie puede reposeer tras effort touch / fake shot
export const EFFORT_REPOSSESS_COOLDOWN = SELF_TOUCH_COLLECT_BLOCK; // sincronizado con canCollectBlockT

export const STATE_SPRINT_CHASE = 'sprint_chase'; // effort touch: autopase + sprint sin pelota hasta captura
export const STATE_PLAYING = 'playing';   // juego normal en curso
export const STATE_KICKOFF = 'kickoff';   // saque de centro (inicio o post-gol)
export const STATE_FIXED = 'fixed';       // anclado en pelota parada (saque de centro, etc.)
export const GLOBAL_REINSTATEMENT_COOLDOWN = 1.0; // seg: bloqueo de pase/tiro tras reanudar desde bola muerta

// --- GIRO CON PELOTA (toque de acomodo) ---
// Si el jugador conduce y cambia bruscamente de direccion, no sale corriendo de inmediato: primero
// da un toque corto que reacomoda la pelota hacia el pie de apoyo del nuevo rumbo, y recien despues
// se libera la carrera. Sin esto, un cambio de 180° con la pelota pegada al pie se sentia "de goma"
// (el cuerpo giraba pero la velocidad seguia intacta, como patinando sobre el nuevo eje).
export const TURN_TOUCH_ANGLE = 1.05;        // ~60°: diferencia minima entre moveDir y el facing actual para
                                       // contar como "cambio de direccion" (no cualquier correccion fina)
export const TURN_TOUCH_DUR = 0.1;           // 100ms: duracion de la transicion de acomodo
export const TURN_TOUCH_SPEED_FACTOR = 0.06; // durante la transicion, la velocidad maxima permitida cae a casi nada
export const TURN_TOUCH_BALL_LERP = 0.35;    // que tan rapido (por frame, ver lerp) la pelota se acomoda hacia
                                       // el punto de contacto del pie de apoyo en la nueva direccion
export const TURN_TOUCH_BALL_OFFSET = 0.55;  // distancia (unidades) del punto de apoyo respecto al jugador

// --- INERCIA DE MOVIMIENTO (giro + aceleracion gradual, estilo futbol clasico) ---
// AGILITY_* (0..1): cuanto pesa la inercia al girar. Alto = respuesta rapida al stick; bajo = curva
// y desaceleracion al cambiar de rumbo. Ajusta estos dos valores para equilibrar el feeling a mano.
export const AGILITY_NO_BALL = 0.8;   // sin pelota: giros agiles (defensa, carrera libre)
export const AGILITY_WITH_BALL = 0.2; // con pelota: inercia visible pero no excesivamente pesada
/** Multiplicador de velocidad máxima y aceleración en posesión/conducción (−15%). */
export const BALL_POSSESSION_MOVE_MULT = 0.85;
export const MOVE_TURN_RATE_MAX = 9.2;       // rad/s de giro permitido a baja velocidad (respuesta agil)
export const MOVE_TURN_RATE_MIN = 2.6;       // rad/s al ir a maxima velocidad (curva amplia, no pivot)
export const MOVE_SHARP_TURN_BLEED = 0.44;   // cuanto se desacelera en giros bruscos antes de retomar rumbo
export const MOVE_DECEL_FACTOR = 0.84;       // frenado un poco mas lento que aceleracion (inercia al soltar stick)
export const MOVE_LOW_SPEED_SNAP = 0.32;     // por debajo de esta velocidad el rumbo puede alinearse casi al instante
export const DEFAULT_SPRINT_MULT = 1.42;     // multiplicador de sprint en modo 6vs6 (velocidades role-based)

/* ============================================================
   CONFIG DE FISICA POR MODO DE JUEGO (6vs6 / 11vs11)
   Misma fisica en ambos modos; solo cambian escala de cancha y camara.
   ============================================================ */
const SHARED_PHYSICS = {
  animStrideSpeed: null,
  maxJumpHeight: 0.75,
  airTime: 0.32,
  maxSpeed: null,
  sideSpeed: null,
  sprintMult: DEFAULT_SPRINT_MULT,
  playerAccel: GAMEPLAY_PHYSICS.ACCELERATION,
  accelRampDist: 0,
  useUniformSpeed: false,
  usePredictiveIntersection: false,
  gkFieldMaxSpeed: 7.4,
  ballKickPowerMult: 1.0,
  ballAirDragRetain: null,
  ballAirGravityScale: 1.0,
  ballShotArcBoost: 1.0,
  aerialExtraDragMult: 1.0,
};

export const PHYSICS_PRESETS = {
  '6vs6': {
    id: '6vs6',
    label: '6 vs 6',
    formationKey: '6vs6',
    worldScale: 1,
    goalScaleMult: 1,
    camZoomMult: 0.588,
    camNearMult: 0.92,
    horizonShift: 0,
    viewExtentMult: 1,
    ...SHARED_PHYSICS,
  },
  '11vs11': {
    id: '11vs11',
    label: '11 vs 11',
    formationKey: '11vs11',
    worldScale: 1.6,
    /** Arco ampliado proporcionalmente a la cancha 11v11 (7.32 m × 1.6 ≈ 11.7 m de ancho). */
    goalScaleMult: 1.6,
    camZoomMult: 1.12,
    camNearMult: 0.92,
    horizonShift: 0,
    viewExtentMult: 1.45,
    camMaxZoomFactor: 0,
    camZoomSmoothing: 0.05,
    ...SHARED_PHYSICS,
  },
};

export let physicsConfig = {...PHYSICS_PRESETS['6vs6']};

export function getBallKickPowerMult(kickType){
  const base = physicsConfig.ballKickPowerMult ?? 1;
  // Aplica el multiplicador de modo a todas las ejecuciones (pases incluidos).
  return base * getModePowerMultiplier();
}

export function getBallAirGravity(b){
  const aero = b?.highKick ? AERIAL_PHYSICS[b.highKickType] : null;
  let g = GRAVITY + (aero ? aero.extraGravity : 0);
  if(b?.shotArc === 'dip') g += TIME_FINISH.DIP_EXTRA_GRAVITY;
  else if(b?.shotArc === 'rise') g += TIME_FINISH.RISE_EXTRA_GRAVITY;
  return g;
}

export function computeKickVerticalSpeed(type, cfg, power, shotArc = null){
  let vz = (cfg.vz * power) * 1.8 + (type === 'shot' ? 1.2 : 0.8);
  if(type === 'shot'){
    vz *= SHOT_VZ_COMPENSATE;
    // Solo dip/rise con Time Finish perfecto; 'normal' / null / miss_high no alteran el tiro.
    if(shotArc === 'dip') vz *= TIME_FINISH.DIP_VZ_MULT;
    else if(shotArc === 'rise') vz *= TIME_FINISH.RISE_VZ_MULT;
  } else if(type === 'through' || type === 'cross'){
    vz *= LONG_PASS_VZ_COMPENSATE;
  }
  return vz;
}

/** Destello verde de Time Finish perfecto (cursor / balón). */
export function triggerTimeFinishFlash(p, ballPos = null){
  Game.timeFinishFlash = {
    t: 0.55,
    playerId: p?.id ?? null,
    x: ballPos?.x ?? ball.x,
    y: ballPos?.y ?? ball.y,
  };
}

export function updateTimeFinishFlash(dt){
  const f = Game.timeFinishFlash;
  if(!f) return;
  f.t -= dt;
  if(f.t <= 0) Game.timeFinishFlash = null;
}

export function isTimeFinishFlashActive(playerId = null){
  const f = Game.timeFinishFlash;
  if(!f || f.t <= 0) return false;
  if(playerId == null) return true;
  return f.playerId === playerId;
}

/** Mult. de potencia por orientación corporal (1 = bien perfilado). No modifica dirección. */
export function computePosturePowerMult(p, aimDir){
  if(!p || !aimDir) return 1;
  const len = Math.hypot(aimDir.x, aimDir.y);
  if(len < 0.05) return 1;
  const ax = aimDir.x / len, ay = aimDir.y / len;
  const fx = Math.cos(p.facing), fy = Math.sin(p.facing);
  const dot = fx * ax + fy * ay;
  if(dot >= POSTURE_POWER.ALIGNED_DOT) return POSTURE_POWER.ALIGNED_MULT;
  if(dot >= POSTURE_POWER.SIDE_DOT) return POSTURE_POWER.SIDE_MULT;
  if(dot >= POSTURE_POWER.BACK_DOT) return POSTURE_POWER.AWKWARD_MULT;
  return POSTURE_POWER.BACK_MULT;
}

export function resolveShotArc(power, timeFinishHit){
  // Obligatorio: sin Time Finish perfecto → tiro normal invariable (cualquier potencia).
  if(!timeFinishHit) return 'normal';
  const pwr = clamp(power, 0, 1);
  if(pwr >= TIME_FINISH.DIP_POWER_MIN) return 'dip';      // 80%–100%
  if(pwr <= TIME_FINISH.RISE_POWER_MAX) return 'rise';    // ≤50%
  return 'normal';
}

/** Restablece fricción de rodadura al finalizar un pase/tiro (ActionManager / executeKick). */
export function resetBallKickFriction(b, kickType){
  if(!b) return;
  b.ballDamping = getModeBallDrag();
  if(kickType === 'shot') return;
  // Pases rasos, filtrados y centros: fricción estándar del modo (no arrastre de tiro).
  b.groundFrictionMult = 1;
}

function isLobbedGroundKickType(kickType){
  return kickType === 'through';
}

function shouldApplyRollFriction(b, onGround){
  if(onGround) return true;
  return isLobbedGroundKickType(b.lastKickType) && !b.highKick;
}

export function applyBallAirHorizontalDrag(b, dt){
  const aero = b.highKick ? AERIAL_PHYSICS[b.highKickType] : null;
  const retain = physicsConfig.ballAirDragRetain;
  if(retain != null){
    const refDt = physicsConfig.ballAirDragRefDt ?? (1 / 60);
    let effectiveRetain = retain;
    if(aero){
      const dragRelief = physicsConfig.aerialExtraDragMult ?? 1;
      effectiveRetain = 1 - (1 - retain) * dragRelief;
    }
    const step = Math.pow(effectiveRetain, dt / refDt);
    b.vx *= step;
    b.vy *= step;
  } else {
    const dragCoef = AIR_DRAG * (physicsConfig.ballAirDragMult ?? 1);
    const extraDrag = aero ? aero.extraDrag * (physicsConfig.aerialExtraDragMult ?? 1) : 0;
    const drag = 1 / (1 + (dragCoef + extraDrag) * dt);
    b.vx *= drag;
    b.vy *= drag;
  }
  if(aero){
    const airSp = Math.hypot(b.vx, b.vy);
    if(airSp > aero.maxSpeed){
      const s = aero.maxSpeed / airSp;
      b.vx *= s;
      b.vy *= s;
    }
  }
}

export function getDefaultMaxSpeedForRole(role){
  const baseMps = TARGET_SPRINT_MPS / DEFAULT_SPRINT_MULT;
  if(role === 'GK') return baseMps * (5.4 / 8.0);
  if(role === 'FWD') return baseMps;
  return baseMps * (7.4 / 8.0);
}

export function getDirectionalMaxSpeed(moveDir, moveMag, baseMax){
  const sideMax = physicsConfig.sideSpeed ? toGameUnits(physicsConfig.sideSpeed) : null;
  if(!sideMax || sideMax >= baseMax || moveMag <= 0.05) return baseMax;
  const mx = moveDir.x / moveMag;
  const my = moveDir.y / moveMag;
  const denom = Math.sqrt((mx * mx) / (baseMax * baseMax) + (my * my) / (sideMax * sideMax));
  return denom > 0 ? 1 / denom : baseMax;
}

export function applyPhysicsToPlayers(){
  const accel = physicsConfig.playerAccel ?? GAMEPLAY_PHYSICS.ACCELERATION;
  for(const p of allPlayers){
    p.accel = toGameUnits(accel);
    if(physicsConfig.useUniformSpeed){
      p.maxSpeedBase = toGameUnits(physicsConfig.maxSpeed);
      p.maxSpeed = p.maxSpeedBase;
    } else {
      p.maxSpeedBase = toGameUnits(getDefaultMaxSpeedForRole(p.role));
      p.maxSpeed = p.maxSpeedBase;
    }
    applyArchetypePhysicsStats(p);
    p.accelRampDist = 0;
    p.z = 0;
  }
}

export function syncAllPlayersList(){
  allPlayers = [...homeTeam, ...awayTeam];
}

export const TOUCH_KICK_REACH = 1.9;    // cuanto mas lejos llega la pierna en el toque vs. una zancada normal
// (antes 5: con eso un pase (X) o filtrado (triangulo) a maxima potencia practicamente no frenaba
// nunca dentro de la cancha. Subido para que el roce del pasto se note, igual que ya se nota en
// tiros/centros gracias a su drag aereo extra, sin pasarse de rosca)
export const AIR_DRAG = toGameUnits(0.04);        // resistencia aerea (coef. definido en m/s, escalado a unidades motor)

// --- fisica EXTRA solo para tiros y centros (pases altos): sin esto, con suficiente potencia
// cruzan toda la cancha en linea casi recta. Se suma encima de GRAVITY/AIR_DRAG de arriba, y NO
// afecta a los pases rasos ni a los filtrados (quedan exactamente como estaban). Cada tipo tiene
// su propia configuracion independiente (maxVelocity, drag y gravedad extra). ---
export const AERIAL_PHYSICS = {
  shot:  {maxSpeed: toGameUnits(60), extraDrag: toGameUnits(0.30), extraGravity: 8},
  cross: {maxSpeed: toGameUnits(52 * PASS_CROSS_DISTANCE_MULT), extraDrag: toGameUnits(0.46), extraGravity: 3.6},
};

/** Time Finish: tiro descendente (alta potencia) / ascendente (potencia baja). Solo con doble toque perfecto. */
export const TIME_FINISH = {
  DIP_POWER_MIN: 0.80,
  RISE_POWER_MAX: 0.50,
  WINDUP_DUR: 0.20,
  IMPACT_T: 0.11,
  WINDOW: 0.075,
  DIP_VZ_MULT: 0.38,
  DIP_SPD_MULT: 1.06,
  DIP_EXTRA_GRAVITY: 20,
  RISE_VZ_MULT: 1.62,
  RISE_SPD_MULT: 1.02,
  RISE_EXTRA_GRAVITY: -5.5,
  MISS_HIGH_VZ_MULT: 1.95,
  MISS_HIGH_SPD_MULT: 1.04,
};

/** Reducción de potencia por mala orientación corporal (facing vs aim). No altera la dirección. */
export const POSTURE_POWER = {
  ALIGNED_DOT: 0.35,   // de frente / buen perfil → potencia plena
  SIDE_DOT: -0.15,     // de costado
  BACK_DOT: -0.55,     // casi de espaldas
  ALIGNED_MULT: 1.0,
  SIDE_MULT: 0.70,
  AWKWARD_MULT: 0.42,
  BACK_MULT: 0.26,
};
export const CROSS_MARKER_LIFE = 1.5; // seg que se ve la cruz amarilla del pique del centro (boton circulo)
export const CTRL_RADIUS = 1.0;      // radio de control de pelota de un jugador
/** Con jockey (L2): +25% de radio para interceptar / anticipar pases. */
export const JOCKEY_INTERCEPT_REACH_MULT = 1.25;
// --- IA de recepcion (IA_SEEKING): busqueda gradual de pases, sin imanes ni teletransporte ---
export const IA_SEEKING_RADIUS = 10;       // compañeros a menos de esto ajustan targetPosition hacia la pelota
export const IA_SEEKING_SLOW_DIST = 1.5;   // por debajo de esto, el receptor frena levemente para recibir natural
export const IA_SEEKING_SLOW_FACTOR = 0.62; // factor de velocidad maxima al frenar para la recepcion
export const IA_BALL_MOVING_MIN = 0.75;    // velocidad minima (m/s) para considerar la pelota "en movimiento"
export const INTERCEPTION_REACT_MIN = 0.10; // 100ms — retardo minimo de reaccion IA ante pelota suelta
export const INTERCEPTION_REACT_MAX = 0.30; // 300ms — retardo maximo de reaccion IA ante pelota suelta
export const NEAREST_PLAYER_UPDATE_INTERVAL = 0.5; // 500ms — anti-flicker al recalcular el buscador de pelota
export const BALL_AERIAL_MIN_Z = 0.32;     // altura minima para tratar la pelota como aerea (recepcion IA)
export const IA_LANDING_WAIT_DIST = 0.6;   // radio al landingPoint donde el receptor espera en trote/idle
export const IA_LANDING_TIMING_MARGIN = 0.18; // margen (s) entre llegada del jugador y pique de la pelota
export const IA_LANDING_JOG_FACTOR = 0.42;  // factor de movimiento al acercarse demasiado rapido al pique
// --- seleccion de receptor al patear (solo cambio de cursor, no movimiento automatico) ---
export const DIRECTION_PRIORITY = 0.7;
export const DISTANCE_PRIORITY = 0.3;


// --- cambio de cursor EN EL IMPACTO pie-pelota (ver handleKickCursorSwitch), segun la barra de potencia ---
export const AUTOPASE_POWER_THRESHOLD = 0.20; // por debajo: toque suave — cursor/receptor por dirección de stick si hay compañero; si no, autopase
export const LONGPASS_SWITCH_LOCK_MS = 200;   // tras el salto instantaneo de cursor en pase largo/tiro, bloquea
// el auto-seguimiento normal por este tiempo para que no titile si la pelota pasa cerca de otro jugador
// --- contacto defensivo (entrada de pie + barrida) — balance rapido ---
export const TACKLE_RADIUS = 1.85;        // alcance frontal + magnetismo
export const TACKLE_POSSESS_DIST = 1.1;  // bajo este umbral el tacle otorga posesion directa
export const TACKLE_LOOK_RADIUS = 2.0;   // radio para auto-apuntar al balon al presionar tacle
export const STUN_DURATION = 150;          // ms: legacy — ver STUN_IMPACT_DURATION para tacles
export const STUN_IMPACT_DURATION = GAMEPLAY_PHYSICS.TACKLE_STUN_DURATION;
export const STUN_WALK_SPEED_FACTOR = GAMEPLAY_PHYSICS.STUN_WALK_SPEED_FACTOR;
export const STUN_WALK_MIN_FACTOR = GAMEPLAY_PHYSICS.STUN_WALK_MIN_FACTOR;
export const BALL_CONTESTED_DURATION = STUN_IMPACT_DURATION; // zona de exclusion post-tacle: solo el tackler puede buscar la pelota
export const STAGGERED_DURATION = 1.0;     // seg: atacante desequilibrado tras perder posesion (1000ms)
export const TACKLE_POSSESS_DELAY_MS = 50; // ms: retardo antes de asignar posesion post-tacle (evita race con IA)
export const STUN_KNOCKBACK = GAMEPLAY_PHYSICS.STUN_KNOCKBACK;
export const SLIDE_TACKLE_CARRY_SPEED = toGameUnits(5.2); // m/s: inercia tras barrida exitosa
export const PLAYER_BODY_RADIUS = 0.31;  // radio del jugador (mitad de minD en resolveCollisions)
export const TACKLE_BOX_SCALE = 1.875;   // hitbox frontal = 1.5x jugador + 25% (11vs11 parity)
export const STUMBLE_DURATION = 0.42; // "cooling": al perder la pelota en una entrada/barrida/robo, el que la
// tenia tropieza brevemente y no puede recuperarla al instante (ni cargarla de nuevo)

// --- entradas defensivas: entrada de pie (parada) y barrida (deslizamiento) ---
export const STAND_TACKLE_DURATION = 0.38;  // animacion mas extensa
export const STAND_TACKLE_LUNGE = toGameUnits(0.92);     // mayor alcance frontal
export const STAND_TACKLE_CARRY_SPEED = toGameUnits(5.5); // m/s: inercia tras tacle exitoso
export const STAND_TACKLE_LOOSE_DEFLECT = toGameUnits(6.5); // m/s: desvio lateral si contacto lejano
export const STAND_RECOVERY = 0.2;          // recuperacion tras entrada de pie (200ms)
export const TACKLE_COOLDOWN = 0.2;         // cooldown base entre entradas defensivas (200ms)
export const TACKLE_CHAIN_AFTER = 0.55;     // fraccion de anim: a partir de aqui se puede encadenar otra entrada

export const SLIDE_DURATION = 0.5;          // 500ms: duracion fija del deslizamiento
export const SLIDE_DISTANCE = toGameUnits(3.2);          // legacy — usar getModeTackleDistance() en modePhysics.js
export const SLIDE_ACTIVE_START = 0.22;     // prog: inicio ventana activa del slideHitbox
export const SLIDE_ACTIVE_END = 0.78;       // prog: fin ventana activa del slideHitbox
export const SLIDE_LEG_REACH = 0.52;        // unidades: pie extendido adelante del torso (ver drawSlideTackle)
export const SLIDE_HITBOX_HALF_LEN = 0.44;  // semilongitud del slideHitbox a lo largo de la barrida
export const SLIDE_HITBOX_HALF_W = 0.42;    // semiancho lateral del slideHitbox
export const SLIDE_HITBOX_PEAK_SCALE = 1.5; // escala maxima del hitbox en el centro de la ventana activa
export const SLIDE_DISPERSION_IMPULSE = 15.0; // m/s: impulso de dispersion (nunca otorga posesion)
export const SLIDE_DISPERSION_CONE = 90;    // grados: cono aleatorio hacia adelante
export const SLIDE_CLEAR_LIFT = 0.55;       // vz al despejar
export const SLIDE_RECOVERY_HIT = 0.2;      // recuperacion tras barrida exitosa (200ms)
export const SLIDE_RECOVERY_MISS = 0.2;     // recuperacion tras barrida fallida (200ms max)
export const SLIDE_FOUL_CHANCE = 0.3;       // chance de falta si conecta con el rival pero no despeja la pelota
export const BALL_KNEE_HEIGHT_Z = 0.55;     // por encima: desactiva tacles/barridas; activa juego aereo
export const SLIDE_RECEPTION_BLOCK_RADIUS = CTRL_RADIUS * 1.15; // pelota muy cerca: bloquea barrida, permite control/disparo de primera

// --- atajadas del arquero (estirada con animacion) ---
export const GK_MIN_SHOT_SPEED = 6.0;   // solo reacciona a pelotas con esta velocidad minima (no se tira con pelotas lentas)
export const GK_DIVE_SPEED = 12.5;      // velocidad efectiva de la estirada, mas rapida que correr normal
export const BASE_GK_SAVE_RADIUS = 1.5;
export const BASE_GK_INTERCEPTION_RADIUS = 1.2;
export const GK_SAVE_RADIUS = BASE_GK_SAVE_RADIUS;
export const GK_INTERCEPTION_RADIUS = BASE_GK_INTERCEPTION_RADIUS;
export const GK_BALL_HITBOX_RADIUS = 0.42; // hitbox solida del arquero (base arco reglamentario 7.32 m)

export function getGoalWorldScale(){
  return GOAL_HALF / BASE_GOAL_HALF;
}

/** Escala física de alcance del arquero según ancho del arco activo. */
export function getGkSaveRadius(){
  return BASE_GK_SAVE_RADIUS * getGoalWorldScale();
}

export function getGkInterceptRadius(){
  return BASE_GK_INTERCEPTION_RADIUS * getGoalWorldScale();
}

export function getGkBallHitboxRadius(){
  return GK_BALL_HITBOX_RADIUS * getGoalWorldScale();
}
export const GK_BALL_BOUNCE = 0.58;        // coeficiente de rebote pelota-arquero
export const GK_DIVE_MIN_DUR = 0.16, GK_DIVE_MAX_DUR = 0.6;
export const GK_CATCH_CHANCE = 0.4;
export const GK_JUMP_MIN_Z = 1.1;       // por encima de esto, la estirada es un salto (no un buzo lateral)
export const GK_MAX_REACH_Z = 2.55;     // altura maxima a la que el arquero puede llegar saltando
// --- control manual del arquero: △ salta (pelotas altas/centros) · ▢ + stick = estirada hacia ese lado ---
export const GK_MANUAL_JUMP_DUR = 0.32;   // duracion de la animacion al saltar con △
export const GK_MANUAL_DIVE_DUR = 0.4;    // duracion de la animacion al tirarse con ▢+stick
export const GK_MANUAL_DIVE_DIST = 4.2;   // distancia lateral que cubre la estirada manual (el arco mide 7.32m de ancho)
export const GK_POSSESS_FEET = 'feet';
export const GK_POSSESS_HANDS = 'hands';
export const GK_POSSESS_FREE = 'free';        // transitorio: suelta la pelota durante animacion de saque
export const GK_FEET_TO_HANDS_T = 1.5;    // segundos con la pelota en los pies antes de levantarla a las manos
export const GK_FIELD_MAX_SPEED = 7.4;  // referencia de velocidad de jugador de campo (modo pies)
export const GK_HANDS_BALL_OFFSET = { forward: 0.38, side: -0.12, z: 1.08 }; // offset x/y/z relativo al arquero (manos)
export const GK_HANDS_CTRL_RADIUS = 1.55; // radio de control cuando la pelota esta en las manos
export const GK_DROP_KICK_FORCE = 50.0;   // saque de volea/largo (Circulo)
export const GK_THROW_FORCE = 25.0;       // saque con la mano (X)
export const GK_HANDS_TIMER_MS = GK_AUTO_DISTRIBUTE.TIME_MS; // auto-saque tras 3 s con pelota en manos
export const GK_KICK_ANIM_DUR = 0.3;      // 300ms de animacion de saque del arquero
export const GK_KICK_RELEASE_T = 0.65;    // fraccion de la animacion en la que sale la pelota
export const GK_KICK_GROUND_Z = 0.2;      // altura de suelo para transicion post-saque (listener + safety)

// --- acciones aéreas: jerarquia cabezazo (default) / L2+remate volea-chilena (handleAerialContact) ---
export const AIR_CONTACT_RADIUS = 1.2;        // rango de contacto espontaneo (sin buffer)
export const PENDING_ACTION_EXECUTE_RADIUS = 1.25; // buffer: ejecuta pase/volea/cabeza de primera al primer contacto
// El actionBuffer no expira por tiempo: persiste como "esperando ejecucion" hasta onBallContact o cancelacion.
export const PENDING_ACTION_PASS = 'PASS';
export const PENDING_ACTION_SHOT = 'SHOT';
export const ACTION_BUFFER_GROUND_PASS = 'GROUND_PASS'; // pase raso / accion por abajo
export const ACTION_BUFFER_LOBBED_PASS = 'LOBBED_PASS';   // pase filtrado, centro o tiro elevado

export function clearPlayerPendingAction(p){
  if(!p) return;
  p.actionBuffer = {type: null, kickType: null, power: 0, chargeStart: 0, curve: 0, manualL2: false, timestamp: 0};
  p.isPreparingToShoot = false;
  p.chargeMoveLock = null;
  Game.isCharging = false;
}

export function isInputActionLocked(){
  return !!Game.isInputLocked;
}

/** Anula pase/tiro/filtrado/centro; el movimiento y acciones defensivas siguen activos. */
export function lockKickInputs(input){
  if(!input || !Game.isInputLocked) return input;
  return {
    ...input,
    pressPass: false,
    heldPass: false,
    releasedPass: false,
    pressShot: false,
    heldShot: false,
    releasedShot: false,
    pressThrough: false,
    heldThrough: false,
    releasedThrough: false,
    pressCross: false,
    heldCross: false,
    releasedCross: false,
  };
}

export function startGlobalReinstatementCooldown(){
  Game.isInputLocked = true;
  Game.globalReinstatementCooldownT = GLOBAL_REINSTATEMENT_COOLDOWN;
  Game.isCharging = false;
  Game.isChargingShot = false;
  for(const p of allPlayers){
    clearPlayerPendingAction(p);
    p.charging = null;
    p.chargeStart = 0;
    p.pendingKick = null;
    p.isChargingShot = false;
  }
}

export function updateGlobalReinstatementCooldown(dt){
  if(!Game.isInputLocked) return;
  Game.globalReinstatementCooldownT = Math.max(0, Game.globalReinstatementCooldownT - dt);
  if(Game.globalReinstatementCooldownT <= 0){
    Game.isInputLocked = false;
    Game.globalReinstatementCooldownT = 0;
  }
}
export const AIR_BICYCLE_CONTACT_RADIUS = 0.8;// chilena: distancia perfecta jugador-pelota (legacy XY)
export const AIR_BUFFER_RADIUS = 14;          // distancia maxima para empezar a cargar el buffer de accion
export const AIR_CONTACT_PASSED_EPS = 0.055;  // distancia crece por encima de esto = paso el punto de contacto
export const AIR_AERIAL_MIN_Z = 0.5;          // altura minima para poder rematar (pelota en el aire)
/** Techo humano absoluto: por encima no hay remate (elimina altura fantasma). */
export const AIR_MAX_HUMAN_REACH_Z = 2.50;
/** Cabezazo sin salto: centro de pelota entre 1.70 m y 1.90 m (jugador quieto o lento). */
export const AIR_HEADER_STAND_MIN_Z = 1.70;
export const AIR_HEADER_STAND_MAX_Z = 1.90;
/** Por encima de 1.90 m el cabezazo exige salto hasta AIR_MAX_HUMAN_REACH_Z. */
export const AIR_HEADER_JUMP_MIN_Z = 1.90;
export const AIR_HEADER_MIN_Z = AIR_HEADER_STAND_MIN_Z;
export const AIR_HEADER_MAX_Z = AIR_MAX_HUMAN_REACH_Z;
/** Volea manual (L2+remate): altura media. */
export const AIR_VOLLEY_MIN_Z = 0.55;
export const AIR_VOLLEY_MAX_Z = 1.70;
export const FIRST_SHOT_MIN_Z = 0.1;
export const FIRST_SHOT_MAX_Z = 1.50;
export const FIRST_SHOT_IMPACT_WINDOW = 0.2;
export const FIRST_SHOT_POWER_VEL = 8.0;
/** Chilena manual (L2+remate): balón elevado, espalda al objetivo. */
export const AIR_BICYCLE_MIN_Z = 1.40;
export const AIR_BICYCLE_MAX_Z = AIR_MAX_HUMAN_REACH_Z;
export const AIR_LOCK_DURATION = 0.3;
/** Altura del collider de cabeza (m) con el jugador apoyado. */
export const AIR_PLAYER_HEAD_STAND_Z = 1.75;
export const AIR_FOOT_STRIKE_Z = 0.50;
export const AIR_HEAD_HITBOX_R = 0.30;
export const AIR_FOOT_HITBOX_R = 0.35;
export const AIR_AERIAL_HITBOX_MAX_XY = 1.15;
export const AIR_HEADER_JUMP_APPROACH_DIST = 1.85;
export const AIR_HEADER_JUMP_APEX_MIN = 0.30;
export const AIR_HEADER_JUMP_APEX_MAX = 0.78;
export const AIR_HEADER_SLOW_SPEED_RATIO = 0.42;
// --- duelos aéreos: spam-battle en los ultimos 400ms antes del contacto ---
export const AIR_DUEL_RADIUS = 1.0;           // distancia jugador-pelota para disputa activa
export const AIR_SPAM_WINDOW_MS = 400;        // ventana de spam: ultimos 400ms antes del contacto
export const AIR_SPAM_SIM_STEP = 0.012;       // paso de simulacion para predecir impacto
export const AIR_SPAM_METER_MAX = 8;          // presiones para llenar la barra visual de spam

// Bandera global de UI: true solo durante la ventana de spam del duelo aereo activo.
export let isAirSpamWindowActive = false;

export function setAirSpamWindowUiActive(active){
  isAirSpamWindowActive = !!active;
  Game.isAirSpamWindowActive = !!active;
}

export function clearAirSpamUiState(){
  Game.airDuel = null;
  setAirSpamWindowUiActive(false);
}
// jerarquia aerea: sin L2 = cabezazo (seguro) · L2+remate = volea/chilena (arriesgado)
export const AIR_VOLLEY_L2_MIN_Z = AIR_VOLLEY_MIN_Z;
export const AIR_VOLLEY_L2_MAX_Z = AIR_VOLLEY_MAX_Z;
export const AIR_FOOT_THRESHOLD_Z = AIR_AERIAL_MIN_Z; // umbral pie: por debajo = accion de suelo
export const AIR_MANUAL_VOLLEY_STAMINA_COST = 0.35;  // coste extra de estamina (volea manual L2)
export const AIR_MANUAL_VOLLEY_SPREAD_MULT = 1.85;   // margen de error mayor en volea manual
export const AIR_MANUAL_VOLLEY_SPEED_MULT = 1.12;    // potencia superior en volea manual
export const AIR_DUEL_MANUAL_L2_LOSE_PENALTY = 0.30; // duelo aereo: +30% prob. de perder si usa L2+remate
export const AIR_MANUAL_RIVAL_NEAR_DIST = 1.4;  // distancia rival para penalizar volea/chilena manual
export const AIR_MANUAL_RIVAL_PROX_PENALTY = 0.45; // hasta -45% spam efectivo si el rival esta encima
export const AIR_HEADER_RIVAL_NEAR_DIST = 0.9;  // cabezazo: penalizacion leve solo muy pegado
export const AIR_HEADER_RIVAL_PROX_PENALTY = 0.15; // hasta -15% spam efectivo (accion estable)
// multiplicadores de fisica por tipo de accion (sobre la base del contacto: cabezazo/volea/chilena)
export const AIR_ACTION_MODS = {
  shot:  {speedMult:1.0,  vzMult:1.0,  spreadMult:1.0,  powerMin:0.62, powerMax:1.0},
  pass:  {speedMult:0.48, vzMult:0.5,  spreadMult:0.55, powerMin:0.45, powerMax:0.78},
  cross: {speedMult:0.62, vzMult:1.9,  spreadMult:0.4,  powerMin:0.55, powerMax:0.88},
};
// potencias base por tipo de contacto (vx/vy via minSpeed..maxSpeed, vz = parabola inicial)
export const AIR_STRIKE_TABLE = {
  header:  {minSpeed:27, maxSpeed:48, vz:3.2, spread:0.12, dur:0.32},
  volley:  {minSpeed:39, maxSpeed:69, vz:4.4, spread:0.09, dur:0.3},
  bicycle: {minSpeed:36, maxSpeed:63, vz:5.8, spread:0.24, dur:0.55},
};

/* ============================================================
   CANVAS / CAMARA (proyeccion pseudo-3D, tipo transmision TV)
   ============================================================ */
export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d');
export const fieldGrassEl = document.getElementById('fieldGrass');
export function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();

export const CAM = {
  near: 24,
  camYoff: -28,
  horizonFrac: 0.28,
  groundFrac: 0.95,
  zoom: 58,
  fixedZoom: 58,
  baseZoom: 58,
  maxZoomFactor: 12,
  zoomSmoothing: 0.05,
  x: CENTER.x,            // foco horizontal (a lo largo de la banda, eje X): se suaviza hacia la pelota
};
// nota de perspectiva: como la escala de proyeccion (projScale) depende de la profundidad real
// (distancia camara-jugador en el eje Y, hacia la banda lejana), un jugador pegado a la banda lejana
// automaticamente se ve mas chico que uno pegado a la banda cercana a la camara: profundidad real,
// gratis, por como ya esta armada la proyeccion conica de project()/projScale() de abajo.

export function depthOf(y){ return y - CAM.camYoff; }
export function projScale(depth){ return CAM.zoom * (CAM.near/depth) * (canvas.height/650); }

/** Escenas de penal / tiro libre eliminadas — stubs de compatibilidad visual. */
export function isPracticeSetPieceVisualMode(){
  return false;
}

export function isFrontal2DSceneActive(){
  return false;
}

export function isFkPlacementVisualActive(){
  return false;
}

/**
 * Cámara ortográfica del plano del arco (vista frontal 2D).
 * sx ← Y lateral · sy ← suelo + altura Z · escala por distancia al arco.
 */
export const FCAM = {
  goalX: FIELD_L,
  dir: 1,
  laneY: CENTER.y,
  // Fracciones de layout (penal: más abierto/cenital; FK se ajusta en project)
  groundFrac: 0.68,
  goalWidthFrac: 0.46,
  takerGroundFrac: 0.93,
  elevScale: 1.15,
};

export function syncFrontal2DCamera(goalX, dir, opts = null){
  FCAM.goalX = goalX;
  FCAM.dir = dir || 1;
  FCAM.laneY = CENTER.y;
  const mode = opts?.mode || Game.setPieceScene?.mode;
  if(mode === 'penalty'){
    FCAM.groundFrac = 0.66;
    FCAM.goalWidthFrac = 0.44;
    FCAM.takerGroundFrac = 0.94;
    FCAM.elevScale = 1.22;
  } else if(mode === 'free_kick'){
    FCAM.groundFrac = 0.64;
    FCAM.goalWidthFrac = 0.40;
    FCAM.takerGroundFrac = 0.95;
    FCAM.elevScale = 1.28;
  } else {
    FCAM.groundFrac = 0.68;
    FCAM.goalWidthFrac = 0.46;
    FCAM.takerGroundFrac = 0.93;
    FCAM.elevScale = 1.15;
  }
}

/** Metros delante del arco (hacia el campo). */
export function frontalDistFromGoal(p){
  return (FCAM.goalX - (p?.x ?? 0)) * FCAM.dir;
}

/** Vista táctica cenital para ubicar el tiro libre (no broadcast lateral). */
export function projectFkPlacement(p){
  const w = canvas.width;
  const h = canvas.height;
  const margin = 36;
  const scaleX = (w - margin * 2) / FIELD_L;
  const scaleY = (h - margin * 2) / FIELD_W;
  const s = Math.min(scaleX, scaleY) * 0.92;
  const ox = w * 0.5 - (FIELD_L * 0.5) * s;
  const oy = h * 0.5 - (FIELD_W * 0.5) * s;
  return {
    x: ox + (p.x ?? 0) * s,
    y: oy + (p.y ?? 0) * s,
    s: s * 1.8,
  };
}

export function projectFrontal2D(p){
  const w = canvas.width;
  const h = canvas.height;
  const sc = Game.setPieceScene;
  const goalScreenW = w * FCAM.goalWidthFrac;
  const pxPerMeterY = goalScreenW / (GOAL_HALF * 2);
  const pxPerMeterZ = pxPerMeterY * FCAM.elevScale;
  const goalGroundY = h * FCAM.groundFrac;
  const takerGroundY = h * FCAM.takerGroundFrac;

  const dist = Math.max(0, frontalDistFromGoal(p));
  let refDist = 14;
  if(sc?.mode === 'free_kick'){
    const spotDist = sc.spot
      ? Math.max(0, (FCAM.goalX - sc.spot.x) * FCAM.dir)
      : dist;
    refDist = clamp(spotDist * 1.05, 20, 48);
  } else if(sc?.mode === 'penalty'){
    refDist = 16;
  }
  const t = clamp(dist / Math.max(refDist, 1), 0, 1);
  // Perspectiva abierta: el suelo baja hacia el pateador (primer plano).
  const groundY = lerp(goalGroundY, takerGroundY, Math.pow(t, 0.85));
  const scaleMul = 1 + t * 0.42;
  const s = pxPerMeterY * scaleMul;

  const sx = w * 0.5 + ((p.y ?? 0) - FCAM.laneY) * pxPerMeterY * scaleMul;
  const sy = groundY - (p.z || 0) * pxPerMeterZ * scaleMul;
  return { x: sx, y: sy, s };
}

export function project(p){
  if(isFkPlacementVisualActive()) return projectFkPlacement(p);
  if(isFrontal2DSceneActive()) return projectFrontal2D(p);
  // Entrenamiento de balón parado (fuera de escena 2D) usa la proyección de partido (CAM).
  const depth = Math.max(depthOf(p.y), CAM.near*0.55);
  const s = projScale(depth);
  const groundY = canvas.height*CAM.groundFrac;
  const horizonY = canvas.height*CAM.horizonFrac;
  const t = Math.min(1, 1 - CAM.near/depth);
  const sy = groundY - (groundY-horizonY)*t - (p.z||0)*s*1.7;
  const sx = canvas.width/2 + (p.x - CAM.x)*s;
  return {x:sx, y:sy, s};
}

/* ============================================================
   CAMARA DE PRACTICA (Arena de Practica) — perspectiva LONGITUDINAL,
   en tercera persona, ubicada detras del jugador y mirando a lo largo
   de la cancha (eje X) hacia el arco del fondo, tipo camara de
   entrenamiento de los FIFA viejos. Es una proyeccion conica igual
   a la de project()/CAM de arriba, pero con los ejes X/Y invertidos:
   la "profundidad" ahora es el eje X (largo de cancha) en vez del Y
   (ancho), y el paneo horizontal en pantalla sigue al jugador en Y.
   ============================================================ */
export const PCAM = {
  near: 8,             // igual a "behind": a esa distancia exacta el jugador queda al pie de la pantalla
  behind: 8,           // metros que la camara queda detras del jugador, sobre el eje X
  horizonFrac: 0.24,   // igual que CAM.horizonFrac: define el pitch/inclinacion de la camara
  groundFrac: 0.97,
  zoom: 70,            // FOV/zoom mas cerrado que el de partido: sensacion real de tercera persona
  x: 0,                // posicion mundo (eje X) de la camara — se recalcula siguiendo al jugador
  laneY: CENTER.y,     // centro lateral (eje Y) que sigue al jugador — define el paneo horizontal
};
export function projectPractice(p){
  const depth = Math.max(p.x - PCAM.x, PCAM.near*0.55);
  const s = PCAM.zoom * (PCAM.near/depth) * (canvas.height/650);
  const groundY = canvas.height*PCAM.groundFrac;
  const horizonY = canvas.height*PCAM.horizonFrac;
  const t = Math.min(1, 1 - PCAM.near/depth);
  const sy = groundY - (groundY-horizonY)*t - (p.z||0)*s*1.7;
  const sx = canvas.width/2 + (p.y - PCAM.laneY)*s;
  return {x:sx, y:sy, s};
}
// orden de dibujado (pintor): que eje usar como "profundidad" segun el modo
export function paintDepth(entity){
  if(isFkPlacementVisualActive()){
    return -(entity?.x ?? 0);
  }
  if(isFrontal2DSceneActive()){
    // Más cerca del arco = más lejos en pantalla = dibujar primero (detrás).
    return -frontalDistFromGoal(entity);
  }
  return depthOf(entity.y);
}

/**
 * Offset entre el forward del mesh (+local X al dibujar) y el forward del mundo (atan2(dy,dx)).
 * Debe ser 0: un offset de π invierte flip, pies, tacles y estiradas del arquero.
 */
export const MESH_FACING_OFFSET = 0;

export function normalizeAngle(rad){
  let a = rad;
  while(a > Math.PI) a -= 2 * Math.PI;
  while(a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Facing del mundo desde un vector normalizado (atan2(dy, dx) — eje +X = 0 rad). */
export function facingFromDirection(dx, dy){
  const len = Math.hypot(dx, dy);
  if(len < 1e-6) return null;
  return Math.atan2(dy / len, dx / len);
}

/** lookAt(target): orientacion hacia un punto desde la posicion del jugador. */
export function lookAtFacing(fromX, fromY, toX, toY){
  return facingFromDirection(toX - fromX, toY - fromY) ?? 0;
}

/** Equivalente 2D de rotation.y = atan2(direction.x, direction.z) con Y-up. */
export function getMeshRotationY(p){
  const rf = getRenderFacing(p);
  return Math.atan2(Math.cos(rf), Math.sin(rf));
}

/** Facing usado por el mesh de render (fisica + offset de coordenadas). */
export function getRenderFacing(p){
  return normalizeAngle((p?.facing ?? 0) + MESH_FACING_OFFSET);
}

/** Componente horizontal en pantalla del forward de render. */
export function getScreenForwardComponent(p){
  const rf = getRenderFacing(p);
  const fx = Math.cos(rf);
  const fy = Math.sin(rf);
  return gameState === 'practice' ? fy : fx;
}

/** Espejo lateral del mesh: +1 mira a la derecha en pantalla, -1 a la izquierda. */
export function facingFlip(p){
  return getScreenForwardComponent(p) < 0 ? -1 : 1;
}

/** Pelo/espalda: profundidad de camara (eje X en practice, eje Y en partido). */
export function isFacingAwayFromCamera(p){
  return gameState === 'practice' ? Math.cos(p.facing) > 0 : Math.sin(p.facing) > 0;
}

/** Signo lateral respecto al facing: +1 = objetivo a la derecha del jugador. */
export function getLateralSignFromFacing(p, targetX, targetY, useRenderFacing = false){
  const ang = useRenderFacing ? getRenderFacing(p) : (p?.facing ?? 0);
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);
  const cross = fx * (targetY - p.y) - fy * (targetX - p.x);
  return cross >= 0 ? 1 : -1;
}

export function getDiveSideAnim(p, targetY, targetX = p?.x){
  return getLateralSignFromFacing(p, targetX, targetY) >= 0 ? 'DIVE_RIGHT' : 'DIVE_LEFT';
}

// Offset adelante segun si el jugador esta quieto o en movimiento.

export function getDefaultDribbleDistance(p){
  return Math.max(getBallAheadOffset(p), 0.28);
}

export function isExtendedDribbleActive(p){
  if(!p || ball.owner !== p || ball.state !== BALL_STATE.IN_POSSESSION) return false;
  if(isGkHandsPossession(p)) return false;
  if(p.isEffortSprinting) return true;
  if(ball.lastAction === 'effort' || ball.lastAction === 'feint') return true;
  return p.currentDribbleDistance > getDefaultDribbleDistance(p) + 0.12;
}

export function resetDribbleDistance(p){
  if(!p) return;
  const def = getDefaultDribbleDistance(p);
  p.targetDribbleDistance = def;
  p.dribbleKickDir = null;
  p.dribbleExtendT = 0;
  clearEffortSprintState(p);
}

export function getDribbleDirection(p){
  if(p.dribbleKickDir && (p.dribbleExtendT > 0 || ball.lastAction === 'effort' || ball.lastAction === 'feint')){
    const sp = Math.hypot(p.vx, p.vy);
    if(sp > 0.25) return {x: p.vx / sp, y: p.vy / sp};
    return p.dribbleKickDir;
  }
  const sp = Math.hypot(p.vx, p.vy);
  if(sp > 0.2) return {x: p.vx / sp, y: p.vy / sp};
  return {x: Math.cos(p.facing), y: Math.sin(p.facing)};
}

export function isEffortTouchR2Active(p){
  return isPlayerSprintChasing(p);
}

export function isPlayerSprintChasing(p){
  return !!(p && p.state === STATE_SPRINT_CHASE);
}

export function enterSprintChaseState(p){
  if(!p) return;
  p.state = STATE_SPRINT_CHASE;
  p.iaSeeking = true;
  p.manualCancelActive = false;
  p.decisionTimer = 9999;
}

export function clearSprintChaseState(p){
  if(!p) return;
  if(p.state === STATE_SPRINT_CHASE) p.state = 'idle';
  p.iaSeeking = false;
  p.targetPosition = null;
  p.landingTime = 0;
  p.seekAerial = false;
  p.iaSeekingBrake = false;
  if(ball.possessedBy === p.id) ball.possessedBy = null;
  if(p.isEffortTouching){
    p.isEffortTouching = false;
    syncTechnicallyBusy(p);
  }
}

function clearOtherSprintChaseStates(newOwner){
  if(!newOwner) return;
  for(const pl of allPlayers){
    if(pl === newOwner || pl.state !== STATE_SPRINT_CHASE) continue;
    clearSprintChaseState(pl);
    pl.effortTouchAnim = null;
  }
}

export function computeEffortPassPower(p, targetDist){
  const passMult = KICK_VELOCITY_MULT * PASS_VELOCITY_MULT;
  const sprintSp = getPlayerMaxSprintVelocity(p);
  const distRatio = clamp(targetDist / DRIBBLE_DIST_R2, 0.25, 1);
  const desiredSpeed = clamp(sprintSp * lerp(0.68, 0.96, distRatio), 10, passMult * 22);
  const raw = (desiredSpeed / passMult - 10) / 32;
  return clamp(raw, 0.06, AUTOPASE_POWER_THRESHOLD - 0.012);
}

export function updateDribbleDistance(p, dt){
  if(!p || ball.owner !== p) return;
  const def = getDefaultDribbleDistance(p);

  if(p.dribbleExtendT <= 0 && ball.lastAction !== 'effort' && ball.lastAction !== 'feint'){
    p.targetDribbleDistance = def;
  }
  if(isExtendedDribbleActive(p)){
    const moveSp = Math.hypot(p.vx, p.vy);
    if(moveSp > 0.25){
      p.dribbleKickDir = {x: p.vx / moveSp, y: p.vy / moveSp};
    }
  }
  p.currentDribbleDistance = lerp(p.currentDribbleDistance, p.targetDribbleDistance, DRIBBLE_DIST_LERP);
  if(p.dribbleExtendT > 0){
    p.dribbleExtendT = Math.max(0, p.dribbleExtendT - dt);
    if(p.dribbleExtendT <= 0){
      p.targetDribbleDistance = def;
    }
  }
  if(Math.abs(p.currentDribbleDistance - def) < 0.04 && Math.abs(p.targetDribbleDistance - def) < 0.04){
    p.dribbleKickDir = null;
    if(ball.lastAction === 'effort' || ball.lastAction === 'feint') ball.lastAction = null;
  }
}

export function bindDribbleBallPosition(p){
  if(!p || ball.owner !== p) return;
  syncPlayerDir(p);
  const dir = getDribbleDirection(p);
  const dist = p.currentDribbleDistance;
  ball.x = p.x + dir.x * dist;
  ball.y = p.y + dir.y * dist;
  ball.z = lerp(ball.z, BALL_RADIUS, 0.3);
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
}

export function applyExtendedDribbleTouch(p, inputDir, targetDist, source){
  const dir = resolveSelfTouchDirection(inputDir, p);
  p.facing = Math.atan2(dir.y, dir.x);
  p.lastAim = dir;
  syncPlayerDir(p);
  p.dribbleKickDir = dir;
  p.targetDribbleDistance = targetDist;
  if(source === 'effort' || source === 'feint'){
    p.currentDribbleDistance = targetDist; // salto instantaneo del offset
  }
  p.isDribbling = true;
  ball.owner = p;
  ball.state = BALL_STATE.IN_POSSESSION;
  ball.lastAction = source;
  ball.lastTouchedBy = p.id;
  ball.lastTouchTeam = p.team;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.effortDetach = null;
  ball.feintDetach = null;
  p.dribbleExtendT = source === 'feint' ? DRIBBLE_FAKE_DURATION : EFFORT_TOUCH_COOLDOWN;
  bindDribbleBallPosition(p);
  return dir;
}


/* ============================================================
   PLAYER-MESH — animaciones provisionales de 8 direcciones
   Brújula: Norte = +Y (stick arriba). Cada sector mide 45° con
   offset de 22.5° (p. ej. 22.5°–67.5° → Noreste). El movimiento
   sigue siendo libre en 360°; solo la pose visual se cuantiza.
   Para assets definitivos: reemplazar .asset en PLAYER_DIR8_STATES.
   ============================================================ */
export const PLAYER_DIR8_ORDER = ['N','NE','E','SE','S','SW','W','NW'];
export const PLAYER_DIR8_LABELS = {
  N:'Norte', NE:'Noreste', E:'Este', SE:'Sureste',
  S:'Sur', SW:'Suroeste', W:'Oeste', NW:'Noroeste'
};
export const MOVE_DIR8_DEAD = 0.05;
// Registro por estado: .asset queda null hasta tener sprites/modelos definitivos.
export const PLAYER_DIR8_STATES = {
  N:  { asset:null, shoulderColor:'#1E88FF', arrowColor:'#1E88FF' },
  NE: { asset:null, shoulderColor:'#2E94FF', arrowColor:'#2E94FF' },
  E:  { asset:null, shoulderColor:'#00D4FF', arrowColor:'#00D4FF' },
  SE: { asset:null, shoulderColor:'#00C4EF', arrowColor:'#00C4EF' },
  S:  { asset:null, shoulderColor:'#26B36A', arrowColor:'#26B36A' },
  SW: { asset:null, shoulderColor:'#1FA35F', arrowColor:'#1FA35F' },
  W:  { asset:null, shoulderColor:'#1565C0', arrowColor:'#1565C0' },
  NW: { asset:null, shoulderColor:'#0E88CC', arrowColor:'#0E88CC' }
};

export function compassAngleToDir8(rad){
  let deg = rad * 180 / Math.PI;
  if(deg < 0) deg += 360;
  const idx = Math.floor(((deg + 22.5) % 360) / 45) % 8;
  return PLAYER_DIR8_ORDER[idx];
}

export function dir8ToCompassAngle(id){
  const idx = PLAYER_DIR8_ORDER.indexOf(id);
  return ((idx < 0 ? 0 : idx) * 45) * Math.PI / 180;
}

export function updatePlayerMeshDir8(p){
  if(!p) return;

  if(Number.isFinite(p.facing)){
    p.playerMeshDir8 = compassAngleToDir8(Math.atan2(Math.cos(p.facing), Math.sin(p.facing)));
    p.renderFacing = getRenderFacing(p);
    return;
  }

  let dx = 0, dy = 0, hasDir = false;
  const inMag = p.moveInputDir ? Math.hypot(p.moveInputDir.x, p.moveInputDir.y) : 0;
  if(inMag > MOVE_DIR8_DEAD){
    dx = p.moveInputDir.x;
    dy = p.moveInputDir.y;
    hasDir = true;
  } else {
    const vMag = Math.hypot(p.vx, p.vy);
    if(vMag > MOVE_DIR8_DEAD){
      dx = p.vx;
      dy = p.vy;
      hasDir = true;
    } else if(p.stickDir && Math.hypot(p.stickDir.x, p.stickDir.y) > MOVE_DIR8_DEAD){
      dx = p.stickDir.x;
      dy = p.stickDir.y;
      hasDir = true;
    }
  }

  if(hasDir){
    const worldFacing = facingFromDirection(dx, dy);
    if(worldFacing != null){
      p.playerMeshDir8 = compassAngleToDir8(Math.atan2(Math.cos(worldFacing), Math.sin(worldFacing)));
      p.renderFacing = normalizeAngle(worldFacing + MESH_FACING_OFFSET);
    }
  }
}

export function drawPlayerMeshDir8Prototype(p, h, part){
  const stateId = p.playerMeshDir8 || 'S';
  const state = PLAYER_DIR8_STATES[stateId] || PLAYER_DIR8_STATES.S;

  if(state.asset){
    // Punto de enchufe para sprite/modelo definitivo por direccion.
    // state.asset(p, h, ctx, part);
    return;
  }

  if(part === 'arrow'){
    const arrowLen = h * 0.22;
    const arrowAng = dir8ToCompassAngle(stateId);
    ctx.save();
    ctx.rotate(arrowAng);
    ctx.fillStyle = state.arrowColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.06);
    ctx.lineTo(0, h * 0.06 - arrowLen);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h * 0.06 - arrowLen);
    ctx.lineTo(-h * 0.05, h * 0.06 - arrowLen * 0.62);
    ctx.lineTo(h * 0.05, h * 0.06 - arrowLen * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }

  const patchR = h * 0.045;
  ctx.fillStyle = state.shoulderColor;
  ctx.beginPath();
  ctx.arc(-h * 0.15, -h * 0.74, patchR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(h * 0.15, -h * 0.74, patchR, 0, Math.PI * 2);
  ctx.fill();
}

// Anclaje estricto de la pelota al pie del dueño: offset positivo siempre hacia p.facing.

// Alias legacy (pases de control, tackles, etc.)

// Offset adelante segun si el jugador esta quieto o en movimiento.
export function getBallAheadOffset(p){
  const pSpeed = Math.hypot(p.vx, p.vy);
  if(pSpeed < 0.25) return BALL_IDLE_FORWARD_OFFSET;
  return BALL_FORWARD_OFFSET;
}

export function syncPlayerDir(p){
  p.dir.x = Math.cos(p.facing);
  p.dir.y = Math.sin(p.facing);
}

// --- ESTADOS DE LA PELOTA: 'free' | 'in_possession' | 'dead_ball' | 'loose_ball' | 'goal_celebration' | throw-in ---
export const BALL_STATE = { FREE: 'free', IN_POSSESSION: 'in_possession', DEAD_BALL: 'dead_ball', LOOSE_BALL: 'loose_ball', WAITING_FOR_RETRIEVAL: 'waiting_for_retrieval', GOAL_CELEBRATION: 'goal_celebration', OUT_OF_BOUNDS: 'out_of_bounds', IN_HAND: 'in_hand', IN_AIR: 'in_air', PLACED: 'placed' };
export const SET_PIECE = { GOAL_KICK: 'goal_kick', CORNER: 'corner', THROW_IN: 'throw_in', KICKOFF: 'kickoff', FREE_KICK: 'free_kick', PENALTY: 'penalty' };
export const SET_PIECE_UNSTICK_DIST = 1.0;    // metros minimos de recorrido post-saque antes de liberar isStuck
export const SET_PIECE_ZONE_RADIUS = 2.0;     // radio de la zona designada para ejecutar la pelota parada
export const RESTART_TIME_LIMIT_MS = 5000;    // laterales y córners: 5 s
export const SET_PIECE_THROW_IN_TIME_SEC = 5.0;
export const SET_PIECE_CORNER_TIME_SEC = 5.0;
export const SET_PIECE_GOAL_KICK_TIME_SEC = 5.0; // saque de arco: 5 s → despeje largo automático
export const SET_PIECE_FREE_KICK_TIME_SEC = 5.0;
export const SET_PIECE_PENALTY_TIME_SEC = 5.0;
export const SET_PIECE_TIMER_DURATION = 5.0;
export const SET_PIECE_COUNTDOWN_URGENT = 1.0; // ultimo segundo: contador en rojo
export const SET_PIECE_POWER_MAX_MS = 450;    // tiempo maximo de carga de la barra de potencia
/** +300% sobre la base (= 4× potencia original). */
export const THROW_IN_POWER_MULT = 4.0;
export const SET_PIECE_FORCE_MULT = {
  short: 14 * THROW_IN_POWER_MULT,
  medium: 20 * THROW_IN_POWER_MULT,
  long: 28 * THROW_IN_POWER_MULT,
};
export const GOAL_KICK_GRAB_SUPPRESS_RADIUS = 2.4; // desactiva agarre del arquero cerca del vértice del saque
export const FIELD_LINE_EPS = 0.02;           // tolerancia para cruce de linea de banda/fondo
export const DEAD_BALL_RESTART_DELAY = 0.55;  // pausa breve antes del saque automático
// --- Saques de banda (lanzamiento con las manos) ---
export const THROW_IN_FORCE = {
  short: 8.0 * THROW_IN_POWER_MULT,
  medium: 14.0 * THROW_IN_POWER_MULT,
  long: 20.0 * THROW_IN_POWER_MULT,
};
export const THROW_IN_ANIM_WINDUP = 0.2;    // 200ms: torso hacia atras
export const THROW_IN_ANIM_RELEASE = 0.2;   // 200ms: torso hacia adelante + impulso
export const THROW_IN_HAND_Z = 1.5;          // altura de la pelota en manos / salida
export const BASE_THROW_IN_LINE_Y = FIELD_RULES_BASE.THROW_IN_LINE_Y;
export const BASE_THROW_IN_CLAMP_X = FIELD_RULES_BASE.THROW_IN_CLAMP_X;
export const BASE_CORNER_FLAG_INSET = FIELD_RULES_BASE.CORNER_FLAG_INSET;
export let THROW_IN_LINE_Y = BASE_THROW_IN_LINE_Y;
export let THROW_IN_CLAMP_X = BASE_THROW_IN_CLAMP_X;
export let CORNER_FLAG_INSET = BASE_CORNER_FLAG_INSET;
export const THROW_IN_OPPONENT_MIN_DIST = 2.0; // m reales: rivales a 2m del punto de saque
export const THROW_IN_APPROACH_DIST = 1.8;  // distancia para activar isThrowingIn

export function getSetPieceTimerDuration(type){
  if(type === SET_PIECE.THROW_IN) return SET_PIECE_THROW_IN_TIME_SEC;
  if(type === SET_PIECE.CORNER) return SET_PIECE_CORNER_TIME_SEC;
  if(type === SET_PIECE.GOAL_KICK) return SET_PIECE_GOAL_KICK_TIME_SEC;
  if(type === SET_PIECE.FREE_KICK) return SET_PIECE_FREE_KICK_TIME_SEC;
  if(type === SET_PIECE.PENALTY) return SET_PIECE_PENALTY_TIME_SEC;
  return SET_PIECE_TIMER_DURATION;
}

export function cornerTakerFacing(db, ballPos){
  const intoX = db.side === 'left' ? 1 : -1;
  const intoY = (ballPos?.y ?? CENTER.y) >= CENTER.y ? -1 : 1;
  return Math.atan2(intoY * 0.55, intoX);
}

export function playerInStrictControlRange(p, b = ball){
  if(!p) return false;
  if(isKickoffTaker(p) && isKickoffWaiting()) return true;
  if(isGkHandsPossession(p)) return dist2D(p, b) <= GK_HANDS_CTRL_RADIUS;
  if(isGoalkeeper(p)) return dist2D(p, b) <= getGkInterceptRadius();
  if(ball.owner === p && (isExtendedDribbleActive(p) || p.isEffortSprinting)){
    const slack = DRIBBLE_CONTROL_SLACK + (p.currentDribbleDistance > 2.5 ? 0.4 : 0);
    return dist2D(p, b) <= p.currentDribbleDistance + slack;
  }
  return dist2D(p, b) <= CTRL_RADIUS;
}

/** Radio real de alcance para controlar / interceptar (posición actual; +25% en jockey). */
export function getPlayerBallReachRadius(p){
  if(!p) return CTRL_RADIUS;
  if(isGoalkeeper(p)) return getGkInterceptRadius();
  let r = CTRL_RADIUS;
  if(p.jockeyState) r *= JOCKEY_INTERCEPT_REACH_MULT;
  return r;
}

export function playerInControlRange(p, b = ball){
  if(!p) return false;
  return dist2D(p, b) <= getPlayerBallReachRadius(p);
}

/** Intercepción/anticipación pasiva: la pelota debe cruzar el radio actual del jugador. */
export function playerInInterceptReach(p, b = ball){
  return playerInControlRange(p, b);
}

export function setBallStateFree(clearOwner = true, clearEffortChase = true){
  if(clearEffortChase) clearEffortChaseLock(true);
  if(clearOwner && !isBallLocked()) ball.owner = null;
  if(ball.state !== BALL_STATE.DEAD_BALL && ball.state !== BALL_STATE.WAITING_FOR_RETRIEVAL && ball.state !== BALL_STATE.GOAL_CELEBRATION){
    ball.state = BALL_STATE.FREE;
  }
}

export function setBallStateLoose(clearEffortChase = true){
  if(ball.state === BALL_STATE.DEAD_BALL || ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL || ball.state === BALL_STATE.GOAL_CELEBRATION) return;
  if(ball.owner) clearGkPossessionType(ball.owner);
  if(ball.owner) clearGkPossessionType(ball.owner);
  ball.state = BALL_STATE.LOOSE_BALL;
  if(!isBallLocked()) ball.owner = null;
  if(clearEffortChase) clearEffortChaseLock(true);
  clearBallLock();
}

// Evento privado de persecucion post effort touch: solo lo consume el jugador que lo emitio.
export const PrivateChaseEvents = {
  _event: null,
  emit(playerId, source = 'effort'){
    this._event = {playerId, source, ownerId: playerId};
  },
  listen(playerId){
    return this._event && this._event.playerId === playerId ? this._event : null;
  },
  clear(){
    this._event = null;
  },
};

export function clearEffortChaseLock(clearPrivateEvent = true){
  ball.effortDetach = null;
  ball.feintDetach = null;
  if(clearPrivateEvent) PrivateChaseEvents.clear();
}

export function isEffortChaseBlockActive(){
  return !!(ball.effortDetach && ball.effortDetach.blockT > 0 && ball.state !== BALL_STATE.LOOSE_BALL);
}

export function getEffortChaseOwner(){
  if(!ball.effortDetach) return null;
  return allPlayers.find(pl => pl.id === ball.effortDetach.ownerId) || null;
}

// Dueño logico de la pelota (owner en conduccion o autor de effort/fake en vuelo).
export function getBallLogicalOwner(){
  if(ball.owner) return ball.owner;
  if(ball.possessedBy){
    return allPlayers.find(pl => pl.id === ball.possessedBy) || null;
  }
  const effortOwner = getEffortChaseOwner();
  if(effortOwner) return effortOwner;
  if(ball.feintDetach?.ownerId){
    return allPlayers.find(pl => pl.id === ball.feintDetach.ownerId) || null;
  }
  return null;
}

export function canTakeBallFromOwner(taker, owner){
  if(!taker || !owner || owner === taker) return true;
  return owner.team !== taker.team;
}

export function isCpuPassTarget(p){
  if(!p) return false;
  const targetId = p.team === 'home' ? Game.passTargetHome : Game.passTargetAway;
  return targetId === p.id;
}

export function isCpuBlockedFromTeammateLooseBall(p){
  if(!p || !isCpuPlayer || !isCpuPlayer(p)) return false;
  if(isCpuPassTarget(p)) return false;
  const carrier = ball.owner;
  if(carrier && carrier.team === p.team && carrier.id !== p.id) return true;
  if(isEffortTouchPendingReclaim() && p.team === ball.lastTouchTeam && ball.possessedBy) return true;
  for(const mate of allPlayers){
    if(mate.team !== p.team || mate.id === p.id) continue;
    if(ball.possessedBy === mate.id) return true;
    if(isPlayerSprintChasing(mate) || isPostTouchChasing(mate)) return true;
    if(ball.owner === mate) return true;
    if(isControlledByHuman && isControlledByHuman(mate) && dist2D(mate, ball) + 0.15 < dist2D(p, ball)) return true;
  }
  return false;
}

export function isEffortTouchActive(p){
  return !!(p && (p.isEffortTouching || p.effortTouchAnim));
}

export function isPlayerPerformingSkill(p){
  return isEffortTouchActive(p);
}

export function lockPlayerSwitchForEffort(p){
  if(!p) return;
  if(p.team === 'home') Game.effortSwitchLockPlayerHome = p.id;
  else Game.effortSwitchLockPlayerAway = p.id;
}

export function clearPlayerSwitchLockForEffort(team){
  if(team === 'home') Game.effortSwitchLockPlayerHome = null;
  else Game.effortSwitchLockPlayerAway = null;
}

export function isPlayerSwitchLockedForEffort(team){
  const playerId = team === 'home' ? Game.effortSwitchLockPlayerHome : Game.effortSwitchLockPlayerAway;
  if(!playerId) return false;
  const p = allPlayers.find(pl => pl.id === playerId);
  if(!p){
    clearPlayerSwitchLockForEffort(team);
    return false;
  }
  if(ball.owner === p){
    clearPlayerSwitchLockForEffort(team);
    return false;
  }
  if(!p.effortTouchAnim){
    clearPlayerSwitchLockForEffort(team);
    return false;
  }
  return true;
}

export function syncHumanTeamControlOnPossession(p){
  if(!p || !isHumanTeam || !isHumanTeam(p.team)) return;
  if(isControlledByHuman && isControlledByHuman(p)) return;
  if(p.team === 'home') setControlled(p);
  else if(Game.twoPlayerMode) setControlled2(p);
}

export function getTeamBlockPhase(team){
  const carrier = ball.owner;
  if(carrier){
    if(carrier.team === team) return 'attack';
    return 'defend';
  }
  const dir = team === 'home' ? 1 : -1;
  const ownGoal = team === 'home' ? 0 : FIELD_L;
  const progress = (ball.x - ownGoal) * dir;
  return progress > FIELD_L * 0.48 ? 'attack' : 'defend';
}

/** Slot tactico: el bloque avanza al atacar y retrocede al defender. */
export function getTacticalBlockSlot(p){
  const base = p.targetSlotWorld();
  const phase = getTeamBlockPhase(p.team);
  const dir = p.attackDir();
  const carrier = ball.owner;
  // En 11v11 el campo es más largo: escalar empujes del bloque.
  const pitchScale = clamp(FIELD_L / BASE_FIELD_L, 1, 1.75);
  let shift = 0;
  let yCompress = 0;

  if(phase === 'attack'){
    const prog = carrier && carrier.team === p.team
      ? clamp((carrier.x - p.ownGoalX()) / FIELD_L, 0.15, 1)
      : 0.55;
    if(p.posRole === 'LB' || p.posRole === 'RB') shift = 14 * pitchScale * (0.55 + prog * 0.45);
    else if(p.posRole === 'CDM') shift = 7 * pitchScale * (0.45 + prog * 0.4);
    else if(p.role === 'DEF') shift = 8 * pitchScale * (0.5 + prog * 0.5);
    else if(p.role === 'MID') shift = 12 * pitchScale * (0.55 + prog * 0.45);
    else shift = 6 * pitchScale * (0.6 + prog * 0.4);
  } else if(phase === 'defend'){
    const threat = carrier && carrier.team !== p.team
      ? clamp((carrier.x - p.ownGoalX()) * dir / FIELD_L, 0, 1)
      : clamp((ball.x - p.ownGoalX()) * dir / FIELD_L, 0, 1);
    if(p.posRole === 'LB' || p.posRole === 'RB') shift = -9 * pitchScale * (0.55 + threat * 0.45);
    else if(p.posRole === 'CDM') shift = -10 * pitchScale * (0.6 + threat * 0.4);
    else if(p.role === 'DEF') shift = -7 * pitchScale * (0.6 + threat * 0.4);
    else if(p.role === 'MID') shift = -11 * pitchScale * (0.55 + threat * 0.45);
    else shift = -5 * pitchScale * (0.5 + threat * 0.5);
    yCompress = Game.matchFormat === '11vs11' ? 0.18 : 0.12;
  }

  let y = lerp(base.y, CENTER.y, yCompress);
  // Laterales: mantienen amplitud en ataque 11v11.
  if(Game.matchFormat === '11vs11' && phase === 'attack' && (p.posRole === 'LB' || p.posRole === 'RB')){
    const wideBias = p.posRole === 'LB' ? -1 : 1;
    y = clamp(base.y + wideBias * 2.5 * pitchScale, 4, FIELD_W - 4);
  }

  return {
    x: clamp(base.x + dir * shift, 4, FIELD_L - 4),
    y: clamp(y, 4, FIELD_W - 4),
  };
}

export function getTeammateSupportTarget(p, carrier){
  const base = getTacticalBlockSlot(p);
  const pitchScale = clamp(FIELD_L / BASE_FIELD_L, 1, 1.75);
  const pushX = base.x + p.attackDir() * 6 * pitchScale;
  let targetX = pushX;
  let targetY = clamp(base.y + (carrier.y - CENTER.y) * -0.25, 4, FIELD_W - 4);
  const dx = targetX - carrier.x;
  const dy = targetY - carrier.y;
  const d = Math.hypot(dx, dy);
  const minDist = TEAMMATE_SUPPORT_MIN_DIST * pitchScale;
  if(d > 0.01 && d < minDist){
    const scale = minDist / d;
    targetX = carrier.x + dx * scale;
    targetY = carrier.y + dy * scale;
  }
  return {
    x: clamp(targetX, 4, FIELD_L - 4),
    y: clamp(targetY, 4, FIELD_W - 4),
  };
}

export function isTeammateBlockedFromEffortChase(p){
  if(!p || !ball.possessedBy) return false;
  if(p.id === ball.possessedBy) return false;
  const owner = allPlayers.find(pl => pl.id === ball.possessedBy);
  if(!owner || p.team !== owner.team) return false;
  if(ball.state === BALL_STATE.LOOSE_BALL) return false;
  return true;
}

export function updateEffortChaseBlock(dt){
  if(!ball.effortDetach || ball.state === BALL_STATE.LOOSE_BALL) return;
  ball.effortDetach.blockT = Math.max(0, ball.effortDetach.blockT - dt);
}







export function isBallLocked(){
  return !!Game.isBallLocked;
}

export function activateBallLock(p){
  if(!p) return;
  Game.isBallLocked = true;
  Game.ballLockOwnerId = p.id;
  Game.ballLockT = EFFORT_BALL_LOCK_DURATION;
}

export function clearBallLock(){
  Game.isBallLocked = false;
  Game.ballLockOwnerId = null;
  Game.ballLockT = 0;
}

export function updateBallLock(dt){
  if(!Game.isBallLocked) return;

  const lockOwner = allPlayers.find(pl => pl.id === Game.ballLockOwnerId) || null;
  if(lockOwner && ball.state === BALL_STATE.FREE){
    ball.owner = lockOwner;
  }

  Game.ballLockT -= dt;
  if(Game.ballLockT > 0) return;

  const lockOwnerId = Game.ballLockOwnerId;
  clearBallLock();

  // Evitar ghost switching: al expirar, solo liberar owner si la pelota sigue libre sin contacto fisico
  if(ball.state === BALL_STATE.FREE && ball.owner && ball.owner.id === lockOwnerId){
    if(!playerInStrictControlRange(ball.owner)){
      ball.owner = null;
    }
  }
}

export function canAssignBallPossession(p){
  if(!isBallLocked()) return true;
  return !!(p && p.id === Game.ballLockOwnerId);
}

export function isBallFreeForPlayer(p){
  if(ball.state !== BALL_STATE.FREE) return false;
  if(!ball.owner) return true;
  return !!(p && ball.owner === p && (isBallLocked() || isChaseOwner(p)));
}

export function isBallDead(){
  return ball.state === BALL_STATE.DEAD_BALL ||
    ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL ||
    ball.state === BALL_STATE.GOAL_CELEBRATION ||
    !!Game.deadBall || !!Game.isDeadBall;
}

export function isBallGoalCelebration(){
  return ball.state === BALL_STATE.GOAL_CELEBRATION;
}

export function isBallSetPieceFrozen(){
  return ball.state === BALL_STATE.DEAD_BALL ||
    ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL ||
    ball.state === BALL_STATE.GOAL_CELEBRATION ||
    ball.state === BALL_STATE.PLACED;
}

export function isGoalKickReadyState(){
  return !!(Game.setPieceMode && Game.setPiece?.type === SET_PIECE.GOAL_KICK && ball.isReadyToKick && !Game.isBallInPlay);
}

export function isGkGrabBlockedForSetPiece(gk){
  if(!gk || !isGoalkeeper(gk)) return false;
  if(!isGoalKickReadyState()) return false;
  if(Game.setPiece?.takerId === gk.id) return true;
  return dist2D(gk, ball) <= GOAL_KICK_GRAB_SUPPRESS_RADIUS;
}

export function shouldSkipBallPhysics(b){
  if(b.state === BALL_STATE.IN_POSSESSION) return true;
  if(b.state === BALL_STATE.PLACED) return true;
  if(b.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return true;
  if(b.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return true;
  return false;
}

export function isThrowInBallState(){
  return ball.state === BALL_STATE.OUT_OF_BOUNDS ||
    ball.state === BALL_STATE.IN_HAND ||
    ball.state === BALL_STATE.IN_AIR;
}
export function isThrowInPossessionBlocked(){
  return ball.state === BALL_STATE.IN_HAND || ball.state === BALL_STATE.IN_AIR;
}
export function isThrowInTakerBlocked(p){
  return !!(p && ball.throwInBlockOwnerId && p.id === ball.throwInBlockOwnerId);
}
export function clearThrowInBlockIfOtherPlayer(p){
  if(p && ball.throwInBlockOwnerId && p.id !== ball.throwInBlockOwnerId){
    ball.throwInBlockOwnerId = null;
  }
}

export function sanitizeBallState(){
  if(Game.goalRoll || Game.deadBall || Game.outOfPlay || isBallSetPieceFrozen()) return;
  if(isThrowInBallState() || Game.throwIn?.active) return;
  if(ball.state === BALL_STATE.IN_POSSESSION && !ball.owner){
    ball.state = BALL_STATE.FREE;
    return;
  }
  if((ball.state === BALL_STATE.FREE || ball.state === BALL_STATE.LOOSE_BALL) && ball.owner){
    ball.state = BALL_STATE.IN_POSSESSION;
    return;
  }
  const liveStates = [BALL_STATE.FREE, BALL_STATE.IN_POSSESSION, BALL_STATE.LOOSE_BALL];
  if(!liveStates.includes(ball.state)){
    ball.owner = null;
    ball.state = BALL_STATE.FREE;
  }
}

export function isBallWaitingForRetrieval(){
  return ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL;
}

export function isBallOutOfPlay(){
  return !!(Game.outOfPlay || isBallWaitingForRetrieval());
}

export function clearAllChasingStates(){
  for(const p of allPlayers) clearChasingState(p);
}

export function isEffortTouchDetached(){
  return !!(ball.effortDetach && ball.lastAction === 'effort' && ball.owner === null);
}

export function isFeintDetached(){
  return !!(ball.feintDetach && ball.owner === null);
}

export function isBindingSuspended(){
  return isEffortTouchDetached() || isFeintDetached();
}

export function isChaseOwner(p){
  return !!(p && ball.effortDetach && ball.effortDetach.ownerId === p.id);
}

export function isPlayerChasing(p){
  if(isPlayerStaggered(p) || isPlayerStunned(p)) return false;
  return !!p && (p.state === 'chasing' || p.state === MOVING_TO_BALL);
}

// Persecucion post effort touch / fake shot: chasing inmediato hacia ball.position.
export function isPostTouchChasing(p){
  if(!p || p.state !== 'chasing') return false;
  return isChaseOwner(p) || !!(ball.feintDetach && ball.feintDetach.ownerId === p.id);
}

// Persecucion del autor del effort touch / fake shot: el jugador humano manda, la IA no interviene.
export function isManualAction(p){
  return isPostTouchChasing(p);
}

export function clearPlayerAIState(p){
  if(!p) return;
  p.iaSeeking = false;
  p.targetPosition = null;
  p.landingTime = 0;
  p.seekAerial = false;
}












// Fin de animacion post effort/fake: la pelota sigue en posesion (no se libera a 'free').
export function finishExtendedDribbleAnim(p){
  if(!p) return;
  if(p.canCollectBlockT <= 0 && !p.isStunned && !p.stun) p.canCollectBall = true;
}

export function syncTechnicallyBusy(p){
  if(!p) return;
  p.isTechnicallyBusy = !!(p.isEffortTouching || p.isFakeShooting || p.isMakingManualRun);
}

export function distanceToBall(player, ballRef = ball){
  return dist2D(player, ballRef);
}

export function resetTechnicalActionFlags(p){
  if(!p) return;
  p.isEffortTouching = false;
  p.isFakeShooting = false;
  p.effortTouchAnim = null;
  clearSprintChaseState(p);
  clearEffortSprintState(p);
  p.fakeShotChaseLockT = 0;
  p.effortChaseTarget = null;
  if(ball.feintDetach && ball.feintDetach.ownerId === p.id) ball.feintDetach = null;
  clearForcedChaseState(p);
  syncTechnicallyBusy(p);
}

// Fail-safe no-intrusivo: solo actua con pelota suelta; respeta acciones tecnicas salvo ghost ball.
export function checkProximityPossession(dt){
  if(ball.owner !== null){
    for(const p of allPlayers) p.ghostBallProximityT = 0;
    return;
  }
  if(isBallSetPieceFrozen()) return;
  if(ball.isReadyToKick || ball.state === BALL_STATE.PLACED) return;
  if(isThrowInPossessionBlocked()) return;
  if(Game.setPieceMode && !Game.isBallInPlay) return;
  if(Game.deadBall || Game.isDeadBall || Game.outOfPlay) return;
  if(isTacklePossessionPending()) return;
  if(ball.z >= 1.15) return;
  if(ball.state !== BALL_STATE.FREE && ball.state !== BALL_STATE.LOOSE_BALL) return;

  const step = dt || lastDt || 0.016;
  let best = null, bestDist = PROXIMITY_POSSESS_DIST;
  let ghostCandidate = null, ghostDist = GHOST_BALL_DIST;

  for(const p of allPlayers){
    syncTechnicallyBusy(p);
    const d = distanceToBall(p, ball);

    if(d < GHOST_BALL_DIST) p.ghostBallProximityT += step;
    else p.ghostBallProximityT = 0;

    if(isEffortTouchDefenderFrozen(p)) continue;
    if(ball.isContested && !isBallContestedSeekAllowed(p)) continue;
    if(isManualMode && isCpuPlayer(p) && !canCpuSeekLooseBall(p) && !canCpuReceivePass(p)) continue;
    if(isTeammateBlockedFromEffortChase(p)) continue;
    if(isCpuBlockedFromTeammateLooseBall(p)) continue;
    if(isThrowInTakerBlocked(p)) continue;
    if(isPlayerStaggered(p) || isPlayerStunned(p)) continue;

    if(d < GHOST_BALL_DIST && p.ghostBallProximityT >= GHOST_BALL_TIMEOUT){
      if(d < ghostDist){
        ghostDist = d;
        ghostCandidate = p;
      }
      continue;
    }

    if(!p.isTechnicallyBusy && d < PROXIMITY_POSSESS_DIST && d < bestDist){
      if(p.releaseCooldown > 0) continue;
      if(!p.canCollectBall) continue;
      if(isPossessionIgnored()) continue;
      bestDist = d;
      best = p;
    }
  }

  const winner = ghostCandidate || best;
  if(!winner) return;
  const possessSource = isGoalkeeper(winner) ? inferGkPossessionSource(winner) : null;
  if(winner.takePossession(possessSource, !!ghostCandidate)){
    syncHumanTeamControlOnPossession(winner);
  }
}







export function isPlayerAssignmentLocked(p){
  return !!(p && p.lockPlayerAssignment);
}

export function clearPlayerLockAssignment(p){
  if(!p) return;
  p.lockPlayerAssignment = false;
  p.lockPlayerAssignmentT = 0;
}

export function activatePlayerLockAssignment(p){
  if(!p) return;
  p.lockPlayerAssignment = true;
  p.lockPlayerAssignmentT = FORCED_CHASE_LOCK_DURATION;
}

export function isPlayerForcedChasing(p){
  return isPostTouchChasing(p);
}

export function getPostTouchRecoverDist(p){
  return (isPostTouchChasing(p) || isChaseOwner(p) || isPlayerSprintChasing(p))
    ? FORCED_CHASE_RECOVER_DIST : CHASE_POSSESS_DIST;
}

export function isPlayerStunned(p){
  return !!(p && p.stun && p.stun.t < p.stun.dur);
}

export function isPlayerStaggered(p){
  return !!(p && p.staggered && p.staggered.t < p.staggered.dur);
}

export function applyStun(player){
  if(!player) return;
  const dur = player.tackleStunDuration;
  player.isStunned = true;
  player.stun = {t: 0, dur};
  player.canCollectBall = false;
  player.releaseCooldown = Math.max(player.releaseCooldown, dur);
  player.tackleCooldown = Math.max(player.tackleCooldown, 0.4);
  player.charging = null;
  player.pendingKick = null;
  clearPlayerPendingAction(player);
  player.iaSeeking = false;
  player.targetPosition = null;
  player.landingTime = 0;
  player.seekAerial = false;
  clearChasingState(player);
  clearForcedChaseState(player);
  clearPlayerAIState(player);
  player.stumble = {t: 0, dur: Math.min(STUMBLE_DURATION, dur * 0.55)};
  const kb = STUN_KNOCKBACK;
  player.vx = -player.dir.x * kb;
  player.vy = -player.dir.y * kb;
}

export function applyStaggered(player, duration = STAGGERED_DURATION){
  if(!player) return;
  player.staggered = {t: 0, dur: duration};
  clearChasingState(player);
  clearForcedChaseState(player);
  clearPlayerAIState(player);
  player.state = 'staggered';
  player.iaSeeking = false;
  player.targetPosition = null;
  player.landingTime = 0;
  player.seekAerial = false;
}

export let tacklePossessToken = 0;

export function isTacklePossessionPending(){
  const pending = Game.pendingTacklePossession;
  return !!(pending && performance.now() < pending.until);
}

export function grantTacklePossession(tackler, victim){
  if(!tackler) return;
  if(victim && victim.team === tackler.team) return;
  if(victim && isGkHandsImmune(victim)) return;
  clearEffortChaseLock(true);
  clearBallLock();

  const hadPossession = !!(victim && ball.owner === victim);
  if(victim && victim.team !== tackler.team){
    applyStun(victim, STUN_IMPACT_DURATION);
    if(hadPossession) applyStaggered(victim, STAGGERED_DURATION);
    victim.vx = 0;
    victim.vy = 0;
  }
  activateBallContested(tackler, victim && victim.team !== tackler.team ? victim : null);

  const token = ++tacklePossessToken;
  Game.pendingTacklePossession = {tacklerId: tackler.id, token, until: performance.now() + 220};

  ball.owner = null;
  ball.state = BALL_STATE.FREE;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = BALL_RADIUS;
  ball.passOrigin = null;

  const a = tackler.tackleAnim;
  if(a) applyTackleCarryInertia(tackler, a);

    setTimeout(() => {
    if(token !== tacklePossessToken) return;
    const t = allPlayers.find(pl => pl.id === tackler.id);
    if(!t) return;
    ball.owner = t;
    ball.state = BALL_STATE.IN_POSSESSION;
    ball.lastTouchTeam = t.team;
    ball.lastTouchedBy = t.id;
    ball.passOrigin = null;
    ball.highKick = false;
    ball.effortDetach = null;
    ball.feintDetach = null;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    ball.curveFactor = 0;
    clearChasingState(t);
    t.controlTouch = {t: 0, dur: CONTROL_TOUCH_DUR};
    t.touchAnim = {t: 0, dur: CONTROL_TOUCH_DUR, leg: t.foot};
    t.tackleCooldown = TACKLE_COOLDOWN * 0.5;
    Game.pendingTacklePossession = null;
    syncHumanTeamControlOnPossession(t);
  }, TACKLE_POSSESS_DELAY_MS);
}






export function activateBallContested(tackler, victim){
  if(!tackler) return;
  ball.isContested = true;
  ball.contestedT = BALL_CONTESTED_DURATION;
  ball.contestedTacklerId = tackler.id;
  ball.contestedVictimId = victim ? victim.id : null;
}

export function updateBallContested(dt){
  if(!ball.isContested) return;
  ball.contestedT -= dt;
  if(ball.contestedT > 0) return;
  ball.isContested = false;
  ball.contestedT = 0;
  ball.contestedTacklerId = null;
  ball.contestedVictimId = null;
  for(const pl of allPlayers){
    if(pl.aiMode === 'idle') pl.aiMode = 'normal';
  }
}

export function getBallContestedTackler(){
  if(!ball.contestedTacklerId) return null;
  return allPlayers.find(pl => pl.id === ball.contestedTacklerId) || null;
}

export function isBallContestedRival(p){
  if(!ball.isContested || !p) return false;
  const tackler = getBallContestedTackler();
  if(!tackler) return false;
  return p.team !== tackler.team;
}

export function isBallContestedSeekAllowed(p){
  if(!ball.isContested) return true;
  return !!(p && ball.contestedTacklerId && p.id === ball.contestedTacklerId);
}

export function startForcedChase(p, ballRef){
  if(!p || !ballRef) return;
  p.state = 'chasing';
  activatePlayerLockAssignment(p);
  clearPlayerAIState(p);
  p.decisionTimer = 9999;
  p.iaSeeking = false;
  p.targetPosition = null;
  p.landingTime = 0;
  p.seekAerial = false;

  const dx = ballRef.x - p.x, dy = ballRef.y - p.y;
  const td = Math.hypot(dx, dy);
  const md = td > 0.01 ? {x: dx/td, y: dy/td} : {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  const sprintSp = Math.min(
    physicsConfig.useUniformSpeed
      ? toGameUnits(physicsConfig.maxSpeed ?? TARGET_SPRINT_MPS)
      : getPlayerMaxSprintVelocity(p),
    getPlayerAbsoluteMaxVelocity(p),
  );
  p.vx = md.x * sprintSp;
  p.vy = md.y * sprintSp;
  p.facing = Math.atan2(md.y, md.x);
  p.dir.x = Math.cos(p.facing);
  p.dir.y = Math.sin(p.facing);
  p.sprinting = true;
}

export function clearForcedChaseState(p, moveDir){
  if(!p || !isPostTouchChasing(p)) return;
  beginEffortTouchExitBlend(p, moveDir);
  p.state = 'idle';
  p.decisionTimer = Math.random() * 0.4;
  p.sprinting = false;
  clearPlayerLockAssignment(p);
  clearPlayerAIState(p);
  clearPassTargetIfPlayer(p);
}

export function interruptForcedChaseForAction(p){
  if(!isPostTouchChasing(p)) return false;
  clearForcedChaseState(p);
  return true;
}

export function activateIgnorePossession(){
  ball.ignorePossessionT = IGNORE_POSSESSION_T;
}

export function updateIgnorePossession(dt){
  if(ball.ignorePossessionT > 0){
    ball.ignorePossessionT = Math.max(0, ball.ignorePossessionT - dt);
    if(ball.ignorePossessionT <= 0) ball.lastAction = null;
  }
}

export function isPossessionIgnored(){
  return ball.ignorePossessionT > 0;
}

// Reset al terminar animacion de self-touch (canCollectBall se restaura solo tras canCollectBlockT).
export function finishPostTouchActionReset(p){
  if(!p) return;
  ball.state = BALL_STATE.FREE;
  ball.owner = null;
  p.stun = null;
  p.isStunned = false;
  ball.ignorePossessionT = 0;
  ball.lastAction = null;
}

// Chequeo de proximidad con prioridad absoluta (antes de cualquier otra logica en Ball.update).
export function forceProximityPossessionCheck(){
  if(ball.state !== BALL_STATE.FREE) return;
  let best = null, bestDist = 1.0;
  for(const p of allPlayers){
    if(!p.canCollectBall) continue;
    if(isCpuBlockedFromTeammateLooseBall(p)) continue;
    if(isTeammateBlockedFromEffortChase(p)) continue;
    if(ball.isContested && !isBallContestedSeekAllowed(p)) continue;
    if(isManualMode && isCpuPlayer(p) && !canCpuReceivePass(p)) continue;
    const dist = getDistance(p, ball);
    // console.log('Ball State:', ball.state, 'Dist:', dist, 'CanCollect:', p.canCollectBall);
    if(dist < 1.0 && dist < bestDist){
      bestDist = dist;
      best = p;
    }
  }
  if(!best) return;
  if(ball.owner && !canTakeBallFromOwner(best, ball.owner)) return;
  ball.owner = best;
  ball.state = BALL_STATE.IN_POSSESSION;
  ball.lastAction = null;
  ball.ignorePossessionT = 0;
  clearEffortChaseLock(true);
  clearBallLock();
  clearChasingState(best);
  ball.lastTouchedBy = best.id;
  ball.lastTouchTeam = best.team;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  if(isGoalkeeper(best)) initGkPossessionType(best, inferGkPossessionSource(best));
  else clearGkPossessionType(best);
  syncHumanTeamControlOnPossession(best);
}

export function clearTeammateInterferenceForTechnicalAction(p){
  clearBallLock();
  for(const mate of allPlayers){
    if(mate.id !== p.id && mate.team === p.team){
      clearChasingState(mate);
      clearForcedChaseState(mate);
      clearPlayerAIState(mate);
    }
  }
  clearPassTargetTeam(p.team);
}

export function interruptPlayerStateForTechnicalAction(p){
  if(!p) return;
  p.tackleAnim = null;
  p.diveAnim = null;
  p.airStrikeAnim = null;
  p.feint = null;
  p.dragBack = null;
  p.dragBackArmed = false;
  p.pendingKick = null;
  p.turnTouch = null;
  clearPendingAction(p);
  clearChargingShotState(p);
  p.wallRun = null;
  p.airLock = null;
  p.iaSeeking = false;
  p.targetPosition = null;
  p.landingTime = 0;
  p.seekAerial = false;
  clearPlayerAIState(p);
  clearPassTargetIfPlayer(p);
}

export function canApplyEffortTouch(p){
  if(!p) return false;
  if(p.releaseCooldown > 0) return false;
  if(isBallLocked() && Game.ballLockOwnerId !== p.id) return false;
  if(ball.owner === p) return true;
  if(isChaseOwner(p)) return true;
  const passTargetId = p.team === 'home' ? Game.passTargetHome : Game.passTargetAway;
  if((passTargetId === p.id || ball.possessedBy === p.id) && ball.lastTouchedBy === p.id && !ball.owner) return true;
  return dist2D(p, ball) < FORCED_CHASE_RECOVER_DIST + 0.15;
}

// estado del stick derecho para detectar "flick" de effort touch (por jugador)
export const effortRsState = {};

function clearEffortTouchPendingTap(st){
  if(st) st.pendingTap = null;
}

function expireEffortTouchPendingTap(st){
  if(!st?.pendingTap) return;
  if(performance.now() - st.pendingTap.time > EFFORT_DOUBLE_TAP_WINDOW_MS){
    st.pendingTap = null;
  }
}

/** 1er toque: registra intencion; 2do toque dentro de 1s: confirma y devuelve el comando. */
function confirmEffortTouchDoubleTap(st, dir, type){
  const now = performance.now();
  expireEffortTouchPendingTap(st);
  const pending = st.pendingTap;
  if(pending && (now - pending.time) <= EFFORT_DOUBLE_TAP_WINDOW_MS){
    clearEffortTouchPendingTap(st);
    return {dir, type};
  }
  st.pendingTap = {time: now, dir: {x: dir.x, y: dir.y}, type};
  return null;
}

export function detectEffortTouchInput(p, input, padIndex, scheme){
  if(input.heldManualCancel){
    const stKey = 'e' + p.id;
    if(effortRsState[stKey]) clearEffortTouchPendingTap(effortRsState[stKey]);
    return null;
  }

  const stKey = 'e' + p.id;
  if(!effortRsState[stKey]) effortRsState[stKey] = {prevMag: 0, pendingTap: null};
  const st = effortRsState[stKey];

  let dir = null;
  let type = null;

  const rs = readRightStick(padIndex);
  const rsMag = rs ? rs.mag : 0;
  const rsFlick = rsMag >= EFFORT_RS_MIN && st.prevMag < EFFORT_RS_MIN;
  st.prevMag = rsMag;

  if(rsFlick && rs && input.heldR1){
    type = 'short';
    dir = {x: rs.x, y: rs.y};
  }

  if(!type && scheme){
    const moveMag = Math.hypot(input.move.x, input.move.y);
    if(moveMag >= 0.35){
      const dirKb = norm(input.move);
      const r1Now = anyKey(scheme.curveLeft);
      const r1Just = r1Now && !anyKeyPrev(scheme.curveLeft);
      if(r1Just){ type = 'short'; dir = dirKb; }
    }
  }

  if(!type || !dir) return null;
  return {dir, type};
}

export function ensurePlayerBallControlForAction(p){
  if(ball.state === BALL_STATE.IN_POSSESSION && ball.owner === p){
    interruptForcedChaseForAction(p);
    return true;
  }
  if(!isChaseOwner(p) && !isPlayerForcedChasing(p)) return false;
  if(ball.state !== BALL_STATE.FREE) return false;
  if(p.releaseCooldown > 0) return false;
  if(dist2D(p, ball) >= FORCED_CHASE_RECOVER_DIST) return false;
  interruptForcedChaseForAction(p);
  return assignBallPossession(p);
}

export function userWantsPossessionAction(input){
  return !!(input.pressPass || input.releasedPass || input.heldPass ||
    input.pressShot || input.releasedShot || input.heldShot ||
    input.pressThrough || input.releasedThrough || input.heldThrough ||
    input.pressCross || input.releasedCross || input.heldCross);
}

// Restaura chasing solo para el autor del effort touch (via evento privado).
export function ensureChasingState(p){
  if(!p) return false;
  if(ball.state === BALL_STATE.IN_POSSESSION && ball.owner === p){
    if(isPlayerChasing(p)) clearChasingState(p);
    return false;
  }
  if(ball.effortDetach && ball.effortDetach.ownerId !== p.id){
    if(isPlayerChasing(p)) clearChasingState(p);
    return false;
  }
  if(isBallFreeForPlayer(p) && isChaseOwner(p)){
    if(ball.lastTouchedBy !== p.id) return isPostTouchChasing(p);
    if(!isPostTouchChasing(p)) startForcedChase(p, ball);
    clearPlayerAIState(p);
    return true;
  }
  return isPostTouchChasing(p) || (isPlayerChasing(p) && !ball.effortDetach);
}

export function tryEnterChasingFromPrivateEvent(p){
  if(!p || !PrivateChaseEvents.listen(p.id)) return false;
  if(ball.lastTouchedBy !== p.id || !isChaseOwner(p)) return false;
  if(!isBallFreeForPlayer(p)) return false;
  if(!isPostTouchChasing(p)) startForcedChase(p, ball);
  return true;
}

export function clearChasingState(p){
  if(!p) return;
  if(isKickoffTaker(p) && isKickoffWaiting()) return;
  if(isPostTouchChasing(p)){
    clearForcedChaseState(p);
    return;
  }
  if(p.state === 'chasing' || p.state === MOVING_TO_BALL){
    p.state = 'idle';
  }
  p.iaSeeking = false;
  p.targetPosition = null;
  p.landingTime = 0;
  p.seekAerial = false;
  clearPlayerLockAssignment(p);
  clearPassTargetIfPlayer(p);
}

/** Pases / filtrados / centros: el pasador no debe auto-perseguir el balón. */
export function isPassReleaseKickType(type){
  return type === 'pass' || type === 'through' || type === 'cross';
}

export function armPassReleaseLock(p, duration = 1.15){
  if(!p) return;
  p.passReleaseLockT = Math.max(p.passReleaseLockT || 0, duration);
}

export function tickPassReleaseLock(p, dt){
  if(!p || !(p.passReleaseLockT > 0)) return;
  p.passReleaseLockT = Math.max(0, p.passReleaseLockT - dt);
}

/** True si este jugador acaba de soltar un pase y aún no debe imantarse al balón. */
export function isRecentPassPasser(p){
  if(!p) return false;
  if((p.passReleaseLockT || 0) > 0) return true;
  if(ball.lastKicker !== p) return false;
  if(!isPassReleaseKickType(ball.lastKickType)) return false;
  // Mientras nadie más toque el esférico, el pasador no lo persigue solo.
  return ball.lastTouchedBy == null || ball.lastTouchedBy === p.id;
}

export function resumeChasingAfterAction(p){
  if(!p || ball.owner === p) return;
  if(ball.owner) return;
  if(ball.state !== BALL_STATE.FREE && ball.state !== BALL_STATE.LOOSE_BALL) return;
  // Tras un pase, no reanudar chase por inercia del estado previo.
  if(isRecentPassPasser(p) || (ball.lastKicker === p && isPassReleaseKickType(ball.lastKickType))){
    return;
  }
  if(isChaseOwner(p) || (ball.feintDetach && ball.feintDetach.ownerId === p.id)){
    startForcedChase(p, ball);
  } else {
    p.state = 'chasing';
    clearPlayerAIState(p);
  }
}

function clampInterceptTarget(pt){
  return {
    x: clamp(pt.x, 0.3, FIELD_L - 0.3),
    y: clamp(pt.y, 0.3, FIELD_W - 0.3),
  };
}

export function createBallSimState(b){
  return {
    x: b.x, y: b.y, z: b.z,
    vx: b.vx, vy: b.vy, vz: b.vz,
    curveFactor: b.curveFactor || 0,
    initialSpeed: b.initialSpeed || Math.hypot(b.vx, b.vy) || 1,
    curveMaxSpeed: b.curveMaxSpeed,
    curveLineOrigin: b.curveLineOrigin,
    curveLineDir: b.curveLineDir,
    curvePassTarget: b.curvePassTarget,
    curveMaxDrift: b.curveMaxDrift,
    highKick: b.highKick,
    highKickType: b.highKickType,
    lastKickType: b.lastKickType,
    groundFrictionMult: b.groundFrictionMult || 1,
    ballDamping: b.ballDamping ?? getModeBallDrag(),
    state: BALL_STATE.FREE,
  };
}

// Avanza un paso de simulacion de pelota (fisica simplificada para prediccion).
export function advanceBallSimState(sim, dt){
  const g = getBallAirGravity(sim);
  sim.vz -= g * dt;
  sim.x += sim.vx * dt;
  sim.y += sim.vy * dt;
  sim.z += sim.vz * dt;

  if(sim.z <= BALL_RADIUS){
    sim.z = BALL_RADIUS;
    if(sim.vz < -0.5){
      sim.vz = -sim.vz * 0.42;
      sim.vx *= 0.78;
      sim.vy *= 0.78;
    } else {
      sim.vz = 0;
    }
    sim.highKick = false;
  }

  applyBallLateralCurve(sim, dt);

  const onGround = sim.z <= BALL_RADIUS + 0.02;
  const sp = Math.hypot(sim.vx, sim.vy);
  const applyRollFriction = shouldApplyRollFriction(sim, onGround);
  if(applyRollFriction){
    if(sp > 0.001){
      const frictionMult = sim.groundFrictionMult || 1;
      const drop = BALL_FRICTION * frictionMult * getBallDragFrictionScaleForBall(sim) * dt;
      const newSp = Math.max(0, sp - drop);
      const scale = newSp / sp;
      sim.vx *= scale;
      sim.vy *= scale;
    }
    if(onGround && sp < 0.02){
      sim.vx = 0;
      sim.vy = 0;
      return false;
    }
  } else {
    applyBallAirHorizontalDrag(sim, dt);
  }
  return true;
}

/** Simula la trayectoria de la pelota y devuelve puntos + destino final. */
export function simulateBallTrajectory(b, maxTime = INTERCEPT_MAX_TIME){
  const sim = createBallSimState(b);
  const points = [{ x: sim.x, y: sim.y, t: 0 }];
  let t = 0;
  while(t < maxTime){
    if(!advanceBallSimState(sim, INTERCEPT_SIM_STEP)) break;
    t += INTERCEPT_SIM_STEP;
    points.push({ x: sim.x, y: sim.y, t });
  }
  const last = points[points.length - 1];
  return { points, destination: { x: last.x, y: last.y }, duration: t };
}

function getChasePlanSpeed(p){
  if(physicsConfig.useUniformSpeed){
    return Math.max(toGameUnits(physicsConfig.maxSpeed ?? TARGET_SPRINT_MPS), 0.1);
  }
  return Math.max(getPlayerMaxSprintVelocity(p), 0.1);
}

// Interseccion predictiva (11vs11): futurePos = ball.position + ball.velocity * timeToReach
function computePredictiveBallInterceptPoint(p, b){
  const playerSp = getChasePlanSpeed(p);
  const d = dist2D(p, b);
  const timeToReach = d / playerSp;
  return clampInterceptTarget({
    x: b.x + b.vx * timeToReach,
    y: b.y + b.vy * timeToReach,
  });
}

// Calcula el punto futuro de intercepcion: simula la trayectoria de la pelota y busca
// el punto donde el jugador puede llegar al mismo tiempo (corte de camino, no persecucion directa).
function computeBallInterceptPoint(p, b){
  const ballSp = Math.hypot(b.vx, b.vy);
  const ballMoving = ballSp > 0.35 || Math.abs(b.vz) > 0.2 || b.z > BALL_AERIAL_MIN_Z;

  if(!ballMoving){
    return {x: b.x, y: b.y};
  }

  if(physicsConfig.usePredictiveIntersection){
    return computePredictiveBallInterceptPoint(p, b);
  }

  const playerSp = Math.max(getChasePlanSpeed(p), 1);

  const sim = createBallSimState(b);
  let t = 0;
  let bestSyncTarget = null;
  let bestSyncScore = Infinity;
  let closestReachable = null;
  let closestReachableDist = Infinity;
  const ballFasterThanPlayer = ballSp > playerSp * 0.9;

  while(t < INTERCEPT_MAX_TIME){
    const stillMoving = advanceBallSimState(sim, INTERCEPT_SIM_STEP);
    t += INTERCEPT_SIM_STEP;

    const distToPlayer = Math.hypot(sim.x - p.x, sim.y - p.y);
    const playerReachT = distToPlayer / playerSp;

    if(playerReachT <= t + INTERCEPT_TIME_TOLERANCE){
      const syncScore = Math.abs(playerReachT - t);

      if(ballFasterThanPlayer){
        if(distToPlayer < closestReachableDist){
          closestReachableDist = distToPlayer;
          closestReachable = {x: sim.x, y: sim.y};
        }
      } else if(syncScore < bestSyncScore){
        bestSyncScore = syncScore;
        bestSyncTarget = {x: sim.x, y: sim.y};
        if(syncScore < 0.06) break;
      }
    }

    if(!stillMoving) break;
  }

  if(ballFasterThanPlayer && closestReachable){
    return clampInterceptTarget(closestReachable);
  }
  if(bestSyncTarget){
    return clampInterceptTarget(bestSyncTarget);
  }

  const d = dist2D(p, b);
  const tReach = d / playerSp;
  return clampInterceptTarget({
    x: b.x + b.vx * tReach,
    y: b.y + b.vy * tReach,
  });
}

// Punto de intercepcion durante chasing (incluye buffer de recepcion / primera).
export function getChaseInterceptTarget(p){
  if(p.actionBuffer?.type && isBallAerialLoose()){
    return getAerialPositionTarget(p, ball);
  }
  if(ball.z > BALL_AERIAL_MIN_Z){
    const land = predictBallLanding(ball);
    if(land && land.aerial && land.t > 0.05){
      return clampInterceptTarget({x: land.x, y: land.y});
    }
  }
  return computeBallInterceptPoint(p, ball);
}

export function reclaimFeintPossession(p){
  if(!p) return false;
  ball.owner = p;
  ball.state = BALL_STATE.IN_POSSESSION;
  ball.feintDetach = null;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.highKick = false;
  ball.highKickType = null;
  dribblingBinding();
  syncHumanTeamControlOnPossession(p);
  return true;
}

export function isGoalkeeper(p){
  return !!(p && p.role === 'GK');
}

export function isGkHandsPossession(p){
  return isGoalkeeper(p) && ball.owner === p && ball.state === BALL_STATE.IN_POSSESSION && p.possessionType === GK_POSSESS_HANDS;
}






export function isGkHandsImmune(p){
  return isGkHandsPossession(p);
}

export function isGkBallCollidable(p){
  return isGoalkeeper(p) && p.gkBallCollidable !== false;
}

export function getGoalkeeperForTeam(team){
  return allPlayers.find(pl => pl.role === 'GK' && pl.team === team) || null;
}

export function getDefendingGoalkeeperForFrame(frame){
  return getGoalkeeperForTeam(defendingTeamForGoalLine(frame.side));
}

export function isGkKickInProgress(p){
  return !!(p && p.gkKickAnim);
}

export function isGkFeetPossession(p){
  return isGoalkeeper(p) && ball.owner === p && ball.state === BALL_STATE.IN_POSSESSION && p.possessionType === GK_POSSESS_FEET;
}

export function clearGkPossessionType(p){
  if(!p) return;
  p.possessionType = null;
  p.gkFeetPossessT = 0;
  p.handsTimer = 0;
  if(isGoalkeeper(p)) p.gkBallCollidable = true;
}

export function startGkHandsTimer(p){
  if(!isGoalkeeper(p)) return;
  p.handsTimer = GK_AUTO_DISTRIBUTE.TIME_MS;
}

export function clearGkHandsTimer(p){
  if(!p) return;
  p.handsTimer = 0;
}

/** Reinicia el contador de auto-saque (manos en juego o saque de arco parado). */
export function resetGkAutoDistributeTimer(p){
  if(!p || !isGoalkeeper(p)) return;
  if(isGkHandsPossession(p) && !p.gkKickAnim) startGkHandsTimer(p);
  if(isSetPieceAwaitingExecution(p) && Game.setPiece?.type === SET_PIECE.GOAL_KICK){
    SetPieceManager.timer = getSetPieceTimerDuration(SET_PIECE.GOAL_KICK);
  }
}

/** Compañero desmarcado más cercano o saque largo al mediocampo. */
export function resolveGkAutoDistribution(gk){
  if(!gk) return { type: 'long', dir: { x: gk.attackDir(), y: 0 }, power: 0.62 };
  syncPlayerDir(gk);

  const mates = (gk.team === 'home' ? homeTeam : awayTeam)
    .filter(m => m.id !== gk.id && m.role !== 'GK');

  let bestNear = null;
  let bestNearScore = -Infinity;
  for(const m of mates){
    const d = dist2D(gk, m);
    if(d > GK_AUTO_DISTRIBUTE.NEAR_TEAMMATE_MAX) continue;
    let openness = Infinity;
    for(const opp of allPlayers){
      if(opp.team === gk.team) continue;
      openness = Math.min(openness, dist2D(opp, m));
    }
    if(openness < GK_AUTO_DISTRIBUTE.OPENNESS_MIN) continue;
    const forwardProgress = (m.x - gk.x) * gk.attackDir();
    const score = openness * 1.5 + forwardProgress * 0.45 - d * 0.12;
    if(score > bestNearScore){
      bestNearScore = score;
      bestNear = m;
    }
  }

  if(bestNear){
    const dir = norm({ x: bestNear.x - gk.x, y: bestNear.y - gk.y });
    return { type: 'short', dir, power: 0.42 };
  }

  const attackDir = gk.attackDir();
  const midX = clamp(gk.x + attackDir * FIELD_L * 0.38, 4, FIELD_L - 4);
  const midY = CENTER.y + (Math.random() - 0.5) * 10;
  const dir = norm({ x: midX - gk.x, y: midY - gk.y });
  return { type: 'long', dir, power: 0.62 };
}

export function getGkClearanceDirection(gk){
  syncPlayerDir(gk);
  let dir = {x: Math.cos(gk.facing), y: Math.sin(gk.facing)};
  if(Math.hypot(dir.x, dir.y) < 0.2) dir = {x: gk.attackDir(), y: 0};
  if(dir.x * gk.attackDir() < 0) dir = {x: gk.attackDir(), y: dir.y * 0.35};
  return norm(dir);
}

export function forceGoalkeeperClearance(gk){
  if(!gk || !isGkHandsPossession(gk) || gk.gkKickAnim) return false;
  clearGkHandsTimer(gk);
  const plan = resolveGkAutoDistribution(gk);
  const kickType = plan.type === 'long' ? 'dropkick' : 'throw';
  return triggerGoalkeeperKick(gk, kickType, plan.dir, plan.power);
}

export function updateGkHandsTimer(dt){
  for(const p of allPlayers){
    if(!isGkHandsPossession(p) || p.gkKickAnim) continue;
    if(p.handsTimer > 0) p.handsTimer -= dt * 1000;
    if(p.handsTimer <= 0) forceGoalkeeperClearance(p);
  }
}

export function inferGkPossessionSource(p){
  const prevTouchId = ball.lastTouchedBy;
  const prevTouchTeam = ball.lastTouchTeam;
  if(prevTouchTeam === p.team && prevTouchId && prevTouchId !== p.id){
    const toucher = allPlayers.find(pl => pl.id === prevTouchId);
    if(toucher && toucher.team === p.team) return 'pass';
  }
  if(ball.lastKicker && ball.lastKicker.team === p.team && ball.lastKicker.id !== p.id && prevTouchTeam === p.team){
    return 'pass';
  }
  return 'loose';
}

export function initGkPossessionType(p, source){
  if(!isGoalkeeper(p)) return;
  if(ball.isReadyToKick || isGoalKickReadyState()) return;
  const src = source || inferGkPossessionSource(p);
  if(src === 'save'){
    p.possessionType = GK_POSSESS_HANDS;
    startGkHandsTimer(p);
  } else {
    p.possessionType = src === 'pass' ? GK_POSSESS_FEET : GK_POSSESS_HANDS;
    if(p.possessionType === GK_POSSESS_HANDS) startGkHandsTimer(p);
  }
  p.gkFeetPossessT = 0;
  p.gkBallCollidable = true;
}

/**
 * Tras atrapar en juego vivo: mantener posesión en manos y anular saque de arco estático.
 * El arquero reanuda con saque de mano / volea desde su posición actual.
 */
export function keepLiveGkCatchPossession(gk){
  if(!gk || !isGoalkeeper(gk)) return;

  // Cancelar cualquier transición a saque de arco / balón muerto provocada por la captura.
  if(Game.setPieceMode && Game.setPiece?.type === SET_PIECE.GOAL_KICK){
    setSetPieceMode(false);
  }
  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;
  Game.isBallInPlay = true;
  ball.isReadyToKick = false;
  if(ball.state === BALL_STATE.DEAD_BALL || ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL || ball.state === BALL_STATE.PLACED){
    ball.state = BALL_STATE.IN_POSSESSION;
  }

  ball.owner = gk;
  ball.state = BALL_STATE.IN_POSSESSION;
  ball.lastTouchTeam = gk.team;
  ball.lastTouchedBy = gk.id;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.highKick = false;
  ball.highKickType = null;

  // Mantener al arquero dentro del campo (delante de su línea de meta), no en la red.
  const goalX = gk.ownGoalX();
  const dir = gk.attackDir();
  const minDepth = 0.55;
  const depth = (gk.x - goalX) * dir;
  if(depth < minDepth){
    gk.x = goalX + dir * minDepth;
  }
  gk.x = clamp(gk.x, 0.35, FIELD_L - 0.35);
  gk.y = clamp(gk.y, 0.35, FIELD_W - 0.35);
  gk.vx = 0;
  gk.vy = 0;
  gk.canMove = true;
  gk.isStuck = false;
  gk.inSetPieceZone = false;
  gk.blockDribbling = false;
  gk.diveAnim = null;
  gk.gkBallCollidable = true;

  if(gk.possessionType !== GK_POSSESS_HANDS){
    gk.possessionType = GK_POSSESS_HANDS;
    startGkHandsTimer(gk);
  } else if(!(gk.handsTimer > 0)){
    startGkHandsTimer(gk);
  }

  gkHandsBinding(gk);
  // Si el binding dejó la pelota fuera, empujarla al campo.
  const fbMinX = 0.2;
  const fbMaxX = FIELD_L - 0.2;
  ball.x = clamp(ball.x, fbMinX, fbMaxX);
  ball.y = clamp(ball.y, 0.2, FIELD_W - 0.2);
  const ballDepth = (ball.x - goalX) * dir;
  if(ballDepth < 0.35){
    ball.x = goalX + dir * 0.35;
  }

  syncHumanTeamControlOnPossession(gk);
}

export function updateGkPossessionTransitions(dt){
  if(isGoalKickReadyState()) return;
  const p = ball.owner;
  if(!isGkFeetPossession(p)) return;
  p.gkFeetPossessT += dt;
  if(p.gkFeetPossessT >= GK_FEET_TO_HANDS_T){
    p.possessionType = GK_POSSESS_HANDS;
    p.gkFeetPossessT = 0;
    startGkHandsTimer(p);
  }
}

export function getPlayerMoveSpeedBase(p){
  if(isGkFeetPossession(p)) return toGameUnits(physicsConfig.gkFieldMaxSpeed ?? GK_FIELD_MAX_SPEED);
  if(physicsConfig.useUniformSpeed) return p.maxSpeedBase ?? toGameUnits(physicsConfig.maxSpeed);
  return p.maxSpeedBase ?? toGameUnits(getDefaultMaxSpeedForRole(p.role));
}

export function getPlayerMaxSprintVelocity(p){
  const base = getPlayerMoveSpeedBase(p);
  const mult = physicsConfig.sprintMult ?? DEFAULT_SPRINT_MULT;
  return base * mult;
}

/** Tope físico absoluto del perfil — filtro de seguridad final (nunca superar sprint del rol). */
export function getPlayerAbsoluteMaxVelocity(p){
  if(!p) return 0;
  if(isGkFeetPossession(p)){
    return toGameUnits(physicsConfig.gkFieldMaxSpeed ?? GK_FIELD_MAX_SPEED);
  }
  if(physicsConfig.useUniformSpeed){
    let cap = toGameUnits(physicsConfig.maxSpeed ?? TARGET_SPRINT_MPS);
    if(isGkHandsPossession(p)) cap *= 0.68;
    return cap;
  }
  return getPlayerMaxSprintVelocity(p);
}

export function updatePlayerJumpZ(p){
  const a = p.airStrikeAnim;
  if(!a || a.type !== 'header'){
    if(!p.diveAnim) p.z = 0;
    return;
  }
  const dur = Math.max(a.dur, 0.001);
  const prog = clamp(a.t / dur, 0, 1);
  p.z = Math.sin(prog * Math.PI) * physicsConfig.maxJumpHeight;
}

export function beginEffortTouchExitBlend(p, moveDir){
  if(!p) return;
  const sp = Math.hypot(p.vx, p.vy);
  if(sp < 0.45) return;
  p.effortExitBlendT = EFFORT_EXIT_VEL_BLEND;
  if(moveDir && Math.hypot(moveDir.x, moveDir.y) > 0.05){
    const m = Math.hypot(moveDir.x, moveDir.y);
    p.effortExitMoveDir = {x: moveDir.x / m, y: moveDir.y / m};
  } else {
    p.effortExitMoveDir = {x: p.vx / sp, y: p.vy / sp};
  }
}

export function applyEffortExitVelocityBlend(p, dt, moveDir, moveMag, maxSpeed){
  if(!p || p.effortExitBlendT <= 0) return false;
  p.effortExitBlendT = Math.max(0, p.effortExitBlendT - dt);
  let targetVX = 0, targetVY = 0;
  if(moveMag > 0.05){
    targetVX = (moveDir.x / moveMag) * maxSpeed;
    targetVY = (moveDir.y / moveMag) * maxSpeed;
  }
  const blendT = clamp(dt * 14, 0, 1);
  p.vx = lerp(p.vx, targetVX, blendT);
  p.vy = lerp(p.vy, targetVY, blendT);
  const cap = maxSpeed > 0 ? Math.min(maxSpeed, getPlayerAbsoluteMaxVelocity(p)) : getPlayerAbsoluteMaxVelocity(p);
  const sp = Math.hypot(p.vx, p.vy);
  if(sp > cap + 1e-5 && sp > 0.001){
    const s = cap / sp;
    p.vx *= s;
    p.vy *= s;
  }
  if(p.effortExitBlendT <= 0) p.effortExitMoveDir = null;
  return true;
}

export function getEffortBoundPlayer(){
  if(!ball.effortDetach || ball.lastAction !== 'effort' || ball.owner !== null) return null;
  if(ball.state !== BALL_STATE.FREE) return null;
  return getEffortChaseOwner();
}

export function isEffortBallBoundToPlayer(p){
  const owner = getEffortBoundPlayer();
  return !!(owner && p && owner.id === p.id);
}

export function isEffortTouchPendingReclaim(){
  return !!(ball.possessedBy && ball.owner === null &&
    ball.state === BALL_STATE.FREE);
}

export function isEffortTouchR1Active(p){
  return false;
}

export function finalizeEffortTouchR2(p){
  return false;
}

export function shouldAutoReclaimEffortTouchR2(p){
  return false;
}

export function updateEffortTouchR2Transition(p, dt){
  return false;
}

export function recoverEffortTouchPossession(p){
  return false;
}

export function isEffortRecoveryChase(p){
  return false;
}

export function clearEffortSprintState(p, moveDir){
  if(!p) return;
  beginEffortTouchExitBlend(p, moveDir);
  p.isEffortSprinting = false;
  p.isEffortTouching = false;
  p.maxSprintVelocity = 0;
  p.maxVelocity = 0;
  p.effortSprintDir = null;
  p.effortChaseTarget = null;
  syncTechnicallyBusy(p);
}

export function isFakeShotRecoveryChase(p){
  return !!(p && p.fakeShotChaseLockT > 0 && ball.owner === null &&
    ball.feintDetach && ball.feintDetach.ownerId === p.id);
}

export function isFakeShotLooseChase(p){
  return !!(p && isFakeShotActive && p.id === fakeShotOwnerId &&
    ball.owner === null && ball.feintDetach && ball.feintDetach.ownerId === p.id);
}

export function recoverFakeShotPossession(p){
  if(!p || ball.owner !== null) return false;
  if(!ball.feintDetach || ball.feintDetach.ownerId !== p.id) return false;
  if(p.fakeShotCooldown > 0) return false;
  if(dist2D(p, ball) >= CHASE_POSSESS_DIST) return false;

  ball.owner = p;
  ball.state = BALL_STATE.IN_POSSESSION;
  ball.lastAction = null;
  ball.feintDetach = null;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  clearForcedChaseState(p);
  clearEffortSprintState(p);
  p.fakeShotChaseLockT = 0;
  p.effortChaseTarget = null;
  if(!p.isStunned && !p.stun) p.canCollectBall = true;
  const defDist = getDefaultDribbleDistance(p);
  p.currentDribbleDistance = defDist;
  p.targetDribbleDistance = defDist;
  p.dribbleKickDir = null;
  p.dribbleExtendT = 0;
  bindDribbleBallPosition(p);
  completeFakeShot(p);
  syncHumanTeamControlOnPossession(p);
  return true;
}

// Pausa la persecucion de pelota de un defensor CPU durante un effort touch rival.
export function stopDefenderTrackingFor(p, duration){
  if(!p || duration <= 0) return;
  if(p.effortTouchDefenderFreezeT >= duration) return;
  p.effortTouchDefenderFreezeT = duration;
  p.vx = 0;
  p.vy = 0;
  p.sprinting = false;
  p.accelRampDist = 0;
  p.isAttackingBall = false;
  p.iaSeeking = false;
  p.iaSeekingBrake = false;
  p.targetPosition = null;
  clearChasingState(p);
  clearForcedChaseState(p);
  if(p.aiMode === 'seeking') p.aiMode = 'positioning';
}

// Freeze momentaneo de defensores CPU ante la proyeccion del offset (evita falsa intercepcion).
export function applyEffortTouchDefenderFreeze(owner, offsetDist, dir){
  if(!owner || !dir) return;
  const projX = owner.x + dir.x * offsetDist;
  const projY = owner.y + dir.y * offsetDist;
  const freezeRange = offsetDist + 1.2;
  const freezeDuration = Math.max(EFFORT_AI_FREEZE_DURATION, EFFORT_TOUCH_ANIM_SHORT + 0.12);
  for(const p of allPlayers){
    if(!isCpuPlayer || !isCpuPlayer(p) || p.team === owner.team) continue;
    const dProj = Math.hypot(p.x - projX, p.y - projY);
    const dOwner = dist2D(p, owner);
    if(Math.min(dProj, dOwner) > freezeRange) continue;
    stopDefenderTrackingFor(p, freezeDuration);
    enforceCpuNoCarrierChase(p, owner);
  }
}

export function updateEffortTouchDefenderFreeze(dt){
  for(const p of allPlayers){
    if(p.effortTouchDefenderFreezeT <= 0) continue;
    p.effortTouchDefenderFreezeT = Math.max(0, p.effortTouchDefenderFreezeT - dt);
    p.vx = 0;
    p.vy = 0;
    p.sprinting = false;
  }
}

export function isEffortTouchDefenderFrozen(p){
  return !!(p && p.effortTouchDefenderFreezeT > 0);
}

export function gkHandsBinding(p){
  syncPlayerDir(p);
  const f = p.facing;
  const off = GK_HANDS_BALL_OFFSET;
  ball.x = p.x + off.forward * Math.cos(f) - off.side * Math.sin(f);
  ball.y = p.y + off.forward * Math.sin(f) + off.side * Math.cos(f);
  ball.z = lerp(ball.z, off.z, 0.35);
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
}

export function assignBallPossession(p, possessSource){
  if(isBallLocked() && (!p || p.id !== Game.ballLockOwnerId)) return false;
  return setBallStateInPossession(p, possessSource);
}

export function setBallStateInPossession(p, possessSource){
  if(!p || p.releaseCooldown > 0) return false;
  if(isOnBallContactBlocked(p)) return false;
  if(isThrowInTakerBlocked(p)) return false;
  if(isPossessionIgnored()) return false;
  if(ball.isReadyToKick && isGoalkeeper(p)) return false;
  if(isGoalKickReadyState() && isGoalkeeper(p)) return false;
  if(isBallLocked() && p.id !== Game.ballLockOwnerId) return false;
  // Posesión propia: rango estricto. Reclamación suelta / anticipación: radio real (jockey +25%).
  if(ball.owner === p){
    if(!playerInStrictControlRange(p)) return false;
  } else if(!playerInControlRange(p)){
    return false;
  }
  if(ball.owner && ball.owner !== p && !canTakeBallFromOwner(p, ball.owner)) return false;

  // First-touch: golpear ANTES de atrapar/frenar la pelota (pase raso, volea, cabezazo).
  if(typeof tryImmediateFirstTouch === 'function' && tryImmediateFirstTouch(p)){
    return false;
  }
  // Paridad 6v6: con acción armada y balón aéreo, no atrapar — dejar volea/cabeza/chilena.
  {
    const buf = p.actionBuffer;
    if(buf && buf.type && !buf.chargeStart && (ball.z ?? 0) >= AIR_VOLLEY_MIN_Z){
      return false;
    }
  }

  if(ball.owner && ball.owner !== p) clearGkPossessionType(ball.owner);
  const prevOwner = ball.owner;
  const reclaimingLock = isBallLocked() && p.id === Game.ballLockOwnerId;
  ball.owner = p;
  ball.state = BALL_STATE.IN_POSSESSION;
  notifyManualRunPossessionChange(p, prevOwner);
  if(isGoalkeeper(p)) initGkPossessionType(p, possessSource);
  else clearGkPossessionType(p);
  Game.deadBall = null;
  clearEffortChaseLock(true);
  clearOtherSprintChaseStates(p);
  if(reclaimingLock) clearBallLock();
  ball.lastTouchedBy = p.id;
  ball.lastAction = null;
  if(ball.possessedBy === p.id) ball.possessedBy = null;
  clearThrowInBlockIfOtherPlayer(p);
  clearChasingState(p);
  clearSprintChaseState(p);
  clearInterceptionSeek(p);
  if(isFakeShotActive && p.id === fakeShotOwnerId) completeFakeShot(p);
  const defDist = getDefaultDribbleDistance(p);
  p.currentDribbleDistance = defDist;
  p.targetDribbleDistance = defDist;
  p.dribbleKickDir = null;
  p.dribbleExtendT = 0;
  clearEffortSprintState(p);
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.highKick = false;
  ball.highKickType = null;
  notifyRestartBallTouchedByOther(p);
  syncHumanTeamControlOnPossession(p);
  return true;
}

// Unica fuente valida de posicion mientras la pelota esta en conduccion (pegada al pie o en manos del arquero).
export function dribblingBinding(){
  if(isBindingSuspended()) return;
  if(ball.lastAction === 'feint') return;
  if(ball.lastAction === 'effort' && !ball.owner) return;
  if(ball.state !== BALL_STATE.IN_POSSESSION) return;
  const p = ball.owner;
  if(!p || p.possessionType === GK_POSSESS_FREE){
    setBallStateLoose(false);
    return;
  }
  if(isKickoffWaiting() && isKickoffTaker(p)){
    ball.x = CENTER.x;
    ball.y = CENTER.y;
    ball.z = BALL_RADIUS;
    bindDribbleBallPosition(p);
    return;
  }
  if(isBallLocked() && Game.ballLockOwnerId === p.id){
    ball.state = BALL_STATE.IN_POSSESSION;
    ball.owner = p;
    updateDribbleDistance(p, lastDt || 0.016);
    bindDribbleBallPosition(p);
    return;
  }
  if(!playerInStrictControlRange(p) && !p.isEffortSprinting && ball.lastAction !== 'effort' && ball.lastAction !== 'feint'){
    setBallStateLoose(false);
    return;
  }
  if(isGkHandsPossession(p)){
    gkHandsBinding(p);
    return;
  }
  updateDribbleDistance(p, lastDt || 0.016);
  bindDribbleBallPosition(p);
}

export function bindBallToOwner(){
  dribblingBinding();
}

export function updateBallPosition(ballRef, p){
  if(ball.state === BALL_STATE.FREE && ball.lastAction === 'effort' && !ball.owner) return;
  dribblingBinding();
}

export function isScoredGoalSequenceActive(){
  return !!(Game.isGoalScored || gameState === 'celebration_run');
}

export function shouldApplyScoredGoalNetPhysics(b){
  if(!isScoredGoalSequenceActive()) return false;
  const side = getGoalNetSide(b);
  if(!side) return false;
  if(!Game.goalZonePassed || !Game.goalZonePassed[side]) return false;
  return isBallInsideGoalVolume(b, side);
}

export function applyScoredGoalNetPhysics(b, dt){
  if(!shouldApplyScoredGoalNetPhysics(b)) return;
  b.vx *= GOAL_NET_ABSORB_MULT;
  b.vy *= GOAL_NET_ABSORB_MULT;
  b.goalNetGravityActive = true;
  b.isInsideGoalTrigger = true;
  b.isTouchingNet = true;
  b.gravity = GOAL_NET_GRAVITY;
  if(b.z <= BALL_RADIUS + 0.03){
    b.vx *= Math.max(0, 1 - GOAL_NET_GROUND_FRICTION * dt);
    b.vy *= Math.max(0, 1 - GOAL_NET_GROUND_FRICTION * dt);
  }
}

export function resolveGoalNetBoundaries(b){
  if(!shouldApplyScoredGoalNetPhysics(b)) return;
  const side = getGoalNetSide(b);
  if(!side) return;
  if(!GOAL_FRAMES || !GOAL_FRAMES.length) return;
  const frame = GOAL_FRAMES.find(f => f.side === side);
  if(!frame) return;
  const r = BALL_RADIUS;
  const { inward, backX, yNear, yFar } = frame;

  if(b.y - r < yNear){
    b.y = yNear + r;
    if(b.vy < 0) b.vy = -b.vy * GOAL_POST_BOUNCE;
  } else if(b.y + r > yFar){
    b.y = yFar - r;
    if(b.vy > 0) b.vy = -b.vy * GOAL_POST_BOUNCE;
  }

  if(inward < 0){
    if(b.x - r < backX){
      b.x = backX + r;
      if(b.vx < 0){
        b.vx = -b.vx * GOAL_POST_BOUNCE;
        b.backNetContactT = 0.15;
      }
    }
  } else if(b.x + r > backX){
    b.x = backX - r;
    if(b.vx > 0){
      b.vx = -b.vx * GOAL_POST_BOUNCE;
      b.backNetContactT = 0.15;
    }
  }

  if(b.z + r > CROSSBAR_Z){
    b.z = CROSSBAR_Z - r;
    if(b.vz > 0) b.vz = -b.vz * GOAL_POST_BOUNCE;
  }
}

// Fisica global: solo aplica cuando ball.state === 'free' | 'loose_ball' | 'waiting_for_retrieval', o durante goalRoll.
export function applyBallPhysics(b, dt){
  if(shouldSkipBallPhysics(b)) return;
  updateGoalNetTriggerPhysics(b, dt);
  applyScoredGoalNetPhysics(b, dt);
  if(b.backNetContactT > 0) b.backNetContactT = Math.max(0, b.backNetContactT - dt);
  const scoredNet = shouldApplyScoredGoalNetPhysics(b);
  const useGoalNetGravity = !!(b.goalNetGravityActive && b.isInsideGoalTrigger);
  const g = useGoalNetGravity
    ? (b.gravity || GOAL_NET_GRAVITY)
    : getBallAirGravity(b);
  b.vz -= g*dt;
  if(useGoalNetGravity && !scoredNet && b.vz > GOAL_NET_FALL_VZ * 0.5) b.vz = GOAL_NET_FALL_VZ * 0.5;
  b.x += b.vx*dt;
  b.y += b.vy*dt;
  b.z += b.vz*dt;
  resolveGoalNetBoundaries(b);
  if(b.z <= BALL_RADIUS){
    if(b.state === BALL_STATE.IN_AIR){
      b.state = BALL_STATE.FREE;
    }
    if(b.gkKickInAir){
      finalizeGoalkeeperKickLanding(b);
    }
    b.z = BALL_RADIUS;
    if(scoredNet){
      if(b.vz < -0.35){
        b.vz = -b.vz * GOAL_NET_GROUND_RESTITUTION;
      } else {
        b.vz = 0;
      }
      b.vx *= Math.max(0, 1 - GOAL_NET_GROUND_FRICTION * dt);
      b.vy *= Math.max(0, 1 - GOAL_NET_GROUND_FRICTION * dt);
    } else if(useGoalNetGravity && b.isInsideGoalTrigger){
      b.vz = 0;
      b.vx *= 0.84;
      b.vy *= 0.84;
    } else if(b.vz < -0.5){
      b.vz = -b.vz*0.42;
      b.vx *= 0.78; b.vy *= 0.78;
    } else { b.vz = 0; }
    b.highKick = false;
    const landSp = Math.hypot(b.vx, b.vy);
    if(landSp > 0.01) b.initialSpeed = landSp;
    if(scoredNet && landSp < 0.08){
      b.vx = 0;
      b.vy = 0;
    }
  }
  applyBallLateralCurve(b, dt);
  const onGround = b.z <= BALL_RADIUS+0.02;
  const sp = Math.hypot(b.vx, b.vy);
  const applyRollFriction = shouldApplyRollFriction(b, onGround);
  if(applyRollFriction){
    if(onGround && sp < CURVE_CUT_MIN_SPEED) b.curveFactor = 0;
    if(sp>0.001){
      let frictionMult = b.groundFrictionMult||1;
      const effortRoll = !!(b.effortDetach || b.feintDetach);
      if(b.effortRollSoftT > 0){
        b.effortRollSoftT = Math.max(0, b.effortRollSoftT - dt);
        frictionMult *= EFFORT_ROLL_SOFT_FRICTION_MULT;
      }
      if(onGround && !effortRoll && sp < CURVE_LOW_SPEED_FRICTION) frictionMult *= CURVE_LOW_SPEED_FRICTION_BOOST;
      if(onGround){
        frictionMult *= getGoalNetFrictionMult(b);
        frictionMult *= getGoalAreaFrictionMult(b);
        frictionMult *= getOutZoneFrictionMult(b);
      }
      const drop = BALL_FRICTION*frictionMult*getBallDragFrictionScaleForBall(b)*dt;
      const newSp = Math.max(0, sp-drop);
      const scale = newSp/sp;
      b.vx *= scale; b.vy *= scale;
    }
    if(onGround && sp<0.02){ b.vx=0; b.vy=0; b.curveFactor=0; clearCurvePassTracking(b); }
  } else {
    const netDrag = getGoalNetFrictionMult(b);
    if(netDrag > 1){
      const netSlow = 1/(1+(netDrag-1)*0.18*dt);
      b.vx *= netSlow; b.vy *= netSlow;
    }
    applyBallAirHorizontalDrag(b, dt);
  }
  b.rollAngle += Math.hypot(b.vx, b.vy)*dt*2.2;
  // Sin clamp de limites: OutZone/BoundaryWalls en checkGoalsAndBounds + resolveBoundaryWallCollisions.
}

export function updateBallLoop(dt){
  if(ball.state === BALL_STATE.IN_HAND){
    const thrower = getPlayerById(ball.throwInOwnerId);
    if(thrower) bindThrowInBall(thrower);
    return;
  }
  if(ball.state === BALL_STATE.OUT_OF_BOUNDS) return;
  if(ball.state === BALL_STATE.PLACED){
    maintainGoalKickPlacement();
    return;
  }
  if(ball.state === BALL_STATE.IN_POSSESSION){
    dribblingBinding();
    return;
  }
  if(ball.state === BALL_STATE.DEAD_BALL && !Game.goalRoll) return;
  if(ball.state === BALL_STATE.GOAL_CELEBRATION && !Game.goalRoll) return;
  if(ball.state === BALL_STATE.WAITING_FOR_RETRIEVAL || isBallOutOfPlay()){
    applyBallPhysics(ball, dt);
    updateEffortChaseBlock(dt);
    updateBallLock(dt);
    return;
  }
  applyBallPhysics(ball, dt);
  updateEffortChaseBlock(dt);
  updateBallLock(dt);
  ensureGkKickBallPlayable(ball);
}

// --- Post-saque de arquero: listener de aterrizaje + habilitacion global de posesion ---
export const GkKickLandingListener = {
  active: false,
  gkId: null,
  start(gkId){
    this.active = true;
    this.gkId = gkId;
  },
  stop(){
    this.active = false;
    this.gkId = null;
  },
  tick(b){
    if(!this.active) return;
    if(b.lastAction !== 'goalkeeper_kick' && !b.gkKickInAir){
      this.stop();
      return;
    }
    if(b.z <= GK_KICK_GROUND_Z && b.vz <= 0){
      finalizeGoalkeeperKickLanding(b);
      this.stop();
    }
  },
};

export function enablePlayableBallAfterGkKick(gkId){
  ball.ignorePossessionT = 0;
  for(const p of allPlayers){
    if(p.canCollectBlockT <= 0 && !isPlayerStunned(p) && !p.stun) p.canCollectBall = true;
    if(p.state === 'waiting') p.state = 'idle';
    if(p.airLock && p.airLock.t >= p.airLock.dur) p.airLock = null;
    if(p.id === gkId && p.gkKickAnim && p.gkKickAnim.t >= p.gkKickAnim.dur) p.gkKickAnim = null;
  }
}

export function finalizeGoalkeeperKickLanding(b){
  if(!b.gkKickInAir && b.lastAction !== 'goalkeeper_kick') return;
  b.state = BALL_STATE.FREE;
  b.gkKickInAir = false;
  b.lastAction = null;
  b.ignorePossessionT = 0;
  enablePlayableBallAfterGkKick(b.gkKickOwnerId);
  b.gkKickOwnerId = null;
  GkKickLandingListener.stop();
}

export function ensureGkKickBallPlayable(b){
  if(!b.gkKickInAir && b.lastAction !== 'goalkeeper_kick') return;
  // Chequeo de seguridad (equivalente a in_air + isFalling + altura <= suelo)
  if(b.z <= GK_KICK_GROUND_Z && b.vz <= 0){
    finalizeGoalkeeperKickLanding(b);
    return;
  }
  GkKickLandingListener.tick(b);
}

/* ============================================================
   SAQUES DE BANDA — fisica manual, animacion exclusiva, posesion restringida
   ============================================================ */
export function throwInFacingForSide(side){
  // top (y≈0) mira hacia +Y; bottom (y≈FIELD_W) mira hacia −Y — siempre hacia el campo.
  return side === 'top' ? Math.PI / 2 : -Math.PI / 2;
}

/** Vector unitario hacia el interior del campo desde la banda del saque. */
export function throwInInwardDir(side, team = null){
  const inwardY = side === 'top' ? 1 : -1;
  const attackX = team === 'away' ? -0.28 : team === 'home' ? 0.28 : 0;
  return norm({ x: attackX, y: inwardY });
}

export function bindThrowInBall(p){
  if(!p || ball.state !== BALL_STATE.IN_HAND) return;
  syncPlayerDir(p);
  const f = p.facing;
  ball.x = p.x + 0.18 * Math.cos(f);
  ball.y = p.y + 0.18 * Math.sin(f);
  ball.z = THROW_IN_HAND_Z;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
}

export function setupThrowIn(db){
  clearAirSpamUiState();
  setSetPieceMode(false);
  Game.deadBall = null;
  Game.isDeadBall = false;
  Game.outOfPlay = null;

  const pos = getSetPieceBallPosition(db);
  ball.x = pos.x;
  ball.y = pos.y;
  ball.z = THROW_IN_HAND_Z;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.highKick = false;
  ball.highKickType = null;
  ball.passOrigin = null;
  ball.owner = null;
  ball.state = BALL_STATE.OUT_OF_BOUNDS;
  ball.throwInOwnerId = null;
  ball.throwInBlockOwnerId = null;

  Game.throwIn = { active: true, team: db.team, side: db.side, x: pos.x, y: pos.y, suggestRuns: true };

  const squad = db.team === 'home' ? homeTeam : awayTeam;
  const taker = squad.reduce((a, b) => dist2D(a, pos) < dist2D(b, pos) ? a : b);
  // Instantáneo en la banda: listo para el saque manual.
  positionSetPieceTaker(taker, db, pos);
  taker.isThrowingIn = true;
  taker.throwInAnim = null;
  taker.vx = 0;
  taker.vy = 0;
  taker.canMove = false;
  taker.isStuck = true;
  if(db.team === 'home') setControlled(taker);
  else setControlled2(taker);
  ball.lastTouchTeam = db.team;

  ball.state = BALL_STATE.IN_HAND;
  ball.throwInOwnerId = taker.id;
  bindThrowInBall(taker);
  setSetPieceMode(true, {
    type: SET_PIECE.THROW_IN,
    team: db.team,
    side: db.side,
    takerId: taker.id,
    x: pos.x,
    y: pos.y,
  });
  // Reafirmar tras setSetPieceMode.
  positionSetPieceTaker(taker, db, pos);
  taker.isThrowingIn = true;
  taker.canMove = false;
  taker.isStuck = true;
  bindThrowInBall(taker);
  Game.isBallInPlay = false;
}

export function tryEnterThrowInPosition(p){
  if(!Game.throwIn?.active || p.isThrowingIn || ball.state !== BALL_STATE.OUT_OF_BOUNDS) return false;
  if(p.team !== Game.throwIn.team || !isControlledByHuman(p)) return false;
  const ti = Game.throwIn;
  if(Math.hypot(p.x - ti.x, p.y - ti.y) > THROW_IN_APPROACH_DIST) return false;

  p.isThrowingIn = true;
  p.x = ti.x;
  p.y = ti.y;
  p.vx = 0;
  p.vy = 0;
  p.facing = throwInFacingForSide(ti.side);
  syncPlayerDir(p);

  ball.state = BALL_STATE.IN_HAND;
  ball.owner = null;
  ball.throwInOwnerId = p.id;
  bindThrowInBall(p);
  setSetPieceMode(true, {type: SET_PIECE.THROW_IN, team: ti.team, side: ti.side, takerId: p.id});
  return true;
}

export function applyThrowInImpulse(p, anim){
  ball.state = BALL_STATE.IN_AIR;
  ball.owner = null;
  ball.throwInBlockOwnerId = p.id;
  ball.throwInOwnerId = null;
  ball.lastTouchTeam = p.team;
  ball.lastTouchedBy = p.id;
  ball.lastKicker = p;
  ball.passOrigin = null;
  clearPassTargetTeam(p.team);

  const dir = anim.dir;
  const force = anim.force * getModePowerMultiplier();
  ball.x = p.x + dir.x * 0.32;
  ball.y = p.y + dir.y * 0.32;
  ball.z = THROW_IN_HAND_Z;
  ball.vx = dir.x * force;
  ball.vy = dir.y * force;
  ball.vz = force * 0.14;
  ball.initialSpeed = force;
  ball.curveFactor = 0;
  ball.groundFrictionMult = 1;
  ball.highKick = false;
  ball.highKickType = null;

  p.isThrowingIn = false;
  p.releaseCooldown = 0.35;
  registerRestartKick(p);
  Game.throwIn = null;
  onSetPieceBallReleased();
}

export function updateThrowInAnim(p, dt){
  const anim = p.throwInAnim;
  if(!anim) return false;
  anim.t += dt;

  if(anim.phase === 'windback'){
    if(anim.t >= anim.windDur){
      anim.phase = 'release';
      anim.t = 0;
    }
  } else {
    if(!anim.impulseApplied && anim.t >= anim.releaseDur * 0.88){
      anim.impulseApplied = true;
      applyThrowInImpulse(p, anim);
    }
    if(anim.t >= anim.releaseDur) p.throwInAnim = null;
  }
  bindThrowInBall(p);
  return true;
}

export function handleThrowInInput(p, input){
  if(!p.isThrowingIn || ball.state !== BALL_STATE.IN_HAND) return false;
  if(p.throwInAnim) return true;

  let forceKey = null;
  if(input.pressPass) forceKey = 'short';
  else if(input.pressThrough) forceKey = 'medium';
  else if(input.pressCross) forceKey = 'long';
  if(!forceKey) return true;

  const stick = input.move || { x: 0, y: 0 };
  const dir = resolveManualRestartStickDir(stick);
  if(!dir) return true;

  p.facing = Math.atan2(dir.y, dir.x);
  p.lastAim = dir;
  syncPlayerDir(p);

  p.throwInAnim = {
    phase: 'windback',
    t: 0,
    windDur: THROW_IN_ANIM_WINDUP,
    releaseDur: THROW_IN_ANIM_RELEASE,
    force: THROW_IN_FORCE[forceKey],
    dir,
    impulseApplied: false,
  };
  return true;
}

export function updateThrowInSystem(dt){
  for(const p of allPlayers){
    if(p.throwInAnim) updateThrowInAnim(p, dt);
  }
  if(ball.state === BALL_STATE.IN_HAND){
    const thrower = getPlayerById(ball.throwInOwnerId);
    if(thrower) bindThrowInBall(thrower);
  }
}

/* ============================================================
   SET-PIECE MANAGER — posicionamiento, temporizador, barra de carga, timeout
   ============================================================ */
export const SetPieceManager = {
  timer: 0,
  executed: false,
  powerBar: 0,
  chargeType: null,   // 'short' | 'medium' | 'long'
  chargeStart: 0,
  isCharging: false,    // true desde el primer frame de press hasta el release
};

export function resetSetPieceCharge(){
  SetPieceManager.powerBar = 0;
  SetPieceManager.chargeType = null;
  SetPieceManager.chargeStart = 0;
  SetPieceManager.isCharging = false;
}

export function resetSetPieceManager(){
  SetPieceManager.timer = 0;
  SetPieceManager.executed = false;
  resetSetPieceCharge();
}

export function goalAreaCornerPosition(side, fromY){
  const topHalf = fromY >= CENTER.y;
  const dir = side === 'left' ? 1 : -1;
  const goalX = side === 'left' ? GOAL_LINE_LEFT : GOAL_LINE_RIGHT;
  return {
    x: goalX + dir * SBOX_D,
    y: topHalf ? CENTER.y + SBOX_HALFW : CENTER.y - SBOX_HALFW,
  };
}

export function cornerFlagPosition(side, fromY){
  const topHalf = fromY >= CENTER.y;
  const inset = CORNER_FLAG_INSET;
  if(side === 'left') return { x: inset, y: topHalf ? FIELD_W - inset : inset };
  return { x: FIELD_L - inset, y: topHalf ? FIELD_W - inset : inset };
}

export function throwInLinePosition(side, x){
  const lineY = side === 'top' ? THROW_IN_LINE_Y : FIELD_W - THROW_IN_LINE_Y;
  return { x: clamp(x, THROW_IN_CLAMP_X, FIELD_L - THROW_IN_CLAMP_X), y: lineY };
}

export function defaultSetPieceAimDir(p){
  const sp = Game.setPiece;
  const ti = Game.throwIn;
  const side = ti?.side || sp?.side;
  if(side === 'top' || side === 'bottom'){
    return throwInInwardDir(side, p?.team || sp?.team || ti?.team);
  }
  // Solo referencia legacy; los saques manuales exigen stick en el frame de impacto.
  if(side === 'left') return { x: 1, y: 0 };
  if(side === 'right') return { x: -1, y: 0 };
  return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
}

const RESTART_STICK_MIN = 0.15;

export function isRestartAwaiting(){
  if(isKickoffWaiting()) return true;
  return !!(Game.setPieceMode && !Game.isBallInPlay && !SetPieceManager.executed);
}

export function getRestartKickingTeam(){
  if(isKickoffWaiting()) return Game.kickoffTeam;
  if(Game.setPieceMode && !Game.isBallInPlay) return Game.setPiece?.team ?? null;
  return null;
}

export function getRestartTakerId(){
  if(isKickoffWaiting()) return Game.kickoffTakerId;
  return Game.setPiece?.takerId ?? null;
}

export function registerRestartKick(p){
  if(!p) return;
  Game.lastTouchPlayerID = p.id;
  Game.restartRestrictionsActive = true;
}

export function clearRestartRestrictions(){
  Game.lastTouchPlayerID = null;
  Game.restartRestrictionsActive = false;
}

export function isRestartSecondTouchBlocked(p){
  if(!p || !Game.restartRestrictionsActive || !Game.lastTouchPlayerID) return false;
  return p.id === Game.lastTouchPlayerID;
}

export function notifyRestartBallTouchedByOther(p){
  if(!Game.restartRestrictionsActive || !p) return;
  if(p.id === Game.lastTouchPlayerID) return;
  clearRestartRestrictions();
}

export function isOnBallContactBlocked(p){
  return isRestartSecondTouchBlocked(p);
}

export function resolveManualRestartStickDir(stickVec){
  const mag = Math.hypot(stickVec?.x || 0, stickVec?.y || 0);
  if(mag < RESTART_STICK_MIN) return null;
  return norm({ x: stickVec.x, y: stickVec.y });
}

export function isManualRestartAwaiting(p){
  if(isSetPieceAwaitingExecution(p)) return true;
  if(isKickoffTaker(p) && !KickoffManager.executed && !p.kickoffAnim) return true;
  return false;
}

function clampTeamOwnHalf(p, team){
  const limit = team === 'home'
    ? CENTER.x - KICKOFF_HALF_MARGIN
    : CENTER.x + KICKOFF_HALF_MARGIN;
  let clamped = false;
  if(team === 'home' && p.x > limit){
    p.x = limit;
    clamped = true;
  } else if(team === 'away' && p.x < limit){
    p.x = limit;
    clamped = true;
  }
  if(clamped){
    p.vx = 0;
    p.vy = 0;
  }
}

function pushPlayerOutsideRadius(p, cx, cy, minDist){
  const dx = p.x - cx, dy = p.y - cy;
  const d = Math.hypot(dx, dy);
  if(d >= minDist - 0.02) return;
  const ang = d > 0.01 ? Math.atan2(dy, dx) : (p.id % 7) * 0.91;
  p.x = cx + Math.cos(ang) * minDist;
  p.y = cy + Math.sin(ang) * minDist;
  p.x = clamp(p.x, 0.3, FIELD_L - 0.3);
  p.y = clamp(p.y, 0.3, FIELD_W - 0.3);
  p.vx = 0;
  p.vy = 0;
}

function enforceKickoffRestartRestrictions(kickingTeam, takerId){
  for(const p of allPlayers){
    if(isKickoffDefendingTeam(p.team)){
      clampKickoffDefenderPosition(p);
    }
    if(p.team === kickingTeam && p.id !== takerId){
      clampTeamOwnHalf(p, kickingTeam);
    }
  }
}

function enforceCornerRestartRestrictions(kickingTeam, takerId){
  const cx = ball.x, cy = ball.y;
  const minDist = CCIRCLE_R;
  for(const p of allPlayers){
    if(p.id === takerId) continue;
    if(p.team === kickingTeam && p.cornerSlot) continue;
    if(p.team !== kickingTeam){
      pushPlayerOutsideRadius(p, cx, cy, minDist);
    }
  }
}

function enforceThrowInRestartRestrictions(kickingTeam, takerId){
  const cx = ball.x, cy = ball.y;
  const minDist = toGameUnits(THROW_IN_OPPONENT_MIN_DIST);
  for(const p of allPlayers){
    if(p.id === takerId) continue;
    if(p.team === kickingTeam) continue;
    pushPlayerOutsideRadius(p, cx, cy, minDist);
  }
}

function enforceFreeKickRestartRestrictions(kickingTeam, takerId){
  const cx = ball.x, cy = ball.y;
  // Misma distancia reglamentaria que el radio del círculo central (9.15 m).
  const minDist = CCIRCLE_R;
  for(const p of allPlayers){
    if(p.id === takerId) continue;
    if(p.team === kickingTeam) continue;
    pushPlayerOutsideRadius(p, cx, cy, minDist);
  }
}

function enforceGoalKickRestartRestrictions(kickingTeam, takerId, goalSide){
  const goalX = goalSide === 'left' ? 0 : FIELD_L;
  const dir = goalX === 0 ? 1 : -1;
  const penLineX = goalX + dir * PBOX_D;
  for(const p of allPlayers){
    if(p.id === takerId) continue;
    if(p.team === kickingTeam) continue;
    const inPenDepth = goalX === 0 ? (p.x < penLineX + 0.05) : (p.x > penLineX - 0.05);
    const inPenWidth = Math.abs(p.y - CENTER.y) <= PBOX_HALFW + 0.05;
    if(!inPenDepth || !inPenWidth) continue;
    p.x = goalX === 0 ? penLineX + 0.35 : penLineX - 0.35;
    p.vx = 0;
    p.vy = 0;
  }
}

export function enforceRestartPositionRestrictions(){
  if(!isRestartAwaiting()) return;

  if(isKickoffWaiting()){
    const kickingTeam = getRestartKickingTeam();
    if(!kickingTeam) return;
    enforceKickoffRestartRestrictions(kickingTeam, getRestartTakerId());
    return;
  }

  const sp = Game.setPiece;
  if(!sp) return;
  const takerId = sp.takerId;

  if(sp.type === SET_PIECE.CORNER){
    enforceCornerRestartRestrictions(sp.team, takerId);
  } else if(sp.type === SET_PIECE.THROW_IN){
    enforceThrowInRestartRestrictions(sp.team, takerId);
  } else if(sp.type === SET_PIECE.GOAL_KICK){
    enforceGoalKickRestartRestrictions(sp.team, takerId, sp.side);
  } else if(sp.type === SET_PIECE.FREE_KICK){
    enforceFreeKickRestartRestrictions(sp.team, takerId);
  }
}

export function enforceKickoffPositionRestrictions(){
  enforceRestartPositionRestrictions();
}

export function isSetPieceAwaitingExecution(p){
  return !!(p && Game.setPieceMode && !Game.isBallInPlay && !SetPieceManager.executed && Game.setPiece?.takerId === p.id);
}

export function startSetPieceCharge(forceKey, opts = {}){
  if(SetPieceManager.isCharging) return false;
  SetPieceManager.isCharging = true;
  SetPieceManager.chargeType = forceKey;
  SetPieceManager.chargeStart = performance.now();
  SetPieceManager.powerBar = 0.08;
  return true;
}

export function updateManualRestartCharge(){
  if(!SetPieceManager.isCharging || !SetPieceManager.chargeStart) return;
  const elapsed = performance.now() - SetPieceManager.chargeStart;
  SetPieceManager.powerBar = clamp(elapsed / SET_PIECE_POWER_MAX_MS, 0.08, 1);
}

export function positionSetPieceTaker(taker, db, ballPos){
  taker.vx = 0;
  taker.vy = 0;
  if(db.type === SET_PIECE.GOAL_KICK){
    taker.x = ballPos.x + (db.side === 'left' ? 0.75 : -0.75);
    taker.y = ballPos.y;
    taker.facing = db.side === 'left' ? 0 : Math.PI;
  } else if(db.type === SET_PIECE.CORNER){
    taker.x = ballPos.x;
    taker.y = ballPos.y;
    taker.facing = cornerTakerFacing(db, ballPos);
  } else if(db.type === SET_PIECE.KICKOFF){
    taker.x = ballPos.x + (db.team === 'home' ? -KICKOFF_TAKER_BALL_OFFSET : KICKOFF_TAKER_BALL_OFFSET);
    taker.y = ballPos.y;
    taker.facing = db.team === 'home' ? 0 : Math.PI;
  } else if(db.type === SET_PIECE.THROW_IN){
    taker.x = ballPos.x;
    taker.y = ballPos.y;
    taker.facing = throwInFacingForSide(db.side);
  } else if(db.type === SET_PIECE.FREE_KICK || db.type === SET_PIECE.PENALTY){
    const atkDir = db.team === 'home' ? 1 : -1;
    taker.x = ballPos.x - atkDir * 0.72;
    taker.y = ballPos.y;
    taker.facing = db.team === 'home' ? 0 : Math.PI;
  } else {
    taker.facing = db.team === 'home' ? 0 : Math.PI;
  }
  syncPlayerDir(taker);
}

export function getSetPieceBallPosition(db){
  const fromY = db.fromY != null ? db.fromY : (db.y != null ? db.y : CENTER.y);
  if(db.type === SET_PIECE.GOAL_KICK) return goalAreaCornerPosition(db.side, fromY);
  if(db.type === SET_PIECE.CORNER) return cornerFlagPosition(db.side, fromY);
  if(db.type === SET_PIECE.THROW_IN) return throwInLinePosition(db.side, db.x);
  if(db.type === SET_PIECE.PENALTY){
    const goalX = db.side === 'left' ? 0 : FIELD_L;
    const dir = db.side === 'left' ? 1 : -1;
    return { x: goalX + dir * (PBOX_D * 0.78), y: CENTER.y };
  }
  if(db.type === SET_PIECE.FREE_KICK){
    return {
      x: clamp(db.x ?? FIELD_L * 0.5, 1.2, FIELD_L - 1.2),
      y: clamp(db.y ?? fromY, 1.2, FIELD_W - 1.2),
    };
  }
  return { x: db.x, y: db.y };
}

export function resetGoalkeeperForGoalKick(gk){
  if(!gk) return;
  clearGkPossessionType(gk);
  clearChasingState(gk);
  clearForcedChaseState(gk);
  clearPlayerAIState(gk);
  clearChargingShotState(gk);
  gk.gkKickAnim = null;
  gk.state = 'idle';
  gk.vx = 0;
  gk.vy = 0;
  gk.charging = null;
  gk.pendingKick = null;
  clearPlayerPendingAction(gk);
  gk.isStuck = false;
  gk.canMove = true;
}

export function placeGoalKickBall(ballPos){
  ball.x = ballPos.x;
  ball.y = ballPos.y;
  ball.z = BALL_RADIUS;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.highKick = false;
  ball.highKickType = null;
  ball.passOrigin = null;
  ball.owner = null;
  ball.state = BALL_STATE.PLACED;
  ball.isReadyToKick = true;
  ball.isContested = false;
  ball.contestedT = 0;
  ball.contestedTacklerId = null;
  ball.contestedVictimId = null;
  clearEffortChaseLock(true);
  clearBallLock();
}

export function maintainGoalKickPlacement(){
  if(!isGoalKickReadyState()) return;
  const sp = Game.setPiece;
  if(!sp) return;
  const pos = getSetPieceBallPosition(sp);
  placeGoalKickBall(pos);
}

function pickNearestSetPieceTaker(team, ballPos, excludeGk = false){
  const squad = team === 'home' ? homeTeam : awayTeam;
  const pool = excludeGk ? squad.filter(p => p.role !== 'GK') : squad;
  if(!pool.length) return squad[0];
  return pool.reduce((a, b) => dist2D(a, ballPos) < dist2D(b, ballPos) ? a : b);
}

export function setupCorner(db){
  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;
  Game.cornerPositioned = false;

  const ballPos = getSetPieceBallPosition(db);
  ball.x = ballPos.x;
  ball.y = ballPos.y;
  ball.z = BALL_RADIUS;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.curveFactor = 0;
  ball.highKick = false;
  ball.highKickType = null;
  ball.passOrigin = null;
  ball.isReadyToKick = false;
  ball.isContested = false;

  const taker = pickNearestSetPieceTaker(db.team, ballPos);
  // Teletransporte inmediato al vértice: sin caminata hacia el corner.
  positionSetPieceTaker(taker, db, ballPos);
  taker.vx = 0;
  taker.vy = 0;
  taker.canMove = false;
  taker.isStuck = true;
  taker.aiMode = 'normal';
  taker.cornerSlot = null;
  taker.cornerBasePosition = null;
  taker.targetPosition = null;

  if(!setBallStateInPossession(taker, null)){
    ball.owner = taker;
    ball.state = BALL_STATE.IN_POSSESSION;
    clearChasingState(taker);
  }
  // Pegar pelota al pie del sacador en el flag.
  ball.x = ballPos.x;
  ball.y = ballPos.y;
  ball.z = BALL_RADIUS;
  ball.lastTouchTeam = db.team;
  ball.lastTouchedBy = taker.id;
  if(db.team === 'home') setControlled(taker);
  else setControlled2(taker);

  setSetPieceMode(true, {
    type: SET_PIECE.CORNER,
    team: db.team,
    side: db.side,
    takerId: taker.id,
    x: ballPos.x,
    y: ballPos.y,
    fromY: db.fromY,
  });

  // Reafirmar pose del sacador tras setSetPieceMode (queda listo para ejecutar).
  positionSetPieceTaker(taker, db, ballPos);
  taker.canMove = false;
  taker.isStuck = true;
  taker.inSetPieceZone = true;
  Game.isBallInPlay = false;
}

export function setupFreeKick(db){
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
  ball.highKick = false;
  ball.highKickType = null;
  ball.passOrigin = null;
  ball.isReadyToKick = false;
  ball.isContested = false;

  const taker = pickNearestSetPieceTaker(db.team, ballPos);
  positionSetPieceTaker(taker, db, ballPos);

  if(!setBallStateInPossession(taker, null)){
    ball.owner = taker;
    ball.state = BALL_STATE.IN_POSSESSION;
    clearChasingState(taker);
  }
  ball.lastTouchTeam = db.team;
  ball.lastTouchedBy = taker.id;
  if(db.team === 'home') setControlled(taker);
  else setControlled2(taker);

  setSetPieceMode(true, {
    type: SET_PIECE.FREE_KICK,
    team: db.team,
    side: db.side,
    takerId: taker.id,
    x: ballPos.x,
    y: ballPos.y,
    fromY: db.fromY,
    foulReason: db.foulReason ?? null,
    indirect: !!db.indirect,
  });
  enforceFreeKickRestartRestrictions(db.team, taker.id);
}

export function setupPenalty(db){
  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;

  const ballPos = getSetPieceBallPosition(db);
  placeGoalKickBall(ballPos);

  const taker = pickNearestSetPieceTaker(db.team, ballPos, true);
  positionSetPieceTaker(taker, db, ballPos);

  const defTeam = db.team === 'home' ? 'away' : 'home';
  const defGk = (defTeam === 'home' ? homeTeam : awayTeam).find(p => p.role === 'GK');
  if(defGk){
    defGk.x = defGk.ownGoalX() + defGk.attackDir() * 0.85;
    defGk.y = CENTER.y;
    defGk.vx = 0;
    defGk.vy = 0;
    defGk.gkShotReaction = null;
    defGk.diveAnim = null;
    defGk.facing = defGk.team === 'home' ? 0 : Math.PI;
    syncPlayerDir(defGk);
  }

  ball.lastTouchTeam = db.team;
  ball.lastTouchedBy = taker.id;
  if(db.team === 'home') setControlled(taker);
  else setControlled2(taker);

  setSetPieceMode(true, {
    type: SET_PIECE.PENALTY,
    team: db.team,
    side: db.side,
    takerId: taker.id,
    x: ballPos.x,
    y: ballPos.y,
    fromY: db.fromY,
    foulReason: db.foulReason ?? null,
  });
}

export function setupGoalKick(db){
  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;

  const ballPos = getSetPieceBallPosition(db);
  placeGoalKickBall(ballPos);

  const squad = db.team === 'home' ? homeTeam : awayTeam;
  const gk = squad.find(p => p.role === 'GK') ||
    squad.reduce((a, b) => dist2D(a, ballPos) < dist2D(b, ballPos) ? a : b);

  resetGoalkeeperForGoalKick(gk);
  positionSetPieceTaker(gk, db, ballPos);
  gk.gkBallCollidable = false;
  gk.canMove = false;
  gk.isStuck = true;
  gk.vx = 0;
  gk.vy = 0;

  ball.lastTouchTeam = db.team;
  ball.lastTouchedBy = gk.id;
  if(db.team === 'home') setControlled(gk);
  else setControlled2(gk);

  setSetPieceMode(true, {
    type: SET_PIECE.GOAL_KICK,
    team: db.team,
    side: db.side,
    takerId: gk.id,
    x: ballPos.x,
    y: ballPos.y,
    fromY: db.fromY,
  });

  // Fase de preparación: pelota colocada en área chica hasta saque manual (o auto solo CPU).
  ball.isReadyToKick = true;
  Game.isBallInPlay = false;
}

export function executeGoalKickRelease(p, forceKey, powerBar, stickVec){
  if(!p || !isGoalkeeper(p)) return false;
  const dir = resolveManualRestartStickDir(stickVec);
  if(!dir) return false;

  ball.isReadyToKick = false;
  ball.state = BALL_STATE.IN_POSSESSION;
  p.gkBallCollidable = true;

  const power = clamp(Math.max(powerBar, 0.14), 0.14, 1);
  p.facing = Math.atan2(dir.y, dir.x);
  p.lastAim = dir;
  syncPlayerDir(p);

  clearGkPossessionType(p);
  ball.owner = p;
  ball.state = BALL_STATE.IN_POSSESSION;
  registerRestartKick(p);
  const kickMap = { short: 'pass', medium: 'through', long: 'cross' };
  const gkPower = clamp(power * getGkKickForceMult(), 0.14, 1);
  executeKick(p, kickMap[forceKey] || 'pass', dir, gkPower, 0);
  return true;
}

export function executeManualSetPieceRelease(p, forceKey, powerBar, stickVec){
  if(SetPieceManager.executed) return false;
  const dir = resolveManualRestartStickDir(stickVec);
  if(!dir) return false;

  SetPieceManager.executed = true;
  resetSetPieceCharge();

  const power = clamp(Math.max(powerBar, 0.14), 0.14, 1);
  p.facing = Math.atan2(dir.y, dir.x);
  p.lastAim = dir;
  syncPlayerDir(p);
  registerRestartKick(p);

  const sp = Game.setPiece;
  if(sp?.type === SET_PIECE.THROW_IN){
    // Misma escala que handleThrowInInput (THROW_IN_FORCE), no SET_PIECE_FORCE_MULT (pateos).
    const baseForce = THROW_IN_FORCE[forceKey] || THROW_IN_FORCE.short;
    const force = baseForce * (0.55 + 0.45 * clamp(powerBar, 0, 1));
    p.throwInAnim = {
      phase: 'windback',
      t: 0,
      windDur: THROW_IN_ANIM_WINDUP,
      releaseDur: THROW_IN_ANIM_RELEASE,
      force,
      dir,
      impulseApplied: false,
    };
    return true;
  }

  if(sp?.type === SET_PIECE.GOAL_KICK && isGoalkeeper(p)){
    return executeGoalKickRelease(p, forceKey, powerBar, stickVec);
  }

  if(sp?.type === SET_PIECE.PENALTY){
    SetPieceManager.executed = true;
    ball.isReadyToKick = false;
    executeKick(p, 'shot', dir, power, 0);
    onSetPieceBallReleased();
    return true;
  }

  const kickMap = { short: 'pass', medium: 'through', long: 'cross' };
  executeKick(p, kickMap[forceKey] || 'pass', dir, power, 0);
  return true;
}

/** @deprecated Usar executeManualSetPieceRelease con vector de stick. */
export function executeSetPieceRelease(p, forceKey, powerBar, aimDir){
  return executeManualSetPieceRelease(p, forceKey, powerBar, aimDir);
}

export function performAutoSetPieceKick(taker){
  if(!taker || !Game.setPiece) return false;
  const sp = Game.setPiece;

  if(sp.type === SET_PIECE.THROW_IN){
    // Saque corto hacia el interior, sobre la misma banda de salida (nunca banda opuesta / long bomb).
    const ti = Game.throwIn;
    const side = ti?.side || sp.side;
    const throwX = ti?.x ?? sp.x ?? taker.x;
    const pos = throwInLinePosition(side, throwX);
    taker.x = pos.x;
    taker.y = pos.y;
    taker.vx = 0;
    taker.vy = 0;
    if(ti){ ti.x = pos.x; ti.y = pos.y; }
    sp.x = pos.x;
    sp.y = pos.y;

    const dir = throwInInwardDir(side, taker.team || sp.team);
    taker.facing = Math.atan2(dir.y, dir.x);
    taker.lastAim = dir;
    syncPlayerDir(taker);
    bindThrowInBall(taker);

    SetPieceManager.executed = true;
    resetSetPieceCharge();
    taker.isThrowingIn = true;
    taker.throwInAnim = {
      phase: 'windback',
      t: 0,
      windDur: THROW_IN_ANIM_WINDUP,
      releaseDur: THROW_IN_ANIM_RELEASE,
      force: THROW_IN_FORCE.short,
      dir,
      impulseApplied: false,
    };
    return true;
  }

  if(sp.type === SET_PIECE.PENALTY){
    resetSetPieceCharge();
    const power = 0.72 + Math.random() * 0.22;
    const gx = taker.oppGoalX();
    const dir = norm({ x: gx - taker.x, y: (CENTER.y + (Math.random() - 0.5) * 2.4) - taker.y });
    registerRestartKick(taker);
    executeKick(taker, 'shot', dir, power, 0);
    onSetPieceBallReleased();
    return true;
  }

  if(sp.type === SET_PIECE.FREE_KICK){
    resetSetPieceCharge();
    const power = 0.5 + Math.random() * 0.38;
    const gx = taker.oppGoalX();
    const dir = norm({ x: gx - taker.x, y: (CENTER.y + (Math.random() - 0.5) * 8) - taker.y });
    registerRestartKick(taker);
    const kickType = Math.random() < 0.42 ? 'shot' : 'pass';
    executeKick(taker, kickType, dir, power, 0);
    return true;
  }

  if(sp.type !== SET_PIECE.GOAL_KICK && sp.type !== SET_PIECE.CORNER) return false;

  resetSetPieceCharge();
  const power = 0.55 + Math.random() * 0.35;

  if(sp.type === SET_PIECE.GOAL_KICK && isGoalkeeper(taker)){
    const plan = resolveGkAutoDistribution(taker);
    return executeGoalKickRelease(taker, plan.type, plan.power, plan.dir);
  }

  const gx = taker.oppGoalX();
  const gy = CENTER.y + (Math.random() - 0.5) * 12;
  const dir = norm({ x: gx - taker.x, y: gy - taker.y });

  registerRestartKick(taker);
  const kickType = sp.type === SET_PIECE.CORNER ? 'cross' : 'pass';
  executeKick(taker, kickType, dir, power, 0);
  return true;
}

export function autoExecuteSetPiece(taker){
  if(!taker || SetPieceManager.executed) return;
  const sp = Game.setPiece;
  if(!sp) return;
  // Saque de arco / lateral del equipo humano: nunca auto; espera control manual.
  if(sp.type === SET_PIECE.GOAL_KICK || sp.type === SET_PIECE.THROW_IN){
    if(isHumanTeam?.(sp.team) || isControlledByHuman(taker)) return;
  }
  if(sp.type === SET_PIECE.GOAL_KICK || sp.type === SET_PIECE.CORNER){
    SetPieceManager.executed = true;
  }
  if(sp.type === SET_PIECE.FREE_KICK || sp.type === SET_PIECE.PENALTY){
    SetPieceManager.executed = true;
  }
  performAutoSetPieceKick(taker);
}

export function enterPlayingAfterAutoRestart(team){
  Game.isBallInPlay = true;
  ball.isReadyToKick = false;
  for(const p of allPlayers) clearPlayerSetPieceState(p);

  if(isHumanTeam(team)){
    const targetId = getPassTargetId(team);
    const receiver = (targetId ? getPlayerById(targetId) : null) || nearestToBall(team);
    if(receiver){
      const now = performance.now();
      if(team === 'home'){
        setControlled(receiver);
        Game.manualOverrideUntil = now + LONGPASS_SWITCH_LOCK_MS;
      } else {
        setControlled2(receiver);
        Game.manualOverrideUntil2 = now + LONGPASS_SWITCH_LOCK_MS;
      }
    }
  }
}

export function executeAutoRestart(){
  const sp = Game.setPiece;
  if(!sp) return;
  if(sp.type !== SET_PIECE.GOAL_KICK && sp.type !== SET_PIECE.CORNER
    && sp.type !== SET_PIECE.FREE_KICK && sp.type !== SET_PIECE.PENALTY) return;

  // Equipo humano: el saque de arco solo se ejecuta con input del jugador.
  if(sp.type === SET_PIECE.GOAL_KICK){
    if(isHumanTeam?.(sp.team)) return;
    const takerCheck = getPlayerById(sp.takerId);
    if(takerCheck && isControlledByHuman(takerCheck)) return;
  }

  const taker = getPlayerById(sp.takerId);
  if(!taker) return;

  SetPieceManager.executed = true;
  clearPlayerSetPieceState(taker);
  if(isGoalkeeper(taker)) taker.gkBallCollidable = true;

  if(!performAutoSetPieceKick(taker)) return;

  enterPlayingAfterAutoRestart(sp.team);
}

export function transferPossessionToOpponent(){
  const sp = Game.setPiece;
  if(!sp || sp.type !== SET_PIECE.THROW_IN) return;

  const rival = sp.team === 'home' ? 'away' : 'home';
  const x = Game.throwIn?.x ?? sp.x ?? ball.x;
  const side = Game.throwIn?.side ?? sp.side;

  const taker = getPlayerById(sp.takerId);
  if(taker){
    taker.isThrowingIn = false;
    taker.throwInAnim = null;
    clearPlayerSetPieceState(taker);
  }

  resetSetPieceManager();
  setSetPieceMode(false);
  Game.throwIn = null;
  ball.throwInOwnerId = null;
  ball.throwInBlockOwnerId = null;

  showBanner('Tiempo agotado — Saque lateral rival', 1600);
  setupThrowIn({ type: SET_PIECE.THROW_IN, team: rival, side, x, fromY: ball.y });
}

export function transferCornerToGoalKick(){
  const sp = Game.setPiece;
  if(!sp || sp.type !== SET_PIECE.CORNER) return;

  // Timeout de 5s: el rival del equipo que debía ejecutar el córner recibe saque de arco.
  const defendingTeam = sp.team === 'home' ? 'away' : 'home';
  const fromY = sp.fromY ?? sp.y ?? ball.y;
  const side = sp.side;

  clearActiveSetPieceTaker();
  resetSetPieceManager();
  setSetPieceMode(false);
  Game.cornerPositioned = false;
  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;

  showBanner('Tiempo agotado — Saque de arco', 1600);
  setupGoalKick({
    type: SET_PIECE.GOAL_KICK,
    team: defendingTeam,
    side,
    fromY,
  });
}

export function handleSetPieceTimeout(){
  if(SetPieceManager.executed || Game.isBallInPlay) return;
  const sp = Game.setPiece;
  if(!sp) return;

  const restartType = sp.type;
  if(restartType === SET_PIECE.CORNER){
    transferCornerToGoalKick();
  } else if(restartType === SET_PIECE.GOAL_KICK){
    forceGoalKickTimeoutClearance();
  } else if(restartType === SET_PIECE.FREE_KICK || restartType === SET_PIECE.PENALTY){
    const taker = getPlayerById(sp.takerId);
    if(taker) autoExecuteSetPiece(taker);
  } else if(restartType === SET_PIECE.THROW_IN){
    transferPossessionToOpponent();
  }
}

/** Timeout 5s: pelotazo largo frontal hacia mediocampo (penalización anti-pérdida de tiempo). */
export function forceGoalKickTimeoutClearance(){
  const sp = Game.setPiece;
  if(!sp || sp.type !== SET_PIECE.GOAL_KICK) return false;
  if(SetPieceManager.executed || Game.isBallInPlay) return false;

  const taker = getPlayerById(sp.takerId);
  if(!taker) return false;

  SetPieceManager.executed = true;
  clearPlayerSetPieceState(taker);
  if(isGoalkeeper(taker)) taker.gkBallCollidable = true;
  ball.isReadyToKick = false;

  const atk = typeof taker.attackDir === 'function' ? taker.attackDir() : (taker.team === 'home' ? 1 : -1);
  const clearDir = norm({ x: atk, y: (CENTER.y - taker.y) * 0.05 });
  taker.facing = Math.atan2(clearDir.y, clearDir.x);
  taker.lastAim = clearDir;
  syncPlayerDir(taker);

  clearGkPossessionType(taker);
  ball.owner = taker;
  ball.state = BALL_STATE.IN_POSSESSION;
  registerRestartKick(taker);

  const power = clamp(0.92 * getGkKickForceMult(), 0.5, 1);
  if(typeof executeKick === 'function'){
    executeKick(taker, 'cross', clearDir, power, 0);
  }
  onSetPieceBallReleased();
  enterPlayingAfterAutoRestart(sp.team);
  showBanner('Tiempo agotado — Despeje largo', 1500);
  return true;
}

export function clearActiveSetPieceTaker(){
  const sp = Game.setPiece;
  if(!sp) return;
  const taker = getPlayerById(sp.takerId);
  if(taker){
    taker.isThrowingIn = false;
    taker.throwInAnim = null;
    clearPlayerSetPieceState(taker);
    if(isGoalkeeper(taker)) taker.gkBallCollidable = true;
  }
  ball.isReadyToKick = false;
  resetSetPieceCharge();
}

export function restartSetPieceForTeam(db){
  clearActiveSetPieceTaker();
  resetSetPieceManager();
  Game.setPieceMode = false;
  Game.setPiece = null;
  Game.throwIn = null;
  ball.throwInOwnerId = null;
  ball.throwInBlockOwnerId = null;
  ball.isReadyToKick = false;

  if(db.type === SET_PIECE.GOAL_KICK){
    setupGoalKick(db);
    return;
  }
  if(db.type === SET_PIECE.THROW_IN){
    setupThrowIn(db);
    return;
  }
  // Córner / TL / penal eliminados → saque de arco automático.
  if(db.type === SET_PIECE.CORNER || db.type === SET_PIECE.FREE_KICK || db.type === SET_PIECE.PENALTY){
    const side = db.side === 'left' || db.side === 'right'
      ? db.side
      : ((db.x ?? ball.x) < FIELD_L * 0.5 ? 'left' : 'right');
    const team = side === 'left' ? 'home' : 'away';
    const pos = goalAreaCornerPosition(side, db.y ?? ball.y);
    setupGoalKick({ type: SET_PIECE.GOAL_KICK, team, side, x: pos.x, y: pos.y, fromY: pos.y });
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
  ball.highKick = false;
  ball.highKickType = null;
  ball.owner = null;
  ball.state = BALL_STATE.FREE;

  const squad = db.team === 'home' ? homeTeam : awayTeam;
  const taker = squad.reduce((a, b) => dist2D(a, ballPos) < dist2D(b, ballPos) ? a : b);
  positionSetPieceTaker(taker, db, ballPos);
  if(!setBallStateInPossession(taker, db.type === SET_PIECE.GOAL_KICK ? 'feet' : null)){
    ball.owner = taker;
    ball.state = BALL_STATE.IN_POSSESSION;
    if(isGoalkeeper(taker)) initGkPossessionType(taker, db.type === SET_PIECE.GOAL_KICK ? 'feet' : null);
    clearChasingState(taker);
  }
  ball.lastTouchTeam = db.team;
  if(db.team === 'home') setControlled(taker);
  else setControlled2(taker);
  setSetPieceMode(true, {
    type: db.type,
    team: db.team,
    side: db.side,
    takerId: taker.id,
    x: ballPos.x,
    y: ballPos.y,
    fromY: db.fromY,
  });
  if(db.type === SET_PIECE.CORNER){
    Game.cornerPositioned = false;
  }
}

export function handleManualRestartKickInput(p, input){
  if(!isManualRestartAwaiting(p)) return false;

  if(input.pressPass || input.pressCross || input.pressShot || input.pressThrough){
    resetGkAutoDistributeTimer(p);
  }

  const chargeType = SetPieceManager.chargeType;

  // Release: unica ruta que detiene la carga y ejecuta el saque
  if(SetPieceManager.isCharging && chargeType){
    const released = (chargeType === 'short' && (input.releasedPass || (input.releasedShot && isKickoffTaker(p)))) ||
      (chargeType === 'medium' && input.releasedThrough) ||
      (chargeType === 'long' && input.releasedCross);
    if(!released) return true;

    const stick = input.move || { x: 0, y: 0 };
    if(!resolveManualRestartStickDir(stick)){
      resetSetPieceCharge();
      return true;
    }

    const power = SetPieceManager.powerBar;
    resetSetPieceCharge();

    if(isKickoffTaker(p)){
      const kickMap = { short: 'pass', medium: 'through', long: 'cross' };
      const kickType = kickMap[chargeType] || 'pass';
      executeKick(p, kickType, stick, power, resolveInputCurve(input));
    } else {
      executeManualSetPieceRelease(p, chargeType, power, stick);
    }
    return true;
  }

  // Inicio: solo en el primer frame con boton presionado
  if(SetPieceManager.isCharging) return true;

  if(input.heldPass && !input.heldThrough && !input.heldCross){
    startSetPieceCharge('short', { kickoff: isKickoffTaker(p) });
  } else if(input.heldThrough && !input.heldPass && !input.heldCross){
    startSetPieceCharge('medium');
  } else if(input.heldCross && !input.heldPass && !input.heldThrough){
    startSetPieceCharge('long');
  } else if(input.heldShot && isKickoffTaker(p)){
    startSetPieceCharge('short', { kickoff: true });
  }
  return true;
}

export function handleSetPiecePowerInput(p, input){
  return handleManualRestartKickInput(p, input);
}

export function updateSetPieceManager(dt){
  updateManualRestartCharge();
  if(isKickoffWaiting()) return;
  if(!Game.setPieceMode || SetPieceManager.executed || Game.isBallInPlay) return;
  SetPieceManager.timer = Math.max(0, SetPieceManager.timer - dt);
  if(SetPieceManager.timer <= 0){
    handleSetPieceTimeout();
  }
}

export function clearPlayerSetPieceState(p){
  if(!p) return;
  p.canMove = true;
  p.isStuck = false;
  p.blockDribbling = false;
  p.inSetPieceZone = false;
  p.cornerSlot = null;
  p.cornerBasePosition = null;
  p.throwInRunTarget = null;
  if(p.aiMode === 'set_piece' || p.aiMode === 'throw_in_run') p.aiMode = 'normal';
  if(p.state === STATE_FIXED) p.state = 'idle';
}

/** Al seleccionar un jugador: quitar posicionamiento tactico, desmarque IA y desbloquear movimiento. */
export function claimManualControl(p){
  if(!p) return;
  clearPlayerAIState(p);
  clearChasingState(p);
  clearForcedChaseState(p);
  if(p.aiMode === 'positioning' || p.aiMode === 'seeking' ||
     p.aiMode === AI_RUPTURA || p.aiMode === AI_RUPTURA_MANUAL){
    p.aiMode = 'normal';
  }
  p.runTarget = null;
  p.runTimer = 0;
  p.chargeMoveLock = null;
  p.isAttackingBall = false;
  p.isMakingManualRun = false;
  p.hasRunDirectionLocked = false;
  p.lockedRunVector = null;
  p.targetPosition = null;
  p.iaSeekingBrake = false;
  p.manualRunPadIndex = null;
  if(p.wallRun) p.wallRun.active = false;
  p.wallRun = null;
  if(!p.inSetPieceZone && !isSetPieceAwaitingExecution(p)){
    p.canMove = true;
    p.isStuck = false;
    p.accelRampDist = 1e6;
  }
}

/** Jugador bajo control del usuario (humano). */
export function isHumanSelectedPlayer(p){
  if(!p) return false;
  if(isControlledByHuman && isControlledByHuman(p)) return true;
  return p.id === Game.controlledId || (Game.twoPlayerMode && p.id === Game.controlledId2);
}

/** Cada frame: el jugador seleccionado no puede quedar bajo IA de desmarque/ruptura. */
export function purgeCpuMovementForHuman(p){
  if(!isHumanSelectedPlayer(p)) return;
  if(p.isMakingManualRun && p.wallRun?.active) return;
  if(p.aiMode === AI_RUPTURA || p.aiMode === AI_RUPTURA_MANUAL ||
     p.aiMode === 'positioning' || p.aiMode === 'seeking'){
    p.aiMode = 'normal';
  }
  p.runTarget = null;
  p.lockedRunVector = null;
  p.hasRunDirectionLocked = false;
  p.isMakingManualRun = false;
  p.iaSeekingBrake = false;
  p.targetPosition = null;
  if(p.wallRun){ p.wallRun.active = false; p.wallRun = null; }
}

export function setSetPieceMode(active, info){
  if(active) clearAirSpamUiState();
  Game.setPieceMode = !!active;
  if(!active){
    if(Game.setPiece?.type === SET_PIECE.GOAL_KICK){
      ball.isReadyToKick = false;
      const prevTaker = getPlayerById(Game.setPiece?.takerId);
      if(prevTaker && isGoalkeeper(prevTaker)) prevTaker.gkBallCollidable = true;
    }
    Game.setPiece = null;
    Game.isBallInPlay = true;
    ball.setPieceLaunchPos = null;
    resetSetPieceManager();
    for(const p of allPlayers) clearPlayerSetPieceState(p);
    return;
  }
  Game.isBallInPlay = false;
  Game.setPiece = info || null;
  ball.setPieceLaunchPos = null;
  SetPieceManager.timer = getSetPieceTimerDuration(info?.type);
  SetPieceManager.executed = false;
  resetSetPieceCharge();
  for(const p of allPlayers){
    if(info && p.id === info.takerId){
      p.inSetPieceZone = true;
      p.canMove = false;
      p.isStuck = true;
      p.blockDribbling = !!(info.type === SET_PIECE.CORNER && ball.owner === p);
    } else {
      clearPlayerSetPieceState(p);
    }
  }
}

export function onSetPieceBallReleased(){
  if(!Game.setPieceMode) return;
  Game.isBallInPlay = true;
  ball.isReadyToKick = false;
  const taker = getPlayerById(Game.setPiece?.takerId);
  if(taker && isGoalkeeper(taker)) taker.gkBallCollidable = true;
  ball.setPieceLaunchPos = {x: ball.x, y: ball.y};
  startGlobalReinstatementCooldown();
}

export function isSetPieceTaker(p){
  return !!(p && Game.setPieceMode && Game.setPiece?.takerId === p.id);
}

export function isSetPieceShotOnly(p){
  if(!isSetPieceTaker(p)) return false;
  const t = Game.setPiece?.type;
  return t === SET_PIECE.CORNER || t === SET_PIECE.GOAL_KICK || t === SET_PIECE.PENALTY;
}

export function refreshSetPieceBlockDribbling(){
  if(!Game.setPieceMode || Game.setPiece?.type !== SET_PIECE.CORNER) return;
  for(const p of allPlayers){
    if(p.inSetPieceZone) p.blockDribbling = ball.owner === p;
  }
}

export function updateSetPieceRelease(){
  maintainGoalKickPlacement();
  refreshSetPieceBlockDribbling();
  if(!Game.setPieceMode) return;

  if(Game.setPiece?.type === SET_PIECE.GOAL_KICK && isGoalKickReadyState()){
    const taker = getPlayerById(Game.setPiece.takerId);
    if(taker){
      taker.canMove = false;
      taker.isStuck = true;
      taker.inSetPieceZone = true;
    }
    return;
  }

  if(Game.setPiece?.type === SET_PIECE.PENALTY && !Game.isBallInPlay){
    const taker = getPlayerById(Game.setPiece.takerId);
    if(taker){
      taker.canMove = false;
      taker.isStuck = true;
      taker.inSetPieceZone = true;
    }
    maintainGoalKickPlacement();
    return;
  }

  if(Game.setPiece?.type === SET_PIECE.THROW_IN){
    const taker = getPlayerById(Game.setPiece.takerId);
    if(taker && ball.state === BALL_STATE.IN_HAND){
      taker.canMove = false;
      taker.isStuck = true;
      taker.inSetPieceZone = true;
      return;
    }
  }

  if(!Game.isBallInPlay || !ball.setPieceLaunchPos) return;
  const lp = ball.setPieceLaunchPos;
  const dist = Math.hypot(ball.x - lp.x, ball.y - lp.y);
  if(dist >= SET_PIECE_UNSTICK_DIST) setSetPieceMode(false);
}

export function triggerGoalkeeperSetPieceKick(p, kickType, aimDir, power){
  if(!triggerGoalkeeperKick(p, kickType, aimDir)) return false;
  if(p.gkKickAnim) p.gkKickAnim.power = power;
  return true;
}
// inversa: dado un punto de pantalla, devuelve el punto de mundo sobre el piso (z=0)
export function unproject(sx, sy){
  const groundY = canvas.height*CAM.groundFrac;
  const horizonY = canvas.height*CAM.horizonFrac;
  let t = (groundY - sy) / (groundY - horizonY);
  t = Math.max(-0.4, Math.min(0.985, t));
  const depth = CAM.near/(1-t);
  const s = projScale(depth);
  const y = depth + CAM.camYoff;
  const x = CAM.x + (sx - canvas.width/2)/s;
  return {x, y};
}

/* ============================================================
   UTILIDADES
   ============================================================ */
export function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
export function lerp(a,b,t){return a+(b-a)*t;}
export function dist2D(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy);}
export function getDistance(a,b){ return dist2D(a,b); }
export function norm(v){const m=Math.hypot(v.x,v.y)||1;return {x:v.x/m,y:v.y/m};}
export function angDiff(a,b){let d=a-b;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;}
// curva de la animacion de TOQUE (puntapie corto): sube casi de golpe (la pierna se estira ya en
// el primer par de frames, coincidiendo con el impulso que recibe la pelota) y despues vuelve a
// su lugar de forma un poco mas gradual, como el recorte de un pase corto real.
export function touchKickCurve(t, dur){
  const u = clamp(t/dur, 0, 1);
  const RISE = 0.16;
  if(u < RISE) return u/RISE;
  return clamp(1 - (u-RISE)/(1-RISE), 0, 1);
}

/* ============================================================
   ENTIDADES
   ============================================================ */
// R1 solo = colocado (+1). L1+R1 = trivela (-1). L2 ya no define curva de tiro.
export function resolveInputCurve(input){
  if(input.heldL1 && input.heldR1) return -1; // Trivela (efecto exterior)
  if(input.heldR1 && !input.heldL1) return 1; // Colocado (R1)
  return 0;
}

// Aceleracion lateral por frame, perpendicular al vector de velocidad ACTUAL (no al stick).
// curveFactor > 0 (R1 colocado): curva a la IZQUIERDA · curveFactor < 0 (L1+R1 trivela): a la DERECHA.
// applyCurveEffect: decaimiento por velocidad, drift cap, rectificacion final hacia receptor.
export function clearCurvePassTracking(b){
  if(!b) return;
  b.curveLineOrigin = null;
  b.curveLineDir = null;
  b.curvePassTarget = null;
  b.curveMaxDrift = 0;
  b.curveMaxSpeed = 0;
}

export function setupCurvePassTracking(p, type, dir, curve, speed){
  clearCurvePassTracking(ball);
  if(!curve) return;

  ball.curveLineOrigin = {x: p.x, y: p.y};
  ball.curveLineDir = {x: dir.x, y: dir.y};
  ball.curveMaxSpeed = Math.max(speed, PASS_MAX_SPEED * 0.05);

  const estDist = Math.max(speed * 0.85, 6);
  ball.curvePassTarget = {x: p.x + dir.x * estDist, y: p.y + dir.y * estDist};
  const passDist = Math.max(dist2D(ball.curveLineOrigin, ball.curvePassTarget), 1.5);
  ball.curveMaxDrift = passDist * CURVE_DRIFT_CAP_RATIO;
}

export function applyCurveEffect(b, dt){
  applyBallLateralCurve(b, dt);
}

export function applyBallLateralCurve(b, dt){
  if(b.state === BALL_STATE.IN_POSSESSION) return;
  if(b.lastKickType === 'shot' && !b.curveFactor) return;
  let cf = b.curveFactor;
  if(!cf) return;

  const sp = Math.hypot(b.vx, b.vy);
  if(sp < CURVE_CUT_MIN_SPEED){
    b.curveFactor = 0;
    clearCurvePassTracking(b);
    return;
  }

  // Drift cap: no superar 30% de la distancia total del pase en desplazamiento lateral
  if(b.curveLineOrigin && b.curveLineDir && b.curveMaxDrift > 0 && b.x != null && b.y != null){
    const dx = b.x - b.curveLineOrigin.x;
    const dy = b.y - b.curveLineOrigin.y;
    const lateral = Math.abs(dx * (-b.curveLineDir.y) + dy * b.curveLineDir.x);
    if(lateral >= b.curveMaxDrift){
      b.curveFactor = 0;
      clearCurvePassTracking(b);
      return;
    }
  }

  // Decaimiento al final: curveIntensity = baseCurve * (speed / maxPassSpeed)
  const maxSp = Math.max(b.curveMaxSpeed || b.initialSpeed || PASS_MAX_SPEED, 0.01);
  cf *= clamp(sp / maxSp, 0, 1);

  const minSp = b.z > BALL_RADIUS+0.05 ? 0.45 : SHOT_CURVE_GROUND_MIN_SPEED;
  if(sp < minSp) return;

  const perpX = -b.vy/sp, perpY = b.vx/sp;
  b.vx += perpX*cf*dt;
  b.vy += perpY*cf*dt;
}

export function resolveShotStyle(curve){
  if(curve === 1) return 'placed';
  if(curve === -1) return 'trivela';
  return 'normal';
}

export function applyKickCurvePhysics(p, type, dir, curve){
  const passCurveMult = getArchetypePassCurveMult(p, type);
  const shotCurveMult = getArchetypeShotSpecialCurveMult(p, curve);

  if(type === 'shot'){
    const style = resolveShotStyle(curve);
    ball.shotStyle = style;
    if(!curve){
      return {curveFactor: 0, groundFrictionMult: SHOT_NORMAL_FRICTION_MULT};
    }
    const curveDir = curve > 0 ? 1 : -1;
    let cf = curveDir > 0 ? CURVE_ACCEL_SHOT_R1 : -CURVE_ACCEL_SHOT_L2;
    cf *= shotCurveMult;
    const frictionMult = style === 'trivela' ? SHOT_TRIVELA_FRICTION_MULT : SHOT_NORMAL_FRICTION_MULT;
    return {curveFactor: cf, groundFrictionMult: frictionMult};
  }

  const curveDir = curve > 0 ? 1 : curve < 0 ? -1 : 0;
  ball.shotStyle = null;
  const passGroundMult = (type==='pass' || type==='through' || type==='cross') ? 1.08 : 1;
  if(!curveDir) return {curveFactor:0, groundFrictionMult:passGroundMult};
  if(curveDir > 0) return {curveFactor: CURVE_ACCEL_PASS_R1 * passCurveMult, groundFrictionMult:passGroundMult};
  return {curveFactor: -CURVE_ACCEL_PASS_L2 * passCurveMult, groundFrictionMult:passGroundMult};
}

export class Ball{
  constructor(){ this.reset(); }
  reset(x=CENTER.x, y=CENTER.y){
    this.x=x; this.y=y; this.z=0.11;
    this.vx=0; this.vy=0; this.vz=0;
    this.owner=null;
    this.lastTouchTeam=null;
    this.lastTouchedBy=null; // id del ultimo jugador que toco la pelota (effort touch / pases / entradas)
    this.lastKicker=null; // ultimo JUGADOR (no solo equipo) que pateo la pelota: se usa para saber
    // quien convirtio el gol y disparar su festejo
    this.curveFactor=0;       // aceleracion lateral (m/s^2): R1=+ / L2=− respecto al vector de velocidad
    this.initialSpeed=0;      // velocidad horizontal al patear: referencia para decaimiento de curva
    this.curveMaxSpeed=0;     // tope de referencia del pase/tiro con efecto (decaimiento de spin)
    this.curveLineOrigin=null;// origen de la recta del pase (drift cap)
    this.curveLineDir=null;   // direccion inicial del pase
    this.curvePassTarget=null;// punto de llegada estimado (rectificacion final)
    this.curveMaxDrift=0;     // desplazamiento lateral maximo permitido
    this.groundFrictionMult=1;// multiplicador de friccion en el suelo (tiros comunes deslizan mas)
    this.ballDamping=getModeBallDrag();// friccion base del modo (CONFIG[gameMode].ballDrag)
    this.shotStyle=null;      // 'normal' | 'placed' | 'trivela'
    this.rollAngle=0;
    this.passOrigin=null; // punto desde donde se pateo el ultimo PASE limpio (no tackle/rebote): sirve para no robar el cursor en pases cortos
    this.possessedBy=null; // id del jugador con posesion logica durante autopase / effort touch
    this.highKick=false; // true solo tras un tiro o un centro (pase alto): activa la fisica aerea extra
    this.highKickType=null; // 'shot' | 'cross': que configuracion de AERIAL_PHYSICS usar
    this.shotArc=null; // 'dip' | 'rise' | 'miss_high' | null — Time Finish / arco del remate
    this.state = BALL_STATE.FREE;
    this.effortDetach = null;
    this.feintDetach = null;
    this.effortRollSoftT = 0;
    this.backNetContactT = 0;
    this.isInsideGoalTrigger = false;
    this.isTouchingNet = false;
    this.goalNetGravityActive = false;
    this.goalNetTriggerSide = null;
    this.netTouchT = 0;
    this.gravity = GRAVITY;
    this.isGoal = false;
    this.stuckT = 0;
    this.ignorePossessionT = 0;
    this.lastAction = null; // 'effort' | 'feint' | 'goalkeeper_kick'
    this.lastKickType = null; // 'pass' | 'shot' | 'through' | 'cross' — ultimo tipo de patada
    this.gkKickInAir = false;   // true mientras la pelota vuela tras saque de arquero
    this.gkKickOwnerId = null;  // id del arquero que ejecuto el saque
    this.throwInOwnerId = null;     // jugador con la pelota en manos (saque lateral)
    this.throwInBlockOwnerId = null; // sacador bloqueado hasta que otro la controle
    this.setPieceLaunchPos = null;   // {x,y} al soltar la pelota en pelota parada (para medir 1m)
    this.isReadyToKick = false;      // true en saque de arco: pelota colocada, solo pateo con barra
    this.isContested = false;
    this.contestedT = 0;
    this.contestedTacklerId = null;
    this.contestedVictimId = null;
  }
  update(dt, players){
    checkProximityPossession(dt);
    updateBallLoop(dt);
  }
  speed(){ return Math.hypot(this.vx,this.vy,this.vz); }
}

export let PID = 1;
export class Player{
  constructor(team, role, slot, number, posRole = null){
    this.id = PID++;
    this.team = team; // 'home' | 'away'
    this.role = role; // 'GK','DEF','MID','FWD'
    this.posRole = posRole || role; // rol tactico: LB, CDM, CAM, ST, etc.
    this.slot = slot; // posicion base normalizada {x,y} en coordenadas de cancha (para local; away se espeja)
    this.number = number;
    this.appearance = ensurePlayerAppearance(this);
    if(this.appearance?.layers){
      this.appearance.layers.shirtNumber = { id: 'back_number', value: this.number };
    }
    const spawn = team === 'home'
      ? { x: slot.x, y: slot.y }
      : { x: FIELD_L - slot.x, y: FIELD_W - slot.y };
    this.x = spawn.x;
    this.y = spawn.y;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.accelRampDist = 0;
    this.facing = team==='home'? 0 : Math.PI;
    this.dir = {x: Math.cos(this.facing), y: Math.sin(this.facing)}; // direccion normalizada (frente del jugador)
    this.dir = {x: Math.cos(this.facing), y: Math.sin(this.facing)}; // direccion normalizada (frente del jugador)
    this.animPhase = Math.random()*10;
    this.maxSpeedBase = getDefaultMaxSpeedForRole(role);
    this.maxSpeed = this.maxSpeedBase;
    this.accel = physicsConfig.playerAccel ?? 14;
    // PESO: factor de masa individual (con variacion aleatoria por jugador, asi no todos se sienten
    // igual). Los arqueros y defensores son en promedio un poco "mas pesados" (cuesta mas acelerar
    // y cambiar de direccion en seco, pero no resbalan), los delanteros un poco mas livianos/agiles.
    // Se usa en movePlayer (aceleracion/frenado/giro) y en resolveCollisions (empujones).
    this.weightFactor = clamp((role==='GK'?1.08:(role==='DEF'?1.04:(role==='FWD'?0.93:1.0))) + (Math.random()*0.14-0.07), 0.82, 1.22);
    this.leanFwd = 0; // inclinacion visual adelante/atras (suavizada), segun aceleracion y velocidad
    this.leanSide = 0; // inclinacion visual hacia el costado (suavizada), al cambiar de direccion
    this.decisionTimer = Math.random()*0.4;
    this.state = 'idle';
    this.aiMode = 'normal'; // 'normal' | 'idle' | 'passive' | 'positioning' | 'seeking'
    this.aiMode = 'normal'; // 'normal' | 'idle' — congelado en zona de exclusion post-tacle (CPU rival)
    this.chargeStart = 0;
    this.charging = null; // 'shot'|'pass'|'through'|'cross'|'wallpass'
    // Buffer global de accion: input solo setea type/power; la ejecucion ocurre en checkActionExecution
    this.actionBuffer = {type: null, kickType: null, power: 0, chargeStart: 0, curve: 0, manualL2: false, timestamp: 0};
    this.kickoffAnim = null; // maniobra cinematica del saque de centro (giro / retroceso+impacto)
    // PREPARANDO_ACCION (fase 2): tras soltar el boton, si todavia no paso el tiempo minimo de
    // preparacion (PREP_MIN_MS), el pase/tiro queda "en el aire" con estos datos guardados y se
    // ejecuta de verdad recien cuando termina la cuenta regresiva (ver releaseCharge/updatePendingKick)
    this.pendingKick = null; // {type, aimDir, power, curve, remaining, wallPass?}
    // AMAGUE DE TIRO: recorte corto con impulso, cuando se cancela un tiro en preparacion con X
    this.feint = null; // {t, dur, dirX, dirY}
    this.isChargingShot = false; // ventana de amague: true mientras Cuadrado carga tiro (prioridad sobre buffer)
    this.feintActionCooldown = 0; // bloqueo post-amague (300ms): no rematar ni pasar
    this.feintPostPassBlockT = 0; // 300ms post-amague: bloqueo exclusivo de pase tras completar fake shot
    this.fakeShotCooldown = 0;    // 200ms post-fake shot: no reposeer la pelota
    this.fakeShotChaseLockT = 0;  // 300ms: direccion bloqueada hacia la trayectoria del amague
    this.isChargingShot = false; // ventana de amague: true mientras Cuadrado carga tiro (prioridad sobre buffer)
    this.feintActionCooldown = 0; // bloqueo post-amague (300ms): no rematar ni pasar
    this.tackleCooldown = 0;
    this.staminaTired = 0;
    this.releaseCooldown = 0; // tiempo tras patear en el que NO puede reposeer la pelota
    this.passReleaseLockT = 0; // tras pase/filtrado/centro: sin imán automático al balón soltado
    this.stumble = null; // {t, dur} — trastabille breve tras perder la pelota en una entrada/robo
    this.stun = null;    // {t, dur} — impacto: sin input ni seekBall
    this.tackleStunDuration = 0.3;
    this.staggered = null; // {t, dur} — desequilibrio tras perder posesion en un tacle
    this.tackleAnim = null; // {type:'stand'|'slide', t, dur, dirX, dirY, startX, startY, resolved, success}
    this.diveAnim = null; // {t, dur, startX, startY, targetX, targetY, resolved, success} — estirada del arquero
    this.airStrikeAnim = null; // {type, t, dur, action} — golpe aereo en curso
    this.airLock = null;       // {t, dur} — bloqueo de movimiento durante accion aerea (300ms)
    this.stickDir = {x:1, y:0}; // vector del stick al presionar (direccion manual de pase/remate)
    this.wallRun = null; // {active, dir, timer, isParedActive, canChangeDirection, targetPosition, stickWindowT, stickLocked}
    this.isMakingManualRun = false; // true mientras corre el desmarque manual post L1+X
    this.isEffortTouching = false;  // true durante effort touch (R1/R2) y recuperacion
    this.isFakeShooting = false;    // true durante fake shot activo
    this.isTechnicallyBusy = false; // grace period: bloquea fail-safe de proximidad
    this.ghostBallProximityT = 0;   // acumulador para deteccion de pelota fantasma
    this.runningSpeed = 0;          // velocidad de desmarque (clamp, nunca instantanea)
    this.hasRunDirectionLocked = false; // true tras capturar direccion con stick derecho (one-time)
    this.lockedRunVector = null; // direccion fija del desmarque
    this.isPreparingToShoot = false; // tiro de primera: ejecuta al contacto con pelota suelta
    this.defaultForwardVector = null; // fallback hacia el arco rival si no hay input del stick derecho
    this.directionListenTimer = 0;    // ventana (seg) para capturar direccion con stick derecho
    this.manualRunPadIndex = null;    // pad del humano que disparo el desmarque remoto
    this.runTarget = null;  // desmarque: punto objetivo del desmarque en curso
    this.runTimer = 0;      // desmarque: tiempo hasta recalcular el objetivo
    this.iaSeeking = false; // IA_SEEKING: busca un pase suelto en movimiento (recepcion gradual)
    this.targetPosition = null; // {x,y} objetivo de carrera durante IA_SEEKING (se actualiza cada frame)
    this.landingTime = 0;     // seg restantes hasta el pique predicho (recepcion aerea)
    this.seekAerial = false;  // true si el objetivo es el landingPoint, no la pelota en el aire
    this.iaSeekingBrake = false; // flag interno: freno leve al acercarse a la pelota (ver movePlayer)
    this.manualCancelActive = false; // L2+R2 sostenidos: control 100% manual (estilo Cancel de PES)
    this.iaSeeking = false; // IA_SEEKING: busca un pase suelto en movimiento (recepcion gradual)
    this.targetPosition = null; // {x,y} objetivo de carrera durante IA_SEEKING (se actualiza cada frame)
    this.landingTime = 0;     // seg restantes hasta el pique predicho (recepcion aerea)
    this.seekAerial = false;  // true si el objetivo es el landingPoint, no la pelota en el aire
    this.iaSeekingBrake = false; // flag interno: freno leve al acercarse a la pelota (ver movePlayer)
    this.manualCancelActive = false; // L2+R2 sostenidos: control 100% manual (estilo Cancel de PES)
    this.aiState = null; // null | 'intercepting_pass'
    this.interceptPassLockT = 0;
    this.interceptPassDeep = false;
    this.interceptPassTarget = null;
    this.passDetectRadius = PASS_AI.DETECT_RADIUS_DEFAULT;
    this.touchCooldown = 0; // DRIBBLING A TOQUES: tiempo restante (seg) hasta poder darle el proximo toque a la pelota
    this.touchAnim = null;  // {t, dur, leg:1|-1} — animacion de puntapie en curso tras un toque (ver movePlayer/drawNormalPose)
    this.effortTouchCooldown = 0; // cooldown compartido entre effort touch largo y corto
    this.effortTouchAnim = null;  // {t, dur, leg:1|-1, type:'long'|'short'} — postura distinta por tipo
    this.isDribbling = false;     // true mientras conduce; se corta en effort touch / fake shot
    this.isEffortSprinting = false; // legacy: fake shot / recovery sprint
    this.maxSprintVelocity = 0;   // velocidad maxima sin pelota (sprint absoluto)
    this.maxVelocity = 0;         // tope de velocidad activo (sprint o conduccion)
    this.normalDribbleSpeed = 0;  // velocidad normal de conduccion (con pelota)
    this.effortSprintDir = null;  // vector normalizado del stick der. al toque
    this.effortChaseTarget = null; // legacy: ya no se usa como destino fijo en R2
    this.effortExitBlendT = 0;    // blend de velocidad al salir del esfuerzo/finta
    this.effortExitMoveDir = null;
    this.effortTouchDefenderFreezeT = 0; // freeze IA defensiva post effort touch (rival)
    this.effortTouchCooldown = 0; // cooldown compartido entre effort touch largo y corto
    this.effortTouchAnim = null;  // {t, dur, leg:1|-1, type:'long'|'short'} — postura distinta por tipo
    this.isDribbling = false;     // true mientras conduce; se corta en effort touch / fake shot
    this.canCollectBall = true;   // permiso explicito de agarre (se desactiva durante effort/fake shot)
    this.canCollectBlockT = 0;    // cuenta regresiva de bloqueo post self-touch (500ms)
    this.selfTouchBrakeT = 0;     // freno momentaneo al soltar el toque
    this.canCollectBlockT = 0;    // cuenta regresiva de bloqueo post self-touch (500ms)
    this.selfTouchBrakeT = 0;     // freno momentaneo al soltar el toque
    this.isStunned = false;       // flag de aturdimiento; se limpia al terminar post-accion
    this.lockPlayerAssignment = false; // forced_chase: bloquea cambio de jugador controlado
    this.lockPlayerAssignmentT = 0;    // seg restantes del lock (1s o hasta contacto)
    this.turnTouch = null;  // {t, dur, dir} — estado de transicion (100ms) al girar bruscamente con la pelota (ver movePlayer)
    this.legIdleBlend = 0;  // 0..1 — que tanto de la amplitud normal de zancada se muestra (se desvanece al frenar)
    // EL LATIGAZO: ventana explosiva de contacto pie-pelota al patear (shot/pass/through/cross).
    // Se dispara en executeKick() y se consume en drawSkeletalPlayer(): en este lapso el muslo/
    // pantorrilla/pie de la pierna que patea (kickAnim.leg) dejan de seguir el ciclo de carrera
    // normal y siguen su propia curva de latigazo (carga->impacto->punta->recuperacion), mientras
    // el torso se inclina hacia atras y despues "acompaña" el golpe hacia adelante.
    this.kickAnim = null; // {t, dur, leg:1|-1, power, type}
    this.timedShot = null; // Time Finish windup: {power, curve, aimDir, t, impactAt, window, timeFinishHit}
    this.possessionType = null; // solo GK: 'feet' | 'hands' | 'free' (transitorio durante saque)
    this.gkFeetPossessT = 0;    // tiempo acumulado en modo pies (auto-transicion a manos)
    this.handsTimer = 0;        // ms restantes con pelota en manos (5000 al atrapar)
    this.gkKickAnim = null;     // {type:'dropkick'|'throw', t, dur, dir, impulseApplied}
    this.gkBallCollidable = role === 'GK'; // siempre solido frente a la pelota (nunca non-collidable)
    this.isThrowingIn = false;   // true en la linea de banda, preparando saque lateral
    this.throwInAnim = null;     // {phase, t, windDur, releaseDur, force, dir, impulseApplied}
    this.canMove = true;         // false durante pelota parada: bloquea el stick de movimiento
    this.isStuck = false;        // true mientras el sacador espera ejecutar / hasta 1m post-saque
    this.blockDribbling = false; // true en esquina con pelota: impide conduccion
    this.inSetPieceZone = false; // true si esta en la zona designada para ejecutar
    this.interceptionReactT = 0; // seg restantes antes de reaccionar a pelota suelta (100-300ms)
    this.interceptionSeek = false; // true mientras persigue una pelota libre elegible
    this.isAttackingBall = false;  // true solo al perseguir pelota SUELTA; prohibido con rival en posesion
    this.currentDribbleDistance = 0.38; // distancia actual pelota-jugador (lerp)
    this.targetDribbleDistance = 0.38;  // objetivo de offset de conduccion
    this.dribbleKickDir = null;         // direccion del toque extendido {x,y}
    this.dribbleExtendT = 0;            // cuenta regresiva del modifier activo (fake/effort)
    this.playerMeshDir8 = 'S';          // pose visual cuantizada (8 direcciones)
    this.moveInputDir = {x:0, y:0};     // input del stick capturado en movePlayer
  }
  targetSlotWorld(){
    // convierte slot normalizado (para home, atacando hacia +x) a coords reales.
    if(this.team==='home') return {x:this.slot.x, y:this.slot.y};
    return {x: FIELD_L-this.slot.x, y: FIELD_W-this.slot.y};
  }
  attackDir(){ return this.team==='home'? 1 : -1; }
  ownGoalX(){ return this.team==='home'? 0 : FIELD_L; }
  oppGoalX(){ return this.team==='home'? FIELD_L : 0; }
  takePossession(possessSource, force = false){
    resetTechnicalActionFlags(this);
    this.ghostBallProximityT = 0;
    if(force){
      this.canCollectBlockT = 0;
      if(!this.isStunned && !this.stun) this.canCollectBall = true;
      ball.ignorePossessionT = 0;
    }
    this.tackleCooldown = TACKLE_COOLDOWN * 0.75;
    this.touchCooldown = 0.12;
    this.charging = null;
    clearPassTargetTeam(this.team === 'home' ? 'away' : 'home');
    const gkSource = isGoalkeeper(this) ? (possessSource || inferGkPossessionSource(this)) : null;
    if(force){
      const savedRelease = this.releaseCooldown;
      this.releaseCooldown = 0;
      const ok = assignBallPossession(this, gkSource);
      if(!ok) this.releaseCooldown = savedRelease;
      else{
        clearInterceptionSeek(this);
        ball.lastTouchTeam = this.team;
      }
      return ok;
    }
    if(!this.canCollectBall || this.releaseCooldown > 0 || isPossessionIgnored()) return false;
    const ok = assignBallPossession(this, gkSource);
    if(ok){
      clearInterceptionSeek(this);
      ball.lastTouchTeam = this.team;
    }
    return ok;
  }
}

/* ============================================================
   FORMACIONES (coordenadas para el equipo que ataca hacia +x / home)
   ============================================================ */
export const FORMATION_6VS6 = [
  {role:'GK',  posRole:'GK',  slot:{x:5,  y:34}, n:1},
  {role:'DEF', posRole:'LCB', slot:{x:24, y:19}, n:2},
  {role:'DEF', posRole:'RCB', slot:{x:24, y:49}, n:3},
  {role:'MID', posRole:'CM',  slot:{x:48, y:34}, n:6},
  {role:'FWD', posRole:'ST',  slot:{x:68, y:19}, n:9},
  {role:'FWD', posRole:'ST',  slot:{x:68, y:49}, n:10},
];

// 4-1-2-1-2: linea de 4, pivote (CDM), dos medios (CM), enganche (CAM), dos delanteros (ST)
export const FORMATION_11VS11 = [
  {role:'GK',  posRole:'GK',  slot:{x:5,  y:34}, n:1},
  {role:'DEF', posRole:'LB',  slot:{x:22, y:10}, n:2},
  {role:'DEF', posRole:'LCB', slot:{x:22, y:24}, n:3},
  {role:'DEF', posRole:'RCB', slot:{x:22, y:44}, n:4},
  {role:'DEF', posRole:'RB',  slot:{x:22, y:58}, n:5},
  {role:'MID', posRole:'CDM', slot:{x:38, y:34}, n:6},
  {role:'MID', posRole:'CM',  slot:{x:52, y:16}, n:7},
  {role:'MID', posRole:'CM',  slot:{x:52, y:52}, n:8},
  {role:'MID', posRole:'CAM', slot:{x:62, y:34}, n:9},
  {role:'FWD', posRole:'ST',  slot:{x:76, y:20}, n:10},
  {role:'FWD', posRole:'ST',  slot:{x:76, y:48}, n:11},
];

// Posiciones de arranque en saque de centro (mitad propia agrupada; ST cerca del centro)
export const StartingPositionTable = {
  '6vs6': {
    1:  {x:5,  y:34},
    2:  {x:18, y:19},
    3:  {x:18, y:49},
    6:  {x:28, y:34},
    9:  {x:48, y:19},
    10: {x:48, y:49},
  },
  '11vs11': {
    1:  {x:6,  y:34},
    2:  {x:14, y:10},
    3:  {x:14, y:24},
    4:  {x:14, y:44},
    5:  {x:14, y:58},
    6:  {x:20, y:34},
    7:  {x:26, y:14},
    8:  {x:26, y:54},
    9:  {x:30, y:34},
    10: {x:49, y:20},
    11: {x:49, y:48},
  },
};

export const FORMATIONS = {
  '6vs6': FORMATION_6VS6,
  '11vs11': FORMATION_11VS11,
};

export function buildTeam(team, formationKey = '6vs6'){
  const arr = [];
  const F = FORMATIONS[formationKey] || FORMATION_6VS6;
  const sx = FIELD_L / BASE_FIELD_L;
  const sy = FIELD_W / BASE_FIELD_W;
  F.forEach(f=>{
    const slot = {x: f.slot.x * sx, y: f.slot.y * sy};
    const p = new Player(team, f.role, slot, f.n, f.posRole || f.role);
    p.appearance = ensurePlayerAppearance(p);
    applyArchetypeToPlayer(p);
    assignPlayerDisplayName(p, team === 'home' ? 0 : 1);
    arr.push(p);
  });
  return arr;
}

export function rebuildTeamsForMode(formationKey = '6vs6'){
  PID = 1;
  homeTeam = buildTeam('home', formationKey);
  awayTeam = buildTeam('away', formationKey);
  syncAllPlayersList();
}

export let homeTeam = buildTeam('home', '6vs6');
export let awayTeam = buildTeam('away', '6vs6');
export let allPlayers = [...homeTeam, ...awayTeam];

export function setGameMode(modeId){
  const preset = PHYSICS_PRESETS[modeId] || PHYSICS_PRESETS['6vs6'];
  loadModePhysics(preset.id);
  physicsConfig = {...preset};
  const goalScale = preset.goalScaleMult ?? preset.worldScale ?? 1;
  applyMatchWorldScale(preset.worldScale ?? 1, preset.viewExtentMult ?? 1, goalScale);
  applyMatchCamera(preset);
  rebuildFieldGeometry();
  Game.matchFormat = preset.id;
  rebuildTeamsForMode(preset.formationKey);
  applyPhysicsToPlayers();
  // 11v11: IA táctica completa en campo reglamentario. 6v6: CPU más pasiva (marcaje/líneas).
  setIsManualMode(preset.id !== '11vs11');
}

export { loadModePhysics, getActiveModePhysics, getActiveModeId, getModeTackleDistance, getModeBallDrag, getModePowerMultiplier, getModeBallDragFrictionScale, getBallDragFrictionScaleForBall } from './modePhysics.js';

export const ball = new Ball();

export const KICKOFF_TAKER_BALL_OFFSET = 0.85;

export const KickoffManager = {
  timer: 0,
  executed: false,
  occupationTimer: 0,
  occupationTeam: null,
  holdingCmId: null,
};

/** Bloqueo de inicio: hasta que la pelota salga del sacador, solo el sacador la controla. */
export const GameStartLock = {
  active: false,
  kickerId: null,
};

export function isGameStartLockActive(){
  return !!(GameStartLock.active && isKickoffWaiting());
}

export function enterGameStartLock(kickerId){
  GameStartLock.active = true;
  GameStartLock.kickerId = kickerId ?? null;
}

export function releaseGameStartLock(){
  GameStartLock.active = false;
  GameStartLock.kickerId = null;
  clearRestartRestrictions();
}

/** Pelota suelta durante saque de centro (p. ej. maniobra larga): cualquiera puede interceptar. */
export function isKickoffBallContestable(){
  if(!isKickoffWaiting()) return false;
  return !ball.owner && ball.state !== BALL_STATE.IN_POSSESSION && ball.state !== BALL_STATE.PLACED;
}

export function getGkKickForceMult(){
  if(Game.matchFormat === '11vs11') return 1.4;
  return getModePowerMultiplier();
}

export function isGkKickManualOnly(){
  return Game.matchFormat === '11vs11';
}

export function getKickoffStartingPosition(p, formationKey = '11vs11'){
  const sx = FIELD_L / BASE_FIELD_L;
  const sy = FIELD_W / BASE_FIELD_W;
  const table = StartingPositionTable[formationKey];
  const entry = table?.[p.number];
  let slot;
  if(entry){
    slot = {x: entry.x * sx, y: entry.y * sy};
  } else {
    // Usar slot de formación en coords home (sin espejar). El espejo se aplica al final.
    // NO usar targetSlotWorld(): ya está espejado y provocaría doble espejo en away.
    const raw = p.slot;
    const isStriker = p.posRole === 'ST' || (p.role === 'FWD' && p.posRole !== 'CAM');
    if(p.role === 'GK'){
      slot = { x: 5 * sx, y: (raw?.y ?? CENTER.y) };
    } else if(isStriker){
      slot = { x: raw.x, y: raw.y };
    } else {
      const halfLimit = CENTER.x - KICKOFF_HALF_MARGIN;
      slot = {
        x: Math.min(raw.x, halfLimit),
        y: raw.y,
      };
    }
  }
  // Arquero: siempre anclado cerca de su arco (nunca línea media).
  if(p.role === 'GK'){
    slot = { x: Math.min(slot.x, 8 * sx), y: slot.y };
  }
  if(p.team === 'home') return slot;
  return {x: FIELD_L - slot.x, y: FIELD_W - slot.y};
}

export function updateKickoffOccupationTimer(dt){
  if(KickoffManager.occupationTimer <= 0) return;
  KickoffManager.occupationTimer = Math.max(0, KickoffManager.occupationTimer - dt);
  if(KickoffManager.occupationTimer <= 0){
    KickoffManager.occupationTeam = null;
    KickoffManager.holdingCmId = null;
  }
}

export function isKickoffOccupationActive(team){
  return KickoffManager.occupationTimer > 0 && KickoffManager.occupationTeam === team;
}

function getKickoffHoldingCm(team){
  if(KickoffManager.holdingCmId){
    const cached = allPlayers.find(pl => pl.id === KickoffManager.holdingCmId);
    if(cached && cached.team === team && cached.posRole === 'CM') return cached;
  }
  const cms = (team === 'home' ? homeTeam : awayTeam).filter(pl => pl.posRole === 'CM');
  if(!cms.length) return null;
  const dir = team === 'home' ? 1 : -1;
  const holding = cms.reduce((a, b) => {
    const ax = a.targetSlotWorld().x * dir;
    const bx = b.targetSlotWorld().x * dir;
    return ax < bx ? a : b;
  });
  KickoffManager.holdingCmId = holding.id;
  return holding;
}

export function applyKickoffOccupationTarget(p, target){
  if(Game.setPieceMode && !Game.isBallInPlay) return target;
  if(!isKickoffOccupationActive(p.team)) return target;
  const mustHold = p.posRole === 'CAM' || (p.posRole === 'CM' && getKickoffHoldingCm(p.team) === p);
  if(!mustHold) return target;
  const dir = p.attackDir();
  const ballLine = ball.x - dir * 1.2;
  return {
    x: dir > 0 ? Math.min(target.x, ballLine) : Math.max(target.x, ballLine),
    y: target.y,
  };
}

export function isKickoffActive(){
  return Game.matchState === STATE_KICKOFF;
}

export function isKickoffWaiting(){
  return isKickoffActive() && !Game.isBallInPlay;
}

export function isKickoffTaker(p){
  return !!(p && isKickoffWaiting() && Game.kickoffTakerId === p.id);
}

export function isKickoffDefendingTeam(team){
  return isKickoffWaiting() && team !== Game.kickoffTeam;
}

export function getKickoffDefendingTeam(){
  if(!Game.kickoffTeam) return null;
  return Game.kickoffTeam === 'home' ? 'away' : 'home';
}

export function getKickoffTaker(){
  if(!Game.kickoffTakerId) return null;
  return allPlayers.find(p => p.id === Game.kickoffTakerId) || null;
}

export function getKickoffBallPosition(){
  return { x: CENTER.x, y: CENTER.y };
}

export function getKickoffTakerWorldPosition(taker){
  if(!taker) return getKickoffBallPosition();
  return {
    x: CENTER.x + (taker.team === 'home' ? -KICKOFF_TAKER_BALL_OFFSET : KICKOFF_TAKER_BALL_OFFSET),
    y: CENTER.y,
  };
}

// Teletransporte duro: mata inercia y ancla al sacador junto al punto central (sin interpolacion).
export function teleportKickoffTakerHard(taker){
  if(!taker) return;
  if(taker.kickoffAnim) return;
  taker.vx = 0;
  taker.vy = 0;
  taker.state = STATE_FIXED;
  const pos = getKickoffTakerWorldPosition(taker);
  taker.x = pos.x;
  taker.y = pos.y;
  taker.facing = getKickoffFacingOwnGoal(taker);
  syncPlayerDir(taker);
}

export function getKickoffFacingOwnGoal(taker){
  return taker.team === 'home' ? Math.PI : 0;
}

export function getKickoffFacingAttack(taker){
  return taker.team === 'home' ? 0 : Math.PI;
}

export function isKickoffManeuverActive(p){
  return !!(p && p.kickoffAnim);
}

export function clampKickoffTakerManeuverPosition(p){
  if(!p) return;
  p.y = CENTER.y;
  const circleR = CCIRCLE_R - 0.45;
  const dx = p.x - CENTER.x;
  if(Math.abs(dx) > circleR){
    p.x = CENTER.x + Math.sign(dx) * circleR;
  }
  if(p.team === 'home') p.x = Math.min(p.x, CENTER.x - 0.1);
  else p.x = Math.max(p.x, CENTER.x + 0.1);
  p.vy = 0;
}

export function positionKickoffTaker(taker){
  if(!taker) return;
  teleportKickoffTakerHard(taker);
}

export function lockKickoffTaker(taker){
  if(!taker) return;
  teleportKickoffTakerHard(taker);
  taker.inSetPieceZone = true;
  taker.canMove = false;
  taker.isStuck = true;
  taker.blockDribbling = true;
}

export function clearKickoffTakerState(p){
  if(!p) return;
  p.kickoffAnim = null;
  clearPlayerSetPieceState(p);
}

export function maintainKickoffPlacement(){
  if(!isKickoffWaiting()) return;
  if(isKickoffBallContestable()) return;
  const taker = getKickoffTaker();
  if(!taker) return;
  if(isKickoffManeuverActive(taker)) return;
  const ballPos = getKickoffBallPosition();
  ball.x = ballPos.x;
  ball.y = ballPos.y;
  ball.z = BALL_RADIUS;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  teleportKickoffTakerHard(taker);
  if(ball.owner !== taker){
    if(!setBallStateInPossession(taker)){
      ball.owner = taker;
      ball.state = BALL_STATE.IN_POSSESSION;
      ball.lastTouchedBy = taker.id;
      ball.lastTouchTeam = taker.team;
    }
  }
  ball.lastTouchTeam = taker.team;
  lockKickoffTaker(taker);
}

export function clampKickoffDefenderPosition(p){
  const halfLimit = p.team === 'home'
    ? CENTER.x - KICKOFF_HALF_MARGIN
    : CENTER.x + KICKOFF_HALF_MARGIN;
  let x = p.x;
  let y = p.y;

  if(p.team === 'home') x = Math.min(x, halfLimit);
  else x = Math.max(x, halfLimit);

  const dx = x - CENTER.x;
  const dy = y - CENTER.y;
  const dist = Math.hypot(dx, dy);
  const minDist = CCIRCLE_R + KICKOFF_CIRCLE_MARGIN;
  if(dist < minDist){
    const ang = dist > 0.01 ? Math.atan2(dy, dx) : (p.team === 'home' ? Math.PI : 0);
    x = CENTER.x + Math.cos(ang) * minDist;
    y = CENTER.y + Math.sin(ang) * minDist;
    if(p.team === 'home') x = Math.min(x, halfLimit);
    else x = Math.max(x, halfLimit);
  }

  if(x !== p.x || y !== p.y){
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
  }
}

export function resetKickoffManager(){
  KickoffManager.timer = 0;
  KickoffManager.executed = false;
  KickoffManager.occupationTimer = 0;
  KickoffManager.occupationTeam = null;
  KickoffManager.holdingCmId = null;
  releaseGameStartLock();
}

export function enterKickoffState(kickingTeam, takerId){
  Game.matchState = STATE_KICKOFF;
  Game.kickoffTeam = kickingTeam;
  Game.kickoffTakerId = takerId;
  Game.isBallInPlay = false;
  enterGameStartLock(takerId);
  KickoffManager.timer = SET_PIECE_TIMER_DURATION;
  KickoffManager.executed = false;
  maintainKickoffPlacement();
}

export function exitKickoffToPlaying(){
  cleanupKickoffState(getKickoffTaker());
}

// Limpieza inmediata post-saque: mismo frame que executeKick, sin cooldown de input.
export function cleanupKickoffState(taker){
  if(Game.matchState !== STATE_KICKOFF) return;

  resetSetPieceCharge();
  Game.isCharging = false;
  Game.isChargingShot = false;

  for(const p of allPlayers){
    if(clearChargingShotState) clearChargingShotState(p);
    else {
      p.isChargingShot = false;
      p.charging = null;
      p.chargeStart = 0;
    }
    clearPlayerPendingAction(p);
    clearPlayerSetPieceState(p);
    p.inSetPieceZone = false;
    p.pendingKick = null;
  }

  const kicker = taker || getKickoffTaker();
  if(kicker){
    clearKickoffTakerState(kicker);
    registerRestartKick(kicker);
  }

  KickoffManager.occupationTeam = Game.kickoffTeam;
  KickoffManager.occupationTimer = KICKOFF_OCCUPATION_DURATION;
  KickoffManager.holdingCmId = null;

  Game.matchState = STATE_PLAYING;
  Game.kickoffTeam = null;
  Game.kickoffTakerId = null;
  Game.isBallInPlay = true;
  releaseGameStartLock();
  KickoffManager.executed = true;
  KickoffManager.timer = 0;
}

export function onKickoffReleased(){
  if(!isKickoffWaiting()) return;
  cleanupKickoffState(getKickoffTaker());
}

export function executeAutoKickoff(){
  if(!isKickoffWaiting() || KickoffManager.executed) return;
  const taker = getKickoffTaker() || ball.owner;
  if(!taker || taker.team !== Game.kickoffTeam) return;
  if(taker.kickoffAnim) return;
  maintainKickoffPlacement();

  if(startKickoffManeuver){
    startKickoffManeuver(taker, 'pass', 0.38, 0, { x: taker.attackDir(), y: (Math.random() - 0.5) * 0.2 });
    return;
  }

  const dir = norm({
    x: taker.attackDir(),
    y: (Math.random() - 0.5) * 0.28,
  });
  executeKick(taker, 'pass', dir, 0.45 + Math.random() * 0.2, 0);
}

export function updateKickoffManager(dt){
  if(!isKickoffWaiting()) return;
  const taker = getKickoffTaker();
  if(taker?.kickoffAnim){
    if(isKickoffBallContestable()) releaseGameStartLock();
    return;
  }
  maintainKickoffPlacement();
  if(KickoffManager.executed) return;
  KickoffManager.timer = Math.max(0, KickoffManager.timer - dt);
  if(KickoffManager.timer <= 0) executeAutoKickoff();
}

export function placeKickoff(kickingTeam){
  const formationKey = Game.matchFormat === '11vs11' ? '11vs11' : '6vs6';
  allPlayers.forEach(p=>{
    const s = getKickoffStartingPosition(p, formationKey);
    // en el saque de mitad de cancha el equipo se agrupa en su mitad (StartingPositionTable),
    // excepto los dos delanteros que quedan mas adelante cerca del centro para recibir el pase.
    const isStriker = p.posRole === 'ST' || (p.role === 'FWD' && p.posRole !== 'CAM');
    let kx = s.x;
    if(p.role === 'GK'){
      // Forzar arquero en su área (nunca mitad de cancha).
      kx = s.x;
    } else if(!isStriker || p.team !== kickingTeam){
      kx = p.team==='home'
        ? Math.min(s.x, CENTER.x - KICKOFF_HALF_MARGIN)
        : Math.max(s.x, CENTER.x + KICKOFF_HALF_MARGIN);
    } else if(p.team === kickingTeam){
      // delanteros del equipo sacador: pueden quedar cerca de la linea central
      const forwardLimit = p.team === 'home'
        ? CENTER.x - 0.5
        : CENTER.x + 0.5;
      kx = p.team === 'home' ? Math.min(s.x, forwardLimit) : Math.max(s.x, forwardLimit);
    }
    p.x = kx; p.y = s.y; p.vx=0; p.vy=0;
    p.facing = p.team==='home'?0:Math.PI;
    syncPlayerDir(p);
    syncPlayerDir(p);
    // limpia cualquier animacion o estado en curso (entrada, estirada, golpe aereo, carrera de
    // la pared, carga de pase/tiro, desmarque) para que no "tire" al jugador de vuelta a la
    // posicion/animacion vieja y arruine el reacomodo a la formacion inicial
    p.tackleAnim = null;
    p.diveAnim = null;
    p.airStrikeAnim = null;
    p.airLock = null;
    p.airLock = null;
    p.wallRun = null;
    p.isMakingManualRun = false;
    p.isEffortTouching = false;
    p.isFakeShooting = false;
    p.isTechnicallyBusy = false;
    p.ghostBallProximityT = 0;
    p.hasRunDirectionLocked = false;
    p.lockedRunVector = null;
    p.isPointingForPass = false;
    p.pointingForPassT = 0;
    p.defaultForwardVector = null;
    p.directionListenTimer = 0;
    p.manualRunPadIndex = null;
    p.charging = null;
    p.chargeStart = 0;
    clearPlayerPendingAction(p);
    p.pendingKick = null;
    p.feint = null;
    p.isChargingShot = false;
    p.feintActionCooldown = 0;
    p.feintPostPassBlockT = 0;
    p.dragBack = null;
    p.kickAnim = null;
    p.pendingKick = null;
    p.feint = null;
    p.isChargingShot = false;
    p.feintActionCooldown = 0;
    p.dragBack = null;
    p.kickAnim = null;
    p.celebAnim = null;
    p.tackleCooldown = 0;
    p.stumble = null;
    p.stun = null;
    p.staggered = null;
    p.releaseCooldown = 0;
    p.runTarget = null;
    p.runTimer = 0;
    p.iaSeeking = false;
    p.targetPosition = null;
    p.landingTime = 0;
    p.seekAerial = false;
    p.manualCancelActive = false;
    p.lockPlayerAssignment = false;
    p.lockPlayerAssignmentT = 0;
    p.isThrowingIn = false;
    p.throwInAnim = null;
    clearPlayerSetPieceState(p);
    p.interceptionReactT = 0;
    p.interceptionSeek = false;
    p.isAttackingBall = false;
    p.effortTouchDefenderFreezeT = 0;
    p.dribbleKickDir = null;
    p.effortExitBlendT = 0;
    p.effortExitMoveDir = null;
    p.dribbleExtendT = 0;
    clearEffortSprintState(p);
    const defDist = getDefaultDribbleDistance(p);
    p.currentDribbleDistance = defDist;
    p.targetDribbleDistance = defDist;
    p.decisionTimer = Math.random()*0.4;
    p.state = 'idle';
  });
  Game.passTargetHome = null;
  Game.passTargetAway = null;
  Game.goalRoll = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;
  Game.deadBall = null;
  Game.pendingTacklePossession = null;
  tacklePossessToken++;
  resetGoalZoneTracking();
  Game.isGoalScored = false;
  ball.reset(CENTER.x, CENTER.y);
  const squad = kickingTeam === 'home' ? homeTeam : awayTeam;
  const starter = squad.reduce((a, b) => dist2D(a, CENTER) < dist2D(b, CENTER) ? a : b);
  teleportKickoffTakerHard(starter);
  setBallStateInPossession(starter);
  if(ball.owner !== starter){
    ball.owner = starter;
    ball.state = BALL_STATE.IN_POSSESSION;
    ball.lastTouchedBy = starter.id;
    ball.lastTouchTeam = kickingTeam;
  }
  ball.lastTouchTeam = kickingTeam;
  lockKickoffTaker(starter);
  enterKickoffState(kickingTeam, starter.id);
  if(kickingTeam === 'home') setControlled(starter);
  else if(Game.twoPlayerMode) setControlled2(starter);
  enforceKickoffPositionRestrictions();
}

/* ============================================================
   ARENA DE PRACTICA — usa las mismas entidades/fisica/IA que el partido normal (Player, Ball,
   aiDecide del arquero, checkGoalsAndBounds), solo que aca no hay dos equipos jugando: un unico
   jugador humano (del equipo 'home') practica remates contra el arquero rival, con la camara
   en tercera persona de PCAM/projectPractice. El resto del plantel se aparca fuera de cuadro.
   ============================================================ */
export const PRACTICE_SHOT_X = FIELD_L - 26; // punto de partida: ~26m del arco objetivo, distancia comoda para practicar remates/centros
export function setupPractice(){
  gameState = 'practice';
  // running se activa al final de startPractice* cuando la escena 2D ya está lista
  Game.running = false;
  isPaused = false;
  Game.paused = false;
  Game.matchEnded = false;
  Game.celebration = null;
  Game.celebrationRun = null;
  Game.crossMarker = null;
  Game.passTargetHome = null;
  Game.passTargetAway = null;
  clearAirSpamUiState();
  Game.goalRoll = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;
  Game.deadBall = null;
  Game.practiceMode = 'penalty';
  Game.practicePenaltyRole = 'kick';
  // No forzar null aquí: startPractice* reemplaza la escena de forma atómica.
  resetGoalZoneTracking();
  Game.isGoalScored = false;
  Game.twoPlayerMode = false;
  Game.controlledId2 = null;

  practicePlayer = homeTeam.find(pl=>pl.role==='FWD') || homeTeam[0];
  practiceGK = awayTeam.find(pl=>pl.role==='GK') || awayTeam[0];

  allPlayers.forEach(pl=>{
    if(pl===practicePlayer || pl===practiceGK) return;
    pl.x = -60; pl.y = -60; pl.vx = 0; pl.vy = 0;
    pl.tackleAnim = null; pl.diveAnim = null; pl.airStrikeAnim = null; pl.wallRun = null;
    pl.isMakingManualRun = false; pl.hasRunDirectionLocked = false; pl.lockedRunVector = null;
    pl.isPointingForPass = false; pl.pointingForPassT = 0;
    pl.defaultForwardVector = null; pl.directionListenTimer = 0;     pl.manualRunPadIndex = null;
    pl.gkKickAnim = null; pl.gkKickAnim = null;
    pl.charging = null; pl.stumble = null; pl.stun = null; pl.staggered = null; pl.state = 'idle';
  });

  setControlled(practicePlayer);
}

export function finishPracticeSceneBoot(){
  Game.running = true;
  Game.isDeadBall = false;
  Game.deadBall = null;
  Game.outOfPlay = null;
  Game.goalRoll = null;
  Game.isGoalScored = false;
}
// reubica a jugador/arquero/pelota en la posicion inicial de practica, sin salir del modo.
export function resetPractice(){
  setupPractice();
}

// gol convertido en entrenamiento: no suma marcador ni dispara festejo,
// solo un cartel breve y se reinicia la jugada de práctica.
export function practiceGoal(){
  if(Game.goalRoll) return; // isGoalScored ya bloquea cobros multiples
  Game.goalRoll = {
    team: 'home',
    kicker: practicePlayer,
    ownGoal: false,
    t: 0,
    practice: true,
    bannerText: '¡GOL!',
    bannerMs: 1100,
    bannerShown: false,
  };
}

/* ============================================================
   ESTADO GLOBAL DEL JUEGO — 'menu' | 'match' | 'practice' | 'celebration_run'
   (isCelebrationMode: 5 s de carrera libre del goleador + festejos opcionales A/B/X/Y)
   ============================================================ */
export let gameState = 'menu';
export let isCelebrationMode = false; // 5 s de carrera libre + festejos opcionales tras un gol
export let isPaused = false;
export let practicePlayer = null; // jugador humano en la Arena de Practica (siempre del equipo 'home')
export let practiceGK = null;     // arquero rival que ataja en la Arena de Practica

/* ============================================================
   ESTADO DE PARTIDO
   ============================================================ */
export const Game = {
  score:{home:0, away:0},
  time: 5*60,
  paused:false,
  running:false,
  controlledId: null,
  manualOverrideUntil: 0,
  lastSwitchAt: 0,
  banner:null,
  bannerUntil:0,
  matchFormat: '6vs6',    // '6vs6' | '11vs11' — formato activo del partido
  worldScale: 1,          // multiplicador de escala de cancha (1.6 en 11vs11)
  uiActive: false,        // true mientras un menú overlay consume el input
  uiModeActive: false,    // true: PlayerController ignorado (Input Stack UI)
  uiNavigationActive: false, // true: modo UI_NAVIGATION (menú / gamepad conectado)
  twoPlayerMode:false,   // true: jugador 2 controla al equipo VISITA con otro joystick (o teclado alternativo)
  controlledId2: null,
  pressureCursorHome: null,
  pressureCursorAway: null,
  timeFinishFlash: null,
  manualOverrideUntil2: 0,
  effortSwitchLockPlayerHome: null, // id: bloquea cambio por RS mientras dura effort touch
  effortSwitchLockPlayerAway: null,
  p1PadIndex: null,
  p2PadIndex: null,
  padsLocked: false,   // una vez arranca el partido en modo 2P, la asignacion de mandos queda fija (no se reordena sola)
  padSwap: false,       // invierte cual mando detectado es Jugador 1 / Jugador 2
  matchEnded: false,    // true cuando se cumplieron los 5 minutos: el partido queda trabado en el resultado final
  celebration: null,    // legacy: animacion elegida post-celebration_run (ya no inicia sola)
  celebrationRun: null, // {scorer, scoringTeam, timerMs} — carrera libre post-gol
  crossMarker: null,    // {x, y, t} — cruz amarilla que marca donde va a picar el ultimo centro (boton circulo)
  landingPoint: null,   // {x, y, t} — prediccion de pique mientras la pelota esta en el aire
  passTargetHome: null, // id del jugador objetivo del ultimo pase del equipo local (IA_SEEKING por defecto)
  passTargetAway: null, // id del jugador objetivo del ultimo pase del equipo visita
  airDuel: null,        // duelo aereo activo (spam-battle)
  isAirSpamWindowActive: false, // bandera UI: ventana de spam visible
  goalRoll: null,         // inercia post-gol: la pelota entra a la red antes del festejo (ver updateGoalRoll)
  outOfPlay: null,        // saque precalculado al cruzar linea de cal; dispara cinematica de inmediato
  isDeadBall: false,      // true desde onBallOut() hasta reanudar el juego
  deadBall: null,         // {type, team, x, y, t} — contador/cinematica de saque (t arranca en onBallOut)
  isChargingShot: false,  // ventana de interrupcion de amague (fake shot): true mientras se carga tiro
  isCharging: false,      // carga de potencia en segundo plano (no altera state del jugador)
  isGoal: false,          // true cuando GoalZone valida un gol real
  isGoalScored: false,    // bloquea cobros multiples; solo se limpia en el saque de centro (kickoff)
  goalZoneInside: { left: false, right: false },  // estado previo del trigger GoalZone
  goalZonePassed: { left: false, right: false },  // pelota ya entro en GoalZone (habilita red)
  isBallLocked: false,    // lock global de posesion durante effort touch (500ms)
  ballLockOwnerId: null,  // playerID que inicio el effort touch
  ballLockT: 0,           // segundos restantes del lock
  pendingTacklePossession: null, // {tacklerId, token, until} — reserva posesion post-tacle
  throwIn: null,        // {active, team, side, x, y} — saque lateral en curso
  setPieceMode: false,  // true mientras un sacador esta bloqueado esperando ejecutar
  setPiece: null,       // {type, team, side, takerId} — pelota parada activa
  setPieceScene: null,  // escena especial de penal / tiro libre lejano
  practiceMode: 'penalty', // 'penalty' | 'penalty_save' | 'free_kick' | 'fk_place'
  practicePenaltyRole: 'kick', // 'kick' | 'save'
  matchState: STATE_PLAYING, // STATE_PLAYING | STATE_KICKOFF
  kickoffTeam: null,    // equipo que saca durante STATE_KICKOFF
  kickoffTakerId: null, // sacador designado en el saque de centro
  isBallInPlay: true,   // false hasta que el sacador golpee/lance la pelota
  isInputLocked: false, // true durante GLOBAL_REINSTATEMENT_COOLDOWN tras reanudar desde bola muerta
  globalReinstatementCooldownT: 0, // seg restantes del bloqueo de pase/tiro post-reanudacion
  lastTouchPlayerID: null,       // sacador del reinicio: bloqueado hasta que otro toque la pelota
  restartRestrictionsActive: false, // true mientras aplican reglas de saque manual
  wasInterceptionEligible: false, // borde de deteccion para asignar randomDelay a la IA
  nearestSeekerHome: null,        // id del CPU mas cercano a la pelota (equipo local)
  nearestSeekerAway: null,        // id del CPU mas cercano a la pelota (equipo visita)
  nearestSeekerTimerHome: 0,      // cuenta regresiva antes de recalcular (hysteresis)
  nearestSeekerTimerAway: 0,
};

export function setControlled(p){
  if(!p){
    Game.controlledId = null;
    return;
  }
  if(Game.controlledId !== p.id) claimManualControl(p);
  Game.controlledId = p.id;
}
export function setControlled2(p){
  if(!p){
    Game.controlledId2 = null;
    return;
  }
  if(Game.controlledId2 !== p.id) claimManualControl(p);
  Game.controlledId2 = p.id;
}
export function controlledPlayer(){ return allPlayers.find(p=>p.id===Game.controlledId); }
export function controlledPlayer2(){ return allPlayers.find(p=>p.id===Game.controlledId2); }

export function getPressureCursorId(defendingTeam){
  return defendingTeam === 'home' ? Game.pressureCursorHome : Game.pressureCursorAway;
}

export function isPressureCursorPlayer(p){
  if(!p || p.role === 'GK') return false;
  if(isControlledByHuman && isControlledByHuman(p)) return false;
  const owner = ball.owner;
  if(!owner || owner.team === p.team || owner.role === 'GK') return false;
  const id = getPressureCursorId(p.team);
  return id != null && p.id === id;
}

export function resetMatchForStart(){
  applyPhysicsToPlayers();
  Game.score = {home:0, away:0};
  Game.time = 5*60;
  isPaused = false;
  Game.paused = false;
  Game.matchEnded = false;
  gameState = 'match';
  Game.celebration = null;
  Game.celebrationRun = null;
  isCelebrationMode = false;
  hideGoalOverlay();
  Game.crossMarker = null;
  Game.landingPoint = null;
  clearAirSpamUiState();
  Game.goalRoll = null;
  Game.outOfPlay = null;
  Game.isDeadBall = false;
  Game.deadBall = null;
  Game.pendingTacklePossession = null;
  tacklePossessToken++;
  resetGoalZoneTracking();
  Game.isGoalScored = false;
  Game.manualOverrideUntil = 0;
  Game.manualOverrideUntil2 = 0;
  Game.effortSwitchLockPlayerHome = null;
  Game.effortSwitchLockPlayerAway = null;
  Game.banner = null;
  Game.bannerUntil = 0;
  Game.isChargingShot = false;
  Game.isCharging = false;
  Game.isInputLocked = false;
  Game.globalReinstatementCooldownT = 0;
  isFakeShotActive = false;
  fakeShotOwnerId = null;
  Game.lastTouchPlayerID = null;
  Game.restartRestrictionsActive = false;
  for (const k in effortRsState) delete effortRsState[k];
  PrivateChaseEvents.clear();
  Game.throwIn = null;
  resetSetPieceManager();
  setSetPieceMode(false);
  resetKickoffManager();
  Game.matchState = STATE_PLAYING;
  Game.kickoffTeam = null;
  Game.kickoffTakerId = null;
  Game.isBallInPlay = true;
  Game.wasInterceptionEligible = false;
  resetNearestPlayerSelection();
  clearBallLock();
  document.getElementById('scoreHome').textContent = '0';
  document.getElementById('scoreAway').textContent = '0';
  updateClock();
  resetInputEdgeDetection();
  lastTs = null; // primer frame tras arrancar: evita un salto de dt heredado de otra sesion
  placeKickoff('home');
}



export function bindBallBeforeRender(){
  if(ball.state === BALL_STATE.IN_POSSESSION) dribblingBinding();
}

export function finalizeBallFrame(){
  if(ball.state === BALL_STATE.IN_POSSESSION) dribblingBinding();
  sanitizeBallState();
}

export function updateClock(){
  const m = Math.floor(Game.time/60), s = Math.floor(Game.time%60);
  document.getElementById('clock').textContent = m+':'+String(s).padStart(2,'0');
}

export function endMatch(){
  Game.matchEnded = true;
  isPaused = true;
  Game.paused = true; // trabado en el resultado final: ya no se procesan mas inputs ni fisica
  Game.time = 0;
  updateClock();
  let text;
  if(Game.score.home > Game.score.away) text = 'GANÓ LOCAL '+Game.score.home+'-'+Game.score.away;
  else if(Game.score.away > Game.score.home) text = 'GANÓ VISITA '+Game.score.away+'-'+Game.score.home;
  else text = 'EMPATE '+Game.score.home+'-'+Game.score.away;
  showBanner(text, 3600000); // se queda a la vista: el partido termino
}


// Puente de funciones asignadas por main.js al arrancar (evita imports circulares)
export let runGameplaySim = null;
export let renderFn = null;
export let updateHumanControl = null;
export let resetActionBuffer = null;
export let InputManager = null;
export let readInput = null;
export let snapshotKeys = null;
export let assignInputSources = null;
export let remapMoveForCamera = null;
export let handleRightStickSwitch = null;
export let executeFakeShot = null;
export let isStandardPad = null;
export let effortTouch = null;
export let executeKick = null;
export let startKickoffManeuver = null;
export let updatePendingKick = null;
export let prevButtonsByPad = {};
export let isFakeShotActive = false;
export let fakeShotOwnerId = null;
export let lastTs = null;
export let lastDt = 0.016;
export let hideGoalOverlay = null;
export let resetGoalZoneTracking = null;
export let movePlayer = null;
export let applyTackleCarryInertia = null;
export let defendingTeamForGoalLine = null;
export let getGoalAreaFrictionMult = null;
export let getGoalNetFrictionMult = null;
export let getGoalNetSide = null;
export let getOutZoneFrictionMult = null;
export let isBallInsideGoalVolume = null;
export let onBallOut = null;
export let updateGoalNetTriggerPhysics = null;
export let resolveCollisions = null;
export let canCpuReceivePass = null;
export let canCpuSeekLooseBall = null;
export let clearInterceptionSeek = null;
export let clearPassTargetIfPlayer = null;
export let clearPassTargetTeam = null;
export let enforceCpuNoCarrierChase = null;
export let getPassTargetId = null;
export let getPlayerById = null;
export let isCpuPlayer = null;
export let isHumanTeam = null;
export let nearestToBall = null;
export let resetNearestPlayerSelection = null;
export let showBanner = null;
export let predictBallLanding = null;
export let findPassReceiverByIntent = null;
export let getAerialPositionTarget = null;
export let isBallAerialLoose = null;
export let clearChargingShotState = null;
export let clearPendingAction = null;
export let completeFakeShot = null;
export let notifyManualRunPossessionChange = null;
export let triggerGoalkeeperKick = null;
export let resolveSelfTouchDirection = null;
export let checkActionExecution = null;
export let tryImmediateFirstTouch = null;
export let readRightStick = null;
export let anyKey = null;
export let anyKeyPrev = null;
export let isControlledByHuman = null;

export function setLastTs(v) { lastTs = v; }
export function setLastDt(v) { lastDt = v; }
export function setGameState(v) { gameState = v; }
export function setIsPaused(v) { isPaused = v; }
export function setIsCelebrationMode(v) { isCelebrationMode = v; }

export function wireBridge(deps) {
  if (!deps) return;
  if (deps.runGameplaySim !== undefined) runGameplaySim = deps.runGameplaySim;
  if (deps.renderFn !== undefined) renderFn = deps.renderFn;
  if (deps.assignInputSources !== undefined) assignInputSources = deps.assignInputSources;
  if (deps.snapshotKeys !== undefined) snapshotKeys = deps.snapshotKeys;
  if (deps.updateHumanControl !== undefined) updateHumanControl = deps.updateHumanControl;
  if (deps.resetActionBuffer !== undefined) resetActionBuffer = deps.resetActionBuffer;
  if (deps.InputManager !== undefined) InputManager = deps.InputManager;
  if (deps.readInput !== undefined) readInput = deps.readInput;
  if (deps.remapMoveForCamera !== undefined) remapMoveForCamera = deps.remapMoveForCamera;
  if (deps.handleRightStickSwitch !== undefined) handleRightStickSwitch = deps.handleRightStickSwitch;
  if (deps.executeFakeShot !== undefined) executeFakeShot = deps.executeFakeShot;
  if (deps.isStandardPad !== undefined) isStandardPad = deps.isStandardPad;
  if (deps.effortTouch !== undefined) effortTouch = deps.effortTouch;
  if (deps.executeKick !== undefined) executeKick = deps.executeKick;
  if (deps.startKickoffManeuver !== undefined) startKickoffManeuver = deps.startKickoffManeuver;
  if (deps.updatePendingKick !== undefined) updatePendingKick = deps.updatePendingKick;
  if (deps.hideGoalOverlay !== undefined) hideGoalOverlay = deps.hideGoalOverlay;
  if (deps.resetGoalZoneTracking !== undefined) resetGoalZoneTracking = deps.resetGoalZoneTracking;
  if (deps.movePlayer !== undefined) movePlayer = deps.movePlayer;
  if (deps.applyTackleCarryInertia !== undefined) applyTackleCarryInertia = deps.applyTackleCarryInertia;
  if (deps.defendingTeamForGoalLine !== undefined) defendingTeamForGoalLine = deps.defendingTeamForGoalLine;
  if (deps.getGoalAreaFrictionMult !== undefined) getGoalAreaFrictionMult = deps.getGoalAreaFrictionMult;
  if (deps.getGoalNetFrictionMult !== undefined) getGoalNetFrictionMult = deps.getGoalNetFrictionMult;
  if (deps.getGoalNetSide !== undefined) getGoalNetSide = deps.getGoalNetSide;
  if (deps.GOAL_FRAMES !== undefined) GOAL_FRAMES = deps.GOAL_FRAMES;
  if (deps.getOutZoneFrictionMult !== undefined) getOutZoneFrictionMult = deps.getOutZoneFrictionMult;
  if (deps.isBallInsideGoalVolume !== undefined) isBallInsideGoalVolume = deps.isBallInsideGoalVolume;
  if (deps.onBallOut !== undefined) onBallOut = deps.onBallOut;
  if (deps.updateGoalNetTriggerPhysics !== undefined) updateGoalNetTriggerPhysics = deps.updateGoalNetTriggerPhysics;
  if (deps.resolveCollisions !== undefined) resolveCollisions = deps.resolveCollisions;
  if (deps.canCpuReceivePass !== undefined) canCpuReceivePass = deps.canCpuReceivePass;
  if (deps.canCpuSeekLooseBall !== undefined) canCpuSeekLooseBall = deps.canCpuSeekLooseBall;
  if (deps.clearInterceptionSeek !== undefined) clearInterceptionSeek = deps.clearInterceptionSeek;
  if (deps.clearPassTargetIfPlayer !== undefined) clearPassTargetIfPlayer = deps.clearPassTargetIfPlayer;
  if (deps.clearPassTargetTeam !== undefined) clearPassTargetTeam = deps.clearPassTargetTeam;
  if (deps.enforceCpuNoCarrierChase !== undefined) enforceCpuNoCarrierChase = deps.enforceCpuNoCarrierChase;
  if (deps.getPassTargetId !== undefined) getPassTargetId = deps.getPassTargetId;
  if (deps.getPlayerById !== undefined) getPlayerById = deps.getPlayerById;
  if (deps.isCpuPlayer !== undefined) isCpuPlayer = deps.isCpuPlayer;
  if (deps.isHumanTeam !== undefined) isHumanTeam = deps.isHumanTeam;
  if (deps.nearestToBall !== undefined) nearestToBall = deps.nearestToBall;
  if (deps.resetNearestPlayerSelection !== undefined) resetNearestPlayerSelection = deps.resetNearestPlayerSelection;
  if (deps.showBanner !== undefined) showBanner = deps.showBanner;
  if (deps.predictBallLanding !== undefined) predictBallLanding = deps.predictBallLanding;
  if (deps.findPassReceiverByIntent !== undefined) findPassReceiverByIntent = deps.findPassReceiverByIntent;
  if (deps.getAerialPositionTarget !== undefined) getAerialPositionTarget = deps.getAerialPositionTarget;
  if (deps.isBallAerialLoose !== undefined) isBallAerialLoose = deps.isBallAerialLoose;
  if (deps.clearChargingShotState !== undefined) clearChargingShotState = deps.clearChargingShotState;
  if (deps.clearPendingAction !== undefined) clearPendingAction = deps.clearPendingAction;
  if (deps.completeFakeShot !== undefined) completeFakeShot = deps.completeFakeShot;
  if (deps.notifyManualRunPossessionChange !== undefined) notifyManualRunPossessionChange = deps.notifyManualRunPossessionChange;
  if (deps.triggerGoalkeeperKick !== undefined) triggerGoalkeeperKick = deps.triggerGoalkeeperKick;
  if (deps.resolveSelfTouchDirection !== undefined) resolveSelfTouchDirection = deps.resolveSelfTouchDirection;
  if (deps.checkActionExecution !== undefined) checkActionExecution = deps.checkActionExecution;
  if (deps.tryImmediateFirstTouch !== undefined) tryImmediateFirstTouch = deps.tryImmediateFirstTouch;
  if (deps.rebuildFieldGeometry !== undefined) rebuildFieldGeometry = deps.rebuildFieldGeometry;
  if (deps.readRightStick !== undefined) readRightStick = deps.readRightStick;
  if (deps.anyKey !== undefined) anyKey = deps.anyKey;
  if (deps.anyKeyPrev !== undefined) anyKeyPrev = deps.anyKeyPrev;
  if (deps.isControlledByHuman !== undefined) isControlledByHuman = deps.isControlledByHuman;
}

export function isUIActive(){
  return !!(Game.uiActive || Game.uiModeActive);
}

export function isUIModeActive(){
  return !!(Game.uiModeActive || Game.uiActive || isPaused || Game.paused);
}

export function resetInputEdgeDetection() {
  if (typeof snapshotKeys === 'function') snapshotKeys();
  for (const k in prevButtonsByPad) delete prevButtonsByPad[k];
}

