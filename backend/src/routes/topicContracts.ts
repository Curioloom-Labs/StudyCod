import { z } from "zod";
import { TOPIC_LANGUAGES } from "../utils/topicLanguage";

const optionalNonNegativeInt = z.preprocess(
  value => value === "" || value === null || value === undefined ? undefined : value,
  z.coerce.number().int().nonnegative().optional(),
);
const optionalPositiveInt = z.preprocess(
  value => value === "" || value === null || value === undefined ? undefined : value,
  z.coerce.number().int().positive().optional(),
);
const dateInput = z.union([z.string(), z.number(), z.date()]);
const topicLanguage = z.enum(TOPIC_LANGUAGES);

export const createTopicSchema = z.object({
  title: z.string().trim().min(1).max(512),
  description: z.string().nullable().optional(),
  order: optionalNonNegativeInt,
  language: topicLanguage,
  classId: optionalPositiveInt,
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(512),
  description: z.string().min(1),
  template: z.unknown().optional(),
  taskMode: z.unknown().optional(),
  webTemplateFiles: z.unknown().optional(),
  webValidationRules: z.unknown().optional(),
  webValidationProfile: z.unknown().optional(),
  projectSpec: z.unknown().optional(),
  type: z.enum(["PRACTICE", "CONTROL"]),
  order: optionalNonNegativeInt,
  maxAttempts: z.union([z.string(), z.number()]).optional(),
  deadline: dateInput.nullable().optional(),
  controlWorkId: optionalPositiveInt,
});

export const updateTaskSchema = createTaskSchema
  .omit({ controlWorkId: true, type: true })
  .extend({ type: z.enum(["PRACTICE", "CONTROL"]).optional() });

export const updateControlWorkSchema = z.object({
  title: z.string().nullable().optional(),
  timeLimitMinutes: optionalNonNegativeInt.nullable().optional(),
  hasTheory: z.boolean().optional(),
  hasPractice: z.boolean().optional(),
  quizJson: z.string().nullable().optional(),
});

export const generateQuizSchema = z.object({
  topicTitle: z.string().optional(),
  count: optionalPositiveInt,
  responseLanguage: z.string().optional(),
  language: z.enum(["uk", "en"]).optional(),
});

export const createControlWorkSchema = z.object({
  title: z.string().nullable().optional(),
  timeLimitMinutes: optionalNonNegativeInt.nullable().optional(),
  hasTheory: z.boolean().optional(),
  hasPractice: z.boolean().optional(),
});

export const theoryBlockSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1),
  level: optionalNonNegativeInt.nullable().optional(),
  tags: z.unknown().nullable().optional(),
});

export const generateTheorySchema = z.object({
  taskDescription: z.string().min(1),
  taskType: z.enum(["PRACTICE", "CONTROL"]),
  difficulty: optionalPositiveInt,
  taskTitle: z.string().optional(),
  responseLanguage: z.string().optional(),
  language: z.enum(["uk", "en"]).optional(),
});

export const theoryContentSchema = z.object({
  content: z.string().min(1),
});

export const assignmentSchema = z.object({
  deadline: dateInput,
  studentIds: z.unknown().optional(),
});
