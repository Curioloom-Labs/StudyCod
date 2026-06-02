import { useCallback, useEffect, useRef } from "react";
import type { ProctoringSignals } from "../lib/api/tasks";

/**
 * Privacy-respecting proctoring capture for the solve session.
 *
 * Records only aggregate behavioural counts — paste sizes, focus loss, rough
 * typed-chars and elapsed time — never keystroke content or screen. Feed the
 * resulting signals to `scoreProctoring` (or attach to a submission) to compute
 * an integrity score for teacher review.
 *
 * Usage:
 *   const { getSignals, reset } = useProctoring(active);
 *   // on submit: const signals = getSignals(code.length);
 */
export function useProctoring(active: boolean) {
  const startRef = useRef<number>(Date.now());
  const pastedRef = useRef(0);
  const largestPasteRef = useRef(0);
  const pasteCountRef = useRef(0);
  const blurRef = useRef(0);
  const typedRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    startRef.current = Date.now();

    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      const len = text.length;
      if (len > 0) {
        pasteCountRef.current += 1;
        pastedRef.current += len;
        if (len > largestPasteRef.current) largestPasteRef.current = len;
      }
    };
    const onBlur = () => {
      blurRef.current += 1;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Rough proxy for "typed" content: single printable characters only.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        typedRef.current += 1;
      }
    };

    document.addEventListener("paste", onPaste, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("paste", onPaste, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [active]);

  const getSignals = useCallback(
    (finalCodeLength: number): ProctoringSignals => ({
      finalCodeLength: Math.max(0, Math.floor(finalCodeLength)),
      totalPastedChars: pastedRef.current,
      largestPasteChars: largestPasteRef.current,
      pasteCount: pasteCountRef.current,
      blurCount: blurRef.current,
      typedChars: typedRef.current,
      solveDurationMs: Date.now() - startRef.current,
    }),
    []
  );

  const reset = useCallback(() => {
    startRef.current = Date.now();
    pastedRef.current = 0;
    largestPasteRef.current = 0;
    pasteCountRef.current = 0;
    blurRef.current = 0;
    typedRef.current = 0;
  }, []);

  return { getSignals, reset };
}
