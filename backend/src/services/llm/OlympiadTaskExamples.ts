import type { AiTaskGenerationResult } from './LLMOrchestrator';
import type { OlympiadPracticeContract } from '../learning/learningContract';
import { makeAIValidationError } from './AIResponseValidator';

const DETERMINISTIC_EXAMPLE_TOPICS = new Set([
  'constraints-and-complexity', 'array-traversal', 'extrema-and-counts', 'interval-basics',
  'boundary-debugging', 'prefix-transformations', 'fixed-window-sum', 'sorting-purpose',
  'binary-search', 'lower-upper-bound', 'maps-and-sets', 'two-pointers-sorted',
  'sliding-window', 'longest-valid-window', 'contest-workflow', 'language-runtime',
  'answer-search', 'divisors-and-gcd', 'euclidean-algorithm', 'prime-sieve',
  'factorization', 'modular-arithmetic', 'one-dimensional-counting',
  'dp-max-nonadjacent', 'maximum-subarray', 'kadane',
]);

function invalidExample(index: number, reason: string): never {
  throw makeAIValidationError(
    'generateTask',
    `OLYMPIAD_EXAMPLE_CONTRACT_FAILED: Example ${index + 1} ${reason}`,
  );
}

function parseIntegerTokens(input: string, exampleIndex: number): bigint[] {
  const tokens = input.trim().split(/\s+/);
  if (!input.trim() || tokens.some((token) => !/^[+-]?\d+$/.test(token))) {
    invalidExample(exampleIndex, 'must contain only whitespace-separated integers.');
  }
  return tokens.map((token) => BigInt(token));
}

function integerInput(input: string, exampleIndex: number, expectedCount: number): bigint[] {
  const values = parseIntegerTokens(input, exampleIndex);
  if (values.length !== expectedCount) {
    invalidExample(exampleIndex, `contains ${values.length} integers; expected ${expectedCount}.`);
  }
  return values;
}

function outputLines(output: string, exampleIndex: number): string[] {
  const normalized = output.replace(/\r\n/g, '\n').trim();
  if (!normalized) invalidExample(exampleIndex, 'must contain a non-empty output.');
  return normalized.split('\n').map((line) => line.trim());
}

function expectSingleLineTokens(output: string, expected: string[], exampleIndex: number): void {
  const lines = outputLines(output, exampleIndex);
  if (lines.length !== 1) invalidExample(exampleIndex, `must contain exactly one output line; got ${lines.length}.`);
  const actual = lines[0].split(/\s+/);
  if (actual.length !== expected.length || actual.some((token, index) => token !== expected[index])) {
    invalidExample(exampleIndex, `has incorrect output; expected ${expected.join(' ')}.`);
  }
}

