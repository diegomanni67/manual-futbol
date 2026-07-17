"use strict";

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
export let isManualMode = true; // true: CPU solo marca posicion / cierra lineas; nunca persigue la pelota

/* ============================================================
   CONFIG / CONSTANTES DE CANCHA
   ============================================================ */
export const FIELD_L = 105, FIELD_W = 68;
export const GOAL_HALF = 3.66, GOAL_DEPTH = 2.2, CROSSBAR_Z = 2.44;
export const GOAL_POST_BOUNCE = 0.5;          // rebote en poste/travesaño/red lateral: retiene 50% de velocidad
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
export const GOAL_AREA_Y_PAD = 2.8;           // extension lateral del area de meta para rodadura natural
export const GOAL_POST_HALF_THICK = 0.09;     // semigrosor del colisionador de poste/travesaño
export const GOAL_LINE_LEFT = 0;              // coordenada x de la linea de meta blanca (arco izquierdo)
export const GOAL_LINE_RIGHT = FIELD_L;       // coordenada x de la linea de meta blanca (arco derecho)
export const debugMode = false;               // true = limites/sensores en rojo (solo depuracion)
export const DEBUG_BOUNDARIES = debugMode;
export const OUT_ZONE_DEPTH = 5;              // m entre linea de cal y BoundaryWall
export const BOUNDARY_WALL_BOUNCE = 0.52;     // retencion de velocidad al rebotar en pared perimetral
export const OUT_ZONE_STOP_SPEED = 0.06;      // m/s: pelota detenida en OutZone antes del reposicionamiento
export const OUT_ZONE_FRICTION_MULT = 1.18;   // friccion extra en OutZone para que la pelota se detenga antes
export const STADIUM_FLOOR_PAD = 4;           // m de piso extendido mas alla de las BoundaryWalls
export const PBOX_D = 16.5, PBOX_HALFW = 20.15;
export const SBOX_D = 5.5, SBOX_HALFW = 9.16;
export const CENTER = {x:FIELD_L/2, y:FIELD_W/2};
export const CCIRCLE_R = 9.15;

export const GRAVITY = 18.0;         // m/s^2 aplicada a Z de la pelota
export const BALL_RADIUS = 0.11;     // radio real de una pelota de futbol (~22cm de diametro)
export const BALL_FRICTION = 10.4;   // desaceleracion en cesped (m/s^2). +30% vs 8: frena antes y llega rodando lento.
export const GROUND_FRICTION = BALL_FRICTION; // alias legacy
export const KICK_VELOCITY_MULT = 1.5; // multiplicador base de salida en pases y tiros
export const PASS_VELOCITY_MULT = 0.7;  // pases (X, Triangulo, Circulo, filtrado): -30% velocidad inicial
export const SHOT_VELOCITY_MULT = 0.8;  // tiros (Cuadrado): -20% velocidad inicial (siguen siendo mas potentes que pases)
// --- perfiles de tiro (Cuadrado + modificadores) ---
export const SHOT_PLACED_SPEED_MULT = 0.8;    // R1 colocado: -20% velocidad base
export const SHOT_TRIVELA_SPEED_MULT = 0.9;   // L2 tres dedos: velocidad media
export const SHOT_NORMAL_FRICTION_MULT = 0.68; // tiro comun: desliza mas (trayectoria recta y larga)
export const SHOT_TRIVELA_FRICTION_MULT = 0.88;
// Efecto direccional fijo (R1=izquierda, L2=derecha del vector de velocidad): aceleracion lateral m/s^2
export const CURVE_ACCEL_PASS = 10.5;         // pases (X, Triangulo, Circulo, pared) — base
export const CURVE_ACCEL_SHOT = 12.5;         // tiros (Cuadrado) — base
export const CURVE_LAT_FRICTION_MULT = 0.85;  // -15% intensidad lateral para R1 y L2
export const CURVE_ACCEL_PASS_R1 = CURVE_ACCEL_PASS * CURVE_LAT_FRICTION_MULT * 0.92; // colocado: algo mas contenido
export const CURVE_ACCEL_PASS_L2 = CURVE_ACCEL_PASS * CURVE_LAT_FRICTION_MULT;         // tres dedos
export const CURVE_ACCEL_SHOT_R1 = CURVE_ACCEL_SHOT * CURVE_LAT_FRICTION_MULT * 0.92;
export const CURVE_ACCEL_SHOT_L2 = CURVE_ACCEL_SHOT * CURVE_LAT_FRICTION_MULT;
export const PASS_MAX_SPEED = 42 * PASS_VELOCITY_MULT * KICK_VELOCITY_MULT; // tope referencia pase con efecto
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
export const DRIBBLE_DIST_R1 = 2.0;           // R1 + stick der.: toque corto / progresion
export const DRIBBLE_DIST_R2 = 4.0;           // R2 + stick der.: toque largo / carrera
export const DRIBBLE_DIST_FAKE = 2.0;         // FakeShot (X cancela carga): offset hacia adelante
export const DRIBBLE_DIST_LERP = 0.2;         // suavizado al cambiar de distancia
export const EFFORT_AI_FREEZE_DURATION = 0.3; // 300ms: freeze defensivo ante proyeccion del offset
export const EFFORT_SPRINT_NORMAL_OFFSET = 0.3; // offset de conduccion normal tras convergencia
export const EFFORT_OFFSET_DRAG_LERP = 0.06;  // freno suave: la pelota se arrastra hacia el jugador
export const EFFORT_DETACHED_BALL_LERP = 0.22; // suavizado del offset pelota-jugador durante R2 (sin teletransporte)
export const EFFORT_EXIT_VEL_BLEND = 0.18;     // segundos de blend de velocidad al salir del esfuerzo/finta
export const DRIBBLE_FAKE_DURATION = 0.5;     // 500ms de offset de amague
export const DRIBBLE_STEAL_RADIUS = 0.4;      // radio de robo sobre la posicion del balon
export const DRIBBLE_CONTROL_SLACK = 0.25;    // tolerancia extra de control en conduccion extendida
export const MAN_MARK_MIN_DIST = 1.5;         // distancia minima de marcaje pasivo al portador rival
export const MAN_MARK_ACTIVATE_DIST = 14;     // radio maximo para activar marcaje pasivo (DEF/MID)
export const TEAMMATE_SUPPORT_MIN_DIST = 3.4; // distancia minima de apoyo cuando un companero tiene la pelota

// --- Distancias legacy (referencia; ya no sueltan la pelota a 'free') ---
export const DIST_R1 = DRIBBLE_DIST_R1;
export const DIST_R2 = DRIBBLE_DIST_R2;
export const DIST_FAKE = DRIBBLE_DIST_FAKE;
export const SELF_TOUCH_COLLECT_BLOCK = 0.5;  // 500ms: prohibido reposeer la pelota tras self-touch
export const SELF_TOUCH_BURST_MULT = 25.0;    // impulso inicial seco = targetDist * mult
export const SELF_TOUCH_PLAYER_BRAKE = 0.14; // freno momentaneo del jugador al soltar el toque

