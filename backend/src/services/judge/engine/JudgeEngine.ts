import { Task, JudgeResult } from "../types/Task";
import { validateTaskConfig } from "./TaskValidator";
import { TaskValidationError } from "../types/Task";
import { getCustomValidator } from "../validators";
export function judgeSolution({
  task,
  userOutput
}: {
  task: Task;
  userOutput: string;
}): JudgeResult {
  try {
    validateTaskConfig(task);
  } catch (error: unknown) {
    if (error instanceof TaskValidationError) {
      return {
        success: false,
        message: `Task configuration error: ${error.message}`,
        details: {
          expected: undefined,
          received: userOutput
        }
      };
    }
    throw error;
  }
  const trimmedUserOutput = userOutput.trim();
  const trimmedExpected = task.expectedOutput?.trim() || "";
  switch (task.judgeMode) {
    case "EXACT":
      return judgeExact(trimmedUserOutput, trimmedExpected);
    case "NUMERIC":
      return judgeNumeric(trimmedUserOutput, trimmedExpected, task.tolerance || 0.0001);
    case "REGEX":
      return judgeRegex(trimmedUserOutput, task.regexPattern!, task.regexFlags);
    case "CUSTOM":
      return judgeCustom(trimmedUserOutput, task.customValidator!);
    case "MANUAL":
      return judgeManual();
    default:
      return {
        success: false,
        message: `Unknown judge mode: ${task.judgeMode}`,
        details: {
          expected: undefined,
          received: trimmedUserOutput
        }
      };
  }
}
function judgeExact(userOutput: string, expectedOutput: string): JudgeResult {
  const hasCyrillic = (s: string) => /[\u0400-\u04FF]/.test(s);
  const safeNfc = (s: string) => {
    try {
      return s.normalize("NFC");
    } catch {
      return s;
    }
  };
  const normalizeApostrophes = (s: string) => s.replace(/[\u2018\u2019\u201B\u2032\u02BC]/g, "'");
  const normalizeInvisibles = (s: string) => s.replace(/\u00A0/g, " ").replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
  const toConfusableSkeleton = (s: string) => {
    let out = "";
    for (const ch of s) {
      switch (ch) {
        case "A":
        case "А":
          out += "A";
          break;
        case "a":
        case "а":
          out += "a";
          break;
        case "B":
        case "В":
          out += "B";
          break;
        case "C":
        case "С":
          out += "C";
          break;
        case "c":
        case "с":
          out += "c";
          break;
        case "E":
        case "Е":
          out += "E";
          break;
        case "e":
        case "е":
          out += "e";
          break;
        case "H":
        case "Н":
          out += "H";
          break;
        case "h":
        case "н":
          out += "h";
          break;
        case "I":
        case "І":
          out += "I";
          break;
        case "i":
        case "і":
          out += "i";
          break;
        case "K":
        case "К":
          out += "K";
          break;
        case "k":
        case "к":
          out += "k";
          break;
        case "M":
        case "М":
          out += "M";
          break;
        case "m":
        case "м":
          out += "m";
          break;
        case "O":
        case "О":
          out += "O";
          break;
        case "o":
        case "о":
          out += "o";
          break;
        case "P":
        case "Р":
          out += "P";
          break;
        case "p":
        case "р":
          out += "p";
          break;
        case "T":
        case "Т":
          out += "T";
          break;
        case "t":
        case "т":
          out += "t";
          break;
        case "X":
        case "Х":
          out += "X";
          break;
        case "x":
        case "х":
          out += "x";
          break;
        case "Y":
        case "У":
          out += "Y";
          break;
        case "y":
        case "у":
          out += "y";
          break;
        default:
          out += ch;
      }
    }
    return out;
  };

  const expectedHasCyr = hasCyrillic(String(expectedOutput ?? ""));
  const normalize = (s: string) => {
    let t = String(s ?? "");
    t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    t = normalizeInvisibles(t);
    t = normalizeApostrophes(t);
    t = safeNfc(t);
    if (expectedHasCyr) t = toConfusableSkeleton(t);
    return t.trim();
  };

  const success = normalize(userOutput) === normalize(expectedOutput);
  return {
    success,
    message: success ? "Output matches exactly" : `Output does not match. Expected: "${expectedOutput}", Received: "${userOutput}"`,
    details: {
      expected: expectedOutput,
      received: userOutput
    }
  };
}
function judgeNumeric(userOutput: string, expectedOutput: string, tolerance: number): JudgeResult {
  const userNum = parseFloat(userOutput);
  const expectedNum = parseFloat(expectedOutput);
  if (isNaN(userNum)) {
    return {
      success: false,
      message: `Output is not a valid number: "${userOutput}"`,
      details: {
        expected: expectedOutput,
        received: userOutput
      }
    };
  }
  if (isNaN(expectedNum)) {
    return {
      success: false,
      message: `Expected output is not a valid number: "${expectedOutput}"`,
      details: {
        expected: expectedOutput,
        received: userOutput
      }
    };
  }
  const difference = Math.abs(userNum - expectedNum);
  const success = difference <= tolerance;
  return {
    success,
    message: success ? `Output is within tolerance (${tolerance})` : `Output is outside tolerance. Expected: ${expectedNum}, Received: ${userNum}, Difference: ${difference.toFixed(6)}, Tolerance: ${tolerance}`,
    details: {
      expected: expectedOutput,
      received: userOutput,
      difference
    }
  };
}
function judgeRegex(userOutput: string, pattern: string, flags?: string): JudgeResult {
  try {
    const regex = new RegExp(pattern, flags || "");
    const matched = regex.test(userOutput);
    return {
      success: matched,
      message: matched ? `Output matches pattern: ${pattern}` : `Output does not match pattern: ${pattern}`,
      details: {
        expected: pattern,
        received: userOutput,
        matchedPattern: matched
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Invalid regex pattern: ${error.message}`,
      details: {
        expected: pattern,
        received: userOutput
      }
    };
  }
}
function judgeCustom(userOutput: string, validatorName: string): JudgeResult {
  const validator = getCustomValidator(validatorName);
  if (!validator) {
    return {
      success: false,
      message: `Custom validator "${validatorName}" not found`,
      details: {
        expected: undefined,
        received: userOutput
      }
    };
  }
  try {
    const success = validator(userOutput);
    return {
      success,
      message: success ? `Output passed custom validator: ${validatorName}` : `Output failed custom validator: ${validatorName}`,
      details: {
        expected: undefined,
        received: userOutput
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error in custom validator "${validatorName}": ${error.message}`,
      details: {
        expected: undefined,
        received: userOutput
      }
    };
  }
}
function judgeManual(): JudgeResult {
  return {
    success: true,
    message: "Waiting for manual review",
    details: {
      expected: undefined,
      received: undefined
    }
  };
}