function expectOutputTokens(output: string, expected: string[], exampleIndex: number): void {
  const lines = outputLines(output, exampleIndex);
  const actual = lines.flatMap((line) => line.split(/\s+/));
  if (actual.length !== expected.length || actual.some((token, index) => token !== expected[index])) {
    invalidExample(exampleIndex, `has incorrect output; expected tokens ${expected.join(' ')}.`);
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function expectQueryLines(output: string, expected: string[], exampleIndex: number): void {
  const lines = outputLines(output, exampleIndex);
  if (lines.length !== expected.length) {
    invalidExample(exampleIndex, `must contain exactly ${expected.length} output lines; got ${lines.length}.`);
  }
  for (let index = 0; index < expected.length; index++) {
    if (lines[index].split(/\s+/).length !== 1 || lines[index] !== expected[index]) {
      invalidExample(exampleIndex, `has an incorrect answer on output line ${index + 1}; expected ${expected[index]}.`);
    }
  }
}

function requireArrayLength(values: bigint[], nValue: bigint, exampleIndex: number, headerLength: number): number {
  if (nValue < 1n || nValue > 200_000n) invalidExample(exampleIndex, 'has n outside the contract bounds 1..200000.');
  const n = Number(nValue);
  if (values.length !== headerLength + n) {
    invalidExample(exampleIndex, `contains ${values.length} integers; expected ${headerLength + n} for n=${n}.`);
  }
  return n;
}

function validatePrefixSumsExample(input: string, output: string, exampleIndex: number): void {
  const values = parseIntegerTokens(input, exampleIndex);
  if (values.length < 2) invalidExample(exampleIndex, 'must start with n and q.');

  const nValue = values[0];
  const qValue = values[1];
  if (nValue < 1n || nValue > 200_000n || qValue < 1n || qValue > 200_000n) {
    invalidExample(exampleIndex, 'has n or q outside the contract bounds 1..200000.');
  }
  const n = Number(nValue);
  const q = Number(qValue);
  const expectedTokenCount = 2 + n + 2 * q;
  if (values.length !== expectedTokenCount) {
    invalidExample(exampleIndex, `contains ${values.length} integers; expected ${expectedTokenCount} for n=${n} and q=${q}.`);
  }

  const prefix = new Array<bigint>(n + 1).fill(0n);
  for (let index = 0; index < n; index++) {
    const value = values[2 + index];
    if (value < -1_000_000_000n || value > 1_000_000_000n) {
      invalidExample(exampleIndex, `contains an array value outside the contract bounds at position ${index + 1}.`);
    }
    prefix[index + 1] = prefix[index] + value;
  }

  const expectedAnswers: bigint[] = [];
  let cursor = 2 + n;
  for (let query = 0; query < q; query++) {
    const left = values[cursor++];
    const right = values[cursor++];
    if (left < 1n || right > nValue || left > right) {
      invalidExample(exampleIndex, `contains an invalid 1-based inclusive range in query ${query + 1}.`);
    }
    expectedAnswers.push(prefix[Number(right)] - prefix[Number(left) - 1]);
  }

  const lines = outputLines(output, exampleIndex);
  if (lines.length !== q) {
    invalidExample(exampleIndex, `must contain exactly ${q} output lines for q=${q}; got ${lines.length}.`);
  }
  for (let answerIndex = 0; answerIndex < q; answerIndex++) {
    const line = lines[answerIndex];
    if (!/^[+-]?\d+$/.test(line) || BigInt(line) !== expectedAnswers[answerIndex]) {
      invalidExample(exampleIndex, `has an incorrect answer on output line ${answerIndex + 1}; expected ${expectedAnswers[answerIndex]}.`);
    }
  }
}

function validateSimpleOlympiadExample(topicKey: string, input: string, output: string, exampleIndex: number): void {
  const values = parseIntegerTokens(input, exampleIndex);
  const inBounds = (value: bigint, min: bigint, max: bigint) => value >= min && value <= max;
  switch (topicKey) {
    case 'constraints-and-complexity': {
      const [n, budget] = integerInput(input, exampleIndex, 2);
      if (!inBounds(n, 1n, 1_000_000_000n) || !inBounds(budget, 1n, 1_000_000_000_000_000_000n)) {
        invalidExample(exampleIndex, 'has n or budget outside the contract bounds.');
      }
      expectSingleLineTokens(output, [n * n <= budget ? 'SAFE' : 'TOO_SLOW'], exampleIndex);
      return;
    }
    case 'array-traversal': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      const n = requireArrayLength(values, values[0], exampleIndex, 1);
      const array = values.slice(1);
      const positive = array.filter((value) => value > 0n);
      const sum = positive.reduce((total, value) => total + value, 0n);
      expectSingleLineTokens(output, [String(positive.length), String(sum)], exampleIndex);
      return;
    }
    case 'extrema-and-counts': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      requireArrayLength(values, values[0], exampleIndex, 1);
      const array = values.slice(1);
      const min = array.reduce((a, b) => a < b ? a : b);
      const max = array.reduce((a, b) => a > b ? a : b);
      expectSingleLineTokens(output, [String(min), String(max), String(array.filter((value) => value === max).length)], exampleIndex);
      return;
    }
    case 'interval-basics': {
      if (values.length < 3) invalidExample(exampleIndex, 'must contain n, the array, and interval bounds.');
      const nValue = values[0];
      if (!inBounds(nValue, 1n, 200_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 1..200000.');
      const n = Number(nValue);
      if (values.length !== n + 3) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${n + 3} for n=${n}.`);
      const left = values[n + 1];
      const right = values[n + 2];
      if (left < 1n || right > nValue || left > right) invalidExample(exampleIndex, 'contains an invalid 1-based inclusive interval.');
      const sum = values.slice(Number(left), Number(right) + 1).reduce((total, value) => total + value, 0n);
      expectSingleLineTokens(output, [String(sum)], exampleIndex);
      return;
    }
    case 'boundary-debugging': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      requireArrayLength(values, values[0], exampleIndex, 1);
      let equalNeighbors = 0;
      for (let index = 2; index < values.length; index++) {
        if (values[index] === values[index - 1]) equalNeighbors++;
      }
      expectSingleLineTokens(output, [String(equalNeighbors)], exampleIndex);
      return;
    }
    case 'prefix-transformations': {
      if (values.length < 2) invalidExample(exampleIndex, 'must start with n and q.');
      const nValue = values[0];
      const qValue = values[1];
      if (!inBounds(nValue, 1n, 200_000n) || !inBounds(qValue, 1n, 200_000n)) invalidExample(exampleIndex, 'has n or q outside the contract bounds 1..200000.');
      const n = Number(nValue);
      const q = Number(qValue);
      if (values.length !== 2 + n + 2 * q) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${2 + n + 2 * q} for n=${n} and q=${q}.`);
      const prefix = new Array<number>(n + 1).fill(0);
      for (let index = 0; index < n; index++) prefix[index + 1] = prefix[index] + (values[index + 2] % 2n !== 0n ? 1 : 0);
      const expected: string[] = [];
      let cursor = n + 2;
      for (let query = 0; query < q; query++) {
        const left = values[cursor++];
        const right = values[cursor++];
        if (left < 1n || right > nValue || left > right) invalidExample(exampleIndex, `contains an invalid 1-based inclusive range in query ${query + 1}.`);
        expected.push(String(prefix[Number(right)] - prefix[Number(left) - 1]));
      }
      expectQueryLines(output, expected, exampleIndex);
      return;
    }
    case 'fixed-window-sum': {
      if (values.length < 2) invalidExample(exampleIndex, 'must start with n and k.');
      const nValue = values[0];
      const kValue = values[1];
      if (nValue < 1n || nValue > 200_000n || kValue < 1n || kValue > nValue) invalidExample(exampleIndex, 'has n or k outside the contract bounds 1 ≤ k ≤ n ≤ 200000.');
      const n = Number(nValue);
      const k = Number(kValue);
      if (values.length !== n + 2) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${n + 2} for n=${n}.`);
      let sum = values.slice(2, 2 + k).reduce((total, value) => total + value, 0n);
      let best = sum;
      for (let right = k; right < n; right++) {
        sum += values[right + 2] - values[right - k + 2];
        if (sum > best) best = sum;
      }
      expectSingleLineTokens(output, [String(best)], exampleIndex);
      return;
    }
    case 'sorting-purpose': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      requireArrayLength(values, values[0], exampleIndex, 1);
      const sorted = values.slice(1).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(String);
      expectSingleLineTokens(output, sorted, exampleIndex);
      return;
    }
    case 'binary-search': {
      if (values.length < 3) invalidExample(exampleIndex, 'must contain n, the array, and target.');
      const nValue = values[0];
      if (!inBounds(nValue, 1n, 200_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 1..200000.');
      const n = Number(nValue);
      if (values.length !== n + 2) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${n + 2} for n=${n}.`);
      const array = values.slice(1, n + 1);
      if (array.some((value, index) => index > 0 && array[index - 1] > value)) invalidExample(exampleIndex, 'must be sorted in non-decreasing order.');
      const target = values[n + 1];
      const actual = outputLines(output, exampleIndex);
      if (actual.length !== 1 || !/^-?\d+$/.test(actual[0])) invalidExample(exampleIndex, 'must contain exactly one integer position.');
      const position = BigInt(actual[0]);
      if (position === -1n) {
        if (array.includes(target)) invalidExample(exampleIndex, 'reports -1 even though the target is present.');
      } else if (position < 1n || position > nValue || array[Number(position) - 1] !== target) {
        invalidExample(exampleIndex, 'must return a 1-based position containing the target, or -1 when absent.');
      }
      return;
    }
    case 'lower-upper-bound': {
      if (values.length < 2) invalidExample(exampleIndex, 'must start with n and q.');
      const nValue = values[0];
      const qValue = values[1];
      if (!inBounds(nValue, 1n, 200_000n) || !inBounds(qValue, 1n, 200_000n)) invalidExample(exampleIndex, 'has n or q outside the contract bounds 1..200000.');
      const n = Number(nValue);
      const q = Number(qValue);
      if (values.length !== 2 + n + 2 * q) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${2 + n + 2 * q} for n=${n} and q=${q}.`);
      const array = values.slice(2, 2 + n);
      if (array.some((value, index) => index > 0 && array[index - 1] > value)) invalidExample(exampleIndex, 'must be sorted in non-decreasing order.');
      const expected: string[] = [];
      for (let query = 0; query < q; query++) {
        const left = values[2 + n + query * 2];
        const right = values[3 + n + query * 2];
        if (left > right || left < -1_000_000_000n || right > 1_000_000_000n) invalidExample(exampleIndex, `contains an invalid value range in query ${query + 1}.`);
        let low = 0;
        let high = n;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (array[middle] < left) low = middle + 1;
          else high = middle;
        }
        const firstAtLeastLeft = low;
        low = 0;
        high = n;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (array[middle] <= right) low = middle + 1;
          else high = middle;
        }
        expected.push(String(low - firstAtLeastLeft));
      }
      expectQueryLines(output, expected, exampleIndex);
      return;
    }
    case 'maps-and-sets': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      requireArrayLength(values, values[0], exampleIndex, 1);
      const counts = new Map<string, number>();
      for (const value of values.slice(1)) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
      const maxFrequency = Array.from(counts.values()).reduce((best, count) => Math.max(best, count), 0);
      expectSingleLineTokens(output, [String(counts.size), String(maxFrequency)], exampleIndex);
      return;
    }
    case 'two-pointers-sorted': {
      if (values.length < 4) invalidExample(exampleIndex, 'must contain n, the sorted array, and target.');
      const nValue = values[0];
      if (!inBounds(nValue, 2n, 200_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 2..200000.');
      const n = Number(nValue);
      if (values.length !== n + 2) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${n + 2} for n=${n}.`);
      const array = values.slice(1, n + 1);
      if (array.some((value, index) => index > 0 && array[index - 1] > value)) invalidExample(exampleIndex, 'must be sorted in non-decreasing order.');
      const target = values[n + 1];
      let left = 0;
      let right = n - 1;
      let exists = false;
      while (left < right) {
        const sum = array[left] + array[right];
        if (sum === target) { exists = true; break; }
        if (sum < target) left++;
        else right--;
      }
      const actual = outputLines(output, exampleIndex);
      if (actual.length !== 1) invalidExample(exampleIndex, 'must contain exactly one output line with two indices.');
      const tokens = actual[0].split(/\s+/);
      if (tokens.length !== 2 || !/^-?\d+$/.test(tokens[0]) || !/^-?\d+$/.test(tokens[1])) invalidExample(exampleIndex, 'must contain exactly two integer indices.');
      const first = BigInt(tokens[0]);
      const second = BigInt(tokens[1]);
      if (first === -1n && second === -1n) {
        if (exists) invalidExample(exampleIndex, 'reports no pair even though a valid pair exists.');
      } else if (first < 1n || first > nValue || second < 1n || second > nValue || first === second
        || array[Number(first) - 1] + array[Number(second) - 1] !== target) {
        invalidExample(exampleIndex, 'must return two distinct 1-based positions whose values sum to the target, or -1 -1 when none exist.');
      }
      return;
    }
    case 'sliding-window': {
      if (values.length < 3) invalidExample(exampleIndex, 'must contain n, budget, and the array.');
      const nValue = values[0];
      const budget = values[1];
      if (!inBounds(nValue, 1n, 200_000n) || budget < 0n || budget > 1_000_000_000_000_000_000n) invalidExample(exampleIndex, 'has n or budget outside the contract bounds.');
      const n = Number(nValue);
      if (values.length !== n + 2) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${n + 2} for n=${n}.`);
      const array = values.slice(2);
      if (array.some((value) => value < 0n)) invalidExample(exampleIndex, 'contains a negative value although the contract requires non-negative values.');
      let left = 0;
      let sum = 0n;
      let count = 0n;
      for (let right = 0; right < n; right++) {
        sum += array[right];
        while (sum > budget) sum -= array[left++];
        count += BigInt(right - left + 1);
      }
      expectSingleLineTokens(output, [String(count)], exampleIndex);
      return;
    }
    case 'longest-valid-window': {
      if (values.length < 3) invalidExample(exampleIndex, 'must contain n, budget, and the array.');
      const nValue = values[0];
      const budget = values[1];
      if (!inBounds(nValue, 1n, 200_000n) || budget < 0n || budget > 200_000_000_000_000n) invalidExample(exampleIndex, 'has n or budget outside the contract bounds.');
      const n = Number(nValue);
      if (values.length !== n + 2) invalidExample(exampleIndex, `contains ${values.length} integers; expected ${n + 2} for n=${n}.`);
      const array = values.slice(2);
      if (array.some((value) => value <= 0n)) invalidExample(exampleIndex, 'contains a non-positive value although the contract requires positive values.');
      let left = 0;
      let sum = 0n;
      let bestLength = 0;
      let bestLeft = -1;
      let bestRight = -1;
      for (let right = 0; right < n; right++) {
        sum += array[right];
        while (left <= right && sum > budget) sum -= array[left++];
        const length = right - left + 1;
        if (length > bestLength || (length === bestLength && length > 0 && left < bestLeft)) {
          bestLength = length;
          bestLeft = left;
          bestRight = right;
        }
      }
      expectSingleLineTokens(output, bestLength === 0 ? ['0', '0', '0'] : [String(bestLength), String(bestLeft + 1), String(bestRight + 1)], exampleIndex);
      return;
    }
    case 'contest-workflow': {
      const [compileOk, runtimeOk, timeMs, timeLimitMs, memoryMb, memoryLimitMb, outputMatches] = integerInput(input, exampleIndex, 7);
      if (![compileOk, runtimeOk, outputMatches].every((flag) => flag === 0n || flag === 1n)
        || !inBounds(timeMs, 0n, 1_000_000_000n) || !inBounds(memoryMb, 0n, 1_000_000_000n)
        || !inBounds(timeLimitMs, 1n, 1_000_000_000n) || !inBounds(memoryLimitMb, 1n, 1_000_000_000n)) {
        invalidExample(exampleIndex, 'contains a flag or resource limit outside the contract bounds.');
      }
      const verdict = compileOk === 0n ? 'CE'
        : runtimeOk === 0n ? 'RE'
          : timeMs > timeLimitMs ? 'TLE'
            : memoryMb > memoryLimitMb ? 'MLE'
              : outputMatches === 0n ? 'WA' : 'AC';
      expectSingleLineTokens(output, [verdict], exampleIndex);
      return;
    }
    case 'language-runtime': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      const nValue = values[0];
      if (!inBounds(nValue, 1n, 2_000_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 1..2000000.');
      const n = Number(nValue);
      if (values.length !== n + 1) invalidExample(exampleIndex, `contains ${values.length - 1} measurements; expected ${n}.`);
      const measurements = values.slice(1);
      if (measurements.some((value) => !inBounds(value, -1_000_000_000n, 1_000_000_000n))) invalidExample(exampleIndex, 'contains a measurement outside the contract bounds.');
      const sum = measurements.reduce((total, value) => total + value, 0n);
      expectSingleLineTokens(output, [String(sum)], exampleIndex);
      return;
    }
    case 'answer-search': {
      if (values.length < 3) invalidExample(exampleIndex, 'must contain n, k, and the positive job sizes.');
      const nValue = values[0];
      const kValue = values[1];
      if (!inBounds(nValue, 1n, 200_000n) || kValue < 1n || kValue > nValue) invalidExample(exampleIndex, 'has n or k outside the contract bounds 1 ≤ k ≤ n ≤ 200000.');
      const n = Number(nValue);
      if (values.length !== n + 2) invalidExample(exampleIndex, `contains ${values.length - 2} job sizes; expected ${n}.`);
      const jobs = values.slice(2);
      if (jobs.some((value) => value < 1n || value > 1_000_000_000n)) invalidExample(exampleIndex, 'contains a job size outside the contract bounds.');
      const numbers = jobs.map(Number);
      let low = numbers.reduce((maximum, value) => Math.max(maximum, value), 0);
      let high = numbers.reduce((sum, value) => sum + value, 0);
      while (low < high) {
        const capacity = Math.floor((low + high) / 2);
        let groups = 1;
        let groupSum = 0;
        for (const job of numbers) {
          if (groupSum + job > capacity) { groups++; groupSum = 0; }
          groupSum += job;
        }
        if (groups <= Number(kValue)) high = capacity;
        else low = capacity + 1;
      }
      expectSingleLineTokens(output, [String(low)], exampleIndex);
      return;
    }
    case 'divisors-and-gcd': {
      const [n] = integerInput(input, exampleIndex, 1);
      if (!inBounds(n, 1n, 1_000_000_000_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 1..10^12.');
      let divisorCount = 0n;
      let divisorSum = 0n;
      for (let divisor = 1n; divisor <= n / divisor; divisor++) {
        if (n % divisor !== 0n) continue;
        const partner = n / divisor;
        divisorCount += partner === divisor ? 1n : 2n;
        divisorSum += partner === divisor ? divisor : divisor + partner;
      }
      expectSingleLineTokens(output, [String(divisorCount), String(divisorSum)], exampleIndex);
      return;
    }
    case 'euclidean-algorithm': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      const nValue = values[0];
      if (!inBounds(nValue, 1n, 200_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 1..200000.');
      const n = Number(nValue);
      if (values.length !== n + 1) invalidExample(exampleIndex, `contains ${values.length - 1} values; expected ${n}.`);
      const sequence = values.slice(1);
      if (sequence.some((value) => !inBounds(value, 0n, 1_000_000_000_000_000_000n))) invalidExample(exampleIndex, 'contains a value outside the contract bounds 0..10^18.');
      const result = sequence.reduce((current, value) => gcd(current, value), 0n);
      expectSingleLineTokens(output, [String(result)], exampleIndex);
      return;
    }
    case 'prime-sieve': {
      const [limitValue] = integerInput(input, exampleIndex, 1);
      if (!inBounds(limitValue, 1n, 2_000_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 1..2000000.');
      const limit = Number(limitValue);
      const prime = new Uint8Array(limit + 1).fill(1);
      prime[0] = 0;
      if (limit >= 1) prime[1] = 0;
      for (let candidate = 2; candidate * candidate <= limit; candidate++) {
        if (!prime[candidate]) continue;
        for (let multiple = candidate * candidate; multiple <= limit; multiple += candidate) prime[multiple] = 0;
      }
      const primes: string[] = [];
      for (let candidate = 2; candidate <= limit; candidate++) if (prime[candidate]) primes.push(String(candidate));
      expectOutputTokens(output, primes.length ? primes : ['EMPTY'], exampleIndex);
      return;
    }
    case 'factorization': {
      const [n] = integerInput(input, exampleIndex, 1);
      if (!inBounds(n, 1n, 1_000_000_000_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 1..10^12.');
      let remaining = n;
      const factors: Array<[bigint, bigint]> = [];
      for (let divisor = 2n; divisor <= remaining / divisor; divisor = divisor === 2n ? 3n : divisor + 2n) {
        if (remaining % divisor !== 0n) continue;
        let exponent = 0n;
        while (remaining % divisor === 0n) { remaining /= divisor; exponent++; }
        factors.push([divisor, exponent]);
      }
      if (remaining > 1n) factors.push([remaining, 1n]);
      const expected = [String(factors.length), ...factors.flatMap(([prime, exponent]) => [String(prime), String(exponent)])];
      expectOutputTokens(output, expected, exampleIndex);
      return;
    }
    case 'modular-arithmetic': {
      const [base, exponent, modulus] = integerInput(input, exampleIndex, 3);
      if (!inBounds(base, -1_000_000_000_000_000_000n, 1_000_000_000_000_000_000n)
        || !inBounds(exponent, 0n, 1_000_000_000_000_000_000n)
        || !inBounds(modulus, 1n, 1_000_000_000n)) invalidExample(exampleIndex, 'has a, b, or m outside the contract bounds.');
      let power = exponent;
      let factor = ((base % modulus) + modulus) % modulus;
      let result = 1n % modulus;
      while (power > 0n) {
        if (power % 2n === 1n) result = (result * factor) % modulus;
        factor = (factor * factor) % modulus;
        power /= 2n;
      }
      expectSingleLineTokens(output, [String(result)], exampleIndex);
      return;
    }
    case 'one-dimensional-counting': {
      const [nValue] = integerInput(input, exampleIndex, 1);
      if (!inBounds(nValue, 0n, 2_000_000n)) invalidExample(exampleIndex, 'has n outside the contract bounds 0..2000000.');
      const n = Number(nValue);
      const mod = 1_000_000_007;
      let prevPrev = 1;
      let prev = n === 0 ? 1 : 1;
      for (let step = 2; step <= n; step++) {
        const current = (prev + prevPrev) % mod;
        prevPrev = prev;
        prev = current;
      }
      expectSingleLineTokens(output, [String(n === 0 ? 1 : n === 1 ? 1 : prev)], exampleIndex);
      return;
    }
    case 'dp-max-nonadjacent': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      const n = requireArrayLength(values, values[0], exampleIndex, 1);
      const array = values.slice(1);
      let twoBack = 0n;
      let oneBack = 0n;
      for (const value of array) {
        const current = oneBack > twoBack + value ? oneBack : twoBack + value;
        twoBack = oneBack;
        oneBack = current;
      }
      expectSingleLineTokens(output, [String(oneBack)], exampleIndex);
      return;
    }
    case 'maximum-subarray': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      const n = requireArrayLength(values, values[0], exampleIndex, 1);
      if (n > 2_000) invalidExample(exampleIndex, 'has n above the contract bound 2000.');
      const array = values.slice(1);
      let ending = array[0];
      let best = ending;
      for (let index = 1; index < n; index++) {
        ending = ending > 0n ? ending + array[index] : array[index];
        if (ending > best) best = ending;
      }
      expectSingleLineTokens(output, [String(best)], exampleIndex);
      return;
    }
    case 'kadane': {
      if (!values.length) invalidExample(exampleIndex, 'must start with n.');
      const n = requireArrayLength(values, values[0], exampleIndex, 1);
      const array = values.slice(1);
      let ending = array[0];
      let endingLeft = 0;
      let best = array[0];
      let bestLeft = 0;
      let bestRight = 0;
      for (let right = 1; right < n; right++) {
        if (ending + array[right] < array[right]) {
          ending = array[right];
          endingLeft = right;
        } else {
          ending += array[right];
        }
        if (ending > best || (ending === best && (right < bestRight || (right === bestRight && endingLeft < bestLeft)))) {
          best = ending;
          bestLeft = endingLeft;
          bestRight = right;
        }
      }
      expectSingleLineTokens(output, [String(best), String(bestLeft + 1), String(bestRight + 1)], exampleIndex);
      return;
    }
  }
}

/** Deterministically verify public examples for fixed, machine-readable Judge contracts. */
export function validateOlympiadTaskExamples(
  contract: OlympiadPracticeContract,
  task: AiTaskGenerationResult,
): void {
  for (const [exampleIndex, example] of task.examples.entries()) {
    if (contract.topicKey === 'prefix-sums') {
      validatePrefixSumsExample(example.input, example.output, exampleIndex);
    } else if (DETERMINISTIC_EXAMPLE_TOPICS.has(contract.topicKey)) {
      validateSimpleOlympiadExample(contract.topicKey, example.input, example.output, exampleIndex);
    }
  }
}

/** Extract the one source snippet that the Judge learner should repair in the editor. */
export function extractOlympiadDebuggingDraft(
  contract: OlympiadPracticeContract,
  practicalTask: string,
): string | null {
  if (contract.stage !== 'EDGE_CASES') return null;

  const language = contract.runtime === 'PYTHON' ? /^(?:python|py)$/i
    : contract.runtime === 'JAVA' ? /^java$/i
      : /^(?:cpp|c\+\+|cxx)$/i;
  const blocks = [...String(practicalTask ?? '').matchAll(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g)];
  const hasTargetRuntimeDraft = blocks.length === 1
    && language.test(String(blocks[0][1] ?? '').trim())
    && String(blocks[0][2] ?? '').split(/\r?\n/).filter((line) => line.trim()).length >= 3;
  return hasTargetRuntimeDraft ? String(blocks[0][2] ?? '').trim() : null;
}

const COMPLETE_PROGRAM_REQUEST = /(?:complete|full)\s+(?:corrected\s+)?(?:program|source\s+code|code|solution)|(?:повн[\p{L}]*|ціл[\p{L}]*)\s+(?:виправлен[\p{L}]*\s+)?(?:програм[\p{L}]*|код[\p{L}]*|розв['’ʼ`]?яз[\p{L}]*|рішенн[\p{L}]*)/iu;