// --- EFFORT TOUCH (R2/R1 + stick): persecucion de balon suelto (Loose Ball Chase) ---
export const GRASS_FRICTION = 0.98;             // friccion multiplicativa de cesped durante balon suelto post-effort
export const EFFORT_TOUCH_COOLDOWN = 0.5;       // 500ms entre toques (largo o corto) / ventana minima sin owner
export const EFFORT_CHASE_TEAMMATE_BLOCK = 0.5; // 500ms: compañeros no pueden interceptar tras effort touch
export const EFFORT_BALL_LOCK_DURATION = 0.5;   // 500ms: lock global de posesion (isBallLocked)
export const EFFORT_TOUCH_BURST_MULT = 20.0;    // fuerza base del impulso = targetDist * mult
export const EFFORT_TOUCH_MAX_VELOCITY = 15.0;  // clamp estricto: evita que la pelota atraviese la cancha
export const FEINT_TOUCH_MAX_VELOCITY = 52.0;   // clamp de seguridad para fake shot (sin cambiar su fisica)
export const EFFORT_ROLL_SOFT_DURATION = 0.2;   // 200ms: friccion acelerada al soltar (post-toque)
export const EFFORT_ROLL_SOFT_FRICTION_MULT = 2.0; // x2 friccion durante EFFORT_ROLL_SOFT_DURATION
export const CHASE_POSSESS_DIST = 0.5;          // distancia estricta para cerrar el ciclo de persecucion (chasing legacy)
export const PROXIMITY_POSSESS_DIST = 0.4;      // fail-safe no-intrusivo: toma de posesion por proximidad (pelota suelta)
export const GHOST_BALL_DIST = 0.2;             // pelota "fantasma": muy cerca pero sin owner registrado
export const GHOST_BALL_TIMEOUT = 0.5;          // 500ms pegada al jugador = fallo de colision fisica
export const FORCED_CHASE_RECOVER_DIST = 0.8;   // distancia estricta para salir de forced_chase y recuperar posesion
export const FORCED_CHASE_SPEED_MULT = 1.10;    // sprint forzado al 110% de la velocidad base del jugador
export const FORCED_CHASE_LOCK_DURATION = 1.0;  // lockPlayerAssignment: 1s o hasta contacto con la pelota
export const EFFORT_RS_MIN = 0.45;              // magnitud minima del stick derecho para disparar
export const EFFORT_TOUCH_ANIM_LONG = 0.28;     // animacion mas larga / postura marcada (toque largo)
export const EFFORT_TOUCH_ANIM_SHORT = 0.20;    // animacion rapida y sutil (toque corto)
export const IGNORE_POSSESSION_T = 0.2;         // 200ms: nadie puede reposeer tras effort touch / fake shot
export const EFFORT_REPOSSESS_COOLDOWN = SELF_TOUCH_COLLECT_BLOCK; // sincronizado con canCollectBlockT

export const STATE_SPRINT_CHASE = 'sprint_chase'; // effort touch: autopase + sprint sin pelota hasta captura
export const STATE_PLAYING = 'playing';   // juego normal en curso
export const STATE_KICKOFF = 'kickoff';   // saque de centro (inicio o post-gol)
export const STATE_FIXED = 'fixed';       // anclado en pelota parada (saque de centro, etc.)

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
export const MOVE_TURN_RATE_MAX = 9.2;       // rad/s de giro permitido a baja velocidad (respuesta agil)
export const MOVE_TURN_RATE_MIN = 2.6;       // rad/s al ir a maxima velocidad (curva amplia, no pivot)
export const MOVE_SHARP_TURN_BLEED = 0.44;   // cuanto se desacelera en giros bruscos antes de retomar rumbo
export const MOVE_DECEL_FACTOR = 0.84;       // frenado un poco mas lento que aceleracion (inercia al soltar stick)
export const MOVE_LOW_SPEED_SNAP = 0.32;     // por debajo de esta velocidad el rumbo puede alinearse casi al instante
export const TOUCH_KICK_REACH = 1.9;    // cuanto mas lejos llega la pierna en el toque vs. una zancada normal
// (antes 5: con eso un pase (X) o filtrado (triangulo) a maxima potencia practicamente no frenaba
// nunca dentro de la cancha. Subido para que el roce del pasto se note, igual que ya se nota en
// tiros/centros gracias a su drag aereo extra, sin pasarse de rosca)
export const AIR_DRAG = 0.04;        // resistencia leve mientras esta en el aire (pases rasos/filtrados: casi no la sienten)

// --- fisica EXTRA solo para tiros y centros (pases altos): sin esto, con suficiente potencia
// cruzan toda la cancha en linea casi recta. Se suma encima de GRAVITY/AIR_DRAG de arriba, y NO
// afecta a los pases rasos ni a los filtrados (quedan exactamente como estaban). Cada tipo tiene
// su propia configuracion independiente (maxVelocity, drag y gravedad extra). ---
export const AERIAL_PHYSICS = {
  shot:  {maxSpeed:60, extraDrag:0.30, extraGravity:8}, // tiros: +50% tope aereo (antes 40)
  cross: {maxSpeed:52, extraDrag:0.46, extraGravity:3.6}, // centros: +50% tope aereo (antes 35)
};
export const CROSS_MARKER_LIFE = 1.5; // seg que se ve la cruz amarilla del pique del centro (boton circulo)
export const CTRL_RADIUS = 1.0;      // radio de control de pelota de un jugador
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
export const AUTOPASE_POWER_THRESHOLD = 0.20; // por debajo de este % de barra (0..1) es AUTOPASE: el cursor NO se toca
export const LONGPASS_SWITCH_LOCK_MS = 200;   // tras el salto instantaneo de cursor en pase largo/tiro, bloquea
// el auto-seguimiento normal por este tiempo para que no titile si la pelota pasa cerca de otro jugador
// --- contacto defensivo (entrada de pie + barrida) — balance rapido ---
export const TACKLE_RADIUS = 1.5;        // alcance frontal del TackleBox (1.5 m hacia adelante)
export const TACKLE_POSSESS_DIST = 0.8;  // bajo este umbral el tacle otorga posesion directa
export const TACKLE_LOOK_RADIUS = 2.0;   // radio para auto-apuntar al balon al presionar tacle
export const STUN_DURATION = 150;          // ms: legacy — ver STUN_IMPACT_DURATION para tacles
export const STUN_IMPACT_DURATION = 0.8;   // seg: bloqueo total de input/seek tras tacle o barrida (800ms)
export const BALL_CONTESTED_DURATION = STUN_IMPACT_DURATION; // zona de exclusion post-tacle: solo el tackler puede buscar la pelota
export const STAGGERED_DURATION = 1.0;     // seg: atacante desequilibrado tras perder posesion (1000ms)
export const TACKLE_POSSESS_DELAY_MS = 50; // ms: retardo antes de asignar posesion post-tacle (evita race con IA)
export const STUN_KNOCKBACK = 0.42;        // m/s: retroceso leve por impacto de tacle/barrida
export const SLIDE_TACKLE_CARRY_SPEED = 5.2; // m/s: inercia hacia adelante tras barrida exitosa
export const PLAYER_BODY_RADIUS = 0.31;  // radio del jugador (mitad de minD en resolveCollisions)
export const TACKLE_BOX_SCALE = 1.5;     // hitbox frontal = 1.5x el tamano del jugador
export const STUMBLE_DURATION = 0.42; // "cooling": al perder la pelota en una entrada/barrida/robo, el que la
// tenia tropieza brevemente y no puede recuperarla al instante (ni cargarla de nuevo)

// --- entradas defensivas: entrada de pie (parada) y barrida (deslizamiento) ---
export const STAND_TACKLE_DURATION = 0.26;  // seg que dura la animacion de la entrada de pie
export const STAND_TACKLE_LUNGE = 0.55;     // metros que avanza durante la entrada de pie
export const STAND_TACKLE_CARRY_SPEED = 5.5; // m/s: inercia hacia adelante tras tacle exitoso
export const STAND_TACKLE_LOOSE_DEFLECT = 6.5; // m/s: desvio lateral si el contacto es lejano
export const STAND_RECOVERY = 0.2;          // recuperacion tras entrada de pie (200ms)
export const TACKLE_COOLDOWN = 0.2;         // cooldown base entre entradas defensivas (200ms)
export const TACKLE_CHAIN_AFTER = 0.55;     // fraccion de anim: a partir de aqui se puede encadenar otra entrada

export const SLIDE_DURATION = 0.5;          // 500ms: duracion fija del deslizamiento
export const SLIDE_DISTANCE = 3.2;          // metros que se desliza el jugador
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
export const SLIDE_RECOVERY_MISS = 0.4;     // recuperacion tras barrida fallida (antes 1.35s)
export const SLIDE_FOUL_CHANCE = 0.3;       // chance de falta si conecta con el rival pero no despeja la pelota
export const BALL_KNEE_HEIGHT_Z = 0.55;     // por encima: desactiva tacles/barridas; activa juego aereo
export const SLIDE_RECEPTION_BLOCK_RADIUS = CTRL_RADIUS * 1.15; // pelota muy cerca: bloquea barrida, permite control/disparo de primera

