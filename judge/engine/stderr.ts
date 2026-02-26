export function filterNsJailStderr(stderr: string): string {
  return stripSandboxNoise(stderr);
}

function isImportantSandboxLogLine(line: string): boolean {
  const s = line.toLowerCase();
  // Keep actionable configuration/usage errors. These are often emitted as glog-style
  // lines (e.g. "F0123 ...") or "[F] ..." and are critical for diagnosing sandbox issues.
  if (s.includes("failed to parse") && s.includes("config")) return true;
  if (s.includes("parse") && s.includes("config")) return true;
  if (s.includes("invalid") && s.includes("config")) return true;
  if (s.includes("unknown") && (s.includes("flag") || s.includes("option"))) return true;
  if (s.includes("usage:") && s.includes("nsjail")) return true;
  if (s.includes("permission denied") && s.includes("nsjail")) return true;
  return false;
}

export function stripSandboxNoise(stderr: string): string {
  const s = String(stderr ?? "");
  if (!s.trim()) return "";
  const lines = s.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    const isGlogPrefix = /^[IWEF]\d{4}\s/.test(trimmed);
    const isBracketPrefix = /^\[[IWEF]\]\s*/.test(trimmed);
    if (isGlogPrefix || isBracketPrefix) {
      if (!isImportantSandboxLogLine(trimmed)) continue;
    }
    // NsJail often prefixes useful exec errors (e.g. missing compiler) with "nsjail".
    // Keep lines that look actionable, strip the rest of the nsjail noise.
    if (/\bnsjail\b/i.test(trimmed)) {
      const actionable = /execve|no such file|not found|failed|cannot|can't|permission denied|seccomp|violation|sigsys|killed|denied|forbidden/i.test(trimmed);
      if (!actionable) continue;
    }
    if (/\b(mount|bindmount|uid|gid|chroot|cgroup|rlimit)\b/i.test(trimmed) && /\bnsjail\b/i.test(s)) continue;
    kept.push(trimmed);
  }
  return kept.join("\n").trim();
}
export function cleanPythonRuntimeError(stderr: string): string {
  const s = stripSandboxNoise(stderr);
  if (!s.trim()) return "";
  const lines = s.split(/\r?\n/);
  const kept: string[] = [];
  let inTrace = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    const isTraceHeader = trimmed.includes("Traceback");
    const isFileLine = /^\s*File\s+"/.test(trimmed) || /^\s*File\s+/.test(trimmed);
    const isErrLine = /(\bError\b|\bException\b)/.test(trimmed);
    const isIndentedDetail = inTrace && (/^\s+/.test(line) || /^\^\s*$/.test(trimmed));
    if (isTraceHeader || isFileLine || isErrLine) {
      inTrace = true;
      kept.push(trimmed);
      continue;
    }
    if (isIndentedDetail) {
      kept.push(trimmed);
    }
  }
  return kept.join("\n").trim();
}