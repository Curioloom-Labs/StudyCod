export type JudgeMode = "EXACT" | "NUMERIC" | "REGEX" | "CUSTOM" | "MANUAL";
export interface Task {
  id: string;
  title: string;
  description: string;
  input: string | null;
  judgeMode: JudgeMode;
  expectedOutput?: string;
  regexPattern?: string;
  regexFlags?: string;
  tolerance?: number;
  customValidator?: string;
  createdAt: Date;
}
export interface JudgeResult {
  success: boolean;
  message: string;
  details?: {
    expected?: string;
    received?: string;
    difference?: number;
    matchedPattern?: boolean;
  };
}
export class TaskValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "TaskValidationError";
    Object.setPrototypeOf(this, TaskValidationError.prototype);
  }
}