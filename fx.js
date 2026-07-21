"use strict";

import { ctx, canvas } from './state.js';

/* ============================================================
   FX — estilo Broadcast Moderno (Canvas 2D).
   Paleta centralizada, césped vibrante realista, acentos azul/cian.
   ============================================================ */

/** Paleta principal — transmisión deportiva moderna. */
export const BROADCAST = {
  grassPrimary: '#26B36A',
  grassSecondary: '#1FA35F',
  grassShadow: '#178F52',
  lineWhite: '#FFFFFF',
  uiBlue: '#1E88FF',
  uiCyan: '#00D4FF',
  uiDark: '#0E1624',
  uiPanel: '#152238',
  uiBorder: '#1E3A5F',
  textMuted: '#A8C4E8',
  teamHome: '#1E88FF',
  teamHomeShorts: '#1254B8',
  teamAway: '#E83838',
  teamAwayShorts: '#9E1A1A',
  gkHome: '#F5C400',
  gkAway: '#00BFA5',
  cursorP1: '#00D4FF',
  cursorP2: '#E53935',
  cursorAssist: '#9E9E9E',
  cursorTimeFinish: '#00E676',
  urgent: '#ff5252',
  urgentSoft: '#ffb4b4',
  markerCross: '#00D4FF',
  powerPass: '#26B36A',
  powerThrough: '#1E88FF',
  powerCross: '#00D4FF',
  powerShot: '#ff5252',
  radarBg: '#0E1624',
  radarGrass: '#1FA35F',
  outlineDefault: '#141428',
  skin: '#ffcb9a',
  skinOutline: '#3d2818',
  hair: '#1e1408',
  boot: '#141428',
  ball: '#ffffff',
  ballPanel: '#141428',
};

export const SUN = {
  lx: -0.55,
  ly: -0.80,
  shadowDx: 0.42,
  shadowDy: 0.10,
};

/** Alias retrocompatible — apunta a la paleta broadcast. */
export const CARTOON = BROADCAST;

/** Contorno oscuro según equipo (negro/azul/rojo profundo). */
export function teamOutlineColor(team){
  if(team === 'home') return '#0a1635';
  if(team === 'away') return '#3b0a0a';
  return CARTOON.outlineDefault;
}

export function outlineWidth(h){
  return Math.max(1.15, h * 0.048);
}

/* --- sombra de contacto DURA (borde definido, sin falloff suave) --- */
let shadowSprite = null;
function getShadowSprite(){
  if(shadowSprite) return shadowSprite;
  shadowSprite = document.createElement('canvas');
  shadowSprite.width = 128;
  shadowSprite.height = 64;
  const g = shadowSprite.getContext('2d');
  g.translate(64, 32);
  g.scale(1, 0.5);
  const grad = g.createRadialGradient(0, 0, 2, 0, 0, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.52, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.53, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 62, 0, Math.PI * 2);
  g.fill();
  return shadowSprite;
}

export function drawEntityShadow(x, y, rx, ry, alpha = 0.48){
  const spr = getShadowSprite();
  ctx.globalAlpha = alpha;
  ctx.drawImage(spr, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1;
}

/* --- toon shading: bandas discretas (sin Lambert suave) --- */
const shadeCache = new Map();
const TOON_LEVELS = [-0.42, 0, 0.18];

export function shade(color, amt){
  const key = color + '|' + amt;
  const hit = shadeCache.get(key);
  if(hit) return hit;
  let r = 128, g = 128, b = 128;
  if(color[0] === '#'){
    const hex = color.length === 4
      ? color.slice(1).replace(/./g, ch => ch + ch)
      : color.slice(1);
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  const f = c => amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt));
  const out = `rgb(${f(r)},${f(g)},${f(b)})`;
  shadeCache.set(key, out);
  return out;
}

export function toonShade(color, bandIndex){
  const idx = clampBand(bandIndex);
  return shade(color, TOON_LEVELS[idx]);
}

