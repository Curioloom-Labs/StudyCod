export type LearningCatalogProjectRuntime = "JAVA" | "PYTHON" | "CPP";

/** File name required by the isolated judge for each project runtime. */
export function projectEntryFile(runtime: LearningCatalogProjectRuntime): string {
  if (runtime === "JAVA") return "Main.java";
  if (runtime === "CPP") return "main.cpp";
  return "main.py";
}
