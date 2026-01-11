import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import iconv from "iconv-lite";
function getPythonExecutable(): string {
  const fromEnv = (process.env.PYTHON_PATH ?? "").trim();
  if (fromEnv) return fromEnv;
  return process.platform === "win32" ? "python" : "python3";
}
const PYTHON = getPythonExecutable();
export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}
async function runProcess(command: string, args: string[], options: {
  timeout: number;
  input?: string;
  cwd: string;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise(resolve => {
    const env = {
      ...process.env,
      NODE_ENV: "production",
      PYTHONIOENCODING: "utf-8",
      JAVA_TOOL_OPTIONS: "-Dfile.encoding=UTF-8 -Duser.language=en -Duser.country=US"
    };
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let killedByTimeout = false;
    let inputWritten = false;
    const timeoutTrigger = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGKILL");
    }, options.timeout);
    if (options.input && child.stdin) {
      const inputData = options.input.endsWith('\n') ? options.input : options.input + '\n';
      const writeInput = () => {
        if (child.stdin && !child.killed && !inputWritten) {
          try {
            if (!child.stdin.destroyed && child.stdin.writable) {
              child.stdin.write(inputData, 'utf8', err => {
                if (!err) {
                  inputWritten = true;
                  if (child.stdin && !child.stdin.destroyed) {
                    child.stdin.end();
                  }
                }
              });
            }
          } catch (err) {}
        }
      };
      if (command === 'java' || command === 'cmd') {
        setTimeout(writeInput, 100);
      } else {
        process.nextTick(writeInput);
      }
    }
    child.stdout?.on("data", (data: Buffer) => {
      if (stdoutChunks.reduce((sum, chunk) => sum + chunk.length, 0) < 5 * 1024 * 1024) {
        stdoutChunks.push(data);
      }
    });
    child.stderr?.on("data", (data: Buffer) => {
      if (stderrChunks.reduce((sum, chunk) => sum + chunk.length, 0) < 5 * 1024 * 1024) {
        stderrChunks.push(data);
      }
    });
    child.on("close", code => {
      clearTimeout(timeoutTrigger);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const stdout = stdoutBuffer.toString('utf8').trim();
      const stderr = stderrBuffer.toString('utf8').trim();
      resolve({
        stdout,
        stderr: killedByTimeout ? "Execution timed out" : stderr,
        exitCode: killedByTimeout ? 124 : code ?? 1
      });
    });
    child.on("error", err => {
      clearTimeout(timeoutTrigger);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const stdout = stdoutBuffer.toString('utf8').trim();
      const stderr = stderrBuffer.toString('utf8').trim();
      const isEnoent = (err as any)?.code === "ENOENT";
      const enoentMessage = isEnoent ? `Executable not found: ${command}. ` + (command === PYTHON ? `Install Python (python3) or set PYTHON_PATH to a valid interpreter path.` : `Make sure it is installed and available in PATH.`) : null;
      const errMessage = enoentMessage ?? err.message ?? "Unknown error";
      resolve({
        stdout,
        stderr: (stderr ? `${stderr}\n` : "") + errMessage,
        exitCode: 1
      });
    });
  });
}
async function runProcessWithShell(command: string, args: string[], options: {
  timeout: number;
  input?: string;
  cwd: string;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise(resolve => {
    const env = {
      ...process.env,
      NODE_ENV: "production",
      PYTHONIOENCODING: "utf-8",
      JAVA_TOOL_OPTIONS: "-Dfile.encoding=UTF-8 -Duser.language=en -Duser.country=US"
    };
    const child = spawn(command, [], {
      cwd: options.cwd,
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let killedByTimeout = false;
    let inputWritten = false;
    const timeoutTrigger = setTimeout(() => {
      killedByTimeout = true;
      child.kill("SIGKILL");
    }, options.timeout);
    if (options.input && child.stdin) {
      const inputData = options.input.endsWith('\n') ? options.input : options.input + '\n';
      const writeInput = () => {
        if (child.stdin && !child.killed && !inputWritten) {
          try {
            if (!child.stdin.destroyed && child.stdin.writable) {
              child.stdin.write(inputData, 'utf8', err => {
                if (!err) {
                  inputWritten = true;
                  if (child.stdin && !child.stdin.destroyed) {
                    child.stdin.end();
                  }
                }
              });
            }
          } catch (err) {}
        }
      };
      setTimeout(writeInput, 100);
    }
    child.stdout?.on("data", (data: Buffer) => {
      if (stdoutChunks.reduce((sum, chunk) => sum + chunk.length, 0) < 5 * 1024 * 1024) {
        stdoutChunks.push(data);
      }
    });
    child.stderr?.on("data", (data: Buffer) => {
      if (stderrChunks.reduce((sum, chunk) => sum + chunk.length, 0) < 5 * 1024 * 1024) {
        stderrChunks.push(data);
      }
    });
    child.on("close", code => {
      clearTimeout(timeoutTrigger);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const stdout = iconv.decode(stdoutBuffer, 'win1251').trim();
      const stderr = iconv.decode(stderrBuffer, 'win1251').trim();
      resolve({
        stdout,
        stderr: killedByTimeout ? "Execution timed out" : stderr,
        exitCode: killedByTimeout ? 124 : code ?? 1
      });
    });
    child.on("error", err => {
      clearTimeout(timeoutTrigger);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const stdout = iconv.decode(stdoutBuffer, 'win1251').trim();
      const stderr = iconv.decode(stderrBuffer, 'win1251').trim();
      resolve({
        stdout,
        stderr: stderr + (err.message || "Unknown error"),
        exitCode: 1
      });
    });
  });
}
export async function executeCodeWithInput(code: string, language: "JAVA" | "PYTHON", input: string, timeout: number = 10000): Promise<CodeExecutionResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-exec-"));
  try {
    if (language === "PYTHON") {
      const filePath = path.join(tmpDir, "main.py");
      await fs.writeFile(filePath, code, "utf-8");
      const {
        stdout,
        stderr,
        exitCode
      } = await runProcess(PYTHON, [filePath], {
        timeout,
        input,
        cwd: tmpDir
      });
      return {
        stdout,
        stderr,
        exitCode,
        success: exitCode === 0
      };
    } else {
      const filePath = path.join(tmpDir, "Main.java");
      await fs.writeFile(filePath, code, "utf-8");
      const compileRes = await runProcess("javac", ["-encoding", "UTF-8", "Main.java"], {
        timeout: 5000,
        cwd: tmpDir
      });
      if (compileRes.exitCode !== 0) {
        return {
          stdout: "",
          stderr: compileRes.stderr || "Compilation failed",
          exitCode: compileRes.exitCode,
          success: false
        };
      }
      const hasInput = input && input.trim().length > 0;
      const runTimeout = hasInput ? Math.max(30000, timeout - 5000) : Math.max(5000, timeout - 5000);
      let runRes;
      if (process.platform === 'win32') {
        const cmd = `chcp 65001 >nul && java -Dfile.encoding=UTF-8 -cp . Main`;
        runRes = await runProcessWithShell(`cmd /c "${cmd}"`, [], {
          timeout: runTimeout,
          input: input || "",
          cwd: tmpDir
        });
      } else {
        runRes = await runProcess("java", ["-Dfile.encoding=UTF-8", "-cp", ".", "Main"], {
          timeout: runTimeout,
          input: input || "",
          cwd: tmpDir
        });
      }
      return {
        stdout: runRes.stdout,
        stderr: runRes.stderr,
        exitCode: runRes.exitCode,
        success: runRes.exitCode === 0
      };
    }
  } catch (error: any) {
    return {
      stdout: "",
      stderr: error.message || "Execution error",
      exitCode: 1,
      success: false
    };
  } finally {
    try {
      await fs.rm(tmpDir, {
        recursive: true,
        force: true
      });
    } catch {}
  }
}
export function filterStderr(stderr: string, language?: "JAVA" | "PYTHON"): string {
  return filterStderrWithLanguage(stderr, language);
}

function filterStderrWithLanguage(stderr: string, language?: "JAVA" | "PYTHON"): string {
  if (!stderr) return "";
  const raw = String(stderr);

  const cleaned = raw
    .split("\n")
    .map(l => l.replace(/\r$/, ""))
    .filter(line => !line.includes("Picked up JAVA_TOOL_OPTIONS"))
    .filter(line => !line.includes("Picked up _JAVA_OPTIONS"))
    .filter(line => !line.includes("WARNING: An illegal reflective access operation has occurred"))
    .join("\n")
    .trim();

  if (!language) return cleaned;

  const explanation = explainFallbackError(language, cleaned);
  if (!explanation) return cleaned;

  const merged = cleaned.startsWith(explanation) ? cleaned : `${explanation}\n\n---\n${cleaned}`;
  return merged.trim();
}

function explainFallbackError(language: "JAVA" | "PYTHON", stderr: string): string | null {
  const s = String(stderr ?? "").trim();
  if (!s) return null;
  const lines = s.split(/\r?\n/);
  const last = [...lines].reverse().find(l => l.trim())?.trim() ?? "";

  if (language === "PYTHON") {
    const fileLine = lines.find(l => /File\s+".*"\s*,\s*line\s+\d+/.test(l));
    const mLine = fileLine?.match(/line\s+(\d+)/);
    const lineNo = mLine ? parseInt(mLine[1], 10) : NaN;
    const loc = Number.isFinite(lineNo) ? ` (рядок ${lineNo})` : "";

    if (/\bIndentationError\b/.test(last) || /\bTabError\b/.test(last)) {
      return `Помилка відступів (IndentationError)${loc}\nПоради:\n- Перевірте пробіли/таби на початку рядків\n- Використовуйте один стиль (краще 4 пробіли)`;
    }
    if (/\bSyntaxError\b/.test(last)) {
      return `Синтаксична помилка (SyntaxError)${loc}\nПоради:\n- Перевірте дужки і двокрапки після if/for/while/def\n- Переконайтеся, що лапки закриті`;
    }
    if (/^NameError\b/.test(last)) {
      return `Невідома змінна/ім'я (NameError)${loc}\nПоради:\n- Перевірте, чи змінна оголошена до використання\n- Перевірте опечатки у назві`;
    }
    if (/^IndexError\b/.test(last)) {
      return `Вихід за межі індексу (IndexError)${loc}\nПоради:\n- Перевірте межі циклів і len(...)\n- Пам'ятайте: останній індекс = len(x)-1`;
    }
    if (/^KeyError\b/.test(last)) {
      return `Немає ключа в словнику (KeyError)${loc}\nПоради:\n- Перевірте, чи ключ існує\n- Використовуйте d.get(key, default) або if key in d`;
    }
    if (/^ZeroDivisionError\b/.test(last)) {
      return `Ділення на нуль (ZeroDivisionError)${loc}\nПоради:\n- Перевіряйте знаменник перед діленням`;
    }
    return null;
  }

  // JAVA
  const joined = lines.join("\n");
  const m = joined.match(/Exception in thread "main" ([a-zA-Z0-9_$.]+)(?::\s*(.*))?/);
  const exc = m?.[1] ?? "";
  const msg = (m?.[2] ?? "").trim();
  const locM = joined.match(/\((?:Main|Solution)\.java:(\d+)\)/);
  const lineNo = locM ? parseInt(locM[1], 10) : NaN;
  const loc = Number.isFinite(lineNo) ? ` (рядок ${lineNo})` : "";

  if (exc.includes("NullPointerException")) {
    return `NullPointerException: звернення до null${loc}\nПоради:\n- Перевірте ініціалізацію об'єктів/масивів\n- Додайте перевірку на null перед викликом методів`;
  }
  if (exc.includes("ArrayIndexOutOfBoundsException")) {
    return `ArrayIndexOutOfBoundsException: вихід за межі масиву${loc}\nПоради:\n- Перевірте межі циклів\n- Останній індекс = length-1`;
  }
  if (exc.includes("NumberFormatException")) {
    return `NumberFormatException: не вдалося перетворити в число${loc}\nПоради:\n- Перевірте формат вводу${msg ? `\n- Повідомлення: ${msg}` : ""}`.trim();
  }
  if (exc.includes("StackOverflowError")) {
    return `StackOverflowError: переповнення стеку${loc}\nПоради:\n- Ймовірно нескінченна/дуже глибока рекурсія\n- Перевірте базовий випадок`;
  }

  return null;
}

// Backward-compatible named export used by routes.
export function filterStderrWithLang(stderr: string, language?: "JAVA" | "PYTHON"): string {
  return filterStderrWithLanguage(stderr, language);
}
export function compareOutput(actual: string, expected: string): boolean {
  const normalize = (str: string) => {
    const normalized = str.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    const lines = normalized.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    return lines.join("\n");
  };
  const normalizedActual = normalize(actual);
  const normalizedExpected = normalize(expected);
  if (normalizedActual === normalizedExpected) return true;
  const noSpacesActual = normalizedActual.replace(/\s+/g, "");
  const noSpacesExpected = normalizedExpected.replace(/\s+/g, "");
  if (noSpacesActual === noSpacesExpected) return true;
  const normalizeCommas = (str: string) => str.replace(/,\s+/g, ",").replace(/\s+,/g, ",");
  if (normalizeCommas(normalizedActual) === normalizeCommas(normalizedExpected)) return true;
  return false;
}