import * as path from "path";
import { writeFile } from "fs/promises";
import { COMPILE_BUDGET, LanguageAdapter } from "./types";
import { readEnv } from "../config";

function dotnetArgs(args: string[]): string[] {
  // Use /usr/bin/env to inject env vars even if the sandbox strips the parent environment.
  // These settings reduce first-run overhead and memory usage.
  return [
    "/usr/bin/env",
    "DOTNET_ROOT=/usr/share/dotnet",
    // Keep all caches/temp under /work (a per-submission bind mount).
    "DOTNET_CLI_HOME=/work/.dotnet",
    "NUGET_PACKAGES=/work/.nuget",
    "HOME=/work",
    "TMPDIR=/work",
    "DOTNET_MULTILEVEL_LOOKUP=0",
    "DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1",
    "DOTNET_NOLOGO=1",
    "DOTNET_CLI_TELEMETRY_OPTOUT=1",
    // 0-9, higher = more conservative memory usage.
    "DOTNET_GCConserveMemory=9",
    // .NET's W^X doublemapper truncates an anonymous memfd to 2 TiB, which
    // conflicts with RLIMIT_FSIZE. The sandbox keeps its file/RAM limits.
    "DOTNET_EnableWriteXorExecute=0",
    "/usr/share/dotnet/dotnet",
    ...args
  ];
}

function csprojXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;
}

export function csharpMsBuildPlan() {
  return {
    display: "dotnet build -c Release",
    argv: dotnetArgs(["build", "-c", "Release", "-p:GenerateDocumentationFile=false",
      "-p:UseSharedCompilation=false", "-p:RunAnalyzersDuringBuild=false", "--", "/m:1",
      "/nodeReuse:false", "/p:BuildInParallel=false", "-v:q"])
  };
}

export const csharpLanguage: LanguageAdapter = {
  id: "csharp",
  entryFile: "Program.cs",
  defaultLimits: { time_limit_ms: 1400, memory_limit_mb: 1024, output_limit_kb: 64 },
  compileTimeLimitMs: COMPILE_BUDGET.csharp,
  async writeSource(workDir: string, source: string): Promise<void> {
    // dotnet build requires a project.
    await writeFile(path.join(workDir, "App.csproj"), csprojXml(), { encoding: "utf8" });
    await writeFile(path.join(workDir, "Program.cs"), source, { encoding: "utf8" });
  },
  getCompilePlan() {
    const wrapper = readEnv("JUDGE_CSHARP_COMPILER_WRAPPER");
    if (wrapper) return { display: "C# compiler (.NET SDK Release options)", argv: ["/bin/sh", wrapper] };
    return csharpMsBuildPlan();
  },
  getRunPlan() {
    return { display: "dotnet bin/Release/net8.0/App.dll", argv: dotnetArgs(["bin/Release/net8.0/App.dll"]) };
  }
};
