export type CustomValidatorFunction = (output: string) => boolean;
export const customValidators: Record<string, CustomValidatorFunction> = {
  isSortedArray: (output: string): boolean => {
    try {
      const trimmed = output.trim();
      const numbers = trimmed.split(/[\s,]+/).map(s => s.trim()).filter(s => s.length > 0).map(s => parseFloat(s)).filter(n => !isNaN(n));
      if (numbers.length === 0) return false;
      for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] < numbers[i - 1]) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  },
  containsName: (output: string): boolean => {
    const trimmed = output.trim().toLowerCase();
    return trimmed.length > 0 && /^[а-яa-zіїєґ\s]+$/i.test(trimmed);
  },
  isValidEmail: (output: string): boolean => {
    const trimmed = output.trim();
    if (trimmed.length === 0) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(trimmed);
  },
  isPalindrome: (output: string): boolean => {
    const trimmed = output.trim().toLowerCase().replace(/\s+/g, "");
    if (trimmed.length === 0) return false;
    return trimmed === trimmed.split("").reverse().join("");
  },
  isNumericOnly: (output: string): boolean => {
    const trimmed = output.trim();
    if (trimmed.length === 0) return false;
    return /^[\d\s,.\-]+$/.test(trimmed);
  },
  hasCorrectLineCount: (output: string): boolean => {
    const lines = output.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    return lines.length > 0;
  },
  isValidJSON: (output: string): boolean => {
    try {
      JSON.parse(output.trim());
      return true;
    } catch {
      return false;
    }
  },
  isFibonacciSequence: (output: string): boolean => {
    try {
      const numbers = output.trim().split(/[\s,]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 0);
      if (numbers.length < 2) return false;
      for (let i = 2; i < numbers.length; i++) {
        if (numbers[i] !== numbers[i - 1] + numbers[i - 2]) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
};
export function getCustomValidator(name: string): CustomValidatorFunction | null {
  return customValidators[name] || null;
}
export function registerCustomValidator(name: string, validator: CustomValidatorFunction): void {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("Validator name must be a non-empty string");
  }
  if (typeof validator !== "function") {
    throw new Error("Validator must be a function");
  }
  customValidators[name] = validator;
}