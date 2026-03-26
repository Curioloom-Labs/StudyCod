export interface ParsedGradeComparisonFeedback {
  comparisonFeedback: string | null;
  aiUnavailableFallback: boolean;
}

const AI_COMPARISON_FEEDBACK_TYPE = "AI_COMPARISON_FEEDBACK_V1";

export function encodeAiComparisonFeedback(params: {
  comparisonFeedback?: string | null;
  aiUnavailableFallback?: boolean;
}): string | null {
  const normalizedFeedback = typeof params.comparisonFeedback === "string" && params.comparisonFeedback.trim().length > 0 ? params.comparisonFeedback : null;
  const fallbackFlag = Boolean(params.aiUnavailableFallback);
  if (!normalizedFeedback && !fallbackFlag) {
    return null;
  }
  return JSON.stringify({
    type: AI_COMPARISON_FEEDBACK_TYPE,
    comparisonFeedback: normalizedFeedback,
    meta: {
      aiUnavailableFallback: fallbackFlag
    }
  });
}

export function parseGradeComparisonFeedback(raw: string | null | undefined): ParsedGradeComparisonFeedback {
  if (typeof raw !== "string") {
    return {
      comparisonFeedback: null,
      aiUnavailableFallback: false
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      comparisonFeedback: null,
      aiUnavailableFallback: false
    };
  }

  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return {
      comparisonFeedback: raw,
      aiUnavailableFallback: false
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as any;
    if (parsed && typeof parsed === "object" && parsed.type === AI_COMPARISON_FEEDBACK_TYPE) {
      const comparisonFeedback = typeof parsed.comparisonFeedback === "string" && parsed.comparisonFeedback.trim().length > 0 ? parsed.comparisonFeedback : null;
      const aiUnavailableFallback = Boolean(parsed.meta?.aiUnavailableFallback ?? parsed.aiUnavailableFallback);
      return {
        comparisonFeedback,
        aiUnavailableFallback
      };
    }
  } catch {
    // Ignore parsing errors and keep backward-compatible raw text behavior.
  }

  return {
    comparisonFeedback: raw,
    aiUnavailableFallback: false
  };
}
