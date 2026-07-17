"use strict";

/** Metros reales por unidad del motor (1 unidad = WORLD_SCALE m). */
export const WORLD_SCALE = 0.5;

/** Convierte una medida en metros reales a unidades del motor. */
export function toGameUnits(meters){
  return meters / WORLD_SCALE;
}

/** Convierte unidades del motor a metros reales. */
export function toMeters(gameUnits){
  return gameUnits * WORLD_SCALE;
}
