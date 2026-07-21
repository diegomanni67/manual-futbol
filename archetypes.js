"use strict";

/** Arquetipos tácticos — modifican físicas, controles y HUD según posición en la formación. */

export const ARCHETYPE = {
  PROTECTOR: 'protector',
  VELOZ: 'veloz',
  PASADOR: 'pasador',
  MAGO: 'mago',
  KILLER: 'killer',
};

export const ARCHETYPE_ICONS = {
  [ARCHETYPE.PROTECTOR]: '🛡️',
  [ARCHETYPE.VELOZ]: '⚡',
  [ARCHETYPE.PASADOR]: '🌀',
  [ARCHETYPE.MAGO]: '🎩',
  [ARCHETYPE.KILLER]: '🎯',
};

export const ARCHETYPE_LABELS = {
  [ARCHETYPE.PROTECTOR]: 'Protector',
  [ARCHETYPE.VELOZ]: 'Veloz',
  [ARCHETYPE.PASADOR]: 'Pasador',
  [ARCHETYPE.MAGO]: 'Mago',
  [ARCHETYPE.KILLER]: 'Killer',
};

/** Posición táctica → arquetipo (6vs6 y 11vs11). */
const POS_ROLE_MAP = {
  DFC: ARCHETYPE.PROTECTOR,
  LCB: ARCHETYPE.PROTECTOR,
  RCB: ARCHETYPE.PROTECTOR,
  CB: ARCHETYPE.PROTECTOR,
  MCD: ARCHETYPE.PROTECTOR,
  CDM: ARCHETYPE.PROTECTOR,

  DFD: ARCHETYPE.VELOZ,
  DFI: ARCHETYPE.VELOZ,
  LB: ARCHETYPE.VELOZ,
  RB: ARCHETYPE.VELOZ,
  MD: ARCHETYPE.VELOZ,
  MI: ARCHETYPE.VELOZ,
  LM: ARCHETYPE.VELOZ,
  RM: ARCHETYPE.VELOZ,
  ED: ARCHETYPE.VELOZ,
  EI: ARCHETYPE.VELOZ,
  LW: ARCHETYPE.VELOZ,
  RW: ARCHETYPE.VELOZ,

  MC: ARCHETYPE.PASADOR,
  CM: ARCHETYPE.PASADOR,

  MCO: ARCHETYPE.MAGO,
  CAM: ARCHETYPE.MAGO,

  DC: ARCHETYPE.KILLER,
  ST: ARCHETYPE.KILLER,
};

const ROLE_FALLBACK = {
  DEF: ARCHETYPE.PROTECTOR,
  MID: ARCHETYPE.PASADOR,
  FWD: ARCHETYPE.KILLER,
};

/** Modificadores por arquetipo (valores relativos: 1 = sin cambio). */
export const ARCHETYPE_MODS = {
  [ARCHETYPE.PROTECTOR]: {
    jockeySpeedFactor: 1.0,
    jockeyStealRadiusMult: 1.50,
    tackleRadiusMult: 1.25,
    slideReachMult: 1.18,
    tackleLookMult: 1.12,
  },
  [ARCHETYPE.VELOZ]: {
    maxSpeedMult: 1.25,
    accelMult: 1.25,
  },
  [ARCHETYPE.PASADOR]: {
    passCurveMult: 1.25,
    throughMaxSpeedMult: 1.25,
    passMaxSpeedMult: 1.12,
  },
  [ARCHETYPE.MAGO]: {
    dribbleAgilityMult: 1.85,
    turnRateMult: 1.58,
    dribbleSharpTurnBleedMult: 0.42,
    turnTouchAngleMult: 1.38,
    effortTouchLongDistMult: 1.45,
    effortTouchAnimMult: 0.92,
    effortTouchCooldownMult: 0.85,
    /** +20% velocidad/aceleración durante sprint_chase del effort touch. */
    effortChaseSpeedMult: 1.20,
  },
  [ARCHETYPE.KILLER]: {
    shotPowerMult: 1.25,
    aerialPowerMult: 1.25,
    shotSpecialCurveMult: 1.25,
  },
};

export function resolveArchetypeFromPosRole(posRole, role){
  if(role === 'GK') return null;
  const key = String(posRole || '').toUpperCase();
  if(POS_ROLE_MAP[key]) return POS_ROLE_MAP[key];
  if(role && ROLE_FALLBACK[role]) return ROLE_FALLBACK[role];
  return null;
}

