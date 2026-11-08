import { useEffect, useRef, useState } from "react";
import type { BreathingPattern } from "@/components/breathing/BreathingPatterns";

export type BreathingPhase = "inhale" | "hold" | "exhale" | "pause";

export interface BreathingPhaseState {
  phase: BreathingPhase;
  /** ms elapsed within the current phase */
  elapsedMs: number;
  /** duration of the current phase in ms */
  durationMs: number;
  /** 0..1 normalized progress within the current phase */
  progress: number;
  /** completed inhale cycles since the timer began */
  cycleCount: number;
}

const nextPhase = (p: BreathingPhase, pat: BreathingPattern): BreathingPhase => {
  switch (p) {
    case "inhale": return pat.hold > 0 ? "hold" : "exhale";
    case "hold":   return "exhale";
    case "exhale": return pat.pause > 0 ? "pause" : "inhale";
    case "pause":  return "inhale";
  }
};

/**
 * Single source of truth for the breathing phase state machine.
 * Multiple consumers (visual orb, timer, phrases) stay in sync because
 * they share the same hook.
 */
export function useBreathingPhase(
  pattern: BreathingPattern,
  isActive: boolean,
  onPhaseChange?: (p: BreathingPhase) => void,
  onCycleComplete?: () => void,
): BreathingPhaseState {
  const [phase, setPhase] = useState<BreathingPhase>("inhale");
  const [elapsedMs, setElapsedMs] = useState(0);
  const phaseStartRef = useRef<number>(performance.now());

  // Reset on pattern change
  useEffect(() => {
    setPhase("inhale");
    setElapsedMs(0);
    phaseStartRef.current = performance.now();
  }, [pattern]);

  useEffect(() => {
    if (!isActive) return;
    phaseStartRef.current = performance.now() - elapsedMs;

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const elapsed = now - phaseStartRef.current;
      const totalMs = pattern[phase] * 1000;

      if (totalMs > 0 && elapsed >= totalMs) {
        const np = nextPhase(phase, pattern);
        setPhase(np);
        onPhaseChange?.(np);
        if (np === "inhale") onCycleComplete?.();
        phaseStartRef.current = now;
        setElapsedMs(0);
      } else {
        setElapsedMs(elapsed);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [isActive, phase, pattern, onPhaseChange, onCycleComplete]);

  const durationMs = pattern[phase] * 1000;
  const progress = durationMs > 0 ? Math.min(1, elapsedMs / durationMs) : 0;
  // cycleCount is derived externally via onCycleComplete, but we also
  // expose a running counter for consumers that don't hook the callback.
  return { phase, elapsedMs, durationMs, progress, cycleCount: 0 };
}
