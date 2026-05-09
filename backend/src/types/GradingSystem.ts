export const GRADING_SYSTEMS = ["PERCENT_100", "POINTS_12", "POINTS_10", "LETTER_AF", "ECTS_AF", "GPA_4"] as const;

export type GradingSystem = (typeof GRADING_SYSTEMS)[number];

export const DEFAULT_GRADING_SYSTEM: GradingSystem = "PERCENT_100";
