export type OlympiadPracticeRuntime = "PYTHON" | "JAVA" | "CPP";
export type OlympiadPracticeStage = "FOUNDATION" | "EDGE_CASES" | "TRANSFER";

export type OlympiadPracticeContractDraft = {
  version: 3;
  kind: "OLYMPIAD_ALGORITHMIC_PRACTICE";
  courseKey: string;
  topicKey: string;
  runtime: OlympiadPracticeRuntime;
  stage: OlympiadPracticeStage;
  sequence: number;
  total: number;
  algorithm: string;
  objective: string;
  coreOperation: string;
  requiredInput: string;
  requiredOutput: string;
  constraints: string;
  requiredCases: string[];
  variation: string;
  allowedScope: string[];
  forbiddenScope: string[];
  ioType: "STDIN_STDOUT";
};

export function olympiadPracticeStage(sequence: number, total: number): OlympiadPracticeStage {
  if (total <= 1 || sequence <= 1) return "FOUNDATION";
  if (sequence >= total) return "TRANSFER";
  return "EDGE_CASES";
}

export function createOlympiadPracticeContractDraft(input: {
  courseKey: string;
  topicKey: string;
  runtime: string;
  objective?: string;
}): OlympiadPracticeContractDraft {
  const runtime = input.runtime.toUpperCase();
  if (runtime !== "PYTHON" && runtime !== "JAVA" && runtime !== "CPP") {
    throw new Error("OLYMPIAD_RUNTIME_UNSUPPORTED");
  }
  return {
    version: 3,
    kind: "OLYMPIAD_ALGORITHMIC_PRACTICE",
    courseKey: input.courseKey.trim(),
    topicKey: input.topicKey.trim(),
    runtime,
    stage: "FOUNDATION",
    sequence: 1,
    total: 3,
    algorithm: "",
    objective: input.objective?.trim() ?? "",
    coreOperation: "",
    requiredInput: "",
    requiredOutput: "",
    constraints: "",
    requiredCases: [],
    variation: "Change the story and input values while preserving the algorithmic contract.",
    allowedScope: [],
    forbiddenScope: [],
    ioType: "STDIN_STDOUT",
  };
}

export function validateOlympiadPracticeContractDraft(
  value: unknown,
  expectedRuntime?: string,
): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["CONTRACT_OBJECT_REQUIRED"];
  const contract = value as Record<string, unknown>;
  const issues: string[] = [];
  if (contract.kind !== "OLYMPIAD_ALGORITHMIC_PRACTICE" || contract.version !== 3) issues.push("CONTRACT_KIND_OR_VERSION_INVALID");
  if (typeof contract.courseKey !== "string" || !contract.courseKey.startsWith("olympiad-")) issues.push("COURSE_KEY_REQUIRED");
  if (typeof contract.topicKey !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(contract.topicKey)) issues.push("TOPIC_KEY_INVALID");
  if (contract.runtime !== "PYTHON" && contract.runtime !== "JAVA" && contract.runtime !== "CPP") issues.push("RUNTIME_INVALID");
  if (expectedRuntime && contract.runtime !== expectedRuntime.toUpperCase()) issues.push("RUNTIME_MISMATCH");

  const sequence = Number(contract.sequence);
  const total = Number(contract.total);
  if (!Number.isInteger(sequence) || !Number.isInteger(total) || sequence < 1 || total < 1 || sequence > total) {
    issues.push("PRACTICE_SEQUENCE_INVALID");
  } else if (contract.stage !== olympiadPracticeStage(sequence, total)) {
    issues.push("PRACTICE_STAGE_MISMATCH");
  }

  for (const field of ["algorithm", "objective", "coreOperation", "requiredInput", "requiredOutput", "constraints", "variation"]) {
    if (typeof contract[field] !== "string" || !contract[field].trim()) issues.push(`${field.toUpperCase()}_REQUIRED`);
  }
  if (!Array.isArray(contract.requiredCases) || contract.requiredCases.filter((item) => typeof item === "string" && item.trim()).length < 3) {
    issues.push("AT_LEAST_THREE_REQUIRED_CASES");
  }
  if (!Array.isArray(contract.allowedScope) || contract.allowedScope.filter((item) => typeof item === "string" && item.trim()).length === 0) {
    issues.push("ALLOWED_SCOPE_REQUIRED");
  }
  if (!Array.isArray(contract.forbiddenScope) || contract.forbiddenScope.some((item) => typeof item !== "string" || !item.trim())) {
    issues.push("FORBIDDEN_SCOPE_INVALID");
  }
  if (contract.ioType !== "STDIN_STDOUT") issues.push("STDIN_STDOUT_REQUIRED");
  return issues;
}
