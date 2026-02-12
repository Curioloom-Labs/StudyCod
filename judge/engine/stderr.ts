export function filterNsJailStderr(stderr: string): string {
  return stripSandboxNoise(stderr);
}
export function stripSandboxNoise(stderr: string): string {
  const s = String(stderr ?? "");
  if (!s.trim()) return "";
  const lines = s.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    if (/^[IWEF]\d{4}\s/.test(trimmed)) continue;
    if (/^\[[IWEF]\]\s*/.test(trimmed)) continue;
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