// src/hooks/useWeightVerification.ts
import { useMemo, useState } from "react";

export type WeightStatus = "idle" | "ok" | "warn" | "error";

export function useWeightVerification({
  expectedLb,
  tolerancePct = 0.02,
}: {
  expectedLb?: number;
  tolerancePct?: number;
}) {
  const [actual, setActual] = useState<number | "">("");

  const { deltaLb, deltaPct, status } = useMemo(() => {
    const hasExpected = typeof expectedLb === "number" && isFinite(expectedLb) && expectedLb > 0;
    const actualNum = typeof actual === "number" ? actual : NaN;

    if (!hasExpected || !isFinite(actualNum) || actualNum <= 0) {
      return { deltaLb: NaN, deltaPct: NaN, status: "idle" as WeightStatus };
    }

    const dLb = actualNum - (expectedLb as number);
    const dPct = Math.abs(dLb) / (expectedLb as number);

    let s: WeightStatus = "ok";
    if (dPct > tolerancePct) s = dPct <= Math.max(tolerancePct * 2, 0.1) ? "warn" : "error";

    return { deltaLb: dLb, deltaPct: dPct, status: s };
  }, [actual, expectedLb, tolerancePct]);

  const isValid = typeof actual === "number" && isFinite(actual) && actual > 0;

  return { actual, setActual, expectedLb, deltaLb, deltaPct, status, isValid, tolerancePct };
}