// --- atajadas del arquero (estirada con animacion) ---
export const GK_MIN_SHOT_SPEED = 6.0;   // solo reacciona a pelotas con esta velocidad minima (no se tira con pelotas lentas)
export const GK_DIVE_SPEED = 12.5;      // velocidad efectiva de la estirada, mas rapida que correr normal
export const GK_SAVE_RADIUS = 1.5;      // si llega a esta distancia de la pelota en el momento justo, la ataja/desvia
export const GK_INTERCEPTION_RADIUS = 1.2; // radio de accion: captura o rebote aunque no este en posesion
export const GK_BALL_HITBOX_RADIUS = 0.42; // hitbox solida del arquero frente a la pelota
export const GK_BALL_BOUNCE = 0.58;        // coeficiente de rebote pelota-arquero
export const GK_DIVE_MIN_DUR = 0.16, GK_DIVE_MAX_DUR = 0.6;
export const GK_CATCH_CHANCE = 0.6;     // si llega, chance de que la atrape limpio (si no, la rechaza/desvia)
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
export const GK_HANDS_TIMER_MS = 5000;    // 5s maximo con la pelota en manos antes del despeje automatico
export const GK_KICK_ANIM_DUR = 0.3;      // 300ms de animacion de saque del arquero
export const GK_KICK_RELEASE_T = 0.65;    // fraccion de la animacion en la que sale la pelota
export const GK_KICK_GROUND_Z = 0.2;      // altura de suelo para transicion post-saque (listener + safety)

// --- acciones aéreas: jerarquia cabezazo (default) / L2+remate volea-chilena (handleAerialContact) ---
export const AIR_CONTACT_RADIUS = 1.2;        // rango de contacto espontaneo (sin buffer)
export const PENDING_ACTION_EXECUTE_RADIUS = 1.0; // buffer universal: ejecuta remate/pase de primera al contacto
export const PENDING_ACTION_TIMEOUT_MS = 500;     // limpia buffer si no hay contacto en 500ms
export const PENDING_ACTION_PASS = 'PASS';
export const PENDING_ACTION_SHOT = 'SHOT';

export function clearPlayerPendingAction(p){
  if(!p) return;
  p.pendingAction = null;
  p.pendingActionDetail = null;
  p.pendingActionChargeStart = 0;
  p.pendingActionPower = 0;
  p.pendingActionCurve = 0;
  p.pendingActionManualL2 = false;
  p.pendingActionTimestamp = 0;
  p.pendingActionParams = null;
  p.isPowerLocked = false;
  p.isPreparingToShoot = false;
  Game.isCharging = false;
}
export const AIR_BICYCLE_CONTACT_RADIUS = 0.8;// chilena: distancia perfecta jugador-pelota
export const AIR_BUFFER_RADIUS = 14;          // distancia maxima para empezar a cargar el buffer de accion
export const AIR_CONTACT_PASSED_EPS = 0.055;  // distancia crece por encima de esto = paso el punto de contacto
export const AIR_AERIAL_MIN_Z = 0.5;          // altura minima para poder rematar (pelota en el aire)
export const AIR_HEADER_MIN_Z = 1.5;          // cabezazo: altura cabeza minima
export const AIR_HEADER_MAX_Z = 2.5;          // cabezazo: altura cabeza maxima
export const AIR_VOLLEY_MIN_Z = 0.5;          // volea: altura minima (exclusive)
export const AIR_VOLLEY_MAX_Z = 1.5;          // volea: por debajo de esta altura
export const AIR_BICYCLE_MIN_Z = 2.0;         // chilena: altura minima
export const AIR_LOCK_DURATION = 0.3;         // 300ms: jugador bloqueado durante la animacion aerea
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
export const AIR_VOLLEY_L2_MIN_Z = 1.0;       // volea manual (L2+remate): altura minima (exclusive)
export const AIR_VOLLEY_L2_MAX_Z = 2.0;       // volea manual (L2+remate): altura maxima (inclusive)
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
  near: 28,              // distancia (m) de la camara a la linea de banda cercana: la camara esta
                          // ubicada a un costado de la cancha, sobre la linea lateral (banda)
  camYoff: -28,           // la camara esta virtualmente detras/afuera de la banda (y=0), mirando en
                          // diagonal hacia el otro lado de la cancha (esto + horizonFrac/groundFrac
                          // de abajo son los que le dan la Altura y el Pitch hacia abajo)
  horizonFrac: 0.30,      // cuanto "cielo" se ve arriba: define el angulo de inclinacion (Pitch)
  groundFrac: 0.95,
  zoom: 42,               // FOV/zoom fijo (igual que arco_ok.html: sin zoom dinamico por contexto)
  x: CENTER.x,            // foco horizontal (a lo largo de la banda, eje X): se suaviza hacia la pelota
};
// nota de perspectiva: como la escala de proyeccion (projScale) depende de la profundidad real
// (distancia camara-jugador en el eje Y, hacia la banda lejana), un jugador pegado a la banda lejana
// automaticamente se ve mas chico que uno pegado a la banda cercana a la camara: profundidad real,
// gratis, por como ya esta armada la proyeccion conica de project()/projScale() de abajo.

