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
declare module "monaco-editor/esm/vs/basic-languages/go/go.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/rust/rust.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/dart/dart.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/lua/lua.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/perl/perl.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/php/php.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/swift/swift.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/esm/vs/basic-languages/scheme/scheme.contribution" { const contribution: unknown; export default contribution; }
declare module "monaco-editor/min/vs/editor/editor.main.css?inline" { const css: string; export default css; }
