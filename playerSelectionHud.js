"use strict";

import { ARCHETYPE_LABELS, getArchetypeIcon } from './archetypes.js';

const GENERIC_SURNAMES = [
  'Martínez', 'Gómez', 'López', 'Ruiz', 'Fernández', 'Díaz', 'Torres', 'Silva',
  'Romero', 'Álvarez', 'Castro', 'Vega', 'Molina', 'Herrera', 'Suárez', 'Ramos',
  'Ortega', 'Navarro', 'Medina', 'Pérez', 'Soto', 'Ibáñez', 'Campos', 'Reyes',
];

const GENERIC_FIRST_NAMES = [
  'Lucas', 'Mateo', 'Nico', 'Diego', 'Santi', 'Facu', 'Tomás', 'Julián',
  'Bruno', 'Agustín', 'Franco', 'Emi', 'Leo', 'Iván', 'Marcos', 'Pablo',
];

/** Asigna un nombre genérico estable por jugador (editable después). */
export function assignPlayerDisplayName(p, teamSeed = 0){
  if(!p) return;
  const idx = ((p.number || 1) + teamSeed * 17 + (p.id || 0)) % GENERIC_SURNAMES.length;
  const firstIdx = (idx + p.number) % GENERIC_FIRST_NAMES.length;
  p.displayName = `${GENERIC_FIRST_NAMES[firstIdx]} ${GENERIC_SURNAMES[idx]}`;
}

let hudEl = null;
let homeIconEl = null;
let homeNameEl = null;
let homeRoleEl = null;
let awayIconEl = null;
let awayNameEl = null;
let awayRoleEl = null;
let awayPanelEl = null;

export function initPlayerSelectionHud(){
  hudEl = document.getElementById('selectionHud');
  homeIconEl = document.getElementById('selectionIconHome');
  homeNameEl = document.getElementById('selectionNameHome');
  homeRoleEl = document.getElementById('selectionRoleHome');
  awayIconEl = document.getElementById('selectionIconAway');
  awayNameEl = document.getElementById('selectionNameAway');
  awayRoleEl = document.getElementById('selectionRoleAway');
  awayPanelEl = document.getElementById('selectionPanelAway');
}

function formatPanel(p, iconEl, nameEl, roleEl){
  if(!p || p.role === 'GK'){
    if(iconEl) iconEl.textContent = '';
    if(nameEl) nameEl.textContent = '—';
    if(roleEl) roleEl.textContent = '';
    return;
  }
  const icon = getArchetypeIcon(p) || '';
  const label = p.archetype ? (ARCHETYPE_LABELS[p.archetype] || '') : '';
  if(iconEl) iconEl.textContent = icon;
  if(nameEl) nameEl.textContent = p.displayName || `Jugador ${p.number}`;
  if(roleEl) roleEl.textContent = label;
}

export function refreshPlayerSelectionHud(opts = {}){
  if(!hudEl) return;

  const {
    gameState = 'menu',
    twoPlayerMode = false,
    controlledHome = null,
    controlledAway = null,
    visible = true,
  } = opts;

  const show = visible && (gameState === 'match' || gameState === 'kickoff' || gameState === 'celebration_run');
  hudEl.style.display = show ? 'flex' : 'none';
  if(!show) return;

  formatPanel(controlledHome, homeIconEl, homeNameEl, homeRoleEl);
  if(awayPanelEl) awayPanelEl.style.display = twoPlayerMode ? 'flex' : 'none';
  if(twoPlayerMode){
    formatPanel(controlledAway, awayIconEl, awayNameEl, awayRoleEl);
  }
}
