import { spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { ExecutionResult, ExecutionStatus, ResourceLimits, DEFAULT_LIMITS, LANGUAGE_LIMITS } from "./limits";
export class CodeExecutor {
  private nsjailPath: string;
  private profilesPath: string;
  private scriptsPath: string;
  private tempDir: string;
  constructor(nsjailPath: string = "/usr/bin/nsjail", profilesPath: string = "/sandbox/profiles", scriptsPath: string = "/sandbox/scripts", tempDir: string = "/tmp/sandbox") {
    this.nsjailPath = nsjailPath;
    this.profilesPath = profilesPath;
    this.scriptsPath = scriptsPath;
    this.tempDir = tempDir;
  }
  async executePython(code: string, input: string = "", limits: ResourceLimits = LANGUAGE_LIMITS.python): Promise<ExecutionResult> {
    const codeFile = path.join(this.tempDir, `python_${Date.now()}.py`);
    const inputFile = path.join(this.tempDir, `input_${Date.now()}.txt`);
    try {
      await fs.mkdir(this.tempDir, {
        recursive: true
      });
      await fs.writeFile(codeFile, code, "utf-8");
      await fs.writeFile(inputFile, input, "utf-8");
      const configFile = path.join(this.profilesPath, "nsjail_python.cfg");
      const result = await this.runNsjail(configFile, ["/usr/bin/python3", "-u", codeFile], input, limits);
      return result;
    } finally {
      try {
        await fs.unlink(codeFile).catch(() => {});
        await fs.unlink(inputFile).catch(() => {});
      } catch {}
    }
  }
  async executeJava(code: string, input: string = "", limits: ResourceLimits = LANGUAGE_LIMITS.java): Promise<ExecutionResult> {
    const codeFile = path.join(this.tempDir, `java_${Date.now()}.java`);
    const classDir = path.join(this.tempDir, `classes_${Date.now()}`);
    const inputFile = path.join(this.tempDir, `input_${Date.now()}.txt`);
    try {
      await fs.mkdir(this.tempDir, {
        recursive: true
      });
      await fs.mkdir(classDir, {
        recursive: true
      });
      await fs.writeFile(codeFile, code, "utf-8");
      await fs.writeFile(inputFile, input, "utf-8");
      await this.compileJava(codeFile, classDir);
      const configFile = path.join(this.profilesPath, "nsjail_java.cfg");
      const result = await this.runNsjail(configFile, ["/usr/bin/java", "-Xmx200m", "-Xss1m", "-XX:+UseSerialGC", "-Djava.security.manager", "-Djava.security.policy=/dev/null", "-cp", "/app", "Main"], input, limits, {
        bindMounts: [{
          src: classDir,
          dst: "/app",
          rw: false
        }]
      });
      return result;
    } finally {
      try {
        await fs.unlink(codeFile).catch(() => {});
        await fs.rmdir(classDir).catch(() => {});
        await fs.unlink(inputFile).catch(() => {});
      } catch {}
    }
  }
  async executeCpp(code: string, input: string = "", limits: ResourceLimits = LANGUAGE_LIMITS.cpp): Promise<ExecutionResult> {
    const codeFile = path.join(this.tempDir, `cpp_${Date.now()}.cpp`);
    const binaryFile = path.join(this.tempDir, `app_${Date.now()}`);
    const inputFile = path.join(this.tempDir, `input_${Date.now()}.txt`);
    try {
      await fs.mkdir(this.tempDir, {
        recursive: true
      });
      await fs.writeFile(codeFile, code, "utf-8");
      await fs.writeFile(inputFile, input, "utf-8");
      await this.compileCpp(codeFile, binaryFile);
      const configFile = path.join(this.profilesPath, "nsjail_cpp.cfg");
      const result = await this.runNsjail(configFile, [binaryFile], input, limits);
      return result;
    } finally {
      try {
        await fs.unlink(codeFile).catch(() => {});
        await fs.unlink(binaryFile).catch(() => {});
        await fs.unlink(inputFile).catch(() => {});
      } catch {}
    }
  }
  private async compileJava(sourceFile: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const compiler = spawn("javac", ["-d", outputDir, "-encoding", "UTF-8", sourceFile]);
      let stderr = "";
      compiler.stderr.on("data", data => {
        stderr += data.toString();
      });
      compiler.on("close", code => {
        if (code !== 0) {
          reject(new Error(`Java compilation failed: ${stderr}`));
        } else {
          const mainClass = path.join(outputDir, "Main.class");
          fs.access(mainClass).then(() => resolve()).catch(() => reject(new Error("Main.class not found after compilation")));
        }
      });
      compiler.on("error", error => {
        reject(new Error(`Java compiler error: ${error.message}`));
      });
    });
  }
  private async compileCpp(sourceFile: string, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const compiler = spawn("g++", ["-std=c++17", "-O2", "-static", "-o", outputFile, sourceFile]);
      let stderr = "";
      compiler.stderr.on("data", data => {
        stderr += data.toString();
      });
      compiler.on("close", code => {
        if (code !== 0) {
          reject(new Error(`Compilation failed: ${stderr}`));
        } else {
          resolve();
        }
      });
      compiler.on("error", error => {
        reject(new Error(`Compiler error: ${error.message}`));
      });
    });
  }
  private async runNsjail(configFile: string, command: string[], input: string, limits: ResourceLimits, options?: {
    bindMounts?: Array<{
      src: string;
      dst: string;
      rw: boolean;
    }>;
  }): Promise<ExecutionResult> {
    return new Promise(resolve => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let stdoutSize = 0;
      let stderrSize = 0;
      const nsjailArgs = ["--config", configFile];
      if (options?.bindMounts) {
        for (const mount of options.bindMounts) {
          nsjailArgs.push("--bindmount", `${mount.src}:${mount.dst}${mount.rw ? ":rw" : ":ro"}`);
        }
      }
      nsjailArgs.push("--", ...command);
      const nsjail = spawn(this.nsjailPath, nsjailArgs, {
        stdio: ["pipe", "pipe", "pipe"]
      });
      if (input) {
        nsjail.stdin.write(input, "utf-8");
      }
      nsjail.stdin.end();
      nsjail.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString("utf-8");
        stdoutSize += chunk.length;
        if (stdoutSize <= limits.maxOutputBytes) {
          stdout += chunk;
        } else if (stdoutSize === chunk.length) {
          stdout = chunk.substring(0, limits.maxOutputBytes);
        }
      });
      nsjail.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString("utf-8");
        stderrSize += chunk.length;
        if (stderrSize <= limits.maxOutputBytes) {
          stderr += chunk;
        } else if (stderrSize === chunk.length) {
          stderr = chunk.substring(0, limits.maxOutputBytes);
        }
      });
      const timeout = setTimeout(() => {
        nsjail.kill("SIGKILL");
        resolve({
          status: ExecutionStatus.TIME_LIMIT,
          stdout: stdout.substring(0, limits.maxOutputBytes),
          stderr: stderr.substring(0, limits.maxOutputBytes),
          exitCode: 124,
          cpuTimeMs: limits.cpuTimeSeconds * 1000,
          wallTimeMs: limits.wallTimeSeconds * 1000,
          memoryKB: 0
        });
      }, limits.wallTimeSeconds * 1000);
      nsjail.on("close", async (code, signal) => {
        clearTimeout(timeout);
        const wallTimeMs = Date.now() - startTime;
        let status: ExecutionStatus;
        if (signal === "SIGKILL" && wallTimeMs >= limits.wallTimeSeconds * 1000) {
          status = ExecutionStatus.TIME_LIMIT;
        } else if (code === 124) {
          status = ExecutionStatus.TIME_LIMIT;
        } else if (code === 137) {
          status = ExecutionStatus.MEMORY_LIMIT;
        } else if (code !== 0) {
          status = ExecutionStatus.RUNTIME_ERROR;
        } else {
          status = ExecutionStatus.OK;
        }
        if (stdoutSize > limits.maxOutputBytes || stderrSize > limits.maxOutputBytes) {
          status = ExecutionStatus.OUTPUT_LIMIT;
        }
        const cpuTimeMs = await this.getCpuTime(limits.cpuTimeSeconds * 1000);
        const memoryKB = await this.getMemoryUsage(limits.memoryMB * 1024);
        resolve({
          status,
          stdout: stdout.substring(0, limits.maxOutputBytes),
          stderr: stderr.substring(0, limits.maxOutputBytes),
          exitCode: code || 0,
          cpuTimeMs,
          wallTimeMs,
          memoryKB
        });
      });
      nsjail.on("error", error => {
        clearTimeout(timeout);
        resolve({
          status: ExecutionStatus.SYSTEM_ERROR,
          stdout: "",
          stderr: `System error: ${error.message}`,
          exitCode: 1,
          cpuTimeMs: 0,
          wallTimeMs: Date.now() - startTime,
          memoryKB: 0
        });
      });
    });
  }
  private async getCpuTime(defaultValue: number): Promise<number> {
    try {
      const cpuUsage = await fs.readFile("/sys/fs/cgroup/cpu/sandbox/cpuacct.usage", "utf-8");
      return Math.floor(parseInt(cpuUsage.trim(), 10) / 1_000_000);
    } catch {
      return defaultValue;
    }
  }
  private async getMemoryUsage(defaultValue: number): Promise<number> {
    try {
      const memoryUsage = await fs.readFile("/sys/fs/cgroup/memory/sandbox/memory.usage_in_bytes", "utf-8");
      return Math.floor(parseInt(memoryUsage.trim(), 10) / 1024);
    } catch {
      return defaultValue;
    }
  }
}