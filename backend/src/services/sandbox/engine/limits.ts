export interface ResourceLimits {
  memoryMB: number;
  cpuTimeSeconds: number;
  wallTimeSeconds: number;
  maxOutputBytes: number;
  maxProcesses: number;
  maxFiles: number;
}
export const DEFAULT_LIMITS: ResourceLimits = {
  memoryMB: 256,
  cpuTimeSeconds: 2,
  wallTimeSeconds: 3,
  maxOutputBytes: 64 * 1024,
  maxProcesses: 1,
  maxFiles: 32
};
export const LANGUAGE_LIMITS: Record<string, ResourceLimits> = {
  python: {
    ...DEFAULT_LIMITS,
    memoryMB: 256,
    cpuTimeSeconds: 2,
    wallTimeSeconds: 3
  },
  cpp: {
    ...DEFAULT_LIMITS,
    memoryMB: 256,
    cpuTimeSeconds: 2,
    wallTimeSeconds: 3
  },
  java: {
    ...DEFAULT_LIMITS,
    memoryMB: 256,
    cpuTimeSeconds: 2,
    wallTimeSeconds: 4
  }
};
export enum ExecutionStatus {
  OK = "OK",
  TIME_LIMIT = "TIME_LIMIT",
  MEMORY_LIMIT = "MEMORY_LIMIT",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  OUTPUT_LIMIT = "OUTPUT_LIMIT",
  SECURITY_VIOLATION = "SECURITY_VIOLATION",
  SYSTEM_ERROR = "SYSTEM_ERROR",
}
export interface ExecutionResult {
  status: ExecutionStatus;
  stdout: string;
  stderr: string;
  exitCode: number;
  cpuTimeMs: number;
  wallTimeMs: number;
  memoryKB: number;
}