function clampBand(i){
  if(i <= 0) return 0;
  if(i >= 2) return 2;
  return i | 0;
}

/** Color plano sin degradado — shorts, medias, piel secundaria. */
export function flatMaterial(color){
  return color;
}

const litCache = new Map();

/**
 * Material con Toon Shading: gradiente con bandas sólidas (sin transición suave).
 */
export function litMaterial(color, h){
  const hq = Math.max(8, Math.round(h / 6) * 6);
  const key = color + '|toon3|' + hq;
  const hit = litCache.get(key);
  if(hit) return hit;

  const shadow = toonShade(color, 0);
  const mid = color;
  const hi = toonShade(color, 2);

  const grad = ctx.createLinearGradient(
    hq * 0.2 * SUN.lx, -hq * 0.75,
    -hq * 0.22 * SUN.lx, -hq * 0.5,
  );
  grad.addColorStop(0, shadow);
  grad.addColorStop(0.34, shadow);
  grad.addColorStop(0.341, mid);
  grad.addColorStop(0.68, mid);
  grad.addColorStop(0.681, hi);
  grad.addColorStop(1, hi);

  litCache.set(key, grad);
  return grad;
}

/** Rellena un path ya definido y aplica contorno cartoon. */
export function fillWithOutline(fillStyle, outlineColor, lineW){
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = lineW;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Trazo con doble capa: contorno + color interior (piernas/brazos). */
export function strokeBone(x0, y0, x1, y1, color, legW, outlineColor){
  const ol = Math.max(0.9, legW * 0.52);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = legW + ol;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = legW;
  ctx.stroke();
}

/* --- atmósfera de estadio (fondo, horizonte, profundidad) ---------------- */
const ATM = {
  deep: '#020B1F',
  mid: '#06142E',
  lift: '#0A1E40',
};

let atmosphereGrad = null;
let atmosphereSideGrad = null;
let atmosphereKey = '';
let skyGrad = null, skyHorizon = 0, skyH = 0;
let horizonHazeGrad = null;
let horizonHazeKey = '';
let fieldHazeGrad = null;
let fieldHazeKey = '';

/** Fondo completo del estadio — azul marino con variación tonal, sin negro puro. */
export function drawStadiumAtmosphere(){
  const w = canvas.width, h = canvas.height;
  const key = `${w}|${h}`;
  if(!atmosphereGrad || atmosphereKey !== key){
    atmosphereKey = key;
    atmosphereGrad = ctx.createLinearGradient(0, 0, 0, h);
    atmosphereGrad.addColorStop(0, ATM.lift);
    atmosphereGrad.addColorStop(0.28, '#081A38');
    atmosphereGrad.addColorStop(0.55, ATM.mid);
    atmosphereGrad.addColorStop(0.82, '#041228');
    atmosphereGrad.addColorStop(1, ATM.deep);
    atmosphereSideGrad = ctx.createLinearGradient(0, 0, w, 0);
    atmosphereSideGrad.addColorStop(0, 'rgba(2,11,31,0.42)');
    atmosphereSideGrad.addColorStop(0.22, 'rgba(0,0,0,0)');
    atmosphereSideGrad.addColorStop(0.78, 'rgba(0,0,0,0)');
    atmosphereSideGrad.addColorStop(1, 'rgba(2,11,31,0.42)');
  }
  ctx.fillStyle = atmosphereGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = atmosphereSideGrad;
  ctx.fillRect(0, 0, w, h);
}

/** Halos difusos simulando iluminación de estadio (muy sutiles). */
export function drawStadiumLights(horizonFrac){
  const w = canvas.width, h = canvas.height;
  const horizonY = h * horizonFrac;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const lights = [
    { x: w * 0.12, y: horizonY + h * 0.06, r: w * 0.20, a: 0.035 },
    { x: w * 0.88, y: horizonY + h * 0.06, r: w * 0.20, a: 0.035 },
    { x: w * 0.34, y: horizonY + h * 0.03, r: w * 0.14, a: 0.022 },
    { x: w * 0.66, y: horizonY + h * 0.03, r: w * 0.14, a: 0.022 },
    { x: w * 0.50, y: horizonY + h * 0.02, r: w * 0.28, a: 0.025 },
  ];
  for(const L of lights){
    const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    g.addColorStop(0, `rgba(130,175,230,${L.a})`);
    g.addColorStop(0.45, `rgba(50,85,140,${L.a * 0.45})`);
    g.addColorStop(1, 'rgba(2,11,31,0)');
    ctx.fillStyle = g;
    ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
  }
  ctx.restore();
}

/** Niebla atmosférica en el horizonte — transición suave cielo ↔ fondo. */
export function drawHorizonHaze(horizonFrac){
  const w = canvas.width, h = canvas.height;
  const horizonY = h * horizonFrac;
  const bandTop = horizonY - h * 0.16;
  const bandH = h * 0.28;
  const key = `${w}|${h}|${horizonFrac}`;
  if(!horizonHazeGrad || horizonHazeKey !== key){
    horizonHazeKey = key;
    horizonHazeGrad = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
    horizonHazeGrad.addColorStop(0, 'rgba(10,30,64,0)');
    horizonHazeGrad.addColorStop(0.35, 'rgba(8,24,52,0.06)');
    horizonHazeGrad.addColorStop(0.62, 'rgba(6,20,46,0.14)');
    horizonHazeGrad.addColorStop(0.85, 'rgba(4,14,38,0.22)');
    horizonHazeGrad.addColorStop(1, 'rgba(2,11,31,0.30)');
  }
  ctx.fillStyle = horizonHazeGrad;
  ctx.fillRect(0, bandTop, w, bandH);
}

/** Atenuación atmosférica en la zona lejana de la cancha (sin tocar franjas base). */
export function drawFieldDepthHaze(horizonFrac, groundFrac){
  const w = canvas.width, h = canvas.height;
  const horizonY = h * horizonFrac;
  const groundY = h * groundFrac;
  const span = Math.max(1, groundY - horizonY);
  const key = `${w}|${h}|${horizonFrac}|${groundFrac}`;
  if(!fieldHazeGrad || fieldHazeKey !== key){
    fieldHazeKey = key;
    fieldHazeGrad = ctx.createLinearGradient(0, horizonY, 0, groundY);
    fieldHazeGrad.addColorStop(0, 'rgba(6,20,46,0.20)');
    fieldHazeGrad.addColorStop(0.30, 'rgba(4,14,38,0.11)');
    fieldHazeGrad.addColorStop(0.58, 'rgba(2,11,31,0.05)');
    fieldHazeGrad.addColorStop(0.82, 'rgba(2,11,31,0.015)');
    fieldHazeGrad.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = fieldHazeGrad;
  ctx.fillRect(0, horizonY, w, span);
}

/** Cielo — degradado continuo, transiciones suaves, tonos azules. */
export function drawSkyBackground(horizonFrac){
  const h = canvas.height * horizonFrac;
  if(!skyGrad || skyHorizon !== horizonFrac || skyH !== canvas.height){
    skyHorizon = horizonFrac;
    skyH = canvas.height;
    skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#3a7fbe');
    skyGrad.addColorStop(0.18, '#4288c6');
    skyGrad.addColorStop(0.38, '#4d94cf');
    skyGrad.addColorStop(0.55, '#5da0d8');
    skyGrad.addColorStop(0.70, '#72b0df');
    skyGrad.addColorStop(0.82, '#88c0e8');
    skyGrad.addColorStop(0.92, '#9ccce8');
    skyGrad.addColorStop(0.97, '#8ab4d0');
    skyGrad.addColorStop(1, '#6a98c0');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, h + 4);
}

export function invalidateSkyCache(){
  skyGrad = null;
  atmosphereGrad = null;
  atmosphereSideGrad = null;
  atmosphereKey = '';
  horizonHazeGrad = null;
  horizonHazeKey = '';
  fieldHazeGrad = null;
  fieldHazeKey = '';
}
