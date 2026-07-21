"use strict";

/**
 * Sistema modular de apariencia de jugadores.
 * Capas independientes preparadas para un futuro editor:
 * camiseta, pantalón, medias, botines, peinado, barba, accesorios.
 */

export const APPEARANCE_LAYERS = Object.freeze([
  'shirt', 'shorts', 'socks', 'boots', 'hair', 'beard', 'accessory',
]);

export const SKIN_TONES = Object.freeze([
  '#ffe0bd', '#ffcd9a', '#e0ac69', '#c68642', '#8d5524', '#5c3317', '#3b2213',
]);

export const HAIR_STYLES = Object.freeze([
  'short', 'fade', 'buzz', 'afro', 'long', 'mohawk', 'bald', 'curly',
]);

export const HAIR_COLORS = Object.freeze([
  '#1a1208', '#2c1a0e', '#3d2314', '#5c3310', '#8b5a2b',
  '#1e1e1e', '#4a3728', '#6b4423', '#c4a35a', '#d4d4d4',
]);

export const BOOT_COLORS = Object.freeze([
  '#141428', '#1a1a1a', '#ffffff', '#e83838', '#1E88FF',
  '#F5C400', '#00BFA5', '#7b2cbf', '#ff6b00', '#2e7d32',
]);

export const BEARD_STYLES = Object.freeze(['none', 'stubble', 'goatee', 'full']);

export const ACCESSORY_TYPES = Object.freeze(['none', 'wristband', 'headband']);

export const HEIGHT_MIN_M = 1.60;
export const HEIGHT_MAX_M = 2.00;
export const WEIGHT_MIN_KG = 55;
export const WEIGHT_MAX_KG = 160;

/** Hash determinista a partir de id/equipo/número. */
function hashSeed(str){
  let h = 2166136261;
  const s = String(str);
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, seed, salt){
  const h = hashSeed(`${seed}:${salt}`);
  return arr[h % arr.length];
}

function ranged(seed, salt, min, max){
  const h = hashSeed(`${seed}:${salt}`);
  const t = (h % 10000) / 9999;
  return min + t * (max - min);
}

/**
 * Genera apariencia procedural única por jugador.
 * @param {{ id?: number, team: string, number: number, role: string, posRole?: string }} p
 */
export function createPlayerAppearance(p){
  const seed = `${p.team}|${p.number}|${p.role}|${p.posRole || ''}|${p.id ?? 0}`;
  const isGk = p.role === 'GK';

  // Arqueros: sesgo a más altos; delanteros un poco más livianos.
  let heightM = ranged(seed, 'h', HEIGHT_MIN_M, HEIGHT_MAX_M);
  let weightKg = ranged(seed, 'w', WEIGHT_MIN_KG, WEIGHT_MAX_KG);
  if(isGk){
    heightM = Math.max(heightM, 1.82);
    weightKg = Math.max(weightKg, 75);
  } else if(p.posRole === 'ST' || p.role === 'FWD'){
    weightKg = Math.min(weightKg, 95);
  } else if(p.role === 'DEF'){
    weightKg = Math.max(weightKg, 70);
  }

  heightM = Math.round(heightM * 100) / 100;
  weightKg = Math.round(weightKg);

  const hairStyle = pick(HAIR_STYLES, seed, 'hs');
  const hairColor = pick(HAIR_COLORS, seed, 'hc');
  const skinTone = pick(SKIN_TONES, seed, 'sk');
  const bootColor = pick(BOOT_COLORS, seed, 'bt');
  const beardStyle = pick(BEARD_STYLES, seed, 'bd');
  const accessory = pick(ACCESSORY_TYPES, seed, 'ac');

  return {
    seed,
    skinTone,
    heightM,
    weightKg,
    layers: {
      shirt: { id: 'kit_primary', color: null },
      shorts: { id: 'kit_shorts', color: null },
      socks: { id: 'kit_socks', color: null },
      boots: { id: 'boots_std', color: bootColor },
      hair: { id: hairStyle, color: hairColor },
      beard: { id: beardStyle, color: hairColor },
      accessory: { id: accessory, color: bootColor },
    },
  };
}

/** Escala visual a partir de altura/peso. */
export function getBodyScale(appearance){
  if(!appearance) return { heightScale: 1, widthScale: 1 };
  const hNorm = (appearance.heightM - HEIGHT_MIN_M) / (HEIGHT_MAX_M - HEIGHT_MIN_M);
  const wNorm = (appearance.weightKg - WEIGHT_MIN_KG) / (WEIGHT_MAX_KG - WEIGHT_MIN_KG);
  return {
    heightScale: 0.86 + hNorm * 0.28,
    widthScale: 0.82 + wNorm * 0.38,
  };
}

/** Paleta resuelta para el render (capas + kit de equipo). */
export function resolveAppearancePalette(p, kitColors){
  const app = p?.appearance;
  if(!app){
    return {
      skin: '#ffcb9a',
      hair: '#1e1408',
      boot: '#141428',
      beard: 'none',
      hairStyle: 'short',
      accessory: 'none',
      shirt: kitColors?.shirt,
      shorts: kitColors?.shorts,
      sock: kitColors?.sock,
    };
  }
  return {
    skin: app.skinTone,
    hair: app.layers.hair.color,
    boot: app.layers.boots.color,
    beard: app.layers.beard.id,
    hairStyle: app.layers.hair.id,
    accessory: app.layers.accessory.id,
    shirt: kitColors?.shirt,
    shorts: kitColors?.shorts,
    sock: kitColors?.sock,
  };
}

/** Asigna apariencia a un jugador si aún no la tiene. */
export function ensurePlayerAppearance(p){
  if(!p) return null;
  if(!p.appearance) p.appearance = createPlayerAppearance(p);
  return p.appearance;
}