/** Add the explicit full-program submission required by the EDGE_CASES contract when the model omits it. */
export function ensureOlympiadCompleteProgramRequest(
  contract: OlympiadPracticeContract,
  task: AiTaskGenerationResult,
): void {
  if (contract.stage !== 'EDGE_CASES') return;
  const practicalTask = String(task.practicalTask ?? '');
  const learnerText = practicalTask.replace(/```[^\r\n`]*\r?\n[\s\S]*?```/g, ' ');
  if (COMPLETE_PROGRAM_REQUEST.test(learnerText)) return;

  const instruction = /[а-яіїєґ]/iu.test(learnerText)
    ? 'Подайте повну виправлену програму, яка читає задані вхідні дані та виводить відповідь у визначеному форматі.'
    : 'Submit a complete corrected program that reads the specified input and prints the answer in the required format.';
  task.practicalTask = `${practicalTask.trim()}\n\n${instruction}`;
}

/** Require the generated EDGE_CASES statement to contain a repairable draft in the course runtime. */
export function validateOlympiadDebuggingTask(
  contract: OlympiadPracticeContract,
  task: AiTaskGenerationResult,
): void {
  if (contract.stage !== 'EDGE_CASES') return;

  const practicalTask = String(task.practicalTask ?? '');
  const faultyDraft = extractOlympiadDebuggingDraft(contract, practicalTask);
  const learnerText = practicalTask.replace(/```[^\r\n`]*\r?\n[\s\S]*?```/g, ' ');
  const hasDiagnosisRequest = /(?:помил|хибн|неправиль|баг|bug|error|wrong|incorrect|faulty|flawed|mistake)/iu.test(learnerText);
  const asksForRepair = /(?:виправ|полагод|усун|fix|repair|correct(?:ed)?\s+(?:program|code|solution))/iu.test(learnerText);
  const asksForCompleteProgram = COMPLETE_PROGRAM_REQUEST.test(learnerText);

  if (!faultyDraft || !hasDiagnosisRequest || !asksForRepair || !asksForCompleteProgram) {
    const missing = [
      ...(!faultyDraft ? [`exactly one fenced ${contract.runtime} code block with at least three non-empty lines in practicalTask`] : []),
      ...(!hasDiagnosisRequest ? ['prose identifying a logical error in the draft'] : []),
      ...(!asksForRepair ? ['an explicit request to repair or correct the draft'] : []),
      ...(!asksForCompleteProgram ? ['an explicit request to submit a complete program'] : []),
    ];
    throw makeAIValidationError(
      'generateTask',
      `OLYMPIAD_DEBUG_TASK_REQUIRED: EDGE_CASES is missing ${missing.join('; ')}. Generate exactly one short faulty ${contract.runtime} code sample in the practicalTask, ask the learner to identify its logical error, repair it, and submit a complete program.`,
    );
  }
}

