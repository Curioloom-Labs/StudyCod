import type { AiTaskGenerationResult } from "./LLMOrchestrator";
import type { TopicLanguage } from "../../utils/topicLanguage";

export function createIntroductoryHelloWorldTask(params: {
  topicTitle: string;
  lang: TopicLanguage;
  language?: "uk" | "en";
}): AiTaskGenerationResult {
  const isEnglish = params.language === "en";
  const practicalTask = isEnglish
    ? 'Write a complete program that prints the exact text "Hello, World!" once.'
    : 'Напишіть повну програму, яка один раз виводить точний текст "Hello, World!".';
  const codeTemplateByLanguage: Partial<Record<TopicLanguage, string>> = {
    PYTHON: isEnglish ? "# Print Hello, World! here" : "# Виведіть Hello, World! тут",
    JAVA: "public class Main {\n  public static void main(String[] args) {\n    // TODO\n  }\n}",
    CPP: "#include <iostream>\n\nint main() {\n    // TODO\n    return 0;\n}",
    C: "#include <stdio.h>\n\nint main(void) {\n    /* TODO */\n    return 0;\n}",
    JS: "// Print Hello, World! here",
    CSHARP: "using System;\n\nclass Program {\n    static void Main() {\n        // TODO\n    }\n}",
    KOTLIN: "fun main() {\n    // TODO\n}",
    GO: "package main\n\nfunc main() {\n    // TODO\n}",
    RUST: "fn main() {\n    // TODO\n}",
    PASCAL: "begin\n  { TODO }\nend.",
    D: "void main() {\n    // TODO\n}",
    DART: "void main() {\n  // TODO\n}",
    HASKELL: "main = pure ()",
    LISP: "; Print Hello, World! here",
    LUA: "-- Print Hello, World! here",
    PERL: "# Print Hello, World! here",
    PHP: "<?php\n// Print Hello, World! here",
    RUBY: "# Print Hello, World! here",
    SWIFT: "// Print Hello, World! here",
  };

  return {
    title: "Hello, World!",
    topic: params.topicTitle,
    difficulty: 1,
    theoryMarkdown: isEnglish
      ? "Practice printing one fixed line of text."
      : "Практика з виведення одного фіксованого рядка тексту.",
    practicalTask,
    ioType: "NO_INPUT_FIXED_OUTPUT",
    inputFormat: isEnglish ? "No input data." : "Вхідних даних немає.",
    outputFormat: "Hello, World!",
    constraints: isEnglish
      ? "Print only the exact requested text."
      : "Виведіть лише заданий текст без додаткових символів.",
    examples: [{
      input: "",
      output: "Hello, World!",
      explanation: isEnglish
        ? "The program prints one fixed line without reading input."
        : "Програма виводить один фіксований рядок без введення даних.",
    }],
    codeTemplate: codeTemplateByLanguage[params.lang] ?? "// TODO",
  };
}
