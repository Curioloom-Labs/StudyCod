import * as path from "path";
import * as fs from "fs";
import { Runner } from "./engine/runner";
import type { JudgeRequest, JudgeResponse } from "./engine/result";
async function main() {
  const input = await readStdinLimited(2 * 1024 * 1024);
  const req = parseJSON(input) as JudgeRequest;
  const nsjailPath = process.env.NSJAIL_PATH || "/usr/bin/nsjail";
  const nsjailConfigPath = process.env.NSJAIL_CONFIG || path.join(__dirname, "..", "sandbox", "nsjail.cfg");
  const useConfig = String(process.env.NSJAIL_USE_CONFIG ?? "").trim() === "1";
  const ROOTFS = "/sandbox/rootfs";
  const hasRootfs = fs.existsSync(ROOTFS);
  const chrootDefault = ((process.env.NSJAIL_CHROOT || "").trim() || (hasRootfs ? ROOTFS : "")).trim();
  const chrootByLanguage = {
    java: (process.env.NSJAIL_CHROOT_JAVA || chrootDefault || (hasRootfs ? ROOTFS : "/sandbox/java")).trim(),
    cpp: (process.env.NSJAIL_CHROOT_CPP || chrootDefault || (hasRootfs ? ROOTFS : "/sandbox/cpp")).trim(),
    python: (process.env.NSJAIL_CHROOT_PYTHON || chrootDefault || (hasRootfs ? ROOTFS : "/sandbox/python")).trim()
  } as const;
  const cwd = (process.env.NSJAIL_CWD || "/work").trim();
  const runner = new Runner({
    nsjailPath,
    nsjailConfigPath,
    useConfig,
    chrootByLanguage,
    cwd
  });
  const res = await runner.run(req);
  writeJson(res);
}
function writeJson(obj: JudgeResponse | {
  error: string;
}) {
  process.stdout.write(JSON.stringify(obj));
  process.stdout.write("\n");
}
function parseJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e: any) {
    throw new Error(`INVALID_JSON: ${e?.message || "parse error"}`);
  }
}
async function readStdinLimited(maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    process.stdin.on("data", (buf: Buffer) => {
      size += buf.length;
      if (size > maxBytes) {
        reject(new Error("INPUT_TOO_LARGE"));
        process.stdin.destroy();
        return;
      }
      chunks.push(buf);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", err => reject(err));
  });
}
main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  writeJson({
    error: msg
  });
  process.exitCode = 1;
});