const NON_NEGATIVE_STORY_CONTEXT = /(?:^|[^\p{L}\p{N}])(?:sales?|revenue|income|ages?|lengths?|distances?|heights?|weights?|population|portions?\s+(?:of\s+)?(?:ice\s+cream|food|items|products)?|(?:number|count)\s+of\s+(?:people|students|visitors|users|items|products|objects|tickets|cars|books))(?=$|[^\p{L}\p{N}])|продаж|виручк|виторг|доход|порці|вік|довжин|відстан|висот|ваг|населен|кількіст[\p{L}]*\s+(?:людей|учнів|студентів|відвідувачів|користувачів|предметів|товарів|квитків|автомобілів)/iu;

const EXPLICIT_NEGATIVE_VALUE = /\b(?:negative\s+(?:values?|integers?|numbers?|measurements?|coordinates?|changes?)|below\s+zero|less\s+than\s+zero|minus\s+sign|signed\s+(?:integer|number|value))\b|від['’]?ємн[\p{L}]*|нижч[\p{L}]*\s+за\s+нуль|знак\s+мінус|ціл[\p{L}]*\s+зі\s+знак[\p{L}]*/iu;

const SIGNED_DOMAIN_MEANING = /\b(?:refunds?|returns?|chargebacks?|corrections?|adjustments?|changes?|net\s+(?:change|amount|sales|balance)|balance|debt|profit\s+or\s+loss|gains?\s+and\s+losses|increase\s+and\s+decrease)\b|повернен[\p{L}]*|відшкодуван[\p{L}]*|коригуван[\p{L}]*|змін[\p{L}]*|чист[\p{L}]*\s+(?:баланс[\p{L}]*|дохід[\p{L}]*|продаж[\p{L}]*)|баланс[\p{L}]*|борг[\p{L}]*|прибут[\p{L}]*\s+(?:і|та)\s+збит[\p{L}]*|збільшенн[\p{L}]*\s+і\s+зменшенн[\p{L}]*/iu;

function contractAllowsNegativeValues(contract: OlympiadPracticeContract): boolean {
  const domain = [contract.requiredInput, contract.constraints, ...contract.requiredCases].join(' ');
  return /\|[^|]+\|\s*(?:<=|≤|<)\s*\d|-\s*\d+(?:\s*\^\s*\d+)?\s*(?:<=|≤|<)\s*[a-z]\w*(?:\[[^\]]+\])?|(?:^|[^\p{L}-])negative\s+(?:values?|integers?|numbers?|measurements?|coordinates?)(?=$|[^\p{L}])|\bsigned\s+(?:integers?|numbers?|values?)\b|(?:^|[^\p{L}])від['’]?ємн[\p{L}]*\s+(?:значенн[\p{L}]*|числ[\p{L}]*)|мож[\p{L}]*\s+бути\s+від['’]?ємн/iu.test(domain);
}

