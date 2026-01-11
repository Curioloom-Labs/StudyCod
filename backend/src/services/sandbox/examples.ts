import { CodeRunner, ExecutionStatus } from "./index";
export async function examplePython() {
  const runner = new CodeRunner();
  const result = await runner.run({
    language: "python",
    code: `
print("Hello, World!")
a = int(input())
print(a * 2)
    `.trim(),
    input: "5\n"
  });
  console.log("Status:", result.status);
  console.log("Stdout:", result.stdout);
  console.log("Stderr:", result.stderr);
  console.log("Exit Code:", result.exitCode);
  console.log("Wall Time:", result.wallTimeMs, "ms");
}
export async function exampleCpp() {
  const runner = new CodeRunner();
  const result = await runner.run({
    language: "cpp",
    code: `
#include <iostream>
using namespace std;

int main() {
    int a;
    cin >> a;
    cout << a * 2 << endl;
    return 0;
}
    `.trim(),
    input: "5\n"
  });
  console.log("Status:", result.status);
  console.log("Stdout:", result.stdout);
  console.log("Stderr:", result.stderr);
  console.log("Exit Code:", result.exitCode);
}
export async function exampleErrorHandling() {
  const runner = new CodeRunner();
  try {
    const result = await runner.run({
      language: "python",
      code: `
import time
time.sleep(10)  # Перевищення таймауту
      `.trim()
    });
    if (result.status === ExecutionStatus.TIME_LIMIT) {
      console.log("Code exceeded time limit");
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}
export async function exampleJava() {
  const runner = new CodeRunner();
  const result = await runner.run({
    language: "java",
    code: `
public class Main {
    public static void main(String[] args) {
        java.util.Scanner scanner = new java.util.Scanner(System.in);
        int a = scanner.nextInt();
        System.out.println(a * 2);
    }
}
    `.trim(),
    input: "5\n"
  });
  console.log("Status:", result.status);
  console.log("Stdout:", result.stdout);
  console.log("Stderr:", result.stderr);
  console.log("Exit Code:", result.exitCode);
}
export async function exampleCustomLimits() {
  const runner = new CodeRunner();
  const result = await runner.run({
    language: "python",
    code: "print('Hello')",
    limits: {
      memoryMB: 128,
      cpuTimeSeconds: 1,
      wallTimeSeconds: 2,
      maxOutputBytes: 32 * 1024,
      maxProcesses: 1,
      maxFiles: 16
    }
  });
  console.log("Result:", result);
}