export function depthOf(y){ return y - CAM.camYoff; }
export function projScale(depth){ return CAM.zoom * (CAM.near/depth) * (canvas.height/650); }
export function project(p){
  if(gameState==='practice') return projectPractice(p);
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
export function paintDepth(entity){ return gameState==='practice' ? entity.x : depthOf(entity.y); }
// mismo criterio que facingAway/flip de mas abajo, pero accesible desde cualquier parte
export function facingFlip(p){
  return gameState==='practice' ? (Math.sin(p.facing) < 0 ? -1 : 1) : (Math.cos(p.facing) < 0 ? -1 : 1);
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
  N:  { asset:null, shoulderColor:'#e74c3c', arrowColor:'#e74c3c' },
  NE: { asset:null, shoulderColor:'#e67e22', arrowColor:'#e67e22' },
  E:  { asset:null, shoulderColor:'#f1c40f', arrowColor:'#f1c40f' },
  SE: { asset:null, shoulderColor:'#2ecc71', arrowColor:'#2ecc71' },
  S:  { asset:null, shoulderColor:'#1abc9c', arrowColor:'#1abc9c' },
  SW: { asset:null, shoulderColor:'#3498db', arrowColor:'#3498db' },
  W:  { asset:null, shoulderColor:'#9b59b6', arrowColor:'#9b59b6' },
  NW: { asset:null, shoulderColor:'#e84393', arrowColor:'#e84393' }
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
    p.playerMeshDir8 = compassAngleToDir8(Math.atan2(dx, dy));
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
export const SET_PIECE = { GOAL_KICK: 'goal_kick', CORNER: 'corner', THROW_IN: 'throw_in', KICKOFF: 'kickoff' };
export const SET_PIECE_UNSTICK_DIST = 1.0;    // metros minimos de recorrido post-saque antes de liberar isStuck
export const SET_PIECE_ZONE_RADIUS = 2.0;     // radio de la zona designada para ejecutar la pelota parada
export const RESTART_TIME_LIMIT_MS = 3000;    // tiempo limite de espera para reinicios (corner, arco, lateral)
export const SET_PIECE_TIMER_DURATION = RESTART_TIME_LIMIT_MS / 1000; // 3.0 segundos para ejecutar antes del timeout
export const SET_PIECE_COUNTDOWN_URGENT = 1.0; // ultimo segundo: contador en rojo
export const SET_PIECE_POWER_MAX_MS = 450;    // tiempo maximo de carga de la barra de potencia
export const SET_PIECE_FORCE_MULT = { short: 14, medium: 20, long: 28 }; // fuerza = powerBar * factor
export const GOAL_KICK_GRAB_SUPPRESS_RADIUS = 2.4; // desactiva agarre del arquero cerca del vértice del saque
export const FIELD_LINE_EPS = 0.02;           // tolerancia para cruce de linea de banda/fondo
export const DEAD_BALL_RESTART_DELAY = 1.85;  // segundos en pausa antes de reanudar saque muerto
// --- Saques de banda (lanzamiento con las manos) ---
export const THROW_IN_FORCE = { short: 8.0, medium: 14.0, long: 20.0 };
export const THROW_IN_ANIM_WINDUP = 0.2;    // 200ms: torso hacia atras
export const THROW_IN_ANIM_RELEASE = 0.2;   // 200ms: torso hacia adelante + impulso
export const THROW_IN_HAND_Z = 1.5;          // altura de la pelota en manos / salida
export const THROW_IN_LINE_Y = 0.35;        // posicion sobre la linea de banda (pies dentro)
export const THROW_IN_APPROACH_DIST = 1.8;  // distancia para activar isThrowingIn

export function playerInStrictControlRange(p, b = ball){
  if(!p) return false;
  if(isKickoffTaker(p) && isKickoffWaiting()) return true;
  if(isGkHandsPossession(p)) return dist2D(p, b) <= GK_HANDS_CTRL_RADIUS;
  if(isGoalkeeper(p)) return dist2D(p, b) <= GK_INTERCEPTION_RADIUS;
  if(ball.owner === p && (isExtendedDribbleActive(p) || p.isEffortSprinting)){
    const slack = DRIBBLE_CONTROL_SLACK + (p.currentDribbleDistance > 2.5 ? 0.4 : 0);
    return dist2D(p, b) <= p.currentDribbleDistance + slack;
  }
  return dist2D(p, b) <= CTRL_RADIUS;
}

export function playerInControlRange(p, b = ball){
  if(!p) return false;
  return dist2D(p, b) <= CTRL_RADIUS;
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

export function getTeammateSupportTarget(p, carrier){
  const base = p.targetSlotWorld();
  const pushX = base.x + p.attackDir() * 8;
  let targetX = pushX;
  let targetY = clamp(base.y + (carrier.y - CENTER.y) * -0.25, 4, FIELD_W - 4);
  const dx = targetX - carrier.x;
  const dy = targetY - carrier.y;
  const d = Math.hypot(dx, dy);
  if(d > 0.01 && d < TEAMMATE_SUPPORT_MIN_DIST){
    const scale = TEAMMATE_SUPPORT_MIN_DIST / d;
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
  return !!p && p.state === 'chasing';
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

export function applyStun(player, duration = STUN_IMPACT_DURATION){
  if(!player) return;
  player.isStunned = true;
  player.stun = {t: 0, dur: duration};
  player.canCollectBall = false;
  player.releaseCooldown = Math.max(player.releaseCooldown, duration);
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
  player.stumble = {t: 0, dur: Math.min(STUMBLE_DURATION, duration * 0.55)};
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
  const sprintSp = getPlayerMoveSpeedBase(p) * FORCED_CHASE_SPEED_MULT;
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

export function detectEffortTouchInput(p, input, padIndex, scheme){
  if(input.heldManualCancel) return null;
  let dir = null;
  let type = null;

  const rs = readRightStick(padIndex);
  const stKey = 'e'+p.id;
  if(!effortRsState[stKey]) effortRsState[stKey] = {prevMag:0};
  const st = effortRsState[stKey];
  const rsMag = rs ? rs.mag : 0;
  const rsFlick = rsMag >= EFFORT_RS_MIN && st.prevMag < EFFORT_RS_MIN;
  st.prevMag = rsMag;

  if(rsFlick && rs){
    if(input.heldR2) type = 'long';
    else if(input.heldR1) type = 'short';
    if(type) dir = {x: rs.x, y: rs.y};
  }

  if(!type && scheme){
    const moveMag = Math.hypot(input.move.x, input.move.y);
    if(moveMag >= 0.35){
      const dirKb = norm(input.move);
      const r1Now = anyKey(scheme.curveLeft);
      const r2Now = anyKey(scheme.sprint);
      const r1Just = r1Now && !anyKeyPrev(scheme.curveLeft);
      if(r2Now && r1Just){ type = 'long'; dir = dirKb; }
      else if(r1Just && !r2Now){ type = 'short'; dir = dirKb; }
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
  p.state = 'idle';
  p.iaSeeking = false;
  p.targetPosition = null;
  p.landingTime = 0;
  p.seekAerial = false;
  clearPlayerLockAssignment(p);
  clearPassTargetIfPlayer(p);
}

export function resumeChasingAfterAction(p){
  if(!p || ball.owner === p) return;
  if(ball.owner) return;
  if(ball.state !== BALL_STATE.FREE && ball.state !== BALL_STATE.LOOSE_BALL) return;
  if(isChaseOwner(p) || (ball.feintDetach && ball.feintDetach.ownerId === p.id)){
    startForcedChase(p, ball);
  } else {
    p.state = 'chasing';
    clearPlayerAIState(p);
  }
}

// Punto de intercepcion durante chasing (incluye buffer de recepcion / primera).
export function getChaseInterceptTarget(p){
  if((p.pendingActionParams || p.pendingActionChargeStart > 0) && isBallAerialLoose()){
    return getAerialPositionTarget(p, ball);
  }
  if(ball.z > BALL_AERIAL_MIN_Z){
    const land = predictBallLanding(ball);
    if(land && land.aerial && land.t > 0.05){
      return {x: land.x, y: land.y};
    }
  }
  const d = dist2D(p, ball);
  const playerSp = p.maxSpeedBase * 1.42;
  const tReach = d / Math.max(playerSp, 1);
  const ballSp = Math.hypot(ball.vx, ball.vy);
  if(ballSp > 0.35){
    return {
      x: clamp(ball.x + ball.vx * tReach * 0.85, 0.3, FIELD_L - 0.3),
      y: clamp(ball.y + ball.vy * tReach * 0.85, 0.3, FIELD_W - 0.3),
    };
  }
  return {x: ball.x, y: ball.y};
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
  p.handsTimer = GK_HANDS_TIMER_MS;
}

export function clearGkHandsTimer(p){
  if(!p) return;
  p.handsTimer = 0;
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
  return triggerGoalkeeperKick(gk, 'dropkick', getGkClearanceDirection(gk));
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
  if(isGkFeetPossession(p)) return GK_FIELD_MAX_SPEED;
  return p.maxSpeedBase;
}

export function getPlayerMaxSprintVelocity(p){
  return getPlayerMoveSpeedBase(p) * 1.42;
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

// Freeze momentaneo de defensores CPU ante la proyeccion del offset (evita falsa intercepcion).
export function applyEffortTouchDefenderFreeze(owner, offsetDist, dir){
  if(!owner || !dir) return;
  const projX = owner.x + dir.x * offsetDist;
  const projY = owner.y + dir.y * offsetDist;
  const freezeRange = offsetDist + 0.8;
  for(const p of allPlayers){
    if(!isCpuPlayer(p) || p.team === owner.team) continue;
    if(p.aiMode !== 'positioning') continue;
    const dProj = Math.hypot(p.x - projX, p.y - projY);
    const dOwner = dist2D(p, owner);
    if(Math.min(dProj, dOwner) > freezeRange) continue;
    p.effortTouchDefenderFreezeT = EFFORT_AI_FREEZE_DURATION;
    p.vx = 0;
    p.vy = 0;
    enforceCpuNoCarrierChase(p, owner);
  }
}

export function updateEffortTouchDefenderFreeze(dt){
  for(const p of allPlayers){
    if(p.effortTouchDefenderFreezeT <= 0) continue;
    p.effortTouchDefenderFreezeT = Math.max(0, p.effortTouchDefenderFreezeT - dt);
    p.vx = 0;
    p.vy = 0;
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
  if(isThrowInTakerBlocked(p)) return false;
  if(isPossessionIgnored()) return false;
  if(ball.isReadyToKick && isGoalkeeper(p)) return false;
  if(isGoalKickReadyState() && isGoalkeeper(p)) return false;
  if(isBallLocked() && p.id !== Game.ballLockOwnerId) return false;
  if(!playerInStrictControlRange(p)) return false;
  if(ball.owner && ball.owner !== p && !canTakeBallFromOwner(p, ball.owner)) return false;
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
  if(reclaimingLock) clearBallLock();
  ball.lastTouchedBy = p.id;
  ball.lastAction = null;
  if(ball.possessedBy === p.id) ball.possessedBy = null;
  clearThrowInBlockIfOtherPlayer(p);
  clearChasingState(p);
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
  if(p.pendingActionParams){
    tryExecuteBufferedActionOnPossession(p);
  }
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
  const aero = b.highKick ? AERIAL_PHYSICS[b.highKickType] : null;
  const scoredNet = shouldApplyScoredGoalNetPhysics(b);
  const useGoalNetGravity = !!(b.goalNetGravityActive && b.isInsideGoalTrigger);
  const g = useGoalNetGravity
    ? (b.gravity || GOAL_NET_GRAVITY)
    : (GRAVITY + (aero ? aero.extraGravity : 0));
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
  if(onGround){
    if(sp < CURVE_CUT_MIN_SPEED) b.curveFactor = 0;
    if(sp>0.001){
      let frictionMult = b.groundFrictionMult||1;
      const effortRoll = !!(b.effortDetach || b.feintDetach);
      if(b.effortRollSoftT > 0){
        b.effortRollSoftT = Math.max(0, b.effortRollSoftT - dt);
        frictionMult *= EFFORT_ROLL_SOFT_FRICTION_MULT;
      }
      if(!effortRoll && sp < CURVE_LOW_SPEED_FRICTION) frictionMult *= CURVE_LOW_SPEED_FRICTION_BOOST;
      frictionMult *= getGoalNetFrictionMult(b);
      frictionMult *= getGoalAreaFrictionMult(b);
      frictionMult *= getOutZoneFrictionMult(b);
      frictionMult *= getOutZoneFrictionMult(b);
      const drop = BALL_FRICTION*frictionMult*dt;
      const newSp = Math.max(0, sp-drop);
      const scale = newSp/sp;
      b.vx *= scale; b.vy *= scale;
    }
    if(sp<0.02){ b.vx=0; b.vy=0; b.curveFactor=0; clearCurvePassTracking(b); }
  } else {
    const netDrag = getGoalNetFrictionMult(b);
    if(netDrag > 1){
      const netSlow = 1/(1+(netDrag-1)*0.18*dt);
      b.vx *= netSlow; b.vy *= netSlow;
    }
    const dragCoef = AIR_DRAG + (aero ? aero.extraDrag : 0);
    const drag = 1/(1+dragCoef*dt);
    b.vx *= drag; b.vy *= drag;
    if(aero){
      const airSp = Math.hypot(b.vx, b.vy);
      if(airSp > aero.maxSpeed){
        const s = aero.maxSpeed/airSp;
        b.vx *= s; b.vy *= s;
      }
    }
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
  return side === 'top' ? Math.PI / 2 : -Math.PI / 2;
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

  Game.throwIn = { active: true, team: db.team, side: db.side, x: pos.x, y: pos.y };

  const squad = db.team === 'home' ? homeTeam : awayTeam;
  const taker = squad.reduce((a, b) => dist2D(a, pos) < dist2D(b, pos) ? a : b);
  positionSetPieceTaker(taker, db, pos);
  taker.isThrowingIn = true;
  taker.throwInAnim = null;
  if(db.team === 'home') setControlled(taker);
  else setControlled2(taker);
  ball.lastTouchTeam = db.team;

  ball.state = BALL_STATE.IN_HAND;
  ball.throwInOwnerId = taker.id;
  bindThrowInBall(taker);
  setSetPieceMode(true, { type: SET_PIECE.THROW_IN, team: db.team, side: db.side, takerId: taker.id, x: pos.x });
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
  const force = anim.force;
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

export function handleThrowInInput(p, input, aimDir){
  if(!p.isThrowingIn || ball.state !== BALL_STATE.IN_HAND) return false;
  if(p.throwInAnim) return true;

  let forceKey = null;
  if(input.pressPass) forceKey = 'short';
  else if(input.pressThrough) forceKey = 'medium';
  else if(input.pressCross) forceKey = 'long';
  if(!forceKey) return true;

  const hasDir = Math.hypot(aimDir.x, aimDir.y) > 0.15;
  const dir = hasDir ? norm(aimDir) : {x: Math.cos(p.facing), y: Math.sin(p.facing)};
  if(hasDir){
    p.facing = Math.atan2(dir.y, dir.x);
    p.lastAim = dir;
    syncPlayerDir(p);
  }

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
};

export function resetSetPieceCharge(){
  SetPieceManager.powerBar = 0;
  SetPieceManager.chargeType = null;
  SetPieceManager.chargeStart = 0;
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
  if(side === 'left') return { x: 0.55, y: topHalf ? FIELD_W - 0.55 : 0.55 };
  return { x: FIELD_L - 0.55, y: topHalf ? FIELD_W - 0.55 : 0.55 };
}

export function throwInLinePosition(side, x){
  const lineY = side === 'top' ? THROW_IN_LINE_Y : FIELD_W - THROW_IN_LINE_Y;
  return { x: clamp(x, 0.8, FIELD_L - 0.8), y: lineY };
}

export function defaultSetPieceAimDir(p){
  const sp = Game.setPiece;
  if(sp?.type === SET_PIECE.THROW_IN) return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
  if(sp?.side === 'left') return { x: 1, y: 0 };
  if(sp?.side === 'right') return { x: -1, y: 0 };
  return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
}

export function isSetPieceAwaitingExecution(p){
  return !!(p && Game.setPieceMode && !Game.isBallInPlay && !SetPieceManager.executed && Game.setPiece?.takerId === p.id);
}

export function startSetPieceCharge(forceKey){
  SetPieceManager.chargeType = forceKey;
  SetPieceManager.chargeStart = performance.now();
  SetPieceManager.powerBar = 0;
}

export function positionSetPieceTaker(taker, db, ballPos){
  taker.vx = 0;
  taker.vy = 0;
  if(db.type === SET_PIECE.GOAL_KICK){
    taker.x = ballPos.x + (db.side === 'left' ? 0.75 : -0.75);
    taker.y = ballPos.y;
    taker.facing = db.side === 'left' ? 0 : Math.PI;
  } else if(db.type === SET_PIECE.CORNER){
    taker.x = ballPos.x + (db.side === 'left' ? 0.55 : -0.55);
    taker.y = ballPos.y + (ballPos.y > CENTER.y ? -0.55 : 0.55);
    taker.facing = db.side === 'left' ? 0 : Math.PI;
  } else if(db.type === SET_PIECE.KICKOFF){
    taker.x = ballPos.x + (db.team === 'home' ? -KICKOFF_TAKER_BALL_OFFSET : KICKOFF_TAKER_BALL_OFFSET);
    taker.y = ballPos.y;
    taker.facing = db.team === 'home' ? 0 : Math.PI;
  } else if(db.type === SET_PIECE.THROW_IN){
    taker.x = ballPos.x;
    taker.y = ballPos.y;
    taker.facing = throwInFacingForSide(db.side);
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
}

export function executeGoalKickRelease(p, forceKey, powerBar, aimDir){
  if(!p || !isGoalkeeper(p)) return;
  ball.isReadyToKick = false;
  ball.state = BALL_STATE.IN_POSSESSION;
  p.gkBallCollidable = true;

  const power = clamp(Math.max(powerBar, 0.14), 0.14, 1);
  const hasDir = Math.hypot(aimDir.x, aimDir.y) > 0.15;
  const dir = hasDir ? norm(aimDir) : defaultSetPieceAimDir(p);
  if(hasDir){
    p.facing = Math.atan2(dir.y, dir.x);
    p.lastAim = dir;
    syncPlayerDir(p);
  }

  clearGkPossessionType(p);
  ball.owner = p;
  ball.state = BALL_STATE.IN_POSSESSION;
  const kickMap = { short: 'pass', medium: 'through', long: 'cross' };
  executeKick(p, kickMap[forceKey] || 'pass', dir, power, 0);
}

export function executeSetPieceRelease(p, forceKey, powerBar, aimDir){
  if(SetPieceManager.executed) return;
  SetPieceManager.executed = true;
  resetSetPieceCharge();

  const power = clamp(Math.max(powerBar, 0.14), 0.14, 1);
  const hasDir = Math.hypot(aimDir.x, aimDir.y) > 0.15;
  const dir = hasDir ? norm(aimDir) : defaultSetPieceAimDir(p);
  if(hasDir){
    p.facing = Math.atan2(dir.y, dir.x);
    p.lastAim = dir;
    syncPlayerDir(p);
  }

  const sp = Game.setPiece;
  if(sp?.type === SET_PIECE.THROW_IN){
    const force = Math.max(0.08, powerBar) * SET_PIECE_FORCE_MULT[forceKey];
    p.throwInAnim = {
      phase: 'windback',
      t: 0,
      windDur: THROW_IN_ANIM_WINDUP,
      releaseDur: THROW_IN_ANIM_RELEASE,
      force,
      dir,
      impulseApplied: false,
    };
    return;
  }

  if(sp?.type === SET_PIECE.GOAL_KICK && isGoalkeeper(p)){
    executeGoalKickRelease(p, forceKey, powerBar, aimDir);
    return;
  }

  const kickMap = { short: 'pass', medium: 'through', long: 'cross' };
  executeKick(p, kickMap[forceKey] || 'pass', dir, power, 0);
}

export function performAutoSetPieceKick(taker){
  if(!taker || !Game.setPiece) return false;
  const sp = Game.setPiece;

  if(sp.type === SET_PIECE.THROW_IN){
    const forceKeys = ['short', 'medium', 'long'];
    const forceKey = forceKeys[Math.floor(Math.random() * forceKeys.length)];
    const power = 0.55 + Math.random() * 0.35;
    executeSetPieceRelease(taker, forceKey, power, defaultSetPieceAimDir(taker));
    return true;
  }

  if(sp.type !== SET_PIECE.GOAL_KICK && sp.type !== SET_PIECE.CORNER) return false;

  resetSetPieceCharge();
  const power = 0.55 + Math.random() * 0.35;
  const gx = taker.oppGoalX();
  const gy = CENTER.y + (Math.random() - 0.5) * 12;
  const dir = norm({ x: gx - taker.x, y: gy - taker.y });

  if(sp.type === SET_PIECE.GOAL_KICK && isGoalkeeper(taker)){
    executeGoalKickRelease(taker, 'long', power, dir);
    return true;
  }

  const kickType = sp.type === SET_PIECE.CORNER ? 'cross' : 'pass';
  executeKick(taker, kickType, dir, power, 0);
  return true;
}

export function autoExecuteSetPiece(taker){
  if(!taker || SetPieceManager.executed) return;
  const sp = Game.setPiece;
  if(!sp) return;
  if(sp.type === SET_PIECE.GOAL_KICK || sp.type === SET_PIECE.CORNER){
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
  if(sp.type !== SET_PIECE.GOAL_KICK && sp.type !== SET_PIECE.CORNER) return;

  const taker = getPlayerById(sp.takerId);
  if(!taker) return;

  SetPieceManager.executed = true;
  clearPlayerSetPieceState(taker);
  if(isGoalkeeper(taker)) taker.gkBallCollidable = true;

  if(!performAutoSetPieceKick(taker)) return;

  enterPlayingAfterAutoRestart(sp.team);
  showBanner(sp.type === SET_PIECE.CORNER ? 'Corner — auto-saque' : 'Saque de arco — auto-saque', 1400);
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

  setupThrowIn({ type: SET_PIECE.THROW_IN, team: rival, side, x, fromY: ball.y });
  showBanner('Saque lateral — rival', 1400);
}

export function handleSetPieceTimeout(){
  if(SetPieceManager.executed || Game.isBallInPlay) return;
  const sp = Game.setPiece;
  if(!sp) return;

  const restartType = sp.type;
  if(restartType === SET_PIECE.GOAL_KICK || restartType === SET_PIECE.CORNER){
    executeAutoRestart();
  } else if(restartType === SET_PIECE.THROW_IN){
    transferPossessionToOpponent();
  }
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
}

export function handleSetPiecePowerInput(p, input, aimDir){
  if(!isSetPieceAwaitingExecution(p)) return false;

  if(SetPieceManager.chargeType){
    const type = SetPieceManager.chargeType;
    const released = (type === 'short' && input.releasedPass) ||
      (type === 'medium' && input.releasedThrough) ||
      (type === 'long' && input.releasedCross);
    const elapsed = performance.now() - SetPieceManager.chargeStart;
    SetPieceManager.powerBar = clamp(elapsed / SET_PIECE_POWER_MAX_MS, 0.08, 1);
    if(released){
      executeSetPieceRelease(p, type, SetPieceManager.powerBar, aimDir);
    }
    return true;
  }

  if(input.heldPass && !input.heldThrough && !input.heldCross) startSetPieceCharge('short');
  else if(input.heldThrough && !input.heldPass && !input.heldCross) startSetPieceCharge('medium');
  else if(input.heldCross && !input.heldPass && !input.heldThrough) startSetPieceCharge('long');
  return true;
}

export function updateSetPieceManager(dt){
  if(!Game.setPieceMode || SetPieceManager.executed || Game.isBallInPlay) return;
  SetPieceManager.timer = Math.max(0, SetPieceManager.timer - dt);
  if(SetPieceManager.timer <= 0) handleSetPieceTimeout();
}

export function clearPlayerSetPieceState(p){
  if(!p) return;
  p.canMove = true;
  p.isStuck = false;
  p.blockDribbling = false;
  p.inSetPieceZone = false;
  if(p.state === STATE_FIXED) p.state = 'idle';
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
  SetPieceManager.timer = SET_PIECE_TIMER_DURATION;
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
}

export function isSetPieceTaker(p){
  return !!(p && Game.setPieceMode && Game.setPiece?.takerId === p.id);
}

export function isSetPieceShotOnly(p){
  if(!isSetPieceTaker(p)) return false;
  const t = Game.setPiece?.type;
  return t === SET_PIECE.CORNER || t === SET_PIECE.GOAL_KICK;
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
// R1/L2 al ejecutar la accion: +1 = rosca izquierda, -1 = rosca derecha, 0 = recto.
export function resolveInputCurve(input){
  if(input.heldR1 && !input.heldL2) return 1;
  if(input.heldL2 && !input.heldR1) return -1;
  return 0;
}

// Aceleracion lateral por frame, perpendicular al vector de velocidad ACTUAL (no al stick).
// curveFactor > 0 (R1): curva a la IZQUIERDA del movimiento · curveFactor < 0 (L2): a la DERECHA.
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

  let targetPoint = null;
  if(type === 'pass' || type === 'through'){
    const receiver = findPassReceiverByIntent(p, dir, p.id);
    if(receiver) targetPoint = {x: receiver.x, y: receiver.y};
  }
  if(!targetPoint){
    const landing = predictBallLanding(ball);
    if(landing) targetPoint = {x: landing.x, y: landing.y};
    else {
      const estDist = Math.max(speed * 0.85, 6);
      targetPoint = {x: p.x + dir.x * estDist, y: p.y + dir.y * estDist};
    }
  }
  ball.curvePassTarget = targetPoint;
  const passDist = Math.max(dist2D(ball.curveLineOrigin, ball.curvePassTarget), 1.5);
  ball.curveMaxDrift = passDist * CURVE_DRIFT_CAP_RATIO;
}

export function applyCurveEffect(b, dt){
  applyBallLateralCurve(b, dt);
}

export function applyBallLateralCurve(b, dt){
  if(b.state === BALL_STATE.IN_POSSESSION) return;
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

  // Normalizacion del vector de llegada: ultimos 2 m hacia el pie del receptor
  if(b.curvePassTarget && b.x != null && b.y != null){
    const distToTarget = dist2D(b, b.curvePassTarget);
    if(distToTarget < CURVE_ARRIVAL_LINEAR_DIST){
      const tx = b.curvePassTarget.x - b.x;
      const ty = b.curvePassTarget.y - b.y;
      const tdist = Math.hypot(tx, ty) || 0.01;
      const tvx = (tx / tdist) * sp;
      const tvy = (ty / tdist) * sp;
      b.vx = lerp(b.vx, tvx, CURVE_ARRIVAL_LERP);
      b.vy = lerp(b.vy, tvy, CURVE_ARRIVAL_LERP);
      cf *= clamp(distToTarget / CURVE_ARRIVAL_LINEAR_DIST, 0.12, 1);
    }
  }

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
  const curveDir = curve > 0 ? 1 : curve < 0 ? -1 : 0;
  if(type === 'shot'){
    const shotStyle = resolveShotStyle(curve);
    ball.shotStyle = shotStyle;
    let groundFrictionMult = SHOT_NORMAL_FRICTION_MULT;
    if(shotStyle === 'placed') groundFrictionMult = 1.0;
    else if(shotStyle === 'trivela') groundFrictionMult = SHOT_TRIVELA_FRICTION_MULT;
    if(!curveDir) return {curveFactor:0, groundFrictionMult};
    if(curveDir > 0) return {curveFactor: CURVE_ACCEL_SHOT_R1, groundFrictionMult};
    return {curveFactor: -CURVE_ACCEL_SHOT_L2, groundFrictionMult};
  }
  ball.shotStyle = null;
  const passGroundMult = (type==='pass' || type==='through' || type==='cross') ? 1.08 : 1;
  if(!curveDir) return {curveFactor:0, groundFrictionMult:passGroundMult};
  if(curveDir > 0) return {curveFactor: CURVE_ACCEL_PASS_R1, groundFrictionMult:passGroundMult};
  return {curveFactor: -CURVE_ACCEL_PASS_L2, groundFrictionMult:passGroundMult};
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
    this.shotStyle=null;      // 'normal' | 'placed' | 'trivela'
    this.rollAngle=0;
    this.passOrigin=null; // punto desde donde se pateo el ultimo PASE limpio (no tackle/rebote): sirve para no robar el cursor en pases cortos
    this.possessedBy=null; // id del jugador con posesion logica durante autopase / effort touch
    this.highKick=false; // true solo tras un tiro o un centro (pase alto): activa la fisica aerea extra
    this.highKickType=null; // 'shot' | 'cross': que configuracion de AERIAL_PHYSICS usar
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
  constructor(team, role, slot, number){
    this.id = PID++;
    this.team = team; // 'home' | 'away'
    this.role = role; // 'GK','DEF','MID','FWD'
    this.slot = slot; // posicion base normalizada {x,y} en coordenadas de cancha (para local; away se espeja)
    this.number = number;
    const spawn = team === 'home'
      ? { x: slot.x, y: slot.y }
      : { x: FIELD_L - slot.x, y: FIELD_W - slot.y };
    this.x = spawn.x;
    this.y = spawn.y;
    this.vx = 0;
    this.vy = 0;
    this.facing = team==='home'? 0 : Math.PI;
    this.dir = {x: Math.cos(this.facing), y: Math.sin(this.facing)}; // direccion normalizada (frente del jugador)
    this.dir = {x: Math.cos(this.facing), y: Math.sin(this.facing)}; // direccion normalizada (frente del jugador)
    this.animPhase = Math.random()*10;
    this.maxSpeedBase = role==='GK'? 5.4 : (role==='FWD'? 8.0 : 7.4);
    this.accel = 14;
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
    // Buffer exclusivo: una sola intencion ('PASS' | 'SHOT'); la carga vive en campos auxiliares
    this.pendingAction = null;
    this.pendingActionDetail = null; // 'pass' | 'through' | 'cross' | 'shot'
    this.pendingActionChargeStart = 0;
    this.pendingActionPower = 0;
    this.pendingActionCurve = 0;
    this.pendingActionManualL2 = false;
    this.pendingActionTimestamp = 0;
    this.pendingActionParams = null; // { type, power, kickType, curve, manualL2, timestamp } — armado al soltar
    this.isPowerLocked = false; // single charge lock: no re-cargar hasta ejecutar o perder buffer
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
    this.stumble = null; // {t, dur} — trastabille breve tras perder la pelota en una entrada/robo
    this.stun = null;    // {t, dur} — impacto: sin input ni seekBall
    this.staggered = null; // {t, dur} — desequilibrio tras perder posesion en un tacle
    this.tackleAnim = null; // {type:'stand'|'slide', t, dur, dirX, dirY, startX, startY, resolved, success}
    this.diveAnim = null; // {t, dur, startX, startY, targetX, targetY, resolved, success} — estirada del arquero
    this.airStrikeAnim = null; // {type, t, dur, action} — golpe aereo en curso
    this.airLock = null;       // {t, dur} — bloqueo de movimiento durante accion aerea (300ms)
    this.stickDir = {x:1, y:0}; // vector del stick al presionar (direccion manual de pase/remate)
    this.wallRun = null; // {active, dir, timer} — carrera automatica tras dar "la pared" (L1+pase)
    this.isMakingManualRun = false; // true mientras corre el desmarque manual post L1+X
    this.isEffortTouching = false;  // true durante effort touch (R1/R2) y recuperacion
    this.isFakeShooting = false;    // true durante fake shot activo
    this.isTechnicallyBusy = false; // grace period: bloquea fail-safe de proximidad
    this.ghostBallProximityT = 0;   // acumulador para deteccion de pelota fantasma
    this.runningSpeed = 0;          // velocidad de desmarque (clamp, nunca instantanea)
    this.hasRunDirectionLocked = false; // true tras el primer flick del stick derecho (one-time capture)
    this.lockedRunVector = null; // direccion fija del desmarque; ya no lee el stick derecho
    this.isPointingForPass = false; // brazo extendido pidiendo pase tras fijar direccion de desmarque
    this.pointingForPassT = 0;      // segundos señalando (max 2 s antes de cancelar visual)
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
   FORMACION 2-1-2 (6 vs 6: GK + 2 DEF + 1 MID + 2 FWD)
   coordenadas pensadas para el equipo que ataca hacia +x (home)
   ============================================================ */
export function buildTeam(team){
  const arr = [];
  const F = [
    {role:'GK',  slot:{x:5,  y:34}, n:1},
    {role:'DEF', slot:{x:24, y:19}, n:2},
    {role:'DEF', slot:{x:24, y:49}, n:3},
    {role:'MID', slot:{x:48, y:34}, n:6},
    {role:'FWD', slot:{x:68, y:19}, n:9},
    {role:'FWD', slot:{x:68, y:49}, n:10},
  ];
  F.forEach(f=>{
    const p = new Player(team, f.role, f.slot, f.n);
    arr.push(p);
  });
  return arr;
}

export const homeTeam = buildTeam('home');
export const awayTeam = buildTeam('away');
export const allPlayers = [...homeTeam, ...awayTeam];
export const ball = new Ball();

export const KICKOFF_HALF_MARGIN = 1.5; // separacion minima respecto de la linea media en el saque
export const KICKOFF_CIRCLE_MARGIN = 0.35; // margen extra fuera del circulo central para el equipo defensor
export const KICKOFF_TAKER_BALL_OFFSET = 0.85; // dentro de CTRL_RADIUS (1.0) para que la posesion no falle

export const KickoffManager = {
  timer: 0,
  executed: false,
};

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

export function enforceKickoffPositionRestrictions(){
  if(!isKickoffWaiting()) return;
  const defendingTeam = getKickoffDefendingTeam();
  if(!defendingTeam) return;
  for(const p of allPlayers){
    if(p.team === defendingTeam) clampKickoffDefenderPosition(p);
  }
}

export function resetKickoffManager(){
  KickoffManager.timer = 0;
  KickoffManager.executed = false;
}

export function enterKickoffState(kickingTeam, takerId){
  Game.matchState = STATE_KICKOFF;
  Game.kickoffTeam = kickingTeam;
  Game.kickoffTakerId = takerId;
  Game.isBallInPlay = false;
  KickoffManager.timer = SET_PIECE_TIMER_DURATION;
  KickoffManager.executed = false;
  maintainKickoffPlacement();
}

export function exitKickoffToPlaying(){
  Game.matchState = STATE_PLAYING;
  Game.kickoffTeam = null;
  Game.kickoffTakerId = null;
  Game.isBallInPlay = true;
  resetKickoffManager();
}

export function onKickoffReleased(){
  if(!isKickoffWaiting()) return;
  clearKickoffTakerState(getKickoffTaker());
  KickoffManager.executed = true;
  exitKickoffToPlaying();
}

export function executeAutoKickoff(){
  if(!isKickoffWaiting() || KickoffManager.executed) return;
  const taker = getKickoffTaker() || ball.owner;
  if(!taker || taker.team !== Game.kickoffTeam) return;
  if(taker.kickoffAnim) return;
  maintainKickoffPlacement();

  console.log('[KICKOFF] executeAutoKickoff', { takerId: taker.id, team: taker.team });

  if(startKickoffManeuver){
    startKickoffManeuver(taker, 'pass', 0.38, 0, { x: taker.attackDir(), y: (Math.random() - 0.5) * 0.2 });
    showBanner('Saque de centro — auto', 1200);
    return;
  }

  const dir = norm({
    x: taker.attackDir(),
    y: (Math.random() - 0.5) * 0.28,
  });
  executeKick(taker, 'pass', dir, 0.45 + Math.random() * 0.2, 0);
  showBanner('Saque de centro — auto', 1200);
}

export function updateKickoffManager(dt){
  if(!isKickoffWaiting()) return;
  const taker = getKickoffTaker();
  if(taker?.kickoffAnim) return;
  maintainKickoffPlacement();
  if(KickoffManager.executed) return;
  KickoffManager.timer = Math.max(0, KickoffManager.timer - dt);
  if(KickoffManager.timer <= 0) executeAutoKickoff();
}

export function placeKickoff(kickingTeam){
  allPlayers.forEach(p=>{
    const s = p.targetSlotWorld();
    // en el saque de mitad de cancha TODOS los jugadores deben arrancar de su propio lado. La misma
    // formacion base (targetSlotWorld) se reutiliza tambien durante el juego normal para reacomodarse,
    // y ahi si puede tener, por ejemplo, al delantero avanzado dentro de la mitad rival: sin este
    // "clamp" especifico del saque, ese mismo jugador terminaba arrancando el saque del lado contrario.
    const kx = p.team==='home'
      ? Math.min(s.x, CENTER.x - KICKOFF_HALF_MARGIN)
      : Math.max(s.x, CENTER.x + KICKOFF_HALF_MARGIN);
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
  Game.running = true;
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
  resetGoalZoneTracking();
  Game.isGoalScored = false;
  Game.twoPlayerMode = false; // la Arena de Practica es siempre de un solo jugador
  Game.controlledId2 = null;

  practicePlayer = homeTeam.find(pl=>pl.role==='FWD') || homeTeam[0];
  practiceGK = awayTeam.find(pl=>pl.role==='GK') || awayTeam[0];

  // el resto del plantel (no participa de la practica) se manda lejos, fuera de cuadro, para que
  // no interfiera con la fisica ni tape la vista
  allPlayers.forEach(pl=>{
    if(pl===practicePlayer || pl===practiceGK) return;
    pl.x = -60; pl.y = -60; pl.vx = 0; pl.vy = 0;
    pl.tackleAnim = null; pl.diveAnim = null; pl.airStrikeAnim = null; pl.wallRun = null;
    pl.isMakingManualRun = false; pl.hasRunDirectionLocked = false; pl.lockedRunVector = null;
    pl.isPointingForPass = false; pl.pointingForPassT = 0;
    pl.defaultForwardVector = null; pl.directionListenTimer = 0; pl.manualRunPadIndex = null;
    pl.gkKickAnim = null; pl.gkKickAnim = null;
    pl.charging = null; pl.stumble = null; pl.stun = null; pl.staggered = null; pl.state = 'idle';
  });

  resetPractice();
  setControlled(practicePlayer);
}
// reubica a jugador/arquero/pelota en la posicion inicial de practica, sin salir del modo (para el
// boton REINICIAR)
export function resetPractice(){
  practicePlayer.x = PRACTICE_SHOT_X;
  practicePlayer.y = CENTER.y;
  practicePlayer.vx = 0; practicePlayer.vy = 0;
  practicePlayer.facing = 0; // mira hacia +x: hacia el arco objetivo, de espaldas a la camara
  syncPlayerDir(practicePlayer);
  syncPlayerDir(practicePlayer);
  practicePlayer.tackleAnim = null; practicePlayer.diveAnim = null; practicePlayer.airStrikeAnim = null;
  practicePlayer.wallRun = null;
  practicePlayer.isMakingManualRun = false;
  practicePlayer.hasRunDirectionLocked = false;
  practicePlayer.lockedRunVector = null;
  practicePlayer.isPointingForPass = false;
  practicePlayer.pointingForPassT = 0;
  practicePlayer.defaultForwardVector = null;
  practicePlayer.directionListenTimer = 0;
  practicePlayer.manualRunPadIndex = null;
  practicePlayer.charging = null; practicePlayer.stumble = null; practicePlayer.stun = null;
  practicePlayer.staggered = null; practicePlayer.stun = null;
  practicePlayer.staggered = null;
  practicePlayer.iaSeeking = false; practicePlayer.targetPosition = null;
  practicePlayer.landingTime = 0; practicePlayer.seekAerial = false;
  clearPlayerPendingAction(practicePlayer);
  practicePlayer.manualCancelActive = false;
  practicePlayer.state = 'idle'; practicePlayer.releaseCooldown = 0; practicePlayer.tackleCooldown = 0;

  practiceGK.x = FIELD_L - 4.5; practiceGK.y = CENTER.y;
  practiceGK.vx = 0; practiceGK.vy = 0; practiceGK.facing = Math.PI;
  practiceGK.diveAnim = null; practiceGK.gkKickAnim = null; practiceGK.tackleCooldown = 0; practiceGK.state = 'idle';

  ball.reset(PRACTICE_SHOT_X - 1.3, CENTER.y);
  setBallStateInPossession(practicePlayer);
  ball.lastTouchTeam = 'home';
  ball.lastKicker = null;

  PCAM.x = practicePlayer.x - PCAM.behind;
  PCAM.laneY = practicePlayer.y;
}
// gol convertido dentro de la Arena de Practica: no suma marcador ni dispara festejo (no aplica
// sin partido), solo un cartel breve y la pelota vuelve a los pies del jugador
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
  twoPlayerMode:false,   // true: jugador 2 controla al equipo VISITA con otro joystick (o teclado alternativo)
  controlledId2: null,
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
  matchState: STATE_PLAYING, // STATE_PLAYING | STATE_KICKOFF
  kickoffTeam: null,    // equipo que saca durante STATE_KICKOFF
  kickoffTakerId: null, // sacador designado en el saque de centro
  isBallInPlay: true,   // false hasta que el sacador golpee/lance la pelota
  wasInterceptionEligible: false, // borde de deteccion para asignar randomDelay a la IA
  nearestSeekerHome: null,        // id del CPU mas cercano a la pelota (equipo local)
  nearestSeekerAway: null,        // id del CPU mas cercano a la pelota (equipo visita)
  nearestSeekerTimerHome: 0,      // cuenta regresiva antes de recalcular (hysteresis)
  nearestSeekerTimerAway: 0,
};

export function setControlled(p){ Game.controlledId = p.id; }
export function setControlled2(p){ Game.controlledId2 = p.id; }
export function controlledPlayer(){ return allPlayers.find(p=>p.id===Game.controlledId); }
export function controlledPlayer2(){ return allPlayers.find(p=>p.id===Game.controlledId2); }

export function resetMatchForStart(){
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
  isFakeShotActive = false;
  fakeShotOwnerId = null;
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
export let tryExecuteBufferedActionOnPossession = null;
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
  if (deps.tryExecuteBufferedActionOnPossession !== undefined) tryExecuteBufferedActionOnPossession = deps.tryExecuteBufferedActionOnPossession;
  if (deps.readRightStick !== undefined) readRightStick = deps.readRightStick;
  if (deps.anyKey !== undefined) anyKey = deps.anyKey;
  if (deps.anyKeyPrev !== undefined) anyKeyPrev = deps.anyKeyPrev;
  if (deps.isControlledByHuman !== undefined) isControlledByHuman = deps.isControlledByHuman;
}

export function resetInputEdgeDetection() {
  if (typeof snapshotKeys === 'function') snapshotKeys();
  for (const k in prevButtonsByPad) delete prevButtonsByPad[k];
}