/** Reject learner-facing stories that contradict negative values permitted by the hidden contract. */
export function validateOlympiadTaskNarrativeDomain(
  contract: OlympiadPracticeContract,
  task: AiTaskGenerationResult,
): void {
  if (!contractAllowsNegativeValues(contract)) return;

  const statement = [task.title, task.practicalTask, task.inputFormat, task.outputFormat, task.constraints].join('\n');
  if (!NON_NEGATIVE_STORY_CONTEXT.test(statement)) return;

  const explainsSignedValues = EXPLICIT_NEGATIVE_VALUE.test(statement)
    && SIGNED_DOMAIN_MEANING.test(statement);
  const usesNeutralSignedDomain = /\b(?:signed\s+(?:integer|number|value)|net\s+(?:change|amount|balance))\b|ціл[\p{L}]*\s+зі\s+знак[\p{L}]*|чист[\p{L}]*\s+(?:змін[\p{L}]*|баланс[\p{L}]*)/iu.test(statement);
  if (explainsSignedValues || usesNeutralSignedDomain) return;

  throw makeAIValidationError(
    'generateTask',
    'OLYMPIAD_NARRATIVE_DOMAIN_MISMATCH: The contract allows negative values, but the story describes an inherently non-negative quantity. Explain what negative values mean (for example, refunds, returns, corrections, or net changes), or use a neutral signed-integer context; keep the contract bounds unchanged.',
  );
}