function getMods(p){
  if(!p?.archetype) return null;
  return ARCHETYPE_MODS[p.archetype] || null;
}

export function applyArchetypeToPlayer(p){
  if(!p) return;
  p.archetype = resolveArchetypeFromPosRole(p.posRole, p.role);
  p.archetypeIcon = p.archetype ? ARCHETYPE_ICONS[p.archetype] : null;
}

export function applyArchetypesToAllPlayers(players){
  for(const p of players) applyArchetypeToPlayer(p);
}

export function getArchetypeIcon(p){
  return p?.archetypeIcon || (p?.archetype ? ARCHETYPE_ICONS[p.archetype] : null);
}

export function getArchetypeMaxSpeedMult(p){
  const m = getMods(p);
  return m?.maxSpeedMult ?? 1;
}

export function getArchetypeAccelMult(p){
  const m = getMods(p);
  return m?.accelMult ?? 1;
}

/** Factor de velocidad en jockey: Protector = sprint pleno (1.0), resto = contención estándar (0.55). */
export function getArchetypeJockeySpeedFactor(p){
  const m = getMods(p);
  if(m?.jockeySpeedFactor != null) return m.jockeySpeedFactor;
  return 0.55;
}

export function getArchetypeJockeyStealRadiusMult(p){
  return getMods(p)?.jockeyStealRadiusMult ?? 1;
}

export function getArchetypeTackleRadiusMult(p){
  return getMods(p)?.tackleRadiusMult ?? 1;
}

export function getArchetypeSlideReachMult(p){
  return getMods(p)?.slideReachMult ?? 1;
}

export function getArchetypeTackleLookMult(p){
  return getMods(p)?.tackleLookMult ?? 1;
}

export function getArchetypePassCurveMult(p, kickType){
  const m = getMods(p);
  if(!m?.passCurveMult || kickType === 'shot') return 1;
  if(kickType === 'pass' || kickType === 'through' || kickType === 'cross') return m.passCurveMult;
  return 1;
}

export function getArchetypeKickSpeedTableMult(p, kickType){
  const m = getMods(p);
  if(!m) return 1;
  if(kickType === 'through') return m.throughMaxSpeedMult ?? 1;
  if(kickType === 'pass' || kickType === 'cross') return m.passMaxSpeedMult ?? 1;
  if(kickType === 'shot') return m.shotPowerMult ?? 1;
  return 1;
}

export function getArchetypeShotSpecialCurveMult(p, curve){
  if(!curve) return 1;
  const m = getMods(p);
  return m?.shotSpecialCurveMult ?? 1;
}

export function getArchetypeAerialPowerMult(p){
  return getMods(p)?.aerialPowerMult ?? 1;
}

export function getArchetypeDribbleAgility(baseAgility, p){
  const mult = getMods(p)?.dribbleAgilityMult ?? 1;
  return Math.min(1, baseAgility * mult);
}

export function getArchetypeTurnRateMult(p, dribbling){
  if(!dribbling) return 1;
  return getMods(p)?.turnRateMult ?? 1;
}

export function getArchetypeDribbleSharpTurnBleedMult(p, dribbling){
  if(!dribbling) return 1;
  return getMods(p)?.dribbleSharpTurnBleedMult ?? 1;
}

export function getArchetypeTurnTouchAngleMult(p, dribbling){
  if(!dribbling) return 1;
  return getMods(p)?.turnTouchAngleMult ?? 1;
}

export function getArchetypeEffortTouchLongDistMult(p){
  return getMods(p)?.effortTouchLongDistMult ?? 1;
}

export function getArchetypeEffortChaseSpeedMult(p){
  return getMods(p)?.effortChaseSpeedMult ?? 1;
}

export function getArchetypeEffortTouchAnimMult(p){
  return getMods(p)?.effortTouchAnimMult ?? 1;
}

export function getArchetypeEffortTouchCooldownMult(p){
  return getMods(p)?.effortTouchCooldownMult ?? 1;
}

/** Aplica multiplicadores de velocidad base/aceleración tras calcular stats del modo. */
export function applyArchetypePhysicsStats(p){
  applyArchetypeToPlayer(p);
  const speedMult = getArchetypeMaxSpeedMult(p);
  const accelMult = getArchetypeAccelMult(p);
  if(speedMult !== 1){
    p.maxSpeedBase *= speedMult;
    p.maxSpeed *= speedMult;
  }
  if(accelMult !== 1){
    p.accel *= accelMult;
  }
}
