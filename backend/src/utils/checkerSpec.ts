import type { CheckerSpec } from "../services/judgeWorker/types";

export function chooseDefaultCheckerFromExpectedOutputs(outputs: string[]): CheckerSpec {
  const hasFloatLike = outputs.some((s) => {
    const value = String(s ?? "");
    return /(^|\s)[-+]?(?:\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?(\s|$)/.test(value)
      || /(^|\s)[-+]?\d+(?:[eE][-+]?\d+)(\s|$)/.test(value);
  });

  return hasFloatLike
    ? {
        type: "float",
        epsilon: 1e-6,
      }
    : {
        type: "whitespace",
      };
}
