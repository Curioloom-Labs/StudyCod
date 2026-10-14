import { z } from "zod";

export const createLessonBodySchema = z.object({
  type: z.string().transform(value => value.trim().toUpperCase()).pipe(z.enum(["LESSON", "CONTROL"])),
  title: z.string().trim().min(1).max(255),
  theory: z.string().max(100_000).nullable().optional(),
  hasTheory: z.boolean().optional(),
  timeLimitMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  controlHasTheory: z.boolean().optional(),
  controlHasPractice: z.boolean().optional(),
});

export const quizAnswersBodySchema = z.object({
  answers: z.record(z.string().max(100), z.unknown()).refine(value => Object.keys(value).length <= 500),
});

export const manualQuizGradeBodySchema = z.object({
  manualScores: z.record(z.string().max(100), z.number().finite().nonnegative())
    .refine(value => Object.keys(value).length <= 500),
});
