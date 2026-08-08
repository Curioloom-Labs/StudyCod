declare module "monaco-editor/esm/vs/editor/editor.api" {
  const monaco: typeof import("monaco-editor");
  export = monaco;
}

declare module "monaco-editor/esm/vs/editor/editor.worker?worker" {
  const MonacoEditorWorker: new () => Worker;
  export default MonacoEditorWorker;
}

declare module "monaco-editor/esm/vs/basic-languages/java/java.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/python/python.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/html/html.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/css/css.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/xml/xml.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/sql/sql.contribution" { const contribution: unknown; export default contribution; }
