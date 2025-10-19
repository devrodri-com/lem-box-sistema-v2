// src/lib/weight.ts
export const LB_TO_KG = 0.45359237;
export const KG_TO_LB = 1 / LB_TO_KG;

function roundHalfUp(value: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor + Number.EPSILON) / factor;
}

export function lbToKg(lb: number, digits = 2): number {
  return roundHalfUp(lb * LB_TO_KG, digits);
}

export function kgToLb(kg: number, digits = 2): number {
  return roundHalfUp(kg * KG_TO_LB, digits);
}

/** Devuelve "X lb / Y kg" a partir de libras. */
export function fmtWeightPairFromLb(lb: number, dLb = 2, dKg = 2): string {
  const vLb = roundHalfUp(Number(lb || 0), dLb).toFixed(dLb);
  const vKg = roundHalfUp(lbToKg(lb || 0, dKg), dKg).toFixed(dKg);
  return `${vLb} lb / ${vKg} kg`;
}